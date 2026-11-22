import {
  CHANGEABLE_FIELDS,
  ChangeTarget,
  EntityRef,
  ID,
  ProjectBundle,
  VARIABLE_ROLE_LABEL,
  hypothesisVariableIds,
} from './types';

/**
 * 변경 영향 분석.
 *
 * 원칙: "모든 항목에 일괄 경고"가 아니라 실제 연결 관계(id 참조)와
 * 본문에 기존 표현이 실제로 들어 있는지를 근거로 영향 항목을 고른다.
 * 순수 함수이며 저장소를 변경하지 않는다.
 */

export interface ImpactItem {
  target: EntityRef;
  targetLabel: string;
  /** 영향받는 이유(어떤 연결 관계 때문인지) */
  reason: string;
  /** 해당 항목의 현재 내용 */
  currentValue: string;
  needsReview: boolean;
  /** 변경 대상 그 자체인지 */
  direct: boolean;
}

export const PROPOSAL_SECTIONS: Record<string, string> = {
  title: '1. 연구 제목',
  background: '2. 연구 배경',
  purpose: '3. 연구 목적',
  questions: '4. 연구 질문',
  subject: '5. 연구 대상',
  variables: '6. 연구변수',
  model: '7. 연구모형',
  hypotheses: '8. 연구가설',
  literature: '9. 핵심 선행연구',
  advisor: '10. 지도교수 확인 필요 사항',
};

function mentions(text: string, term: string): boolean {
  const t = term.trim();
  return t.length >= 2 && text.includes(t);
}

export function describeTarget(bundle: ProjectBundle, target: ChangeTarget): string {
  const fieldLabel = CHANGEABLE_FIELDS[target.type]?.[target.field] ?? target.field;
  if (target.type === 'project') return `연구 개요 · ${fieldLabel}`;
  if (target.type === 'subject') return `연구 대상 · ${fieldLabel}`;
  if (target.type === 'variable') {
    const v = bundle.variables.find((x) => x.id === target.id);
    return `${v ? `${v.code} ${v.name}` : '(삭제된 변수)'} · ${fieldLabel}`;
  }
  const h = bundle.hypotheses.find((x) => x.id === target.id);
  return `${h ? h.code : '(삭제된 가설)'} · ${fieldLabel}`;
}

export function readTargetValue(bundle: ProjectBundle, target: ChangeTarget): string | null {
  if (!(target.field in (CHANGEABLE_FIELDS[target.type] ?? {}))) return null;
  let obj: unknown;
  if (target.type === 'project') obj = bundle.project.id === target.id ? bundle.project : undefined;
  else if (target.type === 'subject') obj = bundle.subject.id === target.id ? bundle.subject : undefined;
  else if (target.type === 'variable') obj = bundle.variables.find((x) => x.id === target.id);
  else obj = bundle.hypotheses.find((x) => x.id === target.id);
  if (!obj) return null;
  const v = (obj as Record<string, unknown>)[target.field];
  return typeof v === 'string' ? v : null;
}

