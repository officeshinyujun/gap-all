# reference-frame-planner-recovery - Work Plan

## TL;DR (For humans)

**What you'll get:** The Reference Frame planner will recover from the one real model response shape observed in production, while continuing to reject arbitrary malformed model output. A real omitted-`sourceType` job will be validated end-to-end before completion.

**Why this approach:** The selected reference is trusted server-side input. The model's exact echo of that reference can be reconstructed deterministically without relaxing the general JSON contract.

**What it will NOT do:** It will not accept arbitrary unknown fields, change explicit `sourceType: "ai"`, or alter frontend behavior.

**Effort:** Short
**Risk:** Medium - this touches a live AI generation fallback and persistence path.
**Decisions to sanity-check:** Recover only the exact observed selected-reference echo signature; all other invalid Frames remain reason-coded failures.

Your next move: start this plan with `/start-work reference-frame-planner-recovery`. Full execution detail follows below.

---

> TL;DR (machine): Repair planner union narrowing, gate a deterministic trusted-reference echo recovery, and validate a real Reference Frame job plus persistence.

## Scope
### Must have
- Compile-safe discriminated-union handling in `ReferenceFramePlannerService.plan()`.
- A deterministic `ReferenceFrame` only for the exact observed selected-reference echo key set, independent of property order.
- Positive and near-miss rejection tests, followed by typecheck, build, and real authenticated job/DB evidence.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not loosen `validateReferenceFrameJson()` or discard arbitrary unknown fields.
- Do not modify frontend files or explicit `sourceType: "ai"` routing.
- Do not persist a partial exam on a planner/payload failure.

## Verification strategy
- Test decision: TDD with Jest planner fixtures; the current compile failure must be reproduced before its fix is accepted.
- Automated checks: `npm run typecheck -w backend`, focused planner specs, `npm run build -w backend`.
- Real-surface proof: authenticated `POST /exams/jobs` without `sourceType`, then job-status polling and PostgreSQL queries for `exam_records`, `questions.generation_lineage`, and `exam_items`.
- Applicable adversarial classes: malformed model output, stale/partial DB state, misleading passing mocks, external long-running OpenAI request, and dirty worktree scope.

## Execution strategy
### Parallel execution waves
| Wave | Todos | Purpose |
| --- | --- | --- |
| 1 | 1 | Restore compiler correctness and exact fallback semantics with tests. |
| 2 | 2 | Run automated verification and real authenticated backend/DB flow after Todo 1. |
| 3 | 3 | Independently review live evidence and scope before closing the plan. |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | 2, 3 | - |
| 2 | 1 | 3 | - |
| 3 | 2 | Final wave | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
- [x] 1. Repair the Frame-result branch and lock the exact echo-recovery contract with tests.
  What to do / Must NOT do: In `backend/src/exams/reference-frame-planner.service.ts`, split planned/rejected `frameResult` branches before reading rejected-only fields. Keep the strict parser intact. Permit `echoedReferenceFrame()` only if the parsed top-level key set exactly matches the observed selected-reference echo, regardless of JSON property order. Derive source identity, subject, unit range, choice count, material density, and safe fixed structural metadata from the trusted request. In `backend/src/exams/reference-frame-planner.service.spec.ts`, first characterize the current rejection, then add a failing-first exact echo success test plus near-miss key-set, wrong choice count, and arbitrary unknown-field rejection tests.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 2, 3
  References: `backend/src/exams/reference-frame-planner.service.ts:34-110`; `backend/src/exams/reference-frame-planner.types.ts`; `backend/src/exams/reference-frame.frame-validator.ts:61-145`; `backend/src/exams/reference-frame-planner.service.spec.ts`; live failure job `ddcec979-38fe-4dba-9326-7bd285ebb907` with `responseKeys` in `/var/folders/_z/p645ccv91_j_wvxch2jyqmdh0000gn/T/opencode/gap-backend.log`.
  Acceptance criteria: `npm run typecheck -w backend` exits 0; focused planner tests prove exact echo continuation and strict rejection for every near miss; no broad unknown-field filtering is added.
  QA scenarios: happy: Jest fixture returns an order-permuted exact echo followed by valid payload and receives a planned result; failure: a fixture differing by one top-level key receives `REFERENCE_PLANNER_REJECTED` with `UNKNOWN_FIELD`. Evidence `.omo/evidence/reference-frame-planner-recovery/task-1.md`.
  Commit: N | bundled with verification work

