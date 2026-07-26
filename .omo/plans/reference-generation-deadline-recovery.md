# reference-generation-deadline-recovery - Work Plan
## TL;DR (For humans)
Reference jobs currently spend their one six-minute deadline on serial planner/final retries and unrestricted replacement candidates. This plan preserves every selection, fidelity, semantic, copy-policy, model, prompt, schema, chunk-size, and exact-count rule. It makes retry feedback actionable, bounds unproductive candidate work, avoids provider calls that cannot finish the remaining pipeline, and returns truthful shortfall receipts instead of avoidable timeouts.

Decisions adopted: candidate attempts that reach planner work are capped at `questionCount + 5` by default, with a validated replacement allowance override; total candidate scans are capped at the same effective cap; downstream-reserve admission skips an uncached candidate but continues to any later cache hit that can meet its cheaper reserve, ending as shortfall only when no viable path remains; no source fingerprint is added because candidates are already source-deduplicated; real deadline expiry remains `REFERENCE_GENERATION_TIMEOUT`, while candidate-local bounded exhaustion is `REFERENCE_GENERATION_SHORTFALL`. Only provider request/configuration incompatibilities remain fatal; malformed model output and local structure validation remain candidate-local.

## Scope
IN: backend retry feedback, candidate-work budgeting, stage minimum-time admission, internal redacted outcome accounting, receipt counters, focused backend regression tests.

OUT: relaxed validators, changed prompts/models/schemas except retry correction text, changed exact-count/chunking, frontend, migrations, corpus/cache mutation, persisted failure records, increased global timeout.

## Verification strategy
- Run focused planner, generation, regenerator, jobs, persistence, and deadline Jest suites in-band.
- Run `npm --prefix backend run typecheck`.
- Assert no accepted output can bypass copy-policy, semantic, fidelity, selection, or exact-count validation.
- Assert shortfall/timeout receipts contain only stable stage/count/code fields and failed runs persist no cache/question/exam/item rows.

## Execution strategy
- Wave 1: introduce typed internal work-budget/outcome contracts before changing loops.
- Wave 2: integrate planner correction characterization, candidate cap, and downstream-reserve deadline admission.
- Wave 3: receipts/persistence and complete regression QA.

## Todos
- [x] 1. Define reference-work budget and mutually exclusive redacted outcome contracts
  What to do: Add typed configuration/defaults for replacement allowance (default `5`) and stage minimum useful budgets, plus a redacted candidate outcome union. Validate non-negative integers and enforce an effective cap no lower than `questionCount`. Both total candidate scans and planner-reaching attempts are bounded by that cap. Each scanned candidate receives exactly one terminal outcome: `accepted`, `source`, `planner`, `fidelity`, or `admission`; job-level `deadlineAdmissionExhausted` is a separate receipt field and never participates in candidate reconciliation. Classify only provider authentication, transport/service outage, and provider request/schema-configuration incompatibilities as fatal; malformed model output and local validation stay candidate-local.
  Must NOT do: Do not persist fingerprints or include source/provider payloads; do not add a fingerprint mechanism because source selection is already unique.
  References: `backend/src/exams/reference-frame-generation.service.ts:184-505`, `backend/src/exams/reference-job-deadline.ts:21-83`, `backend/src/exams/exam-generation.utils.ts`.
  Acceptance criteria: defaults are deterministic; invalid environment/config values have safe documented fallback; types make raw source/provider text impossible in receipts; scanned-candidate accounting reconciles `attempted = accepted + source + planner + fidelity + admission`, while `deadlineAdmissionExhausted` remains independent.
  QA: add cases in `backend/src/exams/reference-generation-budget.spec.ts`; run `npm --prefix backend test -- --runInBand src/exams/reference-generation-budget.spec.ts`; assert default 10-question scan/planner cap is 15, negative/non-integer override falls back safely, malformed model output is candidate-local, and provider authentication/schema-configuration error is not a shortfall. Evidence: `.omo/evidence/reference-generation-deadline-recovery/task-1.md`.
  Commit: `feat(reference): define bounded recovery work contracts`

