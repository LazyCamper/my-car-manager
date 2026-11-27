import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ActiveVehicleProvider } from '../app/ActiveVehicleContext';
import { RepositoryProvider } from '../app/RepositoryContext';
import { AppRoutes } from '../app/router';
import { Attachment, MaintenanceLog, Vehicle } from '../domain/models';
import { AppRepositories } from '../repositories/interfaces';
import { formatDateDot } from '../shared/utils';
import * as imageCompression from '../shared/utils/imageCompression';

function addDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatDateDot(d);
}

function createMaintenanceTestRepositories(initial?: {
  vehicles?: Vehicle[];
  logs?: MaintenanceLog[];
  attachments?: Attachment[];
}): AppRepositories {
  const vehicles = [...(initial?.vehicles ?? [])];
  let logs = [...(initial?.logs ?? [])];
  let attachments = [...(initial?.attachments ?? [])];
  const meta: Record<string, unknown> = {};

  return {
    vehicleRepo: {
      getAll: async () => [...vehicles],
      getById: async (id) => vehicles.find((v) => v.id === id),
      save: async (input) => {
        if (input.id) {
          const idx = vehicles.findIndex((v) => v.id === input.id);
          if (idx >= 0) {
            const updated: Vehicle = {
              ...vehicles[idx],
              ...input,
              id: input.id,
              updatedAt: '2026-01-01',
            };
            vehicles[idx] = updated;
            return updated;
          }
        }
        const created: Vehicle = {
          id: input.id ?? 'v-1',
          name: input.name,
          plateNumber: input.plateNumber,
          manufacturerModel: input.manufacturerModel,
          modelYear: input.modelYear,
          currentMileage: input.currentMileage,
          mileageUpdatedAt: input.mileageUpdatedAt,
          displayOrder: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        };
        vehicles.push(created);
        return created;
      },
      delete: async () => undefined,
    },
    complianceRepo: {
      getCurrentInspection: async () => undefined,
      getInspectionsByVehicle: async () => [],
      saveInspection: async (input) => ({ ...input, id: 'insp-1' }),
      deleteInspection: async () => undefined,
      getCurrentInsurance: async () => undefined,
      getInsurancesByVehicle: async () => [],
      saveInsurance: async (input) => ({ ...input, id: 'ins-1' }),
      deleteInsurance: async () => undefined,
    },
    maintenanceRepo: {
      getByVehicle: async (vehicleId) =>
        logs.filter((l) => l.vehicleId === vehicleId),
      getUpcomingDueByVehicle: async (vehicleId) =>
        logs.filter(
          (l) =>
            l.vehicleId === vehicleId &&
            (l.status === 'reserved' ||
              (Boolean(l.nextDueDate) && !l.isDueCompleted)),
        ),
      save: async (input) => {
        if (input.id) {
          const idx = logs.findIndex((l) => l.id === input.id);
          if (idx >= 0) {
            const updated: MaintenanceLog = {
              ...logs[idx],
              ...input,
              id: input.id,
            };
            logs[idx] = updated;
            return updated;
          }
        }
        const created: MaintenanceLog = {
          ...input,
          id: `maint-${logs.length + 1}`,
          createdAt: new Date().toISOString(),
        };
        logs.push(created);
        return created;
      },
      delete: async (id) => {
        logs = logs.filter((l) => l.id !== id);
      },
    },
    attachmentRepo: {
      getByIds: async (ids) => attachments.filter((a) => ids.includes(a.id)),
      getByParent: async (parentType, parentId) =>
        attachments.filter(
          (a) => a.parentType === parentType && a.parentId === parentId,
        ),
      save: async (input) => {
        const record: Attachment = {
          id: input.id ?? `att-${attachments.length + 1}`,
          parentType: input.parentType,
          parentId: input.parentId,
          blob: input.blob,
          mimeType: input.mimeType ?? 'image/jpeg',
          fileName: input.fileName,
          size: input.blob.size,
          createdAt: new Date().toISOString(),
        };
        attachments.push(record);
        return record;
      },
      delete: async (id) => {
        attachments = attachments.filter((a) => a.id !== id);
      },
      deleteMany: async (ids) => {
        attachments = attachments.filter((a) => !ids.includes(a.id));
      },
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

const DEFAULT_VEHICLE: Vehicle = {
  id: 'v-1',
  name: '쏘렌토',
  plateNumber: '12가 3456',
  manufacturerModel: '기아 쏘렌토',
  modelYear: 2023,
  currentMileage: 35000,
  displayOrder: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('정비 내역 화면 (MaintenancePage) 통합 테스트', () => {
  it('입력 검증(날짜 필수, 주행거리/비용 음수 불가)이 동작하고 새 정비 내역을 등록하면 누적 비용이 갱신된다', async () => {
    const repos = createMaintenanceTestRepositories({
      vehicles: [DEFAULT_VEHICLE],
      logs: [],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/maintenance']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
        '₩0',
      );
    });

    // + 정비 등록 모달 열기
    fireEvent.click(screen.getByRole('button', { name: '+ 정비 등록' }));

    // 1. 날짜 필수 검증
    fireEvent.change(screen.getByLabelText(/정비 날짜/), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '정비 등록' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '정비 날짜를 입력해 주세요.',
    );

    // 2. 주행거리 음수 불가 검증
    fireEvent.change(screen.getByLabelText(/정비 날짜/), {
      target: { value: '2026.11.10' },
    });
    fireEvent.change(screen.getByLabelText(/주행거리/), {
      target: { value: '-100' },
    });
    fireEvent.change(screen.getByLabelText(/비용 \(원\)/), {
      target: { value: '95000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '정비 등록' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '주행거리는 0 이상의 숫자로 입력해 주세요.',
    );

    // 3. 비용 음수 불가 검증
    fireEvent.change(screen.getByLabelText(/주행거리/), {
      target: { value: '35200' },
    });
    fireEvent.change(screen.getByLabelText(/비용 \(원\)/), {
      target: { value: '-5000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '정비 등록' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '비용은 0원 이상의 숫자로 입력해 주세요.',
    );

    // 4. 정상 입력 및 '기타' 항목 칩 선택 테스트
    const categoryGroup = screen.getByRole('group', { name: '정비 항목 분류' });
    fireEvent.click(within(categoryGroup).getByRole('button', { name: '기타' }));
    fireEvent.change(screen.getByLabelText(/정비 항목 상세명/), {
      target: { value: '와이퍼 블레이드 교체' },
    });
    fireEvent.change(screen.getByLabelText(/비용 \(원\)/), {
      target: { value: '32000' },
    });
    fireEvent.change(screen.getByLabelText(/정비소/), {
      target: { value: '오토큐 역삼점' },
    });
    fireEvent.change(screen.getByLabelText(/다음 정비 예정일/), {
      target: { value: '2027.05.10' },
    });
    // 현재(35200) -> +1만 -> 45200 빠른 입력 버튼 검증
    fireEvent.click(screen.getByRole('button', { name: '현재' }));
    expect(screen.getByLabelText(/다음 목표 거리/)).toHaveValue(35200);
    fireEvent.click(screen.getByRole('button', { name: '+1만' }));
    expect(screen.getByLabelText(/다음 목표 거리/)).toHaveValue(45200);
    fireEvent.click(screen.getByRole('button', { name: '+1천' }));
    expect(screen.getByLabelText(/다음 목표 거리/)).toHaveValue(46200);
    fireEvent.change(screen.getByLabelText(/메모/), {
      target: { value: '발수 코팅 와이퍼 장착' },
    });

    fireEvent.click(screen.getByRole('button', { name: '정비 등록' }));

    await waitFor(() => {
      expect(screen.getByText('와이퍼 블레이드 교체')).toBeInTheDocument();
    });
    expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
      '₩32,000',
    );
    expect(screen.getByText(/오토큐 역삼점/)).toBeInTheDocument();
    expect(
      screen.getByText(/다음 예정: 2027\.05\.10 · 46,200km/),
    ).toBeInTheDocument();
    expect(screen.getByText('발수 코팅 와이퍼 장착')).toBeInTheDocument();
  });

  it('최신순 타임라인 정렬, 항목별 필터, 탭하여 상세/수정, 삭제 시 확인창이 동작한다', async () => {
    const repos = createMaintenanceTestRepositories({
      vehicles: [DEFAULT_VEHICLE],
      logs: [
        {
          id: 'maint-old',
          vehicleId: 'v-1',
          date: '2026.05.10',
          mileage: 28000,
          category: 'engine_oil',
          title: '엔진오일 및 오일필터 교체',
          cost: 90000,
          shopName: '기아오토큐',
          attachmentIds: [],
          createdAt: '2026-05-10T09:00:00.000Z',
        },
        {
          id: 'maint-new',
          vehicleId: 'v-1',
          date: '2026.10.20',
          mileage: 34000,
          category: 'tire',
          title: '앞타이어 2본 교체',
          cost: 340000,
          shopName: '타이어뱅크',
          attachmentIds: [],
          createdAt: '2026-10-20T09:00:00.000Z',
        },
      ],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/maintenance']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    // 누적 비용: 90,000 + 340,000 = 430,000
    await waitFor(() => {
      expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
        '₩430,000',
      );
    });

    // 최신순 정렬 확인 (2026.10.20 앞타이어가 첫 번째)
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('앞타이어 2본 교체');
    expect(items[1]).toHaveTextContent('엔진오일 및 오일필터 교체');

    // 항목별 필터: '엔진오일' 클릭 시 1건만 표시
    fireEvent.click(screen.getByRole('button', { name: '엔진오일' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('엔진오일 및 오일필터 교체')).toBeInTheDocument();

    // 다시 '전체' 필터로 복귀
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    // 타임라인 항목 탭하여 상세/수정 모달 열기
    fireEvent.click(screen.getByText('앞타이어 2본 교체'));
    expect(
      screen.getByRole('heading', { name: '정비 내역 상세 · 수정' }),
    ).toBeInTheDocument();

    // 비용을 340,000 -> 360,000으로 수정 저장
    fireEvent.change(screen.getByLabelText(/비용 \(원\)/), {
      target: { value: '360000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => {
      expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
        '₩450,000',
      );
    });

    // 다시 항목 탭 후 삭제 및 삭제 확인창 검증
    fireEvent.click(screen.getByText('앞타이어 2본 교체'));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(
      screen.getByRole('alertdialog', { name: '정비 내역 삭제 확인' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('이 정비 내역을 정말 삭제하시겠습니까?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => {
      expect(
        screen.queryByText('앞타이어 2본 교체'),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
      '₩90,000',
    );
  });

  it('사진 첨부(최대 5장 제한, 썸네일 표시, 확대 보기, 사진 삭제)가 저장소 계층을 통해 동작한다', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test-preview');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(imageCompression, 'compressImageFile').mockImplementation(
      async () => new Blob(['compressed'], { type: 'image/jpeg' }),
    );

    const repos = createMaintenanceTestRepositories({
      vehicles: [DEFAULT_VEHICLE],
      logs: [],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/maintenance']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '+ 정비 등록' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ 정비 등록' }));

    const galleryInput = screen.getByTestId('gallery-file-input');

    // 6장 선택 시 최대 5장 제한 안내 표시
    const sixFiles = Array.from({ length: 6 }, (_, idx) =>
      new File(['img'], `receipt-${idx + 1}.jpg`, { type: 'image/jpeg' }),
    );
    fireEvent.change(galleryInput, { target: { files: sixFiles } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '사진은 최대 5장까지만 첨부할 수 있습니다.',
    );

    // 2장 정상 첨부
    const twoFiles = [
      new File(['img1'], 'receipt-1.jpg', { type: 'image/jpeg' }),
      new File(['img2'], 'receipt-2.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(galleryInput, { target: { files: twoFiles } });

    await waitFor(() => {
      expect(
        screen.getByLabelText('receipt-1.jpg 확대 보기'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByLabelText('receipt-2.jpg 확대 보기'),
    ).toBeInTheDocument();

    // 썸네일 클릭 시 확대 보기 모달 열기/닫기
    fireEvent.click(screen.getByLabelText('receipt-1.jpg 확대 보기'));
    expect(
      screen.getByRole('dialog', { name: '첨부 사진 확대 보기' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확대 보기 닫기' }));

    // 2번째 사진 삭제
    fireEvent.click(screen.getByLabelText('receipt-2.jpg 사진 삭제'));
    expect(
      screen.queryByLabelText('receipt-2.jpg 확대 보기'),
    ).not.toBeInTheDocument();

    // 필수값 입력 후 정비 내역 저장
    fireEvent.change(screen.getByLabelText(/비용 \(원\)/), {
      target: { value: '75000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '정비 등록' }));

    await waitFor(() => {
      expect(screen.getByText('📷 1장')).toBeInTheDocument();
    });
  });

  it('복수 카테고리 태그 필터링과 축약 날짜(26.3.12), 주행거리·비용 미입력 저장이 정상 동작한다', async () => {
    const repos = createMaintenanceTestRepositories({
      vehicles: [DEFAULT_VEHICLE],
      logs: [
        {
          id: 'maint-multi',
          vehicleId: 'v-1',
          date: '2026.05.12',
          mileage: 50748,
          category: 'engine_oil',
          categories: ['engine_oil', 'filter'],
          title: '엔진오일, 에어필터, 연료필터, 에어컨필터 교환',
          cost: 0,
          shopName: '블루핸즈 강남점',
          attachmentIds: [],
          createdAt: '2026-05-12T09:00:00.000Z',
        },
      ],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/maintenance']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('엔진오일, 에어필터, 연료필터, 에어컨필터 교환'),
      ).toBeInTheDocument();
    });

    // '엔진오일' 필터와 '에어컨·필터' 필터 양쪽 모두에서 조회됨
    fireEvent.click(screen.getByRole('button', { name: '엔진오일' }));
    expect(
      screen.getByText('엔진오일, 에어필터, 연료필터, 에어컨필터 교환'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '에어컨·필터' }));
    expect(
      screen.getByText('엔진오일, 에어필터, 연료필터, 에어컨필터 교환'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체' }));

    // 새 정비 등록: 축약 날짜(26.3.12) + 주행거리 비움 + 비용 비움
    fireEvent.click(screen.getByRole('button', { name: '+ 정비 등록' }));
    fireEvent.change(screen.getByLabelText(/정비 날짜/), {
      target: { value: '26.3.12' },
    });
    fireEvent.change(screen.getByLabelText(/주행거리/), {
      target: { value: '' },
    });
    const categoryGroup = screen.getByRole('group', { name: '정비 항목 분류' });
    fireEvent.click(
      within(categoryGroup).getByRole('button', { name: '사고·외판' }),
    );
    fireEvent.change(screen.getByLabelText(/정비 항목 상세명/), {
      target: { value: '앞범퍼, 운전석 앞휀더, 앞바퀴휠 교체' },
    });
    fireEvent.change(screen.getByLabelText(/비용 \(원\)/), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: '정비 등록' }));

    await waitFor(() => {
      expect(
        screen.getByText('앞범퍼, 운전석 앞휀더, 앞바퀴휠 교체'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('2026.03.12')).toBeInTheDocument();
    expect(screen.getByText(/주행거리 미기재/)).toBeInTheDocument();
  });

  it('정비 예약 등록 시 홈과 정비 탭 양쪽에 D-day가 표시되고 누적 비용·현재 주행거리에서 제외되며, 원클릭 완료 전환 시 모두 반영된다', async () => {
    const reserveDate = addDays(new Date(), 5); // D-5
    const repos = createMaintenanceTestRepositories({
      vehicles: [{ ...DEFAULT_VEHICLE, currentMileage: 35000 }],
      logs: [
        {
          id: 'maint-done-1',
          vehicleId: 'v-1',
          date: '2026.10.01',
          mileage: 34000,
          category: 'filter',
          title: '에어컨 필터 교체',
          cost: 30000,
          attachmentIds: [],
          createdAt: '2026-10-01T09:00:00.000Z',
        },
      ],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/maintenance']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
        '₩30,000',
      );
    });

    // 1. 모달을 열고 [정비 예약 등록] 탭으로 전환하여 예약 등록
    fireEvent.click(screen.getByRole('button', { name: '+ 정비 등록' }));
    fireEvent.click(screen.getByRole('tab', { name: '정비 예약 등록' }));

    fireEvent.change(screen.getByLabelText(/예약 날짜/), {
      target: { value: reserveDate },
    });
    fireEvent.change(screen.getByLabelText(/예약 시간/), {
      target: { value: '14:30' },
    });
    fireEvent.change(screen.getByLabelText(/정비 항목 상세명/), {
      target: { value: '미션오일 순환식 교환' },
    });
    fireEvent.change(screen.getByLabelText(/예상 비용/), {
      target: { value: '220000' },
    });
    fireEvent.change(screen.getByLabelText(/예약 정비소/), {
      target: { value: '오토큐 성수점' },
    });
    fireEvent.change(screen.getByLabelText(/주행거리/), {
      target: { value: '40000' },
    });

    fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));

    // 2. 정비 탭 상단 예약 카드에 D-day(D-5) 표시 및 누적 비용 제외 확인
    await waitFor(() => {
      expect(
        screen.getByTestId('reserved-maintenance-section'),
      ).toBeInTheDocument();
    });
    const reservedSection = screen.getByTestId('reserved-maintenance-section');
    expect(within(reservedSection).getByText('D-5')).toBeInTheDocument();
    expect(
      within(reservedSection).getByText(/14:30/),
    ).toBeInTheDocument();
    expect(
      within(reservedSection).getByText('미션오일 순환식 교환'),
    ).toBeInTheDocument();
    // 예약 비용 220,000원은 누적 정비 비용에서 제외되어 여전히 ₩30,000
    expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
      '₩30,000',
    );
    expect(screen.getByText('예약 1건 제외')).toBeInTheDocument();

    // 3. 홈 화면으로 이동: 현재 주행거리(35,000km) 자동 갱신 제외 + 다가오는 만기 D-day 표시 확인
    fireEvent.click(screen.getByRole('link', { name: /나의 차고/ }));
    await waitFor(() => {
      expect(
        screen.getByText('미션오일 순환식 교환 예약'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('35,000km')).toBeInTheDocument();
    expect(screen.getByText('정비 예약')).toBeInTheDocument();
    expect(screen.getByText('D-5')).toBeInTheDocument();
    expect(
      screen.getByText(/14:30 · 오토큐 성수점/),
    ).toBeInTheDocument();

    // 4. 다시 정비 탭으로 이동 후 예약 카드에서 원클릭 [✓ 완료 전환] 클릭
    fireEvent.click(screen.getByRole('link', { name: '정비' }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '✓ 완료 전환' }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '✓ 완료 전환' }));

    // 예약 섹션이 사라지고 누적 비용(30,000 + 220,000 = 250,000)에 합산됨
    await waitFor(() => {
      expect(
        screen.queryByTestId('reserved-maintenance-section'),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
      '₩250,000',
    );

    // 5. 홈 화면으로 이동 시 주행거리가 40,000km로 자동 갱신되고 예약 D-day에서 제거됨
    fireEvent.click(screen.getByRole('link', { name: /나의 차고/ }));
    await waitFor(() => {
      expect(screen.getByText('40,000km')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('미션오일 순환식 교환 예약'),
    ).not.toBeInTheDocument();
  });

  it('예약 상세 모달 내부의 [✓ 정비 완료로 전환] 원클릭 버튼으로도 완료 전환이 동작한다', async () => {
    const reserveDate = addDays(new Date(), 3);
    const repos = createMaintenanceTestRepositories({
      vehicles: [{ ...DEFAULT_VEHICLE, currentMileage: 35000 }],
      logs: [
        {
          id: 'maint-res-modal',
          vehicleId: 'v-1',
          status: 'reserved',
          reservationTime: '10:00',
          date: reserveDate,
          mileage: 36500,
          category: 'brake',
          title: '브레이크액 교환',
          cost: 80000,
          shopName: '블루핸즈',
          attachmentIds: [],
          createdAt: '2026-11-20T09:00:00.000Z',
        },
      ],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/maintenance']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
        '₩0',
      );
    });

    // 예약 카드를 클릭해 상세 모달 열기
    fireEvent.click(screen.getByText('브레이크액 교환'));
    expect(
      screen.getByRole('heading', { name: '정비 예약 상세 · 수정' }),
    ).toBeInTheDocument();

    // 모달 상단의 원클릭 [✓ 정비 완료로 전환] 클릭
    fireEvent.click(
      screen.getByRole('button', { name: '✓ 정비 완료로 전환' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-maintenance-cost')).toHaveTextContent(
        '₩80,000',
      );
    });
    expect(
      screen.queryByTestId('reserved-maintenance-section'),
    ).not.toBeInTheDocument();
  });
});
