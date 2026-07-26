---
slug: reference-generation-blueprint-batches
status: approved
intent: clear
review_required: false
pending-action: execute .omo/plans/reference-generation-blueprint-batches.md via /start-work
approach: Rebuild the disposable backend generation data model around an immutable reference catalog, then generate one compact blueprint followed by homogeneous strict-output batches of up to five; import actual parsed question data only after the core passes fixture and API verification.
---

# Draft: reference-generation-blueprint-batches

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| clean-data-model | Replace disposable backend generation tables with a source catalog, generation run, generated question, and exam assembly model | active | `Question`, `ExamRecord`, `ExamItem` entities; `textbook/parsed/**/*.json` |
| compact-blueprint | One Step-1 call allocates references, concepts, distractor axes, response mode, and one template per five-item batch | active | `reference-frame-generation.service.ts:61-161`; `reference-selector.service.ts:35-118` |
| five-item-generation | Step 2 sends compact blueprint slots in batches of at most five with one strict response schema per batch | active | `exam-regenerator.service.ts:288-401`; `tpl-schemas.ts:122-355` |
| import-last | Idempotently import parsed actual questions after the new core passes fixtures and API verification | active | `textbook/parsed/sungjik/**/*`; `textbook/parsed/kongil/**/*` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Batch size | Maximum 5 items; final batch may contain 1-4 | User requirement and bounded output size | yes |
| Template grouping | Step 1 assigns one TPL to each five-item batch | Allows one strict homogeneous schema per call and avoids dynamic multi-TPL unions | yes |
| Reference payload | Step 1 receives one compact reference capsule per slot; Step 2 receives no source text | Full removal materially harms stem/distractor/style fidelity, while one-time capsules avoid repeated source cost | yes |
| Metadata | Source id/hash, unit range, lineage, validation policy, and output metadata stay server-side | The model does not need persistence identifiers or policy objects | yes |
| Retry | One batch retry only for transport/refusal/schema failure; content validation failure aborts atomically | Bounded cost without opening another repair loop | yes |
| Token budget | New 10/20-item prompt input must be at most 50% of the current serialized baseline; total provider tokens target at most 70% | Call-count reduction is guaranteed, but token savings must be proven from request bytes and provider usage rather than estimated | yes |
| Backend data | All existing backend database data and legacy generation migrations are disposable | User explicitly authorized a clean reset, allowing a coherent source catalog instead of compatibility shims | no |

## Findings (cited - path:lines)
- Current Step 1A Frame prompt sends `task`, `response`, required source/subject/range, and the full reference (`source`, unit/question numbers, stem, stimulus, five choices, target concepts) at `reference-frame-planner.prompts.ts:4-14`.
- Current Step 1B Payload prompt repeats source/subject/range, then sends the full Frame, all selected concepts with unit numbers, all five distractor axes, and forbidden source concepts/axes at `reference-frame-planner.prompts.ts:17-32`.
- Current final generation prompt repeats per item: unit range, full Frame, full Payload, selected template, the full selected TPL JSON schema, and source-copy token policy at `exam-regenerator.service.ts:368-401`.
- The full TPL schema is currently embedded inside every variant even when variants share a template. Source id/hash, unit range, and validation policy are also repeated despite being server-owned.
- Existing `TPL_SCHEMA_MAP` already provides strict final-item schemas, so each homogeneous five-item batch can wrap one schema once rather than embedding it in every prompt item (`tpl-schemas.ts:305-355`).
- Quality risk: structure-only metrics cannot encode Korean stem cadence, condition wording, distractor symmetry, or inference depth. Removing all source text would likely produce generic textbook items rather than reference-like exam items.
- Quality risk: one blueprint for up to 20 items can duplicate scenarios or concentrate answer patterns. DTO count is capped at 20 (`create-exam.dto.ts:31-34`), so strict slot coverage, concept/axis pre-allocation, scenario uniqueness, and answer-position distribution must be validated at the blueprint boundary.
- Quality risk: forcing one arbitrary TPL on five unrelated references can reduce material-concept fit. Batches must be formed from references with the same rule-detected TPL; each homogeneous group is chunked to at most five, even if this creates slightly more than `ceil(count/5)` calls.
- Quality risk: current validators strongly check shape, answer range, placeholders, renderability, and source copying, but cannot prove textbook factual truth. Step 1 must own claim/verdict planning; Step 2 may realize but must not change those verdicts.
- Existing `Question` conflates generated user-visible questions with any potential source material (`question.entity.ts:16-77`). Source questions need a separate immutable catalog table with source fingerprint/version and provenance; they must never be inserted as generated `Question` rows.
- Current `ExamRecord`/`ExamItem` model is a viable minimal final delivery shape (`exam-record.entity.ts:27-82`, `exam-item.entity.ts:11-37`), but because all backend data is disposable it can be recreated cleanly with explicit generation-run linkage instead of retaining legacy nullable compatibility fields.
- Parsed actual source material already exists by subject/unit under `textbook/parsed/sungjik/**` and `textbook/parsed/kongil/**`; import must run last so failures in new generation code never damage or partially seed the source catalog.

