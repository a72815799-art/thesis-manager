import { z } from 'zod';

/** 저장·복원 시 사용하는 런타임 검증 스키마. types.ts 와 1:1 로 대응한다. */

const id = z.string().min(1);
const str = z.string();
const iso = z.string();

export const milestoneSchema = z.object({ id, label: str, date: str, done: z.boolean() });

export const countersSchema = z.object({
  V: z.number().int().min(0),
  H: z.number().int().min(0),
  L: z.number().int().min(0),
  E: z.number().int().min(0),
  F: z.number().int().min(0),
  CR: z.number().int().min(0),
  M: z.number().int().min(0),
});

export const projectSchema = z.object({
  id,
  title: str.min(1),
  purpose: str,
  background: str,
  method: str,
  researchType: str,
  stage: z.enum(['topic', 'literature', 'proposal', 'ethics', 'data', 'analysis', 'writing', 'defense', 'submitted']),
  researchQuestions: z.array(str),
  milestones: z.array(milestoneSchema),
  notes: str,
  isDemo: z.boolean(),
  counters: countersSchema,
  createdAt: iso,
  updatedAt: iso,
});

export const subjectSchema = z.object({
  id,
  projectId: id,
  population: str,
  definition: str,
  recruitmentCriteria: str,
  exclusionCriteria: str,
  samplePlan: str,
  notes: str,
  updatedAt: iso,
});

const role = z.enum(['independent', 'dependent', 'mediator', 'moderator', 'control']);

export const variableSchema = z.object({
  id,
  projectId: id,
  code: str,
  name: str.min(1),
  role,
  conceptualDefinition: str,
  operationalDefinition: str,
  notes: str,
  createdAt: iso,
  updatedAt: iso,
});

const hypothesisKind = z.enum(['direct', 'mediation', 'moderation', 'other']);

export const hypothesisSchema = z.object({
  id,
  projectId: id,
  code: str,
  statement: str.min(1),
  kind: hypothesisKind,
  fromVariableId: id.nullable(),
  toVariableId: id.nullable(),
  viaVariableId: id.nullable(),
  extraVariableIds: z.array(id),
  notes: str,
  createdAt: iso,
  updatedAt: iso,
});

export const literatureSchema = z.object({
  id,
  projectId: id,
  code: str,
  title: str.min(1),
  authors: str,
  year: str,
  sourceType: z.enum(['journal', 'thesis', 'book', 'report', 'other']),
  source: str,
  doi: str,
  url: str,
  sample: str,
  method: str,
  keyFindings: str,
  notes: str,
  variableIds: z.array(id),
  isKey: z.boolean(),
  isFictional: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});

const evidenceStatus = z.enum(['unverified', 'checking', 'verified', 'recheck']);

export const evidenceSchema = z.object({
  id,
  projectId: id,
  literatureId: id,
  code: str,
  content: str.min(1),
  page: str,
  kind: z.enum(['quote', 'summary']),
  variableIds: z.array(id),
  hypothesisIds: z.array(id),
  notes: str,
  status: evidenceStatus,
  recheckReason: str,
  verifiedAt: iso.nullable(),
  createdAt: iso,
  updatedAt: iso,
});

export const attachmentSchema = z.object({
  id,
  projectId: id,
  literatureId: id,
  fileName: str.min(1),
  mimeType: str,
  size: z.number().min(0),
  storage: z.enum(['stored', 'reference-only']),
  note: str,
  createdAt: iso,
});

const entityType = z.enum([
  'project',
  'subject',
  'variable',
  'hypothesis',
  'literature',
  'evidence',
  'feedback',
  'meeting',
  'proposalSection',
  'extension',
]);
export const entityRefSchema = z.object({ type: entityType, id });

export const meetingSchema = z.object({
  id,
  projectId: id,
  code: str,
  plannedDate: str,
  title: str,
  checkItems: z.array(str),
  questions: z.array(str),
  notes: str,
  createdAt: iso,
  updatedAt: iso,
});

