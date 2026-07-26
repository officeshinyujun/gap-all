# reference-archetype-locked-fidelity - Work Plan

## TL;DR (For humans)
Generated reference questions must preserve the selected real question's material format and question mechanics, not merely complete JSON validation. Step 1 will produce an immutable archetype that locks Step 2, TPL selection, final prompting, and output validation for every selected `reference_questions` record. The real 15th-unit table, case-calculation, and timeline questions are regression fixtures representing archetype families, not a unit-specific implementation boundary. It will not copy source prose or change the normal AI-generation path.

## Scope
- Lock reference archetype properties across ReferenceFrame planning, ConceptPayload planning, TPL selection, final prompt construction, and final output validation.
- Preserve real subject-specific document shells, evidence blocks, multi-concept bindings, distractor transformations, Korean-combination logic, and shared-document set structure when present in the selected reference.
- Apply archetype extraction and locking to every selected reference across all subjects/units; use source-derived golden fixtures from `textbook/parsed/sungjik/all/15단원.json` questions 1, 2, and 3 as representative regression coverage.
- Preserve source-free final prompts: only structural projection travels to final generation.
- Exclude frontend rendering changes, `sourceType: 'ai'`, and historical exam migrations.

## Verification strategy
- Use TDD: add a failing fixture/spec before each contract change.
- Run focused Jest suites from `backend/`, `npm run typecheck`, and `npm run build` after each wave.
- Run `REFERENCE_LIVE_QA=1 npm run test:reference-live` for each golden archetype after its output validator is available; inspect persisted `recommendedTemplate`, `stimulusData`, `comboBlock`, and `optionsList`, then clean QA records. The runtime path must select archetypes from the chosen source record rather than hard-code unit 15.

## Execution strategy
Wave 1 defines a source-derived immutable archetype and makes Step 1 validate it. Wave 2 threads it through Step 2 and TPL filtering. Wave 3 uses it in final prompting/output fidelity checks. Wave 4 locks three real 15th-unit examples and proves actual provider generation.

### Detailed implementation map
1. `backend/src/exams/reference-archetype.ts`: add a pure `deriveReferenceArchetype(reference)` function. It must inspect only parsed source structure (`stimulus`, `viewItems`, `choices`, source metadata) and deterministically infer document shell, combination/prose topology, evidence blocks, set membership, and coarse material kind. It must not use an LLM or source prose in its returned contract.
2. `backend/src/exams/reference-frame.types.ts`: add immutable `ReferenceArchetype`, `ReferenceEvidenceBlock`, `ReferenceConceptRole`, `ReferenceDistractorTransform`, `ReferenceCombinationPlan`, and `ReferenceSetStructure` types. Add `archetype` to `ReferenceFrame` rather than retaining an untyped side channel.
3. `backend/src/exams/reference-frame.frame-validator.ts` and `reference-structure-blueprint.validator.ts`: validate that frame response/view topology and blueprint evidence blocks are compatible with `archetype`; reject a missing required block, reversed block order, impossible combination plan, or mismatched set position with a path-specific contract code.
4. `backend/src/exams/reference-frame-planner.service.ts` and `reference-frame-planner.prompts.ts`: bind the deterministic archetype to the Step 1 request before model parsing; permit the model to add semantic facts/relations only within that archetype. Retry corrections must name the exact archetype mismatch code and expected constraint.
5. `backend/src/exams/reference-frame-generation.service.ts`: persist/pass the validated archetype with cached frame versioning; cache entries without an archetype must be invalidated instead of silently treated as a generic reference.
6. `backend/src/exams/reference-frame.payload-validator.ts` and `reference-frame-planner.service.ts`: make Step 2 consume the Step 1 archetype and validate concept roles, distractor transform families, combination answer cardinality, and optional shared-set position. Step 2 may change content concepts but not document mechanics.
7. `backend/src/exams/reference-tpl-selector.ts`: add an explicit `allowedTemplatesForArchetype(archetype)` map and intersect it with ordinary template candidates. Return `TPL_SELECTION_REJECTED` when the intersection is empty; never fall back to a conversational template.
8. `backend/src/exams/exam-regenerator.service.ts` and `reference-final-output-schema.ts`: serialize a source-free `archetypeProjection` into `buildReferenceBatchRegenPrompt`; require a non-rendered trace that maps evidence blocks, view items, option subsets, reasoning steps, and set linkage to output surfaces.
9. `backend/src/exams/exam-regenerator.service.ts` and `reference-generation-output-validator.ts`: add `validateReferenceArchetypeFidelity()` after existing TPL/answer/topology checks. It must reject a shell mismatch, block omission/order change, concept-role collapse, distractor family mismatch, combination subset drift, or broken shared-document linkage; use the existing bounded retry path with a specific correction.
10. `backend/scripts/reference-live-qa.ts`: accept `REFERENCE_LIVE_QA_ARCHETYPE` and choose a golden reference source for that family. Emit safe evidence `{sourceId, archetype, template, itemCount}` and retain marker-scoped cleanup even on failure.

