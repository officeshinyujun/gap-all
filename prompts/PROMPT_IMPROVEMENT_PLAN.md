# 실전문제 생성 프롬프트 개선 계획

> 기반: `PROMPT_GAP_ANALYSIS.md` 분석 결과
> 대상: `prompts/` 디렉토리 전체 (Step 1, Step 2, _shared)

---

## Phase 1: 핵심 구조 확장 (P0 — 출제 빈도 최상위)

### 1-1. "있는 대로 고른 것은?" 패턴 지원

**현황:** 보기 4개 + 2개 조합(`truth_combination`)만 지원
**목표:** 보기 3개 + 부분집합 선지(`exhaustive_subset`) 패턴 추가

**변경 파일:**
- `_shared/implementation_rules.txt` — 새 규칙 추가
- `step1/single/*.txt` (전 난이도) — `item_structure` 스키마 확장
- `step1/multi/*.txt` (전 난이도) — 동일
- `step2/intergrate.txt` — 렌더링 규칙 추가
- `step2/success.txt` — 렌더링 규칙 추가
- `step2/kongil.txt` — 렌더링 규칙 추가

**구체적 변경 내용:**

1. `item_structure` 스키마에 추가:
```json
{
  "item_family": "... | exhaustive_subset",
  "view_count": "3 | 4",
  "choice_encoding_type": "truth_combination | independent_options | subset_exhaustive"
}
```

2. 새 인코딩 규칙 정의:
```
# [exhaustive_subset 인코딩 규칙]
- 보기 3개(ㄱ, ㄴ, ㄷ)의 참/거짓을 판정한 뒤, 참인 보기의 모든 부분집합으로 ①~⑤ 선택지를 구성한다.
- 발문: "...적절한 것만을 <보기>에서 있는 대로 고른 것은?"
- 선지 구성 예시:
  - 참: ㄱ,ㄷ → ① ㄱ  ② ㄷ  ③ ㄱ,ㄴ  ④ ㄱ,ㄷ  ⑤ ㄴ,ㄷ
  - 참: ㄱ,ㄴ,ㄷ (전부) → ① ㄱ  ② ㄴ  ③ ㄱ,ㄴ  ④ ㄴ,ㄷ  ⑤ ㄱ,ㄴ,ㄷ
- judgment_map에 ga, na, da (3개)만 사용. ra는 생략.
- choice_encoding_plan.correct_combination에 참인 보기 key 배열 기재.
```

3. Step 2 렌더링에 추가:
```
# [exhaustive_subset 렌더링 규칙]
- combo_block.items는 3개(ㄱ, ㄴ, ㄷ)로 구성
- options_list는 단일 항목(ㄱ), 2개 조합(ㄱ,ㄴ), 3개 전체(ㄱ,ㄴ,ㄷ)를 혼합하여 5개 구성
- 정답은 참인 보기를 '있는 대로' 모두 포함한 선지
```

---

### 1-2. 세트 문항 (공유 지문) 지원

**현황:** 각 문항이 독립적으로만 생성됨
**목표:** 동일 지문에서 2문항을 세트로 생성하는 구조

**변경 파일:**
- `step1/multi/multi_intergrate.txt` — 세트 문항 스키마 추가
- `step2/intergrate.txt` — 세트 렌더링 규칙 추가
- 새 파일: `_shared/set_question_rules.txt`

**구체적 변경 내용:**

1. Blueprint 스키마에 세트 그룹 필드 추가:
```json
{
  "metadata": {
    "set_group_id": "set_01",
    "set_position": 1,
    "set_total": 2,
    "shared_stimulus_note": "동일 채용 공고문을 공유"
  }
}
```

2. `_shared/set_question_rules.txt` 신규:
```
# [세트 문항 설계 규칙]
1. 동일 지문(stimulus)을 공유하되, 각 문항의 판단 축(judgment_axis)은 반드시 다른 영역이어야 한다.
2. 세트 내 문항 간 난이도 차이를 두어라: 첫 문항은 중 이하, 둘째 문항은 상 이상 권장.
3. 세트 내 문항 간 정답 번호가 겹치지 않도록 설계하라.
4. 세트 발문에는 "위 [자료명]에 대한", "위 [자료명]을 통해" 등 공유 자료 참조 형식을 사용한다.
5. 실제 수능 세트 예시: 채용 공고(경영활동 분류 + 보기 진위), 진로 사례(의사결정 유형 + 창업 분석)
```

