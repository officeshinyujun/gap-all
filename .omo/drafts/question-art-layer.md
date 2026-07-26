---
slug: question-art-layer
status: approved
intent: clear
review_required: false
pending-action: write .omo/plans/question-art-layer.md
approach: Ship an independently verifiable Vite/shared-ui and @react-pdf interview-art foundation, then derive `scene_kind: "interview"` inside the existing reference generation path so frontend-created eligible exams render art immediately.
---

# Draft: question-art-layer

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| interview-contract | Strict InterviewArtSpec for explicit interviewer/interviewee questions | active | `frontend/types/questionstem.ts`; `backend/src/exams/tpl-schemas.ts` |
| web-primitives | Deterministic SVG people, role accessories, and speech-bubble layout | active | `TPL_CONVERSATIONAL_FLOW`; `TPL_INSTRUCTIONAL_SCENE` |
| pdf-accessibility | Equivalent PDF portrait/transcript fallback, alt summary, and grayscale-safe output | active | `frontend/components/exam/ExamPdf/PdfStimulusRenderer.tsx` |
| generation-wiring | Existing reference generation derives interview scene kind after eligibility/turn validation | active | `backend/src/exams/reference-frame-generation.service.ts`; `backend/src/exams/exam-regenerator.service.ts` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Initial art type | `interview_scene` only | User narrowed the scope; charts stay in the existing chart library and non-interview documents stay text/TPL-only | no |
| SVG ownership | Frontend renders trusted SVG primitives; model never returns SVG/XML/path/HTML/CSS | Prevents injection, broken geometry, and inconsistent PDF output | no |
| Art eligibility | Apply whenever and only when the source/generated material is an explicit interview | Content structure, not quota, determines whether art appears | no |
| Visual language | Exam-document neutral: restrained grayscale with one semantic accent, crisp lines, no decorative gradients | Preserves readability, printing, and CSAT-like seriousness | yes |
| Character identity | Role-based neutral figures, no inferred gender/ethnicity/age unless question evidence explicitly requires age band | Avoids irrelevant demographic coding and keeps assets reusable | yes |

## Findings (cited - path:lines)
- `TPL_CONVERSATIONAL_FLOW` currently renders dialogue as text rows only (`frontend/components/exam/QuestionStem/TPL_CONVERSATIONAL_FLOW/index.tsx:30-51`).
- `TPL_INSTRUCTIONAL_SCENE` already supports instructor/student bubbles and optional avatar URLs, but falls back to initials rather than controlled illustration primitives (`TPL_INSTRUCTIONAL_SCENE/index.tsx:33-63`, `InstructorBubble/index.tsx:25-38`).
- `TPL_QUANTITATIVE_CHART` already supports bar, line, and radar charts through Recharts (`TPL_QUANTITATIVE_CHART/index.tsx:18-68`), so report visualization should compose it instead of adding another chart library.
- PDF rendering currently degrades dialogue and instructional scenes to labeled text and has separate chart rendering; any Art Layer must ship Web/PDF parity rather than browser-only SVG (`PdfStimulusRenderer.tsx:74-168`).
- Existing TPL schemas are strict and suitable for extending with an optional discriminated `art` object; arbitrary model-generated SVG is unnecessary and unsafe.
- The project has no root `DESIGN.md`; frontend implementation must first codify existing exam visual tokens and Art primitives before product-screen changes.
- Actual 성직 interview examples include `2024_6월_모의평가` question 11 (기자/A씨) and `2023_9월_모의평가` question 3. Actual 공일 examples include `2025_9월_모의평가` A 케이블 interview, `2022_수능` 도예가 interview, and `2021_6월_모의평가` 대표이사 interview.
- Classroom dialogue, meetings, generic A씨 narratives, reports, notices, tables, and graphs are not interview art. They continue through existing TPL renderers.

