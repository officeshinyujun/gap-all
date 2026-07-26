---
slug: simply-reference-tpl-remediation
status: approved-for-plan-generation
intent: clear
review_required: false
pending-action: write .omo/plans/simply-reference-tpl-remediation.md
approach: Build a read-only TPL audit and classified remediation workflow; enforce TPL, view-block, duplication, difficulty, lineage, web, and PDF gates for future simply_reference generation; preserve every existing ExamRecord, ExamItem, Question, answer, score, and lineage byte-for-byte; optionally create a distinct replacement exam rather than mutate historical data.
---

# Draft: simply-reference-tpl-remediation

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| future-generation | Every new simply_reference draft passes source-TPL, renderer, view-block, duplicate-content, and difficulty gates before persistence. | active | backend/src/exams/simply-reference-generation.service.ts; backend/src/exams/stimulus-normalizer.ts |
| template-contracts | All nine structured TPL schemas and frontend renderer inputs have one audited, testable compatibility contract. | active | backend/src/exams/tpl-schemas.ts; frontend/shared/ui/QuestionStem/QuestionRenderer/index.tsx |
| existing-data-audit | Existing generated questions are classified into valid, repairable, regenerate, missing-source, and historical-only cohorts. | active | entities/question.entity.ts; entities/reference-question.entity.ts; local PostgreSQL read-only inventory |
| remediation-rollout | Replacement of invalid questions is transactional, idempotent, source-traceable, observable, and rollbackable. | active | backend/src/exams/exams.service.ts; backend/src/exams/exam-regenerator.service.ts |
| historical-exams | Every existing exam, question, item, answer, result, and lineage is immutable; replacements are additive exams only. | active | backend/src/entities/exam-item.entity.ts; backend/src/exams/exams.service.ts |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Existing source TPL | Infer from canonical source archetype, then persist a versioned source-template snapshot on future catalog imports. | Catalog currently persists no TPL field; runtime inference alone drifts. | Yes, importer/backfill is transactional. |
| TPL repair | Regenerate invalid stimulus or combo content instead of synthesizing missing semantic structure. | Inventory found raw legacy objects missing required template fields. | Yes, retain provenance and replacement mapping. |
| Current questions | Treat every existing question and exam as immutable; remediation only emits reports and optional additive replacement exams. | User explicitly chose to leave existing exams untouched. | Yes, additive replacements can be archived without touching history. |
| Difficulty | Use an explicit per-level structural rubric plus post-generation evidence fields, not only prompt prose. | Current difficulty is prompt-only and HIGH/INTERGRATE share a contract. | Yes. |

## Findings (cited - path:lines)

- `ReferenceQuestion.sourcePayload` has no first-class source-TPL field; current `parseReference()` derives its archetype/TPL at runtime: `backend/src/entities/reference-question.entity.ts:34`, `backend/src/exams/reference-selector.utils.ts:15`, `backend/src/exams/reference-archetype.ts:207`.
- All nine structured TPL schemas are authoritative in `backend/src/exams/tpl-schemas.ts:7`; renderability is validated by `StimulusNormalizer.isRenderableTplData()` in `backend/src/exams/stimulus-normalizer.ts:414`.
- The live renderer consumes template-specific `stimulus_data` and top-level `combo_block`: `frontend/shared/ui/QuestionStem/QuestionRenderer/index.tsx`.
- Current simply-reference generation now supplies source TPL schema and rejects non-renderable stimulus data, but lacks complete semantic/difficulty/duplicate-content audit: `backend/src/exams/simply-reference-generation.service.ts:346`, `:463`, `:735`.
- Read-only PostgreSQL inventory found 20 simply_reference questions: 5 invalid TPL stimulus payloads, 3 required combo blocks missing, 17 lineage hash drifts, and 3 catalog-source ID misses. Invalid payloads require regeneration, not structural patching.
- Current catalog has 1,280 sources, 465 ㄱㄴㄷ combination sources, and 363 structured-material combination sources; simple-mode automatic selection now prioritizes this group.
- Existing importer is transactional/idempotent with manifests; existing generation data reset is test-only and cannot be used in production: `backend/src/textbook/reference-catalog-import.service.ts`, `backend/src/exams/generation-data-reset.service.ts`.

