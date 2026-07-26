---
slug: reference-generation-deadline-recovery
status: drafting
intent: unclear
review_required: true
plan_path: .omo/plans/reference-generation-deadline-recovery.md
plan_sha256: null
review_round_id: null
pending-action: write and review .omo/plans/reference-generation-deadline-recovery.md
review:
  momus:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/reference-generation-deadline-recovery.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  independent:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/reference-generation-deadline-recovery.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
approach: Preserve planner/fidelity acceptance rules while adding failure-specific correction prompts, bounded replacement-candidate work, and truthful terminal shortfall telemetry before the existing absolute deadline.
---

# Draft: reference-generation-deadline-recovery

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| retry-instruction | Planner retains a regression-protected actionable correction for structural failures | active | backend/src/exams/reference-frame-planner.prompts.ts:12 |
| candidate-budget | Replacement scan stops predictably before exhausting the whole job deadline | active | backend/src/exams/reference-frame-generation.service.ts:443 |
| fidelity-retry | Deterministic copy-policy rejection retries only when its correction can change output | active | backend/src/exams/exam-regenerator.service.ts:668 |
| terminal-receipts | Failed jobs report safe stage/count diagnostics distinguishing timeout from bounded shortfall | active | backend/src/exams/exams.service.ts:43 |
| deadline-admission | Provider calls start only when remaining budget can cover their configured stage minimum | active | backend/src/exams/reference-job-deadline.ts:55 |
| failure-fingerprint | Repeated identical candidate/stage/reason failures stop consuming retries and advance replacement | active | backend/src/exams/reference-frame-generation.service.ts:443 |
| regression-coverage | Tests prove bounded work, unchanged quality gates, and safe receipts | active | backend/src/exams/reference-frame-generation.service.spec.ts |

## Open assumptions (announced defaults)
<!-- Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Candidate replacement budget | At most `questionCount + replacementAllowance` candidates, with a tested configured allowance | Avoids serially spending the entire job deadline on repeatedly invalid candidates; no accepted-output quality rule changes | yes |
| Planner correction | Retain and characterize the required choice-role/evidence cardinality correction for `UNREFERENCED_BLUEPRINT_ROLE` | The correction is already present and needs regression protection, not a second rewrite | yes |
| Fidelity retry | Retain copy/semantic checks, but do not repeat an identical deterministic correction beyond its existing bounded retry count | Repeating known-invalid output consumes budget without improving accepted quality | yes |
| Terminal result | Return existing shortfall code/counts when the candidate budget is exhausted, reserving timeout for actual time exhaustion | Makes job outcomes actionable and truthful | yes |
| Deadline admission | Do not begin a planner/final/semantic provider call when remaining job time is below that stage's useful minimum | Prevents an invocation that can only end in timeout and preserves time for a viable next stage | yes |
| Failure fingerprint | Track only stable internal `(candidate, stage, reason)` fingerprints for the active job and skip identical exhausted failures | Stops repeated prompts from spending the budget; never persists or exposes source content | yes |

## Findings (cited - path:lines)

- `ReferenceJobDeadline` is created once at job start with a six-minute default and all planner/final calls consume its remaining budget: `backend/src/exams/exams.service.ts:40`, `backend/src/exams/exams.service.ts:541`.
- Planner retries frame and payload stages up to its configured maximum; `UNREFERENCED_BLUEPRINT_ROLE` now receives a choice-role/evidence-specific correction that needs characterization coverage: `backend/src/exams/reference-frame-planner.service.ts:198`, `backend/src/exams/reference-frame-planner.prompts.ts:38`.
- The generation loop requests all eligible references and serially continues on planner/final rejection without an independent candidate cap: `backend/src/exams/reference-frame-generation.service.ts:221`, `backend/src/exams/reference-frame-generation.service.ts:443`.
- Final generation retries a singleton deterministic rejection up to two additional times, including `VERBATIM_SOURCE_SEGMENT`: `backend/src/exams/exam-regenerator.service.ts:668`.
- The deadline currently bounds a provider call by remaining milliseconds but does not distinguish a useful call from one that has too little time left to complete: `backend/src/exams/reference-job-deadline.ts:55`.
- Live log shows exactly these rejection modes, then terminal `REFERENCE_GENERATION_TIMEOUT`: `/private/tmp/gap-backend-start.log:17407`, `/private/tmp/gap-backend-start.log:17431`.

## Decisions (with rationale)

- Keep all fidelity, copy-policy, semantic, selection, and exact-count acceptance rules unchanged. The problem is budget allocation and feedback specificity, not weak validation.
- Prefer a bounded shortfall over a six-minute timeout when repeated candidates have already demonstrated they cannot satisfy the contract.
- Surface only stable codes, stage counts, and progress; never expose source/provider/validation details in public receipts.
- Introduce deadline admission and ephemeral failure fingerprints at the job boundary, not in cache/corpus data, so recovery behavior remains deterministic and privacy-safe.
- Candidate-attempt accounting counts candidates that reach planner work; catalog-ineligible and deadline-admission-skipped records are stage counters but do not consume the replacement cap. The cap is validated as a non-negative configured allowance and cannot be lower than `questionCount`.
- Internal candidate outcomes must retain only stable stage/reason identifiers until receipt projection, so fingerprints and counts never require raw source or provider output.

## Scope IN

- Planner retry correction characterization for incomplete role mappings.
- Configurable bounded candidate replacement work and stage counters.
- Stage minimum-budget admission and ephemeral repeated-failure suppression.
- Deterministic retry policy characterization for final-generation validation failures.
- Backend tests for budget exhaustion, unchanged quality contracts, and safe terminal receipts.
- Transaction regression proving bounded shortfall writes no cache, question, exam, or item rows.

## Scope OUT (Must NOT have)

- Relaxing `VERBATIM_SOURCE_SEGMENT`, semantic validation, or exact-count acceptance.
- Increasing the global deadline as the primary fix.
- Frontend redesign, migration, corpus mutation, or prompt/model replacement.
- Persisting failure fingerprints or invalid reference frames.
- Changing the final five-question chunk size.
- Increasing provider/model retries to mask the root cause.

## Open questions

- None. All implementation choices above are reversible defaults.

## Approval gate
status: approved-for-plan-generation
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
