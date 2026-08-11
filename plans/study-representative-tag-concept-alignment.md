# Study 대표 태그-기초 개념 정합화 실행계획

## 1. 목표

단원 상세 화면에서 보이는 `대표 태그`와 `/concept` 기초 개념 화면의 카드가 같은 학습 구조를 사용하도록 만든다.

사용자에게 보이는 최종 흐름은 다음이어야 한다.

```text
단원
  └─ 대표 태그 1
       ├─ 개념 정의
       ├─ 세부 개념
       ├─ 시험 전 꼭 외울 것
       └─ 대표 문제
  └─ 대표 태그 2
       └─ ...
```

이 작업의 기준은 다음과 같다.

1. `textbook_concepts`를 단원 대표 태그의 canonical source로 사용한다.
2. `textbook_concept_cards`의 기존 설명·핵심 포인트·문제 데이터를 최대한 재사용한다.
3. 카드가 여러 개면 하나의 대표 태그 아래에 세부 개념으로 묶는다.
4. 카드가 없는 대표 태그도 결과에서 누락하지 않고 구조화 교재 데이터와 원문으로 보강한다.
5. 기존 데이터가 있는데 전체를 AI로 다시 생성하지 않는다.
6. 대표 태그와 관계없는 카드를 자동으로 억지 연결하지 않는다.

> ponytail: 새 콘텐츠 파이프라인이나 새 매핑 테이블을 먼저 만들지 않는다. 기존 대표 태그·카드·구조화 교재·기출 문제를 연결하는 최소 변경부터 검증한다.

## 1.1 이번 AI 생성의 완료 수준

이번 작업은 대표 태그 이름과 짧은 설명만 만드는 작업이 아니다. 대표 태그 하나가 현재 Study의 한 개념 카드처럼 **개념 학습과 문제 적용을 모두 완료한 학습 단위**가 되어야 한다.

대표 태그별 필수 결과:

```text
개념 학습
  - 개념 정의
  - 세부 개념
  - 핵심 포인트
  - 비교표·분류표·절차 정리
  - 시험 출제 포인트
  - 오답 주의
  - 시험 전 꼭 외울 것

문제 적용
  - 기존 실제 문제 1개 이상
  - 관련 실제 문제 목록
  - 문제 해설
  - 지문 단서
  - 선택지 분석
  - 풀이 흐름
  - 핵심 교훈
```

실제 문제 본문·선지·정답·출처는 기존 데이터에서 가져오고, AI는 그 문제에 대한 개념 연결·풀이 분석을 작성한다. AI가 새로운 문제나 정답을 만들어 `sampleQuestion`으로 저장하지 않는다.

`contentStatus: 'needs_review'` 또는 `sampleQuestion: null`인 대표 태그는 생성 완료로 간주하지 않으며 운영 API에 게시하지 않는다.

이번 파일럿은 성직(`success`) 4단원의 현재 대표 태그 6개로 고정한다.

```text
기업 형태별 특징(합명·합자·유한·유한책임
경제 주체(가계, 기업, 정부)
사회적 기업
캐럴(Carroll)의 기업의 사회적 책임
협동조합
공기업(공공 기업)
```

위 문자열은 `textbook_concepts`의 실제 값을 먼저 출력해 확인한다. 괄호가 잘려 있거나 태그가 불완전하면 자동 수정하지 않고 원본 정정 여부를 검수한 뒤 생성한다.

---

## 2. 현재 구조와 확인된 사실

### 2.1 대표 태그 데이터 흐름

```text
frontend/app/(main)/study/[subject]/page.tsx
  └─ fetchUnitConcepts()
       └─ GET /exams/concepts
            └─ ExamsService.getConceptsBySlug()
                 └─ TextbookService.getConcepts()
                      └─ textbook_concepts
```

관련 파일:

- `frontend/entities/study/api/studyApi.ts`
- `frontend/app/(main)/study/[subject]/page.tsx`
- `backend/src/exams/exams.controller.ts`
- `backend/src/exams/exams.service.ts`
- `backend/src/textbook/textbook.service.ts`

`TextbookService.getConcepts()`는 `textbook_concepts`에서 다음 값을 반환한다.

```text
concept_name
sort_order
```

단원 상세 화면은 이 목록을 대표 태그로 표시하고, 현재 최대 7개만 화면에 노출한다.

```ts
fetchUnitConcepts(...).then((concepts) => setTags(concepts.slice(0, 7)))
```

### 2.2 기초 개념 데이터 흐름

```text
frontend/app/(main)/study/[subject]/[chapter]/concept/page.tsx
  └─ ConceptStudyPage
       └─ useConceptStudy()
            └─ fetchFrequencyConcept()
                 └─ GET /study/:subject/:unit/frequency-concept
                      └─ StudyService.getFrequencyConcept()
```

관련 파일:

- `frontend/entities/concept/api/conceptApi.ts`
- `frontend/widgets/ConceptStudy/model/useConceptStudy.ts`
- `frontend/widgets/ConceptStudy/ui/ConceptStudyPage.tsx`
- `backend/src/study/study.controller.ts`
- `backend/src/study/study.service.ts`

현재 `StudyService.getFrequencyConcept()`의 우선순위는 다음과 같다.

```text
1. textbook_concept_cards 조회
2. 카드가 5개 이상이면 카드 데이터 사용
3. 카드가 5개 미만이면 textbook_frequencies 사용
4. 데이터가 없으면 빈 배열 반환
```

카드 조회 순서는 다음과 같다.

```sql
ORDER BY rank NULLS LAST, name
```

따라서 대표 태그의 `sort_order`와 기초 개념의 `rank`가 다르면 화면 순서가 달라진다.

### 2.3 현재 데이터 모델

```text
textbook_units
  └─ textbook_concepts
       - concept_name
       - sort_order

textbook_units
  └─ textbook_concept_cards
       - concept_id
       - rank
       - name
       - frequency
       - definition
       - key_points
       - textbook_excerpt
       - enriched_definition
       - real_question
       - caution
       - quiz
```

