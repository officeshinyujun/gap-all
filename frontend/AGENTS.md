# GAP Frontend

This is a React + Vite SPA. The entry point is `src/main.tsx`; route modules remain under `app/` for file organization but are rendered through React Router. Do not add Next.js dependencies or treat `app/layout.tsx` and `next.config.ts` as part of the Vite build.

## Layout and Style

- Use `VStack` and `HStack` from `@/components/general` for component layout.
- Keep shared UI styles in CSS Modules and use tokens from `styles/variables.scss`; do not introduce raw color values.
- Preserve the existing Vite aliases from `vite.config.ts`: `@`, `@shared`, `@features`, `@entities`, and `@widgets`.

## Question Rendering Ownership

- `shared/ui/QuestionStem` owns the live Web question renderer and is used by exam, review, study, and chat surfaces.
- `components/exam/ExamPdf/ExamPdfDocument.tsx` and `PdfStimulusRenderer.tsx` own downloadable PDF output.
- `components/exam/QuestionStem` is not a target for new rendering features in this scope.
- Dashboard renderers remain text-only unless a separate dashboard task explicitly expands their scope.
