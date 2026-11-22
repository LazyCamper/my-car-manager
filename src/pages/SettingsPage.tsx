import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveVehicle } from '../app/ActiveVehicleContext';
import { useRepositories } from '../app/RepositoryContext';
import {
  BackupFilePayload,
  LAST_BACKUP_DATE_META_KEY,
} from '../domain/models';
import {
  buildBackupFileName,
  deserializeBackupPayload,
  parseAndValidateBackupJson,
  serializeBackupSnapshot,
} from '../features/backup';
import { formatDateDot } from '../shared/utils';

function triggerJsonDownload(jsonContent: string, fileName: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    };
    reader.readAsText(file);
  });
}

export const SettingsPage: React.FC = () => {
  const { backupRepo, appMetaRepo } = useRepositories();
  const { refreshVehicles } = useActiveVehicle();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [lastBackupDate, setLastBackupDate] = useState<string | undefined>(
    undefined,
  );
  const [pendingPayload, setPendingPayload] =
    useState<BackupFilePayload | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isNoticeOpen, setIsNoticeOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  const loadBackupMeta = useCallback(async () => {
    const savedDate = await appMetaRepo.get<string>(LAST_BACKUP_DATE_META_KEY);
    setLastBackupDate(savedDate);
  }, [appMetaRepo]);

  useEffect(() => {
    void loadBackupMeta();
  }, [loadBackupMeta]);

  const handleExportBackup = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsProcessing(true);

    try {
      const snapshot = await backupRepo.exportSnapshot();
      const jsonContent = await serializeBackupSnapshot(snapshot);
      const todayStr = formatDateDot(new Date());
      const fileName = buildBackupFileName(todayStr);

      triggerJsonDownload(jsonContent, fileName);

      await appMetaRepo.set(LAST_BACKUP_DATE_META_KEY, todayStr);
      setLastBackupDate(todayStr);
      setStatusMessage(`백업 파일(${fileName})을 내보냈습니다.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : '백업 내보내기 중 오류가 발생했습니다.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);
    setPendingPayload(null);

    try {
      const rawText = await readFileAsText(file);
      const validated = parseAndValidateBackupJson(rawText);
      setPendingFileName(file.name);
      setPendingPayload(validated);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : '유효하지 않은 백업 파일입니다.',
      );
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingPayload) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsProcessing(true);

    try {
      const snapshot = deserializeBackupPayload(pendingPayload);
      await backupRepo.restoreSnapshot(snapshot);

      const todayStr = formatDateDot(new Date());
      await appMetaRepo.set(LAST_BACKUP_DATE_META_KEY, todayStr);
      setLastBackupDate(todayStr);
      await refreshVehicles();

      setPendingPayload(null);
      setStatusMessage('백업 데이터를 성공적으로 복원했습니다.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : '데이터 복원 중 오류가 발생했습니다.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section aria-labelledby="settings-title" className="settings-page">
      <header className="page-header garage-hero-banner garage-hero-banner--settings">
        <div className="garage-hero-content">
          <span className="garage-hero-eyebrow">DATA &amp; SYSTEM PREFERENCES</span>
          <h1 id="settings-title" className="page-title garage-hero-title">
            설정
          </h1>
          <p className="garage-hero-subtitle">
            데이터 JSON 백업·복원 및 오프라인 앱 저장소 환경 관리
          </p>
        </div>
      </header>

      <section
        className="backup-card"
        aria-labelledby="backup-section-heading"
      >
        <div className="backup-card-header">
          <h2 id="backup-section-heading" className="section-title">
            데이터 백업 및 복원
          </h2>
          <p className="backup-card-desc">
            모든 차량 정보, 정비·검사·보험 기록, 첨부된 영수증/서류 사진을 JSON 파일 하나로 내보내거나 복원할 수 있습니다.
          </p>
        </div>

        <div className="backup-last-date-box">
          <span className="backup-last-date-label">마지막 백업 날짜</span>
          <strong
            className="backup-last-date-value"
            data-testid="last-backup-date"
          >
            {lastBackupDate ?? '백업 기록 없음'}
          </strong>
        </div>

        {errorMessage && (
          <p className="form-error-banner" role="alert">
            {errorMessage}
          </p>
        )}

        {statusMessage && (
          <p className="backup-success-banner" role="status">
            {statusMessage}
          </p>
        )}

        <div className="backup-actions-grid">
          <button
            type="button"
            className="btn btn-primary touch-target"
            onClick={() => void handleExportBackup()}
            disabled={isProcessing}
          >
            📥 백업 파일 내보내기 (JSON)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            data-testid="backup-import-input"
            aria-label="백업 JSON 파일 선택"
            onChange={(e) => void handleFileChange(e)}
            disabled={isProcessing}
          />
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            📤 백업 파일 가져오기 (복원)
          </button>
        </div>

        {pendingPayload && (
          <div
            className="restore-confirm-box"
            role="alertdialog"
            aria-label="백업 복원 확인"
          >
            <strong className="restore-confirm-title">
              기존 데이터를 덮어씁니다
            </strong>
            <p className="restore-confirm-desc">
              선택한 파일(<strong>{pendingFileName}</strong>)로 복원하면 현재 저장된 모든 차량·정비·검사·보험 및 사진 데이터가 백업 파일 내용으로 교체됩니다. 계속하시겠습니까?
            </p>
            <p className="restore-confirm-summary">
              포함된 항목: 차량 {pendingPayload.data.vehicles.length}대 · 정비{' '}
              {pendingPayload.data.maintenanceLogs.length}건 · 검사{' '}
              {pendingPayload.data.inspections.length}건 · 보험{' '}
              {pendingPayload.data.insurances.length}건 · 사진{' '}
              {pendingPayload.data.attachments.length}장
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary touch-target"
                onClick={() => setPendingPayload(null)}
                disabled={isProcessing}
              >
                복원 취소
              </button>
              <button
                type="button"
                className="btn btn-danger touch-target"
                onClick={() => void handleConfirmRestore()}
                disabled={isProcessing}
              >
                복원 확인
              </button>
            </div>
          </div>
        )}
      </section>

      <section
        className="backup-card help-card"
        aria-labelledby="help-section-heading"
      >
        <div className="backup-card-header">
          <h2 id="help-section-heading" className="section-title">
            앱 사용 가이드
          </h2>
          <p className="backup-card-desc">
            차량 관리, 정비·검사·보험 기록, 통합 D-day 및 백업 기능을 한눈에 확인해 보세요.
          </p>
        </div>
        <div className="backup-actions-grid">
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={() => setIsNoticeOpen(true)}
          >
            ⚠️ 사용시 주의사항
          </button>
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={() => setIsHelpOpen(true)}
          >
            📖 도움말 보기
          </button>
        </div>
      </section>

      <section
        className="backup-card related-apps-card"
        aria-labelledby="related-apps-heading"
      >
        <div className="backup-card-header">
          <h2 id="related-apps-heading" className="section-title">
            다른 앱 바로가기
          </h2>
          <p className="backup-card-desc">
            함께 만든 웹 앱들도 바로 열어볼 수 있어요.
          </p>
        </div>
        <div className="related-apps-list">
          <a
            href="https://lazycamper.github.io/my-whisky-collection/"
            target="_blank"
            rel="noopener noreferrer"
            className="related-app-link touch-target"
          >
            <span className="related-app-icon" aria-hidden="true">
              🥃
            </span>
            <span className="related-app-info">
              <strong>My Whisky Collection</strong>
              <span>나만의 위스키 보관함 · 시음 노트</span>
            </span>
            <span className="related-app-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
          <a
            href="https://lazycamper.github.io/subin-music-code/"
            target="_blank"
            rel="noopener noreferrer"
            className="related-app-link touch-target"
          >
            <span className="related-app-icon" aria-hidden="true">
              🎵
            </span>
            <span className="related-app-info">
              <strong>Subin Music Code</strong>
              <span>음악 · 코드 학습 웹 앱</span>
            </span>
            <span className="related-app-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </section>

      {isNoticeOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notice-modal-title"
          data-testid="ios-install-guide"
        >
          <div className="modal-sheet help-modal-sheet">
            <header className="modal-header">
              <h2 id="notice-modal-title" className="modal-title">
                사용시 주의사항
              </h2>
              <button
                type="button"
                className="btn-icon touch-target"
                onClick={() => setIsNoticeOpen(false)}
                aria-label="주의사항 닫기"
              >
                ✕
              </button>
            </header>

            <div className="help-guide-list">
              <div className="help-guide-item">
                <h3>📱 홈 화면 앱 설치 및 데이터 보호 안내</h3>
                <p className="ios-guide-highlight">
                  📱 <strong>iPhone은 Safari 공유 → 홈 화면에 추가</strong>로 설치해 주세요.
                </p>
                <p className="backup-card-desc">
                  iPhone(iOS) 일반 브라우저 탭에서 실행하면 7일 이상 미접속 시 브라우저 정책으로 저장 데이터가 지워질 수 있습니다. 홈 화면에 추가하여 앱(Standalone)으로 사용하고, 주기적으로 JSON 백업 파일을 보관해 주세요.
                </p>
              </div>

              <div className="help-guide-item">
                <h3>🔄 기기·브라우저 간 자동 동기화 미지원</h3>
                <ul>
                  <li>
                    별도의 서버나 로그인 없이 <strong>현재 사용 중인 기기와 브라우저 내부</strong>에만 데이터가 저장됩니다.
                  </li>
                  <li>
                    PC와 스마트폰 간, 또는 Safari와 Chrome 간에는 데이터가 자동으로 공유되지 않으므로 기기를 옮길 때는 <strong>JSON 백업 내보내기/가져오기</strong>를 이용해 주세요.
                  </li>
                </ul>
              </div>

              <div className="help-guide-item">
                <h3>🧹 사이트 데이터 삭제 및 시크릿 모드 주의</h3>
                <ul>
                  <li>
                    브라우저 설정에서 <strong>인터넷 사용 기록 / 사이트 데이터 삭제</strong>를 실행하면 저장된 차량·정비·사진 데이터가 함께 지워질 수 있습니다.
                  </li>
                  <li>
                    <strong>시크릿(프라이빗) 모드</strong>에서는 창을 닫을 때 모든 데이터가 사라지므로 일반 브라우저 또는 홈 화면에 추가한 앱으로 사용해 주세요.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary touch-target"
                onClick={() => setIsNoticeOpen(false)}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {isHelpOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
        >
          <div className="modal-sheet help-modal-sheet">
            <header className="modal-header">
              <h2 id="help-modal-title" className="modal-title">
                내 차 관리 도움말
              </h2>
              <button
                type="button"
                className="btn-icon touch-target"
                onClick={() => setIsHelpOpen(false)}
                aria-label="도움말 닫기"
              >
                ✕
              </button>
            </header>

            <div className="help-guide-list">
              <div className="help-guide-item">
                <h3>🚗 나의 차고 (차량 관리)</h3>
                <ul>
                  <li>
                    <strong>차량 등록·수정:</strong> 차량별 기본 정보부터 상세 제원, 옵션, 틴팅, 관리 메모까지 기록할 수 있습니다.
                  </li>
                  <li>
                    <strong>카드 배경 꾸미기:</strong> 차량 수정에서 차종별 프리셋이나 내 차 사진을 배경으로 지정할 수 있습니다.
                  </li>
                  <li>
                    <strong>순서 변경:</strong> 차량 카드를 드래그하여 원하는 순서로 정렬할 수 있습니다.
                  </li>
                  <li>
                    <strong>통합 D-day:</strong> 선택한 차량의 검사 만기일, 보험 만기일, 미완료 정비 예정일이 임박순으로 표시됩니다.
                  </li>
                </ul>
              </div>

              <div className="help-guide-item">
                <h3>🔧 정비 이력 관리</h3>
                <ul>
                  <li>
                    <strong>누적 비용 &amp; 필터:</strong> 엔진오일, 타이어, 브레이크 등 항목별 필터와 총 지출 비용을 확인할 수 있습니다.
                  </li>
                  <li>
                    <strong>다음 정비 예정:</strong> 다음 정비 예정일과 목표 주행거리를 입력해 두면 홈 화면 D-day에 자동 연동됩니다.
                  </li>
                  <li>
                    <strong>사진 첨부:</strong> 영수증이나 정비 사진을 항목당 최대 5장까지 압축 저장할 수 있습니다.
                  </li>
                </ul>
              </div>

              <div className="help-guide-item">
                <h3>🛡️ 검사 · 보험 관리</h3>
                <ul>
                  <li>
                    <strong>유효 항목 &amp; 이력:</strong> 현재 유효한 검사와 보험은 상단에 강조 표시되며, 갱신 시 기존 내역은 지난 이력으로 보관됩니다.
                  </li>
                  <li>
                    <strong>긴급출동 연결:</strong> 보험 연락처를 입력해 두면 버튼 하나로 바로 전화를 걸 수 있습니다.
                  </li>
                </ul>
              </div>

              <div className="help-guide-item">
                <h3>💾 오프라인 저장 및 백업</h3>
                <ul>
                  <li>
                    <strong>로컬 저장:</strong> 모든 데이터는 서버로 전송되지 않고 내 기기(브라우저)에 안전하게 저장됩니다.
                  </li>
                  <li>
                    <strong>JSON 백업:</strong> 기기 변경이나 브라우저 초기화에 대비해 주기적으로 백업 파일을 내보내 보관해 주세요.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary touch-target"
                onClick={() => setIsHelpOpen(false)}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
