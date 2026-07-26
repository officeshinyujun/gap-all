# Learnings

## 2026-07-21 Execution initialization
- Plan has 20 implementation todos in four sequential visible-progress waves.
- Todo 1 establishes the required deterministic 10/20 request-byte and 21/41-call legacy baseline without provider network access.

## 2026-07-21 Todo 1 complete
- The observed legacy request model is `2N + 1`: Frame and Payload per reference plus one regeneration request.
- Canonical fixture baseline is SHA-256 `68b7d1df85bd36f2be51f28e3975ab029619c1d092af3a1f706b8bc9f4616b22`: 10 questions = 21 requests / 53,654 bytes; 20 questions = 41 requests / 107,124 bytes.
- Later batch work must compare against these values without treating them as actual provider calls.

## 2026-07-21 Todo 2 complete
- Reset protection is implemented as a transaction abstraction with a future-generation-table allowlist; it intentionally does not touch current shared exam tables.
- The execution gate is non-production plus `_generation_test` database suffix, explicit confirmation, and non-empty backup manifest id.

## 2026-07-21 Todo 3 complete
- Source catalog rows are distinct from generated `Question` rows and preserve immutable logical source identity, hash, provenance, parse version, and payload.
- Duplicate fingerprint handling is explicit: same logical source + hash is a no-op; changed hash for the same logical source is a version conflict.

## 2026-07-21 Todo 4 complete
- Generation staging data is isolated in `generation_runs`, `generated_questions`, `generation_exam_sessions`, and `generation_exam_items` until the later atomic persistence task projects a completed result to the existing exam read model.
- Explicit AI generation remains on the existing generator and `ExamRecord` transaction path.

## 2026-07-21 Todo 5 complete
- Fixture-only catalog dry-run produces a deterministic manifest checksum and safe no-op re-import behavior before any real parsed corpus import.
- Invalid fixture records are reported with their path and reason without catalog mutation.

## 2026-07-21 Todo 6 complete
- Blueprint slots are server-owned and deterministic from the selection order; capacity failure is returned before any planner/provider work.

## 2026-07-21 Todo 7 complete
- The Step 2 boundary is now represented directly: each generation batch contains one canonical TPL and at most five server-owned slots.

## 2026-07-21 Todo 8 complete
- Step 1 compact prompt uses one TPL declaration and excludes source identity/server metadata while preserving a capped reference-style capsule per assigned slot.

## 2026-07-21 Todo 9 complete
- Blueprint validation fails before generation for slot coverage drift, empty scenario plans, missing verdict claims, and over-concentrated answer patterns.
- Non-machine-verifiable cadence/difficulty remain explicit real-QA rubric checks rather than false guarantees.

## 2026-07-21 Todo 10 complete
- Compact blueprint planning uses one strict provider request per homogeneous batch and validates slot output before any Step 2 work.

## 2026-07-21 Todo 11 complete
- Step 2 compact batch requests contain one structured TPL schema and semantic blueprints only; source identities are excluded.

## 2026-07-21 Todo 12 complete
- Step 2 output is mapped by exact slot IDs rather than provider array position and rejects coverage/template/choice drift before persistence.

## 2026-07-21 Todo 13 complete
- Complete exam persistence is gated on exact staged slot coverage; incomplete work records only a failed run and cannot write a partial exam.

## 2026-07-21 Todo 14 complete
- Provider telemetry is redaction-safe by type: it stores only run/stage/batch/model/retry/token/request-byte metadata and deduplicates exact attempt keys.

## 2026-07-21 Todo 15 complete
- Homogeneous controlled ten-slot fixture proves one blueprint plus two five-item generation calls; real corpus call count remains dependent on its TPL chunk distribution.

## 2026-07-21 Todo 16 complete
- Budget measurement models one blueprint plus actual homogeneous chunk count, rather than falsely fixing real corpus calls at three.

## 2026-07-21 Todo 17 complete
- Controller and service tests preserve existing create/job consumer DTO delegation while explicit AI remains on its legacy route.

## 2026-07-21 Todo 18 guarded execution
- The `sungjik` and `kongil` parsed corpus contains 142 files. Its deterministic aggregate SHA-256 was `13b85c552e1ef0dd260dc59384cf2cc3e97e43678dd35153a706bb8920abbf2b` both before and after the guarded attempt, proving no parsed source mutation.
- The focused catalog-import spec passes with two tests: deterministic repeated dry-run manifest behavior and invalid-record rejection without catalog mutation.
- `ReferenceCatalogImportService.dryRun` operates on an in-memory `ReferenceQuestionCatalog`; no supported npm import command or TypeORM-backed corpus-import runner was available for a real fixture-catalog transaction.

## 2026-07-21 Todo 18 import boundary correction
- `ReferenceCatalogImportService` accepts optional transaction dependencies so deterministic dry-runs remain dependency-free; guarded imports validate first and then fail with a dedicated configuration error before opening a transaction when no persistence adapter is configured.
- The TypeORM adapter persists `ReferenceQuestion` through `Repository.save`, which accepts the typed `Record<string, unknown>` JSON payload without weakening the insert object's type.

## 2026-07-21 Reference-generation lint correction
- The remaining 10 backend ESLint errors were limited to type-only artifacts, Promise-compatible test doubles, one redundant client assertion, and redundant string-union literals in the reference-generation surface.
- `npm run lint -w backend` now exits 0 with 70 pre-existing warning-only diagnostics; focused reference-generation tests passed 5 suites and 32 tests.
