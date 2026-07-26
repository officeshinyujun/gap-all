# Learnings

## 2026-07-21 Planner recovery setup
- The live planner failed at stage `frame` with `UNKNOWN_FIELD`; its response keys were `choices`, `questionNumber`, `source`, `stem`, `stimulus`, `targetConcepts`, and `unitNumber`.
- `bindRequestContext()` already addresses model omission of request-owned `unitRange`.
- The current recovery branch does not typecheck because a ternary loses `StageResult` rejected-variant narrowing before reading `reason`, `terminal`, and `responseKeys`.

## 2026-07-21 Echo recovery repair
- The frame branch now narrows `StageResult` before accessing rejection-only fields, and only recovers the exact seven-key selected-reference echo when the request has five choices.
- `validateReferenceFrameJson()` remains strict: after request-context binding, the selected-reference echo is still rejected as `UNKNOWN_FIELD`; unknown keys and non-five-choice echoes retain reason-coded frame rejection.
- Focused planner Jest coverage (11 tests) and backend typecheck pass.

## 2026-07-21 Live omitted-sourceType verification
- Focused planner tests (18 tests), backend typecheck, and build passed before one authenticated `success` unit-1 job was submitted without `sourceType`.
- The job reached a classified terminal frame failure with a different three-key provider echo, and database counts proved zero newly created scoped exam, item, or question rows.
