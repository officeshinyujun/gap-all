# integrated-reference-generation-boundaries - Work Plan

## TL;DR (For humans)

**What you'll get:** Reference-based generation will always use its own typed generation path. New questions will use newly written prose while preserving the source question's information order, conditional logic, reasoning sequence, and distractor/choice roles.

**Why this approach:** Contract validation must reject invalid data, not decide which prompt family to use. Explicit legacy/reference APIs prevent a contract migration from silently routing valid reference work through a generic legacy prompt.

**What it will NOT do:** No frontend or HTTP payload redesign, no corpus-wide rewrite, no raw source-prose copying, and no relaxed TPL/rendering constraints.

**Effort:** Large
**Risk:** Medium - contracts, cached frames, fixtures, and two generation flows must migrate atomically.
**Decisions to sanity-check:** New wording is mandatory; structure is mandatory; job progress behavior remains unchanged.

Your next move: run the required plan reviews, then start work in a dedicated worker session.

---

> TL;DR (machine): Split prompt ownership, complete typed frame/payload contracts, centralize fixtures, enforce structure fidelity, and verify both production routes.

## Scope

### Must have

- Separate typed APIs for legacy regeneration and reference-variant regeneration.
- An atomic V2 `structureBlueprint`, `groundingLexicon`, and `answerPlan` cutover across types, provider schemas, parsers, planner output, cache handling, fixtures, and consumers; no intermediate partially-required contract commit.
- Shared valid/invalid fixture factories for every affected test suite.
- Structure-preserving final generation with new visible wording, semantic-atom and deterministic trace validation, local novelty validation, and a three-attempt bounded correction state machine while preserving TPL/answer/rendering guards.
- Regression coverage for synchronous and job routes, `sourceType: 'ai'`, omitted `sourceType`, metrics fixtures, existing job progress semantics, typecheck, build, and controlled generation.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do not use `validateReferenceFrame` or `validateConceptPayload` as prompt-family routing predicates.
- Do not pass raw source prose to the final generator, permit near-verbatim output, add unbounded retries, or weaken existing output validators.
- Do not alter frontend behavior, public endpoint DTOs, `sourceType` semantics, AI-only generation behavior, persisted historical data, or job-progress behavior.

## Verification strategy

- Test decision: TDD with focused Jest specs followed by `npm run typecheck` and `npm run build` in `backend/`.
- Evidence: `.omo/evidence/integrated-reference-generation-boundaries/task-<N>.md`, including command, exit status, fixture identity, and observed success/failure assertion.
- Test no external model in automated runs; use fake planner/reviewer/generator clients and controlled fixture outputs.

## Execution strategy

### Parallel execution waves

Wave 1 establishes contracts and test factories. Wave 2 separates typed runtime ownership and migrates planner/cache consumers. Wave 3 applies final fidelity validation and full-system regression coverage.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2-8 | none |
| 2 | 1 | 3-8 | none |
| 3 | 1,2 | 4-8 | none |
| 4 | 1,2,3 | 5-8 | none |
| 5 | 1-4 | 6-8 | none |
| 6 | 1-5 | 7,8 | none |
| 7 | 1-6 | 8 | none |
| 8 | 1-7 | final verification | none |

## Todos

