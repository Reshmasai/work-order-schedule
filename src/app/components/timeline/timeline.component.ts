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
  HostListener,
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
} from '../../models/timeline.models';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, NgSelectModule, FormsModule, WorkOrderPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="timeline-page">
      <!-- Header -->
      <div class="page-header">
        <span class="logo-text">NAOLOGIC</span>
      </div>

      <!-- Main content -->
      <div class="page-content">
        <h1 class="page-title">Work Orders</h1>

        <!-- Timescale selector -->
        <div class="timescale-bar">
          <span class="timescale-label">Timescale</span>
          <div class="timescale-dropdown-wrapper">
            <ng-select
              [(ngModel)]="currentView"
              (ngModelChange)="onViewChange($event)"
              [clearable]="false"
              [searchable]="false"
              class="timescale-select"
            >
              @for (opt of viewOptions; track opt.value) {
                <ng-option [value]="opt.value">{{ opt.label }}</ng-option>
              }
            </ng-select>
          </div>
        </div>

        <!-- Timeline grid container -->
        <div class="timeline-container" #timelineContainer>
          <!-- Left fixed panel: work center names -->
          <div class="left-panel">
            <div class="left-header">Work Center</div>
            @for (wc of workCenters(); track wc.docId) {
              <div
                class="left-row"
                [class.hovered]="hoveredRow() === wc.docId"
                (mouseenter)="hoveredRow.set(wc.docId)"
                (mouseleave)="hoveredRow.set(null)"
              >
                {{ wc.data.name }}
              </div>
            }
          </div>

          <!-- Right scrollable panel: timeline grid -->
          <div class="right-panel" #rightPanel (scroll)="onScroll()">
            <!-- Column headers -->
            <div class="grid-header" [style.width.px]="totalGridWidth()">
              @for (col of columns(); track col.date.getTime()) {
                <div
                  class="col-header"
                  [class.current]="col.isCurrent"
                  [style.min-width.px]="columnWidth()"
                  [style.max-width.px]="columnWidth()"
                >
                  @if (col.isCurrent) {
                    <span class="current-badge">{{ currentBadgeLabel() }}</span>
                  } @else {
                    <span class="col-label">{{ col.label }}</span>
                  }
                </div>
              }
            </div>

            <!-- Grid rows -->
            <div class="grid-rows" [style.width.px]="totalGridWidth()">
              @for (wc of workCenters(); track wc.docId) {
                <div
                  class="grid-row"
                  [class.hovered]="hoveredRow() === wc.docId"
                  (mouseenter)="hoveredRow.set(wc.docId)"
                  (mouseleave)="hoveredRow.set(null)"
                  (click)="onRowClick($event, wc.docId)"
                >
                  <!-- Today line -->
                  <div
                    class="today-line"
                    [style.left.px]="todayLineLeft()"
                  ></div>

                  <!-- Work order bars -->
                  @for (bar of getBarsForCenter(wc.docId); track bar.workOrder.docId) {
                    <div
                      class="wo-bar"
                      [class]="'status-' + bar.workOrder.data.status"
                      [style.left.px]="bar.left"
                      [style.width.px]="bar.width"
                      (click)="$event.stopPropagation()"
                      (mouseenter)="hoveredRow.set(wc.docId)"
                    >
                      <span class="wo-name">{{ bar.workOrder.data.name }}</span>
                      <span class="wo-status-badge">{{ getStatusLabel(bar.workOrder.data.status) }}</span>
                      <button
                        class="wo-menu-btn"
                        (click)="toggleMenu($event, bar.workOrder.docId)"
                        [attr.aria-label]="'Options for ' + bar.workOrder.data.name"
                      >
                        <span class="dots">•••</span>
                      </button>

                      <!-- Dropdown menu -->
                      @if (openMenuId() === bar.workOrder.docId) {
                        <div class="wo-dropdown" (click)="$event.stopPropagation()">
                          <button class="dropdown-item" (click)="onEdit(bar.workOrder)">Edit</button>
                          <button class="dropdown-item delete" (click)="onDelete(bar.workOrder.docId)">Delete</button>
                        </div>
                      }
                    </div>
                  }

                  <!-- Hover tooltip: Click to add dates -->
                  @if (hoveredRow() === wc.docId && !hasOrderAtPosition()) {
                    <div
                      class="add-tooltip"
                      [style.left.px]="hoverX()"
                    >
                      Click to add dates
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Work order panel -->
    <app-work-order-panel
      [panelMode]="panelMode()"
      (closed)="closePanel()"
      (saved)="closePanel()"
    />
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f8f9fc;
    }

    /* ─── Page Layout ─── */
    .page-header {
      padding: 16px 24px;
      background: #fff;
    }

    .logo-text {
      font-family: "Circular-Std", sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #5b5fc7;
    }

    .page-content {
      padding: 32px 40px 40px;
    }

    .page-title {
      font-family: "Circular-Std", sans-serif;
      font-size: 24px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 20px;
    }

    /* ─── Timescale ─── */
    .timescale-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }

    .timescale-label {
      font-family: "Circular-Std", sans-serif;
      font-size: 13px;
      color: #5b6078;
    }

    .timescale-dropdown-wrapper {
      width: 110px;
    }

    ::ng-deep .timescale-select {
      .ng-select-container {
        font-family: "Circular-Std", sans-serif;
        font-size: 13px;
        font-weight: 500;
        color: #5b5fc7;
        border: 1.5px solid #e2e5ef !important;
        border-radius: 6px !important;
        min-height: 32px;
        box-shadow: none !important;
        background: #fff;
      }

      .ng-value-container {
        padding: 0 8px;
      }

      .ng-value {
        color: #5b5fc7 !important;
        font-weight: 500;
      }

      .ng-arrow-wrapper .ng-arrow {
        border-color: #5b5fc7 transparent transparent;
      }

      .ng-dropdown-panel {
        border: 1.5px solid #e2e5ef;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        margin-top: 2px;
      }

      .ng-option {
        font-family: "Circular-Std", sans-serif;
        font-size: 13px;
        padding: 8px 12px;
        color: #1a1a2e;

        &.ng-option-selected {
          color: #5b5fc7;
          font-weight: 500;
          background: #f0f0fb;
        }

        &:hover, &.ng-option-marked {
          background: #f5f6fa;
        }
      }
    }

    /* ─── Timeline Container ─── */
    .timeline-container {
      display: flex;
      border: 1.5px solid #e2e5ef;
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }

    /* ─── Left Panel ─── */
    .left-panel {
      flex-shrink: 0;
      width: 220px;
      border-right: 1.5px solid #e2e5ef;
      z-index: 2;
    }

    .left-header {
      font-family: "Circular-Std", sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #8a8fa8;
      padding: 12px 16px;
      height: 44px;
      display: flex;
      align-items: center;
      border-bottom: 1.5px solid #e2e5ef;
      box-sizing: border-box;
    }

    .left-row {
      font-family: "Circular-Std", sans-serif;
      font-size: 13px;
      color: #3a3d52;
      padding: 0 16px;
      height: 52px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #f0f1f8;
      transition: background 0.12s;
      box-sizing: border-box;

      &.hovered {
        background: #f4f5fb;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    /* ─── Right Panel ─── */
    .right-panel {
      flex: 1;
      overflow-x: auto;
      overflow-y: hidden;
      position: relative;
      scroll-behavior: auto;

      &::-webkit-scrollbar {
        height: 6px;
      }
      &::-webkit-scrollbar-track {
        background: #f5f6fa;
      }
      &::-webkit-scrollbar-thumb {
        background: #d0d3e8;
        border-radius: 3px;
      }
    }

    /* ─── Grid Header ─── */
    .grid-header {
      display: flex;
      height: 44px;
      border-bottom: 1.5px solid #e2e5ef;
      position: sticky;
      top: 0;
      background: #fff;
      z-index: 1;
    }

    .col-header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid #f0f1f8;
      box-sizing: border-box;

      &:last-child {
        border-right: none;
      }

      &.current {
        background: #f0f1fb;
      }
    }

    .col-label {
      font-family: "Circular-Std", sans-serif;
      font-size: 12px;
      color: #8a8fa8;
      white-space: nowrap;
    }

    .current-badge {
      font-family: "Circular-Std", sans-serif;
      font-size: 11px;
      font-weight: 500;
      color: #5b5fc7;
      background: #e8e9fb;
      padding: 3px 10px;
      border-radius: 20px;
      white-space: nowrap;
    }

    /* ─── Grid Rows ─── */
    .grid-rows {
      position: relative;
    }

    .grid-row {
      position: relative;
      height: 52px;
      border-bottom: 1px solid #f0f1f8;
      cursor: pointer;
      transition: background 0.12s;
      overflow: visible;

      &.hovered {
        background: #f4f5fb;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    /* ─── Today Line ─── */
    .today-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #d0d3e8;
      opacity: 0.6;
      pointer-events: none;
      z-index: 0;
    }

    /* ─── Work Order Bar ─── */
    .wo-bar {
      position: absolute;
      top: 8px;
      height: 36px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      padding: 0 10px;
      gap: 8px;
      z-index: 2;
      cursor: default;
      min-width: 80px;
      overflow: visible;
      white-space: nowrap;
      transition: filter 0.12s;

      &:hover {
        filter: brightness(0.97);
      }

      &.status-open {
        background: #ecedfb;
        border: 1px solid #c5c7f0;
      }

      &.status-in-progress {
        background: #ecedfb;
        border: 1px solid #c5c7f0;
      }

      &.status-complete {
        background: #e8f5ec;
        border: 1px solid #b2dfc0;
      }

      &.status-blocked {
        background: #fef6e4;
        border: 1px solid #f5d57a;
      }
    }

    .wo-name {
      font-family: "Circular-Std", sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #3a3d52;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
      min-width: 0;
    }

    .wo-status-badge {
      font-family: "Circular-Std", sans-serif;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 20px;
      flex-shrink: 0;

      .status-open & {
        color: #5b5fc7;
        background: #dddff7;
      }

      .status-in-progress & {
        color: #5b5fc7;
        background: #dddff7;
      }

      .status-complete & {
        color: #276749;
        background: #c6f6d5;
      }

      .status-blocked & {
        color: #b45309;
        background: #fde68a;
      }
    }

    .wo-menu-btn {
      margin-left: auto;
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      flex-shrink: 0;
      display: none;
      color: #8a8fa8;
      line-height: 1;
      font-size: 13px;
      letter-spacing: 1px;

      .wo-bar:hover & {
        display: flex;
      }

      &:hover {
        background: rgba(0,0,0,0.06);
      }
    }

    .wo-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #fff;
      border: 1.5px solid #e2e5ef;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      z-index: 50;
      min-width: 100px;
      padding: 4px 0;
    }

    .dropdown-item {
      display: block;
      width: 100%;
      font-family: "Circular-Std", sans-serif;
      font-size: 13px;
      color: #3a3d52;
      background: none;
      border: none;
      text-align: left;
      padding: 8px 16px;
      cursor: pointer;

      &:hover {
        background: #f5f6fa;
      }

      &.delete {
        color: #e53e3e;
      }
    }

    /* ─── Add tooltip ─── */
    .add-tooltip {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      font-family: "Circular-Std", sans-serif;
      font-size: 12px;
      color: #fff;
      background: #2d3050;
      padding: 5px 12px;
      border-radius: 6px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
    }

    .dots {
      letter-spacing: 2px;
    }
  `]
})
export class TimelineComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('rightPanel') rightPanelRef!: ElementRef<HTMLDivElement>;

  private timelineService = inject(TimelineService);

  readonly workCenters = this.timelineService.workCenters;
  readonly workOrders = this.timelineService.workOrders;

  hoveredRow = signal<string | null>(null);
  openMenuId = signal<string | null>(null);
  panelMode = signal<PanelMode | null>(null);
  hoverX = signal<number>(0);
  currentView: TimescaleView = 'month';

  viewOptions = [
    { value: 'hour' as TimescaleView, label: 'Hour' },
    { value: 'day' as TimescaleView, label: 'Day' },
    { value: 'week' as TimescaleView, label: 'Week' },
    { value: 'month' as TimescaleView, label: 'Month' },
  ];

  /** Total number of columns shown */
  private totalCols = signal<number>(14);

  /**
   * The "anchor" date — the leftmost date in the visible range.
   * We start centered around today.
   */
  private anchorDate = signal<Date>(this.computeAnchor());

  readonly columns = computed<TimelineColumn[]>(() => {
    return this.buildColumns(this.anchorDate(), this.totalCols(), this.currentView);
  });

  /** Column width in pixels */
  columnWidth = signal<number>(120);

  readonly totalGridWidth = computed(() => this.columns().length * this.columnWidth());

  ngOnInit(): void {
    this.timelineService.loadFromStorage();
    this.updateColumnWidth();
  }

  ngAfterViewInit(): void {
    this.scrollToToday();
  }

  private clickListener = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.wo-dropdown') && !target.closest('.wo-menu-btn')) {
      this.openMenuId.set(null);
    }
  };

  ngOnDestroy(): void {
    document.removeEventListener('click', this.clickListener);
  }

  onViewChange(view: TimescaleView): void {
    this.currentView = view;
    this.anchorDate.set(this.computeAnchor());
    setTimeout(() => this.scrollToToday(), 50);
  }

  onScroll(): void {
    // Could implement infinite scroll here
  }

  currentBadgeLabel(): string {
    switch (this.currentView) {
      case 'month': return 'Current month';
      case 'week': return 'Current week';
      case 'day': return 'Today';
      case 'hour': return 'Current hour';
    }
  }

  todayLineLeft(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cols = this.columns();
    if (!cols.length) return 0;
    const colW = this.columnWidth();

    // Find today's position among columns
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const colStart = new Date(col.date);
      colStart.setHours(0, 0, 0, 0);
      const colEnd = this.addPeriod(colStart, this.currentView);

      if (today >= colStart && today < colEnd) {
        // Fractional position within column
        const total = colEnd.getTime() - colStart.getTime();
        const elapsed = today.getTime() - colStart.getTime();
        return i * colW + (elapsed / total) * colW;
      }
    }
    return 0;
  }

  getBarsForCenter(workCenterId: string): { workOrder: WorkOrderDocument; left: number; width: number }[] {
    const orders = this.workOrders().filter(wo => wo.data.workCenterId === workCenterId);
    const cols = this.columns();
    if (!cols.length) return [];

    const colW = this.columnWidth();
    const rangeStart = cols[0].date;
    const rangeEnd = this.addPeriod(cols[cols.length - 1].date, this.currentView);
    const totalMs = rangeEnd.getTime() - rangeStart.getTime();
    const totalPx = cols.length * colW;

    return orders
      .map(wo => {
        const start = new Date(wo.data.startDate);
        const end = new Date(wo.data.endDate);

        const left = ((start.getTime() - rangeStart.getTime()) / totalMs) * totalPx;
        const width = ((end.getTime() - start.getTime()) / totalMs) * totalPx;

        return { workOrder: wo, left: Math.max(left, 0), width: Math.max(width, 60) };
      });
  }

  onRowClick(event: MouseEvent, workCenterId: string): void {
    const target = event.target as HTMLElement;
    if (target.closest('.wo-bar')) return;

    const rightPanel = this.rightPanelRef.nativeElement;
    const rect = rightPanel.getBoundingClientRect();
    const scrollLeft = rightPanel.scrollLeft;
    const clickX = event.clientX - rect.left + scrollLeft;

    const cols = this.columns();
    const colW = this.columnWidth();
    const colIndex = Math.floor(clickX / colW);
    const clickedDate = cols[Math.min(colIndex, cols.length - 1)]?.date;

    if (!clickedDate) return;

    const dateStr = clickedDate.toISOString().split('T')[0];
    this.panelMode.set({ mode: 'create', workCenterId, clickedDate: dateStr });
  }

  onEdit(wo: WorkOrderDocument): void {
    this.openMenuId.set(null);
    this.panelMode.set({ mode: 'edit', workOrder: wo });
  }

  onDelete(docId: string): void {
    this.openMenuId.set(null);
    this.timelineService.deleteWorkOrder(docId);
  }

  toggleMenu(event: MouseEvent, docId: string): void {
    event.stopPropagation();
    this.openMenuId.update(id => (id === docId ? null : docId));

    if (this.openMenuId() !== null) {
      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', this.clickListener, { once: true });
      });
    }
  }

  closePanel(): void {
    this.panelMode.set(null);
  }

  hasOrderAtPosition(): boolean {
    return false; // simplified
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'Open',
      'in-progress': 'In progress',
      complete: 'Complete',
      blocked: 'Blocked',
    };
    return map[status] ?? status;
  }

  private computeAnchor(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Center on today — go back some columns
    switch (this.currentView) {
      case 'month': {
        const d = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        return d;
      }
      case 'week': {
        const d = new Date(today);
        d.setDate(d.getDate() - d.getDay() - 8 * 7);
        return d;
      }
      case 'day': {
        const d = new Date(today);
        d.setDate(d.getDate() - 14);
        return d;
      }
      case 'hour': {
        const d = new Date(today);
        d.setHours(d.getHours() - 12, 0, 0, 0);
        return d;
      }
    }
  }

  private buildColumns(anchor: Date, count: number, view: TimescaleView): TimelineColumn[] {
    const cols: TimelineColumn[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < count; i++) {
      const date = this.addPeriodN(anchor, view, i);
      const label = this.formatColumnLabel(date, view);
      const isCurrent = this.isCurrentPeriod(date, view, today);

      cols.push({ date, label, isToday: this.isSameDay(date, today), isCurrent });
    }
    return cols;
  }

  private formatColumnLabel(date: Date, view: TimescaleView): string {
    switch (view) {
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      case 'week': {
        const end = new Date(date);
        end.setDate(end.getDate() + 6);
        return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
      case 'day':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'hour':
        return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    }
  }

  private isCurrentPeriod(date: Date, view: TimescaleView, today: Date): boolean {
    switch (view) {
      case 'month':
        return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return this.isSameDay(date, weekStart);
      }
      case 'day':
        return this.isSameDay(date, today);
      case 'hour':
        return date.getHours() === today.getHours() && this.isSameDay(date, today);
    }
  }

  private addPeriodN(base: Date, view: TimescaleView, n: number): Date {
    const d = new Date(base);
    switch (view) {
      case 'month': d.setMonth(d.getMonth() + n); break;
      case 'week': d.setDate(d.getDate() + n * 7); break;
      case 'day': d.setDate(d.getDate() + n); break;
      case 'hour': d.setHours(d.getHours() + n); break;
    }
    return d;
  }

  private addPeriod(date: Date, view: TimescaleView): Date {
    return this.addPeriodN(date, view, 1);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear();
  }

  private updateColumnWidth(): void {
    switch (this.currentView) {
      case 'month': this.columnWidth.set(120); this.totalCols.set(14); break;
      case 'week': this.columnWidth.set(100); this.totalCols.set(20); break;
      case 'day': this.columnWidth.set(80); this.totalCols.set(30); break;
      case 'hour': this.columnWidth.set(80); this.totalCols.set(48); break;
    }
  }

  private scrollToToday(): void {
    const panel = this.rightPanelRef?.nativeElement;
    if (!panel) return;

    this.updateColumnWidth();
    const cols = this.columns();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todayCol = cols.findIndex(c => this.isCurrentPeriod(c.date, this.currentView, today));
    if (todayCol < 0) todayCol = Math.floor(cols.length / 2);

    const colW = this.columnWidth();
    const panelWidth = panel.clientWidth;
    const scrollTo = todayCol * colW - panelWidth / 2 + colW / 2;
    panel.scrollLeft = Math.max(0, scrollTo);
  }
}