## Decisions (with rationale)
- Add optional `interviewArt` alongside conversational stimulus data rather than creating another TPL name.
- Define `InterviewSceneArt` with exactly two participants (`interviewer`, `interviewee`), bounded role/occupation/pose/facing/expression/accessory enums, ordered dialogue turns, setting, caption, and evidence claim ids. Speech text is HTML/PDF text outside the SVG figure.
- Build SVG people from reusable body/head/pose symbols and controlled palette tokens. No remote avatar URLs and no generated SVG strings.
- Require every InterviewArtSpec to reference at least one blueprint claim. Decorative portraits unrelated to the question are rejected.
- Render an accessible transcript under interview scenes. SVGs receive concise alt summaries; speaker identity cannot depend on color alone.
- Eligibility requires an explicit interview signal in source/reference structure and a final generated structure with exactly two participants plus at least two alternating speaker turns. Classroom lessons, meetings, generic quoted narratives, and one-sided interview quotations do not qualify.
- Integrate interview intent into Step 1 blueprint (`none | interview_scene`) and detailed InterviewArtSpec into Step 2 strict output. Invalid interview art fails validation; it is not silently replaced with decorative figures.

## Scope IN
- `DESIGN.md` extraction for exam-art tokens and primitive states.
- Backend/shared InterviewArtSpec contract, strict schema, eligibility validator, and blueprint/batch prompt fields.
- Web SVG person primitives, role accessories, and interview scene composition integrated into `TPL_CONVERSATIONAL_FLOW`.
- PDF portrait/transcript equivalent, responsive behavior, accessibility, print/grayscale QA, and generated interview fixtures.
- Small visible steps with a component showcase before integrating into actual question pages.

## Scope OUT (Must NOT have)
- No arbitrary SVG/XML/HTML/CSS or JavaScript from the model.
- No generated image URLs, base64 blobs, external avatar fetching, or image-generation API.
- No 3D, animation required to understand evidence, decorative mascots, or art on every question.
- No replacement of existing TPLs or chart library.
- No graph/chart/report art work; existing Recharts and document TPLs remain unchanged.
- No actual problem-data import; this Art plan works with fixtures and integrates with the separate generation/import plan later.

## Proposed execution structure

### Phase A - Eligibility and contracts
1. Add corpus-backed interview fixtures from the explicit 성직/공일 interview examples, plus negative fixtures for a classroom, meeting, report, and one-sided quoted statement. The fixture names carry source filename/question number but do not modify corpus files.
2. Add a pure `isInterviewEligible()` classifier that requires an explicit interview marker, exactly two normalized participant roles, and at least two alternating turns. Its return value includes a typed non-eligible reason for test evidence.
3. Add shared `InterviewArtSpec` types: setting, caption, two participants, role/pose/facing/expression/accessory enums, ordered turns, alt summary, and evidence claim ids.
4. Add a strict provider JSON Schema for `InterviewArtSpec`: fixed object keys, enum-bounded participant attributes, 2 participants exactly, 2-6 turns, bounded Korean text lengths, no SVG/XML/HTML/CSS/URL fields.
5. Add server validation that verifies speaker ids, alternating turns, unique participant ids, claim-id membership, explicit source eligibility, role/accessory compatibility, and no source-copy phrase leakage in new dialogue.
6. Add deterministic conversion from valid interview art to existing conversational stimulus data. Invalid art must reject the generated item rather than introduce an art fallback.

### Phase B - Design primitives
7. Extract existing exam renderer colors, typography, line weights, spacing, bubble treatment, and print constraints into root `DESIGN.md`; define only the reusable Interview Art tokens and states.
8. Create a component showcase route/story for four required states: journalist/developer, journalist/medical worker, neutral/no accessory, and long Korean dialogue. No generation pipeline integration yet.
9. Build a pure `PersonFigure` SVG primitive with controlled head/body/hair silhouette, pose, direction, and expression. It accepts enum props only, not arbitrary SVG or URLs.
10. Build role accessory primitives (`microphone`, `clipboard`, `helmet`, `safety_vest`, `lab_coat`) with deterministic placement and no semantic dependence on color.
11. Build `InterviewSpeechBubble` as semantic HTML text with a visual tail pointing at the corresponding figure; support Korean line wrapping and long-word overflow without changing scene geometry.
12. Build `InterviewScene` composition with a stable two-column desktop grid and stacked mobile layout; all speaker identity information is duplicated in text labels.

