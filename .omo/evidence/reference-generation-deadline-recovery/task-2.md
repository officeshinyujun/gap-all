# Task 2 Evidence

## Scope

- Modified only `backend/src/exams/reference-frame-planner.validation.spec.ts`.
- No planner service, typing, validator, generation loop, deadline, receipt, persistence, or prompt production files were changed.

## Baseline

Command:

`npm --prefix backend test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts`

Result before the characterization additions:

`Test Suites: 1 passed, 1 total`

`Tests: 17 passed, 17 total`

The existing prompt correction shape was characterized as:

`Discard the previous candidate. Rebuild structureBlueprint with one choice itemRoles entry and one matching evidenceBlocks entry for every itemIndex from 1 through 5. Each entry must reference at least one declared information unit and reasoning step.`

## Task 2 Verification

Command:

`npm --prefix backend test -- --runInBand src/exams/reference-frame-planner.validation.spec.ts`

Result:

`Test Suites: 1 passed, 1 total`

`Tests: 19 passed, 19 total`

Assertions cover:

- Incomplete role coverage sends a second frame request with `UNREFERENCED_BLUEPRINT_ROLE` and the exact required cardinality/index wording for indexes 1 through 5.
- A valid second frame proceeds through a valid payload and returns `kind: 'planned'`.
- Exhausted incomplete role coverage returns `stage: 'frame'`, `reason: 'UNREFERENCED_BLUEPRINT_ROLE'`, `attempts: 2`, and `terminal: 'retry_exhausted'`.
- Role-mapping exhaustion does not activate source-object echo recovery; exactly two model calls occur.

## Manual Import-Level QA

The focused Jest run executed the TypeScript test and imported the existing fixture helpers, planner service, prompt builder path, validators, and typed planner result path through `ts-jest`. A direct `ts-node` probe also imported the fixture module and constructed the planner service successfully. The two new cases exercised retry-success and exhausted-rejection behavior without live or authenticated provider access.

## Cleanup

- `npx prettier --check src/exams/reference-frame-planner.validation.spec.ts` passed.
- `git diff --check -- backend/src/exams/reference-frame-planner.validation.spec.ts` passed.
- TypeScript LSP diagnostics were unavailable because the workspace TypeScript server is not installed and installation was previously declined.
