// 브라우저 E2E 검증 스크립트 (Playwright + Chromium)
// 실행: npm run build && npm run e2e
// 결과: docs/evidence/e2e-results.json, docs/evidence/screens/*.png, docs/evidence/files/*
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/evidence');
const SHOTS = path.join(OUT, 'screens');
const FILES = path.join(OUT, 'files');
rmSync(SHOTS, { recursive: true, force: true });
rmSync(FILES, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
mkdirSync(FILES, { recursive: true });
const PORT = 4188;
const BASE = `http://localhost:${PORT}/`;

const results = [];
const consoleErrors = [];
let expectErrors = false;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function step(id, name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ id, name, status: 'pass', ms: Date.now() - t, detail: detail ?? '' });
    console.log(`PASS ${id} ${name}`);
  } catch (e) {
    results.push({ id, name, status: 'fail', ms: Date.now() - t, detail: String(e?.message ?? e).slice(0, 600) });
    console.log(`FAIL ${id} ${name}\n     ${String(e?.message ?? e).split('\n')[0]}`);
    try {
      await page.screenshot({ path: path.join(SHOTS, `FAIL-${id}.png`) });
      // 열려 있는 대화상자가 다음 단계를 막지 않도록 정리
      await page.keyboard.press('Escape');
      const cancel = page.getByTestId('confirm-cancel');
      if (await cancel.count()) await cancel.click();
    } catch {}
  }
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

// 한글 파일명이 깨지지 않도록 UTF-8 로캘로 브라우저를 실행 (로캘이 없는 컨테이너 환경 대응)
const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'ko-KR' });
let page = await context.newPage();
page.setDefaultTimeout(8000);
const watch = (p) => {
  p.on('console', (m) => m.type() === 'error' && !expectErrors && consoleErrors.push(m.text()));
  p.on('pageerror', (e) => !expectErrors && consoleErrors.push(`pageerror: ${e.message}`));
};
watch(page);

const tid = (id) => page.getByTestId(id);
const shot = (name, opts = {}) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true, ...opts });
const okToast = async (text) => {
  await page.getByTestId('toast-ok').filter({ hasText: text }).first().waitFor();
};
const errToast = async (text) => {
  const t = page.getByTestId('toast-error').filter({ hasText: text }).first();
  await t.waitFor();
  return t.innerText();
};
const go = async (name) => {
  await tid(`nav-${name}`).click();
  await page.waitForTimeout(150);
};
const download = async (clicker, fileName) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), clicker()]);
  const p = path.join(FILES, fileName);
  await dl.saveAs(p);
  return { path: p, suggested: dl.suggestedFilename() };
};
async function docxText(file) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const xml = await zip.file('word/document.xml').async('string');
  const text = (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('\n');
  return { text, tables: (xml.match(/<w:tbl>/g) ?? []).length, hasImage: Object.keys(zip.files).some((f) => f.startsWith('word/media/')) };
}
const idb = (fn, arg) => page.evaluate(fn, arg);
const countStore = (store) =>
  idb(
    (s) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('thesis-manager');
        r.onsuccess = () => {
          const q = r.result.transaction(s).objectStore(s).count();
          q.onsuccess = () => (r.result.close(), res(q.result));
          q.onerror = () => rej(q.error);
        };
        r.onerror = () => rej(r.error);
      }),
    store,
  );

const TITLE = 'E2E 검증용 연구: 지각된 차별과 외상 후 성장의 관계';
const OLD_SUBJECT = '한부모가족 대학생';
const NEW_SUBJECT = '한부모가족 경험이 있는 성인';
const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
let projectUrl = '';
let backupPath = '';

/* ───────────── 필수 시나리오 1~20 ───────────── */

await page.goto(BASE);

await step('S01', '신규 프로젝트 생성', async () => {
  await tid('new-project').click();
  await tid('project-title').fill(TITLE);
  await tid('project-purpose').fill('지각된 차별이 외상 후 성장에 미치는 영향과 회복탄력성의 매개효과를 검증한다.');
  await tid('project-create').click();
  await page.waitForURL(/\/p\/.+\/overview/);
  projectUrl = page.url().replace(/\/overview$/, '');
  await tid('f-background').fill('E2E 테스트용 배경 문단입니다.');
  await tid('f-method').fill('온라인 설문조사');
  await tid('f-questions').fill('지각된 차별은 외상 후 성장과 관련이 있는가?\n회복탄력성은 그 관계를 매개하는가?');
  await tid('s-population').fill(OLD_SUBJECT);
  await tid('s-definition').fill('한부모가족에 속한 4년제 대학 재학생');
  await tid('s-recruit').fill('만 18세 이상 한부모가족 대학생');
  assert((await tid('dirty-state').innerText()).includes('저장하지 않은'), '저장 전 상태 표시가 없음');
  await tid('overview-save').click();
  await okToast('연구 개요를 저장');
  assert((await tid('dirty-state').innerText()) === '저장됨', '저장 후 상태 표시가 바뀌지 않음');
  await shot('01-overview');
});

await step('S02', '프로젝트 저장 후 재접속', async () => {
  await page.reload();
  await tid('s-population').waitFor();
  assert((await tid('s-population').inputValue()) === OLD_SUBJECT, '재접속 후 연구 대상이 유지되지 않음');
  assert((await tid('f-questions').inputValue()).split('\n').length === 2, '연구 질문이 유지되지 않음');
  // 브라우저 컨텍스트의 새 탭에서도 동일
  const p2 = await context.newPage();
  await p2.goto(BASE);
  await p2.getByTestId('project-card').filter({ hasText: TITLE }).waitFor();
  await p2.close();
});

