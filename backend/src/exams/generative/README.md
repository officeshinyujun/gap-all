# 완전 AI 출제 (`sourceType: 'ai_generative'`)

참조 문항을 런타임에 쓰지 않고, 실제 기출 940문항(reference-pdf-v3: 수능·모의평가 + 수능특강)에서
뽑아 둔 **출제 특징**만으로 새 문항을 만든다.

## 지식 기반 (`data/`)

| 파일 | 내용 | 만드는 법 |
|---|---|---|
| `exam-style-profile.json` | 과목·출처(moi/suteck)·단원별 정량 분포: 응답 형식, 부정 발문 비율, 발문 어미·도입, 발문 틀, 보기 개수, ①~⑤ 보기 조합 세트, 정답 위치, 배점, 제시문 블록 구성, 라벨 관례, 대화 화자, 표 크기, 길이(p25/중앙/p75), 개념 빈도·동시 출현 | `npm run extract:exam-style` |
| `unit-guides/{kongil,success}_NN.json` | 단원별 출제 DNA: 개념(교과서 검증 정의·핵심 사실·제시문 단서·혼동 개념), 혼동 쌍과 판별 기준, 자료 장르와 구성법, 상황 틀, 참 진술 작성법·거짓 진술 기법, 응답 형식별 양상, 발문 변형, 수치 관례, 문체, 3점 난도 장치, 생성 주의점 | 기출 전수 + 교과서 요약을 분석해 작성 (원문 문장은 담지 않음) |

## 파이프라인

1. **플래너** (`generative-item-planner.ts`, 결정론적·seeded)
   단원 배분 → 응답 형식 쿼터(보기형/문장형/용어형/짝짓기 표) → 부정 발문(시험당 ≤2) →
   정답 위치(기출 분포, 같은 번호 3연속 금지) → 보기형이면 ①~⑤ 조합 세트와 **참 보기 집합** →
   발문 어미·도입, 자료 장르·블록 구성, 개념·혼동 개념, 거짓 진술 기법, 배점, 길이 목표, 소재 다양화.
2. **생성** (`generative-item-prompt.ts`) Gemini가 strict JSON schema로 단서 설계 → 제시문 블록 → 발문 →
   진술/선지 → 해설을 쓴다. 정답 위치와 각 보기의 참/거짓은 서버가 지정한 값이다.
3. **결정론 검증·조립** (`generative-item-assembler.ts`) 발문 어미, 블록 구성, 표 모양, 대화 화자,
   길이(기출 분포 기준), 정답 용어 노출, 참/거짓 계획 일치, 선지 중복·길이 단서, 해설 완결성을 검사하고
   `TPL_SOURCE_BLOCKS`(실제 시험지와 같은 text/table/dialogue 블록) 문항으로 조립한다.
4. **블라인드 풀이** 정답을 모르는 검토 모델이 학생 화면 그대로 풀어 의도 정답과 일치하고
   모호성·교과 오류가 없을 때만 채택. 실패 사유는 다음 시도의 수정 지시로 들어가고, 3번째 시도는
   개념·자료를 바꾼 대체 명세로 다시 출제한다.
5. 중복(지문 3-gram 유사도, 이전 시험 fingerprint) 제거 후 저장. lineage `generationPath: 'ai_generative'`.

## 단원 특징 문항 (`calculation/`)

LLM이 자주 틀리는 계산·판정형 기출 유형은 서버가 자료 표·[조건]과 정답이 갈리는 진술·수치를 규칙으로
확정하고, LLM은 배경 서술과 나머지 보기·선지만 쓴다(`applyCalculationPlan`이 모델 출력을 덮어씀).

| 모듈 | 단원 | 내용 |
|---|---|---|
| `process-calculation` | 공일 7 | 선행 작업표 → 가장 긴 경로, 공정 개선 단축 시간, 근무 시간 내 생산 개수 |
| `inventory-calculation` | 공일 7·10 | 부품 비용·최대 생산 수량·주문 시점, ABC 등급 가짓수·연간 주문 금액 |
| `quality-calculation` | 공일 8·11 | 6시그마 허용 불량(3.4 × N백만)·PPM, 파레토 누적 비율·불량률 |
| `safety-calculation` | 공일 14 | 중대 재해 경계 판정, 재해율, 하인리히 1:29:300 |
| `labor-calculation` | 성직 15·16 | 주휴·연장·연차·퇴직금 |
| `labor-rights-calculation` | 성직 16 | 부당 해고 구제 기한·해고 예고·서면 통지, 야간 근로 시간·가산 수당 |
| `employment-insurance-calculation` | 성직 17 | 소정급여일수 표, 조기 재취업 수당, 자발적 이직 |

형식은 슬롯의 응답 형식에 따라 정해진다: `<보기>`형 → 계산 진술(참 1·거짓 1), 단일 선지형 → 정답·오답 선지 1개씩,
공업 일반 "옳은 것은?" → 서버 발문 + 오름차순 수치 선지 5개. 단원별 비율은 `signature-registry.ts`의 `shares`.
새 유형은 `CalculationScenario`를 돌려주는 함수를 만들어 등록부에 추가하고, 기출 정답을 재현하는 테스트를 붙인다.

## 설정

- `ENABLE_AI_GENERATIVE_GENERATION=true` — 기능 활성화
- `AI_GENERATION_MODEL` (기본 `gemini-3.8-flash`), `AI_VERIFICATION_MODEL` (검토만 다른 모델로 교차 검증)
- `GEMINI_API_KEY` (+ `GEMINI_API_KEY2..10` 라운드로빈), `GEMINI_REASONING_EFFORT` (low/medium/high)
- `AI_GENERATIVE_CONCURRENCY` (기본 4), `AI_GENERATIVE_PROVIDER_RETRIES` (429/5xx 백오프, 기본 4),
  `AI_GENERATIVE_JOB_TIMEOUT_MS` (기본 900000)

## 확인

```bash
npm run smoke:generative -- --subject kongil --start 11 --end 13 --count 3 --difficulty HIGH
npx jest src/exams/generative
```
