# reference-generation-hardening - Draft

intent: clear
review_required: true
status: approved

## Decision
- Preserve meaningful model relationships; align provider schema and prompts with validators; normalize only deterministic representational differences; fail closed on broken references, cycles, and contradictory reasoning.

## Components
- Frame extraction: provider output, planner prompt, and frame contract alignment.
- Semantic and blueprint validation: atom, grounding, relation, and payload invariants.
- Retry and diagnostics: correction prompts and preserved terminal error paths.
- Generation lifecycle: final variant generation, persistence, and job failure propagation.
- Live API QA: authenticated reference job completion and saved exam/item verification.
