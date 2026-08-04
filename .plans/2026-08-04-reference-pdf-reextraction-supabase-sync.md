# Reference 문항 고정밀 재추출 계획

## 목표

`question/moi`와 `question/suteck`의 실제 PDF를 기준으로 문제를 다시
추출한다. 목표는 텍스트가 존재하는 reference가 아니라 **원본 문제의 표,
그래프, 도식, 문서 레이아웃을 실제 화면에서 재현할 수 있는 reference**다.

최종 순서는 다음이다.

```text
원본 PDF
→ 문제별 영역 분리
→ 텍스트/visual 분리 추출
→ 표·도식 전용 추출
→ 원본 crop 대조
→ 사람 검수
→ TPL 변환
→ certification
→ Supabase dry-run
→ backup + transaction apply
→ web/PDF/live QA
```

## 기존 결과에 대한 판정

기존 자동 결과와 pilot은 최종 데이터가 아니다.

- 전체 페이지를 모델에 주는 방식이라 문제·표 영역이 섞였다.
- `visual.kind = table`인데 `headers`와 `rows`가 빈 문항이 발생했다.
- 페이지 전체 재질문으로 표를 복구했지만 셀 단위 대조가 없었다.
- 서브에이전트 수동 추출은 일부 파일만 처리했으며 전체 corpus 기준으로
  일관성을 보장하지 못했다.
- 기존 Supabase에 반영된 pilot 38개도 새 visual fidelity 검수 전까지는
  최종 승인 데이터로 취급하지 않는다.

따라서 기존 `reference-corpus-v2`는 원본 후보/비교 자료로만 사용한다. 표가
정확하다는 근거로 재사용하지 않는다.

## 범위

### 포함

- 수특 PDF 40개
- MOI 문제지/정답표 54개
- 문제별 stem, stimulus, 보기, 선택지
- 공식 정답
- 수특 공식 해설
- 표·그래프·도식·문서 visual
- 기존 `TPL_COMPARATIVE_MATRIX`와 web/PDF 출력
- 검증 통과 결과의 Supabase 반영

### 제외 또는 보류

- 원본에 없는 해설 생성
- 모델이 추정한 정답
- 복잡한 병합 표의 강제 matrix 변환
- 이미지/그래프를 텍스트 한 줄로 대체
- 검수되지 않은 자동 결과의 production 반영
- AI 신규 문항 생성

## 핵심 원칙

1. 모델에 PDF 전체를 한 번에 주지 않는다.
2. 문제 단위와 visual 영역을 분리한다.
3. 표를 읽지 못하면 빈 표로 저장하지 않고 차단한다.
4. TPL은 원본 표현을 보존할 때만 사용한다.
5. `headers/rows`만 저장하지 않고 원본 crop 이미지도 보존한다.
6. 자동 추출 성공과 원본 fidelity 통과를 구분한다.
7. Supabase에는 `CERTIFIED` 결과만 반영한다.

## Source inventory

현재 inventory는 다음을 확인했다.

```text
authoritative PDF: 94개
suteck: 40개
moi: 54개
moi exam directory: 27개
```

수특 일부 파일은 파일명상 한 강이지만 내부에 다음 강 해설 페이지가 붙어
있다. 따라서 파일명만으로 문제 영역을 결정하지 않는다.

```text
question pages
→ answer/explanation pages
→ next-unit explanation spillover
```

`question/to_ocr`는 hash와 source mapping으로 원본 여부를 확인하기 전까지
입력으로 사용하지 않는다.

## Phase 0 — 기존 결과와 DB 동결

- [ ] 현재 `reference_questions` 전체 export
- [ ] 현재 UUID, logical source ID, content hash, source payload export
- [ ] 현재 반영된 pilot 38개를 `needs_visual_recertification` 목록으로 분류
- [ ] 기존 backup manifest와 이번 재추출 결과를 섞지 않음
- [ ] 재검증 전에는 기존 pilot row를 삭제하지 않음

### 통과 조건

- rollback에 필요한 DB snapshot이 존재한다.
- 기존 row의 UUID와 source ID를 보존할 수 있다.

## Phase 1 — 페이지 evidence 생성

각 PDF에 대해 다음을 생성한다.

```text
source hash
page metadata
layout text
page image
```

수특은 페이지별로 분류한다.

```text
QUESTION_PAGE
ANSWER_PAGE
EXPLANATION_PAGE
NEXT_UNIT_PAGE
UNKNOWN
```

