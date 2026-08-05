# 최종 Reference 기반 AI 문제 생성 계획

## 목표

검증된 reference 문제를 출제 구조의 기준으로 삼고, AI는 새로운 상황과
표현을 생성한다. 서버는 TPL, 정답, 보기 구조, 출처, 검증을 소유한다.

최종 목표:

- 여러 TPL source가 있으면 특정 TPL에 편중되지 않음
- AI 응답 형식 오류로 전체 문항이 폐기되지 않음
- source fact·수치·단위·발화 순서·행열 구조 보존
- 정답은 항상 서버 answer engine으로 계산
- 일부 후보 실패가 전체 시험 실패로 이어지지 않음
- 품질이 낮은 문항을 성공으로 위장하지 않음

## 현재 오류의 핵심 원인

최근 실행에서 6개 후보가 모두 폐기됐다.

```text
5개: AI_ANSWER_RULE_MISMATCH
     provider answer choice does not satisfy target concept

1개: AI_INVARIANT_MISMATCH
     source fact anchor missing: 40시간
```

즉 reference 선택이나 OpenAI 연결이 아니라:

1. AI에게 보기까지 만들게 함
2. 서버 answer index와 AI 보기 의미가 다름
3. AI가 원본 source fact를 누락함
4. 검증 실패 후보를 다음 유형으로 안전하게 변환하지 못함
5. 후보 0개가 되어 시험 저장까지 불가능해짐

## 최종 설계 원칙

### AI가 소유하지 않는 것

- `template`
- `correctAnswer`
- `answerIndex`
- 보기 순서
- TPL stimulus DTO 구조
- source lineage
- 정답 판정 규칙

### AI가 소유하는 것

- 새로운 사례 서술
- 자료 문장
- 대화 문장
- 문서/기사 문단
- 표 셀의 표현
- 해설 초안

보기는 기본적으로 서버가 생성한다. AI 보기 생성은 선택적 실험 기능이며,
semantic 검증을 통과하지 못하면 즉시 서버 보기로 대체한다.

## TPL 분류 정책

### 1. Reference 분석

분류 결과를 한 번만 생성하고 공용 DB에 저장한다.

```text
sourceArchetype
sourceTemplate
stemIntent
polarity
responseMode
choiceTopology
informationShape
reasoningPattern
answerRule
invariantFacts
mutableSlots
```

### 2. 분류는 두 단계로 한다

```text
결정론적 parser
→ AI 분석 보정
→ 두 결과 일치 여부 확인
```

불일치하면 AI 분석을 신뢰하지 않고 source를 제외하거나 관리자 검수 대상으로
보낸다. Article을 Case로 바꾸거나 Matrix를 Article로 조용히 변환하지 않는다.

### 3. TPL별 eligibility

각 source는 다음 조건을 모두 통과해야 해당 TPL 후보가 된다.

- 공식 정답 존재
- source stimulus 완전성
- source archetype 확정
- server answer engine 존재
- Web renderer 통과
- PDF renderer 통과
- 필수 metadata 존재
- source fact 추출 성공

## Reference 선택 정책

현재처럼 처음 몇 개 evidence만 잘라서 선택하지 않는다.

### 선택 순서

1. 전체 catalog inventory 계산
2. `baseSourceId`로 distinct source 생성
3. 단원 round-robin
4. TPL round-robin
5. distinct base source 우선
6. variant는 reserve가 부족할 때만 사용
7. replacement reserve를 별도로 준비

예시: 3문항 요청

```text
primary 3개
reserve 최소 5개
```

여러 TPL이 존재하면 한 TPL이 `ceil(requestedCount / 2)`를 초과하지 않도록
우선 배분한다. 단, 실제 supply가 하나뿐이면 억지로 다른 TPL을 만들지 않는다.

## 모델 정책

```env
OPENAI_AI_ANALYSIS_MODEL=gpt-4o-mini
OPENAI_AI_CANDIDATE_MODEL=gpt-4o
OPENAI_AI_REPAIR_MODEL=gpt-4o
OPENAI_AI_VERIFICATION_MODEL=gpt-4o
```

- 분석: cacheable classification이므로 mini
- 최종 문항: TPL 준수와 품질이 중요하므로 4o
- repair: validator feedback 이해가 필요하므로 4o
- verification: 처음에는 4o

