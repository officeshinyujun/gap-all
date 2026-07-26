# reference-generation-blueprint-batches - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** 참조 문제를 안전하게 보관하고, 한 번의 설계 요청과 최대 다섯 문제씩의 생성 요청으로 시험을 만드는 새 생성 경로를 얻습니다. 매 작은 단계마다 체크된 작업, 실행 명령 결과, 호출 수와 토큰 측정값이 남아 진행 상황을 바로 확인할 수 있습니다.

**Why this approach:** 참조 선택과 TPL 배정은 서버가 결정적으로 고정하고 모델은 그 슬롯을 구체화만 하게 만듭니다. 따라서 비용을 줄이면서도 출처, 정답 근거, 배치 경계, 실패 원인을 재현하고 검증할 수 있습니다.

**What it will NOT do:** 일반 AI 생성과 화면을 재설계하지 않습니다. 전체 데이터베이스를 삭제하거나 원본 parsed JSON을 수정하지 않으며, 실패한 배치의 부분 시험을 저장하지 않습니다.

**Effort:** XL
**Risk:** High - 생성 데이터 모델, OpenAI 계약, 원자적 저장, 실제 코퍼스 import를 함께 교체합니다.
**Decisions to sanity-check:** 생성 데이터만 폐기하고 비생성 테이블은 보존합니다. 실제 코퍼스의 호출 수는 TPL 동질 청크 수에 따라 달라질 수 있고, `1 + 2`는 통제 fixture에서만 보장합니다.

Your next move: `/start-work reference-generation-blueprint-batches`로 Todo 1부터 한 항목씩 실행합니다. 각 항목의 테스트와 evidence를 남긴 뒤에만 다음 항목으로 진행합니다. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk backend replacement: scoped generation-data reset, immutable source catalog, deterministic blueprint allocation, homogeneous <=5 TPL batches, atomic persistence, measured 10/20-item evidence, and final corpus import.

## Scope
### Must have
- 생성 전용 데이터의 범위 제한 reset preflight, immutable source catalog, generation run, generated question, exam assembly의 명시적 데이터 모델을 만든다.
- 서버가 seed 기반으로 reference, concept, distractor axis, TPL, batch를 먼저 배정하고, Step 1은 배정된 슬롯의 semantic blueprint만 만든다.
- Step 2는 단일 TPL을 공유하는 1-5개 슬롯만 처리하며, schema/source/reference metadata를 슬롯별로 반복하지 않는다.
- slotId의 전수/유일성, blueprint claims/verdicts, style contract, answer-position 분포, cross-batch 경계를 저장 전에 검사한다.
- provider 시도별 usage와 request-byte baseline/new 측정값을 prompt 본문 없이 run에 기록한다.
- fixture/API 검증 뒤에만 parsed corpus를 checksum 기반 dry-run/transaction import하고, 실제 10문항 실행 증거를 남긴다.
- 모든 Todo는 변경 파일, 실행 명령, happy/failure 결과, evidence 경로를 남기고 완료 checkbox를 즉시 갱신한다.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- 데이터베이스 전체 drop, 사용자/admin/비생성 시험 데이터 삭제, 또는 환경 확인 없는 destructive SQL을 실행하지 않는다.
- `sourceType: "ai"` 일반 생성 경로, frontend, parsed source JSON을 변경하지 않는다.
- per-reference Frame/Payload 호출, per-question 모델 호출, Step 2의 source-text 재전송, 동적 multi-TPL union schema를 허용하지 않는다.
- batch 실패, schema/content validation 실패, import 실패 시 generated question 또는 incomplete exam을 부분 저장하지 않는다.
- runtime prompt/reference 본문, API key, source 전문을 telemetry/evidence에 기록하지 않는다.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Jest 30/ts-jest Nest service mocks, TypeORM transaction mocks, deterministic parsed fixtures
- Evidence: `<attemptDir>/task-<N>-reference-generation-blueprint-batches.md` (attemptDir = currentAttemptDir from `omo ulw-loop status --json`, `.omo/evidence/ulw/<session>/<goalId>/a<attempt>`; outside ulw-loop use `.omo/evidence/`). Each record must state changed paths, command exit code, assertions, call count, byte/token values when applicable, and the next unblocked Todo.
- Progress cadence: execute exactly one Todo at a time; update its checkbox and evidence before beginning the next. After each wave, publish a five-line progress summary: completed/total, changed files, focused-test result, measured call/token delta, and blockers.
- Standard focused command: `npm test -w backend -- --runInBand <spec names>`; gate each wave with `npm run typecheck -w backend`; final static gate also runs `npm run lint -w backend` and `npm run build -w backend`.

