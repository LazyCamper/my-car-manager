import {
  Attachment,
  AttachmentParentType,
  BackupDataSnapshot,
  Inspection,
  Insurance,
  MaintenanceLog,
  MAX_ATTACHMENTS_PER_ITEM,
  Vehicle,
  VehicleInput,
} from '../../domain/models';
import {
  AppRepositories,
  IAppMetaRepository,
  IAttachmentRepository,
  IBackupRepository,
  IComplianceRepository,
  IMaintenanceRepository,
  IVehicleRepository,
} from '../interfaces';
import { CarManagerDatabase, defaultDb } from './db';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function assertAttachmentLimit(attachmentIds: string[]): void {
  if (attachmentIds.length > MAX_ATTACHMENTS_PER_ITEM) {
    throw new Error(
      `첨부 사진은 최대 ${MAX_ATTACHMENTS_PER_ITEM}장까지만 등록할 수 있습니다.`,
    );
  }
}

export const INITIAL_SAMPLE_SEEDED_KEY = 'initialSampleVehicleSeeded';
export const INITIAL_SAMPLE_DETAILS_SEEDED_KEY = 'initialSampleDetailsSeeded';

function offsetDateDot(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export function createInitialSampleVehicle(): Vehicle {
  const now = new Date().toISOString();
  const todayDot = now.slice(0, 10).replace(/-/g, '.');
  return {
    id: 'sample-vehicle-1',
    name: '패밀리 SUV (샘플)',
    plateNumber: '123가 4568',
    manufacturerModel: '기아 쏘렌토 하이브리드',
    modelYear: 2024,
    currentMileage: 18500,
    mileageUpdatedAt: todayDot,
    registrationDate: '2024.03.15',
    purchaseDate: '2024.03.20',
    purchaseMileage: 15,
    purchasePrice: 43500000,
    vehiclePrice: 45200000,
    colorSpec: '스노우 화이트 펄 (SWP)',
    tireSize: '235/55R19 (36psi)',
    engineSpec: '1,598cc 직렬 4기통 가솔린 터보 하이브리드',
    performanceSpec: '시스템 최고출력 235마력 · 최대토크 35.7kg·m',
    transmission: '자동 6단',
    fuelSpec: '67L · 복합연비 15.7km/L',
    dimensionSpec: '전장/전폭 4815/1900mm · 축거 2815mm · 공차중량 1825kg',
    consumablesSpec: '와이퍼 운전석 650mm / 조수석 400mm',
    options: '드라이브 와이즈, 파노라마 선루프, 빌트인 캠 2',
    tinting: '전면 35%, 측후면 15%',
    memo: '샘플로 등록된 차량입니다. [차량 수정] 버튼에서 내 차량 정보로 수정하거나 삭제할 수 있습니다.',
    backgroundImage: 'suv',
    displayOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialSampleMaintenanceLogs(
  vehicleId: string,
): MaintenanceLog[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'sample-maint-1',
      vehicleId,
      date: offsetDateDot(-60),
      mileage: 16200,
      category: 'engine_oil',
      categories: ['engine_oil', 'filter'],
      title: '합성유 엔진오일 및 오일필터 교체',
      shopName: '오토큐 성수점',
      cost: 135000,
      nextDueDate: offsetDateDot(120),
      nextDueMileage: 26000,
      isDueCompleted: false,
      memo: '합성유 0W-20 교체 및 하부 누유 점검 이상 없음 (샘플)',
      attachmentIds: [],
      createdAt: now,
    },
    {
      id: 'sample-maint-2',
      vehicleId,
      date: offsetDateDot(-14),
      mileage: 18100,
      category: 'filter',
      categories: ['filter', 'other'],
      title: '에어컨 필터 및 와이퍼 블레이드 교체',
      shopName: '자가 정비',
      cost: 48000,
      isDueCompleted: false,
      memo: '활성탄 항균 필터 교체 (운전석 650mm / 조수석 400mm)',
      attachmentIds: [],
      createdAt: now,
    },
  ];
}

export function createInitialSampleInspection(vehicleId: string): Inspection {
  return {
    id: 'sample-insp-1',
    vehicleId,
    inspectionDate: '2024.03.15',
    expiryDate: offsetDateDot(280),
    stationName: '교통안전공단 검사소',
    cost: 0,
    memo: '신차 최초 등록 기준 첫 정기검사 예정 (샘플 데이터)',
    attachmentIds: [],
    isCurrent: true,
  };
}

export function createInitialSampleInsurance(vehicleId: string): Insurance {
  return {
    id: 'sample-ins-1',
    vehicleId,
    companyName: '삼성화재',
    productName: '다이렉트 개인용 자동차보험',
    emergencyPhone: '1588-5114',
    startDate: offsetDateDot(-315),
    endDate: offsetDateDot(50),
    premiumCost: 785000,
    memo: '대인Ⅱ 무한 · 대물 10억 · 자기신체사고 · 긴급출동 특약 (샘플)',
    attachmentIds: [],
    isCurrent: true,
  };
}

export class DexieVehicleRepository implements IVehicleRepository {
  constructor(private readonly db: CarManagerDatabase = defaultDb) {}

  async getAll(): Promise<Vehicle[]> {
    const list = await this.db.vehicles.toArray();
    if (list.length === 0) {
      const seeded = await this.db.transaction(
        'rw',
        [
          this.db.vehicles,
          this.db.maintenanceLogs,
          this.db.inspections,
          this.db.insurances,
          this.db.appMeta,
        ],
        async () => {
          const currentCount = await this.db.vehicles.count();
          if (currentCount > 0) {
            return this.db.vehicles.toArray();
          }
          const flag = await this.db.appMeta.get(INITIAL_SAMPLE_SEEDED_KEY);
          if (flag?.value) {
            return [];
          }
          const sampleVehicle = createInitialSampleVehicle();
          const sampleLogs = createInitialSampleMaintenanceLogs(
            sampleVehicle.id,
          );
          const sampleInspection = createInitialSampleInspection(
            sampleVehicle.id,
          );
          const sampleInsurance = createInitialSampleInsurance(
            sampleVehicle.id,
          );
          await this.db.vehicles.put(sampleVehicle);
          await this.db.maintenanceLogs.bulkPut(sampleLogs);
          await this.db.inspections.put(sampleInspection);
          await this.db.insurances.put(sampleInsurance);
          await this.db.appMeta.put({
            key: INITIAL_SAMPLE_SEEDED_KEY,
            value: true,
          });
          await this.db.appMeta.put({
            key: INITIAL_SAMPLE_DETAILS_SEEDED_KEY,
            value: true,
          });
          return [sampleVehicle];
        },
      );
      return seeded.sort((a, b) => a.displayOrder - b.displayOrder);
    }

    const hasSampleVehicle = list.some((v) => v.id === 'sample-vehicle-1');
    if (hasSampleVehicle) {
      await this.db.transaction(
        'rw',
        [
          this.db.maintenanceLogs,
          this.db.inspections,
          this.db.insurances,
          this.db.appMeta,
        ],
        async () => {
          const detailsFlag = await this.db.appMeta.get(
            INITIAL_SAMPLE_DETAILS_SEEDED_KEY,
          );
          if (detailsFlag?.value) return;

          const [existingMaint, existingInsp, existingIns] = await Promise.all([
            this.db.maintenanceLogs
              .where('vehicleId')
              .equals('sample-vehicle-1')
              .toArray(),
            this.db.inspections
              .where('vehicleId')
              .equals('sample-vehicle-1')
              .toArray(),
            this.db.insurances
              .where('vehicleId')
              .equals('sample-vehicle-1')
              .toArray(),
          ]);

          if (existingMaint.length === 0) {
            await this.db.maintenanceLogs.bulkPut(
              createInitialSampleMaintenanceLogs('sample-vehicle-1'),
            );
          }
          if (existingInsp.length === 0) {
            await this.db.inspections.put(
              createInitialSampleInspection('sample-vehicle-1'),
            );
          }
          if (existingIns.length === 0) {
            await this.db.insurances.put(
              createInitialSampleInsurance('sample-vehicle-1'),
            );
          }
          await this.db.appMeta.put({
            key: INITIAL_SAMPLE_DETAILS_SEEDED_KEY,
            value: true,
          });
        },
      );
    }

    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getById(id: string): Promise<Vehicle | undefined> {
    return this.db.vehicles.get(id);
  }

  async save(input: VehicleInput): Promise<Vehicle> {
    const now = new Date().toISOString();
    const todayDot = now.slice(0, 10).replace(/-/g, '.');
    const optionalSpecs = {
      mileageUpdatedAt: input.mileageUpdatedAt?.trim() || undefined,
      registrationDate: input.registrationDate?.trim() || undefined,
      purchaseDate: input.purchaseDate?.trim() || undefined,
      purchaseMileage:
        typeof input.purchaseMileage === 'number' &&
        Number.isFinite(input.purchaseMileage) &&
        input.purchaseMileage >= 0
          ? Math.round(input.purchaseMileage)
          : undefined,
      purchasePrice:
        typeof input.purchasePrice === 'number' &&
        Number.isFinite(input.purchasePrice) &&
        input.purchasePrice >= 0
          ? Math.round(input.purchasePrice)
          : undefined,
      vin: input.vin?.trim() || undefined,
      engineSpec: input.engineSpec?.trim() || undefined,
      performanceSpec: input.performanceSpec?.trim() || undefined,
      fuelSpec: input.fuelSpec?.trim() || undefined,
      transmission: input.transmission?.trim() || undefined,
      tireSize: input.tireSize?.trim() || undefined,
      dimensionSpec: input.dimensionSpec?.trim() || undefined,
      consumablesSpec: input.consumablesSpec?.trim() || undefined,
      colorSpec: input.colorSpec?.trim() || undefined,
      vehiclePrice:
        typeof input.vehiclePrice === 'number' &&
        Number.isFinite(input.vehiclePrice) &&
        input.vehiclePrice >= 0
          ? Math.round(input.vehiclePrice)
          : undefined,
      options: input.options?.trim() || undefined,
      tinting: input.tinting?.trim() || undefined,
      memo: input.memo?.trim() || undefined,
      backgroundImage: input.backgroundImage?.trim() || undefined,
    };

    if (input.id) {
      const existing = await this.db.vehicles.get(input.id);
      if (existing) {
        const nextMileage = Number(input.currentMileage);
        const mileageChanged = nextMileage !== existing.currentMileage;
        const resolvedMileageDate =
          optionalSpecs.mileageUpdatedAt ??
          (mileageChanged ? todayDot : existing.mileageUpdatedAt);
        const updated: Vehicle = {
          ...existing,
          ...optionalSpecs,
          name: input.name.trim(),
          plateNumber: input.plateNumber.trim(),
          manufacturerModel: input.manufacturerModel.trim(),
          modelYear: Number(input.modelYear),
          currentMileage: nextMileage,
          mileageUpdatedAt: resolvedMileageDate,
          displayOrder: input.displayOrder ?? existing.displayOrder,
          updatedAt: now,
        };
        await this.db.vehicles.put(updated);
        return updated;
      }
    }

    const count = await this.db.vehicles.count();
    const created: Vehicle = {
      id: input.id ?? generateId(),
      name: input.name.trim(),
      plateNumber: input.plateNumber.trim(),
      manufacturerModel: input.manufacturerModel.trim(),
      modelYear: Number(input.modelYear),
      currentMileage: Number(input.currentMileage),
      ...optionalSpecs,
      mileageUpdatedAt: optionalSpecs.mileageUpdatedAt ?? todayDot,
      displayOrder: input.displayOrder ?? count,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.vehicles.put(created);
    await this.db.appMeta.put({ key: INITIAL_SAMPLE_SEEDED_KEY, value: true });
    return created;
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.vehicles,
        this.db.maintenanceLogs,
        this.db.inspections,
        this.db.insurances,
        this.db.attachments,
      ],
      async () => {
        const maintList = await this.db.maintenanceLogs
          .where('vehicleId')
          .equals(id)
          .toArray();
        const inspList = await this.db.inspections
          .where('vehicleId')
          .equals(id)
          .toArray();
        const insList = await this.db.insurances
          .where('vehicleId')
          .equals(id)
          .toArray();

        const attachmentIdsToDelete = [
          ...maintList.flatMap((m) => m.attachmentIds),
          ...inspList.flatMap((i) => i.attachmentIds),
          ...insList.flatMap((i) => i.attachmentIds),
        ];

        if (attachmentIdsToDelete.length > 0) {
          await this.db.attachments.bulkDelete(attachmentIdsToDelete);
        }

        await this.db.maintenanceLogs.where('vehicleId').equals(id).delete();
        await this.db.inspections.where('vehicleId').equals(id).delete();
        await this.db.insurances.where('vehicleId').equals(id).delete();
        await this.db.vehicles.delete(id);
      },
    );
  }
}

export class DexieComplianceRepository implements IComplianceRepository {
  constructor(private readonly db: CarManagerDatabase = defaultDb) {}

  async getCurrentInspection(vehicleId: string): Promise<Inspection | undefined> {
    const items = await this.db.inspections
      .where('vehicleId')
      .equals(vehicleId)
      .toArray();
    if (items.length === 0) return undefined;
    const current = items.find((item) => item.isCurrent);
    if (current) return current;
    return items.sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))[0];
  }

  async getInspectionsByVehicle(vehicleId: string): Promise<Inspection[]> {
    const items = await this.db.inspections
      .where('vehicleId')
      .equals(vehicleId)
      .toArray();
    return items.sort((a, b) => b.expiryDate.localeCompare(a.expiryDate));
  }

  async saveInspection(
    input: Omit<Inspection, 'id'> & { id?: string },
  ): Promise<Inspection> {
    assertAttachmentLimit(input.attachmentIds);
    const record: Inspection = {
      ...input,
      id: input.id ?? generateId(),
    };
    await this.db.transaction('rw', this.db.inspections, async () => {
      if (record.isCurrent) {
        const existing = await this.db.inspections
          .where('vehicleId')
          .equals(record.vehicleId)
          .toArray();
        for (const item of existing) {
          if (item.id !== record.id && item.isCurrent) {
            await this.db.inspections.put({ ...item, isCurrent: false });
          }
        }
      }
      await this.db.inspections.put(record);
    });
    return record;
  }

  async deleteInspection(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.inspections, this.db.attachments],
      async () => {
        const target = await this.db.inspections.get(id);
        if (target?.attachmentIds.length) {
          await this.db.attachments.bulkDelete(target.attachmentIds);
        }
        await this.db.inspections.delete(id);
        if (target?.isCurrent) {
          const remaining = await this.db.inspections
            .where('vehicleId')
            .equals(target.vehicleId)
            .toArray();
          if (remaining.length > 0) {
            remaining.sort((a, b) => b.expiryDate.localeCompare(a.expiryDate));
            await this.db.inspections.put({ ...remaining[0], isCurrent: true });
          }
        }
      },
    );
  }

  async getCurrentInsurance(vehicleId: string): Promise<Insurance | undefined> {
    const items = await this.db.insurances
      .where('vehicleId')
      .equals(vehicleId)
      .toArray();
    if (items.length === 0) return undefined;
    const current = items.find((item) => item.isCurrent);
    if (current) return current;
    return items.sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  }

  async getInsurancesByVehicle(vehicleId: string): Promise<Insurance[]> {
    const items = await this.db.insurances
      .where('vehicleId')
      .equals(vehicleId)
      .toArray();
    return items.sort((a, b) => b.endDate.localeCompare(a.endDate));
  }

  async saveInsurance(
    input: Omit<Insurance, 'id'> & { id?: string },
  ): Promise<Insurance> {
    assertAttachmentLimit(input.attachmentIds);
    const record: Insurance = {
      ...input,
      id: input.id ?? generateId(),
    };
    await this.db.transaction(
      'rw',
      [this.db.insurances, this.db.attachments],
      async () => {
        if (record.isCurrent) {
          const existing = await this.db.insurances
            .where('vehicleId')
            .equals(record.vehicleId)
            .toArray();
          for (const item of existing) {
            if (item.id !== record.id && item.isCurrent) {
              await this.db.insurances.put({ ...item, isCurrent: false });
            }
          }
        }
        await this.db.insurances.put(record);
        if (record.attachmentIds.length > 0) {
          await this.db.attachments
            .where('id')
            .anyOf(record.attachmentIds)
            .modify({ parentId: record.id });
        }
      },
    );
    return record;
  }

  async deleteInsurance(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.insurances, this.db.attachments],
      async () => {
        const target = await this.db.insurances.get(id);
        if (target?.attachmentIds.length) {
          await this.db.attachments.bulkDelete(target.attachmentIds);
        }
        await this.db.insurances.delete(id);
        if (target?.isCurrent) {
          const remaining = await this.db.insurances
            .where('vehicleId')
            .equals(target.vehicleId)
            .toArray();
          if (remaining.length > 0) {
            remaining.sort((a, b) => b.endDate.localeCompare(a.endDate));
            await this.db.insurances.put({ ...remaining[0], isCurrent: true });
          }
        }
      },
    );
  }
}

