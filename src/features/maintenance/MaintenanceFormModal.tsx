import React, { useEffect, useState } from 'react';
import { useRepositories } from '../../app/RepositoryContext';
import {
  MaintenanceCategory,
  MaintenanceLog,
  MaintenanceStatus,
} from '../../domain/models';
import {
  PhotoAttachmentField,
  PhotoDraftItem,
} from '../../shared/components/PhotoAttachmentField';
import { DateQuickAdjustButtons } from '../../shared/components/DateQuickAdjustButtons';
import {
  formatDateDot,
  parseDateString,
  useModalViewport,
} from '../../shared/utils';
import { getLogCategories, MAINTENANCE_CATEGORY_OPTIONS } from './constants';

export type MaintenanceFormSubmitData = Omit<
  MaintenanceLog,
  'id' | 'createdAt'
> & {
  id?: string;
};

export interface MaintenanceFormModalProps {
  isOpen: boolean;
  vehicleId: string;
  defaultMileage?: number;
  initialMode?: MaintenanceStatus;
  initialLog?: MaintenanceLog | null;
  onClose: () => void;
  onSubmit: (data: MaintenanceFormSubmitData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export const MaintenanceFormModal: React.FC<MaintenanceFormModalProps> = ({
  isOpen,
  vehicleId,
  defaultMileage = 0,
  initialMode = 'completed',
  initialLog,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const { attachmentRepo } = useRepositories();
  const isEditMode = Boolean(initialLog);

  const [formMode, setFormMode] = useState<MaintenanceStatus>('completed');
  const [reservationTime, setReservationTime] = useState('');
  const [date, setDate] = useState('');
  const [mileage, setMileage] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('engine_oil');
  const [selectedCategories, setSelectedCategories] = useState<
    MaintenanceCategory[]
  >(['engine_oil']);
  const [hasTouchedCategories, setHasTouchedCategories] = useState(false);
  const [customTitle, setCustomTitle] = useState('엔진오일 교체');
  const [cost, setCost] = useState('');
  const [shopName, setShopName] = useState('');
  const [memo, setMemo] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [nextDueMileage, setNextDueMileage] = useState('');
  const [photos, setPhotos] = useState<PhotoDraftItem[]>([]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sheetStyle, handleFieldFocusCapture } = useModalViewport(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const createdUrls: string[] = [];

    setErrorMessage(null);
    setIsConfirmingDelete(false);

    if (initialLog) {
      const logMode: MaintenanceStatus =
        initialLog.status === 'reserved' ? 'reserved' : 'completed';
      setFormMode(logMode);
      setReservationTime(initialLog.reservationTime ?? '');
      setDate(initialLog.date);
      setMileage(
        typeof initialLog.mileage === 'number'
          ? String(initialLog.mileage)
          : '',
      );
      setCategory(initialLog.category);
      setSelectedCategories(getLogCategories(initialLog));
      setHasTouchedCategories(true);
      setCustomTitle(initialLog.title);
      setCost(String(initialLog.cost));
      setShopName(initialLog.shopName ?? '');
      setMemo(initialLog.memo ?? '');
      setNextDueDate(initialLog.nextDueDate ?? '');
      setNextDueMileage(
        typeof initialLog.nextDueMileage === 'number'
          ? String(initialLog.nextDueMileage)
          : '',
      );

      if (initialLog.attachmentIds && initialLog.attachmentIds.length > 0) {
        void attachmentRepo
          .getByIds(initialLog.attachmentIds)
          .then((records) => {
            if (!isMounted) return;
            const drafts: PhotoDraftItem[] = records.map((rec) => {
              const previewUrl = URL.createObjectURL(rec.blob);
              createdUrls.push(previewUrl);
              return {
                key: `existing-${rec.id}`,
                existingAttachmentId: rec.id,
                blob: rec.blob,
                fileName: rec.fileName,
                previewUrl,
              };
            });
            setPhotos(drafts);
          });
      } else {
        setPhotos([]);
      }
    } else {
      const startMode: MaintenanceStatus = initialMode ?? 'completed';
      setFormMode(startMode);
      setReservationTime('');
      setDate(formatDateDot(new Date()));
      setMileage(
        startMode === 'completed' && defaultMileage > 0
          ? String(defaultMileage)
          : '',
      );
      setCategory('engine_oil');
      setSelectedCategories(['engine_oil']);
      setHasTouchedCategories(false);
      setCustomTitle('엔진오일 교체');
      setCost('');
      setShopName('');
      setMemo('');
      setNextDueDate('');
      setNextDueMileage('');
      setPhotos([]);
    }

    return () => {
      isMounted = false;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [isOpen, initialLog, initialMode, defaultMileage, attachmentRepo]);

  if (!isOpen) {
    return null;
  }

  const handleSwitchMode = (nextMode: MaintenanceStatus) => {
    if (nextMode === formMode) return;
    setErrorMessage(null);
    if (!isEditMode) {
      if (nextMode === 'reserved' && mileage === String(defaultMileage)) {
        setMileage('');
      } else if (
        nextMode === 'completed' &&
        mileage === '' &&
        defaultMileage > 0
      ) {
        setMileage(String(defaultMileage));
      }
    }
    setFormMode(nextMode);
  };

  const handleToggleExtraCategory = (targetCat: MaintenanceCategory) => {
    const option = MAINTENANCE_CATEGORY_OPTIONS.find(
      (item) => item.value === targetCat,
    );

    if (!hasTouchedCategories) {
      setHasTouchedCategories(true);
      setCategory(targetCat);
      setSelectedCategories([targetCat]);
      if (option && customTitle === '엔진오일 교체') {
        setCustomTitle(option.defaultTitle);
      }
      return;
    }

    setSelectedCategories((prev) => {
      const exists = prev.includes(targetCat);
      if (exists) {
        if (prev.length === 1) return prev; // 최소 1개 유지
        const next = prev.filter((c) => c !== targetCat);
        if (category === targetCat) {
          setCategory(next[0]);
        }
        return next;
      }
      return [...prev, targetCat];
    });
  };

  const submitForm = async (targetStatus: MaintenanceStatus) => {
    setErrorMessage(null);

    const trimmedDate = date.trim();
    if (!trimmedDate) {
      setErrorMessage(
        targetStatus === 'reserved'
          ? '예약 날짜를 입력해 주세요.'
          : '정비 날짜를 입력해 주세요.',
      );
      return;
    }

    let formattedDate: string;
    try {
      formattedDate = formatDateDot(parseDateString(trimmedDate));
    } catch {
      setErrorMessage('날짜는 YYYY.MM.DD 형식으로 올바르게 입력해 주세요.');
      return;
    }

    let finalMileage: number | undefined;
    if (mileage.trim() !== '') {
      const parsedMileage = Number(mileage);
      if (!Number.isFinite(parsedMileage) || parsedMileage < 0) {
        setErrorMessage('주행거리는 0 이상의 숫자로 입력해 주세요.');
        return;
      }
      finalMileage = Math.round(parsedMileage);
    }

    let finalCost = 0;
    if (cost.trim() !== '') {
      const parsedCost = Number(cost);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        setErrorMessage('비용은 0원 이상의 숫자로 입력해 주세요.');
        return;
      }
      finalCost = Math.round(parsedCost);
    }

    const option = MAINTENANCE_CATEGORY_OPTIONS.find(
      (item) => item.value === category,
    );
    const resolvedTitle = customTitle.trim() || option?.defaultTitle || '';
    if (!resolvedTitle) {
      setErrorMessage('정비 항목명을 입력해 주세요.');
      return;
    }

    let formattedNextDueDate: string | undefined;
    if (targetStatus === 'completed' && nextDueDate.trim()) {
      try {
        formattedNextDueDate = formatDateDot(
          parseDateString(nextDueDate.trim()),
        );
      } catch {
        setErrorMessage(
          '다음 정비 예정일은 YYYY.MM.DD 형식으로 입력해 주세요.',
        );
        return;
      }
    }

    let finalNextDueMileage: number | undefined;
    if (targetStatus === 'completed' && nextDueMileage.trim() !== '') {
      const parsedNextDueMileage = Number(nextDueMileage);
      if (!Number.isFinite(parsedNextDueMileage) || parsedNextDueMileage < 0) {
        setErrorMessage(
          '다음 정비 예정 주행거리는 0 이상의 숫자로 입력해 주세요.',
        );
        return;
      }
      finalNextDueMileage = Math.round(parsedNextDueMileage);
    }

    setIsSubmitting(true);
    const newlySavedIds: string[] = [];
    try {
      const originalIds = initialLog?.attachmentIds ?? [];
      const keptExistingIds = photos
        .map((p) => p.existingAttachmentId)
        .filter((id): id is string => Boolean(id));
      const removedIds = originalIds.filter(
        (id) => !keptExistingIds.includes(id),
      );

      const finalAttachmentIds: string[] = [];
      for (const item of photos) {
        if (item.existingAttachmentId) {
          finalAttachmentIds.push(item.existingAttachmentId);
        } else {
          const savedAtt = await attachmentRepo.save({
            parentType: 'maintenance',
            parentId: initialLog?.id ?? vehicleId,
            blob: item.blob,
            fileName: item.fileName,
          });
          newlySavedIds.push(savedAtt.id);
          finalAttachmentIds.push(savedAtt.id);
        }
      }

      const finalCategories =
        selectedCategories.length > 0 ? selectedCategories : [category];

      await onSubmit({
        id: initialLog?.id,
        vehicleId,
        status: targetStatus,
        reservationTime:
          targetStatus === 'reserved'
            ? reservationTime.trim() || undefined
            : undefined,
        date: formattedDate,
        mileage: finalMileage,
        category: finalCategories[0],
        categories: finalCategories,
        title: resolvedTitle,
        cost: finalCost,
        shopName: shopName.trim() || undefined,
        memo: memo.trim() || undefined,
        nextDueDate: formattedNextDueDate,
        nextDueMileage: finalNextDueMileage,
        isDueCompleted: initialLog?.isDueCompleted ?? false,
        attachmentIds: finalAttachmentIds,
      });

      // 본문 저장이 성공한 뒤에만 제거된 기존 사진을 삭제하여 실패 시 기존 데이터 유실 방지
      if (removedIds.length > 0) {
        await attachmentRepo.deleteMany(removedIds);
      }

      onClose();
    } catch (err) {
      if (newlySavedIds.length > 0) {
        await attachmentRepo.deleteMany(newlySavedIds).catch(() => undefined);
      }
      setErrorMessage(
        err instanceof Error
          ? err.message
          : '정비 내역 저장 중 오류가 발생했습니다.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(formMode);
  };

  const handleConfirmDelete = async () => {
    if (!initialLog || !onDelete) return;
    setIsSubmitting(true);
    try {
      await onDelete(initialLog.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveCurrentMileageBase = (): number => {
    const entered = Number(mileage);
    if (mileage.trim() !== '' && Number.isFinite(entered) && entered >= 0) {
      return Math.round(entered);
    }
    return Math.max(0, Math.round(defaultMileage));
  };

  const handleSetCurrentDueMileage = () => {
    setNextDueMileage(String(resolveCurrentMileageBase()));
  };

  const handleAddDueMileage = (delta: number) => {
    const existing = Number(nextDueMileage);
    const base =
      nextDueMileage.trim() !== '' &&
      Number.isFinite(existing) &&
      existing >= 0
        ? Math.round(existing)
        : resolveCurrentMileageBase();
    setNextDueMileage(String(base + delta));
  };

  const modalHeading = isEditMode
    ? initialLog?.status === 'reserved'
      ? '정비 예약 상세 · 수정'
      : '정비 내역 상세 · 수정'
    : '정비 내역 등록';

  const submitButtonLabel = isEditMode
    ? initialLog?.status === 'reserved' && formMode === 'completed'
      ? '정비 완료로 저장'
      : '수정 저장'
    : formMode === 'reserved'
      ? '예약 등록'
      : '정비 등록';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-modal-title"
    >
      <div
        className="modal-sheet"
        style={sheetStyle}
        onFocusCapture={handleFieldFocusCapture}
      >
        <header className="modal-header">
          <h2 id="maintenance-modal-title" className="modal-title">
            {modalHeading}
          </h2>
          <button
            type="button"
            className="btn-icon touch-target"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="vehicle-form" noValidate>
          <div
            className="maint-mode-tabs"
            role="tablist"
            aria-label="정비 등록 유형"
          >
            <button
              type="button"
              role="tab"
              aria-selected={formMode === 'completed'}
              className={`maint-mode-tab touch-target${formMode === 'completed' ? ' active' : ''}`}
              onClick={() => handleSwitchMode('completed')}
            >
              정비 완료 기록
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={formMode === 'reserved'}
              className={`maint-mode-tab touch-target${formMode === 'reserved' ? ' active' : ''}`}
              onClick={() => handleSwitchMode('reserved')}
            >
              정비 예약 등록
            </button>
          </div>

          {isEditMode &&
            initialLog?.status === 'reserved' &&
            formMode === 'reserved' && (
              <div
                className="reservation-convert-banner"
                data-testid="modal-convert-banner"
              >
                <div className="reservation-convert-info">
                  <strong>정비를 마치셨나요?</strong>
                  <span>입력된 정보로 즉시 완료 내역에 반영합니다.</span>
                </div>
                <button
                  type="button"
                  className="btn btn-chip-primary touch-target"
                  onClick={() => void submitForm('completed')}
                  disabled={isSubmitting}
                >
                  ✓ 정비 완료로 전환
                </button>
              </div>
            )}

          {errorMessage && (
            <p className="form-error-banner" role="alert">
              {errorMessage}
            </p>
          )}

          {formMode === 'reserved' ? (
            <div className="form-row-2col">
              <div className="form-field">
                <label htmlFor="maint-date" className="form-label">
                  예약 날짜 <span className="required-mark">*</span>
                </label>
                <input
                  id="maint-date"
                  type="text"
                  inputMode="numeric"
                  className="form-input touch-target"
                  placeholder="예: 2026.12.05 또는 26.12.5"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="maint-reservation-time" className="form-label">
                  예약 시간 · 선택
                </label>
                <input
                  id="maint-reservation-time"
                  type="text"
                  className="form-input touch-target"
                  placeholder="예: 10:30, 오후 2시"
                  value={reservationTime}
                  onChange={(e) => setReservationTime(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="form-row-2col">
              <div className="form-field">
                <label htmlFor="maint-date" className="form-label">
                  정비 날짜 <span className="required-mark">*</span>
                </label>
                <input
                  id="maint-date"
                  type="text"
                  inputMode="numeric"
                  className="form-input touch-target"
                  placeholder="예: 2026.05.12 또는 26.5.12"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="maint-mileage" className="form-label">
                  주행거리 (km) · 선택
                </label>
                <input
                  id="maint-mileage"
                  type="number"
                  inputMode="numeric"
                  className="form-input touch-target"
                  placeholder="미입력 시 생략"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="form-field">
            <span className="form-label">
              정비 항목 분류 (복수 선택 가능){' '}
              <span className="required-mark">*</span>
            </span>
            <div
              className="multi-category-chip-group"
              role="group"
              aria-label="정비 항목 분류"
            >
              {MAINTENANCE_CATEGORY_OPTIONS.map((opt) => {
                const isSelected = selectedCategories.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`filter-chip${isSelected ? ' active' : ''}`}
                    onClick={() => handleToggleExtraCategory(opt.value)}
                    aria-pressed={isSelected}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="maint-title" className="form-label">
              정비 항목 상세명 (직접 입력 가능){' '}
              <span className="required-mark">*</span>
            </label>
            <input
              id="maint-title"
              type="text"
              className="form-input touch-target"
              placeholder="예: 합성유 엔진오일 교체, 와이퍼 교체"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-row-2col">
            <div className="form-field">
              <label htmlFor="maint-cost" className="form-label">
                {formMode === 'reserved'
                  ? '예상 비용 (원) · 미입력 시 0원'
                  : '비용 (원) · 미입력 시 0원'}
              </label>
              <input
                id="maint-cost"
                type="number"
                inputMode="numeric"
                className="form-input touch-target"
                placeholder={
                  formMode === 'reserved'
                    ? '미정 시 비워두세요'
                    : '보증/보험 수리 시 비워두세요'
                }
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="maint-shop" className="form-label">
                {formMode === 'reserved' ? '예약 정비소' : '정비소'}
              </label>
              <input
                id="maint-shop"
                type="text"
                className="form-input touch-target"
                placeholder="예: 블루핸즈 강남점, 오토큐 성수점"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
            </div>
          </div>

          {formMode === 'reserved' ? (
            <div className="form-field">
              <label htmlFor="maint-mileage" className="form-label">
                주행거리 (km) · 선택
              </label>
              <input
                id="maint-mileage"
                type="number"
                inputMode="numeric"
                className="form-input touch-target"
                placeholder="예약 시점 예상 주행거리 (미입력 가능 · 현재 주행거리에 미반영)"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
              />
            </div>
          ) : (
            <div className="form-row-2col">
              <div className="form-field">
                <label htmlFor="maint-next-due" className="form-label">
                  다음 정비 예정일 (선택)
                </label>
                <input
                  id="maint-next-due"
                  type="text"
                  inputMode="numeric"
                  className="form-input touch-target"
                  placeholder="예: 2027.03.15"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                />
                <DateQuickAdjustButtons
                  value={nextDueDate}
                  onChange={setNextDueDate}
                  fieldLabel="다음 정비 예정일"
                />
              </div>

              <div className="form-field">
                <label htmlFor="maint-next-due-mileage" className="form-label">
                  다음 목표 거리 (km) · 선택
                </label>
                <input
                  id="maint-next-due-mileage"
                  type="number"
                  inputMode="numeric"
                  className="form-input touch-target"
                  placeholder="예: 26000"
                  value={nextDueMileage}
                  onChange={(e) => setNextDueMileage(e.target.value)}
                />
                <div className="date-quick-buttons">
                  <button
                    type="button"
                    className="date-quick-btn"
                    onClick={handleSetCurrentDueMileage}
                    title="현재 주행거리로 설정"
                  >
                    현재
                  </button>
                  <button
                    type="button"
                    className="date-quick-btn"
                    onClick={() => handleAddDueMileage(1000)}
                    title="다음 목표 거리 1,000km 추가"
                  >
                    +1천
                  </button>
                  <button
                    type="button"
                    className="date-quick-btn"
                    onClick={() => handleAddDueMileage(10000)}
                    title="다음 목표 거리 10,000km 추가"
                  >
                    +1만
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="maint-memo" className="form-label">
              메모
            </label>
            <textarea
              id="maint-memo"
              rows={2}
              className="form-input"
              placeholder={
                formMode === 'reserved'
                  ? '예약 접수번호, 요청 정비 사항 등을 기록하세요'
                  : '교체 부품 브랜드, 특이사항 등을 기록하세요'
              }
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <PhotoAttachmentField photos={photos} onChange={setPhotos} />

          {isEditMode && onDelete && isConfirmingDelete ? (
            <div
              className="delete-confirm-box"
              role="alertdialog"
              aria-label="정비 내역 삭제 확인"
            >
              <p className="delete-confirm-text">
                이 정비 내역을 정말 삭제하시겠습니까?
              </p>
              <div className="delete-confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary touch-target"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={isSubmitting}
                >
                  삭제 취소
                </button>
                <button
                  type="button"
                  className="btn btn-danger touch-target"
                  onClick={handleConfirmDelete}
                  disabled={isSubmitting}
                >
                  삭제 확인
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              {isEditMode && onDelete && (
                <button
                  type="button"
                  className="btn btn-danger-outline touch-target"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={isSubmitting}
                >
                  삭제
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary touch-target"
                onClick={onClose}
                disabled={isSubmitting}
              >
                취소
              </button>
              <button
                type="submit"
                className="btn btn-primary touch-target"
                disabled={isSubmitting}
              >
                {submitButtonLabel}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