## Execution strategy
### Parallel execution waves
> Execute the five small tasks in each wave serially for visible progress; only independent review/measurement reads may run in parallel. Do not start the next Todo until the current checkbox and evidence exist.
| Wave | Todos | Purpose |
| --- | --- | --- |
| 1 | 1-5 | Establish a measurable baseline and safe, fixture-proven persistence foundation before touching model requests. |
| 2 | 6-10 | Make allocation, homogeneous grouping, compact blueprint contracts, and one blueprint call deterministic. |
| 3 | 11-15 | Generate strict <=5-item batches, validate unordered output, persist atomically, and prove controlled call-count behavior. |
| 4 | 16-20 | Prove budget/API behavior, then import real parsed sources idempotently and run the bounded real-provider check. |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | 16 | - |
| 2 | - | 3, 4, 18 | - |
| 3 | 2 | 4, 5, 13, 18 | - |
| 4 | 2, 3 | 13, 17 | - |
| 5 | 3 | 18, 19 | - |
| 6 | 3 | 7, 8, 9, 10 | - |
| 7 | 6 | 11, 15, 16 | - |
| 8 | 6 | 9, 10 | - |
| 9 | 6, 8 | 10, 12, 13 | - |
| 10 | 7, 8, 9 | 11, 15, 16 | - |
| 11 | 7, 10 | 12, 15, 16 | - |
| 12 | 9, 11 | 13, 15 | - |
| 13 | 4, 9, 12 | 15, 17, 20 | - |
| 14 | 1, 10, 11, 13 | 16, 20 | - |
| 15 | 10, 11, 12, 13, 14 | 16, 17 | - |
| 16 | 1, 7, 10, 11, 14, 15 | 20 | - |
| 17 | 4, 13, 15 | 20 | - |
| 18 | 2, 3, 5, 17 | 19, 20 | - |
| 19 | 5, 18 | 20 | - |
| 20 | 13, 14, 16, 17, 19 | Final verification | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. 동일 fixture에서 현재 10/20문항 요청의 byte/call baseline을 측정하는 순수 harness와 TDD spec을 만든다.
  What to do / Must NOT do: `backend/src/exams/reference-generation-metrics.ts`와 spec에서 현재 Frame/Payload/regeneration prompt builder를 network 없이 직렬화해 10/20문항의 request bytes와 expected call count(21/41)를 기록한다. fixture hash, tool version, serialized-byte method를 evidence에 남긴다. 실제 provider 호출이나 prompt/source 전문 로그를 만들지 않는다.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 16
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-planner.prompts.ts:4-32`; `backend/src/exams/exam-regenerator.service.ts:368-401`; `backend/src/exams/reference-frame-generation.service.ts:61-161`; `backend/package.json:8-25`.
  Acceptance criteria (agent-executable): stable fixture를 두 번 실행해 같은 bytes/calls를 반환하고, baseline JSON has `10: 21`, `20: 41`; no network client is instantiated.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-generation-metrics.spec.ts`; happy: two deterministic fixture measurements equal; failure: missing fixture/input produces typed measurement error. Evidence `<attemptDir>/task-1-reference-generation-blueprint-batches.md`.
  Commit: Y | `test(exams): capture reference generation baseline`

