# AI Generation Hardening Plan

## Goal

Prevent false shortfalls, provider/schema mismatches, partial persistence, stale
job states, and source exhaustion in `ai_blueprint` generation without changing
the existing `simply_reference` path.

## Invariants

- `acceptedCount <= requestedCount`.
- Preview shortfall occurs only when eligible certified blueprints are fewer than
  the requested count.
- Generation shortfall occurs only when admitted candidates are fewer than the
  requested count after all fallback candidates are exhausted.
- The frontend chooses only generation mode. TPL selection remains server-owned.
- AI never owns choices, answers, metadata, source structure, or lineage.
- Rejected candidates are never saved as questions.
- Cancelled or timed-out jobs never save a partial exam.

## Phase 0 — Reproduce and baseline

- Preserve the failed 3-question / 6-blueprint shortfall case as a regression
  fixture.
- Add counters for certified base sources, fallback blueprints, provider
  attempts, accepted candidates, rejected attempts, and unprocessed blueprints.
- Keep the existing simply-reference regression suite unchanged.

## Phase 1 — Canonical count model

- Replace ambiguous `candidateCount` semantics with an explicit fallback pool
  count.
- Centralize preview and generation shortfall decisions in one count utility.
- Keep progress totals equal to the user's requested question count; expose
  fallback pool size separately.
- Replace incorrect per-TPL shortfall calculation with rejection-by-template
  aggregation unless explicit per-TPL quotas exist.

## Phase 2 — Blueprint/source selection

- Scope previous AI source exclusion by user, subject, and requested unit range.
- Respect `excludePrevious`.
- Deduplicate by certified base source before generating variants.
- Prefer distinct base sources; use variants only as a last resort.
- If preferred family cannot fill the request, use other eligible families.
- Record capability rejection reasons per source.

## Phase 3 — Provider contracts

- Pass the template-specific JSON response schema for every structured TPL.
- Enforce exact slot counts for conversation, matrix, document, article,
  announcement, and workflow candidates.
- Preserve server-owned canonical source structure and metadata.
- Remove newline-based structure inference from materializers.

## Phase 4 — Capability and materializer safety

- Make capability flags reflect real answer engine, material, and web/PDF
  fixture results instead of static `true` values.
- Keep unsupported numeric/special TPLs automatically excluded.
- Replace generic structured validation with TPL-specific exact validation.
- Add explicit failure codes for shape, source fidelity, numeric facts, and
  answer-engine failures.

## Phase 5 — Retry and idempotency

- Retry the same blueprint once with a fresh nonce.
- Then try a different certified base source and eligible family.
- Avoid duplicate `(run, blueprint, attempt)` writes on reruns.
- Separate timeout, network, malformed output, schema, and internal errors.

## Phase 6 — Cancellation, timeout, and atomicity

- Propagate job cancellation to provider abort signals.
- Re-check cancellation before materialization and persistence.
- Add an overall AI job deadline.
- Prevent exam persistence after cancellation or timeout.
- Reconcile exam/run state if either side commits and the other fails.

## Phase 7 — Telemetry and migration safety

- Store template for accepted and rejected candidates.
- Store rejection counts/codes and fallback source attempts.
- Expose accurate stage counts and job diagnostics.
- Add production migration preflight for AI telemetry columns.

## Phase 8 — Verification and rollout

- Add regression tests for 3/5/20-question jobs, fallback, duplicate reruns,
  cancellation, timeout, source scoping, and every active TPL contract.
- Run web/PDF parity fixtures for every enabled TPL.
- Run staging shadow generation before enabling additional TPLs.
- Activate TPLs incrementally; leave unsupported TPLs excluded.

## Acceptance criteria

- No false `AI_BLUEPRINT_SHORTFALL` when fallback pool covers the request.
- No source exhaustion caused by another user or another unit range.
- No provider schema mismatch for an enabled TPL.
- No partial exam after failure, cancellation, timeout, or rerun conflict.
- Every active TPL has a server-owned materializer, answer validation, and
  web/PDF fixture.
