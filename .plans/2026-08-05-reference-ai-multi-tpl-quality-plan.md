# Reference 기반 AI 문제 생성 품질·다중 TPL 안정화 계획

## 1. 목표

인증된 reference 문제를 출제 구조의 기준으로 사용하면서 다음을 만족한다.

- 단원에 여러 TPL source가 있으면 한 종류에 편중되지 않는다.
- reference의 TPL, 정답 논리, 수치·단위·순서를 보존한다.
- AI는 새로운 상황과 문장을 생성하되 서버 계약을 정확히 지킨다.
- 지원 가능하다고 판정한 요청은 repair/replacement 후 높은 확률로 완료된다.
- 모델 성능 문제와 서버 계약 문제를 구분해 관측한다.
- 품질 기준을 충족한 TPL만 단계적으로 활성화한다.

## 2. 현재 관찰된 사실

### 2.1 Reference와 TPL은 여러 종류다

현재 AI 활성 대상으로 선언된 TPL은 다음과 같다.

```text
TPL_CASE_DIAGNOSTIC_FRAME
TPL_CONVERSATIONAL_FLOW
TPL_COMPARATIVE_MATRIX
TPL_FORMAL_DOCUMENT
TPL_ARTICLE
TPL_ANNOUNCEMENT
TPL_SEQUENTIAL_WORKFLOW
```

하지만 요청 결과가 TPL별로 균형 있게 배분되지는 않는다.

### 2.2 선택 단계가 특정 TPL에 편중될 수 있다

`AiBlueprintService`는 현재:

- case source를 source당 3개 variant로 먼저 확장한다.
- 전체 evidence 중 앞쪽 `max(questionCount × 2, 6)`개만 분석한다.
- DB 조회 순서가 명시되지 않았다.
- case family가 하나라도 있으면 case를 우선한다.
- TPL별 quota가 없다.
- variant source ID를 서로 다른 source처럼 취급한다.

따라서 앞쪽 case/conversation variant가 analysis pool을 차지하면 뒤쪽
Matrix, Article, Document source가 선택 전에 제외될 수 있다.

### 2.3 현재 가용 수량은 실제 distinct reference 수가 아니다

`availableCount`는 제한된 analysis pool의 expanded variant 수에 가깝다.
현재 preview에는 다음 정보가 없다.

- 단원/TPL별 raw source 수
- parse 가능한 source 수
- AI 생성 가능한 source 수
- distinct base source 수
- 제외 이유별 count
- replacement reserve 수

따라서 false shortfall과 TPL 편중을 사전에 설명하기 어렵다.

### 2.4 현재 실제 모델은 gpt-4o-mini다

현재 환경:

```text
OPENAI_MODEL=gpt-4o-mini
```

전용 `OPENAI_AI_BLUEPRINT_MODEL`이 없으므로 analysis와 candidate 생성 모두
mini 모델을 사용한다.

`gpt-4o`는 다음 품질을 개선할 가능성이 높다.

- TPL별 strict JSON 준수
- source fact 보존
- 선택지 품질
- repair prompt 이해
- 대화/표/문서 구조 준수

하지만 다음 서버 문제는 모델 변경만으로 해결되지 않는다.

- TPL 선택 편중
- slot schema/parser 불일치
- 잘못된 slot count
- speaker sequence 복원 오류
- answer rule 검증 부족
- false shortfall

### 2.5 Provider contract에 우선 수정할 결함이 있다

기본 OpenAI dependency wrapper가 전달받은 `responseFormat`을 OpenAI 호출로
넘기지 않는 경로가 있다. 이 경우:

- analysis 요청이 analysis schema가 아닌 기본 candidate schema를 사용할 수 있다.
- TPL별 response schema가 실제 호출에 적용되지 않을 수 있다.
- 테스트 dependency에서는 성공하지만 live OpenAI에서 다른 shape가 반환된다.

또한 구조형 TPL은 prompt/parser가 `cellTexts`, `paragraphTexts`, `stepTexts`
등을 기대하면서 response schema는 `stemText` 중심으로 갈라질 수 있다.

## 3. 목표 생성 흐름