3. multi 배치에서 세트 생성 지시:
```
# [세트 문항 생성 — 선택적]
total_item_count 중 2~4개를 세트(공유 지문)로 묶을 수 있다.
세트로 묶을 때: set_group_id를 공유하고, set_position으로 순서를 지정하라.
세트는 한 시험지에 2~3세트 이하가 자연스럽다.
```

---

### 1-3. 배점(3점) 연동

**현황:** 배점 개념 없음
**목표:** 2점/3점 표시 + 난이도 연동

**변경 파일:**
- `step1/single/*.txt` — metadata에 `point_value` 추가
- `step1/multi/*.txt` — 동일
- `step2/*.txt` — metadata 출력에 `point_value` 반영

**구체적 변경 내용:**

1. metadata 스키마 확장:
```json
{
  "metadata": {
    "point_value": 2,  // 2 또는 3
    ...
  }
}
```

2. 난이도-배점 연동 규칙 (implementation_rules에 추가):
```
# [배점 연동 규칙]
- 하(사실 확인) → point_value: 2
- 중(원리 적용) → point_value: 2 또는 3
- 상(복합 추론) → point_value: 3
- 극상(킬러) → point_value: 3
- 통합 배치 시: 전체의 약 40%를 3점으로 배분
```

---

## Phase 2: 문항 유형 확장 (P1 — 커버리지 확대)

### 2-1. (가)~(다) 매칭형 (label_matching)

**변경 파일:** Step 1 전체, _shared/implementation_rules.txt

**추가할 item_family:**
```
5. `label_matching`
- 자료(표, 연표, 분류표 등)에 (가)~(다) 라벨이 있고, 보기(ㄱ~ㄹ)를 각 라벨에 매칭하는 문제
- 선지 형식: "① (가)-ㄱ, (나)-ㄴ, (다)-ㄷ"
- choice_encoding_type은 `permutation_matching`
- judgment_map 대신 `label_answer_map` 사용:
  { "가": "ㄴ", "나": "ㄹ", "다": "ㄷ" }
```

**Step 2 렌더링 규칙:**
```
# [label_matching 렌더링 규칙]
- combo_block.items에 보기 항목(ㄱ~ㄹ)을 배치
- options_list: 라벨-보기 매칭 조합 5개 (순열 기반)
- 형식: "(가)-ㄱ, (나)-ㄴ, (다)-ㄷ" 또는 "(가)-ㄱ, (나)-ㄹ, (다)-ㄷ"
```

---

### 2-2. 2차원 매칭형 (pair_selection)

**추가할 item_family (또는 single_selection 서브타입):**
```
6. `pair_selection`
- 발문이 2개의 축을 동시에 묻는 문제 (예: 윤리유형 × 기업가정신)
- 선지 형식: "① 환경 윤리, 진취성"
- choice_encoding_type은 `independent_options`
- 선지는 (축1 값, 축2 값) 쌍으로 구성
- 설계 시 axis_1, axis_2를 명시:
  { "axis_1": { "label": "직업 윤리 유형", "options": [...] },
    "axis_2": { "label": "기업가 정신 유형", "options": [...] } }
```

---

### 2-3. 이론 참조 단서 조항

**변경 파일:** `_shared/implementation_rules.txt`, stem_patterns

**추가 규칙:**
```
# [이론 참조 단서 규칙]
문항이 특정 학술 이론에 근거한 판단을 요구할 때, 발문 말미에 "(단, ...에 근거한다.)" 형태의 단서를 반드시 포함하라.

- 사용 조건: 교과서에 명시된 이론(해비거스트, 하렌, 홀랜드, 슈메너, 호프만, 클라크 등)의 적용이 필요한 경우
- 형식: "(단, [이론가명]의 [이론명]에 근거한다.)" 또는 "(단, [분류명]은 [범위]으로만 구분한다.)"
- Blueprint에 `theory_constraint` 필드 추가:
  { "theory_constraint": "하렌(Harren, V. A.)의 진로 의사 결정 유형 이론에 근거한 합리적, 직관적, 의존적 유형으로만 구분" }
- Step 2에서 question_stem 끝에 "(단, ...)" 형태로 삽입
```

---

