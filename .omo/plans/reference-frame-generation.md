# reference-frame-generation - Work Plan

## TL;DR (For humans)

**What you'll get:** 선택 단원 안의 기출 문체와 자료 밀도를 유지하면서도, 새 개념과 새 오답 축으로 문항을 만드는 기본 생성 경로를 제공합니다. 자료 형식은 새 판단 구조에 맞춰 자동으로 다시 고르고, 원문 복제와 단원 범위 이탈은 생성 전에 차단합니다.

**Why this approach:** 성직·공일 기출의 다수가 직접 자료 해석형이라 DNA의 다중 근거 조건을 기본 규칙으로 쓰면 기출다움을 잃습니다. 따라서 기출에서는 외형과 난이도만 가져오고, 새 개념·오답 축·TPL은 선택 단원 안에서 별도로 설계합니다.

**What it will NOT do:** 기존 기출의 문장, 수치, 사례 또는 오답 논리를 재사용하지 않습니다.

선택한 단원 범위를 벗어난 개념을 섞지 않으며, 명시적으로 `sourceType: "ai"`를 보낸 기존 일반 AI 경로도 바꾸지 않습니다.

**Effort:** Large
**Risk:** High - 생성 기본 경로와 OpenAI 계약, 정답 검증, 저장 전 검증을 함께 바꾸므로 실패 시 생성 수량과 품질에 직접 영향을 줍니다.
**Decisions to sanity-check:** `sourceType` 미지정 요청의 기본값은 Reference Frame 생성이고, 일반 AI 생성은 `sourceType: "ai"`로만 호출합니다. 모든 개념 재조합은 선택 단원 범위에 한정합니다.

Your next move: `/start-work`로 이 계획을 실행합니다. Full execution detail follows below.

---

> TL;DR (machine): Large, high-risk backend pipeline migration: default reference-frame generation with unit-scoped concepts, payload-selected TPL, anti-copy validation, and explicit-AI compatibility.

## Scope
### Must have
- `sourceType` 미지정 요청을 Reference Frame 생성으로 라우팅하고, 명시적 `sourceType: "ai"`만 기존 일반 AI 생성으로 유지한다.
- 선택 단원 범위에서만 참조 문항, 개념, 오답 축을 선택하는 결정적 선택기를 구현한다.
- 기출의 외형만 보존하는 `ReferenceFrame`과 새 개념·보기 진위·오답 축을 정의하는 `ConceptPayload`를 타입과 JSON 계약으로 구현한다.
- Payload의 정보 구조를 기준으로 표준 9개 TPL 중 하나를 고르고, TPL JSON을 생성·변환·검증한다.
- reference 경로에서 DNA 계약 주입과 DNA 기반 TPL 강제를 제거한다.
- 단원 범위, 정답 유일성, 자료-보기 정합성, Frame 충실도, TPL 렌더 가능성, 원문 및 생성 문항과의 과도한 문구 중복을 저장 전에 차단한다.
- 참조 출처·Frame·Payload·검증 결과를 생성 문항의 기존 메타데이터 경로에 보존해 실패 원인을 추적할 수 있게 한다.
- TDD 단위 테스트와 OpenAI 모킹 통합 테스트, 전체 백엔드 검증을 추가한다.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- 기존 parsed 기출 코퍼스를 재파싱하거나 대량 수정하지 않는다.
- 모든 문항에 DNA식 다중 근거 또는 반사실 증명 요건을 강제하지 않는다.
- DNA v2 실험 코드 자체를 삭제하지 않는다. 다만 기본 reference 경로에서는 읽거나 전달하지 않는다.
- 선택 단원 밖의 개념, 오답 축, 교과 지식을 사용하지 않는다.
- 원문 이름·날짜·수치·사례·특징 문장을 복사하거나 근접 재서술하지 않는다.
- `sourceType: "ai"`의 기존 일반 AI 생성 동작과 UI를 개편하지 않는다.
- TPL 불일치 또는 `TPL_PLAIN_TEXT` 폴백을 유효한 reference variant로 저장하지 않는다.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Jest/ts-jest, Nest service mocks, deterministic pure-function tests
- Evidence: <attemptDir>/task-<N>-reference-frame-generation.<ext> (attemptDir = currentAttemptDir from `omo ulw-loop status --json`, `.omo/evidence/ulw/<session>/<goalId>/a<attempt>`; outside ulw-loop use `.omo/evidence/`)
- 모든 새 순수 선택·매핑·검증 함수는 실패 테스트를 먼저 작성한다. OpenAI 호출은 실제 네트워크 대신 응답 fixture와 실패·재시도 fixture로 검증한다.
- 검증 명령: `npm run typecheck -w backend`, `npm run test -w backend -- --runInBand`, 필요한 경우 `npm run build -w backend`.

