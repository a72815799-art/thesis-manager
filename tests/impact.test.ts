import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import * as repo from '../src/db/repo';
import { analyzeImpact } from '../src/domain/impact';
import { checkIntegrity } from '../src/domain/integrity';
import { seedDemo } from '../src/demo/demo';
import { resetDb } from './helpers';

beforeEach(resetDb);

describe('변경 영향 분석', () => {
  it('연구 대상 변경: 연결 관계에 따라 영향 항목을 고른다 (가설 미연결 근거는 제외)', async () => {
    const pid = await seedDemo();
    const b = await repo.loadBundle(pid);
    const items = analyzeImpact(b, { type: 'subject', id: b.subject.id, field: 'population' }, b.subject.population);
    const labels = items.map((i) => i.targetLabel);
    expect(items[0].direct).toBe(true);
    expect(labels).toContain('연구 대상 · 연구 대상 정의');
    expect(labels).toContain('연구 대상 · 모집 기준');
    expect(labels).toContain('연구 개요 · 연구 제목');
    for (const h of b.hypotheses) expect(labels).toContain(`${h.code} 연구가설`);
    // 가설에 연결된 근거 E1~E4 는 포함, 미연결 근거 E5 는 제외
    const ev = items.filter((i) => i.target.type === 'evidence').map((i) => i.targetLabel);
    expect(ev.sort()).toEqual(['E1 근거', 'E2 근거', 'E3 근거', 'E4 근거']);
    expect(labels.some((l) => l.includes('5. 연구 대상'))).toBe(true);
    expect(labels.some((l) => l.includes('6. 연구변수'))).toBe(false);
    expect(items.filter((i) => i.target.type === 'extension')).toHaveLength(2);
    // H1 은 문장에 기존 표현이 들어 있다
    const h1 = items.find((i) => i.targetLabel === 'H1 연구가설')!;
    expect(h1.reason).toContain('한부모가족 대학생');
  });

  it('변수 변경: 그 변수를 쓰는 가설·근거·문헌만 영향받는다', async () => {
    const pid = await seedDemo();
    const b = await repo.loadBundle(pid);
    const dv = b.variables.find((v) => v.name === '외상 후 성장')!;
    const items = analyzeImpact(b, { type: 'variable', id: dv.id, field: 'conceptualDefinition' }, dv.conceptualDefinition);
    const hyp = items.filter((i) => i.target.type === 'hypothesis').map((i) => i.targetLabel).sort();
    // H2(차별→회복탄력성)는 외상 후 성장을 쓰지 않으므로 제외
    expect(hyp).toEqual(['H1 연구가설', 'H3 연구가설', 'H4 연구가설']);
    const ev = items.filter((i) => i.target.type === 'evidence').map((i) => i.targetLabel).sort();
    expect(ev).toEqual(['E2 근거', 'E3 근거', 'E4 근거']); // E1 은 H2 에만 연결
    expect(items.some((i) => i.target.type === 'subject')).toBe(false);
    const lit = items.filter((i) => i.target.type === 'literature').map((i) => i.targetLabel.slice(0, 2)).sort();
    expect(lit).toEqual(['L2', 'L3']);
  });

  it('가설 문장 변경: 그 가설의 근거만 영향받는다', async () => {
    const pid = await seedDemo();
    const b = await repo.loadBundle(pid);
    const h2 = b.hypotheses.find((h) => h.code === 'H2')!;
    const items = analyzeImpact(b, { type: 'hypothesis', id: h2.id, field: 'statement' }, h2.statement);
    expect(items.filter((i) => i.target.type === 'evidence').map((i) => i.targetLabel)).toEqual(['E1 근거']);
    expect(items.filter((i) => i.target.type === 'hypothesis' && !i.direct)).toHaveLength(0);
  });

  it('연결이 전혀 없는 프로젝트에서는 영향 항목이 거의 없다', async () => {
    const p = await repo.createProject({ title: '빈 연구' });
    await repo.updateSubject(p.id, { population: '대학생' });
    const b = await repo.loadBundle(p.id);
    const items = analyzeImpact(b, { type: 'subject', id: b.subject.id, field: 'population' }, '대학생');
    expect(items.filter((i) => ['hypothesis', 'evidence', 'literature'].includes(i.target.type))).toHaveLength(0);
  });
});

