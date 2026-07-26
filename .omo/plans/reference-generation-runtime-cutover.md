# reference-generation-runtime-cutover - Work Plan
## TL;DR (For humans)
`sourceType=reference`의 기존 frontend 요청과 job polling 계약은 그대로 둔 채, backend의 legacy `ReferenceFrameGenerationService` runtime dispatch를 catalog-backed blueprint/batch orchestration으로 교체한다. 새 runtime은 catalog row를 typed selection input으로 적응시키고, capacity를 먼저 검사한 뒤 blueprint와 TPL당 최대 5개 batch를 생성, mocked provider 결과를 검증 및 집계하고, 성공 exam을 하나의 transaction으로 materialize한다.

실제 OpenAI/provider 호출, disposable DB manual job, corpus re-import, browser E2E는 수행하지 않는다. 대신 deterministic catalog/provider fixtures를 사용한 backend Jest contract/integration tests로 frontend-visible API contracts를 고정한다. 위험은 new runtime이 아직 존재하지 않고 catalog payload가 `Record<string, unknown>`이라는 점이며, malformed/shortfall output을 typed failure로 처리하고 partial exam을 rollback하는 것으로 통제한다.

## Scope
**In**
- `sourceType: 'reference'`와 생략된 `sourceType`을 new reference runtime으로 route한다.
- synchronous `POST /exams`와 async generation job 모두 동일 orchestration path를 사용한다.
- catalog payload adaptation, selection/capacity guard, blueprint/batch execution, output validation, transaction-backed persistence, job audit를 연결한다.
- existing frontend create request, polling terminal status, `examId`, and completed exam retrieval contracts를 backend contract tests로 보존한다.

**Out / Must NOT have**
- frontend UI, request DTO, polling status literals, or `sourceType` default semantics 변경.
- real provider call, real generation job, browser E2E, corpus re-import.
- `sourceType: 'ai'` routing 또는 `ExamGeneratorService` behavior 변경.
- failure path에서 partially materialized `Exam` 또는 `ExamItem` 남김.

## Verification strategy
TDD. Production provider를 호출하지 않는 deterministic mock interface와 in-memory catalog fixture를 사용한다. 각 todo는 focused Jest happy/failure assertions를 먼저 추가하거나 확장한다. 완료 전 `npm run typecheck -w backend`, `npm run build -w backend`, changed-spec Jest command, and `git diff --check`를 실행한다. 실제 provider, DB manual job, browser E2E는 의도적으로 실행하지 않는다.

## Execution strategy
1. Catalog row를 selector-compatible typed reference로 바꾸는 boundary와 typed failure를 확정한다.
2. Existing planner/allocator/batch builder/validator를 하나의 injectable runtime orchestration service로 연결한다.
3. `ExamsService`의 sync/job runtime dispatch와 persistence transaction을 새 service에 연결한다.
4. Frontend-visible compatibility contracts를 backend tests로 lock하고 final automated verification을 수행한다.

## Todos
- [ ] 1. Define the catalog-to-reference adapter and selection failure contract
  References: `backend/src/entities/reference-question.entity.ts:34` (`sourcePayload`); `backend/src/exams/reference-selector.service.ts:48` (selector input); `backend/src/exams/reference-slot-allocator.service.ts`; existing catalog import shapes in `backend/src/textbook/reference-catalog-import.service.ts`.
  Implementation: Add a typed adapter at the reference-generation boundary that accepts `ReferenceQuestion` rows, validates unit/source identity/stem/choices/concepts needed by selection, and returns either selector-ready references or the existing typed shortfall/invalid-reference diagnostic. Exclude malformed rows from availability; do not mutate catalog data or re-import it.
  Acceptance: Valid in-range rows preserve stable source identity and are eligible; malformed rows are recorded as invalid, not sent to planner/provider; an all-invalid or insufficient selection produces a typed failure before generation.
  QA: Happy - focused Jest fixture maps valid catalog rows and confirms exact requested references. Failure - malformed payload and insufficient capacity return typed diagnostic and assert planner/provider mock call count is zero. Evidence: `backend/src/exams/reference-catalog-adapter.spec.ts`.
  Commit: `feat(exams): adapt catalog references for runtime generation`