기존 `FrequencyConceptItem`에는 이미 다음 필드가 있어 새 계층을 최소화할 수 있다.

```ts
subtopics?
conceptDefinition?
examMustKnow?
relatedQuestions?
sampleQuestion
```

### 2.4 기존 보강 데이터

이미 다음 데이터와 스크립트가 존재한다.

- `textbook/_v2/normalized/{subject}/concept-candidates.json`
- `textbook/_v2/rebuild/{subject}/concept-tags-analysis.json`
- `textbook/_v2/rebuild/{subject}/concept-tags-enriched.json`
- `backend/scripts/rebuild-existing-concept-tags.ts`
- `backend/scripts/extract-concept-catalog-v2.ts`
- `backend/scripts/audit-concept-reference-consistency.ts`

특히 `concept-candidates.json`은 다음 정보를 제공한다.

```text
canonicalName
aliases
isPrimary
evidence
subtopics
```

따라서 새 AI 추출을 바로 실행하기보다 기존 canonical/alias 데이터를 먼저 대조한다.

---

## 3. 문제 정의

### 관찰된 문제

현재 대표 태그와 기초 개념은 서로 다른 테이블·정렬 기준·fallback 경로를 사용한다.

```text
대표 태그       → textbook_concepts.concept_name / sort_order
기초 개념       → textbook_concept_cards.name / rank
fallback 기초 개념 → textbook_frequencies.frequency_data.concepts[].name
```

### 검증이 필요한 가설

아래 가설은 운영 DB와 API 응답 비교로 확정한다.

1. 대표 태그와 카드 이름이 완전히 일치하지 않는다.
2. 하나의 대표 태그에 여러 세부 카드가 존재한다.
3. 대표 태그에는 있지만 카드에는 없는 개념이 있다.
4. 일부 단원은 카드 수가 5개 미만이라 `textbook_frequencies` fallback을 사용한다.
5. 카드 `rank`와 대표 태그 `sort_order`가 달라 화면 순서가 어긋난다.
6. 현재 매칭되는 `examMustKnow`는 대표 태그 매칭이 아니라 `StudyInsights.mustKnowBlocks` 매칭이다.

가설을 확인하기 전에는 카드 이름을 일괄 변경하거나 데이터를 삭제하지 않는다.

---

## 4. 범위와 비범위

### 포함 범위

- 대표 태그와 기초 개념의 데이터 비교
- 대표 태그 기준의 카드 정렬
- 대표 태그와 카드의 명시적 연결
- 하나의 대표 태그에 속한 세부 카드 병합
- 카드가 없는 대표 태그의 교재 기반 보강
- 기초 개념 API 응답 확장
- 기초 개념 UI의 대표 태그·세부 개념 표시
- Session Storage 캐시 버전 갱신
- Backend 테스트와 단원별 검수

### 제외 범위

- 전체 개념 카드의 전면 재생성
- 기존 카드 원문 일괄 삭제
- 새로운 AI 모델 도입
- 새로운 DB 매핑 서비스 추상화
- Q1/Q2/Q3 문제 생성 로직 변경
- 대표 태그의 의미 자체를 AI로 재정의
- 사용자 북마크 데이터 이전

> ponytail: Q1/Q2/Q3는 기초 개념 API의 소비자이지만 이번 문제의 직접 원인이 아니다. 기초 개념 정합화가 끝난 뒤 회귀 테스트만 하고, 문제 생성 로직은 건드리지 않는다.

---

## 5. 실행 순서 개요

```text
Phase 0. 작업 환경·백업 확인
Phase 1. 운영 데이터 읽기 전용 진단
Phase 2. 대표 태그-카드 매칭 리포트 생성
Phase 3. 매칭 결과 수동 검수
Phase 4. 매핑 데이터 저장 방식 확정
Phase 5. 대표 태그 기준 Backend 응답 구현
Phase 6. 카드 없는 대표 태그 보강
Phase 7. Frontend 표시·캐시 수정
Phase 8. 테스트·API·화면 검증
Phase 9. 단계적 배포 및 롤백 준비
```

---

## 6. Phase 0 — 작업 환경과 백업 확인

### 작업

1. 현재 브랜치와 작업 트리를 확인한다.
2. 운영 DB인지 로컬 DB인지 확인한다.
3. `textbook_concepts`, `textbook_concept_cards`, `textbook_frequencies`를 백업한다.
4. 현재 `/frequency-concept` 응답 샘플을 subject/unit별로 저장한다.
5. 현재 `CACHE_VERSION`과 배포 버전을 기록한다.

### 확인 명령

```bash
git status --short
git log --oneline -10
```

### 백업 대상

```text
textbook_units
textbook_concepts
textbook_concept_cards
textbook_frequencies
unit_exam_profiles
```

`unit_exam_profiles`는 직접 수정하지 않더라도 `studyInsights`와 `examMustKnow` 회귀 확인용으로 보관한다.

### 완료 기준

- 대상 DB가 확정됨
- 원본 데이터 백업이 있음
- 현재 API 응답 샘플이 있음
- 작업 트리의 기존 변경 사항을 구분할 수 있음

---

## 7. Phase 1 — 읽기 전용 데이터 진단

### 7.1 단원별 개수 집계

```sql
SELECT
  u.subject,
  u.unit_number,
  COUNT(DISTINCT tc.id) AS representative_tag_count,
  COUNT(DISTINCT cc.id) AS concept_card_count,
  COUNT(DISTINCT tf.id) AS frequency_row_count
FROM textbook_units u
LEFT JOIN textbook_concepts tc ON tc.unit_id = u.id
LEFT JOIN textbook_concept_cards cc ON cc.unit_id = u.id
LEFT JOIN textbook_frequencies tf ON tf.unit_id = u.id
GROUP BY u.subject, u.unit_number
ORDER BY u.subject, u.unit_number;
```

