---
slug: reference-frame-structured-output
status: approved
intent: clear
review_required: false
pending-action: write .omo/plans/reference-frame-structured-output.md
approach: Replace permissive JSON-object planning requests with stage-specific strict JSON Schemas, classify unsupported/refusal/truncation responses, and validate a real omitted-sourceType job.
---

# Draft: reference-frame-structured-output

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| schema-contract | Generate provider-compatible JSON Schema for Frame and Payload from existing strict contracts | active | `backend/src/exams/reference-frame.frame-validator.ts`; `reference-frame.payload-validator.ts` |
| model-client | Send stage-specific strict structured-output requests and classify capability/refusal/truncation failures | active | `backend/src/exams/reference-frame-planner.model-client.ts:22-53` |
| regression | Prove schema selection, unsupported-provider behavior, and one real omitted-sourceType job | active | `.omo/evidence/reference-frame-planner-recovery/task-2.md:24-35` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- |
| Structured output support | Fail closed with a typed `MODEL_STRUCTURED_OUTPUT_UNSUPPORTED` error if the configured provider/model rejects `json_schema` | A silent fallback to `json_object` recreates the production partial-object failure | yes |
| Schema scope | Use separate strict schemas for Frame and Payload, not a single union schema | Each planner stage has different required fields and is already validated separately | yes |

## Findings (cited - path:lines)
- The current client requests `response_format: { type: 'json_object' }` in `backend/src/exams/reference-frame-planner.model-client.ts:28-40`; this enforces JSON syntax but not required Frame fields.
- The actual authenticated job `94a2b7ac-37d2-43c5-bbe2-f79255b3f610` produced only `questionNumber`, `source`, and `unitNumber` across two attempts, then correctly failed without persistence. Evidence: `.omo/evidence/reference-frame-planner-recovery/task-2.md:24-35`.
- OpenAI Chat Completions structured outputs use `response_format.type: "json_schema"`, `json_schema.strict: true`, root `required` fields, and `additionalProperties: false` (OpenAI API docs via Context7).

## Decisions (with rationale)
- Do not broaden deterministic echo recovery to the three-key provider response; it lacks trusted source text and choice content needed to build a Frame safely.
- Use strict schemas at the provider boundary and retain existing server-side validators as defense in depth.
- Treat a provider/model that cannot honor strict structured outputs as a typed configuration/capability failure, not as a retryable malformed Frame.

## Scope IN
- Strict Frame/Payload JSON Schema definitions and model client request typing.
- Stage-aware provider failure classification and focused mock tests.
- One real backend job/DB verification after capability preflight succeeds.

## Scope OUT (Must NOT have)
- No generic recovery for partial Frame objects.
- No frontend or explicit AI routing changes.
- No mutation of existing parsed references or database schema.

## Open questions
- None. The fail-closed capability behavior is the conservative default for the existing strict generation contract.

## Approval gate
status: approved
Proposed split: first define provider schemas from the existing contracts, then integrate strict stage-aware output requests and typed error classification, then run mock and one real provider/database verification. Existing `reference-frame-planner-recovery` remains paused after documenting its legitimate three-key failure.