response format은 반드시 실제 OpenAI 호출에 전달하고, telemetry에 실제
응답 model을 기록한다.

## Provider contract

### 기본 응답

```json
{
  "slotValues": ["..."],
  "explanationText": "..."
}
```

TPL별 slot field:

```text
Case: stemText
Conversation: messageTexts
Matrix: cellTexts
Formal/Article: paragraphTexts
Announcement: detailTexts
Workflow: stepTexts
```

`choiceTexts`는 optional이다. 반환되더라도 서버가 검증하고 실패하면 버린다.

### Legacy 응답

2-field 응답은 모든 TPL에 무조건 허용하지 않는다.

- Conversation: 원본 speaker sequence로 정확히 복원 가능한 경우만 허용
- Case: server materializer가 구조를 완성할 수 있는 경우만 허용
- Paragraph/Matrix/Workflow: 필요한 배열을 복원할 수 없으면 거부
- 다른 TPL로 변환하지 않음

## 생성·검증 흐름

```text
primary candidate
→ provider schema validation
→ materializer
→ source fact validation
→ server answer engine
→ TPL schema
→ Web/PDF contract
→ duplicate check
→ accepted
```

### 선택지 처리

1. AI choiceTexts가 없으면 서버가 생성
2. AI choiceTexts가 있으면 정답 의미/극성/distractor를 검사
3. AI choice가 틀리면 지문을 버리지 않고 서버 보기로 재물질화
4. 서버 보기로도 검증되지 않을 때만 후보 폐기

이렇게 하면 AI가 선택지를 잘못 표현했다는 이유로 좋은 stimulus까지 버리지
않는다.

### Source fact 처리

```text
source fact 누락
→ 누락 목록을 포함한 repair prompt 1회
→ 재검증
→ 실패 시 같은 TPL source-preserving fallback
→ fallback도 실패하면 source 제외
```

허용:

- 공백 차이
- NFC/NFKC 차이

금지:

- 숫자 변경
- 단위 변경
- 비교 방향 변경
- source에 없는 수치 추가

## TPL별 answer engine

### Case

- positive/negative polarity 보존
- 정답 index는 source answer 또는 서버 규칙으로 계산
- provider choice 의미는 optional

### Conversation

- participant/speakerSequence/messageCount 서버 고정
- 원본 line이 speaker로 정확히 매핑되어야 함
- 대화가 풀이에 필요하지 않으면 제외

### Matrix

- row/column 수 서버 고정
- rectangular 여부 확인
- cell 수와 slot 수 exact match
- 숫자·단위·비교 관계 보존

### Document / Article / Announcement

- paragraph/detail 수 서버 고정
- source에 없는 date/author/organizer/contact 합성 금지
- metadata 누락 source는 AI eligibility 제외

### Workflow

- step 순서/count/index 서버 고정
- missing-step/order 판단을 서버에서 계산
- synthetic label만 있는 결과 거부

### Numeric / Special

- Chart/Statistics는 수치 answer engine 없이는 AI 비활성
- Incident/Report는 cause/timeline/section/table engine 필요
- Forum/Instructional/Promotional은 source-preserving만 허용

## Retry와 Replacement

같은 prompt를 단순히 세 번 보내지 않는다.

```text
1차 primary: gpt-4o
→ network/rate-limit만 최대 2회 retry
→ schema/semantic 실패: failure feedback repair 1회
→ 실패: 다른 base source
→ TPL 고갈: 다른 eligible TPL
→ reserve 고갈: shortfall
```

각 attempt에 저장:

- primary/repair/replacement/fallback 유형
- repair parent
- TPL
- base source
- model
- prompt hash
- failure code/message

## 저장 정책

현재 사용자 요구를 반영한다.

```text
accepted 0개 → failed, exam 없음
accepted 1개 이상 → 통과 문항만 partial exam 저장
```

partial 결과에는 반드시 표시한다.

- 요청 수
- 저장 수
- shortfall
- TPL별 실패 수
- fallback 여부

## 오류 코드 체계

