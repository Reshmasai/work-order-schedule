import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { WorkOrderPanelComponent } from '../work-order-panel/work-order-panel.component';
import {
  TimescaleView,
  TimelineColumn,
  PanelMode,
  WorkOrderDocument,
  WorkOrderBar,
} from '../../models/timeline.models';

@Component({
  selector: 'app-timeline',
  standalone: true,
  // NgSelectModule for the timescale dropdown, FormsModule for [(ngModel)] two-way binding on it
  imports: [CommonModule, NgSelectModule, FormsModule, WorkOrderPanelComponent],
  // OnPush means Angular only re-checks this component when a signal changes —
  // really matters here because the grid can render a lot of rows and bars at once
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class TimelineComponent implements OnInit, AfterViewInit, OnDestroy {

  // We need a direct reference to the scrollable right panel so we can
  // a) scroll it programmatically to centre on today, and
  // b) calculate which column the user clicked based on mouse X + scrollLeft
  @ViewChild('rightPanel')    private rightPanelRef!:    ElementRef<HTMLDivElement>;

  // The timescale pill element — we measure its width after render so the
  // ng-select dropdown can be offset to align with it properly
  @ViewChild('timescalePill') private timescalePillRef!: ElementRef<HTMLDivElement>;

  // Using inject() instead of constructor injection — it's the Angular 17+ idiom
  // and works more naturally alongside the signals-based state model
  private readonly timelineService = inject(TimelineService);

  //Public signals the template reads

  // Aliases for the service signals — the template shouldn't have to go
  // through the service directly, this keeps the template cleaner
  readonly workCenters = this.timelineService.workCenters;
  readonly workOrders  = this.timelineService.workOrders;

  // Tracks which row the cursor is over — used to apply the hover highlight
  // and show the "click to add dates" ghost box on empty columns
  hoveredRow  = signal<string | null>(null);

  // Tracks which specific bar the cursor is over
  hoveredBar  = signal<string | null>(null);

  // A separate boolean flag for "is the cursor currently on any bar?" —
  barHovered  = signal<boolean>(false);

  // Holds the docId of whichever bar currently has its dropdown open, or null
  openMenuId  = signal<string | null>(null);

  // The configuration for the slide-out panel: null = closed, otherwise
  // either a 'create' config (with workCenterId + clickedDate) or 'edit' (with workOrder)
  panelMode   = signal<PanelMode | null>(null);

  // The pixel X offset where the ghost box should snap to — updated every
  // mousemove event so the ghost tracks the user's column as they move
  ghostLeft   = signal<number>(0);

  // Measured width of the timescale pill after the DOM renders — used to
  // correctly position the dropdown panel so it doesn't get clipped
  pillWidth   = signal<number>(220);

  // Kept as a plain property instead of a signal because ng-select's
  // [(ngModel)] two-way binding doesn't work cleanly with Angular signals
  currentView: TimescaleView = 'day';

  // The four view options shown in the timescale dropdown
  readonly viewOptions: { value: TimescaleView; label: string }[] = [
    { value: 'day',   label: 'Day'   },
    { value: 'week',  label: 'Week'  },
    { value: 'month', label: 'Month' },
  ];

  // The number of columns visible at once — changes with the selected view
  private readonly totalCols  = signal<number>(30);

  // The date at the leftmost edge of the grid — we shift this when the view
  // changes so today is always roughly centred in the visible area
  private readonly anchorDate = signal<Date>(this.computeAnchor());

  // computed() means this rebuilds automatically whenever anchorDate,
  // totalCols, or currentView changes — no manual subscription needed
  readonly columns = computed<TimelineColumn[]>(() =>
    this.buildColumns(this.anchorDate(), this.totalCols(), this.currentView)
  );

  // Pixel width of a single column — varies by zoom level so the grid
  // stays readable at each scale (wider columns = more room for labels)
  columnWidth = signal<number>(80);

  // Total pixel width of the scrollable content area — the grid's inner div
  // needs this explicitly so the browser renders the horizontal scrollbar correctly
  readonly totalGridWidth = computed(() => this.columns().length * this.columnWidth());

  // Column layout config per view 

  // A lookup table is cleaner than a switch here — easy to add new views
  // later without changing any of the logic that consumes these values
  private readonly COLUMN_CONFIG: Record<TimescaleView, { width: number; count: number }> = {
    day:   { width: 80,  count: 30 },
    week:  { width: 100, count: 20 }, 
    month: { width: 120, count: 14 },
  };

  // Lifecycle

  ngOnInit(): void {
    // Pull any previously saved work orders out of localStorage
    this.timelineService.loadFromStorage();

    // Set initial column dimensions based on the default view
    this.applyColumnConfig();
  }

  ngAfterViewInit(): void {
    // Scroll to centre on today — has to happen after the view is initialised
    // because we need the rightPanelRef DOM element to be available
    this.scrollToToday();

    // Measure the pill width now that it's been rendered
    if (this.timescalePillRef) {
      this.pillWidth.set(this.timescalePillRef.nativeElement.offsetWidth);
    }
  }

  ngOnDestroy(): void {
    // The document-level outside-click listener uses { once: true } so it
    // normally removes itself automatically, but if the component is destroyed
    // while the menu is open that callback might never fire — clean it up here
    document.removeEventListener('click', this.outsideClickListener);
  }

  // View switching

  onViewChange(view: TimescaleView): void {
    // ng-select has already updated the property via ngModel, but we still
    // need to recalculate the anchor date and re-scroll
    this.currentView = view;
    this.anchorDate.set(this.computeAnchor());

    setTimeout(() => this.scrollToToday(), 50);
  }

  // Returns the badge label for the currently highlighted column
  currentBadgeLabel(): string {
    const labels: Record<TimescaleView, string> = {
      month: 'Current month',
      week:  'Current week',
      day:   'Today',
    };
    return labels[this.currentView];
  }

  // Bar rendering 

  /**
   * Returns all work order bars for a given work center row, as pixel-positioned objects.
   *
   * Bars that fall completely outside the visible date range are filtered out.
   * Bars that partially overlap the visible range are clipped to the grid boundary
   * so they don't render past the edges of the scrollable area.
   *
   * Position formula:
   *   left  = ((clippedStart - rangeStart) / totalRangeMs) * totalPx
   *   width = ((clippedEnd   - clippedStart) / totalRangeMs) * totalPx
   */
  getBarsForCenter(workCenterId: string): WorkOrderBar[] {
    // Filter to only orders that belong to this row
    const orders = this.workOrders().filter(wo => wo.data.workCenterId === workCenterId);

    const cols = this.columns();
    if (!cols.length) return [];

    // Compute the shared grid metrics once for all bars in this row
    const { rangeStart, rangeEnd, totalMs, totalPx } = this.getGridRange(cols);

    return orders
      .map(wo => this.toBar(wo, rangeStart, rangeEnd, totalMs, totalPx))
      .filter((b): b is WorkOrderBar => b !== null); // drop anything that didn't make it
  }

  /** Turns a single work order into its bar descriptor, or null if it's off-screen. */
  private toBar(
    wo: WorkOrderDocument,
    rangeStart: Date,
    rangeEnd: Date,
    totalMs: number,
    totalPx: number
  ): WorkOrderBar | null {
    // Parse and normalise to midnight — this prevents time-zone-related off-by-one issues 
    const s = new Date(wo.data.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(wo.data.endDate);   e.setHours(0, 0, 0, 0);

    // Skip if either date is malformed
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;

    // Clip to the visible range — a work order that started 3 months ago
    // should still render starting from the left edge of the grid, not at a
    // negative pixel offset
    const clippedS = Math.max(s.getTime(), rangeStart.getTime());
    const clippedE = Math.min(e.getTime(), rangeEnd.getTime());

    // If the clipped range is zero or inverted the order is fully off-screen
    if (clippedS >= clippedE) return null;

    const left  = ((clippedS - rangeStart.getTime()) / totalMs) * totalPx;
    const width = ((clippedE - clippedS) / totalMs) * totalPx;

    // Anything narrower than 4px is too thin to be useful — skip it
    if (width < 4) return null;

    return { workOrder: wo, left, width };
  }

  /** Calculates the time-span and pixel-span of the full visible grid. Called
   *  once per getBarsForCenter() call rather than once per bar. */
  private getGridRange(cols: TimelineColumn[]) {
    const colW       = this.columnWidth();
    const rangeStart = cols[0].date;

    // The grid ends one period after the last column's start date
    const rangeEnd   = this.addPeriod(cols[cols.length - 1].date, this.currentView);

    const totalMs    = rangeEnd.getTime() - rangeStart.getTime();
    const totalPx    = cols.length * colW;
    return { rangeStart, rangeEnd, totalMs, totalPx };
  }

  // Ghost / hover helpers

  isHoveringBar(): boolean { return this.barHovered(); }

  /**
   * Returns true if the column under the cursor already has a work order
   */
  isColumnOccupied(workCenterId: string): boolean {
    const colLeft  = this.ghostLeft();
    const colRight = colLeft + this.columnWidth();

    // An overlap exists if any bar's pixel range intersects this column's pixel range
    return this.getBarsForCenter(workCenterId).some(
      bar => bar.left < colRight && (bar.left + bar.width) > colLeft
    );
  }

  onRowMouseEnter(e: MouseEvent, workCenterId: string): void {
    this.hoveredRow.set(workCenterId);
    this.updateGhostLeft(e);
  }

  onRowMouseMove(e: MouseEvent): void {
    // Continuously track the cursor as it moves across column boundaries
    this.updateGhostLeft(e);
  }

  /**
   * Converts the raw mouse X coordinate into a column-snapped pixel offset.
   * We need to account for: the panel's position on screen (getBoundingClientRect)
   * and how far it's been scrolled horizontally (scrollLeft).
   */
  private updateGhostLeft(e: MouseEvent): void {
    const panel = this.rightPanelRef?.nativeElement;
    if (!panel) return;

    // Mouse X relative to the scrollable content area (not the viewport)
    const mx   = e.clientX - panel.getBoundingClientRect().left + panel.scrollLeft;
    const colW = this.columnWidth();

    // Round down to the nearest column boundary so the ghost snaps to columns
    this.ghostLeft.set(Math.floor(mx / colW) * colW);
  }

  // Row / bar click interactions

  /**
   * Handles a click on the empty row background — opens the create panel
   * with the clicked column's date pre-filled as the suggested start date.
   *
   * We explicitly guard against clicks on bar elements, dropdowns, and the
   * CTA control button so those don't also trigger the create panel.
   */
  onRowClick(event: MouseEvent, workCenterId: string): void {
    const t = event.target as HTMLElement;
    // Walk up the DOM from the click target — if we hit any of these elements,
    // the user was clicking on existing UI, not the empty row background
    if (t.closest('.wo-bar') || t.closest('.wo-dropdown') || t.closest('.wo-menu-btn')) return;

    const panel = this.rightPanelRef.nativeElement;
    // Same coordinate transform as updateGhostLeft
    const mx    = event.clientX - panel.getBoundingClientRect().left + panel.scrollLeft;
    const cols  = this.columns();

    // Which column index did the click land in?
    const idx   = Math.min(Math.floor(mx / this.columnWidth()), cols.length - 1);
    if (!cols[idx]) return;

    this.panelMode.set({
      mode:        'create',
      workCenterId,
      // Pass the date as an ISO string — the panel component handles display formatting
      clickedDate: cols[idx].date.toISOString().split('T')[0],
    });
  }

  onEdit(wo: WorkOrderDocument, event?: MouseEvent): void {
    // Stop propagation so the click doesn't also bubble up to the row handler
    // and try to open a create panel at the same time as the edit panel
    event?.stopPropagation();

    // Close the CTA control dropdown first so it doesn't linger while the panel opens
    this.openMenuId.set(null);
    this.panelMode.set({ mode: 'edit', workOrder: wo });
  }

  onDelete(docId: string): void {
    // Always close the dropdown before deleting — otherwise the dropdown
    // stays visible on the row even after the bar it belongs to is gone
    this.openMenuId.set(null);
    this.timelineService.deleteWorkOrder(docId);
  }

  toggleMenu(event: MouseEvent, docId: string): void {
    // stopPropagation keeps this click from reaching the row handler and from 
    // triggering the outside-click listener
    event.stopPropagation();

    // Toggle between open and closed — clicking the same CTA controls button twice closes it
    this.openMenuId.update(id => (id === docId ? null : docId));

    // If a menu just opened, register a one-shot document listener so clicking
    // anywhere outside the dropdown automatically closes it
    if (this.openMenuId() !== null) {
      // Defer by one tick so that this very click event doesn't immediately
      // fire the listener we're registering (event propagation order)
      setTimeout(() => document.addEventListener('click', this.outsideClickListener, { once: true }));
    }
  }

  closePanel(): void {
    // Setting panelMode to null triggers the CSS class removal and the panel slides out
    this.panelMode.set(null);
  }

  // Hook for future infinite-scroll or lazy column loading
  onScroll(): void { }

  // Maps internal status strings to the display labels shown in bar badges
  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      open:          'Open',
      'in-progress': 'In progress',
      complete:      'Complete',
      blocked:       'Blocked',
    };
    return map[status] ?? status; // fall back to the raw value if unknown
  }

  // Column building

  /**
   * Determines the leftmost date to render so that today is roughly centred
   * in the visible grid area.
   *
   * Month view:  go back 3 full calendar months (land on the 1st)
   * Week view:   go back 8 full weeks from today's Sunday
   * Day view:    go back 14 days from today
   */
  private computeAnchor(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (this.currentView) {
      case 'month':
        // Always land on the 1st of a month so columns align to month boundaries
        return new Date(today.getFullYear(), today.getMonth() - 3, 1);

      case 'week': {
        const d = new Date(today);
        // Rewind to last Sunday (getDay() == 0), then go back 8 more weeks
        d.setDate(d.getDate() - d.getDay() - 56);
        return d;
      }

      case 'day': {
        const d = new Date(today);
        d.setDate(d.getDate() - 14);
        return d;
      }
    }
  }

  /**
   * Builds the array of column descriptors. Each entry describes one visible column
   * and is used both for rendering the header and for positioning work order bars.
   */
  private buildColumns(anchor: Date, count: number, view: TimescaleView): TimelineColumn[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: count }, (_, i) => {
      // Step forward from the anchor by i periods
      const date = this.addPeriodN(anchor, view, i);
      return {
        date,
        label:     this.formatColumnLabel(date, view),
        isToday:   this.isSameDay(date, today),
        // isCurrent is what drives the badge and the highlighted column border
        isCurrent: this.isCurrentPeriod(date, view, today),
      };
    });
  }

  // Formats the column header text — month view shows year too, day/week just show day
  private formatColumnLabel(d: Date, v: TimescaleView): string {
    switch (v) {
      case 'month': return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      case 'week':
      case 'day':   return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  /**
   * Returns true if the given column date is the "current" period —
   * same calendar month for month view, same week for week view, today for day view.
   */
  private isCurrentPeriod(d: Date, v: TimescaleView, today: Date): boolean {
    switch (v) {
      case 'month':
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

      case 'week': {
        // Week columns start on Sunday — find this week's Sunday
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return this.isSameDay(d, weekStart);
      }

      case 'day':
        return this.isSameDay(d, today);
    }
  }

  // Date helpers

  // Advances a date by n periods without mutating the original
  private addPeriodN(base: Date, v: TimescaleView, n: number): Date {
    // copy so as not to mutate the anchor signal
    const d = new Date(base);
    switch (v) {
      case 'month': d.setMonth(d.getMonth() + n); break;
      case 'week':  d.setDate(d.getDate() + n * 7); break;
      case 'day':   d.setDate(d.getDate() + n); break;
    }
    return d;
  }

  // Single-period advance — used when computing rangeEnd for bar positioning
  private addPeriod(d: Date, v: TimescaleView): Date {
    return this.addPeriodN(d, v, 1);
  }

  // Compares two dates by year/month/day only, ignoring time
  private isSameDay(a: Date, b: Date): boolean {
    return a.getDate()     === b.getDate()
        && a.getMonth()    === b.getMonth()
        && a.getFullYear() === b.getFullYear();
  }

  // Scroll helpers

  // Applies the column width and count for the active view, updating the signals
  // that drive computed grid dimensions
  private applyColumnConfig(): void {
    const { width, count } = this.COLUMN_CONFIG[this.currentView];
    this.columnWidth.set(width);
    this.totalCols.set(count);
  }

  private scrollToToday(): void {
    const panel = this.rightPanelRef?.nativeElement;
    if (!panel) return;

    // Make sure dimensions are up to date before we calculate scroll position
    this.applyColumnConfig();

    const cols  = this.columns();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the column that represents the current period
    let idx = cols.findIndex(c => this.isCurrentPeriod(c.date, this.currentView, today));

    // If today isn't within the rendered range for some reason, fall back to centre
    if (idx < 0) idx = Math.floor(cols.length / 2);

    const colW = this.columnWidth();
    // Scroll so the current-period column is horizontally centred in the viewport
    panel.scrollLeft = Math.max(0, idx * colW - panel.clientWidth / 2 + colW / 2);
  }

  // Outside-click handler

  /**
   * Defined as an arrow function (not a method) to safely pass it to
   * addEventListener and removeEventListener by reference.
   */
  private readonly outsideClickListener = (e: MouseEvent): void => {
    const t = e.target as HTMLElement;
    // Leave the menu open if the user clicked inside it or on the ••• button
    if (!t.closest('.wo-dropdown') && !t.closest('.wo-menu-btn')) {
      this.openMenuId.set(null);
    }
  };
}