# 참조 문제 기반 AI 문제 생성 계획

## 목표

`simply_reference`처럼 서버가 검증된 기존 문제를 먼저 선택하고, 그 문제의
출제 구조를 분석한 뒤 AI가 새로운 사례와 표현을 생성하도록 변경한다.

최종 목표는 단순 개념 정의 문제가 아니라 다음을 만족하는 문항이다.

- 실제 참고 문제의 출제 의도와 정답 논리를 유지한다.
- 새로운 상황, 자료, 수치, 조건을 사용한다.
- 원본 문제에 맞는 TPL을 사용한다.
- 자료를 읽어야만 풀 수 있다.
- 보기와 오답이 실제 수능형 문장으로 구성된다.

## 현재 상태와 원인

- 일반 `POST /exams`는 AI 생성이 아니라 기존 문제 조합 경로다.
- AI 경로는 `POST /exams/jobs`의 `sourceType: ai_blueprint`에만 연결되어 있다.
- `AiBlueprintService`는 원본 문제에서 개념, archetype, TPL, 사실 근거를
  컴파일하지만 분석 결과를 충분히 구조화하지 않는다.
- `ai-question-materializer.ts`는 일반 사례형 문제와 개념명 중심 보기를
  만들어 실제 문제성이 낮다.
- 현재 `ai_reference_analyses` 테이블은 공용 분석 캐시의 기반만 제공한다.

관련 코드:

- `backend/src/exams/simply-reference-generation.service.ts`
- `backend/src/exams/ai-blueprint.service.ts`
- `backend/src/exams/ai-question-generation.service.ts`
- `backend/src/exams/ai-question-materializer.ts`
- `backend/src/exams/ai-provider.adapter.ts`
- `backend/src/exams/tpl-schemas.ts`
- `backend/src/exams/reference-archetype.ts`

## 핵심 설계 원칙

1. **원본 문제 선택은 서버가 담당한다.**
2. **원본 분석은 AI 제안과 서버의 결정론적 파싱을 함께 사용한다.**
3. **정답, TPL, 출처, 메타데이터는 서버가 소유한다.**
4. **AI는 제한된 텍스트 슬롯만 반환한다.**
5. **검증 실패 문항은 저장하지 않고 재시도하거나 폐기한다.**
6. **기존 `simply_reference` 경로는 변경하지 않는다.**
7. **지원하지 않는 TPL을 다른 TPL로 조용히 변환하지 않는다.**

## 목표 데이터 흐름

```text
simple_reference 방식으로 인증된 원본 선택
        ↓
원본 분석 캐시 조회
        ↓ 캐시 없음
AI + 서버 parser가 ReferenceAnalysis 생성
        ↓
공용 ai_reference_analyses 저장
        ↓
분석 결과에서 TPL별 Blueprint 생성
        ↓
AI가 새로운 사례/자료/발문/보기 문장 생성
        ↓
서버가 TPL과 정답을 materialize
        ↓
TPL·출제 논리·사실·중복·렌더링 검증
        ↓
통과한 문항만 시험에 저장
```

## Phase 0 — 기준 데이터와 실패 유형 고정

- 과목/단원별 인증된 원본 문제 30~50개를 평가 세트로 고정한다.
- 각 문제에 다음 라벨을 붙인다.
  - source archetype
  - TPL
  - stem polarity
  - response mode
  - target concept
  - reasoning pattern
  - 자료 필요성
  - 오답 품질
- 현재 AI 결과에서 다음 실패율을 기록한다.
  - 의미 질문
  - generic stem
  - 개념명 보기
  - TPL 불일치
  - 정답 규칙 불일치
  - 자료 불필요
  - 원본과 과도한 중복
- 이 단계에서는 사용자 노출 없이 shadow 실행만 한다.

## Phase 1 — 공용 ReferenceAnalysis 확정

`ai_reference_analyses.analysis`에 저장할 정식 계약을 만든다.

```ts
type ReferenceAnalysis = {
  sourceId: string;
  sourceHash: string;
  subject: string;
  unitNumber: number;
  sourceArchetype: ReferenceArchetype;
  template: StructuredTplName;
  targetConcept: string;
  stemIntent: string;
  polarity: 'positive' | 'negative';
  responseMode: string;
  informationShape: string;
  reasoningPattern: string;
  invariantFacts: InvariantFact[];
  mutableSlots: MutableSlot[];
  answerRule: AnswerRule;
  distractorRules: DistractorRule[];
  sourceEvidence: SourceEvidence[];
};
```

