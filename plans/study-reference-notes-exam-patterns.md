# Study 출제 포인트 강화 실행계획

## 1. 목표

공일(`kongil`)·성직(`sungjik`) 정리노트와 Supabase의 `reference_questions`를 함께 사용해 단원별 출제 포인트를 Study에 제공한다.

두 자료의 역할은 분리한다.

```text
정리노트              → 출제 포인트 후보·분류 기준을 찾는 내부 참고자료
reference_questions   → 실제 출제 근거·빈도·대표 문제의 기준 데이터
교과서/기존 카드       → 최종 개념 설명의 근거
```

정리노트의 문장·이미지·표를 Study나 Q3에 직접 노출하거나 복사하지 않는다.

## 2. 현재 구조와 문제

- `reference_questions`에는 `subject`, `unit_number`, `source_payload`, `targetConcepts`, 문제 본문·선지·정답 등이 이미 저장되어 있다.
- Q3는 `SimplyReferenceGenerationService`를 통해 `reference_questions`를 실전문제 생성의 근거로 사용한다.
- `UnitExamProfile`과 `AiUnitProfileService`가 이미 단원·개념·문제 유형 프로파일을 생성·저장하고 있으므로 새 프로파일 테이블을 만들지 않는다.
- 현재 Study의 `getFrequencyConcept()`는 주로 `textbook_concept_cards`와 카드 내부의 단일 `realQuestion`을 사용한다.
- 카드 변환 과정에서 `questionFormats`가 손실되고, `conceptExamPatterns`·`relatedQuestions`가 충분히 연결되지 않는다.

핵심 변경 방향은 **Study도 Q3와 같은 canonical reference question 집합을 읽도록 만드는 것**이다.

## 3. 1차 범위

전체 단원을 한 번에 처리하지 않고 다음 파일럿부터 진행한다.

1. 공일과 성직에서 각각 검증 가능한 단원 1개 선정
2. 정리노트 후보와 `reference_questions`를 연결
3. 단원 출제 포인트를 프로파일에 저장
4. Study 개요 화면에 표시
5. 검수 후 Q3에 연결

파일럿의 예시는 사용자가 언급한 성직 4단원처럼 실제 reference 문제가 충분한 단원으로 한다. 단원 번호는 DB 매핑 확인 후 확정한다.

## 4. 단계별 실행계획

### Phase A. 기준 데이터 점검

대상:

- `reference_questions`
- `UnitExamProfile`
- `AiUnitProfileService`
- `textbook/parsed/kongil`
- `textbook/parsed/sungjik`
- 두 정리노트 PDF

작업:

1. 과목·단원별 `reference_questions` 개수와 출처를 집계한다.
2. `unit_number`와 실제 Study 단원 매핑을 확인한다.
3. `targetConcepts` 누락·오탈자·동의어를 목록화한다.
4. 정리노트의 단원·강 범위를 DB 단원에 매핑한다.
5. 문제 수가 부족하거나 단원 매핑이 불명확한 단원은 별도 표시한다.

완료 기준:

- 파일럿 단원별 reference 문제 목록이 확정됨
- 각 문제에 `logicalSourceId`와 출처 정보가 있음
- 노트의 후보 주제를 어느 단원에 적용할지 결정됨

### Phase B. 정리노트 후보 추출

PDF는 비공개 분석 입력으로만 사용한다. OCR/이미지 분석 결과에서 다음 구조만 만든다.

```text
noteCandidate:
  subject
  unitNumber
  titleCandidate
  comparisonAxes
  formatCandidates
  trapCandidates
  notePage          # 내부 검수용
```

원문 문단, 이미지, 긴 인용문은 결과 데이터에 저장하지 않는다.

후보 예시:

```text
titleCandidate: 기업 형태 비교
comparisonAxes: [책임 범위, 의사결정, 지분 양도]
formatCandidates: [비교형, 사례 판단형]
```

이 후보는 확정된 학습 콘텐츠가 아니라 다음 단계의 분류 기준이다.

### Phase C. Reference 문제 분류·검증

각 파일럿 단원의 `reference_questions`를 정리노트 후보와 대조한다.

문제별로 다음 파생 태그를 만든다.

```text
examTopic
questionFormat
reasoningPattern
keyChecks
commonTrap
candidateMatch
reviewStatus
```

분류 규칙:

1. 문제 본문·자료·선지·정답을 기준으로 분류한다.
2. 정리노트는 후보 주제와 비교축을 제안하는 데만 사용한다.
3. 노트에만 있고 실제 문제 근거가 없으면 `note_only`로 남긴다.
4. 실제 기출과 노트가 충돌하면 기출·교과서 기준으로 처리한다.
5. 자동 분류 결과는 최소 파일럿 단원에 대해 사람이 검수한다.

`AiUnitProfileService`의 기존 `AiQuestionFamily`, `archetypePatterns`를 문제 형식 분류에 재사용한다. 새 유형 체계는 기존 값으로 표현할 수 없을 때만 추가한다.

### Phase D. UnitExamProfile 확장

새 테이블 대신 기존 `unit_exam_profiles.profile` JSON에 Study용 파생 영역을 추가한다.

```text
profile.studyInsights
  version
  sourceQuestionCount
  verifiedQuestionCount
  patterns[]
    id
    title
    summary
    frequency
    confidence
    questionFormats[]
    keyChecks[]
    commonTraps[]
    referenceQuestionIds[]
```

