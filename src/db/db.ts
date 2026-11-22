import Dexie, { Table } from 'dexie';
import type {
  Attachment,
  AttachmentBlob,
  ChangeLogEntry,
  ChangeRequest,
  Evidence,
  Feedback,
  Hypothesis,
  ImpactReview,
  Literature,
  MeetingPrep,
  Project,
  ProposalVersion,
  ResearchSubject,
  ResearchVariable,
} from '../domain/types';

/**
 * IndexedDB(Dexie) 저장소.
 * 스키마를 바꿀 때는 version(n+1).stores(...).upgrade(...) 를 추가해 마이그레이션한다.
 */
export class AppDB extends Dexie {
  projects!: Table<Project, string>;
  subjects!: Table<ResearchSubject, string>;
  variables!: Table<ResearchVariable, string>;
  hypotheses!: Table<Hypothesis, string>;
  literature!: Table<Literature, string>;
  evidence!: Table<Evidence, string>;
  attachments!: Table<Attachment, string>;
  attachmentBlobs!: Table<AttachmentBlob, string>;
  meetings!: Table<MeetingPrep, string>;
  feedback!: Table<Feedback, string>;
  changeRequests!: Table<ChangeRequest, string>;
  impactReviews!: Table<ImpactReview, string>;
  proposalVersions!: Table<ProposalVersion, string>;
  changeLog!: Table<ChangeLogEntry, string>;

  constructor(name = 'thesis-manager') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      subjects: 'id, projectId',
      variables: 'id, projectId',
      hypotheses: 'id, projectId',
      literature: 'id, projectId',
      evidence: 'id, projectId, literatureId',
      attachments: 'id, projectId, literatureId',
      attachmentBlobs: 'id, projectId',
      meetings: 'id, projectId',
      feedback: 'id, projectId',
      changeRequests: 'id, projectId, feedbackId',
      impactReviews: 'id, projectId, changeRequestId',
      proposalVersions: 'id, projectId',
      changeLog: 'id, projectId, at',
    });
  }
}

export const db = new AppDB();

/** 프로젝트에 속한 데이터가 들어가는 테이블 (projects 제외) */
export const CHILD_TABLES = [
  'subjects',
  'variables',
  'hypotheses',
  'literature',
  'evidence',
  'attachments',
  'attachmentBlobs',
  'meetings',
  'feedback',
  'changeRequests',
  'impactReviews',
  'proposalVersions',
  'changeLog',
] as const;

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // 보안 컨텍스트가 아닌 환경(http 원격 접속 등)용 대체 구현
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
