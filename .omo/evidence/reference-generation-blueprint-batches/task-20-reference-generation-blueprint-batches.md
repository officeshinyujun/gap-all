# Todo 20 Evidence: Bounded Reference Job

Date: 2026-07-21

## Execution

- Disposable environment: `gap_generation_test`.
- Authenticated fixture user: `051bce92-dbcc-49b9-9e96-5bae52233837`.
- Request: `success` subject, unit 1 through 1, `MIDDLE`, 10 questions, `sourceType=reference`.
- Exactly one job was created: `eaa1a962-5109-45ec-823e-d966e78f80c2`.

## Terminal Result

- Job status: `failed`; stage: `failed`; progress: `5`; exam ID: none.
- The matching non-job service-path diagnostic returned the typed response:
  - code: `REFERENCE_SELECTION_SHORTFALL`
  - requested references: 10
  - available references: 9
  - reasons: `INSUFFICIENT_REFERENCES`, `INVALID_REFERENCE`
- The shortfall occurs before planner-client construction, so this bounded request made zero provider calls, no blueprint calls, no Step-2 batches, and no provider usage records.

## Integrity And Build Evidence

| Command | Exit | Assertion |
| --- | ---: | --- |
| bounded `ExamsService.createJob` and poll | 0 | One terminal job with typed capacity failure evidence. |
| test-DB artifact query | 0 | Exam records, generation runs, generated questions, generation sessions, and generation items are all zero. |
| `npm run typecheck -w backend` | 0 | Backend typecheck passed. |
| `npm run build -w backend` | 0 | Nest backend build passed. |

The failure is an expected capacity result for the selected one-unit request, not a provider/schema/content failure. It leaves no partial exam artifacts and records no prompt or credential content.
