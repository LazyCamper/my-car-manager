import { describe, it, expect } from 'vitest';
import {
  buildReservationIcsContent,
  buildReservationIcsFileName,
  parseReservationTime,
} from './calendarIcs';

describe('캘린더 .ics 생성 유틸리티 테스트 (calendarIcs)', () => {
  it('다양한 한국어 및 숫자 예약 시간 표현을 시·분으로 파싱한다', () => {
    expect(parseReservationTime('10:30')).toEqual({ hours: 10, minutes: 30 });
    expect(parseReservationTime('오후 2시')).toEqual({ hours: 14, minutes: 0 });
    expect(parseReservationTime('오후 2시 30분')).toEqual({
      hours: 14,
      minutes: 30,
    });
    expect(parseReservationTime('오전 9시 반')).toEqual({
      hours: 9,
      minutes: 30,
    });
    expect(parseReservationTime('오전 12:15')).toEqual({
      hours: 0,
      minutes: 15,
    });
    expect(parseReservationTime('오후 12시')).toEqual({
      hours: 12,
      minutes: 0,
    });
    expect(parseReservationTime('')).toBeNull();
    expect(parseReservationTime('오전 중 방문')).toBeNull();
  });

  it('예약 시간이 있는 경우 1시간 일정 및 1시간 전·하루 전 알람(VALARM)이 포함된 CRLF .ics를 생성한다', () => {
    const log = {
      id: 'res-1',
      vehicleId: 'v-1',
      status: 'reserved' as const,
      reservationTime: '오후 2시 30분',
      date: '2026.12.05',
      category: 'engine_oil' as const,
      title: '합성유 엔진오일 교체',
      shopName: '오토큐 성수점',
      cost: 135000,
      memo: '쿠폰 지참, 하부 점검 요청',
      attachmentIds: [],
      createdAt: '2026-11-27T00:00:00.000Z',
    };

    const ics = buildReservationIcsContent({
      log,
      vehicle: { name: '쏘렌토', plateNumber: '12가 3456' },
      now: new Date('2026-11-27T11:00:00.000Z'),
    });

    expect(buildReservationIcsFileName(log)).toBe(
      'car-maintenance-2026-12-05.ics',
    );
    expect(ics).toContain('\r\n');
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261205T143000\r\n');
    expect(ics).toContain('DTEND:20261205T153000\r\n');
    expect(ics).toContain('SUMMARY:[차량 정비] 쏘렌토 - 합성유 엔진오일 교체\r\n');
    expect(ics).toContain('LOCATION:오토큐 성수점\r\n');
    expect(ics).toContain('TRIGGER:-PT1H\r\n');
    expect(ics).toContain('TRIGGER:-P1D\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });

  it('예약 시간이 없는 경우 종일 일정(VALUE=DATE)과 당일·전날 오전 9시 알람을 생성한다', () => {
    const log = {
      id: 'res-allday',
      vehicleId: 'v-1',
      status: 'reserved' as const,
      date: '2026.12.31',
      category: 'tire' as const,
      title: '타이어 위치교환',
      cost: 0,
      attachmentIds: [],
      createdAt: '2026-11-27T00:00:00.000Z',
    };

    const ics = buildReservationIcsContent({ log });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101\r\n');
    expect(ics).toContain('TRIGGER:PT9H\r\n');
    expect(ics).toContain('TRIGGER:-PT15H\r\n');
  });
});
