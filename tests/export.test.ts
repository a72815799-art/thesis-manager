import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../src/db/repo';
import { exportBackup } from '../src/db/backup';
import { buildSnapshot, EMPTY } from '../src/domain/proposal';
import { proposalDocxBuffer } from '../src/export/docx';
import { buildEvidenceRows, EVIDENCE_COLUMNS, evidenceXlsxBuffer } from '../src/export/xlsx';
import { seedDemo } from '../src/demo/demo';
import { resetDb } from './helpers';

beforeEach(resetDb);
const OUT = 'docs/samples';
mkdirSync(OUT, { recursive: true });

async function docText(buf: Uint8Array) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const header = await zip.file('word/header1.xml')!.async('string');
  const text = (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('\n');
  const styles = await zip.file('word/styles.xml')!.async('string');
  return { xml, text, header, styles };
}
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

describe('DOCX 연구계획서', () => {
  it('10개 항목·표·한글·가상 예시 표시가 실제 파일에 들어 있다', async () => {
    const pid = await seedDemo();
    const b = await repo.loadBundle(pid);
    const v = b.proposalVersions[0];
    const buf = await proposalDocxBuffer(v.snapshot, { versionNo: v.versionNo, createdAt: v.createdAt, status: v.status, reason: v.reason });
    writeFileSync(`${OUT}/예시_연구계획서_v1.docx`, buf);
    const { xml, text, header, styles } = await docText(buf);
    for (const hd of ['1. 연구 제목', '2. 연구 배경', '3. 연구 목적', '4. 연구 질문', '5. 연구 대상', '6. 연구변수', '7. 연구모형', '8. 연구가설', '9. 핵심 선행연구', '10. 지도교수 확인 필요 사항'])
      expect(text).toContain(hd);
    expect(text).toContain(b.project.title);
    expect(text).toContain('가상 예시 데이터');
    expect(header).toContain('가상 예시 데이터');
    expect(text).toContain('[가상 예시 문헌]');
    expect(text).toContain('지각된 차별 → 회복탄력성');
    expect(text).toContain('회복탄력성 → 외상 후 성장');
    expect(text).toContain('지각된 차별 → 외상 후 성장');
    expect(text).toContain('한부모가족 대학생');
    for (const h of b.hypotheses) expect(text).toContain(h.statement);
    for (const x of b.variables) expect(text).toContain(x.name);
    // 조작적 정의가 비어 있으므로 지어내지 않고 '작성 필요'
    expect(text).toContain(EMPTY);
    // 핵심 문헌만 포함 (L3 는 핵심 아님)
    expect(text).toContain('가상 예시 문헌 A');
    expect(text).not.toContain('가상 예시 문헌 C');
    expect((xml.match(/<w:tbl>/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(styles).toContain('맑은 고딕');
  });

  it('빈 프로젝트는 내용을 만들어 채우지 않고 "작성 필요"로 표시한다', async () => {
    const p = await repo.createProject({ title: '빈 연구' });
    const snap = buildSnapshot(await repo.loadBundle(p.id));
    const buf = await proposalDocxBuffer(snap, { versionNo: 1, createdAt: new Date().toISOString(), status: 'draft', reason: '' });
    writeFileSync(`${OUT}/예시_빈프로젝트_계획서.docx`, buf);
    const { text } = await docText(buf);
    expect(text.split('\n').filter((l) => l === EMPTY).length).toBe(9); // 제목 외 9개 항목
    expect(text).not.toContain('가상 예시');
  });

  it('긴 한국어·특수문자가 손상 없이 들어간다', async () => {
    const pid = await seedDemo();
    const long = '긴 배경 문장 <꺾쇠> & "따옴표" \'작은따옴표\' 100% ㉠ ①②③ 한자 漢字 '.repeat(120).trim();
    await repo.updateProject(pid, { background: long });
    const snap = buildSnapshot(await repo.loadBundle(pid));
    const { text } = await docText(await proposalDocxBuffer(snap, { versionNo: 2, createdAt: new Date().toISOString(), status: 'draft', reason: '' }));
    expect(unescape(text)).toContain(long);
  });
});

describe('XLSX 근거 비교표', () => {
  it('열 구성·한글·가설-근거-문헌 연결이 실제 파일에서 정확하다', async () => {
    const pid = await seedDemo();
    let b = await repo.loadBundle(pid);
    await repo.applyChangeRequest(b.changeRequests[0].id);
    const special = '=SUM(A1) 특수문자 <>&"\' 줄\n바꿈 ①';
    await repo.saveEvidence(pid, { literatureId: b.literature[0].id, content: special, page: 'pp. 3–4', kind: 'quote', variableIds: [], hypothesisIds: [b.hypotheses[0].id], notes: '메모@' });
    b = await repo.loadBundle(pid);
    const buf = await evidenceXlsxBuffer(b);
    writeFileSync(`${OUT}/예시_근거비교표.xlsx`, new Uint8Array(buf));
    writeFileSync(`${OUT}/예시_백업.json`, JSON.stringify(await exportBackup(pid), null, 1));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('근거 비교표')!;
    expect(String(ws.getCell(1, 1).value)).toContain('가상 예시 데이터');
    const header = (ws.getRow(2).values as unknown[]).slice(1);
    expect(header).toEqual([...EVIDENCE_COLUMNS]);
    const rows: string[][] = [];
    ws.eachRow((r, n) => {
      if (n > 2) rows.push(Array.from({ length: 13 }, (_, i) => String(r.getCell(i + 1).value ?? '')));
    });
    const expected = buildEvidenceRows(b);
    expect(rows).toHaveLength(expected.length);
    // 파일의 각 행이 저장소의 실제 연결과 일치하는지 대조
    for (const r of rows) {
      const [hCode, hText, lCode, title, authors, year, eCode, content, , page, status, recheck] = r;
      if (!eCode) continue;
      const e = b.evidence.find((x) => x.code === eCode)!;
      const l = b.literature.find((x) => x.id === e.literatureId)!;
      expect(lCode).toBe(l.code);
      expect(title).toContain(l.title);
      expect(authors).toBe(l.authors);
      expect(year).toBe(l.year);
      expect(content).toBe(e.content);
      expect(page).toBe(e.page);
      expect(recheck).toBe(e.status === 'recheck' ? '예' : '아니오');
      expect(status).toBe({ unverified: '미확인', checking: '확인 중', verified: '사용자 확인 완료', recheck: '재검토 필요' }[e.status]);
      if (hCode) {
        const h = b.hypotheses.find((x) => x.code === hCode)!;
        expect(hText).toBe(h.statement);
        expect(e.hypothesisIds).toContain(h.id);
      } else expect(e.hypothesisIds).toHaveLength(0);
    }
    // E2 는 H3, H4 두 가설에 연결 → 두 행
    expect(rows.filter((r) => r[6] === 'E2').map((r) => r[0])).toEqual(['H3', 'H4']);
    expect(rows.filter((r) => r[11] === '예').map((r) => r[6]).sort()).toEqual(['E1', 'E2', 'E2']);
    // 수식처럼 보이는 문자열도 문자열로 저장
    const sp = rows.find((r) => r[7] === special)!;
    expect(sp).toBeTruthy();
    ws.eachRow((r) => r.eachCell((c) => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)));
    expect(wb.getWorksheet('문헌 목록')!.rowCount).toBe(b.literature.length + 1);
    expect(wb.getWorksheet('안내')).toBeTruthy();
  });

  it('근거가 없는 가설도 행으로 남고, 빈 프로젝트도 파일이 만들어진다', async () => {
    const p = await repo.createProject({ title: '빈 연구' });
    const v1 = await repo.saveVariable(p.id, { name: 'A', role: 'independent', conceptualDefinition: '', operationalDefinition: '', notes: '' });
    const v2 = await repo.saveVariable(p.id, { name: 'B', role: 'dependent', conceptualDefinition: '', operationalDefinition: '', notes: '' });
    await repo.saveHypothesis(p.id, { statement: 'A는 B에 영향을 준다', kind: 'direct', fromVariableId: v1.id, toVariableId: v2.id, viaVariableId: null, extraVariableIds: [], notes: '' });
    const b = await repo.loadBundle(p.id);
    const rows = buildEvidenceRows(b);
    expect(rows).toHaveLength(1);
    expect(rows[0].memo).toBe('연결된 근거 없음');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await evidenceXlsxBuffer(b));
    expect(String(wb.getWorksheet('근거 비교표')!.getCell(1, 1).value)).toBe('가설 ID');
  });
});
