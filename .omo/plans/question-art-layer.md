# question-art-layer - Work Plan

## TL;DR (For humans)

**What you'll get:** A frontend-created exam can generate and immediately render explicit two-speaker interview material as a restrained SVG interviewer/interviewee scene with readable dialogue, accessible semantics, and matching PDF output. Non-interview questions keep their existing renderers.

**Why this approach:** The previous plan mixed an unimplemented generation architecture with frontend work, referenced a duplicate component tree, and assumed test/build surfaces that do not currently pass. This revision first establishes one canonical, independently verifiable rendering foundation.

**What it will NOT do:** It will not add chart/report art, classroom/meeting art, remote avatars, arbitrary SVG, or a separate ArtSpec persistence model. It will not modify dashboard renderers or source corpus data.

**Effort:** Medium
**Risk:** Medium - the main risks are the existing frontend build break, duplicate renderer trees, and PDF height constraints.
**Decisions to sanity-check:** `frontend/shared/ui/QuestionStem` is the sole Web owner. `@react-pdf` `ExamPdfDocument` is the sole PDF owner. Interview art is represented by `TPL_CONVERSATIONAL_FLOW.scene_kind = "interview"`; the model returns only participants/messages, while pose, facing, expression, and accessories are derived by the renderer.

Your next move: start this plan with `/start-work question-art-layer`. Completion includes one frontend-created eligible interview exam rendered through the live API path.

---

> TL;DR (machine): Fix Vite verification baseline, add interview eligibility and `scene_kind`, build shared-ui SVG scene and @react-pdf parity, then prove frontend-created exam generation end-to-end.

## Scope
### Must have
- Restore a passing Vite frontend build before Art work begins.
- Use only the live `frontend/shared/ui/QuestionStem` renderer tree; leave duplicate `frontend/components/exam/QuestionStem` and dashboard trees untouched.
- Detect explicit two-person interviews and reject classrooms, meetings, reports, charts, generic narratives, and one-sided quotations.
- Extend the existing conversational TPL contract with a single `scene_kind` discriminator and strict interview eligibility checks.
- Render two deterministic SVG figures and semantic dialogue in Web, with equivalent portrait/transcript content in `@react-pdf`.
- Verify actual 성직/공일 interview fixtures, all live frontend surfaces, mobile/desktop, accessibility, grayscale, bundle budget, and PDF height.

### Must NOT have
- No separate ArtSpec entity, migration, or parallel generation architecture; interview art travels inside the existing conversational stimulus payload.
- No model-authored pose, facing, expression, accessory, SVG/XML/path/HTML/CSS, URL, avatar, or executable visual data.
- No charts, reports, classroom/meeting art, frequency quota, source-corpus mutation, dashboard art, or new frontend unit-test framework.
- No edits to the dead/secondary `frontend/components/exam/QuestionStem` renderer tree.

## Verification strategy
- Test decision: backend Jest for eligibility/conversational-schema; existing Vite build for TypeScript/bundle; dev-only showcase plus Playwright for Web semantics/visual/accessibility; `@react-pdf` artifact generation for PDF; one live frontend-created eligible interview exam.
- Pre-existing baseline: `npm run build -w frontend` currently fails because `frontend/app/layout.tsx` and `frontend/next.config.ts` import missing Next modules. Todo 1 must resolve and record this before any Art file is added.
- No React component-test framework is assumed or installed. Browser behavior and accessibility are asserted through Playwright.
- Evidence: `.omo/evidence/question-art-layer/task-<N>.md`.
- Visual breakpoints: 375, 768, and 1280 px. PDF fixture: A4 two-column `ExamPdfDocument`.
- Performance budget: no network image request, no runtime chart/image library, no animation, and frontend gzip growth attributable to Art primitives <= 20 KB.

