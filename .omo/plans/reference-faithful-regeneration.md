# reference-faithful-regeneration - Work Plan

## TL;DR (For humans)

`sourceType: 'reference'`를 형식 중심의 신규 문항 생성에서 **원문 충실 변형**으로 바꾼다. 최종 모델은 원문과 명시적 충실도 계약을 함께 받고, 원문 개념·판단 절차·자료 구조·정답/오답 논리·난이도 밀도를 유지한 채 가까운 패러프레이즈를 만든다. 결정론적 검증과 별도 구조화 semantic verifier가 이를 원문과 대조하고, 실패 사유를 재생성 프롬프트에 되돌린다.

원문을 최종 프롬프트에서 제거하는 현재 테스트 계약은 의도적으로 폐기한다. 일반 AI 생성은 바꾸지 않으며, format-only 모드·프론트 UX 변경·기존 생성문항의 일괄 재생성은 포함하지 않는다.

**위험:** 원문 충실도와 무단 복제는 긴장 관계다. 기본 정책은 원문 개념·전문 용어·템플릿 레이블은 허용하되, 허용 목록 밖의 정규화된 24자 이상 연속 원문 구절 및 원문 전체 문장은 거절한다. 의미 동등성은 결정론적 검사만으로 증명할 수 없으므로, 구조화된 verifier 판정을 추가한다.

**결정:** `reference` 경로를 충실 변형만으로 교체; 가까운 패러프레이즈 허용; TDD.

## Scope

### In
- 참조 선택 후의 source-fidelity contract 추출·캐싱·버전 무효화
- 원문 개념을 기본 target으로 고정하는 payload/selection 계약
- 최종 생성 프롬프트, 출력 schema, 보정 재시도, batch/singleton 처리
- 텍스트 중복·자료 밀도·자료 형식·선지/정답 구조의 결정론적 검증
- source와 생성문을 대조하는 구조화 semantic verifier와 결과 lineage 저장
- 단위·통합·live QA fixture 및 회귀 계약

### Out
- `sourceType: 'ai'` 파이프라인 및 일반 시험 API의 변경
- 별도 format-only / concept-transfer API 모드
- 프론트엔드 옵션·표시 변경
- 기존 `Question` 행의 backfill 또는 재생성
- 원문 카탈로그 import 형식의 변경

## Verification strategy

TDD를 사용한다. 각 구현 작업은 아래 명시된 Jest 테스트를 먼저 실패시키고, 해당 테스트와 관련 회귀 스위트를 실행해 green을 확인한 뒤에만 다음 작업으로 진행한다.

- 빠른 계약 QA: `npm test -- --runInBand <spec files>`
- 타입/정적 QA: `npm run typecheck && npm run lint`
- 종단 QA: `npm test -- --runInBand reference-frame-generation.integration.spec.ts exam-regenerator.reference-variant.spec.ts`
- live QA: 기존 `npm run test:reference-live`를 source/variant/verdict artifact를 기록하도록 확장하고, API 키가 없을 때는 명시적으로 skip한다. mock 통과를 live 품질 증거로 취급하지 않는다.

필수 fixture는 서로 다른 세 유형을 포함한다: 조합형 표/조건·예외형 문서/일반 단일선택 사례. 각 fixture는 원문, 기대 source contract, 허용 전문용어, 금지 복사 구절, 생성 출력, verifier 판정 근거를 함께 가진다.

## Execution strategy

1. 원문에서 보존해야 할 것을 타입화한 `ReferenceFidelitySpec`을 만들고, 기존 frame/payload가 이를 참조하도록 한다.
2. 선택·계획 과정에서 원문 개념을 새 개념으로 바꾸는 현재 기본 동작을 제거한다.
3. 최종 생성 및 검증을 source-aware contract로 교체하고, 실패 원인을 재시도 입력으로 전달한다.
4. lineage에 source contract와 각 검증 영수증을 남겨 실제 결과를 추적 가능하게 만든다.
5. fixture·통합·live QA로 “원문 문자열을 빼는” 구 계약이 다시 살아나지 않게 고정한다.

의존성: 1 → 2 → 3 → 4 → 5. 새 DB 컬럼은 만들지 않는다. `generation_lineage` JSONB의 타입/내용만 확장한다.

## Todos

