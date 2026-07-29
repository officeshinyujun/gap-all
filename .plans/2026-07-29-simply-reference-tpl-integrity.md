# Simply-reference TPL integrity remediation

## Goal

Make every newly generated `simply_reference` question both factually faithful
to an answer-key verified source and visually consistent across the web study
view, dashboard, and PDF export.

The completed system must never duplicate a source passage across template
fields, silently drop source material during normalization, invent a display
column/step/metadata, or render different material in web and PDF.

## Observed baseline

- `TPL_CASE_DIAGNOSTIC_FRAME` currently duplicates text: source adapter assigns
  the first source line to `case_profile.context` and the complete source to
  `narrative`; both fields are rendered.
- `TPL_COMPARATIVE_MATRIX` can show synthetic `구분`/`row-1` data in web while
  PDF renders the raw table, because empty `selection_chips` passes the web
  renderer's `every()` condition.
- `TPL_ARTICLE` has incompatible paragraph representations in the provider
  schema, backend normalizer, web types, and PDF renderer. Existing Article
  rows fail runtime validation.
- Source-preserving conversion currently accepts only 88 of 424 answer-key
  verified catalog sources: 46 cases, 25 conversations, 17 formal documents,
  zero matrices, and zero workflows.
- The local historical `simply_reference` corpus contains five complete visible
  duplicate groups (30 rows) and one duplicated-choice question. It is not a
  valid baseline for new source-preserving output.

## Decisions

- A source remains the sole authority for stem, stimulus facts, view claims,
  choices, and answer. No LLM may repair missing visual/material information.
- A TPL adapter may add only presentation metadata that has no factual meaning
  (stable IDs, ordering indexes, empty optional decoration fields). It must not
  duplicate, summarize, omit, or reinterpret source text.
- The canonical stimulus DTO is shared by backend validation, API output, web
  renderer, dashboard renderer, and PDF renderer. A renderer must not infer
  columns/labels from an empty array or a technical identifier.
- A source is selectable only when it has an official answer, complete source
  material, and a lossless adapter for its classified TPL. Unsupported sources
  fail closed with a source-reextraction/unsupported-template reason.
- Historical questions are audited and retired/replaced in a separate,
  backup-first migration. Do not mutate them as a side effect of catalog sync.

## Phase 0 — Freeze and capture baselines

- [x] Keep `sourcePreserving: true` enabled for live simply-reference creation.
- [x] Add a generation receipt field recording adapter version, source template,
      and source-preserving validation result.
- [ ] Run the historical audit in production read-only mode and export the
      question IDs for duplicate question, duplicate choice, missing source,
      answer mismatch, invalid template, and missing combo issues.
      Local read-only baseline completed: `.audit-reports/simply-ref-audit-2026-07-29.json`
      (65 total, 46 failed). Production execution remains pending explicit target confirmation.
- [ ] Capture screenshot fixtures for each currently renderable TPL in web,
      dashboard, and PDF before changing renderer behavior.

### Exit criteria

- A versioned, read-only report lists all historical affected IDs.
- No new simply-reference question can use the legacy LLM rewrite route.

## Phase 1 — Define one canonical TPL contract

- [ ] Create a shared TypeScript DTO package/module for every supported TPL.
- [x] Choose one Article representation. Use `body_paragraphs: string[]` if
      that is the common web/PDF rendering representation; update provider
      schema and backend validation to match it.
- [x] Define exact semantics for matrix `headers`, `rows`, and optional row
      labels. `selection_chips: []` must mean “no row labels”, never “infer
      labels from row IDs”.
- [x] Define case ownership: `case_profile` contains only compact identity
      metadata; `narrative` owns all substantive source passage text.
- [x] Define workflow ownership: source ordinal is represented once. Do not
      render both synthetic `idx` and a duplicate ordinal label.
- [x] Define which conversation visual metadata is part of the DTO and ensure
      the API parser preserves it for web and PDF.
- [ ] Align frontend, dashboard, backend schema, normalizer, and PDF type
      declarations to this contract; eliminate incompatible array/object unions.

### Required contract tests

- [ ] Each valid DTO passes backend `validateSimplyReferenceStructuredTpl`.
- [ ] Each invalid/mixed DTO is rejected with a precise field reason.
- [ ] JSON round-trip through API normalization returns an equivalent DTO.
- [ ] Web and PDF fixtures consume the same DTO without type-specific fallback.

## Phase 2 — Repair the renderers before widening source coverage

### Case diagnostic frame

- [x] Change case adapter so `context` is a short extracted identity/context
      string only when separable from narrative; otherwise use an empty/hidden
      context and retain the source exactly once in `narrative`.
- [x] Update web/dashboard/PDF components to omit an empty context region.
- [x] Add an exact-text occurrence test: each substantive source sentence may
      appear once unless the source itself repeats it.

