# reference-job-timeout-observability - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Reference exam jobs report truthful progress, end within a bounded time, and return a safe reason when planning or final generation cannot complete. Successful exams retain the current quality gates; failed runs persist no partial exam or cache data.

**Why this approach:** Add observability and timeout control around the existing quality pipeline rather than changing prompts, models, selection, or fidelity validation. One job-wide deadline prevents nested retries from turning into opaque waits.

**What it will NOT do:** It will not redesign the frontend, mutate the reference corpus, change models/prompts/fidelity rules, create partial exams, or replace the in-memory job service with queue infrastructure.

**Effort:** Medium
**Risk:** Medium - timeout propagation and transaction boundaries span generation, job, and persistence layers.
**Decisions to sanity-check:** default six-minute generation deadline; preserve existing planner/final retry counts, but never begin or retry provider work after deadline exhaustion; cache writes are atomic with a successful exam.

Your next move: execute this approved plan. Full execution detail follows below.

---

> TL;DR (machine): Medium risk; preserve reference quality while adding progress, bounded deadlines, typed failures, and atomic persistence.

## Scope
### Must have
- A safe, monotonic reference-generation progress contract from selection through persistence.
- One configurable, end-to-end deadline propagated through planner and final generation retries.
- Typed, redacted timeout/failure receipts and isolated notification failure.
- No writes for cache, Question, ExamRecord, or ExamItem until exact-count success.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not change reference planner/final prompts, model selection, schemas, temperatures, selection order, replacement policy, fidelity validators, or acceptance criteria.
- Do not add a frontend surface, migration, corpus mutation, queue/worker rewrite, or partial/best-effort persistence.
- Do not expose source IDs, source prose, prompts, raw provider responses, or raw provider errors in job receipts/logs.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Jest/Nest focused specs; preserve existing behavior with characterization tests first.
- Evidence: `.omo/evidence/reference-job-timeout-observability/task-<N>.md`.
- Manual QA: authenticated `POST /exams/jobs` for `industry`, unit 15, `questionCount: 10`, followed by `GET /exams/jobs/:jobId` polling; terminal receipt and database-row checks decide pass/fail.

## Execution strategy
### Parallel execution waves
Wave 1: progress contract and deadline primitives in parallel. Wave 2: generation boundary propagation, cache staging, and job failure mapping after Wave 1. Wave 3: integration/persistence/manual QA after Wave 2.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 3, 4, 5 | 2 |
| 2 | none | 3, 4 | 1 |
| 3 | 1, 2 | 5, 6 | none |
| 4 | 1, 2 | 6 | none |
| 5 | 3 | 6 | none |
| 6 | 3, 4, 5 | F1-F4 | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Add a redacted monotonic reference-job progress contract
  What to do / Must NOT do: Characterize current 5% reference receipt behavior, then extend `ExamGenerationProgressUpdate` and job receipt/log types with safe stage, completed, total, attempt, and maxAttempts fields. Centralize monotonic weighted progress updates; do not include source/provider material or change quality logic.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 3, 4, 5.
  References: `backend/src/exams/exam-generation.utils.ts`, `backend/src/exams/exam-generation-jobs.service.ts:29-167`, `backend/src/exams/exams.service.ts:515-535`, existing job/persistence specs.
  Acceptance criteria: focused Jest proves progress never decreases, receipt remains allowlisted, and a failed job retains last truthful stage; `npm --prefix backend run typecheck` passes.
  QA scenarios: happy: call authenticated `POST /exams/jobs` then `GET /exams/jobs/:jobId`, observe safe `stage/progress`; failure: inject planner failure and assert no source ID/prose in receipt. Evidence `.omo/evidence/reference-job-timeout-observability/task-1.md`.
  Commit: Y | feat(exams): expose safe reference job progress