### 2-4. 보기 3개/4개 유연화

**변경 파일:** Step 1 전체의 `item_structure` 스키마

**변경:**
```
현재: "view_count": 4
변경: "view_count": "3 | 4 (문항 구조에 따라 결정)"
```

**규칙 추가:**
```
# [보기 개수 결정 규칙]
- view_count: 4 → 보기 4개(ㄱ~ㄹ), 선지는 2개 조합
- view_count: 3 → 보기 3개(ㄱ~ㄷ), 선지는 "있는 대로" (부분집합)
- 선택 기준:
  - 판단해야 할 독립 진술이 3개면 view_count: 3
  - 4개면 view_count: 4
  - 성직은 view_count: 3을 40% 이상 사용 (실제 수능 비율 반영)
```

---

## Phase 3: 자연스러움 향상 (P2)

### 3-1. 지문 형식 다양성 가이드

**새 파일:** `_shared/stimulus_format_guide.txt`

```
# [자료 형식 가이드 — 과목별 선호 형식]

## 성직
1. 신문 기사: 날짜, 출처(○○신문), 각주(*용어설명) 포함 → TPL_FORMAL_DOCUMENT (doc_type: "news_article")
2. 채용 공고: 모집부서, 전형방법, 주업무, 세부업무 → TPL_FORMAL_DOCUMENT (doc_type: "job_posting")
3. 근로계약서: 양식 항목(계약기간, 근무장소, 임금 등) → TPL_FORMAL_DOCUMENT (doc_type: "contract")
4. 설문조사 결과: 대상, 기간, 항목별 % → TPL_QUANTITATIVE_CHART 또는 TPL_FORMAL_DOCUMENT
5. 노동위원회 판정서: 사건명, 주문, 판정일 → TPL_FORMAL_DOCUMENT (doc_type: "legal_ruling")
6. NCS 화면: 분류체계표 + 능력단위 코드 → TPL_COMPARATIVE_MATRIX + TPL_FORMAL_DOCUMENT 결합
7. 학위증/자격증: 증번호, 법조문, 발급 형식 → TPL_FORMAL_DOCUMENT (doc_type: "certificate")
8. 민원 Q&A: 질의-답변 구조 → TPL_CONVERSATIONAL_FLOW (role: "questioner"/"counselor")

## 공일
1. 기업/공장 보고서 → TPL_FORMAL_DOCUMENT (doc_type: "report")
2. 공정도/흐름도 → TPL_SEQUENTIAL_WORKFLOW
3. 분류표/비교표 → TPL_COMPARATIVE_MATRIX
4. 규격/인증 자료 → TPL_FORMAL_DOCUMENT (doc_type: "specification")
```

---

### 3-2. 부정형 문항 전용 규칙

**변경 파일:** `_shared/implementation_rules.txt`

**추가:**
```
# [부정형 문항 설계 규칙 (polarity: negative)]
- 발문: "...옳지 않은 것은?" / "...적절하지 않은 것은?"
- 정답: 5개 선지 중 유일하게 '틀린' 1개
- 오답(4개): 모두 text_payload에 근거한 참 진술
- 설계 핵심: 정답(거짓 선지)이 표면적으로 그럴듯하지만 미세하게 틀린 구조
- metadata에 `"polarity": "negative"` 추가
- 부정형은 시험당 2~3문항 이내로 제한
```

---

### 3-3. 수치 계산 예외 규칙

**변경 파일:** `_shared/implementation_rules.txt` (4번 규칙 수정)

**현재:** "사칙연산을 금지한다."
**변경:**
```
4. **Quantitative Logic Grounding (수치 논리):**
   - 기본: 텍스트 내 명시적 수치의 1:1 대조 로직만 설계하라.
   - 예외 허용: 법정 비율 적용(통상임금의 50% 가산, 평균임금의 70% 등), 근무시간 계산(시작~종료 시간 차), 기간 계산(입사일~퇴사일) 등 교과 내용에서 필수적인 기초 산술은 허용한다.
   - 금지: 복잡한 다단계 연산, 방정식 풀이, 통계 계산
```

---

### 3-4. 법조문 인용 가이드

**변경 파일:** `_shared/subject_profiles/success.txt`