반드시 포함할 불변 정보:

- 정답 판정에 필요한 조건
- 원본의 수치, 단위, 방향, 비교 관계
- 보기 구조와 정답 위치가 아닌 정답 논리
- 자료와 발문의 관계
- 오답이 틀리는 구체적인 이유

변경 가능한 정보:

- 인물명, 기관명, 장소명
- 표면적인 상황과 서술 순서
- 안전하게 변환 가능한 숫자
- TPL 안에서 허용된 문장 슬롯

### AI 분석 계약

AI가 분석을 반환하더라도 그대로 신뢰하지 않는다.

```text
원본 문제 + 정답 + 선택지 + 자료
→ AI 구조 분석
→ JSON schema 검증
→ 서버 parser와 정답/선택지 관계 대조
→ 일치할 때만 공용 저장
```

분석 저장 메타데이터도 기록한다.

- `analysisVersion`
- `promptVersion`
- provider model
- prompt hash
- validator version
- 생성 시각
- 실패 코드

원본 hash가 바뀌거나 분석 버전이 바뀌면 기존 분석을 재사용하지 않는다.

## Phase 2 — 원본 선택과 분석 캐시 연결

- `simply_reference`의 단원 필터, 인증 여부, 이전 source 제외 로직을 재사용한다.
- 선택 조건은 다음과 같다.
  - 공식 정답 존재
  - 분석 가능한 archetype 존재
  - 완전한 stimulus 존재
  - 지원하는 TPL 존재
  - 결정론적으로 정답을 계산할 수 있음
- `AiBlueprintService`는 먼저 `ai_reference_analyses`를 조회한다.
- 캐시가 없으면 분석을 한 번 생성하고 저장한다.
- 저장된 분석은 사용자 ID와 무관하게 모든 생성 요청에서 재사용한다.
- 분석 저장 실패는 문제 생성 전체 실패로 삼지 않고, 안전하게 해당 원본을
  이번 요청에서 제외한다. 단, 분석 없이 자유 생성으로 fallback하지 않는다.

## Phase 3 — Tier 1 생성 범위

첫 출시 범위는 작게 제한한다.

```text
positive_single_selection
+ TPL_CASE_DIAGNOSTIC_FRAME
```

이후 순서:

1. negative single-selection + case
2. single-selection + conversational flow
3. comparative matrix
4. quantitative chart/statistics
5. workflow/document 등 나머지 TPL

지원 여부는 enum이 아니라 다음 세 조건을 모두 만족할 때만 켠다.

- 완전한 TPL schema
- 서버 answer engine
- web/PDF renderer fixture

## Phase 4 — TPL별 AI 출력 계약

AI는 최종 Question JSON을 반환하지 않는다.

Tier 1 출력:

```json
{
  "stimulusText": "...",
  "stemText": "...",
  "choiceTexts": ["...", "...", "...", "...", "..."],
  "explanationText": "..."
}
```

AI가 반환하지 않는 값:

- `template`
- `answerIndex`
- `correctAnswer`
- source lineage
- question metadata
- 임의의 stimulus DTO 구조

TPL 확장 시에는 템플릿별 slot만 추가한다.

- conversation: `messageTexts`
- matrix: `cellTexts`
- document/article: `paragraphTexts`
- workflow: `stepTexts`
- chart/statistics: 서버가 정의한 수치 슬롯

## Phase 5 — Materializer와 answer engine 교체

현재 generic materializer는 실제 AI 경로에서 사용하지 않는다.

Tier 1 materializer는 다음을 담당한다.

1. Blueprint의 TPL을 고정한다.
2. AI 텍스트를 정해진 슬롯에만 넣는다.
3. Blueprint의 조건으로 각 보기를 판정한다.
4. 정답을 서버에서 계산한다.
5. 오답은 Blueprint의 distractor rule을 만족하는지 확인한다.
6. canonical TPL DTO를 생성한다.