## Execution strategy
### Parallel execution waves
> 이 계획은 계약과 OpenAI 경로가 순차 의존하므로, 작은 파동을 의도적으로 사용한다. 각 파동의 병렬 가능 작업은 표에 명시하고, 선행 계약이 없는 작업만 동시에 실행한다.

| Wave | Todos | 목적 |
| --- | --- | --- |
| 1 | 1, 2 -> 3 | 데이터 계약과 단원 내 후보 선택을 병렬로 확정한 뒤, Concept Payload 계약을 사용하는 TPL 결정 규칙을 구현한다. |
| 2 | 4 -> 5 | Frame/Payload 계획 계약이 끝난 뒤 생성 프롬프트와 배치 결과의 구조·source-copy·stale 가드를 연결한다. |
| 3 | 6 -> 7 | 기본 라우팅과 batch sibling/verdict 가드, 이후 lineage 저장과 원자성 트랜잭션을 연결한다. |
| 4 | 8 -> 9 | 파이프라인 회귀 테스트와 최종 검증(typecheck·build·focused specs)을 실행한다. |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | 4, 5, 6, 7 | 2, 3 |
| 2 | - | 4, 6 | 1, 3 |
| 3 | 1 | 5, 6 | 2 |
| 4 | 1, 2 | 5, 6 | - |
| 5 | 1, 3, 4 | 6 | - |
| 6 | 1, 2, 4, 5 | 7, 8 | - |
| 7 | 6 | 8 | - |
| 8 | 6, 7 | 9 | - |
| 9 | 8 | user completion | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
- [x] 1. Reference Frame와 Concept Payload의 타입·JSON 계약을 TDD로 정의한다.
  What to do / Must NOT do: `backend/src/exams/`에 Reference Frame, Concept Payload, 후보 참조, 생성 계보 메타데이터의 명시적 TypeScript 타입과 직렬화 검증 함수를 추가한다. Frame에는 source hash/id, subject, unit range, 발문·응답 구조, 자료 밀도, 정보 구조, 난이도 신호를 담고, Payload에는 선택 단원, target/supporting concepts, 새 distractor axes, 보기 진위, answer encoding, required information shape를 담는다. DNA의 evidence-slot 규칙을 재사용하거나 `any`로 계약을 우회하지 않는다.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 4, 5, 6, 7, 8
  References (executor has NO interview context - be exhaustive): `docs/reference-frame-generation-plan.md:48-143`; `backend/src/exams/pattern-matcher.service.ts:42-102`; `backend/src/exams/exam-generation.utils.ts:1-35`; `backend/src/exams/exam-question-validator.spec.ts:1-214`.
  Acceptance criteria (agent-executable): 새 계약 테스트가 유효 Frame/Payload를 통과시키고, 누락된 unit range·지원하지 않는 response mode·빈 distractor axis·잘못된 choice encoding을 reason code와 함께 거절한다. `npm run test -w backend -- --runInBand reference-frame*.spec.ts` 통과.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand reference-frame.contract.spec.ts`; happy: valid JSON fixture deserialize/validate; failure: malformed payload fixture마다 error code assert. Evidence <attemptDir>/task-1-reference-frame-generation.md.
  Commit: Y | `feat(exams): define reference frame generation contracts`

- [x] 2. 선택 단원 안의 개념·오답 축 풀과 참조 문항 선택기를 결정적으로 구현한다.
  What to do / Must NOT do: `TextbookService`의 단원 개념과 parsed reference의 `targetConcepts`를 canonicalized concept pool로 결합하고, 해당 개념군에서 허용되는 distractor-axis catalog를 구축한다. Payload 계획기는 이 catalog에서만 새 축을 선택한다. `startUnitNum..endUnitNum` 밖 개념, 범위 밖 참조, stimulus/5 choices가 없는 참조를 거절한다. 참조 문항은 한 시험 생성 안에서 중복되지 않게 하고, 동일 입력에는 seed 또는 stable hash 순서로 같은 후보 배정을 반환한다. 후보 부족 시 OpenAI 호출 전에 typed shortfall을 반환한다. 문자열 포함만으로 모호한 alias를 통과시키거나 `Math.random()`에 의존하지 않는다.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 4, 7
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-generator.service.ts:1289-1407`; `backend/src/exams/exam-generator.service.ts:117-143`; `backend/src/textbook/textbook.service.ts`; `textbook/parsed/sungjik/all/`; `textbook/parsed/kongil/all/`; `docs/reference-frame-generation-plan.md:211-226`.
  Acceptance criteria (agent-executable): fixture units에서 범위 내 개념과 axis catalog만 선택, 범위 밖/모호 alias 거절, 참조 중복 없음, 동일 seed 입력 결과 동일, 후보 부족 시 생성·저장 함수가 호출되지 않음을 assert한다.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand reference-selector.service.spec.ts`; happy: 2개 단원·여러 개념 fixture; failure: empty reference pool, out-of-range concept, requested count 초과, out-of-catalog distractor axis. Evidence <attemptDir>/task-2-reference-frame-generation.md.
  Commit: Y | `feat(exams): select deterministic unit-scoped references`

- [x] 3. Concept Payload의 정보 구조에서 표준 TPL을 선택하는 순수 매퍼와 스키마 계약을 만든다.
  What to do / Must NOT do: `comparison`, `condition_flow`, `role_dialogue`, `case_profile`, `document_rules`, `quantitative_change`, `forum_qa`, `instruction_scene`, `public_notice`를 표준 9개 TPL로 단일 매핑한다. Payload가 요구하는 구조와 TPL이 다르면 즉시 실패시키고, formal document의 title/date/author와 matrix/workflow의 필수 구조를 사전 검증한다. 원문 제목이나 legacy non-canonical TPL 이름으로 TPL을 고정하지 않고 `TPL_PLAIN_TEXT`를 허용하지 않는다.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `docs/reference-frame-generation-plan.md:173-205`; `backend/src/exams/tpl-schemas.ts`; `backend/src/exams/stimulus-normalizer.ts`; `prompts/step2/success.txt:83-179`; `prompts/step2/kongil.txt:83-179`.
  Acceptance criteria (agent-executable): 모든 information shape가 정확히 하나의 supported TPL로 매핑되고, unknown shape/unsupported template/plain-text fallback/document metadata 부족이 차단된다.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand reference-tpl-selector.spec.ts`; happy: 9개 mapping table-driven test; failure: malformed document and non-renderable matrix fixture. Evidence <attemptDir>/task-3-reference-frame-generation.md.
  Commit: Y | `feat(exams): map concept payloads to structured templates`

