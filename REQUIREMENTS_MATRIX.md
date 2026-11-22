# 요구사항 추적표

기준: “논문 연구관리 플랫폼 자율 개발 최종 지시서”의 4~7, 13장. 결과는 개발자 실행 기준이며 독립 검수와는 별개입니다.

- 코드 경로는 `projects/thesis-manager/` 기준입니다.
- 단위 테스트: `tests/*.test.ts` (`npm test`), E2E: `e2e/run.mjs`의 단계 ID (`npm run e2e`), 결과 원본 `docs/evidence/e2e-results.json`
- 상태: **완료·검증** / 완료·일부 미검증 / 부분 / 미구현

## 4.1 프로젝트 관리

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-101 | 프로젝트 생성·조회·수정·삭제 | `src/db/repo.ts` createProject·updateProject·deleteProject, `src/ui/pages/ProjectsPage.tsx`, `OverviewPage.tsx`, `DataPage.tsx` | `repo.test.ts`, E2E S01·S02·S18 | `screens/01-overview.png`, `22-project-list.png` | 완료·검증 |
| R-102 | 제목·목적·배경·대상·방법·단계·메모 | `OverviewPage.tsx`, `src/domain/types.ts` Project·ResearchSubject | S01, S02 | `screens/01-overview.png` | 완료·검증 |
| R-103 | 일정 | `OverviewPage.tsx` 주요 일정 | (자동 테스트 없음) | — | 완료·일부 미검증 |
| R-104 | 최근 수정 이력 | `repo.ts` log, `HistoryPage.tsx`, `Dashboard.tsx` | `repo.test.ts` “변수명을 바꿔도…” | `screens/12-dashboard.png` | 완료·검증 |
| R-105 | 프로젝트 목록·검색 | `ProjectsPage.tsx` | P01 | `screens/22-project-list.png` | 완료·검증 |
| R-106 | 대시보드 수치(변수·가설·문헌·확인 근거·재검토·미처리 피드백) | `src/domain/progress.ts` computeStats, `Dashboard.tsx` | `repo.test.ts`, S20, X11 | `screens/12-dashboard.png`, `17-demo-dashboard.png` | 완료·검증 |
| R-107 | 진행률은 정의된 완료 조건으로 계산 | `progress.ts` computeProgress (기준 9개) | `repo.test.ts` “빈 프로젝트도…” | 대시보드 화면 | 완료·검증 |

## 4.2 연구변수·연구모형

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-201 | 변수 등록(ID·이름·정의 2종·역할 5종) | `repo.ts` saveVariable, `ModelPage.tsx` | `repo.test.ts`, S03 | `screens/02-model.png` | 완료·검증 |
| R-202 | 변수의 관련 문헌·가설·변경 이력 표시 | `ModelPage.tsx` 연결 열·이력 창 | S03(표), 이력은 `repo.test.ts` | `screens/18-demo-model.png` | 완료·검증 |
| R-203 | 가설 생성과 변수 연결 | `repo.ts` saveHypothesis | `repo.test.ts`, S04, X01 | `screens/02-model.png` | 완료·검증 |
| R-204 | 방향성 있는 연구모형, 매개 경로와 직접효과 구분 | `src/domain/proposal.ts` deriveModelEdges, `src/ui/ModelDiagram.tsx` | `repo.test.ts` “연구모형 경로가…”, S04, D01 | `screens/18-demo-model.png` | 완료·검증 |
| R-205 | 시각화와 데이터 일치 | 모형을 저장하지 않고 가설에서 도출 | S04, X06 | 위와 같음 | 완료·검증 |
| R-206 | 조절효과 표시 | `ModelDiagram.tsx` 조절 경로 | (화면 E2E 없음) | — | 완료·일부 미검증 |

## 4.3 문헌 관리

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-301 | 문헌 수동 등록(제목·저자·연도·출처·DOI·URL·대상·방법·결과·메모) | `repo.ts` saveLiterature, `LiteraturePage.tsx` | `repo.test.ts`, S05, X02 | `screens/03-literature-detail.png` | 완료·검증 |
| R-302 | PDF 첨부(사용자 제공 파일만), 보존 범위 표시 | `repo.ts` addAttachment (PDF 검사, 본문 저장/참조만) | `repo.test.ts`, S06, X03, S19 | `files/E2E_복원된_첨부.pdf` | 완료·검증 (큰 파일 미검증) |
| R-303 | 검증되지 않은 문헌·내용을 확인 완료로 표시하지 않음 | 문헌에는 확인 상태 없음, 근거는 `unverified`로 시작 | `repo.test.ts` “새 근거는 미확인…” | — | 완료·검증 |
| R-304 | 허위 논문·DOI·결과 생성 금지 | 자동 조회·생성 기능 없음, 데모 문헌은 `isFictional` | `src/demo/demo.ts` 검토, D01 | `screens/19-demo-literature.png` | 완료·검증 |

