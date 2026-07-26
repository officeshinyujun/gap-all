---
slug: reference-faithful-regeneration
intent: clear
review_required: false
classification: architecture
status: plan-complete
---

# Reference-faithful regeneration draft

## Components
- source-contract: Preserve source reasoning and difficulty, not only output format. Status: grounding. Evidence: backend/src/exams/reference-frame-planner.prompts.ts
- generation-contract: Feed source and controlled transformations to final generation. Status: grounding. Evidence: backend/src/exams/exam-regenerator.service.ts
- verification: Validate source-to-output fidelity. Status: grounding. Evidence: backend/src/exams/reference-generation-output-validator.ts
- persistence-observability: Persist an auditable source/variant comparison record. Status: grounding. Evidence: backend/src/entities/question.entity.ts
- regression-suite: Lock behavior with fixtures and integration tests. Status: grounding. Evidence: backend/src/exams/*reference*.spec.ts

## Decisions
- No product-code changes during planning.
- No subagents at the user's explicit request.
- Evidence: final generation deliberately excludes source display text; its unit test asserts every source marker is absent. `backend/src/exams/exam-regenerator.reference-variant.spec.ts:629-751`.
- Evidence: integration test asserts the final prompt has no `reference` property. `backend/src/exams/reference-frame-generation.integration.spec.ts:214-224`.
- Evidence: current payload prompt prohibits the source target concepts. `backend/src/exams/reference-frame-planner.prompts.ts:79-82`.
- Evidence: existing persistence can retain lineage but lacks a source-to-variant fidelity assessment. `backend/src/entities/question.entity.ts:71-77`.
- Default test strategy: TDD; Jest supports focused contracts/integration tests and a live reference QA command exists in `backend/package.json:20-28`.
- Product decision: replace the existing `sourceType: reference` contract with faithful variants only; do not retain the current format-only mode.
- Product decision: source text is provided to the final generator and close paraphrase is allowed; preserve wording/terminology where it supports source fidelity, while prohibiting verbatim copying through an explicit overlap policy.
- Test decision: TDD.

## Approval gate
Approach: replace the lossy source-free final-generation contract with a typed source-fidelity specification derived from the selected reference; make the final prompt source-aware; preserve the source concept and reasoning/answer topology by default; add deterministic source-to-output validators (structure, density, option logic, and copy-overlap), corrective retries, persistence of the validation receipt, and fixture-driven unit/integration/live QA.

Scope in: reference selection-to-generation pipeline, prompt/schema/types, fidelity and overlap validation, lineage persistence, unit/integration/live tests.

Scope out: changes to the ordinary AI-generation (`sourceType: ai`) pipeline, a retained format-only reference mode, frontend redesign, and bulk regeneration of already-saved questions.

Next action: plan written at `.omo/plans/reference-faithful-regeneration.md`; await the user's choice to start execution in a separate worker session or request an optional high-accuracy plan review.