- [ ] 1. Land the compilable V2 frame/payload contract cutover atomically.
  What to do / Must NOT do: Together with Todos 2-3, form one atomic Wave-1 V2 cutover commit: make `ReferenceFrame.structureBlueprint`, `ReferenceFrame.groundingLexicon`, and `ConceptPayload.answerPlan` required; add cache entity version/fingerprint fields and a migration that invalidates V1 rows; replace legacy `claims`/`answerEncodingPlan` across every type/schema/parser/producer/consumer; and add non-source-prose semantic atoms. An atom is exactly `{ id: /^atom_[a-z0-9_]+$/, subjectSlot, predicateKind, operator, objectSlot, quantityRole, polarity }`. Exact enum vocabularies are: `subjectSlot = actor_a|actor_b|actor_c|organization_a|organization_b|artifact_a|process_a|policy_a`; `predicateKind = has_status|satisfies_condition|violates_condition|applies_rule|produces_outcome|compares|requires|excludes|changes_quantity`; `operator = equals|not_equals|greater_than|less_than|at_least|at_most|includes|excludes|before|after|conditional`; `objectSlot = actor_a|actor_b|actor_c|organization_a|organization_b|artifact_a|process_a|policy_a|null`; `quantityRole = threshold|amount|count|rate|duration|sequence|null`. `objectSlot` is null only for `has_status`; `quantityRole` is non-null only for `changes_quantity`, `greater_than`, `less_than`, `at_least`, or `at_most`; `conditional` is allowed only for `satisfies_condition`, `violates_condition`, `applies_rule`, or `produces_outcome`. Define `groundingLexicon` as `{ entities: readonly { slot: subjectSlot, class: 'person'|'organization'|'artifact'|'process'|'policy' }[], quantities: readonly { id: /^quantity_[a-z0-9_]+$/, role: quantityRole, value: number, unit: 'won'|'person'|'hour'|'percent'|'count'|'day'|'month'|'year'|'ordinal' }[], rules: readonly { id: /^rule_[a-z0-9_]+$/, conceptId: /^concept_[a-z0-9_]+$/, polarity: boolean }[], bindings: readonly { atomId, entitySlots, quantityIds, ruleIds }[] }`. The authoritative concept catalog is `TextbookService.getConcepts(subjectSlug, startUnit, endUnit)` reading `TEXTBOOK_BASE_PATH/concepts/{sungjik|kongil}/Unit_XX.json`; create a server-only `ReferenceConceptCatalogResolver` that derives `conceptId = concept_${sha256(`${subject}:${unit}:${canonicalLabel}`).slice(0, 16)}` for each returned concept. Resolve each planner `conceptId` only through that resolver in the selected subject/unit range into `catalogConcepts: readonly { id, subject: 'success'|'kongil', unit: number, canonicalLabel: string, ruleTags: readonly ('eligibility'|'exception'|'obligation'|'comparison'|'calculation'|'sequence')[] }[]`; unknown ID, a label not equal to the resolver result, or a planner-supplied label is rejected. `canonicalLabel` is server-derived textbook catalog data, never planner/model output, and is the only human-readable semantic vocabulary allowed in final/reviewer input. It preserves factual grounding as typed slots, exact numeric values, units, catalog concept IDs, and catalog-resolved rule labels while prohibiting names, dates, sentence fragments, planner labels, or arbitrary prose. The final generator and semantic reviewer receive this lexicon plus resolved catalog concepts; local novelty alone receives raw source. Unit `kind = context|condition|exception|conclusion`; relation `kind = condition_of|exception_to|comparison_of|sequence_before`, where condition/exception relations start at matching unit kinds and end at a conclusion, comparison links two context/conclusion units, and sequence targets a later unit; step `operation = identify_condition|apply_exception|compare|derive_conclusion`; item role is `correct|condition_omission|condition_reversal|exception_omission|irrelevant|premise|condition|conclusion`. Information units may contain only atom ID arrays, positive `order`, and unit kind; relations/steps/roles may contain only IDs, positive indices/orders, booleans, and these enumerated kinds. No V2 field may accept arbitrary human-readable text. The parser must recursively reject non-enum string values, strings failing the identifier grammar, and any normalized source phrase of four tokens/16 characters in a V2 value. Include ordered units, directed relations, reasoning dependencies, and choice/view-item roles. Do not leave optional V1/V2 fields or adapters after this todo.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2-8
  References: `backend/src/exams/reference-frame.types.ts`, `reference-structure-blueprint.validator.ts`, `reference-frame.frame-validator.ts`, `reference-frame.payload-validator.ts`, `reference-frame.provider-schemas.ts`, `reference-frame.contract.spec.ts`
  Acceptance criteria: `npm test -- reference-frame.contract.spec.ts reference-frame.provider-schemas.spec.ts --runInBand` passes; valid enum-only semantic atoms and catalog-resolved concepts parse; resolver tests prove the same `TextbookService` subject/unit concept produces the documented SHA-256 ID and canonical label; missing order, arbitrary text fields, raw-prose identifiers/values, unknown/out-of-scope concept IDs, planner-provided concept labels, duplicate IDs, reversed/cyclic relations, dangling references, duplicate options, invalid polarity, and invalid answer encodings reject with stable reason/path assertions.
  QA scenarios: Run the command above; mutate each canonical fixture with `unit_3.order` missing, a copied Korean phrase ID, a copied Korean value, arbitrary predicate text, reversed `condition_of`, and a duplicate option ID; each expected assertion passes. Evidence `.omo/evidence/integrated-reference-generation-boundaries/task-1.md`.
  Commit: N | Included in the atomic Wave-1 cutover commit after Todo 3.

