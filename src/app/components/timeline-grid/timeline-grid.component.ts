import {
  Component,
  Input,
  Output,
  EventEmitter,
  Signal,
  signal,
  computed,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  TimescaleView,
  TimelineColumn,
  WorkCenterDocument,
  WorkOrderDocument,
  WorkOrderBar,
} from '../../models/timeline.models';

// Owns everything inside the scrollable right half of the timeline:
// column headers, grid lines, row backgrounds, ghost placeholder, work order
// bars, and the three-dot menu. All the heavy bar-positioning math lives here
// so the parent timeline component can stay focused on page-level concerns.
@Component({
  selector: 'app-timeline-grid',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-grid.component.html',
  styleUrl: './timeline-grid.component.scss',
})
export class TimelineGridComponent implements AfterViewInit, OnDestroy {

  // Direct DOM reference for scroll position reads and mouse coordinate translation
  @ViewChild('rightPanel') private rightPanelRef!: ElementRef<HTMLDivElement>;

  // Work centers come from the service via the parent — one row per entry
  @Input() workCenters!: Signal<WorkCenterDocument[]>;

  // All work orders in the system — filtered per row inside getBarsForCenter()
  @Input() workOrders!: Signal<WorkOrderDocument[]>;

  // Pre-built column descriptors from the parent's computed() signal
  @Input() columns!: Signal<TimelineColumn[]>;

  // Pixel width of a single column — changes with the selected view
  @Input() columnWidth!: Signal<number>;

  // Total pixel width of the scrollable content area
  @Input() totalGridWidth!: Signal<number>;

  // The current timescale view — needed for bar clipping math and rangeEnd calculation
  @Input() view: TimescaleView = 'day';

  // The text shown inside the current-period badge ("Today", "Current week", etc.)
  @Input() badgeLabel = 'Today';

  // Fired when the user clicks an empty row cell — carries the work center id
  // and the ISO date of the clicked column so the parent can open the create panel
  @Output() createRequest = new EventEmitter<{ workCenterId: string; clickedDate: string }>();

  // Fired when the user clicks Edit in a bar's dropdown
  @Output() editRequest = new EventEmitter<WorkOrderDocument>();

  // Fired when the user clicks Delete in a bar's dropdown
  @Output() deleteRequest = new EventEmitter<string>();

  // Hover and menu state — all signals so OnPush change detection picks them up
  hoveredRow = signal<string | null>(null);
  hoveredBar = signal<string | null>(null);
  barHovered = signal<boolean>(false);
  openMenuId = signal<string | null>(null);
  ghostLeft  = signal<number>(0);

  ngAfterViewInit(): void {
    // Nothing to initialise here — the parent calls scrollToColumn() after the view is ready
  }

  ngOnDestroy(): void {
    // Clean up the document-level outside-click listener in case the menu was
    // open when the component got destroyed (the { once: true } won't have fired)
    document.removeEventListener('click', this.outsideClickListener);
  }

  // Called by the parent after a view change so the grid scrolls to centre on today
  scrollToColumn(columnIndex: number): void {
    const panel = this.rightPanelRef?.nativeElement;
    if (!panel) return;
    const colW = this.columnWidth();
    panel.scrollLeft = Math.max(0, columnIndex * colW - panel.clientWidth / 2 + colW / 2);
  }

  onScroll(): void { /* reserved for future lazy column loading */ }

  isHoveringBar(): boolean { return this.barHovered(); }

  // Suppresses the ghost indicator when the hovered column already has a bar in it
  isColumnOccupied(workCenterId: string): boolean {
    const colLeft  = this.ghostLeft();
    const colRight = colLeft + this.columnWidth();
    return this.getBarsForCenter(workCenterId).some(
      bar => bar.left < colRight && (bar.left + bar.width) > colLeft
    );
  }

  onRowMouseEnter(e: MouseEvent, workCenterId: string): void {
    this.hoveredRow.set(workCenterId);
    // Snap the ghost position immediately on entry — avoids a one-frame lag
    this.updateGhostLeft(e);
  }

  onRowMouseMove(e: MouseEvent): void {
    this.updateGhostLeft(e);
  }

  // Translates the raw mouse X into a column-snapped pixel offset,
  // accounting for the panel's position on screen and its scroll offset
  private updateGhostLeft(e: MouseEvent): void {
    const panel = this.rightPanelRef?.nativeElement;
    if (!panel) return;
    const mx   = e.clientX - panel.getBoundingClientRect().left + panel.scrollLeft;
    const colW = this.columnWidth();
    this.ghostLeft.set(Math.floor(mx / colW) * colW);
  }

  // Resolves which column was clicked and emits a create request to the parent.
  // Clicks that originate on a bar, dropdown, or menu button are ignored.
  onRowClick(event: MouseEvent, workCenterId: string): void {
    const t = event.target as HTMLElement;
    if (t.closest('.wo-bar') || t.closest('.wo-dropdown') || t.closest('.wo-menu-btn')) return;

    const panel = this.rightPanelRef.nativeElement;
    const mx    = event.clientX - panel.getBoundingClientRect().left + panel.scrollLeft;
    const cols  = this.columns();
    const idx   = Math.min(Math.floor(mx / this.columnWidth()), cols.length - 1);
    if (!cols[idx]) return;

    this.createRequest.emit({
      workCenterId,
      clickedDate: cols[idx].date.toISOString().split('T')[0],
    });
  }

  onEdit(wo: WorkOrderDocument, event?: MouseEvent): void {
    event?.stopPropagation();
    this.openMenuId.set(null);
    this.editRequest.emit(wo);
  }

