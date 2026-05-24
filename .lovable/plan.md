
# TradeSphere ⨉ Sankalp — Unified Merge Plan

The uploaded project ships a CRA + FastAPI + MongoDB stack. The current project is Vite + React + Lovable Cloud (Supabase). Backend will be **re-implemented on Lovable Cloud** (Postgres + RLS + Edge Functions) — no FastAPI/MongoDB. Frontend pages will be **ported to TypeScript/Vite/Tailwind** using the existing shadcn components and design tokens. Brand becomes **TradeSphere**; nothing is dropped — every feature from both projects gets one canonical home.

## Conflict resolution (one canonical page per concept)

| Concept | Current (Sankalp) | TradeSphere | Merged result |
|---|---|---|---|
| Dashboard | `/dashboard` (portfolio + paper/live toggle) | TraderDashboard (stats, equity curve, daily PnL, EAs strip) | `/dashboard` — keep Sankalp shell, fold in equity curve, daily PnL bars, symbol allocation donut, EAs strip |
| Brokers | `/brokers` (Zerodha, Alpaca, OANDA, Demo) | BrokersPage (Connect modal, supported list) | `/brokers` — keep current; add TradeSphere's polished "Connect Broker" modal style + supported-brokers showcase |
| Watchlist | `/watchlist` | Watchlist (TVMiniChart cards) | `/watchlist` — add TradingView mini-chart card view as an optional layout toggle |
| Scanner | `/scanner` | OptionsScreener | `/scanner` — add "Options" tab alongside existing equity scan |
| Asset Analysis | `/asset-analysis` | MarketAnalysis | `/asset-analysis` — fold in MarketAnalysis widgets (sector heatmap, top movers) |
| Positions | (inside Dashboard) | PositionsPage | new `/positions` page using existing `positions` table, richer table |
| Admin | `/admin` | AdminDashboard | `/admin` — add revenue curve, system health, recent-users widgets |
| Trader/EA strategies | `/strategies`, `/builder`, `/backtest` | EADetails | keep current; add `/eas` list + `/eas/:id` running/paused toggle + per-EA trades |
| Marketing | none | Landing, Features, MLM Info, legal pages | new public routes (see Phase 1) |
| Associate (MLM) | none | AssociateDashboard | new role + `/associate` route (see Phase 4) |
| Risk disclosure | none | RiskDisclosureModal | shown once on first visit (stored in localStorage) |

## Phases

### Phase 1 — Public marketing site (new public routes)
- `/` → Landing (hero, ticker tape, "what traders get", supported brokers, disclaimer, auth CTA → `/login`)
- `/features` → Features page
- `/mlm-info` → Partner Network info
- `/privacy-policy`, `/terms-of-service`, `/payment-refund-policy` → StaticPage
- Global `RiskDisclosureModal` on first visit (localStorage flag)
- Move authenticated app from `/` to behind login; `/dashboard` stays the trader home
- Rebrand chrome to **TradeSphere** (sidebar title, header, page titles, README)

### Phase 2 — Role system extension (Trader / Admin / Associate)
- Extend `app_role` enum: add `'trader'`, `'associate'` (keep `'user'`, `'admin'` for back-compat; default new signups → `'trader'`)
- `handle_new_user()` updated to seed role `'trader'` + referral code; if a referral code is passed in signup metadata, store `referred_by`
- Add `referral_code` + `referred_by` + `rank` (Bronze/Silver/Gold) columns to `profiles`
- Route guard component reads role and redirects: trader→`/dashboard`, admin→`/admin`, associate→`/associate`

### Phase 3 — EAs (Expert Advisors) module
- New tables: `eas` (name, symbol, status, pnl, trades, win_rate), `ea_trades` (ea_id, symbol, side, lots, entry, exit, pnl, time), `equity_points` (user_id, day, equity) — all with per-user RLS
- Pages: `/eas` list, `/eas/:id` details with toggle running/paused, trade history table, per-EA equity curve
- Dashboard gets "Active EAs" strip + equity curve + daily PnL bars + symbol allocation donut (Recharts)

### Phase 4 — Associate / MLM with payouts
- New tables: `associate_network` (associate_user_id, tier 1-5, downline_user_id), `associate_payouts` (amount, status pending/paid, date), `mlm_levels` (tier %, seeded constant)
- `/associate` dashboard: stats, 5-tier network table, earnings curve, referral code share, payout history
- `/associate/payouts/request` flow (insert into `associate_payouts` with `status='pending'`)
- Edge function `calc-associate-earnings` for tiered preview (volume → earnings by tier)
- Admin sees & approves payouts inside `/admin` (status pending → paid)

### Phase 5 — Page merges (no duplicates)
- Dashboard: add Recharts equity curve, daily PnL, symbol allocation donut, EAs strip
- Scanner: add "Options" tab (strike chain, IV, OI, volume filters) ported from OptionsScreener
- Asset Analysis: fold MarketAnalysis (sector heatmap, top movers/losers) into existing tabs
- Watchlist: add mini-chart card layout toggle (TradingView mini-widget)
- Brokers: adopt TradeSphere's polished ConnectBrokerModal styling and supported-brokers grid
- New `/positions` page (full positions table with filters; replaces Dashboard's inline list)
- Admin: add revenue curve, system health pings, recent users widget, MLM payout approvals
- Sidebar reorganized into groups: **Trade** (Dashboard, Trade, Positions, Watchlist, Scanner, Asset Analysis) · **Build** (Builder, Strategies, EAs, Backtest, History) · **Manage** (Brokers, Risk, Analytics, Alerts, AI Assistant) · **Partner** (Associate — visible only to associates) · **System** (Settings, Admin, Build Tracker)

### Phase 6 — Branding, content, polish
- Rename product to **TradeSphere** across sidebar, header, page `<title>`, README, build tracker
- Keep current dark-institutional theme + design tokens (no token churn); port TradeSphere's amber accent as `--accent-premium` for marketing pages only
- Seed legal page content from TradeSphere's StaticPage
- Update build tracker with all new tasks (one row per phase item)

## Technical notes (devs)
- All ported `.jsx` → `.tsx` with proper types; replace `axios` + JWT-localStorage with `supabase` client + `useAuth()`
- Replace `localStorage.tradesphere_token`/`tradesphere_session` with Supabase session
- Recharts already installed — reuse for equity/PnL/allocation charts
- TradingView mini-widget loaded via `<script>` in component effect (no new dep)
- One migration per phase (2, 3, 4) for clear approval gates
- No data discarded: existing brokers/positions/watchlists/strategies tables stay; new tables are additive
- Routes added under existing `ProtectedLayout`; public marketing routes live outside it

## Out of scope (explicit)
- No MongoDB, no FastAPI, no Python — all backend logic is Lovable Cloud (Postgres + Edge Functions)
- No real MT4/MT5 EA execution engine — EAs are tracked/displayed; trade execution remains broker-level paper/live as today

## Suggested execution order
Phase 1 → Phase 2 (migration #1) → Phase 3 (migration #2) → Phase 5 page merges → Phase 4 (migration #3, MLM) → Phase 6 polish

This is a multi-message build. After you approve, I'll start with **Phase 1 (marketing site + rebrand)** so you can see the new public face immediately, then move through the phases.
