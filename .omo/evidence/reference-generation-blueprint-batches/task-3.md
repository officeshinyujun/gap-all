# Todo 3 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/entities/reference-question.entity.ts`
- `backend/src/exams/reference-question-catalog.ts`
- `backend/src/exams/reference-question-catalog.spec.ts`
- `backend/src/migrations/1721210800000-CreateReferenceQuestions.ts`
- `backend/src/app.module.ts`

## Contract
- `reference_questions` is distinct from `questions` and contains logical source id, content hash, subject/unit, provenance path, parse version, and immutable JSON source payload.
- The database enforces unique logical source identity and a logical-source/content-hash unique pair.
- The fixture catalog returns `inserted` for a new source, `existing` for identical content, and `version_conflict` for changed content with the same logical source id.

## Verification
- PASS: `npm test -- --runInBand reference-question-catalog.spec.ts`; 2 tests passed.
- PASS: `npm run typecheck` from `backend`.
- PASS: direct ts-node catalog invocation emitted `["inserted","existing","version_conflict"]`.
- TypeScript LSP unavailable; backend typecheck passed.

## Cleanup
- No database connection, migration execution, provider call, source JSON mutation, process, or temporary file was created.