개념명만 나열하는 보기는 금지한다. 모든 보기는 해당 사례에 적용되는
완전한 문장이어야 한다.

## Phase 6 — 검증과 재생성

하드 게이트:

- 선택한 TPL schema 통과
- TPL 변경/우회 없음
- 정답 정확히 1개
- 서버 정답과 explanation 일치
- invariant fact 전부 보존
- polarity/response mode 일치
- 자료 없이는 풀 수 없음
- 보기 5개 및 문법적 병렬성
- placeholder/개념명-only 보기 없음
- 원본과 exact/structural duplicate 아님
- web/PDF 렌더링 성공

실패 코드는 최소한 다음으로 분리한다.

- `ANALYSIS_INVALID`
- `TPL_MISMATCH`
- `INVARIANT_MISMATCH`
- `ANSWER_RULE_MISMATCH`
- `DISTRACTOR_INVALID`
- `STIMULUS_NOT_NECESSARY`
- `GENERIC_QUESTION_REJECTED`
- `DUPLICATE_REJECTED`
- `RENDER_REJECTED`

재시도 정책:

```text
같은 Blueprint 1회 재생성
→ 실패하면 다른 인증 원본 사용
→ 그래도 부족하면 shortfall 반환
```

목표 문항 수를 채우기 위해 검증 실패 문항을 저장하지 않는다.

## Phase 7 — 저장과 lineage

분석과 생성 결과를 분리한다.

### 공용 분석

`ai_reference_analyses`

- source ID/hash
- 분석 JSON
- 분석/프롬프트/검증 버전
- provider telemetry
- 누구나 재사용 가능한 공용 데이터

### 생성 실행

기존 테이블을 사용한다.

- `ai_generation_runs`
- `ai_generation_candidates`
- Question lineage

각 생성 문항에는 다음 lineage가 남아야 한다.

```text
원본 문제
→ 분석 버전
→ Blueprint ID
→ provider model/prompt hash
→ candidate attempt
→ validator version
→ 최종 Question
```

## Phase 8 — 테스트

### 단위 테스트

- 분석 schema 검증
- 원본 정답과 answer rule 일치
- invariant fact 추출
- TPL별 provider output shape
- generic question 거부
- 개념명-only 보기 거부
- 서버 정답 계산
- structural duplicate 거부

### 통합 테스트

- 같은 원본의 첫 요청은 분석 저장
- 두 번째 사용자 요청은 공용 분석 재사용
- source hash 변경 시 재분석
- 분석 저장 실패 시 안전한 shortfall
- AI 후보 실패 후 다른 원본 fallback
- 취소/timeout 시 문항 미저장
- 최종 시험 transaction atomicity

### 고정 평가 세트

- 3문항, 5문항, 20문항 생성
- 과목/단원별 최소 1회
- web/PDF 출력 비교
- 사람 검수: 실제성, 자료 필요성, 오답 plausibility

## 출시 기준

Tier 1 공개 전 최소 기준:

- 선택 TPL/schema 통과율: 100%
- 서버 정답 일치율: 100%
- 필수 사실 보존율: 100%
- 렌더링 성공률: 100%
- 중복 문항: 0건
- generic/의미 질문: 0건
- concept-name-only 보기: 0건
- reviewer가 실제 문제로 승인한 비율: 별도 기준 충족

## 단계적 출시

1. 관리자 전용 shadow 실행
2. 특정 과목/단원 1개
3. positive case TPL만 활성화
4. 3문항 생성
5. 5문항 생성
6. 검수와 실패율 확인
7. negative/conversation 순서로 확장

기능 플래그와 TPL별 kill switch를 유지한다.

## 작업 순서

1. [x] ReferenceAnalysis 타입과 저장 metadata 확정
2. [x] 실제 AI 분석 provider/schema 추가
3. [x] 공용 분석 캐시 read/write 연결
4. [x] 분석 결과를 Blueprint compiler에 반영
5. [x] Tier 1 case provider contract 작성
6. [x] case materializer가 AI 선택지 슬롯을 canonical DTO로 변환
7. [x] answer engine과 admission validator를 source answer/fact 기반으로 강화
8. [x] 고정 평가 세트 및 web/PDF fixture 추가
9. [ ] shadow generation 실행
10. [ ] 관리자 전용 활성화

