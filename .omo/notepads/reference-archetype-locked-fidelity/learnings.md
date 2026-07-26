## 2026-07-22 Session initialization
No implementation findings yet. The selected plan is source-structure-focused and explicitly prohibits source prose in final-generation contracts.

## 2026-07-23 Task 1 repair
Focused relation validation is green after aligning the contract fixture with the oracle-approved cycle shape and adding required `evidenceBlocks` to the parsed blueprint and local fixture helpers. The passing focused Jest output was written to `.omo/evidence/reference-archetype-locked-fidelity/todo-1-jest.txt`.

## 2026-07-23 Evidence-block alignment
The remaining Task 1 seam was the evidence-block contract itself: parse-and-preserve with canonical fixture order, path-specific failures for malformed/dangling blocks, and the archetype topology correction from `substantive_prose` to `single_choice`. Focused Jest is green again and the evidence artifact was refreshed.

## 2026-07-23 Task 1 completion
`ReferenceFrame` now carries the validated `shell`, `ResponseStructure` requires explicit `choiceTopology` and `combinationPlan`, and the structural blueprint validator rejects malformed or dangling evidence blocks path-specifically. Focused Jest stayed green after propagation, and `npm run typecheck` completed successfully.

## 2026-07-23 Independent-review follow-up
Evidence blocks now follow the structural role order derived from `itemRoles` and reject reversals at `referenceFrame.structureBlueprint.evidenceBlocks[0].order`. `requiresStructuredSource` is now tied to shell mechanics: plain shells cannot claim structured-source behavior, and structured shells cannot turn it off without failing the shell path.

## 2026-07-23 Task 2 fixture golden
Representative source-derived archetype fixtures now live in `backend/src/exams/reference-frame-planner.fixtures.ts` and are projected only as structural summaries. The focused golden suite proved the fixture classifications are deterministic for representative 성직 and 공일 samples, including the shared-document shell case, and the test output was captured in `.omo/evidence/reference-archetype-locked-fidelity/task-2-jest.txt`.

## 2026-07-23 Task 2 golden-oracle repair
`toProjection()` now preserves the authored structural projection instead of overwriting shell, register, response, and TPL values from `classifyReferenceArchetype`. The golden spec carries an explicit expected classification list for all 17 parsed records, so classifier output is compared against independent structural data. The `sungjik:15:5` fixture was corrected from dialogue/forum-Q&A to table/comparison/`TPL_COMPARATIVE_MATRIX` because its source contains a Markdown table; the targeted assertion keeps that declaration visible. Shared-set assertions now cover both `sungjik-rights-case-set-1` and `kongil-paired-safety-set-1`, including pair roles, common shell kind, set identity, and allowed TPL family. Public projections remain source-prose-free.

Verification commands and results:
- `npm test -- --no-cache --runInBand src/exams/reference-archetype.golden.spec.ts` (red-first check): failed as expected on the masked `sungjik:15:5` declaration (`Expected: "dialogue"`, `Received: "table"`).
- `npm test -- --no-cache --runInBand src/exams/reference-archetype.golden.spec.ts`: passed, 1 suite and 5 tests.
- `npm run typecheck`: passed with exit code 0.
- AST-grep structural checks found no `classifyReferenceArchetype(...)` call in fixture projection data; TypeScript LSP diagnostics were unavailable because the server is not installed and installation was previously declined.

## 2026-07-23 Task 3 completion
Step 1 now sends the deterministic request archetype in both frame and payload planner contracts. The provider frame schema still excludes `archetype`; `validateReferenceFrameJson(..., request.archetype)` remains the trust boundary, so omitted model output is attached from the request and a model-emitted replacement is rejected as `UNKNOWN_FIELD`.

Reference-frame cache reads now reuse a row only when source identity, subject, unit range, cache contract version, row fingerprint, and persisted frame archetype version/fingerprint all match the newly derived archetype. Missing or incompatible metadata regenerates the frame and updates the existing row in place with version and fingerprint. Warm-up writes the same metadata and applies the same stale-row rule.

The final-generation prompt now carries an explicit structural `archetype` alongside `frame` and `payload` while omitting the raw `reference` object. A focused integration assertion verifies that final prompt variants have the archetype and no source-bearing reference field.