## Todos
- [x] 1. Define `ReferenceMaterialKind`, `ReferenceReasoningPattern`, `ReferenceChoiceTopology`, `ReferenceDocumentShell`, `ReferenceRegister`, evidence-block schema, multi-concept roles, distractor transformations, combination-plan schema, and optional set structure in `backend/src/exams/reference-archetype.ts` and `reference-frame.types.ts`; add a source-derived archetype validator that requires compatible response mode, choice encoding, view-item count, structure blueprint, and source-derived document mechanics.
  References: `backend/src/exams/reference-archetype.ts`, `reference-frame.types.ts`, `reference-frame.frame-validator.ts`, `reference-structure-blueprint.validator.ts`, `reference-frame.contract.spec.ts`.
  Acceptance: table/comparison, case-calculation, timeline-process, statute-application, dialogue, and plain-statement archetypes are typed; document shells include law excerpts, consultation Q&A, incident reports, checklists, investigation reports, dashboards, and classroom boards; incompatible view/choice topology, evidence-block order, or document shell rejects with a dedicated path.
  QA: `npm test -- --runInBand src/exams/reference-archetype.spec.ts src/exams/reference-frame.contract.spec.ts`; valid table/case/timeline fixtures pass, incompatible conversational topology, missing required evidence block, and invalid document shell fail.
  Commit: `feat(reference): define immutable source archetypes`.
- [x] 2. Build golden source fixtures for representative 성직 and 공일 questions without copying their display prose into final-generation fixtures.
  References: `textbook/parsed/sungjik/all/15단원.json:10`, `:42`, `:73`, `:100`, `:127`, `:159`, `:217`; `textbook/parsed/kongil/all/15단원.json:10`, `:44`, `:76`, `:136`, `:170`, `:204`, `:262`; `backend/src/exams/reference-frame-planner.fixtures.ts`.
  Acceptance: fixtures cover 성직 law-classification table, employment case/calculation, timeline, statute excerpt, consultation Q&A, and rights-infringement case; cover 공일 incident report, inspection checklist, paired safety cases, fire report, technical enterprise report, and shared-document sets. Every fixture encodes document shell, register, evidence blocks/order, concept roles, distractor transformations, combination plan or prose-choice plan, and allowed TPL families. No runtime condition may branch on unit number or source ID.
  QA: `npm test -- --runInBand src/exams/reference-archetype.golden.spec.ts`; each source fixture is classified deterministically, and shared-document fixture pairs preserve their common shell.
  Commit: `test(reference): add unit-15 archetype golden corpus`.
- [x] 3. Make Step 1 planner prompts and cache validation extract, validate, version, and persist the immutable archetype with the ReferenceFrame.
  References: `reference-frame-planner.prompts.ts`, `reference-frame-planner.service.ts`, `reference-frame-generation.service.ts`, `reference-frame-cache.entity.ts`, `reference-frame-generation.service.spec.ts`.
  Acceptance: a selected source produces a frame carrying a validated archetype; cache entries lacking the archetype are invalidated/regenerated; raw source prose does not enter final request.
  QA: `npm test -- --runInBand src/exams/reference-frame-planner.service.spec.ts src/exams/reference-frame-generation.integration.spec.ts`; stale cache fails closed and regenerated request contains archetype only.
  Commit: `feat(reference): propagate source archetype from step one`.
- [x] 4. Lock Step 2 ConceptPayload and TPL selection to the Step 1 archetype instead of allowing payload or selector drift; preserve the source's multi-concept roles, distractor transformations, combination logic, and optional shared-document set position.
  References: `reference-frame-planner.service.ts`, `reference-frame.payload-validator.ts`, `reference-tpl-selector.ts`, `reference-frame-generation.service.ts`, `reference-tpl-selector.spec.ts`.
  Acceptance: Step 2 cannot alter material kind, document shell, register, response mode, choice encoding, view-item count, choice topology, required reasoning pattern, concept-role count, or required evidence blocks; its answer plan preserves combination subset logic when applicable. Incompatible TPL candidates are excluded and no compatible candidate returns `TPL_SELECTION_REJECTED`.
  QA: `npm test -- --runInBand src/exams/reference-tpl-selector.spec.ts src/exams/reference-frame-planner.validation.spec.ts`; table/case/timeline fixtures reject conversational TPL, combination fixtures reject prose-only options, and shared-document fixtures reject standalone incompatible TPLs.
  Commit: `fix(reference): lock step two and TPLs to source archetype`.