### 7.2 태그·카드 전체 목록 추출

```sql
SELECT
  u.subject,
  u.unit_number,
  tc.concept_name,
  tc.sort_order
FROM textbook_units u
JOIN textbook_concepts tc ON tc.unit_id = u.id
ORDER BY u.subject, u.unit_number, tc.sort_order;
```

```sql
SELECT
  u.subject,
  u.unit_number,
  cc.concept_id,
  cc.name,
  cc.rank,
  cc.frequency,
  (cc.definition IS NOT NULL AND LENGTH(TRIM(cc.definition)) > 0) AS has_definition,
  jsonb_array_length(COALESCE(cc.key_points, '[]'::jsonb)) AS key_point_count,
  (cc.real_question IS NOT NULL) AS has_real_question
FROM textbook_units u
JOIN textbook_concept_cards cc ON cc.unit_id = u.id
ORDER BY u.subject, u.unit_number, cc.rank NULLS LAST, cc.name;
```

### 7.3 카드 부족 단원 확인

카드 수가 5개 미만인 단원은 현재 구현에서 frequency fallback이 발생할 수 있으므로 별도로 기록한다.

```sql
SELECT
  u.subject,
  u.unit_number,
  COUNT(cc.id) AS card_count
FROM textbook_units u
LEFT JOIN textbook_concept_cards cc ON cc.unit_id = u.id
GROUP BY u.subject, u.unit_number
HAVING COUNT(cc.id) < 5
ORDER BY u.subject, u.unit_number;
```

### 7.4 완료 산출물

```text
plans/work/representative-tag-card-counts.csv
plans/work/representative-tags.csv
plans/work/concept-cards.csv
plans/work/card-shortage-units.csv
```

`plans/work`는 임시 검수 산출물이며, 민감한 운영 데이터나 비밀값은 저장하지 않는다.

---

## 8. Phase 2 — 대표 태그-카드 매칭 리포트 생성

### 8.1 매칭 우선순위

자동 매칭은 반드시 아래 순서로 한다.

```text
1. 동일한 concept_id
2. 정규화된 이름 완전 일치
3. 기존 canonicalName 완전 일치
4. 기존 aliases 일치
5. 사람이 허용한 명시적 alias 일치
6. 자동 연결하지 않음
```

정규화 규칙은 진단용으로만 사용한다.

```text
- 양끝 공백 제거
- 연속 공백 하나로 통일
- 괄호 종류 통일
- 가운데점·하이픈 등 표기 차이 통일
```

단순 `includes()` 하나만으로 자동 연결하지 않는다. 다음은 오매칭 위험이 있다.

```text
직업
직업 생활
직업 생활의 의미
직업 생활의 의미와 중요성
```

### 8.2 리포트 형식

```json
{
  "subject": "success",
  "unitNumber": 1,
  "representativeTag": "직업 가치관",
  "sortOrder": 1,
  "matches": [
    {
      "cardName": "직업 가치관의 정의",
      "cardId": "...",
      "matchType": "alias",
      "score": 90
    }
  ],
  "unmatched": false,
  "reviewStatus": "pending"
}
```

### 8.3 기존 파일 활용

다음 파일의 `canonicalName`, `aliases`, `subtopics`를 우선 후보로 사용한다.

```text
textbook/_v2/normalized/success/concept-candidates.json
textbook/_v2/normalized/industry/concept-candidates.json
textbook/_v2/rebuild/success/concept-tags-analysis.json
textbook/_v2/rebuild/success/concept-tags-enriched.json
```

파일에 없는 alias는 자동 확정하지 않고 `manual_review`로 남긴다.

### 8.4 완료 기준

모든 대표 태그가 다음 중 하나의 상태를 가진다.

```text
exact
canonical
alias
manual_verified
unmatched
```

`ambiguous` 상태가 남아 있으면 해당 카드를 대표 태그에 연결하지 않는다. 대표 태그 자체는 결과에 남기고 콘텐츠 보강 대상으로 표시한다.

---

## 9. Phase 3 — 매칭 결과 수동 검수

### 검수 우선순위

1. 카드가 없는 대표 태그
2. 한 대표 태그에 3개 이상 카드가 매칭된 경우
3. `includes()`로만 매칭된 경우
4. 대표 태그와 카드명이 매우 유사하지만 의미가 다른 경우
5. 실제 문제가 연결된 카드

### 검수 질문

각 매칭마다 다음을 확인한다.

- 이 카드가 대표 태그를 설명하는가?
- 같은 개념의 정의·유형·비교 항목인가?
- 별도 대표 태그로 분리해야 하는 개념은 아닌가?
- 카드의 대표 문제가 실제로 이 대표 태그를 묻는가?
- 카드의 `key_points`가 대표 태그 설명에 포함되어도 되는가?
- 교과서 구조화 섹션과 충돌하지 않는가?

### 수동 매핑 파일

최소 구조는 다음으로 한다.

```json
{
  "success/1": {
    "직업 가치관": {
      "aliases": [
        "직업 가치관의 정의",
        "직업 가치관의 유형",
        "직업 가치의 정의"
      ],
      "excludedCards": [],
      "reviewStatus": "verified",
      "reviewNote": "정의·유형·직업 가치가 하나의 대표 태그에 속함"
    }
  }
}
```

이 파일은 데이터 생성의 입력으로 사용하고, 런타임마다 AI를 호출하는 용도로 사용하지 않는다.

### 완료 기준

- ambiguous 매칭 0건
- 자동 매칭 결과를 사람이 확인함
- 카드 없는 태그 목록이 확정됨
- 삭제 대상이 아니라 이동·보강 대상으로 분류됨

---

## 10. Phase 4 — 매핑 저장 방식 확정

### 권장 1차 구현

기존 DB 구조를 최소 변경으로 유지한다.

가능하면 `textbook_concept_cards`에 대표 태그명을 저장한다.

```sql
ALTER TABLE textbook_concept_cards
ADD COLUMN IF NOT EXISTS canonical_name varchar(300);
```

