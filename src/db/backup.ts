import { CHILD_TABLES, db, newId, nowIso } from './db';
import { AppError, loadBundle } from './repo';
import { checkIntegrity } from '../domain/integrity';
import { bundleSchema, formatZodError } from '../domain/schemas';
import { ID, ProjectBundle, SCHEMA_VERSION } from '../domain/types';

export const BACKUP_FORMAT = 'thesis-manager-backup';
export const APP_VERSION = '0.1.0';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  /** 가상 예시 데이터 여부 */
  isDemo: boolean;
  notice: string;
  counts: Record<string, number>;
  /** 첨부파일 본문 포함 여부 */
  filesIncluded: boolean;
  bundle: ProjectBundle;
  /** 첨부 id → base64 본문 */
  attachmentFiles: Record<ID, string>;
}

export function bundleCounts(b: ProjectBundle): Record<string, number> {
  return {
    variables: b.variables.length,
    hypotheses: b.hypotheses.length,
    literature: b.literature.length,
    evidence: b.evidence.length,
    attachments: b.attachments.length,
    meetings: b.meetings.length,
    feedback: b.feedback.length,
    changeRequests: b.changeRequests.length,
    impactReviews: b.impactReviews.length,
    proposalVersions: b.proposalVersions.length,
    changeLog: b.changeLog.length,
  };
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export async function exportBackup(projectId: ID, includeFiles = true): Promise<BackupFile> {
  const bundle = await loadBundle(projectId);
  const problems = checkIntegrity(bundle);
  if (problems.length) throw new AppError(`데이터에 문제가 있어 백업을 만들 수 없습니다: ${problems[0]}`, 'invalid');
  const attachmentFiles: Record<ID, string> = {};
  if (includeFiles) {
    for (const a of bundle.attachments) {
      if (a.storage !== 'stored') continue;
      const blob = await db.attachmentBlobs.get(a.id);
      if (blob) attachmentFiles[a.id] = toBase64(blob.data);
    }
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    isDemo: bundle.project.isDemo,
    notice: bundle.project.isDemo ? '가상 예시 데이터입니다. 실제 연구 자료가 아닙니다.' : '',
    counts: bundleCounts(bundle),
    filesIncluded: includeFiles,
    bundle,
    attachmentFiles,
  };
}

/** 스키마 버전별 마이그레이션. 버전을 올릴 때 여기에 단계별 변환을 추가한다. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

/**
 * 백업 파일 내용을 검증한다. 저장소는 건드리지 않는다.
 * 형식 → 스키마 버전 → 필드 검증 → 참조 무결성 → 건수 순으로 확인한다.
 */
export function parseBackup(text: string): BackupFile {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError('백업 파일을 읽을 수 없습니다. 파일이 손상되었거나 이 앱의 백업 파일이 아닙니다.', 'invalid');
  }
  if (!raw || typeof raw !== 'object' || raw.format !== BACKUP_FORMAT)
    throw new AppError('이 앱에서 만든 백업 파일이 아닙니다.', 'invalid');
  let version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new AppError('백업 파일의 스키마 버전 정보가 없습니다.', 'invalid');
  if (version > SCHEMA_VERSION)
    throw new AppError(`이 백업은 더 최신 버전(스키마 ${version})에서 만들어져 현재 앱(스키마 ${SCHEMA_VERSION})으로 복원할 수 없습니다.`, 'invalid');
  while ((version as number) < SCHEMA_VERSION) {
    const m = MIGRATIONS[version as number];
    if (!m) throw new AppError(`스키마 ${version} 백업을 변환할 방법이 없습니다.`, 'invalid');
    raw = m(raw);
    version = (version as number) + 1;
  }
  const parsed = bundleSchema.safeParse(raw.bundle);
  if (!parsed.success) throw new AppError(`백업 내용이 올바르지 않습니다. ${formatZodError(parsed.error)}`, 'invalid');
  const bundle = parsed.data as ProjectBundle;
  const problems = checkIntegrity(bundle);
  if (problems.length)
    throw new AppError(`백업의 연결 관계가 손상되었습니다(${problems.length}건). 예: ${problems[0]}`, 'invalid');
  const counts = bundleCounts(bundle);
  const declared = (raw.counts ?? {}) as Record<string, unknown>;
  for (const [k, n] of Object.entries(counts))
    if (declared[k] !== n) throw new AppError(`백업의 항목 수가 기록과 다릅니다(${k}). 파일이 잘렸거나 수정되었습니다.`, 'invalid');
  const files = (raw.attachmentFiles ?? {}) as Record<string, unknown>;
  if (typeof files !== 'object' || Object.values(files).some((v) => typeof v !== 'string'))
    throw new AppError('백업의 첨부파일 데이터가 올바르지 않습니다.', 'invalid');
  const attIds = new Set(bundle.attachments.map((a) => a.id));
  for (const k of Object.keys(files)) if (!attIds.has(k)) throw new AppError('백업에 주인 없는 첨부파일 데이터가 있습니다.', 'invalid');
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: String(raw.appVersion ?? ''),
    exportedAt: String(raw.exportedAt ?? ''),
    isDemo: bundle.project.isDemo,
    notice: String(raw.notice ?? ''),
    counts,
    filesIncluded: raw.filesIncluded === true,
    bundle,
    attachmentFiles: files as Record<ID, string>,
  };
}