- [x] 2. 생성 데이터만 비우는 preflight/reset command와 destructive-safety tests를 만든다.
  What to do / Must NOT do: `backend/src/exams/generation-data-reset.service.ts`와 migration/runbook command를 추가해 approved DB name/environment, explicit reset confirmation, generation-table allowlist, FK teardown order, backup/snapshot manifest를 검사한 뒤에만 source/run/generated/exam-assembly 데이터를 reset한다. unrelated entity/table name or production-like environment이면 fail closed 한다. `dropSchema`, wildcard delete, user/admin table deletion은 절대 사용하지 않는다.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 3, 4, 18
  References (executor has NO interview context - be exhaustive): `backend/src/app.module.ts:72`; `backend/src/entities/exam-record.entity.ts:27-82`; `backend/src/entities/exam-item.entity.ts:11-37`; `backend/src/entities/question.entity.ts:16-77`; `backend/src/exams/exams.service.ts`.
  Acceptance criteria (agent-executable): invalid confirmation, unknown DB, and production guard each stop before SQL; approved fixture DB removes only allowlisted generation rows and preserves user/admin sentinel rows.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand generation-data-reset.service.spec.ts`; happy: FK-ordered reset preserves sentinels; failure: production/unknown database/allowlist escape rejects. Evidence `<attemptDir>/task-2-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): add scoped generation data reset`

- [x] 3. immutable `reference_questions` catalog entity, fingerprint/version constraints, and fixture repository contract를 만든다.
  What to do / Must NOT do: source id, subject/unit, normalized source hash, provenance, parse version, immutable payload fields and unique `(logicalSourceId, contentHash)` semantics를 `backend/src/entities/reference-question.entity.ts`와 clean migration에 정의한다. `Question` rows에 source material을 넣거나 parsed JSON을 수정하지 않는다.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 4, 5, 6, 13, 18
  References (executor has NO interview context - be exhaustive): `.omo/drafts/reference-generation-blueprint-batches.md:45-47`; `backend/src/entities/question.entity.ts:16-77`; `backend/src/migrations/1721210700000-AddQuestionGenerationLineage.ts`; `textbook/parsed/sungjik/**/*`; `textbook/parsed/kongil/**/*`.
  Acceptance criteria (agent-executable): insert preserves source identity/hash/provenance; duplicate same fingerprint is rejected/no-op by the selected repository API; changed hash for the same logical source produces an explicit version-conflict result.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-question.entity.spec.ts`; happy: catalog fixture round-trip; failure: duplicate fingerprint and changed-hash source are rejected. Evidence `<attemptDir>/task-3-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): add immutable reference catalog`

- [x] 4. generation run/generated question/exam assembly read model과 API compatibility contract를 TDD로 확정한다.
  What to do / Must NOT do: clean entities/migrations for `generation_runs`, `generated_questions`, and exam session/items with run linkage, idempotency key, status, retries, and trusted server metadata를 만든다. `ExamsService`/admin read paths를 compatible DTO shape로 adapt하고 existing `Question`/`ExamRecord`/`ExamItem` consumers and explicit AI semantics를 covered by contract tests. frontend payload shape를 임의로 바꾸거나 legacy nullable fields에 compatibility shim을 쌓지 않는다.
  Parallelization: Wave 1 | Blocked by: 2, 3 | Blocks: 13, 17
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exams.service.ts`; `backend/src/exams/exams.controller.ts`; `backend/src/entities/exam-record.entity.ts:27-82`; `backend/src/entities/exam-item.entity.ts:11-37`; `backend/src/entities/question.entity.ts:16-77`; `backend/src/exams/dto/create-exam.dto.ts:14-51`.
  Acceptance criteria (agent-executable): reference response maintains current public fields/order; explicit AI still routes unchanged; run key is unique, retries are auditable, and no generated record can exist without its run/session linkage.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand exams.service.spec.ts generation-run.entity.spec.ts`; happy: reference and explicit-AI responses satisfy snapshots; failure: duplicate idempotency key and missing linkage fail. Evidence `<attemptDir>/task-4-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): model auditable generation runs`

- [x] 5. parsed-source importer의 fixture-only dry-run manifest와 idempotency contract를 만든다.
  What to do / Must NOT do: `backend/src/textbook/reference-catalog-import.service.ts`에서 source-file count, accepted/rejected records, deterministic fingerprint/version, and manifest checksum을 계산하는 dry-run을 만든다. fixture catalog only로 test하며 actual corpus DB import는 Todo 18 이후까지 실행하지 않는다.
  Parallelization: Wave 1 | Blocked by: 3 | Blocks: 18, 19
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-generation.service.ts:148-161`; `backend/src/textbook/textbook.service.ts`; `textbook/parsed/sungjik/**/*`; `textbook/parsed/kongil/**/*`.
  Acceptance criteria (agent-executable): same fixture re-run creates identical manifest and zero planned inserts; malformed parsed record is rejected with path/reason; input checksum is unchanged.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-catalog-import.service.spec.ts`; happy: valid dry-run manifest; failure: malformed record and changed same logical source hash. Evidence `<attemptDir>/task-5-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(textbook): stage reference catalog imports`

