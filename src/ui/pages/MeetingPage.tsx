import { useState } from 'react';
import { MeetingInput, deleteMeeting, saveMeeting } from '../../db/repo';
import { buildSnapshot, latestMeeting } from '../../domain/proposal';
import { MeetingPrep, VARIABLE_ROLE_LABEL } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, EvidenceBadge, Field, FictionalBadge, ListEditor, Modal, TextArea, TextInput, Todo, TextOrTodo, useUi } from '../common';
import { ModelDiagram } from '../ModelDiagram';
import { bundleDiagram } from './ModelPage';

function MeetingForm({ pid, item, onClose, onSaved }: { pid: string; item: MeetingPrep | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { run } = useUi();
  const [f, setF] = useState<MeetingInput>(item ? { plannedDate: item.plannedDate, title: item.title, checkItems: item.checkItems, questions: item.questions, notes: item.notes } : { plannedDate: '', title: '', checkItems: [], questions: [], notes: '' });
  const set = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const r = await run(() => saveMeeting(pid, f, item?.id), '면담 준비를 저장했습니다.');
    if (r) {
      onSaved(r.id);
      onClose();
    }
  };
  return (
    <Modal title={item ? `면담 준비 수정 · ${item.code}` : '면담 준비 만들기'} onClose={onClose} testid="meeting-form">
      <div className="grid c2">
        <Field label="면담 예정일" optional><input type="date" value={f.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} data-testid="m-date" /></Field>
        <Field label="면담 제목" optional><TextInput value={f.title} onChange={(v) => set('title', v)} placeholder="예: 연구계획서 초안 면담" data-testid="m-title" /></Field>
      </div>
      <Field label="확인이 필요한 사항" help="지도교수께 확인받고 싶은 결정 사항"><ListEditor value={f.checkItems} onChange={(v) => set('checkItems', v)} placeholder="확인이 필요한 사항" testid="m-checks" /></Field>
      <Field label="지도교수에게 질문할 내용"><ListEditor value={f.questions} onChange={(v) => set('questions', v)} placeholder="질문" testid="m-questions" /></Field>
      <Field label="메모" optional><TextArea value={f.notes} onChange={(v) => set('notes', v)} rows={2} /></Field>
      <p className="help">연구 주제·목적·연구모형·가설·핵심 선행연구는 프로젝트 데이터에서 자동으로 가져옵니다.</p>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} data-testid="m-save">저장</button>
      </div>
    </Modal>
  );
}