예시:

```text
name: 직업 가치관의 유형
canonical_name: 직업 가치관
```

장점:

- 기존 카드 `name`을 보존함
- 기존 `concept_id` 체계를 깨지 않음
- 조회 시 명확한 연결 기준을 가짐
- 매칭 결과를 DB에서 직접 확인할 수 있음

단, 실제 운영 DB에 컬럼을 추가하기 전 TypeORM 엔티티·migration 관리 방식을 확인한다. 프로젝트의 migration 정책과 맞지 않으면 별도 SQL 파일만 추가하지 말고 기존 배포 방식을 따른다.

### 대안

별도 매핑 테이블은 다음 상황에서만 검토한다.

- 한 카드가 여러 대표 태그에 동시에 속해야 함
- 대표 태그별 노출 상태·검수 상태·confidence를 장기 관리해야 함
- canonical 이름 변경 이력이 필요함

현재 문제에는 우선 `canonical_name` 또는 빌드 시 매핑 파일이면 충분하다.

> ponytail: 한 카드-한 대표 태그 관계가 대부분이면 매핑 테이블을 만들지 않는다. 다대다 요구가 실제 데이터에서 확인될 때만 승격한다.

---

## 11. Phase 5 — Backend API 변경

### 11.1 변경 대상

주요 파일:

- `backend/src/study/study.service.ts`
- `backend/src/study/study.service.spec.ts`
- `backend/src/study/local-study-data.spec.ts`
- 필요 시 `backend/src/textbook/textbook.service.ts`

### 11.2 대표 태그 조회

`StudyService.getFrequencyConcept()` 안에서 `textbook_units` 조회 후 대표 태그를 가져온다.

Local:

```sql
SELECT id, concept_name, sort_order
FROM textbook_concepts
WHERE unit_id = $1
ORDER BY sort_order, concept_name
```

Supabase:

```ts
from('textbook_concepts')
  .select('id, concept_name, sort_order')
  .eq('unit_id', unit.id)
  .order('sort_order')
```

### 11.3 카드 그룹핑

논리적인 처리 순서는 다음과 같다.

```text
tags = textbook_concepts.sort_order 순서
cards = textbook_concept_cards 또는 frequency fallback 결과

for each tag:
  matchedCards = cards.filter(card => card.canonical_name === tag.name)
  if matchedCards가 없으면 명시적 alias 매칭
  matchedCards를 하나의 FrequencyConceptItem으로 병합
```

### 11.4 병합 규칙

대표 태그 1개에 여러 카드가 매칭되면 다음 규칙을 사용한다.

```text
name              → 대표 태그명
rank              → 대표 태그 sort_order + 1
frequency         → 관련 카드 frequency의 최대값 또는 중복 제거 합계
sources           → 모든 카드 sources union
questionFormats   → 모든 카드 questionFormats union
description       → 대표 카드의 enriched_definition 우선
keyPoints         → 중복 제거 후 최대 5개
examTips          → 중복 제거 후 최대 5개
subtopics         → 각 카드 name을 세부 개념으로 추가
sampleQuestion    → 대표 카드의 실제 문제 우선
relatedQuestions  → 관련 문제 중복 제거 후 최대 5개
examMustKnow      → 대표 태그 alias 기준으로 기존 블록 연결
```

현재 `transformCardsToFrequency()`가 이미 카드 필드를 표준 응답으로 변환하므로, 변환 코드를 복제하지 말고 기존 결과를 그룹핑하는 방향을 우선한다.

### 11.5 카드가 하나도 없는 대표 태그

카드가 없는 태그도 응답에서 누락하지 않는다.

```ts
{
  name: tag.conceptName,
  rank: tag.sortOrder + 1,
  frequency: 0,
  sources: [],
  questionFormats: [],
  description: structuredDescription ?? textbookDescription ?? '',
  keyPoints: structuredKeyPoints ?? [],
  examTips: structuredExamPoints ?? [],
  conceptContent: ..., 
  subtopics: ..., 
  sampleQuestion: null,
  relatedQuestions: []
}
```

콘텐츠가 전혀 없으면 빈 카드를 조용히 숨기지 말고 내부 로그에 남긴다.

```text
[StudyConceptAlignment] missing content: success/4/유연근무제
```

사용자 화면에서 빈 카드 노출이 품질상 문제가 되면 해당 태그만 `contentStatus: 'needs_review'`로 반환하고, 배포 전 데이터를 보강한다.

### 11.6 fallback 처리

`textbook_concept_cards`가 부족해 `textbook_frequencies`를 사용하는 단원도 대표 태그 기준으로 정렬한다.

순서:

```text
frequency concepts 변환
→ 대표 태그 alias 매칭
→ 대표 태그 순서로 그룹핑
→ 매칭 실패한 frequency card는 보조 데이터로 보관
```

기존 frequency 데이터 자체를 삭제하거나 덮어쓰지 않는다.

### 11.7 응답 호환성

기존 응답 필드는 유지한다.

추가 가능한 필드:

```ts
sourceTag?: string;
contentStatus?: 'complete' | 'needs_review' | 'missing';
```

`concepts` 배열의 각 항목 이름·순서가 대표 태그 기준으로 바뀌는 것이 이번 기능의 의도된 동작이다.

---

## 12. Phase 6 — 카드 없는 대표 태그 보강

### 12.1 보강 데이터 우선순위

```text
1. 기존 textbook_concept_cards
2. textbook_structured_units / textbook_sections / textbook_subsections
3. textbook_units.text_payload
4. reference_questions의 targetConcepts·문제 데이터
5. 기존 concept-tags-enriched 파일
6. AI 보강
```

### 12.2 구조화 교재 매칭

다음 필드를 검색한다.

```text
section.title
subsection.title
subsection.explanation
subsection.key_points
subsection.exam_points
subsection.pitfalls
```

대표 태그와 제목이 완전히 일치하거나, 검수된 alias로 연결되는 경우만 자동 병합한다.

