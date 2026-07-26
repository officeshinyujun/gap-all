# reference-grounded-question-fidelity - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Generated reference variants that use new wording but preserve the real item's fact order, conditional logic, required reasoning path, and how choices are constructed. The pipeline will reject a structurally different rewrite rather than accepting it because its JSON renders correctly.

**Why this approach:** The final generator currently receives only a coarse frame, not a representation of the source item's semantic structure. An anonymized structure blueprint makes fidelity explicit without sending the original prose for near-verbatim copying.

**What it will NOT do:** It will not copy the original question text, modify the frontend, or regenerate existing stored questions. It will not weaken rendering, answer-format, or choice-count validation.

**Effort:** Large
**Risk:** Medium - model-derived semantic structure must be made deterministic enough to validate and retry reliably.
**Decisions to sanity-check:** New wording is mandatory; fact order, condition dependencies, reasoning steps, and distractor logic are mandatory fidelity constraints.

Your next move: start work, or request a high-accuracy review of this plan. Full execution detail follows below.

---

> TL;DR (machine): Large, medium-risk contract change that adds source-derived structure blueprints, semantic fidelity validation, focused regression tests, and reference-vs-variant manual QA.

## Scope
### Must have

- An anonymized, source-derived structure blueprint that captures ordered facts, condition/exception dependencies, required reasoning steps, and the logical role of each choice/view item.
- A planner contract that produces and validates this blueprint from a selected reference without emitting original source phrases as output requirements.
- A final-generation contract that requires newly written Korean surface text while following the blueprint across the stem, stimulus, combo block, choices, and explanation.
- Deterministic trace checks plus a semantic fidelity review/retry that reject reordered facts, reversed conditions, omitted reasoning steps, and altered distractor/choice logic.
- Regression tests, typecheck, and an end-to-end generated comparison against a cited real question.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do not put raw reference prose in the final-generation prompt or permit near-verbatim copying.
- Do not weaken canonical TPL selection, response topology, choice/view cardinality, answer encoding, or renderer validation.
- Do not change the frontend question renderer, the `sourceType: 'ai'` path, reference selection policy, or persisted historical question data.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + focused Jest specs, `npm run typecheck`, and `npm run build` from `backend/`.
- Evidence: `.omo/evidence/reference-grounded-question-fidelity/task-<N>.md`; capture command, exit status, fixture/output identity, and observed assertion or manual comparison.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

Wave 1 defines the immutable structure contract and its planner/cache boundary. Wave 2 consumes the contract in final generation and validates it. Wave 3 locks behavior with regression coverage and drives one real generation through the service surface.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4, 5, 6 | none |
| 2 | 1 | 3, 4, 5, 6 | none |
| 3 | 1, 2 | 4, 5, 6 | none |
| 4 | 1, 2, 3 | 5, 6 | none |
| 5 | 1, 2, 3, 4 | 6 | none |
| 6 | 1, 2, 3, 4, 5 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
- [ ] 1. Define and validate an anonymized reference-structure blueprint
  What to do / Must NOT do: Extend `ReferenceFrame` or introduce a focused adjacent type to represent ordered information units, condition/exception links, reasoning steps, and choice/view-item roles. Add provider schema and parser validation that reject source phrases in the blueprint and incomplete or cyclic relations. Do not use a loose prose summary as the contract.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5, 6
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame.types.ts:54`, `backend/src/exams/reference-frame.provider-schemas.ts`, `backend/src/exams/reference-frame.frame-validator.ts`, `backend/src/exams/reference-frame.validation-utils.ts`, `backend/src/exams/reference-frame.contract.spec.ts`, `backend/src/exams/reference-frame.provider-schemas.spec.ts`
  Acceptance criteria (agent-executable): New fixtures accept a paraphrase-safe ordered blueprint and reject missing order, reversed conditional endpoints, duplicate identifiers, unreferenced choice roles, and raw source phrases; `npm test -- reference-frame.contract.spec.ts reference-frame.provider-schemas.spec.ts --runInBand` exits 0.
  QA scenarios (name the exact tool + invocation): Happy: parse a blueprint that represents a conditional source item and inspect its canonical order. Failure: submit a reordered/cyclic blueprint and observe a typed contract rejection. Evidence `.omo/evidence/reference-grounded-question-fidelity/task-1.md`
  Commit: Y | `feat(reference-frame): model source question structure`

- [ ] 2. Produce, cache, and propagate the structure blueprint through planning
  What to do / Must NOT do: Update planner prompts and planner validation to extract the structure blueprint from the selected reference alongside the frame; version or invalidate cached frames that lack it; propagate the validated blueprint into `ReferenceVariantGenerationRequest`. Do not rely on raw source text reaching final generation.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4, 5, 6
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-planner.prompts.ts:7`, `backend/src/exams/reference-frame-planner.service.ts:85`, `backend/src/exams/reference-frame-generation.service.ts:125`, `backend/src/exams/reference-frame-cache.entity.ts`, `backend/src/exams/reference-archetype.ts:159`, `backend/src/exams/reference-frame-generation.service.spec.ts`, `backend/src/exams/reference-frame-planner.service.spec.ts`
  Acceptance criteria (agent-executable): A mocked planner response with the blueprint reaches the request passed to `regenerateReferenceBatch`; a legacy cached frame missing the field is regenerated rather than used; targeted generation/planner tests exit 0.
  QA scenarios (name the exact tool + invocation): Happy: inspect mocked generation-call input and confirm no raw source prose but a full blueprint is present. Failure: seed a stale cache payload and observe the planner path replace it. Evidence `.omo/evidence/reference-grounded-question-fidelity/task-2.md`
  Commit: Y | `feat(reference-frame): propagate structure blueprints`

