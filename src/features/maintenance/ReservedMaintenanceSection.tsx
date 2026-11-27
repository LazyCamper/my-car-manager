import React from 'react';
import { MaintenanceLog } from '../../domain/models';
import { AttachmentThumbnailStrip } from '../../shared/components/AttachmentThumbnailStrip';
import {
  calculateDday,
  formatCurrency,
  formatMileage,
} from '../../shared/utils';
import { getCategoryLabel, getLogCategories } from './constants';

export interface ReservedMaintenanceSectionProps {
  reservedLogs: MaintenanceLog[];
  onSelectLog: (log: MaintenanceLog) => void;
  onQuickComplete: (log: MaintenanceLog) => void;
  onOpenAddReservation: () => void;
}

export const ReservedMaintenanceSection: React.FC<
  ReservedMaintenanceSectionProps
> = ({
  reservedLogs,
  onSelectLog,
  onQuickComplete,
  onOpenAddReservation,
}) => {
  if (reservedLogs.length === 0) {
    return null;
  }

  return (
    <section
      className="reserved-maint-section"
      aria-labelledby="reserved-maint-heading"
      data-testid="reserved-maintenance-section"
    >
      <div className="section-header-row">
        <div className="reserved-section-title-group">
          <h2 id="reserved-maint-heading" className="section-title">
            예약된 정비 일정
          </h2>
          <span className="section-count-badge">{reservedLogs.length}건</span>
        </div>
        <button
          type="button"
          className="btn btn-chip-primary"
          onClick={onOpenAddReservation}
        >
          + 예약 추가
        </button>
      </div>

      <div className="reserved-maint-list">
        {reservedLogs.map((log) => {
          const dday = calculateDday(log.date);
          const badgeText =
            dday.daysRemaining < 0 ? '일정 지남' : dday.badgeText;
          const logCategories = getLogCategories(log);
          const subMetaParts = [
            log.shopName,
            log.cost > 0 ? `예상 ${formatCurrency(log.cost)}` : null,
            typeof log.mileage === 'number'
              ? `주행거리 ${formatMileage(log.mileage)}`
              : null,
          ].filter(Boolean);

          return (
            <article
              key={log.id}
              className={`reserved-maint-card reserved-maint-card--${dday.status}`}
              data-status={dday.status}
              data-testid={`reserved-card-${log.id}`}
            >
              <button
                type="button"
                className="reserved-maint-card-body-btn"
                onClick={() => onSelectLog(log)}
              >
                <div className="reserved-maint-top">
                  <div className="timeline-date-group">
                    <span className="reserved-date-pill">
                      📅 {log.date}
                      {log.reservationTime ? ` · ${log.reservationTime}` : ''}
                    </span>
                    {logCategories.map((cat) => (
                      <span
                        key={cat}
                        className={`timeline-category-badge timeline-category-badge--${cat}`}
                      >
                        {getCategoryLabel(cat)}
                      </span>
                    ))}
                  </div>
                  <span
                    className={`dday-badge dday-badge-${dday.status}`}
                    aria-label={`정비 예약 ${badgeText}`}
                  >
                    {badgeText}
                  </span>
                </div>

                <div className="timeline-card-body">
                  <strong className="timeline-title">{log.title}</strong>
                  {subMetaParts.length > 0 && (
                    <span className="timeline-submeta">
                      {subMetaParts.join(' · ')}
                    </span>
                  )}
                  {log.memo && <p className="timeline-memo">{log.memo}</p>}
                </div>
              </button>

              {log.attachmentIds && log.attachmentIds.length > 0 && (
                <AttachmentThumbnailStrip attachmentIds={log.attachmentIds} />
              )}

              <div className="reserved-maint-actions">
                <button
                  type="button"
                  className="btn btn-chip"
                  onClick={() => onSelectLog(log)}
                >
                  상세·수정
                </button>
                <button
                  type="button"
                  className="btn btn-chip-primary"
                  onClick={() => onQuickComplete(log)}
                >
                  ✓ 완료 전환
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
