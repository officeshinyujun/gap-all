---
slug: reference-generation-runtime-cutover
intent: clear
review_required: false
status: planned
classification: architecture
scope:
  in:
    - Route sourceType=reference generation jobs through the catalog-backed blueprint/batch pipeline.
    - Preserve the existing frontend request, job-progress, and completed-exam contracts.
    - Persist completed and failed reference generation runs with atomic exam materialization.
    - Verify behavior with deterministic mocked-provider and API/job contract tests.
  out:
    - Real provider calls, disposable-DB manual jobs, corpus re-imports, and browser E2E.
decisions:
  - Keep the frontend protocol unchanged; the backend cutover is transparent to callers.
  - Retain typed capacity failures and assert no partial exam artifacts.
  - Test strategy: TDD with mocked model/provider and catalog fixtures; no real-provider execution.
components:
  - id: frontend-contract
    outcome: Existing reference creation and job polling payloads remain compatible.
    status: grounded
    evidence: frontend client/components queried; backend createJob response contract in backend/src/exams/exams.service.ts.
  - id: reference-runtime-routing
    outcome: sourceType=reference reaches blueprint/batch orchestration instead of the legacy generator.
    status: grounded
    evidence: backend/src/exams/exams.service.ts:createReferenceFrameExam currently calls ReferenceFrameGenerationService.generate.
  - id: persistence-and-audit
    outcome: completed jobs atomically materialize exam data and all terminal outcomes are auditable.
    status: grounded
    evidence: backend/src/exams/reference-generation-persistence.ts and generation-runs surface.
  - id: automated-verification
    outcome: mocked provider and controller/job contract tests prove the frontend-visible outcome without real jobs.
    status: grounded
    evidence: existing backend Jest specs and job APIs.
approval:
  status: approved
  source: User requested plan recreation after accepting frontend-compatible, no-real-test scope.
  next_action: await user decision to start execution or request high-accuracy plan review
---

# Reference Generation Runtime Cutover Draft

The completed plan at `.omo/plans/reference-generation-runtime-cutover.md` preserves frontend contracts while replacing the reference runtime path and testing it with deterministic mocks rather than actual provider/browser runs. Metis review findings were incorporated: catalog payload adaptation, explicit provider boundary, sync/job routing, omitted sourceType compatibility, atomic persistence, and frontend-visible job contracts.