describe('변경 요청 적용', () => {
  it('승인 전에는 아무것도 바뀌지 않고, 적용하면 값·검토 기록·근거 상태·피드백이 함께 바뀐다', async () => {
    const pid = await seedDemo();
    let b = await repo.loadBundle(pid);
    const cr = b.changeRequests[0];
    expect(cr.status).toBe('draft');
    expect(b.subject.population).toBe('한부모가족 대학생');
    expect(b.proposalVersions).toHaveLength(1);
    const v1 = JSON.stringify(b.proposalVersions[0]);

    const preview = await repo.previewChangeRequest(cr.id);
    expect(preview.stale).toBe(false);
    expect(preview.recheckEvidenceIds).toHaveLength(2); // 확인 완료 상태였던 E1, E2
    b = await repo.loadBundle(pid);
    expect(b.subject.population).toBe('한부모가족 대학생'); // 미리보기는 변경하지 않음
    expect(b.impactReviews).toHaveLength(0);

    const r = await repo.applyChangeRequest(cr.id);
    b = await repo.loadBundle(pid);
    expect(b.subject.population).toBe('한부모가족 경험이 있는 성인');
    expect(b.changeRequests[0].status).toBe('applied');
    expect(r.rechecked).toBe(2);
    expect(b.evidence.filter((e) => e.status === 'recheck').map((e) => e.code).sort()).toEqual(['E1', 'E2']);
    expect(b.evidence.find((e) => e.code === 'E5')!.status).toBe('verified'); // 미연결 근거는 그대로
    expect(b.evidence.find((e) => e.code === 'E3')!.status).toBe('unverified'); // 미확인은 그대로
    expect(b.impactReviews.length).toBe(r.reviews);
    expect(b.impactReviews.every((x) => x.status === 'pending' && x.oldValue === '한부모가족 대학생')).toBe(true);
    expect(b.feedback[0].status).toBe('in_progress');
    expect(b.feedback[0].beforeText).toContain('한부모가족 대학생');
    expect(b.feedback[0].afterText).toContain('한부모가족 경험이 있는 성인');
    expect(b.feedback[0].professorComment).toContain('(가상 예시)'); // 원문 불변
    // 기존 버전은 그대로 보존 (데이터가 동일했으므로 v1 이 보존 버전으로 지정됨)
    expect(JSON.stringify(b.proposalVersions[0])).toBe(v1);
    expect(b.changeRequests[0].preservedVersionId).toBe(b.proposalVersions[0].id);
    expect(checkIntegrity(b)).toEqual([]);

    // 새 버전 생성: 이전 버전은 불변, 차이가 기록된다
    const v2 = await repo.createProposalVersion(pid, { reason: '연구 대상 변경 반영', changeRequestId: cr.id, feedbackId: b.feedback[0].id });
    b = await repo.loadBundle(pid);
    expect(b.proposalVersions).toHaveLength(2);
    expect(JSON.stringify(b.proposalVersions[0])).toBe(v1);
    expect(b.proposalVersions[0].snapshot.subject.population).toBe('한부모가족 대학생');
    expect(v2.snapshot.subject.population).toBe('한부모가족 경험이 있는 성인');
    expect(v2.diffFromPrevious.map((d) => d.section)).toEqual(['5. 연구 대상']);
    expect(v2.previousVersionId).toBe(b.proposalVersions[0].id);

    await expect(repo.applyChangeRequest(cr.id)).rejects.toThrow('이미 처리된');
  });

  it('최신 버전과 현재 데이터가 다르면 적용 전에 자동으로 버전을 보존한다', async () => {
    const pid = await seedDemo();
    await repo.updateProject(pid, { purpose: '수정된 목적' });
    const cr = (await repo.loadBundle(pid)).changeRequests[0];
    const r = await repo.applyChangeRequest(cr.id);
    const b = await repo.loadBundle(pid);
    expect(b.proposalVersions).toHaveLength(2);
    expect(b.proposalVersions[1].id).toBe(r.preservedVersionId);
    expect(b.proposalVersions[1].snapshot.purpose).toBe('수정된 목적');
    expect(b.proposalVersions[1].snapshot.subject.population).toBe('한부모가족 대학생');
  });

  it('요청 작성 뒤 대상 값이 바뀌었으면 적용을 막는다', async () => {
    const pid = await seedDemo();
    await repo.updateSubject(pid, { population: '한부모가족 청소년' });
    const cr = (await repo.loadBundle(pid)).changeRequests[0];
    await expect(repo.applyChangeRequest(cr.id)).rejects.toMatchObject({ code: 'stale' });
    expect((await repo.getSubject(pid)).population).toBe('한부모가족 청소년');
    await repo.applyChangeRequest(cr.id, { acceptCurrentValue: true });
    const b = await repo.loadBundle(pid);
    expect(b.subject.population).toBe('한부모가족 경험이 있는 성인');
    expect(b.changeRequests[0].oldValue).toBe('한부모가족 청소년');
  });

  it('적용 도중 실패하면 전부 되돌려진다', async () => {
    const pid = await seedDemo();
    const cr = (await repo.loadBundle(pid)).changeRequests[0];
    const spy = vi.spyOn(db.impactReviews, 'bulkAdd').mockRejectedValueOnce(new Error('저장 실패'));
    await expect(repo.applyChangeRequest(cr.id)).rejects.toThrow('저장 실패');
    spy.mockRestore();
    const b = await repo.loadBundle(pid);
    expect(b.subject.population).toBe('한부모가족 대학생');
    expect(b.changeRequests[0].status).toBe('draft');
    expect(b.evidence.filter((e) => e.status === 'recheck')).toHaveLength(0);
    expect(b.proposalVersions).toHaveLength(1);
  });

  it('취소한 요청은 적용할 수 없고, 영향 검토 상태를 사용자가 기록할 수 있다', async () => {
    const pid = await seedDemo();
    const b0 = await repo.loadBundle(pid);
    const cr2 = await repo.createChangeRequest(pid, { target: { type: 'variable', id: b0.variables[0].id, field: 'name' }, newValue: '차별 경험', reason: '용어 통일' });
    await repo.cancelChangeRequest(cr2.id);
    await expect(repo.applyChangeRequest(cr2.id)).rejects.toThrow();
    await repo.applyChangeRequest(b0.changeRequests[0].id);
    const b = await repo.loadBundle(pid);
    await repo.updateImpactReview(b.impactReviews[0].id, { status: 'kept', note: '확인함' });
    expect((await db.impactReviews.get(b.impactReviews[0].id))!.status).toBe('kept');
    await expect(repo.createChangeRequest(pid, { target: { type: 'variable', id: 'ghost', field: 'name' }, newValue: 'x', reason: 'y' })).rejects.toMatchObject({ code: 'invalid' });
  });
});
