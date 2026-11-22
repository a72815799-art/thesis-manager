/**
 * 핵심 데이터 모델.
 * - 모든 엔터티는 고유 id(UUID)와 projectId 를 가진다.
 * - 관계는 이름 문자열이 아니라 id 로만 연결한다.
 * - code(V1, H1, L1 …)는 사람이 읽는 표시용 번호이며 관계 키로 쓰지 않는다.
 */

export const SCHEMA_VERSION = 1;

export type ID = string;

export type VariableRole = 'independent' | 'dependent' | 'mediator' | 'moderator' | 'control';
export const VARIABLE_ROLE_LABEL: Record<VariableRole, string> = {
  independent: '독립변수',
  dependent: '종속변수',
  mediator: '매개변수',
  moderator: '조절변수',
  control: '통제변수',
};

export type ProjectStage =
  | 'topic'
  | 'literature'
  | 'proposal'
  | 'ethics'
  | 'data'
  | 'analysis'
  | 'writing'
  | 'defense'
  | 'submitted';
export const STAGE_LABEL: Record<ProjectStage, string> = {
  topic: '주제 선정',
  literature: '선행연구 검토',
  proposal: '연구계획서 작성',
  ethics: '연구윤리 심의',
  data: '자료 수집',
  analysis: '자료 분석',
  writing: '논문 작성',
  defense: '논문 심사',
  submitted: '최종 제출',
};

export interface Milestone {
  id: ID;
  label: string;
  date: string; // YYYY-MM-DD 또는 ''
  done: boolean;
}

export interface Counters {
  V: number;
  H: number;
  L: number;
  E: number;
  F: number;
  CR: number;
  M: number;
}

export interface Project {
  id: ID;
  title: string;
  purpose: string;
  background: string;
  method: string;
  researchType: string;
  stage: ProjectStage;
  researchQuestions: string[];
  milestones: Milestone[];
  notes: string;
  /** 가상 예시 데이터 여부. true 이면 화면과 내보낸 파일에 모두 표시한다. */
  isDemo: boolean;
  counters: Counters;
  createdAt: string;
  updatedAt: string;
}

/** 연구 대상. 프로젝트당 1건. */
export interface ResearchSubject {
  id: ID;
  projectId: ID;
  population: string;
  definition: string;
  recruitmentCriteria: string;
  exclusionCriteria: string;
  samplePlan: string;
  notes: string;
  updatedAt: string;
}