### 12.3 원문 검색

`textbook_units.text_payload`에서 대표 태그·alias를 검색한다.

검색 결과로 다음을 만든다.

```text
definition candidate
key point candidate
exam point candidate
```

원문 전체를 API 응답에 넣지 않는다. 필요한 설명만 정제한다.

### 12.4 AI 보강 기준

다음 경우에만 AI를 사용한다.

- 대표 태그가 확정되어 있음
- 기존 카드가 없음
- 구조화 교재 또는 원문 근거가 있음
- 실제 문제 또는 교재 근거를 프롬프트에 제공할 수 있음

AI 결과에는 다음 metadata를 남긴다.

```text
model
promptVersion
inputFingerprint
generatedAt
validationVersion
provenance: ai
reviewStatus: review
```

`reviewStatus: review` 상태는 사람이 검수하기 전 사용자에게 바로 노출하지 않는 것을 기본으로 한다. 기존 `StudyMustKnowBlock`의 검수 상태 규칙과 충돌하지 않게 적용한다.

### 12.5 생성하지 않을 내용

- 교과서 근거가 없는 숫자
- 실제 문제에 없는 출제 빈도
- 근거 없는 대표 문제
- 대표 태그와 무관한 일반 설명
- 다른 대표 태그의 내용을 섞은 설명

---

## 13. Phase 7 — Frontend 변경

### 13.1 API 타입 보강

변경 대상:

- `frontend/entities/concept/model/types.ts`
- 필요 시 `frontend/shared/types/study.ts`

추가 후보:

```ts
export interface FrequencyConceptItem {
  ...
  sourceTag?: string;
  contentStatus?: 'complete' | 'needs_review' | 'missing';
}
```

기존 `subtopics`가 있으므로 별도의 `RepresentativeTagCard` 인터페이스를 바로 만들지 않는다.

### 13.2 개념 학습 화면 표시

변경 대상:

- `frontend/widgets/ConceptStudy/ui/ConceptStudyPage.tsx`

표시 구조:

```text
대표 태그명
출제 빈도

개념 정의
...

세부 개념
- 세부 개념 1
- 세부 개념 2
```

현재 `current.name`을 대표 태그명으로 사용한다.

`subtopics`가 없으면 해당 영역을 표시하지 않는다.

### 13.3 빈 콘텐츠 상태

콘텐츠가 부족한 카드를 정상 카드처럼 표시하지 않는다.

권장 처리:

```text
contentStatus === 'needs_review'
→ 내부 검수 단계에서는 표시
→ 운영에서는 최소 정의가 있을 때만 표시
```

사용자가 빈 화면을 보지 않도록 기존 error/loading 처리와 구분한다.

### 13.4 캐시 버전 증가

변경 대상:

- `frontend/widgets/ConceptStudy/model/useConceptStudy.ts`

현재:

```ts
const CACHE_VERSION = 'v24';
```

응답 목록과 이름이 바뀌므로 구현 시 다음 버전으로 올린다.

```ts
const CACHE_VERSION = 'v25';
```

수정한 값은 계획이 아니라 실제 구현 시 기존 버전과 겹치지 않게 확정한다.

### 13.5 기존 기능 보존

다음은 변경하지 않는다.

- 북마크 API와 북마크 식별 기준
- `handleComplete()`의 BASIC_CONCEPT 진도 저장
- 문제 적용 화면의 `sampleQuestion` 구조
- `examMustKnow` 렌더링 구조
- overview 탭의 `studyInsights` 표시

---

## 14. Phase 8 — 테스트 계획

### 14.1 Backend 단위 테스트

변경 대상:

- `backend/src/study/local-study-data.spec.ts`
- `backend/src/study/study.service.spec.ts`

필수 테스트:

#### Test A — 대표 태그 순서가 카드 rank보다 우선

입력:

```text
representative tags: A(sort 0), B(sort 1), C(sort 2)
cards: C(rank 1), A(rank 2), B(rank 3)
```

기대:

```text
concepts: A, B, C
```

#### Test B — 한 대표 태그와 여러 카드

입력:

```text
tag: 직업 가치관
cards: 직업 가치관의 정의, 직업 가치관의 유형
```

기대:

```text
concepts.length: 1
concepts[0].name: 직업 가치관
subtopics.length: 2 이상
```

#### Test C — 카드 없는 태그도 결과에 포함

입력:

```text
tags: A, B
cards: A만 존재
structured data: B 존재
```

기대:

```text
concepts: A, B
B.description 또는 B.keyPoints가 존재
```

#### Test D — 오매칭 방지

입력:

```text
tag: 직업
cards: 직업 생활, 직업 가치관
```

기대:

```text
명시적 alias 없이 자동 연결하지 않음
```

#### Test E — frequency fallback

카드 수가 5개 미만이고 `textbook_frequencies`가 존재할 때도 대표 태그 순서와 매칭 규칙이 유지되는지 확인한다.

#### Test F — 기존 StudyInsights 보존

대표 태그 그룹핑 후에도 다음이 유지되는지 확인한다.

```text
studyInsights
examMustKnow
relatedQuestions
conceptHighlightV2
```

### 14.2 Frontend 타입·빌드 테스트

```bash
npm run typecheck
npm run build
```

실제 package script 이름이 다르면 `package.json`의 기존 명령을 사용한다.

### 14.3 API 검증

파일럿 단원에 대해 다음 두 API를 비교한다.

```text
GET /exams/concepts?subjectSlug=success&startUnitNum=1&endUnitNum=1
GET /study/success/1/frequency-concept
```

검증 표:

```text
대표 태그 순서
대표 태그 이름
기초 개념 이름
세부 개념
정의 존재 여부
대표 문제 존재 여부
시험 필수 블록 연결 여부
```

### 14.4 화면 검증

최소 대상:

```text
/study/success/1
/study/success/1/concept
/study/success/4/concept
/study/industry/1/concept
```

