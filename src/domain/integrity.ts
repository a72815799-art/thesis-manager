import { ProjectBundle, hypothesisVariableIds } from './types';

/**
 * 프로젝트 묶음의 참조 무결성을 검사한다.
 * 반환값이 빈 배열이면 문제 없음.
 */
export function checkIntegrity(b: ProjectBundle): string[] {
  const problems: string[] = [];
  const pid = b.project.id;
  const ids = new Set<string>();
  const dup = (id: string, where: string) => {
    if (ids.has(id)) problems.push(`중복 ID: ${where} ${id}`);
    ids.add(id);
  };
  dup(pid, '프로젝트');
  dup(b.subject.id, '연구 대상');
  if (b.subject.projectId !== pid) problems.push('연구 대상이 다른 프로젝트를 가리킵니다.');

  const lists: [string, { id: string; projectId: string }[]][] = [
    ['변수', b.variables],
    ['가설', b.hypotheses],
    ['문헌', b.literature],
    ['근거', b.evidence],
    ['첨부', b.attachments],
    ['면담 준비', b.meetings],
    ['피드백', b.feedback],
    ['변경 요청', b.changeRequests],
    ['영향 검토', b.impactReviews],
    ['계획서 버전', b.proposalVersions],
    ['수정 이력', b.changeLog],
  ];
  for (const [label, list] of lists) {
    for (const item of list) {
      dup(item.id, label);
      if (item.projectId !== pid) problems.push(`${label} ${item.id} 이(가) 다른 프로젝트(${item.projectId})를 가리킵니다.`);
    }
  }

  const vars = new Set(b.variables.map((v) => v.id));
  const hyps = new Set(b.hypotheses.map((h) => h.id));
  const lits = new Set(b.literature.map((l) => l.id));
  const fbs = new Set(b.feedback.map((f) => f.id));
  const crs = new Set(b.changeRequests.map((c) => c.id));
  const vers = new Set(b.proposalVersions.map((v) => v.id));

  for (const h of b.hypotheses)
    for (const v of hypothesisVariableIds(h))
      if (!vars.has(v)) problems.push(`가설 ${h.code} 이(가) 없는 변수(${v})를 참조합니다.`);
  for (const l of b.literature)
    for (const v of l.variableIds) if (!vars.has(v)) problems.push(`문헌 ${l.code} 이(가) 없는 변수(${v})를 참조합니다.`);
  for (const e of b.evidence) {
    if (!lits.has(e.literatureId)) problems.push(`근거 ${e.code} 이(가) 없는 문헌(${e.literatureId})을 참조합니다.`);
    for (const v of e.variableIds) if (!vars.has(v)) problems.push(`근거 ${e.code} 이(가) 없는 변수(${v})를 참조합니다.`);
    for (const h of e.hypothesisIds) if (!hyps.has(h)) problems.push(`근거 ${e.code} 이(가) 없는 가설(${h})을 참조합니다.`);
  }
  for (const a of b.attachments)
    if (!lits.has(a.literatureId)) problems.push(`첨부 ${a.fileName} 이(가) 없는 문헌(${a.literatureId})을 참조합니다.`);
  for (const f of b.feedback)
    for (const t of f.targets) {
      const ok =
        (t.type === 'variable' && vars.has(t.id)) ||
        (t.type === 'hypothesis' && hyps.has(t.id)) ||
        (t.type === 'literature' && lits.has(t.id)) ||
        (t.type === 'subject' && t.id === b.subject.id) ||
        (t.type === 'project' && t.id === pid);
      if (!ok) problems.push(`피드백 ${f.code} 이(가) 없는 항목(${t.type}:${t.id})을 참조합니다.`);
    }
  for (const c of b.changeRequests) {
    if (c.feedbackId && !fbs.has(c.feedbackId)) problems.push(`변경 요청 ${c.code} 이(가) 없는 피드백을 참조합니다.`);
    if (c.preservedVersionId && !vers.has(c.preservedVersionId))
      problems.push(`변경 요청 ${c.code} 이(가) 없는 계획서 버전을 참조합니다.`);
    // 취소·적용된 요청의 대상은 이후 삭제될 수 있으므로 검토 대기 상태만 검사
    if (c.status === 'draft') {
      const t = c.target;
      const ok =
        (t.type === 'variable' && vars.has(t.id)) ||
        (t.type === 'hypothesis' && hyps.has(t.id)) ||
        (t.type === 'subject' && t.id === b.subject.id) ||
        (t.type === 'project' && t.id === pid);
      if (!ok) problems.push(`변경 요청 ${c.code} 의 대상이 존재하지 않습니다.`);
    }
  }
  for (const r of b.impactReviews)
    if (!crs.has(r.changeRequestId)) problems.push(`영향 검토 ${r.id} 이(가) 없는 변경 요청을 참조합니다.`);
  const versionNos = new Set<number>();
  for (const v of b.proposalVersions) {
    if (versionNos.has(v.versionNo)) problems.push(`계획서 버전 번호 중복: v${v.versionNo}`);
    versionNos.add(v.versionNo);
    if (v.previousVersionId && !vers.has(v.previousVersionId))
      problems.push(`계획서 v${v.versionNo} 이(가) 없는 이전 버전을 참조합니다.`);
    if (v.changeRequestId && !crs.has(v.changeRequestId))
      problems.push(`계획서 v${v.versionNo} 이(가) 없는 변경 요청을 참조합니다.`);
    if (v.feedbackId && !fbs.has(v.feedbackId)) problems.push(`계획서 v${v.versionNo} 이(가) 없는 피드백을 참조합니다.`);
  }
  return problems;
}

/** 백업 전후 비교용: 관계만 추린 정규화 문자열 */
export function relationFingerprint(b: ProjectBundle): string {
  const s = (a: string[]) => [...a].sort();
  return JSON.stringify({
    project: b.project.id,
    subject: b.subject.id,
    variables: s(b.variables.map((v) => v.id)),
    hypotheses: s(b.hypotheses.map((h) => `${h.id}|${h.fromVariableId}|${h.viaVariableId}|${h.toVariableId}|${s(h.extraVariableIds)}`)),
    literature: s(b.literature.map((l) => `${l.id}|${s(l.variableIds)}`)),
    evidence: s(b.evidence.map((e) => `${e.id}|${e.literatureId}|${s(e.variableIds)}|${s(e.hypothesisIds)}|${e.status}`)),
    attachments: s(b.attachments.map((a) => `${a.id}|${a.literatureId}|${a.storage}`)),
    meetings: s(b.meetings.map((m) => m.id)),
    feedback: s(b.feedback.map((f) => `${f.id}|${s(f.targets.map((t) => `${t.type}:${t.id}`))}`)),
    changeRequests: s(b.changeRequests.map((c) => `${c.id}|${c.feedbackId}|${c.target.type}:${c.target.id}:${c.target.field}|${c.status}|${c.preservedVersionId}`)),
    impactReviews: s(b.impactReviews.map((r) => `${r.id}|${r.changeRequestId}|${r.target.type}:${r.target.id}|${r.status}`)),
    versions: s(b.proposalVersions.map((v) => `${v.id}|${v.versionNo}|${v.previousVersionId}|${v.changeRequestId}|${v.feedbackId}|${v.status}`)),
    log: b.changeLog.length,
  });
}
