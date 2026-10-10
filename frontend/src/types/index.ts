export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  centreId?: string;
  centre?: Centre;
  lastLoginAt?: string;
}

export type UserRole = 'ADMIN' | 'MONITORING_OFFICER' | 'CENTRE_MANAGER' | 'VIEWER';

export interface Centre {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  sanctionedCapacity: number;
  status: CentreStatus;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  schemeId?: string;
  schemeName?: string;
  cameras?: Camera[];
  inventory?: InventoryItem[];
  _count?: {
    cameras: number;
    attendanceRecords: number;
    alerts: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type CentreStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface Camera {
  id: string;
  centreId: string;
  name: string;
  rtspUrl: string;
  roi?: number[][];
  isActive: boolean;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  centreId: string;
  name: string;
  category: EquipmentCategory;
  quantity: number;
  unit: string;
  specs?: Record<string, unknown>;
  location?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EquipmentCategory = 'MACHINERY' | 'FURNITURE' | 'SAFETY' | 'TOOLS' | 'COMPUTERS' | 'OTHER';

export interface AttendanceRecord {
  id: string;
  centreId: string;
  centre?: Centre;
  date: string;
  session: AttendanceSession;
  recordedCount: number;
  detectedCount?: number;
  discrepancy?: number;
  status: AttendanceStatus;
  confidence?: number;
  metadata?: Record<string, unknown>;
  submittedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceSession = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY';

export type AttendanceStatus = 'PENDING' | 'VERIFIED' | 'DISCREPANT' | 'UNDER_REVIEW';

export interface InfrastructureCheck {
  id: string;
  centreId: string;
  centre?: Centre;
  itemId: string;
  item?: InventoryItem;
  timestamp: string;
  detected: boolean;
  operability: OperabilityStatus;
  confidence: number;
  personNearby: boolean;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type OperabilityStatus = 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'UNKNOWN' | 'MAINTENANCE';

export interface Alert {
  id: string;
  centreId: string;
  centre?: Centre;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AlertType =
  | 'ATTENDANCE_DISCREPANCY'
  | 'EQUIPMENT_MISSING'
  | 'EQUIPMENT_NON_FUNCTIONAL'
  | 'CAMERA_OFFLINE'
  | 'LOW_CONFIDENCE';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'FALSE_POSITIVE' | 'DISMISSED';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardSummary {
  overview: {
    totalCentres: number;
    activeCentres: number;
    totalCameras: number;
    onlineCameras: number;
    cameraUptime: number;
  };
  attendance: {
    totalRecords: number;
    discrepancyBreakdown: Record<string, number>;
  };
  alerts: {
    total: number;
    open: number;
    critical: number;
  };
  recentAttendance: AttendanceRecord[];
  recentAlerts: Alert[];
}

export interface CentreMapData {
  id: string;
  code: string;
  name: string;
  position: [number, number];
  status: CentreStatus;
  capacity: number;
  cameraCount: number;
  openAlerts: number;
}

export interface AttendanceTrend {
  date: string;
  recorded: number;
  detected: number;
  discrepancy: number;
  records: number;
}

export interface InfrastructureCompliance {
  summary: {
    totalItemsChecked: number;
    functional: number;
    nonFunctional: number;
    missing: number;
    complianceRate: number;
  };
  byCategory: Record<string, { total: number; functional: number; nonFunctional: number; missing: number }>;
  recentChecks: InfrastructureCheck[];
}

export interface AlertStats {
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}