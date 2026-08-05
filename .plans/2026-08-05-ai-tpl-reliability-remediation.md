# AI TPL 생성 안정화·오류 방지 계획

## 목적

현재 AI 문제 생성은 reference 선택과 provider 호출까지는 진행되지만,
TPL별 계약이 서로 달라 후보가 검증 단계에서 일괄 폐기된다. 이 계획은
모든 TPL을 같은 계약 체계로 관리하고, 실패 원인을 숨기지 않으며,
검증을 통과한 문항만 저장하도록 정리한다.

## 관찰된 사실

최근 실행:

```text
TPL_CONVERSATIONAL_FLOW
eligible blueprints: 6
provider attempts: 18
accepted: 0
failure: AI_RETRY_EXHAUSTED
```

DB의 후보 기록:

```text
keys=explanationText,stemText
choiceCount=none
failure=AI_CANDIDATE_SCHEMA_INVALID
```

즉 원본 reference 선택이나 OpenAI 연결 자체보다 **TPL별 provider 응답
계약과 legacy fallback이 불일치**한 것이 직접 원인이다.

추가로 확인된 구조적 위험:

- provider slot, TPL schema, materializer, capability 목록이 각각 별도 registry다.
- slot 수를 newline/Markdown으로 추정한다.
- provider가 생성한 보기의 의미가 정답 규칙과 일치하는지 검증하지 않는다.
- 일부 TPL은 Web/PDF 계약이 다르다.
- 일부 실패 후보의 세부 원인과 provider telemetry가 충분히 보존되지 않는다.
- 요청 문항 수보다 적게 생성되어도 partial exam이 저장될 위험이 있다.

## 목표 불변식

1. `acceptedCount === requestedCount`일 때만 completed exam을 저장한다.
2. 후보 생성 실패는 `TPL`, `blueprint`, `attempt`, `failureCode`, `message`를
   반드시 남긴다.
3. provider는 답, 정답 번호, TPL, stimulus DTO, lineage를 소유하지 않는다.
4. 서버는 TPL, slot 순서/개수, 정답 규칙, source facts를 소유한다.
5. 지원하지 않는 TPL은 다른 TPL로 fallback하지 않는다.
6. 숫자/단위/행열/발화 순서 등 source fact를 바꾸면 후보를 폐기한다.
7. Web/PDF에서 같은 사실과 순서가 렌더링되어야 한다.
8. 생성이 부족하면 성공으로 위장하지 말고 명확한 shortfall을 반환한다.

## TPL별 현 상태와 처리

| TPL | 현재 상태 | 주요 문제 | 처리 순서 |
|---|---|---|---|
| CASE | AI 활성 | 보기 의미와 정답 규칙 검증 부족 | Phase 2~3 |
| CONVERSATIONAL_FLOW | AI 활성 | message slot과 legacy stem 혼용 | Phase 2~3 |
| COMPARATIVE_MATRIX | AI 활성 | Markdown cell 수/행 폭 추정 | Phase 2~3 |
| FORMAL_DOCUMENT | AI 활성 | metadata를 임의로 채움 | Phase 3~4 |
| ARTICLE | AI 활성 | Web/PDF paragraph 계약 불일치 가능 | Phase 3~4 |
| ANNOUNCEMENT | AI 활성 | 일정/기관/연락처의 source fidelity 부족 | Phase 3~4 |
| SEQUENTIAL_WORKFLOW | AI 활성 | 단계 순서/누락 answer engine 없음 | Phase 3 |
| DIGITAL_FORUM_INTERFACE | 비활성 | source-preserving만 존재 | Phase 6 |
| INSTRUCTIONAL_SCENE | 비활성 | canvas polymorphic 계약 불명확 | Phase 6 |
| PROMOTIONAL_CANVAS | 비활성 | visual/missing-part 정답 규칙 없음 | Phase 6 |
| INCIDENT_REPORT | 비활성 | 원인/timeline answer engine 없음 | Phase 5 |
| REPORT | 비활성 | section/table answer engine 없음 | Phase 5 |
| QUANTITATIVE_CHART | 비활성 | 수치 answer engine 없음 | Phase 5 |
| STATISTICS | 비활성 | backend `category`와 frontend `label` 불일치 | Phase 4~5 |

## Phase 0 — 실패를 성공으로 저장하지 않기