## 진행 기록

- 2026-08-05: `AiReferenceAnalysis` 타입, strict JSON 분석 계약, 공용 분석
  캐시 read/write, 분석 버전 `v3`, Tier 1 case 선택지 계약을 구현했다.
- 2026-08-05: Conversation에 이어 matrix/document/article/announcement/workflow도
  source-backed `slotTexts + choiceTexts + explanationText` provider 계약을
  사용할 수 있도록 공통 adapter를 확장했다. capability는 answer engine과
  fixture가 준비될 때까지 확장하지 않는다.
- 2026-08-05: Matrix materialization이 AI choiceTexts를 사용하고, 숫자/조건
  source anchors를 모든 텍스트 슬롯에서 검사하도록 admission 검증을 강화했다.
- 2026-08-05 검증: `npm run build` 성공.
- 2026-08-05 검증: AI provider/materializer/validator 테스트 19개 통과.
- 2026-08-05 검증: Conversation contract 포함 관련 테스트 20개 통과.
- 2026-08-05 검증: `git diff --check` 성공.
- 2026-08-05 `npm run typecheck`: 기존 `scripts/plan-reference-catalog-legacy-migration.ts`,
  auth/chat/study/notification 테스트 오류로 실패. 이번 변경 파일 오류는
  출력에 없으며 `npm run build`로 소스 컴파일을 확인했다.
- 2026-08-05 follow-up 검증: enabled TPL admission 및 Web/PDF contract focus
  42개, broader AI/reference focus 37개 테스트와 `npm run build`,
  `git diff --check` 성공.

## 하지 않을 것

- `simply_reference`를 AI 생성으로 몰래 변경하지 않는다.
- AI에게 최종 정답과 TPL을 맡기지 않는다.
- 모든 TPL을 한 번에 활성화하지 않는다.
- schema만 통과한 문항을 품질 좋은 문항으로 간주하지 않는다.
- 생성 실패 시 generic 문항으로 자동 대체하지 않는다.

## 전체 TPL 확장 순서

모든 TPL을 한 번에 켜지 않고, 각 TPL마다 provider contract, materializer,
answer engine, Web/PDF fixture를 갖춘 뒤 다음 순서로 활성화한다.

### TPL-1 — Case

- `positive_single_selection + TPL_CASE_DIAGNOSTIC_FRAME`
- `negative_single_selection + TPL_CASE_DIAGNOSTIC_FRAME`
- 사례 필수 사실, polarity, 보기 5개, 정답 위치, Web/PDF parity 검증

### TPL-2 — Conversation

- `TPL_CONVERSATIONAL_FLOW`
- [x] source-backed 후보가 `messageTexts`, `choiceTexts`, `explanationText`를
  반환하는 strict provider contract 추가
- [x] participant/speaker sequence/icon/scene metadata는 서버 소유 유지
- [x] conversation 후보 contract 회귀 테스트 추가
- [x] conversation 전용 answer engine, source-fidelity, Web/PDF parity fixture
- 참여자, 발화 순서, 발화 수, 아이콘, scene metadata를 서버가 고정
- 대화 내용과 선택지의 source fidelity 검증

### TPL-3 — Comparative Matrix

- 완전한 원본 표가 있는 문제만 허용
- [x] matrix cell slot과 choiceTexts를 함께 반환하는 공통 provider 계약
- [x] matrix materializer가 서버 소유 행/열 구조와 AI 셀/선택지를 결합
- [x] matrix 회귀 fixture에서 canonical options와 cell cardinality 검증
- [x] matrix provider slot metadata/shape와 answer polarity admission 검증
- 행/열/셀 수를 서버가 고정
- 셀 수와 provider slot 수가 정확히 일치해야 함
- 표의 조건으로 정답을 재계산할 수 있을 때만 활성화

### TPL-4 — Textual Structured TPLs

순서:

```text
TPL_FORMAL_DOCUMENT
→ TPL_ARTICLE
→ TPL_ANNOUNCEMENT
```