## Execution strategy
### Parallel execution waves
| Wave | Todos | Purpose |
| --- | --- | --- |
| 0 | 1 | Make the verification surface real and select canonical owners. |
| 1 | 2-4 | Lock actual corpus eligibility and semantic contracts. |
| 2 | 5-8 | Build tokenized Web primitives and prove them in isolation. |
| 3 | 9-12 | Integrate canonical Web/PDF renderers, existing backend generation, and cross-surface fixtures. |
| 4 | 13 | Run complete regression, frontend-created generation, accessibility, performance, and scope audit. |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | all | - |
| 2 | 1 | 3, 4, 12 | - |
| 3 | 2 | 4, 9, 11 | - |
| 4 | 3 | 6, 9, 10, 11 | - |
| 5 | 1, 4 | 6, 7 | - |
| 6 | 4, 5 | 7, 8 | - |
| 7 | 6 | 8, 9 | - |
| 8 | 7 | 9, 12 | - |
| 9 | 3, 4, 7, 8 | 12, 13 | - |
| 10 | 4 | 12, 13 | 9 |
| 11 | 3, 4 | 12, 13 | 9, 10 |
| 12 | 2, 9, 10, 11 | 13 | - |
| 13 | 8, 9, 10, 11, 12 | Final wave | - |

## Todos
- [ ] 1. Restore the Vite build baseline and lock canonical renderer/instruction ownership.
  What to do / Must NOT do: Confirm `frontend/app/layout.tsx` and `frontend/next.config.ts` are unused by `frontend/src/main.tsx`, then exclude the obsolete Next-only files from the Vite TypeScript build without installing Next. Reconcile stale `frontend/AGENTS.md` Next and `app/components`/`app/styles` instructions with the actual Vite architecture, canonical `components/general` stack primitives, and `styles/variables.scss`. Record that live routes import `@shared/ui/QuestionStem/QuestionRenderer`; declare `frontend/shared/ui/QuestionStem` canonical, `frontend/components/exam/QuestionStem` secondary/dead for this scope, and `dashboard` out of scope with text fallback. Do not touch Art code yet.
  References: `frontend/package.json`; `frontend/tsconfig.json`; `frontend/src/main.tsx`; frontend `rg "QuestionRenderer"` results; `frontend/README.md`; `frontend/AGENTS.md`.
  Acceptance criteria: `npm run build -w frontend` exits 0 before Art changes; evidence lists canonical Web/PDF/style/layout owners; scoped AGENTS instructions no longer contradict the Vite build; no Next dependency is added.
  QA scenarios: happy: Vite build passes; failure: re-including either obsolete Next-only file reproduces the documented missing-module failure. Evidence `.omo/evidence/question-art-layer/task-1.md`.
  Commit: N | prerequisite/build baseline.

- [ ] 2. Build immutable corpus-backed interview and non-interview fixtures.
  What to do / Must NOT do: Adapt 성직 2024년 6월 모의평가 11번 and 공일 2025년 9월 모의평가 interview records into test fixtures. Add negative classroom, meeting, report, chart, generic narrative, and one-sided quotation fixtures. Preserve source provenance and never rewrite corpus JSON.
  References: `textbook/parsed/sungjik/moi/2024_6월_모의평가.json`; `textbook/parsed/kongil/moi/2025_9월_모의평가.json`; `textbook/parsed/sungjik/moi/2024_9월_모의평가.json`; `textbook/parsed/kongil/moi/2024_9월_모의평가.json`; `textbook/parsed/kongil/moi/2025_수능.json`.
  Acceptance criteria: fixtures expose filename/question number and expected eligibility; source corpus git status remains unchanged.
  QA scenarios: happy: two explicit interviews load; failure: every negative category is represented and marked non-eligible. Evidence `.omo/evidence/question-art-layer/task-2.md`.
  Commit: N | contract fixture group.

- [ ] 3. Implement pure interview parsing and eligibility with typed reasons.
  What to do / Must NOT do: Parse `기자:`/interviewer and interviewee labels from line-based material, normalizing bullets/brackets and requiring exactly two participants plus 2-4 alternating turns. Require an explicit interview marker. Reject lessons, meetings, generic dialogue, one-sided quotations, duplicate speakers, and 5+ turns. Return stable typed rejection reasons.
  References: Todo 2 fixtures; `backend/src/exams/reference-frame.validation-utils.ts`; actual corpus speaker formats.
  Acceptance criteria: all positive/negative fixtures return exact verdict/reason; parser never classifies quoted prose alone as an interview.
  QA scenarios: happy: 기자/A씨 and 기자/개발자 parse; failure: 교사/학생, 회의, one-sided quote, and malformed alternating turns reject. Evidence `.omo/evidence/question-art-layer/task-3.md`.
  Commit: N | contract fixture group.

