import { db } from '../db/db';
import {
  createChangeRequest,
  createProject,
  createProposalVersion,
  getSubject,
  saveEvidence,
  saveFeedback,
  saveHypothesis,
  saveLiterature,
  saveMeeting,
  saveVariable,
  updateSubject,
} from '../db/repo';
import { newId } from '../db/db';

export const DEMO_TITLE = '한부모가족 대학생의 지각된 차별과 외상 후 성장의 관계에서 회복탄력성의 매개효과';

/**
 * 재현 가능한 가상 데모 프로젝트를 만든다.
 * 모든 문헌은 실재하지 않는 가상 예시이며 DOI·학술지명 등 실제처럼 보이는 서지정보를 넣지 않는다.
 */
export async function seedDemo(): Promise<string> {
  const existing = (await db.projects.toArray()).find((p) => p.isDemo && p.title === DEMO_TITLE);
  if (existing) return existing.id;

  const project = await createProject(
    {
      title: DEMO_TITLE,
      purpose:
        '한부모가족 대학생이 지각한 차별이 외상 후 성장에 미치는 영향을 확인하고, 그 관계에서 회복탄력성이 매개 역할을 하는지 검증한다. (가상 예시)',
      background:
        '한부모가족 대학생은 가족 형태에 대한 사회적 편견을 경험할 수 있으며, 이러한 경험이 심리적 적응에 어떤 영향을 주는지 이해할 필요가 있다. 이 문단은 기능 시연을 위한 가상 예시 문장이며 실제 선행연구 요약이 아니다.',
      method: '자기보고식 온라인 설문조사 후 매개효과 분석(부트스트래핑)을 실시할 계획이다. (가상 예시)',
      researchType: '설문 기반 양적 연구',
      stage: 'proposal',
      researchQuestions: [
        '한부모가족 대학생의 지각된 차별은 외상 후 성장과 어떤 관계가 있는가?',
        '회복탄력성은 지각된 차별과 외상 후 성장의 관계를 매개하는가?',
      ],
      milestones: [
        { id: newId(), label: '연구계획서 초안 지도교수 면담', date: '', done: true },
        { id: newId(), label: '연구계획서 수정본 제출', date: '', done: false },
      ],
      notes: '가상 예시 프로젝트입니다. 자유롭게 수정·삭제해 보세요.',
    },
    true,
  );
  const pid = project.id;

  await updateSubject(pid, {
    population: '한부모가족 대학생',
    definition: '부 또는 모 한 명과 함께 성장했거나 현재 한부모가족에 속한 4년제 대학 재학생 (가상 예시)',
    recruitmentCriteria: '만 18세 이상, 한부모가족 대학생으로서 연구 참여에 동의한 사람 (가상 예시)',
    exclusionCriteria: '휴학 중인 학생 (가상 예시)',
    samplePlan: '온라인 편의표집 (가상 예시)',
  });
  const subject = await getSubject(pid);

  const iv = await saveVariable(pid, {
    name: '지각된 차별',
    role: 'independent',
    conceptualDefinition: '가족 형태로 인해 부당한 대우를 받았다고 개인이 주관적으로 인식하는 정도 (가상 예시 정의)',
    operationalDefinition: '',
    notes: '',
  });
  const me = await saveVariable(pid, {
    name: '회복탄력성',
    role: 'mediator',
    conceptualDefinition: '역경을 겪은 뒤 다시 적응해 나가는 개인의 심리적 능력 (가상 예시 정의)',
    operationalDefinition: '',
    notes: '',
  });
  const dv = await saveVariable(pid, {
    name: '외상 후 성장',
    role: 'dependent',
    conceptualDefinition: '힘든 사건과 씨름한 결과로 경험하는 긍정적인 심리적 변화 (가상 예시 정의)',
    operationalDefinition: '',
    notes: '',
  });

  const base = { extraVariableIds: [], notes: '' };
  const h1 = await saveHypothesis(pid, {
    ...base,
    statement: '한부모가족 대학생의 지각된 차별은 외상 후 성장에 유의한 영향을 미칠 것이다.',
    kind: 'direct',
    fromVariableId: iv.id,
    toVariableId: dv.id,
    viaVariableId: null,
  });
  const h2 = await saveHypothesis(pid, {
    ...base,
    statement: '지각된 차별은 회복탄력성에 부적 영향을 미칠 것이다.',
    kind: 'direct',
    fromVariableId: iv.id,
    toVariableId: me.id,
    viaVariableId: null,
  });
  const h3 = await saveHypothesis(pid, {
    ...base,
    statement: '회복탄력성은 외상 후 성장에 정적 영향을 미칠 것이다.',
    kind: 'direct',
    fromVariableId: me.id,
    toVariableId: dv.id,
    viaVariableId: null,
  });
  const h4 = await saveHypothesis(pid, {
    ...base,
    statement: '회복탄력성은 지각된 차별과 외상 후 성장의 관계를 매개할 것이다.',
    kind: 'mediation',
    fromVariableId: iv.id,
    toVariableId: dv.id,
    viaVariableId: me.id,
  });

  const litBase = {
    year: '',
    sourceType: 'other' as const,
    source: '가상 예시 문헌 (실재하지 않음)',
    doi: '',
    url: '',
    notes: '기능 시연용 가상 문헌입니다.',
    isFictional: true,
  };
  const l1 = await saveLiterature(pid, {
    ...litBase,
    title: '(가상 예시 문헌 A) 대학생의 지각된 차별과 회복탄력성의 관계',
    authors: '가상저자 가, 가상저자 나',
    sample: '대학생 (가상)',
    method: '설문조사 (가상)',
    keyFindings: '지각된 차별이 높을수록 회복탄력성이 낮았다는 가상의 결과',
    variableIds: [iv.id, me.id],
    isKey: true,
  });
  const l2 = await saveLiterature(pid, {
    ...litBase,
    title: '(가상 예시 문헌 B) 회복탄력성과 외상 후 성장: 청년을 대상으로',
    authors: '가상저자 다',
    sample: '한부모가족 대학생 (가상)',
    method: '설문조사 (가상)',
    keyFindings: '회복탄력성이 높을수록 외상 후 성장이 높았다는 가상의 결과',
    variableIds: [me.id, dv.id],
    isKey: true,
  });
  const l3 = await saveLiterature(pid, {
    ...litBase,
    title: '(가상 예시 문헌 C) 차별 경험과 외상 후 성장의 관계에서 심리적 자원의 매개효과',
    authors: '가상저자 라, 가상저자 마',
    sample: '성인 (가상)',
    method: '설문조사, 매개분석 (가상)',
    keyFindings: '심리적 자원이 차별 경험과 외상 후 성장의 관계를 매개했다는 가상의 결과',
    variableIds: [iv.id, dv.id],
    isKey: false,
  });

  await saveEvidence(pid, {
    literatureId: l1.id,
    content: '지각된 차별과 회복탄력성 사이에 부적 상관이 보고되었다는 가상의 근거 문장',
    page: '12',
    kind: 'summary',
    variableIds: [iv.id, me.id],
    hypothesisIds: [h2.id],
    notes: '가상 예시',
    status: 'verified',
  });
  await saveEvidence(pid, {
    literatureId: l2.id,
    content: '회복탄력성이 외상 후 성장을 정적으로 예측했다는 가상의 근거 문장',
    page: '8',
    kind: 'summary',
    variableIds: [me.id, dv.id],
    hypothesisIds: [h3.id, h4.id],
    notes: '가상 예시',
    status: 'verified',
  });
  await saveEvidence(pid, {
    literatureId: l3.id,
    content: '차별 경험이 외상 후 성장과 관련된다는 가상의 근거 문장',
    page: '5',
    kind: 'summary',
    variableIds: [iv.id, dv.id],
    hypothesisIds: [h1.id],
    notes: '가상 예시 · 원문 확인 전 상태 예시',
    status: 'unverified',
  });
  await saveEvidence(pid, {
    literatureId: l3.id,
    content: '심리적 자원의 매개효과가 유의했다는 가상의 근거 문장',
    page: '14',
    kind: 'summary',
    variableIds: [me.id],
    hypothesisIds: [h4.id],
    notes: '가상 예시',
    status: 'checking',
  });
  await saveEvidence(pid, {
    literatureId: l1.id,
    content: '연구의 제한점으로 표본의 대표성을 언급했다는 가상의 메모 (어느 가설에도 연결하지 않은 예시)',
    page: '20',
    kind: 'summary',
    variableIds: [],
    hypothesisIds: [],
    notes: '가상 예시',
    status: 'verified',
  });

  await saveMeeting(pid, {
    plannedDate: '',
    title: '연구계획서 초안 면담 (가상 예시)',
    checkItems: ['연구 대상을 대학생으로 한정하는 것이 적절한지', '매개모형에서 직접효과 가설(H1)을 유지할지'],
    questions: ['표본 크기는 어느 정도가 적절할까요?'],
    notes: '',
  });

  await createProposalVersion(pid, { reason: '최초 작성 (가상 예시)' });

  const fb = await saveFeedback(pid, {
    meetingDate: '2025-01-15',
    professorComment:
      '(가상 예시) 연구 대상을 대학생으로 한정하면 모집이 어려울 수 있으니, 한부모가족 경험이 있는 성인으로 넓히는 것을 검토해 보세요.',
    targets: [{ type: 'subject', id: subject.id }],
    interpretation: '모집 가능성 때문에 대상을 넓히라는 의견으로 이해함. 선행연구 근거가 성인에게도 적용되는지 확인 필요.',
    decision: 'pending',
    decisionNote: '',
    beforeText: '',
    afterText: '',
    status: 'open',
  });
  await createChangeRequest(pid, {
    target: { type: 'subject', id: subject.id, field: 'population' },
    newValue: '한부모가족 경험이 있는 성인',
    reason: '지도교수 제안: 모집 가능성을 높이기 위해 연구 대상 확대 (가상 예시)',
    feedbackId: fb.id,
  });
  return pid;
}