기존 Q3 프로파일 필드는 유지한다. Study용 설명과 Q3 생성용 제약을 분리해 기존 생성 로직을 깨지 않도록 한다.

`source_fingerprint`가 변경되면 프로파일을 재생성하고, 정리노트 분석 결과가 변경되면 별도의 `studyInsights` 버전을 올린다.

### Phase E. Study API 연결

우선 기존 `StudyService`와 Study controller에 단원 출제 포인트 조회를 연결한다.

권장 방식:

```text
GET /study/:subject/:unit/exam-patterns
```

또는 기존 frequency-concept 응답에 `studyInsights`를 포함한다.

반환 정보:

- 검증된 출제 포인트
- 출제 형식
- 문제 풀이 기준
- 자주 발생하는 함정
- 실제 reference 문제 요약/ID
- 근거가 부족한 경우의 상태값

반환하지 않는 정보:

- 정리노트 PDF 원문
- 정리노트 이미지
- 정리노트의 직접 인용문
- 검수되지 않은 후보 데이터

동시에 다음 기존 문제를 수정한다.

- `transformCardsToFrequency()`에서 `questionFormats`를 빈 배열로 덮어쓰지 않기
- 카드의 단일 `realQuestion` 외에 같은 단원의 reference 문제를 연결하기
- `conceptExamPatterns`, `conceptSubtopics` 보존하기

### Phase F. Study UI 반영

기존 `ConceptStudyPage`의 단원 개요 영역을 활용한다.

표시 항목:

```text
이 단원에서 확인할 출제 포인트

- 출제 포인트명
- 어떤 문제 형식으로 나오는지
- 문제에서 먼저 확인할 기준
- 자주 혼동하는 지점
- 관련 실전문제 보기
```

표현 규칙:

- 근거가 여러 문제면 “자주 출제되는 포인트”로 표시
- 근거가 적으면 “관련 출제 사례”로 표시
- 근거가 없으면 사용자 화면에 표시하지 않음

### Phase G. Q3 연결

Q3에는 정리노트 원문을 전달하지 않는다. 검증된 `studyInsights.patterns`만 사용한다.

생성 요청에 포함할 내용:

- 단원별 출제 포인트
- 포인트별 문제 수 또는 비율
- 문제 형식
- 핵심 판단 기준
- 사용할 reference question ID

생성 결과에는 다음 내부 태그를 남긴다.

```text
unitNumber
examPatternId
questionFormat
sourceReferenceIds
```

Q3는 기존 source-preserving/reference 생성 흐름을 유지하고, 출제 포인트 분포만 추가 제약으로 사용한다.

### Phase H. 전체 단원 확장

파일럿 검수 완료 후 공일·성직 전체 단원에 대해 배치 작업을 실행한다.

배치 결과에는 다음 리포트를 남긴다.

- 단원별 reference 문제 수
- 분류된 문제 수
- 출제 포인트 수
- 근거가 없는 후보 수
- 검수 대기 수
- 누락된 `targetConcepts`
- 기존 프로파일과의 변경 내역

## 5. 검증 계획

### 백엔드 테스트

- 단원·과목별 reference 문제 조회
- 출제 포인트 집계 정확성
- `questionFormats` 손실 방지
- 근거 문제 ID 연결 검증
- source fingerprint 변경 시 재생성
- `studyInsights`가 없는 기존 단원의 fallback

### API/UI 테스트

- 단원 개요에 출제 포인트 표시
- 근거 문제 목록 표시
- 데이터 부족 상태 표시
- 정리노트 원문·이미지가 API 응답에 포함되지 않음

### Q3 검증

- 선택한 단원의 패턴이 생성 요청에 전달됨
- 특정 포인트만 반복되지 않음
- 생성 문제에 source reference가 남음
- reference 문제와 무관한 패턴이 생성되지 않음

## 6. 완료 기준

파일럿 단원에서 다음 조건을 만족하면 1차 완료로 본다.

- 정리노트는 후보 생성에만 사용됨
- 최종 출제 포인트마다 `reference_questions` 근거가 있음
- Study에서 단원별 출제 포인트를 확인할 수 있음
- 관련 실전문제로 이동할 수 있음
- Q3가 검증된 출제 포인트를 반영함
- 정리노트 원문과 이미지는 사용자에게 노출되지 않음

<!-- ponytail: 새 테이블·새 AI 파이프라인을 먼저 만들지 않고 기존 UnitExamProfile과 reference_questions를 재사용한다. 파일럿에서 데이터 품질이 확인될 때만 범위를 넓힌다. -->

## 7. 예상 변경 영역

```text
backend/src/entities/unit-exam-profile.entity.ts
backend/src/exams/ai-unit-profile.service.ts
backend/src/study/study.service.ts
backend/src/study/study.controller.ts
backend/scripts/backfill-study-must-know.ts
backend/src/exams/simply-reference-generation.service.ts
frontend/entities/concept/model/types.ts
frontend/lib/studyQuizApi.ts
frontend/widgets/ConceptStudy/model/useConceptStudy.ts
frontend/widgets/ConceptStudy/ui/ConceptStudyPage.tsx
```

정리노트 분석과 전체 단원 배치는 별도 스크립트로 실행하며, PDF 원본은 프론트엔드 정적 자산이나 API 응답에 포함하지 않는다.

## 8. 실행 상태

