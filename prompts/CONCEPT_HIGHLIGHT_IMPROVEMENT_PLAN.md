# "문제에 나타나는 개념" 섹션 개선 계획

## 현재 문제점

### 데이터가 부실한 예시
```json
"conceptHighlight": {
  "inStimulus": "직업의 변화 요인 (가)~(다)",
  "inOptions": null,
  "reason": "직업의 변화 요인을 이해하기 위해서는 일과 직업의 정의 및 특징을 알고 있어야 한다."
}
```

### 문제 진단
| 항목 | 현재 | 수험생이 원하는 것 |
|------|------|-------------------|
| `inStimulus` | 발문 일부 복사 | 지문에서 이 개념이 **핵심 단서로 작동하는 구체적 문장** 인용 + 왜 그게 단서인지 설명 |
| `inOptions` | null 또는 의미없는 텍스트 | 이 개념을 알면 걸러낼 수 있는 **구체적 선지 번호** + 왜 걸러지는지 |
| `reason` | 교사용 일반 설명 (conceptUsage 중복) | **풀이 사고 흐름**: "이 단서를 보고 → 이 개념을 떠올리고 → 이렇게 판단해서 → 정답/오답을 구분한다" |

---

## 개선 목표

수험생이 "아, 이 개념을 알면 이 문제를 이렇게 풀 수 있구나"를 체감하도록:
1. **지문 속 핵심 단서** 정확히 인용
2. **선지별 적용** (이 개념을 적용하면 어떤 선지가 O/X인지)
3. **풀이 사고 흐름** 단계별 서술

---

## 새 데이터 구조 설계

```typescript
interface ConceptHighlightV2 {
  // 1. 지문에서 이 개념이 작동하는 핵심 단서들
  stimulusClues: {
    quote: string;        // 지문 속 정확한 인용 (10~50자)
    why: string;          // 왜 이 부분이 핵심 단서인지 (1문장)
  }[];
  
  // 2. 선지별 개념 적용 결과
  optionAnalysis: {
    optionNum: number;    // 선지 번호 (1~5)
    verdict: 'O' | 'X';  // 이 개념으로 판단한 결과
    reasoning: string;    // 왜 O/X인지 (1~2문장, 개념 연결)
  }[];
  
  // 3. 풀이 사고 흐름 (수험생 관점, 3~5단계)
  solvingFlow: {
    step: number;
    action: string;       // "지문에서 ~를 확인한다", "이 개념의 ~를 떠올린다", "선지 ③을 소거한다"
  }[];
  
  // 4. 핵심 한줄 요약
  takeaway: string;       // "이 개념을 알면 ~를 구분할 수 있다"
}
```

### 실제 예시 (1단원 - "일과 직업의 의미 및 특징")

```json
{
  "stimulusClues": [
    {
      "quote": "20세가 되던 해에 최연소 지도자로 발탁되어 현재까지 4년째 활동중",
      "why": "현재 나이(24세)를 역산하여 생애 발달 단계를 판단하는 핵심 단서"
    },
    {
      "quote": "후배들의 기량이 향상되는 것을 보면서 만족을 느낍니다",
      "why": "직업 활동에서 보람을 느끼는 것 → '확립기'의 전문성 확대 특징"
    }
  ],
  "optionAnalysis": [
    { "optionNum": 1, "verdict": "X", "reasoning": "은퇴 후 준비 → 쇠퇴기(65세 이상) 과업. 24세와 불일치." },
    { "optionNum": 2, "verdict": "X", "reasoning": "체력 저하 적응 → 유지기(45~64세) 과업. 24세와 불일치." },
    { "optionNum": 3, "verdict": "X", "reasoning": "진로 탐색 → 탐색기(15~24세)이지만, A씨는 이미 직업을 확립함." },
    { "optionNum": 4, "verdict": "X", "reasoning": "경력자+노후 준비 → 유지기 과업. 24세에 해당 안 됨." },
    { "optionNum": 5, "verdict": "O", "reasoning": "전문 영역 확대+사회 역할 수행 → 확립기(25~44세) 과업. 24세이지만 직업 확립 상태이므로 해당." }
  ],
  "solvingFlow": [
    { "step": 1, "action": "지문에서 A씨의 현재 나이를 계산한다 (20세+4년=24세)." },
    { "step": 2, "action": "해비거스트의 생애 발달 단계에서 24세가 속하는 단계를 판단한다 (확립기 초기)." },
    { "step": 3, "action": "A씨가 '지도자로 활동+후배 양성+목표 설정' 중임을 확인 → 확립기의 전문성 확대 과업과 일치." },
    { "step": 4, "action": "각 선지가 어느 발달 단계의 과업인지 대조하여 ⑤만 확립기임을 확인한다." }
  ],
  "takeaway": "생애 발달 단계는 나이 역산 + 현재 활동 내용으로 판단. 확립기는 '전문 영역 확대'가 핵심 키워드."
}
```

---

## 구현 계획

### Phase A: 데이터 재생성 (프롬프트 기반)

**목표:** 기존 `success_cards_moi/*.json`의 `conceptHighlight`를 새 구조로 업그레이드

**방법:** 
1. 새 프롬프트 작성 (`prompts/concept_highlight_v2.txt`)
   - 입력: 기존 `realQuestion` (지문+선지+정답) + `conceptName` + `definition`
   - 출력: `ConceptHighlightV2` JSON
   - 페르소나: "수능 직업탐구 만점 선배" 관점으로 풀이

