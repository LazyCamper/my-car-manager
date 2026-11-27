import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveVehicle } from '../app/ActiveVehicleContext';
import { useRepositories } from '../app/RepositoryContext';
import {
  LAST_BACKUP_DATE_META_KEY,
  UpcomingDueItem,
  Vehicle,
  VehicleInput,
} from '../domain/models';
import { buildUpcomingDueItems } from '../domain/services';
import { isBackupOverdue } from '../features/backup';
import { UpcomingDueSection } from '../features/dashboard';
import { VehicleFormModal, VehicleSwitcher } from '../features/vehicle';
import { formatDateDot } from '../shared/utils';

function extractFallbackDateDot(isoOrDate?: string): string | undefined {
  if (!isoOrDate) return undefined;
  const trimmed = isoOrDate.trim();
  const datePart = trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
  try {
    return formatDateDot(datePart);
  } catch {
    return undefined;
  }
}

export const HomePage: React.FC = () => {
  const {
    vehicles,
    activeVehicle,
    isLoading: isVehicleLoading,
    selectVehicle,
    saveVehicle,
    deleteVehicle,
    reorderVehicles,
  } = useActiveVehicle();
  const { complianceRepo, maintenanceRepo, appMetaRepo } = useRepositories();

  const [upcomingItems, setUpcomingItems] = useState<UpcomingDueItem[]>([]);
  const [isDueLoading, setIsDueLoading] = useState<boolean>(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | undefined>(
    undefined,
  );
  const [mileageDatesByVehicle, setMileageDatesByVehicle] = useState<
    Record<string, string>
  >({});

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const loadUpcomingDue = useCallback(
    async (vehicleId: string) => {
      setIsDueLoading(true);
      try {
        const [inspection, insurance, maintenanceLogs, savedBackupDate] =
          await Promise.all([
            complianceRepo.getCurrentInspection(vehicleId),
            complianceRepo.getCurrentInsurance(vehicleId),
            maintenanceRepo.getUpcomingDueByVehicle(vehicleId),
            appMetaRepo.get<string>(LAST_BACKUP_DATE_META_KEY),
          ]);

        const items = buildUpcomingDueItems({
          inspection,
          insurance,
          maintenanceLogs,
        });
        setUpcomingItems(items);
        setLastBackupDate(savedBackupDate);
      } finally {
        setIsDueLoading(false);
      }
    },
    [complianceRepo, maintenanceRepo, appMetaRepo],
  );

  useEffect(() => {
    void appMetaRepo
      .get<string>(LAST_BACKUP_DATE_META_KEY)
      .then((date) => setLastBackupDate(date));
  }, [appMetaRepo]);

  useEffect(() => {
    let isMounted = true;
    if (vehicles.length === 0) {
      setMileageDatesByVehicle({});
      return;
    }

    void Promise.all(
      vehicles.map(async (v) => {
        if (v.mileageUpdatedAt) {
          return [v.id, v.mileageUpdatedAt] as const;
        }
        const logs = await maintenanceRepo.getByVehicle(v.id);
        const withMileage = logs
          .filter(
            (l) => l.status !== 'reserved' && typeof l.mileage === 'number',
          )
          .sort((a, b) => b.date.localeCompare(a.date));
        if (withMileage.length > 0) {
          return [v.id, withMileage[0].date] as const;
        }
        const fallback =
          extractFallbackDateDot(v.updatedAt) ??
          extractFallbackDateDot(v.registrationDate);
        return [v.id, fallback ?? ''] as const;
      }),
    ).then((entries) => {
      if (!isMounted) return;
      const nextMap: Record<string, string> = {};
      for (const [id, dateStr] of entries) {
        if (dateStr) {
          nextMap[id] = dateStr;
        }
      }
      setMileageDatesByVehicle(nextMap);
    });

    return () => {
      isMounted = false;
    };
  }, [vehicles, maintenanceRepo]);

  useEffect(() => {
    if (!activeVehicle) {
      setUpcomingItems([]);
      return;
    }
    void loadUpcomingDue(activeVehicle.id);
  }, [activeVehicle, loadUpcomingDue]);

  const handleOpenAddModal = () => {
    setEditingVehicle(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleSaveVehicle = async (input: VehicleInput) => {
    await saveVehicle(input);
  };

  const earliestVehicleCreatedAt =
    vehicles.length > 0 ? vehicles[0].createdAt : undefined;
  const showBackupBanner = isBackupOverdue(
    lastBackupDate,
    new Date(),
    earliestVehicleCreatedAt,
  );

  return (
    <section aria-labelledby="home-title" className="home-page">
      <header className="page-header home-page-header garage-hero-banner">
        <div className="garage-hero-content">
          <span className="garage-hero-eyebrow">MY DIGITAL GARAGE</span>
          <h1 id="home-title" className="page-title garage-hero-title">
            나의 차고
          </h1>
          <p className="garage-hero-subtitle">
            {vehicles.length > 0
              ? `보유 차량 ${vehicles.length}대 · 제원 및 정비 이력 통합 관리`
              : '내 차의 제원과 정비·검사·보험 이력을 한곳에서 관리하세요'}
          </p>
        </div>
      </header>

      {showBackupBanner && (
        <div
          className="backup-reminder-banner"
          role="region"
          aria-label="백업 권장 안내"
          data-testid="backup-reminder-banner"
        >
          <div className="backup-reminder-text">
            <strong>백업이 필요합니다 (30일 경과)</strong>
            <span>
              {lastBackupDate
                ? `마지막 백업 날짜(${lastBackupDate})로부터 30일이 지났습니다. 데이터 유실 방지를 위해 백업해 주세요.`
                : '차량 등록 후 30일 이상 백업하지 않았습니다. 데이터 유실 방지를 위해 첫 백업을 진행해 주세요.'}
            </span>
          </div>
          <Link to="/settings" className="btn btn-chip-primary touch-target">
            백업하기
          </Link>
        </div>
      )}

      {isVehicleLoading ? (
        <div className="empty-state-box">
          <p className="empty-state-desc">차량 정보를 불러오는 중입니다...</p>
        </div>
      ) : !activeVehicle ? (
        <div className="empty-state-box" data-testid="empty-vehicle-state">
          <div className="empty-state-icon" aria-hidden="true">
            🚗
          </div>
          <h2 className="empty-state-title">등록된 차량이 없습니다</h2>
          <p className="empty-state-desc">
            내 차량의 이름(별칭), 번호판, 연식, 주행거리를 등록하고 자동차 검사·보험 만기와 정비 내역을 한눈에 관리해 보세요.
          </p>
          <button
            type="button"
            className="btn btn-primary touch-target"
            onClick={handleOpenAddModal}
          >
            + 첫 차량 등록하기
          </button>
        </div>
      ) : (
        <>
          <VehicleSwitcher
            vehicles={vehicles}
            activeVehicle={activeVehicle}
            mileageDatesByVehicle={mileageDatesByVehicle}
            onSelectVehicle={(id) => void selectVehicle(id)}
            onOpenAddModal={handleOpenAddModal}
            onOpenEditModal={handleOpenEditModal}
            onReorderVehicles={(fromIndex, toIndex) =>
              void reorderVehicles(fromIndex, toIndex)
            }
          />

          <UpcomingDueSection
            items={upcomingItems}
            isLoading={isDueLoading}
          />
        </>
      )}

      <VehicleFormModal
        isOpen={isModalOpen}
        initialVehicle={editingVehicle}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveVehicle}
        onDelete={editingVehicle ? deleteVehicle : undefined}
      />
    </section>
  );
};
