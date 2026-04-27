# Travloger – Itinerary Builder

A full-stack CRM and itinerary/quote builder for Travloger. Supports **Fixed Group Departures** and **Customized Private Trips (FIT)** with premium mobile-first customer itinerary pages.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query |
| Client state | Zustand |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT (jose) + bcryptjs |

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm or npm

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/travloger_itinerary"
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
NEXT_PUBLIC_APP_URL="http://localhost:3001"
```

## Database Setup

```bash
# Install dependencies
npm install

# Push schema to database
npm run db:push

# Or run migrations
npm run db:migrate

# Seed demo data (Kerala, Hotels, Templates, Users)
npm run db:seed
```

## Running Locally

```bash
npm run dev
# App runs at http://localhost:3001
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@travloger.com | Travloger@123 |
| Sales | sales@travloger.com | Travloger@123 |
| Ops | ops@travloger.com | Travloger@123 |

## Folder Structure

```
itinerary-builder/
├── prisma/
│   ├── schema.prisma       # Complete database schema (30 models)
│   └── seed.ts             # Kerala demo data
├── src/
│   ├── app/
│   │   ├── admin/          # Admin CRM pages
│   │   │   ├── layout.tsx  # Sidebar navigation
│   │   │   ├── quotes/     # Quote management
│   │   │   ├── hotels/     # Hotel inventory
│   │   │   └── ...         # All master data pages
│   │   ├── api/v1/         # REST API routes
│   │   │   ├── auth/       # Login, logout, me
│   │   │   ├── quotes/     # Quote CRUD + pricing
│   │   │   └── public/     # Customer-facing APIs
│   │   ├── itinerary/[token]/  # Public customer page
│   │   └── login/          # Auth page
│   ├── lib/
│   │   ├── prisma.ts       # Prisma client singleton
│   │   ├── auth.ts         # JWT helpers + role checks
│   │   ├── api-response.ts # Consistent API response helpers
│   │   ├── generate-quote-number.ts  # Race-safe TRV-YEAR-CODE-NNNN
│   │   └── pricing/
│   │       ├── applyRoundingRule.ts
│   │       ├── calculateHotelCost.ts      # Night-by-night hotel cost
│   │       ├── calculateQuoteOption.ts    # Full quote breakdown
│   │       └── generateQuoteSnapshot.ts   # Immutable quote snapshots
│   ├── components/admin/   # Reusable admin UI components
│   └── middleware.ts       # Auth guard for admin routes
└── tests/
    └── pricing.test.ts     # Pricing engine unit tests
```

## How to Create a Quote

1. Navigate to `/admin/quotes` → **New Quote**
2. Choose **Group** or **Private** trip type
3. Enter customer details and trip parameters
4. Select a template — days and hotel tiers auto-fill
5. Choose vehicle type (auto-recommended based on pax)
6. Adjust hotel selections and room categories per option
7. Set profit markup (flat or %), GST %, and rounding rule
8. Click **Calculate Pricing** → backend calculates everything
9. Click **Publish** → creates immutable snapshot
10. Click **Send** → marks SENT and generates a public share link

## How the Public Itinerary Link Works

- Every quote has a `public_token` (cuid) generated at creation
- Customer link: `/itinerary/{public_token}`
- Page reads from `QuoteSnapshot.snapshot_json` — **never live tables**
- Opening the link triggers `quote_viewed` event and status → VIEWED
- Customer can select a package (calls `/api/v1/public/itinerary/{token}/select-option`)
- Customer approves (calls `/api/v1/public/itinerary/{token}/approve`)
- All interactions are logged as `QuoteEvent` records

## Role Permissions

| Action | ADMIN | MANAGER | SALES | OPS | FINANCE |
|--------|-------|---------|-------|-----|---------|
| Full access | ✅ | — | — | — | — |
| Create/edit quotes | ✅ | ✅ | ✅ (own) | — | — |
| Edit hotel rates | ✅ | — | — | ✅ | — |
| Override hotel cost | ✅ | ✅ | — | — | — |
| Approve discounts | ✅ | ✅ | — | — | — |
| View pricing/reports | ✅ | ✅ | — | — | ✅ |
| Manage masters | ✅ | — | — | ✅ | — |

## Adding New Hotel Rates

1. Go to `/admin/hotels` → select hotel → **Rates** tab
2. Click **Add Rate**
3. Choose room category, meal plan, season dates, and per-occupancy prices
4. The system prevents overlapping date ranges for the same room+meal combination
5. Rates take effect immediately for new quotes; existing published quotes are unaffected

## How the Pricing Engine Works

### Hotel Cost (`calculateHotelCost`)
- Generates an array of all stay nights (check-in to check-out)
- For each night, queries `HotelRate` with exact date match
- If **any night** has no rate → throws explicit error (never silently wrong)
- Applies weekend surcharge on Sat/Sun
- Calculates per-room cost based on occupancy (single/double/triple/quad)
- Returns itemized night-by-night breakdown

### Quote Option (`calculateQuoteOption`)
```
base_cost = hotel + vehicle + activity + transfer + misc
profit_amount = FLAT value OR PERCENTAGE of base_cost
selling_before_gst = base_cost + profit_amount - discount
gst_amount = selling_before_gst × gst%
final_price_raw = selling_before_gst + gst_amount
final_price = applyRoundingRule(final_price_raw)
price_per_adult = final_price / adults
```

### Quote Number Format
`TRV-{YEAR}-{STATE_CODE}-{RUNNING_NUMBER}` e.g. `TRV-2026-KER-0124`

Uses `QuoteSequence` table with database-level unique constraint on `(state_id, year)` to prevent race conditions.

## Running Tests

```bash
npm test
```

Tests cover: hotel cost calculation, rate gap detection, percentage/flat markup, GST, all rounding rules, price per adult, and quote option business rules.
