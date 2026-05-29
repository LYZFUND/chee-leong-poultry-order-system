# CHEE LEONG Poultry Order System

Desktop order management system for **CHEE LEONG POULTRY TRADING**.

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

1. Open your Supabase project: `CHEE LEONG POULTRY TRADING`.
2. Go to **SQL Editor**.
3. Open this local file:
   `supabase/migrations/001_initial_schema.sql`
4. Copy the full SQL content into Supabase SQL Editor.
5. Run the SQL.
6. Go to **Authentication > Users** and create the staff login user.
7. Go to **Project Settings > API**.
8. Copy:
   - Project URL
   - Publishable key
9. Create a local `.env` file from `.env.example`.
10. Put your values into `.env`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Never put a Supabase secret key or service-role key in this desktop renderer app.

### Existing Database Updates

If you already ran `001_initial_schema.sql` before farm-specific areas were added, run this extra migration in Supabase SQL Editor:

```text
supabase/migrations/002_farm_area_customer_assignments.sql
```

If you already ran migration `002`, also run this latest migration so each customer can select multiple areas under the same farm:

```text
supabase/migrations/003_multiple_customer_areas_per_farm.sql
```

For the new `/orders` page and explicit farm-to-area lookup, run this latest migration after the earlier migrations:

```text
supabase/migrations/004_orders_page_customer_farm_area_support.sql
```

After running it:

1. Go to **Areas** in the app and assign each area to the correct farm.
2. Go to **Customers** and choose every farm each customer can order from.
3. For each selected farm, choose one or more related areas.
4. Go to **Sales Prices** and add prices by farm. Use **All Areas** to apply the same price to all areas under that farm, or use **Update All Areas Price** to change them together later.

## Local Development

This project was generated manually because the current shell has Node.js but no `npm` command available.
After `npm` is available:

```bash
cd "/Users/henrylee/Documents/Company System/chee-leong-poultry-order-system"
npm install
npm run dev
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

## Important Business Rules Implemented

- Currency displays in Malaysian Ringgit.
- Dates display with day name, for example `2026-05-26, Tuesday`.
- Default cage weight is stored in settings and defaults to `8kg`.
- Weight-based formula:
  - cage deduction weight = cage count x cage weight
  - net weight = gross weight - cage deduction weight
  - cost = net weight x farm price
  - sales = net weight x sales price
  - profit = sales - cost
- Product-based formula:
  - cost = product quantity x farm price
  - sales = product quantity x sales price
  - profit = sales - cost
- Customer deduction reduces sales.
- Adjusted profit uses actual cost when actual cost exists; otherwise it uses estimated cost.
- Farm deductions are tracked separately and reflected in farm balance reporting.

## Main Files

- `supabase/migrations/001_initial_schema.sql` - Supabase schema, RLS, grants, indexes, triggers, views
- `src/renderer/src/services/calculationService.ts` - order and deduction formulas
- `src/renderer/src/services/supabaseClient.ts` - Supabase client
- `src/renderer/src/services/*Service.ts` - CRUD and report services
- `src/renderer/src/pages/OrdersPage.tsx` - daily customer order entry at `/orders`
- `src/renderer/src/pages/DailyOrdersPage.tsx` - legacy daily order entry/detail workflow
- `src/renderer/src/pages/CostSalesProfitPage.tsx` - daily/monthly/yearly profit report
- `src/renderer/src/pages/FarmDetailPage.tsx` - farm report, balance, payments, deduction policy

## Recommended Next Improvements

- Add Supabase-generated TypeScript database types after the schema is live.
- Add row-level roles if the company later needs admin/staff permissions.
- Add PDF export for accountant-ready reports.
- Add receipt/document upload with Supabase Storage if needed.
- Add automated tests around calculations and report export.
