import { z } from 'zod';
import { CHILD_TABLES, db, newId, nowIso } from './db';
import { analyzeImpact, describeTarget, evidenceToRecheck, readTargetValue } from '../domain/impact';
import { buildSnapshot, diffSnapshots, snapshotsEqual } from '../domain/proposal';
import {
  attachmentSchema,
  changeRequestSchema,
  evidenceSchema,
  feedbackSchema,
  formatZodError,
  hypothesisSchema,
  literatureSchema,
  meetingSchema,
  projectSchema,
  subjectSchema,
  variableSchema,
} from '../domain/schemas';
import {
  Attachment,
  CHANGEABLE_FIELDS,
  ChangeLogEntry,
  ChangeRequest,
  ChangeTarget,
  Counters,
  EVIDENCE_STATUS_LABEL,
  Evidence,
  EvidenceStatus,
  Feedback,
  Hypothesis,
  ID,
  ImpactReview,
  ImpactReviewStatus,
  Literature,
  MeetingPrep,
  Project,
  ProjectBundle,
  ProposalVersion,
  ResearchSubject,
  ResearchVariable,
  hypothesisVariableIds,
} from '../domain/types';

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: 'validation' | 'duplicate' | 'in-use' | 'not-found' | 'stale' | 'invalid' = 'validation',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function validate<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError(`${what} 입력값이 올바르지 않습니다. ${formatZodError(r.error)}`);
  return r.data;
}

function requireText(value: string, label: string) {
  if (!value || !value.trim()) throw new AppError(`필수 항목 "${label}"을(를) 입력하세요.`);
}

const allTables = () => [db.projects, ...CHILD_TABLES.map((t) => db[t])];

/** 모든 변경은 단일 트랜잭션으로 묶는다. 중간에 실패하면 전부 되돌려진다. */
function tx<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', allTables(), fn);
}