- [x] 1. Establish source-faithful regression fixtures and retire source-free expectations
  - **References:** `backend/src/exams/exam-regenerator.reference-variant.spec.ts:629-751`, `backend/src/exams/reference-frame-generation.integration.spec.ts:110-224`, `backend/src/exams/reference-frame-generation.service.spec.ts:139-228`, `backend/package.json:20-28`.
  - **Implementation:** Before changing production behavior, replace the two source-free assertions with failing tests that require the final prompt to carry the selected reference and an explicit fidelity contract. Add three named fixtures—combination table, document with condition/exception, and single-selection case—with source text, canonical concepts, expected truth topology, density bounds, allowed technical terms, and prohibited verbatim spans. Keep all model calls mocked in unit/integration tests.
  - **Acceptance:** A source token is observable only in the explicitly designated `referenceSource` prompt field; the test must prove the reference is not silently spread into unrelated trace fields. Tests fail against the current source-free prompt and can distinguish all three fixture classes.
  - **QA happy:** `npm test -- --runInBand exam-regenerator.reference-variant.spec.ts reference-frame-generation.integration.spec.ts` records failures specifically because `referenceSource`/contract are absent.
  - **QA failure:** Fixture whose output has the right TPL but omits a source condition must be represented as an expected future rejection, not accepted as a valid baseline.
  - **Commit:** `test(reference): define faithful-variant regression fixtures`

- [x] 2. Define and extract a versioned source-fidelity contract from each selected reference
  - **References:** `backend/src/exams/reference-frame.types.ts:170-397`, `backend/src/exams/reference-frame-planner.prompts.ts:12-94`, `backend/src/exams/reference-frame-planner.service.ts:90-195`, `backend/src/exams/reference-frame.provider-schemas.ts`, `backend/src/exams/reference-frame-generation.service.ts:239-342`.
  - **Implementation:** Add a small, dedicated `reference-fidelity-spec` type/parser/validator module rather than expanding the already broad frame type indiscriminately. Its contract must contain: source identity and displayed source fields; canonical source concept IDs/labels; material/template schema; normalized density bounds; ordered facts; condition/exception/comparison relations; reasoning steps; option verdict and distractor roles; allowed terminology; and source text spans eligible for the close-paraphrase copy policy. Add a structured planner stage that derives this contract from the selected source, validate every ID/relation/cardinality deterministically, and fail with a typed planner reason when it is incomplete. Version the contract and invalidate/rebuild stale frame caches when its version changes.
  - **Acceptance:** No contract can be created without the exact selected source identity, all view/choice topology, one canonical target concept, and a complete relation/option mapping. Cached frames lacking the contract version or a matching source hash are not reused.
  - **QA happy:** Add red/green unit cases for all three fixtures, asserting exact source identity, relation ordering, density limits, and option mappings after parse/validation.
  - **QA failure:** Reject stale source hashes, unknown concept IDs, duplicate fact IDs, cyclic/unknown relations, incomplete option maps, and cache entries from the prior contract version.
  - **Commit:** `feat(reference): add versioned source fidelity contract`

- [x] 3. Preserve canonical source concepts through selection and concept payload planning
  - **References:** `backend/src/exams/reference-frame-generation.service.ts:165-347`, `backend/src/exams/reference-selector.service.ts:35-127`, `backend/src/exams/reference-frame-planner.prompts.ts:49-93`, `backend/src/exams/reference-frame.payload-validator.ts`, `backend/src/exams/reference-concept-catalog-resolver.ts`.
  - **Implementation:** Replace the default `forbiddenReferenceConcepts` rule with a source-concept resolution step: map the selected reference’s canonical target concept to the in-range catalog ID, make it the single payload target, and permit only source-supported concepts as supporting concepts. Keep caller-provided `targetConcepts` as an eligibility filter: reject the reference with a typed shortfall reason when it excludes the source target instead of silently substituting another concept. Remove index/modulo concept assignment for the faithful path. Payload novelty rules may alter facts, names, dates, and situations, but must not alter the resolved concept or decision rule.
  - **Acceptance:** A generated faithful variant has the selected source target as `payload.targetConceptIds[0]`; it cannot switch to an unrelated requested concept. Source concepts that cannot be resolved or fall outside the requested range fail before a model generation call.
  - **QA happy:** Extend selector/planner tests to prove source target preservation for each fixture and that matching caller filters pass.
  - **QA failure:** Assert `CONCEPT_NOT_CANONICAL`/new explicit source-concept rejection for unknown, out-of-range, and caller-excluded source targets; assert the final-generation client is never called.
  - **Commit:** `fix(reference): preserve source concepts in faithful variants`

