import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EVIDENCE_STATUS_LABEL, Evidence } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, EvidenceBadge, FictionalBadge, safeFileName, saveBlob, useUi } from '../common';
import { EvidenceForm, StatusSelect } from './LiteraturePage';

export function EvidencePage() {
  const b = useBundle();
  const { toast } = useUi();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'list' | 'byHyp'>('byHyp');
  const [form, setForm] = useState<Evidence | null | 'new'>(null);
  const hyp = params.get('h') ?? '';
  const lit = (id: string) => b.literature.find((l) => l.id === id);
  const match = (e: Evidence) => {
    if (status && e.status !== status) return false;
    const l = lit(e.literatureId);
    const t = `${e.code} ${e.content} ${e.notes} ${l?.title} ${l?.authors}`.toLowerCase();
    return !q.trim() || t.includes(q.trim().toLowerCase());
  };
  const download = async () => {
    try {
      const { evidenceXlsxBuffer } = await import('../../export/xlsx');
      const buf = await evidenceXlsxBuffer(b);
      saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `근거비교표_${safeFileName(b.project.title)}.xlsx`);
      toast('근거 비교표(XLSX)를 내려받았습니다.');
    } catch (e) {
      toast(`파일을 만들지 못했습니다: ${e instanceof Error ? e.message : e}`, true);
    }
  };
  const Row = ({ e }: { e: Evidence }) => {
    const l = lit(e.literatureId);
    return (
      <tr data-testid={`evrow-${e.code}`}>
        <td className="code">{e.code}</td>
        <td><div className="clamp" title={e.content}>{e.content}</div>{e.status === 'recheck' && e.recheckReason && <div className="small todo">재검토 사유: {e.recheckReason}</div>}</td>
        <td className="small">{l ? <Link to={`../literature/${l.id}`}><span className="code">{l.code}</span> <span className="clamp">{l.title}</span></Link> : '—'}<div className="muted">{l?.authors} {l?.year && `(${l.year})`} {l?.isFictional && <FictionalBadge />}</div></td>
        <td>{e.page || <span className="muted">—</span>}</td>
        <td className="small">{e.hypothesisIds.length ? e.hypothesisIds.map((id) => <span key={id} className="chip">{b.hypotheses.find((h) => h.id === id)?.code}</span>) : <span className="todo">가설 미연결</span>}</td>
        <td><EvidenceBadge status={e.status} /><div style={{ marginTop: 4 }}><StatusSelect e={e} /></div></td>
        <td><button className="btn sm" onClick={() => setForm(e)}>수정</button></td>
      </tr>
    );
  };
  const head = <thead><tr><th>ID</th><th>근거 내용</th><th>문헌</th><th>페이지</th><th>가설</th><th>확인 상태</th><th></th></tr></thead>;
  const hyps = b.hypotheses.filter((h) => !hyp || h.id === hyp);
  const unlinked = b.evidence.filter((e) => e.hypothesisIds.length === 0 && match(e));

  return (
    <>
      <div className="page-head">
        <div><h1>근거 비교표</h1><div className="sub">가설·문헌·근거의 연결을 한 표에서 비교합니다. 확인 상태는 원문을 직접 확인한 뒤 사용자가 바꿉니다.</div></div>
        <div className="actions">
          <button className="btn" onClick={download} data-testid="download-xlsx">XLSX 내려받기</button>
          <button className="btn primary" onClick={() => setForm('new')} disabled={!b.literature.length} title={b.literature.length ? '' : '문헌을 먼저 등록하세요'} data-testid="add-evidence-global">근거 등록</button>
        </div>
      </div>
      <div className="filters">
        <select value={view} onChange={(e) => setView(e.target.value as 'list' | 'byHyp')} aria-label="보기 방식" data-testid="ev-view">
          <option value="byHyp">가설별 비교</option><option value="list">근거 전체 목록</option>
        </select>
        <select value={hyp} onChange={(e) => setParams(e.target.value ? { h: e.target.value } : {})} aria-label="가설 필터" data-testid="ev-hyp">
          <option value="">모든 가설</option>
          {b.hypotheses.map((h) => <option key={h.id} value={h.id}>{h.code} {h.statement.slice(0, 30)}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="확인 상태 필터" data-testid="ev-status">
          <option value="">모든 상태</option>
          {Object.entries(EVIDENCE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="search" placeholder="근거·문헌 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="근거 검색" />
      </div>
      {b.evidence.length === 0 && b.hypotheses.length === 0 ? (
        <Empty title="아직 비교할 근거가 없습니다">문헌 화면에서 근거를 등록하고 가설에 연결하세요.</Empty>
      ) : view === 'list' ? (
        <div className="table-wrap"><table data-testid="evidence-list">{head}<tbody>
          {b.evidence.filter((e) => match(e) && (!hyp || e.hypothesisIds.includes(hyp))).map((e) => <Row key={e.id} e={e} />)}
        </tbody></table></div>
      ) : (
        <div data-testid="evidence-by-hyp">
          {hyps.map((h) => {
            const all = b.evidence.filter((e) => e.hypothesisIds.includes(h.id));
            const rows = all.filter(match);
            const ok = all.filter((e) => e.status === 'verified').length;
            return (
              <div key={h.id} className="card tight" data-testid={`group-${h.code}`}>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <div><span className="code">{h.code}</span> <strong>{h.statement}</strong></div>
                  <div className="row small">
                    <span className={`badge ${ok ? 'ok' : 'warn'}`}>확인 완료 {ok}</span>
                    <span className="badge">전체 {all.length}</span>
                    {all.some((e) => e.status === 'recheck') && <span className="badge danger">재검토 필요 {all.filter((e) => e.status === 'recheck').length}</span>}
                  </div>
                </div>
                {all.length === 0 ? <div className="notice warn" style={{ margin: 0 }}>이 가설에 연결된 근거가 없습니다.</div>
                  : rows.length === 0 ? <div className="muted small">조건에 맞는 근거가 없습니다.</div>
                  : <div className="table-wrap"><table>{head}<tbody>{rows.map((e) => <Row key={e.id} e={e} />)}</tbody></table></div>}
              </div>
            );
          })}
          {!hyp && unlinked.length > 0 && (
            <div className="card tight" data-testid="group-unlinked">
              <div style={{ marginBottom: 8 }}><strong>가설에 연결되지 않은 근거</strong> <span className="badge">{unlinked.length}</span></div>
              <div className="table-wrap"><table>{head}<tbody>{unlinked.map((e) => <Row key={e.id} e={e} />)}</tbody></table></div>
            </div>
          )}
        </div>
      )}
      {form && <EvidenceForm b={b} item={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}
