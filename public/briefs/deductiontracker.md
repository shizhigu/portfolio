# DeductionTracker (DeduX)

## 1. One-Liner

A full-stack expense tracking and tax deduction management platform with dual Web (Next.js) and Mobile (React/Vite) clients, powered by a shared component architecture, a unified Express API, and a PostgreSQL database on Neon -- built to help freelancers and small-business owners capture receipts, classify expenses, and maximize tax savings at filing time.

---

## 2. The Problem

Freelancers, independent contractors, and small-business owners face a specific and persistent pain point: they spend money throughout the year on supplies, software, travel, meals, and marketing, but when tax season arrives they scramble to reconstruct which expenses were business-related, which are tax-deductible, and at what percentage. The result is one of two outcomes -- either they miss legitimate deductions and overpay in taxes, or they waste hours (and accountant fees) manually sorting through bank statements and shoe-boxes of receipts.

Existing tools tend to fall into two buckets. Enterprise expense platforms like SAP Concur or Expensify are designed for corporate reimbursement workflows and are overkill for a solo operator. Consumer budgeting apps like Mint or YNAB focus on personal finance and do not model the business/personal distinction, partial deductibility percentages, or tax-report generation that freelancers need. There is a gap for a lightweight, purpose-built tool that:

- Distinguishes business expenses from personal ones at entry time.
- Models partial deductibility (for example, a car used 75 percent for business).
- Provides real-time visibility into estimated tax savings.
- Generates exportable reports (PDF, CSV) grouped by category and date range for an accountant.
- Works seamlessly on both desktop and mobile, because most receipts are captured on the go with a phone camera.

DeductionTracker (branded "DeduX" in the UI) was built to fill that gap.

---

## 3. The Solution

DeduX is a full-stack application with three major surfaces:

**Web Dashboard (Next.js App Router)** -- A desktop-oriented experience at `app/` that provides a rich, data-dense dashboard with interactive charts (Recharts + Chart.js), summary KPI cards, category breakdowns, and an expenses management page. It uses Material UI alongside shadcn/ui for a polished, professional interface. The dashboard shows today's spend, monthly deductible totals, and estimated tax savings at a glance. A floating "Quick Add" button lets users scan a receipt, add an expense manually, or set up a recurring expense.

**Mobile Client (React + Vite + Wouter)** -- A mobile-first SPA at `client/` that ships its own routing via Wouter, a minimal React router. The mobile client is always forced into mobile layout mode (`isMobileOverride={true}`) so it renders bottom-tab navigation, a hamburger-menu drawer, and horizontally scrollable stat cards regardless of viewport width. It includes a dedicated receipt-capture flow that activates the device camera via the native HTML file input with `capture=environment`, previews the photo, and lets the user tag the vendor, amount, category, and deductibility before saving.

**Shared Component Library** -- A `shared/` directory that both clients import. It contains the `AppLayout` (responsive shell that auto-switches between sidebar and mobile-tab layouts based on screen width and device type), `Sidebar`, `MobileHeader`, `MobileFooter`, `MobileMenu`, `Logo`, and `UserProfile` components. This architecture ensures that navigation structure, branding, and user-profile display are consistent across both clients without code duplication.