- [x] `UnitExamProfile.profile.studyInsights` 생성 및 기존 프로파일 재사용
- [x] Study API·개요 화면에 출제 포인트와 근거 연결
- [x] 개념별 실제 관련 reference 문제 최대 5개 연결
- [x] Study 문제 적용 화면에서 관련 문제 여러 개 순회
- [x] Q3 source-preserving 선택에 Study 패턴 round-robin 제약 연결
- [x] Q3 생성 lineage에 `examPatternId`, `questionFormat`, `sourceReferenceIds` 기록
- [x] 공일·성직 전체 20개 단원 Supabase 프로파일 백필 실행 및 재검증
- [x] 기존 카드의 대표 문제보다 canonical `reference_questions`를 우선하는 Study 연결 보정
- [x] canonical 문제 매칭이 없는 기존 카드의 문제 영역 숨김
- [x] 카드-기출 불일치 감사 스크립트 추가 (`audit:concept-reference-consistency`)
- [x] `mustKnowBlocks` v2 및 카드별 `examMustKnow` 응답 연결
- [x] `시험 전 꼭 외울 것` 비교표·체크리스트 UI 추가
- [x] 전체 카드의 기존 `keyPoints`·`importantNumbers`·`comparisonTable` additive fallback 연결
- [x] 전체 40개 단원에 카드 기반 `mustKnowBlocks` 263개 저장
- [x] `gpt-4o-mini` 기반 AI 보강 실행 및 grounding validator 적용
- [x] AI 보강 결과 165개 block Supabase 저장 확인 (seed 통합 백필 후 현재값)
- [x] AI 검증 실패 단원은 deterministic baseline 유지
- [x] deterministic 보완 seed 통합 후 40개 단원 Supabase 재백필 (card block 263개)
- [x] AI 재시도: 성직 7단원 4개 block 수용
- [ ] AI 재시도: 성직 12단원은 `NO_VALID_BLOCKS`로 deterministic baseline 유지
- [x] 단원별 canonical 출제 빈도 기반 중요도 순위 표시
- [ ] 카드 설명·태그 자체의 자동 수정 — 감사 결과 검수 후 별도 실행

### 검증 결과

- [x] `backend npm run build`
- [x] `frontend npm run build`
- [x] Study 관련 테스트 4 suites / 38 tests 통과
- [x] 관련 백엔드 테스트 4 suites / 45 tests 통과
- [x] reference 생성 테스트 21 tests 통과
- [x] 최종 관련 백엔드 테스트 5 suites / 59 tests 통과
- [ ] `backend npm test -- --runInBand` — 99 suites 중 5개, 13개 테스트가 기존 인증·AI blueprint·reference-frame 테스트 오류로 실패
- [ ] `backend npm run typecheck` — 기존 스크립트·테스트 타입 오류로 실패
- [x] Supabase 전체 백필 — `success`·`industry` 각 1~20단원 저장 후 40개 단원 dry-run 재검증
- [x] AI profile dry-run 재검증 — 40개 단원 모두 profile/reference 입력 확인
- [x] AI 재시도 결과 — 성직 7단원 4개 수용, 성직 12단원 `NO_VALID_BLOCKS`
- [x] 정합성 감사 — success 151 cards / 434 refs, industry 121 cards / 486 refs 조회

## 9. `시험 전 꼭 외울 것` 보완 계획

### 9.1 목표와 범위

기존 카드의 개념명·정의·대표 설명은 우선 유지한다. 카드 안에 흩어져 있거나 긴 설명 속에 묻힌 시험 핵심만 별도 영역으로 끌어올린다.

```text
기존 개념 설명
  ↓
시험 전 꼭 외울 것       # 표·규칙·숫자·순서·판단 기준
  ↓
자주 헷갈리는 구분       # 오답 함정
  ↓
실제 reference 문제      # 적용 확인
```

이번 단계에서 하지 않는 것:

- 기존 개념명 일괄 변경
- 기존 `enrichedDefinition` 일괄 덮어쓰기
- 정리노트 문장·이미지·표의 직접 복사
- 근거 없는 내용을 AI로 추측해 채우기
- `mustKnow` 전용 테이블·의존성·새 생성 파이프라인 추가

### 9.2 저장 위치와 계약

새 테이블 대신 기존 `unit_exam_profiles.profile.studyInsights`에 선택적 영역을 추가한다. 기존 Q3의 `patterns`는 그대로 유지한다.

```text
profile.studyInsights
  version: v2
  patterns[]                  # 기존 출제 포인트·Q3 제약
  mustKnowBlocks[]            # Study 카드의 시험 핵심
```

```ts
mustKnowBlock:
  id
  conceptAliases[]            # 기존 카드와 연결할 별칭
  title
  type: comparison | checklist | classification | process | formula
  summary?
  headers[]?                  # comparison/classification
  rows[][]?                   # comparison/classification
  mustRemember[]              # 반드시 기억할 짧은 문장
  commonTraps[]               # 혼동 포인트
  referenceQuestionIds[]      # canonical 근거
  confidence: high | related
  reviewStatus: verified | textbook_only | review
```

규칙:

1. `verified`: 교과서/기존 카드 근거와 canonical reference 근거가 모두 있을 때 사용자에게 “시험 전 꼭 외울 것”으로 표시한다.
2. `textbook_only`: 교과서 근거는 있으나 reference가 부족하면 “기본 개념 정리”로만 표시할 수 있다.
3. `review`: 출처가 충돌하거나 매칭이 불명확하면 사용자 화면에 표시하지 않는다.
4. 카드당 핵심 블록은 최대 1~2개, 표는 최대 8행으로 제한한다.
5. Q3에는 `mustKnowBlocks` 전체 문장을 전달하지 않고, 검증된 `patterns`와 reference ID만 계속 사용한다.

### 9.3 단원별 표현 형식

모든 개념을 같은 bullet 목록으로 만들지 않고 내용의 성격에 맞는 형식을 선택한다.

| 개념 성격 | 표시 형식 | 예시 |
|---|---|---|
| 기업 형태·권리 비교 | 비교표 | 합명·합자·유한·주식회사 |
| 경제 주체·산업 분류 | 분류표 | 가계·기업·정부, KSIC |
| 진로·발달 이론 | 단계/순서표 | 발달 단계, 진로 결정 과정 |
| 법·제도·근로 조건 | 체크리스트 | 적용 조건, 기간, 예외 |
| NCS·채용 | 절차 흐름 | 서류 → 필기 → 면접 |
| 환경·안전 | 원인-결과표 | 유해 요인 → 재해·예방책 |
| 계산·자료 해석 | 공식·판단 규칙 | 계산식, 단위, 조건 |
| 직업 윤리·사례 | 상황별 판정표 | 사례 단서 → 원칙·책임 |

### 9.4 성직 4단원 파일럿

첫 번째 `mustKnowBlocks`는 다음 순서로 작성한다.

1. 기업 형태별 특징
2. 경제 주체별 역할
3. 기업의 사회적 책임 단계
4. 협동조합·공기업·공사 합동 기업
5. NCS 채용·면접·블라인드 채용

대표 블록의 목표 형태:

```text
시험 전 꼭 외울 것: 기업 형태별 핵심 비교

구분       합명회사       합자회사              유한회사          주식회사
구성       무한책임사원   무한+유한책임사원     유한책임사원      주주
책임       전원 무한      사원별 책임 다름      출자 범위         주주 유한
경영       사원 중심      무한책임사원 중심     사원총회·이사    이사회·대표이사
자본       주식 발행 불가 주식 발행 불가       주식 발행 불가   주식 발행 가능
성격       인적 회사      인적·물적 혼합        물적 회사 성격   대표적 물적 회사
```

위 표는 초안이며, 실제 저장 전 교과서의 회사법 설명과 각 reference 문제의 정답·해설로 행별 검증한다. 검증되지 않은 행은 저장하지 않는다.

카드 화면에는 다음을 함께 표시한다.

```text
반드시 기억
- 합명회사: 무한책임사원만
- 합자회사: 무한책임사원과 유한책임사원
- 합자회사의 유한책임사원은 원칙적으로 업무 집행에 참여하지 않음
- 주식회사: 주식 발행, 주주 유한책임, 소유와 경영의 분리

자주 틀리는 구분
- 합자회사를 모든 사원이 무한책임인 회사로 착각하지 않기
- 유한회사와 주식회사를 모두 주식 발행 회사로 보지 않기
```

### 9.5 전 단원 데이터 작성 절차

성직·공일 각 20개 단원, 총 40개 단원을 다음 순서로 처리한다.

#### Step 1. 카드 인벤토리 생성

카드별로 다음을 추출해 리포트를 만든다.

- subject/unit/card name
- `definition`, `key_points`, `caution`
- `comparisonTable` 존재 여부
- `enrichedDefinition` 안의 표·숫자·조건
- 기존 `realQuestion`의 target concept와 출처
- 연결된 canonical reference 수

#### Step 2. 핵심 후보 추출

기존 카드·교과서에서 다음 후보를 추출한다.

- 반드시 외워야 하는 정의
- 숫자·기간·조건·예외
- 비교 대상과 구분 기준
- 순서·단계·절차
- 반복되는 오답 패턴

정리노트는 후보의 비교축과 함정 후보를 보완하는 내부 입력으로만 사용한다.

#### Step 3. canonical 근거 연결

각 후보를 `reference_questions.targetConcepts` 및 문제 본문·선지·정답과 연결한다.

- exact concept match 우선
- 기존 카드명은 이미 매칭이 양호하다는 전제하에 이름 변경 금지
- 동의어·괄호·표기 차이만 정규화
- 최소 1개 reference ID를 기록
- reference와 교과서가 충돌하면 교과서·검수 결과를 우선

#### Step 4. 블록 생성·검수

자동 추출 결과를 바로 노출하지 않고 다음 검사를 통과한 것만 저장한다.

- 사실 문장이 교과서 또는 카드에 존재하는가
- 표의 각 행이 실제 개념 구분을 나타내는가
- reference 문제에서 해당 구분이 사용되었는가
- 같은 내용을 중복 블록으로 만들지 않았는가
- 함정이 실제 오답 선택지 또는 교과서 주의점에 근거하는가

#### Step 5. 프로파일 백필

검수된 블록을 기존 프로파일에 저장한다.

- `studyInsights` 버전을 `v2`로 올린다.
- source fingerprint가 같아도 `mustKnow` 데이터 버전이 바뀌면 재생성한다.
- 기존 v1 프로파일은 API에서 `mustKnowBlocks: []`로 fallback한다.
- 과목·단원별 생성 수, 검수 대기 수, 근거 없는 후보 수를 리포트한다.

### 9.6 Study API·UI 반영