  onDelete(docId: string): void {
    this.openMenuId.set(null);
    this.deleteRequest.emit(docId);
  }

  toggleMenu(event: MouseEvent, docId: string): void {
    event.stopPropagation();
    this.openMenuId.update(id => (id === docId ? null : docId));

    // Attach a one-shot document listener that closes the menu on any outside click.
    // Deferred by one tick so this click event doesn't immediately trigger it.
    if (this.openMenuId() !== null) {
      setTimeout(() => document.addEventListener('click', this.outsideClickListener, { once: true }));
    }
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'Open', 'in-progress': 'In progress', complete: 'Complete', blocked: 'Blocked',
    };
    return map[status] ?? status;
  }

  /**
   * Returns all pixel-positioned bar objects for the given work center row.
   *
   * Bars that fall entirely outside the visible range are dropped.
   * Bars that partially overlap are clipped to the grid boundary so they
   * don't render outside the scroll area.
   *
   * Positioning formula:
   *   left  = ((clippedStart - rangeStart) / totalRangeMs) * totalGridPx
   *   width = ((clippedEnd - clippedStart) / totalRangeMs) * totalGridPx
   */
  getBarsForCenter(workCenterId: string): WorkOrderBar[] {
    const orders = this.workOrders().filter(wo => wo.data.workCenterId === workCenterId);
    const cols   = this.columns();
    if (!cols.length) return [];

    const { rangeStart, rangeEnd, totalMs, totalPx } = this.getGridRange(cols);

    return orders
      .map(wo => this.toBar(wo, rangeStart, rangeEnd, totalMs, totalPx))
      .filter((b): b is WorkOrderBar => b !== null);
  }

  private toBar(
    wo: WorkOrderDocument,
    rangeStart: Date,
    rangeEnd: Date,
    totalMs: number,
    totalPx: number
  ): WorkOrderBar | null {
    // Parse ISO strings and normalise to midnight so the timestamp arithmetic below
    // isn't skewed by whatever time-of-day the dates were created with.
    // Without this, a bar created at 15:00 on day X would appear slightly to the
    // right of a bar created at 00:00 on the same day.
    const s = new Date(wo.data.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(wo.data.endDate);   e.setHours(0, 0, 0, 0);

    // Guard against malformed date strings stored in the work order
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;

    // Clamp the bar's edges to the visible grid range.
    // Math.max on the start prevents the left edge from going negative (bar started
    // before the first column). Math.min on the end prevents overflow on the right.
    // If the clamped start >= clamped end the bar is entirely off-screen, so skip it.
    const clippedS = Math.max(s.getTime(), rangeStart.getTime());
    const clippedE = Math.min(e.getTime(), rangeEnd.getTime());
    if (clippedS >= clippedE) return null;

    // Convert millisecond offsets into pixel positions using a simple proportion:
    //   left  = (how far the bar starts past the grid start) / (total grid time) * (total grid px)
    //   width = (how long the bar is in ms) / (total grid time) * (total grid px)
    // This is the same formula used in virtually every timeline/Gantt renderer.
    const left  = ((clippedS - rangeStart.getTime()) / totalMs) * totalPx;
    const width = ((clippedE - clippedS) / totalMs) * totalPx;

    // A bar narrower than 4px is invisible at normal zoom and impossible to click,
    // so we drop it rather than render a hairline that confuses the user
    if (width < 4) return null;

    return { workOrder: wo, left, width };
  }

  // Computes the four shared metrics that toBar() needs for every bar in a row.
  // Extracting them here means we only do the arithmetic once per row render,
  // not once per bar.
  //
  // rangeStart: the Date of the very first column (leftmost pixel = 0)
  // rangeEnd:   one full period past the last column's start date — this is the
  //             exclusive right boundary of the grid (last column's end, not start)
  // totalMs:    the grid's full time span in milliseconds — the denominator in the
  //             proportion formula used in toBar()
  // totalPx:    the grid's full pixel width — the numerator scalar in that formula
  private getGridRange(cols: TimelineColumn[]) {
    const colW       = this.columnWidth();
    const rangeStart = cols[0].date;
    // addOnePeriod moves past the last column's start to get its end boundary.
    // e.g. for day view, if the last column is Mar 30, rangeEnd = Mar 31 00:00.
    const rangeEnd   = this.addOnePeriod(cols[cols.length - 1].date);
    const totalMs    = rangeEnd.getTime() - rangeStart.getTime();
    const totalPx    = cols.length * colW;
    return { rangeStart, rangeEnd, totalMs, totalPx };
  }

  // Advances a date by exactly one period for the active view.
  // This gives us the exclusive end boundary of the last column in getGridRange.
  // Always clones the input — mutating a column's date would corrupt the columns signal.
  private addOnePeriod(d: Date): Date {
    const result = new Date(d);
    switch (this.view) {
      case 'month': result.setMonth(result.getMonth() + 1); break; // JS handles Dec+1 -> Jan next year
      case 'week':  result.setDate(result.getDate() + 7);   break; // 1 week = exactly 7 days
      case 'day':   result.setDate(result.getDate() + 1);   break;
    }
    return result;
  }

  // Arrow function so the same reference works for both addEventListener
  // and removeEventListener — a named method wouldn't work here
  private readonly outsideClickListener = (e: MouseEvent): void => {
    const t = e.target as HTMLElement;
    if (!t.closest('.wo-dropdown') && !t.closest('.wo-menu-btn')) {
      this.openMenuId.set(null);
    }
  };
}