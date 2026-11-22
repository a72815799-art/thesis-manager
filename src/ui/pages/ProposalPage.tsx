import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { confirmProposalVersion, createProposalVersion } from '../../db/repo';
import { EMPTY, buildSnapshot, snapshotSections, snapshotsEqual } from '../../domain/proposal';
import { ProposalSnapshot, ProposalVersion, VERSION_STATUS_LABEL } from '../../domain/types';
import { useBundle } from '../App';
import { Field, Modal, TextArea, fmtDate, safeFileName, saveBlob, useUi } from '../common';
import { ModelDiagram, svgToPng } from '../ModelDiagram';

function snapshotDiagram(s: ProposalSnapshot) {
  return {
    nodes: s.variables.map((v) => ({ id: v.id, code: v.code, name: v.name, role: v.role })),
    edges: s.modelPaths.map((p) => ({ fromId: p.fromId, toId: p.toId, label: p.label, moderatorIds: p.moderatorIds })),
  };
}

function Sections({ s }: { s: ProposalSnapshot }) {
  const sec = snapshotSections(s);
  const d = snapshotDiagram(s);
  return (
    <div className="proposal-preview">
      {Object.entries(sec).map(([k, v]) => (
        <div key={k}>
          <h3>{k}</h3>
          {k.startsWith('7.') && d.edges.length > 0 && <div className="diagram"><ModelDiagram {...d} /></div>}
          {v.trim() ? <div className="pre">{v}</div> : <div className="todo">{EMPTY}</div>}
        </div>
      ))}
    </div>
  );
}

