import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveVehicle } from '../app/ActiveVehicleContext';
import { useRepositories } from '../app/RepositoryContext';
import { MaintenanceLog, MaintenanceStatus } from '../domain/models';
import {
  calculateTotalMaintenanceCost,
  CategoryFilterValue,
  isReservedMaintenance,
  MaintenanceFormModal,
  MaintenanceFormSubmitData,
  MaintenanceTimeline,
  ReservedMaintenanceSection,
} from '../features/maintenance';
import { formatCurrency } from '../shared/utils';

export const MaintenancePage: React.FC = () => {
  const {
    vehicles,
    activeVehicle,
    isLoading: isVehicleLoading,
    selectVehicle,
    saveVehicle,
  } = useActiveVehicle();
  const { maintenanceRepo } = useRepositories();

  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilterValue>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialMode, setModalInitialMode] =
    useState<MaintenanceStatus>('completed');
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);

  const loadLogs = useCallback(
    async (vehicleId: string) => {
      const data = await maintenanceRepo.getByVehicle(vehicleId);
      setLogs(data);
    },
    [maintenanceRepo],
  );

  useEffect(() => {
    if (!activeVehicle) {
      setLogs([]);
      return;
    }
    void loadLogs(activeVehicle.id);
  }, [activeVehicle, loadLogs]);

  const reservedLogs = useMemo(
    () =>
      logs
        .filter((log) => isReservedMaintenance(log))
        .sort((a, b) => {
          const dateCmp = a.date.localeCompare(b.date);
          if (dateCmp !== 0) return dateCmp;
          const timeCmp = (a.reservationTime ?? '').localeCompare(
            b.reservationTime ?? '',
          );
          if (timeCmp !== 0) return timeCmp;
          return a.createdAt.localeCompare(b.createdAt);
        }),
    [logs],
  );

  const completedLogs = useMemo(
    () =>
      logs
        .filter((log) => !isReservedMaintenance(log))
        .sort((a, b) => {
          const dateCmp = b.date.localeCompare(a.date);
          if (dateCmp !== 0) return dateCmp;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [logs],
  );

  const totalCost = useMemo(() => calculateTotalMaintenanceCost(logs), [logs]);

  const handleOpenAddModal = (mode: MaintenanceStatus = 'completed') => {
    setEditingLog(null);
    setModalInitialMode(mode);
    setIsModalOpen(true);
  };

  const handleSelectLog = (log: MaintenanceLog) => {
    setEditingLog(log);
    setModalInitialMode(log.status === 'reserved' ? 'reserved' : 'completed');
    setIsModalOpen(true);
  };

  const handleSaveLog = async (data: MaintenanceFormSubmitData) => {
    await maintenanceRepo.save(data);
    if (activeVehicle) {
      if (
        data.status !== 'reserved' &&
        typeof data.mileage === 'number' &&
        data.mileage > activeVehicle.currentMileage
      ) {
        await saveVehicle({
          ...activeVehicle,
          currentMileage: data.mileage,
          mileageUpdatedAt: data.date,
        });
      }
      await loadLogs(activeVehicle.id);
    }
  };

  const handleQuickCompleteLog = async (log: MaintenanceLog) => {
    const { id, createdAt: _createdAt, ...rest } = log;
    await handleSaveLog({
      ...rest,
      id,
      status: 'completed',
      reservationTime: undefined,
    });
  };

  const handleDeleteLog = async (id: string) => {
    await maintenanceRepo.delete(id);
    if (activeVehicle) {
      await loadLogs(activeVehicle.id);
    }
  };

  return (
    <section aria-labelledby="maintenance-title" className="maintenance-page">
      <header className="page-header garage-hero-banner garage-hero-banner--maintenance">
        <div className="garage-hero-content">
          <span className="garage-hero-eyebrow">SERVICE &amp; MAINTENANCE</span>
          <h1 id="maintenance-title" className="page-title garage-hero-title">
            정비
          </h1>
          <p className="garage-hero-subtitle">
            {activeVehicle
              ? `${activeVehicle.name} · 소모품 교체 및 정비 이력 타임라인`
              : '차량별 정비 이력과 누적 지출 비용을 체계적으로 기록하세요'}
          </p>
        </div>
      </header>

      {isVehicleLoading ? (
        <div className="empty-state-box">
          <p className="empty-state-desc">차량 정보를 불러오는 중입니다...</p>
        </div>
      ) : !activeVehicle ? (
        <div className="empty-state-box">
          <p className="empty-state-title">등록된 차량이 없습니다</p>
          <p className="empty-state-desc">
            정비 내역을 기록하려면 먼저 홈 화면에서 차량을 등록해 주세요.
          </p>
          <Link to="/" className="btn btn-primary touch-target">
            홈에서 차량 등록하기
          </Link>
        </div>
      ) : (
        <>
          <section
            className="maint-summary-card"
            aria-label="차량별 누적 정비 비용 요약"
          >
            <div className="maint-vehicle-bar">
              <label htmlFor="maint-vehicle-select" className="sr-only">
                정비 내역 조회 차량 선택
              </label>
              <select
                id="maint-vehicle-select"
                aria-label="정비 내역 조회 차량 선택"
                className="vehicle-select touch-target"
                value={activeVehicle.id}
                onChange={(e) => {
                  setSelectedCategory('all');
                  void selectVehicle(e.target.value);
                }}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary touch-target"
                onClick={() => handleOpenAddModal('completed')}
              >
                + 정비 등록
              </button>
            </div>

            <div className="maint-total-cost-row">
              <div className="maint-total-label-group">
                <span className="maint-total-label">누적 정비 비용</span>
                <span className="maint-total-count">
                  총 {completedLogs.length}건
                </span>
                {reservedLogs.length > 0 && (
                  <span className="maint-reserved-count">
                    예약 {reservedLogs.length}건 제외
                  </span>
                )}
              </div>
              <strong
                className="maint-total-amount"
                data-testid="total-maintenance-cost"
              >
                {formatCurrency(totalCost)}
              </strong>
            </div>
          </section>

          <ReservedMaintenanceSection
            reservedLogs={reservedLogs}
            onSelectLog={handleSelectLog}
            onQuickComplete={(log) => void handleQuickCompleteLog(log)}
            onOpenAddReservation={() => handleOpenAddModal('reserved')}
          />

          <MaintenanceTimeline
            logs={completedLogs}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onSelectLog={handleSelectLog}
          />

          <MaintenanceFormModal
            isOpen={isModalOpen}
            vehicleId={activeVehicle.id}
            defaultMileage={activeVehicle.currentMileage}
            initialMode={modalInitialMode}
            initialLog={editingLog}
            onClose={() => setIsModalOpen(false)}
            onSubmit={handleSaveLog}
            onDelete={editingLog ? handleDeleteLog : undefined}
          />
        </>
      )}
    </section>
  );
};
