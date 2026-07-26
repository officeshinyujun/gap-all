# Issues

## 2026-07-21 Known active issue
- `npm run typecheck -w backend` reports TS2339 for rejection-only fields in `backend/src/exams/reference-frame-planner.service.ts:79-82`.

## 2026-07-21 Live provider near-miss
- The live omitted-sourceType job `94a2b7ac-37d2-43c5-bbe2-f79255b3f610` exhausted two frame attempts on a three-key response (`questionNumber`, `source`, `unitNumber`), yielding `REFERENCE_PLANNER_REJECTED / UNKNOWN_FIELD`. The exact seven-key recovery correctly did not apply; extending the trusted recovery boundary would require a separate review and test plan.
