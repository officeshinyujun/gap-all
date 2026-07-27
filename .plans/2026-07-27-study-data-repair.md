# 성직/공일 Study 데이터 복구 (Frontend-Used Only) ✅ 완료

## Goal

프론트엔드에서 실제로 소비하는 데이터의 오류만 수리한다.

## Verification Results

| Check | Result |
|-------|:------:|
| 공일 개념 20개 파일 모두 `concepts.length > 0` | ✅ |
| 성직 개념 20개 파일 모두 `concepts.length > 0` | ✅ |
| 공일 Unit_15 `[cite:N]` 아티팩트 없음 | ✅ |
| 성직 Unit_08 중복 개념 없음 (11 unique) | ✅ |
| sungjik_structured 20개 파일 (1-20단원) | ✅ |
| kongil_structured 20개 파일 (1-20단원) | ✅ |
| 2025_수능 parsed file (20 questions, 27KB) | ✅ |

---

## Phases

### Phase 1: 단순 텍스트 수정 ✅

- [x] **1.1** `textbook/concepts/kongil/Unit_15.json`: `[cite: 4]` 제거
- [x] **1.2** `textbook/concepts/sungjik/Unit_08.json`: 중복 `"기술 능력"` 제거

### Phase 2: 공일 빈 개념 파일 → LLM 개념 추출 ✅

12개 단원(5,6,7,9,10,12,13,14,16,17,18,19)의 `concepts: []` 채우기.
- [x] `textbook/kongil/Unit_*.txt` 교과서 원문 → gpt-4o-mini 12회 호출
- [x] 결과: 각 8~17개 개념 추출, `textbook/concepts/kongil/Unit_*.json` 저장

### Phase 3: Structured Concept 11-20단원 생성 ✅

- [x] summation MD → gpt-4o-mini 20회 호출 (sungjik 10 + kongil 10)
- [x] 결과: 각 3~6 sections, `textbook/{sungjik,kongil}_structured/` 저장

### Phase 4: 2025_수능 기출 파싱 ✅

- [x] 기존 `_step1_questions.json`에 2025_수능 20문항 데이터 존재 → 변환 저장
- [x] `textbook/parsed/sungjik/moi/2025_수능.json` (20 questions, 27,722 bytes)

### Phase 5: Cache count=20 — Skip

프론트엔드에서 count=20 미사용 (`count=10`만 하드코딩). Skip.