export function MeetingPage() {
  const b = useBundle();
  const { run, confirm } = useUi();
  const [form, setForm] = useState<MeetingPrep | null | 'new'>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const m = b.meetings.find((x) => x.id === selected) ?? latestMeeting(b.meetings);
  const s = buildSnapshot(b, m?.id);
  const d = bundleDiagram(b);
  // 미해결 쟁점: 저장된 데이터에서 그대로 집계한다(문장을 만들어 내지 않는다)
  const noEvidence = b.hypotheses.filter((h) => !b.evidence.some((e) => e.hypothesisIds.includes(h.id) && e.status === 'verified'));
  const recheck = b.evidence.filter((e) => e.status === 'recheck');
  const pendingImpacts = b.impactReviews.filter((r) => r.needsReview && r.status === 'pending').length;
  const issues: string[] = [
    ...b.feedback.filter((f) => f.status !== 'done').map((f) => `처리되지 않은 지도교수 피드백 ${f.code} (${f.meetingDate})`),
    ...b.changeRequests.filter((c) => c.status === 'draft').map((c) => `검토 대기 중인 변경 요청 ${c.code}: ${c.targetLabel}`),
    ...(recheck.length ? [`재검토가 필요한 근거 ${recheck.length}건: ${recheck.map((e) => e.code).join(', ')}`] : []),
    ...(pendingImpacts ? [`확인 전인 변경 영향 항목 ${pendingImpacts}건`] : []),
    ...(noEvidence.length ? [`확인 완료 근거가 없는 가설: ${noEvidence.map((h) => h.code).join(', ')}`] : []),
  ];
  return (
    <>
      <div className="page-head no-print">
        <div><h1>면담 준비</h1><div className="sub">현재 연구 내용을 한 장으로 정리해 지도교수 면담에 가져갑니다.</div></div>
        <div className="actions">
          {b.meetings.length > 1 && (
            <select value={m?.id ?? ''} onChange={(e) => setSelected(e.target.value)} aria-label="면담 선택" style={{ width: 'auto' }}>
              {b.meetings.map((x) => <option key={x.id} value={x.id}>{x.code} {x.plannedDate} {x.title}</option>)}
            </select>
          )}
          {m && <button className="btn" onClick={() => setForm(m)} data-testid="edit-meeting">확인 사항·질문 수정</button>}
          {m && <button className="btn danger" onClick={async () => (await confirm({ title: '면담 준비 삭제', body: <p>{m.code} 면담 준비를 삭제합니다.</p>, confirmLabel: '삭제', danger: true })) && run(() => deleteMeeting(m.id), '삭제했습니다.')}>삭제</button>}
          <button className="btn" onClick={() => window.print()}>인쇄</button>
          <button className="btn primary" onClick={() => setForm('new')} data-testid="add-meeting">새 면담 준비</button>
        </div>
      </div>
      {!m && <div className="no-print"><Empty title="면담 준비가 없습니다">확인이 필요한 사항과 질문을 적어 두면 아래 면담용 요약과 연구계획서에 함께 들어갑니다.<div><button className="btn primary" onClick={() => setForm('new')}>면담 준비 만들기</button></div></Empty></div>}
      <div className="card proposal-preview" data-testid="meeting-sheet">
        <div className="muted small">면담용 연구계획 요약 {m && `· ${m.code} ${m.plannedDate || '날짜 미정'} ${m.title}`} {s.isDemo && <FictionalBadge />}</div>
        <h2 style={{ fontSize: 19, marginTop: 4 }}>{s.title}</h2>
        <div className="grid c2">
          <div>
            <h3>연구 목적</h3><div><TextOrTodo text={s.purpose} /></div>
            <h3>연구 질문</h3>{s.researchQuestions.length ? <ol style={{ margin: 0, paddingLeft: 20 }}>{s.researchQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol> : <Todo />}
            <h3>연구 대상</h3><div><TextOrTodo text={s.subject.population} /></div>
          </div>
          <div>
            <h3>연구변수</h3>
            {s.variables.length ? s.variables.map((v) => <div key={v.id} className="small"><span className="code">{v.code}</span> {v.name} <span className="badge">{VARIABLE_ROLE_LABEL[v.role]}</span></div>) : <Todo />}
          </div>
        </div>
        <h3>연구모형</h3>
        {d.edges.length ? <div className="diagram"><ModelDiagram {...d} /></div> : <Todo />}
        <h3>주요 연구가설</h3>
        {s.hypotheses.length ? s.hypotheses.map((h) => <div key={h.id}><span className="code">{h.code}</span> {h.statement}</div>) : <Todo />}
        <h3>핵심 선행연구</h3>
        {s.keyLiterature.length ? s.keyLiterature.map((l) => (
          <div key={l.id} style={{ marginBottom: 6 }}>
            <div><span className="code">{l.code}</span> {l.authors} ({l.year || '연도 미입력'}). {l.title} {l.isFictional && <FictionalBadge />}</div>
            <div className="small muted">핵심 결과: {l.keyFindings || '작성 필요'}</div>
            {l.evidence.map((e) => <div key={e.code} className="small">· {e.code} {e.content} {e.page && `(p.${e.page})`} <EvidenceBadge status={e.status} /></div>)}
          </div>
        )) : <Todo />}
        <div className="grid c2">
          <div><h3>확인이 필요한 사항</h3>{s.advisorCheckItems.length ? <ol style={{ margin: 0, paddingLeft: 20 }} data-testid="sheet-checks">{s.advisorCheckItems.map((q, i) => <li key={i}>{q}</li>)}</ol> : <Todo />}</div>
          <div><h3>지도교수에게 질문할 내용</h3>{s.advisorQuestions.length ? <ol style={{ margin: 0, paddingLeft: 20 }}>{s.advisorQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol> : <Todo />}</div>
        </div>
        <h3>미해결 쟁점 <span className="muted small">(프로젝트 데이터에서 자동 집계)</span></h3>
        {issues.length ? <ul style={{ margin: 0, paddingLeft: 20 }} data-testid="sheet-issues">{issues.map((q, i) => <li key={i}>{q}</li>)}</ul> : <div className="muted" data-testid="sheet-issues">집계된 미해결 항목이 없습니다.</div>}
      </div>
      {form && <MeetingForm pid={b.project.id} item={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={setSelected} />}
    </>
  );
}
