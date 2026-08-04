# Simply-reference TPL integrity and constrained AI generation

## Goal

Make every newly generated `simply_reference` question both factually faithful
to an answer-key verified source and visually consistent across the web study
view, dashboard, and PDF export.

The completed system must never duplicate a source passage across template
fields, silently drop source material during normalization, invent a display
column/step/metadata, or render different material in web and PDF.

This plan now also covers the safe introduction of an additional AI-generated
question mode. The new mode must not weaken the current source-preserving
`simply_reference` path. AI may propose bounded prose or candidate wording, but
the backend remains authoritative for the question structure, answer rule,
choices, source facts, validation, admission, persistence, and job lifecycle.

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
- Do not reintroduce the retired free-form `ai` or reference-frame path. Add a
  separate feature-gated `ai_blueprint` mode so the stable
  `simply_reference` path has no new conditional branches.
- Start with only server-solvable question families: concept classification,
  constrained case questions, and later deterministic calculation questions.
  Do not support matrices, workflows, formal documents, image-dependent
  questions, or combination questions in the first AI release.
- Do not ask the model to return a complete persisted `Question` object. The
  model returns a minimal candidate (initially bounded prose plus explanation
  text); the backend constructs choices, answer index, stimulus DTO, lineage,
  and final question record.
- Generate and validate one candidate per blueprint (or a very small batch),
  discard invalid candidates, and retry with a new nonce. Never patch a
  partially invalid candidate into a valid-looking question.
- Use precomputed unit profiles derived from certified reference data for the
  UI and blueprint selection. Do not run an LLM over the whole catalog during a
  user's loading request.
- Treat answer correctness as a hard admission rule. The model's claimed
  `correctAnswer`, if present, is advisory and must never be persisted.
- Keep the asynchronous job contract. The HTTP request must enqueue/record a
  job and return immediately; AI calls run in a worker-safe execution path and
  progress is persisted for polling and recovery.

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

## AI blueprint extension

### Goal and non-goals

Add an optional `ai_blueprint` mode without changing the default
`simply_reference` path. The model may write bounded prose, but the backend
must own the blueprint, answer rule, choices, material DTO, validation,
lineage, persistence, and job lifecycle.

Non-goals for the first release:

- No free-form whole-question JSON generation.
- No model-selected answer index or model-authored official answer.
- No invention of missing source facts, diagrams, tables, formulas, or answer
  keys.
- No combo, workflow, image, formal-document, complex matrix, or multi-source
  questions until each has a deterministic validator and renderer fixture.
- No synchronous AI generation from `POST /exams`.
- No fallback that silently turns a failed AI question into a fabricated one.

### Evidence and decisions

- `backend/src/exams/exams.service.ts:271-290` routes all live creation to
  `createSimplyReferenceExam`; preserve this behavior when the flag is off.
- `backend/src/exams/exams.service.ts:621-753` already provides the required
  transactional save boundary for `Question`, `ExamRecord`, and `ExamItem`.
- `backend/src/exams/simply-reference-generation.service.ts:154-486` already
  implements catalog selection, concept matching, previous-source exclusion,
  batching, deadlines, and progress reporting; reuse contracts, not its
  source-preserving draft path.
- `backend/src/entities/reference-question.entity.ts` contains source ID,
  content hash, provenance, parse version, and payload. Only certified rows
  with official answer and complete material may enter an AI blueprint.
- `backend/src/textbook/textbook.service.ts:52-128` supplies unit concepts and
  unit data; profile computation must be cached, not performed in the browser
  loading path.
- `backend/src/exams/exam-generation-jobs.service.ts` stores jobs in an
  in-memory `Map`; this is unsafe for long AI work, restarts, and multiple
  workers and must be replaced or backed by durable job persistence.
- `frontend/features/exam-generation/model/JobProgressProvider.tsx` polls
  every 2.5 seconds but currently removes the job ID after any polling error;
  transient errors must retain the job and retry with backoff.
- `frontend/components/exam/CreateExamModal/index.tsx` currently submits
  `sourceType: 'simply_reference'`; AI selection must be capability/flag gated
  and must not alter the disabled-state request.

Decisions:

- Add a separate `ai_blueprint` mode; do not add AI branches to
  `SimplyReferenceGenerationService`.
- Precompute a versioned unit profile from certified catalog data. The profile
  contains counts and supported patterns, never unverified AI claims.
- Start with concept classification, then constrained cases, then deterministic
  calculations. Choices and answer indices are server-derived.
- Ask the provider for only minimal candidate text (`stemText` and
  `explanationText`) with strict schema, bounded length, and no extra fields.
- Reject invalid candidates and retry with a fresh nonce; never repair a
  partially invalid question into a saved question.
- Store profile, blueprint, prompt, model, validator, source, and candidate
  attempt versions in lineage and generation-run records.