- [x] 4. OpenAI Frame 추출과 Payload 계획 서비스를 strict JSON·모킹 테스트와 함께 구현한다.
  What to do / Must NOT do: 선택된 parsed reference에서 원문 개념과 정답 논리를 복제하지 않는 Frame만 추출하고, unit-scoped concept pool을 입력받아 새 concept payload를 계획하는 서비스/프롬프트를 추가한다. JSON schema 또는 strict parser, timeout/retry, reason-coded failure를 적용한다. Payload prompt에는 reference의 concept/distractor axis 재사용 금지와 단원 내 개념 제약을 명시한다. OpenAI 응답을 신뢰해 바로 생성·저장하거나 free-form prose를 파싱하지 않는다.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 5, 7
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-generator.service.ts:1251-1407`; `backend/src/exams/exam-regenerator.service.ts:21-94`; `backend/src/exams/exam-generation.utils.ts`; `docs/reference-frame-generation-plan.md:227-260`; `backend/src/exams/exam-regenerator.service.spec.ts`.
  Acceptance criteria (agent-executable): mocked OpenAI가 valid frame/payload를 반환하면 typed objects가 생성되고, invalid JSON·wrong-unit concept·reference concept reuse·timeout은 저장 전 reason-coded failure와 retry/terminal behavior를 만든다.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand reference-frame-planner.service.spec.ts`; happy: fixed OpenAI JSON fixtures; failure: malformed, wrong scope, timeout, partial response fixtures. Evidence <attemptDir>/task-4-reference-frame-generation.md.
  Commit: Y | `feat(exams): plan reference frames and concept payloads`