export class DexieMaintenanceRepository implements IMaintenanceRepository {
  constructor(private readonly db: CarManagerDatabase = defaultDb) {}

  async getByVehicle(vehicleId: string): Promise<MaintenanceLog[]> {
    const items = await this.db.maintenanceLogs
      .where('vehicleId')
      .equals(vehicleId)
      .toArray();
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getUpcomingDueByVehicle(vehicleId: string): Promise<MaintenanceLog[]> {
    const items = await this.db.maintenanceLogs
      .where('vehicleId')
      .equals(vehicleId)
      .toArray();
    return items.filter(
      (item) =>
        item.status === 'reserved' ||
        (Boolean(item.nextDueDate) && !item.isDueCompleted),
    );
  }

  async save(
    input: Omit<MaintenanceLog, 'id' | 'createdAt'> & { id?: string },
  ): Promise<MaintenanceLog> {
    assertAttachmentLimit(input.attachmentIds);
    const now = new Date().toISOString();
    const existing = input.id
      ? await this.db.maintenanceLogs.get(input.id)
      : undefined;
    const record: MaintenanceLog = {
      ...input,
      id: input.id ?? generateId(),
      createdAt: existing?.createdAt ?? now,
    };
    await this.db.transaction(
      'rw',
      [this.db.maintenanceLogs, this.db.attachments],
      async () => {
        await this.db.maintenanceLogs.put(record);
        if (record.attachmentIds.length > 0) {
          await this.db.attachments
            .where('id')
            .anyOf(record.attachmentIds)
            .modify({ parentId: record.id });
        }
      },
    );
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.maintenanceLogs, this.db.attachments],
      async () => {
        const target = await this.db.maintenanceLogs.get(id);
        if (target?.attachmentIds.length) {
          await this.db.attachments.bulkDelete(target.attachmentIds);
        }
        await this.db.maintenanceLogs.delete(id);
      },
    );
  }
}

