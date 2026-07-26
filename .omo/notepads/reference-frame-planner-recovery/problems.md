# Problems

## 2026-07-21 Live provider shape
- The model returned an original reference-shaped object rather than a strict `ReferenceFrame`; no generic schema relaxation is permitted.

## 2026-07-21 Distinct live shape after exact-echo repair
- The provider instead returned only `questionNumber`, `source`, and `unitNumber` during both frame attempts. This is not the repaired seven-key selected-reference echo and remains a strict `UNKNOWN_FIELD` rejection.