- [x] 2. Introduce a job-wide deadline and stage-bounded provider timeout API
  What to do / Must NOT do: Add an injectable absolute deadline fixed at job start. Before every planner frame/payload call, final-generation call, semantic-verifier call, and retry delay, derive remaining budget; pass it as the per-call timeout and throw one typed global-deadline error when exhausted. Preserve current retry counts and retryable/non-retryable provider classification; do not reinterpret a global abort as candidate rejection, planner exhaustion, or a replacement opportunity.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 3, 4.
  References: `backend/src/exams/reference-frame-generation.service.ts:165-270`, `backend/src/exams/reference-frame-planner.service.ts:90-250`, `backend/src/exams/reference-frame-planner.model-client.ts:23-90`, `backend/src/exams/exam-regenerator.service.ts:508`.
  Acceptance criteria: fake-clock tests cover 408/429/5xx retry behavior, non-retryable 400 behavior, existing retry cardinalities, expiry during planner/final/verifier calls, and expiry between retries. No call receives a timeout beyond remaining budget; a global deadline stops candidate iteration and surfaces one terminal deadline code rather than a shortfall; `npm --prefix backend run typecheck` passes.
  QA scenarios: happy: controlled clock accepts an in-budget planner/final run; failure: abort-controlled client reaches `REFERENCE_GENERATION_TIMEOUT` within configured budget. Evidence `.omo/evidence/reference-job-timeout-observability/task-2.md`.
  Commit: Y | feat(reference): bound generation by job deadline
- [x] 3. Thread progress and deadline through reference selection, planner, and final batches
  What to do / Must NOT do: Thread the reporter and absolute deadline through reference selection, planner frame/payload stages, final batch regeneration, semantic verification, retry delays, and candidate iteration. Emit milestones only after corresponding work settles; once deadline error occurs, emit no later milestone and do not continue replacement candidates. Do not alter final five-question chunk size or reference quality checks.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 5, 6.
  References: `backend/src/exams/exams.service.ts:515-675`, `backend/src/exams/reference-frame-generation.service.ts:165-450`, `backend/src/exams/reference-frame-planner.service.ts:90-250`, `backend/src/exams/exam-regenerator.service.ts:508`.
  Acceptance criteria: TDD service tests prove unit-15/10 candidate flow advances beyond 5%, progress is monotonic, planner/final retries are visible without sensitive details, and success reaches persistence only after final validation.
  QA scenarios: happy: authenticated industry unit-15 job receipt shows planner/final milestones; failure: controlled planner timeout yields a terminal safe code and no later milestone. Evidence `.omo/evidence/reference-job-timeout-observability/task-3.md`.
  Commit: Y | feat(reference): report planner and final stage progress
- [x] 4. Map reference deadline/failure outcomes into safe terminal job receipts
  What to do / Must NOT do: Extend `jobFailure()` and synchronous failure mapping to preserve stable redacted codes/stage/counts for planner timeout, final timeout, and global deadline. Create `backend/src/exams/exam-generation-jobs.service.spec.ts` for public receipt allowlist/monotonic-stage behavior and add notification-isolation cases to `backend/src/exams/exams.service.spec.ts`. After `complete()` sets terminal receipt, invoke the entire notification operation in an isolated catch/log boundary so notification-row creation, push delivery, or notification-service failure cannot reach `runJob()` outer handler or change the completed receipt.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 6.
  References: `backend/src/exams/exams.service.ts:35-110,230-245,515-535`, `backend/src/exams/exam-generation-jobs.service.ts:13-40,149-180`, notification service call at `backend/src/notifications/notifications.service.ts:130`.
  Acceptance criteria: tests prove each timeout maps to its safe public code/stage and receipts omit source/provider data. Inject rejection from notification creation and push delivery after `complete()`; both retain `completed`, progress `100`, and `examId` while emitting an operational log.
  QA scenarios: happy: completed receipt has 100%/examId; failure: injected notification failure is logged while receipt remains completed, injected deadline yields failed safe receipt. Evidence `.omo/evidence/reference-job-timeout-observability/task-4.md`.
  Commit: Y | fix(exams): preserve safe reference job terminal states
- [x] 5. Stage reference-frame cache mutations until exact-count transaction commit
  What to do / Must NOT do: Return cache mutation candidates with generated drafts without calling cache repository during generation. After exact-count final validation, persist candidates through `manager.getRepository(ReferenceFrameCache)` inside existing exam transaction alongside units, questions, exam, and items. Preserve cache keys, conflict behavior, version, frame payload, and reuse semantics; do not use injected global cache repository inside transaction.
  Parallelization: Wave 2 | Blocked by: 1, 3 | Blocks: 6.
  References: `backend/src/exams/reference-frame-generation.service.ts:341`, `backend/src/exams/exams.service.ts:564-650`, `backend/src/entities/reference-frame-cache.entity.ts`, `backend/src/exams/exams.persistence.spec.ts:143`.
  Acceptance criteria: failing-first persistence tests prove 9/10, planner timeout, and final timeout invoke zero cache/question/exam/item writes; 10/10 success commits unchanged cache payload/version plus exam rows atomically. A transaction failure after cache staging and concurrent unique-key cache conflict must roll back cache/unit/question/exam/item rows.
  QA scenarios: happy: instrumented repository observes one successful transaction containing cache and exam records; failure: force final rejection after planner success and observe zero writes. Evidence `.omo/evidence/reference-job-timeout-observability/task-5.md`.
  Commit: Y | fix(reference): atomically persist frame cache with exam