### Phase C - Renderer integration
13. Extend the frontend question data parser/types so an optional validated interview art payload coexists with the existing conversational stimulus data; non-interview TPLs must parse exactly as before.
14. Integrate `InterviewScene` only into eligible `TPL_CONVERSATIONAL_FLOW` rendering. The current text-only renderer remains the explicit fallback for absent/invalid art data.
15. Add the PDF equivalent using portrait blocks plus transcript text, not browser SVG. Keep source order, labels, captions, and claim-relevant dialogue visible in PDF export.
16. Add accessible descriptions: concise `aria-label`/caption for the scene and a visible or screen-reader transcript; verify keyboard navigation does not enter decorative SVG internals.

### Phase D - Generation integration
17. Extend the generation blueprint contract with `artIntent: 'none' | 'interview_scene'`; permit `interview_scene` only when the selected source slot passes the server eligibility classifier.
18. Extend the strict final generation schema/prompt with optional `interviewArt` only for eligible conversational slots. The model must preserve blueprint claim ids and may not invent participant roles outside enums.
19. Validate generated `interviewArt` before server assembly, attach it to the final render payload and lineage, and reject an art-bearing item that fails any contract.
20. Add batch-level assertion that non-eligible slots do not receive art data and that eligible slots can still be saved as text-only if the blueprint selected `none`.

### Phase E - Verification and rollout
21. Unit-test all eligibility positive/negative corpus fixtures, contract/schema rejects, speaker alternation, role/accessory compatibility, source-copy rejection, and non-interview regressions.
22. Add component tests for scene labels, long Korean text, missing optional accessory, mobile stacking, and text-only fallback.
23. Add Web/PDF parity fixtures using one 성직 medical interview and one 공일 technical-worker interview. Verify each has the same speakers, turn order, caption, and evidence text across both surfaces.
24. Run visual QA screenshots at 375, 768, and 1280 widths plus a PDF export artifact. Check clipping, CJK wrapping, grayscale distinction, and nonblank figures.
25. Run one mocked end-to-end generation fixture first. Only after all contract and visual gates pass, run one real eligible interview generation; inspect persisted art lineage and browser/PDF output.

## Proposed file ownership

- `frontend/types/questionstem.ts`: frontend-safe InterviewArtSpec view types.
- `frontend/components/exam/QuestionStem/InterviewArt/*`: SVG figures, accessories, speech bubble, scene composition, and CSS modules.
- `frontend/components/exam/QuestionStem/TPL_CONVERSATIONAL_FLOW/*`: narrow integration and text-only fallback preservation.
- `frontend/components/exam/ExamPdf/PdfStimulusRenderer.tsx`: transcript/portrait PDF parity renderer.
- `frontend/shared/ui/QuestionStem/QuestionRenderer/index.tsx`: parsed optional-art dispatch only.
- `backend/src/exams/interview-art.*`: server contract, strict schema, eligibility parser, validator, fixtures, and tests.
- `backend/src/exams/*generation*`: only the blueprint/final-output wiring required to carry validated interview art.
- `DESIGN.md`: exam art tokens, primitive states, accessibility and accepted-debt notes.

## Open questions
- None blocking. Interview art is eligibility-driven rather than frequency-driven and applies only to explicit interview material.
- Test strategy default: TDD contracts/eligibility validator, component showcase screenshots, Playwright web QA at 375/768/1280, PDF snapshot/render QA, then mocked and actual-corpus interview fixtures.

## Approval gate
status: approved
Proposed plan: introduce one safe eligibility-driven interview Art Layer, render controlled SVG interviewer/interviewee figures with real text bubbles, leave charts/reports/classrooms/meetings unchanged, and prove Web/PDF/accessibility parity in small visible steps before generation integration. Approval authorizes writing the detailed execution plan only.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
