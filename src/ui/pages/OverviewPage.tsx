import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { newId } from '../../db/db';
import { updateProject, updateSubject } from '../../db/repo';
import { Milestone, ProjectStage, STAGE_LABEL } from '../../domain/types';
import { useBundle } from '../App';
import { Field, ListEditor, TextArea, TextInput, fmtDate, useUi } from '../common';

export function OverviewPage() {
  const b = useBundle();
  const { run } = useUi();
  const init = () => ({
    title: b.project.title, purpose: b.project.purpose, background: b.project.background, method: b.project.method,
    researchType: b.project.researchType, stage: b.project.stage, researchQuestions: b.project.researchQuestions,
    milestones: b.project.milestones, notes: b.project.notes,
  });
  const initS = () => ({
    population: b.subject.population, definition: b.subject.definition, recruitmentCriteria: b.subject.recruitmentCriteria,
    exclusionCriteria: b.subject.exclusionCriteria, samplePlan: b.subject.samplePlan, notes: b.subject.notes,
  });
  const [f, setF] = useState(init);
  const [s, setS] = useState(initS);
  const dirty = JSON.stringify(f) !== JSON.stringify(init()) || JSON.stringify(s) !== JSON.stringify(initS());
  // 다른 화면(변경 요청 적용 등)에서 값이 바뀌면, 편집 중이 아닐 때만 화면을 갱신
  useEffect(() => {
    setF(init());
    setS(initS());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.project.updatedAt, b.subject.updatedAt]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setSub = <K extends keyof typeof s>(k: K, v: string) => setS((x) => ({ ...x, [k]: v }));
  const save = () =>
    run(async () => {
      await updateProject(b.project.id, { ...f, researchQuestions: f.researchQuestions.map((q) => q.trim()).filter(Boolean), milestones: f.milestones.filter((m) => m.label.trim()) });
      await updateSubject(b.project.id, s);
    }, '연구 개요를 저장했습니다.');
  const ms = (i: number, patch: Partial<Milestone>) => set('milestones', f.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>연구 개요·연구 대상</h1>
          <div className="sub">작성 {fmtDate(b.project.createdAt)} · 수정 {fmtDate(b.project.updatedAt, true)}</div>
        </div>
        <div className="actions">
          <span className={`badge ${dirty ? 'warn' : 'ok'}`} data-testid="dirty-state">{dirty ? '저장하지 않은 변경 있음' : '저장됨'}</span>
          <button className="btn primary" onClick={save} disabled={!dirty} data-testid="overview-save">저장</button>
        </div>
      </div>
      <div className="notice">
        지도교수 피드백 등으로 <strong>이미 다른 항목과 연결된 내용</strong>(연구 대상, 제목 등)을 바꿀 때는 <Link to="../feedback">변경 요청</Link>을 만들어 영향받는 가설·근거를 먼저 확인하는 것을 권장합니다.
      </div>
      <div className="grid c2">
        <div className="card">
          <h2>연구 개요</h2>
          <Field label="연구 제목" required><TextArea value={f.title} onChange={(v) => set('title', v)} rows={2} data-testid="f-title" /></Field>
          <Field label="연구 목적"><TextArea value={f.purpose} onChange={(v) => set('purpose', v)} data-testid="f-purpose" /></Field>
          <Field label="연구 배경"><TextArea value={f.background} onChange={(v) => set('background', v)} rows={5} data-testid="f-background" /></Field>
          <Field label="연구 질문" help="연구계획서의 ‘연구 질문’ 항목에 들어갑니다.">
            <ListEditor value={f.researchQuestions} onChange={(v) => set('researchQuestions', v)} placeholder="연구 질문" testid="f-questions" />
          </Field>
          <Field label="연구 방법"><TextArea value={f.method} onChange={(v) => set('method', v)} data-testid="f-method" /></Field>
          <div className="grid c2">
            <Field label="연구 유형"><TextInput value={f.researchType} onChange={(v) => set('researchType', v)} /></Field>
            <Field label="연구 진행 단계">
              <select value={f.stage} onChange={(e) => set('stage', e.target.value as ProjectStage)} data-testid="f-stage">
                {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="연구 메모" optional><TextArea value={f.notes} onChange={(v) => set('notes', v)} /></Field>
        </div>
        <div>
          <div className="card">
            <h2>연구 대상</h2>
            <Field label="연구 대상" help="예: 한부모가족 대학생"><TextInput value={s.population} onChange={(v) => setSub('population', v)} data-testid="s-population" /></Field>
            <Field label="연구 대상 정의"><TextArea value={s.definition} onChange={(v) => setSub('definition', v)} data-testid="s-definition" /></Field>
            <Field label="모집 기준"><TextArea value={s.recruitmentCriteria} onChange={(v) => setSub('recruitmentCriteria', v)} data-testid="s-recruit" /></Field>
            <Field label="제외 기준" optional><TextArea value={s.exclusionCriteria} onChange={(v) => setSub('exclusionCriteria', v)} /></Field>
            <Field label="표집 계획" optional><TextArea value={s.samplePlan} onChange={(v) => setSub('samplePlan', v)} /></Field>
          </div>
          <div className="card">
            <div className="row between"><h2>주요 일정</h2>
              <button className="btn sm" onClick={() => set('milestones', [...f.milestones, { id: newId(), label: '', date: '', done: false }])} data-testid="add-milestone">일정 추가</button>
            </div>
            {f.milestones.length === 0 && <p className="muted small">등록된 일정이 없습니다.</p>}
            {f.milestones.map((m, i) => (
              <div key={m.id} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
                <input type="checkbox" checked={m.done} onChange={(e) => ms(i, { done: e.target.checked })} aria-label="완료" />
                <input type="date" value={m.date} onChange={(e) => ms(i, { date: e.target.value })} style={{ width: 150 }} aria-label="날짜" />
                <TextInput value={m.label} onChange={(v) => ms(i, { label: v })} placeholder="일정 내용" aria-label="일정 내용" />
                <button className="btn sm" onClick={() => set('milestones', f.milestones.filter((_, j) => j !== i))} aria-label="일정 삭제">삭제</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
