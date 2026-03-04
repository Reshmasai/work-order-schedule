import { WorkCenterDocument, WorkOrderDocument } from '../models/timeline.models';

export const WORK_CENTERS: WorkCenterDocument[] = [
  {
    docId: 'wc-1',
    docType: 'workCenter',
    data: { name: 'Genesis Hardware' }
  },
  {
    docId: 'wc-2',
    docType: 'workCenter',
    data: { name: 'Rodriques Electrics' }
  },
  {
    docId: 'wc-3',
    docType: 'workCenter',
    data: { name: 'Konsulting Inc' }
  },
  {
    docId: 'wc-4',
    docType: 'workCenter',
    data: { name: 'McMarrow Distribution' }
  },
  {
    docId: 'wc-5',
    docType: 'workCenter',
    data: { name: 'Spartan Manufacturing' }
  }
];

// Dates relative to today (March 1, 2026 baseline, but we use dynamic offsets)
function offset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export const WORK_ORDERS: WorkOrderDocument[] = [
  // Genesis Hardware - complete order (past)
  {
    docId: 'wo-1',
    docType: 'workOrder',
    data: {
      name: 'Centrix Ltd',
      workCenterId: 'wc-1',
      status: 'complete',
      startDate: offset(-60),
      endDate: offset(-30)
    }
  },
  // Rodriques Electrics - in progress (spanning today)
  {
    docId: 'wo-2',
    docType: 'workOrder',
    data: {
      name: 'Rodriques Electrics',
      workCenterId: 'wc-2',
      status: 'in-progress',
      startDate: offset(-45),
      endDate: offset(15)
    }
  },
  // Konsulting Inc - two orders, non-overlapping
  {
    docId: 'wo-3',
    docType: 'workOrder',
    data: {
      name: 'Konsulting Inc',
      workCenterId: 'wc-3',
      status: 'in-progress',
      startDate: offset(-30),
      endDate: offset(10)
    }
  },
  {
    docId: 'wo-4',
    docType: 'workOrder',
    data: {
      name: 'Compleks Systems',
      workCenterId: 'wc-3',
      status: 'in-progress',
      startDate: offset(20),
      endDate: offset(55)
    }
  },
  // McMarrow Distribution - blocked
  {
    docId: 'wo-5',
    docType: 'workOrder',
    data: {
      name: 'McMarrow Distribution',
      workCenterId: 'wc-4',
      status: 'blocked',
      startDate: offset(-10),
      endDate: offset(50)
    }
  },
  // Genesis Hardware - open (future)
  {
    docId: 'wo-6',
    docType: 'workOrder',
    data: {
      name: 'Alpha Forge',
      workCenterId: 'wc-1',
      status: 'open',
      startDate: offset(5),
      endDate: offset(35)
    }
  },
  // Spartan Manufacturing - open
  {
    docId: 'wo-7',
    docType: 'workOrder',
    data: {
      name: 'Spartan Run #1',
      workCenterId: 'wc-5',
      status: 'open',
      startDate: offset(-20),
      endDate: offset(5)
    }
  },
  // Spartan Manufacturing - second order (non-overlapping)
  {
    docId: 'wo-8',
    docType: 'workOrder',
    data: {
      name: 'Spartan Run #2',
      workCenterId: 'wc-5',
      status: 'in-progress',
      startDate: offset(10),
      endDate: offset(40)
    }
  }
];