- [ ] 2. Bind planner output to the V2 contracts without raw phrase leakage.
  What to do / Must NOT do: Update frame/payload JSON schemas, planner prompts, response binding, and planner reason checks so the planner emits the enum/identifier-based V2 semantic atom grammar, typed `groundingLexicon`, and V2 answer plans. The planning prompt may read source material but its structured response must contain no recoverable source sentence/phrase; run the V2 leakage validator against the selected raw reference before accepting planner output. Do not reintroduce legacy fields, optionality, or free-text semantic fields.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3-8
  References: `reference-frame.provider-schemas.ts`, `reference-frame-planner.prompts.ts`, `reference-frame-planner.service.ts`, `reference-frame-planner.types.ts`, `reference-frame.provider-schemas.spec.ts`, `reference-frame-planner.validation.spec.ts`
  Acceptance criteria: `npm test -- reference-frame-planner.service.spec.ts reference-frame-planner.validation.spec.ts reference-frame.provider-schemas.spec.ts --runInBand` passes; provider schema, bound prompt output, and parser require identical V2 fields; legacy response rejects before final generation.
  QA scenarios: Mock one valid V2 planner response and one legacy `claims` response; assert the former reaches `planned` and the latter returns the expected planner rejection. Evidence task-2.
  Commit: N | Included in the atomic Wave-1 cutover commit after Todo 3.

- [ ] 3. Centralize V2 fixtures and migrate every contract consumer before routing changes.
  What to do / Must NOT do: Expand `reference-frame-planner.fixtures.ts` into the single fixture factory authority for valid frame, payload, blueprint, answer plan, reference request, and controlled invalid variants. Migrate independent builders in planner, generation, selector, TPL-selector, regenerator, and metrics specs. Do not retain duplicate hand-maintained happy-path contracts.
  Parallelization: Wave 1 | Blocked by: 1,2 | Blocks: 4-8
  References: `reference-frame-planner.fixtures.ts`, `reference-frame-generation.service.spec.ts`, `reference-frame-generation.integration.spec.ts`, `exam-regenerator.reference-variant.spec.ts`, `reference-tpl-selector.spec.ts`, `reference-generation-metrics.ts`, `reference-generation-metrics.spec.ts`
  Acceptance criteria: `npm test -- reference-frame-generation.service.spec.ts reference-frame-generation.integration.spec.ts reference-tpl-selector.spec.ts exam-regenerator.reference-variant.spec.ts reference-generation-metrics.spec.ts --runInBand` passes; repository search finds no test fixture using legacy `claims` or `answerEncodingPlan` outside an intentional V1 rejection case.
  QA scenarios: Remove `semanticAtoms` from the shared V2 factory and confirm every selected consumer fails through the shared factory; restore it and rerun the command successfully. Evidence task-3.
  Commit: Y | `feat(reference-generation): atomically cut over V2 contracts, planner output, and fixtures`

- [ ] 4. Define cache read/write semantics and propagate canonical typed requests.
  What to do / Must NOT do: Treat `ReferenceFrameCache` as a versioned frame-stage cache only: a valid V2 cache entry skips only frame extraction, never concept-payload planning; cache validity requires contract version, source ID/hash, archetype fingerprint, subject, and unit range. The version/fingerprint entity change and V1-row invalidating migration land in Todo 1's atomic cutover; this todo implements and verifies only cache read/write predicates against that completed schema. Normalize fresh frame plus fresh payload into `ReferenceVariantGenerationRequest`.
  Parallelization: Wave 2 | Blocked by: 1,2 | Blocks: 5-8
  References: `backend/src/entities/reference-frame-cache.entity.ts`, `backend/src/migrations/`, `reference-frame-generation.service.ts:209`, `reference-generation-persistence.ts`, `reference-frame-generation.service.spec.ts`, `warm-reference-frames.ts`
  Acceptance criteria: `npm test -- reference-frame-generation.service.spec.ts reference-frame-generation-persistence.spec.ts --runInBand` passes; valid V2 cache skips only `planFrame`, stale source/hash/version/fingerprint/scope cache uses planner, and no cache entry supplies the payload.
  QA scenarios: Fake cache hit with matching V2 metadata and assert one payload plan; mutate each cache predicate and assert frame planner is called; execute migration test against V1 row and assert invalidation. Evidence task-4.
  Commit: Y | `feat(reference-generation): propagate versioned planner contracts`

