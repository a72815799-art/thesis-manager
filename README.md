# 논문 연구관리 (thesis-manager)

한국어 상담·심리 대학원생(설문 기반 양적 연구, 석사과정)을 위한 논문 연구관리 웹앱입니다.
연구 주제·연구모형·문헌 근거·지도교수 피드백·연구계획서 버전을 **하나의 프로젝트 안에서 ID로 연결**해 관리하고,
무언가를 바꾸기 전에 **어떤 가설·근거·문헌을 다시 확인해야 하는지** 보여 줍니다.

- 서버 없이 브라우저에서 동작하는 로컬 우선 앱입니다. 데이터는 그 브라우저의 IndexedDB에만 저장됩니다.
- AI API·계정·결제·클라우드 저장은 없습니다(의도적으로 제외).
- 현재 범위는 MVP 1~4 영역입니다: ① 프로젝트·진행 현황 ② 연구 주제·연구모형 ③ 문헌·근거 ④ 계획서·지도교수 피드백.

> 저장 위치 안내: 이 프로젝트 전용 저장소가 없어 `BowenScope-V2` 저장소의 `projects/thesis-manager/`에 독립 프로젝트로 두었습니다.
> 기존 BowenScope 코드는 전혀 수정하지 않았고 의존 관계도 없습니다. 폴더를 그대로 새 저장소로 옮길 수 있습니다.

## 실행

Node.js 20 이상(개발·검증은 22)이 필요합니다.

```bash
cd projects/thesis-manager
npm install
npm run dev        # 개발 서버 → http://localhost:5173
```

배포용 정적 파일:

```bash
npm run build      # dist/ 생성 (타입 검사 포함)
npm run preview    # http://localhost:4173 에서 dist/ 확인
```

`dist/`는 상대 경로로 빌드되어 어떤 정적 호스팅 경로에 올려도 동작합니다. **외부 배포는 하지 않았습니다**(사용자 승인 필요 사항).

## 테스트

```bash
npm run typecheck      # TypeScript 검사
npm test               # 단위 테스트 43개 (Vitest + fake-indexeddb)
npm run build && npm run e2e   # 브라우저 E2E 39단계 (Playwright + Chromium)
npm run verify:files   # 내려받은 DOCX/XLSX/백업을 python-docx·openpyxl·LibreOffice로 독립 검증
```

- E2E는 Playwright와 Chromium이 전역 설치된 환경(이 클라우드 환경)에서 그대로 동작합니다.
  다른 PC에서는 `npm i -D playwright && npx playwright install chromium` 후 실행하세요.
- `verify:files`는 Python 3, `python-docx`, `openpyxl`, LibreOffice(`soffice`)가 필요합니다.

## 처음 써 보기

1. 첫 화면에서 **가상 데모 열기** — “한부모가족 대학생의 지각된 차별과 외상 후 성장의 관계에서 회복탄력성의 매개효과” 가상 프로젝트가 열립니다.
   모든 화면과 내보낸 파일에 ‘가상 예시 데이터’라고 표시되며, 문헌은 실재하지 않는 예시입니다(DOI·학술지명 없음).
2. **피드백·변경 요청 → CR1 영향 확인·적용**에서 “연구 대상을 성인으로 변경”할 때 영향받는 항목을 확인하고 적용해 보세요.
3. **연구계획서**에서 버전을 만들고 DOCX를, **근거 비교표**에서 XLSX를 내려받습니다.
4. **백업·복원**에서 백업 파일을 내려받아 보관하세요.

## 꼭 알아 둘 점

- 브라우저 데이터를 지우거나 다른 기기·다른 브라우저로 옮기면 데이터가 보이지 않습니다. **백업 파일이 유일한 이전·보존 수단**입니다.
- 근거의 ‘사용자 확인 완료’는 사용자가 직접 표시한 값입니다. 프로그램은 논문 원문을 읽거나 확인하지 않습니다.
- 프로그램은 논문·DOI·통계 결과·근거를 생성하지 않습니다. 비어 있는 항목은 문서에 ‘작성 필요’로 나옵니다.
- 실제 내담자 기록이나 식별 가능한 설문 응답은 넣지 마세요(연구윤리 기능은 아직 없습니다).

## 문서

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 개발 원칙, 금지사항, 새 세션 재개 절차 |
| [DEVELOPMENT_STATE.md](DEVELOPMENT_STATE.md) | 현재 단계, 완료·미검증 기능, 다음 작업 |
| [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) | 요구사항별 구현·테스트·증거·상태 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 기술 선택 이유, 데이터 모델, 무결성·영향 분석 설계 |
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | 단계별 진행 결과와 후속(5~8 영역) 계획 |
| [TEST_REPORT.md](TEST_REPORT.md) | 단위·E2E·파일 검증 결과와 증거 위치 |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | 알려진 한계와 미검증 항목 |
| [docs/SCHOOL_REQUIREMENTS.md](docs/SCHOOL_REQUIREMENTS.md) | 단국대 행정법무대학원 공식 안내 확인 기록 |
| [HANDOFF.md](HANDOFF.md) | 인계 정보, 요구사항별 구현·테스트 위치(독립 검수용) |
