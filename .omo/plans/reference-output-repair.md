# reference-output-repair - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** AI 응답의 형식을 API와 백엔드 양쪽에서 강제하고, 빈 block·legacy wrapper·표시 marker 같은 기계적 오류만 안전하게 정규화하는 생성 파이프라인입니다.

**Why this approach:** 형태 오류는 strict JSON Schema로 선제 차단하고, schema를 우회한 응답도 의미를 바꾸지 않는 repair 뒤 기존 검증기를 통과해야만 저장합니다.

**What it will NOT do:** 누락된 보기·선택지·자극·해설을 서버가 창작하지 않습니다. 정답 논리, source-copy, template renderability 검사는 완화하지 않습니다. 정답이 틀리면 서버가 바꾸지 않고 재생성 또는 거절합니다.

**Effort:** Medium
**Risk:** Medium - OpenAI structured-output 지원 여부와 template schema를 API JSON Schema로 정확히 변환해야 합니다.
**Decisions to sanity-check:** Mechanical-only repair가 승인됐습니다.

Your next move: `/start-work`로 이 계획을 실행합니다. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk; strict provider schema plus mechanical-only backend repair and exact-count live verification.

## Scope
### Must have
- Request별 strict OpenAI JSON Schema: singleton wrapper, canonical template, fixed choice/view counts, required fields, no extra properties.
- Typed repair result/report that canonicalizes only representation defects before existing semantic validators.
- Payload claim verdict에서 기대 정답 조합을 deterministic하게 계산하고, 선택지와 `correctAnswer`의 유일한 일치를 검증.
- Repair/rejection observability and regression coverage, followed by actual 15단원 exact-count generation verification.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not synthesize curriculum facts, missing choices, combo text, explanations, or correct answers.
- Do not silently truncate nonempty combo blocks or alter answer semantics.
- Do not silently replace `correctAnswer`, claim verdict, 또는 choice text to force an answer match.
- Do not bypass source-copy, template-selection, renderability, or answer-encoding validators.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Jest, TypeScript typecheck, ESLint, Nest build, and real reference job polling.
- Evidence: `.omo/evidence/reference-output-repair/task-<N>.md`.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 5 | 3 |
| 2 | 1 | 5 | 3 |
| 3 | none | 4, 5 | 1, 2 |
| 4 | 3 | 5 | 1, 2 |
| 5 | 1, 2, 3, 4 | 6 | none |
| 6 | 5 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Build a request-specific strict final-output JSON Schema factory.
  What to do / Must NOT do: Define JSON Schema object builders for the singleton `questions` envelope, exact `templateType`, fixed choice count, answer bounds, explanation judgment, and null-versus-exact combo shape. Use `strict: true`, exhaustive `required`, and `additionalProperties: false`; do not use a permissive catch-all schema.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 5
  References (executor has NO interview context - be exhaustive): backend/src/exams/exam-regenerator.service.ts (`buildReferenceBatchRegenPrompt`, `ReferenceVariantGenerationRequest`); backend/src/exams/tpl-schemas.ts (`getTplSchema`); OpenAI Chat Completions structured-output docs.
  Acceptance criteria (agent-executable): Focused Jest tests prove schemas differ for zero, three, and four source view items; each rejects wrong template, extra key, wrong choice count, and wrong combo cardinality.
  QA scenarios (name the exact tool + invocation): happy and failure fixtures in `exam-regenerator.reference-variant.spec.ts`; record `npm run test -- exam-regenerator.reference-variant.spec.ts --runInBand` in `.omo/evidence/reference-output-repair/task-1.md`.
  Commit: Y | feat(exams): add strict final output schema factory
- [x] 2. Send the strict schema in final OpenAI singleton requests and handle refusal safely.
  What to do / Must NOT do: Replace `json_object` final response formatting with Chat Completions `json_schema`; construct it per singleton request and distinguish refusal/empty/malformed provider responses. Do not alter planner-model calls or weaken exact singleton response count checks.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5
  References (executor has NO interview context - be exhaustive): backend/src/exams/exam-regenerator.service.ts (`regenerateReferenceBatch`, `parseReferenceQuestions`); backend/src/exams/reference-generation-model.ts.
  Acceptance criteria (agent-executable): Mock request asserts `response_format.type=json_schema`, `strict=true`, and expected schema name/content; refusal and malformed output remain fail-closed and retry only within the bounded policy.
  QA scenarios (name the exact tool + invocation): Jest mocked completion success/refusal/malformed cases; evidence task-2.md.
  Commit: Y | feat(exams): enforce final structured output contract