- [x] 6. server-owned slot allocation contract와 deterministic capacity-failure selector를 만든다.
  What to do / Must NOT do: `backend/src/exams/reference-blueprint.types.ts`와 `reference-slot-allocator.service.ts`에서 seed/stable-order로 reference, target/supporting concepts, distractor axis, response mode, TPL candidate를 pre-allocate한다. 모델은 이 fields를 change할 수 없고, eligible capacity 부족은 provider 호출 전 typed result로 반환한다.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 7, 8, 9, 10
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-selector.service.ts:35-118`; `backend/src/exams/reference-tpl-selector.ts`; `backend/src/exams/reference-frame.types.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:52-55`.
  Acceptance criteria (agent-executable): same request/seed yields byte-equivalent slots; allocation excludes duplicate/out-of-range catalog rows; exhausted candidate pool returns reason code without planner call.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-slot-allocator.service.spec.ts`; happy: deterministic ten-slot allocation; failure: insufficient, duplicate source, out-of-range concept. Evidence `<attemptDir>/task-6-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): allocate deterministic blueprint slots`

- [x] 7. canonical TPL별 1-5 slot homogeneous chunker와 boundary contract를 TDD로 만든다.
  What to do / Must NOT do: allocator output을 canonical TPL로 group then chunk max five하는 pure function을 만든다. batches carry ordinal and allowed slot ids; batch size 1, 4, 5, 6 is explicit. different TPL, unknown TPL, or six-item batch must not reach a model request.
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: 11, 15, 16
  References (executor has NO interview context - be exhaustive): `backend/src/exams/tpl-schemas.ts:305-355`; `backend/src/exams/reference-tpl-selector.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:43,53,57`.
  Acceptance criteria (agent-executable): chunks cover every allocated slot exactly once, contain exactly one TPL, and never exceed five; stable input gives stable batch ordinal/order.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-batch-chunker.spec.ts`; happy: 10 same-TPL slots yield two x5 chunks; failure: mixed TPL, 6 slots, and unknown TPL reject. Evidence `<attemptDir>/task-7-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): group homogeneous generation batches`

- [x] 8. compact Step-1 blueprint strict schema/prompt builder를 만든다.
  What to do / Must NOT do: `reference-blueprint.provider-schema.ts`와 prompt builder에서 shared exam settings once, batch TPL once, and one compact reference capsule per assigned slot만 encode한다. capsule is stem, forbidden concepts, five source choices, 800-char head/tail stimulus, derived style metrics. source identity, unit range per item, validation policy, unused pools, full TPL JSON은 보내지 않는다.
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: 9, 10
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-planner.prompts.ts:4-32`; `backend/src/exams/reference-frame.provider-schemas.ts`; `backend/src/exams/tpl-schemas.ts:122-355`; `.omo/drafts/reference-generation-blueprint-batches.md:54-56`.
  Acceptance criteria (agent-executable): strict schema has all required fields/no additional properties; prompt contains only assigned compact slots and one TPL declaration; 800-char stimulus rule is deterministic.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-blueprint.provider-schema.spec.ts`; happy: schema/prompt snapshot; failure: source metadata/full schema/unused concept injection fails snapshot assertion. Evidence `<attemptDir>/task-8-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): define compact blueprint provider contract`

- [x] 9. immutable blueprint validator와 server-side style/claim acceptance contract를 만든다.
  What to do / Must NOT do: `reference-blueprint-validator.ts` validates exact slot-id bijection, allocated concept/axis/TPL immutability, scenario similarity, complete claim/verdict plan, answer distribution, and referenceStyleContract (polarity/archetype/material/view/choice/inference/difficulty/distractor form). cadence/perceived difficulty는 machine-guarantee로 위장하지 말고 QA rubric field로 남긴다.
  Parallelization: Wave 2 | Blocked by: 6, 8 | Blocks: 10, 12, 13
  References (executor has NO interview context - be exhaustive): `.omo/drafts/reference-generation-blueprint-batches.md:56,61-63`; `backend/src/exams/reference-frame.frame-validator.ts`; `backend/src/exams/reference-frame.payload-validator.ts`; `backend/src/exams/exam-question-validator.spec.ts`.
  Acceptance criteria (agent-executable): missing/duplicate/unknown slot, allocation drift, incomplete verdict, overly similar scenarios, and concentrated answer pattern return typed rejection reason before Step 2.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-blueprint-validator.spec.ts`; happy: valid exact blueprint; failure: each invalid fixture maps to a stable reason code. Evidence `<attemptDir>/task-9-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): validate immutable generation blueprints`