- [ ] 4. Extend the conversational TPL contract with strict interview scene semantics.
  What to do / Must NOT do: Add optional `scene_kind: 'dialogue' | 'interview'` to the existing conversational stimulus contract. For `interview`, require exactly two participants, 2-4 alternating messages, bounded labels/roles/text, and explicit eligibility. Reuse existing `participants` and `messages`; do not create a separate ArtSpec entity, payload, endpoint, or migration. Derive pose, facing, expression, accessory, and alt summary in the renderer; reject arbitrary SVG/HTML/URL/presentation fields.
  References: `frontend/types/questionstem.ts`; `backend/src/exams/tpl-schemas.ts`; `backend/src/exams/exam-regenerator.service.ts`; Todo 3 normalized output; backend Jest conventions.
  Acceptance criteria: one existing conversational wire contract owns interview data; frontend golden fixtures parse it; extra SVG/HTML/URL/presentation fields, duplicate ids, unknown speaker, 5th turn, and non-eligible `scene_kind: interview` reject.
  QA scenarios: happy: corpus-derived two-person conversation passes; failure: model-authored presentation fields or a classroom marked interview fail before persistence. Evidence `.omo/evidence/question-art-layer/task-4.md`.
  Commit: N | contract fixture group.

- [ ] 5. Extract interview-art tokens and constraints into DESIGN.md.
  What to do / Must NOT do: Codify only existing Vite exam-app colors, typography, spacing, borders, bubble styling, breakpoints, PDF grayscale constraints, SVG viewBox, and required primitive states. Source styles from `frontend/styles/variables.scss` and canonical shared-ui SCSS. Do not perform a general app redesign or reference secondary component trees.
  References: `frontend/styles/variables.scss`; `frontend/vite.config.ts`; `frontend/shared/ui/QuestionStem/TPL_CONVERSATIONAL_FLOW/*.module.scss`; `frontend/AGENTS.md`; frontend design-system architecture rules.
  Acceptance criteria: DESIGN.md names all Art tokens and states; new plan references canonical shared-ui files and existing SCSS variables; no arbitrary raw colors/spacing are authorized.
  QA scenarios: happy: all primitive states map to tokens; failure: any proposed raw hex or duplicate token is rejected during review. Evidence `.omo/evidence/question-art-layer/task-5.md`.
  Commit: N | design contract.

- [ ] 6. Build a deterministic decorative PersonFigure in canonical shared UI.
  What to do / Must NOT do: Implement fixed-dimension SVG head/body silhouettes under `frontend/shared/ui/QuestionStem/InterviewArt`. Renderer derives left/right facing and speaking/listening pose from participant side and current turn; role keywords may map to a small server-independent accessory whitelist, otherwise none. SVG is `aria-hidden`, nonfocusable, and decorative; scene text owns meaning. Do not edit the secondary components tree.
  References: Todo 4 renderer view; Todo 5 DESIGN.md; `frontend/shared/ui/QuestionStem/TPL_INSTRUCTIONAL_SCENE` patterns; `frontend/AGENTS.md`.
  Acceptance criteria: journalist and interviewee figures render nonblank with stable viewBox/dimensions; unknown role yields neutral figure; no URL/dynamic path injection or layout shift.
  QA scenarios: happy: journalist/medical and journalist/technical pair states; failure: unrecognized role and long label do not alter SVG geometry. Evidence `.omo/evidence/question-art-layer/task-6.md`.
  Commit: N | Web primitives group.

- [ ] 7. Build semantic speech turns and bounded InterviewScene composition.
  What to do / Must NOT do: Use canonical VStack/HStack components for structure, semantic ordered-list dialogue, visible labels/roles, text outside SVG, two-column desktop and stacked mobile layout, and 2-4 turn height bounds. Scene owns accessible name; SVG remains decorative. No duplicated hidden transcript or color-only speaker identity.
  References: Todo 4-6; `frontend/shared/ui/QuestionStem/TPL_CONVERSATIONAL_FLOW/index.tsx`; `frontend/components/general/VStack`; `frontend/components/general/HStack`; DESIGN.md.
  Acceptance criteria: Korean dialogue and roles wrap without overlap; source order remains exact; 2-4 turns fit bounded showcase geometry.
  QA scenarios: happy: 2- and 4-turn scenes; failure: max-length Korean/Latin strings wrap without horizontal overflow or SVG displacement. Evidence `.omo/evidence/question-art-layer/task-7.md`.
  Commit: N | Web primitives group.

