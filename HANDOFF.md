# 인계 문서

## A. 실행 정보

| 항목 | 내용 |
|---|---|
| 저장소 | https://github.com/a72815799-art/BowenScope-V2 |
| 작업 브랜치 | `ccr-2ab153d2-c6zv5c` (기본 브랜치 `main`은 건드리지 않음) |
| 프로젝트 위치 | `projects/thesis-manager/` |
| 최종 커밋 | 이 브랜치의 최신 커밋 (`git log -1 --format=%H -- projects/thesis-manager`) |
| PR | 만들지 않음 (요청 시 생성) |
| 설치 | `cd projects/thesis-manager && npm install` |
| 실행 | `npm run dev` → http://localhost:5173 |
| 빌드 | `npm run build` → `dist/` |
| 테스트 | `npm run typecheck` · `npm test` · `npm run build && npm run e2e` · `npm run verify:files` |
| 접속 방법 | 로컬 실행만 가능. 외부 배포는 하지 않았습니다(승인 필요). |
| 환경 제약 | Node 20+, 최신 Chromium 계열 브라우저 권장. 데이터는 실행한 브라우저에만 저장 |

## B. 구현 결과

### 완료 및 실제 검증 (브라우저 E2E + 단위 테스트)

프로젝트 생성·수정·삭제, 대시보드(통계 8종·진행률 기준 9개·다음 작업·최근 이력), 연구 대상, 변수(5개 역할·정의·이력), 가설(직접/매개/조절/기타)과 변수 연결, 연구모형 자동 시각화, 문헌 등록·검색·필터, PDF 첨부(본문 저장/참조만 구분), 근거 등록과 가설·변수 연결, 확인 상태 4종, 근거 비교표(가설별/전체), 면담 준비와 면담용 요약, 피드백(원문·해석 분리), 변경 요청, 영향 분석, 승인 후 적용, 영향 항목 검토 기록, 계획서 버전(불변·차이·확정), DOCX, XLSX, 백업, 복원(새로/덮어쓰기/사본), 데이터 점검, 수정 이력, 가상 데모, 반응형 기본 사용.

### 구현했으나 검증 미완료

| 기능 | 검증하지 못한 부분 |
|---|---|
| DOCX·XLSX | MS Word·Excel·한컴오피스에서 직접 열기 (LibreOffice·라이브러리로만 확인) |
| 면담용 요약 인쇄 | 인쇄 버튼과 인쇄용 스타일은 있으나 실제 인쇄 결과는 확인하지 않음 |
| 조절효과 가설의 연구모형 표시 | 코드와 단위 로직은 있으나 화면 E2E는 직접·매개 경로만 확인 |
| 주요 일정 편집 | 화면은 있으나 E2E 시나리오에 포함하지 않음 |
| 큰 PDF·대량 데이터 | 작은 테스트 파일로만 확인 |
| Chromium 외 브라우저 | 미확인 |

### 부분 구현

- 변경 요청 대상: 연구 개요 4칸, 연구 대상 5칸, 변수 3칸, 가설 문장만 지원(KNOWN_ISSUES 4번)
- 학교 요구사항: 양식과 데이터를 분리하는 구조만 마련. 실제 학교 양식은 반영하지 못함(사이트 접근 차단)

### 실패

없음.

### 미구현

5~8 영역(윤리·척도, 데이터·통계, 원고·인용, 심사·제출), AI 기능, 계정·결제·클라우드 동기화, 외부 배포.

## C. 검증 자료

TEST_REPORT.md 의 “증거 자료 위치” 참고. 요약:

- 화면 캡처: `docs/evidence/screens/01-overview.png` … `23-mobile-feedback.png`
- 브라우저 E2E 결과: `docs/evidence/e2e-results.json`
- 예시 파일(브라우저가 실제로 내려받은 것): `docs/evidence/files/`
  - `E2E_연구계획서_v1.docx`, `E2E_연구계획서_v2.docx`, `데모_연구계획서_v1.docx`
  - `E2E_근거비교표.xlsx`, `데모_근거비교표.xlsx`
  - `E2E_백업.json`, `E2E_백업_복원후.json`, `데모_백업.json`