2. 배치 스크립트로 기존 20단원 × 5~10개 concept = 100~200개 문항 처리

3. 결과를 `success_cards_moi/*.json`의 `conceptHighlight` 필드에 덮어쓰기

### Phase B: 백엔드 매핑 수정

**파일:** `backend/src/study/study.service.ts` (`transformCardsToFrequency`)

- 새 구조(`stimulusClues`, `optionAnalysis`, `solvingFlow`, `takeaway`)를 API 응답에 포함
- 하위호환: 기존 구조(`inStimulus`, `inOptions`, `reason`)도 fallback으로 유지

### Phase C: 프론트엔드 UI 개편

**파일:** `frontend/app/(main)/study/[subject]/[chapter]/concept/page.tsx`

현재:
```
💡 이 개념이 나타나는 부분
  "발문 텍스트 복사"
  reason 텍스트
```

개선 후:
```
📌 풀이 핵심
  "이 개념을 알면 ~를 구분할 수 있다" (takeaway)

🔍 지문 속 핵심 단서
  ❶ "20세가 되던 해에...4년째" → 나이 역산 단서
  ❷ "후배들의 기량 향상...만족" → 확립기 특징 단서

📝 선지 적용
  ① ✗ 은퇴 후 준비 → 쇠퇴기 과업 (24세 불일치)
  ② ✗ 체력 저하 → 유지기 과업
  ③ ✗ 진로 탐색 → 탐색기이나 이미 직업 확립
  ④ ✗ 경력자+노후 → 유지기
  ⑤ ✓ 전문 영역 확대 → 확립기 ← 정답!

🧠 풀이 순서
  1. 지문에서 나이 계산 (20+4=24)
  2. 24세 → 확립기 초기 판단
  3. 활동 내용 확인 → 전문성 확대
  4. 선지별 발달 단계 대조 → ⑤ 확정
```

### Phase D: 프롬프트 파일 작성

```
prompts/concept_highlight_v2.txt
```

내용:
```
# Role: 수능 직업탐구 만점 선배 (문제 풀이 해설자)
# Context: 주어진 수능 기출문제에서 특정 개념이 어떻게 활용되어 정답을 도출하는지를, 고3 수험생이 실전에서 따라할 수 있는 풀이 사고 흐름으로 분석하라.

# [Input]
- concept_name: 학습 중인 개념명
- concept_definition: 개념 정의
- question_stem: 발문
- stimulus: 지문 전문
- options: 선지 5개
- correct_answer: 정답 번호

# [Output JSON Schema]
{
  "stimulusClues": [
    { "quote": "지문 속 정확한 인용 (10~50자)", "why": "왜 이것이 핵심 단서인지 1문장" }
  ],
  "optionAnalysis": [
    { "optionNum": 1, "verdict": "O|X", "reasoning": "이 개념으로 판단한 근거 1~2문장" }
  ],
  "solvingFlow": [
    { "step": 1, "action": "수험생이 실제로 취하는 행동 1문장" }
  ],
  "takeaway": "이 개념을 알면 ~를 구분할 수 있다 (핵심 한줄)"
}

# [규칙]
1. stimulusClues: 지문에서 이 개념이 정답 판단에 결정적으로 작용하는 부분만 인용. 최소 1개, 최대 3개.
2. optionAnalysis: 5개 선지 전부 분석. 정답(O)이 왜 맞고, 오답(X)이 왜 틀린지 이 개념 관점에서 설명.
3. solvingFlow: 수험생이 시험장에서 실제로 밟는 사고 순서. 3~5단계. "~한다" 체로 서술.
4. takeaway: 이 문제를 통해 얻는 실전 교훈 1문장. 다른 문제에도 적용 가능한 일반화된 팁.
5. 말투: 교사가 아닌 "만점 받은 선배"가 후배에게 알려주는 톤. 간결하고 실전적.
6. JSON ONLY 출력.
```

---

## 실행 순서

| 단계 | 작업 | 의존성 |
|------|------|--------|
| A-1 | `prompts/concept_highlight_v2.txt` 프롬프트 작성 | 없음 |
| A-2 | 배치 재생성 스크립트 작성 (기존 JSON → OpenAI → 업데이트) | A-1 |
| A-3 | 100~200개 conceptHighlight 데이터 재생성 실행 | A-2 |
| B-1 | 백엔드 `transformCardsToFrequency` 매핑 수정 | A-3 |
| C-1 | 프론트엔드 새 UI 컴포넌트 설계/구현 | B-1 |
| C-2 | 기존 `highlightSection` UI를 새 구조로 교체 | C-1 |

**예상 소요:** 프롬프트 + 스크립트(1시간) → 데이터 재생성(API 호출 시간) → 백엔드/프론트(2시간)

---

## 기대 효과

| Before | After |
|--------|-------|
| "이 문제는 ~를 요구한다" (교사용 설명) | "지문에서 나이를 역산하고 → 확립기를 판단하고 → 선지 대조" (수험생 풀이) |
| 발문 텍스트 복사 | 지문 속 정확한 핵심 문장 인용 + 왜 단서인지 |
| 관련 선지 없음 | 5개 선지 전부 O/X 판정 + 개념 연결 근거 |
| 추상적 이유 1문장 | 실전 풀이 순서 3~5단계 |