- [ ] 3. Replace the lexical anti-copy prompt policy with a structure-preserving generation contract
  What to do / Must NOT do: Update `buildReferenceBatchRegenPrompt` to supply the blueprint and explicitly require new wording with preserved fact order, relations, reasoning, and choice roles. Remove `forbiddenSourceTokens` and `forbidSourceNamesDatesValuesCaseFactsAndPhrases` as the final output policy. Do not send raw reference strings or relax output schemas.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4, 5, 6
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-regenerator.service.ts:80`, `backend/src/exams/exam-regenerator.service.ts:211`, `backend/src/exams/exam-regenerator.service.ts:575`, `backend/src/exams/reference-final-output-schema.ts`, `backend/src/exams/exam-regenerator.reference-variant.spec.ts:158`
  Acceptance criteria (agent-executable): A prompt snapshot includes the normalized blueprint and explicit new-wording requirement, excludes raw reference stem/stimulus/view/choice strings, and retains selected TPL/cardinality/answer-format requirements.
  QA scenarios (name the exact tool + invocation): Happy: parse the mock model request and assert its blueprint and no-source-prose constraints. Failure: assert a legacy source-token policy is absent and the test fails if raw source is inserted into the request. Evidence `.omo/evidence/reference-grounded-question-fidelity/task-3.md`
  Commit: Y | `feat(regenerator): require structural reference fidelity`

- [ ] 4. Add output provenance traces and deterministic structure-fidelity validation
  What to do / Must NOT do: Extend final-output schema with non-rendered fidelity evidence that maps blueprint identifiers to rendered surfaces, then validate required coverage, relation direction, ordered facts, reasoning steps, and choice-role mapping in `transformReferenceQuestion`. Remove or scope out `hasSourceCopy` and source-copy-specific correction logic. Preserve all existing TPL, marker, topology, answer-encoding, and renderability rejections.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-final-output-schema.ts`, `backend/src/exams/exam-regenerator.service.ts:273`, `backend/src/exams/exam-regenerator.service.ts:308`, `backend/src/exams/exam-regenerator.service.ts:652`, `backend/src/exams/reference-final-output-schema.spec.ts`, `backend/src/exams/exam-regenerator.reference-variant.spec.ts:445`
  Acceptance criteria (agent-executable): Valid paraphrased output with complete trace is accepted; missing/reordered fact IDs, reversed conditions, absent reasoning step, and changed choice-role trace reject with a dedicated fidelity reason; formerly forbidden lexical overlap alone does not reject.
  QA scenarios (name the exact tool + invocation): Happy: generate a fixture with changed Korean wording and a complete valid trace. Failure: mutate each trace category one at a time and inspect the targeted rejection. Evidence `.omo/evidence/reference-grounded-question-fidelity/task-4.md`
  Commit: Y | `feat(regenerator): validate structure fidelity`

