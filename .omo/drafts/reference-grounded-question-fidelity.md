---
slug: reference-grounded-question-fidelity
status: drafting
intent: clear
review_required: false
pending-action: await user decision to start work or request high-accuracy plan review
approach: Preserve the reference item's information order, conditional relationships, reasoning path, and choice logic while requiring newly written surface wording; retain the existing renderability and answer-topology validators.
---

# Draft: reference-grounded-question-fidelity

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| source-reuse policy | Final prompt explicitly retains source stem, material facts, view items, and choice structure. | active | backend/src/exams/exam-regenerator.service.ts:575 |
| acceptance policy | Variant validation accepts allowed source reuse while retaining template, topology, and renderability guards. | active | backend/src/exams/exam-regenerator.service.ts:652 |
| regression coverage | Reference-variant tests prove close source fidelity and reject malformed output. | active | backend/src/exams/exam-regenerator.reference-variant.spec.ts:158 |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Test strategy | TDD with focused Jest tests, then typecheck and targeted generation QA. | The generation contract changes at a behavioral boundary. | yes |

## Findings (cited - path:lines)

- `backend/src/exams/reference-frame-generation.service.ts:125` forwards source stem, stimulus, view items, and choices into `ReferenceVariantGenerationRequest`, but `backend/src/exams/exam-regenerator.service.ts:575` does not include the raw reference in its final model prompt.
- `backend/src/exams/reference-frame.types.ts:80` stores style, polarity, material density, information shape, and response topology, but not information order, conditional dependencies, reasoning steps, or choice logic.
- `backend/src/exams/exam-regenerator.service.ts:604` still declares source names, dates, values, case facts, and phrases forbidden; `backend/src/exams/exam-regenerator.service.ts:308` rejects detected source tokens after generation.
- `backend/src/exams/exam-regenerator.service.ts:652` rejects otherwise valid output when `hasSourceCopy` detects those tokens, while retaining separate TPL, choice cardinality, answer encoding, and renderability checks.
- `backend/src/exams/exam-regenerator.reference-variant.spec.ts:445` currently defines source-copy rejection and retry as intended behavior.

## Decisions (with rationale)

- Keep the existing canonical template, exact choice/view cardinality, answer encoding, and rendering validators. They control usable UI output and should not be weakened to gain textual similarity.
- Extract an anonymized structural blueprint upstream and make it the final generator's primary fidelity input, because raw source prose is neither present in the final prompt nor compatible with a structure-preserving, newly worded output.
- Replace lexical source-copy rejection with structure-fidelity validation and a targeted retry, so paraphrases are accepted while reordered facts, reversed conditions, and altered choice logic are not.
- Metis review incorporated: the blueprint must be added upstream because the final prompt does not receive raw reference text; traces must cover every rendered semantic surface; existing TPL, cardinality, topology, answer encoding, and renderability rejections remain regression invariants.

## Scope IN

- Final generation prompt and source-reuse contract.
- Field-aware validation of allowed versus prohibited source reuse.
- Focused tests for prompt policy, accepted high-fidelity variants, and malformed-output rejection.
- A manual generation QA path that compares generated output with a cited real reference question.

## Scope OUT (Must NOT have)

- Changes to the frontend renderer or question TPL schemas.
- Changes to the reference selector, planner model, or general AI-only generation flow.
- Broad corpus migration or retroactive rewriting of persisted questions.

## Open questions

- Resolved: use a structure-preserving policy. New surface wording is required; information order, conditions, reasoning steps, and choice logic are preserved.

## Approval gate
status: plan-ready
Plan created: `.omo/plans/reference-grounded-question-fidelity.md`. The user selected a structure-preserving, newly worded output policy. Metis reviewed the plan and its required constraints were incorporated.