`출제 의도`, `해설`, `오답 피하기`가 있다고 해서 무조건 answer page로
판정하지 않는다. 문제 page에도 `정답과 해설` header가 있을 수 있으므로
question number, 문제 발문, 선택지 존재 여부를 함께 본다.

### 산출물

```text
artifacts/reference-evidence-v3/{sourceHash}/pages/page-001.png
artifacts/reference-evidence-v3/{sourceHash}/pages/page-001.layout.txt
artifacts/reference-evidence-v3/{sourceHash}/page-map.json
```

### 통과 조건

- 원본 94개 PDF가 모두 source hash를 가진다.
- 문제 page와 해설 page가 혼합되지 않는다.
- image-only 정답표는 `OCR_REQUIRED`로 표시된다.

## Phase 2 — 문제 영역 탐지

페이지 전체가 아니라 문제별 bounding region을 만든다.

```json
{
  "questionNumber": 11,
  "pages": [2, 3],
  "questionRegion": {"page": 2, "x": 40, "y": 100, "width": 720, "height": 460},
  "visualRegions": [
    {"page": 2, "kind": "table", "x": 80, "y": 210, "width": 640, "height": 220}
  ]
}
```

탐지 순서:

1. layout text에서 문제 번호 후보 탐지
2. 다음 문제 번호까지 영역 생성
3. `[n~m]` 공통 제시문 영역을 shared set으로 연결
4. `표`, `그림`, `그래프`, `도식`, 문서 영역 탐지
5. 페이지 image에서 visual region을 확정

탐지하지 못한 영역은 자동으로 추정하지 않고 `REGION_REVIEW_REQUIRED`로
보낸다.

## Phase 3 — 문제 텍스트 추출

문제별 text region만 사용해 추출한다.

```json
{
  "questionNumber": 11,
  "pageNumbers": [2, 3],
  "stem": "...",
  "stimulusText": "...",
  "viewItems": ["ㄱ. ...", "ㄴ. ..."],
  "choices": ["① ...", "② ...", "③ ...", "④ ...", "⑤ ..."],
  "sharedSetId": null,
  "visualType": "table"
}
```

검증:

- 선택지 정확히 5개
- 문제 번호 중복 없음
- 보기 key 순서 보존
- stem과 stimulus 중복 없음
- 숫자·단위·법조문·괄호 보존
- source page에 없는 문장 생성 없음
- 공통 지문 set linkage 보존

## Phase 4 — visual 전용 추출

텍스트 추출과 visual 추출을 한 번에 시키지 않는다.

### 단순 표

```json
{
  "visualType": "table",
  "headers": [
    {"id": "h1", "label": "구분"},
    {"id": "h2", "label": "내용"}
  ],
  "rows": [
    {"id": "r1", "cells": ["(가)", "..."]},
    {"id": "r2", "cells": ["(나)", "..."]}
  ],
  "sourceRegion": {"page": 2, "cropPath": ".../q11-visual.png"}
}
```

표 추출 모델에는 전체 PDF가 아니라 **표 crop image + layout text 일부**만
전달한다.

강제 조건:

```text
headers.length > 0
rows.length > 0
모든 row.cells.length === headers.length
```

하나라도 불명확하면:

```json
{
  "status": "VISUAL_REVIEW_REQUIRED",
  "reason": "CELL_UNREADABLE"
}
```

빈 `headers/rows`로 성공 처리하지 않는다.

### 그래프·도식·이미지

다음 데이터를 별도로 보존한다.

```json
{
  "visualType": "chart",
  "rawCropPath": ".../q3-visual.png",
  "extractedLabels": [],
  "extractedNumbers": [],
  "status": "review_required"
}
```

수치나 축을 완전히 읽지 못한 그래프는 TPL로 변환하지 않는다.

### 복잡한 표

다음은 `TPL_COMPARATIVE_MATRIX`로 변환하지 않는다.

- rowspan/colspan
- 다단 헤더
- 표 안 그래프/이미지
- 셀 병합이 의미를 결정하는 표
- 수식·기호·각주가 셀 위치에 의존하는 표

이 경우 원본 crop을 보존하고 별도 renderer가 지원할 때까지 보류한다.

## Phase 5 — visual fidelity 검증

추출된 table DTO를 다시 렌더링한다.

```text
원본 visual crop
vs
HTML table render
vs
PDF table render
```

자동 검증:

