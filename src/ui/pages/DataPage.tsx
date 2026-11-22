import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackupFile, RestoreMode, RestorePlan, exportBackup, parseBackup, planRestore, restoreBackup } from '../../db/backup';
import { deleteProject } from '../../db/repo';
import { checkIntegrity } from '../../domain/integrity';
import { useBundle } from '../App';
import { Modal, errorMessage, fmtDate, safeFileName, saveBlob, useUi } from '../common';

const COUNT_LABEL: Record<string, string> = {
  variables: '변수', hypotheses: '가설', literature: '문헌', evidence: '근거', attachments: '첨부', meetings: '면담 준비',
  feedback: '피드백', changeRequests: '변경 요청', impactReviews: '영향 검토', proposalVersions: '계획서 버전', changeLog: '수정 이력',
};

export function RestoreDialog({ onClose, onDone }: { onClose: () => void; onDone: (projectId: string) => void }) {
  const { toast, confirm } = useUi();
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setBackup(null);
    setPlan(null);
    setError('');
    if (!file) return;
    try {
      if (file.size > 400 * 1024 * 1024) throw new Error('파일이 너무 큽니다.');
      const parsed = parseBackup(await file.text());
      setPlan(await planRestore(parsed));
      setBackup(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const go = async (mode: RestoreMode) => {
    if (!backup) return;
    if (mode === 'overwrite') {
      const ok = await confirm({
        title: '기존 프로젝트를 덮어쓸까요?',
        body: <p>현재 저장된 “{plan?.existingProject?.title}”(수정 {fmtDate(plan?.existingProject?.updatedAt, true)})의 모든 내용이 백업 시점({fmtDate(backup.exportedAt, true)}) 내용으로 바뀝니다. 백업 이후에 한 작업은 사라집니다.</p>,
        confirmLabel: '덮어쓰기',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await restoreBackup(backup, mode);
      toast(`복원했습니다.${r.filesMissing ? ` 첨부 ${r.filesMissing}개는 파일 본문이 백업에 없어 참조 정보만 복원했습니다.` : ''}`);
      onClose();
      onDone(r.projectId);
    } catch (e) {
      setError(`복원하지 못했습니다. 기존 데이터는 바뀌지 않았습니다. ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="백업에서 복원" onClose={onClose} testid="restore-dialog">
      <p className="small muted">이 앱에서 내려받은 백업 파일(.json)을 선택하세요. 복원 전에 파일 내용과 연결 관계를 검사합니다.</p>
      <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} data-testid="restore-input" aria-label="백업 파일 선택" />
      {error && <div className="notice danger" style={{ marginTop: 10 }} role="alert" data-testid="restore-error">{error}</div>}
      {backup && plan && (
        <div style={{ marginTop: 12 }} data-testid="restore-summary">
          <div className="notice">
            <strong>{backup.bundle.project.title}</strong> {backup.isDemo && <span className="badge warn">가상 예시 데이터</span>}
            <div className="small">백업 시각 {fmtDate(backup.exportedAt, true)} · 스키마 v{backup.schemaVersion} · 첨부파일 본문 {backup.filesIncluded ? '포함' : '미포함'}</div>
            <div className="small">{Object.entries(backup.counts).map(([k, n]) => `${COUNT_LABEL[k] ?? k} ${n}`).join(' · ')}</div>
          </div>
          {plan.existingProject ? (
            <>
              <div className="notice warn" data-testid="restore-conflict">같은 프로젝트가 이미 이 브라우저에 있습니다(수정 {fmtDate(plan.existingProject.updatedAt, true)}). 어떻게 복원할지 선택하세요.</div>
              <div className="modal-foot">
                <button className="btn" onClick={onClose}>취소</button>
                <button className="btn" disabled={busy} onClick={() => go('copy')} data-testid="restore-copy">사본으로 복원 (기존 유지)</button>
                <button className="btn danger" disabled={busy} onClick={() => go('overwrite')} data-testid="restore-overwrite">기존 프로젝트 덮어쓰기</button>
              </div>
            </>
          ) : (
            <div className="modal-foot">
              <button className="btn" onClick={onClose}>취소</button>
              <button className="btn primary" disabled={busy} onClick={() => go('new')} data-testid="restore-go">복원</button>
            </div>
          )}
        </div>
      )}
      {!backup && <div className="modal-foot"><button className="btn" onClick={onClose}>닫기</button></div>}
    </Modal>
  );
}

export function DataPage() {
  const b = useBundle();
  const nav = useNavigate();
  const { toast, confirm, run } = useUi();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [check, setCheck] = useState<string[] | null>(null);
  const [usage, setUsage] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)}MB 사용 중${e.quota ? ` / 약 ${(e.quota / 1024 / 1024 / 1024).toFixed(1)}GB 사용 가능` : ''}`)).catch(() => undefined);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, []);
  const stored = b.attachments.filter((a) => a.storage === 'stored');

  const backup = async () => {
    try {
      const data = await exportBackup(b.project.id, includeFiles);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `백업_${safeFileName(b.project.title)}_${stamp}.json`);
      toast('백업 파일을 내려받았습니다. 안전한 곳에 보관하세요.');
    } catch (e) {
      toast(errorMessage(e), true);
    }
  };
  const remove = async () => {
    if (await confirm({ title: '프로젝트 삭제', body: <p>“{b.project.title}” 프로젝트의 변수·가설·문헌·근거·피드백·계획서 버전이 <strong>모두 삭제</strong>됩니다. 되돌릴 수 없으니 먼저 백업하세요.</p>, confirmLabel: '프로젝트 삭제', danger: true })) {
      const ok = await run(async () => { await deleteProject(b.project.id); return true; }, '프로젝트를 삭제했습니다.');
      if (ok) nav('/');
    }
  };
  return (
    <>
      <div className="page-head"><div><h1>백업·복원</h1><div className="sub">데이터는 이 브라우저에만 저장됩니다. 기기 고장·브라우저 데이터 삭제에 대비해 백업 파일을 보관하세요.</div></div></div>
      <div className="grid c2">
        <div className="card">
          <h2>프로젝트 전체 백업</h2>
          <p className="small">프로젝트 데이터, 변수, 가설, 문헌, 근거, 연결 관계, 피드백, 변경 요청과 영향 검토, 계획서 버전, 수정 이력이 하나의 파일(.json)에 담깁니다.</p>
          <div className="small muted" style={{ marginBottom: 8 }}>{Object.entries(COUNT_LABEL).map(([k, v]) => `${v} ${(b as unknown as Record<string, unknown[]>)[k].length}`).join(' · ')}</div>
          <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} data-testid="backup-files" /> PDF 파일 본문 포함 ({stored.length}개, {(stored.reduce((a, x) => a + x.size, 0) / 1024 / 1024).toFixed(1)}MB)</label>
          <p className="help">포함하지 않으면 파일명 등 참조 정보만 백업되며, 복원 후 ‘참조만 저장’으로 표시됩니다.</p>
          <button className="btn primary" onClick={backup} data-testid="download-backup">백업 파일 내려받기</button>
        </div>
        <div className="card">
          <h2>백업에서 복원</h2>
          <p className="small">복원 전에 파일 형식·스키마 버전·연결 관계를 검사합니다. 같은 프로젝트가 이미 있으면 덮어쓸지, 사본으로 복원할지 묻습니다. 복원에 실패하면 기존 데이터는 그대로 유지됩니다.</p>
          <button className="btn" onClick={() => setRestoring(true)} data-testid="open-restore">백업 파일 선택…</button>
        </div>
        <div className="card">
          <h2>데이터 점검</h2>
          <p className="small">변수·가설·문헌·근거 사이의 연결이 끊어진 곳이 없는지 검사합니다.</p>
          <button className="btn" onClick={() => setCheck(checkIntegrity(b))} data-testid="run-check">연결 관계 점검</button>
          {check && (check.length === 0 ? <div className="notice" style={{ marginTop: 10 }} data-testid="check-ok">문제가 없습니다. 모든 연결이 유효합니다.</div> : <div className="notice danger" style={{ marginTop: 10 }}>{check.map((c, i) => <div key={i}>{c}</div>)}</div>)}
          <p className="help" style={{ marginTop: 10 }}>저장 공간: {usage || '확인할 수 없음'} · 브라우저 영구 저장 {persisted === null ? '확인 불가' : persisted ? '허용됨' : '허용되지 않음(브라우저가 공간 부족 시 데이터를 지울 수 있음)'}</p>
        </div>
        <div className="card">
          <h2>프로젝트 삭제</h2>
          <p className="small">이 프로젝트의 모든 데이터를 이 브라우저에서 삭제합니다.</p>
          <button className="btn danger" onClick={remove} data-testid="delete-project">프로젝트 삭제</button>
        </div>
      </div>
      {restoring && <RestoreDialog onClose={() => setRestoring(false)} onDone={(id) => nav(`/p/${id}`)} />}
    </>
  );
}
