# reference-frame-structured-output - Work Plan

## TL;DR (For humans)

**What you'll get:** Reference Frame generation will ask the provider for complete, schema-bound objects instead of merely valid JSON. Partial three-field objects will no longer reach the planner as valid model output.

**Why this approach:** The live failure proved that `json_object` does not enforce required fields. Strict, per-stage JSON Schemas move that contract to the provider boundary while retaining server validation.

**What it will NOT do:** It will not reconstruct arbitrary partial Frames, alter explicit AI generation, or change frontend behavior.

**Effort:** Medium
**Risk:** Medium - provider/model structured-output capability must be verified against the configured Applehouse model.
**Decisions to sanity-check:** Provider lack of strict schema support is a typed fail-closed configuration failure, never a silent fallback to permissive JSON mode.

Your next move: start this plan with `/start-work reference-frame-structured-output`. Full execution detail follows below.

---

> TL;DR (machine): Enforce stage-specific strict provider schemas, classify capability/refusal/truncation failures, and prove one real omitted-sourceType job plus persistence.

## Scope
### Must have
- Provider-compatible strict JSON Schemas for Reference Frame and Concept Payload, derived from existing validators.
- Stage-aware `json_schema` requests with `strict: true`, all properties required, and `additionalProperties: false` at every object level.
- Typed classification for strict-schema unsupported, refusal, truncated/empty, and invalid-provider responses.
- Mock contract tests and one capability-gated live omitted-`sourceType` job with DB evidence.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not relax server validators or accept arbitrary partial/unknown fields.
- Do not silently downgrade an unsupported model to `json_object`.
- Do not modify frontend files, explicit `sourceType: "ai"`, database schema, or parsed references.

## Verification strategy
- Test decision: TDD with Jest fixtures at the `ReferenceFramePlannerModelClient` request boundary and planner stage boundary.
- Automated checks: focused model-client/planner specs, `npm run typecheck -w backend`, and `npm run build -w backend`.
- Real proof: one authenticated job only after the strict-schema capability fixture/request is accepted; poll terminal status and query source type, item count, and lineage or prove zero partial rows on typed failure.
- Adversarial coverage: malformed schemas, schema capability mismatch, refusal, truncation, prompt-injection reference text, stale response state, dirty worktree, and misleading mock-only success.

## Execution strategy
### Parallel execution waves
| Wave | Todos | Purpose |
| --- | --- | --- |
| 1 | 1 | Make strict JSON Schema artifacts and stage contracts independently testable. |
| 2 | 2 | Integrate client request selection and provider failure classification after schemas exist. |
| 3 | 3 | Verify actual provider capability, one real job, persistence, and cleanup after mocked contract passes. |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | 2, 3 | - |
| 2 | 1 | 3 | - |
| 3 | 1, 2 | Final Wave | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
- [x] 1. Define strict provider JSON Schemas for Frame and Payload from the existing contract validators.
  What to do / Must NOT do: Add a focused schema module under `backend/src/exams/` that exposes immutable, provider-compatible JSON Schema descriptors for the exact Frame and Payload response shapes. Reuse the existing `ResponseMode`, encoding, subject/unit range, arrays, nested objects, and enum semantics without importing OpenAI SDK types into validators. Every object node must specify `additionalProperties: false`; every supported property must be listed in `required` and nullable properties must use explicit null unions if any exist. Write failing-first tests that assert schema shape, exact required keys, rejection of extra-key schema regressions, and separate Frame/Payload selection. Do not replace or loosen `validateReferenceFrameJson()`/`validateConceptPayloadJson()`.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 2, 3
  References: `backend/src/exams/reference-frame.frame-validator.ts`; `backend/src/exams/reference-frame.payload-validator.ts`; `backend/src/exams/reference-frame.types.ts`; `backend/src/exams/reference-frame.validation-utils.ts`; OpenAI structured-output contract documented in Context7 `/websites/developers_openai_api`.
  Acceptance criteria: schema tests prove all root/nested object fields are required and `additionalProperties: false`; schemas represent every currently accepted valid Frame/Payload fixture; existing validator specs continue passing.
  QA scenarios: happy: serialize each schema and assert exact name/strict/root fields; failure: a deliberately injected omitted required key or allowed extra property fails the schema contract test. Evidence `.omo/evidence/reference-frame-structured-output/task-1.md`.
  Commit: N | bundle after Todo 2 verification