```text
SOURCE_NOT_ELIGIBLE
SOURCE_FACT_MISSING
TPL_UNSUPPORTED
TPL_SLOT_COUNT_MISMATCH
TPL_RENDER_REJECTED
CONVERSATION_SEQUENCE_MISMATCH
MATRIX_SHAPE_MISMATCH
ANSWER_RULE_MISMATCH
PROVIDER_SCHEMA_INVALID
PROVIDER_TIMEOUT
PROVIDER_RATE_LIMIT
PROVIDER_NETWORK
DUPLICATE_REJECTED
AI_RETRY_EXHAUSTED
```

오류는 template/blueprint/attempt와 함께 DB에 저장하고 frontend job receipt에도
노출한다.

## Inventory와 Shadow

subject/unit/TPL별로 다음을 출력한다.

- raw source
- eligible source
- distinct base source
- variant capacity
- planned/reserve
- exclusion reason
- first-pass acceptance
- repair 후 acceptance
- model/latency/token/cost

동일 corpus에서 mini와 4o를 비교한다. live user job 전에 shadow로 검증한다.

## Rollout

```text
Case 5% → 25% → 100%
→ Conversation
→ Matrix
→ Document/Article/Announcement
→ Workflow
```

각 TPL은 3/5/20문항 shadow와 Web/PDF fixture를 통과해야 활성화한다.

## 최종 기준

- first-pass acceptance ≥ 95% / enabled TPL
- repair/replacement 후 acceptance ≥ 99%
- 충분한 reserve가 있을 때 exact requested count ≥ 99%
- provider schema/parser mismatch 0
- source number/unit/order 손실 0
- answer rule mismatch 0
- Web/PDF parity 100%
- cancellation/timeout 실패 후 exam 저장 0
- supply가 허용하는 3문항 이상 요청의 90%에서 2개 이상 TPL 사용

## 구현 체크리스트

- [x] AI provider 선택지를 저장 답안으로 사용하지 않고 서버 answer engine 선택지를 사용
- [x] provider choice semantic 오류가 stimulus 전체 폐기로 이어지지 않도록 fallback 적용
- [x] TPL의 `choiceEncoding`을 반영하고 `truth_combination`은 certified ㄱㄴㄷ 선택지 보존
- [x] provider answer mismatch 회귀 테스트 추가
- [x] ㄱㄴㄷ 조합형 answer engine 회귀 테스트 추가
- [x] 생성 성공 후 저장 실패를 `AI_PERSISTENCE_FAILED`로 분리하고 내부 오류 요약 로그 추가
- [x] fallback 성공 시 동일 `(run, blueprint, attempt)` rejection과 accepted의 telemetry 충돌 제거
- [x] source fact anchor 실패 및 repair 회귀 테스트 확인
- [ ] TPL별 acceptance/rejection fixture 전체 추가
- [ ] 실제 Supabase shadow run으로 TPL·모델별 통과율 측정
- [ ] Web/PDF renderer parity fixture 검증
- [x] 프론트 생성 모달에서 AI 신규 문항 선택 비활성화

## 이번 변경 검증 결과

- `npm test -- --runInBand src/exams/ai-question-generation.service.spec.ts src/exams/ai-question-validator.spec.ts` 통과 (2 suites, 13 tests)
- `npm test -- --runInBand src/exams/ai-question-generation.service.spec.ts src/exams/ai-question-validator.spec.ts src/exams/ai-question-materializer.spec.ts` 통과 (3 suites, 20 tests)
- `npm test -- --runInBand src/exams/ai-answer-engine.spec.ts src/exams/ai-question-generation.service.spec.ts src/exams/ai-question-validator.spec.ts src/exams/ai-question-materializer.spec.ts` 통과 (4 suites, 23 tests)
- `npm run build` 통과
- 전체 `npm test -- --runInBand`는 기존 reference/exam persistence 및 cache transaction fixture 실패로 중단됨
- `npm run typecheck`는 기존 scripts/auth/chat/study/reference-frame/notification 테스트 타입 오류로 실패함
- `git diff --check` 통과
- persistence failure 회귀 테스트 포함 3 suites, 14 tests 통과
- frontend `npm run build` 통과
- 실제 로그에서 원인 확인: `ai_generation_candidates` unique index 충돌 (`run_id`, `blueprint_id`, `attempt`)

남은 체크리스트는 실제 catalog·renderer·Supabase 환경이 필요한 범위다.