- LibreOffice 변환본: `docs/evidence/rendered/*.pdf`
- 재현용 가상 데이터: 앱 첫 화면 ‘가상 데모 열기’ (`src/demo/demo.ts`) 또는 `데모_백업.json` 복원

## D. 변경 파일

`projects/thesis-manager/` 아래 신규 파일만 추가했습니다. 저장소의 기존 파일은 수정하지 않았습니다.
(`git diff --stat main...ccr-2ab153d2-c6zv5c` 로 확인)

## E. 독립 품질 검수용 추적표

### 요구사항 → 구현 → 테스트

| 요구사항 (지시서) | 구현 위치 | 단위 테스트 | E2E |
|---|---|---|---|
| 4.1 프로젝트 관리·대시보드 | `src/db/repo.ts` createProject/updateProject, `src/ui/pages/ProjectsPage.tsx`, `OverviewPage.tsx`, `Dashboard.tsx`, `src/domain/progress.ts` | `repo.test.ts` “프로젝트 생성…”, “빈 프로젝트도…” | S01, S02, S20, X11 |
| 4.2 변수·가설·연구모형 | `repo.ts` saveVariable/saveHypothesis, `src/domain/proposal.ts` deriveModelEdges, `src/ui/ModelDiagram.tsx`, `pages/ModelPage.tsx` | `repo.test.ts` “연구모형 경로가…”, “변수명을 바꿔도…” | S03, S04, X06 |
| 4.3 문헌·근거·PDF·확인 상태 | `repo.ts` saveLiterature/saveEvidence/setEvidenceStatus/addAttachment, `pages/LiteraturePage.tsx`, `EvidencePage.tsx` | `repo.test.ts` “문헌·근거·첨부” 묶음 | S05~S07, X03, X07, X10 |
| 4.3 확인하지 않은 근거를 확인 완료로 표시하지 않음 | `repo.ts` saveEvidence(신규는 `unverified`), setEvidenceStatus(사용자 조작만) | “새 근거는 미확인으로 시작…” | S06, S07 |
| 4.4 면담 준비·피드백(원문/해석 분리, 자동 변경 없음) | `repo.ts` saveMeeting/saveFeedback, `pages/MeetingPage.tsx`, `FeedbackPage.tsx` | “피드백을 저장해도 연구 데이터는 바뀌지 않는다” | S08, S10 |
| 5 변경 영향 분석 | `src/domain/impact.ts` analyzeImpact | `impact.test.ts` “변경 영향 분석” 4개 | S12, D01 |
| 5 승인 후 적용·검토 기록 | `repo.ts` previewChangeRequest/applyChangeRequest/updateImpactReview, `pages/ChangeRequestPage.tsx` | `impact.test.ts` “변경 요청 적용” 5개 | S11~S13 |
| 5 버전 보존·차이·확정 | `repo.ts` insertVersion/createProposalVersion/confirmProposalVersion, `proposal.ts` buildSnapshot/diffSnapshots, `pages/ProposalPage.tsx` | “승인 전에는…”, “최신 버전과 현재 데이터가 다르면…” | S14, S15 |
| 6.1 DOCX | `src/export/docx.ts` | `export.test.ts` DOCX 3개 | S09, S14, S15, X11, D01 + `verify_outputs.py` |
| 6.2 XLSX | `src/export/xlsx.ts` | `export.test.ts` XLSX 2개 | S16, X10, X11, D01 + `verify_outputs.py` |
| 6.3 백업·복원 | `src/db/backup.ts`, `pages/DataPage.tsx` | `backup.test.ts` 6개 | S17~S19, X04, X05, X09 |
| 7 데모·가상 예시 표시 | `src/demo/demo.ts`, `App.tsx` 배너, `docx.ts` DEMO_NOTICE, `xlsx.ts` 첫 행 | `export.test.ts`, `impact.test.ts`(데모 사용) | D01 |
| 8 UX(한국어, 저장 상태, 삭제 확인, 빈 화면, 긴 텍스트, 검색·필터, 반응형) | `src/ui/common.tsx`, `styles.css`, 각 페이지 | — | X01, X08, X10, X11, R01 |
| 9 데이터 무결성 | `src/domain/integrity.ts`, `repo.ts` tx/delete*, `schemas.ts` | “원자성·프로젝트 분리” 묶음, `backup.test.ts` | S19, X06~X09 |
| 10 학교 요구사항 | 미반영 (사이트 접근 차단) | — | — |
| 13 필수 시나리오 20개 | — | — | S01~S20 (번호 1:1) |
| 13 예외 상황 10개 | — | `repo.test.ts`, `backup.test.ts` | X01~X11 |

