import {
  Inspection,
  Insurance,
  MaintenanceLog,
  UpcomingDueItem,
} from '../models';
import { calculateDday, formatDateDot, formatMileage } from '../../shared/utils';

export interface BuildUpcomingDueParams {
  inspection?: Inspection;
  insurance?: Insurance;
  maintenanceLogs?: MaintenanceLog[];
  baseDate?: Date | string;
}

/**
 * 자동차 검사 만료일, 보험 만기일, 미완료 정비 예정일을 통합하여
 * 남은 일수가 적은 순(임박순, 만기 지난 항목이 최상단)으로 정렬된 목록을 반환합니다.
 */
export function buildUpcomingDueItems({
  inspection,
  insurance,
  maintenanceLogs = [],
  baseDate = new Date(),
}: BuildUpcomingDueParams): UpcomingDueItem[] {
  const items: UpcomingDueItem[] = [];

  if (inspection && inspection.expiryDate) {
    const dday = calculateDday(inspection.expiryDate, baseDate);
    items.push({
      id: `inspection-${inspection.id}`,
      type: 'inspection',
      categoryLabel: '자동차 검사',
      title: inspection.stationName
        ? `자동차 정기/종합검사 (${inspection.stationName})`
        : '자동차 정기/종합검사 만기',
      dueDate: formatDateDot(inspection.expiryDate),
      daysRemaining: dday.daysRemaining,
      status: dday.status,
      badgeText: dday.badgeText,
    });
  }

  if (insurance && insurance.endDate) {
    const dday = calculateDday(insurance.endDate, baseDate);
    const subParts: string[] = [];
    if (insurance.productName) {
      subParts.push(insurance.productName);
    }
    if (insurance.emergencyPhone) {
      subParts.push(`긴급출동 ${insurance.emergencyPhone}`);
    }
    items.push({
      id: `insurance-${insurance.id}`,
      type: 'insurance',
      categoryLabel: '자동차 보험',
      title: `${insurance.companyName} 자동차 보험 만기`,
      dueDate: formatDateDot(insurance.endDate),
      daysRemaining: dday.daysRemaining,
      status: dday.status,
      badgeText: dday.badgeText,
      subInfo: subParts.length > 0 ? subParts.join(' · ') : undefined,
    });
  }

  for (const log of maintenanceLogs) {
    if (log.status === 'reserved') {
      const dday = calculateDday(log.date, baseDate);
      const subParts: string[] = [];
      if (log.reservationTime?.trim()) {
        subParts.push(log.reservationTime.trim());
      }
      if (log.shopName?.trim()) {
        subParts.push(log.shopName.trim());
      }
      items.push({
        id: `maintenance-reserved-${log.id}`,
        type: 'maintenance',
        categoryLabel: '정비 예약',
        title: log.title.endsWith('예약') ? log.title : `${log.title} 예약`,
        dueDate: formatDateDot(log.date),
        daysRemaining: dday.daysRemaining,
        status: dday.status,
        badgeText: dday.daysRemaining < 0 ? '일정 지남' : dday.badgeText,
        subInfo: subParts.length > 0 ? subParts.join(' · ') : undefined,
      });
      continue;
    }

    if (!log.nextDueDate || log.isDueCompleted) {
      continue;
    }
    const dday = calculateDday(log.nextDueDate, baseDate);
    items.push({
      id: `maintenance-${log.id}`,
      type: 'maintenance',
      categoryLabel: '정비 예정',
      title: `${log.title} 예정`,
      dueDate: formatDateDot(log.nextDueDate),
      daysRemaining: dday.daysRemaining,
      status: dday.status,
      badgeText: dday.badgeText,
      subInfo:
        typeof log.nextDueMileage === 'number'
          ? `목표 주행거리 ${formatMileage(log.nextDueMileage)}`
          : undefined,
    });
  }

  return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
}