function allIds(b: ProjectBundle): ID[] {
  return [
    b.project.id,
    b.subject.id,
    ...[b.variables, b.hypotheses, b.literature, b.evidence, b.attachments, b.meetings, b.feedback, b.changeRequests, b.impactReviews, b.proposalVersions, b.changeLog].flatMap(
      (list) => list.map((x: { id: ID }) => x.id),
    ),
    ...b.project.milestones.map((m) => m.id),
  ];
}

/** 모든 id 를 새로 발급하고 참조를 함께 바꾼다(사본 복원용). */
export function remapIds(backup: BackupFile): BackupFile {
  const map = new Map<ID, ID>();
  for (const id of allIds(backup.bundle)) map.set(id, newId());
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(Array.from(map.keys()).map(esc).join('|'), 'g');
  const swap = (obj: unknown) => JSON.parse(JSON.stringify(obj).replace(pattern, (m) => map.get(m) ?? m));
  return { ...backup, bundle: swap(backup.bundle), attachmentFiles: swap(backup.attachmentFiles) };
}

export interface RestorePlan {
  /** 같은 프로젝트(id)가 이미 저장되어 있음 */
  existingProject: { id: ID; title: string; updatedAt: string } | null;
  /** 프로젝트는 다르지만 일부 id 가 다른 프로젝트와 겹침 → 자동으로 새 id 발급 */
  idCollision: boolean;
}

export async function planRestore(backup: BackupFile): Promise<RestorePlan> {
  const b = backup.bundle;
  const existing = await db.projects.get(b.project.id);
  let idCollision = false;
  const checks: [(typeof CHILD_TABLES)[number], { id: ID }[]][] = [
    ['subjects', [b.subject]],
    ['variables', b.variables],
    ['hypotheses', b.hypotheses],
    ['literature', b.literature],
    ['evidence', b.evidence],
    ['attachments', b.attachments],
    ['meetings', b.meetings],
    ['feedback', b.feedback],
    ['changeRequests', b.changeRequests],
    ['impactReviews', b.impactReviews],
    ['proposalVersions', b.proposalVersions],
    ['changeLog', b.changeLog],
  ];
  for (const [table, list] of checks) {
    const found = await (db[table] as typeof db.variables).bulkGet(list.map((x) => x.id));
    if (found.some((x) => x && x.projectId !== b.project.id)) idCollision = true;
  }
  return { existingProject: existing ? { id: existing.id, title: existing.title, updatedAt: existing.updatedAt } : null, idCollision };
}

export type RestoreMode = 'new' | 'overwrite' | 'copy';

