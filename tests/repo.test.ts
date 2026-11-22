import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import * as repo from '../src/db/repo';
import { checkIntegrity } from '../src/domain/integrity';
import { deriveModelEdges } from '../src/domain/proposal';
import { computeProgress, computeStats } from '../src/domain/progress';
import { resetDb } from './helpers';

beforeEach(resetDb);

async function basic() {
  const p = await repo.createProject({ title: '테스트 연구' });
  const iv = await repo.saveVariable(p.id, { name: '지각된 차별', role: 'independent', conceptualDefinition: '정의', operationalDefinition: '', notes: '' });
  const me = await repo.saveVariable(p.id, { name: '회복탄력성', role: 'mediator', conceptualDefinition: '정의', operationalDefinition: '', notes: '' });
  const dv = await repo.saveVariable(p.id, { name: '외상 후 성장', role: 'dependent', conceptualDefinition: '정의', operationalDefinition: '', notes: '' });
  const h1 = await repo.saveHypothesis(p.id, { statement: '차별은 성장에 영향을 미친다', kind: 'direct', fromVariableId: iv.id, toVariableId: dv.id, viaVariableId: null, extraVariableIds: [], notes: '' });
  const h2 = await repo.saveHypothesis(p.id, { statement: '회복탄력성은 매개한다', kind: 'mediation', fromVariableId: iv.id, toVariableId: dv.id, viaVariableId: me.id, extraVariableIds: [], notes: '' });
  const lit = await repo.saveLiterature(p.id, { title: '문헌 하나', authors: '홍길동', year: '2020', sourceType: 'journal', source: '', doi: '', url: '', sample: '', method: '', keyFindings: '', notes: '', variableIds: [iv.id], isKey: true });
  const ev = await repo.saveEvidence(p.id, { literatureId: lit.id, content: '근거 내용', page: '3', kind: 'summary', variableIds: [iv.id], hypothesisIds: [h1.id, h2.id], notes: '' });
  return { p, iv, me, dv, h1, h2, lit, ev };
}