- [x] 5. Frame·Payload·선택 TPL을 사용하는 reference 생성 프롬프트와 변환 경로를 재설계한다.
  What to do / Must NOT do: `ExamRegeneratorService.buildBatchRegenPrompt`와 생성 응답 계약을 Frame의 문체·response mode·보기/선지 수·자료 밀도는 유지하고 Payload의 새 개념·새 distractor axes·verdicts·answer encoding·TPL을 정확히 따르도록 바꾼다. 단순 원문 stimulus 변환 후 TPL conversion에 맡기지 말고 선택된 TPL 구조를 생성 계약으로 전달한다. 원문 name/date/value/case/phrase를 복사하지 않도록 금지하고 새 자료의 모든 내용이 payload claims를 뒷받침하게 한다.
  Parallelization: Wave 2 | Blocked by: 1, 3, 4 | Blocks: 7
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-regenerator.service.ts:95-287`; `backend/src/exams/exam-regenerator.service.ts:655-842`; `backend/src/exams/tpl-schemas.ts`; `backend/src/exams/stimulus-normalizer.ts`; `docs/reference-frame-generation-plan.md:227-260`.
  Acceptance criteria (agent-executable): fixture frame/payload마다 생성 prompt에 단원 범위, 새 concepts, 새 distractor axes, selected TPL, response structure가 포함되고, structured TPL response가 `StimulusNormalizer`에서 renderable임을 assert한다.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand exam-regenerator.service.spec.ts`; happy: case/dialogue/matrix/workflow fixture; failure: generator returns wrong TPL, missing combo block, unsupported template, copied source token fixture. Evidence <attemptDir>/task-5-reference-frame-generation.md.
  Commit: Y | `feat(exams): generate variants from frames and payloads`