### TPL-faithful AI correction

The current AI prototype is not release-ready for real-exam similarity. This
is an architectural limitation, not only a prompt problem:

- `AiQuestionBlueprint` keeps only a broad family, concept, template name, and
  simple answer/distractor rules. It does not preserve the parsed
  `ReferenceArchetype` fields: stem intent, polarity, response mode, choice
  topology, material kind, reasoning pattern, shell, combination plan, view
  keys, or concept-role cardinality.
- `AiProviderAdapter` receives a prose context, but does not receive a typed
  contract for the real question's material and choice structure.
- `AiQuestionMaterializer` currently emits `TPL_CASE_DIAGNOSTIC_FRAME` for
  every accepted AI item and constructs options from concept names. This makes
  cases, comparison questions, negative questions, combination questions, and
  calculations look essentially the same.
- `AiQuestionValidator` checks renderability and a small answer invariant, but
  does not prove archetype, polarity, response mode, reasoning pattern,
  source-fact, or distractor fidelity.

Adding more enum labels without replacing this generic Materializer would only
create more names for the same wrong output. The existing TPL system must stay
the sole rendering contract, but generation must become **archetype + TPL
aware**.

### Existing TPL reuse decision

Do not create an AI-only rendering format or new renderer. Reuse the current
pipeline exactly:

```text
ReferenceQuestion sourcePayload
  -> parseReference()
  -> ReferenceArchetype
  -> StructuredTplName / getTplSchema()
  -> TPL-specific AI Blueprint
  -> TPL-specific Materializer
  -> validateSimplyReferenceStructuredTpl()
  -> existing StimulusNormalizer/web/PDF renderer
```

The AI path must emit the same canonical `stimulus_data`, `options_list`,
`combo_block`, and template DTO consumed by the existing web/PDF surfaces. A
renderer change is not an acceptable way to make malformed AI output display.

### Archetype-aware Blueprint contract

Replace the generic AI Blueprint with a discriminated contract that copies the
certified source archetype. The model cannot choose the archetype or template.

```ts
type TplAwareAiBlueprint = {
  family: AiQuestionFamily;
  sourceArchetype: ReferenceArchetype;
  selectedTemplate: StructuredTplName;
  stemContract: StemContract;
  materialContract: MaterialContract;
  choiceContract: ChoiceContract;
  answerRule: AnswerRule;
  distractorRule: DistractorRule;
  sourceEvidence: SourceEvidence[];
  variantPlan: VariantPlan;
};
```

The Blueprint must preserve:

- stem intent and positive/negative polarity
- response mode
- choice encoding and choice topology
- material kind and stimulus role
- reasoning pattern
- source TPL and shell requirements
- combination plan
- view keys and view count
- concept role/cardinality
- deterministic numeric/condition facts

### User experience and automatic unit selection

The user selects only subject, unit range, difficulty, and count. The user does
not select a specific case or source. The backend profile decides the
archetype/TPL distribution:

1. filter certified sources in the selected units;
2. exclude incomplete/unsupported TPLs;
3. count by archetype, TPL, polarity, response mode, material kind, and
   reasoning pattern;
4. rank pairs by observed unit frequency and fixture coverage;
5. allocate a mixed set with per-archetype caps;
6. prefer unseen source IDs and full fingerprints for the user;
7. generate typed variants without changing answer-determining facts.

The UI may say “이 단원의 실제 출제 유형을 자동 반영합니다”, but must not
show a manual case-type selector unless that type is explicitly available in
the returned profile.

### TPL/archetype rollout order

The rollout unit is an **archetype + TPL pair**, not a broad label.

#### Tier 1

1. `positive_single_selection + TPL_CASE_DIAGNOSTIC_FRAME`
   - choices are complete judgments/statements, never bare concept names;
   - server derives one correct statement.
2. `negative_single_selection + TPL_CASE_DIAGNOSTIC_FRAME`
   - preserve “옳지 않은/적절하지 않은” polarity;
   - keep all choices grammatically and structurally parallel.
3. `single_selection + TPL_CONVERSATIONAL_FLOW`
   - server fixes speakers, turn count, message order, and required evidence;
   - provider writes only bounded message text.

#### Tier 2

4. truth-combination / `ㄱㄴㄷ` using existing `comboBlock` and
   `combinationPlan`;
5. complete structured tables using `TPL_COMPARATIVE_MATRIX`;
6. formal document/announcement/article only when all required clauses are
   represented in the existing schema.

#### Tier 3

Calculation, quantitative chart, workflow, instructional scene, forum, and
image-dependent items each require their own deterministic answer engine and
fixture set. Adding their enum values alone is forbidden.

### TPL-specific provider and Materializer contracts

Provider output remains minimal, but fields are selected by the TPL contract:

```ts
// case
{ narrativeText, explanationText }

// conversation
{ messages: [{ speakerId, text }], explanationText }

// combination
{ propositions: [{ key, text }], explanationText }

// matrix
{ cellTexts: string[][], explanationText }
```

The provider never returns final choices, answer index, template name,
arbitrary stimulus JSON, IDs, or lineage. Every response uses strict schema,
exact cardinality, enum speaker/key values, and length limits.

Each supported pair requires four pure functions:

```text
buildProviderContract(blueprint)
materializeCandidate(blueprint, candidate)
deriveAnswerAndChoices(blueprint, materialized)
validateAdmission(blueprint, materialized)
```

Admission must verify template, stem polarity, response mode, view keys/count,
source-derived facts, unique server-derived answer, parallel choice shape,
distractor plausibility, explanation support, full-fingerprint novelty, and
web/PDF equivalence. The current generic Materializer that always emits case
TPL plus concept-name choices must be retired from the production AI path.

### Source evidence and variant policy

Every Blueprint must include source ID/hash/unit, parsed archetype, stem intent,
normalized material excerpt, view keys/count, target concept, reasoning
pattern, and deterministically extracted numeric/condition facts.

Variants may change actors, names, surface context, and typed presentation
slots. They may not change answer-determining facts unless the server
recalculates the answer. A new nonce alone is not a meaningful variant. Every
variant must pass a structural-difference and full-fingerprint check while
retaining original source lineage.

### Implementation phases

- [ ] **F-0 baseline:** freeze current AI output as prototype/non-release;
      export representative real questions per unit, archetype, TPL, polarity,
      response mode, and reasoning pattern with web/PDF fixtures and reviewer
      labels.
      - [x] Add deterministic real-reference baseline corpus export tooling.
      - [ ] Run export against an approved production catalog and attach
            reviewer labels/fixtures.
- [x] **F-1 profile enrichment:** aggregate unit statistics by full
      `ReferenceArchetype` and TPL, not only `concept/case`; include blocked
      reasons and certified counts.
- [x] **F-2 Blueprint compiler:** copy archetype/TPL contracts into typed
      Blueprints; allocate mixed archetype/TPL pairs automatically by unit;
      remove user source/case selection.
- [x] **F-3 Tier-1 adapters:** implement positive case, negative case, and
      conversation adapters using the existing TPL schemas and renderers.
      - [x] Preserve certified positive/negative case archetypes, polarity,
            response mode, choice topology, and source template.
      - [x] Add the conversational-flow adapter with server-fixed participants,
            speaker sequence, bounded provider messages, and existing TPL DTO.
- [ ] **F-4 answer engines:** server-derive choices and answer for each pair;
      add condition/proposition/slot evaluators; provider answer is ignored.
      - [x] Add the Tier-1 single-selection answer engine for case and
            conversation TPLs; choices and correct answer are server-derived.
      - [ ] Add condition/proposition/slot evaluators for combination and
            calculation pairs.
- [ ] **F-5 validators:** add archetype, polarity, response-mode, source-fact,
      distractor, full-fingerprint, web, and PDF validators; reject rather than
      convert to another TPL.
      - [x] Preserve and validate deterministic numeric/unit source-fact anchors
            in Tier-1 candidate text.
- [ ] **F-6 variants:** add typed variant plans and prove meaningful structural
      novelty on the fixed corpus.
      - [x] Reject exact and structurally identical accepted variants.
      - [ ] Prove meaningful novelty against the approved fixed corpus.
- [ ] **F-7 shadow evaluation:** compare accepted/rejected output to real-item
      rubrics by archetype/TPL before exposing it to users.
- [ ] **F-8 staged rollout:** enable one subject/unit and one Tier-1 pair for
      admins, then expand only after thresholds; retain per-pair kill switches.

### Fidelity release gates

- 100% selected-template/schema validity;
- 100% server answer agreement;
- 100% stem polarity/response-mode agreement;
- 100% required source-fact retention;
- 99.9% web/PDF parity;
- zero duplicate or structurally identical variants;
- reviewer-approved distractor plausibility;
- no generic concept-name options unless that is the real archetype;
- no fallback from unsupported TPL to `TPL_CASE_DIAGNOSTIC_FRAME`.

The immediate next implementation target is therefore not “more generic AI
types”, but these three concrete pairs:

```text
positive_single_selection + TPL_CASE_DIAGNOSTIC_FRAME
negative_single_selection + TPL_CASE_DIAGNOSTIC_FRAME
single_selection + TPL_CONVERSATIONAL_FLOW
```

### Target flow

```text
certified reference catalog + textbook concepts
  -> cached unit_exam_profile
  -> deterministic blueprint compiler
  -> minimal provider candidate
  -> server materializer (choices/answer/stimulus)
  -> structure/fact/answer/duplicate/renderer validators
  -> accepted Question transaction OR rejected candidate
```

