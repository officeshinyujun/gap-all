# AI 선택지 단서 기반 생성 계획

## 1. 목적

AI가 다음처럼 개념명만 바꿔 끼운 단순한 선택지를 만들지 않도록 한다.

```text
① 이 사례는 A 개념의 핵심 조건에 부합한다.
② 이 사례는 B 개념의 핵심 조건에 부합한다.
```

대신 문제 본문에서 서로 다른 단서를 집어 다음 순서로 판단하게 한다.

```text
본문의 구체적 단서
→ 해당 단서가 의미하는 개념·조건
→ 옳고 그름 판단
```

예시:

```text
본문: 만 18세, 5인 사업장, 주 40시간, 수습 기간 임금 미지급

① 만 18세라는 연령은 연소근로자 보호 규정 적용 여부를 판단하는 기준이다.
② 상시 근로자 수는 해당 법률의 적용 여부와 관계가 없다.
③ 수습 기간이면 사용자는 임금을 지급하지 않아도 된다.
④ 주당 근로시간은 근로조건 판단과 무관하다.
⑤ 첫 주급 지급 여부는 근로계약과 관계없이 사용자가 결정한다.
```

## 2. 현재 문제와 확인된 사실

- `AiBlueprintService`는 `targetConcept`, `distractorConcepts`, `sourceFactAnchors`, `answerRule`을 이미 보유한다.
- `AiQuestionCandidate`는 `choiceTexts` 5개를 받을 수 있다.
- 인증된 `single_selection`에서는 provider 선지를 저장하고, 서버가 정답 위치를 소유한다.
- `truth_combination`은 reference의 ㄱㄴㄷㄹ 구조를 보존하는 별도 경로다.
- `sourceFactAnchors`는 현재 숫자·단위 중심으로 추출된다.
- validator는 선지 개수·중복·정답 개념 포함 여부는 확인하지만, 각 선지가 본문 단서와 연결되는지는 확인하지 않는다.
- 따라서 provider가 선지를 만들지 못하거나 품질 검증을 통과하지 못하면 generic 선지로 후퇴할 수 있다.

## 3. 범위

### 포함

- `single_selection` 선택지 생성 계약 개선
- 문제 본문 단서와 선택지의 연결 강제
- generic 선택지 차단 및 재생성
- 정답·오답의 개념 경계와 사고 포인트 검증
- 성직·공일 실제 reference 기반 fixture 및 생성 검증

### 제외

- 모든 문제를 ㄱㄴㄷㄹ형으로 통일하지 않는다.
- 기존 `truth_combination`의 source-preserving 계약은 유지한다.
- reference 데이터와 정답 데이터는 수정하지 않는다.
- 새 모델·새 외부 의존성은 추가하지 않는다.
- 의미 판정을 위한 별도 LLM 검증기는 1차 범위에 넣지 않는다. 결정적 검증으로 부족한 사례가 확인될 때만 2차로 검토한다.

## 4. 설계 원칙

### 4.1 문제 유형별 분리

```text
sourceArchetype.responseMode === truth_combination
  → 기존 ㄱㄴㄷㄹ·보기 구조 사용

sourceArchetype.responseMode === single_selection
  → 단서 기반 5개 선택지 생성
```

일반 선택형을 ㄱㄴㄷㄹ로 바꾸지 않는다. ㄱㄴㄷㄹ은 4개 판단문 각각의 참·거짓을 검증할 수 있을 때만 안전하다.

### 4.2 서버 소유 영역

서버가 계속 소유한다.

- 정답 번호
- 선택지 개수
- TPL
- source evidence
- distractor 후보 개념
- 문제의 answer rule

AI는 서버가 배정한 사고 포인트에 맞춰 문장만 작성한다.

## 5. Phase A — 선택지 초점 데이터 추가

### 변경 대상

- `backend/src/exams/ai-blueprint.types.ts`
- `backend/src/exams/ai-blueprint.service.ts`
- `backend/src/exams/ai-question-materializer.ts`

### 5.1 Blueprint 타입

`AiQuestionBlueprint`에 선택지별 초점을 추가한다.

