---
slug: reference-generation-single-pass
status: superseded
intent: clear
review_required: false
pending-action: write .omo/plans/reference-generation-single-pass.md
approach: Keep deterministic reference selection and transactional persistence, replace the two planning-model calls plus loose batch output with one strict final-item call per question using existing TPL schemas.
---

# Draft: reference-generation-single-pass

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| deterministic-spec | Server selects reference, novel concept, distractor axis, response mode, and TPL without an LLM | active | `backend/src/exams/reference-frame-generation.service.ts:61-161`; `reference-selector.service.ts:35-118` |
| single-pass-generation | One strict final-item request per question returns the existing persisted/renderable shape | active | `backend/src/exams/tpl-schemas.ts:122-355`; `exam-regenerator.service.ts:288-365` |
| safety-and-persistence | Existing anti-copy/renderability/exact-count checks and transaction remain the final gate | active | `exam-regenerator.service.ts`; `exams.service.ts`; `.omo/evidence/reference-frame-structured-output/task-3.md` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Model-call granularity | One strict call per question, sequentially | Small context and one-item schema avoid whole-batch malformation; sequential calls avoid rate-limit complexity | yes |
| Template choice | Reuse the existing rule-based reference stimulus detector; fall back to `TPL_CASE_DIAGNOSTIC_FRAME` | Preserves visible source style without another model call and uses an already supported renderer | yes |
| Planner code | Bypass it only in the production reference route; do not delete existing planner modules | Minimizes blast radius and preserves tests/rollback path while removing runtime dependence | yes |
| Retry policy | No content-repair loop; fail the exam atomically when final validation rejects an item | Prevents another output-patching cycle and preserves current no-partial-write guarantee | yes |

## Findings (cited - path:lines)
- Production currently performs two planner model calls per reference at `backend/src/exams/reference-frame-generation.service.ts:100-141`, then a third loose batch generation call.
- The deterministic selector already supplies in-range references, concepts, distractor axes, and stable ordering at `backend/src/exams/reference-selector.service.ts:35-118`.
- Existing final TPL schemas already define complete strict persisted-item contracts for all supported renderers at `backend/src/exams/tpl-schemas.ts:122-355`.
- Existing `ExamRegeneratorService.preProcessTpl()` already recognizes source stimulus structure without an LLM and can provide a template hint; `TPL_CASE_DIAGNOSTIC_FRAME` is the safe generic fallback.
- Live evidence shows the strict Frame/Payload planner now succeeds, but the later loose batch output still fails parsing (`.omo/evidence/reference-frame-structured-output/task-3.md:9-20`). This proves further intermediate-schema patching does not address the architectural failure mode.

## Decisions (with rationale)
- Remove `ReferenceFramePlannerService` from the production `ReferenceFrameGenerationService.generate()` path. Server-owned selection data is sufficient to build the generation instruction and lineage deterministically.
- Keep `ReferenceFrame` and `ConceptPayload` only as deterministic internal lineage/spec objects so persistence contracts do not need a migration or broad rewrite.
- Replace `regenerateReferenceBatch()`'s one loose `json_object` batch call with one strict `json_schema` call per request, selecting the existing `getTplSchema(selectedTemplate)` descriptor.
- Ask the model for the final `metadata`, `render_ready`, `correct_answer`, and `explanation` object directly. Do not parse an intermediate `questions` wrapper or transform another model-specific shape.
- Reuse existing renderability, anti-copy, answer-range, exact-count, and transaction guards. No new recovery heuristics or shape-normalization fallbacks.

## Scope IN
- `ReferenceFrameGenerationService` production orchestration and its focused service test.
- `ExamRegeneratorService` reference-only generation path and reference-variant tests.
- A small deterministic builder/helper only if needed to keep the generation service under existing size/style constraints.
- One mocked end-to-end test and one real omitted-`sourceType` job with DB evidence.

## Scope OUT (Must NOT have)
- No frontend, DTO, routing, migration, parsed corpus, or explicit `sourceType: "ai"` changes.
- No deletion of planner/schema experiments; they become inactive in the production reference route.
- No support expansion for new TPLs, new renderers, or a generic retry/repair framework.
- No batch output schema, partial Frame/Payload recovery, or permissive `json_object` fallback.

## Open questions
- Recommended default: one strict model call per question, sequentially, with rule-based template detection and case-diagnostic fallback. Alternative A is one strict batch call (lower cost/latency but repeats all-or-nothing malformed-output risk). Alternative B is parallel per-question calls (faster but adds concurrency/rate-limit code). The plan will use the recommended default unless you choose otherwise.
- Test strategy default: TDD for deterministic builder and request-contract changes, then mocked integration and one real backend/DB job.

## Approval gate
status: awaiting-approval
Superseded by `.omo/drafts/reference-generation-blueprint-batches.md` after the user required one blueprint call followed by batches of up to five questions.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