The frontend flow is:

```text
unit selection -> automatic unit-profile/archetype allocation
  -> POST /exams/jobs -> poll durable job -> navigate by examId
```

Add read-only APIs:

```text
GET  /exams/generation-profile?subjectSlug=...&startUnitNum=...&endUnitNum=...
POST /exams/ai-blueprints/preview
```

The preview does not call the LLM. It returns unit/concept counts, certified
source counts, supported families, blocked reasons, deterministic selected
blueprints, and availability. The job revalidates all data at execution time.

### Data contracts and persistence

Add discriminated types for `AiQuestionFamily`, `QuestionBlueprint`,
`MutableSlot`, `InvariantFact`, `AnswerRule`, `DistractorRule`, `AiCandidate`,
`AiValidationResult`, and `AiGenerationFailure`. A blueprint must contain a
deterministic answer rule and certified source evidence.

Add versioned persistence for:

- `unit_exam_profiles`: subject/unit, concept/family/template/difficulty
  distributions, supported/blocked reasons, catalog/textbook/profile versions.
- `ai_generation_runs`: user/request, mode, model, versions, status, deadline,
  progress, accepted/rejected counts, shortfall, idempotency key, exam ID.
- `ai_generation_candidates`: run/blueprint/attempt, redacted provider output,
  normalized output, validation result, failure code, and timestamps.

Extend `generationLineage` with `generationPath: 'ai_blueprint'`, source IDs and
hashes, profile/blueprint/prompt/model/validator versions, answer-rule ID,
family/template, nonce, attempt, and passed validation version.

### Safe family rollout

1. **Concept classification:** server chooses target and distractor concepts;
   AI writes a bounded situation; server applies predicates and builds choices.
2. **Constrained case:** server fixes actor/context/action/condition/result
   slots from typed allow-lists; AI writes prose around them; server evaluates
   normalized slots and rejects omitted or altered answer-determining facts.
3. **Calculation:** server generates variables and computes answer/distractors;
   AI writes only the stem/explanation; final displayed numbers are re-parsed
   and recalculated before admission.

Defer combo, workflow, matrix, formal-document, image, diagram, and compound
questions. Their structure must not be entrusted to the provider merely because
the returned JSON parses.

### Ordered implementation phases

- [ ] **AI-0 — freeze and instrument.**
      - [x] Add the disabled `ai_blueprint` enum and supported-family contract.
      - [x] Add versioned blueprint/candidate/progress/validation contracts.
      - [x] Add a fail-closed feature flag and stable AI failure codes.
      - [x] Add AI job progress stages and a redacted receipt projection.
      - [x] Prevent `ai_blueprint` from silently falling back to
            `simply_reference`, even if the flag is manually enabled.
      - [x] Add DTO, feature-flag, job-progress, and source-mode regression
            tests; existing `simply_reference` tests remain unchanged.
       - [x] Add production metrics emission and a durable correlation/telemetry
             sink together with the generation-run persistence in AI-5.
- [ ] **AI-1 — build profiles.**
      - [x] Add `unit_exam_profiles` entity/migration/service and register it
            with TypeORM/Nest.
      - [x] Add deterministic source/textbook fingerprints and persisted profile
            reuse.
      - [x] Aggregate unit/concept/family counts from parsed certified catalog
            rows and expose blocked evidence instead of dropping it.
      - [x] Fail closed for malformed, answerless, ineligible, or unsupported
            source material; only supported evidence contributes to supported
            family recommendations.
      - [x] Add authenticated `GET /exams/generation-profile` and sparse,
            unsupported-template, missing-answer, and malformed-row fixtures.
       - [x] Add the standalone deterministic dry-run rebuild command and a
             catalog/profile reconciliation report before production rollout.
- [ ] **AI-2 — compile blueprints.** Implement deterministic seed/nonce,
      concept/family caps, previous-question exclusion, invariant facts, typed
      mutable slots, answer/distractor rules, source evidence, and preview
      endpoint. Test unavailable evidence, unsupported families, shortfalls,
      repeated runs, and exact requested counts.
      - [x] Add deterministic seed selection, source deduplication, family and
            concept filtering, invariant facts, typed mutable slots,
            answer/distractor rules, source evidence, and blueprint versioning.
      - [x] Add DTO validation and gated `POST /exams/ai-blueprints/preview`.
      - [x] Add deterministic, unsupported-family, and source-shortfall tests.
       - [x] Add per-concept/family quotas and previous-question exclusion at
             the real user generation boundary after durable run state exists.
