# Todo 16 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/exams/reference-generation-budget.ts`
- `backend/src/exams/reference-generation-budget.spec.ts`

## Verification
- PASS: `npm test -- --runInBand reference-generation-budget.spec.ts`; 1 test passed.
- PASS: `npm run typecheck` from `backend`.
- Request counter computes one blueprint plus supplied homogeneous generation chunks: 10-question controlled fixture = 3 requests; 20-question homogeneous fixture = 5 requests.
- Byte total is measured from serialized request strings; provider token values remain unavailable until a real provider response supplies them.

## Cleanup
- No provider, database, corpus file, process, or temporary resource was used.