`FrequencyConceptItem`에 다음 선택 필드를 추가한다.

```ts
examMustKnow?: {
  title: string;
  type: string;
  summary?: string;
  headers?: string[];
  rows?: string[][];
  mustRemember: string[];
  commonTraps: string[];
  referenceQuestionIds: string[];
}
```

`StudyService.transformCardsToFrequency()`에서 카드명 별칭으로 블록을 연결한다. 개념명이 매칭되지 않으면 블록을 노출하지 않는다.

`ConceptStudyPage`의 개념 학습 화면 순서는 다음으로 한다.

1. 개념 정의
2. `시험 전 꼭 외울 것`
3. 비교표·체크리스트·순서표
4. 자주 헷갈리는 구분
5. 출처 태그
6. 문제 적용

표는 실제 HTML table과 `thead`/`th`를 사용하고, 모바일에서는 가로 스크롤을 허용한다. 색상만으로 정답·오답을 구분하지 않는다.

### 9.7 검증 계획

#### 데이터 검증

- 카드별 `examMustKnow` 근거 ID 존재
- 근거 없는 블록 사용자 응답 제외
- 합명·합자·유한·주식회사 표 행별 사실 검수
- 기존 카드 설명과 새 블록의 모순 탐지
- 정리노트 원문·이미지·직접 인용 미포함

#### API 검증

- v2 프로파일의 `mustKnowBlocks` 반환
- v1 기존 프로파일 fallback
- 단원별 block-to-card 매칭
- 매칭 실패 카드에서 보완 영역 미표시
- reference ID가 Study 문제 목록과 일치

#### UI 검증

- 비교표·체크리스트·절차표 표시
- 긴 셀의 모바일 표시
- 빈 블록·빈 행 미표시
- 관련 문제 이동 및 문제 순회 유지
- 캐시 버전 갱신 후 이전 응답이 남지 않음

### 9.8 전체 확장 완료 기준

- 40개 단원에 카드별 `시험 전 꼭 외울 것` 후보 생성
- 각 노출 블록이 교과서/카드와 canonical reference로 검증됨
- 비교형·절차형·법규형·계산형 데이터가 내용에 맞는 형식으로 표시됨
- 기존 개념명·설명·대표문제를 불필요하게 덮어쓰지 않음
- Study에서 카드만 읽어도 핵심 암기 항목과 함정을 확인할 수 있음
- Q3 source-preserving 생성 흐름과 기존 정답 검증이 유지됨

### 9.9 실행 상태

- [x] `mustKnowBlocks` v2 계약 및 타입 추가
- [x] 성직 4단원 기업 형태 비교표 1차 검수·프로파일 저장
- [ ] 성직 4단원 나머지 핵심 블록 작성
- [x] 공일 1단원 공업 입지 비교표 1차 검수·프로파일 저장
- [x] Study 카드 `시험 전 꼭 외울 것` UI 표시
- [x] 성직·공일 전체 40개 단원 v2 프로파일 백필
- [ ] 전체 단원 근거·중복·모순 리포트 검수

<!-- ponytail: 기존 카드 설명을 대규모 재생성하지 않고, 검증된 핵심만 additive block으로 붙인다. 나중에 콘텐츠 재생성이 필요해도 mustKnow 검수가 먼저다. -->

## 10. 전체 단원 보완 실행계획

### 10.1 전체 범위

대상은 성직 20개 단원과 공일 20개 단원, 총 40개 단원이다. 개념명 매칭은 현재 품질이 양호하다고 보고, 이 단계에서는 이름 변경이나 카드 재분류를 하지 않는다.

```text
기존 카드/교과서/reference
  → 시험 핵심 후보 추출
  → 표·체크리스트·절차·공식으로 정규화
  → reference/교과서 검증
  → mustKnowBlocks 저장
  → 기존 개념 카드에 additive 표시
```

현재 확인된 후보 규모:

- 성직: 카드 151개, reference 230개
- 공일: 카드 121개, reference 300개
- 성직 4단원·공일 1단원: 파일럿 블록 구현 완료
- 나머지 대부분의 단원도 `keyPoints`, 숫자, 표, 절차형 설명을 보유함

### 10.2 우선순위 Wave

#### Wave 0. 파일럿 고정

이미 추가된 다음 블록을 실제 Study 화면과 reference 근거로 검수한다.

- 성직 4단원: 기업 형태, 경제 주체
- 공일 1단원: 공업 입지 유형

#### Wave 1. 출제량·암기량이 큰 단원

먼저 표와 규칙의 효과가 큰 단원부터 처리한다.

```text
공일: 7, 19, 11, 18
성직: 10, 12, 9, 3
```

주요 블록 예시:

- 공일 7단원: 제품 개발 단계, 생산 관리 순서, 생산 정보 시스템
- 공일 19단원: 직업 분류·직업관·자격 체계 비교
- 공일 11단원: 품질 관리 도구·검사·생산 현장 판단
- 공일 18단원: 직업병·유해 요인·환경 보전 분류
- 성직 10단원: NCS 구성·능력단위·직무 수행 절차
- 성직 12단원: 의사소통 유형·상황별 판단 기준
- 성직 9단원: 근로 조건·법 적용·기간·예외
- 성직 3단원: 직업적 성공 요소·자기 이해·진로 결정

#### Wave 2. 나머지 우선순위 A

- 성직: 7, 14, 15, 16, 17, 18, 19, 20단원
- 공일: 3, 5, 20단원