## 4.4 근거 관리

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-401 | 문헌별 여러 근거(ID·페이지·내용·발췌/요약·변수·가설·메모) | `repo.ts` saveEvidence, `LiteraturePage.tsx` EvidenceForm | `repo.test.ts`, S06 | `screens/03-literature-detail.png` | 완료·검증 |
| R-402 | 검토 상태 4종 | `setEvidenceStatus`, StatusSelect | `repo.test.ts`, S07 | `screens/04-evidence-table.png` | 완료·검증 |
| R-403 | 가설별 근거 비교표 | `EvidencePage.tsx` | S07, D01 | `screens/20-demo-evidence.png` | 완료·검증 |
| R-404 | 사용자 확인과 단순 저장 구분 | 상태 배지·집계, XLSX 안내 시트 | S07, S16 | `files/E2E_근거비교표.xlsx` | 완료·검증 |

## 4.5 지도교수 면담

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-501 | 면담 준비 페이지(제목·목적·질문·대상·모형·가설·문헌·근거·질문 항목) | `MeetingPage.tsx`, `repo.ts` saveMeeting | S08 | `screens/05-meeting-sheet.png` | 완료·검증 |
| R-502 | 미해결 쟁점 | `MeetingPage.tsx` (미처리 피드백·대기 중 변경 요청·재검토 근거·근거 없는 가설 자동 집계) + 사용자가 적는 ‘확인이 필요한 사항’ | S08(영역 존재) | 위와 같음 | 완료·일부 미검증 (집계 내용의 자동 테스트 없음) |
| R-503 | 피드백 등록(날짜·원문·관련 항목·메모·결정·이전/새 값·상태·완료일) | `repo.ts` saveFeedback, `FeedbackPage.tsx` | `repo.test.ts`, S10, X01 | `screens/08-feedback.png` | 완료·검증 |
| R-504 | 수정 제안 | 피드백에 연결한 변경 요청(`createChangeRequest`) | S11 | `screens/06-impact-preview.png` | 완료·검증 |
| R-505 | 피드백 등록만으로 자동 수정하지 않음 | `saveFeedback`은 다른 테이블을 건드리지 않음 | `repo.test.ts` “피드백을 저장해도…”, S10 | — | 완료·검증 |

## 4.6 변경 영향 분석

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-601 | 연결 데이터 기반 영향 항목 식별(대상 정의·모집 기준·가설·조작적 정의·문헌·근거·계획서 문단) | `src/domain/impact.ts` analyzeImpact | `impact.test.ts` 5개, S12, D01 | `screens/06-impact-preview.png`, `21-demo-impact.png` | 완료·검증 |
| R-602 | 일괄 경고 금지 | 연결되지 않은 근거·무관한 가설·빈 조작적 정의는 제외 | `impact.test.ts` “변수 변경…”, “연결이 전혀 없는…”, “조작적 정의가 입력된 변수만…”, S12 | 위와 같음 | 완료·검증 |
| R-603 | 항목별 표시(관련 ID·변경 전·제안·이유·재검토 상태·사용자 확인) | `ChangeRequestPage.tsx`, ImpactReview | S12, S13 | `screens/07-impact-reviews.png` | 완료·검증 (ID는 항목 이름에 포함: KNOWN_ISSUES 13) |
| R-604 | 사용자 승인 후에만 적용 | `applyChangeRequest`, 확인 체크 + 확인 대화상자 | `impact.test.ts`, S12·S13 | — | 완료·검증 |
| R-605 | 승인 시 새 버전 생성, 이전 버전 보존 | `applyChangeRequest` createVersionAfter·preserveVersion | `impact.test.ts` “승인과 함께 새 버전…”, S13~S15 | `screens/09-proposal-versions.png` | 완료·검증 |