await step('S03', '연구변수 3개 등록', async () => {
  await go('model');
  for (const [name, role, def] of [
    ['지각된 차별', 'independent', '부당한 대우를 받았다고 인식하는 정도'],
    ['회복탄력성', 'mediator', '역경 후 적응하는 능력'],
    ['외상 후 성장', 'dependent', '힘든 사건 이후의 긍정적 변화'],
  ]) {
    await tid('add-variable').click();
    await tid('v-name').fill(name);
    await tid('v-role').selectOption(role);
    await tid('v-cdef').fill(def);
    await tid('v-save').click();
    await tid('variable-form').waitFor({ state: 'detached' });
  }
  assert((await tid('variable-table').locator('tbody tr').count()) === 3, '변수 3개가 표에 없음');
  assert((await tid('variable-V3').innerText()).includes('종속변수'), '역할 표시 오류');
});

await step('S04', '연구가설 등록 및 연구모형 반영', async () => {
  const add = async (text, kind, from, to, via) => {
    await tid('add-hypothesis').click();
    await tid('h-statement').fill(text);
    await tid('h-kind').selectOption(kind);
    await tid('h-from').selectOption({ label: from });
    if (via) await tid('h-via').selectOption({ label: via });
    await tid('h-to').selectOption({ label: to });
    await tid('h-save').click();
    await tid('hypothesis-form').waitFor({ state: 'detached' });
  };
  await add('지각된 차별은 외상 후 성장에 유의한 영향을 미칠 것이다.', 'direct', 'V1 지각된 차별 (독립변수)', 'V3 외상 후 성장 (종속변수)');
  await add('회복탄력성은 지각된 차별과 외상 후 성장의 관계를 매개할 것이다.', 'mediation', 'V1 지각된 차별 (독립변수)', 'V3 외상 후 성장 (종속변수)', 'V2 회복탄력성 (매개변수)');
  assert((await tid('hypothesis-table').locator('tbody tr').count()) === 2, '가설 2개가 표에 없음');
  // 연구모형: 노드 3개, 경로 3개(직접 1 + 매개 2)
  const svg = tid('model-diagram');
  assert((await svg.locator('g[data-node]').count()) === 3, '연구모형 노드 수 오류');
  assert((await svg.locator('g[data-edge]').count()) === 3, '연구모형 경로 수 오류');
  assert((await tid('hypothesis-H2').innerText()).includes('지각된 차별 → 회복탄력성 → 외상 후 성장'), '매개 경로 표시 오류');
  await shot('02-model');
});

await step('S05', '문헌 등록', async () => {
  await go('literature');
  await tid('add-literature').click();
  await tid('l-title').fill('E2E 테스트 문헌: 차별 경험과 성장 (테스트용 입력)');
  await tid('l-authors').fill('테스트저자');
  await tid('l-year').fill('2021');
  await tid('l-source').fill('테스트용 입력 — 실제 학술지 아님');
  await tid('l-sample').fill('대학생');
  await tid('l-findings').fill('테스트용 핵심 결과 문장');
  await tid('l-var-V1').check();
  await tid('l-key').check();
  await tid('l-save').click();
  await page.waitForURL(/\/literature\/.+/);
  assert((await page.locator('h1').innerText()).includes('L1'), '문헌 상세로 이동하지 않음');
});

