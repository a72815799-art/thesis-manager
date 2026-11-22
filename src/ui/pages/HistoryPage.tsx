import { useState } from 'react';
import { ChangeLogEntry } from '../../domain/types';
import { useBundle } from '../App';
import { Empty, fmtDate } from '../common';

export const ACTION_LABEL: Record<ChangeLogEntry['action'], string> = {
  create: '등록',
  update: '수정',
  delete: '삭제',
  'apply-change': '변경 적용',
  status: '상태 변경',
  restore: '복원',
};
const TYPE_LABEL: Record<string, string> = {
  project: '연구 개요', subject: '연구 대상', variable: '변수', hypothesis: '가설', literature: '문헌', evidence: '근거',
  attachment: '첨부', meeting: '면담 준비', feedback: '피드백', changeRequest: '변경 요청', proposalVersion: '계획서 버전',
};

export function HistoryPage() {
  const b = useBundle();
  const [type, setType] = useState('');
  const rows = b.changeLog.filter((c) => !type || c.entityType === type);
  return (
    <>
      <div className="page-head">
        <div><h1>수정 이력</h1><div className="sub">모든 등록·수정·삭제·변경 적용이 자동으로 기록됩니다. 이력은 지워지지 않습니다.</div></div>
      </div>
      <div className="filters">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="항목 종류">
          <option value="">전체 항목</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted small">{rows.length}건</span>
      </div>
      {rows.length === 0 ? <Empty title="이력이 없습니다" /> : (
        <div className="table-wrap">
          <table data-testid="history-table">
            <thead><tr><th>시각</th><th>항목</th><th>작업</th><th>변경 내용</th></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((c) => (
                <tr key={c.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.at, true)}</td>
                  <td><span className="badge">{TYPE_LABEL[c.entityType] ?? c.entityType}</span> {c.entityLabel}</td>
                  <td><span className={`badge ${c.action === 'apply-change' ? 'accent' : c.action === 'delete' ? 'danger' : ''}`}>{ACTION_LABEL[c.action]}</span></td>
                  <td className="small">
                    {c.changes.map((ch, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <strong>{ch.field}</strong>: <span className="muted clamp">{ch.before || '(없음)'}</span> <span className="arrow">→</span> <span className="clamp">{ch.after || '(없음)'}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
