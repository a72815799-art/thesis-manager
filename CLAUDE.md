# CLAUDE.md — 논문 연구관리(thesis-manager) 개발 지침

새 세션은 이 문서부터 읽습니다. 이전 대화의 기억이 아니라 **저장소에 있는 코드·문서·테스트 결과**를 기준으로 판단합니다.

## 제품 목적

한국어 상담·심리 석사과정 대학원생(설문 기반 양적 연구)이 연구 주제·변수·가설·문헌·근거·지도교수 피드백·계획서 버전을
하나의 프로젝트로 연결해 관리하는 로컬 우선 웹앱. AI 논문 작성기·챗봇이 아니다.
지시서의 임시 제품명은 ResearchFlow이나 기존 이름 “논문 연구관리 / thesis-manager”를 유지한다.

## 금지사항

- 실제처럼 보이는 논문·DOI·통계 결과·연구 근거를 만들어 내지 않는다. 빈 항목은 ‘작성 필요’로 둔다.
- 프로그램이 원문을 확인하지 않았는데 근거를 ‘사용자 확인 완료’로 표시하지 않는다. 상태는 사용자 조작으로만 바뀐다.
- 가상 데이터에는 화면·DOCX·XLSX·백업 모두 ‘가상 예시 데이터’ 표시를 넣는다.
- 기존 계획서 버전의 내용을 수정·삭제하는 경로를 만들지 않는다.
- 교수 피드백 저장만으로 연구 데이터를 바꾸지 않는다. 변경은 변경 요청 → 영향 확인 → 사용자 승인으로만.
- 관계를 이름 문자열로 저장하지 않는다(항상 id).
- 미구현 기능(윤리·척도, 통계, 원고, 심사, AI, 계정·결제)을 메뉴에 노출하지 않는다.
- 검증하지 않은 기능을 완료로 보고하지 않는다. 학교 요구사항은 확인한 것만 적고 나머지는 ‘확인 필요’.
- 사용자 승인 없이 하지 않는 것: 유료 API·결제, 공개 배포, 실제 사용자 데이터 외부 전송, 기존 자료 파괴적 삭제,
  기본 브랜치 직접 수정·PR 병합, 실제 설문 응답·내담자 정보 처리, 비용이 드는 인프라.
- 저장소의 다른 프로젝트(`projects/bowenscope-v2`, `artifacts/`, `lib/` 등)는 수정하지 않는다.

## 개발 단계

Phase 0 환경·설계 → 1 프로젝트·연구모형 → 2 문헌·근거 → 3 면담·변경 관리 → 4 출력·백업 → 5 품질 개선 → 6 최종 인계.
현재 위치는 `DEVELOPMENT_STATE.md`에 있다. 같은 오류는 최대 3회까지 수정하고, 실패하면 기록 후 멈춘다.

## 테스트 기준

```bash
cd projects/thesis-manager
npm ci
npm run typecheck          # 오류 0
npm test                   # 단위 (Vitest + fake-indexeddb)
npm run build && npm run e2e   # 브라우저 E2E (Playwright + Chromium, 포트 4188)
npm run verify:files       # 내려받은 DOCX/XLSX/백업 독립 검증 (python-docx, openpyxl, LibreOffice)
```

- 기능을 바꾸면 관련 단위 테스트와 E2E를 함께 고치고 전체를 다시 돌린다.
- DOCX·XLSX는 “생성됨”이 아니라 파일을 다시 열어 내용을 대조한다.
- 테스트 수와 결과는 `TEST_REPORT.md`, 요구사항별 상태는 `REQUIREMENTS_MATRIX.md`에 반영한다.
- 컨테이너에 UTF-8 로캘이 없으면 한글 파일명이 깨진다. E2E 스크립트가 브라우저를 `C.UTF-8`로 실행한다.

## GitHub 규칙

- 저장소 `a72815799-art/BowenScope-V2`, 작업 폴더 `projects/thesis-manager/`.
- 작업 브랜치에서만 커밋·푸시한다. `main`에 직접 푸시하거나 PR을 병합하지 않는다.
- 이전 PR이 병합되었으면 작업 브랜치를 최신 `main`에서 다시 시작한다.
- 기능 단위로 커밋하고, 인증정보·개인정보·실제 연구 자료를 커밋하지 않는다.

## 상태 문서 위치

| 문서 | 용도 |
|---|---|
| `DEVELOPMENT_STATE.md` | 현재 Phase, 완료·부분·실패·미검증, 마지막 테스트, 다음 작업, 승인 필요 사항 |
| `REQUIREMENTS_MATRIX.md` | 요구사항 ID별 구현·테스트·증거·상태 |
| `TEST_REPORT.md` | 테스트 결과와 증거 위치 |
| `KNOWN_ISSUES.md` | 한계·미검증 |
| `HANDOFF.md` | 인계·독립 검수 안내 |
| `ARCHITECTURE.md` | 구조·데이터 모델·확장 지점 |
| `docs/SCHOOL_REQUIREMENTS.md` | 학교 공식 안내 확인 기록 |

## 재개 절차 (새 세션)

**자동 재개는 설정되어 있지 않다.** 사용자가 새 세션에서 “CLAUDE.md를 읽고 이어서 진행”이라고 지시하면 아래 순서로 한다.

1. 이 문서 읽기
2. `DEVELOPMENT_STATE.md` 읽기
3. `REQUIREMENTS_MATRIX.md` 읽기
4. `git status`, `git log -5`, 열린 PR 확인
5. `npm ci && npm run typecheck && npm test && npm run build && npm run e2e`로 마지막 성공 상태 재확인
6. 추적표에서 ‘완료·검증’이 아닌 요구사항 확인
7. 마지막 성공 단계 이후부터 진행. 이미 검증된 기능은 다시 만들지 않는다.
8. 단계가 끝날 때마다 `DEVELOPMENT_STATE.md`를 갱신하고 커밋·푸시
