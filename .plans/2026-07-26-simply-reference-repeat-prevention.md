# Simply-reference repeat prevention

## Scope

Prevent a user from receiving the same simple-reference questions on repeated
generation for the same subject and unit range. Preserve the existing source
format/fidelity contract and leave the normal AI generation path unchanged.

## Decisions

- Treat `excludePrevious !== false` as the default user-history policy.
- Prefer reference sources not previously used by that user in the exact same
  subject/range before applying the existing quality ranking.
- If the unseen source pool is insufficient, reuse sources but supply a fresh
  generation nonce and reject exact visible-output fingerprints already seen in
  that range.
- Keep user history lookup inside the simply-reference generator behind a small
  reader interface so service tests remain database-free.
- Persist the nonce in simply-reference lineage for auditability.

## In scope

- [x] Pass user/range/exclusion context from `ExamsService` to simple generation.
- [x] Read per-user prior simple-reference source IDs and fingerprints.
- [x] Select unseen sources first, then reuse only when necessary.
- [x] Add nonce-aware prompts and exact fingerprint duplicate rejection.
- [x] Persist the nonce in generation lineage.
- [x] Add regression tests and run backend verification.

## Out of scope

- [ ] Semantic similarity matching of historical questions.
- [ ] Changing normal AI/reference-frame generation behavior.
- [ ] Browser tests.

## Duplicate recovery follow-up

- [x] Separate duplicate-visible-output failures from malformed provider output.
- [x] Use source-independent visible fingerprints for user-history comparison.
- [x] Replace a duplicate source with an unselected eligible source when available.
- [x] Give each same-source repair a fresh retry nonce and allow two repairs.
- [x] Return a structured variant-exhaustion error rather than generic retry exhaustion.
- [x] Add duplicate-replacement and retry-exhaustion regression coverage.

## Verification

Run in `backend/`:

```bash
npm test -- --runInBand simply-reference-generation.service.spec.ts exams.service.spec.ts exams.persistence.spec.ts
npm run typecheck
npm run lint
```

## Verification results

- PASS: `simply-reference-generation.service.spec.ts`, `exams.service.spec.ts`,
  and `exams.persistence.spec.ts` — 30 tests passed.
- PASS: `npm run typecheck`.
- PASS: `npm run lint` — 0 errors; 81 existing unsafe-argument warnings.
- PASS: duplicate-recovery follow-up tests included in the 32 targeted passing tests.