```ts
type AiChoiceFocus = Readonly<{
  concept: string;
  cue: string;
  relation: 'correct' | 'boundary' | 'misconception';
}>;
```

```ts
choiceFocuses: readonly AiChoiceFocus[]; // 정확히 5개
```

초점 구성:

- 정답 위치에는 `targetConcept`
- 나머지 4개에는 `distractorConcepts`
- 각 초점에는 원문 단서 또는 mutable slot을 하나씩 연결
- 동일한 cue를 여러 선택지에 재사용하지 않음
- 정답 번호는 기존 `answerIndex`를 유지

### 5.2 초점 배정 규칙

우선순위:

1. source fact anchor
2. 원문에서 추출한 수치·기간·행위·주체
3. `mutableSlots`
4. target/distractor 개념의 구분 조건

충분한 단서가 없는 reference는 억지로 선택지를 만들지 않고 blueprint 단계에서 제외하거나 source-preserving 경로로 보낸다.

## 6. Phase B — provider prompt 개선

### 변경 대상

- `backend/src/exams/ai-provider.adapter.ts`
- `backend/src/exams/ai-provider.adapter.spec.ts`

### 6.1 선택지 생성 규칙

기존 `choiceTexts` 출력 형식은 유지하고, blueprint의 `choiceFocuses`를 prompt에 넣는다.

각 선택지는 다음 조건을 만족해야 한다.

- 지정된 `cue`를 실제 문장에 반영
- 지정된 `concept`의 판단 기준을 적용
- 정답은 핵심 조건을 정확히 적용
- 오답은 인접 개념·조건 누락·조건 과잉·적용 범위 혼동 중 하나를 표현
- 다른 선택지와 같은 문장 골격만 반복하지 않음
- 개념 정의만 쓰지 않음
- `핵심 조건에 부합한다` 같은 generic 문장 금지
- 본문에 없는 사실·수치·기관·법 조항을 추가하지 않음

### 6.2 예시 추가

prompt example에는 다음 두 유형을 추가한다.

- 수치·기간 중심 사례
- 행위·역할·조건 비교 중심 사례

각 예시에는 좋은 선택지와 나쁜 선택지를 함께 넣어 모델이 차이를 학습하게 한다.

## 7. Phase C — deterministic 선택지 품질 검증

### 변경 대상

- `backend/src/exams/ai-question-validator.ts`
- `backend/src/exams/ai-question-materializer.ts`
- `backend/src/exams/ai-question-validator.spec.ts`

### 7.1 Blueprint 검증

다음이면 blueprint를 거부한다.

- `choiceFocuses`가 5개가 아님
- 정답 초점이 target concept이 아님
- 동일 concept/cue가 중복됨
- distractor가 4개가 아님
- 선택지 초점에 연결할 source cue가 없음

### 7.2 Candidate 선택지 검증

각 선택지에 대해 확인한다.

- 5개인지
- 중복되지 않는지
- 최소 길이·문장 형태를 만족하는지
- 지정된 cue 또는 cue의 핵심 토큰이 포함되는지
- generic 패턴인지
- 선택지 간 핵심 판단 포인트가 다른지
- 정답 선택지가 target concept의 조건을 다루는지
- 오답이 지정된 distractor concept 또는 개념 경계를 다루는지

generic 차단 패턴 예시:

```text
이 사례는 X의 핵심 조건에 부합한다.
이 자료는 X에 해당한다.
X의 정의이다.
옳은 설명이다.
```

단, 모든 문장을 단순 regex만으로 판단하지 않고 다음 조건을 함께 본다.

- source cue 포함 여부
- choice focus와의 문자열·정규화 일치
- 선택지 간 구조적 fingerprint

### 7.3 Fallback 정책

인증된 `single_selection`에서 provider 선택지가 없거나 품질 검증에 실패하면 generic 선지를 저장하지 않는다.

```text
provider 선지 검증 성공 → 저장
검증 실패 → repair prompt
3회 실패 → 후보 reject
```

legacy blueprint처럼 sourceArchetype이 없는 내부 테스트·구형 경로만 기존 fallback을 허용한다.

## 8. Phase D — 해설 품질 개선

### 변경 대상

- `backend/src/exams/ai-provider.adapter.ts`
- `backend/src/exams/ai-question-validator.ts`