- [x] 2. Characterize planner role-mapping correction and terminal candidate outcome
  What to do: Lock the existing `UNREFERENCED_BLUEPRINT_ROLE` correction wording/required cardinality in tests and preserve terminal planner rejection as a typed stage/reason outcome for the candidate loop.
  Must NOT do: Do not broaden `echoedReferenceFrame` beyond exhausted source-object `UNKNOWN_FIELD` recovery or relax structure validation.
  References: `backend/src/exams/reference-frame-planner.prompts.ts:12-50`, `backend/src/exams/reference-frame-planner.service.ts:198-279`, `backend/src/exams/reference-structure-blueprint.validator.ts:312-399`, `backend/src/exams/reference-frame-planner.validation.spec.ts`.
  Acceptance criteria: incomplete role coverage triggers a second frame request carrying the exact correction; a valid second frame proceeds; exhausted rejection preserves only stable planner reason.
  QA: add cases in `backend/src/exams/reference-frame-planner.validation.spec.ts`; run `npm --prefix backend test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts`; queue an incomplete frame then valid frame/payload and assert attempt-two success, correction text includes required indexes, and exhausted incomplete frame returns typed planner rejection before fidelity construction. Evidence: `.omo/evidence/reference-generation-deadline-recovery/task-2.md`.
  Commit: `test(reference): characterize planner role recovery`

- [x] 3. Bound candidate replacement with calibrated candidate accounting
  What to do: Apply the validated total-scan and planner-attempt caps in the serial candidate loop. Cache use still consumes one candidate unit. Preserve deterministic selection order within the cap; on either cap exhaustion return candidate-local shortfall with attempted/eligible/generated/omitted counts. Let only provider authentication, transport/service outage, and request/schema-configuration errors escape as fatal.
  Must NOT do: Do not change selection order for candidates that remain eligible, final five-question chunks, or acceptance rules.
  References: `backend/src/exams/reference-frame-generation.service.ts:221-235,443-505`, `backend/src/exams/exam-regenerator.service.ts:656-728`, `backend/src/exams/reference-frame-generation.service.spec.ts`.
  Acceptance criteria: only capped candidates reach planner work; the default cap admits the first valid candidate required for exact-count success in deterministic selection order; cap exhaustion produces one job-level cap event and no timeout; fatal provider errors are not reclassified.
  QA: add cases in `backend/src/exams/reference-frame-generation.service.spec.ts`; run `npm --prefix backend test -- --runInBand src/exams/reference-frame-generation.service.spec.ts`; assert 10 requested candidates can use 5 replacements, a valid 11th deterministic candidate succeeds, an all-invalid set shortfalls before deadline, and 401/unsupported-schema errors remain fatal. Evidence: `.omo/evidence/reference-generation-deadline-recovery/task-3.md`.
  Commit: `fix(reference): bound replacement candidate recovery`

- [x] 4. Add downstream-reserve deadline admission at provider-stage boundaries
  What to do: Extend the deadline helper with typed admission checks: planner reserves planner + final generator + semantic verifier minimums; final generator reserves final + semantic minimums; semantic verifier reserves its own minimum. An admitted stage may retry only while its retry plus downstream reserve remains available. A call with exactly its reserve is admitted. A planner admission rejection records a candidate-local `admission` outcome and continues scanning because a later cache hit may skip planner; terminate as typed shortfall only after the loop proves no remaining candidate can admit its cheapest viable cached-or-uncached path, unless the absolute deadline is already expired.
  Must NOT do: Do not weaken absolute deadline enforcement or start calls after admission failure.
  References: `backend/src/exams/reference-job-deadline.ts:48-119`, `backend/src/exams/reference-frame-planner.model-client.ts`, `backend/src/exams/exam-regenerator.service.ts:620-626`.
  Acceptance criteria: no provider call occurs below its full downstream reserve; ignored-abort providers remain bounded by absolute deadline; actual in-flight expiry still maps to timeout; a cached later candidate remains eligible after an uncached planner admission rejection.
  QA: add cases in `backend/src/exams/reference-job-deadline.spec.ts`, `backend/src/exams/reference-frame-generation.service.spec.ts`, and `backend/src/exams/exam-regenerator.reference-variant.spec.ts`; run `npm --prefix backend test -- --runInBand src/exams/reference-job-deadline.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts`; assert equal reserve invokes, one millisecond short makes zero provider calls, an uncached admission skip proceeds to a viable cache hit, no viable remaining path gives one job-level shortfall, retry is suppressed when it would consume downstream reserve, and ignored-abort expiry remains timeout. Evidence: `.omo/evidence/reference-generation-deadline-recovery/task-4.md`.
  Commit: `fix(reference): admit only viable provider work`