Verification results:
- `npm test -- --runInBand src/exams/reference-frame-planner.service.spec.ts src/exams/reference-frame-generation.integration.spec.ts` (from `backend/`): passed, 2 suites and 5 tests.
- `npm run typecheck` (from `backend/`): passed with exit code 0.
- `npm test -- --runInBand src/exams/reference-frame-generation.service.spec.ts` (from `backend/`): passed, 1 suite and 5 tests, including missing-archetype cache regeneration and in-place cache update assertions.
- `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts` (from `backend/`): passed, 1 suite and 18 tests.
- AST-grep confirmed the generation path calls `planner.plan(plannerRequest, cachedFrameForPlanning)` and found both cache creation sites carrying `contractVersion` and `archetypeFingerprint`.
- TypeScript LSP diagnostics were unavailable because the server is not installed and installation was previously declined. The no-excuse checker reports 13 pre-existing violations in `exam-regenerator.service.ts`; no new suppression or escape hatch was added.

## 2026-07-23 Task 4 completion
Step 2 now validates ConceptPayload against the trusted Step 1 archetype for information shape, response mode/encoding, combination claim cardinality/topology, concept-role cardinality, evidence-block/view requirements, and distractor transformation families. The source archetype now carries a structural combination plan, concept-role cardinality, and source-free shared-set position; generation keeps the full selected concept set available to preserve multi-concept roles.

TPL selection now uses an exhaustive typed material/response compatibility map, intersects it with the ordinary information-shape candidate, and returns `TPL_SELECTION_REJECTED` when the intersection is empty or the model-selected template is outside the archetype allowance. The generation path passes `request.frame.archetype` into selector validation, so conversational fallback is unavailable.

Verification results:
- `npm test -- --runInBand src/exams/reference-tpl-selector.spec.ts src/exams/reference-frame-planner.validation.spec.ts` (from `backend/`): passed, 2 suites and 33 tests.
- `npm run typecheck` (from `backend/`): passed with exit code 0.
- `npm test -- --runInBand src/exams/reference-frame-planner.service.spec.ts src/exams/reference-frame-generation.integration.spec.ts src/exams/reference-frame-generation.service.spec.ts` (from `backend/`): passed, 3 suites and 10 tests.
- AST-grep found the production selector calls in `exam-regenerator.service.ts` and the generation integration path; both pass the archetype argument. The no-excuse checker reports the same 13 pre-existing violations in `exam-regenerator.service.ts`; no new suppression or escape hatch was added.

Final cache-contract correction: `REFERENCE_ARCHETYPE_VERSION` and the frame-cache contract are now version `3`, so rows written before the new combination/concept-role/set fields cannot be reused as if they were complete. The final focused Jest command remained green with 2 suites and 33 tests; `npm run typecheck` remained green with exit code 0; the adjacent planner/generation command passed with 3 suites and 10 tests.

## 2026-07-23 Task 5 completion
`sourceFreeArchetypeProjection()` now supplies the final request with source-free material kind, document shell/register, response and combination topology, ordered evidence blocks, target/supporting concept roles, distractor transformations, information and reasoning order, set structure, view keys, and answer-plan option subsets. The raw selected-reference display fields remain outside this projection; a focused test uses opaque source markers to prove the prompt excludes stem, stimulus, view-item, and choice display values.

The strict final output schema now requires a non-rendered `fidelityTrace` whose structural fields are `shell`, `evidenceBlocks`, `conceptRoles`, `distractorTransformations`, `informationOrder`, `reasoningPattern`, `reasoningSteps`, `combinationPlan`, `setLinkage`, `viewItems`, and `optionSubsets`. Its arrays are cardinality-bound from the generation request and all nested objects reject unknown fields. This gives Task 6 explicit structural trace boundaries without persisting or rendering the trace.

Focused fixture drift from Task 4 was corrected only in the target reference-variant spec: matrix output now uses a compatible table archetype, and the interview scenario derives a compatible dialogue archetype. No production behavior outside the reference-variant path changed.

