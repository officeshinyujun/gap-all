# AI Blueprint TPL Expansion and Stabilization

## Goal

Expand `ai_blueprint` generation from the currently supported case/conversation
templates to every source-backed TPL that has complete material, deterministic
answer derivation, and renderer coverage.

## Non-goals

- Do not change the existing `simply_reference` generation path.
- AI never returns final question JSON, choices, answers, metadata, or lineage.
- Do not invent source facts, numbers, units, tables, or answers.
- Do not repair and save rejected candidates.
- Do not enable every TPL in one rollout.

## Canonical contract

- The server owns TPL shape, slot order, source facts, choices, answer, and
  metadata.
- The provider returns bounded text slots plus `explanationText` only.
- Conversation returns `messageTexts`; the server applies participants and
  `speakerSequence`.
- Matrix returns `cellTexts`; headers, rows, and cell positions are server-owned.
- Document/article/announcement returns paragraph/detail text arrays; document
  metadata and array shape are server-owned.
- Workflow returns `stepTexts`; step count, order, and indices are server-owned.
- Numeric/special TPLs are enabled only after source-fidelity and answer-engine
  fixtures pass.

## Ordered phases

### Phase 0 — Baseline

- Preserve the failed conversation job fixture and rejection counts.
- Record source/template capability counts.
- Keep simply-reference regression coverage unchanged.

### Phase 1 — Canonical provider contracts

- Use discriminated, template-specific provider output fields.
- Validate exact keys, slot count, bounded text, and no provider-owned structure.
- Keep server materializers and validators as the admission boundary.

### Phase 2 — Conversation and case

- Conversation uses `messageTexts`; server fixes speaker IDs and order.
- Case remains narrative-only; server creates the case DTO and answer.
- Add regression fixtures for speaker order, count, and legacy output rejection.

### Phase 3 — Retry and shortfall

- Classify rejection codes by template and failure reason.
- Retry with a fresh nonce and alternate certified blueprint when available.
- Report accepted/rejected counts and template shortfall; never save partial exams.

### Phase 4 — Matrix, document, article, workflow

- Add source-backed Matrix cell materialization and deterministic answer checks.
- Add Formal Document and Article paragraph materialization.
- Add Sequential Workflow step materialization and combination-answer checks.
- Auto-exclude sources without complete material or a supported answer engine.

### Phase 5 — Numeric and special TPLs

- Add chart/statistics engines with exact numeric/unit preservation.
- Add instructional, forum, promotional, and incident adapters only with
  source-fidelity and web/PDF fixtures.

### Phase 6 — Rollout

- Add per-TPL capability flags.
- Run shadow evaluation at 3, 5, and 20 questions.
- Enable TPLs incrementally after success-rate and parity checks.

## Required telemetry

Every rejected candidate records `blueprintId`, `template`, `attempt`, and a
specific failure code. Job results expose accepted/rejected counts and
shortfall grouped by template.

## Acceptance criteria

- The failed conversation fixture accepts 3/3 candidates.
- No accepted candidate violates conversation order or count.
- Every accepted candidate materializes into a canonical TPL DTO.
- Answer mismatches and source number/unit loss are zero.
- Unsupported or incomplete TPLs are automatically excluded.
- Alternate certified sources can fill candidate shortfall.
- Existing simply-reference tests remain green.
