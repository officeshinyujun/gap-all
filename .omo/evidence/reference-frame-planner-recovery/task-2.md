# Task 2 - Live Omitted-sourceType Verification

Date: 2026-07-21

## Scope And Guardrails

- Product source, frontend, migrations, routing, planner code, and user records are not modified by this verification.
- The existing listener on port 3001 was observed but left untouched. An isolated backend instance will use `backend/.env` from the backend working directory with `PORT=3101`.
- No local environment variable supplied reusable login credentials. The authenticated request will use one ephemeral, unprinted bearer token signed with the existing local JWT secret for an existing non-admin user. This exercises the real JWT guard and does not persist a user change.
- Exactly one `POST /exams/jobs` request will be made. Its body will target subject slug `success`, unit range `1..1`, `questionCount: 1`, and deliberately omit `sourceType`.

## Preflight

- `npm run test -w backend -- --runInBand reference-frame-planner.service.spec.ts reference-frame-planner.validation.spec.ts`: passed, 2 suites and 18 tests.
- `npm run typecheck -w backend`: passed.
- `npm run build -w backend`: passed.
- Note: Jest emitted an environmental Watchman recrawl warning; it did not affect the successful test result.

## Planned Runtime Artifacts

- [ ] Verification backend process: `PORT=3101 node dist/main` from `backend/`; terminate by its recorded PID.
- [ ] Temporary server log: `/var/folders/_z/p645ccv91_j_wvxch2jyqmdh0000gn/T/opencode/reference-frame-planner-task-2-backend.log`; remove after recording the startup and terminal-job outcomes.

## Live Backend And Database Run

- Backend command: `PORT=3101 node dist/main` from `backend/`.
- Process and port: PID `55167`, port `3101`; startup log reported `Server running on http://localhost:3101`.
- Authentication: no reusable local login credential was configured. An ephemeral bearer token was signed in-memory with the configured local JWT secret for an existing non-admin user, then accepted by the real JWT guard. The token, secret, user email, and database URL were not printed or persisted.
- Exactly one request was submitted: `POST /exams/jobs` with `{ subjectId: <success>, startUnitNum: 1, endUnitNum: 1, difficulty: "MIDDLE", questionCount: 1 }`. The request deliberately had no `sourceType` property.
- Job ID: `94a2b7ac-37d2-43c5-bbe2-f79255b3f610`.
- Polling: three authenticated `GET /exams/jobs/:jobId` polls at four-second intervals reached terminal `failed` status. The final stored request confirmed `requestHasSourceType: false`.
- Terminal status surface: `status=failed`, `stage=failed`, `progress=5`, `error=Internal Server Error Exception`, and no `examId`.
- Classified server diagnostic: `code=REFERENCE_PLANNER_REJECTED`, `kind=rejected`, `stage=frame`, `reason=UNKNOWN_FIELD`, `attempts=2`, `terminal=retry_exhausted`, `responseKeys=["questionNumber","source","unitNumber"]`.
- Database scope: the actor, subject `success`, unit range `1..1`, and a database timestamp immediately preceding POST. Before submission: `exam_records=0`, `exam_items=0`, `unit_questions=0`. After terminal failure: `new_exam_records=0`, `new_exam_items=0`, `new_unit_questions=0`.
- Result: the repaired exact seven-key echo recovery was not invoked because this live provider response was a distinct three-key shape. Its strict rejection was classified and no partial exam, item, or question persistence occurred.
