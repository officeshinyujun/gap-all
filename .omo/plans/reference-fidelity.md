# reference-fidelity - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** 원본 문제의 유형, 발문 기능, 보기-선지 구조, 오답 설계와 개념 범위를 유지하면서 소재와 표현만 새로 만드는 reference 생성 파이프라인입니다.

**Why this approach:** 현재 실패는 AI 문장 품질보다 원본 구조 오분류와 concept allocation 붕괴에서 시작됩니다. 원본 유형과 정답 구조를 backend contract로 고정하고 AI가 바꿀 수 있는 범위를 내용 생성으로 제한합니다.

**What it will NOT do:** 원본이 조합형인데 단일 선택형으로 바꾸지 않습니다. novelty를 위해 원본 개념을 무조건 금지하지 않으며, AI가 근거 없는 보기·선지·정답을 만들도록 두지 않습니다.

**Effort:** Large
**Risk:** Medium - 기존 863개 frame cache를 versioned contract로 재생성해야 하며 유형 분류 규칙이 전체 reference corpus를 커버해야 합니다.
**Decisions to sanity-check:** 기본 정책은 source archetype과 concept family를 보존하고, scenario facts와 wording만 변경하는 것입니다.

Your next move: 이 계획을 검토한 뒤 별도 실행 세션에서 시작합니다. Full execution detail follows below.

---

> TL;DR (machine): Large effort, medium risk; replace AI-owned reference typing with versioned source archetypes, bounded concept allocation, typed answer plans, coherence validation, and fidelity QA.

## Scope
### Must have
- Every generated lineage source resolves to a catalog payload before planning.
- A versioned `ReferenceArchetype` preserves stem intent/polarity, response mode, choice encoding/topology, source presentation shape, view keys/count, and option semantics.
- Concepts are allocated per slot with bounded primary/supporting concepts and coverage balancing; source concept families remain eligible.
- A discriminated answer plan defines claims/options, verdicts, evidence links, and backend-computed correct answer for each response mode.
- Final validation proves stem, stimulus, view items, choices, answer, template, and archetype are mutually coherent.
- The bad exam `cd6c2f17-11bb-4be7-b17f-c9ebd875447e` becomes a permanent before/after regression fixture.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not let ConceptPayload choose a response mode or template different from the source archetype by default.
- Do not use `viewItemCount` alone as the item-type classifier.
- Do not globally exclude all source target concepts; novelty applies to facts, names, values, context, and wording.
- Do not accept combo-only choices without a combo block, or prose choices for a truth-combination contract.
- Do not trust model-declared verdict/evidence without deterministic and independent semantic verification.
- Do not reuse the current unversioned cached frames after the archetype contract changes.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with Jest contract tests, catalog-wide dry-run audits, typecheck/lint/build, and real 15단원 10문항 side-by-side QA.
- Evidence: `.omo/evidence/reference-fidelity/task-<N>.json|md`.
- Baseline from the bad exam: 10 total, 7 source-resolvable, 3/3 resolvable combo sources misclassified as `single_selection`, 10/10 payloads include `가산 수당`, and some 3-view items have only 2 planned claims.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 10 | none |
| 2 | 1 | 4, 5, 7 | 3 |
| 3 | 1 | 5, 6 | 2 |
| 4 | 2 | 7, 8 | 5, 6 |
| 5 | 2, 3 | 6, 7 | 4 |
| 6 | 3, 5 | 7, 8 | 4 |
| 7 | 2, 4, 5, 6 | 8, 9 | none |
| 8 | 4, 6, 7 | 9, 10 | none |
| 9 | 7, 8 | 10 | none |
| 10 | 1-9 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Freeze the observed fidelity failures as an executable audit fixture.
  What to do / Must NOT do: Export the generated question, lineage, and source payload pairs for exam `cd6c2f17-11bb-4be7-b17f-c9ebd875447e`; classify provenance, response-mode, polarity, choice-topology, concept-allocation, claim-count, and stem-choice coherence failures. Redact account data and avoid depending on mutable production rows after fixture creation.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 10
  References: `questions.generation_lineage`; `reference_questions.source_payload`; `backend/src/exams/reference-generation-metrics.ts`.
  Acceptance criteria: Fixture asserts baseline metrics exactly: source resolution 7/10, combo-mode mismatch 3/3, overtime concept 10/10, and identifies item 10 as combo-letter choices without a combo block.
  QA scenarios: Run a fixture audit CLI/Jest test and save the machine-readable report to `.omo/evidence/reference-fidelity/task-1.json`.
  Commit: Y | test(exams): capture reference fidelity regression corpus
