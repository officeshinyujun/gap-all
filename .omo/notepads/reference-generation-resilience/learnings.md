# Learnings

## 2026-07-24 Start
- Existing generator has cross-stage concept mismatch: selector uses first source target while fidelity requires exactly one target and catalog resolution can see sparse textbook units.

## 2026-07-24 Canonical Source Target
- `parseReference` now creates a readonly normalized target with one `primaryConcept` and one-element `concepts` tuple. Missing or blank raw targets return the existing typed `{ ok: false }` parse variant.
- Selector eligibility, source concept catalog resolution, normal generation, cache warmup planning, planner prompt preservation, fidelity construction, final requests, and lineage now consume the normalized target. Legacy planner fixtures retain `targetConcepts` only as shared type plumbing; production parsed references carry the normalized tuple too.
- Verification passed from `backend`: `npm test -- --runInBand reference-selector.service.spec.ts reference-frame-generation.service.spec.ts reference-frame-planner.service.spec.ts` (3 suites, 37 tests) and `npm run typecheck`.
- Risk: authenticated live-job QA remains deferred because no authorized backend session is available; the focused warmup spec verifies planner/cache propagation without external provider calls.

## 2026-07-24 Planner Fixture Variants
- Generation fixtures now carry the normalized primary target from the frame prompt into the payload mock, deriving its concept ID from the incoming subject/unit/target instead of an unrelated fixed ID; response counts continue to follow the normalized archetype topology.
- Regression coverage exercises multi-target normalization with an empty catalog, a non-default primary ID, and malformed target input; malformed input is rejected during reference selection before planner invocation.

## 2026-07-24 Concept Key Reconciliation
- Shared NFC/trim/collapsed-space/Korean-case concept keys now drive selection, textbook/source reconciliation, and concept IDs. A unique textbook key preserves its display label and ID; source-only labels receive one normalized stable ID; duplicate textbook keys return a typed ambiguity result.
- Verification: `npm test -- --runInBand reference-concept-key.spec.ts reference-concept-catalog-resolver.spec.ts reference-selector.service.spec.ts` passed (3 suites, 24 tests) and `npm run build` passed. `npm run typecheck` remains blocked by concurrent type errors in `reference-frame-generation.service.spec.ts` around `client.create` and `plannerClient().client`.

## 2026-07-24 Planner Helper Verification Repair
- The task-5 planner helper now exposes its dynamic `create` mock alongside the planner client contract; stale references use the current helper shape without changing reconciliation behavior.
- Verification: `npm run typecheck` and the task-2 focused selector/reconciliation suite passed.

## 2026-07-24 Canonical Candidate Pool
- Reference-frame generation now requests the complete deterministic eligible pool and consumes candidates in order until it reaches the requested accepted count or exhausts the pool. Invalid sources, typed planner rejections, and final fidelity rejections are counted without exposing source text or reason details.
- Pool exhaustion returns `REFERENCE_GENERATION_SHORTFALL` with `stageCounts: { source, planner, fidelity }`. A normalized primary source target remains the planner payload target and the final fidelity fallback reduces multi-target input to its first canonical target.
- Verification: `npm test -- --runInBand reference-selector.service.spec.ts reference-frame-generation.service.spec.ts reference-frame-planner.validation.spec.ts reference-fidelity-spec.spec.ts exam-regenerator.reference-variant.spec.ts` passed (5 suites, 112 tests); `npm run typecheck` passed.

## 2026-07-24 Exact-Count Job Boundaries
- Invalid or ambiguous sources now count as redacted source-stage rejections; all-invalid/exhausted pools return `REFERENCE_GENERATION_SHORTFALL` before planning, and reference persistence starts only after the exact requested count is available.
- Create and poll use one public job receipt that omits the internal request, logs, raw error, user ID, and source metadata while retaining the safe shortfall counts and code.
- Verification: `npm test -- --runInBand exams.persistence.spec.ts exams.service.spec.ts reference-frame-generation.service.spec.ts` passed (3 suites, 26 tests); `npm run typecheck` passed.

## 2026-07-24 Persisted Catalog Preflight
- Read-only persisted `ReferenceQuestion` preflight now emits sorted JSON/Markdown rows containing only source ID, canonical ID, and machine result. It rejects malformed logical IDs, missing primary targets, and normalized textbook-target collisions without a catalog write.
- Verification: `npm test -- --runInBand reference-catalog-preflight.service.spec.ts` passed (1 suite, 2 tests); empty in-memory catalog manual run produced passing JSON and Markdown. `npm run typecheck` remains blocked by an unrelated error at `reference-frame-generation.service.ts:252`.
- Follow-up: capturing the narrowed ambiguous source ID before the candidate-filter callback preserves reconciliation union narrowing; `npm run typecheck` now passes.
