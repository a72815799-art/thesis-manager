import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { loadBundle } from '../db/repo';
import { computeStats } from '../domain/progress';
import { ProjectBundle } from '../domain/types';
import { Empty, Loading, useUi } from './common';
import { confirmLeave } from './unsaved';
import { ChangeRequestPage } from './pages/ChangeRequestPage';
import { Dashboard } from './pages/Dashboard';
import { DataPage } from './pages/DataPage';
import { EvidencePage } from './pages/EvidencePage';
import { FeedbackPage } from './pages/FeedbackPage';
import { HistoryPage } from './pages/HistoryPage';
import { LiteratureDetail, LiteraturePage } from './pages/LiteraturePage';
import { MeetingPage } from './pages/MeetingPage';
import { ModelPage } from './pages/ModelPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProposalPage } from './pages/ProposalPage';

export function useBundle(): ProjectBundle {
  return useOutletContext<ProjectBundle>();
}

const NAV: { group: string; items: { to: string; label: string; count?: (b: ProjectBundle) => [number, boolean] }[] }[] = [
  { group: '진행 현황', items: [{ to: '', label: '대시보드' }] },
  {
    group: '연구 설계',
    items: [
      { to: 'overview', label: '연구 개요·대상' },
      { to: 'model', label: '변수·가설·연구모형', count: (b) => [b.variables.length + b.hypotheses.length, false] },
    ],
  },
  {
    group: '문헌과 근거',
    items: [
      { to: 'literature', label: '문헌', count: (b) => [b.literature.length, false] },
      { to: 'evidence', label: '근거 비교표', count: (b) => { const s = computeStats(b); return s.evidenceRecheck ? [s.evidenceRecheck, true] : [b.evidence.length, false]; } },
    ],
  },
  {
    group: '지도교수',
    items: [
      { to: 'meeting', label: '면담 준비' },
      { to: 'feedback', label: '피드백·변경 요청', count: (b) => { const s = computeStats(b); const n = s.feedbackOpen + s.impactPending; return [n, n > 0]; } },
    ],
  },
  {
    group: '문서와 자료',
    items: [
      { to: 'proposal', label: '연구계획서', count: (b) => [b.proposalVersions.length, false] },
      { to: 'history', label: '수정 이력' },
      { to: 'data', label: '백업·복원' },
    ],
  },
];

/** 프로젝트가 바뀌면 화면 상태를 통째로 새로 만든다(이전 프로젝트 데이터가 잠깐이라도 보이지 않도록). */
function KeyedProjectLayout() {
  const { pid } = useParams();
  return <ProjectLayout key={pid} />;
}

function ProjectLayout() {
  const { pid } = useParams();
  const nav = useNavigate();
  const { saveState } = useUi();
  const bundle = useLiveQuery(async () => {
    try {
      return await loadBundle(pid!);
    } catch {
      return null;
    }
  }, [pid]);
  if (bundle === undefined) return <div className="main"><Loading /></div>;
  if (bundle === null)
    return (
      <div className="main">
        <Empty title="프로젝트를 찾을 수 없습니다">
          삭제되었거나 이 브라우저에 저장되지 않은 프로젝트입니다.
          <div><NavLink className="btn" to="/">프로젝트 목록으로</NavLink></div>
        </Empty>
      </div>
    );
  const p = bundle.project;
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <NavLink to="/" className="brand" onClick={(e) => confirmLeave() || e.preventDefault()}>논문 연구관리</NavLink>
        <div className="side-project">
          <div className="muted small">현재 프로젝트</div>
          <strong title={p.title}>{p.title}</strong>
          <NavLink to="/" className="small" onClick={(e) => confirmLeave() || e.preventDefault()}>프로젝트 바꾸기</NavLink>
        </div>
        <nav className="nav" aria-label="프로젝트 메뉴">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((it) => {
                const c = it.count?.(bundle);
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === ''} data-testid={`nav-${it.to || 'dashboard'}`} onClick={(e) => confirmLeave() || e.preventDefault()}>
                    <span>{it.label}</span>
                    {c && c[0] > 0 && <span className={`count ${c[1] ? 'alert' : ''}`}>{c[0]}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="page">
          <div className="mobile-nav no-print">
            <select
              aria-label="메뉴 이동"
              value=""
              onChange={(e) => confirmLeave() && nav(e.target.value === '/' ? '/' : `/p/${p.id}/${e.target.value === '_' ? '' : e.target.value}`)}
            >
              <option value="" disabled>메뉴 이동…</option>
              {NAV.flatMap((g) => g.items).map((it) => (
                <option key={it.to} value={it.to || '_'}>{it.label}</option>
              ))}
              <option value="/">프로젝트 목록</option>
            </select>
          </div>
          {p.isDemo && (
            <div className="demo-banner" data-testid="demo-banner">
              가상 예시 데이터 — 이 프로젝트의 연구 내용과 문헌은 기능 시연용으로 만든 가상의 예시이며 실제 연구·실제 논문이 아닙니다.
            </div>
          )}
          <div className={`save-state no-print ${saveState.failed ? 'fail' : ''}`} data-testid="save-state" style={{ textAlign: 'right', marginBottom: 4 }}>
            {saveState.saving
              ? '저장 중…'
              : saveState.failed
              ? '마지막 저장에 실패했습니다. 다시 시도하세요.'
              : saveState.at
                ? `변경 내용이 이 브라우저에 저장됨 · ${saveState.at.toLocaleTimeString('ko-KR')}`
                : '모든 내용은 이 브라우저에만 저장됩니다. 정기적으로 백업하세요.'}
          </div>
          <Outlet context={bundle} />
        </div>
      </main>
    </div>
  );
}

export function App() {
  // DB 를 열 수 없는 환경(사생활 보호 모드 등) 안내
  const dbOk = useLiveQuery(async () => {
    try {
      await db.projects.count();
      return true;
    } catch {
      return false;
    }
  }, []);
  if (dbOk === false)
    return (
      <div className="main">
        <Empty title="브라우저 저장소를 사용할 수 없습니다">
          이 브라우저(또는 사생활 보호 모드)에서는 데이터를 저장할 수 없습니다. 일반 창에서 다시 열어 주세요.
        </Empty>
      </div>
    );
  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/p/:pid" element={<KeyedProjectLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="model" element={<ModelPage />} />
        <Route path="literature" element={<LiteraturePage />} />
        <Route path="literature/:lid" element={<LiteratureDetail />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="meeting" element={<MeetingPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="changes/:crid" element={<ChangeRequestPage />} />
        <Route path="proposal" element={<ProposalPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="data" element={<DataPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