- [ ] **AI-3 — provider adapter.** Implement timeout/abort/deadline, model and
      prompt versions, minimal JSON schema with `additionalProperties: false`,
      strict parser, token/length limits, redacted logging, and per-candidate
      retries. Unknown fields, wrong types, malformed JSON, and provider answer
      claims must fail closed.
      - [x] Add model/prompt/contract versions, bounded timeout/AbortSignal, and
            a strict two-field JSON schema.
      - [x] Reject malformed JSON, unknown fields, wrong types, empty text, and
            provider answer/choice fields.
      - [x] Add bounded per-blueprint retries with stable rejection codes.
       - [x] Add redacted provider telemetry and token-usage persistence in AI-5.
- [ ] **AI-4 — materialize and validate.** Implement concept and case
      materializers; derive five choices and answer index on the server; add
      structural, invariant/fact, answer-rule, explanation, duplicate,
      difficulty, and web/PDF renderer validators; persist rejection reasons.
      - [x] Materialize a canonical case stimulus DTO, five choices, and answer
            index without accepting them from the provider.
      - [x] Validate candidate/DTO shape, unique distractors, answer rule,
            invariant ownership, explanation support, and canonical renderer
            contract.
      - [x] Reject duplicate fingerprints and return per-attempt failure codes.
       - [x] Add durable candidate/rejection persistence and provider usage
             telemetry; calibrated difficulty validation remains separate.
       - [x] Add calibrated difficulty admission validation for Tier-1 output.
- [ ] **AI-5 — durable jobs.** Replace/back the in-memory job map with durable
      `generation_jobs` state plus queue/worker processing; add idempotency,
      heartbeat, stale-worker recovery, timeout, cancellation, monotonic
      progress, and one final transaction after the exact accepted count is
      reached. Preserve the current receipt shape additively.
      - [x] Add durable `ai_generation_runs` and
            `ai_generation_candidates` entities/migration with versioned request,
            candidate, validation, failure, and exam metadata.
      - [x] Add idempotent AI run execution keyed by the job ID, persisted run
            status/counters, candidate rejection records, and failure state.
      - [x] Connect the AI job mode to server-side blueprint → provider →
            materializer → validator → exact-count transaction saving
            `Question`, `ExamRecord`, and `ExamItem`.
       - [x] Back the HTTP job receipt with durable snapshots, heartbeat updates,
             stale-worker recovery, and explicit cancellation; current in-memory
             state remains the hot cache.
- [ ] **AI-6 — non-blocking frontend.** Add capability-gated profile/family
      steps, API types, job stages (`profile`, `blueprint`, `candidate`,
      `validation`, `saving`), progress/error/shortfall UI, session recovery,
      polling backoff, cancellation, and completion navigation. Keep the
      existing modal behavior when the flag is off.
      - [x] Add selectable `기출 보존형` / `AI 신규 문항` modes and concept/case
            family selection; submit `sourceType` and `aiQuestionFamily`.
      - [x] Extend frontend job/source contracts with AI stages and accepted /
            rejected progress counters.
      - [x] Show AI progress in the existing non-blocking generation toast and
            preserve the existing completion refresh/navigation behavior.
      - [x] Keep the job ID during transient polling failures and retry with
            bounded backoff instead of ending the job or leaving a false failed
            state.
       - [x] Add profile-driven capability/availability UI and explicit server
             cancellation; backend feature flags remain the final gate.
- [ ] **AI-7 — shadow evaluation.** Run canned provider contract tests, then
      real shadow jobs that do not expose questions. Review accepted/rejected
      examples by family; measure answer agreement, renderer success, duplicate
      rate, latency, cost, and rejection reasons against a versioned corpus.
      - [x] Add an offline versioned-corpus evaluator with acceptance,
            rejection, duplicate, and per-template metrics.
      - [ ] Run the evaluator against an approved real shadow corpus and record
            reviewer labels/thresholds.
- [ ] **AI-8 — staged release.** Enable one family and subject for admins,
      then a small beta cohort with daily limits. Roll out only after thresholds
      hold for an observation window. Keep global and per-family kill switches;
      rollback stops new AI jobs without altering readable existing exams.
      - [x] Add global, per-family, and subject allow-list kill switches.
      - [ ] Enable an admin-only cohort and prove rollback against production
            configuration.

### Failure and admission contract

Use stable codes:

```text
AI_PROFILE_UNAVAILABLE AI_UNSUPPORTED_FAMILY AI_BLUEPRINT_SHORTFALL
AI_PROVIDER_TIMEOUT AI_PROVIDER_MALFORMED_OUTPUT AI_CANDIDATE_SCHEMA_INVALID
AI_INVARIANT_MISMATCH AI_ANSWER_RULE_MISMATCH AI_DISTRACTOR_INVALID
AI_EXPLANATION_MISMATCH AI_DUPLICATE_REJECTED AI_RENDER_REJECTED
AI_RETRY_EXHAUSTED AI_JOB_TIMEOUT AI_JOB_CANCELED
```

