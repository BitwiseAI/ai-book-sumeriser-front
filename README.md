# Insta-Read • Conversational (MVP)

A minimal, beautiful UI to chat with books. Built with Vite + React + TypeScript + Tailwind CSS, using `framer-motion` and `lucide-react` for motion and icons.

## Run locally

1. Install dependencies

```bash
npm install
```

2. Start dev server

```bash
npm run dev
```

3. Open the app

Vite will print a Local URL (usually http://localhost:5173). Open it in your browser.

## Build for production

```bash
npm run build
npm run preview
```

## Notes
- This MVP uses demo data and local state only. No backend required.
- Styling is Tailwind-first; no external UI kit required.
- You can wire the chat to your backend later by replacing the placeholder `handleSend` logic in `src/App.tsx`.
