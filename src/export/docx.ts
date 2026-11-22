import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { EMPTY } from '../domain/proposal';
import {
  EVIDENCE_STATUS_LABEL,
  HYPOTHESIS_KIND_LABEL,
  ProposalSnapshot,
  VARIABLE_ROLE_LABEL,
  VERSION_STATUS_LABEL,
  VersionStatus,
} from '../domain/types';

export interface ProposalDocMeta {
  versionNo: number;
  createdAt: string;
  status: VersionStatus;
  reason: string;
  /** 연구모형 그림(PNG). 없으면 경로 표만 넣는다. */
  modelImage?: { data: Uint8Array; width: number; height: number };
}

export const DEMO_NOTICE = '※ 가상 예시 데이터 — 이 문서의 연구 내용과 문헌은 기능 시연을 위해 만든 가상의 예시이며 실제 연구·실제 논문이 아닙니다.';

const FONT = { ascii: 'Malgun Gothic', hAnsi: 'Malgun Gothic', eastAsia: '맑은 고딕', cs: 'Malgun Gothic' };
const border = { style: BorderStyle.SINGLE, size: 4, color: '9AA3AF' };
const borders = { top: border, bottom: border, left: border, right: border };

function p(text: string, opts: { bold?: boolean; color?: string; italics?: boolean; size?: number } = {}) {
  // 줄바꿈이 있는 긴 본문은 문단으로 나눈다
  return text.split(/\n+/).map(
    (line) =>
      new Paragraph({
        spacing: { after: 100, line: 340 },
        children: [new TextRun({ text: line, ...opts })],
      }),
  );
}

function todo() {
  return [
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: EMPTY, color: 'B45309', bold: true })],
    }),
  ];
}

function body(text: string) {
  return text.trim() ? p(text.trim()) : todo();
}

function h(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text })] });
}

function cell(text: string, width: number, header = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: header ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined,
    children: (text || '').split(/\n+/).map(
      (line) => new Paragraph({ children: [new TextRun({ text: line || (header ? '' : '—'), bold: header, size: 19 })] }),
    ),
  });
}

function table(headers: string[], widths: number[], rows: string[][]) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((t, i) => cell(t, widths[i], true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, widths[i])) })),
    ],
  });
}

function numbered(items: string[]) {
  return items.map(
    (t, i) => new Paragraph({ spacing: { after: 80, line: 340 }, indent: { left: 360, hanging: 360 }, children: [new TextRun(`${i + 1}. ${t}`)] }),
  );
}

