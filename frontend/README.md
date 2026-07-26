# GAP Frontend

This workspace is a React + Vite single-page app using React Router.

## Development

Run the Vite dev server from the repository root:

```bash
npm run dev -w frontend
```

The default local URL is printed by Vite, usually `http://localhost:5173`.

## Build And Preview

```bash
npm run build -w frontend
npm run start -w frontend
```

The production build output is `frontend/dist`.

## Environment

The app reads `NEXT_PUBLIC_API_URL` for compatibility with the previous frontend environment. `VITE_API_URL` is also supported. If neither is set, the API base URL defaults to `http://localhost:3001`.

Push notifications read `NEXT_PUBLIC_VAPID_PUBLIC_KEY` or `VITE_VAPID_PUBLIC_KEY`.

## Static SPA Fallback

Because this is a Vite SPA, the static host must rewrite frontend deep links to `index.html` while still serving assets normally. Paths such as `/study/success`, `/exam/success/create`, `/review`, and `/auth/google/callback` must return `frontend/dist/index.html` on direct refresh instead of a 404.

Do not rewrite API requests or static assets. Configure the chosen deployment platform with a catch-all fallback to `index.html` for frontend routes only.
