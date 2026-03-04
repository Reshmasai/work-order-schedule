export type WorkOrderStatus = 'open' | 'in-progress' | 'complete' | 'blocked';
export type TimescaleView = 'hour' | 'day' | 'week' | 'month';

export interface WorkCenterDocument {
  docId: string;
  docType: 'workCenter';
  data: {
    name: string;
  };
}

export interface WorkOrderDocument {
  docId: string;
  docType: 'workOrder';
  data: {
    name: string;
    workCenterId: string;
    status: WorkOrderStatus;
    startDate: string; // ISO format "YYYY-MM-DD"
    endDate: string;   // ISO format "YYYY-MM-DD"
  };
}

export interface TimelineColumn {
  date: Date;
  label: string;
  isToday: boolean;
  isCurrent: boolean; // current week/month
}

export interface WorkOrderBar {
  workOrder: WorkOrderDocument;
  leftPct: number;
  widthPct: number;
  visible: boolean;
}

export interface PanelMode {
  mode: 'create' | 'edit';
  workCenterId?: string;
  clickedDate?: string;
  workOrder?: WorkOrderDocument;
}