브라우저 Session Storage를 비운 상태와 기존 캐시가 있는 상태를 모두 확인한다.

---

## 15. 품질 게이트

다음 조건을 모두 만족해야 전체 단원에 반영한다.

### 데이터 게이트

- 대표 태그의 100%가 `exact`, `canonical`, `alias`, `manual_verified`, `unmatched` 중 하나임
- `ambiguous` 자동 매칭 0건
- 카드 없는 태그도 API 결과에서 대표 태그 카드로 생성됨
- 원본 카드 데이터는 삭제하지 않되, 대표 태그에 연결되지 않은 카드는 기초 개념 순서에 노출하지 않음
- 대표 태그 순서가 API 응답에 반영됨

### 콘텐츠 게이트

- 노출되는 대표 태그에 최소한 정의 또는 핵심 포인트가 있음
- 대표 문제는 실제 연결 근거가 있을 때만 표시됨
- 교과서 원문에 없는 수치가 생성되지 않음
- AI 생성 콘텐츠는 검수 상태가 구분됨

### 기능 게이트

- 기초 개념 진도 저장이 유지됨
- 북마크 추가·삭제가 유지됨
- 문제 적용 탭이 정상 동작함
- overview 탭이 정상 동작함
- Q1/Q2/Q3 라우팅이 유지됨
- 이전 Session Storage 캐시가 새 응답을 가리지 않음

---

## 16. 배포 순서

### 16.1 파일럿

과목별 1개 단원부터 반영한다.

권장 파일럿:

```text
success 1개 단원
industry 1개 단원
```

단, 실제 reference/card/tag 데이터 수를 Phase 1에서 확인한 뒤 확정한다.

### 16.2 파일럿 배포

1. 매핑 데이터만 반영
2. Backend를 대표 태그 기준으로 배포
3. API 응답 확인
4. Frontend 캐시 버전 증가와 함께 배포
5. 실제 화면 검수
6. 문제 없으면 다음 단원으로 확대

### 16.3 전체 반영

파일럿에서 다음 지표를 확인한다.

```text
대표 태그-카드 매칭 성공률
카드 없는 태그 수
빈 설명 카드 수
API 오류율
기초 개념 완료율
북마크 오류
문제 적용 진입 오류
```

파일럿에서 매칭 성공률이 낮으면 전체 반영하지 않고 alias/데이터를 먼저 수정한다.

---

## 17. 롤백 계획

### 코드 롤백

1. Backend를 이전 `getFrequencyConcept()` 구현으로 되돌린다.
2. Frontend를 이전 `CACHE_VERSION`으로 되돌리지 말고, 이전 응답을 사용해야 하면 명시적으로 이전 버전 값을 사용한다.
3. 배포 후 캐시 문제를 피하기 위해 새 버전으로 안정 응답을 다시 저장한다.

### 데이터 롤백

`canonical_name`을 추가한 경우 기존 컬럼은 삭제하지 않고 값을 비운다.

```sql
UPDATE textbook_concept_cards
SET canonical_name = NULL
WHERE canonical_name IS NOT NULL;
```

백업한 원본을 덮어쓰지 않는 한 기존 카드 콘텐츠는 보존된다.

### 롤백 조건

- 대표 태그 아래에 무관한 카드가 대량으로 들어감
- 기존 sampleQuestion 연결이 다른 개념으로 이동함
- 기초 개념 진도 저장이 실패함
- API 응답 시간이 유의하게 증가함
- 빈 카드가 운영 화면에 노출됨

---

## 18. 구현 시 주의사항

### 18.1 매칭 로직을 Frontend에 넣지 않음

대표 태그-카드 연결은 Backend 또는 데이터 정제 단계에서 확정한다.

Frontend에서 `includes()`로 임시 연결하면 다음 문제가 생긴다.

- 화면마다 결과가 달라짐
- 모바일·관리자 화면이 불일치함
- 매칭 근거를 검수하기 어려움
- API 외 다른 소비자가 같은 규칙을 재구현해야 함

### 18.2 `textbook_concepts`의 태그 이름을 카드 이름으로 덮어쓰지 않음

카드 원래 이름은 세부 개념 추적과 데이터 검수에 필요하다.

```text
표시 이름       → 대표 태그명
내부 세부 이름  → 원래 카드 name
```

### 18.3 `includes()`는 최종 기준이 아님

현재 `withStudyMustKnow()`에는 alias 기반 `includes()`가 있지만, 대표 태그-카드 연결에는 더 엄격한 기준을 사용한다.

### 18.4 카드 수를 임의로 5개 이상 만들지 않음

현재 5개 기준은 기존 fallback 동작이다. 대표 태그 정합화 과정에서 카드 수를 맞추기 위해 가짜 카드를 만들지 않는다.

### 18.5 빈 콘텐츠를 정상 콘텐츠로 포장하지 않음

정의·핵심 포인트·교재 근거가 없는 카드는 검수 대상으로 남긴다.

---

## 19. 최종 완료 기준

다음 예시가 실제로 성립하면 작업 완료로 본다.

```text
/study/success/1의 대표 태그 1번째
= /study/success/1/concept의 첫 번째 개념
```

그리고 대표 태그가 세부 카드 여러 개를 가지고 있다면:

```text
대표 태그 1개
  ├─ 정의 카드
  ├─ 유형 카드
  └─ 실제 문제 카드
```

로 사용자에게 하나의 기초 개념으로 표시되어야 한다.

최종 검증 항목:

```text
[ ] 모든 대표 태그가 기초 개념 응답에 반영됨
[ ] 대표 태그 순서와 기초 개념 순서가 같음
[ ] 세부 카드가 대표 태그 아래에 묶임
[ ] 카드 없는 태그가 누락되지 않음
[ ] 근거 없는 AI 콘텐츠가 노출되지 않음
[ ] 기존 문제·북마크·진도 기능이 유지됨
[ ] 캐시 버전이 갱신됨
[ ] 파일럿 검수 후 전체 단원에 반영됨
```

