# Todo 17 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/exams/exams.controller.spec.ts`
- `backend/src/exams/exams.service.spec.ts`

## Verification
- PASS: `npm test -- --runInBand exams.controller.spec.ts exams.service.spec.ts`; 2 tests passed.
- PASS: `npm run typecheck` from `backend`.
- `POST /exams` controller contract delegates user id and unchanged DTO to service.
- `POST /exams/jobs` controller contract delegates user id and unchanged DTO to job service and returns stable job status DTO.
- Explicit AI service path remains generator plus `ExamRecord` creation.

## Cleanup
- No server, provider, database, corpus file, process, or temporary resource was used.
