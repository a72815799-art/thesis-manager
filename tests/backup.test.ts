import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import * as repo from '../src/db/repo';
import { exportBackup, parseBackup, planRestore, restoreBackup } from '../src/db/backup';
import { checkIntegrity, relationFingerprint } from '../src/domain/integrity';
import { seedDemo } from '../src/demo/demo';
import { resetDb } from './helpers';

beforeEach(resetDb);

async function demoWithHistory() {
  const pid = await seedDemo();
  const b = await repo.loadBundle(pid);
  const pdf = new TextEncoder().encode('%PDF-1.4 가상 PDF 본문').buffer as ArrayBuffer;
  await repo.addAttachment(pid, b.literature[0].id, { fileName: '가상문헌A.pdf', mimeType: 'application/pdf', size: pdf.byteLength }, pdf);
  await repo.addAttachment(pid, b.literature[1].id, { fileName: '참조.pdf', mimeType: 'application/pdf', size: 0 }, null);
  await repo.applyChangeRequest(b.changeRequests[0].id);
  await repo.createProposalVersion(pid, { reason: '대상 변경 반영', changeRequestId: b.changeRequests[0].id });
  return pid;
}

describe('백업·복원', () => {
  it('백업 → 전체 삭제 → 복원 후 ID와 연결 관계가 동일하다', async () => {
    const pid = await demoWithHistory();
    const before = await repo.loadBundle(pid);
    const text = JSON.stringify(await exportBackup(pid));
    await repo.deleteProject(pid);
    expect(await db.projects.count()).toBe(0);
    expect(await db.evidence.count()).toBe(0);

    const backup = parseBackup(text);
    expect(backup.schemaVersion).toBe(2);
    expect(backup.integrity?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(backup.isDemo).toBe(true);
    const r = await restoreBackup(backup, 'new');
    expect(r.projectId).toBe(pid);
    expect(r.filesRestored).toBe(1);
    const after = await repo.loadBundle(pid);
    // 복원 기록 1건 외에는 완전히 동일
    const strip = (b: typeof after) => ({ ...b, changeLog: b.changeLog.filter((c) => c.action !== 'restore') });
    expect(strip(after)).toEqual(strip(before));
    expect(relationFingerprint(strip(after))).toBe(relationFingerprint(before));
    expect(checkIntegrity(after)).toEqual([]);
    const att = after.attachments.find((a) => a.storage === 'stored')!;
    expect(new TextDecoder().decode((await repo.getAttachmentData(att.id))!)).toBe('%PDF-1.4 가상 PDF 본문');
    expect(after.proposalVersions).toHaveLength(2);
    expect(after.impactReviews.length).toBeGreaterThan(0);
  });

  it('같은 프로젝트가 있으면 덮어쓰기 여부를 선택해야 하고, 덮어쓰기는 백업 시점으로 되돌린다', async () => {
    const pid = await demoWithHistory();
    const backup = parseBackup(JSON.stringify(await exportBackup(pid)));
    await repo.updateProject(pid, { purpose: '백업 이후 수정' });
    const plan = await planRestore(backup);
    expect(plan.existingProject?.id).toBe(pid);
    await expect(restoreBackup(backup, 'new')).rejects.toMatchObject({ code: 'duplicate' });
    await restoreBackup(backup, 'overwrite');
    const b = await repo.loadBundle(pid);
    expect(b.project.purpose).not.toBe('백업 이후 수정');
    expect(await db.projects.count()).toBe(1);
    expect(checkIntegrity(b)).toEqual([]);
  });

  it('사본으로 복원하면 모든 ID가 새로 발급되고 관계 구조는 유지되며 원본과 섞이지 않는다', async () => {
    const pid = await demoWithHistory();
    const orig = await repo.loadBundle(pid);
    const backup = parseBackup(JSON.stringify(await exportBackup(pid)));
    const r = await restoreBackup(backup, 'copy');
    expect(r.projectId).not.toBe(pid);
    const copy = await repo.loadBundle(r.projectId);
    expect(copy.project.title).toBe(`${orig.project.title} (복원본)`);
    expect(checkIntegrity(copy)).toEqual([]);
    const origIds = new Set([...orig.variables, ...orig.hypotheses, ...orig.literature, ...orig.evidence, ...orig.proposalVersions].map((x) => x.id));
    for (const x of [...copy.variables, ...copy.hypotheses, ...copy.literature, ...copy.evidence, ...copy.proposalVersions]) expect(origIds.has(x.id)).toBe(false);
    // 코드 기준으로 본 관계 구조가 같다
    const shape = (b: typeof copy) =>
      b.evidence.map((e) => [e.code, b.literature.find((l) => l.id === e.literatureId)!.code, e.hypothesisIds.map((h) => b.hypotheses.find((x) => x.id === h)!.code).sort(), e.status]);
    expect(shape(copy)).toEqual(shape(orig));
    expect(copy.impactReviews.every((x) => x.changeRequestId === copy.changeRequests[0].id)).toBe(true);
    // 원본은 그대로
    expect(relationFingerprint(await repo.loadBundle(pid))).toBe(relationFingerprint(orig));
  });

  it('손상되었거나 잘못된 백업은 거부하고 기존 데이터를 건드리지 않는다', async () => {
    const pid = await demoWithHistory();
    const fp = relationFingerprint(await repo.loadBundle(pid));
    const good = await exportBackup(pid);
    const text = JSON.stringify(good);
    expect(() => parseBackup(text.slice(0, text.length / 2))).toThrow('읽을 수 없습니다');
    expect(() => parseBackup('{"hello":1}')).toThrow('백업 파일이 아닙니다');
    expect(() => parseBackup('%PDF-1.4')).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...good, schemaVersion: 99 }))).toThrow('더 최신 버전');
    // 끊어진 참조
    const broken = JSON.parse(text);
    broken.bundle.evidence[0].literatureId = 'missing';
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('연결 관계가 손상');
    // 항목 누락(건수 불일치)
    const cut = JSON.parse(text);
    cut.bundle.changeLog.pop();
    expect(() => parseBackup(JSON.stringify(cut))).toThrow('항목 수');
    // 필드 형식 오류
    const bad = JSON.parse(text);
    bad.bundle.evidence[0].status = '확인됨';
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('올바르지 않습니다');
    expect(relationFingerprint(await repo.loadBundle(pid))).toBe(fp);
  });

  it('덮어쓰기 복원 도중 실패하면 기존 데이터가 그대로 남는다', async () => {
    const pid = await demoWithHistory();
    const backup = parseBackup(JSON.stringify(await exportBackup(pid)));
    await repo.updateProject(pid, { purpose: '백업 이후 수정' });
    const before = await repo.loadBundle(pid);
    const spy = vi.spyOn(db.proposalVersions, 'bulkAdd').mockRejectedValueOnce(new Error('용량 부족'));
    await expect(restoreBackup(backup, 'overwrite')).rejects.toThrow('용량 부족');
    spy.mockRestore();
    const after = await repo.loadBundle(pid);
    expect(after).toEqual(before);
    expect(after.project.purpose).toBe('백업 이후 수정');
    expect(await db.attachmentBlobs.count()).toBe(1);
  });

  it('파일 본문 없이 백업하면 복원 시 "참조만"으로 정직하게 표시한다', async () => {
    const pid = await demoWithHistory();
    const backup = parseBackup(JSON.stringify(await exportBackup(pid, false)));
    expect(backup.filesIncluded).toBe(false);
    await repo.deleteProject(pid);
    const r = await restoreBackup(backup, 'new');
    expect(r.filesMissing).toBe(1);
    const b = await repo.loadBundle(pid);
    expect(b.attachments.every((a) => a.storage === 'reference-only')).toBe(true);
    expect(b.attachments.some((a) => a.note.includes('참조 정보만 복원'))).toBe(true);
  });

  it('무결성 해시: 건수·형식이 멀쩡해도 내용이 한 글자라도 바뀌면 거부한다', async () => {
    const pid = await demoWithHistory();
    const text = JSON.stringify(await exportBackup(pid));
    const tampered = JSON.parse(text);
    tampered.bundle.evidence[0].content += ' (몰래 수정)';
    expect(() => parseBackup(JSON.stringify(tampered))).toThrow('무결성 검증에 실패');
    const tamperedFile = JSON.parse(text);
    const k = Object.keys(tamperedFile.attachmentFiles)[0];
    tamperedFile.attachmentFiles[k] = tamperedFile.attachmentFiles[k].slice(0, -4) + 'AAAA';
    expect(() => parseBackup(JSON.stringify(tamperedFile))).toThrow('무결성 검증에 실패');
    const noHash = JSON.parse(text);
    delete noHash.integrity;
    expect(() => parseBackup(JSON.stringify(noHash))).toThrow('무결성 검증 정보가 없습니다');
    // 키 순서만 바뀐 것은 같은 내용이므로 통과
    const reordered = JSON.parse(text);
    reordered.bundle.project = Object.fromEntries(Object.entries(reordered.bundle.project).reverse());
    expect(parseBackup(JSON.stringify(reordered)).integrity?.hash).toBe(JSON.parse(text).integrity.hash);
  });

  it('스키마 v1 백업(무결성 해시 없음)은 마이그레이션을 거쳐 복원된다', async () => {
    const pid = await demoWithHistory();
    const v1 = JSON.parse(JSON.stringify(await exportBackup(pid)));
    v1.schemaVersion = 1;
    delete v1.integrity;
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.integrity).toBeNull();
    await repo.deleteProject(pid);
    await restoreBackup(parsed, 'new');
    expect(checkIntegrity(await repo.loadBundle(pid))).toEqual([]);
  });

  it('같은 백업을 여러 번 복원해도 ID 충돌이나 데이터 중복이 생기지 않는다', async () => {
    const pid = await demoWithHistory();
    const backup = parseBackup(JSON.stringify(await exportBackup(pid)));
    const n = { ev: await db.evidence.count(), ver: await db.proposalVersions.count(), log: await db.changeLog.count() };
    // 덮어쓰기 2회: 항목 수가 늘지 않는다 (복원 기록만 1건)
    await restoreBackup(backup, 'overwrite');
    await restoreBackup(backup, 'overwrite');
    expect(await db.projects.count()).toBe(1);
    expect(await db.evidence.count()).toBe(n.ev);
    expect(await db.proposalVersions.count()).toBe(n.ver);
    expect(await db.changeLog.count()).toBe(n.log + 1);
    // 사본 2회: 매번 새 ID, 서로 다른 제목, 각 프로젝트 무결성 유지
    const c1 = await restoreBackup(backup, 'copy');
    const c2 = await restoreBackup(backup, 'copy');
    expect(new Set([pid, c1.projectId, c2.projectId]).size).toBe(3);
    const titles = (await db.projects.toArray()).map((p) => p.title);
    expect(new Set(titles).size).toBe(3);
    expect(await db.evidence.count()).toBe(n.ev * 3);
    const allIds = (await db.evidence.toArray()).map((e) => e.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of [pid, c1.projectId, c2.projectId]) expect(checkIntegrity(await repo.loadBundle(id))).toEqual([]);
    // '새로 복원'은 같은 프로젝트가 있으면 거부
    await expect(restoreBackup(backup, 'new')).rejects.toMatchObject({ code: 'duplicate' });
  });
});
