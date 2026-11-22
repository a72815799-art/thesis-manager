import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HypothesisInput, VariableInput, deleteHypothesis, deleteVariable, saveHypothesis, saveVariable } from '../../db/repo';
import { deriveModelEdges } from '../../domain/proposal';
import { HYPOTHESIS_KIND_LABEL, Hypothesis, HypothesisKind, ProjectBundle, ResearchVariable, VARIABLE_ROLE_LABEL, VariableRole, hypothesisVariableIds } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, Field, Modal, MultiCheck, TextArea, TextInput, TextOrTodo, fmtDate, useUi } from '../common';
import { ModelDiagram } from '../ModelDiagram';

export function bundleDiagram(b: ProjectBundle) {
  return {
    nodes: b.variables.map((v) => ({ id: v.id, code: v.code, name: v.name, role: v.role })),
    edges: deriveModelEdges(b.hypotheses, b.variables).map((e) => ({ fromId: e.fromId, toId: e.toId, label: e.hypothesisCodes.join(', '), moderatorIds: e.moderators.map((m) => m.variableId) })),
  };
}

function VariableForm({ b, item, onClose }: { b: ProjectBundle; item: ResearchVariable | null; onClose: () => void }) {
  const { run } = useUi();
  const [f, setF] = useState<VariableInput>(item ?? { name: '', role: 'independent', conceptualDefinition: '', operationalDefinition: '', notes: '' });
  const set = <K extends keyof VariableInput>(k: K, v: VariableInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const r = await run(() => saveVariable(b.project.id, { name: f.name, role: f.role, conceptualDefinition: f.conceptualDefinition, operationalDefinition: f.operationalDefinition, notes: f.notes }, item?.id), '변수를 저장했습니다.');
    if (r) onClose();
  };
  return (
    <Modal title={item ? `변수 수정 · ${item.code}` : '변수 등록'} onClose={onClose} testid="variable-form">
      <div className="grid c2">
        <Field label="변수명" required><TextInput value={f.name} onChange={(v) => set('name', v)} autoFocus data-testid="v-name" /></Field>
        <Field label="연구 내 역할" required>
          <select value={f.role} onChange={(e) => set('role', e.target.value as VariableRole)} data-testid="v-role">
            {Object.entries(VARIABLE_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="개념적 정의" help="이 변수가 이론적으로 무엇을 뜻하는지"><TextArea value={f.conceptualDefinition} onChange={(v) => set('conceptualDefinition', v)} data-testid="v-cdef" /></Field>
      <Field label="조작적 정의" help="이 연구에서 어떻게 측정하는지"><TextArea value={f.operationalDefinition} onChange={(v) => set('operationalDefinition', v)} data-testid="v-odef" /></Field>
      <Field label="메모" optional><TextArea value={f.notes} onChange={(v) => set('notes', v)} rows={2} /></Field>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} data-testid="v-save">저장</button>
      </div>
    </Modal>
  );
}

function HypothesisForm({ b, item, onClose }: { b: ProjectBundle; item: Hypothesis | null; onClose: () => void }) {
  const { run } = useUi();
  const [f, setF] = useState<HypothesisInput>(item ?? { statement: '', kind: 'direct', fromVariableId: null, toVariableId: null, viaVariableId: null, extraVariableIds: [], notes: '' });
  const set = <K extends keyof HypothesisInput>(k: K, v: HypothesisInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const opts = b.variables.map((v) => ({ id: v.id, label: `${v.code} ${v.name} (${VARIABLE_ROLE_LABEL[v.role]})` }));
  const sel = (k: 'fromVariableId' | 'toVariableId' | 'viaVariableId', testid: string) => (
    <select value={f[k] ?? ''} onChange={(e) => set(k, e.target.value || null)} data-testid={testid}>
      <option value="">선택…</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
  const save = async () => {
    const r = await run(() => saveHypothesis(b.project.id, { statement: f.statement, kind: f.kind, fromVariableId: f.fromVariableId, toVariableId: f.toVariableId, viaVariableId: f.viaVariableId, extraVariableIds: f.extraVariableIds, notes: f.notes }, item?.id), '가설을 저장했습니다.');
    if (r) onClose();
  };
  return (
    <Modal title={item ? `가설 수정 · ${item.code}` : '가설 등록'} onClose={onClose} testid="hypothesis-form">
      <Field label="가설 문장" required><TextArea value={f.statement} onChange={(v) => set('statement', v)} autoFocus data-testid="h-statement" /></Field>
      <Field label="가설 유형" required help="유형과 변수 연결에 따라 연구모형 그림이 자동으로 그려집니다.">
        <select value={f.kind} onChange={(e) => set('kind', e.target.value as HypothesisKind)} data-testid="h-kind">
          {Object.entries(HYPOTHESIS_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      {b.variables.length < 2 && <div className="notice warn">변수를 2개 이상 등록해야 가설에 연결할 수 있습니다.</div>}
      {f.kind !== 'other' ? (
        <div className={`grid ${f.kind === 'direct' ? 'c2' : 'c3'}`}>
          <Field label="원인(독립) 변수" required>{sel('fromVariableId', 'h-from')}</Field>
          {f.kind !== 'direct' && <Field label={f.kind === 'mediation' ? '매개변수' : '조절변수'} required>{sel('viaVariableId', 'h-via')}</Field>}
          <Field label="결과(종속) 변수" required>{sel('toVariableId', 'h-to')}</Field>
        </div>
      ) : (
        <Field label="관련 변수" optional>
          <MultiCheck name="h-extra" options={b.variables.map((v) => ({ id: v.id, label: `${v.code} ${v.name}` }))} value={f.extraVariableIds} onChange={(v) => set('extraVariableIds', v)} empty="등록된 변수가 없습니다." />
        </Field>
      )}
      <Field label="메모" optional><TextArea value={f.notes} onChange={(v) => set('notes', v)} rows={2} /></Field>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} data-testid="h-save">저장</button>
      </div>
    </Modal>
  );
}

export function ModelPage() {
  const b = useBundle();
  const { run, confirm } = useUi();
  const [vForm, setVForm] = useState<ResearchVariable | null | 'new'>(null);
  const [hForm, setHForm] = useState<Hypothesis | null | 'new'>(null);
  const [historyOf, setHistoryOf] = useState<ResearchVariable | null>(null);
  const d = bundleDiagram(b);
  const name = (id: string) => b.variables.find((v) => v.id === id)?.name ?? '?';

  const delVar = async (v: ResearchVariable) => {
    const ev = b.evidence.filter((e) => e.variableIds.includes(v.id)).length;
    const lit = b.literature.filter((l) => l.variableIds.includes(v.id)).length;
    if (await confirm({ title: `변수 삭제 · ${v.code} ${v.name}`, body: <p>이 변수를 삭제합니다. 근거 {ev}건과 문헌 {lit}건에서 이 변수 연결이 해제됩니다(근거·문헌 자체는 남습니다). 되돌릴 수 없습니다.</p>, confirmLabel: '삭제', danger: true }))
      await run(() => deleteVariable(v.id), '변수를 삭제했습니다.');
  };
  const delHyp = async (h: Hypothesis) => {
    const ev = b.evidence.filter((e) => e.hypothesisIds.includes(h.id)).length;
    if (await confirm({ title: `가설 삭제 · ${h.code}`, body: <p>이 가설을 삭제합니다. 근거 {ev}건에서 이 가설 연결이 해제됩니다(근거 자체는 남습니다). 되돌릴 수 없습니다.</p>, confirmLabel: '삭제', danger: true }))
      await run(() => deleteHypothesis(h.id), '가설을 삭제했습니다.');
  };

  return (
    <>
      <div className="page-head">
        <div><h1>변수·가설·연구모형</h1><div className="sub">연구모형 그림은 등록된 가설의 변수 연결에서 자동으로 만들어지므로 항상 실제 데이터와 일치합니다.</div></div>
        <div className="actions">
          <button className="btn" onClick={() => setVForm('new')} data-testid="add-variable">변수 등록</button>
          <button className="btn primary" onClick={() => setHForm('new')} data-testid="add-hypothesis">가설 등록</button>
        </div>
      </div>

      <div className="card">
        <h2>연구모형</h2>
        {b.variables.length === 0 ? (
          <Empty title="변수를 등록하면 연구모형이 그려집니다"><button className="btn primary" onClick={() => setVForm('new')}>변수 등록</button></Empty>
        ) : (
          <>
            <div className="diagram"><ModelDiagram {...d} /></div>
            {d.edges.length === 0 && <p className="muted small" style={{ textAlign: 'center' }}>가설을 등록해 변수를 연결하면 경로(화살표)가 표시됩니다.</p>}
          </>
        )}
      </div>

      <h2>연구변수 <span className="muted small">{b.variables.length}개</span></h2>
      {b.variables.length === 0 ? <Empty title="등록된 변수가 없습니다" /> : (
        <div className="table-wrap" style={{ marginBottom: 18 }}>
          <table data-testid="variable-table">
            <thead><tr><th>ID</th><th>변수명</th><th>역할</th><th>개념적 정의</th><th>조작적 정의</th><th>연결</th><th></th></tr></thead>
            <tbody>
              {b.variables.map((v) => {
                const hyps = b.hypotheses.filter((h) => hypothesisVariableIds(h).includes(v.id));
                const lits = b.literature.filter((l) => l.variableIds.includes(v.id));
                return (
                  <tr key={v.id} data-testid={`variable-${v.code}`}>
                    <td className="code">{v.code}</td>
                    <td><strong>{v.name}</strong></td>
                    <td><span className="badge accent">{VARIABLE_ROLE_LABEL[v.role]}</span></td>
                    <td className="small"><div className="clamp"><TextOrTodo text={v.conceptualDefinition} /></div></td>
                    <td className="small"><div className="clamp"><TextOrTodo text={v.operationalDefinition} /></div></td>
                    <td className="small">
                      <div>가설: {hyps.length ? hyps.map((h) => h.code).join(', ') : '없음'}</div>
                      <div>문헌: {lits.length ? lits.map((l) => <Link key={l.id} to={`../literature/${l.id}`} style={{ marginRight: 4 }}>{l.code}</Link>) : '없음'}</div>
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={() => setVForm(v)} data-testid={`edit-${v.code}`}>수정</button>
                        <button className="btn sm" onClick={() => setHistoryOf(v)}>이력</button>
                        <button className="btn sm danger" onClick={() => delVar(v)} data-testid={`delete-${v.code}`}>삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>연구가설 <span className="muted small">{b.hypotheses.length}개</span></h2>
      {b.hypotheses.length === 0 ? <Empty title="등록된 가설이 없습니다" /> : (
        <div className="table-wrap">
          <table data-testid="hypothesis-table">
            <thead><tr><th>ID</th><th>가설</th><th>유형·경로</th><th>근거</th><th></th></tr></thead>
            <tbody>
              {b.hypotheses.map((h) => {
                const ev = b.evidence.filter((e) => e.hypothesisIds.includes(h.id));
                const ok = ev.filter((e) => e.status === 'verified').length;
                return (
                  <tr key={h.id} data-testid={`hypothesis-${h.code}`}>
                    <td className="code">{h.code}</td>
                    <td>{h.statement}</td>
                    <td className="small">
                      <span className="badge">{HYPOTHESIS_KIND_LABEL[h.kind]}</span>
                      <div>
                        {h.kind === 'other' ? hypothesisVariableIds(h).map(name).join(', ') || '변수 미연결'
                          : h.kind === 'direct' ? `${name(h.fromVariableId!)} → ${name(h.toVariableId!)}`
                          : h.kind === 'mediation' ? `${name(h.fromVariableId!)} → ${name(h.viaVariableId!)} → ${name(h.toVariableId!)}`
                          : `${name(h.fromVariableId!)} → ${name(h.toVariableId!)} (조절: ${name(h.viaVariableId!)})`}
                      </div>
                    </td>
                    <td className="small">
                      <Link to={`../evidence?h=${h.id}`}>근거 {ev.length}건</Link>
                      <div className={ok ? '' : 'todo'}>확인 완료 {ok}건</div>
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={() => setHForm(h)} data-testid={`edit-${h.code}`}>수정</button>
                        <button className="btn sm danger" onClick={() => delHyp(h)} data-testid={`delete-${h.code}`}>삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {vForm && <VariableForm b={b} item={vForm === 'new' ? null : vForm} onClose={() => setVForm(null)} />}
      {hForm && <HypothesisForm b={b} item={hForm === 'new' ? null : hForm} onClose={() => setHForm(null)} />}
      {historyOf && (
        <Modal title={`수정 이력 · ${historyOf.code} ${historyOf.name}`} onClose={() => setHistoryOf(null)}>
          {b.changeLog.filter((c) => c.entityId === historyOf.id).map((c) => (
            <div key={c.id} className="small" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <div className="muted">{fmtDate(c.at, true)} · {c.action === 'create' ? '등록' : c.action === 'apply-change' ? '변경 요청 적용' : '수정'}</div>
              {c.changes.map((ch, i) => <div key={i}><strong>{ch.field}</strong>: {ch.before || '(없음)'} → {ch.after || '(없음)'}</div>)}
            </div>
          ))}
          <div className="modal-foot"><button className="btn" onClick={() => setHistoryOf(null)}>닫기</button></div>
        </Modal>
      )}
    </>
  );
}
