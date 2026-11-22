import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { applyChangeRequest, cancelChangeRequest, createProposalVersion, previewChangeRequest, updateImpactReview } from '../../db/repo';
import { ImpactItem } from '../../domain/impact';
import { CR_STATUS_LABEL, ENTITY_TYPE_LABEL, EntityRef, IMPACT_STATUS_LABEL, ImpactReviewStatus } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, fmtDate, useUi } from '../common';

function linkFor(t: EntityRef): string | null {
  switch (t.type) {
    case 'project': case 'subject': return '../overview';
    case 'variable': case 'hypothesis': return '../model';
    case 'literature': return `../literature/${t.id}`;
    case 'evidence': return '../evidence';
    case 'proposalSection': return '../proposal';
    default: return null;
  }
}

export function ChangeRequestPage() {
  const b = useBundle();
  const { crid } = useParams();
  const nav = useNavigate();
  const { run, confirm } = useUi();
  const cr = b.changeRequests.find((c) => c.id === crid);
  const [preview, setPreview] = useState<{ items: ImpactItem[]; recheck: number; stale: boolean; current: string | null } | null>(null);
  const [checked, setChecked] = useState(false);
  const [preserve, setPreserve] = useState(true);
  const stamp = b.project.updatedAt + b.evidence.length + b.hypotheses.length;
  useEffect(() => {
    if (cr?.status !== 'draft') return;
    let live = true;
    previewChangeRequest(cr.id).then((p) => live && setPreview({ items: p.items, recheck: p.recheckEvidenceIds.length, stale: p.stale, current: p.current })).catch(() => live && setPreview(null));
    return () => { live = false; };
  }, [cr?.id, cr?.status, stamp]);
  if (!cr) return <Empty title="변경 요청을 찾을 수 없습니다"><Link to="../feedback">피드백 목록으로</Link></Empty>;
  const fb = b.feedback.find((f) => f.id === cr.feedbackId);
  const reviews = b.impactReviews.filter((r) => r.changeRequestId === cr.id);
  const pending = reviews.filter((r) => r.needsReview && r.status === 'pending').length;
  const preserved = b.proposalVersions.find((v) => v.id === cr.preservedVersionId);
  const newVersion = b.proposalVersions.find((v) => v.changeRequestId === cr.id);

  const apply = async () => {
    if (!preview) return;
    const ok = await confirm({
      title: '변경을 적용할까요?',
      body: (
        <div className="stack">
          <div><div className="muted small">{cr.targetLabel}</div><div className="diff-before">{preview.current || '(비어 있음)'}</div><div className="diff-after" style={{ marginTop: 4 }}>{cr.newValue}</div></div>
          <p>영향 항목 {preview.items.filter((i) => !i.direct).length}건이 검토 목록에 기록되고, ‘사용자 확인 완료’ 근거 {preview.recheck}건이 ‘재검토 필요’로 바뀝니다. 기존 계획서 버전은 바뀌지 않습니다.</p>
        </div>
      ),
      confirmLabel: '적용',
    });
    if (ok) await run(() => applyChangeRequest(cr.id, { preserveVersion: preserve, acceptCurrentValue: preview.stale }), '변경을 적용했습니다. 영향 항목을 하나씩 확인하세요.');
  };
  const makeVersion = async () => {
    const v = await run(() => createProposalVersion(b.project.id, { reason: `${cr.code} 반영: ${cr.targetLabel} 변경`, changeRequestId: cr.id, feedbackId: cr.feedbackId }), '새 계획서 버전을 만들었습니다.');
    if (v) nav('../proposal');
  };

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="small"><Link to="../feedback">← 피드백·변경 요청</Link></div>
          <h1><span className="code">{cr.code}</span> 변경 영향 검토</h1>
          <div className="sub">{cr.targetLabel} · <span className={`badge ${cr.status === 'applied' ? 'ok' : cr.status === 'draft' ? 'warn' : ''}`} data-testid="cr-status">{CR_STATUS_LABEL[cr.status]}</span> · 작성 {fmtDate(cr.createdAt, true)}{cr.appliedAt && ` · 적용 ${fmtDate(cr.appliedAt, true)}`}</div>
        </div>
      </div>
      <div className="card">
        <div className="grid c2">
          <div><div className="small muted">기존 값</div><div className="diff-before" data-testid="cr-old">{(cr.status === 'draft' ? preview?.current : cr.oldValue) || '(비어 있음)'}</div></div>
          <div><div className="small muted">제안된 새 값</div><div className="diff-after" data-testid="cr-newvalue">{cr.newValue}</div></div>
        </div>
        <p style={{ marginTop: 10 }}><strong>변경 이유</strong>: {cr.reason}</p>
        {fb && <div><div className="small muted">관련 피드백 {fb.code} ({fb.meetingDate}) · 교수 의견 원문</div><blockquote className="quote">{fb.professorComment}</blockquote></div>}
      </div>

      {cr.status === 'draft' && (
        <>
          {preview?.stale && <div className="notice warn">이 요청을 만든 뒤 대상 내용이 바뀌었습니다(요청 당시: “{cr.oldValue}”). 아래는 현재 내용을 기준으로 다시 분석한 결과입니다.</div>}
          <h2>적용하면 영향받는 항목 <span className="muted small">{preview ? preview.items.filter((i) => !i.direct).length : 0}건</span></h2>
          <p className="muted small">실제 연결 관계(가설–변수–근거–문헌)와 본문에 기존 표현이 들어 있는지를 기준으로 고른 항목입니다. 연결되지 않은 항목은 표시하지 않습니다.</p>
          {!preview ? <Empty title="분석 중…" /> : (
            <div className="table-wrap">
              <table data-testid="impact-preview">
                <thead><tr><th>영향받는 항목</th><th>영향받는 이유</th><th>항목의 현재 내용</th><th>재검토</th></tr></thead>
                <tbody>
                  {preview.items.filter((i) => !i.direct).map((i) => (
                    <tr key={`${i.target.type}:${i.target.id}`} data-testid={`impact-${i.target.type}`}>
                      <td><span className="badge">{ENTITY_TYPE_LABEL[i.target.type]}</span><div><strong>{i.targetLabel}</strong></div></td>
                      <td className="small">{i.reason}</td>
                      <td className="small"><div className="clamp">{i.currentValue || <span className="muted">—</span>}</div></td>
                      <td>{i.needsReview ? <span className="badge warn">재검토 필요</span> : <span className="badge">참고</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="stack">
              {preview && preview.recheck > 0 && <div className="notice warn" data-testid="recheck-notice">적용하면 ‘사용자 확인 완료’ 근거 <strong>{preview.recheck}건</strong>이 ‘재검토 필요’로 바뀝니다.</div>}
              <label className="check"><input type="checkbox" checked={preserve} onChange={(e) => setPreserve(e.target.checked)} data-testid="preserve-version" /> 적용 직전 상태를 계획서 버전으로 보존 (최신 버전과 내용이 같으면 새로 만들지 않음)</label>
              <label className="check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="impact-ack" /> 위 영향 항목을 확인했습니다</label>
              <div className="row">
                <button className="btn primary" disabled={!checked || !preview} onClick={apply} data-testid="apply-cr">변경 적용</button>
                <button className="btn" onClick={async () => (await confirm({ title: '변경 요청 취소', body: <p>이 변경 요청을 취소합니다. 연구 데이터는 바뀌지 않습니다.</p>, confirmLabel: '요청 취소' })) && run(() => cancelChangeRequest(cr.id), '변경 요청을 취소했습니다.')} data-testid="cancel-cr">적용하지 않음(요청 취소)</button>
              </div>
            </div>
          </div>
        </>
      )}

      {cr.status === 'applied' && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <strong>확인 전 영향 항목 <span data-testid="pending-count">{pending}</span>건</strong>
                <div className="small muted">
                  {preserved && <>적용 전 상태는 <Link to="../proposal">계획서 v{preserved.versionNo}</Link>에 보존되어 있습니다. </>}
                  {newVersion ? <>이 변경을 반영한 버전: <Link to="../proposal">v{newVersion.versionNo}</Link></> : '이 변경을 반영한 새 계획서 버전은 아직 없습니다.'}
                </div>
              </div>
              <button className="btn primary" onClick={makeVersion} data-testid="make-version">변경을 반영한 새 계획서 버전 만들기</button>
            </div>
          </div>
          <div className="table-wrap">
            <table data-testid="impact-reviews">
              <thead><tr><th>영향받은 항목</th><th>영향받는 이유</th><th>적용 당시 내용</th><th>재검토</th><th>나의 확인 상태</th></tr></thead>
              <tbody>
                {reviews.map((r) => {
                  const to = linkFor(r.target);
                  return (
                    <tr key={r.id} data-testid={`review-${r.target.type}`}>
                      <td><span className="badge">{ENTITY_TYPE_LABEL[r.target.type]}</span><div><strong>{r.targetLabel}</strong></div>{to && <Link className="small" to={to}>항목으로 이동</Link>}</td>
                      <td className="small">{r.reason}<div className="muted">변경: {r.oldValue} → {r.newValue}</div></td>
                      <td className="small"><div className="clamp">{r.currentValue || <span className="muted">—</span>}</div></td>
                      <td>{r.needsReview ? <span className="badge warn">재검토 필요</span> : <span className="badge">참고</span>}</td>
                      <td>
                        <select className="inline" value={r.status} aria-label={`${r.targetLabel} 확인 상태`} data-testid="review-status" onChange={(e) => run(() => updateImpactReview(r.id, { status: e.target.value as ImpactReviewStatus }), '확인 상태를 저장했습니다.')}>
                          {Object.entries(IMPACT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input type="text" defaultValue={r.note} placeholder="메모" aria-label="검토 메모" style={{ marginTop: 4, fontSize: 13, padding: '3px 6px' }} onBlur={(e) => e.target.value !== r.note && run(() => updateImpactReview(r.id, { note: e.target.value }))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {cr.status === 'cancelled' && <div className="notice">취소된 변경 요청입니다. 연구 데이터는 바뀌지 않았습니다.</div>}
    </>
  );
}
