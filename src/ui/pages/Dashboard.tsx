import { Link } from 'react-router-dom';
import { computeProgress, computeStats } from '../../domain/progress';
import { STAGE_LABEL } from '../../domain/types';
import { useBundle } from '../App';
import { fmtDate } from '../common';
import { ACTION_LABEL } from './HistoryPage';

export function Dashboard() {
  const b = useBundle();
  const stats = computeStats(b);
  const progress = computeProgress(b);
  const done = progress.filter((c) => c.done).length;
  const pct = Math.round((done / progress.length) * 100);
  const next = progress.filter((c) => !c.done).slice(0, 3);
  const upcoming = b.project.milestones.filter((m) => !m.done);
  const S = ({ n, l, to, alert }: { n: number; l: string; to: string; alert?: boolean }) => (
    <Link to={to} className={`stat ${alert && n > 0 ? 'alert' : ''}`} style={{ color: 'inherit', textDecoration: 'none' }} data-testid={`stat-${l}`}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </Link>
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{b.project.title}</h1>
          <div className="sub">
            <span className="badge accent">{STAGE_LABEL[b.project.stage]}</span> {b.project.researchType} · 수정 {fmtDate(b.project.updatedAt, true)}
          </div>
        </div>
      </div>
      <div className="grid c4" style={{ marginBottom: 14 }}>
        <S n={stats.variables} l="연구변수" to="model" />
        <S n={stats.hypotheses} l="연구가설" to="model" />
        <S n={stats.literature} l="등록 문헌" to="literature" />
        <S n={stats.evidenceVerified} l="확인 완료 근거" to="evidence" />
        <S n={stats.evidenceNeedsCheck} l="검토가 필요한 근거" to="evidence" alert />
        <S n={stats.feedbackOpen} l="미처리 피드백" to="feedback" alert />
        <S n={stats.impactPending} l="확인 전 영향 항목" to="feedback" alert />
        <S n={b.proposalVersions.length} l="계획서 버전" to="proposal" />
      </div>
      <div className="grid c2">
        <div className="card">
          <div className="row between">
            <h2>진행 상태</h2>
            <strong data-testid="progress-pct">{done} / {progress.length} ({pct}%)</strong>
          </div>
          <div className="progress" aria-hidden><div style={{ width: `${pct}%` }} /></div>
          <p className="muted small" style={{ marginTop: 6 }}>진행률은 아래 {progress.length}개 기준 중 충족한 개수로 계산합니다.</p>
          <ul className="checklist">
            {progress.map((c) => (
              <li key={c.key}>
                <span className={`mark ${c.done ? 'done' : 'muted'}`}>{c.done ? '✓' : '○'}</span>
                <div>
                  <div><strong>{c.label}</strong></div>
                  <div className="muted small">기준: {c.rule}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="card">
            <h2>다음 작업</h2>
            {next.length === 0 ? (
              <p>모든 기준을 충족했습니다.</p>
            ) : (
              <ul className="checklist" data-testid="next-actions">
                {next.map((c) => (
                  <li key={c.key}>
                    <span className="mark muted">→</span>
                    <div><Link to={c.link}><strong>{c.label}</strong></Link><div className="small">{c.hint}</div></div>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 && (
              <>
                <h3 style={{ marginTop: 12 }}>남은 일정</h3>
                {upcoming.map((m) => <div key={m.id} className="small">{m.date || '날짜 미정'} · {m.label}</div>)}
              </>
            )}
          </div>
          <div className="card">
            <div className="row between"><h2>최근 수정 이력</h2><Link to="history" className="small">전체 보기</Link></div>
            {b.changeLog.slice(0, 6).map((c) => (
              <div key={c.id} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="muted">{fmtDate(c.at, true)}</span> · {c.entityLabel} <span className="badge">{ACTION_LABEL[c.action]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
