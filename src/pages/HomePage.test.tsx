import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ActiveVehicleProvider } from '../app/ActiveVehicleContext';
import { RepositoryProvider } from '../app/RepositoryContext';
import { AppRoutes } from '../app/router';
import {
  Inspection,
  Insurance,
  MaintenanceLog,
  Vehicle,
} from '../domain/models';
import { AppRepositories } from '../repositories/interfaces';
import { formatDateDot } from '../shared/utils';

function addDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatDateDot(d);
}

function createTestRepositories(initial?: {
  vehicles?: Vehicle[];
  inspections?: Record<string, Inspection>;
  insurances?: Record<string, Insurance>;
  maintenanceLogs?: Record<string, MaintenanceLog[]>;
}): AppRepositories {
  let vehicles = [...(initial?.vehicles ?? [])];
  const inspections = { ...(initial?.inspections ?? {}) };
  const insurances = { ...(initial?.insurances ?? {}) };
  const maintenanceLogs = { ...(initial?.maintenanceLogs ?? {}) };
  const meta: Record<string, unknown> = {};

  return {
    vehicleRepo: {
      getAll: async () =>
        [...vehicles].sort((a, b) => a.displayOrder - b.displayOrder),
      getById: async (id) => vehicles.find((v) => v.id === id),
      save: async (input) => {
        if (input.id) {
          const idx = vehicles.findIndex((v) => v.id === input.id);
          if (idx >= 0) {
            const updated: Vehicle = {
              ...vehicles[idx],
              ...input,
              id: input.id,
              updatedAt: new Date().toISOString(),
            };
            vehicles[idx] = updated;
            return updated;
          }
        }
        const created: Vehicle = {
          ...input,
          id: input.id ?? `v-${vehicles.length + 1}`,
          name: input.name,
          plateNumber: input.plateNumber,
          manufacturerModel: input.manufacturerModel,
          modelYear: input.modelYear,
          currentMileage: input.currentMileage,
          displayOrder: vehicles.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        vehicles.push(created);
        return created;
      },
      delete: async (id) => {
        vehicles = vehicles.filter((v) => v.id !== id);
      },
    },
    complianceRepo: {
      getCurrentInspection: async (vehicleId) => inspections[vehicleId],
      getInspectionsByVehicle: async (vehicleId) =>
        inspections[vehicleId] ? [inspections[vehicleId]] : [],
      saveInspection: async (input) => ({ ...input, id: 'insp-1' }),
      deleteInspection: async () => undefined,
      getCurrentInsurance: async (vehicleId) => insurances[vehicleId],
      getInsurancesByVehicle: async (vehicleId) =>
        insurances[vehicleId] ? [insurances[vehicleId]] : [],
      saveInsurance: async (input) => ({ ...input, id: 'ins-1' }),
      deleteInsurance: async () => undefined,
    },
    maintenanceRepo: {
      getByVehicle: async (vehicleId) => maintenanceLogs[vehicleId] ?? [],
      getUpcomingDueByVehicle: async (vehicleId) =>
        (maintenanceLogs[vehicleId] ?? []).filter(
          (m) =>
            m.status === 'reserved' ||
            (Boolean(m.nextDueDate) && !m.isDueCompleted),
        ),
      save: async (input) => ({
        ...input,
        id: 'maint-1',
        createdAt: new Date().toISOString(),
      }),
      delete: async () => undefined,
    },
    attachmentRepo: {
      getByIds: async () => [],
      getByParent: async () => [],
      save: async (input) => ({
        id: input.id ?? 'att-1',
        parentType: input.parentType,
        parentId: input.parentId,
        blob: input.blob,
        mimeType: input.mimeType ?? 'image/jpeg',
        fileName: input.fileName,
        size: input.blob.size,
        createdAt: new Date().toISOString(),
      }),
      delete: async () => undefined,
      deleteMany: async () => undefined,
    },
    backupRepo: {
      exportSnapshot: async () => ({
        vehicles: [],
        maintenanceLogs: [],
        inspections: [],
        insurances: [],
        attachments: [],
      }),
      restoreSnapshot: async () => undefined,
    },
    appMetaRepo: {
      get: async <T,>(key: string) => meta[key] as T | undefined,
      set: async (key, value) => {
        meta[key] = value;
      },
    },
  };
}

describe('홈 화면 및 차량 등록/수정/전환 통합 테스트', () => {
  it('등록된 차량이 없을 때 빈 화면 안내를 표시하고 새 차량을 등록·수정할 수 있다', async () => {
    const repos = createTestRepositories();
    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('empty-vehicle-state')).toBeInTheDocument();
    });
    expect(screen.getByText('등록된 차량이 없습니다')).toBeInTheDocument();

    // 첫 차량 등록 모달 열기
    fireEvent.click(
      screen.getByRole('button', { name: /\+ 첫 차량 등록하기/ }),
    );
    expect(
      screen.getByRole('heading', { name: '새 차량 등록' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/차량 이름\(별칭\)/), {
      target: { value: '패밀리카' },
    });
    fireEvent.change(screen.getByLabelText(/번호판/), {
      target: { value: '12가 3456' },
    });
    fireEvent.change(screen.getByLabelText(/제조사\/모델/), {
      target: { value: '기아 쏘렌토' },
    });
    fireEvent.change(screen.getByLabelText(/연식/), {
      target: { value: '2023' },
    });
    fireEvent.change(screen.getByLabelText(/현재 주행거리/), {
      target: { value: '24500' },
    });

    fireEvent.click(screen.getByRole('button', { name: '차량 등록' }));

    // 등록 후 차량 정보 및 빈 만기 안내 표시 확인
    await waitFor(() => {
      expect(screen.getByText(/기아 쏘렌토 · 2023년식/)).toBeInTheDocument();
    });
    expect(screen.getByText('24,500km')).toBeInTheDocument();
    expect(screen.getByTestId('empty-upcoming-due')).toBeInTheDocument();

    // 차량 수정 테스트
    fireEvent.click(screen.getByRole('button', { name: '차량 수정' }));
    expect(
      screen.getByRole('heading', { name: '차량 정보 수정' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/현재 주행거리/), {
      target: { value: '25000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => {
      expect(screen.getByText('25,000km')).toBeInTheDocument();
    });

    // 차량 삭제 시 즉시 삭제되지 않고 2단계 삭제 확인창이 표시되는지 테스트
    fireEvent.click(screen.getByRole('button', { name: '차량 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '차량 삭제' }));

    expect(
      screen.getByRole('alertdialog', { name: '차량 삭제 확인' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/연관된 모든 정비·검사·보험 기록과 첨부 사진이 함께 삭제됩니다/),
    ).toBeInTheDocument();

    // 삭제 취소 시 모달이 유지됨
    fireEvent.click(screen.getByRole('button', { name: '삭제 취소' }));
    expect(
      screen.queryByRole('alertdialog', { name: '차량 삭제 확인' }),
    ).not.toBeInTheDocument();

    // 다시 차량 삭제 -> 삭제 확인 클릭 시 실제로 삭제되어 빈 차량 안내로 돌아감
    fireEvent.click(screen.getByRole('button', { name: '차량 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => {
      expect(screen.getByTestId('empty-vehicle-state')).toBeInTheDocument();
    });
  });

  it('다중 차량 전환 시 각 차량의 다가오는 만기(만기 지남/30일 이내 강조)를 가까운 순으로 표시한다', async () => {
    const today = new Date();
    const overdueDate = addDays(today, -5); // 5일 지남 (만기 지남)
    const urgentDate = addDays(today, 12); // 12일 남음 (D-12, 30일 이내 강조)
    const normalDate = addDays(today, 60); // 60일 남음 (D-60)

    const repos = createTestRepositories({
      vehicles: [
        {
          id: 'v-1',
          name: '쏘렌토',
          plateNumber: '12가 3456',
          manufacturerModel: '기아 쏘렌토',
          modelYear: 2023,
          currentMileage: 30000,
          displayOrder: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'v-2',
          name: '아반떼',
          plateNumber: '98나 7654',
          manufacturerModel: '현대 아반떼',
          modelYear: 2021,
          currentMileage: 55000,
          displayOrder: 1,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      inspections: {
        'v-1': {
          id: 'insp-1',
          vehicleId: 'v-1',
          inspectionDate: '2024.11.01',
          expiryDate: urgentDate, // D-12
          cost: 54000,
          attachmentIds: [],
          isCurrent: true,
        },
      },
      insurances: {
        'v-1': {
          id: 'ins-1',
          vehicleId: 'v-1',
          companyName: '현대해상',
          startDate: '2025.11.01',
          endDate: overdueDate, // 만기 지남
          premiumCost: 700000,
          attachmentIds: [],
          isCurrent: true,
        },
        'v-2': {
          id: 'ins-2',
          vehicleId: 'v-2',
          companyName: 'DB손해보험',
          startDate: '2026.01.01',
          endDate: normalDate, // D-60
          premiumCost: 550000,
          attachmentIds: [],
          isCurrent: true,
        },
      },
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    // 첫 번째 차량(쏘렌토) 만기 목록 확인: 만기 지남(현대해상)이 D-12(자동차 검사)보다 먼저 나와야 함
    await waitFor(() => {
      expect(screen.getByText('현대해상 자동차 보험 만기')).toBeInTheDocument();
    });

    // 선택하지 않아도 보유 차량 전체 목록(쏘렌토, 아반떼)의 기본 정보와 주행거리 기준일이 홈 화면에 즉시 표시됨
    expect(screen.getByText(/기아 쏘렌토 · 2023년식/)).toBeInTheDocument();
    expect(screen.getByText('30,000km')).toBeInTheDocument();
    expect(screen.getByTestId('mileage-date-v-1')).toHaveTextContent(
      '2026.01.01 기준',
    );
    expect(screen.getByText(/현대 아반떼 · 2021년식/)).toBeInTheDocument();
    expect(screen.getByText('55,000km')).toBeInTheDocument();

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
    expect(listItems[0]).toHaveAttribute('data-status', 'overdue');
    expect(listItems[0]).toHaveTextContent('만기 지남');
    expect(listItems[1]).toHaveAttribute('data-status', 'urgent');
    expect(listItems[1]).toHaveTextContent('D-12');
    expect(listItems[1]).toHaveTextContent('30일 이내 임박');

    // 두 번째 차량(아반떼) 카드를 클릭하여 전환
    fireEvent.click(screen.getByText(/현대 아반떼 · 2021년식/));

    await waitFor(() => {
      expect(
        screen.getByText('DB손해보험 자동차 보험 만기'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('D-60')).toBeInTheDocument();

    // 차량 카드 드래그 앤 드롭으로 순서 변경 (아반떼 카드를 첫 번째 위치로 드롭)
    const secondCard = screen.getByTestId('vehicle-card-v-2');
    const firstCard = screen.getByTestId('vehicle-card-v-1');
    fireEvent.dragStart(secondCard);
    fireEvent.dragOver(firstCard);
    fireEvent.drop(firstCard);

    await waitFor(() => {
      const cards = screen
        .getByTestId('owned-vehicles-list')
        .querySelectorAll('.owned-vehicle-card');
      expect(cards[0]).toHaveAttribute('data-testid', 'vehicle-card-v-2');
      expect(cards[1]).toHaveAttribute('data-testid', 'vehicle-card-v-1');
    });
  });

  it('차량 상세 제원(차대번호, 인수 후 주행거리, 소모품 규격, 관리 메모)을 조회하고 메모를 수정할 수 있다', async () => {
    const repos = createTestRepositories({
      vehicles: [
        {
          id: 'v-spec-1',
          name: '세단',
          plateNumber: '11가 1111',
          manufacturerModel: '샘플 세단',
          modelYear: 2020,
          registrationDate: '2020.05.15',
          vehiclePrice: 60000000,
          purchaseDate: '2025.08.14',
          purchaseMileage: 50000,
          purchasePrice: 35000000,
          currentMileage: 60200,
          vin: 'TESTVIN1234567890',
          engineSpec: '2,000cc 터보',
          tireSize: '245/45R19 (38psi)',
          consumablesSpec: '에어컨필터 245 * 178 * 28',
          colorSpec: '실버 메탈릭',
          memo: '내비 업데이트 메모: 초기값',
          displayOrder: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/샘플 세단 · 2020년식/)).toBeInTheDocument();
    });

    // 제원 · 옵션 상세보기 펼치기
    fireEvent.click(
      screen.getByRole('button', { name: /제원 · 옵션 상세보기/ }),
    );
    expect(
      screen.getByTestId('vehicle-detail-specs-panel'),
    ).toBeInTheDocument();
    expect(screen.getByText('TESTVIN1234567890')).toBeInTheDocument();
    expect(
      screen.getByText(/인수 후 \+10,200km 주행/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/에어컨필터 245 \* 178 \* 28/),
    ).toBeInTheDocument();

    // 메모 수정 클릭하여 메모 및 차량 배경 사진 업로드 테스트
    fireEvent.click(
      screen.getByRole('button', { name: '메모 수정' }),
    );
    const bgFileInput = screen.getByTestId('vehicle-bg-file-input');
    const photoFile = new File(['car-photo-bytes'], 'my-car.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(bgFileInput, { target: { files: [photoFile] } });

    await waitFor(() => {
      expect(
        screen.getByTestId('vehicle-bg-custom-preview'),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/차량 관리 메모/), {
      target: { value: '내비 업데이트 메모: 변경완료' },
    });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => {
      expect(
        screen.getByText(/내비 업데이트 메모: 변경완료/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('vehicle-photo-bg-v-spec-1'),
    ).toBeInTheDocument();
  });
});
