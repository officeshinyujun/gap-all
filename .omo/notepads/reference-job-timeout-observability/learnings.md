# Learnings

## 2026-07-24 Task 1

- Reference job receipts now project only fixed messages plus safe stage, weighted progress, completed/total, and attempt/maxAttempts metadata.
- Reference progress and counters are monotonic; stage regressions and callbacks after terminal status are ignored.
- In-process manual QA printed sanitized receipt JSON and asserted source/provider content was absent. Focused Jest and backend typecheck passed.

## 2026-07-24 Task 2

- `ReferenceJobDeadline` is job-local and accepts an absolute `deadlineAtMs` plus an injectable clock, so concurrent jobs share no mutable deadline state.
- `runProviderCall` exposes both an abort signal and the stage-bounded timeout budget. The provider budget is the minimum of the configured stage timeout and remaining job time.
- Planner model-client deadline expiry is intentionally thrown as `ReferenceJobDeadlineExceededError`, not converted into planner rejection or provider classification. Planner retry waits use the same deadline before scheduling another call.
- Final generator and semantic verifier are represented by the reusable stage contract in this task; their existing call sites remain unchanged for the later integration task.
- Final project-wide typecheck after formatting is blocked by an unrelated strict-null error in `exam-generation-jobs.service.ts` for `job.referenceProgress`; this task intentionally does not modify the Todo 3 progress/receipt area.
- Deadline expiry must race independently from provider completion: aborting alone cannot stop a provider that ignores `AbortSignal`.

## 2026-07-24 Task 1 Typecheck Repair

- When narrowing an optional local in TypeScript, use the value comparison directly in each branch; a boolean alias does not narrow the original binding for property access.

## 2026-07-24 Task 3

- The absolute deadline is created at `runJob` start only for reference requests and is passed unchanged through `createWithProgress`, reference selection, planner frame/payload work, final generation, semantic verification, and retry recursion.
- Progress reports are emitted only after settled selection, combined planner work, final-provider work, and semantic-verifier work at 15%, 35%, 60%, and 85%. Static messages and the Todo 1 receipt projection keep provider/source material out of public progress.
- `ReferenceJobDeadlineExceededError` must escape final generation and semantic verification before their ordinary retry/rejection paths. Candidate-loop deadline checks prevent replacements and later milestones after expiry.

## 2026-07-24 Source-Echo Recovery Repair

- `echoedReferenceFrame` must create a nonempty choice role and evidence block for every source choice. A single synthetic role leaves the later fidelity builder with empty mappings for the remaining answer-plan options.

## 2026-07-24 Reference Generation Deadline Recovery Task 1

- `resolveReferenceGenerationWorkBudget` defaults to five replacements and uses one effective cap for both candidate scans and planner-reaching attempts; invalid or non-integer allowance values fall back to the default, while zero preserves the requested-count floor.
- Candidate reconciliation accepts only the redacted terminal kinds `accepted`, `source`, `planner`, `fidelity`, and `admission`; `deadlineAdmissionExhausted` is deliberately outside that count contract as a later job-level receipt field.
- Provider-failure disposition is currently an internal contract seam: authentication, transport/service, and request-configuration kinds are fatal; malformed model output and local validation are candidate-local. Existing planner/regenerator enforcement remains for the later candidate-loop task.
- Focused Jest, backend typecheck, backend build, and an import-level budget/reconciliation driver passed. TypeScript LSP diagnostics were unavailable because the workspace's TypeScript server installation was previously declined.

## 2026-07-24 Reference Generation Deadline Recovery Task 2

- `UNREFERENCED_BLUEPRINT_ROLE` correction text requires one choice role and matching evidence block for every `itemIndex` from 1 through the archetype-derived count; the single-choice fixture characterizes the required range as 1 through 5.
- A valid second frame is accepted and proceeds to payload planning; exhausted role coverage remains a typed frame rejection with `reason: 'UNREFERENCED_BLUEPRINT_ROLE'`, `attempts`, and `terminal: 'retry_exhausted'` before fidelity construction.
- Source echo remains bounded to exhausted source-object `UNKNOWN_FIELD` recovery; exhausted role validation does not provide response keys and does not echo.

## 2026-07-24 Reference Generation Deadline Recovery Task 3

- The serial candidate loop uses Task 1's single effective budget for both scans and planner-reaching candidates. A cache hit is still a terminal candidate outcome and consumes a scan unit before any later replacement can run.
- Candidate-local shortfalls reconcile only Task 1 terminal kinds and expose numeric `attempted`, `eligible`, `generated`, and `omittedEligibleCount` values with aggregate source/planner/fidelity counts. No source ID, prompt, provider response, or raw error is included.
- Planner `MODEL_REQUEST_FAILED`, timeout/transient, and unsupported structured-output rejections are mapped through Task 1's fatal disposition contract; local planner/fidelity failures continue recovery. Typed deadline expiry remains outside this mapping and still escapes directly.
- Focused service Jest (30 tests), backend typecheck, `git diff --check`, and an import-level service/budget driver passed. No live or authenticated provider call was made.

## 2026-07-24 Reference Generation Deadline Recovery Task 4

- Deadline admission uses separate typed `ReferenceJobDeadlineAdmissionError` data, so a proactive reserve shortfall is candidate-local while true in-flight `ReferenceJobDeadlineExceededError` continues to map to timeout.
- Stage reserve is inclusive: planner requires planner plus final plus semantic minimums, final requires final plus semantic, and semantic requires its own minimum. Equal reserve admits; one millisecond short starts no provider call.
- Uncached candidate pre-admission reserves one additional planner minimum for frame plus payload work. A validated cached frame uses the cheaper single-planner path, so deterministic scanning can bypass an uncached admission shortfall and still accept a later cache hit.
- Planner waits and regenerator retries re-check reserve at each physical provider attempt; a failed admission stops retry recursion without reclassifying actual expiry.

## 2026-07-24 Reference Generation Deadline Recovery Task 4 Repair

- A planner frame retry has a distinct remaining path from a payload retry: it must reserve the retried frame request, the later payload request, final generation, and semantic verification. Carrying one extra planner minimum only through frame-stage retry waits prevents consuming payload reserve without penalizing payload retries.
