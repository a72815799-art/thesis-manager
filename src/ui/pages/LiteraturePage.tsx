import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EvidenceInput, LiteratureInput, addAttachment, deleteAttachment, deleteEvidence, deleteLiterature, getAttachmentData, saveEvidence, saveLiterature, setEvidenceStatus } from '../../db/repo';
import { EVIDENCE_KIND_LABEL, EVIDENCE_STATUS_LABEL, Evidence, EvidenceKind, EvidenceStatus, Literature, LiteratureSourceType, ProjectBundle, SOURCE_TYPE_LABEL } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, EvidenceBadge, FictionalBadge, Field, Modal, MultiCheck, TextArea, TextInput, TextOrTodo, saveBlob, useUi } from '../common';

const emptyLit: LiteratureInput = { title: '', authors: '', year: '', sourceType: 'journal', source: '', doi: '', url: '', sample: '', method: '', keyFindings: '', notes: '', variableIds: [], isKey: false };

export function LiteratureForm({ b, item, onClose, onSaved }: { b: ProjectBundle; item: Literature | null; onClose: () => void; onSaved?: (l: Literature) => void }) {
  const { run } = useUi();
  const [f, setF] = useState<LiteratureInput>(item ? { ...item } : emptyLit);
  const set = <K extends keyof LiteratureInput>(k: K, v: LiteratureInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const { title, authors, year, sourceType, source, doi, url, sample, method, keyFindings, notes, variableIds, isKey } = f;
    const r = await run(() => saveLiterature(b.project.id, { title, authors, year, sourceType, source, doi, url, sample, method, keyFindings, notes, variableIds, isKey }, item?.id), '문헌을 저장했습니다.');
    if (r) {
      onClose();
      onSaved?.(r);
    }
  };
  return (
    <Modal title={item ? `문헌 수정 · ${item.code}` : '문헌 등록'} onClose={onClose} wide testid="literature-form">
      <div className="notice">논문 정보는 직접 확인한 내용만 입력하세요. 프로그램은 서지정보나 연구 결과를 자동으로 만들어 내지 않습니다.</div>
      <Field label="논문 제목" required><TextArea value={f.title} onChange={(v) => set('title', v)} rows={2} autoFocus data-testid="l-title" /></Field>
      <div className="grid c3">
        <Field label="저자"><TextInput value={f.authors} onChange={(v) => set('authors', v)} data-testid="l-authors" /></Field>
        <Field label="출판연도" help="4자리 숫자"><TextInput value={f.year} onChange={(v) => set('year', v)} inputMode="numeric" data-testid="l-year" /></Field>
        <Field label="문헌 유형">
          <select value={f.sourceType} onChange={(e) => set('sourceType', e.target.value as LiteratureSourceType)}>
            {Object.entries(SOURCE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="학술지 또는 학위논문 정보" help="예: 학술지명, 권(호), 쪽 / 대학교 석사학위논문"><TextInput value={f.source} onChange={(v) => set('source', v)} data-testid="l-source" /></Field>
      <div className="grid c2">
        <Field label="DOI" optional><TextInput value={f.doi} onChange={(v) => set('doi', v)} data-testid="l-doi" /></Field>
        <Field label="URL" optional><TextInput value={f.url} onChange={(v) => set('url', v)} data-testid="l-url" placeholder="https://" /></Field>
      </div>
      <div className="grid c2">
        <Field label="연구 대상"><TextInput value={f.sample} onChange={(v) => set('sample', v)} data-testid="l-sample" /></Field>
        <Field label="연구 방법"><TextInput value={f.method} onChange={(v) => set('method', v)} data-testid="l-method" /></Field>
      </div>
      <Field label="핵심 결과"><TextArea value={f.keyFindings} onChange={(v) => set('keyFindings', v)} data-testid="l-findings" /></Field>
      <Field label="관련 변수" optional>
        <MultiCheck name="l-var" options={b.variables.map((v) => ({ id: v.id, label: `${v.code} ${v.name}` }))} value={f.variableIds} onChange={(v) => set('variableIds', v)} empty="등록된 변수가 없습니다." />
      </Field>
      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={f.isKey} onChange={(e) => set('isKey', e.target.checked)} data-testid="l-key" /> 핵심 선행연구로 지정 (연구계획서에 포함)
      </label>
      <Field label="사용자 메모" optional><TextArea value={f.notes} onChange={(v) => set('notes', v)} rows={2} /></Field>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} data-testid="l-save">저장</button>
      </div>
    </Modal>
  );
}

export function EvidenceForm({ b, item, literatureId, onClose }: { b: ProjectBundle; item: Evidence | null; literatureId?: string; onClose: () => void }) {
  const { run } = useUi();
  const [f, setF] = useState<EvidenceInput>(item ? { ...item } : { literatureId: literatureId ?? b.literature[0]?.id ?? '', content: '', page: '', kind: 'summary', variableIds: [], hypothesisIds: [], notes: '' });
  const set = <K extends keyof EvidenceInput>(k: K, v: EvidenceInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const { literatureId: lid, content, page, kind, variableIds, hypothesisIds, notes } = f;
    const r = await run(() => saveEvidence(b.project.id, { literatureId: lid, content, page, kind, variableIds, hypothesisIds, notes }, item?.id), '근거를 저장했습니다.');
    if (r) onClose();
  };
  return (
    <Modal title={item ? `근거 수정 · ${item.code}` : '근거 등록'} onClose={onClose} wide testid="evidence-form">
      <Field label="출처 문헌" required>
        <select value={f.literatureId} onChange={(e) => set('literatureId', e.target.value)} data-testid="e-literature">
          {b.literature.map((l) => <option key={l.id} value={l.id}>{l.code} {l.title.slice(0, 60)}</option>)}
        </select>
      </Field>
      <Field label="근거 내용" required help="논문에서 직접 확인한 문장이나 그 요약을 입력하세요."><TextArea value={f.content} onChange={(v) => set('content', v)} rows={4} autoFocus data-testid="e-content" /></Field>
      <div className="grid c2">
        <Field label="구분" required>
          <select value={f.kind} onChange={(e) => set('kind', e.target.value as EvidenceKind)} data-testid="e-kind">
            {Object.entries(EVIDENCE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="PDF 페이지" help="예: 12 또는 12-13"><TextInput value={f.page} onChange={(v) => set('page', v)} data-testid="e-page" /></Field>
      </div>
      <Field label="연결할 연구가설">
        <MultiCheck name="e-hyp" options={b.hypotheses.map((h) => ({ id: h.id, label: `${h.code} ${h.statement.slice(0, 34)}${h.statement.length > 34 ? '…' : ''}` }))} value={f.hypothesisIds} onChange={(v) => set('hypothesisIds', v)} empty="등록된 가설이 없습니다." />
      </Field>
      <Field label="연결할 연구변수">
        <MultiCheck name="e-var" options={b.variables.map((v) => ({ id: v.id, label: `${v.code} ${v.name}` }))} value={f.variableIds} onChange={(v) => set('variableIds', v)} empty="등록된 변수가 없습니다." />
      </Field>
      <Field label="사용자 메모" optional><TextArea value={f.notes} onChange={(v) => set('notes', v)} rows={2} /></Field>
      {!item && <div className="help">새 근거는 ‘미확인’ 상태로 등록됩니다. 원문을 직접 확인한 뒤 상태를 바꾸세요.</div>}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} data-testid="e-save">저장</button>
      </div>
    </Modal>
  );
}

export function StatusSelect({ e }: { e: Evidence }) {
  const { run } = useUi();
  return (
    <select className="inline" value={e.status} aria-label={`${e.code} 확인 상태`} data-testid={`status-${e.code}`}
      onChange={(ev) => run(() => setEvidenceStatus(e.id, ev.target.value as EvidenceStatus, '사용자가 직접 재검토 필요로 표시'), '확인 상태를 저장했습니다.')}>
      {Object.entries(EVIDENCE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function LiteraturePage() {
  const b = useBundle();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('');
  const [form, setForm] = useState(false);
  const rows = b.literature.filter((l) => {
    const t = `${l.code} ${l.title} ${l.authors} ${l.year} ${l.source} ${l.keyFindings}`.toLowerCase();
    if (q.trim() && !t.includes(q.trim().toLowerCase())) return false;
    if (only === 'key' && !l.isKey) return false;
    if (only === 'noev' && b.evidence.some((e) => e.literatureId === l.id)) return false;
    return true;
  });
  return (
    <>
      <div className="page-head">
        <div><h1>문헌</h1><div className="sub">논문 정보를 직접 등록하고, 문헌마다 근거와 PDF를 연결합니다.</div></div>
        <div className="actions"><button className="btn primary" onClick={() => setForm(true)} data-testid="add-literature">문헌 등록</button></div>
      </div>
      {b.literature.length === 0 ? (
        <Empty title="등록된 문헌이 없습니다">읽은 논문의 정보를 등록해 보세요.<div><button className="btn primary" onClick={() => setForm(true)}>문헌 등록</button></div></Empty>
      ) : (
        <>
          <div className="filters">
            <input type="search" placeholder="제목·저자·연도·내용 검색" value={q} onChange={(e) => setQ(e.target.value)} data-testid="lit-search" aria-label="문헌 검색" />
            <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="문헌 필터">
              <option value="">전체</option><option value="key">핵심 선행연구만</option><option value="noev">근거 없는 문헌만</option>
            </select>
            <span className="muted small">{rows.length} / {b.literature.length}편</span>
          </div>
          {rows.length === 0 ? <Empty title="조건에 맞는 문헌이 없습니다" /> : (
            <div className="table-wrap">
              <table data-testid="literature-table">
                <thead><tr><th>ID</th><th>문헌</th><th>연구 대상</th><th>핵심 결과</th><th className="num">근거</th><th className="num">첨부</th></tr></thead>
                <tbody>
                  {rows.map((l) => {
                    const ev = b.evidence.filter((e) => e.literatureId === l.id);
                    return (
                      <tr key={l.id} data-testid={`literature-${l.code}`}>
                        <td className="code">{l.code}</td>
                        <td>
                          <Link to={l.id}><strong className="clamp">{l.title}</strong></Link>
                          <div className="small muted">{l.authors || '저자 미입력'} · {l.year || '연도 미입력'} {l.isKey && <span className="badge accent">핵심</span>} {l.isFictional && <FictionalBadge />}</div>
                        </td>
                        <td className="small">{l.sample || <span className="muted">—</span>}</td>
                        <td className="small"><div className="clamp">{l.keyFindings || <span className="muted">—</span>}</div></td>
                        <td className="num">{ev.length}{ev.some((e) => e.status === 'recheck') && <div><span className="badge danger">재검토</span></div>}</td>
                        <td className="num">{b.attachments.filter((a) => a.literatureId === l.id).length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {form && <LiteratureForm b={b} item={null} onClose={() => setForm(false)} onSaved={(l) => nav(l.id)} />}
    </>
  );
}

export function LiteratureDetail() {
  const b = useBundle();
  const { lid } = useParams();
  const nav = useNavigate();
  const { run, confirm, toast } = useUi();
  const l = b.literature.find((x) => x.id === lid);
  const [edit, setEdit] = useState(false);
  const [evForm, setEvForm] = useState<Evidence | null | 'new'>(null);
  const [refOnly, setRefOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!l) return <Empty title="문헌을 찾을 수 없습니다">삭제된 문헌입니다. <Link to="../literature">문헌 목록으로</Link></Empty>;
  const evidence = b.evidence.filter((e) => e.literatureId === l.id);
  const atts = b.attachments.filter((a) => a.literatureId === l.id);
  const name = (id: string) => b.variables.find((v) => v.id === id);

  const del = async () => {
    if (await confirm({ title: `문헌 삭제 · ${l.code}`, body: <p>이 문헌과 함께 <strong>근거 {evidence.length}건, 첨부 {atts.length}건</strong>이 삭제됩니다. 되돌릴 수 없습니다.</p>, confirmLabel: '모두 삭제', danger: true })) {
      const r = await run(() => deleteLiterature(l.id), '문헌을 삭제했습니다.');
      if (r) nav('../literature');
    }
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const data = refOnly ? null : await file.arrayBuffer();
    await run(() => addAttachment(b.project.id, l.id, { fileName: file.name, mimeType: file.type || 'application/pdf', size: file.size }, data), refOnly ? '파일 참조 정보를 저장했습니다(파일 본문은 저장하지 않음).' : 'PDF를 이 브라우저에 저장했습니다.');
    if (fileRef.current) fileRef.current.value = '';
  };
  const open = async (id: string, fileName: string) => {
    const data = await getAttachmentData(id);
    if (!data) return toast('파일 본문이 저장되어 있지 않습니다.', true);
    saveBlob(new Blob([data], { type: 'application/pdf' }), fileName);
  };

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="small"><Link to="../literature">← 문헌 목록</Link></div>
          <h1><span className="code">{l.code}</span> {l.title}</h1>
          <div className="sub">{l.authors || '저자 미입력'} · {l.year || '연도 미입력'} · {SOURCE_TYPE_LABEL[l.sourceType]} {l.isKey && <span className="badge accent">핵심 선행연구</span>} {l.isFictional && <FictionalBadge />}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setEdit(true)} data-testid="edit-literature">수정</button>
          <button className="btn danger" onClick={del} data-testid="delete-literature">삭제</button>
        </div>
      </div>
      <div className="grid c2">
        <div className="card">
          <h2>문헌 정보</h2>
          <table><tbody>
            <tr><th>학술지/학위논문</th><td>{l.source || <span className="muted">—</span>}</td></tr>
            <tr><th>DOI</th><td>{l.doi || <span className="muted">—</span>}</td></tr>
            <tr><th>URL</th><td>{l.url ? <a href={l.url} target="_blank" rel="noreferrer noopener">{l.url}</a> : <span className="muted">—</span>}</td></tr>
            <tr><th>연구 대상</th><td>{l.sample || <span className="muted">—</span>}</td></tr>
            <tr><th>연구 방법</th><td>{l.method || <span className="muted">—</span>}</td></tr>
            <tr><th>핵심 결과</th><td><TextOrTodo text={l.keyFindings} /></td></tr>
            <tr><th>관련 변수</th><td>{l.variableIds.length ? l.variableIds.map((id) => <span key={id} className="chip">{name(id)?.code} {name(id)?.name}</span>) : <span className="muted">—</span>}</td></tr>
            <tr><th>메모</th><td className="pre">{l.notes || <span className="muted">—</span>}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <h2>PDF 첨부 <span className="muted small">{atts.length}개</span></h2>
          <p className="small muted">PDF 본문은 이 브라우저의 저장 공간에 보관됩니다(최대 50MB). 저장 공간이 부족하거나 파일을 넣고 싶지 않으면 ‘참조만 저장’을 선택하세요. 이 경우 파일명만 기록되고 파일은 열 수 없습니다.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(e) => onFile(e.target.files?.[0])} data-testid="attach-input" aria-label="PDF 파일 선택" />
            <label className="check"><input type="checkbox" checked={refOnly} onChange={(e) => setRefOnly(e.target.checked)} data-testid="attach-refonly" /> 참조만 저장</label>
          </div>
          {atts.map((a) => (
            <div key={a.id} className="row between" style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }} data-testid="attachment-row">
              <div className="small">
                <strong>{a.fileName}</strong> <span className={`badge ${a.storage === 'stored' ? 'ok' : 'warn'}`}>{a.storage === 'stored' ? '파일 저장됨' : '참조만 저장'}</span>
                <div className="muted">{(a.size / 1024).toFixed(0)} KB {a.note && `· ${a.note}`}</div>
              </div>
              <div className="row">
                {a.storage === 'stored' && <button className="btn sm" onClick={() => open(a.id, a.fileName)}>내려받기</button>}
                <button className="btn sm danger" onClick={async () => (await confirm({ title: '첨부 삭제', body: <p>{a.fileName} 첨부를 삭제합니다.</p>, confirmLabel: '삭제', danger: true })) && run(() => deleteAttachment(a.id), '첨부를 삭제했습니다.')}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="row between" style={{ margin: '6px 0 10px' }}>
        <h2 style={{ margin: 0 }}>이 문헌의 근거 <span className="muted small">{evidence.length}건</span></h2>
        <button className="btn primary" onClick={() => setEvForm('new')} data-testid="add-evidence">근거 등록</button>
      </div>
      {evidence.length === 0 ? <Empty title="등록된 근거가 없습니다">이 논문에서 가설을 뒷받침하는 내용을 근거로 등록하세요.</Empty> : (
        <div className="table-wrap">
          <table data-testid="evidence-table">
            <thead><tr><th>ID</th><th>근거 내용</th><th>페이지</th><th>연결</th><th>확인 상태</th><th></th></tr></thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id} data-testid={`evidence-${e.code}`}>
                  <td className="code">{e.code}</td>
                  <td><div className="pre">{e.content}</div><div className="small muted">{EVIDENCE_KIND_LABEL[e.kind]}{e.notes && ` · 메모: ${e.notes}`}</div>{e.status === 'recheck' && e.recheckReason && <div className="small todo">재검토 사유: {e.recheckReason}</div>}</td>
                  <td>{e.page || <span className="muted">—</span>}</td>
                  <td className="small">
                    {e.hypothesisIds.map((id) => <span key={id} className="chip">{b.hypotheses.find((h) => h.id === id)?.code}</span>)}
                    {e.variableIds.map((id) => <span key={id} className="chip">{name(id)?.name}</span>)}
                    {!e.hypothesisIds.length && !e.variableIds.length && <span className="todo">연결 없음</span>}
                  </td>
                  <td><EvidenceBadge status={e.status} /><div style={{ marginTop: 4 }}><StatusSelect e={e} /></div></td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setEvForm(e)}>수정</button>
                    <button className="btn sm danger" onClick={async () => (await confirm({ title: `근거 삭제 · ${e.code}`, body: <p>이 근거를 삭제합니다. 되돌릴 수 없습니다.</p>, confirmLabel: '삭제', danger: true })) && run(() => deleteEvidence(e.id), '근거를 삭제했습니다.')}>삭제</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <LiteratureForm b={b} item={l} onClose={() => setEdit(false)} />}
      {evForm && <EvidenceForm b={b} item={evForm === 'new' ? null : evForm} literatureId={l.id} onClose={() => setEvForm(null)} />}
    </>
  );
}
