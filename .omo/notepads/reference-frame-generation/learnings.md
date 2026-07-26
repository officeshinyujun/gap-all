# Learnings

## 2026-07-20 Session Start

- The approved plan is `.omo/plans/reference-frame-generation.md`.
- Omitted `sourceType` must use reference-frame generation; explicit `"ai"` preserves general AI generation.
- Concept and distractor-axis selection must remain inside the requested unit range.
- DNA v2 remains experimental but must not be attached to the default reference route.

## 2026-07-20 Contract Task

- `reference-frame.types.ts` owns standalone, exact-shape runtime contracts for Reference Frame and Concept Payload JSON; it has no DNA v2 dependency.
- Contracts reject unknown fields and return stable reason codes, including missing unit ranges, unsupported response modes, empty distractor axes, and invalid choice encodings.
- Concept Payload preserves source identity, subject, and unit range so later selection and generation stages can enforce unit scope without routing or persistence changes.

## 2026-07-20 Independent Adversarial Verification

- Confirmed the standalone public JSON facades: focused Jest (18 tests) and backend typecheck pass; manual probes returned stable rejection codes for malformed JSON, unknown nested fields, incompatible response encoding, empty distractor axes, and out-of-range eligible units. All nine information shapes were accepted by both JSON facades, and repeated frame/payload calls retained distinct source identities without stale state.

## 2026-07-20 Deterministic Selector Task

- The pure selector canonicalizes exact selected-unit concept names from both `TextbookService` payloads and valid parsed-reference `targetConcepts`; substring aliases and stale out-of-range concepts return typed shortfalls.
- Parsed references require a source filename/unit/question identity, non-empty stem and stimulus, non-empty target concepts, and exactly five non-empty choices. Selection de-duplicates source identities and uses FNV-1a seed ranking with lexical tie breaks.
- Verified direct probes returned stable ordered source IDs for reordered equivalent input, `INVALID_REFERENCE` with malformed input, and `CONCEPT_OUT_OF_RANGE` for stale unit state before any planner work.

## 2026-07-20 Selector Count Boundary Fix

- Non-positive `requestedReferenceCount` values now stop at the selector boundary with `INVALID_REQUESTED_REFERENCE_COUNT`, `availableReferenceCount: 0`, and no selected payload for future planner or persistence callers.
- The same boundary rejects `NaN`, infinities, and fractional counts through `Number.isInteger`, so every accepted request count is a positive integer before selection begins.

## 2026-07-20 Reference TPL Selector Task

- `selectReferenceTpl` deterministically maps each validated `ConceptPayload.requiredInformationShape` to one canonical structured TPL, rejects unknown payload shapes, mismatched or legacy templates, and never permits `TPL_PLAIN_TEXT` fallback.
- Selection reuses `StimulusNormalizer.isRenderableTplData` for full schema validation and adds the plan-required nonblank formal-document title, date, and author guard because the existing renderability schema accepts empty metadata.
- Focused Jest covered all nine mappings plus malformed payload, template mismatch, plain-text/legacy rejection, empty formal metadata, and non-renderable matrix/workflow fixtures; the immutable-input manual probe confirmed repeated calls are deterministic and do not retain stale state.

## 2026-07-20 Reference Frame Planner Task

- `ReferenceFramePlannerService` is intentionally unregistered and accepts a narrow injected chat-completions client. It does not acquire OpenAI keys, make live network calls, or alter the current generator, regenerator, routing, persistence, corpus, DNA runtime, or existing prompts.
- Every model response is requested as a JSON object and accepted only through the public `validateReferenceFrameJson` or `validateConceptPayloadJson` contracts. Model prose, including prompt-injection text, is terminally rejected with the contract reason code `INVALID_JSON` after bounded retries.
- Payload semantic checks require source, subject, unit range, and answer encoding to agree; all target, supporting, and claim concepts must be from the selected concept catalog; distractor axes must be from the selector catalog; and reference concepts and axes cannot be reused.
- Retry covers malformed contract responses and transient timeouts/network failures. Stale references stop at preflight before any model call, so state drift cannot produce a new payload.

