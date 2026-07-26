# reference-generation-hardening - Work Plan

## TL;DR (For humans)
Harden the V2 reference-generation pipeline so provider schema, prompts, validators, retries, job failures, and persistence agree. The final acceptance gate is an authenticated `/exams/jobs` reference request that reaches `completed` and persists the requested exam items. This does not change unrelated AI generation modes.

## Scope
- ReferenceFrame frame/payload contracts, semantic and structure-blueprint validators, planner retries and diagnostics.
- Final variant generation contracts, job status propagation, and authenticated API regression coverage.
- Preserve meaningful model relationships; normalize only deterministic representation differences; fail closed on dangling references, cycles, and contradictions.

## Verification strategy
- Contract tests enumerate every provider-schema-permitted semantic combination and relation shape.
- Planner tests assert correction prompts carry exact validation path and repaired attempts succeed.
- CI parity test derives provider-schema and prompt constraint projections from one canonical invariant definition, then structurally compares emitted projections and validator ownership for every invariant.
- Authenticated API harness creates an isolated QA user, requests a reference job, polls to `completed`, verifies persisted item count, then cleans up in `finally`.

## Execution strategy
- Audit contracts before relaxing validators.
- Make one authoritative invariant definition shared by schema, prompt, validator, and tests.
- Add diagnostics before live retries, then verify each fixed failure by real API execution.

## Todos
- [x] 1. Create a canonical, executable invariant definition for every ReferenceFrame and ConceptPayload rule, then derive parity tests across provider schemas, prompts, validators, and repair paths.
  References: `backend/src/exams/reference-frame.provider-schemas.ts`, `reference-frame-planner.prompts.ts`, `reference-frame.frame-validator.ts`, `reference-frame.payload-validator.ts`, `reference-structure-blueprint.validator.ts`.
  Acceptance: every invariant has a stable ID, owner, classification, provider-schema expectation, prompt rule, validator path, and regression fixture; schemas and prompt fragments are deterministic projections of that definition; CI fails on structural drift.
  QA: from `backend/`, run `npm test -- --runInBand src/exams/reference-contract-parity.spec.ts src/exams/reference-frame.contract.spec.ts src/exams/reference-frame.provider-schemas.spec.ts`; expect all invariant IDs covered and no schema/prompt/validator projection drift.
  Commit: `test(reference): inventory V2 contract invariants`.
- [x] 2. Align semantic-atom and grounding contracts with meaningful relation semantics and deterministic referential integrity.
  References: `backend/src/exams/reference-structure-blueprint.validator.ts`, `reference-frame.types.ts`, `reference-frame.provider-schemas.ts`.
  Acceptance: valid status/outcome/quantity relationships pass; duplicate, dangling, mismatched, and unbound references fail with stable code/path.
  QA: commit `backend/src/exams/fixtures/reference-planner-failures/manifest.json` with one sanitized exact payload, incident ID, expected accepted/rejected outcome, and stable code/path for `has_status + objectSlot` and `produces_outcome + quantityRole`; run `npm test -- --runInBand src/exams/reference-structure-blueprint.validator.spec.ts src/exams/reference-frame.contract.spec.ts`; expect corrected incidents accepted and dangling bindings rejected with their manifest code/path.
  Commit: `fix(reference): align semantic grounding contract`.
- [x] 3. Align structure-blueprint relation and reasoning contracts with provider output and source ordering.
  References: `backend/src/exams/reference-structure-blueprint.validator.ts`, `reference-frame.provider-schemas.ts`, `reference-frame-planner.prompts.ts`.
  Acceptance: valid relation kinds and ordered dependencies pass; cycles, missing units, reversed dependencies, and invalid condition/exception relationships fail deterministically.
  QA: add the exact sanitized `relations[1]` incident to the corpus manifest; run `npm test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts`; expect its corrected relation accepted plus stable failures for reversed, cyclic, or dangling relations.
  Commit: `fix(reference): harden structure blueprint relations`.
