# Learnings

## 2026-07-21 Strict output verification
- The configured provider accepted Frame/Payload `response_format.type = json_schema` with `strict: true`; the old three-key partial Frame failure no longer occurred.
- Legacy `json_object` generation calls require the literal word `json` in a system or user message. Adding `Return only one raw JSON object` cleared that provider-side 400.
- The reference regenerator still returned a malformed batch payload, which was rejected as `REFERENCE_GENERATION_SHORTFALL` before any exam, item, or question write.
