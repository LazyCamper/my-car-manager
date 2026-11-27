import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActiveVehicleProvider } from '../app/ActiveVehicleContext';
import { RepositoryProvider } from '../app/RepositoryContext';
import { AppRoutes } from '../app/router';
import {
  Attachment,
  BACKUP_SCHEMA_VERSION,
  BackupDataSnapshot,
  Inspection,
  Insurance,
  LAST_BACKUP_DATE_META_KEY,
  MaintenanceLog,
  Vehicle,
} from '../domain/models';
import {
  blobToBase64,
  buildBackupFileName,
} from '../features/backup';
import { AppRepositories } from '../repositories/interfaces';
import { formatDateDot } from '../shared/utils';

function addDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatDateDot(d);
}

function createStatefulBackupTestRepos(initial?: {
  vehicles?: Vehicle[];
  maintenanceLogs?: MaintenanceLog[];
  inspections?: Inspection[];
  insurances?: Insurance[];
  attachments?: Attachment[];
  meta?: Record<string, unknown>;
}) {
  let vehicles = [...(initial?.vehicles ?? [])];
  let maintenanceLogs = [...(initial?.maintenanceLogs ?? [])];
  let inspections = [...(initial?.inspections ?? [])];
  let insurances = [...(initial?.insurances ?? [])];
  let attachments = [...(initial?.attachments ?? [])];
  const meta: Record<string, unknown> = { ...(initial?.meta ?? {}) };

  const getState = (): BackupDataSnapshot => ({
    vehicles: [...vehicles],
    maintenanceLogs: [...maintenanceLogs],
    inspections: [...inspections],
    insurances: [...insurances],
    attachments: [...attachments],
  });

  const repos: AppRepositories = {
    vehicleRepo: {
      getAll: async () => [...vehicles],
      getById: async (id) => vehicles.find((v) => v.id === id),
      save: async (input) => {
        const created: Vehicle = {
          id: input.id ?? `v-${vehicles.length + 1}`,
          name: input.name,
          plateNumber: input.plateNumber,
          manufacturerModel: input.manufacturerModel,
          modelYear: input.modelYear,
          currentMileage: input.currentMileage,
          displayOrder: vehicles.length,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        };
        vehicles.push(created);
        return created;
      },
      delete: async (id) => {
        vehicles = vehicles.filter((v) => v.id !== id);
      },
    },
    complianceRepo: {
      getCurrentInspection: async (vehicleId) =>
        inspections.find((i) => i.vehicleId === vehicleId && i.isCurrent),
      getInspectionsByVehicle: async (vehicleId) =>
        inspections.filter((i) => i.vehicleId === vehicleId),
      saveInspection: async (input) => ({ ...input, id: 'insp-1' }),
      deleteInspection: async () => undefined,
      getCurrentInsurance: async (vehicleId) =>
        insurances.find((i) => i.vehicleId === vehicleId && i.isCurrent),
      getInsurancesByVehicle: async (vehicleId) =>
        insurances.filter((i) => i.vehicleId === vehicleId),
      saveInsurance: async (input) => ({ ...input, id: 'ins-1' }),
      deleteInsurance: async () => undefined,
    },
    maintenanceRepo: {
      getByVehicle: async (vehicleId) =>
        maintenanceLogs.filter((m) => m.vehicleId === vehicleId),
      getUpcomingDueByVehicle: async (vehicleId) =>
        maintenanceLogs.filter(
          (m) =>
            m.vehicleId === vehicleId &&
            (m.status === 'reserved' ||
              (Boolean(m.nextDueDate) && !m.isDueCompleted)),
        ),
      save: async (input) => ({
        ...input,
        id: 'maint-1',
        createdAt: '2026-01-01',
      }),
      delete: async () => undefined,
    },
    attachmentRepo: {
      getByIds: async (ids) => attachments.filter((a) => ids.includes(a.id)),
      getByParent: async (parentType, parentId) =>
        attachments.filter(
          (a) => a.parentType === parentType && a.parentId === parentId,
        ),
      save: async (input) => {
        const att: Attachment = {
          id: input.id ?? `att-${attachments.length + 1}`,
          parentType: input.parentType,
          parentId: input.parentId,
          blob: input.blob,
          mimeType: input.mimeType ?? 'image/jpeg',
          fileName: input.fileName,
          size: input.blob.size,
          createdAt: '2026-01-01',
        };
        attachments.push(att);
        return att;
      },
      delete: async (id) => {
        attachments = attachments.filter((a) => a.id !== id);
      },
      deleteMany: async (ids) => {
        attachments = attachments.filter((a) => !ids.includes(a.id));
      },
    },
    backupRepo: {
      exportSnapshot: async () => getState(),
      restoreSnapshot: async (snapshot) => {
        vehicles = [...snapshot.vehicles];
        maintenanceLogs = [...snapshot.maintenanceLogs];
        inspections = [...snapshot.inspections];
        insurances = [...snapshot.insurances];
        attachments = [...snapshot.attachments];
      },
    },
    appMetaRepo: {
      get: async <T,>(key: string) => meta[key] as T | undefined,
      set: async (key, value) => {
        meta[key] = value;
      },
    },
  };

  return { repos, getState };
}

