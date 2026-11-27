export const MAX_ATTACHMENTS_PER_ITEM = 5;
export const BACKUP_SCHEMA_VERSION = 1;
export const LAST_BACKUP_DATE_META_KEY = 'lastBackupDate';

export interface Vehicle {
  id: string;
  name: string; // 이름(별칭)
  plateNumber: string; // 번호판
  manufacturerModel: string; // 제조사/모델
  modelYear: number; // 연식
  currentMileage: number; // 현재 주행거리 (km)
  mileageUpdatedAt?: string; // 주행거리 기준일 (YYYY.MM.DD)
  registrationDate?: string; // 최초 등록일 (YYYY.MM.DD)
  purchaseDate?: string; // 구매/인수일 (YYYY.MM.DD)
  purchaseMileage?: number; // 구매/인수 당시 주행거리 (km)
  purchasePrice?: number; // 실구매가 (원)
  vin?: string; // 차대번호
  engineSpec?: string; // 엔진 제원
  performanceSpec?: string; // 출력/토크/제로백 등 성능 제원
  fuelSpec?: string; // 연료탱크 및 복합연비
  transmission?: string; // 변속기
  tireSize?: string; // 타이어 규격 및 권장 공기압
  dimensionSpec?: string; // 전장/전폭/전고/축거/윤거/공차중량
  consumablesSpec?: string; // 에어컨필터 등 소모품 사이즈 규격
  colorSpec?: string; // 외장 색상 및 도장 컬러코드
  vehiclePrice?: number; // 출고 차량가 (원)
  options?: string; // 장착 옵션 (블랙박스, 유리막, PPF, 하이패스 등)
  tinting?: string; // 틴팅 시공 내역
  memo?: string; // 차량 관리 메모 (내비게이션 계정, 쿠폰 잔여 등)
  backgroundImage?: string; // 차량 카드 배경 (프리셋 키 또는 data:image/... Data URL)
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type VehicleInput = {
  id?: string;
  name: string;
  plateNumber: string;
  manufacturerModel: string;
  modelYear: number;
  currentMileage: number;
  mileageUpdatedAt?: string;
  registrationDate?: string;
  purchaseDate?: string;
  purchaseMileage?: number;
  purchasePrice?: number;
  vin?: string;
  engineSpec?: string;
  performanceSpec?: string;
  fuelSpec?: string;
  transmission?: string;
  tireSize?: string;
  dimensionSpec?: string;
  consumablesSpec?: string;
  colorSpec?: string;
  vehiclePrice?: number;
  options?: string;
  tinting?: string;
  memo?: string;
  backgroundImage?: string;
  displayOrder?: number;
};

export type MaintenanceCategory =
  | 'engine_oil'
  | 'tire'
  | 'brake'
  | 'battery'
  | 'filter'
  | 'repair'
  | 'accident_repair'
  | 'other';

export type MaintenanceStatus = 'completed' | 'reserved';

export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  status?: MaintenanceStatus; // 미지정 시 'completed'로 간주 (기존 데이터·백업 v1 호환)
  reservationTime?: string; // 예약 시간 (예: '10:30', 선택)
  date: string; // YYYY.MM.DD (정비 완료일 또는 예약일)
  mileage?: number; // 주행거리 미기재(사고 수리·예약 등) 허용
  category: MaintenanceCategory;
  categories?: MaintenanceCategory[]; // 복수 카테고리 태그 지원
  title: string;
  shopName?: string;
  cost: number;
  nextDueDate?: string; // YYYY.MM.DD
  nextDueMileage?: number;
  isDueCompleted?: boolean;
  memo?: string;
  attachmentIds: string[];
  createdAt: string;
}

export interface Inspection {
  id: string;
  vehicleId: string;
  inspectionDate: string; // YYYY.MM.DD
  expiryDate: string; // YYYY.MM.DD
  cost: number;
  stationName?: string;
  memo?: string;
  attachmentIds: string[];
  isCurrent: boolean;
}

export interface Insurance {
  id: string;
  vehicleId: string;
  companyName: string;
  productName?: string; // 상품명
  emergencyPhone?: string; // 연락처
  startDate: string; // YYYY.MM.DD
  endDate: string; // YYYY.MM.DD
  premiumCost: number;
  memo?: string; // 담보 메모
  attachmentIds: string[];
  isCurrent: boolean;
}

export type AttachmentParentType = 'maintenance' | 'inspection' | 'insurance';

export interface Attachment {
  id: string;
  parentType: AttachmentParentType;
  parentId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  size: number;
  createdAt: string;
}

export interface SerializedAttachment {
  id: string;
  parentType: AttachmentParentType;
  parentId: string;
  base64Data: string;
  mimeType: string;
  fileName: string;
  size: number;
  createdAt: string;
}

export interface BackupDataSnapshot {
  vehicles: Vehicle[];
  maintenanceLogs: MaintenanceLog[];
  inspections: Inspection[];
  insurances: Insurance[];
  attachments: Attachment[];
}

export interface BackupFilePayload {
  schemaVersion: number;
  exportedAt: string;
  data: {
    vehicles: Vehicle[];
    maintenanceLogs: MaintenanceLog[];
    inspections: Inspection[];
    insurances: Insurance[];
    attachments: SerializedAttachment[];
  };
}

export type DdayUrgencyStatus = 'overdue' | 'urgent' | 'normal';

export type UpcomingDueType = 'inspection' | 'insurance' | 'maintenance';

export interface UpcomingDueItem {
  id: string;
  type: UpcomingDueType;
  categoryLabel: string;
  title: string;
  dueDate: string; // YYYY.MM.DD
  daysRemaining: number;
  status: DdayUrgencyStatus;
  badgeText: string;
  subInfo?: string;
}
