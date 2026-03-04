import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  inject,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { PanelMode, WorkOrderStatus } from '../../models/timeline.models';
import { TimelineService } from '../../services/timeline.service';

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  if (start && end && new Date(end) <= new Date(start)) {
    return { endBeforeStart: true };
  }
  return null;
}

@Component({
  selector: 'app-work-order-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Overlay backdrop -->
    <div
      class="panel-backdrop"
      [class.visible]="panelMode !== null"
      (click)="onBackdropClick()"
    ></div>

    <!-- Slide-out panel -->
    <div class="panel" [class.open]="panelMode !== null" role="dialog" aria-modal="true">
      <div class="panel-inner">
        <!-- Header -->
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Work Order Details</h2>
            <p class="panel-subtitle">Specify the dates, name and status for this order</p>
          </div>
          <div class="panel-actions">
            <button type="button" class="btn-cancel" (click)="onCancel()">Cancel</button>
            <button type="button" class="btn-create" (click)="onSubmit()">
              {{ panelMode?.mode === 'edit' ? 'Save' : 'Create' }}
            </button>
          </div>
        </div>

        <!-- Form -->
        <form [formGroup]="form" class="panel-form" (keydown.escape)="onCancel()">
          <!-- Work Order Name -->
          <div class="form-field">
            <label class="field-label">Work Order Name</label>
            <input
              type="text"
              class="field-input"
              [class.active]="form.get('name')?.dirty || form.get('name')?.touched"
              [class.error]="form.get('name')?.invalid && form.get('name')?.touched"
              formControlName="name"
              placeholder="Acme Inc."
              autocomplete="off"
            />
            @if (form.get('name')?.invalid && form.get('name')?.touched) {
              <span class="field-error">Work order name is required.</span>
            }
          </div>

          <!-- Status -->
          <div class="form-field">
            <label class="field-label">Status</label>
            <ng-select
              formControlName="status"
              [clearable]="false"
              [searchable]="false"
              class="status-select"
              [ngClass]="'status-' + form.get('status')?.value"
            >
              @for (opt of statusOptions; track opt.value) {
                <ng-option [value]="opt.value">{{ opt.label }}</ng-option>
              }
            </ng-select>
          </div>

          <!-- End Date -->
          <div class="form-field">
            <label class="field-label">End date</label>
            <input
              type="date"
              class="field-input date-input"
              formControlName="endDate"
              [class.error]="form.get('endDate')?.invalid && form.get('endDate')?.touched"
            />
          </div>

          <!-- Start Date -->
          <div class="form-field">
            <label class="field-label">Start date</label>
            <input
              type="date"
              class="field-input date-input"
              formControlName="startDate"
              [class.error]="form.get('startDate')?.invalid && form.get('startDate')?.touched"
            />
          </div>

          <!-- Cross-field error -->
          @if (form.errors?.['endBeforeStart'] && form.touched) {
            <div class="form-error-banner">
              End date must be after start date.
            </div>
          }

          <!-- Overlap error -->
          @if (overlapError) {
            <div class="form-error-banner">{{ overlapError }}</div>
          }
        </form>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .panel-backdrop {
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 99;
      display: none;
      pointer-events: none;

      &.visible {
        display: block;
        pointer-events: auto;
      }
    }

    .panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 420px;
      background: #fff;
      box-shadow: -4px 0 24px rgba(0,0,0,0.10);
      z-index: 100;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
      overflow-y: auto;

      &.open {
        transform: translateX(0);
      }
    }

    .panel-inner {
      padding: 24px 24px 32px;
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 28px;
      gap: 16px;
    }

    .panel-title {
      font-family: "Circular-Std", sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 4px;
    }

    .panel-subtitle {
      font-family: "Circular-Std", sans-serif;
      font-size: 13px;
      color: #8a8fa8;
      margin: 0;
    }

    .panel-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-shrink: 0;
    }

    .btn-cancel {
      font-family: "Circular-Std", sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #5b6078;
      background: none;
      border: none;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;

      &:hover {
        background: #f5f6fa;
      }
    }

    .btn-create {
      font-family: "Circular-Std", sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      background: #5b5fc7;
      border: none;
      padding: 8px 20px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;

      &:hover {
        background: #4a4eb8;
      }
    }

    .panel-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-label {
      font-family: "Circular-Std", sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: #5b6078;
    }

    .field-input {
      font-family: "Circular-Std", sans-serif;
      font-size: 14px;
      color: #1a1a2e;
      background: #fff;
      border: 1.5px solid #e2e5ef;
      border-radius: 6px;
      padding: 10px 14px;
      outline: none;
      transition: border-color 0.15s;
      width: 100%;
      box-sizing: border-box;

      &::placeholder {
        color: #bbbdcc;
      }

      &.active, &:focus {
        border-color: #5b5fc7;
      }

      &.error {
        border-color: #e53e3e;
      }
    }

    .date-input {
      color: #8a8fa8;

      &:focus, &.active {
        color: #1a1a2e;
      }
    }

    .field-error {
      font-family: "Circular-Std", sans-serif;
      font-size: 12px;
      color: #e53e3e;
    }

    .form-error-banner {
      font-family: "Circular-Std", sans-serif;
      font-size: 13px;
      color: #e53e3e;
      background: #fff5f5;
      border: 1px solid #fed7d7;
      border-radius: 6px;
      padding: 10px 14px;
    }

    /* ng-select overrides */
    ::ng-deep .status-select {
      .ng-select-container {
        font-family: "Circular-Std", sans-serif;
        font-size: 14px;
        border: 1.5px solid #e2e5ef !important;
        border-radius: 6px !important;
        min-height: 42px;
        box-shadow: none !important;
        transition: border-color 0.15s;
      }

      &.ng-select-focused .ng-select-container {
        border-color: #5b5fc7 !important;
      }

      .ng-value-container {
        padding: 0 12px;
      }

      .ng-arrow-wrapper {
        padding-right: 12px;
      }

      .ng-dropdown-panel {
        border: 1.5px solid #e2e5ef;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.10);
        margin-top: 4px;
      }

      .ng-option {
        font-family: "Circular-Std", sans-serif;
        font-size: 14px;
        padding: 10px 14px;
        color: #1a1a2e;

        &:hover, &.ng-option-marked {
          background: #f5f6fa;
        }
      }

      /* Status value styling */
      &.status-open .ng-value { color: #5b5fc7; font-weight: 500; }
      &.status-in-progress .ng-value { color: #5b5fc7; font-weight: 500; }
      &.status-complete .ng-value { color: #38a169; font-weight: 500; }
      &.status-blocked .ng-value { color: #d97706; font-weight: 500; }
    }
  `]
})
export class WorkOrderPanelComponent implements OnChanges {
  @Input() panelMode: PanelMode | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private timelineService = inject(TimelineService);

  overlapError: string | null = null;

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    status: ['open' as WorkOrderStatus, Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
  }, { validators: endAfterStart });

  statusOptions: { value: WorkOrderStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'blocked', label: 'Blocked' },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['panelMode']) {
      this.overlapError = null;
      const mode = this.panelMode;
      if (mode) {
        if (mode.mode === 'edit' && mode.workOrder) {
          const wo = mode.workOrder;
          this.form.reset({
            name: wo.data.name,
            status: wo.data.status,
            startDate: wo.data.startDate,
            endDate: wo.data.endDate,
          });
        } else {
          // Create mode
          const startDate = mode.clickedDate ?? new Date().toISOString().split('T')[0];
          const endDate = this.addDays(startDate, 7);
          this.form.reset({
            name: '',
            status: 'open',
            startDate,
            endDate,
          });
        }
      }
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const val = this.form.value;
    const workCenterId = this.panelMode?.mode === 'edit'
      ? this.panelMode.workOrder!.data.workCenterId
      : this.panelMode?.workCenterId ?? '';

    let result: { success: boolean; error?: string };

    if (this.panelMode?.mode === 'edit' && this.panelMode.workOrder) {
      result = this.timelineService.updateWorkOrder(this.panelMode.workOrder.docId, {
        name: val.name,
        workCenterId,
        status: val.status,
        startDate: val.startDate,
        endDate: val.endDate,
      });
    } else {
      result = this.timelineService.addWorkOrder({
        name: val.name,
        workCenterId,
        status: val.status,
        startDate: val.startDate,
        endDate: val.endDate,
      });
    }

    if (result.success) {
      this.overlapError = null;
      this.saved.emit();
    } else {
      this.overlapError = result.error ?? null;
    }
  }

  onCancel(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}