- [ ] 5. Split prompt ownership and create a source-free final prompt projection.
  What to do / Must NOT do: Replace `buildBatchRegenPrompt(any[])` with a typed legacy-only builder and a typed reference-only builder. Make malformed reference input reject at `regenerateReferenceBatch` before any legacy builder can run. Define `ReferenceFinalPromptProjection` as an exact allowlist: `subject`, `unitRange`, `difficulty`, `selectedTemplate`, `response` constraints (`mode`, `choiceEncoding`, `choiceCount`, `viewItemCount`), `materialDensity`, V2 `semanticAtoms`, V2 `groundingLexicon`, server-resolved `catalogConcepts`, V2 `informationUnits`, V2 `relations`, V2 `reasoningSteps`, V2 `itemRoles`, V2 `answerPlan`, selected TPL schema, and response field constraints. `choiceCount` remains exactly 5 under the existing `ResponseStructure` contract; `viewItemCount` controls all indexed view-item mappings. Retain raw source only in runtime-only postprocessing/novelty input and never serialize it to the final model prompt.
  Parallelization: Wave 2 | Blocked by: 3,4 | Blocks: 6-8
  References: `exam-regenerator.service.ts:182`, `exam-regenerator.service.ts:392`, `exam-regenerator.service.ts:1504`, `exam-generator.service.ts:1391`, `reference-frame-generation.service.ts:305`, `reference-generation-metrics.ts`, `exam-regenerator.service.spec.ts`, `exam-regenerator.reference-variant.spec.ts`
  Acceptance criteria: `npm test -- exam-regenerator.service.spec.ts exam-regenerator.reference-variant.spec.ts reference-generation-metrics.spec.ts --runInBand` passes; spies prove typed reference calls only the source-free reference builder, legacy calls only legacy builder, and malformed reference rejects without a model request or legacy fallback; projection serialization deep-equals the allowlist schema and contains no `source`, `stem`, `stimulus`, `viewItems`, or `choices` key at any depth.
  QA scenarios: Serialize a typed projection and recursively assert its keys equal the allowlist; inject each forbidden source field and assert parser/test rejection; run typed reference, malformed reference, legacy, and metrics fixtures with builder spies. Evidence task-5.
  Commit: Y | `refactor(regenerator): separate legacy and reference prompt APIs`