Every candidate must pass all of the following before persistence:

```text
schema + template + invariant facts + answer rule + unique choices
+ explanation support + duplicate/fingerprint + difficulty + web/PDF render
```

The model's answer is never authoritative. If accepted count is below requested
count, return a shortfall with requested/attempted/accepted/rejected counts and
do not save a partial exam.

### Files expected to change

Backend existing: `exams/dto/create-exam.dto.ts`, `exams/exams.controller.ts`,
`exams/exams.service.ts`, `exams/exam-generation-jobs.service.ts`,
`exams/exam-generation.utils.ts`, `exams/exams.module.ts`, `app.module.ts`,
and migration registration. New backend modules should include
`ai-blueprint.types.ts`, `ai-unit-profile.service.ts`,
`ai-blueprint.service.ts`, `ai-provider.adapter.ts`,
`ai-question-materializer.ts`, `ai-question-validator.ts`, and durable
generation persistence/entities.

Frontend existing: `components/exam/CreateExamModal/index.tsx`,
`entities/exam/api/examApi.ts`, `entities/exam/model/types.ts`,
`features/exam-generation/model/JobProgressProvider.tsx`, and
`app/(main)/exam/[subject]/page.tsx`. Add profile/preview API clients,
generation profile/progress components, hooks, and tests.

### Risks and open questions

- The catalog currently has unresolved answer/material rows; the first AI
  profile must explicitly exclude them. Decide the production certification
  threshold before enabling any subject.
- The current in-memory job service must be replaced or deployment must be
  proven single-instance. Multi-instance production use without durable state
  is not acceptable.
- “Similar to the real exam” needs a reviewed metric, not only embedding
  similarity. Define reviewer rubric for reasoning structure, distractor
  plausibility, wording, and difficulty.
- Provider output and prompt retention may contain textbook/source content;
  confirm privacy, retention, and OpenAI data-processing policy before logging.
- Decide whether AI-generated questions should be stored in the shared
  `questions` pool or only referenced by their owning exam. The initial release
  should prefer owning-exam lineage and no global reuse until quality is proven.
- Decide whether `customPrompt` is allowed in AI mode. If enabled, it must be
  an instruction inside the allowed blueprint and must not override facts,
  answer rules, or supported templates.

### Acceptance criteria

- [ ] AI flag off leaves existing simply-reference APIs, jobs, renderers, and
      persistence behavior unchanged.
- [ ] Profile/preview is deterministic and never calls the LLM.
- [ ] Unsupported or uncertified units/families cannot produce blueprints.
- [ ] Provider output cannot directly set choices, answer, stimulus DTO, or
      lineage.
- [ ] All accepted questions have reproducible blueprint/source/version lineage.
- [ ] All rejected candidates have stable reason codes and are not user-facing.
- [ ] Release corpus has zero known answer mismatches and 99.9% renderer
      success; structural admission is at least 99%; deterministic answer
      agreement is at least 99.5%.
- [ ] Job receipt returns immediately; refresh/restart/retry does not lose or
      duplicate a job; no permanent frontend spinner remains.
- [ ] Exact-count shortfall, timeout, cancellation, provider failure, and
      transaction rollback have deterministic terminal outcomes.
- [ ] Global and per-family kill switches work without changing existing exams.

### Actual verification — 2026-08-02 AI-0 slice

- PASS: targeted backend tests — 28 tests passed across DTO, feature flag, job
  receipt/progress, and `ExamsService` compatibility suites.
- PASS: backend production build — `npm run build`.
- PASS: direct ESLint on the changed AI profile/blueprint/answer-engine/
  provider/materializer/validator files.
- PASS: direct ESLint on all AI-0 changed backend files.
- PASS: frontend build — `npm run build`.
- PASS: frontend lint — `npm run lint`.

### Actual verification — 2026-08-02 TPL-faithful AI slice

- PASS: targeted AI regression suites — 25 tests passed across blueprint
  compilation, enriched unit profiles, provider prompts, case and conversation
  materialization, answer-engine derivation, and source-fact validation.
- PASS: backend production build — `npm run build`.
- PASS: direct ESLint on the changed AI profile/blueprint/provider/materializer/
  validator files.
- PASS: the case Materializer now uses the certified source archetype and emits
  polarity-aware, complete parallel statements instead of bare concept-name
  choices when archetype data is present.
- PASS: unit profile cache version advanced to `v2`, with archetype/TPL pattern
  counts and certified/blocked evidence retained in the profile JSON.
- BLOCKED: backend `npm run typecheck` remains blocked by the existing unrelated
  script/auth/chat/reference-frame/notification/study/textbook fixture errors;
  one profile fixture compatibility error found during this run was removed,
  and no remaining error referenced the changed production AI files.