export function analyzeImpact(bundle: ProjectBundle, target: ChangeTarget, oldValue: string): ImpactItem[] {
  const items: ImpactItem[] = [];
  const seen = new Set<string>();
  const add = (
    ref: EntityRef,
    targetLabel: string,
    reason: string,
    currentValue: string,
    needsReview = true,
    direct = false,
  ) => {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ target: ref, targetLabel, reason, currentValue, needsReview, direct });
  };
  const sections = new Set<string>();
  const { project, subject, variables, hypotheses, literature, evidence } = bundle;
  const varName = (id: ID | null) => variables.find((v) => v.id === id)?.name ?? '';
  const fieldLabel = CHANGEABLE_FIELDS[target.type]?.[target.field] ?? target.field;

  // 변경 대상 자체
  add(
    { type: target.type, id: target.id },
    describeTarget(bundle, target),
    '변경 대상 항목입니다.',
    oldValue,
    false,
    true,
  );

  /** 본문에 기존 표현이 실제로 들어 있는 연구 개요 항목 */
  const scanProjectText = (term: string, skipField?: string) => {
    const fields: [string, string, string, string][] = [
      ['title', '연구 제목', project.title, 'title'],
      ['purpose', '연구 목적', project.purpose, 'purpose'],
      ['background', '연구 배경', project.background, 'background'],
      ['method', '연구 방법', project.method, ''],
    ];
    for (const [field, label, text, section] of fields) {
      if (target.type === 'project' && field === skipField) continue;
      if (mentions(text, term)) {
        add(
          { type: 'project', id: `${project.id}#${field}` },
          `연구 개요 · ${label}`,
          `본문에 기존 표현 "${term.trim()}"이(가) 들어 있습니다.`,
          text,
        );
        if (section) sections.add(section);
      }
    }
    project.researchQuestions.forEach((q, i) => {
      if (mentions(q, term)) {
        add(
          { type: 'project', id: `${project.id}#rq${i}` },
          `연구 질문 ${i + 1}`,
          `질문 문장에 기존 표현 "${term.trim()}"이(가) 들어 있습니다.`,
          q,
        );
        sections.add('questions');
      }
    });
  };

  const addEvidenceAndLiterature = (evIds: Set<ID>, why: (evCode: string) => string, litWhy: string) => {
    const litIds = new Set<ID>();
    for (const e of evidence) {
      if (!evIds.has(e.id)) continue;
      add({ type: 'evidence', id: e.id }, `${e.code} 근거`, why(e.code), e.content);
      litIds.add(e.literatureId);
    }
    for (const l of literature) {
      if (!litIds.has(l.id)) continue;
      add(
        { type: 'literature', id: l.id },
        `${l.code} ${l.title}`,
        litWhy + (l.sample ? ` (이 문헌의 연구 대상: ${l.sample})` : ''),
        l.keyFindings,
      );
      if (l.isKey) sections.add('literature');
    }
  };

  if (target.type === 'subject') {
    sections.add('subject');
    // 같은 연구 대상 레코드의 다른 칸
    const others: [string, string, string][] = [
      ['population', '연구 대상', subject.population],
      ['definition', '연구 대상 정의', subject.definition],
      ['recruitmentCriteria', '모집 기준', subject.recruitmentCriteria],
      ['exclusionCriteria', '제외 기준', subject.exclusionCriteria],
      ['samplePlan', '표집 계획', subject.samplePlan],
    ];
    for (const [field, label, text] of others) {
      if (field === target.field) continue;
      if (!text.trim()) continue;
      add(
        { type: 'subject', id: `${subject.id}#${field}` },
        `연구 대상 · ${label}`,
        `${fieldLabel}이(가) 바뀌면 같은 연구 대상 기록의 ${label}도 일치해야 합니다.`,
        text,
      );
    }
    scanProjectText(oldValue);
    // 모든 가설은 이 연구 대상(모집단)을 전제로 검증된다
    const hypIds = new Set<ID>();
    for (const h of hypotheses) {
      hypIds.add(h.id);
      const m = mentions(h.statement, oldValue);
      add(
        { type: 'hypothesis', id: h.id },
        `${h.code} 연구가설`,
        m
          ? `가설 문장에 기존 표현 "${oldValue.trim()}"이(가) 들어 있습니다.`
          : '가설은 연구 대상 집단을 전제로 검증됩니다. 새 대상에서도 성립하는지 확인하세요.',
        h.statement,
        true,
      );
      sections.add('hypotheses');
    }
    // 가설에 연결된 근거만: 새 대상에 적용 가능한지
    const evIds = new Set(evidence.filter((e) => e.hypothesisIds.some((id) => hypIds.has(id))).map((e) => e.id));
    addEvidenceAndLiterature(
      evIds,
      () => '가설에 연결된 근거입니다. 근거가 된 연구의 대상이 새 연구 대상에도 적용 가능한지 확인하세요.',
      '위 근거의 출처 문헌입니다. 문헌의 연구 대상과 새 연구 대상의 차이를 확인하세요.',
    );
    add(
      { type: 'extension', id: 'scales' },
      '측정 척도의 대상 적합성',
      '척도 관리는 후속 확장 영역입니다(현재 앱에 기능 없음). 사용할 척도가 새 연구 대상에게 타당화되었는지 직접 확인하세요.',
      '',
    );
    add(
      { type: 'extension', id: 'ethics' },
      '연구윤리(IRB) 서류의 연구 대상 기재',
      '연구윤리 관리는 후속 확장 영역입니다(현재 앱에 기능 없음). 심의 서류의 모집 대상·기준을 직접 확인하세요.',
      '',
    );
  } else if (target.type === 'variable') {
    const v = variables.find((x) => x.id === target.id);
    sections.add('variables');
    const hyps = hypotheses.filter((h) => hypothesisVariableIds(h).includes(target.id));
    const hypIds = new Set(hyps.map((h) => h.id));
    for (const h of hyps) {
      const m = target.field === 'name' && mentions(h.statement, oldValue);
      add(
        { type: 'hypothesis', id: h.id },
        `${h.code} 연구가설`,
        m
          ? `이 변수를 사용하는 가설이며, 문장에 기존 변수명 "${oldValue.trim()}"이(가) 들어 있습니다.`
          : `이 변수(${v ? VARIABLE_ROLE_LABEL[v.role] : '변수'})를 사용하는 가설입니다.`,
        h.statement,
      );
      sections.add('hypotheses');
      sections.add('model');
    }
    if (target.field === 'name') {
      sections.add('model');
      scanProjectText(oldValue);
    }
    const evIds = new Set(
      evidence
        .filter((e) => e.variableIds.includes(target.id) || e.hypothesisIds.some((id) => hypIds.has(id)))
        .map((e) => e.id),
    );
    addEvidenceAndLiterature(
      evIds,
      () => '이 변수 또는 이 변수를 사용하는 가설에 연결된 근거입니다. 바뀐 내용에서도 근거로 쓸 수 있는지 확인하세요.',
      '위 근거의 출처 문헌입니다.',
    );
    for (const l of literature) {
      if (l.variableIds.includes(target.id)) {
        add(
          { type: 'literature', id: l.id },
          `${l.code} ${l.title}`,
          '이 변수의 관련 문헌으로 등록되어 있습니다.',
          l.keyFindings,
        );
        if (l.isKey) sections.add('literature');
      }
    }
    if (target.field === 'operationalDefinition') {
      add(
        { type: 'extension', id: 'scales' },
        '측정 척도',
        '척도 관리는 후속 확장 영역입니다(현재 앱에 기능 없음). 조작적 정의가 바뀌면 측정 도구도 직접 확인하세요.',
        '',
      );
    }
  } else if (target.type === 'hypothesis') {
    const h = hypotheses.find((x) => x.id === target.id);
    sections.add('hypotheses');
    if (h) {
      for (const vid of hypothesisVariableIds(h)) {
        const v = variables.find((x) => x.id === vid);
        if (v)
          add(
            { type: 'variable', id: v.id },
            `${v.code} ${v.name}`,
            '이 가설에 연결된 변수입니다. 가설 문장이 바뀌어도 변수 연결과 연구모형 경로가 맞는지 확인하세요.',
            `${VARIABLE_ROLE_LABEL[v.role]}`,
            false,
          );
      }
      if (h.kind !== 'other') sections.add('model');
    }
    const evIds = new Set(evidence.filter((e) => e.hypothesisIds.includes(target.id)).map((e) => e.id));
    addEvidenceAndLiterature(
      evIds,
      () => '이 가설에 연결된 근거입니다. 바뀐 가설도 뒷받침하는지 확인하세요.',
      '위 근거의 출처 문헌입니다.',
    );
  } else {
    // 연구 개요 항목
    const sectionOf: Record<string, string> = { title: 'title', purpose: 'purpose', background: 'background' };
    if (sectionOf[target.field]) sections.add(sectionOf[target.field]);
    if (target.field === 'purpose') {
      project.researchQuestions.forEach((q, i) => {
        add(
          { type: 'project', id: `${project.id}#rq${i}` },
          `연구 질문 ${i + 1}`,
          '연구 질문은 연구 목적에서 도출됩니다. 바뀐 목적과 일치하는지 확인하세요.',
          q,
        );
        sections.add('questions');
      });
    }
    if (target.field === 'title') {
      // 제목에 등장하는 변수명과의 일치 여부
      for (const v of variables) {
        if (mentions(oldValue, v.name)) {
          add(
            { type: 'variable', id: v.id },
            `${v.code} ${v.name}`,
            '기존 제목에 이 변수명이 들어 있습니다. 새 제목과 변수 구성이 일치하는지 확인하세요.',
            VARIABLE_ROLE_LABEL[v.role],
            false,
          );
        }
      }
    }
  }

  // 다음 계획서에서 내용이 달라지는 문단 (기존 버전은 바뀌지 않음)
  for (const key of Object.keys(PROPOSAL_SECTIONS)) {
    if (!sections.has(key)) continue;
    add(
      { type: 'proposalSection', id: key },
      `연구계획서 · ${PROPOSAL_SECTIONS[key]}`,
      '이 문단은 위 항목에서 만들어집니다. 기존 버전은 그대로 보존되고, 새 버전을 만들면 이 문단이 달라집니다.',
      '',
    );
  }

  void varName;
  return items;
}

/** 변경 적용 시 '사용자 확인 완료' → '재검토 필요'로 바뀔 근거 id */
export function evidenceToRecheck(bundle: ProjectBundle, items: ImpactItem[]): ID[] {
  const ids = new Set(items.filter((i) => i.target.type === 'evidence' && i.needsReview).map((i) => i.target.id));
  return bundle.evidence.filter((e) => ids.has(e.id) && e.status === 'verified').map((e) => e.id);
}