- [x] 10. one-call Step-1 blueprint planner와 bounded retry/usage-attempt recording을 연결한다.
  What to do / Must NOT do: current Frame/Payload planner calls를 one exam-level strict blueprint request로 replace하고 Todo 9 validator after completion을 require한다. transport/refusal/schema failure only gets one retry; concrete rejection reason is supplied once; model cannot repair freely. Record each attempt by runId/stage/model/retry flag without prompt body.
  Parallelization: Wave 2 | Blocked by: 7, 8, 9 | Blocks: 11, 15, 16
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-planner.service.ts`; `backend/src/exams/reference-frame-generation.service.ts:61-161`; `backend/src/exams/reference-frame-planner.types.ts`; `backend/src/exams/reference-frame-planner.service.spec.ts`.
  Acceptance criteria (agent-executable): ten-slot fixture makes one blueprint request; valid output passes immutable validator; terminal schema/refusal errors cause at most one retry and no Step 2 request.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-blueprint-planner.service.spec.ts`; happy: one strict request/valid fixture; failure: transport retry once, refusal/schema/invalid contract abort. Evidence `<attemptDir>/task-10-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): plan compact generation blueprints`

- [x] 11. shared-settings + single-TPL Step-2 batch request builder를 만든다.
  What to do / Must NOT do: `ExamRegeneratorService` replacement path sends shared settings once, compact resolved concept labels and blueprint slots, and exactly one `TPL_SCHEMA_MAP` schema for the batch. Source text/reference, metadata/lineage/policy, unused dictionaries, repeated per-item TPL schema/copy policy are forbidden.
  Parallelization: Wave 3 | Blocked by: 7, 10 | Blocks: 12, 15, 16
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-regenerator.service.ts:288-401`; `backend/src/exams/tpl-schemas.ts:305-355`; `.omo/drafts/reference-generation-blueprint-batches.md:57-60`.
  Acceptance criteria (agent-executable): each outgoing request has 1-5 matching-TPL slots and one strict `questions[]` schema; no source phrase or server-only metadata appears in serialized payload.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand exam-regenerator.reference-batch.spec.ts`; happy: x1/x4/x5 request snapshots; failure: mixed TPL/x6/source field fixture rejects before client call. Evidence `<attemptDir>/task-11-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): build strict homogeneous generation prompts`

- [x] 12. unordered Step-2 output mapper와 blueprint-alignment validator를 만든다.
  What to do / Must NOT do: generated `questions[]` is mapped only by `slotId`, not response position; validate one-to-one coverage, selected TPL renderability, five unnumbered choices, answer index, blueprint claims/verdicts/style contract and anti-copy comparison held in memory. server fills trusted metadata/choice markers after validation.
  Parallelization: Wave 3 | Blocked by: 9, 11 | Blocks: 13, 15
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-regenerator.service.ts:347-446`; `backend/src/exams/exam-regenerator.reference-variant.spec.ts`; `backend/src/exams/exam-question-validator.spec.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:59-63`.
  Acceptance criteria (agent-executable): out-of-order valid output stores correct slot mapping; missing, duplicate, unknown, cross-batch slot id, wrong TPL, claim mismatch, and copied-source fixtures all reject.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand exam-regenerator.reference-variant.spec.ts`; happy: unordered five-item response; failure: each coverage/alignment violation has a typed reason. Evidence `<attemptDir>/task-12-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): validate blueprint batch outputs`

