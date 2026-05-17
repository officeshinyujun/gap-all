# 문항 생성 로직

## 개요

문항 생성은 OpenAI GPT-4o 기반 2단계 파이프라인으로 동작한다.
사용자가 과목/단원/난이도/문항 수를 설정하면, 백엔드가 비동기 Job을 생성하고 진행 상황을 폴링 방식으로 클라이언트에 전달한다.

**핵심 설계 원칙:**
- 과목별(공일/성직) 분리 생성: 동일한 파이프라인 구조를 공유하되, 프롬프트·톤·자료 형식·오답 전략이 과목에 따라 분기한다.
- 조합형 문항 1급 지원: 발문-보기(ㄱ~ㄹ)-선택지(①~⑤)를 하나의 통합 판단 시스템으로 설계한다.
- 코퍼스 충실 생성: 추상화·인지 부하 극대화가 아닌, 실제 EBS 수능특강 문항의 톤과 구조를 재현한다.
- 스타일 검증: 구조적 유효성뿐 아니라 과목별 문체·자료 형식 적합성까지 검증한다.

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

**목적:** 실제 문항 데이터 없이 문항의 논리 구조(설계도)만 생성한다. 이 단계에서 문항의 판단 축, 보기 진위 배정, 선택지 조합 인코딩 계획까지 확정한다.

**과목 인식 프롬프트 라우팅:**

프롬프트 선택은 `questionCount`, `difficulty`, 그리고 `subjectSlug`에 의해 결정된다.

```
questionCount == 1  →  step1/single/single_{difficulty}.txt
questionCount >= 2  →  step1/multi/multi_{difficulty}.txt
```

프롬프트 내부에서 과목별 분기가 적용된다:
- **공일(kongil):** 산업현장형 톤, 보고서·표·공정도·분류표 중심 자료, 기술적 판단 축
- **성직(success):** 생활상황형 톤, 대화·사례·상담·채용공고·NCS 화면 중심 자료, 가치/제도 판단 축

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
- `implementation_rules.txt` — 공통 구현 규칙 (플레이스홀더 `{{IMPLEMENTATION_RULES}}` 치환)

**GPT 입력:**
```
[system] 페르소나 (EBS 수능특강 실전문항 집필 전문위원)
[user]   프롬프트 + Input Data:
           - total_item_count: N
           - subject_slug: "kongil" | "success"
           - units: [{unit_name, text_payload}, ...]
           - target_concepts: [...] (선택)
           - additional_instructions: "..." (선택)
           + 수량 엄수 강제 문구
```

**GPT 출력:** Blueprint JSON 배열

조합형 문항의 경우 통합 판단 구조를 포함한다:
```json
[
  {
    "metadata": {
      "unit_name": "...",
      "target_concept": "...",
      "item_type": "combination_judgment | single_selection | blank_workflow | direct_statement",
      "recommended_template": "TPL_XXX"
    },
    "knowledge_extraction": {
      "core_logic_guide": "...",
      "required_data_nodes": [...]
    },
    "item_structure": {
      "item_family": "combination_judgment",
      "judgment_axis": "발문이 수험생에게 요구하는 판단의 대상/기준",
      "view_count": 4,
      "choice_encoding_type": "truth_combination"
    },
    "judgment_map": {
      "ga": { "claim": "...", "truth": true, "evidence_anchor": ["..."] },
      "na": { "claim": "...", "truth": false, "evidence_anchor": ["..."] },
      "da": { "claim": "...", "truth": true, "evidence_anchor": ["..."] },
      "ra": { "claim": "...", "truth": false, "evidence_anchor": ["..."] }
    },
    "choice_encoding_plan": {
      "correct_combination": ["ga", "da"],
      "distractor_combinations": [["ga", "na"], ["na", "da"], ["ga", "na", "da"], ["na", "ra"]]
    },
    "item_design_logic": {
      "distractor_algorithms": [...]
    },
    "render_ready": {
      "question_stem": "...",
      "stimulus_data_guide": "...",
      "options_list_guide": "..."
    }
  }
]
```

