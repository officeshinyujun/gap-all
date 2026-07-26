# Reference context exclusion and repair

## Goal

Prevent incomplete reference payloads from entering either reference-based
generation path, then restore source context only where the checked-in parsed
catalog retains enough authoritative material.

## Decisions

- Keep reference rows for provenance; exclude them centrally at parse time
  rather than deleting rows or adding a database eligibility column.
- Use an explicit, versioned source-ID registry for audited incomplete
  references. It covers catalog, legacy reader, explicit source-ID selection,
  and cache warmup through `parseReference()`.
- Restore only data that can be reconstructed from checked-in parsed source
  records. Keep sources excluded when their original PDF/screenshot is absent.
- Do not infer missing tables, diagrams, or facts with an LLM.

## In scope

- [x] Add the audited incomplete-reference source-ID registry and central
      eligibility guard.
- [x] Add parser/selector and both generation-path regression coverage.
- [x] Restore the five recoverable production-plan payloads from their paired
      checked-in parsed records, then update persisted catalog data through a
      controlled migration or repair script.
- [x] Keep the unrecoverable NCS-screen source excluded and document its
      missing raw asset.
- [x] Run targeted tests, typecheck, catalog preflight, and a read-only
      completeness audit after repair.

## Out of scope

- Reconstructing the remaining sources without their original PDFs/assets.
- Inventing answer keys or visual data.

## Verification

- PASS: `npm test -- --runInBand src/exams/reference-selector.service.spec.ts src/exams/simply-reference-generation.service.spec.ts src/exams/reference-frame-generation.service.spec.ts` — 72 passed.
- PASS: `npm run typecheck`.
- PASS: `npm run lint` — 0 errors; 81 pre-existing warnings remain.
- PASS: `npm run repair:reference-context -- --apply` updated the five persisted payloads and invalidated their frame caches.
- PASS: direct read-only database check confirmed restored stimulus lengths of 517, 517, 612, 619, and 696 characters.
- EXPECTED FAILURE: `npm run preflight:reference-catalog -- --format=json` remains failed (925/1280). This catalog has 924 pre-existing ID/payload/reconciliation failures; the additional row is the intentionally excluded unrecoverable NCS-screen source.
