# CHEE LEONG Poultry Order System

Desktop order management system for poultry trading operations.

This application helps manage daily customer orders, farm purchases, product pricing, estimated purchase, sales, profit, actual purchase adjustments, customer deductions, farm payments, customer invoices, and reports.

Copyright (c) 2026 Lee Wan Wu. All rights reserved.

## Features

- Secure email/password login with Supabase Auth
- Customer, farm, area, product, farm price, and sales price management
- Daily order entry by customer, farm, product, weight, cage count, and pricing method
- Automatic calculation for weight-based and product-based orders
- Estimated purchase, sales, profit, actual purchase, and adjusted profit tracking
- Customer invoice preview with PDF/PNG export
- Customer payment, pending balance, bring-forward balance, and deduction tracking
- Farm payment and account payable tracking
- Dashboard summaries and reports
- CSV export for reporting
- macOS and Windows desktop installer builds

## Tech Stack

- Electron
- React
- TypeScript
- Vite / electron-vite
- Tailwind CSS
- React Router
- TanStack Table
- Recharts
- Supabase Auth
- Supabase PostgreSQL
- electron-builder

## Requirements

- Node.js 20 or newer recommended
- npm
- Supabase project
- macOS for building `.dmg`
- Windows or compatible cross-build environment for building Windows `.exe`

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file in the project root:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Do not commit `.env` to GitHub.

The app also supports the legacy variable name `VITE_SUPABASE_ANON_KEY`, but `VITE_SUPABASE_PUBLISHABLE_KEY` is preferred for new Supabase projects.

## Supabase Database Setup

Open your Supabase project, go to **SQL Editor**, and run the migration files in this order:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_farm_area_customer_assignments.sql
supabase/migrations/003_multiple_customer_areas_per_farm.sql
supabase/migrations/004_orders_page_customer_farm_area_support.sql
supabase/migrations/005_customer_invoice_payments_weights.sql
supabase/migrations/006_customer_payment_due_dates.sql
supabase/migrations/007_customer_payment_schedule.sql
supabase/migrations/008_farm_payment_allocations.sql
```

After the database is ready:

1. Go to **Authentication > Users**.
2. Create the staff login user.
3. Go to **Project Settings > API**.
4. Copy the Project URL and publishable key into `.env`.

Never use a Supabase secret key or service role key in this desktop renderer app.

## Run Locally

```bash
npm run dev
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Build Desktop Installers

Build macOS installer:

```bash
npm run dist:mac
```

Build Windows installer:

```bash
npm run dist:win
```

Build outputs are written to:

```text
release/
```

## GitHub Safety Notes

Before pushing this project to a public repository:

- Keep `.env` private.
- Keep `node_modules/`, `out/`, `dist/`, and `release/` out of Git.
- Do not commit Supabase secret keys or service role keys.
- Public/publishable Supabase keys are not secret, but this project still loads them from `.env` for clean setup.

Recommended `.gitignore`:

```gitignore
node_modules/
out/
release/
dist/

.env
.env.local
.env.*.local

.DS_Store
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
```

## License

This project is private/internal software.

Copyright (c) 2026 Lee Wan Wu. All rights reserved.