```text
전체 reference inventory
→ distinct base source/TPL별 eligibility 판정
→ 단원·TPL round-robin primary allocation
→ replacement reserve allocation
→ 선택된 source만 공용 분석 조회/생성
→ TPL별 canonical Blueprint
→ task별 모델로 candidate 생성
→ schema/materializer/answer/fidelity/Web·PDF 검증
→ 실패 원인 기반 repair 1회
→ 다른 base source 또는 다른 eligible TPL로 replacement
→ accepted가 목표 수에 도달하면 원자적 저장
→ 부족하면 명시적 partial 또는 failure 정책 적용
```

## 4. 모델 정책

모델을 하나의 환경변수로 공유하지 않고 역할별로 분리한다.

```env
OPENAI_AI_ANALYSIS_MODEL=gpt-4o-mini
OPENAI_AI_CANDIDATE_MODEL=gpt-4o
OPENAI_AI_REPAIR_MODEL=gpt-4o
OPENAI_AI_VERIFICATION_MODEL=gpt-4o
```

정책 ID:

```text
ai-reference-quality-v1
```

원칙:

- analysis는 bounded extraction이고 캐시되므로 mini 사용
- 최종 문항과 선택지는 품질 우선으로 4o 사용
- validator feedback을 이해해야 하는 repair도 4o 사용
- verification은 초기에는 4o 사용
- shadow 결과에서 품질 차이가 0.5%p 이내일 때만 verification을 mini로 변경
- frontend는 임의 모델명을 지정하지 않고 서버 model policy만 사용

## 5. Phase 0 — Inventory와 baseline

### 구현

- 전체 catalog를 subject/unit/TPL별로 집계한다.
- 다음 count를 구분한다.
  - raw
  - parseable
  - certified answer
  - renderable
  - answer-engine supported
  - AI eligible
  - distinct base source
  - projected variants
- 현재 mini와 4o를 동일한 고정 corpus에서 비교한다.
- rejection을 TPL/model/attempt/failure code별로 집계한다.

### 변경 대상

- `backend/scripts/export-ai-baseline-corpus.ts`
- `backend/scripts/ai-shadow-evaluation.ts`
- `backend/src/exams/ai-blueprint.service.ts`
- `backend/src/entities/ai-generation-run.entity.ts`
- `backend/.env.example`

### 완료 기준

- 모든 subject/unit의 TPL별 distinct eligible source 수 확인
- mini/4o의 first-pass acceptance, eventual acceptance, latency, token cost 확보
- supply가 측정되지 않은 TPL은 활성화하지 않음

## 6. Phase 1 — Live Provider contract 수정

가장 먼저 수정해야 한다. 이 단계 전에는 모델 비교 결과도 신뢰하기 어렵다.

### 구현

- `AiProviderDependency.complete`가 받은 `responseFormat`을 실제 OpenAI 호출에 전달한다.
- analysis/candidate/repair/verification 호출 함수를 분리한다.
- 각 호출은 역할별 model policy를 사용한다.
- OpenAI의 실제 `response.model`을 telemetry에 기록한다.
- TPL registry의 provider field와 response schema/parser를 1:1로 맞춘다.
- structured TPL의 generic legacy 2-field 수용을 제거한다.
- legacy compatibility는 해당 TPL에서 서버가 구조를 완전히 복원할 수 있을 때만 허용한다.

### TPL별 canonical provider field

| TPL | Provider field |
|---|---|
| Case | `stemText` 또는 case narrative slot |
| Conversation | `messageTexts` |
| Matrix | `cellTexts` |
| Formal Document | `paragraphTexts` |
| Article | `paragraphTexts` |
| Announcement | `detailTexts` |
| Workflow | `stepTexts` |

공통 필드:

```text
choiceTexts
explanationText
```

### 완료 기준

- analysis 요청에 analysis schema가 실제 전달됨
- 모든 enabled TPL에서 schema, parser, materializer의 field가 일치
- deterministic fixture의 provider schema mismatch 0건

## 7. Phase 2 — Canonical Blueprint와 Materializer

### Blueprint에 저장할 명시적 구조

- `baseSourceId`
- selected TPL
- source archetype
- provider slot field
- provider slot count
- row/column/message/paragraph/step 구조
- answer rule
- polarity
- required source anchors
- mutable slots
- mutation plan
- reserve rank
- model policy ID

### 제거할 추정

- newline 기반 paragraph/message 수 추정
- Markdown 문자열 기반 matrix cell 수 추정
- source line을 임의 metadata로 재사용
- variant ordinal만 다른 가짜 variant