- 행 수/열 수 일치
- 각 셀의 숫자·단위·기호 exact match
- 행·열 순서 일치
- 빈 셀 보존
- 원본 셀 텍스트 누락 0
- 추출 셀 텍스트 추가 0

사람 검수:

- 표 문제 전수
- 그래프/도식 문제 전수
- 숫자표 전수
- 복잡한 표는 publish 여부 결정

## Phase 6 — 정답·해설

### 정답

- 수특: 같은 PDF의 공식 답지에서 추출
- MOI: 정답표 PDF에서 추출
- image-only 정답표: OCR 후 사람이 대조
- 정답 충돌 시 차단

### 해설

- 수특 공식 해설은 원문 그대로 보존
- MOI에 공식 해설이 없으면 `missing`으로 명시
- 문제를 보고 새로 만든 설명은 `generated`로 구분
- 생성 해설을 공식 해설처럼 저장하지 않음

```json
{
  "explanation": "...",
  "explanationProvenance": "official | generated | missing"
}
```

## Phase 7 — TPL 변환

visual fidelity 통과 후에만 TPL을 만든다.

```text
단순 표 + fidelity 통과
→ TPL_COMPARATIVE_MATRIX

복잡 표/그래프/도식
→ raw visual 보존 + publish 보류

visual 추출 실패
→ live selection 제외
```

기존 renderer를 재사용한다. 새 표 컴포넌트는 만들지 않는다.

## Phase 8 — certification

각 문항에 하나의 상태를 부여한다.

```text
CERTIFIED
BLOCKED_MISSING_ANSWER
BLOCKED_MISSING_EXPLANATION
BLOCKED_REGION
BLOCKED_VISUAL
BLOCKED_TABLE_SHAPE
BLOCKED_SOURCE_ID
BLOCKED_RENDER_PARITY
```

`CERTIFIED` 조건:

- 문제 필드 검증 통과
- 공식 정답 존재
- source identity 확정
- visual fidelity 통과 또는 visual 없는 문제
- TPL schema 통과
- web/PDF parity 통과
- 해설 provenance 명확

## Phase 9 — Supabase 반영

반영 전:

```text
certification report
→ logical source ID mapping
→ dry-run diff
→ current row backup
```

반영:

- 기존 UUID 유지
- certified row만 insert/update
- blocked row는 기존 정상 row를 덮어쓰지 않음
- transaction 적용
- source ID 삭제 금지
- apply 후 row/hash/count 재검증

## Phase 10 — rollout

1. admin에서 certified visual 문제만 조회
2. web/PDF screenshot 비교
3. reference live QA
4. 문제 없을 때만 user selection 활성화
5. blocked/legacy row는 audit용으로 보존

## 실행 순서

```text
1. 기존 자동/수동 corpus 폐기 판정
2. page-map 생성
3. 문제 region 생성
4. text extraction
5. visual crop 생성
6. table/graph 전용 extraction
7. 원본 crop 대조
8. 사람 검수
9. answer/explanation attach
10. TPL 변환
11. certification
12. Supabase dry-run
13. backup + transaction apply
14. web/PDF/live QA
```

## 비용·속도 최적화

- 일반 텍스트는 `pdftotext`/layout로 처리
- 모델 호출은 문제 region과 visual region에만 사용
- 표/그래프가 없는 문제는 vision 호출하지 않음
- `gpt-4o-mini`는 초벌 텍스트에 사용 가능
- 숫자표·복잡 표의 최종 검수는 고품질 모델 또는 사람 검수로 제한
- 서브에이전트는 전체 추출기가 아니라 visual 검수/blocked 판정에 사용

## 완료 기준

- [ ] 94개 PDF page-map 완료
- [ ] 문제별 region 누락 0 또는 명시적 review 상태
- [ ] 모든 표에 crop path 존재
- [ ] `headers/rows` 빈 표의 certified 처리 0
- [ ] 숫자·단위·셀 누락이 검수에서 0
- [ ] web/PDF table parity 100%
- [ ] official/generated/missing explanation 구분
- [ ] certified 문항만 Supabase 반영
- [ ] Supabase backup/rollback manifest 보관
- [ ] live QA 통과

## 다음 작업

기존 전체 API 추출을 중단하고, 먼저 대표 표 문제 10개에 대해
`문제 region → visual crop → table DTO → web/PDF 재렌더 → 원본 대조`를
완성한다. 이 10개가 통과하기 전에는 전체 corpus를 추출하거나 Supabase에
추가 반영하지 않는다.
