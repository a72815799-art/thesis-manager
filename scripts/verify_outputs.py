"""내보낸 파일의 독립 검증 (앱과 다른 라이브러리 사용).
- python-docx / openpyxl 로 열어 내용 확인
- LibreOffice 로 실제로 열어 PDF 변환 (오피스 프로그램에서 열리는지 확인)
실행: python3 scripts/verify_outputs.py   (먼저 npm run e2e 로 docs/evidence/files 생성)
"""
import json, subprocess, sys, pathlib, shutil
import docx, openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ROOT / "docs/evidence/files"
OUT = ROOT / "docs/evidence/rendered"
shutil.rmtree(OUT, ignore_errors=True); OUT.mkdir(parents=True)
report, ok = [], True

def check(name, cond, detail=""):
    global ok
    ok = ok and bool(cond)
    report.append({"check": name, "status": "pass" if cond else "fail", "detail": detail})
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))

def docx_text(p):
    d = docx.Document(str(p))
    parts = [x.text for x in d.paragraphs]
    for t in d.tables:
        for r in t.rows:
            parts += [c.text for c in r.cells]
    return d, "\n".join(parts)

d1, t1 = docx_text(FILES / "E2E_연구계획서_v1.docx")
d2, t2 = docx_text(FILES / "E2E_연구계획서_v2.docx")
dd, td = docx_text(FILES / "데모_연구계획서_v1.docx")
heads = ["1. 연구 제목","2. 연구 배경","3. 연구 목적","4. 연구 질문","5. 연구 대상","6. 연구변수","7. 연구모형","8. 연구가설","9. 핵심 선행연구","10. 지도교수 확인 필요 사항"]
check("DOCX v1: 10개 항목 제목", all(h in t1 for h in heads))
check("DOCX v1: 표 5개 이상", len(d1.tables) >= 5, f"{len(d1.tables)}개")
check("DOCX v1: 기존 연구 대상 유지", "한부모가족 대학생" in t1 and "경험이 있는 성인" not in t1)
check("DOCX v2: 새 연구 대상 반영", "한부모가족 경험이 있는 성인" in t2)
check("DOCX v1: 변수 표 내용", any("지각된 차별" in c.text for t in d1.tables for r in t.rows for c in r.cells))
check("DOCX 데모: 가상 예시 표시", "가상 예시 데이터" in td and "[가상 예시 문헌]" in td)
check("DOCX 데모: 연구모형 그림 1개", len(dd.inline_shapes) == 1, f"{len(dd.inline_shapes)}개")
check("DOCX 데모: 머리글 가상 예시 표시", "가상 예시 데이터" in dd.sections[0].header.paragraphs[0].text)

wb = openpyxl.load_workbook(FILES / "E2E_근거비교표.xlsx")
ws = wb["근거 비교표"]
rows = [[("" if c is None else str(c)) for c in r] for r in ws.iter_rows(values_only=True)]
check("XLSX: 시트 3개", wb.sheetnames == ["근거 비교표", "문헌 목록", "안내"], str(wb.sheetnames))
check("XLSX: 머리글 13열", rows[0] == ["가설 ID","연구가설","문헌 ID","논문 제목","저자","출판연도","근거 ID","근거 내용","구분","페이지","확인 상태","재검토 필요 여부","메모"])
check("XLSX: 가설-근거 연결", [f"{r[0]}-{r[6]}" for r in rows[1:]] == ["H1-E1","H1-E2","H2-E2"], str([f"{r[0]}-{r[6]}" for r in rows[1:]]))
check("XLSX: 수식 셀 없음", all(c.data_type != "f" for r in ws.iter_rows() for c in r))
wl = openpyxl.load_workbook(FILES / "E2E_근거비교표_긴텍스트.xlsx")["근거 비교표"]
longest = max(len(str(c.value or "")) for r in wl.iter_rows() for c in r)
check("XLSX: 긴 한국어 텍스트 보존", longest > 3000, f"최장 셀 {longest}자")
wd = openpyxl.load_workbook(FILES / "데모_근거비교표.xlsx")["근거 비교표"]
check("XLSX 데모: 첫 행 가상 예시 표시", "가상 예시 데이터" in str(wd.cell(1, 1).value))

bk = json.loads((FILES / "E2E_백업.json").read_text(encoding="utf-8"))
check("백업: 형식·스키마 버전", bk["format"] == "thesis-manager-backup" and bk["schemaVersion"] == 1)
b = bk["bundle"]
lit = {x["id"] for x in b["literature"]}; hyp = {x["id"] for x in b["hypotheses"]}; var = {x["id"] for x in b["variables"]}
check("백업: 근거의 문헌·가설·변수 참조가 모두 유효", all(e["literatureId"] in lit and set(e["hypothesisIds"]) <= hyp and set(e["variableIds"]) <= var for e in b["evidence"]))

for f in ["E2E_연구계획서_v1.docx", "E2E_연구계획서_v2.docx", "데모_연구계획서_v1.docx", "E2E_빈프로젝트_계획서.docx", "E2E_근거비교표.xlsx", "데모_근거비교표.xlsx"]:
    r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(OUT), str(FILES / f)], capture_output=True, text=True, timeout=180)
    pdf = OUT / (pathlib.Path(f).stem + ".pdf")
    check(f"LibreOffice 로 열기·PDF 변환: {f}", pdf.exists() and pdf.stat().st_size > 2000, f"{pdf.stat().st_size if pdf.exists() else 0} bytes")

(ROOT / "docs/evidence/file-verification.json").write_text(json.dumps({"ok": ok, "checks": report}, ensure_ascii=False, indent=2), encoding="utf-8")
sys.exit(0 if ok else 1)