export class DexieAttachmentRepository implements IAttachmentRepository {
  constructor(private readonly db: CarManagerDatabase = defaultDb) {}

  async getByIds(ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) return [];
    const results = await this.db.attachments.bulkGet(ids);
    return results.filter((item): item is Attachment => Boolean(item));
  }

  async getByParent(
    parentType: AttachmentParentType,
    parentId: string,
  ): Promise<Attachment[]> {
    const items = await this.db.attachments
      .where('[parentType+parentId]')
      .equals([parentType, parentId])
      .toArray();
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async save(input: {
    id?: string;
    parentType: AttachmentParentType;
    parentId: string;
    blob: Blob;
    fileName: string;
    mimeType?: string;
  }): Promise<Attachment> {
    const record: Attachment = {
      id: input.id ?? generateId(),
      parentType: input.parentType,
      parentId: input.parentId,
      blob: input.blob,
      mimeType: input.mimeType ?? (input.blob.type || 'image/jpeg'),
      fileName: input.fileName,
      size: input.blob.size,
      createdAt: new Date().toISOString(),
    };
    await this.db.attachments.put(record);
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.db.attachments.delete(id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.attachments.bulkDelete(ids);
  }
}

export class DexieBackupRepository implements IBackupRepository {
  constructor(private readonly db: CarManagerDatabase = defaultDb) {}

  async exportSnapshot(): Promise<BackupDataSnapshot> {
    const [vehicles, maintenanceLogs, inspections, insurances, attachments] =
      await Promise.all([
        this.db.vehicles.toArray(),
        this.db.maintenanceLogs.toArray(),
        this.db.inspections.toArray(),
        this.db.insurances.toArray(),
        this.db.attachments.toArray(),
      ]);

    return {
      vehicles,
      maintenanceLogs,
      inspections,
      insurances,
      attachments,
    };
  }

  async restoreSnapshot(snapshot: BackupDataSnapshot): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.vehicles,
        this.db.maintenanceLogs,
        this.db.inspections,
        this.db.insurances,
        this.db.attachments,
        this.db.appMeta,
      ],
      async () => {
        await Promise.all([
          this.db.vehicles.clear(),
          this.db.maintenanceLogs.clear(),
          this.db.inspections.clear(),
          this.db.insurances.clear(),
          this.db.attachments.clear(),
        ]);

        await this.db.appMeta.put({
          key: INITIAL_SAMPLE_SEEDED_KEY,
          value: true,
        });

        if (snapshot.vehicles.length > 0) {
          await this.db.vehicles.bulkPut(snapshot.vehicles);
        }
        if (snapshot.maintenanceLogs.length > 0) {
          await this.db.maintenanceLogs.bulkPut(snapshot.maintenanceLogs);
        }
        if (snapshot.inspections.length > 0) {
          await this.db.inspections.bulkPut(snapshot.inspections);
        }
        if (snapshot.insurances.length > 0) {
          await this.db.insurances.bulkPut(snapshot.insurances);
        }
        if (snapshot.attachments.length > 0) {
          await this.db.attachments.bulkPut(snapshot.attachments);
        }
      },
    );
  }
}

export class DexieAppMetaRepository implements IAppMetaRepository {
  constructor(private readonly db: CarManagerDatabase = defaultDb) {}

  async get<T = string>(key: string): Promise<T | undefined> {
    const record = await this.db.appMeta.get(key);
    return record?.value as T | undefined;
  }

  async set<T = string>(key: string, value: T): Promise<void> {
    await this.db.appMeta.put({ key, value });
  }
}

export function createDexieRepositories(
  db: CarManagerDatabase = defaultDb,
): AppRepositories {
  return {
    vehicleRepo: new DexieVehicleRepository(db),
    complianceRepo: new DexieComplianceRepository(db),
    maintenanceRepo: new DexieMaintenanceRepository(db),
    attachmentRepo: new DexieAttachmentRepository(db),
    backupRepo: new DexieBackupRepository(db),
    appMetaRepo: new DexieAppMetaRepository(db),
  };
}
