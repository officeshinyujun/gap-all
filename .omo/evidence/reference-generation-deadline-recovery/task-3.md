# Reference Generation Deadline Recovery: Task 3 Evidence

## Scope

- Applied Task 1's `resolveReferenceGenerationWorkBudget`, `reconcileReferenceCandidateOutcomes`, and fatal-disposition contract in `ReferenceFrameGenerationService`.
- Added focused characterization and recovery tests in `reference-frame-generation.service.spec.ts`.
- Did not change selection ordering, chunking, prompts, models, schemas, validators, receipt projection, persistence, reserve admission, or perform live/authenticated QA.

## Characterization And Tests

- Baseline characterization:
  `npm --prefix backend test -- --runInBand src/exams/reference-frame-generation.service.spec.ts --testNamePattern="Given ten requested drafts and one rejected candidate"`
  passed: 1 test passed, 23 skipped.
- Red cap/fatal suite before the implementation:
  `npm --prefix backend test -- --runInBand src/exams/reference-frame-generation.service.spec.ts --testNamePattern="Given ten requested drafts and five|Given candidates beyond|Given all eligible candidates|Given a cached candidate|Given a provider"`
  failed as expected: the unbounded loop reached candidate 16, cache fallback processed a later candidate despite an allowance of zero, and planner 401/schema errors became `REFERENCE_GENERATION_SHORTFALL`.
- Final focused suite:
  `npm --prefix backend test -- --runInBand src/exams/reference-frame-generation.service.spec.ts`
  passed: 1 suite, 30 tests.

## Manual Import-Level Artifact

```sh
node -r ts-node/register -e "const { ReferenceFrameGenerationService } = require('./src/exams/reference-frame-generation.service'); const { resolveReferenceGenerationWorkBudget } = require('./src/exams/reference-generation-budget'); const budget = resolveReferenceGenerationWorkBudget(10); if (typeof ReferenceFrameGenerationService !== 'function' || budget.candidateScanCap !== 15 || budget.plannerAttemptCap !== 15) { throw new Error('reference generation imports did not expose the bounded-work contract'); } console.log(JSON.stringify({ importedService: true, candidateScanCap: budget.candidateScanCap, plannerAttemptCap: budget.plannerAttemptCap }));"
```

Observed output:

```json
{"importedService":true,"candidateScanCap":15,"plannerAttemptCap":15}
```

## Verification And Cleanup

- `npm --prefix backend run typecheck` passed with exit code 0.
- `git diff --check` passed with exit code 0.
- TypeScript LSP diagnostics could not run because the workspace TypeScript server remains unavailable after a prior declined installation; the focused Jest suite and `tsc` were used instead.
- No debug files, generated artifacts, or live-provider state were created. The only task evidence artifact is this file.