**추가:**
```
### 법조문 인용 규칙
- 성직 문항에서 법률 근거가 필요한 경우, 실제 법률명과 조문을 인용할 수 있다.
- 형식: 「법률명」 제N조
- 주요 참조 법률: 근로기준법, 노동조합 및 노동관계조정법, 고용보험법, 산업재해보상보험법, 학점 인정 등에 관한 법률, 근로자참여 및 협력증진에 관한 법률
- 법률명은 stimulus_data에 등장할 수 있으며, 이 경우 '개념어 은닉' 규칙의 예외로 처리한다.
```

---

## Phase 4: 백엔드 연동

### 4-1. PromptsService 확장

**변경 파일:** `backend/src/prompts/prompts.service.ts`

**추가 메서드:**
```typescript
// 세트 문항 생성용
getStep1SetPrompt(difficulty: Difficulty, subjectSlug?: string): string

// stimulus_format_guide 주입
getStimlusFormatGuide(): string
```

**placeholder 추가:**
- `{{STIMULUS_FORMAT_GUIDE}}` → `_shared/stimulus_format_guide.txt`
- `{{SET_QUESTION_RULES}}` → `_shared/set_question_rules.txt`

---

### 4-2. Entity/DTO 확장

**변경 파일:** 관련 entity/dto

- `metadata`에 `point_value: 2 | 3` 추가
- `metadata`에 `set_group_id?: string`, `set_position?: number` 추가
- `item_structure.item_family`에 `exhaustive_subset`, `label_matching`, `pair_selection` 추가
- `item_structure.view_count`를 `3 | 4`로 유연화

---

## 실행 순서 및 의존성

```
Phase 1 (독립 — 병렬 가능)
├── 1-1: exhaustive_subset 패턴 ← Step1 전체 + Step2 전체 + implementation_rules
├── 1-2: 세트 문항 ← multi 프롬프트 + 새 파일 + Step2
└── 1-3: 배점 연동 ← metadata 스키마 변경 (모든 Step1/Step2)

Phase 2 (Phase 1 완료 후)
├── 2-1: label_matching ← Step1 + Step2 (1-1과 유사 구조)
├── 2-2: pair_selection ← Step1 + Step2
├── 2-3: 이론 참조 단서 ← implementation_rules + stem_patterns
└── 2-4: 보기 유연화 ← Step1 전체 (1-1에 의존)

Phase 3 (Phase 2 완료 후)
├── 3-1: 지문 형식 가이드 ← 새 파일 (독립)
├── 3-2: 부정형 규칙 ← implementation_rules (독립)
├── 3-3: 수치 계산 예외 ← implementation_rules (독립)
└── 3-4: 법조문 인용 ← subject_profiles (독립)

Phase 4 (Phase 1~3 완료 후)
├── 4-1: PromptsService 확장
└── 4-2: Entity/DTO 확장
```

---

## 영향 범위 요약

| 파일 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `_shared/implementation_rules.txt` | ✓ | ✓ | ✓ | |
| `_shared/tpl_library.txt` | | | | |
| `_shared/output_contract.txt` | ✓ | ✓ | | |
| `_shared/stem_patterns/*.txt` | | ✓ | | |
| `_shared/subject_profiles/*.txt` | | | ✓ | |
| `_shared/distractor_rules/*.txt` | | | | |
| `_shared/set_question_rules.txt` (신규) | ✓ | | | |
| `_shared/stimulus_format_guide.txt` (신규) | | | ✓ | |
| `step1/single/*.txt` (4파일) | ✓ | ✓ | | |
| `step1/multi/*.txt` (5파일) | ✓ | ✓ | | |
| `step2/*.txt` (4파일) | ✓ | ✓ | | |
| `backend/src/prompts/prompts.service.ts` | | | | ✓ |
| `backend/src/entities/` | | | | ✓ |

---

## 검증 방법

각 Phase 완료 후:
1. **단위 테스트:** 변경된 프롬프트로 GPT-4에 실제 생성 요청 → 출력 JSON 스키마 검증
2. **기출 비교:** 생성된 문항과 기출 문항의 형식/구조 유사도 체크
3. **프론트엔드 호환:** 생성 JSON이 기존 React 렌더러에서 정상 표시되는지 확인
4. **배치 생성:** multi 모드로 20문항 배치 생성 → 유형 분포가 실제 수능(조합형 40%, 단일선택 30%, 있는대로 20%, 기타 10%)과 유사한지 확인