---

## 20. 권장 작업 티켓 분할

### Ticket 1 — 데이터 진단

- 운영 DB 개수·목록 추출
- API 응답 샘플 저장
- 미매칭·중복·카드 부족 리포트 생성

### Ticket 2 — 매칭 검수 데이터

- 자동 매칭 로직 작성
- 기존 canonical/alias 반영
- 수동 검수 파일 작성

### Ticket 3 — Backend 대표 태그 정합화

- 대표 태그 조회
- 카드 그룹핑
- 대표 태그 순서 적용
- fallback 처리
- Backend 테스트

### Ticket 4 — 누락 콘텐츠 보강

- 구조화 교재 매칭
- 원문 매칭
- 필요한 태그만 AI 생성
- 검수 상태 저장

### Ticket 5 — Frontend 표시

- API 타입 반영
- 대표 태그·세부 개념 표시
- 캐시 버전 증가
- 화면 검수

### Ticket 6 — 파일럿 및 전체 배포

- 과목별 파일럿
- API/화면/기능 회귀 검증
- 전체 단원 확대
- 운영 모니터링

---

## 21. 가장 짧은 실행 경로

처음 구현할 때는 아래 순서만으로도 문제를 해결할 수 있다.

```text
1. textbook_concepts와 textbook_concept_cards 비교
2. 명시적 alias 매핑 작성
3. getFrequencyConcept()을 textbook_concepts 순서로 반환
4. 여러 카드를 대표 태그 하나로 병합
5. 카드 없는 대표 태그는 구조화 교재 기반 카드로 생성
6. Frontend 캐시 버전 증가
7. success 1개·industry 1개 단원 검증
```

구조화 교재에도 없는 대표 태그의 AI 보강은 이 최소 경로가 정상 동작한 뒤 진행한다.

> ponytail: 먼저 태그와 카드의 이름·순서·그룹만 맞춘다. 콘텐츠 품질 개선은 실제 누락 목록이 확인된 뒤 필요한 항목에만 적용한다.

---

## 22. 대표 태그 완성형 AI 생성 파이프라인

### 22.1 기존 보강 스크립트와의 차이

기존 `backend/scripts/enrich-concept-cards.ts`는 기존 `textbook_concept_cards` 하나를 입력으로 받아 설명·핵심 포인트를 보강한다.

이번 작업은 카드가 없는 대표 태그도 생성해야 하므로 다음 흐름을 별도로 둔다.

```text
대표 태그
  → 기존 카드 후보 수집
  → 구조화 교재 수집
  → 교과서 원문 수집
  → 실제 기출 문제 수집
  → AI 근거 분석
  → 사람 검수
  → AI Study 카드 생성
  → 자동 검증
  → 사람 검수
  → Supabase 반영
```

기존 보강 스크립트를 `--force`로 전체 재실행하지 않는다. 그러면 현재 카드와 대표 태그의 관계가 해결되지 않고 기존 콘텐츠가 불필요하게 바뀐다.

### 22.2 새 스크립트

권장 파일:

```text
backend/scripts/generate-representative-study-cards.ts
```

실행 모드:

```bash
npx ts-node --project tsconfig.json scripts/generate-representative-study-cards.ts \
  --subject success --unit 4 --dry-run

npx ts-node --project tsconfig.json scripts/generate-representative-study-cards.ts \
  --subject success --unit 4 --analyze-only

npx ts-node --project tsconfig.json scripts/generate-representative-study-cards.ts \
  --subject success --unit 4 --generate

npx ts-node --project tsconfig.json scripts/generate-representative-study-cards.ts \
  --subject success --unit 4 --generate --write-supabase
```

기본 동작은 파일 생성이며, `--write-supabase` 없이는 DB를 변경하지 않는다.

### 22.3 입력 패키지

대표 태그 하나마다 다음 입력 패키지를 만든다.

```json
{
  "canonicalTag": {
    "name": "공기업(공공 기업)",
    "sortOrder": 5,
    "subjectSlug": "success",
    "unitNumber": 4
  },
  "existingCards": [],
  "structuredSections": [],
  "textbookEvidence": [],
  "referenceQuestions": [],
  "sourceFingerprint": "sha256:..."
}
```

`sourceFingerprint`는 입력이 바뀌었을 때만 재생성하도록 한다. API key나 사용자 정보는 fingerprint에 포함하지 않는다.

### 22.4 후보 수집 규칙

후보 수집은 넓게 하고, AI가 최종 포함 여부를 결정하게 한다. 단, AI에 전달할 후보에는 반드시 출처를 붙인다.

```text
textbook_concept_cards
  - 같은 단원 전체 카드
  - 이름·definition·key_points·textbook_excerpt·real_question

structured concept
  - section/subsection 제목
  - keyPoints/table/examPoints/pitfalls

교과서 원문
  - 대표 태그·alias가 포함된 문단
  - 후보 카드의 핵심어가 포함된 문단

reference_questions
  - 같은 subject/unit
  - targetConcepts 일치·부분 일치
  - 발문·지문·선지에 대표 태그의 핵심어 포함
```

### 22.5 1차 AI: 근거 분석 출력

1차 AI는 설명을 생성하지 않고, 어떤 데이터를 대표 태그에 포함할지 분류한다.

```json
{
  "canonicalTag": "캐럴(Carroll)의 기업의 사회적 책임",
  "matchedCards": [
    {
      "cardName": "기업의 목적과 역할",
      "reason": "기업의 비경제적 목적과 사회적 책임을 설명함",
      "confidence": "high"
    }
  ],
  "textbookSections": [
    {
      "title": "기업의 역할",
      "subsection": "기업의 사회적 책임"
    }
  ],
  "subtopics": [
    "경제적 책임",
    "법적 책임",
    "윤리적 책임",
    "자선적 책임"
  ],
  "referenceQuestionIds": ["..."],
  "representativeQuestionId": "...",
  "missingEvidence": [],
  "reviewStatus": "pending"
}
```