- [x] 5. Project bounded-recovery outcomes into safe receipts and atomic persistence
  What to do: Extend shortfall aggregation/receipt projection and parser/schema together with approved stable counters: attempted, eligible, generated, source, planner, fidelity, admission, and omittedEligibleCount. Preserve existing fields and redaction. Confirm exact-count transaction starts only after successful generation and candidate-local shortfalls write nothing.
  Must NOT do: Do not expose source IDs, validation paths, prompts, model response text, or provider errors.
  References: `backend/src/exams/exams.service.ts:43-125,574-650`, `backend/src/exams/exam-generation-jobs.service.ts:22-161`, `backend/src/exams/exams.persistence.spec.ts`, `backend/src/exams/reference-frame-cache.persistence.spec.ts`.
  Acceptance criteria: timeout, candidate-local shortfall, and fatal provider failure are distinguishable; counts reconcile; receipts remain backwards compatible/redacted; shortfall causes zero cache/question/exam/item writes.
  QA: run `npm --prefix backend test -- --runInBand src/exams/exam-generation-jobs.service.spec.ts src/exams/exams.service.spec.ts src/exams/exams.persistence.spec.ts src/exams/reference-frame-cache.persistence.spec.ts`; assert serialized receipt omits source/provider/path text and failed cap/admission runs write zero rows. Evidence: `.omo/evidence/reference-generation-deadline-recovery/task-5.md`.
  Commit: `fix(exams): report bounded reference recovery safely`

- [x] 6. Run contract-preserving backend regression matrix
  What to do: Add characterization tests for unchanged model/messages/schema/temperature/selection/fidelity inputs, deterministic retry limits, candidate cap, downstream-reserve admission, receipt reconciliation/redaction, and no-write-on-shortfall. Run focused suites and typecheck.
  Must NOT do: Do not perform live/authenticated QA, mutate corpus data, or alter frontend.
  References: `backend/src/exams/reference-generation-contract.characterization.spec.ts`, `backend/src/exams/reference-frame-generation.service.spec.ts`, `backend/src/exams/exam-regenerator.reference-variant.spec.ts`, `backend/src/exams/exams.service.spec.ts`.
  Acceptance criteria: all focused tests/typecheck pass; baseline contract remains byte-identical except retry correction text; evidence captures commands and assertions.
  QA: run `npm --prefix backend test -- --runInBand src/exams/reference-generation-contract.characterization.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts src/exams/exams.service.spec.ts` followed by `npm --prefix backend run typecheck`; assert valid in-budget exact-count success and repeated copy/planner failures stop within cap with a redacted shortfall. Evidence: `.omo/evidence/reference-generation-deadline-recovery/task-6.md`.
  Commit: `test(reference): cover bounded deadline recovery`

## Final verification wave
- [ ] F1. Scope fidelity audit [blocked: repository baseline contains extensive pre-existing untracked files]
  Inspect task-owned diff and run `git diff --check`; approve only if validators, models, schemas, selection order, chunk size, prompts beyond correction text, frontend, migrations, and corpus are unchanged.
- [x] F2. Retry/deadline contract audit
  Inspect budgets, cap accounting, downstream reserves, mutually exclusive receipt counters, and receipt redaction. Run `npm --prefix backend test -- --runInBand src/exams/reference-generation-budget.spec.ts src/exams/reference-job-deadline.spec.ts`; approve only if no provider call starts below full downstream reserve and actual deadline expiry remains timeout.
- [x] F3. Backend regression QA
  Run the focused Jest matrix and typecheck. Approve only if exact-count success, capped shortfall, ignored-abort expiry, and no-write-on-shortfall assertions pass.
- [x] F4. Persistence and quality audit
  Run `npm --prefix backend test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts src/exams/exams.persistence.spec.ts src/exams/reference-frame-cache.persistence.spec.ts`; approve only if accepted questions retain existing fidelity/copy/semantic behavior and shortfalls persist no partial rows.

## Commit strategy
Commit in todo order. Stage only task-owned backend/spec/evidence files. Keep existing unrelated dirty worktree changes untouched.

## Success criteria
- Repeated invalid candidates no longer consume the entire job deadline without a bounded outcome.
- Provider calls that cannot meaningfully complete are not started.
- Accepted output quality contracts are unchanged.
- Users receive safe, truthful timeout or shortfall receipts.
- Failed bounded runs persist no partial data.
