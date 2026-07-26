# Todo 5 Evidence

Date: 2026-07-24

## Changed Paths
- `backend/src/exams/reference-frame-generation.service.ts`
- `backend/src/exams/reference-frame-generation.service.spec.ts`
- `backend/src/exams/exams.service.ts`
- `backend/src/exams/reference-frame-cache.persistence.spec.ts`

## Persistence Boundary
- Reference planning preserves the existing cache key (`sourceId`/`sourceHash`), model, contract version, archetype fingerprint, frame payload, and existing row id when producing a staged mutation.
- Accepted generated drafts carry staged cache mutations; generation does not call cache `save()`.
- Exact-count reference exam persistence saves staged mutations only through `manager.getRepository(ReferenceFrameCache)` inside the existing exam transaction.
- Cache writes remain outside the transaction for the independent warm-up path; no migration, deadline, receipt, frontend, or prompt behavior changed.

## Focused Verification
```sh
npm test -- --runInBand src/exams/reference-frame-cache.persistence.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/exams.persistence.spec.ts
```

Observed result: 3 suites and 32 tests passed.

The persistence suite proves:
- 9/10 shortfall writes no cache, question, exam, or item rows.
- Planner and final-generator timeouts open no transaction and write no cache rows.
- 10/10 success writes all staged cache rows and exam rows in one transaction with unchanged cache payload/version fields.
- A later item-write failure rolls back cache, question, exam, and item state.
- A concurrent cache unique-key conflict rolls back all exam-side state and preserves the conflict failure.

```sh
npm run typecheck
```

Observed result: `tsc --noEmit --project tsconfig.eslint.json` exited 0.

```sh
npx prettier --check src/exams/reference-frame-cache.persistence.spec.ts
git diff --check -- backend/src/exams/exams.service.ts
```

Observed result: both checks exited 0.

## Tooling Note
TypeScript LSP diagnostics were unavailable because the server is not installed and installation was previously declined. Backend typecheck is the available static gate.
