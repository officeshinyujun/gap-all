---
slug: reference-output-repair
status: planned
intent: clear
review_required: false
pending-action: write .omo/plans/reference-output-repair.md
approach: Add strict provider schemas and a deterministic, provenance-preserving repair layer before existing semantic validators; reject any output requiring invented semantic content.
---

# Draft: reference-output-repair

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| provider-contract | Request-specific strict JSON Schema prevents wrong wrappers, templates, counts, and unexpected fields. | active | backend/src/exams/exam-regenerator.service.ts |
| deterministic-repair | Canonicalize approved mechanical variants into one typed final-output form, with an auditable repair report. | active | backend/src/exams/exam-regenerator.service.ts |
| semantic-guard | Preserve template selection, renderability, source-copy, and answer-encoding rejection after repair. | active | backend/src/exams/reference-tpl-selector.ts; backend/src/exams/stimulus-normalizer.ts |
| verification | Test repair/reject boundaries and execute an actual unit 15 exact-count generation job. | active | backend/src/exams/exam-regenerator.reference-variant.spec.ts; backend/src/exams/reference-frame-generation.service.spec.ts |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Repair authority | Normalize only mechanical representation defects; never write new question, stimulus, choice, combo-item, or explanation meaning. | Deterministic code cannot establish curriculum correctness for missing semantic content. | yes |
| Strict schema | Use per-request OpenAI `json_schema` with `strict: true`, `required`, and `additionalProperties: false`. | Provider-level prevention removes predictable shape defects before app retries. | yes |
| Auditability | Emit structured repair/rejection reason metrics without model content. | Operationally distinguishes provider-schema drift from semantic quality failures. | yes |

## Findings (cited - path:lines)
 - `exam-regenerator.service.ts`: final output currently passes legacy-envelope normalization, empty-combo normalization, then strict template/stimulus/choice/combo/answer/source-copy/renderability validation.
 - `reference-frame-generation.service.ts`: requests are singleton final batches; a result shortfall fails closed as `REFERENCE_GENERATION_SHORTFALL`.
 - OpenAI Chat Completions supports strict JSON Schema response formats with required fields and `additionalProperties: false`.

## Decisions (with rationale)
 - Keep existing strict semantic validators authoritative after repair; repair is a parser/canonicalizer, not an alternate acceptance route.
 - Build request-specific output schemas from selected template, choice count, and source-derived view-item count.
 - User-approved repair authority: mechanical canonicalization only; missing semantic content is rejected or regenerated.

## Scope IN
 - Strict provider JSON Schema, deterministic repair result/report types, repair policy tests, observability, and live exact-count verification.

## Scope OUT (Must NOT have)
 - Inventing curriculum facts, silently changing a correct answer, loosening source-copy checks, or accepting unrenderable template data.

## Open questions
 - Should repair be limited to mechanical canonicalization, or may it synthesize missing semantic content? Recommended: mechanical canonicalization only.

## Approval gate
status: awaiting-approval
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