- NOTE: semantic condition answer engines, source-fact validators, baseline
  corpus, shadow evaluation, and durable HTTP job receipt remain unchecked and
  are not release-ready.
- BLOCKED: backend `npm run typecheck` and therefore full backend `npm run lint`
  remain blocked by pre-existing errors in scripts and unrelated auth/chat,
  reference-frame, notification, study, and textbook test fixtures. No errors
  were reported from the AI-0 files in that output.
- NOTE: AI-0 production metrics/telemetry remains intentionally unchecked; the
  job ID is currently the correlation identifier, while durable run metrics are
  deferred to AI-5 as recorded above.
- PASS: AI-1 profile unit suite — 4 tests passed, including deterministic
  aggregation, unsupported-template blocking, missing-answer exclusion, and
  malformed-row visibility.
- PASS: backend production build after AI-1 entity/service/controller wiring.
- NOTE: AI-1 dry-run rebuild/reconciliation command remains unchecked and is
  the next implementation item before using profiles operationally.
- PASS: AI-1/AI-2 backend build after profile migration, profile endpoint, and
  blueprint preview wiring.
- PASS: expanded targeted AI suites — 37 tests passed, including deterministic
  blueprint compilation, family filtering, source deduplication, profile
  blocking, feature gating, and existing reference compatibility.
- PASS: direct ESLint on all AI profile/blueprint files and registrations.
- NOTE: the profile rebuild command is implemented as a dry-run command but
  was not run against a database in this session because no approved database
  target/URL was supplied; no catalog or profile data was changed.
- PASS: AI-3/AI-4 targeted suites — 15 tests passed for provider parsing,
  strict schema rejection, timeout-safe adapter behavior, server-side
  materialization, renderer/answer/invariant validation, retries, shortfall,
  and duplicate fingerprint rejection.
- PASS: backend production build after provider/materializer/validator wiring.
- PASS: direct ESLint on all AI-3/AI-4 files.
- PASS: AI-5 service suite — 3 tests passed for atomic save, completed-run
  idempotency, and shortfall rollback/failure state.
- PASS: expanded backend AI regression set — 52 tests passed.
- PASS: backend production build after AI run entities and job integration.
- PASS: direct ESLint on AI-5 entities, migration, service, and job wiring.
- NOTE: the HTTP job registry is still in-memory; durable job receipt,
  heartbeat, worker restart, and cancellation are intentionally left unchecked
  for the next AI-5 slice.
- PASS: frontend generation flow build — `npm run build`.
- PASS: frontend lint — `npm run lint`.
- PASS: `JobProgressProvider` test — 1 test passed with the correct Vitest
  command (`npm test -- features/exam-generation/model/__tests__/JobProgressProvider.spec.tsx`).
- NOTE: the first frontend test attempt used Jest's `--runInBand` flag, which
  Vitest does not support; the test was rerun successfully without that flag.
- FIX: AI case generation no longer asks the user to choose a case family. When
  `aiQuestionFamily` is omitted, the backend automatically prefers the case
  family available in the selected unit range, then falls back to concept only
  when no certified case exists.
- FIX: each certified case source now yields three deterministic case variants,
  and the blueprint includes the original case context plus variant ordinal in
  the provider prompt. Textbook concepts remain available as server-controlled
  distractor candidates.
- PASS: read-only production-shaped catalog diagnostic after the change:
  success units 1–3 produced 177 materializable automatic case blueprints and
  20 selected for a 20-question request; no user family selection was supplied.
- PASS: case/profile/adapter backend tests — 16 tests passed; backend build
  passed; frontend build/lint passed; job progress test passed.
- FIX: resolved `duplicate key value violates unique constraint
  IDX_b3b462beb4c6e45dc964385af3` during profile refresh. The cache lookup was
  filtering on the new fingerprints, then attempting to insert a stale row with
  the same `(subject_slug, unit_number)` unique key. Profile refresh now reads
  existing unit rows, reuses their IDs, and updates them instead of inserting
  duplicates. Regression coverage added for stale-row refresh.
- FIX: reproduced the reported `AI_BLUEPRINT_SHORTFALL` against the configured
  Supabase catalog. The compiler was using only source concepts when building
  four server-side distractors, ignoring the already certified textbook
  concepts in the persisted unit profile. This made otherwise eligible units
  appear unavailable. The compiler now combines certified source concepts with
  textbook concepts; the read-only diagnostic for success units 1–3 reports 34
  concept-family and 59 case-family materializable blueprints for a 20-question
  request.

### Actual verification — 2026-08-02 completion slice

- PASS: AI regression suites — 25 tests passed, including Tier-1 answer engine,
  source-fact anchors, case/conversation materialization, provider contracts,
  and blueprint quotas/exclusion.
- PASS: generation job compatibility suites — 18 tests passed after adding
  explicit canceled state and cancellation endpoint behavior.
