# Task 1 Manual QA

## Invocation

Ran an in-process `ExamGenerationJobsService` with a reference request and a mocked progress callback. The callback supplied a source ID and provider response text in its private update message; the command asserted those values were absent from the serialized receipt.

```text
node -r ts-node/register -e "...service.create(...); service.push(...); console.log(JSON.stringify(receipt, null, 2))"
```

## Sanitized Receipt JSON

```json
{
  "jobId": "af9d7226-258e-4a9f-84a6-65c5498a02e0",
  "status": "pending",
  "progress": 45,
  "stage": "planner",
  "message": "참조 시험 생성 진행 중입니다.",
  "completed": 1,
  "total": 3,
  "attempt": 1,
  "maxAttempts": 3,
  "createdAt": "2026-07-24T09:47:51.304Z",
  "updatedAt": "2026-07-24T09:47:51.304Z"
}
```

The receipt contains no request, logs, source ID, prompt text, or provider response/error content. The focused service spec also verifies lower weighted progress, counters, attempts, stage updates, and late terminal callbacks cannot regress the public receipt.

## Todo 1 Typecheck Repair

Changed `toReceipt` to narrow the local optional `referenceProgress` binding directly instead of relying on a boolean alias. This preserves the allowlisted projection without assertions or placeholder values.

Exact verification commands and results:

```text
npm --prefix backend test -- --runInBand src/exams/exam-generation-jobs.service.spec.ts
PASS: 1 suite, 3 tests

npm --prefix backend test -- --runInBand src/exams/exam-generation-jobs.service.spec.ts
PASS: 1 suite, 3 tests

npm --prefix backend run typecheck
PASS: tsc --noEmit --project tsconfig.eslint.json (exit 0)

lsp_diagnostics backend/src/exams/exam-generation-jobs.service.ts
UNAVAILABLE: TypeScript LSP server is not installed; installation was previously declined.
```

## Independent Review Hardening

- Reference progress logs now use an explicit safe projection and omit caller detail, messages, source/provider content, prompts, and raw errors.
- Reference failures retain the last truthful work stage in the public receipt while status is `failed`; lower-stage updates remain non-regressing.
- `npm --prefix backend test -- --runInBand src/exams/exam-generation-jobs.service.spec.ts`: PASS, 1 suite, 4 tests.
- Repeated the same focused command: PASS, 1 suite, 4 tests.
- `npm --prefix backend run typecheck`: PASS, `tsc --noEmit --project tsconfig.eslint.json` exit 0.
