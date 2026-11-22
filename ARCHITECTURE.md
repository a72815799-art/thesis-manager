# 아키텍처

## 기술 선택과 이유

| 선택 | 이유 |
|---|---|
| React 18 + TypeScript + Vite | 지시서 권장 구성. 타입으로 데이터 모델을 고정하고 빌드가 빠름 |
| IndexedDB + Dexie 4 | 서버 없는 로컬 저장. Dexie 트랜잭션으로 “전부 저장 아니면 전부 취소”를 보장. `useLiveQuery`로 화면 자동 갱신 |
| zod 4 | 저장·백업 복원 시 런타임 스키마 검증 |
| docx 9 | 브라우저에서 실제 DOCX(OOXML) 생성. 한글 글꼴(맑은 고딕) 지정 |
| exceljs 4 | 실제 XLSX 생성(서식·열 너비·필터 지원) |
| react-router (HashRouter) | 서버 설정 없이 정적 호스팅·파일 경로 어디서든 동작 |
| 직접 작성한 CSS | 화면 수가 적어 UI 프레임워크 없이도 일관성 유지 가능. 의존성·용량 최소화 |
| Vitest + fake-indexeddb | 저장소 계층을 실제 IndexedDB API로 단위 테스트 |
| Playwright(Chromium) | 실제 브라우저 E2E, 다운로드 파일 검증 |

DOCX·XLSX 라이브러리는 용량이 커서 내려받기 버튼을 누를 때만 불러옵니다(동적 import).

## 폴더 구조

```
src/
  domain/      순수 로직 (브라우저·DB 비의존, 단위 테스트 대상)
    types.ts       엔터티 타입, 라벨
    schemas.ts     zod 스키마 (types.ts 와 1:1)
    impact.ts      변경 영향 분석
    proposal.ts    계획서 스냅샷 생성, 연구모형 경로 도출, 버전 간 차이
    integrity.ts   참조 무결성 검사, 관계 지문
    progress.ts    대시보드 통계, 진행률 기준 9개
  db/
    db.ts          Dexie 스키마(버전 1), id 발급
    repo.ts        모든 쓰기 작업(검증·중복 검사·연쇄 삭제·수정 이력·변경 적용)
    backup.ts      백업 내보내기 / 검증 / 복원(새로·덮어쓰기·사본)
  export/      docx.ts, xlsx.ts
  demo/        demo.ts (가상 데모 시드)
  ui/          App.tsx(라우팅·레이아웃), common.tsx, ModelDiagram.tsx, pages/*
tests/         단위 테스트
e2e/run.mjs    브라우저 E2E
scripts/verify_outputs.py  내보낸 파일 독립 검증
docs/evidence  E2E 결과·화면 캡처·내려받은 파일·LibreOffice 변환본
```

## 데이터 모델

모든 엔터티는 UUID `id`와 `projectId`를 가지며 관계는 **id로만** 연결합니다. `V1`, `H1`, `L1`, `E1` 같은 `code`는 사람이 읽는 표시용 번호입니다(프로젝트별 카운터, 삭제 후 재사용 안 함).

| 엔터티 | 테이블 | 주요 관계 |
|---|---|---|
| Project | projects | — |
| ResearchSubject | subjects | 프로젝트당 1건 |
| ResearchVariable | variables | — |
| Hypothesis | hypotheses | `fromVariableId` / `viaVariableId` / `toVariableId` / `extraVariableIds` → Variable |
| Literature | literature | `variableIds` → Variable |
| Evidence | evidence | `literatureId` → Literature, `hypothesisIds` → Hypothesis, `variableIds` → Variable |
| Attachment | attachments (+ attachmentBlobs) | `literatureId` → Literature. `storage`: `stored`(본문 보관) / `reference-only`(참조만) |
| MeetingPrep | meetings | — |
| Feedback | feedback | `targets[]` → 연구 항목 |
| ChangeRequest | changeRequests | `feedbackId` → Feedback, `target{type,id,field}`, `preservedVersionId` → ProposalVersion |
| ImpactReview | impactReviews | `changeRequestId` → ChangeRequest, 영향 항목 스냅샷 + 사용자 확인 상태 |
| ProposalVersion | proposalVersions | `previousVersionId`, `changeRequestId`, `feedbackId`, 불변 `snapshot` |
| ChangeLogEntry | changeLog | 모든 등록·수정·삭제·변경 적용 기록 |

**연구모형은 저장하지 않습니다.** 가설의 유형(직접/매개/조절)과 변수 연결에서 매번 도출하므로(`deriveModelEdges`) 그림과 데이터가 어긋날 수 없습니다.

## 무결성 보장 방식