#### Wave 3. 구조가 뚜렷한 우선순위 B

- 성직: 2, 5, 6, 8, 13단원
- 공일: 2, 4, 6, 8, 9, 10, 12, 13, 14, 15, 16, 17단원

### 10.3 단원별 블록 수 기준

카드마다 무리하게 새 표를 하나씩 만들지 않고, 여러 카드를 관통하는 암기 묶음을 만든다.

```text
reference 0~9개:     핵심 블록 2~4개
reference 10~29개:   핵심 블록 3~6개
reference 30개 이상: 핵심 블록 5~8개
```

블록 하나는 다음 중 하나로 만든다.

- 비교표: 대상별 차이
- 분류표: 유형·범주·조건
- 체크리스트: 법·제도·안전 기준
- 절차표: 단계·순서·전후 관계
- 공식표: 계산식·단위·적용 조건

카드 화면에는 연결된 카드 하나 또는 묶음에 최대 1개의 대표 블록만 표시하고, 중복되는 블록은 단원 개요에서 한 번만 표시한다.

### 10.4 후보 추출 규칙

각 단원에 대해 다음 필드를 먼저 기계적으로 수집한다.

- `card.keyPoints`
- `card.caution`
- `card.importantNumbers`
- `card.comparisonTable`
- `card.enrichedDefinition` 안의 Markdown 표와 목록
- `realQuestion.questionData`의 표·보기·숫자·조건
- `reference_questions.source_payload`의 `targetConcepts`, choices, 정답, 해설

추출된 문장은 그대로 노출하지 않고 다음처럼 짧은 시험 규칙으로 정규화한다.

```text
긴 설명: 여러 조건을 포함한 교과서 문장
정규화: 조건 A이면 유형 B로 판단한다.
검증: textbook card + reference question IDs
```

정리노트는 다음 역할만 한다.

- 비교해야 할 축 후보 제안
- 자주 혼동하는 항목 후보 제안
- 표·체크리스트의 누락 항목 탐지

정리노트에만 있는 지식은 `review`로 남기고 Study에 표시하지 않는다.

### 10.5 검증 단계

각 `mustKnowBlock`은 저장 전에 다음 순서를 통과한다.

1. 기존 카드 또는 교과서에서 사실 근거 확인
2. 같은 주제를 다루는 `reference_questions` 연결
3. 정답·선지·문제 본문과 블록의 판단 규칙 비교
4. 기존 `enrichedDefinition`과 모순 여부 확인
5. 다른 블록과 중복 여부 확인
6. 검수자가 `verified`, `textbook_only`, `review` 중 상태 지정

검증 결과:

```text
verified      → “시험 전 꼭 외울 것”으로 표시
textbook_only → “핵심 암기”로 표시
review        → 사용자 화면에서 숨김
```

### 10.6 배치·백필 방식

새 스크립트는 dry-run과 write를 분리한다.

```text
dry-run
  → 단원별 후보 수·블록 수·근거 수·검수 대기 수 출력

write
  → 검수된 mustKnowBlocks만 UnitExamProfile.profile에 저장
```

과목별·Wave별로 실행하고, 한 번에 전체 JSON을 덮어쓰지 않는다.

배치 리포트:

- subject/unit
- 기존 카드 수
- reference 수·검증 수
- mustKnowBlock 수
- 비교표·체크리스트·절차표·공식표 수
- 근거 없는 후보 수
- 중복 블록 수
- 모순 검수 수
- 이전 profile과 변경된 block ID

프로파일 저장 후 같은 범위로 한 번 더 읽어 `MATCH`를 확인한다. 실패하면 해당 Wave만 재실행하고 기존 프로파일은 유지한다.

### 10.7 Study 표시 정책

개념 학습 화면의 순서는 고정한다.

```text
개념 정의
→ 시험 전 꼭 외울 것
→ 비교표/체크리스트/절차표
→ 자주 헷갈리는 구분
→ 출처 태그
→ 문제 적용
```

표시 제한:

- 핵심 문장 최대 5개
- 함정 최대 3개
- 표 최대 8행
- reference ID가 없는 `verified` 표시 금지
- 모바일 표는 가로 스크롤
- 빈 행·중복 블록·원문 장문은 표시하지 않음

### 10.8 Q3와의 경계

Q3에는 전체 `mustKnowBlocks`를 그대로 전달하지 않는다.

- Q3는 검증된 `patterns`, 문제 형식, 비율, reference ID만 사용
- 표의 긴 설명이나 정리노트 문장 미전달
- 기존 source-preserving 정답·선지 검증 유지
- Study용 보완 데이터가 Q3의 새로운 사실을 임의로 만들지 않도록 함

### 10.9 전체 완료 기준

- 40개 단원 모두에 최소 하나 이상의 검토 리포트 존재
- 구조가 뚜렷한 단원에는 최소 하나 이상의 `verified` 또는 `textbook_only` 블록 존재
- Wave 1 우선순위 단원은 비교·절차·체크리스트 중 적절한 형식으로 보완됨
- 모든 표시 블록에 교과서/카드 또는 canonical reference 근거 존재
- 기존 개념명·설명·정답 데이터를 불필요하게 덮어쓰지 않음
- Study 캐시 갱신 후 실제 카드 화면에서 블록 확인
- 전체 리포트에서 `review`·중복·모순 후보를 별도 목록으로 남김