비조합형(단일 선택형) 문항은 `item_structure.item_family`가 `single_selection` 등이며, `judgment_map`과 `choice_encoding_plan` 대신 기존의 `distractor_algorithms`와 `options_list_guide`로 설계된다.

진행률: 35% → 50%  
재시도: 최대 3회

---

### Step 2: 문항 데이터 생성 (렌더링)

**목적:** Step 1의 Blueprint를 바탕으로 실제 렌더링 가능한 문항 데이터를 생성한다. Step 2는 독립적 추론 엔진이 아니라, Blueprint의 논리 계획을 충실히 구현하는 렌더러이다.

**과목별 렌더링 원칙:**

| 과목 | 톤 | 선호 자료 형식 | 핵심 원칙 |
|------|-----|---------------|-----------|
| 공일 | 기술적·행정적·보고서체 | 표, 공정도, 분류표, 보고서, 기업 자료 | 기술 용어 정확성, 산업 분류 엄밀성 |
| 성직 | 상담체·생활문체·안내문체 | 대화문, 사례, 상담, 채용공고, NCS 화면 | 인물 동기의 자연스러움, 제도 적용의 현실성 |

**조합형 문항 렌더링 규칙:**
- ①~⑤는 독립 생성된 선지가 아니라, Blueprint의 `choice_encoding_plan`에 따른 보기 진위 조합의 인코딩 결과이다.
- Step 2는 `judgment_map`의 truth assignment를 변경하지 않는다.
- 보기(ㄱ~ㄹ) 텍스트는 `judgment_map`의 `claim`을 과목 톤에 맞게 구체화한 것이다.

**프롬프트:** `step2/intergrate.txt` (단일 파일, 난이도 무관)

**GPT 입력:**
```
[system] 페르소나 (EBS 수능특강 실전문항 집필 전문위원)
[user]   step2 프롬프트 + Input Data:
           - Blueprint Array: [Step 1 결과]
           - subject_slug: "kongil" | "success"
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

`validateItems()` 에서 각 문항을 검증한다. 검증은 구조 검증과 스타일 검증 두 단계로 구성된다.

#### 3-A. 구조 검증 (Structural Validation)

- `options_list` 정확히 5개
- `correct_answer` 1~5 사이 정수
- 위 조건 불충족 시 해당 문항 스킵 (경고 로그)

#### 3-B. 스타일 검증 (Style Validation)

과목별 문체·자료 형식 적합성을 검증한다:

| 검증 항목 | 공일 기대값 | 성직 기대값 |
|-----------|------------|------------|
| 자료 톤 | 기술적·보고서체·행정문체 | 상담체·생활문체·대화체 |
| 자료 형식 | 표, 공정도, 분류표, 보고서 | 대화문, 사례, 상담, 공고문 |
| 오답 근거 | 산업 분류/공정/관리 기법 혼동 | 가치관/면접유형/법/NCS 혼동 |

#### 3-C. 조합형 논리 검증 (Combination Logic Validation)

조합형 문항에 대해 추가 검증:
- ①~⑤가 보기 진위 조합을 올바르게 인코딩하는지 확인
- 정답 선택지가 Blueprint의 truth assignment와 일치하는지 확인
- 발문의 판단 축과 보기 내용이 정합하는지 확인

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

## 과목별 생성 철학

### 공일 (kongil) — 산업현장형

| 항목 | 원칙 |
|------|------|
| 톤 | 기술 교과서 + 실무 문서 어조. 감정 표현 최소화 |
| 자료 형식 | 보고서, 표, 공정도, 분류표, 기업 자료, 생산 시스템 도식 |
| 판단 축 | 산업 분류, 공정 순서, 관리 기법 적합성, 수치 해석 |
| 오답 전략 | 유사 산업 분류 혼동, 공정 순서 뒤바꿈, 관리 기법 혼동, 안전 요인 오분류 |
| 어휘 | 교과 전문 용어 직접 사용 허용 (판단이 여전히 필요한 경우) |

### 성직 (success) — 생활상황형

| 항목 | 원칙 |
|------|------|
| 톤 | 상담형, 안내형, 교육형. 인간 중심적이고 구어성 있음 |
| 자료 형식 | 사례문, 상담 대화, SNS, 면접/채용 공고, NCS 화면, 자기소개서 |
| 판단 축 | 가치관 판별, 제도 적용, 직무 능력 매칭, 윤리 원칙 적용 |
| 오답 전략 | 내재적/외재적 가치 혼동, 면접 유형 혼동, NCS 단계 혼동, 근로 제도 대상 혼동 |
| 어휘 | 생활 언어로 상황 제시 후 교과 개념어로 판단하게 유도 |

---

## 통합 문항 구조 모델 (조합형 1급 지원)

EBS 수능특강 문항의 핵심 구조는 **발문-보기-선택지 통합 판단 시스템**이다:

```
1. 발문 (question_stem)
   → 판단 축(judgment_axis)을 규정
   → "다음 ... 옳은 것만을 <보기>에서 있는 대로 고른 것은?"