- [x] 5. Project the immutable archetype into the source-free final-generation prompt and strict final output schema, including document shell, evidence-block order, multi-concept roles, distractor transformations, and combination or set topology.
  References: `exam-regenerator.service.ts`, `reference-final-output-schema.ts`, `reference-frame-generation.service.ts`, `exam-regenerator.reference-variant.spec.ts`, `reference-final-output-schema.spec.ts`.
  Acceptance: prompt includes material kind, document shell, register, required features, exact view/choice topology, evidence blocks/order, concept roles, distractor transformations, information order, reasoning pattern, and set position but excludes raw stem/stimulus/view-item/choice prose; output schema requires non-rendered archetype fidelity trace.
  QA: `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts src/exams/reference-final-output-schema.spec.ts`; snapshot proves structural projection and source exclusion.
  Commit: `feat(regenerator): require reference-locked final structure`.
- [x] 6. Add deterministic final archetype fidelity validation and path-specific correction retries before persistence, rejecting document-shell drift, evidence-block loss, shallow single-concept rewrites, incorrect distractor logic, combination-plan drift, and broken shared-document set structure.
  References: `exam-regenerator.service.ts`, `reference-generation-output-validator.ts`, `reference-variant-repair.ts`, `reference-final-output-schema.ts`.
  Acceptance: reject material-kind drift, document-shell drift, missing numeric/condition/timeline features, missing evidence block, wrong concept-role coverage, wrong distractor transform, wrong view-item count, wrong Korean-combination topology, changed combination subset strategy, wrong reasoning order, or broken set linkage; correction names the exact expected/actual archetype mismatch and remains bounded.
  QA: `npm test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts`; each single mismatch rejects/retries while a new-wording faithful fixture persists.
  Commit: `feat(regenerator): validate source archetype fidelity`.
- [x] 7. Run real-provider golden QA for representative 성직 and 공일 archetypes and capture persisted structural evidence with cleanup.
  References: `backend/scripts/reference-live-qa.ts`, `backend/package.json`, `exams.service.ts`, `reference-generation-persistence.ts`.
  Acceptance: at minimum, 성직 table/case-calculation/timeline/law-excerpt runs and 공일 incident-report/checklist/shared-set runs complete; persisted output uses an allowed TPL and preserves its fixture's document shell, evidence blocks, topology, distractor logic, and required features; run-marker cleanup removes QA-owned user/exam/question records.
  QA: `REFERENCE_LIVE_QA=1 REFERENCE_LIVE_QA_ARCHETYPE=table npm run test:reference-live`, repeated for `case_calculation`, `timeline_process`, `statute_application`, `incident_report`, `inspection_checklist`, and `shared_document_set`; each exits 0 and emits safe exam evidence.
  Commit: `test(reference): prove real archetype-locked generation`.

## Final verification wave
- [x] F1. Run all archetype/frame/TPL/final variant golden suites and verify every golden fixture has a classification, allowed TPL family, document shell, evidence-block contract, concept-role plan, distractor plan, and output fidelity assertion.
- [x] F2. Run malformed fixtures for conversational drift, missing document shell/evidence block, shallow single-concept rewrite, missing numeric conditions, missing timeline order, changed choice topology, changed combination subset, and broken shared-document linkage; verify reject/retry with no persistence.
- [x] F3. Run the representative 성직 and 공일 `REFERENCE_LIVE_QA=1` archetype commands; verify persisted fields, structural evidence, and cleanup receipts.
- [x] F4. Run `npm test -- --runInBand src/exams/exam-generator.service.spec.ts src/exams/exams.service.spec.ts && npm run typecheck && npm run build`; verify the general AI generation path remains unchanged.

## Commit strategy
One atomic commit per todo. Do not stage existing unrelated dirty-worktree changes.

## Success criteria
- Step 1 archetype is the authoritative immutable contract for Step 2, TPL selection, final prompt, and final output validation for every selected reference record, regardless of subject or unit.
- A table/case/timeline/law-excerpt/incident-report/checklist/shared-set source cannot silently become a conversational/general-definition question.
- Generated variants preserve the source's document shell, evidence-block density/order, multi-concept reasoning, distractor transformation family, and combination/set mechanics as applicable.
- Final prompts remain source-free while generated output preserves source mechanics with new Korean wording.
- Three real 15th-unit archetypes complete, persist structurally faithful output, and clean their QA data.
