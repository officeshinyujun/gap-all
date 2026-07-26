# Task 2 Deadline Contract Evidence

Date: 2026-07-24

Command:

```sh
npm --prefix backend test -- --runInBand reference-job-deadline.spec.ts reference-blueprint-planner.retry.spec.ts reference-blueprint-planner.service.spec.ts reference-frame-planner.service.spec.ts
```

Observed result: 4 suites and 15 tests passed.

Controlled-clock/client evidence from `reference-job-deadline.spec.ts`:

- An already expired planner deadline rejected with `ReferenceJobDeadlineExceededError` before the provider callback ran.
- Planner, final-generator, and semantic-verifier stage calls each received a 100 ms budget from a 500 ms configured timeout when only 100 ms remained. Advancing the controlled clock aborted the client and produced the same typed deadline error with the stage recorded.
- A provider that ignored `AbortSignal` and later resolved still caused `runProviderCall` to reject with `ReferenceJobDeadlineExceededError` at the absolute deadline. Both controlled-clock timers were cleared after rejection.
- `waitForRetry` alone rejects with `ReferenceJobDeadlineExceededError` when its delay exceeds the remaining deadline budget. This test does not assert planner retry-delay behavior.
- Two deadline instances sharing one clock remained isolated: the job expiring at 100 ms made no call, while the independent 200 ms job completed with its own remaining 100 ms provider budget.

Additional characterization evidence from `reference-blueprint-planner.retry.spec.ts`:

- HTTP 408, 429, and 503 each retried exactly once with `maxAttempts: 2`.
- HTTP 400 remained non-retryable and made exactly one provider call.
