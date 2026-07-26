# Todo 18 Evidence: Guarded Parsed-Corpus Import Attempt

Date: 2026-07-21

## Scope

- Corpus roots inspected: `textbook/parsed/sungjik` and `textbook/parsed/kongil`.
- No application source, migration, parsed JSON, database configuration, or existing catalog data was changed.
- The configured local database was inspected without exposing its credentials.

## Guard Assessment

| Required guard | Observed fact | Result |
| --- | --- | --- |
| Non-production environment | `NODE_ENV=development` | Pass |
| Approved disposable database suffix | Configured database name is `gap`; required suffix is `_generation_test` | Fail |
| Explicit confirmation | No invocation was authorized to supply `RESET_GENERATION_DATA` | Not reached |
| Existing backup manifest | `backup_manifest_artifact_count=0` under `.omo` | Fail |

The reset guard is fail-closed: it rejects a production environment, any database name without `_generation_test`, an inexact confirmation, or an empty backup-manifest identifier. The failed database suffix is decisive. Therefore no database connection, reset SQL, transaction, catalog query, corpus import, or real-corpus manifest creation was performed.

## Existing Import Surface

- `ReferenceCatalogImportService.dryRun` accepts records plus an in-memory `ReferenceQuestionCatalog`; its catalog inserts are `Map` writes, not TypeORM or database writes.
- The repository package scripts contain no supported corpus-import command, and the observed importer call path is limited to the service and its focused specification.
- A real fixture-catalog transaction must not be improvised. It remains unavailable until a supported transaction-backed runner exists and every guard above passes.

## Commands And Results

| Command | Exit | Assertion |
| --- | ---: | --- |
| Sanitized `node -r dotenv/config -e` inspection of the effective backend configuration | 0 | Printed only database name `gap`, host `localhost`, and `NODE_ENV=development`; no credential output. |
| `node -e` recursive SHA-256 aggregate over the two parsed corpus roots, before preflight | 0 | `corpus_file_count=142`; aggregate SHA-256 `13b85c552e1ef0dd260dc59384cf2cc3e97e43678dd35153a706bb8920abbf2b`. |
| `node -e` scan for backup-manifest artifact filenames under `.omo` | 0 | `backup_manifest_artifact_count=0`. |
| `npm test -w backend -- --runInBand reference-catalog-import.service.spec.ts` | 0 | 1 suite passed; 2 tests passed. The test verifies deterministic repeated dry-run manifests and malformed-record rejection without catalog mutation. |
| `node -e` recursive SHA-256 aggregate over the two parsed corpus roots, after the guarded attempt | 0 | `corpus_file_count=142`; aggregate SHA-256 remains `13b85c552e1ef0dd260dc59384cf2cc3e97e43678dd35153a706bb8920abbf2b`. |

## Assertions

- Before and after aggregate checksums match exactly, so all 142 parsed source files remained unchanged.
- Accepted/rejected/planned-insert counts are intentionally uncomputed: no parsed records were loaded into the in-memory dry-run catalog or an external catalog because the real-corpus preflight was not authorized.
- No catalog row count is available because the configured database is unapproved and was intentionally not connected to or queried.
- No real-corpus import manifest exists because the required preflight did not pass. The focused service test confirms deterministic manifest behavior only for its in-memory fixture records.
- Todo 19 remains blocked. The next action is to provision and explicitly identify an approved disposable `_generation_test` fixture database with a backup-manifest identifier, then rerun Todo 18 before attempting any re-import integrity work.

## Completed Fixture-DB Import

- Provisioned disposable PostgreSQL database: `gap_generation_test`.
- Initialized its non-production schema and confirmed `reference_questions` existed with zero rows before import.
- Loaded all 142 parsed JSON files into 2,309 input records. Parsed source variants use either `source.unitNumber` or top-level `unitNumber`; normalization uses the former when present and the latter otherwise.
- The normalized dry-run manifest reported 2,309 accepted records, zero rejected records, 907 planned inserts, and manifest hash `sha256:0a84fc55bcf69a07a36b9cbadff7924b3576cad59bc588aa712addb4577fa500`.
- The guarded single transaction completed with 907 inserts and 1,402 duplicate-source no-ops. The persisted catalog count is 907, with 907 distinct logical source IDs and 907 distinct content hashes.

| Command | Exit | Assertion |
| --- | ---: | --- |
| `npm test -w backend -- --runInBand reference-catalog-import.service.spec.ts` | 0 | 9 tests passed, including guard, rollback, no-op, and version-conflict cases. |
| `npm run typecheck -w backend` | 0 | Transaction-backed importer and module wiring compile. |
| guarded Nest context import against `gap_generation_test` | 0 | 2,309 records processed atomically; 907 inserted and 1,402 already-seen source records. |
| `psql -d gap_generation_test` catalog queries | 0 | 907 rows; logical-source and hash uniqueness confirmed. |
| `git diff --quiet -- textbook/parsed` | 0 | Parsed source JSON is unchanged from the repository baseline. |

The earlier preflight recorded an aggregate checksum using an undocumented traversal order. This completed run records the reproducible sorted path-and-content checksum `df237b7261fa33e08d1d69ba225d47ef567ba16c9861125080eccb15ed3f0736`; the repository diff check independently proves the import did not mutate parsed source files.