### 10.10 실행 체크리스트

- [x] 파일럿 3개 block 구현
- [x] `mustKnowBlocks v2` 응답·UI 연결
- [x] 성직·공일 40개 단원 profile v2 백필
- [x] 40개 단원 카드 기반 block 263개 저장(기존 파일럿 포함 저장 block 266개 확인)
- [x] 40개 단원 inventory 리포트 확정
- [ ] Wave 1 블록 작성·검수
- [ ] Wave 2 블록 작성·검수
- [ ] Wave 3 블록 작성·검수
- [ ] 전체 중복·모순 검수
- [ ] 실제 Study 카드 샘플 검수

## 11. AI 보강 계획

### 11.1 AI의 역할

AI는 기존 내용을 대신 쓰는 생성기가 아니라, 이미 저장된 `textbook_only` block을 시험용 문장·표·함정으로 다듬는 보조 단계로만 사용한다.

```text
기존 카드 + 교과서 + canonical reference
  → deterministic baseline
  → AI 보강 초안
  → 사실성 validator
  → 검수 상태 저장
  → verified block만 Study 표시
```

AI가 하지 않는 일:

- 개념명 변경
- reference에 없는 새 사실·숫자·법 조항 추가
- 기존 카드 설명 일괄 재작성
- 정리노트 PDF 원문·이미지·직접 인용 수신
- 검증 실패 결과를 사용자 화면에 표시

### 11.2 AI 입력 계약

AI에는 카드 하나의 전체 원문을 무제한으로 넣지 않고, 단원별 후보 묶음을 제한해 전달한다.

```text
subject/unit
card name + aliases
existing keyPoints / importantNumbers / comparisonTable
short textbook evidence
3~8 canonical reference summaries
referenceQuestionIds
question formats / common traps
```

정리노트는 직접 전달하지 않는다. 노트에서 얻은 비교축·함정은 이미 검수된 `candidate` 또는 `mustKnowBlock`의 필드로만 간접 사용한다.

### 11.3 AI 출력 JSON

모델은 아래 구조만 반환한다. 파싱 실패 시 기존 deterministic block을 유지한다.

```json
{
  "title": "기업 형태별 핵심 비교",
  "summary": "짧은 시험용 요약",
  "headers": ["구분", "합명회사", "합자회사"],
  "rows": [["책임", "...", "..."]],
  "mustRemember": ["반드시 기억할 규칙"],
  "commonTraps": ["자주 틀리는 구분"],
  "claimEvidence": [
    {"claimIndex": 0, "referenceQuestionIds": ["..."]}
  ]
}
```

AI는 `conceptAliases`, `referenceQuestionIds`, `confidence`, `reviewStatus`를 결정하지 않는다. 이 값은 서버가 입력 근거와 validator 결과로 설정한다.

### 11.4 AI 보강 저장 메타데이터

`mustKnowBlock`에 내부 메타데이터를 추가한다.

```text
provenance: deterministic | ai
aiMetadata?
  model
  promptVersion
  inputFingerprint
  generatedAt
  validationVersion
```

이 메타데이터는 API 사용자 응답에서는 제외한다. 같은 입력 fingerprint와 prompt version이면 재호출하지 않는다.

### 11.5 검증 파이프라인

AI 응답은 저장 전에 다음 검사를 모두 통과해야 한다.

1. JSON schema 및 필수 필드 검사
2. 표의 행 길이·헤더 길이 일치 검사
3. 모든 숫자·기간·법률 용어가 카드/교과서/reference에 존재하는지 검사
4. AI 문장의 핵심 명사가 reference target 또는 textbook evidence에 grounding되는지 검사
5. 정답 선지와 반대되는 주장 여부 검사
6. 기존 deterministic block과 모순 여부 검사
7. `mustRemember` 최대 5개, 함정 최대 3개 제한
8. 정리노트 원문처럼 긴 인용문이 들어갔는지 검사

검증 결과:

```text
passed      → provenance=ai, reviewStatus=verified 또는 related
needs_review → profile에는 저장하되 사용자 화면에서 숨김
rejected    → AI 결과 폐기, deterministic block 유지
```

### 11.6 비용·호출량 제어

카드마다 AI를 호출하지 않고 **단원별 후보 묶음 단위**로 호출한다.

- 전체 최대 40회 기본 호출
- 입력 없는 단원은 호출하지 않음
- 이미 `verified`인 block은 호출하지 않음
- 한 호출에 3~8개 후보만 포함
- timeout 1회, 제한된 retry 1회
- 결과와 오류를 로컬 JSON 리포트에 저장
- dry-run에서는 호출하지 않고 예상 후보·토큰량만 출력

기존 baseline이 충분한 단원은 AI를 생략할 수 있다. AI가 실패해도 Study 기능은 deterministic block으로 동작해야 한다.

### 11.7 실행 순서

#### AI Wave 0. 파일럿 검증

- 성직 4단원 기업 형태·경제 주체
- 공일 1단원 공업 입지

목표:

- 모델 출력 품질 확인
- 표의 사실성 검증
- prompt/input fingerprint 확정
- 실제 Study 카드에서 기존 block보다 나아지는지 비교

#### AI Wave 1. 고우선 단원

```text
공일 7, 19, 11, 18
성직 10, 12, 9, 3
```

#### AI Wave 2. 나머지 우선순위 A

성직 7·14·15·16·17·18·19·20, 공일 3·5·20을 처리한다.