규칙:

- `matchedCards`는 입력에 실제로 있는 카드만 선택한다.
- `textbookSections`는 입력에 실제로 있는 섹션만 선택한다.
- `referenceQuestionIds`는 입력에 실제로 있는 문제 ID만 선택한다.
- `missingEvidence`가 비어 있지 않으면 자동 게시하지 않는다.
- 대표 태그의 범위를 넓히거나 다른 태그와 합치지 않는다.

### 22.6 1차 분석 검수

6개 태그의 분석 결과를 먼저 검수한다. 최종 콘텐츠를 생성하기 전에 다음을 확인한다.

```text
[ ] 모든 태그가 정확히 1개씩 존재함
[ ] 태그명과 sort_order가 원본과 동일함
[ ] 관련 카드가 실제로 관련 있음
[ ] 세부 개념이 교재에 존재함
[ ] 대표 문제가 해당 태그를 직접 적용함
[ ] missingEvidence가 있는 태그를 확인함
```

특히 다음 매핑은 수동 확정한다.

```text
기업 형태별 특징 → 출자 형태에 따른 기업 분류 + 회사 형태 관련 실제 문제
경제 주체 → 경제 주체로서의 기업 + 가계·정부 비교 근거
사회적 기업 → 기업 목적·사회적 책임·사회적 기업 직접 근거
캐럴의 책임 → 기업의 역할 중 경제·법·윤리·자선 책임 근거
협동조합 → 공동 기업·조합 기업·협동조합 직접 근거
공기업 → 공기업 및 공사 합동 기업의 정의
```

### 22.7 2차 AI: 완성형 Study 카드 생성

2차 AI 출력은 현재 `FrequencyConceptItem`과 화면이 소비하는 필드를 모두 채운다.

```json
{
  "description": "...",
  "conceptDefinition": {
    "summary": "...",
    "sections": [
      {
        "title": "...",
        "description": "...",
        "examples": ["..."]
      }
    ],
    "comparison": {
      "headers": ["구분", "..."],
      "rows": [["...", "..."]]
    },
    "commonConfusions": ["..."]
  },
  "keyPoints": ["...", "...", "..."],
  "examTips": ["...", "..."],
  "subtopics": [
    {
      "name": "...",
      "evidence": "입력 교재 근거",
      "examRelevance": "..."
    }
  ],
  "examMustKnow": {
    "title": "...",
    "type": "comparison",
    "summary": "...",
    "headers": ["..."],
    "rows": [["..."]],
    "mustRemember": ["..."],
    "commonTraps": ["..."],
    "reviewStatus": "review"
  },
  "examTips": ["..."],
  "problemApplication": {
    "representativeQuestionId": "기존 문제 ID",
    "conceptHighlightV2": {
      "stimulusClues": [
        { "quote": "입력 문제의 실제 문장", "why": "..." }
      ],
      "optionAnalysis": [
        { "optionNum": 1, "verdict": "O", "reasoning": "..." }
      ],
      "solvingFlow": [
        { "step": 1, "action": "..." }
      ],
      "takeaway": "..."
    }
  }
}
```

문제 적용 데이터의 `quote`는 실제 문제 원문에서만 가져온다. AI가 지문처럼 보이는 문장을 새로 만들지 않는다.

### 22.8 완성도 검증

생성 결과는 다음을 모두 통과해야 한다.

```text
구조
  - 6개 태그 모두 결과에 있음
  - 카드 이름과 원본 태그가 동일함
  - rank가 sort_order와 일치함

개념 학습
  - description 존재
  - conceptDefinition.summary 존재
  - sections 2개 이상 또는 충분한 근거가 있는 단일 구조
  - keyPoints 3개 이상
  - examTips 1개 이상
  - subtopics 2개 이상
  - examMustKnow 존재

문제 적용
  - 실제 representativeQuestionId 존재
  - sampleQuestion이 기존 문제에서 만들어짐
  - relatedQuestions 1개 이상
  - stimulusClues 1개 이상
  - optionAnalysis가 실제 선지 수와 일치
  - solvingFlow 2단계 이상
  - takeaway 존재

근거
  - 모든 수치가 입력 자료에 존재함
  - 모든 문제 출처·번호가 검증됨
  - AI 생성 설명의 근거 source가 기록됨
```

하나라도 실패하면 `generated.json`에는 남기되 Supabase에는 쓰지 않는다.

### 22.9 저장 형식

중간 산출물은 다음 위치에 저장한다.

```text
textbook/_v2/study-rebuild/success/unit-04/
├── input.json
├── analysis.json
├── generated.json
├── validation.json
└── review.md
```

DB 반영 시에는 기존 카드를 삭제하지 않고 대표 태그명으로 canonical 카드를 upsert한다.

```text
concept_id: study_success_4_tag_001
name: textbook_concepts.concept_name
rank: textbook_concepts.sort_order + 1
```

기존 레거시 카드는 원본 보존용으로 남기되, 대표 태그 canonical 카드가 Study API의 우선 데이터가 되게 한다.

### 22.10 게시 기준

6개 태그가 모두 아래 상태여야 운영 API에 게시한다.

```text
contentStatus: complete
reviewStatus: verified
sampleQuestion: non-null
problemApplication: complete
```

한 태그라도 문제 적용 데이터가 부족하면 전체 4단원 게시를 보류한다. 일부 카드만 게시하면 사용자는 같은 단원에서 품질이 서로 다른 학습 카드를 보게 된다.

### 22.11 롤백

- `generated.json`만 수정하고 DB에는 쓰지 않은 단계에서는 파일 삭제로 롤백한다.
- DB 반영 후에는 새 canonical card만 삭제하거나 이전 snapshot을 재upsert한다.
- 기존 레거시 카드와 문제 데이터는 삭제하지 않는다.
- Frontend 캐시 버전은 canonical 카드 반영 후에만 올린다.
