---
slug: reference-fidelity
status: planned
intent: clear
review_required: false
pending-action: execute .omo/plans/reference-fidelity.md only after explicit start
approach: Make source archetype, slot concept allocation, and response-mode answer plans backend-owned contracts; constrain AI to new content generation and require full coherence verification.
---

# Draft: reference-fidelity

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| provenance/archetype | Every source resolves and has a deterministic, versioned item type. | active | reference catalog + generation lineage |
| concept/answer planning | Each slot has bounded concepts and a mode-specific evidence-backed answer plan. | active | ConceptPayload/slot allocation |
| final generation/validation | AI preserves archetype; backend validates full stem-stimulus-choice-answer coherence. | active | final generation service/validator |
| fidelity QA | Bad 10-question exam is an executable before/after regression gate. | active | exam cd6c2f17-11bb-4be7-b17f-c9ebd875447e |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Reference fidelity | Preserve source item archetype and concept family; vary facts/context/wording. | User reports different item types as a defect. | yes |
| Answer ownership | Backend computes answers from typed plans; AI does not author the authoritative answer index. | Prevents stem/choice/answer drift. | yes |

## Findings (cited - path:lines)
- Actual exam audit: 7/10 lineage sources resolve to catalog; 3/3 resolved combo sources are misclassified as single selection; all 10 payloads contain `가산 수당`.
- `reference-frame-planner.prompts.ts:27` asks for a payload “without reusing the reference answer logic,” encouraging reasoning-topology drift.
- `reference-frame-generation.service.ts:189` selects template from payload shape rather than a source-owned archetype.
- Current frame `stem.style` is free text and validators check field validity, not source/generated type equivalence.

## Decisions (with rationale)
- Deterministic source classifier owns response topology and polarity; model fallback cannot override it.
- Concepts are allocated per slot and source concepts remain eligible; novelty targets scenario facts and wording.
- Add discriminated answer plans and an independent solver/verifier before persistence.

## Scope IN
- Provenance, archetype classifier, cache versioning, concept allocation, answer plans, final prompt/schema, coherence validation, phase-specific retry, fidelity audit.

## Scope OUT (Must NOT have)
- Prompt-only fix, cache reuse without version checks, generated-type diversity that overrides reference fidelity, completion-only QA.

## Open questions
- None; conservative fidelity defaults are adopted and reversible.

## Approval gate
status: planned
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