- [ ] 2. Build one injectable catalog-backed reference orchestration service
  References: `backend/src/exams/reference-blueprint-planner.service.ts:30`; `backend/src/exams/reference-slot-allocator.service.ts`; `backend/src/exams/reference-generation-batch-builder.ts:5`; `backend/src/exams/reference-generation-output-validator.ts`; `backend/src/exams/reference-frame-generation.service.ts` (legacy behavior to replace at runtime); `backend/src/exams/exams.module.ts:40`.
  Implementation: Add a single `ReferenceGenerationOrchestrator` provider that queries eligible catalog rows, invokes adapter/selector/allocator, produces one blueprint, partitions slots into batches of at most five TPLs, dispatches through an injectable generation-client interface, parses and validates each response, and returns ordered persistence-ready drafts. Register its dependencies in `ExamsModule`; leave the legacy service intact but unused by reference runtime dispatch.
  Acceptance: A 10-question fixture produces one blueprint and no batch exceeding five TPLs; aggregate output has exactly the requested count and deterministic ordering; orchestration returns typed capacity/model/validation failure without a partial draft set.
  QA: Happy - mock planner/client return valid batch outputs and assert blueprint count 1, batch TPL counts <=5, and 10 ordered drafts. Failure - invalid blueprint, malformed batch response, or one rejected batch returns the mapped terminal failure and no partial result. Evidence: `backend/src/exams/reference-generation-orchestrator.spec.ts`.
  Commit: `feat(exams): orchestrate catalog-backed reference generation`

- [ ] 3. Make provider, parser, and failure mapping explicit and mockable
  References: `backend/src/exams/reference-frame-planner.service.ts` (client/dependency pattern); `backend/src/exams/reference-generation-batch-builder.ts`; `backend/src/exams/reference-generation-output-validator.ts`; typed diagnostic declarations under `backend/src/exams/`.
  Implementation: Define the narrow runtime generation-client port and batch response parser used only by the new orchestrator. Adapt the production-capable model client through this port, map timeout/refusal/malformed/invalid outputs to stable typed generation errors, and ensure retries follow the existing service's configured policy rather than adding a new public setting.
  Acceptance: The orchestrator has no direct SDK dependency; each provider terminal condition maps to a deterministic typed error; parser validation occurs before persistence-ready drafts are exposed.
  QA: Happy - mock client returns canonical valid payload and parser returns validated drafts. Failure - timeout, refusal, invalid JSON, schema-invalid question, and duplicate/incorrect slot response each assert the intended error code and no drafts. Evidence: `backend/src/exams/reference-generation-client.spec.ts`.
  Commit: `feat(exams): isolate reference batch provider boundary`

- [ ] 4. Route both reference entry points through the shared orchestrator
  References: `backend/src/exams/exams.service.ts:88` (`create`); `backend/src/exams/exams.service.ts:146` (`createJob`); `backend/src/exams/exams.service.ts:457` (`createReferenceFrameExam`); `backend/src/exams/exams.service.ts:572` (`createWithProgress`); `backend/src/exams/exams.controller.ts`; `frontend/components/exam/CreateExamModal/index.tsx:45`; `frontend/features/exam-generation/model/useJobPolling.ts:17`.
  Implementation: Replace only the legacy reference-generation invocation in `ExamsService` with the shared orchestrator. Preserve the compatibility rule that explicit `'reference'` and omitted `sourceType` select reference generation, while explicit `'ai'` continues to call only `ExamGeneratorService`. Feed existing progress reporting through orchestration without changing initial or polling response DTO fields.
  Acceptance: sync and job-backed reference requests share the same runtime service; omitted `sourceType` remains reference; explicit AI cannot invoke the new reference service; controller routes and frontend request payload need no changes.
  QA: Happy - service/controller tests verify explicit and omitted reference requests call orchestrator and retain initial `jobId/status/progress/stage/message`. Failure - AI request asserts orchestrator was never called and existing AI generator was called. Evidence: `backend/src/exams/exams.service.spec.ts`, `backend/src/exams/exams.controller.spec.ts`.
  Commit: `refactor(exams): route reference requests through orchestrator`

