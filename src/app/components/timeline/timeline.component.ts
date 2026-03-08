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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { WorkOrderPanelComponent } from '../work-order-panel/work-order-panel.component';
import { TimelineGridComponent } from '../timeline-grid/timeline-grid.component';
import {
  TimescaleView,
  TimelineColumn,
  PanelMode,
  WorkOrderDocument,
} from '../../models/timeline.models';

// Page-level shell for the timeline view.
// Responsibilities here are intentionally narrow: page layout, timescale pill,
// the fixed left panel, and column/date math.
// All scrollable grid logic (bars, hover, ghost, menus) lives in TimelineGridComponent.
@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, NgSelectModule, FormsModule, TimelineGridComponent, WorkOrderPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class TimelineComponent implements OnInit, AfterViewInit {

  // We need the timescale pill's DOM width to position the ng-select dropdown correctly
  @ViewChild('timescalePill') private timescalePillRef!: ElementRef<HTMLDivElement>;

  // Reference to the grid child so we can call scrollToColumn() after a view change
  @ViewChild('grid') private gridRef!: TimelineGridComponent;

  private readonly timelineService = inject(TimelineService);

  // Service signals exposed directly to the template and passed down to the grid
  readonly workCenters = this.timelineService.workCenters;
  readonly workOrders  = this.timelineService.workOrders;

  // Drives the left panel row hover highlight — owned here so the label strip
  // and the grid rows can highlight in sync
  hoveredRow = signal<string | null>(null);

  // Controls the slide-out panel: null = closed, mode object = open
  panelMode = signal<PanelMode | null>(null);

  pillWidth = signal<number>(220);

  // Kept as a plain property because ng-select's [(ngModel)] doesn't work with signals
  currentView: TimescaleView = 'day';

  readonly viewOptions: { value: TimescaleView; label: string }[] = [
    { value: 'day',   label: 'Day'   },
    { value: 'week',  label: 'Week'  },
    { value: 'month', label: 'Month' },
  ];

  // anchorDate is the leftmost date of the visible grid.
  // Recomputed on every view change so today stays roughly centred.
  private readonly totalCols  = signal<number>(30);
  private readonly anchorDate = signal<Date>(this.computeAnchor());

  // columns rebuilds automatically whenever anchorDate, totalCols, or currentView changes
  readonly columns = computed<TimelineColumn[]>(() =>
    this.buildColumns(this.anchorDate(), this.totalCols(), this.currentView)
  );

  columnWidth = signal<number>(80);

  // Passed to the grid so its inner content div has an explicit pixel width
  readonly totalGridWidth = computed(() => this.columns().length * this.columnWidth());

  // Width and count are coupled per view — keeping them together prevents them drifting apart
  private readonly COLUMN_CONFIG: Record<TimescaleView, { width: number; count: number }> = {
    day:   { width: 80,  count: 30 },
    week:  { width: 100, count: 20 },
    month: { width: 120, count: 14 },
  };

  ngOnInit(): void {
    this.timelineService.loadFromStorage();
    this.applyColumnConfig();
  }

  ngAfterViewInit(): void {
    this.scrollToToday();
    if (this.timescalePillRef) {
      this.pillWidth.set(this.timescalePillRef.nativeElement.offsetWidth);
    }
  }

  onViewChange(view: TimescaleView): void {
    this.currentView = view;
    this.anchorDate.set(this.computeAnchor());
    // One tick lets Angular render the new columns before we calculate the scroll target
    setTimeout(() => this.scrollToToday(), 50);
  }

  currentBadgeLabel(): string {
    const labels: Record<TimescaleView, string> = {
      month: 'Current month',
      week:  'Current week',
      day:   'Today',
    };
    return labels[this.currentView];
  }

  // Receives a create request from the grid and opens the panel
  onCreateRequest(payload: { workCenterId: string; clickedDate: string }): void {
    this.panelMode.set({
      mode:        'create',
      workCenterId: payload.workCenterId,
      clickedDate:  payload.clickedDate,
    });
  }

  onEdit(wo: WorkOrderDocument): void {
    this.panelMode.set({ mode: 'edit', workOrder: wo });
  }

  onDelete(docId: string): void {
    this.timelineService.deleteWorkOrder(docId);
  }

  closePanel(): void { this.panelMode.set(null); }

  /**
   * Computes the anchor (leftmost column) date for the current view so that
   * today ends up roughly centred in the visible grid area.
   *
   * Day view   (30 cols): anchor = 14 days before today, putting today at col 14 of 30
   * Week view  (20 cols): anchor = 8 weeks before the start of the current week,
   *                       putting the current week at col 8 of 20
   * Month view (14 cols): anchor = 3 months before the current month,
   *                       putting the current month at col 3 of 14
   */
  private computeAnchor(): Date {
    const today = new Date();
    // Strip the time portion so all comparisons are midnight-to-midnight
    today.setHours(0, 0, 0, 0);

    switch (this.currentView) {
      // Date constructor accepts negative month values and rolls back the year automatically,
      // so passing getMonth() - 3 is safe even in January (gives October of the prior year).
      // Passing day=1 ensures we always land on the 1st of the month, not a mid-month date.
      case 'month': return new Date(today.getFullYear(), today.getMonth() - 3, 1);

      case 'week': {
        const d = new Date(today);
        // getDay() returns 0 (Sun) through 6 (Sat), so subtracting it snaps back to Sunday.
        // An extra 56 days (8 weeks * 7) shifts the anchor 8 full weeks before that Sunday.
        d.setDate(d.getDate() - d.getDay() - 56);
        return d;
      }

      case 'day': {
        const d = new Date(today);
        // 14 days back puts today at roughly the centre of the 30-column day view
        d.setDate(d.getDate() - 14);
        return d;
      }
    }
  }

  // Generates the column descriptor array that drives both the grid header
  // and the bar pixel-position calculations in the grid component.
  // Each entry carries a Date, a display label, and two boolean flags so the
  // template can highlight the current period without recalculating in the HTML.
  private buildColumns(anchor: Date, count: number, view: TimescaleView): TimelineColumn[] {
    const today = new Date();
    // Strip time so isSameDay comparisons don't fail on the current day
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: count }, (_, i) => {
      // addPeriodN advances the anchor by i periods (days/weeks/months) per view
      const date = this.addPeriodN(anchor, view, i);
      return {
        date,
        label:     this.formatColumnLabel(date, view),
        isToday:   this.isSameDay(date, today),
        isCurrent: this.isCurrentPeriod(date, view, today),
      };
    });
  }

  // Produces the short string shown in each column header.
  // Day and week views both use "Mar 5" style — weeks show the start-of-week date,
  // which is enough context for the user to orient themselves without taking up space.
  // Month view adds the year so multi-year grids are unambiguous (e.g. "Jan 2026").
  private formatColumnLabel(d: Date, v: TimescaleView): string {
    switch (v) {
      case 'month': return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      case 'week':
      case 'day':   return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  // Decides whether a given column date falls inside the "current" period —
  // i.e. whether it should receive the accent colour and the floating badge.
  // The definition of "current" differs per view:
  //   Day:   the column whose date is today
  //   Week:  the column whose date is the Sunday that started the current week
  //   Month: any column whose year+month matches today's year+month
  private isCurrentPeriod(d: Date, v: TimescaleView, today: Date): boolean {
    switch (v) {
      // Both year and month must match — otherwise "Mar 2025" and "Mar 2026" look the same
      case 'month': return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

      case 'week': {
        // Roll today back to the start of its week (Sunday = day 0) at midnight,
        // then compare that Sunday to the column date
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return this.isSameDay(d, weekStart);
      }

      case 'day': return this.isSameDay(d, today);
    }
  }

  // Advances a base date by n periods according to the active view.
  // Used by buildColumns to step from the anchor date to each column's date.
  // setMonth() handles year rollovers automatically (month 13 -> Jan of next year).
  private addPeriodN(base: Date, v: TimescaleView, n: number): Date {
    // Always clone — never mutate the anchor date stored in the signal
    const d = new Date(base);
    switch (v) {
      case 'month': d.setMonth(d.getMonth() + n); break;
      case 'week':  d.setDate(d.getDate() + n * 7); break; // 1 week = 7 days
      case 'day':   d.setDate(d.getDate() + n); break;
    }
    return d;
  }

  // Compares two Date objects by calendar day only, ignoring hours/minutes/seconds.
  // We can't use getTime() equality because two dates on the same calendar day
  // will have different timestamps if one was created with setHours(0,0,0,0) and
  // the other wasn't (e.g. a Date from new Date() includes the current time).
  private isSameDay(a: Date, b: Date): boolean {
    return a.getDate()     === b.getDate()
        && a.getMonth()    === b.getMonth()
        && a.getFullYear() === b.getFullYear();
  }

  // Reads the width and count pair for the active view and pushes them into their
  // respective signals. Grouping width and count in COLUMN_CONFIG means they can
  // never get out of sync — changing the view always updates both in one call.
  private applyColumnConfig(): void {
    const { width, count } = this.COLUMN_CONFIG[this.currentView];
    this.columnWidth.set(width);
    this.totalCols.set(count);
  }

  // Scrolls the grid so today's column is horizontally centred in the viewport
  private scrollToToday(): void {
    this.applyColumnConfig();
    const cols  = this.columns();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let idx = cols.findIndex(c => this.isCurrentPeriod(c.date, this.currentView, today));
    if (idx < 0) idx = Math.floor(cols.length / 2);

    // Delegate the actual DOM scroll to the grid child
    this.gridRef?.scrollToColumn(idx);
  }
}