Verification results:
- Red-first focused suite initially failed as expected because `archetypeProjection` was absent and `fidelityTrace` still had `preserved`/`rewritten` free-text fields.
- `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts src/exams/reference-final-output-schema.spec.ts` (from `backend/`): passed, 2 suites and 31 tests.
- `npm run typecheck` (from `backend/`): passed with exit code 0.
- `git diff --check` for the four scoped files: passed with no whitespace errors.
- `reference-final-output-schema.ts` measures 248 pure LOC and retains a single responsibility: final structured-output schema construction. Split it before any substantial next expansion.
- TypeScript LSP remains unavailable because the server is not installed and installation was previously declined; the required typecheck was used instead.

## 2026-07-23 Task 6 completion
`validateReferenceArchetypeFidelity()` now constructs a source-free expected trace from the trusted archetype, structural blueprint, and ConceptPayload, then recursively compares every contract-defined value. It rejects material and shell properties, evidence blocks and order, target/supporting concept coverage, distractor axes, information and reasoning order, view keys/count, combination plan and answer subsets, and set linkage with the first mismatching `fidelityTrace` path.

The reference regeneration path performs that check after existing template, answer, topology, conversation, and renderability checks but before constructing the persisted result. A fidelity rejection uses the existing bounded retry (`retryAttempt < 2`) and gives the model a correction containing `path`, trusted source-free `expected`, and a safe actual structural descriptor. Unexpected strings are represented only by their length, so invalid trace values cannot echo source display prose. Legacy-envelope repair now retains `fidelity_trace` as `fidelityTrace` for the same check.

Focused regression coverage supplies a valid trace to every reference-variant fixture and exercises eleven independently rejected drifts: material kind, shell flag, evidence order, concept-role cardinality, distractor axis, view count, combination topology, option subset atoms, information order, reasoning order, and shared-set linkage. Each proves three total bounded attempts with no result persisted; a separate case proves a reworded faithful retry persists. The material-drift test injects the existing opaque source marker into the invalid trace and proves that it is absent from the correction request.

Verification results:
- `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts` (red-first): failed as expected with 1 suite, 31 tests, 12 failures, because each new fidelity drift was accepted on its first response before the validator existed.
- `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts` (final): passed, 1 suite and 31 tests.
- `npm test -- --runInBand src/exams/reference-variant-repair.spec.ts`: passed, 1 suite and 3 tests.
- `npm run typecheck`: passed with exit code 0.
- `git diff --check`: passed with no whitespace errors.
- AST-grep found one production `validateReferenceArchetypeFidelity(...)` call in `exam-regenerator.service.ts`, immediately before accepted output is assembled.
- The no-excuse checker found no violations in `reference-generation-output-validator.ts`, `reference-variant-repair.ts`, or `exam-regenerator.reference-variant.spec.ts`. It continues to report the 13 documented pre-existing violations in legacy portions of `exam-regenerator.service.ts`.
- TypeScript LSP remains unavailable because the server is not installed and installation was previously declined; `npm run typecheck` was used as the mandatory type gate.

## 2026-07-23 Task 7 combination-plan count repair
`parseResponse()` now compares `response.combinationPlan.expectedAnswerCount` and `optionCount` with the trusted selected archetype plan while retaining five choices, five options, and topology validation. The provider frame schema accepts positive structural combination counts, and the planner still passes the request archetype into the frame validator; a model response cannot replace that trusted value. Focused regression coverage accepts the inspection-checklist three-key count and rejects a mismatched count at the existing `response` contract path.

Verification results:
- `npm test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts src/exams/reference-frame.contract.spec.ts src/exams/reference-frame.provider-schemas.spec.ts` (from `backend/`): passed, 3 suites and 49 tests.
- `npm test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts src/exams/reference-frame-planner.service.spec.ts src/exams/reference-frame-generation.integration.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/reference-frame.contract.spec.ts src/exams/reference-frame.provider-schemas.spec.ts` (from `backend/`): 5 suites passed, 1 pre-existing integration suite failed because its final-generation fixture omits the required `fidelityTrace`; the planner, frame, contract, provider-schema, and generation-service suites passed (58 tests passed, 1 failed).
- `npm run typecheck` (from `backend/`): passed with exit code 0 after the final edits.
- TypeScript no-excuse checker: passed with no violations in all 8 changed TypeScript files.
- `git diff --check`: passed with no whitespace errors.
- `REFERENCE_LIVE_QA=1 REFERENCE_LIVE_QA_ARCHETYPE=inspection_checklist npm run test:reference-live` (from `backend/`): reached the live planner after starting the existing Nest service, but exited 1 twice after three retries on `REFERENCE_PLANNER_REJECTED`, `INVALID_FIELD_VALUE`, `validationPath=conceptPayload.supportingConceptIds`; no five-count frame rejection remained. Cleanup removed the QA user/job each time.
- TypeScript LSP diagnostics remain unavailable because the server is not installed and installation was previously declined.

