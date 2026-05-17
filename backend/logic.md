# 문항 생성 로직

## 개요

문항 생성은 OpenAI GPT-4o 기반 2단계 파이프라인으로 동작한다.
사용자가 과목/단원/난이도/문항 수를 설정하면, 백엔드가 비동기 Job을 생성하고 진행 상황을 폴링 방식으로 클라이언트에 전달한다.

---

## 전체 흐름

```
클라이언트
  │
  ├─ POST /exams/jobs          → Job 생성 (즉시 응답)
  │
  ├─ GET  /exams/jobs/:jobId   → 진행 상황 폴링 (1.2초 간격)
  │
  └─ GET  /exams/:examId       → 완료 후 시험 결과 조회
```

---

## 1단계: Job 생성

**엔드포인트:** `POST /exams/jobs`

**요청 파라미터:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `subjectId` | string | 과목 UUID |
| `startUnitNum` | number | 시작 단원 번호 |
| `endUnitNum` | number | 종료 단원 번호 |
| `difficulty` | `LOW \| MIDDLE \| HIGH \| SUPER` | 난이도 |
| `questionCount` | number | 생성할 문항 수 |
| `customPrompt` | string? | 추가 지시사항 (선택) |
| `targetConcepts` | string[]? | 특정 개념 지정 (선택) |

**동작:**
1. `ExamGenerationJobsService.create()` — 메모리 Map에 Job 등록 (status: `pending`)
2. `ExamsService.runJob()` — 비동기 fire-and-forget으로 생성 파이프라인 실행
3. Job ID를 즉시 클라이언트에 반환

> Job은 메모리에만 저장되므로 서버 재시작 시 소실된다.

---

## 2단계: 생성 파이프라인

`ExamGeneratorService.generate()` 내부에서 순차 실행된다.

### Step 0: 교과서 텍스트 로딩

```
TextbookService.getUnits(subjectSlug, startUnitNum, endUnitNum)
  → gap/textbook/{subjectSlug}/Unit_XX.txt 파일 읽기
  → UnitPayload[] 반환 (unit_name, text_payload)
```

진행률: 15% → 25%

---

### Step 1: Blueprint 생성 (설계도)

**목적:** 실제 문항 데이터 없이 문항의 논리 구조(설계도)만 생성한다.

**프롬프트 선택 로직:**
```
questionCount == 1  →  step1/single/single_{difficulty}.txt
questionCount >= 2  →  step1/multi/multi_{difficulty}.txt
```

**난이도별 프롬프트:**
| 난이도 | 파일 | 설계 방식 |
|--------|------|-----------|
| LOW | `single_low` / `multi_low` | 사실 확인형 — 정보 1:1 매칭 |
| MIDDLE | `single_middle` / `multi_middle` | 원리 적용형 — 기초 인과관계 |
| HIGH | `single_high` / `multi_high` | 복합 추론형 — 다중 조건 중첩 |
| SUPER | `single_super` / `multi_super` | 킬러형 — 예외 조항 + 추상적 원리 |
| (혼합) | `multi_intergrate` | 난이도 자동 결정 — 개념 복잡성 기반 |

**공통 구성 요소 (`_shared/`):**
- `tpl_library.txt` — 9종 TPL 정의 (플레이스홀더 `{{TPL_LIBRARY}}` 치환)
- `implementation_rules.txt` — 공통 구현 규칙 Rules 2~9 (플레이스홀더 `{{IMPLEMENTATION_RULES}}` 치환)

**GPT 입력:**
```
[system] 페르소나 (KICE 출제 전문위원)
[user]   프롬프트 + Input Data:
           - total_item_count: N
           - units: [{unit_name, text_payload}, ...]
           - target_concepts: [...] (선택)
           - additional_instructions: "..." (선택)
           + 수량 엄수 강제 문구
```

**GPT 출력:** Blueprint JSON 배열
```json
[
  {
    "metadata": { "unit_name": "...", "target_concept": "...", "item_type": "...", "recommended_template": "TPL_XXX" },
    "knowledge_extraction": { "core_logic_guide": "...", "required_data_nodes": [...] },
    "item_design_logic": { "distractor_algorithms": [...] },
    "render_ready": { "question_stem": "...", "stimulus_data_guide": "...", "options_list_guide": "..." }
  }
]
```

진행률: 35% → 50%  
재시도: 최대 3회

---

### Step 2: 문항 데이터 생성

**목적:** Step 1의 Blueprint를 바탕으로 실제 렌더링 가능한 문항 데이터를 생성한다.

**프롬프트:** `step2/intergrate.txt` (단일 파일, 난이도 무관)

**GPT 입력:**
```
[system] 페르소나 (KICE 출제 전문위원)
[user]   step2 프롬프트 + Input Data:
           - Blueprint Array: [Step 1 결과]
           - units: [{unit_name, text_payload}, ...]
           + 수량 엄수 강제 문구 (Blueprint 수 == 출력 수)
```

