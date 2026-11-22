import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FeedbackInput, createChangeRequest, deleteFeedback, saveFeedback } from '../../db/repo';
import { readTargetValue } from '../../domain/impact';
import { CHANGEABLE_FIELDS, CR_STATUS_LABEL, ChangeTargetType, DECISION_LABEL, EntityRef, FEEDBACK_STATUS_LABEL, Feedback, FeedbackDecision, FeedbackStatus, ProjectBundle } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, Field, Modal, MultiCheck, TextArea, useUi } from '../common';

function targetOptions(b: ProjectBundle): { ref: EntityRef; label: string }[] {
  return [
    { ref: { type: 'project', id: b.project.id }, label: '연구 개요(제목·목적·배경·방법)' },
    { ref: { type: 'subject', id: b.subject.id }, label: '연구 대상' },
    ...b.variables.map((v) => ({ ref: { type: 'variable' as const, id: v.id }, label: `${v.code} ${v.name}` })),
    ...b.hypotheses.map((h) => ({ ref: { type: 'hypothesis' as const, id: h.id }, label: `${h.code} 가설` })),
    ...b.literature.map((l) => ({ ref: { type: 'literature' as const, id: l.id }, label: `${l.code} ${l.title.slice(0, 24)}` })),
  ];
}

function FeedbackForm({ b, item, onClose }: { b: ProjectBundle; item: Feedback | null; onClose: () => void }) {
  const { run } = useUi();
  const [f, setF] = useState<FeedbackInput>(item ? { ...item } : { meetingDate: new Date().toISOString().slice(0, 10), professorComment: '', targets: [], interpretation: '', decision: 'pending', decisionNote: '', beforeText: '', afterText: '', status: 'open' });
  const set = <K extends keyof FeedbackInput>(k: K, v: FeedbackInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const opts = targetOptions(b);
  const save = async () => {
    const { meetingDate, professorComment, targets, interpretation, decision, decisionNote, beforeText, afterText, status } = f;
    const r = await run(() => saveFeedback(b.project.id, { meetingDate, professorComment, targets, interpretation, decision, decisionNote, beforeText, afterText, status }, item?.id), '피드백을 저장했습니다. 연구 데이터는 바뀌지 않았습니다.');
    if (r) onClose();
  };
  return (
    <Modal title={item ? `피드백 수정 · ${item.code}` : '지도교수 피드백 등록'} onClose={onClose} wide testid="feedback-form">
      <div className="notice">피드백을 저장해도 연구 데이터는 자동으로 바뀌지 않습니다. 실제 변경은 ‘변경 요청’을 만들어 영향을 확인한 뒤 직접 적용합니다.</div>
      <div className="grid c2">
        <Field label="면담 날짜" required><input type="date" value={f.meetingDate} onChange={(e) => set('meetingDate', e.target.value)} data-testid="fb-date" /></Field>
        <Field label="처리 상태">
          <select value={f.status} onChange={(e) => set('status', e.target.value as FeedbackStatus)} data-testid="fb-status">
            {Object.entries(FEEDBACK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="교수 의견 원문" required help="교수님이 하신 말씀을 들은 그대로 적습니다. 나의 해석은 아래 칸에 따로 적습니다."><TextArea value={f.professorComment} onChange={(v) => set('professorComment', v)} rows={4} autoFocus data-testid="fb-comment" /></Field>
      <Field label="관련 연구 항목" optional>
        <MultiCheck name="fb-target" options={opts.map((o) => ({ id: `${o.ref.type}:${o.ref.id}`, label: o.label }))} value={f.targets.map((t) => `${t.type}:${t.id}`)} onChange={(ids) => set('targets', opts.filter((o) => ids.includes(`${o.ref.type}:${o.ref.id}`)).map((o) => o.ref))} empty="" />
      </Field>
      <Field label="나의 해석·메모" optional><TextArea value={f.interpretation} onChange={(v) => set('interpretation', v)} data-testid="fb-interpretation" /></Field>
      <div className="grid c2">
        <Field label="나의 결정">
          <select value={f.decision} onChange={(e) => set('decision', e.target.value as FeedbackDecision)} data-testid="fb-decision">
            {Object.entries(DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="결정 메모" optional><TextArea value={f.decisionNote} onChange={(v) => set('decisionNote', v)} rows={2} /></Field>
      </div>
      <div className="grid c2">
        <Field label="수정 전 내용" optional help="변경 요청을 적용하면 자동으로 덧붙여집니다."><TextArea value={f.beforeText} onChange={(v) => set('beforeText', v)} rows={2} /></Field>
        <Field label="수정 후 내용" optional><TextArea value={f.afterText} onChange={(v) => set('afterText', v)} rows={2} /></Field>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} data-testid="fb-save">저장</button>
      </div>
    </Modal>
  );
}

export function ChangeRequestForm({ b, feedback, onClose }: { b: ProjectBundle; feedback: Feedback | null; onClose: () => void }) {
  const { run } = useUi();
  const nav = useNavigate();
  const first = feedback?.targets.find((t) => ['project', 'subject', 'variable', 'hypothesis'].includes(t.type));
  const [type, setType] = useState<ChangeTargetType>((first?.type as ChangeTargetType) ?? 'subject');
  const entities = type === 'project' ? [{ id: b.project.id, label: '연구 개요' }] : type === 'subject' ? [{ id: b.subject.id, label: '연구 대상' }] : type === 'variable' ? b.variables.map((v) => ({ id: v.id, label: `${v.code} ${v.name}` })) : b.hypotheses.map((h) => ({ id: h.id, label: `${h.code} ${h.statement.slice(0, 40)}` }));
  const [entityId, setEntityId] = useState(first?.id ?? '');
  const eid = entities.some((e) => e.id === entityId) ? entityId : (entities[0]?.id ?? '');
  const fields = CHANGEABLE_FIELDS[type];
  const [field, setField] = useState('');
  const fld = field in fields ? field : Object.keys(fields)[0];
  const current = eid ? (readTargetValue(b, { type, id: eid, field: fld }) ?? '') : '';
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState(feedback ? `지도교수 피드백(${feedback.code}, ${feedback.meetingDate}) 반영` : '');
  const save = async () => {
    const r = await run(() => createChangeRequest(b.project.id, { target: { type, id: eid, field: fld }, newValue, reason, feedbackId: feedback?.id ?? null }), '변경 요청을 만들었습니다. 영향 항목을 확인하세요.');
    if (r) {
      onClose();
      nav(`../changes/${r.id}`);
    }
  };
  return (
    <Modal title={feedback ? `변경 요청 만들기 · ${feedback.code} 피드백` : '변경 요청 만들기'} onClose={onClose} wide testid="cr-form">
      <div className="notice">변경 요청은 아직 아무것도 바꾸지 않습니다. 다음 화면에서 영향받는 항목을 확인한 뒤 적용 여부를 결정합니다.</div>
      <div className="grid c3">
        <Field label="바꿀 항목 종류" required>
          <select value={type} onChange={(e) => setType(e.target.value as ChangeTargetType)} data-testid="cr-type">
            <option value="subject">연구 대상</option><option value="project">연구 개요</option><option value="variable">연구변수</option><option value="hypothesis">연구가설</option>
          </select>
        </Field>
        <Field label="대상" required>
          <select value={eid} onChange={(e) => setEntityId(e.target.value)} data-testid="cr-entity">
            {entities.length === 0 && <option value="">등록된 항목 없음</option>}
            {entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Field>
        <Field label="바꿀 칸" required>
          <select value={fld} onChange={(e) => setField(e.target.value)} data-testid="cr-field">
            {Object.entries(fields).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="현재 내용"><div className="diff-before" data-testid="cr-current">{current || '(비어 있음)'}</div></Field>
      <Field label="변경 후 내용" required><TextArea value={newValue} onChange={setNewValue} data-testid="cr-new" /></Field>
      <Field label="변경 이유" required><TextArea value={reason} onChange={setReason} rows={2} data-testid="cr-reason" /></Field>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} disabled={!eid} data-testid="cr-save">영향 확인으로 이동</button>
      </div>
    </Modal>
  );
}

export function refLabel(b: ProjectBundle, t: EntityRef): string {
  return targetOptions(b).find((o) => o.ref.type === t.type && o.ref.id === t.id)?.label ?? '(삭제된 항목)';
}

export function FeedbackPage() {
  const b = useBundle();
  const { run, confirm } = useUi();
  const [form, setForm] = useState<Feedback | null | 'new'>(null);
  const [crFor, setCrFor] = useState<Feedback | null | 'none'>(null);
  const [status, setStatus] = useState('');
  const rows = [...b.feedback].reverse().filter((f) => !status || f.status === status);
  const orphanCrs = b.changeRequests.filter((c) => !c.feedbackId);
  const CrList = ({ ids }: { ids: string[] }) => (
    <>
      {b.changeRequests.filter((c) => ids.includes(c.id)).map((c) => {
        const pending = b.impactReviews.filter((r) => r.changeRequestId === c.id && r.needsReview && r.status === 'pending').length;
        return (
          <div key={c.id} className="row between" style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }} data-testid={`cr-${c.code}`}>
            <div className="small" style={{ minWidth: 0, flex: 1 }}>
              <span className="code">{c.code}</span> <strong>{c.targetLabel}</strong> <span className={`badge ${c.status === 'applied' ? 'ok' : c.status === 'draft' ? 'warn' : ''}`}>{CR_STATUS_LABEL[c.status]}</span>
              {pending > 0 && <span className="badge danger" style={{ marginLeft: 4 }}>확인 전 영향 항목 {pending}</span>}
              <div className="clamp">{c.oldValue || '(비어 있음)'} <span className="arrow">→</span> {c.newValue}</div>
            </div>
            <Link className="btn sm" to={`../changes/${c.id}`} data-testid={`open-${c.code}`}>{c.status === 'draft' ? '영향 확인·적용' : '영향 검토 보기'}</Link>
          </div>
        );
      })}
    </>
  );
  return (
    <>
      <div className="page-head">
        <div><h1>지도교수 피드백·변경 요청</h1><div className="sub">교수 의견 원문과 나의 판단을 따로 기록하고, 변경은 영향을 확인한 뒤 적용합니다.</div></div>
        <div className="actions">
          <button className="btn" onClick={() => setCrFor('none')} data-testid="add-cr">변경 요청 만들기</button>
          <button className="btn primary" onClick={() => setForm('new')} data-testid="add-feedback">피드백 등록</button>
        </div>
      </div>
      {b.feedback.length > 0 && (
        <div className="filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="처리 상태 필터">
            <option value="">모든 상태</option>
            {Object.entries(FEEDBACK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="muted small">{rows.length}건</span>
        </div>
      )}
      {b.feedback.length === 0 && <Empty title="기록된 피드백이 없습니다">면담이 끝나면 교수님의 의견을 원문 그대로 기록하세요.<div><button className="btn primary" onClick={() => setForm('new')}>피드백 등록</button></div></Empty>}
      {rows.map((f) => {
        const crs = b.changeRequests.filter((c) => c.feedbackId === f.id);
        return (
          <div key={f.id} className="card" data-testid={`feedback-${f.code}`}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="row">
                <span className="code">{f.code}</span><strong>{f.meetingDate} 면담</strong>
                <span className={`badge ${f.status === 'done' ? 'ok' : f.status === 'open' ? 'warn' : 'accent'}`} data-testid="fb-status-badge">{FEEDBACK_STATUS_LABEL[f.status]}</span>
                <span className="badge">결정: {DECISION_LABEL[f.decision]}</span>
                {f.completedAt && <span className="muted small">완료 {f.completedAt.slice(0, 10)}</span>}
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => setCrFor(f)} data-testid={`cr-for-${f.code}`}>변경 요청 만들기</button>
                <button className="btn sm" onClick={() => setForm(f)} data-testid={`edit-${f.code}`}>수정</button>
                <button className="btn sm danger" onClick={async () => (await confirm({ title: `피드백 삭제 · ${f.code}`, body: <p>이 피드백과 검토 대기 중인 변경 요청 {crs.filter((c) => c.status === 'draft').length}건을 삭제합니다.</p>, confirmLabel: '삭제', danger: true })) && run(() => deleteFeedback(f.id), '피드백을 삭제했습니다.')}>삭제</button>
              </div>
            </div>
            <div className="grid c2">
              <div>
                <div className="small muted">교수 의견 원문</div>
                <blockquote className="quote" data-testid="fb-original">{f.professorComment}</blockquote>
                {f.targets.length > 0 && <div className="small">관련 항목: {f.targets.map((t, i) => <span key={i} className="chip">{refLabel(b, t)}</span>)}</div>}
              </div>
              <div>
                <div className="small muted">나의 해석·메모</div>
                <div className="pre" style={{ marginBottom: 8 }}>{f.interpretation || <span className="muted">—</span>}</div>
                {f.decisionNote && <div className="small">결정 메모: {f.decisionNote}</div>}
                {(f.beforeText || f.afterText) && (
                  <div className="small stack">
                    <div><div className="muted">수정 전</div><div className="diff-before">{f.beforeText || '—'}</div></div>
                    <div><div className="muted">수정 후</div><div className="diff-after">{f.afterText || '—'}</div></div>
                  </div>
                )}
              </div>
            </div>
            {crs.length > 0 && <div style={{ marginTop: 10 }}><CrList ids={crs.map((c) => c.id)} /></div>}
          </div>
        );
      })}
      {orphanCrs.length > 0 && (
        <div className="card">
          <h2>피드백 없이 만든 변경 요청</h2>
          <CrList ids={orphanCrs.map((c) => c.id)} />
        </div>
      )}
      {form && <FeedbackForm b={b} item={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {crFor && <ChangeRequestForm b={b} feedback={crFor === 'none' ? null : crFor} onClose={() => setCrFor(null)} />}
    </>
  );
}