- [ ] 5. Materialize successful reference exams atomically and preserve audit state
  References: `backend/src/exams/exams.service.ts:479` (legacy transaction); `backend/src/exams/reference-generation-persistence.ts:12`; `backend/src/exams/exam-generation-jobs.service.ts:98`; generation-run entities/migrations under `backend/src/entities` and `backend/src/migrations`.
  Implementation: Make the existing exam transaction owner persist units/questions/exam/items from only fully validated orchestrator drafts, then create/update generation-run audit data for started/completed/failed terminal states. Integrate `ReferenceGenerationPersistence` staging guard into that transaction boundary or replace it with an equivalent transaction-aware adapter. Preserve job completion state names and `examId` behavior.
  Acceptance: success creates one exam with exactly requested ordered items and linked completed run; every orchestration failure marks the job/run failed, never calls completion, and commits neither a completed exam nor exam items.
  QA: Happy - transaction mock/integration fixture asserts 10 persisted ordered items, completed run metadata, `status='completed'`, `progress=100`, `stage='completed'`, and `examId`. Failure - force batch validation/persistence exception and assert rollback/no persisted exam items plus failed job/run. Evidence: `backend/src/exams/reference-generation-persistence.spec.ts`, `backend/src/exams/exams.service.spec.ts`.
  Commit: `feat(exams): atomically persist reference generation runs`

- [ ] 6. Lock frontend-visible job and completed-exam contracts with backend fixtures
  References: `backend/src/exams/exam-generation-jobs.service.ts:98`; `backend/src/exams/exams.service.ts:174` (`getJob`), `:220` (`findOne`), `:389` (`getResult`); `frontend/features/exam-generation/model/useJobPolling.ts:17`; `frontend/components/exam/CreateExamModal/index.tsx:75`.
  Implementation: Add fixture-based API/service contract assertions for initial queued job, completed job, `findOne` rendered exam, and scored result only where reference generation affects them. Keep names/status literals/field presence structurally compatible; do not introduce frontend tests or client changes because no frontend test harness exists.
  Acceptance: polling-compatible terminal job includes `examId`; completed reference exam remains readable through existing endpoint shape; result endpoint behavior is unchanged; reference provenance is available only through existing supported fields.
  QA: Happy - assert exact job terminal fields and structural snapshots for `getJob` and `findOne` after mocked successful reference generation. Failure - failed job snapshot has no `examId`, and `findOne` cannot retrieve a materialized exam for the failed path. Evidence: `backend/src/exams/exams.controller.spec.ts` and/or a new `backend/src/exams/reference-generation-contract.spec.ts`.
  Commit: `test(exams): lock reference generation frontend contracts`

- [ ] 7. Remove dead runtime wiring and document the migration boundary in code tests
  References: `backend/src/exams/exams.module.ts`; `backend/src/exams/reference-frame-generation.service.ts`; callers of `ReferenceFrameGenerationService` from codegraph; `backend/src/exams/reference-generation-blueprint.integration.spec.ts:23`.
  Implementation: After all new-path tests pass, remove only legacy provider injection/constructor dependencies that are no longer reachable from reference runtime. Retain legacy planner/service code only if another supported call site remains; otherwise delete it together with obsolete tests. Do not change public routes, DTOs, frontend code, catalog schema, or historical data.
  Acceptance: no reference runtime production call site reaches `ReferenceFrameGenerationService.generate`; module dependency injection is valid; isolated blueprint/batch tests retain coverage of lower-level utilities.
  QA: Happy - codegraph caller check and focused Jest suite confirm new service is the sole reference runtime path. Failure - dependency-injection test/bootstrap catches any missing provider after removal. Evidence: `backend/src/exams/exams.module.ts`, Jest output saved under `.omo/evidence/reference-generation-runtime-cutover/`.
  Commit: `refactor(exams): retire legacy reference runtime wiring`

