유준님, 지금까지 우리가 함께 빌드업한 '수능형 문항 자동 생성 파이프라인'의 전 과정을 한눈에 파악하고 바로 실무에 적용할 수 있도록 정리했습니다. 이 가이드는 설계(Architect)와 집필(Renderer)의 역할을 철저히 분리하여 데이터의 순수성과 문항의 고퀄리티를 보장하는 데 목적이 있습니다.

---

# 🎓 수능형 문항 자동 생성 파이프라인 (Batch Process v3.0)

본 시스템은 Step 1(DNA 설계)과 Step 2(데이터 렌더링)의 2단계 구조로 작동하며, 주입된 텍스트 외의 외부 지식을 철저히 배제하는 **폐쇄적 참조(Strict Grounding)** 원칙을 따릅니다.

---

## 🛠️ 공통 구현 원칙 (8 Core Rules)

모든 단계의 프롬프트는 아래 8가지 핵심 원칙을 기반으로 작동합니다.

1. **추상화 (Abstraction):** 소재에 종속되지 않는 범용적 논리 인터페이스 정의.
2. **데이터 소거 (Placeholder Logic):** 설계 단계에서는 실제 데이터를 비우고 집필 지시서만 작성.
3. **도메인 중립 (Domain Agnostic):** 경제, 법, 기술 등 모든 소재에 적용 가능한 보편성 확보.
4. **형식 엄수 (JSON ONLY):** 부연 설명 없이 유효한 JSON 코드 블록만 출력.
5. **어휘 통제 (Standard CSAT Vocabulary):** 수능 기출 표준 어휘(예: '판단 기준', '일반적인 특징') 사용.
6. **수치 논리 (Quantitative Logic):** 명시적 수치의 1:1 대조만 허용 (사칙연산 금지).
7. **폐쇄 참조 (Strict Grounding):** 주입된 `text_payload` 외의 외부 지식 개입을 철저히 차단.
8. **제로-데이터 (Strict Template Mode):** 설계도 내부에 실제 정답이나 수치를 직접 생성하지 않음.

---

## 🟦 Step 1: [Universal Batch DNA Architect]

**역할:** 지문 분석 및 문항의 '뼈대' 구성. 어떤 개념을 어떤 UI에 담아 어떤 함정을 팔 것인지 기획합니다.

* **주요 기능:**
* 다수 단원(`units`) 동시 분석 및 배치(Batch) 설계.
* 난이도(`item_type`) 자동 판정 (하: 사실확인 ~ 극상: 킬러).
* 9종 마스터 UI 라이브러리 중 최적의 템플릿 선정.
* 수량 엄수 (`total_item_count` 준수).



---

## 🟧 Step 2: [Universal Batch Master Renderer]

**역할:** 설계도를 바탕으로 실제 데이터를 주입하고 해설을 집필하는 '출제자' 역할입니다.

* **핵심 로직:**
* **개념어 은닉 (Concept Evasion):** 지문 내 핵심 키워드를 특징으로 치환하여 추론 유도.
* **초정밀 해설 (Hyper-Detailed Explanation):** [정답 판정] 근거 인용 및 [오답 설계] 알고리즘 분석 포함.
* **스키마 준수:** 유준님이 정의한 TypeScript 인터페이스 규격을 100% 반영.



---

## 📊 9종 마스터 UI 라이브러리 (Schema Spec)

| Template ID | 주요 사용 사례 | 핵심 데이터 구조 (stimulus_data) |
| --- | --- | --- |
| **TPL_COMPARATIVE_MATRIX** | 회사 형태 비교, 직업 능력 분류 | `headers`, `rows (cells: string[])`, `selection_chips` |
| **TPL_FORMAL_DOCUMENT** | 공문서, 보고서, 법률 조문 | `doc_type`, `header_info`, `paragraphs`, `footnotes` |
| **TPL_CONVERSATIONAL_FLOW** | 투자자 대화, 팀 회의, 토론 | `participants`, `messages` |
| **TPL_CASE_DIAGNOSTIC_FRAME** | 경영 진단, 합리적 소비 평가 | `case_profile`, `narrative`, `check_items` |
| **TPL_SEQUENTIAL_WORKFLOW** | 경제 순환, 의사결정 절차 | `orientation`, `steps (idx, label, desc, is_missing)` |
| **TPL_INSTRUCTIONAL_SCENE** | 신입 사원 교육, 수업 장면 | `instructor`, `canvas_content (5종 type)`, `students` |
| **TPL_DIGITAL_FORUM_INTERFACE** | Q&A 게시판, 커뮤니티 댓글 | `forum_name`, `main_post`, `comments` |
| **TPL_QUANTITATIVE_CHART** | 자산 비교, 매출 추이 (Bar/Line/Radar) | `chart_type`, `axes (key, label, max)`, `datasets` |
| **TPL_PROMOTIONAL_CANVAS** | ESG 경영 선포, 인재상 포스터 | `slogan`, `bullets`, `visual_elements`, `missing_part` |

---

## 🚀 데이터 흐름 (Workflow)

1. **데이터 준비:** 여러 단원의 텍스트(`text_payload`)를 준비합니다.
2. **Step 1 실행:** 원하는 문항 수와 텍스트를 넣고 **Blueprint JSON 배열**을 얻습니다.
3. **Step 2 실행:** 얻은 Blueprint 배열과 원문을 다시 넣습니다.
4. **최종 결과:** React 프론트엔드에서 즉시 렌더링 가능한 **최종 문항 데이터 세트**가 완성됩니다.

---

> **Tip:** 대량 생성 시(20문제 이상) 출력이 중간에 끊기면 **"이어서 작성해줘"**라고 요청하세요. AI가 이전 JSON의 문법을 유지하며 나머지 객체들을 순차적으로 뱉어낼 것입니다.