## Decisions (with rationale)

- Plan a new production-safe audit/remediation command rather than reuse test-only reset or mutate rows ad hoc.
- Separate source catalog normalization/versioning from question remediation so source identity drift is visible and auditable.
- Define TPL-specific acceptance rules from `tpl-schemas.ts`, `StimulusNormalizer`, and the live renderer, with negative tests for every TPL.
- Require a source-specific view-block uniqueness rule: ㄱㄴㄷ statements can exist only in `combo_block` for combination sources, not duplicated in stem/stimulus data.
- Rank automatic HIGH selection toward structured combination sources; use measurable post-generation difficulty evidence and one bounded source repair attempt.
- Include the exact structured TPL set in the contract matrix: `TPL_COMPARATIVE_MATRIX`, `TPL_FORMAL_DOCUMENT`, `TPL_CONVERSATIONAL_FLOW`, `TPL_CASE_DIAGNOSTIC_FRAME`, `TPL_SEQUENTIAL_WORKFLOW`, `TPL_INSTRUCTIONAL_SCENE`, `TPL_DIGITAL_FORUM_INTERFACE`, `TPL_QUANTITATIVE_CHART`, and `TPL_PROMOTIONAL_CANVAS`. Each must pass `tpl-schemas`, `StimulusNormalizer.isRenderableTplData()`, the web structured renderer, and `PdfStimulusRenderer`; a fallback/plain-text render fails simply_reference acceptance. `TPL_PLAIN_TEXT` is excluded because the mode requires structured source fidelity.
- Require one read-only audit classification per historical row, and make optional replacement creation additive through the normal job/create route only.
- Define a TPL contract as the intersection of `tpl-schemas.ts`, `StimulusNormalizer.isRenderableTplData()`, the web QuestionRenderer, and PdfStimulusRenderer; any incompatible/missing required template field rejects the draft/source rather than using a fallback.
- Define combo duplication as any normalized source view claim repeated in question stem or serialized stimulus data, or any duplicate/reordered combo key; source URLs and external authority tiers are not part of this repository's model.
- Persist difficulty evidence with the existing `Difficulty` enum, source information-unit identifiers, reasoning-step count, condition/exception count, four distractor classifications, and validator receipt. Enforce LOW: at least 1 unit/step; MIDDLE: at least 2 units/steps and 1 condition; HIGH: at least 3 units/steps and 2 conditions; INTERGRATE: HIGH plus a combination response or multi-material source. Reject drafts without threshold-satisfying evidence.
- Rank automatic sources by the descending tuple `(combination indicator, structured-material indicator, source information-unit count, condition/exception count, seeded rank, source ID)`. Explicit `sourceIds` preserve caller-array order and bypass this comparator.
- Capture immutable source snapshots on future lineage as source ID, source hash, template/archetype fingerprint, generator/contract version, and generation time; optional replacement exams link to audit report/replacement provenance only.

## Scope IN

- Full TPL audit, future-generation hardening, a safe existing-data remediation workflow, operator reports, rollback mapping, and frontend renderer compatibility tests.

## Scope OUT (Must NOT have)

- No mutation of raw source corpus without an importer manifest/version transition.
- No mutation of any existing `ExamRecord`, `ExamItem`, `Question`, answer, score, or lineage.
- No use of the test-only generation reset against production data.

## Open questions

- Resolved: preserve every existing exam and question; remediation may only report or create a distinct replacement exam.

## Approval gate
status: awaiting-approval
user decision: Preserve every existing exam and question; allow additive replacement exams only. User approval received to proceed with this policy.
metis review: APPROVED after applying immutable historical scope, explicit nine-TPL contract scope, web/PDF renderer coverage, deterministic ranking tuple, measurable LOW/MIDDLE/HIGH/INTERGRATE evidence thresholds, reproducible audit reporting, source-only ranking signals, and snapshot lineage.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
