import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, inject, ChangeDetectionStrategy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgbDatepickerModule, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';
import { Observable, startWith, map } from 'rxjs';
import { PanelMode, WorkOrderStatus } from '../../models/timeline.models';
import { TimelineService } from '../../services/timeline.service';

// Group-level validator that compares both date fields at once.
// It lives at the FormGroup level rather than on a single control because
// Angular calls it whenever any field in the group changes
function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as NgbDateStruct | null;
  const end   = group.get('endDate')?.value as NgbDateStruct | null;

  // If either field is still empty we let the required validator handle it —
  // no point showing "end before start" when the user hasn't finished yet
  if (!start || !end) return null;

  const toMs = (d: NgbDateStruct) => new Date(d.year, d.month - 1, d.day).getTime();

  // Same-day end is also invalid — a zero-duration work order makes no sense on the timeline
  return toMs(end) <= toMs(start) ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-work-order-panel',
  standalone: true,
  // NgbDatepickerModule provides the date picker popup on the date input fields
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule, NgbDatepickerModule],
  // Using Default change detection (not OnPush) here because the ngb-datepicker
  // integration triggers change detection in ways that don't play nicely with OnPush
  changeDetection: ChangeDetectionStrategy.Default,
  templateUrl: './work-order-panel.component.html',
  styleUrl: './work-order-panel.component.scss'
})
export class WorkOrderPanelComponent implements OnChanges {

  // null = panel is closed; a mode object = panel is open in create or edit mode
  @Input() panelMode: PanelMode | null = null;

  // "closed" fires when the user cancels or clicks the backdrop (no data was saved)
  @Output() closed = new EventEmitter<void>();

  // "saved" fires only after a successful create or update
  @Output() saved  = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private timelineService = inject(TimelineService);

  // Holds any overlap error message returned by the service after a failed save.
  overlapError: string | null = null;

  // Tracks the currently selected status value so we can apply the right coloured
  // pill class on the ng-select container (e.g. status-val-blocked -> amber pill).
  // A signal works well here because the template reads it reactively without subscribing.
  selectedStatus = signal<string>('open');

  userSelectedStartDate = false;
  userSelectedEndDate = false;

  // The reactive form — defined at class level so TypeScript can infer the type
  // and we avoid any initialisation-order issues that can arise in the constructor
  form: FormGroup = this.fb.group({
    name:      ['', Validators.required],
    status:    ['open' as WorkOrderStatus, Validators.required],
    startDate: [null as NgbDateStruct | null, Validators.required],
    endDate:   [null as NgbDateStruct | null, Validators.required],
  }, { validators: endAfterStart }); // group-level validator runs on every change

  // An observable version of the status value, startWith ensures it emits
  // immediately so the pill class renders correctly on first open.
  statusValue$: Observable<string> = this.form.get('status')!.valueChanges.pipe(
    startWith('open'),
    map(v => v || 'open')
  );

  // The four statuses available in the dropdown — order matches the design mockup
  statusOptions: { value: WorkOrderStatus; label: string }[] = [
    { value: 'open',        label: 'Open'        },
    { value: 'in-progress', label: 'In progress' },
    { value: 'complete',    label: 'Complete'    },
    { value: 'blocked',     label: 'Blocked'     },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    // We only care about the panelMode input changing — ignore anything else
    if (!changes['panelMode']) return;

    // Clear any overlap error from the previous open/close cycle
    this.overlapError = null;

    const mode = this.panelMode;

    // If the panel just closed (panelMode went to null) we don't need to do
    // anything — the form state will be reset the next time it opens
    if (!mode) return;

    if (mode.mode === 'edit' && mode.workOrder) {
      // Edit mode: pre-fill every field with the existing work order's values
      const wo = mode.workOrder;
      this.form.reset({
        name:      wo.data.name,
        status:    wo.data.status,
        startDate: this.isoToNgb(wo.data.startDate), // "2025-09-01" -> NgbDateStruct
        endDate:   this.isoToNgb(wo.data.endDate),
      });
      this.selectedStatus.set(wo.data.status);

    } else {
      // Create mode: blank name, "Open" status, start date = the column the user
      // clicked, end date = start + 7 days as a default
      const startIso = mode.clickedDate ?? new Date().toISOString().split('T')[0];
      this.form.reset({
        name:      '',
        status:    'open',
        startDate: this.isoToNgb(startIso),
        endDate:   this.isoToNgb(this.addDays(startIso, 7)),
      });
      this.selectedStatus.set('open');
    }

    // Subscribe to status field changes so selectedStatus stays in sync with
    // whatever the user picks. This drives the coloured pill class on the dropdown.
    // We don't unsubscribe here because ngOnChanges fires fresh each time the
    // panel opens, resetting the form and effectively ending the old subscription.
    this.form.get('status')!.valueChanges.subscribe(val => {
      this.selectedStatus.set(val || 'open');
    });
  }