- [x] 6. Add end-to-end regression coverage and run authenticated unit-15 release QA
  What to do / Must NOT do: Assemble service/persistence/job regressions and add a dedicated authenticated local QA script that submits a `industry` unit-15, 10-question reference job, polls at fixed 10-second intervals until configured deadline plus 30 seconds, queries created exam/question/item/cache row counts by receipt `examId`, and removes all QA-created rows. Add characterization fixtures that compare planner frame/payload and final-generation/semantic-verifier request contracts against a fixed baseline: model, messages, schema/format, temperature, retry corrections, selection order, and fidelity inputs. Timeout plumbing may alter only abort/timeout control, not payloads or acceptance decisions.
  Parallelization: Wave 3 | Blocked by: 3, 4, 5 | Blocks: F1-F4.
  References: `backend/src/exams/reference-frame-generation.service.spec.ts`, `backend/src/exams/exams.persistence.spec.ts`, `backend/src/exams/exam-generation-jobs.service.ts`, `backend/scripts/reference-live-qa.ts`, live endpoint `POST /exams/jobs` / `GET /exams/jobs/:jobId`.
  Acceptance criteria: all focused suites, typecheck, build, and preflight pass; contract-characterization baseline is byte-for-byte unchanged; live job either completes 10/10 with valid receipt or returns typed stage-specific failure by deadline; database-count and cleanup receipts are captured.
  QA scenarios: happy: invoke new 10-question QA script and verify `completed/100/examId`, 10 items, and cleanup; failure: configured fake provider timeout returns terminal code with zero cache/question/exam/item rows. Evidence `.omo/evidence/reference-job-timeout-observability/task-6.md`.
  Commit: Y | test(reference): cover timeout observability release flow

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [~] F1. Plan compliance audit
  Run `git diff --check` and inspect task-owned paths; PASS only when no frontend, migrations, corpus data, prompts/models, selection/fidelity rules, or queue infrastructure changed.
- [x] F2. Code quality and timeout-contract audit
  Run `npm --prefix backend run typecheck && npm --prefix backend run lint`; inspect all public receipt/log allowlists, remaining-budget propagation into planner/final/verifier/retry delay, and notification isolation. PASS only when no raw source/provider material is reachable publicly.
- [~] F3. Real manual QA
  Run catalog preflight then the dedicated authenticated industry unit-15/10 QA script; PASS only for `completed/100/examId` plus 10 items or typed terminal failure within deadline plus zero cache/question/exam/item rows; require cleanup output.
- [~] F4. Persistence and quality-fidelity audit
  Run `npm --prefix backend test -- --runInBand src/exams/reference-frame-generation.service.spec.ts src/exams/reference-frame-planner.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts src/exams/exams.persistence.spec.ts src/exams/exam-generation-jobs.service.spec.ts src/exams/exams.service.spec.ts`; PASS only when characterization asserts unchanged model/messages/schema/temperature/retry-correction/selection/fidelity inputs and persistence asserts zero cache/question/exam/item writes for deadline/shortfall plus atomic success writes.

## Commit strategy
- Keep commits in todo order; stage only plan-owned backend/spec/script files. Do not include unrelated dirty worktree changes.

## Success criteria
- Reference jobs never remain at 5% while planner/final work proceeds; safe monotonic stage progress is visible.
- Every reference job reaches terminal success or a typed safe failure by the configured whole-job deadline.
- Reference question quality contract is byte-for-byte unchanged at prompts/models/schemas/selection/fidelity boundaries.
- Failed/shortfall/deadline runs persist no cache, question, exam, or item records.
- Authenticated industry unit-15 10-question QA has a captured terminal receipt and cleanup evidence.