- [ ] 8. Add a dev-only Vite showcase and Playwright visual/accessibility gate.
  What to do / Must NOT do: Add a route registered only under `import.meta.env.DEV` with corpus medical/technical fixtures, neutral role, no accessory, 4-turn max, and long-text states. Use Playwright rather than introducing Vitest/Testing Library. Capture 375/768/1280 screenshots, accessibility tree, network requests, and bundle delta.
  References: `frontend/src/main.tsx`; Todo 6-7; root Playwright dependency; `/visual-qa`; DESIGN.md.
  Acceptance criteria: all states render nonblank with no console error, overlap, horizontal overflow, focusable SVG node, network image request, or >20 KB attributable gzip growth.
  QA scenarios: happy: all breakpoint captures; failure: long text/max turns/grayscale media emulation remains readable. Evidence `.omo/evidence/question-art-layer/task-8.md`.
  Commit: N | Web primitives group.

- [ ] 9. Render conversational `scene_kind: interview` in the live shared QuestionRenderer only.
  What to do / Must NOT do: Extend frontend API normalization/view types for optional conversational `scene_kind`, and render SVG InterviewScene only inside `frontend/shared/ui/QuestionStem/TPL_CONVERSATIONAL_FLOW` when it equals `interview` and data passes the frontend shape guard. Preserve current text conversation for `dialogue`, absent, or invalid values. Verify live exam, review, study q3, concept study, chat, and DOM PDF capture surfaces through their shared renderer. Do not edit secondary frontend or dashboard TPL trees.
  References: frontend `rg "QuestionRenderer"` call sites; `frontend/shared/ui/QuestionStem/QuestionRenderer/index.tsx`; `frontend/shared/ui/QuestionStem/TPL_CONVERSATIONAL_FLOW/index.tsx`; `frontend/lib/examApi.ts`; `frontend/shared/lib/examApi.ts`.
  Acceptance criteria: valid fixture renders art on every live shared-renderer surface; absent/invalid art remains text-only; non-conversation templates are byte/DOM-equivalent in regression fixtures.
  QA scenarios: happy: exam/review/q3/chat smoke; failure: art on chart/report/classroom or malformed art cannot dispatch SVG scene. Evidence `.omo/evidence/question-art-layer/task-9.md`.
  Commit: N | renderer integration group.

- [ ] 10. Add conversational interview parity to the primary @react-pdf path.
  What to do / Must NOT do: Target only `ExamPdfDocument`/`PdfStimulusRenderer`, which is the production download path. When `scene_kind` is `interview`, render compact labeled portrait blocks plus the existing semantic transcript. Keep 2-4 turns and bounded text within the existing `wrap={false}` A4 two-column question block; if height budget fails, reject/shorten generated interview content upstream rather than omit evidence. Do not modify unused `ExamPdfCapture` for parity claims.
  References: `frontend/app/(main)/exam/[subject]/page.tsx:114-118`; `frontend/components/exam/ExamPdf/ExamPdfDocument.tsx:17-49`; `PdfStimulusRenderer.tsx:74-168`; Todo 4 contract.
  Acceptance criteria: medical/technical fixtures export valid PDFs with identical caption, roles, order, and dialogue text; max fixture stays inside column height without clipping.
  QA scenarios: happy: two corpus PDFs; failure: 4 max-length turns trigger explicit height-budget fixture failure instead of clipped PDF. Evidence `.omo/evidence/question-art-layer/task-10.md`.
  Commit: N | renderer integration group.

