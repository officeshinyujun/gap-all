# Todo 7 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/exams/reference-blueprint.types.ts`
- `backend/src/exams/reference-batch-chunker.ts`
- `backend/src/exams/reference-batch-chunker.spec.ts`

## Verification
- PASS: `npm test -- --runInBand reference-batch-chunker.spec.ts`; 2 tests passed.
- PASS: `npm run typecheck` from `backend`.
- Ten homogeneous slots become two stable batches of five slots each.
- Different canonical TPLs become separate batches and cannot share a generation request.
- Every generated batch carries stable ordinal, one template, and explicit slot IDs.

## Cleanup
- No provider, database, corpus file, process, or temporary resource was used.