await step('S06', '문헌과 근거 연결 (+PDF 첨부)', async () => {
  const add = async (content, pageNo, hyps) => {
    await tid('add-evidence').click();
    await tid('e-content').fill(content);
    await tid('e-page').fill(pageNo);
    for (const h of hyps) await tid(`e-hyp-${h}`).check();
    await tid('e-var-V1').check();
    await tid('e-save').click();
    await tid('evidence-form').waitFor({ state: 'detached' });
  };
  await add('차별 경험이 성장과 관련된다는 테스트용 근거 문장', '12', ['H1']);
  await add('매개 경로를 지지한다는 테스트용 근거 문장', '15-16', ['H1', 'H2']);
  assert((await tid('evidence-table').locator('tbody tr').count()) === 2, '근거 2건이 없음');
  assert((await tid('evidence-E1').innerText()).includes('미확인'), '새 근거가 미확인으로 시작하지 않음');
  await tid('attach-input').setInputFiles({ name: '테스트논문.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await okToast('PDF를 이 브라우저에 저장');
  assert((await tid('attachment-row').first().innerText()).includes('파일 저장됨'), '첨부 보존 상태 표시 오류');
  await tid('attach-refonly').check();
  await tid('attach-input').setInputFiles({ name: '참조만.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await okToast('참조 정보를 저장');
  assert((await tid('attachment-row').nth(1).innerText()).includes('참조만 저장'), '참조만 저장 표시 오류');
  assert((await countStore('attachmentBlobs')) === 1, '파일 본문 저장 건수 오류');
  await tid('attach-refonly').uncheck();
});

await step('S07', '근거 확인 상태 변경', async () => {
  await tid('status-E1').selectOption('verified');
  await okToast('확인 상태를 저장');
  await tid('status-E2').selectOption('verified');
  await page.waitForTimeout(200);
  assert((await tid('evidence-E1').innerText()).includes('사용자 확인 완료'), '상태 변경이 반영되지 않음');
  await shot('03-literature-detail');
  await go('evidence');
  assert((await tid('group-H1').innerText()).includes('확인 완료 2'), '가설별 비교표 집계 오류');
  assert((await tid('group-H2').innerText()).includes('확인 완료 1'), '가설별 비교표 집계 오류(H2)');
  await shot('04-evidence-table');
});

await step('S08', '연구계획서 생성 (v1)', async () => {
  await go('meeting');
  await tid('add-meeting').click();
  await tid('m-title').fill('계획서 초안 면담');
  await tid('m-checks').fill('연구 대상을 대학생으로 한정해도 되는지');
  await tid('m-questions').fill('표본 크기는 어느 정도가 적절한지');
  await tid('m-save').click();
  await tid('meeting-form').waitFor({ state: 'detached' });
  assert((await tid('sheet-checks').innerText()).includes('대학생으로 한정'), '면담용 요약에 확인 사항이 없음');
  await shot('05-meeting-sheet');
  await go('proposal');
  assert((await tid('proposal-preview').innerText()).includes(OLD_SUBJECT), '미리보기에 연구 대상이 없음');
  await tid('new-version').click();
  await tid('version-reason').fill('최초 작성');
  await tid('version-create').click();
  await tid('version-1').waitFor();
  assert((await tid('version-state').innerText()).includes('최신 버전(v1)과 같습니다'), '버전 상태 안내 오류');
});

await step('S09', 'DOCX 다운로드 및 내용 검증 (v1)', async () => {
  const f = await download(() => tid('version-1').getByTestId('download-docx').click(), 'E2E_연구계획서_v1.docx');
  assert(f.suggested.endsWith('.docx') && f.suggested.includes('연구계획서_v1'), `파일명 오류: ${f.suggested}`);
  const d = await docxText(f.path);
  for (const s of ['1. 연구 제목', '5. 연구 대상', '7. 연구모형', '8. 연구가설', '9. 핵심 선행연구', '10. 지도교수 확인 필요 사항', TITLE, OLD_SUBJECT, '지각된 차별 → 회복탄력성', '테스트저자', '대학생으로 한정', '작성 필요'])
    assert(d.text.includes(s), `DOCX에 "${s}" 없음`);
  assert(d.tables >= 5, `DOCX 표 개수 부족: ${d.tables}`);
  assert(!d.text.includes('가상 예시'), '사용자 데이터에 가상 예시 표시가 들어감');
  return `표 ${d.tables}개, 연구모형 그림 ${d.hasImage ? '포함' : '미포함'}`;
});

await step('S10', '지도교수 피드백 등록 (연구 데이터 불변)', async () => {
  await go('feedback');
  await tid('add-feedback').click();
  await tid('fb-date').fill('2025-03-10');
  await tid('fb-comment').fill('대학생으로 한정하면 모집이 어려우니 성인으로 넓혀 보세요.');
  await tid('fb-interpretation').fill('대상 확대 제안으로 이해함');
  await page.getByTestId('feedback-form').getByText('연구 대상', { exact: true }).click();
  await tid('fb-save').click();
  await tid('feedback-form').waitFor({ state: 'detached' });
  const card = tid('feedback-F1');
  assert((await card.getByTestId('fb-original').innerText()).includes('성인으로 넓혀'), '교수 의견 원문 표시 오류');
  assert((await card.innerText()).includes('대상 확대 제안으로 이해함'), '나의 해석 표시 오류');
  assert((await card.getByTestId('fb-status-badge').innerText()) === '미처리', '처리 상태 오류');
  await go('overview');
  assert((await tid('s-population').inputValue()) === OLD_SUBJECT, '피드백 저장만으로 연구 대상이 바뀜');
});

await step('S11', '연구 대상 변경 요청', async () => {
  await go('feedback');
  await tid('cr-for-F1').click();
  assert((await tid('cr-type').inputValue()) === 'subject', '피드백 관련 항목이 기본 선택되지 않음');
  assert((await tid('cr-current').innerText()) === OLD_SUBJECT, '현재 내용 표시 오류');
  await tid('cr-new').fill(NEW_SUBJECT);
  await tid('cr-save').click();
  await page.waitForURL(/\/changes\/.+/);
  assert((await tid('cr-status').innerText()) === '검토 대기', '변경 요청 상태 오류');
});

await step('S12', '변경 영향 항목 확인 (연결 관계 기반)', async () => {
  const table = tid('impact-preview');
  await table.waitFor();
  const text = await table.innerText();
  for (const s of ['연구 대상 정의', '모집 기준', 'H1 연구가설', 'H2 연구가설', 'E1 근거', 'E2 근거', 'L1', '5. 연구 대상', '측정 척도의 대상 적합성', '연구윤리(IRB)'])
    assert(text.includes(s), `영향 항목에 "${s}" 없음`);
  assert(!text.includes('6. 연구변수'), '연결되지 않은 문단(연구변수)이 영향 항목에 포함됨');
  assert((await tid('recheck-notice').innerText()).includes('2건'), '재검토 전환 예고 건수 오류');
  assert(await tid('apply-cr').isDisabled(), '확인 체크 전에 적용 버튼이 활성화됨');
  await shot('06-impact-preview');
  // 아직 아무것도 바뀌지 않았는지
  assert((await countStore('impactReviews')) === 0, '적용 전에 검토 기록이 생김');
});

await step('S13', '사용자 승인 후 변경 적용', async () => {
  await tid('impact-ack').check();
  await tid('apply-cr').click();
  await tid('confirm-ok').click();
  await okToast('변경을 적용');
  assert((await tid('cr-status').innerText()) === '적용됨', '적용 상태 오류');
  const n = Number(await tid('pending-count').innerText());
  assert(n >= 8, `확인 전 영향 항목 수가 예상보다 적음: ${n}`);
  await shot('07-impact-reviews');
  await tid('review-status').first().selectOption('kept');
  await okToast('확인 상태를 저장');
  await tid('pending-count').filter({ hasText: new RegExp(`^${n - 1}$`) }).waitFor().catch(() => assert(false, '검토 상태 변경이 집계에 반영되지 않음'));
  await go('overview');
  assert((await tid('s-population').inputValue()) === NEW_SUBJECT, '연구 대상이 변경되지 않음');
  await go('evidence');
  assert((await tid('evrow-E1').first().innerText()).includes('재검토 필요'), 'E1이 재검토 필요로 바뀌지 않음');
  assert((await tid('evrow-E1').first().innerText()).includes('재검토 사유'), '재검토 사유가 표시되지 않음');
  await go('feedback');
  const card = await tid('feedback-F1').innerText();
  assert(card.includes('처리 중') && card.includes(OLD_SUBJECT) && card.includes(NEW_SUBJECT), '피드백에 수정 전/후가 기록되지 않음');
  assert(card.includes('성인으로 넓혀 보세요.'), '교수 의견 원문이 바뀜');
  await shot('08-feedback');
});

await step('S14', '기존 계획서 버전 보존 확인', async () => {
  await go('proposal');
  assert((await tid('version-state').innerText()).includes('다릅니다'), '현재 데이터와 최신 버전 차이 안내가 없음');
  await tid('version-1').getByTestId('toggle-version').click();
  const v1 = await tid('version-1').innerText();
  assert(v1.includes(OLD_SUBJECT) && !v1.includes(NEW_SUBJECT), 'v1 내용이 변경됨');
  const f = await download(() => tid('version-1').getByTestId('download-docx').click(), 'E2E_연구계획서_v1_변경적용후_재다운로드.docx');
  const d = await docxText(f.path);
  assert(d.text.includes(OLD_SUBJECT) && !d.text.includes(NEW_SUBJECT), '재다운로드한 v1 DOCX 내용이 변경됨');
  const a = (await docxText(path.join(FILES, 'E2E_연구계획서_v1.docx'))).text;
  assert(a === d.text, '변경 적용 전후 v1 DOCX 본문이 다름');
  await tid('version-1').getByTestId('toggle-version').click();
});

await step('S15', '새 계획서 생성 (v2) 및 차이 기록', async () => {
  await go('feedback');
  await tid('open-CR1').click();
  await tid('make-version').click();
  await page.waitForURL(/\/proposal$/);
  await tid('version-2').waitFor();
  await tid('version-2').getByTestId('toggle-version').click();
  const diff = await tid('version-2').getByTestId('version-diff').innerText();
  assert(diff.includes('5. 연구 대상') && diff.includes(OLD_SUBJECT) && diff.includes(NEW_SUBJECT), '버전 차이에 연구 대상 변경이 없음');
  assert((await tid('version-2').innerText()).includes('관련 변경 요청 CR1'), '버전에 변경 요청 연결이 없음');
  await shot('09-proposal-versions');
  const f = await download(() => tid('version-2').getByTestId('download-docx').click(), 'E2E_연구계획서_v2.docx');
  const d = await docxText(f.path);
  assert(d.text.includes(NEW_SUBJECT), 'v2 DOCX에 새 연구 대상이 없음');
  assert(d.text.includes('재검토 필요'), 'v2 DOCX에 근거 재검토 상태가 없음');
  await tid('version-2').getByTestId('confirm-version').click();
  await tid('confirm-ok').click();
  await okToast('확정');
  assert((await tid('version-2').getByTestId('version-status').innerText()) === '확정', '확정 상태 표시 오류');
  assert((await tid('version-1').getByTestId('version-status').innerText()) === '초안', 'v1 상태가 바뀜');
});

await step('S16', 'XLSX 근거표 다운로드 및 내용 검증', async () => {
  await go('evidence');
  const f = await download(() => tid('download-xlsx').click(), 'E2E_근거비교표.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f.path);
  const ws = wb.getWorksheet('근거 비교표');
  const header = ws.getRow(1).values.slice(1);
  assert(JSON.stringify(header) === JSON.stringify(['가설 ID', '연구가설', '문헌 ID', '논문 제목', '저자', '출판연도', '근거 ID', '근거 내용', '구분', '페이지', '확인 상태', '재검토 필요 여부', '메모']), `열 구성 오류: ${header}`);
  const rows = [];
  ws.eachRow((r, n) => n > 1 && rows.push(Array.from({ length: 13 }, (_, i) => String(r.getCell(i + 1).value ?? ''))));
  // H1–E1, H1–E2, H2–E2
  assert(rows.length === 3, `행 수 오류: ${rows.length}`);
  assert(JSON.stringify(rows.map((r) => `${r[0]}-${r[6]}`)) === JSON.stringify(['H1-E1', 'H1-E2', 'H2-E2']), `가설-근거 연결 오류: ${rows.map((r) => `${r[0]}-${r[6]}`)}`);
  assert(rows.every((r) => r[2] === 'L1' && r[4] === '테스트저자' && r[5] === '2021'), '문헌 정보 오류');
  assert(rows[1][9] === '15-16', '페이지 오류');
  assert(rows.every((r) => r[10] === '재검토 필요' && r[11] === '예'), '확인 상태·재검토 여부 오류');
  assert(rows[0][12].includes('재검토 사유'), '메모에 재검토 사유 없음');
  assert(wb.getWorksheet('문헌 목록').rowCount === 2, '문헌 목록 시트 오류');
  return `${rows.length}행 검증`;
});

await step('S17', '프로젝트 전체 백업', async () => {
  await go('data');
  await tid('run-check').click();
  await tid('check-ok').waitFor();
  const f = await download(() => tid('download-backup').click(), 'E2E_백업.json');
  backupPath = f.path;
  const b = JSON.parse(readFileSync(f.path, 'utf8'));
  assert(b.format === 'thesis-manager-backup' && b.schemaVersion === 1, '백업 형식·스키마 버전 오류');
  assert(b.bundle.variables.length === 3 && b.bundle.hypotheses.length === 2 && b.bundle.evidence.length === 2 && b.bundle.proposalVersions.length === 2, '백업 항목 수 오류');
  assert(b.bundle.impactReviews.length > 0 && b.bundle.feedback.length === 1 && b.bundle.changeRequests.length === 1, '피드백·영향 검토 누락');
  assert(Object.keys(b.attachmentFiles).length === 1, '첨부파일 본문 누락');
  await shot('10-backup');
});

let before = null;
let copyUrl = '';
await step('S18', '백업 복원 (삭제 후 복원)', async () => {
  before = JSON.parse(readFileSync(backupPath, 'utf8')).bundle;
  await tid('delete-project').click();
  await tid('confirm-ok').click();
  await page.waitForURL((u) => u.hash === '#/' || u.hash === '');
  assert((await countStore('variables')) === 0 && (await countStore('evidence')) === 0 && (await countStore('proposalVersions')) === 0, '프로젝트 삭제 후 데이터가 남음');
  await tid('open-restore').click();
  await tid('restore-input').setInputFiles(backupPath);
  const sum = await tid('restore-summary').innerText();
  assert(sum.includes(TITLE) && sum.includes('변수 3') && sum.includes('계획서 버전 2'), '복원 전 요약 오류');
  await shot('11-restore-dialog');
  await tid('restore-go').click();
  await page.waitForURL(/\/p\/.+/);
  assert(page.url().startsWith(projectUrl), '복원된 프로젝트 ID가 다름');
});

await step('S19', '복원된 연결 관계 검증', async () => {
  await go('data');
  await tid('run-check').click();
  await tid('check-ok').waitFor();
  const f = await download(() => tid('download-backup').click(), 'E2E_백업_복원후.json');
  const after = JSON.parse(readFileSync(f.path, 'utf8')).bundle;
  const strip = (b) => ({ ...b, project: { ...b.project, updatedAt: '' }, changeLog: b.changeLog.filter((c) => c.action !== 'restore') });
  const A = strip(before);
  const B = strip(after);
  // 키 순서와 무관하게 값 전체를 비교
  const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  for (const k of Object.keys(A)) assert(canon(A[k]) === canon(B[k]), `복원 전후 "${k}" 데이터가 다름`);
  assert(after.changeLog.length === before.changeLog.length + 1, '복원 기록이 추가되지 않음');
  await go('evidence');
  assert((await tid('group-H1').locator('tbody tr').count()) === 2 && (await tid('group-H2').locator('tbody tr').count()) === 1, '복원 후 가설-근거 연결 오류');
  await go('literature');
  await tid('literature-L1').locator('a').first().click();
  assert((await tid('attachment-row').first().innerText()).includes('파일 저장됨'), '복원 후 첨부 상태 오류');
  const [dl] = await Promise.all([page.waitForEvent('download'), tid('attachment-row').first().getByText('내려받기').click()]);
  const p = path.join(FILES, 'E2E_복원된_첨부.pdf');
  await dl.saveAs(p);
  assert(readFileSync(p).equals(pdfBytes), '복원된 PDF 내용이 원본과 다름');
  await go('proposal');
  assert((await tid('version-2').getByTestId('version-status').innerText()) === '확정', '복원 후 버전 상태 오류');
  await go('feedback');
  await tid('open-CR1').click();
  assert((await tid('impact-reviews').locator('tbody tr').count()) === after.impactReviews.length, '복원 후 영향 검토 수 오류');
  return `ID·관계 동일 (엔터티 ${Object.keys(A).length}종 대조)`;
});

await step('S20', '오류 없이 재접속', async () => {
  await page.reload();
  await tid('impact-reviews').waitFor();
  await go('dashboard');
  await tid('progress-pct').waitFor();
  const stats = await page.locator('.stat').allInnerTexts();
  assert(stats.some((s) => s.startsWith('3') && s.includes('연구변수')), '대시보드 변수 수 오류');
  assert(stats.some((s) => s.startsWith('2') && s.includes('검토가 필요한 근거')), '대시보드 검토 필요 근거 수 오류');
  await shot('12-dashboard');
  assert(consoleErrors.length === 0, `콘솔 오류 ${consoleErrors.length}건: ${consoleErrors[0]}`);
});

/* ───────────── 예외 상황 ───────────── */

await step('X01', '필수값 누락 시 저장 거부', async () => {
  await page.goto(BASE);
  await tid('new-project').click();
  await tid('project-create').click();
  await errToast('연구 제목');
  await page.keyboard.press('Escape');
  await page.goto(projectUrl + '/model');
  await tid('add-variable').click();
  await tid('v-save').click();
  await errToast('변수명');
  assert(await tid('variable-form').isVisible(), '오류 후 입력 창이 닫힘');
  await page.keyboard.press('Escape');
  await tid('add-hypothesis').click();
  await tid('h-statement').fill('변수 없는 가설');
  await tid('h-save').click();
  await errToast('원인 변수와 결과 변수');
  await page.keyboard.press('Escape');
  await go('feedback');
  await tid('add-feedback').click();
  await tid('fb-save').click();
  await errToast('교수 의견 원문');
  await page.keyboard.press('Escape');
  assert((await countStore('variables')) === 3 && (await countStore('feedback')) === 1, '거부된 입력이 저장됨');
});

await step('X02', '중복 데이터 거부', async () => {
  await go('model');
  await tid('add-variable').click();
  await tid('v-name').fill('회복탄력성');
  await tid('v-save').click();
  await errToast('이미 있습니다');
  await page.keyboard.press('Escape');
  await go('literature');
  await tid('add-literature').click();
  await tid('l-title').fill('E2E 테스트 문헌: 차별 경험과 성장 (테스트용 입력)');
  await tid('l-year').fill('2021');
  await tid('l-save').click();
  await errToast('이미 등록된 문헌');
  await tid('l-year').fill('21년');
  await tid('l-save').click();
  await errToast('4자리 숫자');
  await page.keyboard.press('Escape');
  await page.goto(BASE);
  await tid('new-project').click();
  await tid('project-title').fill(TITLE);
  await tid('project-create').click();
  await errToast('같은 제목');
  await page.keyboard.press('Escape');
});

await step('X03', '잘못된 파일 거부 (PDF 아님 / 백업 아님)', async () => {
  await page.goto(projectUrl + '/literature');
  await tid('literature-L1').locator('a').first().click();
  await tid('attach-input').setInputFiles({ name: '가짜.pdf', mimeType: 'application/pdf', buffer: Buffer.from('이것은 PDF가 아닙니다') });
  await errToast('PDF 파일이 아닙니다');
  assert((await tid('attachment-row').count()) === 2, '잘못된 파일이 첨부됨');
  await go('data');
  await tid('open-restore').click();
  await tid('restore-input').setInputFiles({ name: '문서.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  assert((await tid('restore-error').innerText()).includes('읽을 수 없습니다'), '잘못된 파일 안내 오류');
  await tid('restore-input').setInputFiles({ name: '다른.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  assert((await tid('restore-error').innerText()).includes('백업 파일이 아닙니다'), '다른 JSON 안내 오류');
});

await step('X04', '손상된 백업 거부 (기존 데이터 유지)', async () => {
  const text = readFileSync(backupPath, 'utf8');
  await tid('restore-input').setInputFiles({ name: '잘린백업.json', mimeType: 'application/json', buffer: Buffer.from(text.slice(0, Math.floor(text.length * 0.6))) });
  assert((await tid('restore-error').innerText()).includes('손상'), '잘린 백업 안내 오류');
  const broken = JSON.parse(text);
  broken.bundle.evidence[0].literatureId = 'missing-literature';
  await tid('restore-input').setInputFiles({ name: '끊어진참조.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) });
  assert((await tid('restore-error').innerText()).includes('연결 관계가 손상'), '끊어진 참조 안내 오류');
  const newer = { ...JSON.parse(text), schemaVersion: 7 };
  await tid('restore-input').setInputFiles({ name: '미래버전.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  assert((await tid('restore-error').innerText()).includes('더 최신 버전'), '스키마 버전 안내 오류');
  assert((await tid('restore-summary').count()) === 0, '거부된 백업에 복원 버튼이 표시됨');
  await page.keyboard.press('Escape');
  assert((await countStore('evidence')) === 2 && (await countStore('projects')) === 1, '기존 데이터가 변경됨');
});

await step('X05', '같은 프로젝트 복원 시 덮어쓰기 확인 / 사본 복원', async () => {
  await tid('open-restore').click();
  await tid('restore-input').setInputFiles(backupPath);
  await tid('restore-conflict').waitFor();
  await tid('restore-overwrite').click();
  assert((await tid('confirm-dialog').innerText()).includes('덮어쓸까요'), '덮어쓰기 확인 대화상자가 없음');
  await tid('confirm-cancel').click();
  assert((await countStore('projects')) === 1, '확인 취소 후 데이터가 변경됨');
  await shot('13-restore-conflict');
  await tid('restore-copy').click();
  await page.waitForURL((u) => /\/p\/.+/.test(u.hash) && !u.href.startsWith(projectUrl));
  copyUrl = page.url();
  await page.locator('.side-project').filter({ hasText: '(복원본)' }).waitFor();
  assert((await countStore('projects')) === 2 && (await countStore('variables')) === 6 && (await countStore('evidence')) === 4, '사본 복원 후 항목 수 오류');
  await go('data');
  await tid('run-check').click();
  await tid('check-ok').waitFor();
});

await step('X06', '여러 프로젝트 간 데이터 분리', async () => {
  // 사본 프로젝트에서 변수 하나를 고쳐도 원본은 그대로
  await go('model');
  await tid('edit-V1').click();
  await tid('v-name').fill('차별 경험(사본에서 수정)');
  await tid('v-save').click();
  await tid('variable-form').waitFor({ state: 'detached' });
  assert((await tid('hypothesis-H1').innerText()).includes('차별 경험(사본에서 수정) → 외상 후 성장'), '변수명 수정이 가설 경로에 반영되지 않음(ID 연결)');
  await page.goto(projectUrl + '/model');
  await tid('variable-V1').waitFor();
  assert((await tid('variable-V1').innerText()).includes('지각된 차별'), '다른 프로젝트 수정이 원본에 영향을 줌');
  assert((await tid('variable-table').locator('tbody tr').count()) === 3, '원본 변수 수 오류');
});

await step('X07', '삭제된 문헌의 참조 정리', async () => {
  // 사본 프로젝트에서 문헌 삭제 → 근거·첨부 함께 삭제, 가설은 유지, 무결성 유지
  await page.goto(BASE);
  await tid('project-card').filter({ hasText: '(복원본)' }).click();
  await go('literature');
  await tid('literature-L1').locator('a').first().click();
  await tid('delete-literature').click();
  assert((await tid('confirm-dialog').innerText()).includes('근거 2건, 첨부 2건'), '삭제 전 영향 안내 오류');
  await tid('confirm-ok').click();
  await okToast('문헌을 삭제');
  await go('evidence');
  assert((await tid('group-H1').innerText()).includes('연결된 근거가 없습니다'), '삭제된 문헌의 근거가 남아 있음');
  await go('data');
  await tid('run-check').click();
  await tid('check-ok').waitFor();
  assert((await countStore('evidence')) === 2 && (await countStore('attachments')) === 2 && (await countStore('attachmentBlobs')) === 1, '원본 프로젝트 데이터까지 삭제됨');
  // 삭제된 문헌 주소로 직접 접근
  await page.goto(copyUrl + '/literature/does-not-exist');
  await page.getByText('문헌을 찾을 수 없습니다').waitFor();
});

await step('X08', '저장 실패 안내 및 데이터 보존', async () => {
  await page.goto(projectUrl + '/model');
  await tid('variable-V1').waitFor();
  expectErrors = true;
  await page.evaluate(() => {
    window.__origAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () {
      throw new DOMException('디스크 공간 부족(테스트)', 'QuotaExceededError');
    };
  });
  await tid('add-variable').click();
  await tid('v-name').fill('저장 실패 테스트 변수');
  await tid('v-save').click();
  const msg = await errToast('저장하지 못했습니다');
  assert(msg.includes('다시 시도'), '저장 실패 안내 문구 오류');
  assert(await tid('variable-form').isVisible(), '저장 실패 후 입력 내용이 사라짐');
  assert((await tid('v-name').inputValue()) === '저장 실패 테스트 변수', '입력 내용이 유지되지 않음');
  assert((await tid('save-state').innerText()).includes('실패'), '저장 상태 표시가 실패로 바뀌지 않음');
  await shot('14-save-failure', { fullPage: false });
  await page.evaluate(() => (IDBObjectStore.prototype.add = window.__origAdd));
  expectErrors = false;
  // 실패한 트랜잭션은 번호(카운터)까지 되돌려져야 한다 → 다시 저장하면 V4
  await tid('v-save').click();
  await tid('variable-form').waitFor({ state: 'detached' });
  assert((await tid('variable-V4').innerText()).includes('저장 실패 테스트 변수'), '재시도 저장 실패 또는 코드 번호가 건너뜀');
  await tid('delete-V4').click();
  await tid('confirm-ok').click();
  await okToast('변수를 삭제');
});

await step('X09', '백업 복원 중 실패 시 기존 데이터 유지', async () => {
  await go('overview');
  await tid('f-purpose').fill('복원 실패 테스트 직전에 수정한 목적');
  await tid('overview-save').click();
  await okToast('연구 개요를 저장');
  await go('data');
  await tid('open-restore').click();
  await tid('restore-input').setInputFiles(backupPath);
  await tid('restore-conflict').waitFor();
  expectErrors = true;
  await page.evaluate(() => {
    window.__origAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...a) {
      if (this.name === 'proposalVersions') throw new DOMException('복원 중 오류(테스트)', 'UnknownError');
      return window.__origAdd.apply(this, a);
    };
  });
  await tid('restore-overwrite').click();
  await tid('confirm-ok').click();
  const err = await tid('restore-error').innerText();
  await page.evaluate(() => (IDBObjectStore.prototype.add = window.__origAdd));
  expectErrors = false;
  assert(err.includes('기존 데이터는 바뀌지 않았습니다'), `복원 실패 안내 오류: ${err}`);
  await page.keyboard.press('Escape');
  await page.reload();
  await go('overview');
  assert((await tid('f-purpose').inputValue()) === '복원 실패 테스트 직전에 수정한 목적', '복원 실패 후 기존 데이터가 손상됨');
  assert((await countStore('proposalVersions')) === 4 && (await countStore('variables')) === 6, '복원 실패 후 항목 수가 달라짐');
  await go('data');
  await tid('run-check').click();
  await tid('check-ok').waitFor();
});

await step('X10', '긴 한국어 텍스트 입력·표시·내보내기', async () => {
  const long = '아주 긴 근거 문장입니다. 띄어쓰기없이이어지는아주긴한국어문자열도포함합니다 “특수문자” <태그> & 100% ① '.repeat(60).trim();
  const longTitle = '매우 긴 논문 제목 '.repeat(30).trim();
  await go('literature');
  await tid('add-literature').click();
  await tid('l-title').fill(longTitle);
  await tid('l-save').click();
  await page.waitForURL(/\/literature\/.+/);
  await tid('add-evidence').click();
  await tid('e-content').fill(long);
  await tid('e-hyp-H2').check();
  await tid('e-save').click();
  await tid('evidence-form').waitFor({ state: 'detached' });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert((await overflow()) <= 1, `문헌 상세 화면 가로 넘침 ${await overflow()}px`);
  await go('evidence');
  assert((await overflow()) <= 1, `근거 비교표 화면 가로 넘침 ${await overflow()}px`);
  await go('literature');
  assert((await overflow()) <= 1, `문헌 목록 화면 가로 넘침 ${await overflow()}px`);
  await shot('15-long-text');
  await go('evidence');
  const f = await download(() => tid('download-xlsx').click(), 'E2E_근거비교표_긴텍스트.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f.path);
  let found = false;
  wb.getWorksheet('근거 비교표').eachRow((r) => {
    if (String(r.getCell(8).value) === long && String(r.getCell(4).value) === longTitle) found = true;
  });
  assert(found, 'XLSX에 긴 텍스트가 그대로 들어가지 않음');
});

let emptyUrl = '';
void emptyUrl;
await step('X11', '빈 프로젝트: 모든 화면과 내보내기', async () => {
  await page.goto(BASE);
  await tid('new-project').click();
  await tid('project-title').fill('빈 프로젝트 점검');
  await tid('project-create').click();
  await page.waitForURL(/\/p\/.+\/overview/);
  emptyUrl = page.url().replace(/\/overview$/, '');
  for (const n of ['dashboard', 'model', 'literature', 'evidence', 'meeting', 'feedback', 'proposal', 'history', 'data']) {
    await go(n);
    await page.locator('h1').first().waitFor();
  }
  await go('model');
  assert((await page.getByTestId('empty').count()) >= 2, '빈 상태 안내가 없음');
  await shot('16-empty-project');
  await go('proposal');
  assert((await tid('proposal-preview').locator('.todo').count()) === 9, `미리보기 '작성 필요' 개수 오류: ${await tid('proposal-preview').locator('.todo').count()}`);
  await tid('new-version').click();
  await tid('version-create').click();
  await errToast('변경 사유');
  await tid('version-reason').fill('빈 상태 점검');
  await tid('version-create').click();
  await tid('version-1').waitFor();
  const f = await download(() => tid('version-1').getByTestId('download-docx').click(), 'E2E_빈프로젝트_계획서.docx');
  const d = await docxText(f.path);
  assert(d.text.split('\n').filter((l) => l === '작성 필요').length === 9, "빈 프로젝트 DOCX의 '작성 필요' 개수 오류");
  await go('evidence');
  const x = await download(() => tid('download-xlsx').click(), 'E2E_빈프로젝트_근거표.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(x.path);
  assert(wb.getWorksheet('근거 비교표').rowCount === 1, '빈 근거표 행 수 오류');
  assert((await countStore('variables')) === 6, '빈 프로젝트에 다른 프로젝트 데이터가 섞임');
  await go('dashboard');
  assert((await tid('stat-연구변수').innerText()).startsWith('0'), '빈 프로젝트 대시보드에 다른 프로젝트 수치가 보임');
});

/* ───────────── 데모 · 반응형 ───────────── */

await step('D01', '가상 데모: 가상 예시 표시와 영향 분석 사례', async () => {
  await page.goto(BASE);
  await tid('load-demo').click();
  await page.waitForURL(/\/p\/.+/);
  await tid('demo-banner').waitFor();
  await shot('17-demo-dashboard');
  await go('model');
  assert((await tid('model-diagram').locator('g[data-edge]').count()) === 3, '데모 연구모형 경로(직접 1 + 매개 2) 오류');
  await shot('18-demo-model');
  await go('literature');
  assert((await tid('literature-table').locator('.badge.warn').count()) === 3, '가상 문헌 표시 누락');
  await shot('19-demo-literature');
  await go('evidence');
  await shot('20-demo-evidence');
  await go('feedback');
  await tid('open-CR1').click();
  const t = await tid('impact-preview').innerText();
  assert(t.includes('E4 근거') && !t.includes('E5 근거'), '데모 영향 분석: 미연결 근거 E5 가 포함되었거나 E4 누락');
  await shot('21-demo-impact');
  await go('proposal');
  const f = await download(() => tid('version-1').getByTestId('download-docx').click(), '데모_연구계획서_v1.docx');
  const d = await docxText(f.path);
  assert(d.text.includes('가상 예시 데이터') && d.text.includes('[가상 예시 문헌]'), '데모 DOCX에 가상 예시 표시 없음');
  assert(d.hasImage, '데모 DOCX에 연구모형 그림 없음');
  await go('evidence');
  const x = await download(() => tid('download-xlsx').click(), '데모_근거비교표.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(x.path);
  assert(String(wb.getWorksheet('근거 비교표').getCell(1, 1).value).includes('가상 예시 데이터'), '데모 XLSX에 가상 예시 표시 없음');
  await go('data');
  const b = await download(() => tid('download-backup').click(), '데모_백업.json');
  assert(JSON.parse(readFileSync(b.path, 'utf8')).notice.includes('가상 예시'), '데모 백업에 가상 예시 표시 없음');
  // 데모를 다시 눌러도 중복 생성되지 않음
  await page.goto(BASE);
  await tid('project-card').first().waitFor();
  const n = await countStore('projects');
  await tid('load-demo').click();
  await page.waitForURL(/\/p\/.+/);
  await tid('demo-banner').waitFor();
  await page.goto(BASE);
  await tid('project-card').first().waitFor();
  assert((await countStore('projects')) === n && (await tid('project-card').count()) === n, '데모가 중복 생성됨');
  await shot('22-project-list');
});

await step('R01', '반응형: 태블릿·모바일 기본 사용', async () => {
  await tid('project-card').filter({ hasText: '한부모가족 대학생의' }).click();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const [name, w, h] of [['tablet', 820, 1180], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const n of ['', 'overview', 'model', 'literature', 'evidence', 'meeting', 'feedback', 'proposal', 'history', 'data']) {
      await page.locator('.mobile-nav select').selectOption(n || '_');
      await page.locator('h1').first().waitFor();
      const o = await overflow();
      assert(o <= 1, `${name} ${n || 'dashboard'} 화면 가로 넘침 ${o}px`);
      if (['', 'model', 'evidence', 'feedback'].includes(n)) await shot(`23-${name}-${n || 'dashboard'}`);
    }
    // 모바일에서도 입력 가능
    await page.locator('.mobile-nav select').selectOption('model');
    await tid('add-variable').click();
    await tid('v-name').fill(`${name} 입력 변수`);
    await tid('v-role').selectOption('control');
    await tid('v-save').click();
    await tid('variable-form').waitFor({ state: 'detached' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

await step('Z01', '전체 실행 중 예상치 못한 콘솔 오류 없음', async () => {
  assert(consoleErrors.length === 0, `콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(' | ')}`);
});

await browser.close();
server.kill();

const pass = results.filter((r) => r.status === 'pass').length;
const summary = { ranAt: new Date().toISOString(), browser: 'Chromium (Playwright)', total: results.length, pass, fail: results.length - pass, consoleErrors, results };
writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(summary, null, 2));
console.log(`\n${pass}/${results.length} 통과`);
process.exit(pass === results.length ? 0 : 1);
