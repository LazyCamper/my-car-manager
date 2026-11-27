import { MaintenanceLog, Vehicle } from '../../domain/models';
import {
  formatCurrency,
  formatDateDot,
  formatMileage,
  parseDateString,
} from '../../shared/utils';
import { getCategoryLabel, getLogCategories } from './constants';

export interface ParsedReservationTime {
  hours: number;
  minutes: number;
}

/**
 * '10:30', '14:00', '오후 2시', '오후 2시 30분', '오전 9시 반', '2:30 PM' 등
 * 다양한 시간 문자열에서 시(0~23)·분(0~59)을 추출합니다.
 * 해석할 수 없는 자유 텍스트(예: '오전 중')이거나 비어 있으면 null을 반환합니다.
 */
export function parseReservationTime(
  rawTime?: string,
): ParsedReservationTime | null {
  if (!rawTime) return null;
  const trimmed = rawTime.trim();
  if (!trimmed) return null;

  const isPm = /(?:오후|저녁|밤|pm)/i.test(trimmed);
  const isAm = /(?:오전|아침|새벽|am)/i.test(trimmed);

  // 1) HH:MM 형식 (예: '10:30', '오후 2:30', '2:30 PM')
  const colonMatch = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(trimmed);
  if (colonMatch) {
    let hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    if (isPm && hours >= 1 && hours <= 11) {
      hours += 12;
    } else if (isAm && hours === 12) {
      hours = 0;
    }
    return { hours, minutes };
  }

  // 2) 한국어 'N시 (M분 | 반)' 형식 (예: '오후 2시', '오후 2시 30분', '10시 반')
  const koreanHourMatch = /(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분?|반))?/.exec(
    trimmed,
  );
  if (koreanHourMatch) {
    let hours = Number(koreanHourMatch[1]);
    const hasHalf = /시\s*반/.test(trimmed);
    const minutes = hasHalf
      ? 30
      : koreanHourMatch[2]
        ? Number(koreanHourMatch[2])
        : 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    if (isPm && hours >= 1 && hours <= 11) {
      hours += 12;
    } else if (isAm && hours === 12) {
      hours = 0;
    }
    return { hours, minutes };
  }

  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIcsDateOnly(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function formatIcsLocalDateTime(date: Date): string {
  return `${formatIcsDateOnly(date)}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

function formatIcsUtcTimestamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface BuildReservationIcsParams {
  log: MaintenanceLog;
  vehicle?: Pick<Vehicle, 'name' | 'plateNumber'>;
  now?: Date;
}

export function buildReservationIcsFileName(log: MaintenanceLog): string {
  const safeDate = formatDateDot(log.date).replace(/\./g, '-');
  return `car-maintenance-${safeDate}.ics`;
}

/**
 * 아이폰(Apple 캘린더) 및 갤럭시(삼성/Google 캘린더) 표준 RFC 5545 .ics 문자열을 생성합니다.
 * - 예약 시간이 지정된 경우: 해당 시각부터 1시간 일정 + 1일 전 & 1시간 전 알람(VALARM) 등록
 * - 예약 시간이 없는 경우: 종일 일정 + 하루 전 오전 9시 & 당일 오전 9시 알람(VALARM) 등록
 */
export function buildReservationIcsContent({
  log,
  vehicle,
  now = new Date(),
}: BuildReservationIcsParams): string {
  const baseDate = parseDateString(log.date);
  const parsedTime = parseReservationTime(log.reservationTime);

  const summaryPrefix = vehicle?.name ? `[차량 정비] ${vehicle.name}` : '[차량 정비]';
  const summary = `${summaryPrefix} - ${log.title}`;

  const categoryLabels = getLogCategories(log)
    .map((cat) => getCategoryLabel(cat))
    .join(', ');

  const descLines: string[] = [];
  if (vehicle) {
    descLines.push(`차량: ${vehicle.name} (${vehicle.plateNumber})`);
  }
  descLines.push(`정비 항목: ${log.title} (${categoryLabels})`);
  descLines.push(
    `예약 일시: ${formatDateDot(baseDate)}${log.reservationTime ? ` ${log.reservationTime}` : ''}`,
  );
  if (log.shopName) {
    descLines.push(`정비소: ${log.shopName}`);
  }
  if (log.cost > 0) {
    descLines.push(`예상 비용: ${formatCurrency(log.cost)}`);
  }
  if (typeof log.mileage === 'number') {
    descLines.push(`예상 주행거리: ${formatMileage(log.mileage)}`);
  }
  if (log.memo) {
    descLines.push(`메모: ${log.memo}`);
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//My Car Manager//Maintenance Reservation//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:maint-res-${log.id}@my-car-manager.local`,
    `DTSTAMP:${formatIcsUtcTimestamp(now)}`,
  ];

  if (parsedTime) {
    const startDateTime = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      parsedTime.hours,
      parsedTime.minutes,
      0,
    );
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    lines.push(`DTSTART:${formatIcsLocalDateTime(startDateTime)}`);
    lines.push(`DTEND:${formatIcsLocalDateTime(endDateTime)}`);
  } else {
    const nextDay = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + 1,
    );
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(baseDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(nextDay)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(summary)}`);
  if (log.shopName) {
    lines.push(`LOCATION:${escapeIcsText(log.shopName)}`);
  }
  lines.push(`DESCRIPTION:${escapeIcsText(descLines.join('\n'))}`);

  if (parsedTime) {
    // 1시간 전 알람
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`${summary} (1시간 전 알림)`)}`,
      'END:VALARM',
    );
    // 하루 전 알람
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`${summary} (하루 전 알림)`)}`,
      'END:VALARM',
    );
  } else {
    // 종일 일정: 당일 오전 9시 알람 + 전날 오전 9시 알람
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:PT9H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`${summary} (오늘 정비 예약일)`)}`,
      'END:VALARM',
    );
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT15H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`${summary} (내일 정비 예약일)`)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return `${lines.join('\r\n')}\r\n`;
}

export function triggerCalendarIcsDownload(
  icsContent: string,
  fileName: string,
): void {
  const blob = new Blob([icsContent], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