export function buildProposalDocument(s: ProposalSnapshot, meta: ProposalDocMeta): Document {
  const W = 9026; // A4, 여백 1인치 기준 본문 폭(DXA)
  const children: (Paragraph | Table)[] = [];
  const date = meta.createdAt.slice(0, 10);

  if (s.isDemo) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        shading: { type: ShadingType.CLEAR, fill: 'FEF3C7', color: 'auto' },
        children: [new TextRun({ text: DEMO_NOTICE, bold: true, color: '92400E', size: 19 })],
      }),
    );
  }
  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: '연구계획서', size: 22, color: '475569' })] }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: s.title.trim() || EMPTY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `버전 v${meta.versionNo} · ${VERSION_STATUS_LABEL[meta.status]} · 작성일 ${date}${meta.reason ? ` · 사유: ${meta.reason}` : ''}`,
          size: 18,
          color: '64748B',
        }),
      ],
    }),
  );

  children.push(h('1. 연구 제목'), ...body(s.title));
  children.push(h('2. 연구 배경'), ...body(s.background));
  children.push(h('3. 연구 목적'), ...body(s.purpose));
  children.push(h('4. 연구 질문'), ...(s.researchQuestions.length ? numbered(s.researchQuestions) : todo()));

  children.push(h('5. 연구 대상'));
  const subj = s.subject;
  if (!Object.values(subj).some((v) => v.trim())) children.push(...todo());
  else
    children.push(
      table(
        ['항목', '내용'],
        [2200, W - 2200],
        [
          ['연구 대상', subj.population || EMPTY],
          ['대상 정의', subj.definition || EMPTY],
          ['모집 기준', subj.recruitmentCriteria || EMPTY],
          ['제외 기준', subj.exclusionCriteria || EMPTY],
          ['표집 계획', subj.samplePlan || EMPTY],
        ],
      ),
    );

  children.push(h('6. 연구변수'));
  if (!s.variables.length) children.push(...todo());
  else
    children.push(
      table(
        ['ID', '변수명', '역할', '개념적 정의', '조작적 정의'],
        [700, 1600, 1100, 2813, 2813],
        s.variables.map((v) => [v.code, v.name, VARIABLE_ROLE_LABEL[v.role], v.conceptualDefinition || EMPTY, v.operationalDefinition || EMPTY]),
      ),
    );

  children.push(h('7. 연구모형'));
  if (!s.modelPaths.length) children.push(...todo());
  else {
    if (meta.modelImage) {
      const maxW = 560;
      const scale = Math.min(1, maxW / meta.modelImage.width);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [
            new ImageRun({
              type: 'png',
              data: meta.modelImage.data,
              transformation: { width: Math.round(meta.modelImage.width * scale), height: Math.round(meta.modelImage.height * scale) },
              altText: { title: '연구모형', description: '연구모형 경로도', name: '연구모형' },
            }),
          ],
        }),
      );
    }
    children.push(
      table(
        ['경로', '관련 가설', '비고'],
        [4800, 1900, W - 6700],
        s.modelPaths.map((m) => [`${m.from} → ${m.to}`, m.label || '(개별 가설 없음)', m.note]),
      ),
    );
  }

  children.push(h('8. 연구가설'));
  if (!s.hypotheses.length) children.push(...todo());
  else
    children.push(
      table(
        ['ID', '유형', '연구가설', '관련 변수'],
        [700, 1200, 4826, 2300],
        s.hypotheses.map((x) => [x.code, HYPOTHESIS_KIND_LABEL[x.kind], x.statement, x.variables.join(', ')]),
      ),
    );

  children.push(h('9. 핵심 선행연구'));
  if (!s.keyLiterature.length) children.push(...todo());
  else {
    for (const l of s.keyLiterature) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({ text: `${l.code}. `, bold: true }),
            ...(l.isFictional ? [new TextRun({ text: '[가상 예시 문헌] ', bold: true, color: '92400E' })] : []),
            new TextRun({ text: `${l.authors || '저자 미입력'} (${l.year || '연도 미입력'}). ${l.title}${l.source ? `. ${l.source}` : ''}`, bold: true }),
          ],
        }),
        ...p(`핵심 결과: ${l.keyFindings.trim() || EMPTY}`),
      );
      if (l.evidence.length)
        children.push(
          table(
            ['근거 ID', '근거 내용', '페이지', '확인 상태'],
            [900, 5326, 1000, 1800],
            l.evidence.map((e) => [e.code, e.content, e.page, EVIDENCE_STATUS_LABEL[e.status]]),
          ),
        );
    }
  }

  children.push(h('10. 지도교수 확인 필요 사항'));
  if (!s.advisorCheckItems.length && !s.advisorQuestions.length) children.push(...todo());
  else {
    if (s.advisorCheckItems.length) children.push(...p('확인이 필요한 사항', { bold: true }), ...numbered(s.advisorCheckItems));
    if (s.advisorQuestions.length) children.push(...p('지도교수께 드릴 질문', { bold: true }), ...numbered(s.advisorQuestions));
  }

  return new Document({
    creator: '논문 연구관리',
    title: s.title || '연구계획서',
    styles: {
      default: {
        document: { run: { font: FONT, size: 21 } },
        title: { run: { font: FONT, size: 34, bold: true }, paragraph: { spacing: { after: 160 } } },
        heading2: { run: { font: FONT, size: 25, bold: true, color: '1E3A5F' } },
      },
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.isDemo ? '가상 예시 데이터 · ' : ''}연구계획서 v${meta.versionNo}`, size: 16, color: s.isDemo ? '92400E' : '94A3B8' })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8' })] })],
          }),
        },
        children,
      },
    ],
  });
}

export async function proposalDocxBlob(s: ProposalSnapshot, meta: ProposalDocMeta): Promise<Blob> {
  return Packer.toBlob(buildProposalDocument(s, meta));
}

export async function proposalDocxBuffer(s: ProposalSnapshot, meta: ProposalDocMeta): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(buildProposalDocument(s, meta)));
}