## 2026-07-23 Shared-pair selector repair
`parseReference()` now permits an empty trimmed stimulus only after archetype classification confirms `setStructure.position === 'shared_pair'`. Non-empty stimuli retain the normal validation path, and empty stimuli for standalone sources remain rejected. Focused regression coverage exercises both shared-set roles and the non-shared rejection without exposing source prose.

Verification results:
- `npm test -- --runInBand src/exams/reference-selector.service.spec.ts` (from `backend/`): passed, 1 suite and 15 tests.
- `npm run typecheck` (from `backend/`): passed with exit code 0.
- `REFERENCE_LIVE_QA=1 REFERENCE_LIVE_QA_ARCHETYPE=shared_document_set npm run test:reference-live` (from `backend/`): the first attempt used a stale watch process and reported the former selector shortfall; after restarting the backend, the live selector accepted both requested source records and the job advanced to `REFERENCE_PLANNER_REJECTED,INVALID_FIELD_VALUE`. A second clean run reproduced that downstream planner rejection. Cleanup completed on both attempts; no selector shortfall remained.
- TypeScript LSP diagnostics remain unavailable because the server is not installed and installation was previously declined.

## 2026-07-23 ConceptPayload selected-partition repair
The reproduced planner failure was traced to the trusted source role counts versus the available selected concept partition. The four 공일 records carried target-concept counts 4, 3, 1, and 4, which classified to supporting-role maxima 3, 2, 0, and 3. The unit catalog exposed two usable concepts, so the planner could not emit the exact 3/2/3 supporting counts for the selected `target=1` partition. The contract now requires one supporting concept when the trusted archetype requires support, caps it at the trusted maximum, and retains uniqueness and catalog identifier checks. The provider schema and correction prompt use the same bounded cardinality.

Focused regression coverage accepts a three-concept archetype with one selected supporting concept and rejects the same archetype with no required supporting concept. The existing out-of-catalog identifier rejection remains green.

Verification results:
- `REFERENCE_LIVE_QA=1 REFERENCE_LIVE_QA_ARCHETYPE=inspection_checklist npm run test:reference-live` (from `backend/`): passed with `TPL_COMPARATIVE_MATRIX`, one persisted item, and cleanup receipt `users=1, exams=1, questions=1, notifications=1, refreshTokens=1, job=removed`.
- `REFERENCE_LIVE_QA=1 REFERENCE_LIVE_QA_ARCHETYPE=shared_document_set npm run test:reference-live` (from `backend/`): passed for both requested source records with `TPL_CONVERSATIONAL_FLOW` and `TPL_COMPARATIVE_MATRIX`, two persisted items, and cleanup receipt `users=1, exams=1, questions=2, notifications=1, refreshTokens=1, job=removed`.
- `REFERENCE_LIVE_QA=1 REFERENCE_LIVE_QA_ARCHETYPE=incident_report npm run test:reference-live` (first run): provider reached a separate `PAYLOAD_EVIDENCE_BLOCK_MISMATCH`; cleanup receipt removed the job. A sequential retry passed with `TPL_COMPARATIVE_MATRIX`, one persisted item, and cleanup receipt `users=1, exams=1, questions=1, notifications=1, refreshTokens=1, job=removed`.
- `npm test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts src/exams/reference-frame.provider-schemas.spec.ts src/exams/reference-frame.contract.spec.ts` (from `backend/`): passed, 3 suites and 51 tests.
- `npm run typecheck` (from `backend/`): passed with exit code 0.
- TypeScript LSP diagnostics remain unavailable because the server is not installed and installation was previously declined.