- [x] 6. reference 경로에 batch 가드를 추가하고 omitted sourceType 라우팅과 DNA off를 통합한다.
  What to do / Must NOT do: `regenerateReferenceBatch`에 batch 내 sibling stimulus overlap 검사와 payload claim verdicts → correctAnswer alignment 검사를 추가한다. `ExamsService.create`의 라우팅을 조정해 explicit `"ai"`만 `generate`로 보내고, omitted `sourceType`과 explicit `"reference"`는 새로 만든 `regenerateWithReferenceFrame` 헬퍼(=`regenerate`의 DNA lookup/attachment를 우회한 노선)로 보낸다. `regenerate`의 DNA 첨부 단계를 `skipReferenceEnhancements` 플래그로 옵트인화한다. `ExamSourceType.REFERENCE`는 저장 시 그대로 유지한다. Selector→Planner의 완전한 orchestrator wiring은 Task 8(mocked integration)에서 마무리하며 이 Task에서는 mocked full-pipeline 코드를 요구하지 않는다. explicit AI, parsed corpus, frontend, DNA 실험 코드는 수정하지 않는다.
  Parallelization: Wave 3 | Blocked by: 1, 2, 4, 5 | Blocks: 7, 8
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exams.service.ts:83-119,455-535`; `backend/src/exams/exam-generator.service.ts:1251-1449`; `backend/src/exams/exam-regenerator.service.ts:211-446`; `backend/src/exams/dto/create-exam.dto.ts:14-51`.
  Acceptance criteria (agent-executable): omitted sourceType과 explicit `"reference"`는 DNA-off 경로로, explicit `"ai"`는 기존 `generate`로 라우팅됨. reference 경로에서 `patternMatcher.findDnaForReference`가 호출되지 않음. batch sibling stimulus overlap과 payload verdict → correctAnswer mismatch가 typed error로 거절됨. 무효 요청은 저장·부분 결과 없음.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand exam-regenerator.reference-variant.spec.ts`; happy: 기존 성공 fixture; failure: sibling overlap, verdict/correctAnswer mismatch, wrong TPL, plain text. Evidence <attemptDir>/task-6-reference-frame-generation.md.
  Commit: Y | `feat(exams): route reference generation with batch guards and DNA off`