describe('프로젝트·변수·가설', () => {
  it('프로젝트 생성 시 연구 대상 레코드가 함께 만들어지고 코드가 순서대로 부여된다', async () => {
    const { p, iv, me, dv, h1, h2 } = await basic();
    const b = await repo.loadBundle(p.id);
    expect(b.subject.projectId).toBe(p.id);
    expect([iv.code, me.code, dv.code]).toEqual(['V1', 'V2', 'V3']);
    expect([h1.code, h2.code]).toEqual(['H1', 'H2']);
    expect(checkIntegrity(b)).toEqual([]);
  });

  it('필수값이 없으면 저장하지 않는다', async () => {
    await expect(repo.createProject({ title: '  ' })).rejects.toThrow('연구 제목');
    const p = await repo.createProject({ title: 'A' });
    await expect(repo.saveVariable(p.id, { name: '', role: 'independent', conceptualDefinition: '', operationalDefinition: '', notes: '' })).rejects.toThrow('변수명');
    await expect(repo.saveHypothesis(p.id, { statement: '', kind: 'other', fromVariableId: null, toVariableId: null, viaVariableId: null, extraVariableIds: [], notes: '' })).rejects.toThrow('가설 문장');
    await expect(repo.saveHypothesis(p.id, { statement: '가설', kind: 'direct', fromVariableId: null, toVariableId: null, viaVariableId: null, extraVariableIds: [], notes: '' })).rejects.toThrow('원인 변수');
    await expect(repo.saveLiterature(p.id, { title: '', authors: '', year: '', sourceType: 'journal', source: '', doi: '', url: '', sample: '', method: '', keyFindings: '', notes: '', variableIds: [], isKey: false })).rejects.toThrow('논문 제목');
    expect(await db.variables.count()).toBe(0);
    expect(await db.hypotheses.count()).toBe(0);
  });

  it('중복 데이터를 거부한다 (프로젝트 제목, 변수명, 가설, 문헌, 근거)', async () => {
    const { p, lit, h1 } = await basic();
    await expect(repo.createProject({ title: ' 테스트  연구 ' })).rejects.toMatchObject({ code: 'duplicate' });
    await expect(repo.saveVariable(p.id, { name: '지각된 차별', role: 'control', conceptualDefinition: '', operationalDefinition: '', notes: '' })).rejects.toMatchObject({ code: 'duplicate' });
    await expect(repo.saveHypothesis(p.id, { statement: '차별은 성장에 영향을 미친다', kind: 'other', fromVariableId: null, toVariableId: null, viaVariableId: null, extraVariableIds: [], notes: '' })).rejects.toMatchObject({ code: 'duplicate' });
    await expect(repo.saveLiterature(p.id, { title: '문헌 하나', authors: '', year: '2020', sourceType: 'journal', source: '', doi: '', url: '', sample: '', method: '', keyFindings: '', notes: '', variableIds: [], isKey: false })).rejects.toMatchObject({ code: 'duplicate' });
    await expect(repo.saveEvidence(p.id, { literatureId: lit.id, content: '근거 내용', page: '3', kind: 'quote', variableIds: [], hypothesisIds: [h1.id], notes: '' })).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('변수명을 바꿔도 가설·근거 연결이 유지된다 (id 기반)', async () => {
    const { p, iv, h1, ev } = await basic();
    await repo.saveVariable(p.id, { name: '차별 지각', role: 'independent', conceptualDefinition: '정의', operationalDefinition: '', notes: '' }, iv.id);
    const b = await repo.loadBundle(p.id);
    expect(b.hypotheses.find((h) => h.id === h1.id)!.fromVariableId).toBe(iv.id);
    expect(b.evidence.find((e) => e.id === ev.id)!.variableIds).toContain(iv.id);
    expect(b.variables.find((v) => v.id === iv.id)!.name).toBe('차별 지각');
    expect(b.changeLog.some((c) => c.entityId === iv.id && c.action === 'update' && c.changes[0].before === '지각된 차별')).toBe(true);
    expect(checkIntegrity(b)).toEqual([]);
  });

  it('가설에서 사용 중인 변수는 삭제할 수 없고, 가설 삭제 후에는 근거 참조가 정리된다', async () => {
    const { p, me, h1, h2, ev } = await basic();
    await expect(repo.deleteVariable(me.id)).rejects.toMatchObject({ code: 'in-use' });
    await repo.deleteHypothesis(h2.id);
    await repo.deleteVariable(me.id);
    const b = await repo.loadBundle(p.id);
    expect(b.evidence.find((e) => e.id === ev.id)!.hypothesisIds).toEqual([h1.id]);
    expect(checkIntegrity(b)).toEqual([]);
  });

  it('연구모형 경로가 가설에서 도출된다 (직접 + 매개 경로)', async () => {
    const { p, iv, me, dv } = await basic();
    const b = await repo.loadBundle(p.id);
    const edges = deriveModelEdges(b.hypotheses, b.variables).map((e) => `${e.fromId}>${e.toId}:${e.hypothesisCodes.join('+')}`);
    expect(edges.sort()).toEqual([`${iv.id}>${dv.id}:H1`, `${iv.id}>${me.id}:H2`, `${me.id}>${dv.id}:H2`].sort());
  });
});

describe('문헌·근거·첨부', () => {
  it('문헌을 삭제하면 근거와 첨부가 함께 삭제되어 끊어진 참조가 남지 않는다', async () => {
    const { p, lit } = await basic();
    const pdf = new TextEncoder().encode('%PDF-1.4 테스트').buffer as ArrayBuffer;
    const a = await repo.addAttachment(p.id, lit.id, { fileName: '논문.pdf', mimeType: 'application/pdf', size: pdf.byteLength }, pdf);
    await repo.addAttachment(p.id, lit.id, { fileName: '참조만.pdf', mimeType: 'application/pdf', size: 0 }, null);
    expect(a.storage).toBe('stored');
    expect((await repo.getAttachmentData(a.id))!.byteLength).toBe(pdf.byteLength);
    const r = await repo.deleteLiterature(lit.id);
    expect(r).toEqual({ evidence: 1, attachments: 2 });
    const b = await repo.loadBundle(p.id);
    expect(b.evidence).toHaveLength(0);
    expect(b.attachments).toHaveLength(0);
    expect(await db.attachmentBlobs.count()).toBe(0);
    expect(checkIntegrity(b)).toEqual([]);
  });

  it('PDF가 아닌 파일은 첨부를 거부한다', async () => {
    const { p, lit } = await basic();
    const bad = new TextEncoder().encode('PK not a pdf').buffer as ArrayBuffer;
    await expect(repo.addAttachment(p.id, lit.id, { fileName: 'x.pdf', mimeType: 'application/pdf', size: 10 }, bad)).rejects.toMatchObject({ code: 'invalid' });
    expect(await db.attachments.count()).toBe(0);
  });

  it('존재하지 않는 문헌·가설을 참조하는 근거는 저장되지 않는다', async () => {
    const { p, lit } = await basic();
    await expect(repo.saveEvidence(p.id, { literatureId: 'nope', content: 'x', page: '', kind: 'quote', variableIds: [], hypothesisIds: [], notes: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.saveEvidence(p.id, { literatureId: lit.id, content: 'x', page: '', kind: 'quote', variableIds: [], hypothesisIds: ['ghost'], notes: '' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('새 근거는 미확인으로 시작하고 사용자 조작으로만 확인 완료가 된다', async () => {
    const { p, ev } = await basic();
    expect(ev.status).toBe('unverified');
    expect(computeStats(await repo.loadBundle(p.id)).evidenceVerified).toBe(0);
    await repo.setEvidenceStatus(ev.id, 'verified');
    const b = await repo.loadBundle(p.id);
    expect(b.evidence[0].status).toBe('verified');
    expect(b.evidence[0].verifiedAt).not.toBeNull();
    expect(computeStats(b).evidenceVerified).toBe(1);
  });

  it('긴 한국어 텍스트를 그대로 보존한다', async () => {
    const { p, lit } = await basic();
    const long = '가나다라마바사 아자차카타파하 “인용” <태그> & 특수문자 = + - @ '.repeat(400);
    const e = await repo.saveEvidence(p.id, { literatureId: lit.id, content: long, page: '1-20', kind: 'quote', variableIds: [], hypothesisIds: [], notes: '' });
    expect((await db.evidence.get(e.id))!.content).toBe(long.trim());
  });
});

describe('원자성·프로젝트 분리', () => {
  it('저장 도중 실패하면 일부만 바뀌지 않는다', async () => {
    const { p, lit } = await basic();
    const before = await repo.loadBundle(p.id);
    const spy = vi.spyOn(db.changeLog, 'add').mockRejectedValueOnce(new Error('디스크 오류'));
    await expect(repo.deleteLiterature(lit.id)).rejects.toThrow('디스크 오류');
    spy.mockRestore();
    const after = await repo.loadBundle(p.id);
    expect(after.literature).toHaveLength(1);
    expect(after.evidence).toHaveLength(1);
    expect(after.changeLog.length).toBe(before.changeLog.length);
  });

  it('여러 프로젝트의 데이터가 섞이지 않는다', async () => {
    const a = await basic();
    const p2 = await repo.createProject({ title: '두 번째 연구' });
    const v = await repo.saveVariable(p2.id, { name: '지각된 차별', role: 'independent', conceptualDefinition: '', operationalDefinition: '', notes: '' });
    expect(v.code).toBe('V1');
    // 다른 프로젝트의 변수·문헌은 연결할 수 없다
    await expect(repo.saveHypothesis(p2.id, { statement: '교차 참조', kind: 'direct', fromVariableId: a.iv.id, toVariableId: v.id, viaVariableId: null, extraVariableIds: [], notes: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.saveEvidence(p2.id, { literatureId: a.lit.id, content: 'x', page: '', kind: 'quote', variableIds: [], hypothesisIds: [], notes: '' })).rejects.toMatchObject({ code: 'invalid' });
    const b2 = await repo.loadBundle(p2.id);
    expect(b2.variables).toHaveLength(1);
    expect(b2.literature).toHaveLength(0);
    await repo.deleteProject(p2.id);
    const b1 = await repo.loadBundle(a.p.id);
    expect(b1.variables).toHaveLength(3);
    expect(b1.evidence).toHaveLength(1);
    expect(await db.variables.count()).toBe(3);
  });

  it('빈 프로젝트도 묶음·진행률 계산이 동작한다', async () => {
    const p = await repo.createProject({ title: '빈 연구' });
    const b = await repo.loadBundle(p.id);
    expect(checkIntegrity(b)).toEqual([]);
    const prog = computeProgress(b);
    expect(prog).toHaveLength(9);
    expect(prog.filter((c) => c.done).map((c) => c.key)).toEqual(['recheck']);
  });
});

describe('피드백', () => {
  it('피드백을 저장해도 연구 데이터는 바뀌지 않는다', async () => {
    const { p } = await basic();
    await repo.updateSubject(p.id, { population: '대학생' });
    const s = await repo.getSubject(p.id);
    await repo.saveFeedback(p.id, { meetingDate: '2025-03-01', professorComment: '대상을 성인으로 바꾸세요', targets: [{ type: 'subject', id: s.id }], interpretation: '내 해석', decision: 'accept', decisionNote: '', beforeText: '', afterText: '성인', status: 'open' });
    const b = await repo.loadBundle(p.id);
    expect(b.subject.population).toBe('대학생');
    expect(b.feedback[0].professorComment).toBe('대상을 성인으로 바꾸세요');
    expect(b.feedback[0].interpretation).toBe('내 해석');
    await expect(repo.saveFeedback(p.id, { meetingDate: '2025-03-01', professorComment: '', targets: [], interpretation: '', decision: 'pending', decisionNote: '', beforeText: '', afterText: '', status: 'open' })).rejects.toThrow('교수 의견 원문');
  });
});