- [x] 4. Make final generation source-aware while enforcing the close-paraphrase contract
  - **References:** `backend/src/exams/exam-regenerator.service.ts:80-154`, `backend/src/exams/exam-regenerator.service.ts:427-683`, `backend/src/exams/reference-final-output-schema.ts`, `backend/src/exams/tpl-schemas.ts`, `backend/src/exams/reference-variant-repair.ts`.
  - **Implementation:** Extend `ReferenceVariantGenerationRequest` with the validated fidelity contract. Replace the source-free `archetypeProjection`-only prompt with an explicit `referenceSource`, `fidelityContract`, and `transformationPolicy`. The policy must require preservation of source decision relations, claim truth values, response/option topology, material schema, and density bounds; permit close paraphrase and source terminology; require changed incidental names/dates/situations where not part of the rule; and prohibit source-sentence copying. Extend the strict output schema with machine-readable source-to-output evidence IDs sufficient for validation, never raw free-form self-certification. Keep source context within the designated prompt object and continue to prohibit a plain-text fallback.
  - **Acceptance:** The final prompt contains the full selected source plus contract exactly once per variant, preserves batch ordering, and tells the model which fields may differ. The output schema makes missing source-evidence fields impossible for singleton schema mode and parser-invalid for batch mode.
  - **QA happy:** Prompt snapshots for all three fixtures assert source, relation IDs, density limits, transformation policy, and selected TPL; successful structured output preserves valid rendering through `StimulusNormalizer`.
  - **QA failure:** Missing/unknown evidence IDs, source/contract hash mismatch, wrong template, changed response topology, or a batch item count mismatch must reject without persistence. Keep bounded correction retries only for singleton requests.
  - **Commit:** `feat(reference): generate source-aware faithful variants`

- [x] 5. Add deterministic fidelity and copy-overlap gates plus a bounded semantic verdict
  - **References:** `backend/src/exams/reference-generation-output-validator.ts:25-172`, `backend/src/exams/exam-regenerator.service.ts:696-874`, `backend/src/exams/reference-variant-repair.ts:40-59`, `backend/src/exams/stimulus-normalizer.ts`.
  - **Implementation:** Split validation into focused modules. (a) A deterministic fidelity validator must compare rendered output/evidence to the source contract for TPL/material schema, view/choice cardinality, condition/exception/reasoning IDs, truth vector, distractor role coverage, and density lower/upper bounds. (b) A normalized-copy validator must allow declared canonical concepts/template labels but reject any non-allowed normalized contiguous source substring of 24+ characters and any complete source sentence/view-item/choice copied verbatim. (c) A `ReferenceVariantSemanticVerifier` must receive source, contract, and candidate output, return a strict accept/reject JSON reason code, and be limited to one verification request plus one corrective final-generation retry. Treat unavailable/malformed/negative verifier output as rejection, never as success. Feed the most specific deterministic or semantic failure into `referenceValidationCorrection` without echoing unrestricted source text.
  - **Acceptance:** Passing an LLM-provided fidelity trace alone is insufficient. A candidate persists only when deterministic checks, renderability, copy policy, and semantic verifier all accept. Existing format/schema retry limits remain bounded and timeouts use the configured OpenAI timeout.
  - **QA happy:** Unit tests accept close paraphrases with allowed terminology while proving equivalent truth/condition structure and density. Mocked verifier acceptance permits exactly one saved result.
  - **QA failure:** Test omitted exception, inverted verdict, absent distractor role, undersized stimulus, 24-character unapproved overlap, copied full source sentence, malformed verifier JSON, verifier rejection, timeout, and retry exhaustion. Each must leave the result array empty and expose the typed correction reason.
  - **Commit:** `feat(reference): enforce source-to-variant fidelity gates`

- [x] 6. Persist auditable fidelity receipts and wire the end-to-end failure surface
  - **References:** `backend/src/exams/reference-frame.types.ts:389-397`, `backend/src/entities/question.entity.ts:71-77`, `backend/src/exams/reference-frame-generation.service.ts:320-380`, `backend/src/exams/exams.service.ts:462-575`, `backend/src/exams/exam-generation-jobs.service.ts:13-138`.
  - **Implementation:** Extend the TypeScript shape stored in existing `Question.generationLineage` JSONB with fidelity-contract version/hash, deterministic check summary, semantic verifier model/verdict/reason, copy-policy result, and retry count. Never store raw prompt completions or duplicate source display text in lineage. Map source-fidelity failure into explicit `REFERENCE_FIDELITY_REJECTED`/shortfall responses so synchronous and job callers retain useful structured errors; preserve existing exact-count transactional behavior and do not add a table migration.
  - **Acceptance:** Every saved reference question has a passed contract/version/receipt tied to its source hash. Failed candidates create neither `Question` nor `ExamItem`; an exam with fewer than requested valid variants still rolls back as today.
  - **QA happy:** Persistence tests assert the complete non-sensitive receipt is saved and can be read through the existing exam flow.
  - **QA failure:** Simulate a mixed batch where one semantic verdict fails and assert no partial exam/question persistence, accurate failure code, and job logs do not contain raw source prose.
  - **Commit:** `feat(reference): persist faithful-generation validation receipts`