해설은 정답 개념만 설명하지 않고 다음을 포함해야 한다.

- 정답 선택지가 맞는 본문 단서
- 정답 개념을 적용한 이유
- 가장 헷갈리는 오답 하나 이상이 틀린 이유

최소 검증:

- explanation에 target concept 포함
- 정답 cue 또는 source fact anchor 포함
- generic 설명만 있는 경우 reject

## 9. Phase E — TPL별 동작 유지

선택지 초점 개선은 TPL 구조를 훼손하지 않아야 한다.

### single_selection

- 사례: 사례 속 주체·행위·조건을 선지별로 판단
- 대화: 특정 발화·발화자·상황 변화에 대한 판단
- 표: 특정 행·열·셀 관계에 대한 판단
- 문서: 문단·조항·기간·발행 조건에 대한 판단

### truth_combination

- 기존 reference의 ㄱㄴㄷㄹ과 보기 구조 보존
- 일반 선택지 초점 로직을 적용하지 않음
- source-preserving 자료와 보기의 일관성 유지

## 10. 테스트 계획

### 단위 테스트

- `choiceFocuses` 5개 생성
- 정답 focus가 answerIndex와 일치
- generic 선택지 reject
- 본문 cue와 무관한 선택지 reject
- 동일 cue 반복 reject
- target/distractor 개념 경계 검증
- valid provider choices가 실제 저장되는지
- sourceArchetype 없는 legacy fallback 유지

### fixture 테스트

다음 fixture를 성직·공일 각각 추가한다.

1. 인물·역할·행위 사례
2. 숫자·기간 조건 사례
3. 표의 행·열 판단
4. 대화 발언 판단
5. 추상적 설명문만 반환하는 실패 후보
6. 본문과 무관한 그럴듯한 선택지

### 생성 결과 검증

각 생성 결과에서 확인한다.

- 5개 선택지가 각각 다른 사고 포인트를 갖는지
- 선택지에 본문 단서가 반영됐는지
- 정답과 해설이 같은 단서를 가리키는지
- generic fallback이 없는지
- ㄱㄴㄷㄹ 문제의 기존 구조가 깨지지 않는지

## 11. 관측성

`AiGenerationRun`에 선택지 reject 이유를 집계한다.

```text
AI_CHOICE_GENERIC
AI_CHOICE_CUE_MISSING
AI_CHOICE_FOCUS_MISMATCH
AI_CHOICE_DUPLICATE_FOCUS
AI_EXPLANATION_MISMATCH
```

로그에는 다음을 남긴다.

- blueprint ID
- template
- target concept
- choice focus
- 실패한 선택지 번호
- reject reason

선택지 원문 전체는 민감 데이터 노출을 피하기 위해 필요할 때만 debug 로그에 남긴다.

## 12. 롤아웃 순서

1. `choiceFocuses` 타입과 생성 규칙 추가
2. prompt에 초점 정보 전달
3. generic 선택지 reject 및 repair 연결
4. validator·materializer 테스트 추가
5. 성직 1개 단원 shadow 생성
6. 공일 1개 단원 shadow 생성
7. reject 사유와 생성 결과 검토
8. 문제 없는 TPL부터 전체 활성화
9. 실패율이 높으면 TPL별로 단계적 rollback

## 13. 완료 기준

- [ ] 일반 선택지 5개가 서로 다른 본문 단서를 다룸
- [ ] generic 선택지가 인증된 문제에 저장되지 않음
- [ ] 정답 선택지와 해설이 같은 판단 근거를 가리킴
- [ ] source와 무관한 오답이 reject됨
- [ ] 성직·공일 fixture 테스트 통과
- [ ] 기존 truth-combination 문제 구조 유지
- [ ] TPL별 renderer contract 통과
- [ ] 생성 로그에서 선택지 reject 원인을 확인할 수 있음

<!-- ponytail: 새 LLM 검증기를 바로 추가하지 않고, 기존 blueprint·source anchor·validator로 먼저 선택지 품질을 제한한다. 결정적 검증으로 의미 품질이 충분하지 않은 실패 사례가 누적될 때만 별도 semantic verifier를 추가한다. -->