#### AI Wave 3. 우선순위 B

나머지 22개 단원은 baseline의 빈칸, 표 부재, reference 밀도를 보고 필요한 단원만 호출한다.

### 11.8 검수 방식

Wave별로 다음 샘플을 사람이 확인한다.

- 비교표 3개
- 숫자·기간 체크리스트 3개
- 절차·순서표 2개
- 오답 함정 3개
- AI가 `rejected` 또는 `needs_review`로 분류한 항목 전부

검수자는 다음 질문만 확인한다.

```text
이 문장이 교과서와 맞는가?
실제 reference 문제에서 판단에 사용되는가?
표의 행과 열이 헷갈리지 않는가?
기존 카드 설명과 충돌하지 않는가?
```

### 11.9 AI 보강 완료 기준

- 40개 단원에 deterministic baseline 존재
- AI 호출 결과의 input/output fingerprint 저장
- 모든 AI block에 claim 근거 ID 존재
- validator 실패 결과가 사용자에게 노출되지 않음
- AI 보강 전후 샘플에서 정확성·암기성 검수 통과
- AI 호출 실패 시 deterministic block으로 fallback
- 기존 카드 설명·개념명·정답·reference 원문이 보존됨
- 전체 비용·호출 수·성공률·rejected 수 리포트 생성

### 11.10 실행 체크리스트

- [x] AI prompt/schema/validator 구현
- [x] AI Wave 0 dry-run
- [x] AI Wave 0 실행 — 9개 block 저장, 8개는 baseline 유지
- [x] AI Wave 1 실행 — 우선순위 단원 처리, 일부 rejected는 baseline 유지
- [x] AI Wave 2·3 실행 — 전체 40개 단원 시도
- [ ] AI Wave 0·1 사람 검수
- [ ] AI 보강 전체 리포트 및 비용 확인

<!-- ponytail: 먼저 deterministic baseline을 저장하고, AI는 검증된 빈칸만 단원 단위로 보강한다. AI 실패가 기존 Study 데이터를 망가뜨리지 않게 한다. -->

## 12. 단원별 중요도 순위 표기 계획

### 12.1 기준

- 기존 `StudyExamPattern.frequency`를 중요도 기준으로 사용한다.
- 빈도는 카드의 기존 `frequency`가 아니라 canonical `referenceQuestionIds`의 **중복 제거 개수**로 계산한다.
- 각 단원 안에서 빈도가 높은 출제 포인트부터 정렬한다.
- 빈도가 같으면 제목 오름차순으로 고정해 결과가 매번 바뀌지 않게 한다.
- 새 테이블·새 배치 파이프라인은 만들지 않는다.

### 12.2 표시

단원 개요의 `이 단원에서 확인할 출제 포인트` 카드에 다음처럼 표시한다.

```text
1순위 · 12문제
기업 형태별 특징
```

- 기존 `빈출`·`관련 사례`·문제 수 표기는 유지한다.
- 동률은 `공동 1순위`로 표시한다.
- 현재 개념 학습 카드의 `rank`는 기존 카드 순위를 보존한다. 이번 단계에서는 canonical 출제 포인트 순위와 섞지 않는다.

### 12.3 구현 범위

1. 백엔드 `buildStudyInsights()`의 빈도 계산을 unique reference ID 기준으로 보정한다.
2. 패턴 정렬에 deterministic tie-breaker를 추가한다.
3. API 계약은 기존 `frequency`와 `patterns`를 재사용하고, 별도 `importanceRank` 저장 필드는 추가하지 않는다.
4. 프론트 개요 화면에서 정렬된 `patterns`의 위치와 동률을 이용해 순위 배지를 표시한다.
5. 기존 must-know block, AI provenance, 카드 내용은 변경하지 않는다.

### 12.4 검증

- 중복 reference ID가 있어도 빈도가 부풀지 않는 backend test 추가
- 빈도 내림차순·동률 제목순 정렬 test 추가
- Study 관련 4 suites 및 frontend build 실행
- `success`·`industry` 각 1~20단원 API/profile에서 순위 역전·누락 확인
- 대표 단원 4·7·12·19의 UI 샘플 확인

### 12.5 완료 기준

- 40개 단원 출제 포인트가 많은 순으로 표시됨
- 사용자에게 `1순위`와 실제 근거 문제 수가 함께 보임
- 기존 카드 순위·must-know·AI 결과가 보존됨
- reference 근거가 없는 패턴은 순위 대상에서 제외됨

<!-- ponytail: 이미 저장된 frequency와 정렬 순서를 재사용하고, UI에서 순위만 계산해 저장 마이그레이션을 피한다. -->

### 12.6 실행 결과

- [x] canonical reference ID 중복 제거 빈도 및 제목 tie-breaker 구현
- [x] 기존 profile 응답에서 빈도·정렬을 런타임 정규화
- [x] 단원 개요에 `1순위`·`공동 N순위` 배지 표시
- [x] Study 테스트 4 suites / 39 tests 통과
- [x] Backend build 통과
- [x] Frontend build 통과
- [x] Supabase 40개 profile 조회 및 263개 card block dry-run 확인
- [x] Supabase 40개 profile에 빈도·정렬 저장, AI provenance 165개 보존

<!-- ponytail: 새 테이블 없이 기존 must-know 백필 경로로 patterns만 정규화하고 AI/mustKnow를 보존한다. -->
