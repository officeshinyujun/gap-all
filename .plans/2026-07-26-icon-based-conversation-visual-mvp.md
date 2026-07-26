# Icon-based conversation visual MVP

## Scope

Add role icons and a small, evidence-backed actor-flow aid to
`TPL_CONVERSATIONAL_FLOW`. The model emits only a strict, controlled data
contract; the UI maps semantic keys to fixed local icons. Do not generate raw
SVG/HTML/URLs, alter dashboard renderers, or implement distractor/template-mix
policies in this change.

## Decisions

- Use a local, fixed Material Symbols-compatible icon registry. No Google CDN
  request and no model-provided icon names.
- Add `iconKey`, `sceneKind`, and `visualAid` to generated conversations.
- The only visual aid in this MVP is `actor_flow` (2–4 participants, 1–4
  relations). A relation carries only an action enum and source message indexes.
- Legacy conversations normalize to neutral defaults rather than falling back
  to plain text.
- Web shows icons and actor cards; PDF preserves the same relationships as
  accessible text.

## In scope

- [x] Add strict backend schema, normalization, and validation for conversation
  visual-aid data.
- [x] Add fixed local role-icon registry and shared live renderer.
- [x] Render an actor flow in the shared conversation question stem.
- [x] Add PDF text equivalent for scene and actor-flow information.
- [x] Add targeted backend tests and run backend/frontend verification.
- [x] Restore repository-wide backend lint compliance.

## Explicitly deferred

- [ ] P2: Bind each distractor to a misconception type and independently verify
  answer uniqueness/distractor quality.
- [ ] P3: Allocate template quotas and report per-exam template distribution.
- [ ] Add timelines, hierarchy trees, causal chains, or general network graphs.
- [ ] Add generated illustrations or external image assets.

## Files and implementation notes

- `backend/src/exams/tpl-schemas.ts`: extend conversational stimulus schema.
- `backend/src/exams/conversation-visual-aid-validator.ts`: validate IDs,
  cardinalities, enums, and evidence indexes; new focused test file accompanies
  it.
- `backend/src/exams/stimulus-normalizer.ts`: give legacy data defaults and
  reject malformed visual aids from renderable structured data.
- `backend/src/exams/exam-regenerator.service.ts`: validate the aid after model
  output; prompt rules come from the strict schema and existing regeneration
  contract.
- `frontend/shared/types/questionstem.ts`: expose the controlled contract.
- `frontend/shared/ui/QuestionStem/_shared/MaterialIcon.tsx`: fixed semantic
  icon mapping with textual fallback; no remote asset dependency.
- `frontend/shared/ui/QuestionStem/TPL_CONVERSATIONAL_FLOW/*`: render scene
  metadata and actor flow only in the shared live renderer.
- `frontend/components/exam/ExamPdf/PdfStimulusRenderer.tsx`: print equivalent
  actor-flow lines.

## Acceptance criteria

- Generated output cannot contain raw markup, URLs, or arbitrary icon names.
- Every actor/relation references existing participants and real message indexes.
- A legacy conversation lacking visual fields still renders as a conversation.
- The Web view has no Material Icons/Google Fonts network request.
- PDF preserves the actor names, direction, and action for each relationship.

## Verification

Run in `backend/`:

```bash
npm test -- --runInBand tpl-schemas.spec.ts reference-final-output-schema.spec.ts stimulus-normalizer.spec.ts conversation-visual-aid-validator.spec.ts exam-regenerator.reference-variant.spec.ts
npm run typecheck
npm run lint
```

Run in `frontend/`:

```bash
npm run build
npm run lint
```

Browser testing is explicitly not required for this task.

## Verification results

- PASS: backend targeted Jest suites — 5 suites / 95 tests.
- PASS: `backend/npm run typecheck`.
- PASS: `frontend/npm run build` and `frontend/npm run lint`.
- PASS: `backend/npm run lint` (0 errors; 81 existing unsafe-argument warnings).
- Lint remediation: formatted backend TypeScript files, removed obsolete unused
  symbols/assertions, and disabled `require-await` for intentional async test
  doubles that mirror Promise-based production contracts.
- Not run by request: browser testing.
