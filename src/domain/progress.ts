import { ProjectBundle, hypothesisVariableIds } from './types';

export interface ProgressCriterion {
  key: string;
  label: string;
  /** 완료 기준 설명 */
  rule: string;
  done: boolean;
  /** 미완료 시 안내 */
  hint: string;
  /** 이동할 화면 */
  link: string;
}

export interface DashboardStats {
  variables: number;
  hypotheses: number;
  literature: number;
  evidence: number;
  evidenceVerified: number;
  evidenceNeedsCheck: number; // 미확인 + 확인 중 + 재검토 필요
  evidenceRecheck: number;
  feedbackOpen: number;
  impactPending: number;
  changeRequestsDraft: number;
}

export function computeStats(b: ProjectBundle): DashboardStats {
  return {
    variables: b.variables.length,
    hypotheses: b.hypotheses.length,
    literature: b.literature.length,
    evidence: b.evidence.length,
    evidenceVerified: b.evidence.filter((e) => e.status === 'verified').length,
    evidenceNeedsCheck: b.evidence.filter((e) => e.status !== 'verified').length,
    evidenceRecheck: b.evidence.filter((e) => e.status === 'recheck').length,
    feedbackOpen: b.feedback.filter((f) => f.status !== 'done').length,
    impactPending: b.impactReviews.filter((r) => r.needsReview && r.status === 'pending').length,
    changeRequestsDraft: b.changeRequests.filter((c) => c.status === 'draft').length,
  };
}

/**
 * 진행률 = 아래 9개 기준 중 충족한 개수 / 9.
 * 각 기준은 데이터에서 기계적으로 판정되며 임의 수치를 쓰지 않는다.
 */
export function computeProgress(b: ProjectBundle): ProgressCriterion[] {
  const p = b.project;
  const s = b.subject;
  const hasRole = (r: string) => b.variables.some((v) => v.role === r);
  const hypWithoutVerified = b.hypotheses.filter(
    (h) => !b.evidence.some((e) => e.hypothesisIds.includes(h.id) && e.status === 'verified'),
  );
  const stats = computeStats(b);
  return [
    {
      key: 'overview',
      label: '연구 개요 작성',
      rule: '연구 제목·목적·배경·방법이 모두 입력됨',
      done: [p.title, p.purpose, p.background, p.method].every((x) => x.trim()),
      hint: '연구 개요에서 목적·배경·방법을 입력하세요.',
      link: 'overview',
    },
    {
      key: 'subject',
      label: '연구 대상 정의',
      rule: '연구 대상과 모집 기준이 입력됨',
      done: !!s.population.trim() && !!s.recruitmentCriteria.trim(),
      hint: '연구 개요에서 연구 대상과 모집 기준을 입력하세요.',
      link: 'overview',
    },
    {
      key: 'variables',
      label: '연구변수 정의',
      rule: '독립·종속변수가 1개 이상이고 모든 변수에 개념적 정의가 있음',
      done:
        hasRole('independent') && hasRole('dependent') && b.variables.every((v) => v.conceptualDefinition.trim()),
      hint: '연구모형에서 독립·종속변수를 등록하고 개념적 정의를 입력하세요.',
      link: 'model',
    },
    {
      key: 'hypotheses',
      label: '연구가설 수립',
      rule: '가설이 1개 이상이고 모든 가설이 변수와 연결됨',
      done: b.hypotheses.length > 0 && b.hypotheses.every((h) => hypothesisVariableIds(h).length >= 2),
      hint: '연구모형에서 가설을 등록하고 변수를 연결하세요.',
      link: 'model',
    },
    {
      key: 'literature',
      label: '문헌 등록',
      rule: '문헌이 1편 이상 등록되고 핵심 선행연구가 1편 이상 지정됨',
      done: b.literature.length > 0 && b.literature.some((l) => l.isKey),
      hint: '문헌을 등록하고 핵심 선행연구를 지정하세요.',
      link: 'literature',
    },
    {
      key: 'evidence',
      label: '가설별 근거 확보',
      rule: '모든 가설에 "사용자 확인 완료" 근거가 1건 이상 연결됨',
      done: b.hypotheses.length > 0 && hypWithoutVerified.length === 0,
      hint:
        b.hypotheses.length === 0
          ? '가설을 먼저 등록하세요.'
          : `확인 완료 근거가 없는 가설: ${hypWithoutVerified.map((h) => h.code).join(', ')}`,
      link: 'evidence',
    },
    {
      key: 'recheck',
      label: '재검토 항목 정리',
      rule: '"재검토 필요" 근거와 확인 전 영향 검토 항목이 0건',
      done: stats.evidenceRecheck === 0 && stats.impactPending === 0,
      hint: `재검토 필요 근거 ${stats.evidenceRecheck}건, 확인 전 영향 항목 ${stats.impactPending}건이 남아 있습니다.`,
      link: stats.impactPending > 0 ? 'feedback' : 'evidence',
    },
    {
      key: 'feedback',
      label: '지도교수 피드백 처리',
      rule: '피드백이 1건 이상 기록되고 미처리 피드백이 0건',
      done: b.feedback.length > 0 && stats.feedbackOpen === 0,
      hint: b.feedback.length === 0 ? '면담 후 지도교수 피드백을 기록하세요.' : `미처리 피드백 ${stats.feedbackOpen}건이 있습니다.`,
      link: 'feedback',
    },
    {
      key: 'proposal',
      label: '연구계획서 확정',
      rule: '확정 상태의 계획서 버전이 1개 이상 있음',
      done: b.proposalVersions.some((v) => v.status === 'confirmed'),
      hint: '계획서 버전을 만들고 확정하세요.',
      link: 'proposal',
    },
  ];
}
