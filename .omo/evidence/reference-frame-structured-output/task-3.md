# Task 3 - Strict Structured Output Live Verification

## Automated Verification

- `npm run test -w backend -- --runInBand exam-regenerator.reference-variant.spec.ts reference-frame.provider-schemas.spec.ts reference-frame-planner.service.spec.ts reference-frame-generation.service.spec.ts`: passed, 4 suites and 27 tests.
- `npm run typecheck -w backend`: passed.
- `npm run build -w backend`: passed.

## Live Verification

- Isolated backend instances ran on port `3101` and were terminated after each run; the port was confirmed closed.
- Strict-schema job `2075f7a8-21df-476e-a789-fa22d695e7e9` passed the planner but exposed an existing regenerator `json_object` prompt contract error: provider required the literal word `json` in a message.
- Added a tested system-prompt contract requiring one raw JSON object for reference regeneration.
- Follow-up job `257694c4-622d-48ac-af7f-7fb9f7cf9bec` passed the strict planner and the provider's JSON-object request validation, then failed as `REFERENCE_GENERATION_SHORTFALL` after `ExamRegeneratorService` rejected a malformed generated batch response.
- PostgreSQL query scoped to the second job timestamp returned no new `exam_records`, `exam_items`, or `questions`; no partial persistence occurred.

## Result

- The strict Frame/Payload `json_schema` change prevents the observed partial three-key Frame object and is accepted by the configured provider.
- End-to-end reference generation remains blocked by a later regenerator batch-output schema problem. That output is rejected safely before persistence and requires a separate regenerator structured-output plan.
