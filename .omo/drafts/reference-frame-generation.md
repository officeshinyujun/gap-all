---
slug: reference-frame-generation
status: awaiting-approval
intent: clear
review_required: false
pending-action: write .omo/plans/reference-frame-generation.md
approach: replace DNA-gated reference regeneration with selected-unit Reference Frame plus Concept Payload planning and payload-driven TPL generation
---

# Draft: reference-frame-generation

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id | outcome | status | evidence path |
| --- | --- | --- | --- |
| reference-pool | Select unique parsed references and an eligible concept pool from only requested units. | active | `backend/src/exams/exam-generator.service.ts:1289-1357` |
| frame | Extract style, response structure, density, and information shape without retaining original concepts or distractors. | active | `docs/reference-frame-generation-plan.md:48-113` |
| payload | Plan new in-range concepts, verdicts, answer encoding, and new distractor axes before prose generation. | active | `docs/reference-frame-generation-plan.md:115-143` |
| tpl | Select and validate a structured TPL from the payload's information shape rather than source surface genre. | active | `docs/reference-frame-generation-plan.md:173-205` |
| generation | Generate one structured reference variant from the frame, payload, selected TPL, and unit text. | active | `backend/src/exams/exam-regenerator.service.ts:733-842` |
| validation | Enforce unit scope, frame fidelity, answer integrity, renderability, and anti-copy constraints. | active | `backend/src/exams/exam-question-validator.ts:7-178`; `docs/reference-frame-generation-plan.md:261-295` |
| dna-v2 | Stop injecting DNA contracts into the normal reference route; retain unrelated experimental DNA code without using it. | active | `backend/src/exams/exam-generator.service.ts:1348-1355`; `backend/src/exams/exam-regenerator.service.ts:170-176, 775, 834-837` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Reference scope | Filter both references and all payload concepts to `startUnitNum..endUnitNum`. | The user explicitly chose selected-unit-only recombination; it protects curriculum progression. | yes |
| Test strategy | TDD for deterministic selectors, payload guards, TPL mapping, and validators; mocked OpenAI integration tests for orchestration and retry behavior. | The new flow has several pure contracts and external model calls that need stable regression coverage. | yes |
| DNA behavior | DNA v2 is not loaded or attached by the reference route. Existing code remains unused rather than deleted in this change. | The corpus cannot satisfy DNA's default multi-evidence admission rule, while deletion would expand scope and destroy an experimental path. | yes |
| Generation form | Treat an omitted `sourceType` as reference-frame generation; use `sourceType: "ai"` only for explicit general AI generation. | Owner decision: all ordinary exam creation should use the past-question-inspired path by default. | yes |

## Findings (cited - path:lines)

- The public service dispatches `sourceType: "reference"` to regeneration and all other requests to general AI generation. `backend/src/exams/exams.service.ts:89-117`
- Reference regeneration already loads parsed questions only from the selected unit range, filters them by target concepts, shuffles them, and dispatches them in batches. `backend/src/exams/exam-generator.service.ts:1289-1407`
- The current reference prompt preserves only coarse structure and then asks the model to derive view-item truth values; it does not separate external style from newly designed concepts or distractor axes. `backend/src/exams/exam-regenerator.service.ts:733-842`
- Reference items currently receive DNA contracts through `findDnaForReference`, which can force an unsuitable TPL and multi-evidence rule when a v2 file exists. `backend/src/exams/exam-generator.service.ts:1348-1355`; `backend/src/exams/exam-regenerator.service.ts:170-176, 775, 834-837`
- Generated references are converted to structured TPL data after free-text generation and then verified, creating a seam for payload-selected TPL enforcement before conversion. `backend/src/exams/exam-generator.service.ts:1407-1414`; `backend/src/exams/exam-regenerator.service.ts:655-730`
- Existing local validation enforces answer count, template renderability when a DNA contract exists, placeholders, stem form, and combination encoding, but does not validate selected-unit concept scope, frame fidelity, or phrase-overlap novelty. `backend/src/exams/exam-question-validator.ts:7-178`
- The approved design document requires a Reference Frame plus independently designed Concept Payload, with TPL chosen from the payload information shape and all concepts constrained to selected units. `docs/reference-frame-generation-plan.md:48-205`
- The parsed corpora comprise 20 unit files per subject. `textbook/parsed/sungjik/all/`; `textbook/parsed/kongil/all/`

## Decisions (with rationale)

- Use `Reference Frame -> Concept Payload -> TPL -> structured generation -> validation` for reference variants. This preserves authentic item form without retaining the original item's concepts or distractor logic.
- Preserve frame-level signals only: response mode, stem rhythm, view-item/choice counts, polarity, material density, information shape, and difficulty signals.
- Redesign target concepts and distractor axes after frame extraction, using only the selected unit range.
- Select TPL after payload design from logical information shape. A source report can become a matrix or workflow when the new claims require comparison or branching conditions.
- Treat anti-copy as a first-class validator across stem, material, view items, and choices. Source names, dates, values, entities, and distinctive phrases are always regenerated.
- Keep the existing general AI generation path out of scope; this change concerns the reference-backed route.
- Default omitted `sourceType` to the reference-frame route; preserve explicit `sourceType: "ai"` as the general-AI alternative.

## Scope IN

- New TypeScript types and services for Reference Frame, Concept Payload, in-range concept pools, and deterministic TPL mapping.
- Reference selection that avoids duplicate source references within one generated exam.
- OpenAI planning prompts and JSON contracts for frame and payload planning.
- Payload-driven structured-TPL generation for the reference route.
- Removal of DNA attachment and DNA prompt requirements from the reference route.
- Request dispatch so omitted `sourceType` uses reference-frame generation and explicit `sourceType: "ai"` retains general AI generation.
- Local and semantic validation for unit scope, frame fidelity, TPL correctness, unique answer, and anti-copy constraints.
- Focused unit, service, and mocked OpenAI integration tests.

## Scope OUT (Must NOT have)

- Reparse or rewrite the existing past-question corpus.
- Require all generated claims to have DNA-style multiple indispensable evidence slots.
- Delete DNA v2 implementation or modify explicit `sourceType: "ai"` behavior.
- Cross selected-unit concept recombination.
- Frontend redesign. Existing clients gain the new default through API dispatch; explicit source-mode controls are not added in this scope.

## Open questions

None.

## Approval gate
status: awaiting-approval
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

Proposed task order after approval:

1. Define frame, payload, and concept-pool contracts with focused tests.
2. Implement selected-unit reference and concept selection.
3. Implement frame extraction and payload planning calls with strict JSON parsing.
4. Implement payload-driven TPL mapping and reference generation prompt changes.
5. Remove DNA coupling from the reference route.
6. Add frame, scope, novelty, answer, and template validation.
7. Run targeted and full backend verification.
