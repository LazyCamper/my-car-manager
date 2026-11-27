import React from 'react';
import { Link } from 'react-router-dom';
import { UpcomingDueItem } from '../../domain/models';

export interface UpcomingDueSectionProps {
  items: UpcomingDueItem[];
  isLoading?: boolean;
}

export const UpcomingDueSection: React.FC<UpcomingDueSectionProps> = ({
  items,
  isLoading = false,
}) => {
  return (
    <section
      className="dashboard-section"
      aria-labelledby="upcoming-due-heading"
    >
      <div className="section-header-row">
        <h2 id="upcoming-due-heading" className="section-title">
          다가오는 만기
        </h2>
        <span className="section-count-badge">{items.length}건</span>
      </div>

      {isLoading ? (
        <div className="empty-state-box">
          <p className="empty-state-desc">만기 정보를 불러오는 중입니다...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state-box" data-testid="empty-upcoming-due">
          <p className="empty-state-title">등록된 만기·예정 일정이 없습니다</p>
          <p className="empty-state-desc">
            자동차 검사일, 보험 만기일, 다음 정비 예정일을 등록하면 가까운 순으로 D-day를 알려드려요.
          </p>
          <div className="empty-state-links">
            <Link to="/compliance" className="btn btn-secondary touch-target">
              검사·보험 등록하러 가기
            </Link>
          </div>
        </div>
      ) : (
        <ul className="due-card-list" aria-label="다가오는 만기 목록">
          {items.map((item) => {
            const targetPath =
              item.type === 'maintenance' ? '/maintenance' : '/compliance';
            return (
              <li
                key={item.id}
                className={`due-card due-card-${item.status}`}
                data-status={item.status}
              >
                <Link to={targetPath} className="due-card-link">
                  <div className="due-card-info">
                    <span className="due-category-tag">
                      {item.categoryLabel}
                    </span>
                    <strong className="due-item-title">{item.title}</strong>
                    <span className="due-item-date">
                      {item.categoryLabel === '정비 예약' ? '예약일' : '만기일'}:{' '}
                      {item.dueDate}
                      {item.subInfo ? ` · ${item.subInfo}` : ''}
                    </span>
                  </div>

                  <div className="due-card-badge-wrap">
                    <span
                      className={`dday-badge dday-badge-${item.status}`}
                      aria-label={`${item.categoryLabel} ${item.badgeText}`}
                    >
                      {item.badgeText}
                    </span>
                    {item.status === 'urgent' && item.daysRemaining >= 0 && (
                      <span className="dday-urgent-caption">30일 이내 임박</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