## Final verification wave
- [ ] F1. Run reference runtime focused Jest verification
  References: all specs added/modified by Todos 1-7.
  Acceptance: Run `npm run test -w backend -- --runInBand reference-catalog-adapter.spec.ts reference-generation-orchestrator.spec.ts reference-generation-client.spec.ts reference-generation-persistence.spec.ts reference-generation-contract.spec.ts exams.service.spec.ts exams.controller.spec.ts`; every test passes with no real provider call. Omit a listed new spec only if its assertions were deliberately merged into an existing named spec, and record that mapping in the evidence file.
  QA: Happy - all requested-count, route, job completion, and materialization assertions pass. Failure - force one shortfall/invalid batch test and confirm it remains covered. Evidence: `.omo/evidence/reference-generation-runtime-cutover/f1-focused-jest.txt`.

- [ ] F2. Run backend static and build validation
  References: `backend/package.json` scripts.
  Acceptance: `npm run typecheck -w backend`, `npm run build -w backend`, and `git diff --check` exit zero.
  QA: Happy - commands exit zero. Failure - verification must fail the wave on compiler/build/diff error rather than accepting a partial result. Evidence: `.omo/evidence/reference-generation-runtime-cutover/f2-static-build.txt`.

- [ ] F3. Audit frontend compatibility without browser execution
  References: `frontend/components/exam/CreateExamModal/index.tsx`; `frontend/features/exam-generation/model/useJobPolling.ts`; contract specs from Todo 6.
  Acceptance: Confirm no frontend source change is required and backend fixtures cover omitted `sourceType`, initial job, terminal completed job with `examId`, failed job without `examId`, and completed-exam retrieval shape.
  QA: Happy - contract assertions pass. Failure - an intentional contract-field mismatch must fail the contract spec. Evidence: `.omo/evidence/reference-generation-runtime-cutover/f3-frontend-contract.txt`.

- [ ] F4. Verify scope fidelity and the intentional real-test exclusion
  References: this plan Scope and Verification strategy; changed-files list.
  Acceptance: Confirm changed files are limited to backend runtime/tests and supporting migration artifacts; no frontend UI/API changes, real provider calls, corpus import, manual DB job, or browser E2E were run.
  QA: Happy - changed-file and command evidence match scope. Failure - any out-of-scope change or real-job command blocks completion until removed or explicitly approved. Evidence: `.omo/evidence/reference-generation-runtime-cutover/f4-scope-audit.txt`.

## Commit strategy
1. `feat(exams): adapt catalog references for runtime generation`
2. `feat(exams): orchestrate catalog-backed reference generation`
3. `feat(exams): isolate reference batch provider boundary`
4. `refactor(exams): route reference requests through orchestrator`
5. `feat(exams): atomically persist reference generation runs`
6. `test(exams): lock reference generation frontend contracts`
7. `refactor(exams): retire legacy reference runtime wiring`

## Success criteria
- Existing frontend reference generation flow works against unchanged request and polling contracts once backend implementation is executed.
- Explicit and omitted reference source types use the new catalog-backed runtime; AI uses only the existing AI generator.
- A mock-backed 10-question request generates one blueprint, batches at most five TPLs each, validates all output, and atomically returns a completed exam/job with `examId`.
- Capacity, malformed catalog payload, planner/client, validation, and persistence failures leave no partial exam artifacts and retain typed terminal diagnostics/audit state.
- All planned tests/static checks pass without real provider, real job, browser E2E, or corpus import execution.