| 위험 | 대응 | 위치 |
|---|---|---|
| 문헌 삭제 후 끊어진 근거 참조 | 문헌 삭제 시 근거·첨부를 같은 트랜잭션에서 함께 삭제(사전 확인 대화상자에 건수 표시) | `repo.deleteLiterature` |
| 변수명 수정으로 가설 연결 끊김 | 이름이 아니라 id로 연결 | `types.ts` |
| 사용 중인 변수 삭제 | 가설에서 쓰는 변수는 삭제 차단, 근거·문헌·피드백의 참조는 정리 | `repo.deleteVariable` |
| 복원 후 ID 충돌 | 충돌 감지 시 전체 id 재발급(참조 포함) | `backup.planRestore`, `remapIds` |
| 계획서 버전 손상 | 버전은 `add`로만 생성, snapshot 수정 함수 없음. 상태 전환(초안→확정)만 가능 | `repo.insertVersion`, `confirmProposalVersion` |
| 저장 중 오류로 일부만 변경 | 모든 쓰기를 단일 Dexie 트랜잭션으로 실행 → 실패 시 전체 롤백 | `repo.tx` |
| 프로젝트 간 데이터 혼합 | 모든 조회가 `projectId` 기준, 다른 프로젝트 id 연결 시 저장 거부 | `repo.save*` |
| 손상된 백업 | 형식 → 스키마 버전 → zod → 참조 무결성 → 건수 검사 후에만 복원 가능 | `backup.parseBackup` |
| 복원 실패 | 덮어쓰기 삭제까지 포함해 한 트랜잭션. 복원 직후 재검증 실패 시에도 롤백 | `backup.restoreBackup` |

## 변경 영향 분석 (`domain/impact.ts`)

`analyzeImpact(bundle, target, oldValue)`는 순수 함수이며 저장소를 바꾸지 않습니다. 영향 항목 선정 근거는 두 가지뿐입니다.

1. **id 연결**: 변수 → 그 변수를 쓰는 가설 → 그 가설·변수에 연결된 근거 → 근거의 출처 문헌
2. **본문에 기존 표현이 실제로 포함**: 제목·목적·배경·연구 질문·가설 문장

| 변경 대상 | 영향 항목 |
|---|---|
| 연구 대상 | 같은 기록의 다른 칸(정의·모집 기준 등, 값이 있을 때), 기존 표현이 들어 있는 개요 문장, 모든 가설(모집단 전제), **가설에 연결된** 근거와 그 문헌, 후속 영역 안내(척도·IRB), 해당 계획서 문단 |
| 변수 | 그 변수를 쓰는 가설, 그 변수·가설에 연결된 근거와 문헌, 관련 문헌으로 등록된 문헌, (이름 변경 시) 기존 이름이 들어 있는 문장 |
| 가설 문장 | 그 가설의 근거와 문헌, 연결 변수(참고) |
| 연구 개요 | 목적 변경 시 연구 질문, 제목 변경 시 제목에 나온 변수(참고) |

가설에 연결되지 않은 근거, 해당 변수를 쓰지 않는 가설은 포함되지 않습니다(테스트로 확인).

적용(`repo.applyChangeRequest`)은 사용자가 영향 항목 확인을 체크하고 확인 대화상자에서 승인해야 실행되며, 한 트랜잭션 안에서
① 적용 직전 상태를 계획서 버전으로 보존(최신 버전과 같으면 생략) ② 값 변경 ③ 영향 항목별 검토 기록 생성
④ 영향받는 ‘사용자 확인 완료’ 근거를 ‘재검토 필요’로 전환 ⑤ 피드백의 수정 전/후 기록 ⑥ 수정 이력 기록을 수행합니다.

## 백업 형식

```json
{ "format": "thesis-manager-backup", "schemaVersion": 1, "appVersion": "0.1.0", "exportedAt": "…",
  "isDemo": false, "counts": { … }, "filesIncluded": true,
  "bundle": { "project": …, "subject": …, "variables": [], … },
  "attachmentFiles": { "<첨부 id>": "<base64>" } }
```

스키마를 바꿀 때: `SCHEMA_VERSION` 증가 → `db.ts`에 `version(n).upgrade()` 추가 → `backup.ts`의 `MIGRATIONS[n-1]`에 변환 함수 추가.

## 확장 지점 (5~8 영역, 계정·구독)

- 새 영역은 `projectId`를 가진 새 테이블 + `ProjectBundle` 필드 + `integrity.ts` 검사 추가 형태로 붙습니다.
- 영향 분석은 이미 `extension` 타입 항목(척도·IRB 안내)을 내보내므로, 척도·윤리 엔터티가 생기면 안내 문구를 실제 id 연결로 교체하면 됩니다.
- 모든 쓰기가 `repo.ts`를 거치므로, 향후 서버 동기화·계정·권한은 이 계층을 API 호출로 바꾸는 방식으로 도입할 수 있습니다. UI는 `repo` 함수와 `ProjectBundle`만 압니다.
- AI 기능은 `ProjectBundle`을 읽어 “점검 결과”만 돌려주는 순수 함수 자리(`domain/`)에 둘 수 있습니다. 근거·출처를 생성해 저장하는 경로는 만들지 않았습니다.
- 학교 양식은 연구 데이터와 분리하기 위해 `ProposalSnapshot`(데이터) → `export/docx.ts`(양식) 구조로 나눴습니다. 학교별 양식은 내보내기 모듈을 추가하는 방식으로 대응합니다.
