# Todo 14 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/exams/reference-generation-usage.ts`
- `backend/src/exams/reference-generation-usage.spec.ts`

## Verification
- PASS: `npm test -- --runInBand reference-generation-usage.spec.ts`; 1 test passed.
- PASS: `npm run typecheck` from `backend`.
- Each attempt records run/stage/batch/model/retry/request-byte/token metadata only.
- Missing provider usage is represented by null token fields; no prompt/reference field exists in the telemetry contract.
- Duplicate attempt key is de-duplicated.

## Cleanup
- No provider, database, corpus file, process, or temporary resource was used.
