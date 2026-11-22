import {
  HYPOTHESIS_KIND_LABEL,
  Hypothesis,
  ID,
  MeetingPrep,
  ProjectBundle,
  ProposalSnapshot,
  ResearchVariable,
  VARIABLE_ROLE_LABEL,
  VersionDiffEntry,
  hypothesisVariableIds,
} from './types';

export const EMPTY = '작성 필요';

export interface ModelEdge {
  fromId: ID;
  toId: ID;
  hypothesisCodes: string[];
  /** 조절효과: 이 경로를 조절하는 변수 */
  moderators: { variableId: ID; code: string }[];
  /** 매개 경로의 일부로만 등장(개별 가설 없음) */
  viaMediationOnly: boolean;
}

/**
 * 가설에서 연구모형 경로를 도출한다.
 * 연구모형은 별도 저장하지 않으므로 등록된 변수·가설과 항상 일치한다.
 */
export function deriveModelEdges(hypotheses: Hypothesis[], variables: ResearchVariable[]): ModelEdge[] {
  const exists = (id: ID | null): id is ID => !!id && variables.some((v) => v.id === id);
  const map = new Map<string, ModelEdge>();
  const edge = (from: ID, to: ID): ModelEdge => {
    const key = `${from}>${to}`;
    let e = map.get(key);
    if (!e) {
      e = { fromId: from, toId: to, hypothesisCodes: [], moderators: [], viaMediationOnly: true };
      map.set(key, e);
    }
    return e;
  };
  for (const h of hypotheses) {
    if (!exists(h.fromVariableId) || !exists(h.toVariableId)) continue;
    if (h.kind === 'direct') {
      const e = edge(h.fromVariableId, h.toVariableId);
      e.hypothesisCodes.push(h.code);
      e.viaMediationOnly = false;
    } else if (h.kind === 'mediation' && exists(h.viaVariableId)) {
      const a = edge(h.fromVariableId, h.viaVariableId);
      const b = edge(h.viaVariableId, h.toVariableId);
      a.hypothesisCodes.push(h.code);
      b.hypothesisCodes.push(h.code);
    } else if (h.kind === 'moderation' && exists(h.viaVariableId)) {
      const e = edge(h.fromVariableId, h.toVariableId);
      e.moderators.push({ variableId: h.viaVariableId, code: h.code });
      e.viaMediationOnly = false;
    }
  }
  return Array.from(map.values());
}

export function latestMeeting(meetings: MeetingPrep[]): MeetingPrep | undefined {
  return [...meetings].sort((a, b) =>
    (b.plannedDate || b.createdAt).localeCompare(a.plannedDate || a.createdAt),
  )[0];
}

/** 현재 프로젝트 데이터에서 계획서 내용을 만든다. 없는 내용을 지어내지 않는다. */
export function buildSnapshot(bundle: ProjectBundle, meetingId?: ID | null): ProposalSnapshot {
  const { project, subject, variables, hypotheses, literature, evidence, meetings } = bundle;
  const name = (id: ID) => variables.find((v) => v.id === id)?.name ?? '(삭제된 변수)';
  const meeting = (meetingId ? meetings.find((m) => m.id === meetingId) : undefined) ?? latestMeeting(meetings);
  const edges = deriveModelEdges(hypotheses, variables);
  return {
    isDemo: project.isDemo,
    title: project.title,
    background: project.background,
    purpose: project.purpose,
    method: project.method,
    researchQuestions: project.researchQuestions.filter((q) => q.trim()),
    subject: {
      population: subject.population,
      definition: subject.definition,
      recruitmentCriteria: subject.recruitmentCriteria,
      exclusionCriteria: subject.exclusionCriteria,
      samplePlan: subject.samplePlan,
    },
    variables: variables.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      role: v.role,
      conceptualDefinition: v.conceptualDefinition,
      operationalDefinition: v.operationalDefinition,
    })),
    modelPaths: edges.map((e) => ({
      from: name(e.fromId),
      to: name(e.toId),
      label: e.hypothesisCodes.join(', '),
      note: e.moderators.map((m) => `${name(m.variableId)}의 조절(${m.code})`).join(', '),
    })),
    hypotheses: hypotheses.map((h) => ({
      id: h.id,
      code: h.code,
      statement: h.statement,
      kind: h.kind,
      variables: hypothesisVariableIds(h).map(name),
    })),
    keyLiterature: literature
      .filter((l) => l.isKey)
      .map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        authors: l.authors,
        year: l.year,
        source: l.source,
        keyFindings: l.keyFindings,
        isFictional: l.isFictional,
        evidence: evidence
          .filter((e) => e.literatureId === l.id)
          .map((e) => ({ code: e.code, content: e.content, page: e.page, status: e.status })),
      })),
    advisorCheckItems: (meeting?.checkItems ?? []).filter((x) => x.trim()),
    advisorQuestions: (meeting?.questions ?? []).filter((x) => x.trim()),
  };
}

/** 문단별 비교용 텍스트 */
export function snapshotSections(s: ProposalSnapshot): Record<string, string> {
  const subjectLines = [
    s.subject.population && `대상: ${s.subject.population}`,
    s.subject.definition && `정의: ${s.subject.definition}`,
    s.subject.recruitmentCriteria && `모집 기준: ${s.subject.recruitmentCriteria}`,
    s.subject.exclusionCriteria && `제외 기준: ${s.subject.exclusionCriteria}`,
    s.subject.samplePlan && `표집 계획: ${s.subject.samplePlan}`,
  ].filter(Boolean);
  return {
    '1. 연구 제목': s.title,
    '2. 연구 배경': s.background,
    '3. 연구 목적': s.purpose,
    '4. 연구 질문': s.researchQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    '5. 연구 대상': subjectLines.join('\n'),
    '6. 연구변수': s.variables
      .map(
        (v) =>
          `${v.code} ${v.name} (${VARIABLE_ROLE_LABEL[v.role]}) — 개념적 정의: ${v.conceptualDefinition || EMPTY} / 조작적 정의: ${v.operationalDefinition || EMPTY}`,
      )
      .join('\n'),
    '7. 연구모형': s.modelPaths
      .map((p) => `${p.from} → ${p.to}${p.label ? ` [${p.label}]` : ''}${p.note ? ` (${p.note})` : ''}`)
      .join('\n'),
    '8. 연구가설': s.hypotheses
      .map((h) => `${h.code} (${HYPOTHESIS_KIND_LABEL[h.kind]}) ${h.statement}`)
      .join('\n'),
    '9. 핵심 선행연구': s.keyLiterature
      .map((l) => `${l.code} ${l.authors} (${l.year || '연도 미상'}). ${l.title} — ${l.keyFindings || EMPTY}`)
      .join('\n'),
    '10. 지도교수 확인 필요 사항': [...s.advisorCheckItems, ...s.advisorQuestions.map((q) => `질문: ${q}`)].join(
      '\n',
    ),
  };
}

export function diffSnapshots(prev: ProposalSnapshot | null, next: ProposalSnapshot): VersionDiffEntry[] {
  if (!prev) return [];
  const a = snapshotSections(prev);
  const b = snapshotSections(next);
  const out: VersionDiffEntry[] = [];
  for (const section of Object.keys(b)) {
    if ((a[section] ?? '') !== b[section]) out.push({ section, before: a[section] ?? '', after: b[section] });
  }
  return out;
}

export function snapshotsEqual(a: ProposalSnapshot, b: ProposalSnapshot): boolean {
  return JSON.stringify(snapshotSections(a)) === JSON.stringify(snapshotSections(b));
}
