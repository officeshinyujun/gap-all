# Todo 1 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/exams/reference-generation-metrics.ts`
- `backend/src/exams/reference-generation-metrics.spec.ts`

## Baseline
- Fixture hash: `sha256:68b7d1df85bd36f2be51f28e3975ab029619c1d092af3a1f706b8bc9f4616b22`
- Serialization: `Buffer.byteLength(JSON.stringify(existing builder output), 'utf8')`
- Legacy stage model: one Frame prompt and one Payload prompt per question, plus one regeneration batch prompt: `2N + 1` requests.
- 10 questions: 21 requests, 53,654 bytes.
- 20 questions: 41 requests, 107,124 bytes.

## Verification
- PASS: `npm test -- --runInBand reference-generation-metrics.spec.ts` from `backend`; 2 tests passed.
- PASS: `npm run typecheck` from `backend`.
- PASS: direct no-network manual invocation via `node -r ts-node/register -e`; emitted only fixture hash, serialization label, numeric request counts, and byte totals.
- TypeScript LSP was unavailable because the server is not installed; backend typecheck passed instead.

## Adversarial Checks
- stale_state: two in-process measurements are deeply equal in the focused spec.
- dirty_worktree: only the two Todo 1 backend files were changed; unrelated active-work files were not touched.
- misleading_success_output: test asserts exact call counts and positive byte totals rather than console output.
- flaky_tests: focused Jest suite passed after the added invalid-count test.
- hung/long command: focused Jest and typecheck completed within the 120-second command limit.
- malformed input: zero and fractional question counts throw a typed metrics error before fixture serialization.
- prompt injection, cancel/resume, generated cache, and mid-operation interruption: not applicable; this is deterministic in-process serialization with no external text execution, cache, or long-running operation.

## Cleanup
- No provider client, network connection, process, temporary file, database resource, or server was created.