- [ ] 2. Introduce a versioned source-owned `ReferenceArchetype` contract.
  What to do / Must NOT do: Replace free-form `stem.style` as the type authority with explicit fields: `stemIntent`, `polarity`, `responseMode`, `choiceEncoding`, `choiceTopology`, `informationShape`, `sourceTemplate`, `stimulusRole`, `viewKeys`, `viewItemCount`, `choiceCount`, `setContext`, and a stable `archetypeFingerprint`. Keep material density separate. ConceptPayload must not own these fields.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 5, 7
  References: `backend/src/exams/reference-frame.types.ts`; `reference-frame.frame-validator.ts`; `reference-frame.provider-schemas.ts`; `tpl-schemas.ts`.
  Acceptance criteria: Discriminated types make illegal combinations unrepresentable: truth combination requires view keys and combo topology; single selection forbids combo topology; negative/positive stem intent is explicit.
  QA scenarios: Contract fixtures for truth combination, negative single selection, label matching, pair selection, and blank workflow; invalid cross-mode combinations fail with typed paths.
  Commit: Y | feat(exams): define source-owned reference archetypes
- [ ] 3. Build a deterministic source archetype classifier with model fallback only for ambiguity.
  What to do / Must NOT do: Classify from source stem patterns, source `viewItems`, and source choice syntax. Examples: `<보기>에서 있는 대로` plus combination choices => truth combination; `옳지 않은` => negative polarity; no view block plus substantive choices => single selection. Return `AMBIGUOUS_ARCHETYPE` instead of guessing. An LLM fallback may fill presentation details but cannot override deterministic response topology.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5, 6
  References: `backend/src/exams/reference-selector.utils.ts`; `reference-frame-planner.prompts.ts`; the baseline source stems/choices from task 1.
  Acceptance criteria: 100% correct topology/polarity on the baseline fixture and a catalog-wide report with zero accepted contradictions such as view-combination sources classified as single choice.
  QA scenarios: Property-style tests over Korean stem markers and choice patterns; catalog dry-run evidence task-3.json.
  Commit: Y | feat(exams): classify reference archetypes deterministically
- [ ] 4. Version and rebuild reference frame/archetype cache.
  What to do / Must NOT do: Add `contractVersion`, `classifierVersion`, and `archetypeFingerprint` to cache identity/metadata; reject stale cached frames even if source hash matches. Migrate or invalidate existing unversioned rows, then warm only source-resolvable, contract-valid archetypes. Do not silently reuse the current 863 cached frames.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 7, 8
  References: `backend/src/entities/reference-frame-cache.entity.ts`; cache migration files; `reference-frame-generation.service.ts:160`; `warm-reference-frames.ts`.
  Acceptance criteria: A stale-version cache fixture is ignored and rebuilt; warm-up reports created/rejected/ambiguous counts by reason; every usable cache row validates against the new contract.
  QA scenarios: Migration test, repository integration test, full warm-up dry-run evidence task-4.json.
  Commit: Y | feat(exams): version reference archetype cache
- [ ] 5. Replace global concept reuse/exclusion with slot-level concept-family allocation.
  What to do / Must NOT do: Allocate exactly one primary concept and at most two supporting concepts per slot before payload planning. Preserve the reference concept family when it matches requested units; rotate requested concepts across slots and forbid repetition until the pool is exhausted. Novelty rules target scenario facts and wording, not the curriculum concept itself. Replace the existing allocator hardcodes for `single_selection` and `case_profile` with archetype fields.
  Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: 6, 7
  References: `reference-frame-generation.service.ts:139`; `reference-slot-allocator.service.ts`; `reference-selector.types.ts`; `buildConceptPayloadPrompt`.
  Acceptance criteria: A 10-slot fixture does not assign one concept to every slot; payload `targetConcepts` is bounded; allocated response mode/template equals the source archetype.
  QA scenarios: Deterministic allocation tests for concept pools smaller/equal/larger than slot count; evidence task-5.json.
  Commit: Y | fix(exams): allocate concepts without collapsing archetypes
- [ ] 6. Replace generic ConceptPayload claims with response-mode-specific answer plans.
  What to do / Must NOT do: Add a discriminated `AnswerPlan`: truth combination has exactly one claim per view key with verdict and evidence IDs; single selection has exactly five option plans with verdict/evidence and exactly one polarity match; label/pair/blank modes have their own required mapping. Backend computes the answer index from the plan. The model may not supply an arbitrary `correctAnswer` as authority.
  Parallelization: Wave 2 | Blocked by: 3, 5 | Blocks: 7, 8
  References: `reference-frame.types.ts` ConceptPayload/PayloadClaim; payload validator/provider schema; `truthCombinationVerdictAligns` in `exam-regenerator.service.ts`.
  Acceptance criteria: Claim count equals view count for combo mode; option-plan count equals five for single selection; duplicate/no correct options reject; backend answer computation is deterministic.
  QA scenarios: Tests cover the observed 3-view/2-claim defect, duplicate answers, none-of-the-above, negative polarity, and all response modes.
  Commit: Y | feat(exams): make answer plans response-mode specific