function norm(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function log(
  projectId: ID,
  entry: Omit<ChangeLogEntry, 'id' | 'projectId' | 'at' | 'changes' | 'changeRequestId'> & {
    changes?: ChangeLogEntry['changes'];
    changeRequestId?: ID | null;
  },
) {
  await db.changeLog.add({
    id: newId(),
    projectId,
    at: nowIso(),
    changes: [],
    changeRequestId: null,
    ...entry,
  });
}

function diffFields<T extends object>(before: T, after: T, labels: Record<string, string>) {
  const out: ChangeLogEntry['changes'] = [];
  for (const [field, label] of Object.entries(labels)) {
    const a = (before as Record<string, unknown>)[field];
    const b = (after as Record<string, unknown>)[field];
    const sa = typeof a === 'string' ? a : JSON.stringify(a ?? '');
    const sb = typeof b === 'string' ? b : JSON.stringify(b ?? '');
    if (sa !== sb) out.push({ field: label, before: sa, after: sb });
  }
  return out;
}

async function touchProject(projectId: ID) {
  await db.projects.update(projectId, { updatedAt: nowIso() });
}

async function nextCode(projectId: ID, key: keyof Counters): Promise<string> {
  const p = await db.projects.get(projectId);
  if (!p) throw new AppError('프로젝트를 찾을 수 없습니다.', 'not-found');
  const counters = { ...p.counters, [key]: p.counters[key] + 1 };
  await db.projects.update(projectId, { counters });
  return `${key}${counters[key]}`;
}

/* ───────────── 프로젝트 ───────────── */

export type ProjectInput = Pick<
  Project,
  'title' | 'purpose' | 'background' | 'method' | 'researchType' | 'stage' | 'researchQuestions' | 'milestones' | 'notes'
>;

const PROJECT_LABELS = {
  title: '연구 제목',
  purpose: '연구 목적',
  background: '연구 배경',
  method: '연구 방법',
  researchType: '연구 유형',
  stage: '진행 단계',
  researchQuestions: '연구 질문',
  milestones: '주요 일정',
  notes: '연구 메모',
};

export async function createProject(input: Partial<ProjectInput> & { title: string }, isDemo = false): Promise<Project> {
  requireText(input.title, '연구 제목');
  return tx(async () => {
    const all = await db.projects.toArray();
    if (all.some((p) => norm(p.title) === norm(input.title)))
      throw new AppError('같은 제목의 프로젝트가 이미 있습니다. 제목을 구분해 주세요.', 'duplicate');
    const at = nowIso();
    const project = validate(
      projectSchema,
      {
        id: newId(),
        title: input.title.trim(),
        purpose: input.purpose ?? '',
        background: input.background ?? '',
        method: input.method ?? '',
        researchType: input.researchType ?? '설문 기반 양적 연구',
        stage: input.stage ?? 'topic',
        researchQuestions: input.researchQuestions ?? [],
        milestones: input.milestones ?? [],
        notes: input.notes ?? '',
        isDemo,
        counters: { V: 0, H: 0, L: 0, E: 0, F: 0, CR: 0, M: 0 },
        createdAt: at,
        updatedAt: at,
      },
      '프로젝트',
    ) as Project;
    const subject: ResearchSubject = {
      id: newId(),
      projectId: project.id,
      population: '',
      definition: '',
      recruitmentCriteria: '',
      exclusionCriteria: '',
      samplePlan: '',
      notes: '',
      updatedAt: at,
    };
    await db.projects.add(project);
    await db.subjects.add(subject);
    await log(project.id, { entityType: 'project', entityId: project.id, entityLabel: project.title, action: 'create' });
    return project;
  });
}

export async function updateProject(id: ID, patch: Partial<ProjectInput>): Promise<void> {
  if (patch.title !== undefined) requireText(patch.title, '연구 제목');
  await tx(async () => {
    const before = await db.projects.get(id);
    if (!before) throw new AppError('프로젝트를 찾을 수 없습니다.', 'not-found');
    if (patch.title !== undefined) {
      const all = await db.projects.toArray();
      if (all.some((p) => p.id !== id && norm(p.title) === norm(patch.title!)))
        throw new AppError('같은 제목의 프로젝트가 이미 있습니다.', 'duplicate');
    }
    const after = validate(projectSchema, { ...before, ...patch, updatedAt: nowIso() }, '프로젝트') as Project;
    await db.projects.put(after);
    const changes = diffFields(before, after, PROJECT_LABELS);
    if (changes.length)
      await log(id, { entityType: 'project', entityId: id, entityLabel: '연구 개요', action: 'update', changes });
  });
}

export async function deleteProject(id: ID): Promise<void> {
  await tx(async () => {
    for (const t of CHILD_TABLES) await db[t].where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

/* ───────────── 연구 대상 ───────────── */

const SUBJECT_LABELS = {
  population: '연구 대상',
  definition: '연구 대상 정의',
  recruitmentCriteria: '모집 기준',
  exclusionCriteria: '제외 기준',
  samplePlan: '표집 계획',
  notes: '메모',
};

export async function getSubject(projectId: ID): Promise<ResearchSubject> {
  const s = await db.subjects.where('projectId').equals(projectId).first();
  if (!s) throw new AppError('연구 대상 정보를 찾을 수 없습니다.', 'not-found');
  return s;
}

export async function updateSubject(projectId: ID, patch: Partial<Omit<ResearchSubject, 'id' | 'projectId'>>) {
  await tx(async () => {
    const before = await getSubject(projectId);
    const after = validate(subjectSchema, { ...before, ...patch, updatedAt: nowIso() }, '연구 대상') as ResearchSubject;
    await db.subjects.put(after);
    const changes = diffFields(before, after, SUBJECT_LABELS);
    if (changes.length) {
      await log(projectId, { entityType: 'subject', entityId: before.id, entityLabel: '연구 대상', action: 'update', changes });
      await touchProject(projectId);
    }
  });
}

/* ───────────── 변수 ───────────── */

export type VariableInput = Pick<
  ResearchVariable,
  'name' | 'role' | 'conceptualDefinition' | 'operationalDefinition' | 'notes'
>;
const VARIABLE_LABELS = {
  name: '변수명',
  role: '역할',
  conceptualDefinition: '개념적 정의',
  operationalDefinition: '조작적 정의',
  notes: '메모',
};

export async function saveVariable(projectId: ID, input: VariableInput, id?: ID): Promise<ResearchVariable> {
  requireText(input.name, '변수명');
  return tx(async () => {
    const siblings = await db.variables.where('projectId').equals(projectId).toArray();
    if (siblings.some((v) => v.id !== id && norm(v.name) === norm(input.name)))
      throw new AppError(`같은 이름의 변수 "${input.name.trim()}"이(가) 이미 있습니다.`, 'duplicate');
    const at = nowIso();
    if (id) {
      const before = siblings.find((v) => v.id === id);
      if (!before) throw new AppError('변수를 찾을 수 없습니다.', 'not-found');
      const after = validate(variableSchema, { ...before, ...input, name: input.name.trim(), updatedAt: at }, '변수') as ResearchVariable;
      await db.variables.put(after);
      const changes = diffFields(before, after, VARIABLE_LABELS);
      if (changes.length)
        await log(projectId, { entityType: 'variable', entityId: id, entityLabel: `${after.code} ${after.name}`, action: 'update', changes });
      await touchProject(projectId);
      return after;
    }
    const code = await nextCode(projectId, 'V');
    const v = validate(
      variableSchema,
      { id: newId(), projectId, code, ...input, name: input.name.trim(), createdAt: at, updatedAt: at },
      '변수',
    ) as ResearchVariable;
    await db.variables.add(v);
    await log(projectId, { entityType: 'variable', entityId: v.id, entityLabel: `${v.code} ${v.name}`, action: 'create' });
    await touchProject(projectId);
    return v;
  });
}

export async function deleteVariable(id: ID): Promise<void> {
  await tx(async () => {
    const v = await db.variables.get(id);
    if (!v) return;
    const hyps = await db.hypotheses.where('projectId').equals(v.projectId).toArray();
    const using = hyps.filter((h) => hypothesisVariableIds(h).includes(id));
    if (using.length)
      throw new AppError(
        `이 변수는 가설 ${using.map((h) => h.code).join(', ')}에서 사용 중이라 삭제할 수 없습니다. 먼저 해당 가설을 수정하거나 삭제하세요.`,
        'in-use',
      );
    // 근거·문헌·피드백의 참조 제거 (끊어진 참조를 남기지 않는다)
    await db.evidence
      .where('projectId')
      .equals(v.projectId)
      .modify((e) => {
        e.variableIds = e.variableIds.filter((x) => x !== id);
      });
    await db.literature
      .where('projectId')
      .equals(v.projectId)
      .modify((l) => {
        l.variableIds = l.variableIds.filter((x) => x !== id);
      });
    await removeFeedbackTargets(v.projectId, 'variable', [id]);
    await cancelDraftRequestsFor(v.projectId, 'variable', id);
    await db.variables.delete(id);
    await log(v.projectId, { entityType: 'variable', entityId: id, entityLabel: `${v.code} ${v.name}`, action: 'delete' });
    await touchProject(v.projectId);
  });
}

async function removeFeedbackTargets(projectId: ID, type: string, ids: ID[]) {
  await db.feedback
    .where('projectId')
    .equals(projectId)
    .modify((f) => {
      f.targets = f.targets.filter((t) => !(t.type === type && ids.includes(t.id)));
    });
}

async function cancelDraftRequestsFor(projectId: ID, type: string, id: ID) {
  await db.changeRequests
    .where('projectId')
    .equals(projectId)
    .modify((c) => {
      if (c.status === 'draft' && c.target.type === type && c.target.id === id) c.status = 'cancelled';
    });
}

/* ───────────── 가설 ───────────── */

export type HypothesisInput = Pick<
  Hypothesis,
  'statement' | 'kind' | 'fromVariableId' | 'toVariableId' | 'viaVariableId' | 'extraVariableIds' | 'notes'
>;
const HYPOTHESIS_LABELS = {
  statement: '가설 문장',
  kind: '가설 유형',
  fromVariableId: '원인 변수',
  viaVariableId: '매개/조절 변수',
  toVariableId: '결과 변수',
  extraVariableIds: '추가 관련 변수',
  notes: '메모',
};

export async function saveHypothesis(projectId: ID, input: HypothesisInput, id?: ID): Promise<Hypothesis> {
  requireText(input.statement, '가설 문장');
  return tx(async () => {
    const vars = new Set((await db.variables.where('projectId').equals(projectId).toArray()).map((v) => v.id));
    const clean: HypothesisInput = {
      ...input,
      statement: input.statement.trim(),
      viaVariableId: input.kind === 'direct' || input.kind === 'other' ? null : input.viaVariableId,
      fromVariableId: input.kind === 'other' ? null : input.fromVariableId,
      toVariableId: input.kind === 'other' ? null : input.toVariableId,
    };
    if (clean.kind !== 'other') {
      if (!clean.fromVariableId || !clean.toVariableId)
        throw new AppError('원인 변수와 결과 변수를 선택하세요.');
      if (clean.fromVariableId === clean.toVariableId) throw new AppError('원인 변수와 결과 변수가 같을 수 없습니다.');
      if (clean.kind !== 'direct') {
        if (!clean.viaVariableId)
          throw new AppError(clean.kind === 'mediation' ? '매개변수를 선택하세요.' : '조절변수를 선택하세요.');
        if (clean.viaVariableId === clean.fromVariableId || clean.viaVariableId === clean.toVariableId)
          throw new AppError('매개/조절 변수는 원인·결과 변수와 달라야 합니다.');
      }
    }
    const refs = [clean.fromVariableId, clean.toVariableId, clean.viaVariableId, ...clean.extraVariableIds].filter(Boolean) as ID[];
    if (refs.some((r) => !vars.has(r))) throw new AppError('존재하지 않는 변수를 연결할 수 없습니다.', 'invalid');
    const siblings = await db.hypotheses.where('projectId').equals(projectId).toArray();
    if (siblings.some((h) => h.id !== id && norm(h.statement) === norm(clean.statement)))
      throw new AppError('같은 문장의 가설이 이미 있습니다.', 'duplicate');
    const at = nowIso();
    if (id) {
      const before = siblings.find((h) => h.id === id);
      if (!before) throw new AppError('가설을 찾을 수 없습니다.', 'not-found');
      const after = validate(hypothesisSchema, { ...before, ...clean, updatedAt: at }, '가설') as Hypothesis;
      await db.hypotheses.put(after);
      const changes = diffFields(before, after, HYPOTHESIS_LABELS);
      if (changes.length)
        await log(projectId, { entityType: 'hypothesis', entityId: id, entityLabel: after.code, action: 'update', changes });
      await touchProject(projectId);
      return after;
    }
    const code = await nextCode(projectId, 'H');
    const h = validate(hypothesisSchema, { id: newId(), projectId, code, ...clean, createdAt: at, updatedAt: at }, '가설') as Hypothesis;
    await db.hypotheses.add(h);
    await log(projectId, { entityType: 'hypothesis', entityId: h.id, entityLabel: h.code, action: 'create' });
    await touchProject(projectId);
    return h;
  });
}

export async function deleteHypothesis(id: ID): Promise<void> {
  await tx(async () => {
    const h = await db.hypotheses.get(id);
    if (!h) return;
    await db.evidence
      .where('projectId')
      .equals(h.projectId)
      .modify((e) => {
        e.hypothesisIds = e.hypothesisIds.filter((x) => x !== id);
      });
    await removeFeedbackTargets(h.projectId, 'hypothesis', [id]);
    await cancelDraftRequestsFor(h.projectId, 'hypothesis', id);
    await db.hypotheses.delete(id);
    await log(h.projectId, { entityType: 'hypothesis', entityId: id, entityLabel: h.code, action: 'delete' });
    await touchProject(h.projectId);
  });
}

/* ───────────── 문헌 ───────────── */

export type LiteratureInput = Pick<
  Literature,
  | 'title'
  | 'authors'
  | 'year'
  | 'sourceType'
  | 'source'
  | 'doi'
  | 'url'
  | 'sample'
  | 'method'
  | 'keyFindings'
  | 'notes'
  | 'variableIds'
  | 'isKey'
> & { isFictional?: boolean };
const LITERATURE_LABELS = {
  title: '논문 제목',
  authors: '저자',
  year: '출판연도',
  sourceType: '문헌 유형',
  source: '학술지/학위논문 정보',
  doi: 'DOI',
  url: 'URL',
  sample: '연구 대상',
  method: '연구 방법',
  keyFindings: '핵심 결과',
  notes: '메모',
  variableIds: '관련 변수',
  isKey: '핵심 선행연구 여부',
};

export async function saveLiterature(projectId: ID, input: LiteratureInput, id?: ID): Promise<Literature> {
  requireText(input.title, '논문 제목');
  if (input.year && !/^\d{4}$/.test(input.year.trim())) throw new AppError('출판연도는 4자리 숫자로 입력하세요. (예: 2021)');
  if (input.url && !/^https?:\/\//i.test(input.url.trim())) throw new AppError('URL은 http:// 또는 https:// 로 시작해야 합니다.');
  return tx(async () => {
    const siblings = await db.literature.where('projectId').equals(projectId).toArray();
    const doi = norm(input.doi ?? '');
    const dupe = siblings.find(
      (l) =>
        l.id !== id &&
        ((doi && norm(l.doi) === doi) || (norm(l.title) === norm(input.title) && l.year.trim() === (input.year ?? '').trim())),
    );
    if (dupe) throw new AppError(`이미 등록된 문헌입니다: ${dupe.code} ${dupe.title}`, 'duplicate');
    const vars = new Set((await db.variables.where('projectId').equals(projectId).toArray()).map((v) => v.id));
    if (input.variableIds.some((v) => !vars.has(v))) throw new AppError('존재하지 않는 변수를 연결할 수 없습니다.', 'invalid');
    const at = nowIso();
    const clean = { ...input, title: input.title.trim(), year: (input.year ?? '').trim(), doi: (input.doi ?? '').trim(), url: (input.url ?? '').trim() };
    if (id) {
      const before = siblings.find((l) => l.id === id);
      if (!before) throw new AppError('문헌을 찾을 수 없습니다.', 'not-found');
      const after = validate(literatureSchema, { ...before, ...clean, isFictional: clean.isFictional ?? before.isFictional, updatedAt: at }, '문헌') as Literature;
      await db.literature.put(after);
      const changes = diffFields(before, after, LITERATURE_LABELS);
      if (changes.length)
        await log(projectId, { entityType: 'literature', entityId: id, entityLabel: `${after.code} ${after.title}`, action: 'update', changes });
      await touchProject(projectId);
      return after;
    }
    const code = await nextCode(projectId, 'L');
    const l = validate(
      literatureSchema,
      { id: newId(), projectId, code, ...clean, isFictional: clean.isFictional ?? false, createdAt: at, updatedAt: at },
      '문헌',
    ) as Literature;
    await db.literature.add(l);
    await log(projectId, { entityType: 'literature', entityId: l.id, entityLabel: `${l.code} ${l.title}`, action: 'create' });
    await touchProject(projectId);
    return l;
  });
}

/** 문헌을 삭제하면 그 문헌의 근거와 첨부도 함께 삭제한다(끊어진 참조 방지). */
export async function deleteLiterature(id: ID): Promise<{ evidence: number; attachments: number }> {
  return tx(async () => {
    const l = await db.literature.get(id);
    if (!l) return { evidence: 0, attachments: 0 };
    const atts = await db.attachments.where('literatureId').equals(id).toArray();
    await db.attachmentBlobs.bulkDelete(atts.map((a) => a.id));
    await db.attachments.where('literatureId').equals(id).delete();
    const evidence = await db.evidence.where('literatureId').equals(id).delete();
    await removeFeedbackTargets(l.projectId, 'literature', [id]);
    await db.literature.delete(id);
    await log(l.projectId, {
      entityType: 'literature',
      entityId: id,
      entityLabel: `${l.code} ${l.title}`,
      action: 'delete',
      changes: [{ field: '함께 삭제', before: `근거 ${evidence}건, 첨부 ${atts.length}건`, after: '' }],
    });
    await touchProject(l.projectId);
    return { evidence, attachments: atts.length };
  });
}

/* ───────────── 근거 ───────────── */

export type EvidenceInput = Pick<
  Evidence,
  'literatureId' | 'content' | 'page' | 'kind' | 'variableIds' | 'hypothesisIds' | 'notes'
> & { status?: EvidenceStatus };
const EVIDENCE_LABELS = {
  content: '근거 내용',
  page: '페이지',
  kind: '구분',
  variableIds: '연결 변수',
  hypothesisIds: '연결 가설',
  notes: '메모',
  literatureId: '문헌',
};

export async function saveEvidence(projectId: ID, input: EvidenceInput, id?: ID): Promise<Evidence> {
  requireText(input.content, '근거 내용');
  return tx(async () => {
    const lit = await db.literature.get(input.literatureId);
    if (!lit || lit.projectId !== projectId) throw new AppError('근거를 연결할 문헌이 존재하지 않습니다.', 'invalid');
    const vars = new Set((await db.variables.where('projectId').equals(projectId).toArray()).map((v) => v.id));
    const hyps = new Set((await db.hypotheses.where('projectId').equals(projectId).toArray()).map((h) => h.id));
    if (input.variableIds.some((v) => !vars.has(v))) throw new AppError('존재하지 않는 변수를 연결할 수 없습니다.', 'invalid');
    if (input.hypothesisIds.some((h) => !hyps.has(h))) throw new AppError('존재하지 않는 가설을 연결할 수 없습니다.', 'invalid');
    const siblings = await db.evidence.where('literatureId').equals(input.literatureId).toArray();
    if (siblings.some((e) => e.id !== id && norm(e.content) === norm(input.content) && e.page.trim() === input.page.trim()))
      throw new AppError('같은 문헌에 같은 내용·페이지의 근거가 이미 있습니다.', 'duplicate');
    const at = nowIso();
    const { status: _s, ...fields } = input;
    void _s;
    if (id) {
      const before = await db.evidence.get(id);
      if (!before) throw new AppError('근거를 찾을 수 없습니다.', 'not-found');
      const after = validate(evidenceSchema, { ...before, ...fields, content: input.content.trim(), updatedAt: at }, '근거') as Evidence;
      await db.evidence.put(after);
      const changes = diffFields(before, after, EVIDENCE_LABELS);
      if (changes.length)
        await log(projectId, { entityType: 'evidence', entityId: id, entityLabel: after.code, action: 'update', changes });
      await touchProject(projectId);
      return after;
    }
    const code = await nextCode(projectId, 'E');
    const status = input.status ?? 'unverified';
    const e = validate(
      evidenceSchema,
      {
        id: newId(),
        projectId,
        code,
        ...fields,
        content: input.content.trim(),
        status,
        recheckReason: '',
        verifiedAt: status === 'verified' ? at : null,
        createdAt: at,
        updatedAt: at,
      },
      '근거',
    ) as Evidence;
    await db.evidence.add(e);
    await log(projectId, { entityType: 'evidence', entityId: e.id, entityLabel: e.code, action: 'create' });
    await touchProject(projectId);
    return e;
  });
}

export async function setEvidenceStatus(id: ID, status: EvidenceStatus, recheckReason = ''): Promise<void> {
  await tx(async () => {
    const e = await db.evidence.get(id);
    if (!e) throw new AppError('근거를 찾을 수 없습니다.', 'not-found');
    if (e.status === status) return;
    const at = nowIso();
    await db.evidence.update(id, {
      status,
      recheckReason: status === 'recheck' ? recheckReason : '',
      verifiedAt: status === 'verified' ? at : e.verifiedAt,
      updatedAt: at,
    });
    await log(e.projectId, {
      entityType: 'evidence',
      entityId: id,
      entityLabel: e.code,
      action: 'status',
      changes: [{ field: '확인 상태', before: EVIDENCE_STATUS_LABEL[e.status], after: EVIDENCE_STATUS_LABEL[status] }],
    });
    await touchProject(e.projectId);
  });
}

export async function deleteEvidence(id: ID): Promise<void> {
  await tx(async () => {
    const e = await db.evidence.get(id);
    if (!e) return;
    await db.evidence.delete(id);
    await log(e.projectId, { entityType: 'evidence', entityId: id, entityLabel: e.code, action: 'delete' });
    await touchProject(e.projectId);
  });
}

/* ───────────── 첨부 ───────────── */

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * data 가 있으면 파일 본문을 브라우저 저장소에 보관(stored),
 * 없으면 파일명 등 참조 정보만 보관(reference-only)한다.
 */
export async function addAttachment(
  projectId: ID,
  literatureId: ID,
  meta: { fileName: string; mimeType: string; size: number; note?: string },
  data: ArrayBuffer | null,
): Promise<Attachment> {
  requireText(meta.fileName, '파일 이름');
  if (data) {
    const head = new Uint8Array(data.slice(0, 5));
    const isPdf = String.fromCharCode(...head) === '%PDF-';
    if (!isPdf) throw new AppError('PDF 파일이 아닙니다. PDF 형식의 파일만 첨부할 수 있습니다.', 'invalid');
    if (data.byteLength > MAX_ATTACHMENT_BYTES) throw new AppError('50MB를 넘는 파일은 첨부할 수 없습니다. 참조만 저장하세요.', 'invalid');
  }
  return tx(async () => {
    const lit = await db.literature.get(literatureId);
    if (!lit || lit.projectId !== projectId) throw new AppError('첨부할 문헌이 존재하지 않습니다.', 'invalid');
    const a = validate(
      attachmentSchema,
      {
        id: newId(),
        projectId,
        literatureId,
        fileName: meta.fileName.trim(),
        mimeType: meta.mimeType,
        size: meta.size,
        storage: data ? 'stored' : 'reference-only',
        note: meta.note ?? '',
        createdAt: nowIso(),
      },
      '첨부',
    ) as Attachment;
    await db.attachments.add(a);
    if (data) await db.attachmentBlobs.add({ id: a.id, projectId, data });
    await log(projectId, {
      entityType: 'attachment',
      entityId: a.id,
      entityLabel: `${lit.code} 첨부 ${a.fileName}`,
      action: 'create',
      changes: [{ field: '보존 방식', before: '', after: data ? '파일 본문 저장' : '참조만 저장' }],
    });
    return a;
  });
}

export async function getAttachmentData(id: ID): Promise<ArrayBuffer | null> {
  return (await db.attachmentBlobs.get(id))?.data ?? null;
}

export async function deleteAttachment(id: ID): Promise<void> {
  await tx(async () => {
    const a = await db.attachments.get(id);
    if (!a) return;
    await db.attachmentBlobs.delete(id);
    await db.attachments.delete(id);
    await log(a.projectId, { entityType: 'attachment', entityId: id, entityLabel: a.fileName, action: 'delete' });
  });
}

/* ───────────── 면담 준비 ───────────── */

export type MeetingInput = Pick<MeetingPrep, 'plannedDate' | 'title' | 'checkItems' | 'questions' | 'notes'>;

export async function saveMeeting(projectId: ID, input: MeetingInput, id?: ID): Promise<MeetingPrep> {
  return tx(async () => {
    const at = nowIso();
    const clean = {
      ...input,
      checkItems: input.checkItems.map((x) => x.trim()).filter(Boolean),
      questions: input.questions.map((x) => x.trim()).filter(Boolean),
    };
    if (id) {
      const before = await db.meetings.get(id);
      if (!before) throw new AppError('면담 준비를 찾을 수 없습니다.', 'not-found');
      const after = validate(meetingSchema, { ...before, ...clean, updatedAt: at }, '면담 준비') as MeetingPrep;
      await db.meetings.put(after);
      const changes = diffFields(before, after, { plannedDate: '면담 예정일', title: '제목', checkItems: '확인 필요 사항', questions: '질문', notes: '메모' });
      if (changes.length)
        await log(projectId, { entityType: 'meeting', entityId: id, entityLabel: `${after.code} 면담 준비`, action: 'update', changes });
      await touchProject(projectId);
      return after;
    }
    const code = await nextCode(projectId, 'M');
    const m = validate(meetingSchema, { id: newId(), projectId, code, ...clean, createdAt: at, updatedAt: at }, '면담 준비') as MeetingPrep;
    await db.meetings.add(m);
    await log(projectId, { entityType: 'meeting', entityId: m.id, entityLabel: `${m.code} 면담 준비`, action: 'create' });
    await touchProject(projectId);
    return m;
  });
}

export async function deleteMeeting(id: ID): Promise<void> {
  await tx(async () => {
    const m = await db.meetings.get(id);
    if (!m) return;
    await db.meetings.delete(id);
    await log(m.projectId, { entityType: 'meeting', entityId: id, entityLabel: `${m.code} 면담 준비`, action: 'delete' });
  });
}

/* ───────────── 지도교수 피드백 ───────────── */

export type FeedbackInput = Pick<
  Feedback,
  'meetingDate' | 'professorComment' | 'targets' | 'interpretation' | 'decision' | 'decisionNote' | 'beforeText' | 'afterText' | 'status'
>;
const FEEDBACK_LABELS = {
  meetingDate: '면담 날짜',
  professorComment: '교수 의견 원문',
  targets: '관련 연구 항목',
  interpretation: '나의 해석·메모',
  decision: '나의 결정',
  decisionNote: '결정 메모',
  beforeText: '수정 전 내용',
  afterText: '수정 후 내용',
  status: '처리 상태',
};

/** 피드백 저장은 연구 데이터를 바꾸지 않는다. 변경은 변경 요청을 검토·적용해야만 일어난다. */
export async function saveFeedback(projectId: ID, input: FeedbackInput, id?: ID): Promise<Feedback> {
  requireText(input.professorComment, '교수 의견 원문');
  requireText(input.meetingDate, '면담 날짜');
  return tx(async () => {
    const at = nowIso();
    if (id) {
      const before = await db.feedback.get(id);
      if (!before) throw new AppError('피드백을 찾을 수 없습니다.', 'not-found');
      const completedAt = input.status === 'done' ? (before.completedAt ?? at) : null;
      const after = validate(feedbackSchema, { ...before, ...input, completedAt, updatedAt: at }, '피드백') as Feedback;
      await db.feedback.put(after);
      const changes = diffFields(before, after, FEEDBACK_LABELS);
      if (changes.length)
        await log(projectId, { entityType: 'feedback', entityId: id, entityLabel: `${after.code} 피드백`, action: 'update', changes });
      await touchProject(projectId);
      return after;
    }
    const code = await nextCode(projectId, 'F');
    const f = validate(
      feedbackSchema,
      { id: newId(), projectId, code, ...input, completedAt: input.status === 'done' ? at : null, createdAt: at, updatedAt: at },
      '피드백',
    ) as Feedback;
    await db.feedback.add(f);
    await log(projectId, { entityType: 'feedback', entityId: f.id, entityLabel: `${f.code} 피드백`, action: 'create' });
    await touchProject(projectId);
    return f;
  });
}

export async function deleteFeedback(id: ID): Promise<void> {
  await tx(async () => {
    const f = await db.feedback.get(id);
    if (!f) return;
    const crs = await db.changeRequests.where('feedbackId').equals(id).toArray();
    if (crs.some((c) => c.status === 'applied'))
      throw new AppError('이미 적용된 변경 요청이 연결된 피드백은 이력 보존을 위해 삭제할 수 없습니다.', 'in-use');
    const versions = await db.proposalVersions.where('projectId').equals(f.projectId).toArray();
    if (versions.some((v) => v.feedbackId === id))
      throw new AppError('계획서 버전에 연결된 피드백은 이력 보존을 위해 삭제할 수 없습니다.', 'in-use');
    await db.changeRequests.bulkDelete(crs.map((c) => c.id));
    await db.feedback.delete(id);
    await log(f.projectId, { entityType: 'feedback', entityId: id, entityLabel: `${f.code} 피드백`, action: 'delete' });
  });
}

/* ───────────── 프로젝트 묶음 ───────────── */

export async function loadBundle(projectId: ID): Promise<ProjectBundle> {
  const project = await db.projects.get(projectId);
  if (!project) throw new AppError('프로젝트를 찾을 수 없습니다.', 'not-found');
  const by = <T>(t: { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<T[]> } } }) =>
    t.where('projectId').equals(projectId).toArray();
  const [subject, variables, hypotheses, literature, evidence, attachments, meetings, feedback, changeRequests, impactReviews, proposalVersions, changeLog] =
    await Promise.all([
      getSubject(projectId),
      by<ResearchVariable>(db.variables),
      by<Hypothesis>(db.hypotheses),
      by<Literature>(db.literature),
      by<Evidence>(db.evidence),
      by<Attachment>(db.attachments),
      by<MeetingPrep>(db.meetings),
      by<Feedback>(db.feedback),
      by<ChangeRequest>(db.changeRequests),
      by<ImpactReview>(db.impactReviews),
      by<ProposalVersion>(db.proposalVersions),
      by<ChangeLogEntry>(db.changeLog),
    ]);
  const byCode = (a: { code: string }, b: { code: string }) =>
    a.code.localeCompare(b.code, 'en', { numeric: true });
  return {
    project,
    subject,
    variables: variables.sort(byCode),
    hypotheses: hypotheses.sort(byCode),
    literature: literature.sort(byCode),
    evidence: evidence.sort(byCode),
    attachments: attachments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    meetings: meetings.sort(byCode),
    feedback: feedback.sort(byCode),
    changeRequests: changeRequests.sort(byCode),
    impactReviews,
    proposalVersions: proposalVersions.sort((a, b) => a.versionNo - b.versionNo),
    changeLog: changeLog.sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/* ───────────── 계획서 버전 ───────────── */

async function insertVersion(
  bundle: ProjectBundle,
  opts: { reason: string; feedbackId?: ID | null; changeRequestId?: ID | null; meetingId?: ID | null },
): Promise<ProposalVersion> {
  const prev = bundle.proposalVersions[bundle.proposalVersions.length - 1] ?? null;
  const snapshot = buildSnapshot(bundle, opts.meetingId);
  const version: ProposalVersion = {
    id: newId(),
    projectId: bundle.project.id,
    versionNo: (prev?.versionNo ?? 0) + 1,
    createdAt: nowIso(),
    reason: opts.reason.trim(),
    feedbackId: opts.feedbackId ?? null,
    changeRequestId: opts.changeRequestId ?? null,
    status: 'draft',
    confirmedAt: null,
    snapshot,
    diffFromPrevious: diffSnapshots(prev?.snapshot ?? null, snapshot),
    previousVersionId: prev?.id ?? null,
  };
  // add(): 같은 id 가 있으면 실패 → 기존 버전을 덮어쓸 수 없다
  await db.proposalVersions.add(version);
  await log(bundle.project.id, {
    entityType: 'proposalVersion',
    entityId: version.id,
    entityLabel: `연구계획서 v${version.versionNo}`,
    action: 'create',
    changes: [{ field: '변경 사유', before: '', after: version.reason }],
    changeRequestId: version.changeRequestId,
  });
  return version;
}

/** 현재 데이터로 새 계획서 버전을 만든다. 기존 버전은 수정하지 않는다. */
export async function createProposalVersion(
  projectId: ID,
  opts: { reason: string; feedbackId?: ID | null; changeRequestId?: ID | null; meetingId?: ID | null },
): Promise<ProposalVersion> {
  requireText(opts.reason, '변경 사유');
  return tx(async () => {
    const bundle = await loadBundle(projectId);
    const v = await insertVersion(bundle, opts);
    await touchProject(projectId);
    return v;
  });
}

/** 버전의 내용(snapshot)은 바꿀 수 없고, 초안 → 확정 상태 전환만 가능하다. */
export async function confirmProposalVersion(id: ID): Promise<void> {
  await tx(async () => {
    const v = await db.proposalVersions.get(id);
    if (!v) throw new AppError('계획서 버전을 찾을 수 없습니다.', 'not-found');
    if (v.status === 'confirmed') return;
    await db.proposalVersions.update(id, { status: 'confirmed', confirmedAt: nowIso() });
    await log(v.projectId, {
      entityType: 'proposalVersion',
      entityId: id,
      entityLabel: `연구계획서 v${v.versionNo}`,
      action: 'status',
      changes: [{ field: '상태', before: '초안', after: '확정' }],
    });
  });
}

/* ───────────── 변경 요청 · 영향 분석 ───────────── */

export async function createChangeRequest(
  projectId: ID,
  input: { target: ChangeTarget; newValue: string; reason: string; feedbackId?: ID | null },
): Promise<ChangeRequest> {
  requireText(input.newValue, '변경 후 내용');
  requireText(input.reason, '변경 이유');
  return tx(async () => {
    const bundle = await loadBundle(projectId);
    if (!(input.target.field in (CHANGEABLE_FIELDS[input.target.type] ?? {})))
      throw new AppError('변경할 수 없는 항목입니다.', 'invalid');
    const current = readTargetValue(bundle, input.target);
    if (current === null) throw new AppError('변경 대상 항목이 존재하지 않습니다.', 'invalid');
    if (current.trim() === input.newValue.trim()) throw new AppError('변경 후 내용이 현재 내용과 같습니다.');
    if (input.feedbackId && !bundle.feedback.some((f) => f.id === input.feedbackId))
      throw new AppError('연결할 피드백이 존재하지 않습니다.', 'invalid');
    const code = await nextCode(projectId, 'CR');
    const cr = validate(
      changeRequestSchema,
      {
        id: newId(),
        projectId,
        code,
        feedbackId: input.feedbackId ?? null,
        target: input.target,
        targetLabel: describeTarget(bundle, input.target),
        oldValue: current,
        newValue: input.newValue.trim(),
        reason: input.reason.trim(),
        status: 'draft',
        createdAt: nowIso(),
        appliedAt: null,
        preservedVersionId: null,
      },
      '변경 요청',
    ) as ChangeRequest;
    await db.changeRequests.add(cr);
    await log(projectId, {
      entityType: 'changeRequest',
      entityId: cr.id,
      entityLabel: `${cr.code} ${cr.targetLabel}`,
      action: 'create',
      changes: [{ field: cr.targetLabel, before: cr.oldValue, after: cr.newValue }],
      changeRequestId: cr.id,
    });
    return cr;
  });
}

export async function cancelChangeRequest(id: ID): Promise<void> {
  await tx(async () => {
    const cr = await db.changeRequests.get(id);
    if (!cr) throw new AppError('변경 요청을 찾을 수 없습니다.', 'not-found');
    if (cr.status !== 'draft') throw new AppError('검토 대기 상태의 요청만 취소할 수 있습니다.');
    await db.changeRequests.update(id, { status: 'cancelled' });
    await log(cr.projectId, { entityType: 'changeRequest', entityId: id, entityLabel: `${cr.code} ${cr.targetLabel}`, action: 'status', changes: [{ field: '상태', before: '검토 대기', after: '취소됨' }], changeRequestId: id });
  });
}

/** 적용 전 미리보기 (저장소를 바꾸지 않음) */
export async function previewChangeRequest(id: ID) {
  const cr = await db.changeRequests.get(id);
  if (!cr) throw new AppError('변경 요청을 찾을 수 없습니다.', 'not-found');
  const bundle = await loadBundle(cr.projectId);
  const current = readTargetValue(bundle, cr.target);
  const items = analyzeImpact(bundle, cr.target, current ?? cr.oldValue);
  return {
    cr,
    current,
    stale: current !== null && current !== cr.oldValue,
    items,
    recheckEvidenceIds: evidenceToRecheck(bundle, items),
  };
}

/**
 * 사용자가 승인한 변경 요청을 적용한다. 전 과정이 하나의 트랜잭션이다.
 *  1) (선택) 적용 직전 상태를 계획서 버전으로 보존
 *  2) 대상 값 변경
 *  3) 영향 항목별 검토 기록 생성
 *  4) 영향받는 '사용자 확인 완료' 근거를 '재검토 필요'로 전환
 *  5) 연결된 피드백의 수정 전/후 기록
 */
export async function applyChangeRequest(
  id: ID,
  opts: { preserveVersion?: boolean; acceptCurrentValue?: boolean } = {},
): Promise<{ reviews: number; rechecked: number; preservedVersionId: ID | null }> {
  const preserve = opts.preserveVersion ?? true;
  return tx(async () => {
    const cr = await db.changeRequests.get(id);
    if (!cr) throw new AppError('변경 요청을 찾을 수 없습니다.', 'not-found');
    if (cr.status !== 'draft') throw new AppError('이미 처리된 변경 요청입니다.');
    const bundle = await loadBundle(cr.projectId);
    const current = readTargetValue(bundle, cr.target);
    if (current === null) throw new AppError('변경 대상 항목이 더 이상 존재하지 않습니다.', 'invalid');
    if (current !== cr.oldValue && !opts.acceptCurrentValue)
      throw new AppError('변경 요청을 작성한 뒤 대상 내용이 바뀌었습니다. 현재 내용을 확인한 뒤 다시 적용하세요.', 'stale');
    if (cr.target.type === 'variable' && cr.target.field === 'name') {
      if (bundle.variables.some((v) => v.id !== cr.target.id && norm(v.name) === norm(cr.newValue)))
        throw new AppError('같은 이름의 변수가 이미 있습니다.', 'duplicate');
    }
    if (cr.target.type === 'project' && cr.target.field === 'title') {
      const all = await db.projects.toArray();
      if (all.some((p) => p.id !== cr.projectId && norm(p.title) === norm(cr.newValue)))
        throw new AppError('같은 제목의 프로젝트가 이미 있습니다.', 'duplicate');
    }

    const items = analyzeImpact(bundle, cr.target, current);
    const recheckIds = evidenceToRecheck(bundle, items);
    const at = nowIso();

    // 1) 적용 전 상태 보존
    let preservedVersionId: ID | null = null;
    if (preserve) {
      const last = bundle.proposalVersions[bundle.proposalVersions.length - 1];
      const snap = buildSnapshot(bundle);
      if (last && snapshotsEqual(last.snapshot, snap)) preservedVersionId = last.id;
      else {
        const v = await insertVersion(bundle, { reason: `${cr.code} 변경 적용 전 자동 보존`, feedbackId: null, changeRequestId: null });
        preservedVersionId = v.id;
      }
    }

    // 2) 값 변경
    const table =
      cr.target.type === 'project' ? db.projects : cr.target.type === 'subject' ? db.subjects : cr.target.type === 'variable' ? db.variables : db.hypotheses;
    const n = await (table as typeof db.projects).update(cr.target.id, { [cr.target.field]: cr.newValue, updatedAt: at } as never);
    if (n !== 1) throw new AppError('변경 대상을 저장하지 못했습니다.', 'invalid');

    // 3) 영향 검토 기록
    const reviews: ImpactReview[] = items
      .filter((i) => !i.direct)
      .map((i) => ({
        id: newId(),
        projectId: cr.projectId,
        changeRequestId: cr.id,
        target: i.target,
        targetLabel: i.targetLabel,
        reason: i.reason,
        currentValue: i.currentValue,
        oldValue: current,
        newValue: cr.newValue,
        needsReview: i.needsReview,
        status: 'pending',
        note: '',
        updatedAt: at,
      }));
    await db.impactReviews.bulkAdd(reviews);

    // 4) 근거 재검토 전환
    for (const eid of recheckIds) {
      await db.evidence.update(eid, {
        status: 'recheck',
        recheckReason: `${cr.code} 적용: ${cr.targetLabel} 변경 ("${current}" → "${cr.newValue}")`,
        updatedAt: at,
      });
    }

    // 5) 변경 요청·피드백 갱신
    await db.changeRequests.update(id, { status: 'applied', appliedAt: at, oldValue: current, preservedVersionId });
    if (cr.feedbackId) {
      const f = await db.feedback.get(cr.feedbackId);
      if (f) {
        const line = (s: string, add: string) => (s.trim() ? `${s}\n${add}` : add);
        await db.feedback.update(f.id, {
          beforeText: line(f.beforeText, `[${cr.code}] ${cr.targetLabel}: ${current}`),
          afterText: line(f.afterText, `[${cr.code}] ${cr.targetLabel}: ${cr.newValue}`),
          status: f.status === 'open' ? 'in_progress' : f.status,
          updatedAt: at,
        });
      }
    }
    await log(cr.projectId, {
      entityType: cr.target.type,
      entityId: cr.target.id,
      entityLabel: cr.targetLabel,
      action: 'apply-change',
      changes: [
        { field: cr.targetLabel, before: current, after: cr.newValue },
        ...(recheckIds.length ? [{ field: '재검토 필요로 전환된 근거', before: '사용자 확인 완료', after: `${recheckIds.length}건` }] : []),
      ],
      changeRequestId: cr.id,
    });
    await touchProject(cr.projectId);
    return { reviews: reviews.length, rechecked: recheckIds.length, preservedVersionId };
  });
}

export async function updateImpactReview(id: ID, patch: { status?: ImpactReviewStatus; note?: string }): Promise<void> {
  await tx(async () => {
    const r = await db.impactReviews.get(id);
    if (!r) throw new AppError('영향 검토 항목을 찾을 수 없습니다.', 'not-found');
    await db.impactReviews.update(id, { ...patch, updatedAt: nowIso() });
  });
}
