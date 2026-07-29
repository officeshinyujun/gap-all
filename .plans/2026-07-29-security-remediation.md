# Security Remediation Plan

## Goal

Remediate the confirmed authorization, data disclosure, CSRF, storage privacy,
resource-exhaustion, logging, header, and dependency findings from the 2026-07-29
security review without changing intended study flows.

## Scope and decisions

- Restrict shared study content, cache, and embedding management operations to admins.
- Replace arbitrary question-ID answer retrieval with an ownership- and completion-checked
  review endpoint.
- Bind Google OAuth state to a short-lived signed browser cookie; reject invalid or reused state.
- Protect cookie-authenticated mutations with an allowlisted Origin check. This is compatible
  with the existing cross-origin credentialed frontend API architecture.
- Store chat images in a private bucket and issue signed URLs only after chat-session ownership
  verification.
- Add bounded request DTOs, per-user generation concurrency protection, and verification-code
  expiry cleanup.
- Upgrade only dependencies whose safe patched versions can be resolved and test them; do not
  use `npm audit fix --force`.

## Non-goals

- Rework product authorization roles beyond the existing admin/user model.
- Migrate hosting or Supabase accounts.
- Treat deployment-proxy HSTS as an application configuration change.

## Phases

- [x] Restrict study management routes and protect answer retrieval; add controller/service tests.
- [x] Implement OAuth-state and mutation-Origin protections; add auth tests.
- [x] Make chat uploads private, remove message content logs, and add bounded chat DTOs/tests.
- [x] Bound verification-code storage and AI-generation concurrency/input work.
- [x] Add dashboard headers, strengthen ignore rules, and update vulnerable dependencies.
- [ ] Run lint, unit tests, builds, audit, and targeted curl-style verification; record results.

## Affected files

- `backend/src/study/{study.controller.ts,study.service.ts,dto/*}`
- `backend/src/auth/{auth.controller.ts,auth.service.ts}` and common request protection helpers
- `backend/src/chat/{chat.controller.ts,chat.service.ts,chat-image-upload.service.ts,dto/*}`
- `backend/src/exams/{exams.service.ts,exam-generation-jobs.service.ts,dto/*}`
- `backend/src/{app.module.ts,main.ts}`
- `frontend/lib/studyQuizApi.ts` and related review callers, if the answer API contract changes
- `dashboard/next.config.ts`, `.gitignore`, workspace manifests and lockfiles

## Acceptance criteria

- Non-admins receive `403` from shared-content, cache, and embedding management routes.
- An unsubmitted exam cannot reveal `correctAnswer` or explanations through a supplied ID.
- Invalid/reused OAuth state and cross-origin cookie mutations are rejected.
- Uploaded chat images require the owning user and use an expiring signed URL.
- Chat content is absent from logs; large messages and excess AI work are rejected/queued.
- Expired verification-code entries are removed.
- Dashboard responses carry CSP, anti-framing, nosniff, referrer, and permissions policies.
- Targeted tests, builds, and `npm audit` results are recorded below.

## Verification results

- Focused study tests: passed (30 tests).
- Focused auth tests: passed (15 tests).
- Focused chat/exam tests: passed (45 tests).
- `npm run build -w backend`: passed.
- `npm run build -w frontend`: passed with existing chunk-size warnings.
- Full backend Jest suite: 594 passed, 2 failed in existing reference-generation and
  simply-reference-generation suites.
- `npm run lint -w backend`: failed in the existing broad test-source typecheck.
- `npm run build -w dashboard`: passed after normalizing Turbopack's workspace
  root and resolving its Sass and Recharts peer dependencies.
- Remaining audit advisories require follow-up; the dependency install reports five high
  severity vulnerabilities. A full audit remains pending.