- [ ] 7. Preserve archetype/template in final generation and narrow the model's responsibility.
  What to do / Must NOT do: Change the planner instruction from “without reusing the reference answer logic” to “preserve reasoning procedure and response topology; replace source facts and wording.” Select template from source archetype, not ConceptPayload. Final model generates stimulus facts, view/option text, and evidence links inside that contract. Backend renders stable stem operators and combo choice topology where deterministic. Do not permit payload shape to switch a case into a forum/table/workflow.
  Parallelization: Wave 3 | Blocked by: 2, 4, 5, 6 | Blocks: 8, 9
  References: `reference-frame-planner.prompts.ts:21`; `reference-frame-generation.service.ts:189`; `exam-regenerator.service.ts` final prompt/schema; `reference-final-output-schema.ts`.
  Acceptance criteria: Source and generated `archetypeFingerprint`, response mode, polarity, choice encoding, view count, and template match exactly; scenario/name/value copy checks still pass.
  QA scenarios: Side-by-side generation fixtures for each archetype and explicit attempts to switch template/mode that must reject.
  Commit: Y | fix(exams): preserve source archetype during regeneration
- [ ] 8. Add stem-stimulus-choice-answer coherence validation and independent solving.
  What to do / Must NOT do: Validate cross-field relationships, not just field shapes. Truth-combination requires `<보기>` semantics, exact keys, combo-only choices drawn from those keys, claim/evidence coverage, and unique backend-computed answer. Single selection requires substantive options and forbids bare `ㄱ/ㄴ/ㄷ` choices without a combo block. Polarity must match the stem operator. Every claim/option cites generated stimulus fact IDs. Add an independent typed verifier pass that solves the item from grounded facts and compares its answer; it cannot repair or override failures.
  Parallelization: Wave 3 | Blocked by: 4, 6, 7 | Blocks: 9, 10
  References: `exam-regenerator.service.ts` transform/answer/source-copy validation; `reference-generation-output-validator.ts`; `stimulus-normalizer.ts`.
  Acceptance criteria: All observed incoherent examples reject with specific reason codes; verifier disagreement never persists; valid items pass both deterministic and independent checks.
  QA scenarios: Regression fixtures for combo block plus prose choices, no combo plus letter choices, polarity mismatch, unsupported options, missing evidence, and wrong independently solved answer.
  Commit: Y | feat(exams): validate full reference item coherence
- [ ] 9. Make retries phase-specific and replenish failed slots without changing archetype distribution.
  What to do / Must NOT do: Retry archetype ambiguity at extraction, answer-plan invalidity at planning, generation/coherence failures at final generation, and verifier disagreement with a fresh final candidate. Keep bounded attempts per phase. If one slot exhausts, optionally select a replacement source with the same archetype/concept-family constraints; never convert it to another type merely to reach count. Persist only exact-count, ordered, fully verified exams.
  Parallelization: Wave 4 | Blocked by: 7, 8 | Blocks: 10
  References: `reference-frame-planner.service.ts`; `regenerateReferenceBatch`; `reference-frame-generation.service.ts:223`; generation job state.
  Acceptance criteria: Tests prove a failed combo slot is replaced only by a combo archetype; retry corrections target the failing phase; exhausted slots cause typed shortfall with no partial persistence.
  QA scenarios: Provider timeout, ambiguous source, invalid answer plan, coherence failure, verifier disagreement, and replacement-capacity failure.
  Commit: Y | fix(exams): recover reference slots without type drift
- [ ] 10. Run catalog-wide and live fidelity acceptance gates.
  What to do / Must NOT do: Run full tests/typecheck/lint/build, classify the full catalog, rebuild cache, and generate a new 15단원 10문항 exam. Produce a side-by-side source/generated report containing source stem intent, generated stem intent, topology, template, concept, claim/evidence count, choices, and answer. Do not mark success from completion status alone.
  Parallelization: Wave 5 | Blocked by: 1-9 | Blocks: final verification
  References: all prior evidence; live generation harness; DB questions/lineage/reference catalog joins.
  Acceptance criteria: 100% generated lineage source resolution; 100% source/generated archetype match; 0 combo-mode mismatches; 0 no-combo letter-choice items; claim/option plan cardinality valid for every item; no primary concept repeated until allocation pool exhaustion; independent verifier agreement 10/10; exact 10 persisted items.
  QA scenarios: Compare the new report to the task-1 baseline and save `.omo/evidence/reference-fidelity/task-10.md` plus JSON details.
  Commit: N | verification only

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
- Commit 1: regression fixture, archetype contract, deterministic classifier.
- Commit 2: cache versioning/migration and warm-up reporting.
- Commit 3: concept allocation and response-mode answer plans.
- Commit 4: final generation preservation and coherence validator.
- Commit 5: phase-specific retries and live acceptance coverage.

## Success criteria
- Reference fidelity is measured by source/generated archetype equivalence, not job completion alone.
- All source lineage is resolvable and all cache entries are version-current.
- Generated questions preserve source stem intent, polarity, response mode, choice encoding/topology, information shape, and template.
- Concepts remain diverse across slots while staying in the requested unit/reference concept family.
- Every option/view claim is grounded in generated stimulus evidence and has a deterministic verdict.
- Backend and independent verifier agree on one correct answer for every persisted item.
- A live 15단원 10문항 exam passes all fidelity gates and persists exactly ten items.