/**
 * 백업을 복원한다. 하나의 트랜잭션으로 처리하며, 도중에 실패하면
 * (덮어쓰기 대상 삭제 포함) 모든 변경이 취소되어 기존 데이터가 그대로 남는다.
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode): Promise<{ projectId: ID; mode: RestoreMode; filesRestored: number; filesMissing: number }> {
  const plan = await planRestore(backup);
  if (plan.existingProject && mode === 'new')
    throw new AppError('같은 프로젝트가 이미 있습니다. 덮어쓰기 또는 사본으로 복원을 선택하세요.', 'duplicate');
  let src = backup;
  if (mode === 'copy' || (mode === 'new' && plan.idCollision)) src = remapIds(backup);
  const b: ProjectBundle = JSON.parse(JSON.stringify(src.bundle));
  let filesRestored = 0;
  let filesMissing = 0;
  const blobs: { id: ID; projectId: ID; data: ArrayBuffer }[] = [];
  for (const a of b.attachments) {
    if (a.storage !== 'stored') continue;
    const b64 = src.attachmentFiles[a.id];
    if (b64) {
      blobs.push({ id: a.id, projectId: b.project.id, data: fromBase64(b64) });
      filesRestored++;
    } else {
      // 파일 본문이 백업에 없으면 '저장됨'이라고 표시하지 않는다
      a.storage = 'reference-only';
      a.note = [a.note, '백업에 파일 본문이 없어 참조 정보만 복원됨'].filter(Boolean).join(' / ');
      filesMissing++;
    }
  }
  const tables = [db.projects, ...CHILD_TABLES.map((t) => db[t])];
  await db.transaction('rw', tables, async () => {
    if (mode === 'overwrite') {
      for (const t of CHILD_TABLES) await db[t].where('projectId').equals(b.project.id).delete();
      await db.projects.delete(b.project.id);
    }
    const titles = (await db.projects.toArray()).map((p) => p.title.trim());
    if (titles.includes(b.project.title.trim())) {
      let n = 1;
      let t = `${b.project.title} (복원본)`;
      while (titles.includes(t)) t = `${b.project.title} (복원본 ${++n})`;
      b.project.title = t;
    }
    // add 계열만 사용: id 가 겹치면 예외 → 전체 롤백
    await db.projects.add(b.project);
    await db.subjects.add(b.subject);
    await db.variables.bulkAdd(b.variables);
    await db.hypotheses.bulkAdd(b.hypotheses);
    await db.literature.bulkAdd(b.literature);
    await db.evidence.bulkAdd(b.evidence);
    await db.attachments.bulkAdd(b.attachments);
    await db.attachmentBlobs.bulkAdd(blobs);
    await db.meetings.bulkAdd(b.meetings);
    await db.feedback.bulkAdd(b.feedback);
    await db.changeRequests.bulkAdd(b.changeRequests);
    await db.impactReviews.bulkAdd(b.impactReviews);
    await db.proposalVersions.bulkAdd(b.proposalVersions);
    await db.changeLog.bulkAdd(b.changeLog);
    await db.changeLog.add({
      id: newId(),
      projectId: b.project.id,
      at: nowIso(),
      entityType: 'project',
      entityId: b.project.id,
      entityLabel: b.project.title,
      action: 'restore',
      changes: [{ field: '백업 복원', before: `백업 시각 ${backup.exportedAt}`, after: mode === 'overwrite' ? '덮어쓰기' : mode === 'copy' ? '사본으로 복원' : '새로 복원' }],
      changeRequestId: null,
    });
    // 저장된 결과를 다시 읽어 무결성을 확인한다. 문제가 있으면 예외 → 롤백
    const restored = await loadBundle(b.project.id);
    const problems = checkIntegrity(restored);
    if (problems.length) throw new AppError(`복원 결과 검증에 실패해 복원을 취소했습니다: ${problems[0]}`, 'invalid');
    const expected = bundleCounts(b);
    const actual = bundleCounts(restored);
    for (const k of Object.keys(expected)) {
      const want = k === 'changeLog' ? expected[k] + 1 : expected[k];
      if (actual[k] !== want) throw new AppError(`복원 결과의 항목 수가 맞지 않아 복원을 취소했습니다(${k}).`, 'invalid');
    }
  });
  return { projectId: b.project.id, mode, filesRestored, filesMissing };
}