- [x] 7. reference 결과의 출처·계획·검증 메타데이터를 원자적으로 저장한다.
  What to do / Must NOT do: 이미 존재하는 `question.entity.ts`, `exam-record.entity.ts`의 새 컬럼(마이그레이션 `1721210500000-AddLineageGenerationEvidence`, `1721210600000-AddExamSourceType`)만 사용해 source hash/id, selected concepts, selected TPL, validation reason을 저장한다. Question/ExamItem/ExamRecord 저장을 하나의 transaction으로 묶고, 어느 단계라도 실패하면 rollback하여 orphan을 남기지 않는다. explicit AI 저장 경로는 backward compatible로 유지한다. 새 lineage table/migration을 추가하지 않는다.
  Parallelization: Wave 3 | Blocked by: 6 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `backend/src/entities/question.entity.ts`; `backend/src/entities/exam-record.entity.ts`; `backend/src/entities/exam-item.entity.ts`; `backend/src/migrations/1721210500000-AddLineageGenerationEvidence.ts`; `backend/src/migrations/1721210600000-AddExamSourceType.ts`; `backend/src/exams/exams.service.ts:119-190`.
  Acceptance criteria (agent-executable): 성공 시 저장된 lineage 필드(reference source, selected concepts, TPL, validation reason)가 조회 가능. 각 write 경계에서 강제 예외 발생 시 rollback으로 orphan question/item/exam 없음. explicit AI 레코드는 필드 default로 backward compatible.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand reference-generation-persistence.spec.ts`; happy: repository transaction mock으로 lineage 필드 assertion; failure: question/item/exam 각 write 실패에 대한 rollback assertion. Evidence <attemptDir>/task-7-reference-frame-generation.md.
  Commit: Y | `feat(exams): persist reference generation lineage`

- [x] 8. mocked end-to-end 회귀 테스트 하나로 파이프라인을 검증한다.
  What to do / Must NOT do: `success` 과목의 선택 단원에 대한 mocked full-pipeline 통합 테스트를 추가한다. `ReferenceFramePlannerService`와 `ExamRegeneratorService`의 chat client는 fixture mock으로, `ReferenceSelectorService`는 실 corpus로, 저장은 in-memory repository로 구성한다. 하나의 성공 시나리오와 하나의 실패 시나리오(scope drift 또는 stale reference)만 검증한다. 실제 OpenAI 자격 증명을 사용하지 않는다. 무관한 frontend 테스트를 손대지 않는다.
  Parallelization: Wave 4 | Blocked by: 6, 7 | Blocks: 9
  References (executor has NO interview context - be exhaustive): `backend/src/exams/exam-regenerator.reference-variant.spec.ts`; `backend/src/exams/reference-frame-planner.service.spec.ts`; `backend/src/exams/reference-selector.service.spec.ts`; `backend/src/exams/exams.service.ts`.
  Acceptance criteria (agent-executable): success 시나리오는 선택 단원 내 개념, canonical structured TPL, exact requested count, source phrase overlap 없음을 assert. 실패 시나리오는 typed error를 반환하고 저장 결과가 없음을 assert.
  QA scenarios (name the exact tool + invocation): `npm run test -w backend -- --runInBand reference-frame-generation.integration.spec.ts`; happy: 선택 단원 성공 fixture; failure: scope drift fixture. Evidence <attemptDir>/task-8-reference-frame-generation.md.
  Commit: Y | `test(exams): cover reference frame generation pipeline`

- [x] 9. 최종 검증: 백엔드 typecheck + build + 모든 focused specs 실행.
  What to do / Must NOT do: `npm run typecheck -w backend`, `npm run build -w backend`, 그리고 이 계획으로 추가된 모든 reference 관련 focused spec을 실행하고 각 결과를 evidence로 기록한다. `git diff --name-only`로 변경 파일이 승인된 범위(주로 `backend/src/exams/reference-*`, `backend/src/exams/exams.service.ts`, `backend/src/exams/exam-regenerator.service.ts`, `backend/src/entities/*`, `backend/src/migrations/17212105*`·`17212106*`)를 벗어나지 않았는지 확인한다. 무관한 pre-existing 실패는 그대로 두고 문서화만 한다. 별도 F1/F2/F3/F4 세션을 만들지 않는다.
  Parallelization: Wave 4 | Blocked by: 8 | Blocks: user completion decision
  References (executor has NO interview context - be exhaustive): `backend/package.json`; 이 계획으로 새로 추가된 모든 `backend/src/exams/reference-*.ts` 및 관련 spec; `docs/reference-frame-generation-plan.md`.
  Acceptance criteria (agent-executable): 위 세 명령이 exit 0로 종료됨. reference 경로의 새 파일에 lsp/컴파일 진단 없음. 변경 파일 리스트가 승인된 범위에 국한됨.
  QA scenarios (name the exact tool + invocation): `npm run typecheck -w backend && npm run build -w backend && npm run test -w backend -- --runInBand reference-frame.contract.spec.ts reference-selector.service.spec.ts reference-tpl-selector.spec.ts reference-frame-planner.service.spec.ts exam-regenerator.reference-variant.spec.ts reference-generation-persistence.spec.ts reference-frame-generation.integration.spec.ts`; happy: 세 명령 모두 통과; failure: exit code nonzero 시 원인 파일 분석. Evidence <attemptDir>/task-9-reference-frame-generation.md.
  Commit: N | verification only

## Commit strategy

Use small, dependency-ordered commits that correspond to completed todo boundaries:

1. contracts and deterministic selection;
2. payload-to-TPL mapping and planning service;
3. generation/validation integration;
4. routing, provenance, transaction handling, and final regression tests.

Do not mix unrelated working-tree changes into these commits.

## Success criteria

- Omitted `sourceType` produces a reference-frame variant; explicit `sourceType: "ai"` preserves the existing general AI route.
- Generated reference variants use only concepts and distractor axes from selected units.
- The outward frame remains recognizably CSAT-like while original answer logic, phrases, numbers, entities, and cases are not copied.
- TPL follows the new payload information shape and is always structured and renderable.
- Validation rejects scope drift, response-structure drift, unsupported answer logic, copied text above threshold, non-renderable TPLs, and output shortfalls.
- Successful calls persist enough lineage metadata to identify reference source, frame/payload version, TPL, and validation outcome.
- All focused and full backend typecheck, test, and build commands pass.