## Decisions (with rationale)
- Reset backend generation data and replace legacy generation entities/migrations with four explicit persistence roles: immutable `reference_questions`, auditable `generation_runs`, validated `generated_questions`, and assembled `exam_sessions`/items.
- Keep the new database initially empty except for minimal fixture rows used by tests; do not import the actual parsed corpus during any core implementation step.
- Replace per-reference Frame/Payload calls with one exam-level blueprint call.
- Before Step 1, the server deterministically assigns each slot's reference, target/supporting concepts, distractor axis, response structure, and TPL, then groups slots into homogeneous batches of at most five.
- Step 1 input contains only shared exam settings and assigned compact slots. It sends no full concept pool, axis catalog, source identity, unit range per item, TPL schema, lineage, or validation policy.
- Each Step 1 slot contains `slotId`, assigned concept labels, one distractor axis, derived style metrics, and a one-time reference capsule: full stem, target concepts to avoid, five source choices for distractor/style analysis, and a head+tail stimulus excerpt capped at 800 characters. The batch supplies the rule-detected TPL once.
- Step 1 output contains `slotId`, scenario brief, required facts, claim/verdict plan, answer pattern, and a required `referenceStyleContract`: stem archetype/polarity, material organization, target character/paragraph range, exact view-item count, choice form/length band, inference-step count, difficulty drivers, and distractor form. It does not repeat source wording, metadata, TPL schema, or persistence data.
- Step 2 groups exactly by Step-1 batch, sends shared settings once plus compact slot blueprints, and uses one strict `questions[]` schema derived from that batch's single TPL.
- Step 2 input resolves only the five used concept labels and semantic blueprints. It sends no reference data and no unused concept/axis dictionaries.
- Step 2 output omits metadata, source identities, lineage, unit range, template name, difficulty, item type, point value, and validation flags. It returns only question content (`slotId`, stem, TPL stimulus data, optional view block, five unnumbered choices, answer index, explanation). The server fills trusted fields and choice markers after validation.
- Keep full references only in process memory for anti-copy comparison; do not resend source text in Step 2.
- Reject a blueprint before generation when slot ids are missing or duplicated, assigned concepts/axes drift, scenarios are too similar, claim verdicts are incomplete, or answer patterns are excessively concentrated.
- Preserve blueprint claims and verdicts as immutable Step-2 constraints; final answer alignment is checked server-side. A batch gets at most one retry with the concrete rejection reason, never a generic open-ended repair loop.
- Treat `referenceStyleContract` as a blocking server-side acceptance contract, not prompt guidance. Reject items whose stem polarity/archetype, selected TPL, material length/paragraph range, view count, five-choice form, answer pattern, or blueprint claim alignment drifts. Record non-machine-verifiable style judgments (cadence and perceived difficulty) in the real QA rubric rather than claiming they are guaranteed.
- Execute in visible micro-steps: each implementation step adds one bounded contract/test, reports its changed files and command result, then stops for the next short step. Do not start a real provider job until all deterministic and mocked stage checks pass.
- Capture a no-network baseline from current prompt builders for 10 and 20 questions, then compare serialized request bytes against the new blueprint and batch builders. At runtime aggregate provider `usage.prompt_tokens` and `usage.completion_tokens` by stage without logging prompt content.

## Scope IN
- Deterministic pre-allocation plus a compact semantic blueprint contract and one Step-1 model request.
- Five-item homogeneous generation batches using existing TPL schemas.
- Clean schema/migrations for source catalog, run audit, generated questions, and assembled exams; old backend data is intentionally dropped.
- Server-side metadata/lineage reconstruction and exact-count transaction behavior in the new schema.
- Focused mocked tests plus one real 10-question run, proving one blueprint call plus two generation calls.
- Token/call evidence for 10 and 20 questions: current `21/41` calls versus new `3/5`, input-token target `<=50%`, total-token target `<=70%`, excluding an explicitly reported retry.

## Scope OUT (Must NOT have)
- No per-question model calls.
- No per-reference Frame/Payload model calls.
- No repeated full TPL schema or source-copy policy inside each prompt variant.
- No frontend redesign or parsed-corpus mutation.
- No compatibility migration or preservation work for discarded backend database data.
- No runtime import of actual parsed question data before the final planned import step.

## Open questions
- The user selected a disposable backend database and the blueprint-once plus five-item batch architecture. The plan will use one TPL per batch to preserve strict provider schemas and minimize request data.
- Test strategy default: TDD for compact contracts and batching, mocked call-count assertions (`10 questions = 1 blueprint + 2 generation calls`), then one real backend/DB run.

## Approval gate
status: awaiting-approval
Proposed plan: reset backend generation data, build and prove the clean source-catalog/run/generation/exam core entirely with fixtures, then import actual parsed question data only as the final stage. Step 1 generates one compact exam blueprint; Step 2 processes homogeneous TPL batches in chunks of at most five; source, metadata, validation, and lineage data remain server-owned. Approval authorizes writing the detailed execution plan only.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