- [ ] 11. Mark eligible conversational generation output as an interview scene in the existing backend path.
  What to do / Must NOT do: In the existing reference-generation/regeneration path, retain the current model-generated `participants` and `messages`, but derive `scene_kind: 'interview'` server-side only when the selected source passes Todo 3 eligibility and the generated conversation passes Todo 4 validation. Extend the conversational TPL schema/parser to permit the discriminator. Do not ask the model to select presentation data, add a new endpoint, create a separate ArtSpec table, or change non-interview output.
  References: `backend/src/exams/exam-regenerator.service.ts:288-509`; `backend/src/exams/tpl-schemas.ts`; `backend/src/exams/reference-frame-generation.service.ts`; Todo 3-4 contracts.
  Acceptance criteria: eligible generated conversation receives `scene_kind: 'interview'`; non-eligible source slots remain `dialogue`/absent; malformed conversation/art cannot persist.
  QA scenarios: happy: mocked 기자/A씨 source produces conversational payload with interview discriminator; failure: classroom, meeting, report, one-sided quote, or invalid turn structure cannot obtain it. Evidence `.omo/evidence/question-art-layer/task-11.md`.
  Commit: N | backend/frontend integration group.

- [ ] 12. Verify actual corpus Web/PDF semantic parity and dashboard fallback debt.
  What to do / Must NOT do: Compare canonical Web and PDF conversational interview fixtures for speaker roles, turn order, caption, and all evidence text. Verify dashboard remains functional via existing text fields and document its lack of SVG art as accepted debt; do not duplicate the implementation into dashboard.
  References: Todo 2 fixtures; Todo 9-11 renderers; `dashboard/components/exam/QuestionStem/QuestionRenderer/index.tsx`.
  Acceptance criteria: Web/PDF parity passes for both subjects; dashboard receives no breaking API shape and retains text representation.
  QA scenarios: happy: semantic snapshots match; failure: missing/shuffled turn or art-only evidence fails parity. Evidence `.omo/evidence/question-art-layer/task-12.md`.
  Commit: N | verification only.

- [ ] 13. Prove frontend-created interview generation and run the complete audit.
  What to do / Must NOT do: Re-run frontend build, backend typecheck/contract specs, Vite showcase Playwright suite, all shared-renderer route smokes, PDF artifact checks, source-corpus cleanliness, bundle/network budget, and changed-file scope. Then use the real Vite frontend exam-create surface to submit exactly one 성직 1단원 3-question request so the selected source set includes the corpus interview fixture. Poll its existing job surface, inspect the returned/stored conversational payload for `scene_kind: 'interview'`, drive the resulting exam page in Playwright, and export its PDF. Do not add a special endpoint, bypass the frontend, or use a provider retry loop.
  References: Todos 1-12 evidence; `frontend/app/(main)/exam/[subject]/create/page.tsx`; `frontend/app/(main)/exam/[subject]/[examId]/page.tsx`; root/frontend/backend package scripts.
  Acceptance criteria: frontend build and backend typecheck exit 0; corpus unchanged; Web/PDF/accessibility/visual checks pass; no edits in secondary QuestionStem/dashboard trees; one frontend-created 성직 1단원 3-question job reaches completed state with at least one `scene_kind: 'interview'` item and renders on its exam page/PDF, or returns a typed failure with zero partial rows.
  QA scenarios: happy: all gates and one frontend-created interview exam pass; failure: any generated SVG input, non-interview art, build regression, clipped PDF, overflow, network image, contract drift, or failed frontend job blocks completion. Evidence `.omo/evidence/question-art-layer/task-13.md`.
  Commit: N | final verification only.

## Final verification wave
- [ ] F1. Plan compliance and canonical-owner audit
- [ ] F2. Contract/security and non-interview regression audit
- [ ] F3. Web/PDF/accessibility visual QA audit
- [ ] F4. Frontend-created job, build/performance, and corpus-cleanliness audit

## Commit strategy
- Keep build-baseline, contract, design, Web primitive, renderer integration, and PDF changes dependency ordered.
- Never bundle unrelated existing dirty-worktree changes.
- Do not commit corpus copies, generated PDFs, screenshots outside evidence, temporary SVG files, credentials, or logs.

## Success criteria
- The Vite frontend build is green before and after Art work.
- Only the live shared-ui renderer tree contains interview Art; duplicate frontend/dashboard trees remain untouched and functional through text fallback.
- Explicit two-person interviews render deterministic decorative SVG figures while semantic dialogue remains normal text.
- Non-interview material never dispatches Art; model/API data cannot supply vector markup or presentation controls.
- Production `@react-pdf` output preserves all interview evidence within its height budget.
- Actual 성직/공일 fixtures pass Web/PDF/accessibility/visual checks, and one frontend-created eligible interview exam renders `scene_kind: 'interview'` through the live API and PDF path.