**Unified API Server (Express)** -- A single Express server at `server/` that exposes RESTful endpoints under `/api` for users, categories, expenses (full CRUD), reports, and four summary/analytics endpoints (today's total, monthly deductible, tax savings, category breakdown). In development, the server also mounts Vite as middleware to serve the mobile client with hot-module replacement. In production, it serves pre-built static assets.

**Database (PostgreSQL on Neon, Drizzle ORM)** -- Four tables -- `users`, `categories`, `expenses`, and `reports` -- defined in a shared schema (`shared/schema.ts`) with Drizzle ORM and validated with Zod via `drizzle-zod`. The Neon serverless driver connects over WebSockets, enabling deployment on edge/serverless platforms. An `initDb.ts` script seeds the database with a demo user, five default categories, and sample expenses on first run. Both a `MemStorage` (in-memory) and `DatabaseStorage` (PostgreSQL) implementation exist behind a common `IStorage` interface, making it trivial to swap storage backends.

**State Management** -- The Next.js web app uses Zustand stores (`use-expense-store`, `use-user-store`) for client-side state with built-in async actions for fetching, creating, updating, and deleting expenses. The mobile client uses TanStack React Query for server-state caching and cache invalidation.

---

## 4. Architecture Overview

```
                       +-------------------------------+
                       |         PostgreSQL (Neon)      |
                       |  users | categories | expenses |
                       |              reports            |
                       +---------------+---------------+
                                       |
                              Drizzle ORM + Neon WS
                                       |
                       +---------------v---------------+
                       |      Express API Server        |
                       |   /api/users  /api/categories  |
                       |   /api/expenses (CRUD)         |
                       |   /api/reports                 |
                       |   /api/summary/*               |
                       +------+----------------+-------+
                              |                |
               +--------------+--+      +------+-----------+
               |  Vite Dev (HMR) |      | Next.js API Route|
               |  (development)  |      | /api/expenses    |
               +--------+--------+      +--------+---------+
                        |                         |
               +--------v--------+      +---------v--------+
               |  Mobile Client  |      |    Web Client     |
               |  React + Wouter |      | Next.js App Router|
               |  Vite-bundled   |      | shadcn + MUI      |
               |  TanStack Query |      | Zustand stores    |
               +--------+--------+      +---------+--------+
                        |                          |
               +--------v--------------------------v--------+
               |            shared/ components              |
               |  AppLayout | Sidebar | MobileNav | Logo    |
               |  UserProfile | schema.ts (Drizzle+Zod)    |
               +--------------------------------------------+
```

**Data flow:**

1. User interacts with the web or mobile UI.
2. Client makes a `fetch` call to `/api/*`.
3. Express routes validate input with Zod schemas, call the `DatabaseStorage` layer.
4. Drizzle ORM translates to SQL, Neon executes over WebSocket.
5. Response travels back up the stack; React Query or Zustand caches and renders.

The Next.js app also has its own `app/api/expenses/route.ts` that connects directly to the database via its own Drizzle client, demonstrating a parallel server-side path for the web app that bypasses Express entirely.

---

## 5. Technical Deep Dive

### 5.1 Dual-Schema Strategy

The project maintains two schema definitions. The "canonical" schema lives at `shared/schema.ts` and is used by the Express server and mobile client. A parallel schema at `app/database/schema.ts` is used by the Next.js API routes. Both define the same four tables but with slight implementation differences (the shared schema uses `text()` and `doublePrecision()` columns, while the app schema uses `varchar()` and `decimal()`). This mirrors a real-world pattern where a monorepo evolves two entry points that gradually converge.

### 5.2 Storage Abstraction via Interface

The `IStorage` interface in `server/storage.ts` defines 18 methods covering user, category, expense, report, and summary operations. Two concrete classes implement it:

- `MemStorage` -- An in-memory Map-based store with auto-incrementing IDs. Useful for rapid prototyping and testing without a database connection.
- `DatabaseStorage` -- The production implementation that delegates every method to Drizzle queries against PostgreSQL/Neon. Summary methods use raw SQL aggregations (`COALESCE(sum(...))`) for performance.

Switching between them is a one-line change: `export const storage = new DatabaseStorage();`.

### 5.3 Responsive Layout System

The `AppLayout` component in `shared/layout/AppLayout.tsx` implements a hybrid responsive strategy:

1. **Automatic detection** -- Uses `react-device-detect` to check if the user agent is a mobile device, and also listens to `window.resize` events with a 1024px breakpoint.
2. **Explicit override** -- The mobile client passes `isMobileOverride={true}` to force mobile layout regardless of screen size. The web client omits this prop and lets auto-detection govern.

When in mobile mode, the layout renders a fixed-position header (with hamburger menu, logo, search, notifications, and profile) and a fixed-position bottom tab bar (with an optional floating action button centered above it). When in desktop mode, it renders a 256px-wide sidebar with logo, navigation links, and a user profile footer.

### 5.4 Receipt Capture Pipeline

The `ReceiptCapture` component (`client/src/components/receipts/ReceiptCapture.tsx`) implements a multi-step receipt workflow:

1. Opens a `Dialog` overlay.
2. Triggers the device camera via an `<input type="file" accept="image/*" capture="environment">` element.
3. Reads the selected file with `FileReader` for an in-browser preview.
4. Presents a form pre-populated with default values (vendor, amount, category) -- in a production version this would be populated by OCR.
5. On submit, creates the expense via a `useMutation` that POSTs to `/api/expenses` and then invalidates all related React Query cache keys (expenses, today's total, monthly deductible, tax savings, category breakdown).

### 5.5 Tax Calculation Engine

Tax savings are calculated server-side with a configurable tax rate (currently defaulted to 21 percent, matching the US corporate tax rate). The formula is:

```
tax_savings = SUM(amount * deductible_percentage / 100 * tax_rate)
```

This is computed in a single SQL query using `COALESCE` to handle empty result sets. The `deductible_percentage` column (0-100 integer) allows partial deductions, modeling real-world scenarios like a vehicle used 75 percent for business or a home office that covers 300 square feet of a larger home.

### 5.6 Dashboard Analytics

The web dashboard (`app/(main)/dashboard/page.tsx`, at over 1600 lines) is the most feature-rich view. It integrates:

- **Recharts** for interactive PieChart, LineChart, AreaChart, and BarChart components showing spending trends and category breakdowns.
- **Material UI** for Grid layouts, Paper surfaces, Chips, Tabs, LinearProgress bars, Lists, Avatars, Dividers, and a Fab (floating action button) with a dropdown Menu for quick-add actions.
- **shadcn/ui Cards** for summary KPI displays.

The mobile dashboard is leaner, using Chart.js (canvas-based doughnut chart) for the category breakdown and a custom horizontally-scrollable stat-card carousel.

### 5.7 Client-Side Filtering

Both clients implement multi-dimensional expense filtering:

- **Date range** (start/end dates, with presets: this month, last month, this quarter, this year)
- **Business-only toggle**
- **Tax-deductible-only toggle**
- **Category filter** (dropdown)
- **Free-text search** (vendor name, notes/description)

The Zustand store in the web app centralizes filter state and exposes a `getFilteredExpenses()` computed method that chains all active filters.

---

## 6. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Web Framework** | Next.js 15 (App Router) | Server components, file-based routing, API routes |
| **Mobile Framework** | React 18 + Vite 5 | Fast HMR, optimized builds for the mobile SPA |
| **Routing (mobile)** | Wouter 3 | Minimal (1.5 KB) React router for the Vite client |
| **API Server** | Express 4 | REST endpoints, middleware, Vite dev server mount |
| **Database** | PostgreSQL (Neon Serverless) | Cloud-hosted Postgres with WebSocket connections |
| **ORM** | Drizzle ORM | Type-safe SQL builder with schema-first migrations |
| **Validation** | Zod + drizzle-zod | Runtime input validation, schema-to-type generation |
| **State (web)** | Zustand 5 | Lightweight global stores with async actions |
| **State (mobile)** | TanStack React Query 5 | Server-state caching, background refetching, cache invalidation |
| **UI (web)** | shadcn/ui + Radix UI + MUI 7 | Accessible component primitives + Material Design |
| **UI (mobile)** | shadcn/ui + Radix UI | Consistent component library across clients |
| **Charts** | Recharts + Chart.js 4 | Interactive SVG charts (web) and canvas charts (mobile) |
| **Styling** | Tailwind CSS 3 + Framer Motion | Utility-first CSS with animation support |
| **Icons** | Lucide React + React Icons | Consistent icon set across both clients |
| **Forms** | React Hook Form + @hookform/resolvers | Declarative form handling with Zod resolver |
| **Auth** | Passport.js (local strategy) | Session-based authentication (scaffolded) |
| **Build** | Vite + esbuild | Client bundling (Vite) and server bundling (esbuild) |
| **TypeScript** | TypeScript 5.6 | End-to-end type safety across all layers |
| **Migrations** | Drizzle Kit | Schema push and migration generation |

---

## 7. Challenges & Solutions

### Challenge 1: Sharing Components Between Two React Apps with Different Routers

The web client uses Next.js `Link` (from `next/link`) while the mobile client uses Wouter's `Link`. Navigation components like the sidebar and mobile nav need to render links that work in both contexts.

**Solution:** The shared components import `Link` from `next/link` as a default, which works natively in the Next.js app. For the mobile client, the shared components are consumed through path aliases (`@shared/*`), and the Wouter-based `App.tsx` wraps them in a context that provides compatible navigation. The `AppLayout` accepts `sidebar`, `header`, and `footer` as render props, so each client can pass its own router-aware navigation components while reusing the layout shell.

### Challenge 2: Serving Two Clients from One Server

In development, the Express server needs to serve the Vite-powered mobile client with HMR, while the Next.js web client runs its own dev server. In production, both need to be deployable.

**Solution:** The Express server conditionally mounts Vite middleware in development mode (`setupVite`) and serves static files in production (`serveStatic`). The catch-all route serves `client/index.html` for the mobile SPA. The Next.js app runs independently with its own `next dev` / `next build` pipeline and can be deployed to Vercel or any Node.js host. The API endpoints are shared -- both clients hit the same `/api/*` routes.

### Challenge 3: iOS Camera Access for Receipt Capture

Early iterations of the receipt capture feature attempted to use `navigator.mediaDevices.getUserMedia()` to access the camera directly, which proved unreliable across iOS Safari versions and required explicit HTTPS.

**Solution:** Switched to the native HTML file input approach with `<input type="file" accept="image/*" capture="environment">`. This delegates camera access to the operating system's native camera UI, sidestepping browser-specific WebRTC issues entirely. The git history shows multiple iterations (`Fixes camera access on iOS`, `Fixes receipt photo capture`, `Fixes mobile receipt capture issues`) documenting this evolution.

### Challenge 4: Consistent Responsive Behavior Across Two Clients

The web client needs to be responsive (desktop sidebar to mobile bottom-tabs) while the mobile client should always show mobile layout even on a tablet or desktop browser.

**Solution:** The `AppLayout` component accepts an `isMobileOverride` prop. The mobile client passes `true` to force mobile mode. The web client omits it, letting the component auto-detect based on `react-device-detect` and a 1024px resize listener. This single layout component handles both use cases without conditional imports or platform-specific code.

### Challenge 5: Two Schema Definitions Drifting Apart

Having both `shared/schema.ts` (for Express) and `app/database/schema.ts` (for Next.js) risks schema drift where columns or types diverge.

**Solution:** Both schemas define the same logical tables with the same column names and constraints. Drizzle Kit's `db:push` command synchronizes the canonical shared schema to the database, which is the source of truth. The Next.js schema mirrors it for type-safe queries in API routes. The long-term plan (noted in the README's migration guide) is to converge on a single schema imported by both clients.

---

## 8. What I Learned

### Full-Stack Type Safety Is Worth the Setup Cost

Using Drizzle ORM with `drizzle-zod` to auto-generate Zod schemas from database table definitions, then using those schemas for both API input validation and TypeScript type inference, eliminates an entire class of bugs. When I added the `deductiblePercentage` column to the expenses table, the type change propagated from the schema definition through the API validators to the React component props without a single manual type annotation update.

### Shared Component Libraries Need Router Abstraction

The biggest friction in sharing components between Next.js and Wouter was navigation links. I learned that shared UI libraries should either (a) accept navigation primitives as props or render props, or (b) use a context-based router adapter pattern. The render-prop approach I used (passing `sidebar`, `header`, `footer` into `AppLayout`) was the simpler path and kept the shared components free of router-specific dependencies.

### Mobile Camera APIs Are Fragile -- Use Native Inputs

I spent significant time trying to make `getUserMedia` work reliably for receipt capture on iOS Safari. The lesson: when you just need a photo from the user, the native `<input capture="environment">` approach is dramatically more reliable and requires zero permissions prompting. The tradeoff is less control over the camera UI, but for a receipt-capture use case that tradeoff is entirely acceptable.

### In-Memory Storage Accelerates Early Development

Having the `MemStorage` class alongside `DatabaseStorage` behind a common interface meant I could prototype the entire UI and API contract without provisioning a database. I built all the dashboard components, receipt capture flow, and tax report generation against in-memory data, then switched to Neon Postgres in a single line change once the schema stabilized. This pattern is now something I use in every project.

### Dual UI Libraries Can Coexist (But Pick One)

The web dashboard mixes Material UI and shadcn/ui components. While this works technically (MUI for data-dense layouts and Charts, shadcn for form controls and dialogs), it increases bundle size and creates visual inconsistency in border radii, spacing, and interaction patterns. In retrospect, I would standardize on one library and use the other only for components the primary library lacks.

### SQL Aggregations Beat Client-Side Computation

Early versions computed tax savings and category breakdowns by fetching all expenses to the client and reducing them in JavaScript. Moving these to SQL aggregations (`SUM`, `COALESCE`, `GROUP BY`) in the `DatabaseStorage` class reduced response times and eliminated loading-spinner delays on the dashboard, especially as the sample data grew.

---

## 9. Motivation & Context

I built DeductionTracker during a period where I was freelancing and needed to track my own business expenses for quarterly tax estimates. The existing apps I tried either lacked the business/personal distinction or did not model partial deductibility -- two features that are critical for anyone who uses their car, home office, or phone for both business and personal purposes.

The project also served as a deliberate learning exercise in several areas:

- **Next.js App Router** -- I wanted hands-on experience with React Server Components, the new file-based routing conventions, and colocated API routes.
- **Shared component architecture** -- I was curious whether a single `shared/` directory could realistically serve both a Next.js app and a Vite-bundled SPA without ejecting from either framework's conventions.
- **Neon Serverless Postgres** -- I wanted to try a serverless database that connects over WebSockets, which opens the door to edge deployment without traditional connection pooling.
- **Drizzle ORM** -- After using Prisma on previous projects, I wanted to evaluate Drizzle's schema-first, SQL-close approach and its integration with Zod for validation.

The project grew from a weekend prototype (the initial commits show rapid iteration on receipt capture and mobile layout) into a more structured codebase as I refactored toward the shared-component architecture documented in the README. The commit history tells the story: early commits focus on getting the camera and basic expense entry working, middle commits improve the look and feel, and later commits refactor the layout system into reusable shared components.

---

## 10. Status

**Current state: Functional prototype / active development.**

What works today:

- Full CRUD for expenses (create, read, update, delete) on both web and mobile.
- Category-based expense organization with five default categories.
- Business vs. personal expense classification with per-expense deductibility percentages.
- Real-time dashboard with today's spend, monthly deductible totals, and estimated tax savings.
- Category breakdown charts (doughnut chart on mobile, multiple chart types on web).
- Tax report generation UI with date-range presets and export format selection (PDF, CSV, email).
- Receipt photo capture using the device camera on mobile.
- Responsive layout that adapts between desktop sidebar and mobile bottom-tab navigation.
- Database seeding with demo user and sample expenses for immediate exploration.
- Settings page with sync/integration toggles, notification preferences, appearance customization, and security options.

What is scaffolded but not yet fully implemented:

- Authentication -- Passport.js with local strategy is installed and the login/logout Zustand actions exist, but session management and protected routes are not wired up. The app currently hardcodes user ID 1 for all API calls.
- Report export -- The tax report page has the UI for downloading PDF/CSV and emailing to an accountant, but the actual file generation is not yet implemented.
- Receipt OCR -- The capture flow collects a photo but does not extract vendor/amount data from it. This is a natural integration point for a cloud OCR service or on-device ML model.
- TurboTax integration -- The settings page has a "Connect to TurboTax" toggle but no actual integration.
- Schema convergence -- The two Drizzle schema files need to be unified into a single shared definition.

The codebase is structured to support continued development toward a production-ready tool for freelancer tax management.