- `accepted.length === 0`이면 exam 저장 금지
- 1개 이상이면 accepted 문항만 partial exam으로 저장하고 shortfall을 명시
- 취소/timeout/재시작 중에는 partial exam 저장 금지
- `POST /exams`와 `/exams/jobs`의 AI feature gate 동작을 통일
- frontend job receipt에 `errorCode`, `errorStage`, `shortfall`, rejection codes를
  노출

### 진행 상태

- [x] accepted 0개이면 AI exam을 저장하지 않도록 변경
- [x] accepted 1개 이상이면 partial exam으로 저장하고 shortfall을 표시
- [x] provider/validator rejection message를 로그와 candidate validation에 기록
- [x] frontend receipt에 rejection code별 집계 노출

### 테스트

- 3/0, 3/2, 20/19는 failed이며 exam이 없음
- 3/3만 completed
- provider 중 취소/timeout 시 exam이 없음
- refresh/restart 후에도 terminal job 상태 유지

## Phase 1 — 단일 TPL registry

현재 여러 파일에 흩어진 목록을 하나의 registry에서 파생한다.

- [x] enabled/disabled TPL과 provider slot field를 `TPL_GENERATION_REGISTRY`에서 파생
- [x] 생성 blueprint에 provider slot count를 기록하고 provider schema가 이를 사용
- [x] 비활성 TPL은 registry에 남기되 AI generation 경로에서 계속 거부

```ts
type TplGenerationSpec = {
  name: StructuredTplName;
  providerSlots: ProviderSlotSpec | null;
  materializer: MaterializerKind;
  answerEngine: AnswerEngineKind;
  sourcePreserving: boolean;
  webContract: ContractCheck;
  pdfContract: ContractCheck;
  enabled: boolean;
};
```

이 registry로부터 다음을 생성한다.

- provider slot field/schema
- `AI_GENERATION_TEMPLATES`
- `canGenerateAiTemplate`
- materializer capability
- validator routing
- rollout/kill switch

TPL이 registry에만 추가되고 adapter가 없는 상태는 컴파일/테스트에서
실패하게 한다.

## Phase 2 — Provider contract 정규화

- [x] enabled TPL의 typed slot adapter와 명시적 count 검증
- [x] legacy 2-field 응답은 server-owned fallback으로만 제한
- [x] schema/provider/validation rejection code와 message를 candidate에 보존

### Canonical response

각 TPL은 `slotValues`를 명시적으로 가진다.

```json
{
  "slotValues": ["..."],
  "choiceTexts": ["...", "...", "...", "...", "..."],
  "explanationText": "..."
}
```

예외적으로 대화는 `messageTexts`, matrix는 `cellTexts`처럼 typed field를
사용하되, slot 개수는 Blueprint에 이미 고정해 둔다.

- newline/Markdown으로 slot 수를 추정하지 않는다.
- legacy 2-field 응답은 TPL별로 명시적인 compatibility adapter에서만 처리한다.
- Conversation legacy 응답은 원본 speaker sequence를 재사용할 때만 허용한다.
- Article/Document/Workflow가 필요한 배열을 못 주면 case fallback하지 않고 폐기한다.
- schema 오류, timeout, transport, semantic reject를 별도 failure code로 구분한다.

### Provider choice 검증

provider가 선택지를 반환하는 TPL은 다음을 검증한다.

- 정확히 5개
- 중복/빈 문장 없음
- 정답 위치의 문장이 answer rule과 일치
- distractor 각각이 지정된 오답 규칙을 만족
- polarity와 stimulus 조건에 맞음
- provider choice가 서버 정답 번호를 변경할 수 없음

## Phase 3 — TPL별 materializer와 answer engine

- [x] enabled TPL materializer routing is registry-gated; disabled source-preserving TPLs remain disabled

### CASE

- positive/negative polarity 고정
- source archetype의 target/distractor rule 보존
- 개념명만 나열한 선택지 거부

### CONVERSATION

- participant와 speaker sequence 서버 고정
- message count를 Blueprint에서 고정
- legacy 2-field 응답은 source 대화 보존 adapter로만 처리
- 대화 내용이 정답 판단에 필요하지 않으면 거부

### MATRIX

- 행/열 수와 모든 행의 폭을 Blueprint에 저장
- rectangular matrix만 허용
- cell 수는 provider slot과 정확히 일치
- 숫자/단위/비교 관계 보존

### DOCUMENT / ARTICLE / ANNOUNCEMENT

- paragraph/detail count 서버 고정
- 빈 날짜·기관·연락처를 임의로 채우지 않음
- source metadata가 없으면 해당 TPL을 제외
- Web/PDF가 같은 field name을 사용하도록 통합

