import { Injectable, signal, computed } from '@angular/core';
import { WorkCenterDocument, WorkOrderDocument, WorkOrderStatus } from '../models/timeline.models';
import { WORK_CENTERS, WORK_ORDERS } from '../models/sample-data';

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private _workCenters = signal<WorkCenterDocument[]>([...WORK_CENTERS]);
  private _workOrders = signal<WorkOrderDocument[]>([...WORK_ORDERS]);

  readonly workCenters = this._workCenters.asReadonly();
  readonly workOrders = this._workOrders.asReadonly();

  getWorkOrdersForCenter(workCenterId: string): WorkOrderDocument[] {
    return this._workOrders().filter(wo => wo.data.workCenterId === workCenterId);
  }

  addWorkOrder(data: {
    name: string;
    workCenterId: string;
    status: WorkOrderStatus;
    startDate: string;
    endDate: string;
  }): { success: boolean; error?: string } {
    const overlap = this.checkOverlap(data.workCenterId, data.startDate, data.endDate, null);
    if (overlap) {
      return { success: false, error: 'Work order overlaps with an existing order on this work center.' };
    }

    const newOrder: WorkOrderDocument = {
      docId: `wo-${Date.now()}`,
      docType: 'workOrder',
      data: { ...data }
    };
    this._workOrders.update(orders => [...orders, newOrder]);
    this.persistToStorage();
    return { success: true };
  }

  updateWorkOrder(docId: string, data: {
    name: string;
    workCenterId: string;
    status: WorkOrderStatus;
    startDate: string;
    endDate: string;
  }): { success: boolean; error?: string } {
    const overlap = this.checkOverlap(data.workCenterId, data.startDate, data.endDate, docId);
    if (overlap) {
      return { success: false, error: 'Work order overlaps with an existing order on this work center.' };
    }

    this._workOrders.update(orders =>
      orders.map(wo => wo.docId === docId ? { ...wo, data: { ...data } } : wo)
    );
    this.persistToStorage();
    return { success: true };
  }

  deleteWorkOrder(docId: string): void {
    this._workOrders.update(orders => orders.filter(wo => wo.docId !== docId));
    this.persistToStorage();
  }

  /**
   * Check if a proposed date range overlaps with existing orders on the same work center.
   * Excludes the order with `excludeDocId` (for edit scenario).
   */
  private checkOverlap(
    workCenterId: string,
    startDate: string,
    endDate: string,
    excludeDocId: string | null
  ): boolean {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return this._workOrders()
      .filter(wo => wo.data.workCenterId === workCenterId && wo.docId !== excludeDocId)
      .some(wo => {
        const wStart = new Date(wo.data.startDate).getTime();
        const wEnd = new Date(wo.data.endDate).getTime();
        // Overlap if start < wEnd && end > wStart
        return start < wEnd && end > wStart;
      });
  }

  private persistToStorage(): void {
    try {
      localStorage.setItem('naologic_work_orders', JSON.stringify(this._workOrders()));
    } catch {
      // localStorage not available
    }
  }

  loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('naologic_work_orders');
      if (stored) {
        this._workOrders.set(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }
}