### 완료 기준(18장) 점검

| # | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | 웹앱 실행 | 충족 | 빌드 성공, E2E 전 단계 |
| 2 | 프로젝트 생성·수정 | 충족 | S01, S02 |
| 3 | 변수·가설 등록·연결 | 충족 | S03, S04 |
| 4 | 문헌·근거 등록·연결 | 충족 | S05, S06 |
| 5 | 피드백 기록 | 충족 | S10 |
| 6 | 영향 분석이 실제 연결 관계 반영 | 충족 | S12, D01, `impact.test.ts` |
| 7 | 사용자가 적용 여부 결정 | 충족 | S12(확인 전 적용 불가), S13, 취소 테스트 |
| 8 | 기존 계획서 버전 보존 | 충족 | S14 (적용 전후 v1 DOCX 본문 동일) |
| 9 | DOCX 생성 | 충족 (MS Word 직접 확인은 미검증) | S09, `verify_outputs.py` |
| 10 | XLSX 생성 | 충족 (MS Excel 직접 확인은 미검증) | S16, `verify_outputs.py` |
| 11 | 백업·복원 | 충족 | S17~S19, X04, X05, X09 |
| 12 | 재접속 후 데이터·연결 유지 | 충족 | S02, S20 |
| 13 | 필수 브라우저 테스트 통과 | 충족 (Chromium 한정) | 34/34 |
| 14 | 테스트 결과·증거 제공 | 충족 | `docs/evidence/` |
| 15 | GitHub에 코드·기록 보존 | 충족 | 작업 브랜치 푸시 |

단서: 9·10번은 “실제 엑셀/워드 프로그램”을 LibreOffice로 대신 확인했습니다. MS Office에서의 확인은 사용자 PC에서 한 번 열어 보는 것으로 끝낼 수 있습니다.

### 검수자가 직접 확인하기 좋은 지점

1. `src/domain/impact.ts` — 영향 항목이 id 연결과 문자열 포함만으로 정해지는지
2. `src/db/repo.ts`의 `applyChangeRequest` — 한 트랜잭션인지, 버전을 덮어쓰지 않는지(`add`만 사용)
3. `src/db/backup.ts`의 `parseBackup`·`restoreBackup` — 검증 순서와 롤백
4. `src/demo/demo.ts` — 실제처럼 보이는 서지정보·DOI가 없는지
5. `e2e/run.mjs` — 단계별 단언이 화면 표시가 아니라 파일 내용·DB 건수까지 확인하는지

## 작업 재개 안내

- 마지막 성공 단계: Phase 5 (통합 검증·문서화) 완료
- 마지막 테스트 결과: 타입 검사 통과, 단위 35/35, E2E 34/34, 파일 검증 22/22
- 다음 실행 명령: `cd projects/thesis-manager && npm install && npm run build && npm test && npm run e2e`
- 주의: E2E는 4188 포트를 사용합니다. 컨테이너에 UTF-8 로캘이 없으면 한글 파일명이 깨지므로 스크립트가 브라우저를 `C.UTF-8`로 실행합니다.
- 남은 일: KNOWN_ISSUES.md 의 “확인 필요”와 “기능상 한계” 1·2번, DEVELOPMENT_PLAN.md 의 다음 단계