- [ ] 5. Add semantic fidelity review and targeted regeneration correction
  What to do / Must NOT do: Add a bounded model-backed review over the blueprint and generated rendered surfaces to catch a trace that is syntactically complete but semantically dishonest. Feed a specific correction back into the existing retry loop for the mismatch category. Do not create an unbounded retry loop or use the reviewer to rewrite questions directly.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3, 4 | Blocks: 6
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-planner.model-client.ts`, `backend/src/exams/reference-generation-model.ts`, `backend/src/exams/exam-regenerator.service.ts:432`, `backend/src/exams/exam-regenerator.service.ts:641`, `backend/src/exams/reference-frame-planner.service.ts:183`, `backend/src/exams/exam-regenerator.reference-variant.spec.ts`
  Acceptance criteria (agent-executable): A mocked semantic reviewer accepts a faithful paraphrase, rejects a changed condition despite a complete trace, and causes exactly one regeneration attempt with the mismatch details; no retry occurs after a passing review.
  QA scenarios (name the exact tool + invocation): Happy: reviewer returns approved and output persists. Failure: reviewer rejects condition direction and model request count shows one corrected retry. Evidence `.omo/evidence/reference-grounded-question-fidelity/task-5.md`
  Commit: Y | `feat(regenerator): review semantic reference fidelity`

- [ ] 6. Lock the policy with reference fixtures and exercise the live generation surface
  What to do / Must NOT do: Build fixtures from the cited official reference records, including a generated paraphrase that preserves structure and counterexamples that do not. Run targeted Jest tests, backend typecheck/build, then invoke the reference-frame generation service with a controlled model fixture and compare all rendered surfaces against the blueprint. Do not call a paid external model for automated test runs.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3, 4, 5 | Blocks: final verification
  References (executor has NO interview context - be exhaustive): `textbook/parsed/sungjik/moi/2022_6월_모의평가.json` question 20, `textbook/transformed-questions/success/16단원.json` `questions[2]`, `backend/src/exams/reference-frame-generation.service.spec.ts`, `backend/src/exams/exam-regenerator.reference-variant.spec.ts`, `backend/package.json:8`
  Acceptance criteria (agent-executable): `npm test -- reference-frame-generation.service.spec.ts exam-regenerator.reference-variant.spec.ts --runInBand`, `npm run typecheck`, and `npm run build` exit 0; fixture-driven generation returns a renderable question whose checker confirms complete structural fidelity.
  QA scenarios (name the exact tool + invocation): Happy: run the controlled service fixture and inspect generated stem, stimulus, combo, choices, explanation, and fidelity trace. Failure: inject a reordered condition fixture and observe rejection/retry rather than persistence. Evidence `.omo/evidence/reference-grounded-question-fidelity/task-6.md`
  Commit: Y | `test(reference-generation): cover structure-preserving variants`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Verify every implementation task has completed evidence, no scope-out file changed, and each success criterion maps to a captured command or fixture result.
- [ ] F2. Code quality review
  Review the final diff for strict typing, cache-version safety, bounded retries, source-prose exclusion, and preservation of existing structural validators.
- [ ] F3. Real manual QA
  Drive the controlled reference-frame generation fixture, inspect the render-ready output against the source blueprint, then repeat with a reversed-condition fixture and observe rejection/retry.
- [ ] F4. Scope fidelity
  Confirm the delivered behavior is structure-preserving with newly written wording, not near-verbatim source duplication or a frontend/general-AI-generator change.

## Commit strategy

Use one commit per completed todo in dependency order. Keep type/schema, planner propagation, prompt contract, validator/retry, semantic review, and end-to-end regression coverage independently reviewable. Do not stage unrelated dirty-worktree changes.

## Success criteria

- Final generation receives a validated anonymized structure blueprint and no raw source question prose.
- Generated variants use new wording while preserving blueprint fact order, conditional direction, reasoning steps, and choice/view-item logic.
- Lexical overlap is not by itself a rejection reason; structural mismatch is.
- Existing TPL, cardinality, answer encoding, and renderability checks still reject invalid output.
- Focused Jest suites, `npm run typecheck`, and `npm run build` pass.
- A controlled reference-frame generation run demonstrates a faithful paraphrase and a rejected structural mismatch.
