---
slug: integrated-reference-generation-boundaries
status: drafting
intent: clear
review_required: true
plan_path: .omo/plans/integrated-reference-generation-boundaries.md
plan_sha256: null
review_round_id: null
pending-action: write and review .omo/plans/integrated-reference-generation-boundaries.md
review:
  momus:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/integrated-reference-generation-boundaries.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  independent:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/integrated-reference-generation-boundaries.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
approach: Replace validator-inferred prompt routing with explicit typed legacy and reference-variant APIs; complete and centralize the frame/payload contracts and fixtures; then propagate, generate, validate, retry, and manually verify structure-preserving variants.
---

# Draft: integrated-reference-generation-boundaries

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| prompt ownership | Legacy and reference-variant generation have explicit typed entrypoints. | active | backend/src/exams/exam-regenerator.service.ts:392 |
| contract ownership | Frame/payload schemas, validators, cache, and fixtures agree on blueprint and answer-plan requirements. | active | backend/src/exams/reference-frame.types.ts:147 |
| fidelity enforcement | Final output preserves structure with new Korean wording and receives bounded correction on mismatch. | active | backend/src/exams/exam-regenerator.service.ts:392 |
| system verification | HTTP routing, fixtures, type/build, and controlled reference generation remain correct. | active | backend/src/exams/exams.service.ts:94 |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Source policy | Newly written surface prose; preserve information order, conditions, reasoning, and choice logic. | User selected structure preservation. | yes |
| Public API | Separate typed legacy/reference prompt builders; no runtime validator dispatch. | Prevents contract changes from silently choosing the wrong model prompt. | yes |
| Test strategy | TDD plus focused Jest, typecheck, build, and controlled fixture-driven generation. | The change crosses contracts and runtime routing. | yes |

## Findings (cited - path:lines)

- `backend/src/exams/exam-regenerator.service.ts:1504` chooses the final prompt by calling `refs.every(isReferenceVariantGenerationRequest)`; that predicate validates full frame and payload contracts at lines 182-195.
- `backend/src/exams/exam-generator.service.ts:1391` is the production legacy owner; `backend/src/exams/reference-frame-generation.service.ts:305` is the production typed reference-variant owner.
- `backend/src/exams/exams.service.ts:94` routes `sourceType !== 'ai'` to reference-frame generation and does not require an HTTP/frontend contract change.
- `backend/src/exams/reference-frame.types.ts`, frame/provider validators, and shared fixtures already partially add `structureBlueprint`, but requiredness differs.
- `backend/src/exams/reference-frame.payload-validator.ts` and provider schemas retain legacy `claims`/`answerEncodingPlan`, while `reference-frame.contract.spec.ts` asserts forward `answerPlan` behavior.
- `backend/src/exams/reference-frame-planner.fixtures.ts` is the appropriate shared fixture authority; independent local frame/payload builders are currently present in planner, generation, selector, metrics, and regenerator specs.

## Decisions (with rationale)

- Remove validator-inferred routing rather than loosening validators. Validators remain strict boundary checks, while typed call ownership determines prompt selection.
- Make structural blueprint and answer plan required in new planner output, with an explicit cache-version/legacy-frame migration rule.
- Feed final generation a normalized structural blueprint, not raw reference prose, and require new visible wording.
- Retain canonical TPL, choice/view cardinality, answer encoding, and renderer validation as separate non-negotiable guards.
- Metis review incorporated: cover both synchronous and job HTTP routes, preserve `sourceType: 'ai'` legacy ownership, treat reference-generation metrics as test-only unless a runtime consumer is deliberately added, and make generation-progress propagation an explicit in/out-scope decision.

## Scope IN

- Explicit prompt-builder and regeneration entrypoints for legacy and reference-variant generation.
- Complete typed contracts, schemas, validators, cache handling, and shared fixture factories.
- Planner-to-regenerator propagation, final prompt structure contract, semantic/deterministic fidelity checking, bounded retry, and test migration.
- API routing regression, metrics fixture updates, typecheck/build, controlled generation QA, and high-accuracy plan review.
- Explicit regression coverage for existing job progress behavior; no new progress event behavior.

## Scope OUT (Must NOT have)

- No frontend workflow redesign, endpoint payload change, AI-only generator redesign, or corpus-wide persistence rewrite.
- No loose validator fallback, raw-prose copying policy, unbounded model retry, or unrelated format-only cleanup.
- Do not change job-progress semantics in this work; lock current save-stage behavior with a regression test unless the owner separately requests progress instrumentation.

## Open questions

- None. The integration uses the recorded structure-preserving, newly worded policy and explicit typed API boundary.

## Approval gate
status: reviewed-approved
Plan complete and dual-reviewed: Momus approved in `ses_0761ebe81ffektTKeHMdbXAj8n`; independent Oracle approved in `ses_0761ebda1ffeq5iAd19xPg6fS2`. Execute only through a dedicated worker session.