### TPL별 요구사항

#### Case

- positive/negative polarity 보존
- 정답 선택지는 answer rule을 만족
- distractor는 각 오답 규칙과 연결

#### Conversation

- participant, speaker sequence, message count 서버 고정
- legacy 응답은 원본 메시지를 정확히 복원할 수 있을 때만 허용
- 대화가 실제 풀이에 필요해야 함

#### Matrix

- row/column/cell count 서버 고정
- 모든 row width 동일
- 숫자·단위·비교 방향 보존

#### Document/Article/Announcement

- paragraph/detail count 서버 고정
- source에 없는 날짜·기관·연락처를 합성하지 않음
- metadata가 불완전하면 eligibility에서 제외

#### Workflow

- step count/order/index 서버 고정
- missing-step 또는 order answer engine 필요

### 완료 기준

- enabled TPL마다 answer engine fixture 통과
- provider 선택지가 서버 정답을 변경할 수 없음
- source number/unit/order 손실 0건
- 선택한 TPL schema와 Web/PDF contract 100% 통과

## 8. Phase 3 — TPL 다양성을 고려한 Reference 선택

### 기본 정책

1. 전체 eligible catalog로 availability를 계산한다.
2. `baseSourceId`로 먼저 deduplicate한다.
3. 단원 round-robin 후 TPL round-robin으로 선택한다.
4. distinct base source를 variant보다 먼저 사용한다.
5. 두 개 이상의 TPL에 supply가 있으면 다른 TPL이 소진되기 전까지 하나의
   TPL이 `ceil(requestedCount / 2)`를 넘지 않게 한다.
6. 그 다음 source당 최대 3개 variant를 허용한다.
7. variant마다 명시적 mutation plan과 semantic-distance 검증을 요구한다.
8. replacement용으로 `max(requestedCount, 5)`개 reserve를 준비한다.

### 제거할 동작

- 선택 전 expanded evidence `slice`
- case가 하나라도 있으면 case 전체 우선
- variant source ID를 distinct reference로 계산
- 제한된 analysis pool 기준 `availableCount`

### Preview 응답 확장

```text
eligibleByTpl
distinctSourcesByTpl
plannedByTpl
reserveByTpl
excludedByReason
modelPolicyId
```

### 완료 기준

- DB row 순서를 바꿔도 동일 seed에서 같은 allocation
- ordering/pre-slice로 인한 false shortfall 0건
- supply가 허용하는 3문항 이상 job의 90%가 최소 2개 TPL 사용

## 9. Phase 4 — 실패 원인 기반 Retry와 Replacement

### 정책

```text
primary candidate: gpt-4o
→ transient network/rate-limit: exponential jitter로 최대 2회
→ schema/semantic failure: validator feedback을 포함한 repair 1회
→ repair 실패: 다른 distinct base source로 교체
→ 해당 TPL 고갈: 다른 eligible TPL/family로 교체
→ reserve 고갈: shortfall
```

repair prompt에 포함:

- failure code
- 상세 message
- required anchors
- expected slot field/count
- polarity
- answer rule
- fresh nonce

같은 prompt를 nonce만 바꿔 3회 호출하는 방식은 제거한다.

### Source-preserving fallback

다음 조건을 모두 만족할 때만 허용한다.

- 같은 TPL 유지
- official answer 보존
- fidelity 통과
- Web/PDF renderer 통과
- source-preserving 결과임을 lineage에 표시

## 10. Phase 5 — Persistence와 관측성

모든 attempt에 저장:

- run/blueprint/base source/TPL
- variant ordinal과 mutation nonce
- attempt type: primary/repair/replacement/fallback
- repair parent
- requested/actual model과 model policy
- prompt/schema/validator version과 prompt hash
- latency/tokens/provider error
- failure code와 상세 message

run 집계:

- requested/eligible/planned/attempted/accepted/rejected
- distinct base source 수
- TPL별 count
- failure code별 count
- replacement/reserve 사용량
- model별 latency/token/cost

원문 전체는 로그에 남기지 않고 shape, count, hash만 저장한다.

## 11. Partial save 정책

현재 요구사항에 따라:

```text
accepted 0개 → 실패, 저장 안 함
accepted 1개 이상 → 통과 문항만 partial exam 저장
```

단, partial exam은 반드시 다음을 표시한다.