**GPT 출력:** 완성된 문항 JSON 배열
```json
[
  {
    "metadata": {
      "unit_name": "...",
      "target_concept": "...",
      "item_type": "...",
      "difficulty": "하|중|상|극상",
      "recommended_template": "TPL_XXX"
    },
    "render_ready": {
      "question_stem": "완성된 발문",
      "stimulus_data": { ... },
      "options_list": ["선지1", "선지2", "선지3", "선지4", "선지5"]
    },
    "correct_answer": 3,
    "explanation": {
      "judgment": "정답 근거",
      "distractors": { "1": "...", "2": "...", "4": "...", "5": "..." }
    }
  }
]
```

진행률: 55% → 70%  
재시도: 최대 3회

---

### Step 3: 검증 (Validation)

`validateItems()` 에서 각 문항을 검증한다.

**검증 조건:**
- `options_list` 정확히 5개
- `correct_answer` 1~5 사이 정수
- 위 조건 불충족 시 해당 문항 스킵 (경고 로그)

**난이도 매핑:**
```
"하" → LOW, "중" → MIDDLE, "상" → HIGH, "극상" → SUPER
```

진행률: 75% → 82%

---

### Step 4: DB 저장 (재사용 체크)

각 문항에 대해 동일한 `(subjectId, unitId, targetConcept, recommendedTemplate)` 조합이 이미 DB에 있으면 재사용한다.

**저장 엔티티:**
- `Unit` — 단원 (없으면 자동 생성)
- `Question` — 문항 데이터

진행률: 86% → 96%

---

### Step 5: ExamRecord 생성

`ExamsService.createWithProgress()` 에서 처리한다.

1. `ExamRecord` 저장 — 시험 메타데이터 (제목, 난이도, 문항 수 등)
2. `ExamItem` 저장 — 시험-문항 연결 (orderIndex 포함)
3. `ExamGenerationJobsService.complete()` — Job status: `completed`, examId 저장

---

## 9종 TPL (템플릿) 정의

| ID | 이름 | 용도 |
|----|------|------|
| `TPL_COMPARATIVE_MATRIX` | 비교 행렬 | 객체 간 속성 비교 표 |
| `TPL_FORMAL_DOCUMENT` | 공식 문서 | 법령/공문서/기사 형식 |
| `TPL_CONVERSATIONAL_FLOW` | 대화문 | 2인 이상 대화/인터뷰 |
| `TPL_CASE_DIAGNOSTIC_FRAME` | 사례 진단 | 인물 사례 + 체크리스트 |
| `TPL_SEQUENTIAL_WORKFLOW` | 순서도 | 절차/단계 흐름도 |
| `TPL_INSTRUCTIONAL_SCENE` | 수업 장면 | 강연자 + 칠판 + 학생 |
| `TPL_DIGITAL_FORUM_INTERFACE` | 게시판 | 포스트 + 댓글 구조 |
| `TPL_QUANTITATIVE_CHART` | 수치 표 | 정량 데이터 표 (차트 대체) |
| `TPL_PROMOTIONAL_CANVAS` | 광고문 | 포스터/슬로건 형식 |

### TPL_SEQUENTIAL_WORKFLOW 유형 구분

| 유형 | is_missing | 발문 형식 | 선지 형식 |
|------|-----------|-----------|-----------|
| A: 빈칸 채우기형 | 1~2개 true | "(가)에 들어갈 내용은?" | 빈칸 단계의 특징·목적 서술 |
| B: 내용 이해형 | 모두 false | "순서도에 대한 설명으로 옳은 것은?" | 단계 간 관계·조건 서술 |

---

## 파일 구조

```
gap/
├── prompts/
│   ├── _shared/
│   │   ├── tpl_library.txt           # 9종 TPL 정의 (공통)
│   │   └── implementation_rules.txt  # Rules 2~9 (공통)
│   ├── step1/
│   │   ├── single/
│   │   │   ├── single_low.txt
│   │   │   ├── single_middle.txt
│   │   │   ├── single_high.txt
│   │   │   └── single_super.txt
│   │   └── multi/
│   │       ├── multi_low.txt
│   │       ├── multi_middle.txt
│   │       ├── multi_high.txt
│   │       ├── multi_super.txt
│   │       └── multi_intergrate.txt  # 난이도 혼합 자동 결정
│   └── step2/
│       └── intergrate.txt
├── textbook/
│   ├── success/Unit_01.txt ~ Unit_20.txt
│   └── kongil/Unit_01.txt ~ Unit_20.txt
└── backend/src/
    ├── exams/
    │   ├── exams.controller.ts
    │   ├── exams.service.ts
    │   ├── exam-generator.service.ts      # 생성 파이프라인 핵심
    │   └── exam-generation-jobs.service.ts # Job 상태 관리 (메모리)
    └── prompts/
        └── prompts.service.ts             # 프롬프트 파일 로딩 + 치환
```

---

## 진행률 단계 요약

| 단계 | progress | stage |
|------|----------|-------|
| 교과서 로딩 시작 | 15% | `loading_textbook` |
| 교과서 로딩 완료 | 25% | `loading_textbook` |
| Step 1 요청 | 35% | `step1` |
| Step 1 완료 | 50% | `step1` |
| Step 2 요청 | 55% | `step2` |
| Step 2 완료 | 70% | `step2` |
| 검증 시작 | 75% | `validating` |
| 검증 완료 | 82% | `validating` |
| 저장 시작 | 86% | `saving_questions` |
| 저장 완료 | 96% | `saving_questions` |
| Job 완료 | 100% | `completed` |