2. 보기 (ㄱ~ㄹ)
   → 각각 독립된 진술(claim)
   → 제시문 근거에 의해 참/거짓이 결정됨

3. 선택지 (①~⑤)
   → 보기 진위 조합의 인코딩
   → 예: ① ㄱ, ㄴ  ② ㄱ, ㄷ  ③ ㄴ, ㄹ  ④ ㄱ, ㄴ, ㄷ  ⑤ ㄴ, ㄷ, ㄹ
```

이 구조에서 ①~⑤는 독립 생성된 선지가 아니라, 보기 진위 판정의 결과물이다. 따라서:
- Step 1에서 각 보기의 truth assignment를 확정한다.
- Step 2에서는 이 assignment를 변경하지 않고 텍스트만 렌더링한다.
- 검증에서 인코딩 정합성을 확인한다.

비조합형 문항(단일 선택형, 빈칸형 등)은 기존 방식대로 5개 독립 선지를 생성한다.

---

## 코퍼스 충실 프롬프트 설계 원칙

| 원칙 | 설명 |
|------|------|
| 톤 재현 | 실제 EBS 수능특강 문항의 말투·문체를 재현한다. 인위적 추상화를 지양한다. |
| 개념어 허용 | 교과 개념어를 발문/보기에 직접 사용할 수 있다. 단, 개념어만으로 정답이 결정되면 안 되고, 판단·적용·해석이 여전히 필요해야 한다. |
| 자료 현실성 | 자료(stimulus_data)는 실제 교과서·문제집에서 볼 법한 형태여야 한다. 과도하게 복잡하거나 인위적인 자료를 지양한다. |
| 난이도 원천 | 난이도는 어휘 난해화가 아니라, 구조적 복잡성(다중 조건, 정보 분산, 유사 개념 변별)에서 온다. |
| 오답 현실성 | 오답은 같은 단원 내 유사 교과 개념에서 파생된 교육과정 인접 혼동(curriculum-adjacent confusion)이어야 한다. |

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

### 과목별 TPL 선호도

| TPL | 공일 선호도 | 성직 선호도 |
|-----|-----------|-----------|
| `TPL_COMPARATIVE_MATRIX` | 높음 (산업 분류 비교) | 중간 |
| `TPL_FORMAL_DOCUMENT` | 높음 (보고서, 공문) | 중간 (공고문, 안내문) |
| `TPL_CONVERSATIONAL_FLOW` | 낮음 | 높음 (상담, 면접) |
| `TPL_CASE_DIAGNOSTIC_FRAME` | 중간 | 높음 (인물 사례) |
| `TPL_SEQUENTIAL_WORKFLOW` | 높음 (공정, 절차) | 중간 |
| `TPL_INSTRUCTIONAL_SCENE` | 중간 | 중간 |
| `TPL_DIGITAL_FORUM_INTERFACE` | 낮음 | 높음 (SNS, Q&A) |
| `TPL_QUANTITATIVE_CHART` | 높음 (생산 수치) | 낮음 |
| `TPL_PROMOTIONAL_CANVAS` | 중간 | 중간 |

---

## 파일 구조

```
gap/
├── prompts/
│   ├── _shared/
│   │   ├── tpl_library.txt           # 9종 TPL 정의 (공통)
│   │   └── implementation_rules.txt  # 공통 구현 규칙 (공통)
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