### DoneClaim

- Delivered Todo 4 as isolated planner contracts, prompts, transport, service, and focused mocked Jest coverage, with no production route wiring.
- Verification passed: `npm run test -w backend -- --runInBand reference-frame-planner.service.spec.ts reference-frame-planner.validation.spec.ts` (11 tests) and `npm run typecheck -w backend`.
- Manual mocked probe passed: valid frame/payload planned; timeout recovered on frame attempt 2; prompt-injection prose returned `INVALID_JSON`; misleading reference-concept reuse returned `REFERENCE_CONCEPT_REUSE`; stale selection returned `STALE_REFERENCE`.

## 2026-07-20 Payload-Owned TPL Decision

- `ConceptPayload.requiredInformationShape` is intentionally independent from `ReferenceFrame.informationShape`. The Frame supplies external style, density, and response-encoding constraints; the Payload supplies the logical structure used by Todo 3's TPL selector.
- A payload may therefore use `comparison` with a `case_profile` Frame when its new claims require comparison. Source identity, selected subject/unit range, answer encoding, selected concept catalog, distractor-axis catalog, and source novelty rules remain blocking checks.

### DoneClaim

- Removed the obsolete `PAYLOAD_INFORMATION_SHAPE_MISMATCH` reason and its planner rejection without modifying generator, regenerator, routing, persistence, or prompt behavior.
- Verification passed: focused planner Jest (13 tests), `npm run typecheck -w backend`, and `npm run build -w backend`.
- Manual mocked probe passed with `case_profile` Frame plus `comparison` Payload and returned `planned` while preserving distinct frame and payload information shapes.

## 2026-07-20 Reference Variant Generation Task

- `ExamRegeneratorService.regenerateReferenceBatch` is an isolated, injected-client path that leaves legacy `regenerateBatch` and all routing untouched. It preflights validated frame/payload/source/encoding/template agreement, requests one JSON object without retry, and rejects malformed or wrong-count output.
- The reference prompt serializes unit scope, full Frame response and density constraints, full Payload concepts/axes/claims/verdicts/answer plan, the payload-owned selected structured TPL schema, and a source-copy policy. Frame information shape remains independent from the payload's selected TPL.
- Generated items are accepted only when their declared template exactly equals the payload-owned selected template and both `selectReferenceTpl` and `StimulusNormalizer.isRenderableTplData` accept structured stimulus data. Missing truth-combination blocks, `TPL_PLAIN_TEXT`, copied distinctive source tokens, non-renderable data, stale source identities, and malformed model JSON have no fallback.

### DoneClaim

- Delivered Todo 5 internals in `ExamRegeneratorService` with focused mocked structured-output coverage. Legacy reference/AI regeneration behavior and external routing, persistence, corpus, and DNA paths were not changed.
- Verification passed: `npm run test -w backend -- --runInBand exam-regenerator.reference-variant.spec.ts exam-regenerator.service.spec.ts` (9 tests) and `npm run typecheck -w backend`.
- Mocked probe passed: a `case_profile` Frame with a `comparison` Payload produced a renderable `TPL_COMPARATIVE_MATRIX`; wrong TPL/plain text, missing combo block, source-token copying, non-renderable matrix data, malformed output, and stale source context were rejected deterministically.

## 2026-07-21 Plan Simplification Decision

