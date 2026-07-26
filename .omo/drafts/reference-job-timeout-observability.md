---
slug: reference-job-timeout-observability
status: drafting
intent: clear
review_required: true
plan_path: .omo/plans/reference-job-timeout-observability.md
plan_sha256: null
review_round_id: null
pending-action: write and review .omo/plans/reference-job-timeout-observability.md
review:
  momus:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/reference-job-timeout-observability.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  independent:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/reference-job-timeout-observability.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
approach: propagate safe stage progress through the reference pipeline, impose an end-to-end generation deadline with stage-bounded retries, isolate post-commit notification failure, and preserve atomic no-write outcomes for every terminal failure.
---

# Draft: reference-job-timeout-observability

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| progress | Receipt advances from selection through planner and final batches without source metadata | active | backend/src/exams/exams.service.ts:515; backend/src/exams/reference-frame-generation.service.ts:165 |
| time-budget | Each provider call obeys a single job deadline and returns a typed terminal code | active | backend/src/exams/reference-frame-generation.service.ts:264; backend/src/exams/reference-frame-planner.service.ts:198 |
| persistence | No cache, question, exam, or item is committed unless exact count succeeds | active | backend/src/exams/exams.service.ts:538; backend/src/exams/exams.persistence.spec.ts:143 |
| public-contract | Job receipts expose stage/counts/codes but never source IDs, prompts, prose, or raw provider errors | active | backend/src/exams/exam-generation-jobs.service.ts:29; backend/src/exams/exams.service.ts:35 |
| durable-jobs | Persisted queue/worker recovery is intentionally deferred | deferred | backend/src/exams/exam-generation-jobs.service.ts:60 |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| latency target | Default a reference job to a configurable 6-minute total deadline | Bounds user wait while allowing one 180-second planner call plus final validation | yes |
| retry policy | Default planner to one retry per stage and final batch to one retry, both bounded by remaining job time | Avoids multiplying 180-second waits across nested retries | yes |
| progress surface | Reuse the existing job receipt and progress log; no new SSE/WebSocket endpoint | Existing polling API already owns public job state | yes |
| cache behavior | Stage cache candidates are buffered and committed only with the successful exam transaction | Matches exact-count/no-partial-write contract | yes |

## Findings (cited - path:lines)
1. A real authenticated `industry` unit-15 reference job for 10 questions was accepted, stayed at `running/5%/starting`, and failed after about four minutes with `EXAM_GENERATION_FAILED`.
2. `runJob()` calls `start()` and then awaits `createWithProgress()`; reference generation receives no progress reporter because `createReferenceFrameExam()` calls `generate()` without one. `backend/src/exams/exams.service.ts:515`, `backend/src/exams/exams.service.ts:538`.
3. Reference planner construction permits `maxAttempts: 3` with `timeoutMs: 180000`; final generation has separate retry/timeout behavior. `backend/src/exams/reference-frame-generation.service.ts:264`, `backend/src/exams/exam-regenerator.service.ts:508`.
4. The final five-question batching occurs after planning/frame construction, so it cannot cap earlier planner latency. `backend/src/exams/reference-frame-generation.service.ts:165`.
5. Public receipts already whitelist status/progress/stage/errorCode/shortfall, providing the safe extension point for typed stage failures. `backend/src/exams/exam-generation-jobs.service.ts:29`.
6. `runJob()` marks a job complete before notification delivery, but an outer catch can still mark it failed if notification delivery throws. `backend/src/exams/exams.service.ts:515`.

## Decisions (with rationale)
1. Treat progress propagation, total deadline, safe typed errors, and atomic persistence as one change set; each is required to prevent a repeat of the observed opaque four-minute failure.
2. Do not lower only `OPENAI_TIMEOUT_MS`: it would reduce the symptom but leave nested retry multiplication and ambiguous receipts.
3. Do not put provider calls inside a database transaction: long network waits would hold transaction resources.
4. Defer durable queue/worker infrastructure: it does not address the immediate timeout observability defect and broadens scope materially.
5. Use TDD: add focused failing tests before each progress, deadline, receipt, and atomic-persistence behavior change.
6. A global deadline is distinct from candidate-level planner rejection; it aborts in-flight provider work, prevents persistence, and maps to one sanitized terminal receipt code.
7. A job completes before notification delivery; notification failure must be logged rather than transition an already committed job to failed.

## Scope IN
- `ExamsService`, job receipt/progress types, reference frame generation, planner model client, final reference batch generation, and focused tests.
- End-to-end manual QA for the authenticated industry unit-15/10-question reference flow.
- Cache mutations staged until the exact-count exam transaction commits; notification failure isolation after job completion.

## Scope OUT (Must NOT have)
- Frontend changes, corpus mutation, migrations, model/prompt rewrites, queue infrastructure replacement, public disclosure of source/provider internals, changed selection order/replacement policy, changed fidelity validators, or incremental/partial exam persistence.

## Open questions
- Test strategy is TDD. No blocking owner decisions remain.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
