# Todo 19 Evidence: Catalog Re-import Integrity

Date: 2026-07-21

## Fixture Database

- Target: disposable `gap_generation_test` only.
- Initial catalog after Todo 18: 907 rows.
- Re-import input: 142 parsed JSON files normalized to 2,309 records.
- Expected manifest hash: `sha256:0a84fc55bcf69a07a36b9cbadff7924b3576cad59bc588aa712addb4577fa500`.

## Commands And Results

| Command | Exit | Assertion |
| --- | ---: | --- |
| guarded Nest-context second import | 0 | `insertedCount=0`, `existingCount=2309`, and the manifest hash matched Todo 18. |
| guarded Nest-context conflict import | 0 | A transaction containing one unique rollback probe followed by a changed-payload existing logical source threw `ReferenceCatalogImportError` with `SOURCE_VERSION_CONFLICT`. |
| `psql -d gap_generation_test` catalog query | 0 | Catalog remains 907 rows and rollback probe count is zero. |
| `npm test -w backend -- --runInBand reference-catalog-import.service.spec.ts` | 0 | 9 tests cover idempotency, version conflicts, rollback, and safety guards. |

## Conclusion

The identical parsed corpus is a transaction-level no-op. A changed payload for an existing logical source is rejected, and the earlier probe insert is rolled back, leaving the initial catalog unchanged.
