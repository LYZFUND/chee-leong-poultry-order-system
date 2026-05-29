# CHEE LEONG Poultry Order System

Desktop order management system.

Copyright (c) 2026 Lee Wan Wu. All rights reserved.

## Stack

- Electron
- React
- TypeScript
- Vite / electron-vite
- Tailwind CSS
- React Router
- TanStack Table
- Recharts
- Supabase Auth and PostgreSQL
- electron-builder for macOS and Windows installers

## Manual Supabase Setup

1. Open your Supabase project: ``.
2. Go to **SQL Editor**.
3. Open this local file:
   `supabase`
4. Copy the full SQL content into Supabase SQL Editor.
5. Run the SQL.
6. Go to **Authentication > Users** and create the staff login user.
7. Go to **Project Settings > API**.
8. Copy:
   - Project URL
   - Publishable key
9. Create a local `.env` file.
10. Put your values into `.env`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Desktop Packaging

Build macOS installer on a Mac:

```bash
npm run dist:mac
```

Build Windows installer on a Windows machine:

```bash
npm run dist:win
```

Outputs are written to `release/`.

