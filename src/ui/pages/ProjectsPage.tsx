import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { createProject } from '../../db/repo';
import { seedDemo } from '../../demo/demo';
import { STAGE_LABEL } from '../../domain/types';
import { Empty, Field, Loading, Modal, TextArea, TextInput, fmtDate, useUi } from '../common';
import { RestoreDialog } from './DataPage';

export function ProjectsPage() {
  const nav = useNavigate();
  const { run } = useUi();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const p = await run(() => createProject({ title, purpose }), '프로젝트를 만들었습니다.');
    if (p) {
      setCreating(false);
      setTitle('');
      setPurpose('');
      nav(`/p/${p.id}/overview`);
    }
  };
  const demo = async () => {
    setBusy(true);
    const id = await run(() => seedDemo(), '가상 데모 프로젝트를 열었습니다.');
    setBusy(false);
    if (id) nav(`/p/${id}`);
  };

  return (
    <div className="main">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>논문 연구관리</h1>
            <div className="sub">연구 주제·연구모형·문헌 근거·지도교수 피드백·계획서 버전을 한 프로젝트 안에서 연결해 관리합니다.</div>
          </div>
          <div className="actions">
            <button className="btn" onClick={demo} disabled={busy} data-testid="load-demo">가상 데모 열기</button>
            <button className="btn" onClick={() => setRestoring(true)} data-testid="open-restore">백업에서 복원</button>
            <button className="btn primary" onClick={() => setCreating(true)} data-testid="new-project">새 프로젝트</button>
          </div>
        </div>
        <div className="notice">
          모든 데이터는 <strong>이 브라우저 안에만</strong> 저장됩니다. 다른 기기와 자동으로 동기화되지 않으며, 브라우저 데이터를 지우면 함께 사라집니다. 프로젝트의 ‘백업·복원’ 메뉴에서 정기적으로 백업 파일을 내려받으세요.
        </div>
        {projects === undefined ? (
          <Loading />
        ) : projects.length === 0 ? (
          <Empty title="아직 프로젝트가 없습니다">
            새 프로젝트를 만들거나, 가상 데모로 기능을 먼저 살펴보세요.
            <div><button className="btn primary" onClick={() => setCreating(true)}>새 프로젝트 만들기</button></div>
          </Empty>
        ) : (
          <div className="grid c2" data-testid="project-list">
            {projects.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="card project-card" data-testid="project-card">
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="badge accent">{STAGE_LABEL[p.stage]}</span>
                  {p.isDemo && <span className="badge warn">가상 예시 데이터</span>}
                </div>
                <h2 className="clamp">{p.title}</h2>
                <div className="muted small clamp">{p.purpose || '연구 목적 작성 필요'}</div>
                <div className="muted small" style={{ marginTop: 8 }}>수정 {fmtDate(p.updatedAt, true)} · 작성 {fmtDate(p.createdAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {creating && (
        <Modal title="새 프로젝트" onClose={() => setCreating(false)}>
          <Field label="연구 제목" required help="나중에 언제든지 바꿀 수 있습니다.">
            <TextInput value={title} onChange={setTitle} autoFocus data-testid="project-title" placeholder="예: ○○와 ○○의 관계에서 ○○의 매개효과" />
          </Field>
          <Field label="연구 목적" optional>
            <TextArea value={purpose} onChange={setPurpose} data-testid="project-purpose" />
          </Field>
          <div className="modal-foot">
            <button className="btn" onClick={() => setCreating(false)}>취소</button>
            <button className="btn primary" onClick={submit} data-testid="project-create">만들기</button>
          </div>
        </Modal>
      )}
      {restoring && <RestoreDialog onClose={() => setRestoring(false)} onDone={(id) => nav(`/p/${id}`)} />}
    </div>
  );
}