- [x] 13. complete-exam staging, atomic persistence, failed-run audit, and active-run guard를 연결한다.
  What to do / Must NOT do: all batches are staged in memory, then exact requested count/slot bijection is validated before one transaction writes run, generated questions, session/items, and telemetry. Final-batch failure/retry exhaustion rolls back generated/session rows while retaining only a safe failed-run audit. enforce idempotency key and one active request guard; never persist per-batch partial exam.
  Parallelization: Wave 3 | Blocked by: 4, 9, 12 | Blocks: 15, 17, 20
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exams.service.ts`; `backend/src/exams/exam-regenerator.service.ts:347`; `backend/src/entities/exam-record.entity.ts`; `backend/src/entities/exam-item.entity.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:61-63`.
  Acceptance criteria (agent-executable): second concurrent/same-key request is rejected or returns same completed run by contract; final batch failure creates no generated/session/item rows; failed run captures reason/retry count.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-generation-persistence.spec.ts`; happy: exact two-batch transaction; failure: final batch, duplicate key, and active-run failures rollback. Evidence `<attemptDir>/task-13-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): persist reference exams atomically`

- [x] 14. provider usage telemetry and redaction-safe measurement collector를 만든다.
  What to do / Must NOT do: each provider attempt records runId, stage, batch ordinal, model, prompt/completion tokens, retry flag, request bytes, and timestamp. aggregate once per run without double-counting retries; absent provider usage is explicit `unavailable`. Never serialize request/prompt/reference content.
  Parallelization: Wave 3 | Blocked by: 1, 10, 11, 13 | Blocks: 16, 20
  References (executor has NO interview context - be exhaustive): `backend/src/lib/openai-keys.ts`; `backend/src/exams/reference-frame-planner.types.ts`; `backend/src/exams/exam-regenerator.service.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:65`.
  Acceptance criteria (agent-executable): mocked attempts yield one telemetry row each with correct retry/ordinal and aggregate; serialized telemetry lacks known prompt/reference sentinel strings.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-generation-usage.spec.ts`; happy: two stages + retry aggregate; failure: missing usage and prompt sentinel leakage. Evidence `<attemptDir>/task-14-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(exams): record generation usage safely`

- [x] 15. controlled 10-slot mocked integration으로 one blueprint + two five-item calls를 증명한다.
  What to do / Must NOT do: exactly ten fixture slots with one canonical TPL are allocated, planned, generated in two x5 chunks, validated, and atomically persisted. Assert exactly 3 provider calls and no prior Frame/Payload calls. This proof must not claim the same call count for an arbitrary real corpus TPL distribution.
  Parallelization: Wave 3 | Blocked by: 10, 11, 12, 13, 14 | Blocks: 16, 17
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-frame-generation.integration.spec.ts`; `backend/src/exams/reference-frame-generation.service.spec.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:73`.
  Acceptance criteria (agent-executable): integration test asserts 1 blueprint call, 2 generation calls, each batch size 5/one TPL, ten persisted items, one complete run, and recorded usage rows.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-generation-blueprint.integration.spec.ts`; happy: controlled 1+2 result; failure: one invalid final-batch item produces failed run/no partial exam. Evidence `<attemptDir>/task-15-reference-generation-blueprint-batches.md`.
  Commit: Y | `test(exams): cover blueprint batch generation flow`

- [x] 16. 같은 fixture에서 새 10/20문항 request-byte/token budget과 real-TPL chunk behavior를 검증한다.
  What to do / Must NOT do: Todo 1 baseline fixture against new builders를 compare하여 input bytes `<=50%` and available total provider tokens `<=70%` targets report한다. controlled ten-slot fixture keeps 3 calls; representative parsed fixture asserts `1 + homogeneous chunk count`, each 1-5/single TPL. usage unavailable status is reported, not fabricated.
  Parallelization: Wave 4 | Blocked by: 1, 7, 10, 11, 14, 15 | Blocks: 20
  References (executor has NO interview context - be exhaustive): `backend/src/exams/reference-generation-metrics.ts`; `backend/src/exams/reference-batch-chunker.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:31-32,65,73`.
  Acceptance criteria (agent-executable): deterministic report compares baseline/new for both counts; byte target passes or emits exact threshold delta; real fixture call count equals calculated homogeneous chunks and never claims fixed 3.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-generation-metrics.spec.ts reference-generation-blueprint.integration.spec.ts`; happy: 10/20 pass measured threshold; failure: intentional payload bloat fails budget assertion. Evidence `<attemptDir>/task-16-reference-generation-blueprint-batches.md`.
  Commit: Y | `test(exams): enforce blueprint generation budgets`