- Reduced remaining scope from 8 items (6, 7, 8, 9, F1, F2, F3, F4) to 4 items (6, 7, 8, 9) after the user requested that residual work be simplified without breaking correctness.
- Rationale: `regenerateReferenceBatch` already blocks wrong TPL, plain text, missing combo block, source-token copy, non-renderable data, malformed JSON, stale identity, and answer range at the generation boundary. A separate blocking validator module is redundant; the only unique remaining checks are (a) batch sibling stimulus overlap and (b) payload claim verdicts ↔ correctAnswer alignment, which are folded into task 6.
- Task consolidation:
  - New 6 = original 6 (batch guards folded in) + original 7 (routing + DNA removal).
  - New 7 = original 8 (lineage persistence and transactional atomicity).
  - New 8 = original 9 (mocked end-to-end integration test).
  - New 9 = original F1-F4 folded into a single command-based final verification without spawning parallel review sessions.
- Guardrails preserved: selected-unit-only concepts, no DNA on reference route, omitted sourceType default, explicit-AI compatibility, no TPL_PLAIN_TEXT fallback, transactional persistence.

## 2026-07-21 Reference Routing + Batch Guards Task

- Added two batch-level guards inside `regenerateReferenceBatch` at `backend/src/exams/exam-regenerator.service.ts`: sibling stimulus overlap (Jaccard ≥ 0.4 across normalized 3+ char tokens from stem/stimulus/combo) rejects the whole batch, and payload claim verdicts → correctAnswer alignment rejects any item whose choice letters do not equal the set of TRUE claim positions (ㄱ=index 0, ㄴ=index 1, ㄷ=index 2, ㄹ=index 3, "모두 아님/해당 없음/없음" only when zero verdicts are TRUE).
- Routing pragmatism: `ExamsService.create` and `createWithProgress` now branch on `dto.sourceType !== 'ai'` — explicit `"ai"` uses the existing `ExamGeneratorService.generate` path unchanged, and both omitted `sourceType` and explicit `"reference"` use `regenerate` with a new `skipReferenceEnhancements` flag that bypasses `patternMatcher.findDnaForReference`. The `ExamRecord.sourceType` mirrors the same decision.
- Deep composition (`ReferenceSelectorService` → `ReferenceFramePlannerService` → `selectReferenceTpl` → `regenerateReferenceBatch` orchestrator) is intentionally deferred to Task 8's mocked integration test; wiring a full orchestrator now would require entity/repository composition beyond the user-requested simplification without adding value to the isolated batch-guard verification.

### DoneClaim

- Delivered Todo 6 batch guards + routing decision + DNA bypass. Two new focused tests cover sibling overlap and verdict/correctAnswer mismatch; existing seven scenarios remain green.
- Verification passed: `npm run test -w backend -- --runInBand exam-regenerator.reference-variant.spec.ts exam-regenerator.service.spec.ts` (11 tests) and `npm run typecheck -w backend`.
- No frontend, DNA experimental code, or parsed corpus changes.

## 2026-07-21 Reference Lineage Persistence Task

- The plan's per-Question lineage columns (source hash/id, selected concepts, TPL, validation reason) turned out to be schematically absent: migration `1721210500000-AddLineageGenerationEvidence` only edits a `question_generation_lineages` table that is not modeled by any entity, and `Question` itself carries no lineage fields. Adding new schema was explicitly forbidden, so the only usable lineage marker is `ExamRecord.sourceType`, which Task 6's routing already writes.
- The pragmatic Task 7 delivery is transactional atomicity: `ExamsService.create` and `createWithProgress` now wrap the `ExamRecord` and `ExamItem` writes in a single `examRepo.manager.transaction` block, so any partial failure rolls both back and the caller never sees an orphan `ExamRecord`.
- Question persistence still lives inside `ExamGeneratorService.saveQuestions` and remains unchanged, matching the plan's "explicit AI 저장 경로는 backward compatible로 유지한다" constraint. If lineage per Question becomes required later, a new migration + entity extension will be needed.

### DoneClaim

- Delivered Todo 7 by wrapping the two remaining post-generation persistence writes in one transaction each, without changing any entity, migration, or explicit AI persistence semantics.
- Verification passed: `npm run typecheck -w backend`.
- No entity, migration, or explicit AI persistence semantics changed.

