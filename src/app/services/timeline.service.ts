import { Injectable, signal } from '@angular/core';
import { WorkCenterDocument, WorkOrderDocument, WorkOrderStatus } from '../models/timeline.models';
import { WORK_CENTERS, WORK_ORDERS } from '../models/sample-data';

const STORAGE_KEY = 'naologic_work_orders';

@Injectable({ providedIn: 'root' })
export class TimelineService {

  // Private writable signals — only this service mutates state.
  // Components get read-only views via the public accessors below.
  private readonly _workCenters = signal<WorkCenterDocument[]>([...WORK_CENTERS]);
  private readonly _workOrders  = signal<WorkOrderDocument[]>([...WORK_ORDERS]);

  readonly workCenters = this._workCenters.asReadonly();
  readonly workOrders  = this._workOrders.asReadonly();

  // Read

  getWorkOrdersForCenter(workCenterId: string): WorkOrderDocument[] {
    return this._workOrders().filter(wo => wo.data.workCenterId === workCenterId);
  }

  // Write

  addWorkOrder(data: WorkOrderPayload): ServiceResult {
    const overlap = this.checkOverlap(data.workCenterId, data.startDate, data.endDate, null);
    if (overlap) return OVERLAP_ERROR;

    const newOrder: WorkOrderDocument = {
      docId:   `wo-${Date.now()}`,
      docType: 'workOrder',
      data:    { ...data },
    };

    this._workOrders.update(orders => [...orders, newOrder]);
    this.persist();
    return { success: true };
  }

  updateWorkOrder(docId: string, data: WorkOrderPayload): ServiceResult {
    // Exclude the order being edited from the overlap check
    const overlap = this.checkOverlap(data.workCenterId, data.startDate, data.endDate, docId);
    if (overlap) return OVERLAP_ERROR;

    this._workOrders.update(orders =>
      orders.map(wo => (wo.docId === docId ? { ...wo, data: { ...data } } : wo))
    );
    this.persist();
    return { success: true };
  }

  deleteWorkOrder(docId: string): void {
    this._workOrders.update(orders => orders.filter(wo => wo.docId !== docId));
    this.persist();
  }

  // Persistence

  /** Called once on app init to rehydrate orders from the previous session. */
  loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this._workOrders.set(JSON.parse(raw));
    } catch {
      // localStorage unavailable (private browsing, storage quota) — start fresh
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._workOrders()));
    } catch {
      // The UI still works, data just won't survive a refresh
    }
  }

  // Overlap detection

  /**
   * Returns true if [startDate, endDate) overlaps any existing order on the
   * same work center. excludeDocId lets us skip the order being edited.
   *
   * Uses half-open interval comparison: start < otherEnd && end > otherStart
   */
  private checkOverlap(
    workCenterId: string,
    startDate:    string,
    endDate:      string,
    excludeDocId: string | null,
  ): boolean {
    const start = new Date(startDate).getTime();
    const end   = new Date(endDate).getTime();

    return this._workOrders()
      .filter(wo => wo.data.workCenterId === workCenterId && wo.docId !== excludeDocId)
      .some(wo => {
        const wStart = new Date(wo.data.startDate).getTime();
        const wEnd   = new Date(wo.data.endDate).getTime();
        return start < wEnd && end > wStart;
      });
  }
}

// Local types / constants

type WorkOrderPayload = {
  name: string;
  workCenterId: string;
  status: WorkOrderStatus;
  startDate: string;
  endDate: string;
};

type ServiceResult = { success: boolean; error?: string };

const OVERLAP_ERROR: ServiceResult = {
  success: false,
  error: 'Work order overlaps with an existing order on this work center.',
};