### WORKFLOW

- step count/order/index 서버 고정
- missing-step 위치와 정답 규칙을 서버에서 계산
- synthetic label만 생성된 workflow는 거부

### NUMERIC / REPORT / SPECIAL

- 수치/단위/축/데이터셋 dimension은 서버 source 값 그대로 보존
- causal/timeline/section/table answer engine 없는 TPL은 AI 활성 금지
- source-preserving adapter는 AI 생성 성공으로 기록하지 않음

## Phase 4 — Renderer 계약 통합

- TPL schema, backend normalizer, frontend type, PDF renderer가 같은 field name을 사용
- `TPL_STATISTICS`의 `category`/`label` 중 하나로 통일
- permissive PDF 검사를 실제 필드 검증으로 변경
- 14개 TPL 모두 Web/PDF golden fixture 추가
- 빈 값, placeholder, 누락 필드가 저장 전에 거부되도록 한다.

## Phase 5 — 관측성과 오류 전달

- [x] run에 template별 및 failure-code별 rejection 집계 저장
- [x] job receipt와 frontend toast에 failure stage/message/code 및 rejection 집계 노출

모든 후보 attempt에 저장:

- runId, blueprintId, template, attempt
- provider model, prompt hash, latency, token usage
- sanitized provider response 또는 response shape summary
- failure code와 상세 message
- validator version

job receipt에는 다음을 포함한다.

- template별 시도/성공/실패
- failure code별 count
- shortfall 이유
- 실패 단계

원문 전체나 민감정보는 로그에 남기지 않고, keys/length/count/hash만 기록한다.

## Phase 6 — 단계적 활성화

각 TPL은 아래 조건을 모두 통과해야 활성화한다.

- source-backed analysis
- provider schema/parser
- materializer
- deterministic answer engine
- source-fidelity validator
- Web/PDF fixture
- 3/5/20 shadow generation
- exact-count persistence test

순서:

```text
CASE
→ CONVERSATION
→ MATRIX
→ DOCUMENT/ARTICLE/ANNOUNCEMENT
→ WORKFLOW
→ INCIDENT/REPORT
→ CHART/STATISTICS
→ FORUM/INSTRUCTIONAL/PROMOTIONAL
```

## 최종 acceptance criteria

- provider가 legacy 2-field를 반환해도 지원 TPL에서는 명확한 compatibility path로 처리
- unsupported slot은 다른 TPL로 변환되지 않음
- 3문항 요청의 accepted가 항상 3개일 때만 completed
- accepted 후보 100%가 선택 TPL schema와 Web/PDF contract 통과
- answer rule mismatch 0건
- source number/unit/order 손실 0건
- rejected attempt의 원인 조회 가능
- frontend에서 실패 단계와 원인이 표시됨
- `simply_reference` 회귀 테스트가 모두 통과

## Verification

- [x] `backend`: `npm run build`
- [x] `backend`: focused AI TPL/provider/materializer/validator/generation/job tests
- [x] `frontend`: `npm run build`
- [x] `backend`: `simply_reference` and disabled source-preserving adapter regressions
- [x] enabled TPL semantic/source-fidelity admission and Web/PDF contract checks

Full backend Jest was also attempted; 93 suites passed and 3 existing
reference-frame cache suites failed in the pre-existing synchronous reference
generation path (`EXAM_GENERATION_FAILED` mapping). Those failures are outside
this AI TPL slice and were not changed.

Follow-up slice verification (2026-08-05): focused provider/materializer/
validator/contract tests passed (42 tests), the broader AI/reference selection
focus passed (37 tests), `npm run build` passed, and `git diff --check` passed.
- Final focused command verification (2026-08-05): `npm test -- --runInBand src/exams/ai`
  passed 11 suites / 61 tests; `npm run build` passed.

## Remediation follow-up (2026-08-05)

- [x] source-fact validation reports the missing anchor and passes the failure reason plus required anchors into the next bounded repair prompt
- [x] after the repair budget, source-preserving fallback is attempted only for certified renderer-valid source TPLs and is rechecked by schema, renderer, and answer validation
- [x] Conversation legacy two-field responses reconstruct messages from the Blueprint participant/speaker sequence and exact message count; mismatches reject deterministically
- [x] focused tests cover anchor repair prompts, legacy conversation reconstruction, and sequence mismatch rejection
- [x] preserve exact-count/no-partial-save, TPL/answer/source validation; `simply_reference` was not modified
