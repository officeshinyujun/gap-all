# 로컬/Cloud 환경별 스터디 데이터 조회 전환

## Goal

`DB_PROVIDER=local`에서도 교과서 개념·요약·빈도·퀴즈 캐시를 로컬 PostgreSQL에서 조회한다.

## In scope

- [x] 로컬 교과 데이터 6개 테이블을 생성하고 `textbook/` 파일을 `DATABASE_LOCAL_URL`에 idempotent seed한다.
- [x] `TextbookService`의 concepts, units, summation 조회를 provider-aware SQL/Supabase 분기로 만든다.
- [x] `StudyService.getFrequencyConcept()`의 로컬 조회 및 concept card 필드 변환을 수정한다.
- [x] 빈칸·개념 페어의 로컬 `quiz_cache` 읽기/쓰기를 지원하고 데이터 없음·AI 실패 응답을 구분한다.
- [x] 개발 환경의 비 HTTP 오류 메시지와 stack 로그를 정리한다.

## Verification

- [ ] `npm run typecheck` — 실패: 기존 spec의 stale mock/entity 타입 오류 82건. 이번 production source 오류는 수정했고 `npm run build`는 통과.
- [x] 관련 Jest 테스트 — `npx jest src/study/local-study-data.spec.ts --runInBand` (3 passed)
- [x] `npm run seed:textbook:local` — sungjik/kongil 20단원 및 각 40개 quiz cache seed 완료
- [x] JWT 포함 로컬 API 호출: concepts 200 (6 concepts), success/industry frequency-concept 200 (각 5/6 cards), blank/concept-pairs 200 cache hit. `sungjik/1/count=10` cache 각 10개도 DB로 확인.