- [x] 2. Verify the repaired planner against the running backend and database with a real omitted-sourceType job.
  What to do / Must NOT do: Build and restart the backend with the existing environment. Submit a single authenticated `POST /exams/jobs` request for the known 성직 unit 1 with no `sourceType`; poll until terminal status. If failed, record the exact reason/stage/response keys and prove no partial rows were persisted. If completed, query the persisted exam source type, item count, and question lineage. Do not expose secrets or change database content outside this generated job.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References: `backend/src/exams/exams.service.ts`; `backend/src/exams/reference-frame-generation.service.ts`; `backend/src/entities/question.entity.ts`; `backend/src/migrations/1721210700000-AddQuestionGenerationLineage.ts`; `backend/.env` (read values only, never report them).
  Acceptance criteria: `npm run test -w backend -- --runInBand reference-frame-planner.service.spec.ts reference-frame-planner.validation.spec.ts`, `npm run typecheck -w backend`, and `npm run build -w backend` exit 0. The live job either completes with exact requested count and persisted lineage, or returns a classified provider/planner failure with zero newly persisted partial records.
  QA scenarios: happy: curl job creation/polling reaches `completed`, then SQL confirms `source_type = REFERENCE`, one item, and non-null `generation_lineage`; failure: invalid/malformed planner response produces a failed job and before/after SQL row counts match. Cleanup: terminate only the process started for this verification and record PID/port receipt. Evidence `.omo/evidence/reference-frame-planner-recovery/task-2.md`.
  Commit: N | verification only

- [~] 3. Independently audit the fallback boundary and real-run evidence before closing the recovery. Blocked: live evidence proved a different three-key provider response; strict structured-output enforcement requires the follow-up plan before this audit can close the product recovery.
  What to do / Must NOT do: Review Todo 1 diff, Todo 2 test output, runtime log, job status, and database evidence independently. Confirm all fallback inputs are server-trusted, the exact-key signature is not bypassable by a near miss, explicit AI routing remains untouched, and no partial persistence occurred. Return a confirmed verdict or actionable rejection; do not edit product code during review.
  Parallelization: Wave 3 | Blocked by: 2 | Blocks: Final wave
  References: Todo 1/2 evidence artifacts; `backend/src/exams/reference-frame-planner.service.ts`; `backend/src/exams/exams.service.ts`; `backend/src/exams/exam-generator.service.ts`.
  Acceptance criteria: Independent verifier returns `confirmed`; checks stale state, dirty-worktree scope, malformed external model data, and misleading-success-output explicitly.
  QA scenarios: happy: independently reproduce one focused test and inspect persistence evidence; failure: force or inspect a near-miss fixture and confirm it cannot enter the fallback. Evidence `.omo/evidence/reference-frame-planner-recovery/task-3.md`.
  Commit: N | review only

## Final verification wave
> Run in parallel after all implementation tasks. All four gates must approve.
- [~] F1. Plan compliance audit
- [~] F2. Code quality and strict-contract review
- [~] F3. Real backend job and database evidence review
- [~] F4. Scope fidelity audit for explicit-AI and frontend non-regression

## Commit strategy
- Do not commit unrelated dirty-worktree changes.
- Keep the repair limited to the planner implementation/spec unless verification discovers a directly necessary backend wiring defect.

## Success criteria
- Backend typecheck, focused planner tests, and build pass.
- Only the exact selected-reference echo shape reaches deterministic Frame recovery; all near misses remain rejected.
- A real omitted-`sourceType` job has reproducible terminal evidence and either completed persistence evidence or a classified zero-partial-record failure.
- Explicit `sourceType: "ai"` and frontend files remain unchanged.