- [ ] 6. Enforce deterministic semantic fidelity and local novelty before accepting output.
  What to do / Must NOT do: Extend final output schema with non-rendered `fidelityTrace` entries of `{ surface: 'stem'|'stimulus'|'view_item'|'choice'|'explanation', surfaceIndex: number|null, atomIds, relationIds, reasoningStepIds }`. Deterministic matrix: `stem` has null index and may contain no IDs; `stimulus` has null index and may contain atoms/relations but no steps; `view_item` has index `0..viewItemCount-1`, exactly one atom, no relations/steps; `choice` has index `0..choiceCount-1`, no atoms/relations/steps and must map to the matching item role by index; `explanation` has null index and may contain atoms/relations/steps. Every atom must appear once in `stimulus` and at least once in either a `view_item` or `explanation`; every relation appears once in `stimulus` and once in `explanation`; every reasoning step appears once in `explanation`; each item role appears exactly once through its matching indexed trace. Duplicate entries with the same surface/index/ID are invalid, but the required cross-surface coverage above is permitted. Arrays establish order: atom IDs in stimulus follow information-unit order; relation IDs follow source-unit order; step IDs follow step order. Validation stops with this diagnostic priority: invalid surface/index, unknown ID, wrong surface/ID category, duplicate mapping, missing required coverage, order mismatch, role mismatch. Then semantic review compares rendered text with mapped atoms and server-resolved `catalogConcepts`; trace alone is never proof. Novelty comparison uses this fixed table: generated `stem` -> source `stem`; generated `stimulus` -> source `stimulus` (skip only when both are absent); generated `view_item[i]` -> source `viewItems[i]` for `i=0..viewItemCount-1`; generated `choice[i]` -> source `choices[i]` for `i=0..choiceCount-1`; generated `combo` means its ordered item texts and is compared using the `view_item[i]` rule; generated `explanation` is compared against concatenated source stem+stimulus+viewItems, because it has no corresponding source explanation. Reordered output items are rejected by trace/index validation before novelty comparison. Add a local novelty validator over runtime-only source text: NFC-normalize, lowercase, replace punctuation with spaces, split whitespace, discard markers/stopwords/allowlisted domain terms, then reject any mapped surface sharing a contiguous sequence of at least four remaining tokens and 16 normalized characters. The exact fixed allowlist is `①|②|③|④|⑤|ㄱ|ㄴ|ㄷ|ㄹ|다음|자료|보기|옳은|옳지|것|설명|해당|경우|조건|결과|대한|관한|따른`; append only tokens from server-resolved `catalogConcepts[].canonicalLabel`, never planner payload strings. Store this array as a versioned `REFERENCE_NOVELTY_ALLOWLIST_V1` constant; tests must cover each fixed marker/grammar category and a catalog-resolved term. Keep TPL/cardinality/marker/topology/answer/renderability checks unchanged.
  Parallelization: Wave 3 | Blocked by: 3,4,5 | Blocks: 7,8
  References: `exam-regenerator.service.ts:392`, `reference-final-output-schema.ts`, `reference-generation-output-validator.ts`, `exam-regenerator.reference-variant.spec.ts`, `reference-final-output-schema.spec.ts`
  Acceptance criteria: `npm test -- exam-regenerator.reference-variant.spec.ts reference-final-output-schema.spec.ts reference-generation-output-validator.spec.ts --runInBand` passes; faithful new wording accepts; copied four-token/16-character meaningful phrase rejects; unavoidable resolver-derived canonical-label terminology accepts; planner/payload concept strings never enter the allowlist; invalid trace surface/index/coverage/order rejects; reversed condition/polarity, missing step, and altered role reject with dedicated diagnostics.
  QA scenarios: Execute valid paraphrase, copied sentence, shared-domain-term, invalid surface index, missing atom coverage, reordered relation trace, reversed-condition, missing-reasoning, and changed-role fixtures; assert acceptance/rejection and reason. Evidence task-6.
  Commit: Y | `feat(regenerator): validate structure-preserving variants`

- [ ] 7. Unify retry budgets, semantic review, and accepted-result integrity.
  What to do / Must NOT do: Define `FailureKind = TRANSPORT|MALFORMED_RESPONSE|OUTPUT_SCHEMA|STRUCTURE_FIDELITY|NOVELTY|SEMANTIC_REVIEW` and model attempt state as `{ attempt: 1|2|3, correctionHistory: readonly FailureKind[] }`. Attempt 1 is the original generation. Candidate evaluation uses fixed precedence and stops at the first failure: TRANSPORT, MALFORMED_RESPONSE, OUTPUT_SCHEMA, STRUCTURE_FIDELITY, NOVELTY, then SEMANTIC_REVIEW. Correction payload mapping is exhaustive: transport -> retry availability instruction; malformed -> required JSON wrapper instruction; schema -> schema validation diagnostics; structure -> trace diagnostic IDs/path; novelty -> surface/index and overlap-token count only; semantic -> atom/relation/step IDs and reviewer diagnostic only. After a failure, issue exactly one matching correction only when `attempt < 3` and that `FailureKind` has not already appeared; increment attempt and append the category. A repeated category or any failure on attempt 3 is terminal. Semantic correction is therefore at most once and consumes the same global three-attempt budget, never a fourth call. The semantic reviewer and every correction prompt receive only `ReferenceFinalPromptProjection`, rendered candidate surfaces, fidelity trace, and failure diagnostics; they never receive source stem/stimulus/view/choice prose. Run deterministic validation, novelty validation, and semantic review before appending to `result`; reviewer never rewrites content. Lock current reference job progress sequence without adding events.
  Parallelization: Wave 3 | Blocked by: 1-6 | Blocks: 8
  References: `reference-frame-planner.model-client.ts`, `reference-generation-model.ts`, `exam-regenerator.service.ts:392`, `exams.service.ts::createReferenceFrameExam`, `exams.service.spec.ts`
  Acceptance criteria: `npm test -- exam-regenerator.reference-variant.spec.ts exams.service.spec.ts --runInBand` passes; each failure class asserts maximum create-call count of three, repeated-category failure is terminal without an extra call, semantic correction is at most once, accepted result appears only after all validators pass, terminal failure leaves no partial result, and job progress is `queued -> starting -> saving(100) -> completed` or terminal failure.
  QA scenarios: Fake malformed, structural, novelty, semantic, repeated-semantic, and transport failures across attempts 1-3; inspect exact create count, correction history, and result array after each. Run job failure fixture and assert terminal transition. Evidence task-7.
  Commit: Y | `feat(reference-generation): bound semantic fidelity correction`