export function ProposalPage() {
  const b = useBundle();
  const { run, confirm, toast } = useUi();
  const current = buildSnapshot(b);
  const latest = b.proposalVersions[b.proposalVersions.length - 1];
  const differs = !latest || !snapshotsEqual(latest.snapshot, current);
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState('');
  const [crId, setCrId] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const applied = b.changeRequests.filter((c) => c.status === 'applied');

  const create = async () => {
    const cr = applied.find((c) => c.id === crId);
    const v = await run(() => createProposalVersion(b.project.id, { reason, changeRequestId: cr?.id ?? null, feedbackId: cr?.feedbackId ?? null, meetingId: meetingId || null }), '새 계획서 버전을 만들었습니다. 이전 버전은 그대로 보존됩니다.');
    if (v) {
      setCreating(false);
      setReason('');
      setOpen(v.id);
    }
  };
  const download = async (v: ProposalVersion) => {
    try {
      const d = snapshotDiagram(v.snapshot);
      let modelImage;
      if (d.edges.length) {
        const svg = renderToStaticMarkup(<ModelDiagram {...d} />);
        const m = svg.match(/width="(\d+)" height="(\d+)"/);
        modelImage = (await svgToPng(svg, Number(m?.[1] ?? 760), Number(m?.[2] ?? 300))) ?? undefined;
      }
      const { proposalDocxBlob } = await import('../../export/docx');
      const blob = await proposalDocxBlob(v.snapshot, { versionNo: v.versionNo, createdAt: v.createdAt, status: v.status, reason: v.reason, modelImage });
      saveBlob(blob, `연구계획서_v${v.versionNo}_${safeFileName(v.snapshot.title)}.docx`);
      toast(`연구계획서 v${v.versionNo}(DOCX)를 내려받았습니다.`);
    } catch (e) {
      toast(`문서를 만들지 못했습니다: ${e instanceof Error ? e.message : e}`, true);
    }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>연구계획서</h1><div className="sub">현재 데이터로 계획서 버전을 만듭니다. 한 번 만든 버전의 내용은 바뀌지 않으며, 수정하려면 새 버전을 만듭니다.</div></div>
        <div className="actions"><button className="btn primary" onClick={() => setCreating(true)} data-testid="new-version">현재 내용으로 새 버전 만들기</button></div>
      </div>
      <div className={`notice ${differs && latest ? 'warn' : ''}`} data-testid="version-state">
        {!latest ? '아직 만든 버전이 없습니다. 아래 미리보기를 확인하고 첫 버전을 만드세요.' : differs ? `현재 데이터가 최신 버전(v${latest.versionNo})과 다릅니다. 변경을 문서로 남기려면 새 버전을 만드세요.` : `현재 데이터는 최신 버전(v${latest.versionNo})과 같습니다.`}
      </div>

      <h2>버전 목록 <span className="muted small">{b.proposalVersions.length}개</span></h2>
      {[...b.proposalVersions].reverse().map((v) => {
        const cr = b.changeRequests.find((c) => c.id === v.changeRequestId);
        const fb = b.feedback.find((f) => f.id === v.feedbackId);
        return (
          <div key={v.id} className="card tight" data-testid={`version-${v.versionNo}`}>
            <div className="row between">
              <div style={{ minWidth: 0, flex: 1 }}>
                <span className="code">v{v.versionNo}</span> <span className={`badge ${v.status === 'confirmed' ? 'ok' : ''}`} data-testid="version-status">{VERSION_STATUS_LABEL[v.status]}</span> <span className="muted small">{fmtDate(v.createdAt, true)}{v.confirmedAt && ` · 확정 ${fmtDate(v.confirmedAt)}`}</span>
                <div><strong>변경 사유</strong>: {v.reason}</div>
                <div className="small muted">
                  {cr && <>관련 변경 요청 {cr.code} · </>}{fb && <>관련 피드백 {fb.code} ({fb.meetingDate}) · </>}
                  {v.previousVersionId ? `이전 버전과 달라진 문단 ${v.diffFromPrevious.length}개` : '최초 버전'}
                </div>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => setOpen(open === v.id ? null : v.id)} data-testid="toggle-version">{open === v.id ? '접기' : '내용·차이 보기'}</button>
                <button className="btn sm" onClick={() => download(v)} data-testid="download-docx">DOCX 내려받기</button>
                {v.status === 'draft' && <button className="btn sm" onClick={async () => (await confirm({ title: `v${v.versionNo} 확정`, body: <p>이 버전을 확정 상태로 표시합니다. 확정 후에는 초안으로 되돌릴 수 없습니다.</p>, confirmLabel: '확정' })) && run(() => confirmProposalVersion(v.id), `v${v.versionNo}을(를) 확정했습니다.`)} data-testid="confirm-version">확정</button>}
              </div>
            </div>
            {open === v.id && (
              <div style={{ marginTop: 12 }}>
                {v.diffFromPrevious.length > 0 && (
                  <div data-testid="version-diff">
                    <h3>이전 버전과의 차이</h3>
                    {v.diffFromPrevious.map((d) => (
                      <div key={d.section} style={{ marginBottom: 8 }}>
                        <div className="small"><strong>{d.section}</strong></div>
                        <div className="grid c2 small"><div className="diff-before">{d.before || '(없음)'}</div><div className="diff-after">{d.after || '(없음)'}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                <Sections s={v.snapshot} />
              </div>
            )}
          </div>
        );
      })}

      <h2 style={{ marginTop: 18 }}>현재 데이터 미리보기</h2>
      <div className="card" data-testid="proposal-preview"><Sections s={current} /></div>

      {creating && (
        <Modal title="새 계획서 버전 만들기" onClose={() => setCreating(false)} testid="version-form">
          <p className="small muted">현재 프로젝트 데이터를 그대로 담은 버전 v{(latest?.versionNo ?? 0) + 1}을(를) 만듭니다. 기존 버전은 수정되지 않습니다.</p>
          <Field label="변경 사유" required help="예: 최초 작성 / 지도교수 면담 반영 / 연구 대상 변경"><TextArea value={reason} onChange={setReason} rows={2} autoFocus data-testid="version-reason" /></Field>
          {applied.length > 0 && (
            <Field label="관련 변경 요청" optional>
              <select value={crId} onChange={(e) => setCrId(e.target.value)}>
                <option value="">없음</option>
                {applied.map((c) => <option key={c.id} value={c.id}>{c.code} {c.targetLabel}</option>)}
              </select>
            </Field>
          )}
          {b.meetings.length > 1 && (
            <Field label="‘지도교수 확인 필요 사항’에 넣을 면담 준비" optional>
              <select value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
                <option value="">가장 최근 면담 준비</option>
                {b.meetings.map((m) => <option key={m.id} value={m.id}>{m.code} {m.plannedDate} {m.title}</option>)}
              </select>
            </Field>
          )}
          <div className="modal-foot">
            <button className="btn" onClick={() => setCreating(false)}>취소</button>
            <button className="btn primary" onClick={create} data-testid="version-create">버전 만들기</button>
          </div>
        </Modal>
      )}
    </>
  );
}