## 4.7 계획서 버전

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-701 | 버전 ID·번호·생성일·피드백·사유·차이·승인 상태·스냅샷 | `types.ts` ProposalVersion, `repo.ts` insertVersion, `ProposalPage.tsx` | `impact.test.ts`, S08, S15 | `screens/09-proposal-versions.png` | 완료·검증 |
| R-702 | 재접속 후 과거 버전 확인 | IndexedDB 보존 | S19, S20 | — | 완료·검증 |
| R-703 | 이전 버전 변경 방지 | `src/db/db.ts` 미들웨어, 수정·삭제 UI 없음 | `impact.test.ts` “이전 계획서 버전의 내용은…”, S14 | `files/E2E_연구계획서_v1_변경적용후_재다운로드.docx` | 완료·검증 |

## 4.8~4.10 출력·백업

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-801 | DOCX 10개 항목, 한글·표·제목·문단 | `src/export/docx.ts` | `export.test.ts`, S09·S15, `verify_outputs.py` | `files/*.docx`, `rendered/*.pdf` | 완료·검증 (MS Word 직접 확인 미검증) |
| R-802 | 빈 항목 ‘작성 필요’, 문장 생성 없음 | `docx.ts` todo, `proposal.ts` buildSnapshot | `export.test.ts`, X11 | `files/E2E_빈프로젝트_계획서.docx` | 완료·검증 |
| R-901 | XLSX 필수 열 11개(+근거 ID·구분) | `src/export/xlsx.ts` | `export.test.ts`, S16, `verify_outputs.py` | `files/E2E_근거비교표.xlsx` | 완료·검증 (MS Excel 직접 확인 미검증) |
| R-902 | 한글·줄바꿈·열 너비·정확성 | `xlsx.ts` | `export.test.ts`(줄바꿈·특수문자·수식 문자열), X10 | `files/E2E_근거비교표_긴텍스트.xlsx` | 완료·검증 |
| R-1001 | 전체 백업(프로젝트~첨부 PDF) | `src/db/backup.ts` exportBackup | `backup.test.ts`, S17 | `files/E2E_백업.json` | 완료·검증 |
| R-1002 | 스키마 버전 + 무결성 검증 정보 | `backup.ts` integrity(SHA-256), `src/domain/sha256.ts` | `sha256.test.ts`, `backup.test.ts` “무결성 해시…”, S17, X04 | 위와 같음 | 완료·검증 |
| R-1003 | 첨부 바이너리 백업 또는 미포함 명시 | `filesIncluded`, 복원 시 ‘참조만 저장’ 전환 | `backup.test.ts`, X12 | `files/E2E_백업_PDF미포함.json` | 완료·검증 |
| R-1004 | 손상된 백업 거부 | `parseBackup` | `backup.test.ts`, X04 | — | 완료·검증 |
| R-1005 | 복원 실패 시 기존 데이터 보존 | `restoreBackup` 단일 트랜잭션 | `backup.test.ts`, X09 | — | 완료·검증 |
| R-1006 | 반복 복원 시 ID 충돌·중복 없음 | `planRestore`, `remapIds` | `backup.test.ts` “같은 백업을 여러 번…”, X05, X14 | — | 완료·검증 |
| R-1007 | 복원 후 관계·버전 동일 | `restoreBackup` 재검증 | `backup.test.ts`, S18·S19 | `files/E2E_백업_복원후.json` | 완료·검증 |

## 5~7 데모·UX·학교