  onSubmit(): void {
    // Touch every field so required / validation error messages become visible
    // even if the user clicks Create without having touched any input
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const val = this.form.value;

    // In edit mode the work center is inherited from the existing work order.
    // In create mode it comes from whichever row the user clicked.
    const workCenterId = this.panelMode?.mode === 'edit'
      ? this.panelMode.workOrder!.data.workCenterId
      : this.panelMode?.workCenterId ?? '';

    // Convert NgbDateStructs back to ISO strings before sending to the service —
    // the service and localStorage always work in "YYYY-MM-DD" format
    const payload = {
      name:        val.name,
      workCenterId,
      status:      val.status,
      startDate:   this.ngbToIso(val.startDate),
      endDate:     this.ngbToIso(val.endDate),
    };

    // Route to update vs add depending on the current panel mode
    const result = this.panelMode?.mode === 'edit' && this.panelMode.workOrder
      ? this.timelineService.updateWorkOrder(this.panelMode.workOrder.docId, payload)
      : this.timelineService.addWorkOrder(payload);

    if (result.success) {
      // Save succeeded — clear any stale error and tell the parent to close the panel
      this.overlapError = null;
      this.saved.emit();
    } else {
      // The service found an overlapping order — show the message inside the panel
      // so the user can adjust the dates without losing their other input
      this.overlapError = result.error ?? null;
    }
  }

  // Called when the user clicks Cancel
  onCancel(): void { this.closed.emit(); }

  // Called when the user clicks the transparent backdrop behind the panel
  onBackdropClick(): void { this.closed.emit(); }

  // Looks up the human-readable label for a status key — used in the template
  // to display the selected value text inside the dropdown trigger
  getStatusLabel(value: string): string {
    return this.statusOptions.find(o => o.value === value)?.label ?? value;
  }

  // Formats an NgbDateStruct for display in the date input fields.
  // The design spec uses DD.MM.YYYY (dot-separated) as shown in the mockups.
  // Pads day and month to two digits so "9" becomes "09".
  formatDate(d: NgbDateStruct | null): string {
    if (!d) return '';
    return `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.${d.year}`;
  }

  // Converts an ISO date string ("YYYY-MM-DD") to the NgbDateStruct format
  // that ngb-datepicker stores and compares internally ({ year, month, day } as numbers).
  // NgbDateStruct.month is 1-based (1 = January), same as ISO.
  private isoToNgb(iso: string): NgbDateStruct | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return { year: y, month: m, day: d };
  }

  // Converts an NgbDateStruct back to an ISO string for storage and service calls.
  // Pads month and day to keep the format consistent across the whole app.
  private ngbToIso(d: NgbDateStruct | null): string {
    if (!d) return '';
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  }

  // Advances an ISO date string by a given number of days.
  // Used to compute the default end date when the create panel opens (start + 7 days).
  private addDays(iso: string, days: number): string {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  onStartDateSelected(date: any, picker: any) {
  this.userSelectedStartDate = true;
  picker.close();
}

onEndDateSelected(date: any, picker: any) {
  this.userSelectedEndDate = true;
  picker.close();
}
}