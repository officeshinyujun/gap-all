# Frontend simply-reference-only generation

## Scope

Restrict the live frontend exam-creation surfaces to the simple reference-based
generation path. Remove alternate generation-mode controls and always submit
`sourceType: 'simply_reference'`.

## In scope

- [x] Remove AI/reference source-mode choices from `CreateExamModal`.
- [x] Always include `simply_reference` in the modal job request.
- [x] Update frontend API type contracts that can create generation jobs.
- [x] Build and lint the frontend.

## Out of scope

- [ ] Remove backend support for other source types.
- [ ] Change historical exam display types.
- [ ] Browser tests.

## Verification

Run in `frontend/`:

```bash
npm run build
npm run lint
```

## Verification results

- PASS: `npm run build`.
- PASS: `npm run lint`.
- Browser testing not run by request.
