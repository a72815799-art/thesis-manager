import ExcelJS from 'exceljs';
import { EVIDENCE_KIND_LABEL, EVIDENCE_STATUS_LABEL, Evidence, ProjectBundle, SOURCE_TYPE_LABEL } from '../domain/types';

export const EVIDENCE_COLUMNS = [
  '가설 ID',
  '연구가설',
  '문헌 ID',
  '논문 제목',
  '저자',
  '출판연도',
  '근거 ID',
  '근거 내용',
  '구분',
  '페이지',
  '확인 상태',
  '재검토 필요 여부',
  '메모',
] as const;

export interface EvidenceRow {
  hypothesisCode: string;
  hypothesis: string;
  literatureCode: string;
  title: string;
  authors: string;
  year: string;
  evidenceCode: string;
  content: string;
  kind: string;
  page: string;
  status: string;
  recheck: string;
  memo: string;
}

/**
 * 근거 비교표의 행을 만든다.
 * - 가설–근거 연결 1건이 1행 (한 근거가 여러 가설에 연결되면 여러 행)
 * - 근거가 없는 가설도 1행으로 남겨 빈틈이 보이게 한다
 * - 어떤 가설에도 연결되지 않은 근거는 맨 아래에 모은다
 */
export function buildEvidenceRows(b: ProjectBundle): EvidenceRow[] {
  const lit = new Map(b.literature.map((l) => [l.id, l]));
  const rows: EvidenceRow[] = [];
  const row = (hCode: string, hText: string, e: Evidence | null): EvidenceRow => {
    const l = e ? lit.get(e.literatureId) : undefined;
    return {
      hypothesisCode: hCode,
      hypothesis: hText,
      literatureCode: l?.code ?? '',
      title: l ? `${l.isFictional ? '[가상 예시] ' : ''}${l.title}` : '',
      authors: l?.authors ?? '',
      year: l?.year ?? '',
      evidenceCode: e?.code ?? '',
      content: e?.content ?? '',
      kind: e ? EVIDENCE_KIND_LABEL[e.kind] : '',
      page: e?.page ?? '',
      status: e ? EVIDENCE_STATUS_LABEL[e.status] : '',
      recheck: e ? (e.status === 'recheck' ? '예' : '아니오') : '',
      memo: e ? [e.recheckReason && `재검토 사유: ${e.recheckReason}`, e.notes].filter(Boolean).join(' / ') : '연결된 근거 없음',
    };
  };
  for (const h of b.hypotheses) {
    const linked = b.evidence.filter((e) => e.hypothesisIds.includes(h.id));
    if (!linked.length) rows.push(row(h.code, h.statement, null));
    for (const e of linked) rows.push(row(h.code, h.statement, e));
  }
  for (const e of b.evidence.filter((x) => x.hypothesisIds.length === 0)) rows.push(row('', '(가설 미연결)', e));
  return rows;
}

export async function buildEvidenceWorkbook(b: ProjectBundle): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '논문 연구관리';
  wb.created = new Date();
  const demo = b.project.isDemo;

  const ws = wb.addWorksheet('근거 비교표', { views: [{ state: 'frozen', ySplit: demo ? 2 : 1 }] });
  const widths = [9, 44, 9, 40, 18, 10, 9, 60, 12, 10, 16, 14, 36];
  ws.columns = widths.map((width) => ({ width }));
  if (demo) {
    const r = ws.addRow(['※ 가상 예시 데이터 — 기능 시연용으로 만든 가상의 연구·문헌이며 실제 논문이 아닙니다.']);
    ws.mergeCells(1, 1, 1, EVIDENCE_COLUMNS.length);
    r.font = { bold: true, color: { argb: 'FF92400E' } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  }
  const header = ws.addRow([...EVIDENCE_COLUMNS]);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
  });
  for (const r of buildEvidenceRows(b)) {
    const added = ws.addRow([
      r.hypothesisCode,
      r.hypothesis,
      r.literatureCode,
      r.title,
      r.authors,
      r.year,
      r.evidenceCode,
      r.content,
      r.kind,
      r.page,
      r.status,
      r.recheck,
      r.memo,
    ]);
    added.alignment = { vertical: 'top', wrapText: true };
    // 수식으로 해석될 수 있는 문자열도 항상 텍스트로 저장
    added.eachCell((c) => {
      if (typeof c.value === 'string') c.numFmt = '@';
    });
    if (r.recheck === '예') added.getCell(12).font = { bold: true, color: { argb: 'FFB91C1C' } };
  }
  ws.autoFilter = { from: { row: demo ? 2 : 1, column: 1 }, to: { row: demo ? 2 : 1, column: EVIDENCE_COLUMNS.length } };

  const ls = wb.addWorksheet('문헌 목록', { views: [{ state: 'frozen', ySplit: 1 }] });
  ls.columns = [9, 44, 20, 10, 14, 30, 24, 30, 28, 28, 44, 10, 10].map((width) => ({ width }));
  const lh = ls.addRow(['문헌 ID', '논문 제목', '저자', '출판연도', '유형', '학술지/학위논문 정보', 'DOI', 'URL', '연구 대상', '연구 방법', '핵심 결과', '핵심 문헌', '근거 수']);
  lh.font = { bold: true };
  lh.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }));
  for (const l of b.literature) {
    const r = ls.addRow([
      l.code,
      `${l.isFictional ? '[가상 예시] ' : ''}${l.title}`,
      l.authors,
      l.year,
      SOURCE_TYPE_LABEL[l.sourceType],
      l.source,
      l.doi,
      l.url,
      l.sample,
      l.method,
      l.keyFindings,
      l.isKey ? '예' : '',
      b.evidence.filter((e) => e.literatureId === l.id).length,
    ]);
    r.alignment = { vertical: 'top', wrapText: true };
  }

  const info = wb.addWorksheet('안내');
  info.columns = [{ width: 22 }, { width: 90 }];
  info.addRows([
    ['프로젝트', b.project.title],
    ['내보낸 시각', new Date().toISOString()],
    ['데이터 구분', demo ? '가상 예시 데이터 (실제 연구·문헌 아님)' : '사용자 입력 데이터'],
    ['확인 상태 안내', '확인 상태는 사용자가 직접 표시한 값입니다. 프로그램은 논문 원문을 확인하지 않습니다.'],
    ['재검토 필요', '연구 내용 변경이 적용되어 다시 확인해야 하는 근거입니다.'],
  ]);
  info.getColumn(1).font = { bold: true };
  return wb;
}

export async function evidenceXlsxBuffer(b: ProjectBundle): Promise<ArrayBuffer> {
  const wb = await buildEvidenceWorkbook(b);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