- 실제 저장 문항 수
- 요청 문항 수
- shortfall
- TPL별 실패 count
- 사용된 fallback 여부

장기적으로 exact-count completion이 안정화되면 partial 정책을 다시 검토한다.

## 12. Phase 6 — Web/PDF 계약 통합

- backend TPL schema와 frontend/PDF field name을 통일한다.
- `TPL_STATISTICS`의 `category`/`label` 불일치를 해결한다.
- permissive PDF 검사를 실제 required field 검증으로 변경한다.
- 14개 TPL golden fixture를 Web/PDF 양쪽에서 실행한다.
- 빈 값, placeholder, 누락 metadata는 저장 전에 거부한다.

## 13. Rollout

1. inventory/telemetry만 배포
2. 최소 7일 baseline 수집
3. corrected provider contract를 shadow 실행
4. mini와 4o 비교
5. Case 5% → 25% → 100%
6. Conversation → Matrix → Document → Article → Announcement → Workflow 순서
7. 각 단계 최소 500 attempts, 100 jobs 관찰
8. threshold 실패 시 해당 TPL/model pair 자동 비활성화
9. 수치·통계·특수 TPL은 answer engine과 fixture가 준비되기 전까지 비활성 유지

## 14. 최종 Acceptance Metrics

- enabled TPL별 first-pass acceptance ≥ 95%
- repair/replacement 후 eventual acceptance ≥ 99%
- preview에 reserve가 충분한 job의 목표 문항 수 충족률 ≥ 99%
- provider schema/parser/materializer mismatch 0건
- ordering/pre-slice/variant miscount에 의한 false shortfall 0건
- source number/unit/order 손실 0건
- answer rule mismatch 0건
- 취소/timeout/transaction 실패 후 exam 저장 0건
- 모든 attempt에 TPL/base source/model/latency/usage/failure code 존재
- enabled TPL 100%가 answer engine 및 Web/PDF fixture 통과
- supply가 허용하는 3문항 이상 job의 최소 2 TPL 사용률 ≥ 90%

## 15. 실행 우선순위

### Progress (2026-08-05)

- [x] P0 responseFormat 실제 전달 + analysis/candidate/repair model 분리
- [x] P0 selection pre-slice 제거 + baseSourceId 우선 선택
- [x] P0 TPL별 schema/parser/materializer 일치
- [x] focused provider/selection tests 및 backend build 통과
- [x] enabled 7 TPL contract regression coverage and compatibility tests
- [x] P1 replacement reserve allocation and source/TPL-ordered fallback
- [x] P1 enabled-TPL answer/source fidelity and Web/PDF contract fixtures
- [x] provider choice semantic failure falls back to server-owned answer choices
- [x] P2 catalog inventory by subject/unit/TPL, eligibility reason, and distinct base source
- [x] P2 shadow reporting by TPL/model/attempt/rejection
- [x] P2 role-based model environment documentation and policy

Verification (2026-08-05): `npm test -- --runInBand src/exams/ai` passed 12
suites / 74 tests; `npm run build` passed; `git diff --check` passed.

Verification (2026-08-05 P1): focused AI blueprint/generation/validator and
Web/PDF contract tests passed 5 suites / 42 tests; `npm run build` passed;
`git diff --check` passed.
- Answer-choice fallback verification (2026-08-05): backend build and focused
  generation/validator tests passed 16 tests.

Verification (2026-08-05 P2): focused inventory/blueprint/model tests passed
3 suites / 17 tests; `npm run build` passed; `git diff --check` passed. Full
backend test run remains red in 3 pre-existing reference-frame-cache persistence
suites (10 failures, 688 passed), unrelated to P2 files.

```text
P0  responseFormat 실제 전달 + task별 model 분리
P0  selection pre-slice 제거 + baseSourceId dedupe
P0  TPL별 schema/parser/materializer 일치
P1  gpt-4o candidate/repair 적용
P1  TPL round-robin + replacement reserve
P1  answer/fidelity/Web·PDF fixture
P2  비용 최적화와 verification mini 전환 검토
```

모델만 먼저 4o로 바꾸는 것은 임시 개선은 가능하지만 측정 가능한 근본
해결이 아니다. Provider contract와 selection을 먼저 바로잡고 같은 corpus에서
4o/mini를 비교해야 한다.