- [x] 17. reference API/job compatibility와 complete-exam response regressions를 확인한다.
  What to do / Must NOT do: controller/service tests cover `POST /exams` and `POST /exams/jobs`: omitted/explicit `reference` routes new pipeline, explicit `ai` retains existing pipeline, status/result uses stable consumer DTO, and failure reports run status without partial exam. No frontend code or external API field rename is allowed.
  Parallelization: Wave 4 | Blocked by: 4, 13, 15 | Blocks: 20
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exams.controller.ts`; `backend/src/exams/exams.service.ts`; `backend/src/exams/dto/create-exam.dto.ts:14-51`; `backend/src/exams/exam-generation-jobs.service.ts`.
  Acceptance criteria (agent-executable): each sourceType route invokes only its intended service; complete run returns requested item count; failed run exposes typed status and no session id/items.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand exams.controller.spec.ts exams.service.spec.ts`; happy: completed reference/AI DTO snapshots; failure: failed generation and duplicate idempotency key. Evidence `<attemptDir>/task-17-reference-generation-blueprint-batches.md`.
  Commit: Y | `test(exams): preserve exam API contracts`

- [x] 18. 실제 parsed corpus를 대상으로 checksum dry-run, approved fixture-DB import, manifest evidence를 실행한다.
  What to do / Must NOT do: Todo 2 preflight passes only for the approved disposable test DB, then Todo 5 importer runs all `sungjik`/`kongil` parsed files in one transaction. evidence includes source-file/accepted/rejected counts, source checksums before/after, deterministic manifest and catalog row count. No source JSON mutation or unapproved environment import.
  Parallelization: Wave 4 | Blocked by: 2, 3, 5, 17 | Blocks: 19, 20
  References (executor has NO interview context - be exhaustive): `backend/src/textbook/reference-catalog-import.service.ts`; `textbook/parsed/sungjik/**/*`; `textbook/parsed/kongil/**/*`; `backend/src/app.module.ts:72`.
  Acceptance criteria (agent-executable): approved fixture DB import commits all validated rows once; one invalid source rolls back every catalog insert; before/after source checksums match exactly.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-catalog-import.service.spec.ts`; happy: fixture-DB import manifest; failure: injected malformed source causes full rollback. Evidence `<attemptDir>/task-18-reference-generation-blueprint-batches.md`.
  Commit: Y | `feat(textbook): import immutable reference catalog`

- [x] 19. second corpus import no-op/version conflict과 catalog integrity를 검증한다.
  What to do / Must NOT do: same manifest re-import is zero insert/no-op; changed-content same logical id fails with version-conflict and leaves catalog unchanged; verify catalog counts/fingerprints against manifest. Do not silently overwrite historical sources or use per-row commits.
  Parallelization: Wave 4 | Blocked by: 5, 18 | Blocks: 20
  References (executor has NO interview context - be exhaustive): `backend/src/textbook/reference-catalog-import.service.ts`; `backend/src/entities/reference-question.entity.ts`; `backend/src/migrations/*reference*`.
  Acceptance criteria (agent-executable): repeated import is idempotent, mutated fixture conflicts, and failed batch leaves the initial successful catalog unchanged.
  QA scenarios (name the exact tool + invocation): `npm test -w backend -- --runInBand reference-catalog-import.service.spec.ts`; happy: no-op second import; failure: changed hash/version conflict with transaction rollback. Evidence `<attemptDir>/task-19-reference-generation-blueprint-batches.md`.
  Commit: Y | `test(textbook): verify catalog import idempotency`

- [x] 20. one bounded real 10-question job과 final progress report를 남긴다.
  What to do / Must NOT do: all mocked/API/import gates pass after Todo 19, then approved disposable environment에서 exactly one authenticated 10-question reference job을 run/poll. Record terminal run id, status, item count, blueprint call count, each generation batch ordinal/size/TPL, usage summary, bytes/token comparison, and DB linkage; redact credentials/prompts. Provider/schema/content failure is acceptable only when typed and leaves no partial exam.
  Parallelization: Wave 4 | Blocked by: 13, 14, 16, 17, 19 | Blocks: Final verification
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exams.controller.ts`; `backend/src/exams/exam-generation-jobs.service.ts`; `backend/src/exams/reference-frame-generation.service.ts`; `backend/src/entities/generation-run.entity.ts`; `.omo/drafts/reference-generation-blueprint-batches.md:71-73`.
  Acceptance criteria (agent-executable): exactly one job has terminal evidence; success has 10 items and one blueprint plus calculated homogeneous chunks, failure has typed status/no partial rows; evidence gives the user a concise completed/20, files, test, call/token, blocker summary.
  QA scenarios (name the exact tool + invocation): `npm run typecheck -w backend && npm run build -w backend`; happy: authenticated job completes and DB query confirms links; failure: typed provider/content failure plus zero partial rows. Evidence `<attemptDir>/task-20-reference-generation-blueprint-batches.md`.
  Commit: N | verification only

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
  What to verify: every Todo 1-20 has checkbox, evidence, focused command result, and only declared dependencies; compare actual provider calls/batch sizes/byte budget/import manifest to success criteria.
  Invocation and approval: inspect `.omo/evidence/**/task-*.md`, `git diff --name-only`, and generation-run telemetry query. Approve only when all 20 acceptance criteria have direct evidence; otherwise name the incomplete Todo/evidence.
- [x] F2. Code quality review
  What to verify: strict TypeScript contracts, transaction boundaries, migration allowlists, error handling, telemetry redaction, and no `any`/permissive model fallback in the new path.
  Invocation and approval: `npm run typecheck -w backend && npm run lint -w backend && npm run build -w backend && npm test -w backend -- --runInBand`. Approve only on zero unexpected failures and reviewed migration/reset diff.
- [x] F3. Real manual QA
  What to verify: one terminal real 10-question job is inspectable by run id; successful output has exact count, one blueprint plus calculated homogeneous chunks, auditable lineage/usage, and no displayed prompt/source secret.
  Invocation and approval: run the bounded Todo 20 job/poll/query procedure against the approved disposable environment. Approve a typed terminal provider failure only when the run audit exists and generated/session/item rows remain zero.
- [x] F4. Scope fidelity
  What to verify: no frontend, parsed JSON, explicit AI behavior, unrelated user/admin data, full DB reset, source resend in Step 2, or partial generation artifact changed.
  Invocation and approval: `git diff --check`, `git diff --name-only`, reset allowlist query, parsed-source before/after checksums, and sourceType route specs. Approve only if all boundaries are demonstrably preserved.

## Commit strategy
- Keep each completed Todo as a small dependency-ordered commit; do not bundle unrelated dirty-worktree changes.
- Before commits for Todos 2, 3, 4, and 18, inspect the migration/reset diff for generation-table allowlist and environment guards.
- Evidence and temporary manifests may be retained under `.omo/evidence/`; never commit provider credentials, prompt payloads, or parsed-source copies.

## Success criteria
- The approved reset touches only generation tables after environment/backup/confirmation preflight; user/admin and unrelated exam data remain intact.
- A catalog source is immutable, fingerprinted, provenance-traceable, imported atomically, and second import is a no-op.
- Server allocation is deterministic and complete before Step 1; Step 1 cannot alter source/concept/axis/TPL assignments.
- Every Step-2 request is one-TPL and 1-5 slots, with source content excluded; all output is mapped by exact slotId coverage.
- A completed exam persists atomically with audited run/usage metadata; failed/retried work never creates a partial exam or double-counted usage.
- Controlled ten-slot proof makes 1 blueprint + 2 generation calls; parsed corpus proof makes 1 + homogeneous chunk count without falsely promising two batches.
- Measured 10/20-item input bytes meet `<=50%` baseline and total tokens meet `<=70%` when provider usage is supplied; otherwise the unavailable state is explicit.
- All focused tests, backend typecheck/lint/build, import integrity checks, and one bounded real job have recorded evidence.