describe('설정 화면 백업 내보내기/가져오기 및 30일 경과 안내 배너 테스트', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:backup-download');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('내보내기 → 가져오기 왕복 테스트: 사진(Blob)을 포함한 모든 데이터가 JSON으로 내보내지고 확인 후 원본 그대로 복원된다', async () => {
    const initialPhotoBlob = new Blob(['receipt-jpeg-binary-content'], {
      type: 'image/jpeg',
    });

    const initialData = {
      vehicles: [
        {
          id: 'v-1',
          name: '패밀리 쏘렌토',
          plateNumber: '12가 3456',
          manufacturerModel: '기아 쏘렌토',
          modelYear: 2023,
          currentMileage: 42000,
          displayOrder: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      maintenanceLogs: [
        {
          id: 'maint-1',
          vehicleId: 'v-1',
          date: '2026.10.15',
          mileage: 40000,
          category: 'engine_oil' as const,
          title: '합성유 엔진오일 교체',
          cost: 110000,
          shopName: '오토큐',
          attachmentIds: ['att-1'],
          createdAt: '2026-10-15T10:00:00.000Z',
        },
        {
          id: 'maint-reserved-1',
          vehicleId: 'v-1',
          status: 'reserved' as const,
          reservationTime: '11:00',
          date: '2026.12.20',
          category: 'tire' as const,
          title: '윈터타이어 교체 예약',
          cost: 80000,
          shopName: '타이어프로',
          attachmentIds: [],
          createdAt: '2026-11-27T10:00:00.000Z',
        },
      ],
      inspections: [
        {
          id: 'insp-1',
          vehicleId: 'v-1',
          inspectionDate: '2025.05.01',
          expiryDate: '2027.05.01',
          cost: 56000,
          stationName: '성산검사소',
          attachmentIds: [],
          isCurrent: true,
        },
      ],
      insurances: [
        {
          id: 'ins-1',
          vehicleId: 'v-1',
          companyName: '삼성화재',
          productName: '다이렉트 자동차보험',
          startDate: '2026.03.01',
          endDate: '2027.03.01',
          premiumCost: 690000,
          emergencyPhone: '1588-5114',
          attachmentIds: [],
          isCurrent: true,
        },
      ],
      attachments: [
        {
          id: 'att-1',
          parentType: 'maintenance' as const,
          parentId: 'maint-1',
          blob: initialPhotoBlob,
          mimeType: 'image/jpeg',
          fileName: 'oil-receipt.jpg',
          size: initialPhotoBlob.size,
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      ],
    };

    let exportedBlob: Blob | null = null;
    let exportedDownloadName = '';

    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      if (obj instanceof Blob) {
        exportedBlob = obj;
      }
      return 'blob:backup-download';
    });

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          exportedDownloadName = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    const { repos, getState } = createStatefulBackupTestRepos(initialData);

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    expect(screen.getByTestId('last-backup-date')).toHaveTextContent(
      '백업 기록 없음',
    );

    // 1. 내보내기 실행
    fireEvent.click(
      screen.getByRole('button', { name: /백업 파일 내보내기/ }),
    );

    const todayStr = formatDateDot(new Date());
    await waitFor(() => {
      expect(screen.getByTestId('last-backup-date')).toHaveTextContent(todayStr);
    });

    expect(exportedDownloadName).toBe(buildBackupFileName(todayStr));
    expect(exportedBlob).not.toBeNull();

    const exportedJsonText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exportedBlob!);
    });
    const parsedExport = JSON.parse(exportedJsonText);
    expect(parsedExport.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsedExport.data.vehicles).toHaveLength(1);
    expect(parsedExport.data.attachments).toHaveLength(1);

    // 2. 저장소 데이터를 모두 비워서 데이터 유실/초기화 상황 시뮬레이션
    await repos.backupRepo.restoreSnapshot({
      vehicles: [],
      maintenanceLogs: [],
      inspections: [],
      insurances: [],
      attachments: [],
    });
    expect(getState().vehicles).toHaveLength(0);
    expect(getState().attachments).toHaveLength(0);

    // 3. 내보냈던 JSON 파일로 가져오기 선택
    const backupFile = new File([exportedJsonText], exportedDownloadName, {
      type: 'application/json',
    });
    const importInput = screen.getByTestId('backup-import-input');
    fireEvent.change(importInput, { target: { files: [backupFile] } });

    // "기존 데이터를 덮어씁니다" 확인창 표시 검증
    await waitFor(() => {
      expect(
        screen.getByRole('alertdialog', { name: '백업 복원 확인' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('기존 데이터를 덮어씁니다')).toBeInTheDocument();

    // 복원 확인 클릭
    fireEvent.click(screen.getByRole('button', { name: '복원 확인' }));

    await waitFor(() => {
      expect(
        screen.getByText('백업 데이터를 성공적으로 복원했습니다.'),
      ).toBeInTheDocument();
    });

    // 4. 복원된 데이터가 원본(차량, 정비, 검사, 보험, 사진 Blob 내용)과 일치하는지 검증
    const restored = getState();
    expect(restored.vehicles).toEqual(initialData.vehicles);
    expect(restored.maintenanceLogs).toEqual(initialData.maintenanceLogs);
    expect(restored.inspections).toEqual(initialData.inspections);
    expect(restored.insurances).toEqual(initialData.insurances);
    expect(restored.attachments).toHaveLength(1);
    expect(restored.attachments[0].fileName).toBe('oil-receipt.jpg');

    const originalBase64 = await blobToBase64(initialPhotoBlob);
    const restoredBase64 = await blobToBase64(restored.attachments[0].blob);
    expect(restoredBase64).toBe(originalBase64);
  });

  it('잘못된 형식이나 지원하지 않는 버전의 파일이면 기존 데이터를 건드리지 않고 오류 메시지만 표시한다', async () => {
    const existingVehicle: Vehicle = {
      id: 'v-keep',
      name: '보존될 내 차',
      plateNumber: '11가 1111',
      manufacturerModel: '현대 그랜저',
      modelYear: 2024,
      currentMileage: 10000,
      displayOrder: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const { repos, getState } = createStatefulBackupTestRepos({
      vehicles: [existingVehicle],
    });

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    const importInput = screen.getByTestId('backup-import-input');

    // 1. 깨진 JSON 파일 입력
    const brokenFile = new File(['{ broken json '], 'broken.json', {
      type: 'application/json',
    });
    fireEvent.change(importInput, { target: { files: [brokenFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '유효한 JSON 형식의 백업 파일이 아닙니다.',
      );
    });
    expect(
      screen.queryByRole('alertdialog', { name: '백업 복원 확인' }),
    ).not.toBeInTheDocument();
    expect(getState().vehicles).toHaveLength(1);
    expect(getState().vehicles[0].name).toBe('보존될 내 차');

    // 2. 지원하지 않는 스키마 버전(v99) 파일 입력
    const wrongVersionFile = new File(
      [
        JSON.stringify({
          schemaVersion: 99,
          exportedAt: '2026-11-14T00:00:00.000Z',
          data: {
            vehicles: [],
            maintenanceLogs: [],
            inspections: [],
            insurances: [],
            attachments: [],
          },
        }),
      ],
      'v99.json',
      { type: 'application/json' },
    );
    fireEvent.change(importInput, { target: { files: [wrongVersionFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '지원하지 않는 백업 스키마 버전입니다.',
      );
    });
    expect(getState().vehicles).toHaveLength(1);
    expect(getState().vehicles[0].name).toBe('보존될 내 차');

    // 3. 첨부 사진의 Base64 문자열이 손상된 파일 입력 시 파일 선택 단계에서 사전 차단
    const corruptedBase64File = new File(
      [
        JSON.stringify({
          schemaVersion: 1,
          exportedAt: '2026-11-14T00:00:00.000Z',
          data: {
            vehicles: [],
            maintenanceLogs: [],
            inspections: [],
            insurances: [],
            attachments: [
              {
                id: 'att-corrupt',
                parentType: 'maintenance',
                parentId: 'm-1',
                base64Data: '%%%not-valid-base64%%%',
                mimeType: 'image/jpeg',
                fileName: 'corrupt.jpg',
                size: 100,
                createdAt: '2026-11-14T00:00:00.000Z',
              },
            ],
          },
        }),
      ],
      'corrupt-photo.json',
      { type: 'application/json' },
    );
    fireEvent.change(importInput, { target: { files: [corruptedBase64File] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '백업 파일의 첨부 사진 Base64 데이터가 손상되었습니다.',
      );
    });
    expect(
      screen.queryByRole('alertdialog', { name: '백업 복원 확인' }),
    ).not.toBeInTheDocument();
    expect(getState().vehicles).toHaveLength(1);
  });

  it('마지막 백업 날짜가 30일이 넘었으면 홈 화면에 백업 권장 배너를 표시한다', async () => {
    const thirtyFiveDaysAgo = addDays(new Date(), -35);

    const { repos } = createStatefulBackupTestRepos({
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
      ],
      meta: {
        [LAST_BACKUP_DATE_META_KEY]: thirtyFiveDaysAgo,
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

    await waitFor(() => {
      expect(
        screen.getByTestId('backup-reminder-banner'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('backup-reminder-banner'),
    ).toHaveTextContent(thirtyFiveDaysAgo);
  });

  it('사용시 주의사항 버튼을 누르면 "홈 화면 앱 설치 및 데이터 보호 안내" 모달이 표시되고 닫힌다', async () => {
    const { repos } = createStatefulBackupTestRepos();

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    const noticeButton = await screen.findByRole('button', {
      name: /사용시 주의사항/,
    });
    fireEvent.click(noticeButton);

    await waitFor(() => {
      expect(screen.getByTestId('ios-install-guide')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ios-install-guide')).toHaveTextContent(
      'iPhone은 Safari 공유 → 홈 화면에 추가',
    );

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByTestId('ios-install-guide')).not.toBeInTheDocument();
  });

  it('도움말 보기 버튼을 누르면 도움말 모달이 열리고 닫기 버튼으로 닫힌다', async () => {
    const { repos } = createStatefulBackupTestRepos();

    render(
      <RepositoryProvider repositories={repos}>
        <ActiveVehicleProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <AppRoutes />
          </MemoryRouter>
        </ActiveVehicleProvider>
      </RepositoryProvider>,
    );

    const helpButton = await screen.findByRole('button', {
      name: /도움말 보기/,
    });
    fireEvent.click(helpButton);

    expect(
      screen.getByRole('dialog', { name: '내 차 관리 도움말' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/나의 차고 \(차량 관리\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(
      screen.queryByRole('dialog', { name: '내 차 관리 도움말' }),
    ).not.toBeInTheDocument();
  });
});