| ID | 요구사항 | 구현 | 테스트 | 증거 | 상태 |
|---|---|---|---|---|---|
| R-1101 | 지정 주제의 가상 데모(변수 3·가설·문헌·근거·피드백·대상 변경 사례) | `src/demo/demo.ts` | `impact.test.ts`, `export.test.ts`, D01 | `screens/17~21-demo-*.png` | 완료·검증 |
| R-1102 | 화면·출력 파일에 ‘가상 예시 데이터’ 표시, 실제 프로젝트와 구분 | `App.tsx` 배너, `docx.ts`, `xlsx.ts`, `backup.ts` notice | D01, `verify_outputs.py` | `files/데모_*.{docx,xlsx,json}` | 완료·검증 |
| R-1103 | 허위 서지정보 없음 | 데모 문헌에 DOI·연도·실제 학술지명 없음 | 코드 검토 | — | 완료·검증 |
| R-1201 | 한국어 메뉴, 일관된 화면, 긴 텍스트 대응 | `src/ui/styles.css`, 각 페이지 | X10 | `screens/15-long-text.png` | 완료·검증 |
| R-1202 | 빈 화면·오류 안내·삭제/덮어쓰기 확인 | `common.tsx` Empty·confirm·toast | X01, X07, X05, X11 | `screens/16-empty-project.png` | 완료·검증 |
| R-1203 | 저장 중·저장 완료·저장 실패 표시 | `common.tsx` run, `App.tsx` save-state | S01, X08 | `screens/14-save-failure.png` | 완료·일부 미검증 (‘저장 중’ 문구는 자동 테스트 없음) |
| R-1204 | 검색·필터 | 프로젝트·문헌·근거·피드백·이력 | P01, 문헌·근거 필터는 수동 확인만 | — | 완료·일부 미검증 |
| R-1205 | 문헌·가설·근거 간 이동 | 각 표의 링크 | S19(이동 사용) | — | 완료·검증 |
| R-1206 | 키보드 접근성 | 기본 버튼·입력, Esc 닫기, 초점 표시 | K01 | — | 부분 (스크린 리더·초점 가두기 미검증) |
| R-1207 | 반응형(모바일 핵심 기능) | `styles.css` | R01 (820px·390px 에뮬레이션) | `screens/23-*.png` | 완료·일부 미검증 (실제 기기 미확인) |
| R-1208 | 저장하지 않은 입력 보호 | `src/ui/unsaved.ts`, `OverviewPage.tsx` | X13 | — | 완료·검증 (연구 개요 화면 한정) |
| R-1301 | 학교 공식 안내 확인 | `docs/SCHOOL_REQUIREMENTS.md` | — | 문서 | 부분 (절차 개관도·서식 1쪽 제목만 확인, 나머지 ‘확인 필요’) |
| R-1302 | 학교 서식과 데이터 분리, HWP 호환 미주장 | `ProposalSnapshot` → `export/` | — | `ARCHITECTURE.md` | 구조만 마련 (학교 양식 미반영) |

## 13 필수 E2E 시나리오

| 지시서 번호 | 내용 | E2E 단계 | 결과 |
|---|---|---|---|
| 1 | 신규 프로젝트 생성 | S01 | 통과 |
| 2 | 변수 3개 등록 | S03 | 통과 |
| 3 | 가설 등록 | S04 | 통과 |
| 4 | 연구모형 확인 | S04 | 통과 |
| 5 | 가상 문헌 등록 | S05 | 통과 |
| 6 | 근거 연결 | S06 | 통과 |
| 7 | 근거 확인 상태 변경 | S07 | 통과 |
| 8 | 면담용 계획서 생성 | S08 | 통과 |
| 9 | DOCX 출력 | S09 | 통과 |
| 10 | 지도교수 피드백 등록 | S10 | 통과 |
| 11 | 연구 대상 변경 요청 | S11 | 통과 |
| 12 | 영향 분석 결과 확인 | S12 | 통과 |
| 13 | 사용자 승인 후 변경 | S13 | 통과 |
| 14 | 기존 계획서 보존 확인 | S14 | 통과 |
| 15 | 새 계획서 생성 | S15 | 통과 |
| 16 | XLSX 출력 | S16 | 통과 |
| 17 | 프로젝트 백업 | S17 | 통과 |
| 18 | 프로젝트 복원 | S18 | 통과 |
| 19 | 모든 관계 및 버전 확인 | S19 | 통과 |
| 20 | 재접속 후 데이터 확인 | S02, S20 | 통과 |

| 예외 테스트 | 단위 테스트 | E2E | 결과 |
|---|---|---|---|
| 잘못된 입력 | `repo.test.ts` 필수값 | X01, X02(연도 형식) | 통과 |
| 중복 데이터 | `repo.test.ts` 중복 | X02 | 통과 |
| 빈 프로젝트 | `repo.test.ts`, `export.test.ts` | X11 | 통과 |
| 긴 한국어 문자열 | `repo.test.ts`, `export.test.ts` | X10 | 통과 |
| 손상된 백업 | `backup.test.ts` | X04 | 통과 |
| 존재하지 않는 참조 | `repo.test.ts`, `backup.test.ts` | X04, X07 | 통과 |
| 저장 실패 | `repo.test.ts` 원자성 | X08 | 통과 |
| 복원 실패 | `backup.test.ts` | X09 | 통과 |
| 프로젝트 간 데이터 혼합 | `repo.test.ts` | X06, X11 | 통과 |
| PDF 첨부 누락 | `backup.test.ts` | X12 | 통과 |
| 이전 계획서 변경 방지 | `impact.test.ts` | S14 | 통과 |