export interface ResearchVariable {
  id: ID;
  projectId: ID;
  code: string;
  name: string;
  role: VariableRole;
  conceptualDefinition: string;
  operationalDefinition: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type HypothesisKind = 'direct' | 'mediation' | 'moderation' | 'other';
export const HYPOTHESIS_KIND_LABEL: Record<HypothesisKind, string> = {
  direct: '직접 관계',
  mediation: '매개효과',
  moderation: '조절효과',
  other: '기타',
};

export interface Hypothesis {
  id: ID;
  projectId: ID;
  code: string;
  statement: string;
  kind: HypothesisKind;
  /** 원인(독립) 쪽 변수 */
  fromVariableId: ID | null;
  /** 결과(종속) 쪽 변수 */
  toVariableId: ID | null;
  /** 매개변수 또는 조절변수 */
  viaVariableId: ID | null;
  /** 위 세 칸에 들어가지 않는 추가 관련 변수 */
  extraVariableIds: ID[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type LiteratureSourceType = 'journal' | 'thesis' | 'book' | 'report' | 'other';
export const SOURCE_TYPE_LABEL: Record<LiteratureSourceType, string> = {
  journal: '학술지 논문',
  thesis: '학위논문',
  book: '단행본',
  report: '보고서',
  other: '기타',
};

export interface Literature {
  id: ID;
  projectId: ID;
  code: string;
  title: string;
  authors: string;
  year: string;
  sourceType: LiteratureSourceType;
  source: string;
  doi: string;
  url: string;
  sample: string;
  method: string;
  keyFindings: string;
  notes: string;
  variableIds: ID[];
  /** 계획서의 '핵심 선행연구'에 포함할지 여부 */
  isKey: boolean;
  /** 실제 문헌이 아닌 가상 예시 */
  isFictional: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EvidenceKind = 'quote' | 'summary';
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  quote: '원문 발췌',
  summary: '사용자 요약',
};

export type EvidenceStatus = 'unverified' | 'checking' | 'verified' | 'recheck';
export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  unverified: '미확인',
  checking: '확인 중',
  verified: '사용자 확인 완료',
  recheck: '재검토 필요',
};

export interface Evidence {
  id: ID;
  projectId: ID;
  literatureId: ID;
  code: string;
  content: string;
  page: string;
  kind: EvidenceKind;
  variableIds: ID[];
  hypothesisIds: ID[];
  notes: string;
  /** 확인 상태는 오직 사용자의 조작(또는 사용자가 승인한 변경 적용)으로만 바뀐다. */
  status: EvidenceStatus;
  recheckReason: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentStorage = 'stored' | 'reference-only';

export interface Attachment {
  id: ID;
  projectId: ID;
  literatureId: ID;
  fileName: string;
  mimeType: string;
  size: number;
  /** stored: 브라우저 저장소에 파일 본문 보관 / reference-only: 파일명 등 참조 정보만 보관 */
  storage: AttachmentStorage;
  note: string;
  createdAt: string;
}

/** 첨부파일 본문. 목록 조회 시 큰 데이터를 읽지 않도록 별도 테이블에 둔다. */
export interface AttachmentBlob {
  id: ID; // Attachment.id 와 동일
  projectId: ID;
  data: ArrayBuffer;
}

export type EntityType =
  | 'project'
  | 'subject'
  | 'variable'
  | 'hypothesis'
  | 'literature'
  | 'evidence'
  | 'feedback'
  | 'meeting'
  | 'proposalSection'
  | 'extension';
export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  project: '연구 개요',
  subject: '연구 대상',
  variable: '연구변수',
  hypothesis: '연구가설',
  literature: '문헌',
  evidence: '근거',
  feedback: '지도교수 피드백',
  meeting: '면담 준비',
  proposalSection: '연구계획서 문단',
  extension: '후속 확장 영역',
};

export interface EntityRef {
  type: EntityType;
  id: ID;
}

export interface MeetingPrep {
  id: ID;
  projectId: ID;
  code: string;
  plannedDate: string;
  title: string;
  /** 지도교수 확인이 필요한 사항 */
  checkItems: string[];
  /** 지도교수에게 질문할 내용 */
  questions: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type FeedbackDecision = 'pending' | 'accept' | 'partial' | 'reject' | 'hold';
export const DECISION_LABEL: Record<FeedbackDecision, string> = {
  pending: '결정 전',
  accept: '반영',
  partial: '일부 반영',
  reject: '반영하지 않음',
  hold: '보류',
};

export type FeedbackStatus = 'open' | 'in_progress' | 'done';
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: '미처리',
  in_progress: '처리 중',
  done: '처리 완료',
};

export interface Feedback {
  id: ID;
  projectId: ID;
  code: string;
  meetingDate: string;
  /** 교수 의견 원문 — 사용자의 해석과 분리해 보관한다. */
  professorComment: string;
  targets: EntityRef[];
  /** 사용자의 해석 또는 메모 */
  interpretation: string;
  decision: FeedbackDecision;
  decisionNote: string;
  beforeText: string;
  afterText: string;
  status: FeedbackStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 변경 요청으로 바꿀 수 있는 필드 */
export type ChangeTargetType = 'project' | 'subject' | 'variable' | 'hypothesis';
export interface ChangeTarget {
  type: ChangeTargetType;
  id: ID;
  field: string;
}

export const CHANGEABLE_FIELDS: Record<ChangeTargetType, Record<string, string>> = {
  project: {
    title: '연구 제목',
    purpose: '연구 목적',
    background: '연구 배경',
    method: '연구 방법',
  },
  subject: {
    population: '연구 대상',
    definition: '연구 대상 정의',
    recruitmentCriteria: '모집 기준',
    exclusionCriteria: '제외 기준',
    samplePlan: '표집 계획',
  },
  variable: {
    name: '변수명',
    conceptualDefinition: '개념적 정의',
    operationalDefinition: '조작적 정의',
  },
  hypothesis: {
    statement: '가설 문장',
  },
};

export type ChangeRequestStatus = 'draft' | 'applied' | 'cancelled';
export const CR_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  draft: '검토 대기',
  applied: '적용됨',
  cancelled: '취소됨',
};

export interface ChangeRequest {
  id: ID;
  projectId: ID;
  code: string;
  feedbackId: ID | null;
  target: ChangeTarget;
  targetLabel: string;
  /** 요청 작성 시점의 기존 값 */
  oldValue: string;
  newValue: string;
  reason: string;
  status: ChangeRequestStatus;
  createdAt: string;
  appliedAt: string | null;
  /** 적용 직전에 자동 보존한 계획서 버전 */
  preservedVersionId: ID | null;
}

export type ImpactReviewStatus = 'pending' | 'kept' | 'revised';
export const IMPACT_STATUS_LABEL: Record<ImpactReviewStatus, string> = {
  pending: '확인 전',
  kept: '확인함 · 수정 불필요',
  revised: '확인함 · 수정 완료',
};

/** 변경 적용 시점에 기록되는 영향 항목별 검토 기록 */
export interface ImpactReview {
  id: ID;
  projectId: ID;
  changeRequestId: ID;
  target: EntityRef;
  targetLabel: string;
  /** 왜 영향을 받는지(연결 관계 설명) */
  reason: string;
  /** 해당 항목의 현재 내용(적용 시점 스냅샷) */
  currentValue: string;
  oldValue: string;
  newValue: string;
  needsReview: boolean;
  status: ImpactReviewStatus;
  note: string;
  updatedAt: string;
}

export interface ProposalSnapshot {
  isDemo: boolean;
  title: string;
  background: string;
  purpose: string;
  method: string;
  researchQuestions: string[];
  subject: {
    population: string;
    definition: string;
    recruitmentCriteria: string;
    exclusionCriteria: string;
    samplePlan: string;
  };
  variables: {
    id: ID;
    code: string;
    name: string;
    role: VariableRole;
    conceptualDefinition: string;
    operationalDefinition: string;
  }[];
  modelPaths: { from: string; to: string; label: string; note: string; fromId: ID; toId: ID; moderatorIds: ID[] }[];
  hypotheses: { id: ID; code: string; statement: string; kind: HypothesisKind; variables: string[] }[];
  keyLiterature: {
    id: ID;
    code: string;
    title: string;
    authors: string;
    year: string;
    source: string;
    keyFindings: string;
    isFictional: boolean;
    evidence: { code: string; content: string; page: string; status: EvidenceStatus }[];
  }[];
  advisorCheckItems: string[];
  advisorQuestions: string[];
}

export type VersionStatus = 'draft' | 'confirmed';
export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: '초안',
  confirmed: '확정',
};

export interface VersionDiffEntry {
  section: string;
  before: string;
  after: string;
}

/** 연구계획서 버전. snapshot 은 생성 후 절대 수정하지 않는다. */
export interface ProposalVersion {
  id: ID;
  projectId: ID;
  versionNo: number;
  createdAt: string;
  reason: string;
  feedbackId: ID | null;
  changeRequestId: ID | null;
  status: VersionStatus;
  confirmedAt: string | null;
  snapshot: ProposalSnapshot;
  diffFromPrevious: VersionDiffEntry[];
  previousVersionId: ID | null;
}

export interface ChangeLogEntry {
  id: ID;
  projectId: ID;
  at: string;
  entityType: EntityType | 'attachment' | 'changeRequest' | 'proposalVersion';
  entityId: ID;
  entityLabel: string;
  action: 'create' | 'update' | 'delete' | 'apply-change' | 'status' | 'restore';
  changes: { field: string; before: string; after: string }[];
  changeRequestId: ID | null;
}

/** 프로젝트 하나에 속한 모든 데이터 묶음 (백업·무결성 검사·영향 분석의 단위) */
export interface ProjectBundle {
  project: Project;
  subject: ResearchSubject;
  variables: ResearchVariable[];
  hypotheses: Hypothesis[];
  literature: Literature[];
  evidence: Evidence[];
  attachments: Attachment[];
  meetings: MeetingPrep[];
  feedback: Feedback[];
  changeRequests: ChangeRequest[];
  impactReviews: ImpactReview[];
  proposalVersions: ProposalVersion[];
  changeLog: ChangeLogEntry[];
}

export function hypothesisVariableIds(h: Hypothesis): ID[] {
  const ids = [h.fromVariableId, h.viaVariableId, h.toVariableId, ...h.extraVariableIds].filter(
    (x): x is ID => !!x,
  );
  return Array.from(new Set(ids));
}
