import { MaintenanceCategory, MaintenanceLog } from '../../domain/models';

export interface MaintenanceCategoryOption {
  value: MaintenanceCategory;
  label: string;
  defaultTitle: string;
}

export const MAINTENANCE_CATEGORY_OPTIONS: MaintenanceCategoryOption[] = [
  { value: 'engine_oil', label: '엔진오일', defaultTitle: '엔진오일 교체' },
  { value: 'tire', label: '타이어', defaultTitle: '타이어 점검/교체' },
  { value: 'brake', label: '브레이크', defaultTitle: '브레이크 패드/오일 정비' },
  { value: 'battery', label: '배터리', defaultTitle: '배터리 교체' },
  { value: 'filter', label: '에어컨·필터', defaultTitle: '에어컨 필터 교체' },
  { value: 'repair', label: '수리·보증', defaultTitle: '부품 수리/교환' },
  { value: 'accident_repair', label: '사고·외판', defaultTitle: '외판/사고 수리' },
  { value: 'other', label: '기타', defaultTitle: '' },
];

function normalizeCategory(raw: string): MaintenanceCategory {
  if (raw === 'camper_as') return 'other';
  const valid = MAINTENANCE_CATEGORY_OPTIONS.some((c) => c.value === raw);
  return valid ? (raw as MaintenanceCategory) : 'other';
}

export function getCategoryLabel(category: MaintenanceCategory): string {
  const normalized = normalizeCategory(category);
  const found = MAINTENANCE_CATEGORY_OPTIONS.find((c) => c.value === normalized);
  return found ? found.label : '기타';
}

export function getLogCategories(log: MaintenanceLog): MaintenanceCategory[] {
  if (Array.isArray(log.categories) && log.categories.length > 0) {
    return Array.from(new Set(log.categories.map((c) => normalizeCategory(c))));
  }
  return [normalizeCategory(log.category)];
}

export function isReservedMaintenance(log: MaintenanceLog): boolean {
  return log.status === 'reserved';
}

export function calculateTotalMaintenanceCost(logs: MaintenanceLog[]): number {
  return logs.reduce((sum, log) => {
    if (isReservedMaintenance(log)) return sum;
    return sum + (Number.isFinite(log.cost) ? log.cost : 0);
  }, 0);
}
