---
slug: reference-generation-resilience
status: drafting
intent: clear
review_required: true
plan_path: .omo/plans/reference-generation-resilience.md
plan_sha256: null
review_round_id: null
pending-action: write and review .omo/plans/reference-generation-resilience.md
review:
  momus:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/reference-generation-resilience.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  independent:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/reference-generation-resilience.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
approach: Normalize each parsed source into a single canonical target before selection; reconcile trusted source targets with textbook concepts; validate planner/final payloads at typed boundaries; turn invalid source data into structured skips/shortfalls rather than uncaught job failures; cover the production corpus with a deterministic preflight matrix.
---

# Draft: reference-generation-resilience

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| source-normalization | Every parsed source has one explicit primary target or a typed rejection. | active | backend/src/exams/reference-selector.service.ts:137 |
| catalog-reconciliation | Textbook and source target labels resolve to a shared canonical catalog concept without silently changing a textbook mapping. | active | backend/src/exams/reference-concept-catalog-resolver.ts:11; backend/src/exams/reference-frame-generation.service.ts:174 |
| planner-boundary | Planner payloads cannot emit target IDs inconsistent with the canonical source target. | active | backend/src/exams/reference-frame-generation.service.ts:255; backend/src/exams/reference-frame-planner.service.ts |
| generation-failure-surface | Bad candidates produce structured skip/shortfall data rather than uncaught InternalServerError exceptions. | active | backend/src/exams/exams.service.ts:458; backend/src/exams/reference-frame-generation.service.ts:419 |
| corpus-verification | Every cataloged source is classified for canonical target resolvability before production generation. | active | backend/src/textbook/reference-catalog-import.service.ts; backend/scripts/reference-live-qa.ts |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Multi-target source canonicalization | Use the first parsed target as the deterministic primary target and discard remaining source targets from the generation contract. | Existing selector already uses index 0 for eligibility; retaining them as supporting concepts would change source-faithful behavior. | Yes |
| Invalid source handling | Skip invalid sources during candidate selection and return an exact-count typed shortfall with no persistence when insufficient candidates remain. | Preserves existing transactional semantics while preventing unclassified 500 failures. | Yes |
| Source-only labels | Use source-derived deterministic IDs only when no exact normalized textbook label exists in the source unit; textbook IDs win collisions. | Retains existing textbook canonical IDs and supports sparse/empty units. | Yes |
| Public diagnostics | Expose only machine error code, requested/generated counts, and safe stage; keep source IDs in redacted internal preflight reports only. | Avoids source/corpus disclosure through job polling, logs, and HTTP errors. | Yes |
| Test strategy | Tests-first for pure normalization/reconciliation; fixture-driven integration plus full corpus preflight before release. | Production errors arise from mismatch between real corpus and unit mocks. | Yes |

## Findings (cited - path:lines)
 - `ReferenceFrameGenerationService.generate()` builds `requestedConcepts` from textbook units, then separately resolves source targets against a catalog built solely from those unit files (`backend/src/exams/reference-frame-generation.service.ts:174-203`). Empty unit concept files therefore permit selection but later fail target resolution.
 - `selectReferences()` treats the first source target as the canonical eligibility target (`backend/src/exams/reference-selector.service.ts:137-151`), while `buildReferenceFidelitySpec()` requires exactly one target concept and ID (`backend/src/exams/reference-fidelity-spec.ts:150-163`). Passing the entire multi-target list causes `INVALID_TARGET_CONCEPTS`.
 - `sourceConceptIds()` only matches normalized labels in the source unit (`backend/src/exams/reference-frame-generation.service.ts:639-653`), so catalog gaps surface as `REFERENCE_SOURCE_CONCEPT_UNRESOLVED`.
 - The service spec's planner client is a schema fixture, not a real model (`backend/src/exams/reference-frame-generation.service.spec.ts:24-120`); it can reject a new real-data shape before the final generation boundary is exercised.
 - The runtime error reaches job failure through `ExamsService.runJob()` (`backend/src/exams/exams.service.ts:458`) instead of returning a source-specific structured shortfall.

## Decisions (with rationale)
 - Normalize source targets once, immediately after parsing, and use that immutable normalized source object in selection, catalog reconciliation, planner input, fidelity spec creation, final generation, and lineage.
 - Preserve a textbook canonical concept whenever present; create source-derived deterministic IDs only for missing labels in the exact source unit.
 - Make source/corpus invalidity an explicit, redacted diagnostic with `sourceId`, machine reason, and count; never include source prose in logs or client/job errors.
- Use corpus preflight as a release gate so empty-unit and multi-target records are identified before users create jobs.
- Preserve the exact-count/no-partial-write terminal behavior: candidates may be skipped before generation, but any shortfall fails the job before a Question, ExamItem, or ExamRecord write.
- Consolidate Unicode, whitespace, and case normalization into one concept-key helper shared by selector eligibility, catalog reconciliation, and source-derived ID generation; textbook labels win normalized-key collisions.

## Scope IN
 - Reference-only source parsing, concept reconciliation, planner/fidelity boundaries, structured job errors, fixture/corpus verification, and related backend tests/scripts.

## Scope OUT (Must NOT have)
 - General `sourceType: 'ai'` generation behavior, frontend redesign beyond surfacing existing structured errors, automatic mutation of textbook/reference source records, migrations, bulk deletion, or weakening fidelity checks to accept malformed source data.

## Open questions
 - No blocking owner decision remains. The listed defaults are approved for plan generation.

## Approval gate
 status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