- PASS: backend production build — `npm run build`.
- PASS: frontend production build — `npm run build -w frontend`.
- PASS: frontend lint — `npm run lint -w frontend`.
- PASS: direct ESLint on provider telemetry, durable job snapshot, rollout
  feature, shadow-evaluation, and cancellation files after formatting fixes.
- PASS: provider telemetry now stores redacted prompt hash, model, latency, and
  token usage on accepted candidates; migration added for existing tables.
- PASS: job receipts now persist snapshots, refresh can hydrate a missing
  in-memory job, stale rows can be recovered, and explicit cancellation stops
  final exam commit.
- PASS: profile rebuild output now includes persisted-profile reconciliation;
  shadow evaluator script reports acceptance, rejection, duplicate, and
  per-template metrics without exposing questions.
- NOTE: no production database migration, profile rebuild, or real shadow corpus
  was run in this session because no approved database target/corpus was
  supplied. Admin cohort rollout and production rollback proof remain pending.
- BLOCKED: backend full `npm run typecheck` remains blocked by pre-existing
  unrelated script/auth/chat/reference-frame/notification/study/textbook fixture
  errors; backend production build and changed-file lint pass.
- FIX: removed the duplicate durable-job snapshot write during `createJob`.
  `create()` was fire-and-forget persisting while `createJob()` also awaited
  `persistNow()` for the same UUID, causing `generation_jobs` primary-key
  collisions. The initial snapshot is now written exactly once before the
  worker starts.
- PASS: post-fix job/exam compatibility tests — 19 tests passed; backend build
  and changed job-service ESLint passed.
- FIX: diagnosed job `0391e711-9420-4703-9dba-a742c8a86356`: 1/3 candidates
  passed and the other six attempts all failed with `AI_CANDIDATE_SCHEMA_INVALID`
  on conversational blueprints. The provider JSON schema now constrains
  `speakerId` to the server-owned participant IDs, and rejected candidate
  messages are persisted for diagnosis.
- PASS: provider/generation regression tests — 8 tests passed after the schema
  and rejection-diagnostic fix; backend build and changed-file ESLint passed.

### Actual verification — 2026-08-04 Supabase schema reconciliation

- PASS: inspected the configured Supabase schema before writing; the AI tables
  and telemetry columns already existed, while migration history was missing
  entries `1721211200000` through `1721211700000`.
- PASS: backfilled `question_seen_records` with 46 distinct user/question pairs
  and made `questions.variant_group_id` explicitly `NOT NULL` after confirming
  zero null rows.
- PASS: reconciled the six migration records in the `migrations` table.
- PASS: read-only TypeORM migration check now reports `hasPending: false`.
- NOTE: the first migration-run attempt stopped safely at the pre-existing
  `variant_group_id` column; no new migration was applied by that attempt. The
  final transaction only performed the verified backfill/schema constraint and
  migration-history reconciliation.
- PASS: full backend test run reached 90 passing suites / 644 passing tests;
  3 unrelated reference-frame cache suites still fail 10 legacy expectations
  around `EXAM_GENERATION_FAILED` and reference transaction fixtures.

### Exact verification commands

```bash
cd backend
npm test -- --runInBand \
  src/exams/simply-reference-generation.service.spec.ts \
  src/exams/simply-reference-generation-contract.spec.ts \
  src/exams/stimulus-normalizer.spec.ts \
  src/exams/ai-unit-profile.service.spec.ts \
  src/exams/ai-blueprint.service.spec.ts \
  src/exams/ai-provider.adapter.spec.ts \
  src/exams/ai-question-materializer.spec.ts \
  src/exams/ai-question-validator.spec.ts \
  src/exams/exam-generation-jobs.service.spec.ts
npm run typecheck
npm run build
npm run lint
npm run audit:simply-reference-history
npm run preflight:reference-catalog -- --format=markdown
npm test -- --runInBand --testPathPattern='ai-generation.integration'
npm run evaluate:ai-blueprint -- --corpus test/fixtures/ai-blueprint --format=markdown
```

```bash
cd frontend
npm run build
npm run lint
npm test -- --runInBand \
  features/exam-generation/model/JobProgressProvider.spec.tsx \
  features/exam-generation/ui/GenerationProfileStep.spec.tsx \
  entities/exam/api/examApi.test.ts
```

Manual smoke test: enable AI for an admin account; request 1, 5, and 20
questions; verify the job receipt is immediate; refresh during every stage;
force timeout and malformed provider output; confirm bounded retry, terminal
error, no partial exam, and retry UI; disable the flag and confirm the existing
simply-reference request/result; compare accepted web and PDF rendering.

## Out of scope

- Inventing graph values, image content, answer keys, or missing source context.
- Treating a renderer fallback as a valid production template.
- Destructive production catalog reset without an approved migration and backup.