export const feedbackSchema = z.object({
  id,
  projectId: id,
  code: str,
  meetingDate: str,
  professorComment: str.min(1),
  targets: z.array(entityRefSchema),
  interpretation: str,
  decision: z.enum(['pending', 'accept', 'partial', 'reject', 'hold']),
  decisionNote: str,
  beforeText: str,
  afterText: str,
  status: z.enum(['open', 'in_progress', 'done']),
  completedAt: iso.nullable(),
  createdAt: iso,
  updatedAt: iso,
});

export const changeRequestSchema = z.object({
  id,
  projectId: id,
  code: str,
  feedbackId: id.nullable(),
  target: z.object({ type: z.enum(['project', 'subject', 'variable', 'hypothesis']), id, field: str.min(1) }),
  targetLabel: str,
  oldValue: str,
  newValue: str,
  reason: str,
  status: z.enum(['draft', 'applied', 'cancelled']),
  createdAt: iso,
  appliedAt: iso.nullable(),
  preservedVersionId: id.nullable(),
});

export const impactReviewSchema = z.object({
  id,
  projectId: id,
  changeRequestId: id,
  target: entityRefSchema,
  targetLabel: str,
  reason: str,
  currentValue: str,
  oldValue: str,
  newValue: str,
  needsReview: z.boolean(),
  status: z.enum(['pending', 'kept', 'revised']),
  note: str,
  updatedAt: iso,
});

export const snapshotSchema = z.object({
  isDemo: z.boolean(),
  title: str,
  background: str,
  purpose: str,
  method: str,
  researchQuestions: z.array(str),
  subject: z.object({
    population: str,
    definition: str,
    recruitmentCriteria: str,
    exclusionCriteria: str,
    samplePlan: str,
  }),
  variables: z.array(
    z.object({ id, code: str, name: str, role, conceptualDefinition: str, operationalDefinition: str }),
  ),
  modelPaths: z.array(z.object({ from: str, to: str, label: str, note: str })),
  hypotheses: z.array(z.object({ id, code: str, statement: str, kind: hypothesisKind, variables: z.array(str) })),
  keyLiterature: z.array(
    z.object({
      id,
      code: str,
      title: str,
      authors: str,
      year: str,
      source: str,
      keyFindings: str,
      isFictional: z.boolean(),
      evidence: z.array(z.object({ code: str, content: str, page: str, status: evidenceStatus })),
    }),
  ),
  advisorCheckItems: z.array(str),
  advisorQuestions: z.array(str),
});

export const proposalVersionSchema = z.object({
  id,
  projectId: id,
  versionNo: z.number().int().min(1),
  createdAt: iso,
  reason: str,
  feedbackId: id.nullable(),
  changeRequestId: id.nullable(),
  status: z.enum(['draft', 'confirmed']),
  confirmedAt: iso.nullable(),
  snapshot: snapshotSchema,
  diffFromPrevious: z.array(z.object({ section: str, before: str, after: str })),
  previousVersionId: id.nullable(),
});

export const changeLogSchema = z.object({
  id,
  projectId: id,
  at: iso,
  entityType: z.union([entityType, z.enum(['attachment', 'changeRequest', 'proposalVersion'])]),
  entityId: id,
  entityLabel: str,
  action: z.enum(['create', 'update', 'delete', 'apply-change', 'status', 'restore']),
  changes: z.array(z.object({ field: str, before: str, after: str })),
  changeRequestId: id.nullable(),
});

export const bundleSchema = z.object({
  project: projectSchema,
  subject: subjectSchema,
  variables: z.array(variableSchema),
  hypotheses: z.array(hypothesisSchema),
  literature: z.array(literatureSchema),
  evidence: z.array(evidenceSchema),
  attachments: z.array(attachmentSchema),
  meetings: z.array(meetingSchema),
  feedback: z.array(feedbackSchema),
  changeRequests: z.array(changeRequestSchema),
  impactReviews: z.array(impactReviewSchema),
  proposalVersions: z.array(proposalVersionSchema),
  changeLog: z.array(changeLogSchema),
});

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(최상위)'}: ${i.message}`)
    .join(' / ');
}