- [x] 3. Extract a typed mechanical-only repair module and repair report.
  What to do / Must NOT do: Move existing legacy-envelope, explanation, and empty-combo canonicalization behind one typed repair API that returns `accepted`, `repaired`, or `rejected` with non-content reason codes. Permit only aliases, wrapper/key conversion, whitespace, deterministic display markers, and zero-item-to-null conversion; never add, remove, rewrite, or invent semantic text/items.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 4, 5
  References (executor has NO interview context - be exhaustive): backend/src/exams/exam-regenerator.service.ts (`normalizeReferenceVariantOutput`, `explanationJudgment`, `normalizeEmptyComboBlock`, `transformReferenceQuestion`); backend/src/exams/exam-regenerator.reference-variant.spec.ts.
  Acceptance criteria (agent-executable): Unit tests enumerate each allowed repair and prove missing choice/combo/stimulus/answer content is rejected rather than synthesized.
  QA scenarios (name the exact tool + invocation): TDD fixtures for repair and reject-only boundaries; evidence task-3.md.
  Commit: Y | refactor(exams): isolate mechanical reference output repair
- [x] 4. Run repaired output through unchanged semantic and rendering guards with repair telemetry.
  What to do / Must NOT do: Integrate the repair result before `transformReferenceQuestion` validation, log aggregate reason codes and repair counts without raw generated/source content, and preserve source-copy, selected template, answer encoding, conversation parsing, and renderability checks. For `truth_combination`, deterministically derive the expected Korean-letter set from payload claim verdicts; require exactly one choice to encode that set and require `correctAnswer` to point to it. Do not create a repair-based bypass or replace a wrong answer.
  Parallelization: Wave 1 | Blocked by: 3 | Blocks: 5
  References (executor has NO interview context - be exhaustive): backend/src/exams/exam-regenerator.service.ts (`transformReferenceQuestion`, `hasSourceCopy`, `referenceValidationCorrection`); backend/src/exams/reference-tpl-selector.ts; backend/src/exams/stimulus-normalizer.ts.
  Acceptance criteria (agent-executable): Every existing semantic rejection test still rejects after a repair attempt; tests cover missing/extra Korean letters, duplicate correct combinations, none-of-the-above mismatch, and a `correctAnswer` index pointing at a nonmatching option. Repaired valid output stores the canonical value and exposes only a reason code in logs/metrics.
  QA scenarios (name the exact tool + invocation): focused Jest suite plus log spy assertions for all answer-logic failure codes; evidence task-4.md.
  Commit: Y | feat(exams): audit reference output repair decisions
- [x] 5. Simplify retry handling around provider versus semantic failures.
  What to do / Must NOT do: Classify strict-schema/refusal/transport failures separately from semantic validation failures; keep a finite per-slot retry budget and correction prompt only for semantic failures that a model can correct, including answer-logic mismatch. Correction must state the expected verdict-letter set without exposing or modifying stored source content. Do not retry invalid input/context or persist partial exact-count results.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3, 4 | Blocks: 6
  References (executor has NO interview context - be exhaustive): backend/src/exams/exam-regenerator.service.ts (`regenerateReferenceBatch`, `referenceValidationCorrection`, `referenceRequestReason`); backend/src/exams/reference-frame-generation.service.ts (`generate`).
  Acceptance criteria (agent-executable): Tests show schema/provider failures and semantic failures have correct attempt caps, while invalid preflight context makes zero provider calls and shortfall remains fail-closed.
  QA scenarios (name the exact tool + invocation): Jest call-count assertions and `REFERENCE_GENERATION_SHORTFALL` failure case; evidence task-5.md.
  Commit: Y | fix(exams): bound final generation recovery by failure class
- [x] 6. Verify the complete reference-generation pipeline against source-derived structure.
  What to do / Must NOT do: Run focused tests, typecheck, lint, build, then actual `success` unit 15 one- and ten-question reference jobs. Inspect persisted question count, template names, combo cardinality/nullness, choice count, answer range, and repair/rejection metrics. Do not mask a shortfall by writing incomplete exams.
  Parallelization: Wave 3 | Blocked by: 5 | Blocks: final verification
  References (executor has NO interview context - be exhaustive): backend/src/exams/reference-frame-generation.service.ts (`generate`, source-derived `viewItems`); backend/src/exams/reference-selector.utils.ts (`parseReference`); backend/src/exams/exam-regenerator.reference-variant.spec.ts.
  Acceptance criteria (agent-executable): Unit 15 ten-question job completes with an exam ID and exactly ten persisted items; no persisted item violates its source-derived combo contract.
  QA scenarios (name the exact tool + invocation): `npm run typecheck`, focused Jest suites, `npm run lint`, `npm run build`, and job-polling harness; evidence task-6.md.
  Commit: N | covered by prior commits

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
- Commit 1: strict provider schema and request integration.
- Commit 2: mechanical repair module, semantic integration, and telemetry.
- Commit 3: retry classification and verification coverage.

## Success criteria
- The final provider request uses a strict request-specific schema.
- Backend repairs only approved mechanical representation defects and records them.
- No semantic validator is weakened or bypassed.
- Every persisted truth-combination item has exactly one option matching claim verdicts, and `correctAnswer` points to that option.
- Unit 15 ten-question reference generation persists exactly ten validated items.