- [x] 2. Send stage-specific strict structured-output requests and classify provider failures without permissive fallback.
  What to do / Must NOT do: Extend the planner model-client request contract so `create()` accepts a stage/schema descriptor and sends Chat Completions `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Route Frame and Payload calls to their own schema from `ReferenceFramePlannerService`. Add explicit typed planner reason codes and model-failure handling for provider responses that reject/unsupported `json_schema`, structured-output refusals, empty/truncated content, and malformed completion envelopes. Keep timeout/retry semantics only for retryable transport failures; capability/configuration refusal must terminate fail-closed before planner recovery. Update mocks/tests to inspect the outgoing provider request rather than only returned planner data.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References: `backend/src/exams/reference-frame-planner.model-client.ts:17-77`; `backend/src/exams/reference-frame-planner.service.ts:69-126`; `backend/src/exams/reference-frame-planner.types.ts`; `backend/src/exams/reference-frame-planner.fixtures.ts`; `backend/src/exams/reference-frame-planner.service.spec.ts`; OpenAI Chat Completions structured output docs via Context7.
  Acceptance criteria: model-client tests assert correct strict schema name per stage; provider 400 schema-capability failure returns a non-retryable typed reason; refusal/truncation cannot become a recovered Frame; valid strict fixtures still plan and payload calls remain independent.
  QA scenarios: happy: mocked Frame and Payload completions are accepted only when their matching request schema is sent; failure: provider returns a JSON-schema unsupported error, refusal, and truncated content, each with exact terminal reason and no second permissive request. Evidence `.omo/evidence/reference-frame-structured-output/task-2.md`.
  Commit: N | bundle after Todo 3 verification

- [x] 3. Prove provider capability and the end-to-end omitted-sourceType generation transaction once.
  What to do / Must NOT do: After Todo 2 passes locally, build and start an isolated backend from the existing environment. Submit at most one authenticated 성직 unit-1 `POST /exams/jobs` request with `questionCount: 1` and omitted `sourceType`; poll terminal status. Record provider capability result, schema error body/classification if unsupported, and before/after scoped database counts. On completion query `exam_records.source_type`, `exam_items`, and `questions.generation_lineage`; on typed failure prove no new partial rows. Clean up every temporary process/log resource and never reveal credentials.
  Parallelization: Wave 3 | Blocked by: 1, 2 | Blocks: Final Wave
  References: `.omo/evidence/reference-frame-planner-recovery/task-2.md`; `backend/src/exams/exams.service.ts`; `backend/src/exams/reference-frame-generation.service.ts`; `backend/src/entities/question.entity.ts`; `backend/.env` (read-only; never print values).
  Acceptance criteria: focused tests/typecheck/build pass; exactly one real job has terminal evidence; success persists exact requested count plus lineage, while an unsupported-provider failure is typed and leaves zero partial records.
  QA scenarios: happy: strict-output capable provider reaches completed job then SQL verifies Reference source type and lineage; failure: strict-output capability failure returns classified non-retryable job error and before/after scoped DB counts match. Evidence `.omo/evidence/reference-frame-structured-output/task-3.md`.
  Commit: N | verification only unless a clean atomic commit is explicitly requested

## Final verification wave
> Runs in parallel after all implementation tasks. All gates must approve.
- [x] F1. Plan compliance audit
- [x] F2. Strict-schema and typed-error code review
- [x] F3. Real provider/job/database evidence audit
- [x] F4. Scope fidelity review for no permissive fallback, frontend, and explicit-AI non-regression

## Commit strategy
- Preserve unrelated dirty worktree changes.
- Keep product edits confined to planner schema/client/types/tests unless an exact compile-required import change is necessary.
- Do not commit provider credentials, generated logs, or temporary process artifacts.

## Success criteria
- Provider requests use stage-specific strict `json_schema`, not `json_object`.
- Partial three-key objects cannot reach a planned Frame path.
- Unsupported strict schema capability is observable as a non-retryable typed failure, never a hidden permissive fallback.
- Existing server validators remain active, focused tests/typecheck/build pass, and one real job has terminal DB-backed evidence.