- [~] 7. Complete integration, live-quality, and regression coverage for faithful variants
  - **References:** `backend/src/exams/reference-frame-generation.integration.spec.ts`, `backend/src/exams/reference-generation-usage.spec.ts`, `backend/src/exams/reference-generation-persistence.spec.ts`, `backend/scripts/reference-live-qa.ts`, `backend/package.json:20-28`.
  - **Implementation:** Update integration mocks to model analyzer, final generator, and semantic verifier separately; assert contract propagation from selected catalog source to persisted lineage. Update the live QA script to emit a redacted JSON/Markdown artifact under the existing evidence convention containing fixture ID, source hash, output hash, deterministic checks, overlap result, verifier verdict, model IDs, and pass/fail reason—never raw source text. Remove all tests whose success criterion is that source display text is absent from final generation.
  - **Acceptance:** The focused reference suite, full Jest suite, typecheck, and lint pass. Live QA either produces one verifiable artifact per fixture or reports a deliberate credentials/configuration skip; it must not report a mock run as live success.
  - **QA happy:** Run `npm test -- --runInBand exam-regenerator.reference-variant.spec.ts reference-frame-generation.integration.spec.ts reference-generation-persistence.spec.ts`, then `npm run typecheck && npm run lint`; with credentials, run `npm run test:reference-live` and inspect the redacted artifacts.
  - **QA failure:** Deliberately feed each fixture a source-free prompt, cross-concept payload, condition-loss variant, and over-copy variant; every case must fail at its intended layer with no persistence.
  - **Commit:** `test(reference): prove faithful variant quality end to end`

## Final verification wave

- [~] F1. Plan-compliance audit (blocked: repository worktree contains unrelated frontend, AI-path, migration, and import/reset changes that require owner/scope separation)
  - Confirm every in-scope module from the todos changed only as specified; verify no `sourceType: ai` behavior, format-only endpoint, frontend flow, migration, or bulk backfill was introduced.
  - Evidence: `git diff --check`, changed-file list, and focused test command outputs saved with the delivery notes.

- [~] F2. Code-quality and type-contract audit (blocked: pre-existing repository-wide lint errors outside this work)
  - Run `npm run typecheck && npm run lint`; inspect discriminated reject reasons, timeout cleanup, no `any`/unsafe casts at the new trust boundaries, cache-version invalidation, and absence of raw source text in logs/lineage.
  - Evidence: command output and reviewer notes naming the source-fidelity modules.

- [~] F3. Real reference-variant QA (blocked: REFERENCE_LIVE_QA=1 is not configured)
  - Execute `npm run test:reference-live` with configured credentials against all three fixtures. Manually inspect only the redacted artifact plus rendered outputs in the authorized environment: each must retain the source decision path/difficulty while satisfying the overlap policy.
  - Evidence: one artifact per fixture with source/output hashes, deterministic pass summary, verifier verdict, and no credential/raw-source leakage. If credentials are unavailable, report this verifier as blocked rather than passed.

- [x] F4. Scope-fidelity and persistence audit
  - Create one valid and one intentionally rejected reference exam through both synchronous and job paths; verify the valid question lineage receipt is complete and the rejected path leaves no partial database rows.
  - Evidence: integration-test output plus DB/test-repository assertions for `Question`, `ExamItem`, job error, and lineage JSON.

## Commit strategy

Keep commits behaviorally atomic and in the todo order: fixtures; source contract; source-concept preservation; source-aware generation; fidelity gates; lineage/persistence; integration/live QA. Do not mix generated live artifacts, credentials, or unrelated working-tree changes into commits.

## Success criteria

1. `sourceType: 'reference'` final generation receives the selected source and a validated fidelity contract; no source-free final-generation path remains.
2. A faithful variant retains the source target concept, decision relations, response topology, truth vector, distractor roles, material schema, and density bounds.
3. Close paraphrase is accepted, while an unapproved 24+ normalized-character overlap or complete copied source sentence/view-item/choice is rejected.
4. Schema/renderability checks, deterministic fidelity checks, copy policy, and semantic verifier verdict are all required before persistence.
5. Every persisted reference question contains a non-sensitive passed receipt tied to the source hash; failed candidates never create partial exams.
6. Focused Jest, full applicable Jest, typecheck, lint, and credentialed live QA all provide reproducible evidence.