### Comparative matrix

- [x] Change web row-label detection from vacuous `[].every(...)` behavior to
      an explicit non-empty label contract.
- [x] Never display implementation IDs (`row-1`, `column-1`) as source text.
- [x] Make PDF and web use the same matrix row/header interpretation.
- [ ] Add visual fixtures for: no row labels, explicit row labels, first-column
      labels, and mixed/prose-plus-table source rejection.

### Article

- [ ] Add an explicit Article branch to `StimulusNormalizer.fillDefaults`,
      schema validation, web parser, dashboard parser, and PDF renderer.
      Backend normalization/schema work is complete; dashboard has no Article
      renderer and is explicitly text-only, so its scope must be reconciled
      before this cross-surface item can be closed.
- [ ] Remove plain-text JSON fallback for valid Article DTOs; reserve fallback
      for invalid persisted legacy data and emit an observable warning/metric.

### Formal document, conversation, and workflow

- [ ] Render formal document type/title/date/author only if populated; preserve
      all original clauses and do not filter source list lines by Korean keys.
- [x] Preserve conversation `scene_kind`, visual aid, participant icon keys,
      and ordering through API-to-web parsing, or remove them from PDF until
      both targets support them identically.
- [x] Render a workflow ordinal once and use source-native labels where present.
- [x] Remove generated labels such as `n단계` when they duplicate source labels.

### Exit criteria

- Screenshot comparison confirms no visible case duplication.
- Matrix web and PDF serialize the same rows/headers.
- Article fixtures render nonempty source text in web and PDF.
- No valid supported TPL enters plain-text fallback.

## Phase 3 — Replace heuristic source adapters with lossless adapters

- [x] Extract `sourcePreservingRender` into a pure, tested adapter module.
- [x] Preserve blank lines, paragraph boundaries, indentation, and source order;
      do not globally trim/split the raw source before a template-specific parser.
- [x] Support `TPL_COMPARATIVE_MATRIX` only for complete, structured tables.
      Extend parsing to the checked-in delimiter-less table form only after a
      fixture proves no header/cell information is lost.
- [x] Support `TPL_SEQUENTIAL_WORKFLOW` for numbered, bullet, and date-based
      timelines with explicit parser branches and full-line coverage checks.
- [x] Support conversation only when all visible source lines map to a speaker
      and message. Reject mixed prose/dialogue rather than discarding prose.
- [x] Support case/document only when every source line remains visible exactly
      once in the final DTO.
- [x] Keep unsupported graph, image, and incomplete-table sources excluded until
      the extractor stores their original structured values or image asset.

### Adapter acceptance test matrix

- [ ] For each fixture, concatenate all rendered source-bearing fields and
      compare normalized content to the original source exactly once.
- [ ] Reject a fixture if any non-decoration source line is absent or appears
      more than once.
- [x] Verify adapter template equals archetype/source template.
- [ ] Verify full renderer contract and web/PDF snapshots for every accepted
      fixture.

## Phase 4 — Re-extract and certify the catalog

- [ ] Keep the answer-key parser that handles multi-column evaluation-service
      answer tables (`question answer score` triplets).
- [x] Run answer-key backfill in dry-run mode, review unmatched source keys, then
      apply only verified answer mappings.
      2026-07-29 dry-run: 27 answer keys found, 0 pending verified writes,
      198 MOI questions unresolved; no write was performed.
- [ ] Acquire missing answer keys for the 198 unmatched mock-exam items and all
      currently answerless textbook-unit sources; do not infer answers.
- [ ] Extend extraction output with source page, visual asset reference, and
      structured table/chart data where text extraction is insufficient.
- [x] Run catalog preflight with hard failures for missing official answer,
      invalid source payload, incomplete visual material, and source-ID drift.
      Legacy source IDs now report `LEGACY_LOGICAL_SOURCE_ID` separately from
      malformed payloads; local preflight is intentionally still failed pending
      migration and answer acquisition.
- [ ] Synchronize catalog data through the non-destructive answer-key/catalog
      sync path for production. Do not use the destructive reset importer on a
      production database.

### Exit criteria

- Every live-selectable source has official answer + complete stimulus + adapter
      support.
- Catalog preflight distinguishes intentional exclusions from repairable rows.
- The source-selection shortfall reports template/answer/material reason counts.

## Phase 5 — Historical remediation and release

- [ ] Create a backup manifest for existing simply-reference questions, exam
      items, user attempts, and source lineage before any cleanup.
- [ ] Mark or remove historical questions with audit defects from user-facing
      selection; preserve them for forensic/admin review.
- [ ] Regenerate only from certified source records using the new adapter path.
- [ ] Deduplicate by full visible fingerprint, source ID, and official answer;
      retain one canonical question per intended source/variant policy.