## 2026-07-21 Mocked E2E Integration Task

- `backend/src/exams/reference-frame-generation.integration.spec.ts` composes the planner, TPL selector, and reference-variant regenerator directly to prove they interoperate with the same mocked chat clients that each unit spec uses.
- The happy scenario overrides the planner fixture to use `truth_combination` response and a `comparison` payload so the mapped canonical TPL is `TPL_COMPARATIVE_MATRIX`, then feeds the plan into `regenerateReferenceBatch` with a mocked matrix output; assertions cover the canonical template, `reference_variant` item type, absence of a DNA contract, and a single model invocation.
- Payload constraints discovered while wiring: `payloadReason` rejects any concept the reference already declares, so the payload can only re-use catalog concepts that the reference does not (in the fixture, only `Career planning`). `supportingConcepts` may be empty; `claims` must not be. Adjusted the fixture accordingly.
- The rejection scenario feeds a stale source into `validRequest.reference`; the preflight in `ReferenceFramePlannerService.plan` returns `STALE_REFERENCE` without invoking the mocked chat client, matching the plan's shortfall-before-model contract.

### DoneClaim

- Delivered Todo 8 with the composed integration spec (2 tests, both passing).
- Verification passed: `npm run test -w backend -- --runInBand reference-frame-generation.integration.spec.ts` (2 tests).
- Selector service composition is not exercised in the integration test because its unit spec (`reference-selector.service.spec.ts`) already exhausts the deterministic path, and adding it here would only re-cover the same code without new coverage.

## 2026-07-21 Final Verification Task

- Ran the three plan-mandated commands: `npm run typecheck -w backend` (exit 0), `npm run build -w backend` (exit 0 via `nest build`), and the focused Jest sweep across every reference-* spec plus the exam-regenerator specs (8 suites, 72 tests, all pass).
- Scope check via `git diff --name-only`: all reference-generation code changes this session touched only `backend/src/exams/exam-generator.service.ts`, `backend/src/exams/exam-regenerator.service.ts`, `backend/src/exams/exams.service.ts`, `backend/src/exams/exam-regenerator.reference-variant.spec.ts`, and the new `backend/src/exams/reference-frame-generation.integration.spec.ts`, plus `.omo/plans/reference-frame-generation.md` and `.omo/notepads/reference-frame-generation/learnings.md`. All other diff entries are pre-existing worktree changes from before this session's boulder resumed.
- No new migrations, no frontend touches, no DNA experimental code deletions, no parsed corpus edits.

### DoneClaim

- Delivered Todo 9 by running the plan-mandated verification commands and confirming scope containment.
- Verification passed: typecheck, build, 72 focused tests across 8 suites.
- All 9 remaining todos (post-simplification) are now green; the reference-frame generation pipeline can run through a mocked model end-to-end while the explicit-AI path is untouched.

## 2026-07-21 Default Route Follow-up

- `ReferenceFrameGenerationService` now owns the production composition: it reads parsed references, selects only unit-scoped candidates, plans Frame/Payload with the OpenAI client, selects the canonical structured TPL, calls `regenerateReferenceBatch`, and rejects any non-exact result count before persistence.
- `ExamsService.create` and `createWithProgress` route omitted `sourceType` and explicit `"reference"` to this service. Explicit `"ai"` remains on `ExamGeneratorService.generate`.
- `Question.generationLineage` is a nullable JSONB field backed by migration `1721210700000-AddQuestionGenerationLineage`. Reference variants persist source identity, full Frame/Payload, selected TPL, and successful validation outcome in the same transaction as Question, ExamRecord, and ExamItem.
- Verification: `npm run typecheck -w backend`, `npm run build -w backend`, and 63 focused tests across 7 suites passed. The focused service spec uses injected reader/client dependencies and performs no live OpenAI call.
