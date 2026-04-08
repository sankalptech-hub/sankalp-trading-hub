
# Sankalp Trading OS — Implementation Plan

## Phase 1: Foundation & Auth
- **Supabase schema**: Create tables via migrations: `profiles` (linked to auth.users with trigger), `strategies`, `signals`, `orders`, `positions`, `alerts`, `build_tasks`, plus `user_roles` table with `app_role` enum (admin/user) and `has_role()` security definer function
- **RLS policies**: All tables filtered by `user_id = auth.uid()`, admin users can read all data via `has_role()` check
- **Auth pages**: `/login` with email/password login + signup, redirect unauthenticated users, AuthContext provider
- **Dark theme**: Custom CSS variables for dark palette (#0a0a0f bg, #00d4aa accent), import JetBrains Mono + Syne fonts

## Phase 2: Layout & Navigation
- **Persistent dark sidebar** (fixed left): Icon + label nav links for Dashboard, Trade, Strategies, Alerts, Analytics, Build Tracker
- **User footer in sidebar**: Display email, logout button
- **Admin indicator**: Badge if user has admin role
- **SidebarProvider layout** wrapping all authenticated routes

## Phase 3: Core Pages

### Dashboard (`/dashboard`)
- Stat cards: open positions, pending orders, active signals, unread alerts (live counts from Supabase)
- 4 mini-tables: recent positions, orders, signals, alerts
- Auto-refresh polling every 10 seconds

### Trade Console (`/trade`)
- Form: symbol input, quantity input, BUY/SELL toggle
- "Generate Signal" → inserts into `signals` table + toast
- "Execute Trade" → validates, inserts `orders`, upserts `positions`, creates `alert`, toast
- Recent orders table below
- Inline validation (empty symbol, qty ≤ 0)

### Strategies (`/strategies`)
- List strategies from DB with active/inactive toggle (updates DB)
- Add new strategy form (name + description)

### Alerts (`/alerts`)
- Color-coded alert list (info=blue, warning=yellow, danger=red, success=green)
- Mark as read / delete actions

### Analytics (`/analytics`)
- Recharts line chart: orders over time (grouped by day)
- Recharts bar chart: positions by symbol
- Summary cards: total orders, filled orders, portfolio symbols

### Build Tracker (`/build-tracker`)
- Table with inline editing for Status, Priority, Notes
- Filter dropdowns for Module and Status
- Summary counts (total, completed, in-progress)
- Auto-seed 20 tasks on first load if user's build_tasks are empty

## Phase 4: Polish
- Toast notifications (sonner) for all actions and errors
- All DB errors caught and shown as toasts
- Form validation with inline error messages
- Cards with subtle border glow on hover, striped table rows
- Admin users see an "All Users" toggle on Dashboard to view cross-user data