- 문단/상세 항목 수와 순서 서버 고정
- [x] document/article/announcement slot과 choiceTexts를 처리하는 공통 계약
- [x] document/article/announcement slot metadata와 Web/PDF validator parity 검증
- 문서 날짜, 작성자, 장소, 연락처 등 빈 metadata 금지
- 문단 내용만 AI가 생성하고 문서 구조는 서버가 생성

### TPL-5 — Sequential Workflow

- `TPL_SEQUENTIAL_WORKFLOW`
- [x] workflow step slot과 choiceTexts를 처리하는 공통 계약
- [x] workflow step metadata/shape와 answer admission 검증
- 단계 순서와 개수 서버 고정
- 누락 단계/순서 판단용 answer engine 추가
- 단순 단계 설명 생성만으로는 활성화하지 않음

### TPL-6 — Numeric TPLs

순서:

```text
TPL_QUANTITATIVE_CHART
→ TPL_STATISTICS
```

- 수치와 단위는 원본 근거 또는 서버 계산으로만 생성
- 축/데이터셋 차원 일치 검증
- 반올림, 단위 변경, 임의 수치 생성 금지
- Web/PDF 수치 표시 parity fixture 필수
- [x] `numericTexts` provider slot is reserved and strict parsing supports it
- [x] deterministic source-preserving adapter rejects non-JSON/non-renderable data
- [ ] AI generation remains disabled: no generated numeric variant may alter source values, units, or dimensions

### TPL-7 — Event/Report TPLs

```text
TPL_INCIDENT_REPORT
→ TPL_REPORT
```

- 사건 원인, 결과, 대응, 예방, 시간순서 보존
- 보고서 section과 embedded table의 answer engine 추가
- causal/timeline 정보가 없는 원본은 제외
- [x] `incidentTexts` and `reportTexts` provider slots are reserved and strict parsing supports them
- [x] deterministic source-preserving adapter preserves validated incident/report JSON exactly
- [ ] AI generation remains disabled until causal/timeline and section/table answer engines exist

### TPL-8 — Special Presentation TPLs

```text
TPL_INSTRUCTIONAL_SCENE
→ TPL_DIGITAL_FORUM_INTERFACE
→ TPL_PROMOTIONAL_CANVAS
```

- polymorphic canvas, 게시글/댓글, 홍보 시각요소의 서버 계약 확정
- 시각자료가 실제 풀이에 필요하고 정답 규칙이 정의된 경우만 지원
- 표현만 그럴듯한 장식용 자료는 생성하지 않음
- [x] `forumTexts`, `sceneTexts`, and `promotionTexts` provider slots are reserved and strict parsing supports them
- [x] deterministic source-preserving adapter preserves validated forum/scene/promotion JSON exactly
- [ ] AI generation remains disabled until each template has a source-backed semantic answer engine

## TPL 활성화 조건

각 TPL은 다음을 모두 통과하기 전까지 capability 목록에서 비활성화한다.

- source-backed analysis contract
- template-specific provider schema
- server-owned materializer
- deterministic answer engine
- source-fidelity validator
- Web renderer fixture
- PDF renderer fixture
- 3/5/20문항 shadow 결과

한 TPL에서 실패한 경우 다른 TPL로 자동 fallback하지 않는다. 해당 TPL의
shortfall을 반환하고, 이미 통과한 다른 인증 원본만 시도한다.

### 2026-08-05 completion record

- Completed AI-enabled templates: `TPL_FORMAL_DOCUMENT`, `TPL_ARTICLE`, `TPL_ANNOUNCEMENT`, `TPL_SEQUENTIAL_WORKFLOW`.
- Completed safe disabled adapters: `TPL_DIGITAL_FORUM_INTERFACE`, `TPL_INSTRUCTIONAL_SCENE`, `TPL_PROMOTIONAL_CANVAS`, `TPL_INCIDENT_REPORT`, `TPL_REPORT`, `TPL_QUANTITATIVE_CHART`, `TPL_STATISTICS`.
- Disabled adapters require exact JSON source passing the existing schema, `StimulusNormalizer`, Web renderer, and PDF renderer contracts; numeric values and units are returned unchanged.
- Remaining special and numeric templates stay out of `AI_GENERATION_TEMPLATES` because generated structure/value slots do not yet have deterministic source-backed answer engines.
- Focused verification: backend build passed; 44 relevant Jest tests passed; `git diff --check` passed.