- [ ] 8. Exercise HTTP ownership, metrics baselines, and complete integration verification.
  What to do / Must NOT do: Cover `POST /exams` and `/exams/jobs` for explicit reference, omitted source type, and AI routing; update deterministic metrics fixture hash/bytes intentionally; run controlled reference generation from an official fixture and compare render output with blueprint. Do not call a paid live model.
  Parallelization: Wave 3 | Blocked by: 1-7 | Blocks: final verification
  References: `exams.controller.ts`, `exams.service.ts`, `create-exam.dto.ts`, `exams.controller.spec.ts`, `exams.service.spec.ts`, `reference-generation-metrics.spec.ts`, `textbook/parsed/sungjik/moi/2022_6월_모의평가.json`, `reference-frame-generation.integration.spec.ts`, `backend/package.json`
  Acceptance criteria: `npm test -- exams.service.spec.ts exams.controller.spec.ts reference-generation-metrics.spec.ts reference-frame-generation.integration.spec.ts --runInBand && npm run typecheck && npm run build` passes; explicit reference and omitted source type invoke only reference generation, AI only legacy generation, metrics baseline change is asserted intentionally, and controlled generation preserves semantic atoms.
  QA scenarios: Run service spies for sync/job explicit reference, omitted type, and AI; run official fixture valid/paraphrase and reversed-condition outputs; assert route owner, progress sequence, metric snapshot, and fidelity result. Evidence task-8.
  Commit: Y | `test(exams): verify integrated reference generation boundaries`

## Final verification wave

- [ ] F1. Plan compliance audit
  Tool: `git diff --name-only` and evidence-file review. Pass only if each changed path belongs to a completed todo, every task evidence file contains its required command/result, and no scope-out path changed.
- [ ] F2. Code quality review
  Tool: `npm run typecheck`, targeted source review, and `rg` checks for validator-dispatch and raw final-prompt fields. Pass only if typecheck exits 0, no runtime routing calls a full contract validator, final prompt projection excludes raw source fields, and retry state has a three-attempt cap.
- [ ] F3. Real manual QA
  Tool: controlled fake-client integration spec using `2022_6월_모의평가.json` question 20. Pass only if a new-worded result preserves every expected semantic atom/relation/role and a reversed-condition variant is rejected before persistence.
- [ ] F4. Scope fidelity
  Tool: `git diff -- frontend backend/src/exams/dto backend/src/exams/exam-generator.service.ts`. Pass only if any changes are limited to named route-ownership tests or legacy builder call migration, with no frontend, DTO, AI-flow semantic, corpus, or job-progress behavior change.

## Commit strategy

Commit one atomic change per todo in dependency order. Do not stage existing unrelated dirty-worktree changes. Keep contract, fixture, cache, API-boundary, validation, reviewer, and route-verification commits independently revertible.

## Success criteria

- Prompt-family selection is explicit and cannot change because a validator starts rejecting an evolved contract.
- New typed frame/payload output, schema, validator, cache, and fixture representations are identical.
- Visible output is newly written while source structure is preserved and machine-checked.
- Existing output-format safety checks remain active.
- Reference, omitted-source, AI, sync, job, metrics, typecheck, build, and controlled generation verification all pass.