- [ ] Run a staged rollout: internal/admin → small user cohort → full release.
- [ ] Monitor source selection shortfalls, renderer fallback count, TPL mismatch,
      duplicate fingerprint rejection, and user reports by template.

## Rollback

- Keep a feature flag that disables newly generated simply-reference exams while
  retaining read access to existing exams.
- Never fall back to LLM answer inference on rollback.
- Restore historical rows only from the backup manifest; do not recreate them
  from model output.
- If a renderer regression appears, stop the affected TPL family at source
  selection and keep other certified families available.

## Verification commands

Run targeted backend tests:

```bash
cd backend
npm test -- --runInBand \
  simply-reference-generation.service.spec.ts \
  simply-reference-generation-contract.spec.ts \
  stimulus-normalizer.spec.ts \
  simply-reference-historical-audit.service.spec.ts
npm run build
npm run audit:simply-reference-history
npm run preflight:reference-catalog -- --format=markdown
```

Run frontend/dashboard renderer and screenshot coverage after adding fixtures:

```bash
cd frontend
npm run build
npm run lint
```

### Actual verification — 2026-07-29

- Backend targeted suites: 64 tests passed (`simply-reference-generation`,
  contract, normalizer, and schema suites).
- Backend production build: `npm run build` passed.
- Frontend renderer tests: 3 passed (Matrix never shows synthetic `구분` or
  `row-1`; conversation visual metadata survives parsing; legacy Article
  paragraph objects normalize to `string[]`).
- Frontend: `npm run build` and `npm run lint` passed.
- Dashboard: `npm run build` passed. `npm run lint` is blocked because this
  workspace has no ESLint 9 `eslint.config.*` file; it is not related to these
  changes.
- Local catalog preflight executed with `DATABASE_LOCAL_URL`: failed (1,280
  rows; primarily `MISSING_OFFICIAL_ANSWER`, plus invalid source IDs/payloads).
  This is an expected Phase 4 data-certification blocker, not a renderer build
  failure.
- Answer-key catalog sync dry-run: 872 parsed records / 1,280 catalog records /
  0 rows eligible for an answer-key update. Source answer-key backfill dry-run:
  27 answer keys / 0 verified updates / 198 unresolved MOI questions.
- Local preflight after legacy-ID diagnosis: 356 `MISSING_OFFICIAL_ANSWER`, 17
  `INVALID_SOURCE_PAYLOAD`, and 907 `LEGACY_LOGICAL_SOURCE_ID` rows. No catalog
  or generation data was changed.
- Legacy migration planning command: `npm run
  plan:reference-catalog-legacy-migration` is read-only and produced 534 safe
  single-row rename proposals plus 373 canonical/legacy consolidation groups;
  all 1,280 rows were canonicalizable. The command’s own ESLint check passed.
  Repository-wide backend lint remains blocked by unrelated existing test type
  errors; backend production build passed.
- A guarded local-only write then applied the 534 collision-free renames after
  creating `.audit-reports/reference-catalog-legacy-renames-2026-07-29T15-58-38-504Z.json`
  (534 rollback entries).
- A separate consolidation step then deleted 373 content-identical legacy
  duplicate rows (backed up to `.audit-reports/reference-catalog-legacy-consolidation-2026-07-29T16-06-13-121Z.json`)
  with zero downstream references. Catalog reduced from 1,280 to 907 unique rows.
- Final local preflight: 528 `INVALID_SOURCE_PAYLOAD`, 379
  `MISSING_OFFICIAL_ANSWER`. No `INVALID_LOGICAL_SOURCE_ID` or
  `LEGACY_LOGICAL_SOURCE_ID` rows remain. All 907 rows are now canonical.
- Answer-key sync/backfill dry-runs confirmed 423 answer-bearing rows are
  already matched; remaining 198 MOI answers require PDF text-extraction fixes
  beyond TPL/renderer scope.
- Fixed macOS Unicode normalization bug in backfill script (NFD → NFC). 120
  additional MOI answers were written to parsed corpus and 40 synced to the
  local catalog. 58 kongil 2025 수능 answers remain blocked by image-only PDFs.
  Final catalog state: 907 canonical rows, 463 with verified answers, 444
  without (textbook-unit sources and image-PDF MOI exams).
- Phase 5 audit re-run: 40 of 65 historical questions remain failed (down from
  46). `missing_source` cleared entirely; 4 new `answer_mismatch` detected.
  Cleanup manifest: `.audit-reports/simply-ref-cleanup-manifest-phase5.json`
  identifies 30 duplicates, 1 duplicate choice, 4 answer mismatches, and 5
  invalid-tpl (Article) rows for future remediation.

## Out of scope

- Inventing graph values, image content, answer keys, or missing source context.
- Treating a renderer fallback as a valid production template.
- Destructive production catalog reset without an approved migration and backup.
