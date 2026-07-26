# Reference Frame Default Route Follow-up

## Goal

Complete the two gaps left by the prior plan: route omitted `sourceType` through the actual Reference Frame pipeline, and persist per-question lineage that makes every generated variant auditable.

## Scope

- Compose `selectReferences` -> `ReferenceFramePlannerService` -> `selectReferenceTpl` -> `ExamRegeneratorService.regenerateReferenceBatch` in production code.
- Keep explicit `sourceType: "ai"` on the existing general generation path.
- Fail before any persistence when selection, planning, generation, or exact-count validation fails.
- Add a nullable `generation_lineage` JSONB column to `questions` and persist source identity, frame, payload, selected TPL, and validation outcome for reference variants.
- Keep reference exam, item, and question persistence transactionally atomic.
- Add focused routing, persistence, and integration tests with mocked OpenAI clients only.

## Tasks

- [x] 1. Add typed lineage persistence to `Question` with a migration and focused entity/repository tests.
- [x] 2. Implement a production `ReferenceFrameGenerationService` that composes selector, planner, TPL selection, and structured regeneration with exact-count typed failures.
- [x] 3. Route omitted/explicit reference requests through the new service while retaining explicit AI compatibility and atomic persistence.
- [x] 4. Add end-to-end mocked tests for routing, lineage, rollback, and exact-count failure semantics.
- [x] 5. Run backend typecheck, build, focused tests, and a mocked manual pipeline probe.

## Guardrails

- Never call live OpenAI in tests.
- Never fall back to `TPL_PLAIN_TEXT` or DNA for a reference variant.
- Never persist partial reference generation output.
- Do not alter parsed corpus or the explicit AI generation contract.
