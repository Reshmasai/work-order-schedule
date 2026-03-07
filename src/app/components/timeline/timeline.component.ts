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
   * Day:   start 14 days before today
   * Week:  start 8 weeks before the current week's Sunday
   * Month: start 3 months before the current calendar month
   */
  private computeAnchor(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (this.currentView) {
      case 'month': return new Date(today.getFullYear(), today.getMonth() - 3, 1);
      case 'week': {
        const d = new Date(today);
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

  // Generates the column descriptor array that drives both the grid header
  // and the bar pixel-position calculations in the grid component
  private buildColumns(anchor: Date, count: number, view: TimescaleView): TimelineColumn[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: count }, (_, i) => {
      const date = this.addPeriodN(anchor, view, i);
      return {
        date,
        label:     this.formatColumnLabel(date, view),
        isToday:   this.isSameDay(date, today),
        isCurrent: this.isCurrentPeriod(date, view, today),
      };
    });
  }

  private formatColumnLabel(d: Date, v: TimescaleView): string {
    switch (v) {
      case 'month': return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      case 'week':
      case 'day':   return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  private isCurrentPeriod(d: Date, v: TimescaleView, today: Date): boolean {
    switch (v) {
      case 'month': return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return this.isSameDay(d, weekStart);
      }
      case 'day': return this.isSameDay(d, today);
    }
  }

  private addPeriodN(base: Date, v: TimescaleView, n: number): Date {
    const d = new Date(base);
    switch (v) {
      case 'month': d.setMonth(d.getMonth() + n); break;
      case 'week':  d.setDate(d.getDate() + n * 7); break;
      case 'day':   d.setDate(d.getDate() + n); break;
    }
    return d;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getDate()     === b.getDate()
        && a.getMonth()    === b.getMonth()
        && a.getFullYear() === b.getFullYear();
  }

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