- [x] 4. Make planner retries path-aware and preserve bounded, safe diagnostics through job failure state.
  References: `backend/src/exams/reference-frame-planner.service.ts`, `reference-frame-planner.types.ts`, `reference-frame-generation.service.ts`, `exams.service.ts`, `exam-generation-jobs.service.ts`.
  Acceptance: every parse/validation failure returns allowlisted `{stage, reasonCode, validationPath, structuralFragment}`; fragments are field-allowlisted and truncated; raw provider response, prompt, reference prose, credentials, cookies, authorization values, and provider error text never reach retry prompts, job records, logs, or API responses.
  QA: from `backend/`, run `npm test -- --runInBand src/exams/reference-frame-planner.service.spec.ts src/exams/exam-generation-jobs.service.spec.ts`; expect changed retry prompts, exhausted allowlisted diagnostics, and explicit redaction assertions for raw response/prompt/source/token fixtures.
  Commit: `fix(reference): retain planner validation diagnostics`.
- [x] 5. Audit final variant generation and persistence boundaries for reference-specific contract drift.
  References: `backend/src/exams/exam-regenerator.service.ts`, `reference-final-output-schema.ts`, `reference-generation-output-validator.ts`, `exams.service.ts`.
  Acceptance: final response fidelity trace, template, answer encoding, novelty, and persisted Question fields agree for every supported template.
  QA: run `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts`; expect valid persistence mapping and predictable reject/retry behavior for malformed output.
  Commit: `test(reference): cover final generation persistence boundary`.
- [x] 6. Add authenticated backend API regression harness for isolated reference-generation jobs and cleanup.
  References: `backend/src/auth/auth.service.ts`, `auth.controller.ts`, `exams.controller.ts`, `exams.service.ts`.
  Acceptance: add an opt-in `REFERENCE_LIVE_QA=1` backend command that creates a unique run marker, seeds or selects its known reference fixture, creates isolated QA user/token, submits `/exams/jobs`, polls no more than 180 seconds, asserts `completed`, `examId`, requested item count, and persisted Question/ExamItem fields. In `finally`, delete every user/exam/question/job record bearing that marker or owned by the QA user; cleanup failure produces nonzero exit and only safe remediation IDs.
  QA: from `backend/`, run `REFERENCE_LIVE_QA=1 npm run test:reference-live`; expect exit 0 only after actual-provider completion and marker-scoped cleanup. Force a failed job and a cleanup failure fixture; expect safe diagnostics and nonzero exit for incomplete cleanup.
  Commit: `test(reference): add authenticated live job regression`.

## Final verification wave
- [x] F1. From `backend/`, run `npm test -- --runInBand src/exams/reference-contract-parity.spec.ts`; verify every invariant ID has generated schema/prompt projection, validator ownership, and regression coverage.
- [x] F2. Run `npm test -- --runInBand src/exams/reference-frame.contract.spec.ts src/exams/reference-frame-planner.validation.spec.ts` and verify dangling references, cycles, and contradictions remain rejected.
- [x] F3. Run `REFERENCE_LIVE_QA=1 npm run test:reference-live`; verify authenticated actual-provider job reaches `completed`, returns `examId`, persists the requested item count, and removes QA records in `finally`.
- [x] F4. From `backend/`, run `npm test -- --runInBand src/exams/exam-generator.service.spec.ts src/exams/exams.service.spec.ts && npm run typecheck && npm run build`; verify `sourceType=ai` behavior and unrelated user records remain unchanged.

## Commit strategy
One atomic commit per todo; no refactors outside reference generation and its test harness.

## Success criteria
- No provider-schema-permitted value is rejected solely by an unstated cross-field constraint.
- Every terminal planner rejection contains stage, reason, path, and safe structural context.
- At least one authenticated live reference job completes and persists its requested item count.
- Contract, planner, integration, final-variant, typecheck, and build verification pass.
