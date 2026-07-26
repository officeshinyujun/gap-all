---
slug: reference-frame-planner-recovery
status: approved
intent: clear
review_required: false
pending-action: write .omo/plans/reference-frame-planner-recovery.md
approach: Repair union narrowing, recover only the observed trusted-reference echo, then prove the real job path.
---

# Draft: reference-frame-planner-recovery

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| planner-contract | Compile-safe planned/rejected result handling | active | `backend/src/exams/reference-frame-planner.service.ts:66-110` |
| echo-recovery | Recover only the exact trusted-reference echo shape | active | job `ddcec979-38fe-4dba-9326-7bd285ebb907`; `reference-frame-planner.service.ts` |
| verification | Prove fallback and real omitted-sourceType persistence | active | `backend/src/exams/reference-frame-planner.service.spec.ts`; `backend/src/exams/exams.service.ts` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Model echo recovery | Accept only the observed source-reference key set | Trusted request data can deterministically supply the Frame; generic malformed output remains unsafe | yes |

## Findings (cited - path:lines)
- `bindRequestContext()` already corrected the prior missing `unitRange` omission in `backend/src/exams/reference-frame-planner.service.ts:66-70`.
- The latest live planner response echoed a reference object rather than returning a Frame, with keys `choices`, `questionNumber`, `source`, `stem`, `stimulus`, `targetConcepts`, and `unitNumber`.
- The current unverified fallback fails typecheck because `frameResult` is accessed as a rejected union member after a ternary expression at `backend/src/exams/reference-frame-planner.service.ts:72-82`.
- Unit tests pass for the new happy path, but typecheck fails; the real job has not been rerun after a compiler-clean change.

## Decisions (with rationale)
- Split planned/rejected control flow before reading rejection-only fields. This preserves TypeScript discriminated-union narrowing.
- Build a deterministic Frame only when the response has the exact observed echo signature, independent of property order. Do not weaken `validateReferenceFrameJson()` or drop arbitrary unknown fields.
- Keep explicit `sourceType: "ai"` behavior unchanged.

## Scope IN
- Planner service branch repair and guarded echo fallback.
- Positive and negative planner tests.
- Build, restart, live authenticated job, and persistence verification.

## Scope OUT (Must NOT have)
- No generic unknown-field acceptance.
- No frontend changes.
- No change to the explicit AI generator path.

## Open questions
- None. The fallback policy follows the existing strict-contract and trusted-reference boundaries.

## Approval gate
status: approved
Proposed implementation plan: first restore compiler-safe union branching, then make the observed echo the sole recoverable model deviation, lock it with positive and near-miss rejection tests, and finally verify a real omitted-`sourceType` job through database persistence.
