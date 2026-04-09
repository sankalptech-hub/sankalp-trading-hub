
# Global Markets Expansion Plan

## Phase 1: Database Migration
- Add `region`, `preferred_currency`, `preferred_exchange` to `profiles`
- Add `region`, `supported_markets`, `currency` to `brokers`
- Add `currency`, `exchange`, `base_currency_value`, `exchange_rate_to_inr` to `positions`
- Update `handle_new_user()` trigger for region-aware defaults

## Phase 2: Core Services
- Create `src/lib/marketHours.ts` — multi-exchange market hours with open/close/status
- Create `src/lib/marketDataService.ts` — Twelve Data primary + Yahoo fallback, batch quotes, caching
- Update `src/lib/marketData.ts` — integrate new service, add exchange-aware currency helpers

## Phase 3: Market Hours UI
- Create `MarketStatusHeader` component — dropdown showing exchange statuses with flags
- Integrate into sidebar/layout

## Phase 4: Broker Integrations
- Add Alpaca broker template (paper/live, API key/secret, test connection)
- Add OANDA broker template (practice/live, account ID/token, forex pairs)
- Update IBKR template (coming soon badge)
- Reorganize broker cards by region (India → Global → Forex → Demo)

## Phase 5: Global Watchlists & Scanner
- Update watchlist symbol display with exchange tags and local currency
- Add exchange selector to Scanner
- Add global pre-built watchlists (US_TECH, US_FINANCE, CANADA_TSX, UK_LSE, etc.)

## Phase 6: Multi-Currency Portfolio
- Update Dashboard portfolio card with per-currency sections
- Currency conversion via Twelve Data USD/INR rate
- Show totals in user's preferred currency

## Phase 7: Settings & Region Setup
- Add "Markets" section to Settings (region, currency, exchange, market hours display)
- Region selection personalizes defaults across the app

## Phase 8: Build Tracker Updates
- Insert completed/in-progress tasks for all phases

## Implementation Order
1. DB migration (must be approved first)
2. Core services (marketHours, marketDataService) — parallel
3. UI updates (brokers, watchlist, scanner, settings, dashboard) — parallel where possible
4. Build tracker data insert
