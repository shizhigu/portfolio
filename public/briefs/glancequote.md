# GlanceQuote - Project Brief

## 1. One-Liner

GlanceQuote is a real-time market quote iOS app that streams live prices for crypto, stocks, and futures directly to your Dynamic Island and Lock Screen, wrapped in a Lamborghini-inspired dark design system.

## 2. The Problem

Checking market prices on your phone is a surprisingly high-friction activity. You unlock your device, open a brokerage or finance app, wait for it to load, navigate to your watchlist, and finally see the number you wanted. For active traders and market-watchers who check prices dozens of times a day, those seconds compound into real annoyance.

Existing solutions each have their own problems. Brokerage apps are built for trading, not glancing -- they are heavy, slow to launch, and cluttered with order forms and account balances. Dedicated market data apps like Yahoo Finance and Bloomberg are information-dense but require you to enter the app and scroll to find what you care about. Apple's built-in Stocks widget is limited to equities and shows stale data. None of them put live, streaming prices on the Dynamic Island -- the one place on your iPhone that is always visible, always ambient, always a glance away.

There is also a cross-asset problem. If you watch Bitcoin, S&P 500 futures, and Apple stock, you need three different apps or data sources. Crypto runs 24/7 on exchanges like Coinbase and Binance. US equities stream through services like Finnhub and Financial Modeling Prep. Futures data comes from CME via Yahoo Finance. No single free solution unifies these feeds into a single watchlist with a single UI.

The Dynamic Island is the most under-exploited piece of real estate on the iPhone. It was designed for exactly this kind of ambient, at-a-glance information, yet almost no finance apps use it for live price streaming. GlanceQuote was built to fill that gap: one app, three asset classes, live on your Dynamic Island.

## 3. The Solution

GlanceQuote is a SwiftUI app targeting iOS 17+ that unifies real-time market data from three distinct sources into a single watchlist with Dynamic Island integration. The core experience is:

**Unified Watchlist.** Add any combination of cryptocurrencies (BTC, ETH, SOL), US stocks (AAPL, TSLA, GOOGL), and futures contracts (ES, NQ, CL, GC) to a single watchlist. Each symbol streams live data from the appropriate source -- Coinbase WebSocket for crypto, FMP WebSocket plus REST fallback for stocks, Yahoo Finance REST polling for futures. The user never thinks about data sources; the app routes automatically.

**Dynamic Island Live Ticker.** The signature feature. GlanceQuote starts a Live Activity that displays live prices on the Dynamic Island in compact, expanded, and minimal modes. In compact mode, the leading pill shows a gold dot and ticker symbol; the trailing pill shows the price, percent change, or absolute change depending on user preference. Pro users get configurable rotation that cycles through their entire watchlist at adjustable speeds (3s, 5s, 8s, 12s). The expanded view shows up to three symbols simultaneously with ticker, price, and color-coded change tags. The Lock Screen banner mirrors this layout.

**Lamborghini Design System.** The entire visual language is built around a custom design system (`DS` enum) inspired by Lamborghini: true black (#000000) surfaces, gold (#FFC000) as the sole accent color, zero border-radius on cards and buttons, uppercase typography throughout, and depth achieved through surface color layering (abyss -> darkIron -> charcoal) rather than shadows. Every interaction has haptic feedback. The result feels aggressive, premium, and unmistakably financial.

**Freemium Model.** Free users get 3 symbols, 1 Dynamic Island symbol, and all core features. Pro ($12.99/month, $79.99/year, $149.99 lifetime) unlocks unlimited symbols, full Dynamic Island rotation, and configurable display modes. The paywall is non-intrusive -- it only appears when the user tries to add a 4th symbol.

## 4. Architecture Overview

GlanceQuote follows a clean, service-oriented architecture with clear separation between data, business logic, and presentation.

### Layer Diagram

```
SwiftUI Views (WatchlistView, SearchView, SettingsView, SymbolDetailView)
      |
      v
MarketDataManager (@Published prices, buffer+flush, Live Activity push)
      |
      +--- CoinbaseService (WebSocket: wss://ws-feed.exchange.coinbase.com)
      +--- FMPService (WebSocket: wss://websockets.financialmodelingprep.com + REST fallback)
      +--- YahooFinanceService (REST polling: query1.finance.yahoo.com)
      |
WebSocketManager (generic URLSessionWebSocketTask wrapper)
      |
      +--- Auto-reconnect with exponential backoff (up to 10 attempts, max 60s delay)
      +--- 30s ping/pong keepalive
      +--- Thread-safe via NSLock
```

### Data Flow

1. **Ingestion.** WebSocket ticks arrive on background threads at rates of 10-200+ per second for active crypto pairs. REST responses arrive on URLSession callback threads.

2. **Buffering.** Each service calls `MarketDataManager.bufferQuote()`, which writes into a thread-safe dictionary (`NSLock`-protected) with zero main thread involvement. No `@Published` mutation, no SwiftUI diff, no UI work.

3. **Flushing.** A 250ms repeating `Timer` on the main run loop drains the buffer into the `@Published var prices` dictionary. This coalesces potentially hundreds of ticks into approximately 4 UI updates per second -- a single dictionary mutation per flush, triggering one SwiftUI diff cycle.

4. **Live Activity Push.** A separate 2-second timer reads from `prices` and pushes to the Live Activity via `ActivityKit`. This is decoupled from UI flushing to avoid hammering the system with activity updates.

5. **Rotation.** For Pro users, the rotation index advances on a configurable interval (3-12 seconds). A sliding window of 3 symbols is sent to the Dynamic Island, creating the cycling ticker effect.

### App Structure

The app uses three `@StateObject` singletons injected as `@EnvironmentObject` through the view hierarchy:

- **MarketDataManager** -- owns all data services, the quote buffer, and both timers. The single source of truth for live prices.
- **Persistence** -- `UserDefaults`-backed storage for the watchlist, settings (color scheme, rotation speed, display mode), and onboarding state.
- **StoreManager** -- StoreKit 2 integration for product fetching, purchasing, entitlement verification, and transaction listening.

### Targets

- **GlanceQuote** -- main app target (36 Swift files, ~5,200 lines)
- **GlanceQuoteWidget** -- widget extension for Live Activity rendering
- **Shared** -- `QuoteActivityAttributes` and `SymbolQuote`, shared between both targets via XcodeGen

## 5. Technical Deep Dive

### WebSocket Infrastructure

The `WebSocketManager` class is a generic, reusable wrapper around `URLSessionWebSocketTask`. It handles the full lifecycle: connection, message dispatch (both text and binary), ping/pong keepalive on a 30-second timer, and automatic reconnection with exponential backoff (1s, 2s, 4s, 8s... up to 60s, max 10 attempts). All state mutations are `NSLock`-protected for thread safety. Intentional disconnects set a flag to suppress reconnection.

Each data service (`CoinbaseService`, `FMPService`, `BinanceService`, `FinnhubService`) wraps this manager and handles protocol-specific concerns:

**CoinbaseService** connects to `wss://ws-feed.exchange.coinbase.com` and subscribes to the `ticker` channel. No API key required. It normalizes various symbol formats (BTC, BTCUSD, BTC-USD) to Coinbase's `product_id` format. The ticker channel provides price, 24h open, high, low, and volume in a single message, enabling immediate change calculation against the 24h open price. Open prices are cached per-symbol with a lock to avoid TOCTOU races.

**FMPService** (Financial Modeling Prep) connects to `wss://websockets.financialmodelingprep.com` with a login-based authentication flow. It sends a JSON login event with an obfuscated API key (byte-array to prevent casual string extraction), then subscribes to individual tickers. Critically, it includes a REST fallback: on every subscribe, it immediately fetches via the `/stable/aftermarket-quote` and `/api/v3/quote` endpoints so users see data even when the market is closed and the WebSocket is silent. The aftermarket endpoint provides bid/ask prices that are averaged to a mid-price.

**YahooFinanceService** is REST-only (no WebSocket). It polls `query1.finance.yahoo.com/v8/finance/chart/{symbol}` with a round-robin strategy: instead of fetching all symbols simultaneously, it staggers requests at 2-second intervals. With 5 futures symbols, one full cycle completes in 10 seconds, which approximates the ~15-minute delay of Yahoo's free data without hammering their servers. The service parses the `meta` object for `regularMarketPrice`, `chartPreviousClose`, `regularMarketDayHigh`, `regularMarketDayLow`, and `regularMarketVolume`, and infers market state from the `marketState` field.

### Performance Architecture: Buffer + Flush

This is the most important engineering decision in the app. A naive implementation would dispatch to the main thread on every WebSocket tick and mutate `@Published` properties directly. For BTC-USD alone, Coinbase can send 50-200 ticks per second during active trading. That would mean 50-200 SwiftUI diff cycles per second -- each one walking the entire view tree, diffing every `ForEach` row, and re-rendering price labels that the human eye cannot distinguish at that frequency.

The buffer+flush pattern solves this completely:

1. **Buffer writes are zero-cost.** `bufferQuote()` locks an `NSLock`, writes a dictionary entry, unlocks. No main thread dispatch, no `@Published` mutation, no Combine pipeline, no SwiftUI involvement.

2. **Flushes are coalesced.** The 250ms timer fires approximately 4 times per second. On each fire, it locks the buffer, swaps out all pending entries, unlocks, and applies them to `@Published var prices` in a single mutation. If 150 BTC ticks arrived in that 250ms window, only the latest one survives -- which is exactly correct, because the user only needs the most recent price.

3. **One diff per flush.** Because all price updates are applied in one pass before the `@Published` setter fires, SwiftUI sees a single state change and performs a single diff cycle. The diff itself is efficient: each `WatchlistRow` reads `prices[symbol.id]`, and SwiftUI's diffing engine only re-renders rows whose price actually changed.

The Live Activity runs on a separate 2-second timer to further reduce system overhead. ActivityKit updates are expensive (they involve inter-process communication with SpringBoard), so pushing at 0.5 Hz rather than 4 Hz is a meaningful optimization.

### Live Activity and Dynamic Island

The `LiveActivityService` manages the full lifecycle of a `QuoteActivityAttributes` Live Activity. Key design decisions:

- **Stale date management.** Each update sets a `staleDate` of 10 seconds in the future. While the app is alive, updates arrive every 2 seconds, so the stale date is constantly pushed forward. If the app is killed, iOS auto-dismisses the activity after 10 seconds of staleness, preventing a zombie ticker from showing outdated prices indefinitely.

- **12-hour expiry handling.** iOS kills Live Activities after 12 hours. The service schedules a timer at 11 hours 50 minutes to proactively end and restart the activity, ensuring seamless continuity for users who leave the ticker running all day.

- **Zombie cleanup.** Both the `AppDelegate` and `LiveActivityService.init()` iterate over `Activity<QuoteActivityAttributes>.activities` on launch and forcibly end any orphaned activities from previous sessions. The AppDelegate uses a `DispatchSemaphore` to block for up to 2 seconds, ensuring the `end()` calls complete before the app proceeds.

- **Rotation logic.** Pro users see a rotating ticker: the `MarketDataManager` maintains a `rotationIndex` that advances when `tickerRotationSpeed` seconds have elapsed since the last rotation. A sliding window of 3 symbols starting at `rotationIndex` is sent as the update payload. The widget renders all 3 in the expanded region and the first one in compact/minimal modes.

- **Display mode.** The compact trailing view supports three modes: price ("74,370.80"), percent ("+4.77%"), or absolute change ("+3,380.50"). This is user-configurable for Pro users and fixed to "price" for free users. The mode is serialized as a string in `SymbolQuote.displayMode` and interpreted by the widget.

### Symbol Routing

The `SymbolSearchService` uses Yahoo Finance's autocomplete API (`/v1/finance/search`) as a unified search backend. When the user types "AAPL", "BTC", or "ES", Yahoo returns results with a `quoteType` field (EQUITY, CRYPTOCURRENCY, FUTURE, INDEX, ETF). The `routeSymbol()` function maps these to the correct internal data source:

| quoteType | SymbolType | DataSource | Notes |
|-----------|-----------|------------|-------|
| EQUITY, ETF | .stock | .fmp | Real-time via FMP WebSocket |
| CRYPTOCURRENCY | .crypto | .coinbase | Real-time via Coinbase ticker channel |
| FUTURE | .future | .yahoo | REST polling, ~15min delayed |
| INDEX | .stock | .yahoo | REST polling (^GSPC, ^DJI) |

This routing is invisible to the user. They search, tap add, and the system handles the rest. The search is debounced at 400ms to avoid excessive API calls during typing.

### StoreKit 2 Integration

`StoreManager` implements the full StoreKit 2 lifecycle:

- **Product IDs:** `com.glancequote.pro.monthly` ($12.99), `com.glancequote.pro.yearly` ($79.99), `com.glancequote.pro.lifetime` ($149.99).
- **Entitlement check:** Iterates `Transaction.currentEntitlements` to find any active subscription or lifetime purchase.
- **Transaction listener:** A detached `Task` monitors `Transaction.updates` for out-of-app events (renewals, refunds, family sharing changes).
- **Dev mode:** A hidden developer toggle (tap "Version" 7 times, enter password "777111") bypasses all paywalls. Persisted in `UserDefaults`.

The free tier limits are enforced in the view layer: `WatchlistView` prefixes the watchlist to 3 items, `SearchView` triggers the paywall on the 4th add, and `MarketDataManager` limits Dynamic Island to 1 symbol for free users.

### Design System

The `DS` enum is a comprehensive design system with four namespaces:

- **DS.Colors** -- true black surfaces (abyss #000000, darkIron #181818, charcoal #202020), gold accent (#FFC000), three text levels (heading/white, secondary/#9A9A9A, muted/#4A4A4A), functional colors (upGreen #00E676, downRed #FF3B3B), and border definitions.
- **DS.Typography** -- 12 font styles from displayHero (42pt) down to micro (10pt), plus specialized priceHero (40pt), priceRow (16pt), and ticker (15pt semibold).
- **DS.Spacing** -- 10-step scale from xxxs (2pt) to section (48pt).
- **DS.Radius** -- deliberately minimal: none (0), badge (2), toggle (20). Zero radius on cards and buttons is the signature.
- **DS.Haptics** -- wrappers for UIImpactFeedbackGenerator and UINotificationFeedbackGenerator.

Custom `ViewModifier`s and `ButtonStyle`s enforce the design system: `DarkCard`, `GoldButtonStyle`, `GhostButtonStyle`, `DarkDivider`. The `ColorTheme` struct handles US (green-up/red-down) and CN (red-up/green-down) color conventions, switchable in Settings.

## 6. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI Framework | SwiftUI | Declarative views, navigation, sheets, full-screen covers |
| Minimum Target | iOS 17.0 | Required for Dynamic Island / Live Activities APIs |
| Language | Swift 5.9 | Async/await, structured concurrency, Sendable conformances |
| Live Activities | ActivityKit | Dynamic Island and Lock Screen Live Activity |
| Widget | WidgetKit | Widget extension bundle for Live Activity rendering |
| Subscriptions | StoreKit 2 | Product fetching, purchasing, entitlement management |
| Networking | URLSession | WebSocket tasks and REST data tasks |
| Persistence | UserDefaults | Watchlist, settings, onboarding state (JSON-encoded) |
| Crypto Data | Coinbase Exchange WebSocket | Real-time ticker channel, no API key needed |
| Stock Data | Financial Modeling Prep (FMP) | WebSocket + REST, API key bundled (obfuscated) |
| Futures Data | Yahoo Finance REST | Polling at 2s stagger per symbol, no API key needed |
| Search | Yahoo Finance Autocomplete | Unified cross-asset symbol search |
| Project Generation | XcodeGen | `project.yml` generates `.xcodeproj` |
| Concurrency | NSLock + GCD + Timer | Thread-safe buffer, main thread flush, background dispatch |
| Design | Custom DS enum | Full design system with colors, typography, spacing, haptics |

## 7. Challenges & Solutions

### Challenge 1: WebSocket Tick Rate vs. UI Performance

**Problem.** Coinbase sends 50-200 trade ticks per second for popular pairs like BTC-USD. Dispatching each tick to the main thread and mutating `@Published` would trigger 50-200 SwiftUI diff cycles per second, causing dropped frames and battery drain.

**Solution.** The buffer+flush architecture described in Section 5. WebSocket callbacks write to an `NSLock`-protected dictionary with zero main thread involvement. A 250ms timer coalesces all pending updates into a single `@Published` mutation, yielding ~4 SwiftUI diffs per second regardless of tick rate. This is a 50x reduction in UI work for active crypto pairs.

### Challenge 2: Three Incompatible Data Sources

**Problem.** Crypto, stocks, and futures each use different protocols, authentication schemes, message formats, and delivery mechanisms. Coinbase is a free WebSocket with JSON subscribe/unsubscribe. FMP requires login authentication and uses a different JSON schema. Yahoo has no WebSocket at all.

**Solution.** The `WebSocketManager` provides a generic wrapper that all WebSocket-based services share. Each service (`CoinbaseService`, `FMPService`, `YahooFinanceService`) normalizes its data into the universal `QuoteData` struct and delivers it through a uniform callback: `(String, QuoteData) -> Void`. The `MarketDataManager` treats all three identically. The `SymbolSearchService` handles routing at add-time so the user never sees the complexity. Yahoo's REST-only nature is hidden behind the same `connect/subscribe/unsubscribe/disconnect` interface using a polling timer.

### Challenge 3: FMP REST Fallback for Closed Markets

**Problem.** The FMP WebSocket only sends data when trades occur. When the US market is closed (evenings, weekends, holidays), the WebSocket is silent -- users would see no stock data at all.

**Solution.** On every `subscribe()` call, `FMPService` immediately fires a REST request to the aftermarket quote endpoint. If that returns bid/ask prices, it computes a mid-price and emits a quote. If the aftermarket endpoint has no data, it falls back to the regular `/v3/quote` endpoint for the last known price. This ensures users always see stock data, even when markets are closed, with a clear "CLOSED" status indicator.

### Challenge 4: Live Activity Zombie Cleanup

**Problem.** If the app is force-killed or crashes, the Live Activity persists on the Dynamic Island showing stale prices. iOS does not automatically clean up Live Activities when apps terminate.

**Solution.** Three-layer defense: (1) The `AppDelegate` iterates all existing activities on launch and ends them synchronously using a `DispatchSemaphore` with a 2-second timeout. (2) `LiveActivityService.init()` does the same asynchronously as a safety net. (3) Every update sets a `staleDate` of 10 seconds in the future, so if the app dies, iOS auto-dismisses the activity within 10 seconds of the last update. Additionally, a proactive restart timer fires at 11h50m to handle the 12-hour iOS expiry limit.

### Challenge 5: Yahoo Finance Rate Limiting

**Problem.** Yahoo Finance's unofficial API has no published rate limits, but aggressive polling risks IP blocking. Fetching all subscribed futures symbols simultaneously on a short interval is wasteful and risky.

**Solution.** Round-robin staggered polling. Instead of fetching all symbols every N seconds, the service fetches one symbol every 2 seconds, cycling through the queue. With 5 futures symbols, a full cycle takes 10 seconds. This distributes load evenly and keeps the request rate low (~30 requests per minute regardless of symbol count), well within reasonable limits.

### Challenge 6: Shared Code Between App and Widget Extension

**Problem.** The Dynamic Island widget runs in a separate process and cannot access the main app's code. But it needs the same data models (`SymbolQuote`, `QuoteActivityAttributes`) and the same design tokens.

**Solution.** The `Shared/` directory contains `QuoteActivityAttributes.swift`, which defines both the `SymbolQuote` struct and the `QuoteActivityAttributes` ActivityAttributes type. Both targets include this directory in their sources via `project.yml`. The widget duplicates the design tokens it needs (colors, spacing) in a local `W` enum rather than importing the full `DS` system, keeping the widget extension lightweight.

### Challenge 7: Thread Safety Across Multiple WebSocket Services

**Problem.** Three WebSocket services write quote data from their respective background threads. The buffer must handle concurrent writes without corruption, and the flush timer must read without tearing.

**Solution.** A single `NSLock` protects the `quoteBuffer` dictionary. Each service's callback calls `bufferQuote()`, which acquires the lock, writes one entry, and releases. The flush timer acquires the same lock, swaps the buffer contents into a local variable (using `removeAll(keepingCapacity: true)` for allocation reuse), and releases. The local variable is then iterated on the main thread to update `@Published` without holding any lock. The lock's critical section is minimal (one dictionary write or one swap), so contention is negligible.

## 8. What I Learned

**Buffer+flush is the right pattern for high-frequency data in SwiftUI.** Before landing on this architecture, the naive approach of dispatching every WebSocket tick to `@Published` was visually identical (humans cannot perceive 200 FPS price changes) but caused 50x more work for the UI layer. The lesson generalizes: any SwiftUI app consuming high-frequency data should coalesce updates on a timer rather than propagating every event.

**Live Activities are powerful but fragile.** The ActivityKit API is straightforward, but the edge cases are brutal: zombie activities after crashes, the 12-hour expiry, stale date semantics, and the fact that `end()` is async but often called during app termination when you have no time to await. The three-layer cleanup strategy (AppDelegate semaphore + init cleanup + stale date) was learned through trial and error.

**Building the entire app in a single session with Claude Code changed how I think about scope.** This project -- 36 files, ~5,200 lines of Swift, three WebSocket integrations, a full design system, StoreKit 2 subscriptions, Dynamic Island with rotation, onboarding, search, paywall -- was built in one continuous session. The key was maintaining a clear architecture from the start and letting Claude Code handle the boilerplate while I focused on design decisions and performance tuning.

**Design systems pay for themselves immediately.** Defining `DS.Colors`, `DS.Typography`, and `DS.Spacing` upfront meant every new view was instantly consistent. When I wanted to tweak the gold accent or adjust spacing, it was a single-line change. The Lamborghini-inspired constraint (black + gold, zero radius, uppercase) eliminated bikeshedding and produced a cohesive aesthetic automatically.

**Yahoo Finance's unofficial API is surprisingly robust for futures.** The `/v8/finance/chart` endpoint returns rich metadata (regularMarketPrice, chartPreviousClose, dayHigh, dayLow, volume, marketState) in a single response. The round-robin polling strategy keeps request rates low while providing data freshness acceptable for futures (~10-15 second cycles). The main risk is API changes, since the endpoint is unofficial.

**StoreKit 2 is a genuine improvement over the original StoreKit.** Product fetching, purchasing, verification, and entitlement checking are all async/await-based with clear error handling. The `Transaction.updates` stream for out-of-app events (renewals, refunds) eliminates the need for a server-side receipt validation setup for most indie apps. The main footgun is remembering to call `transaction.finish()` -- failing to do so leaves transactions in a pending state that blocks future purchases.

## 9. Motivation & Context

GlanceQuote started from a personal itch: I wanted to see BTC and ES futures prices on my Dynamic Island without opening any app. The existing options were either too heavy (full brokerage apps), too limited (only stocks), or did not support Live Activities at all.

The project also served as an experiment in building a complete, ship-ready iOS app in a single session with Claude Code. I wanted to test the limits: could an AI-assisted workflow produce not just a prototype, but a fully architected app with real-time data, a custom design system, subscription monetization, and platform-native features like Dynamic Island? The answer was yes, with caveats -- the architecture needed to be defined upfront, and performance-critical patterns like buffer+flush needed to be specified explicitly rather than discovered through iteration.

The Lamborghini design language was a deliberate aesthetic choice. Finance apps tend toward either sterile Bloomberg-terminal minimalism or flashy neon-on-dark crypto aesthetics. Lamborghini's design philosophy -- aggressive, zero-compromise, black and gold, sharp angles -- maps surprisingly well to a financial instrument. The zero border-radius, true black surfaces, and uppercase-everything voice create an app that feels fast and decisive, which is exactly the emotional register for checking live prices.

The freemium model was calibrated based on market research. Three free symbols cover the most common use case (one crypto, one index future, one stock). The jump to unlimited is where power users need Pro, and the pricing ($12.99/month, $79.99/year, $149.99 lifetime) is positioned between casual finance apps (~$4.99/month) and professional data terminals ($100+/month). The 3-day free trial on subscriptions reduces purchase friction.

## 10. Status

**Current: v1.0.0 -- Feature Complete, Pre-Release**

The app is fully functional with all core features implemented:

- Real-time crypto streaming via Coinbase WebSocket
- Real-time stock data via FMP WebSocket with REST fallback for closed markets
- Futures data via Yahoo Finance REST polling
- Dynamic Island Live Activity with compact, expanded, and minimal modes
- Configurable rotation speed and display mode (Pro)
- Unified symbol search across all asset classes
- StoreKit 2 subscription paywall (monthly, yearly, lifetime)
- Lamborghini design system with US/CN color scheme toggle
- Onboarding flow with default watchlist seeding
- Developer mode for testing

**Planned for v2:**

- Interactive price charts (placeholder already in SymbolDetailView: "CHARTS -- COMING IN V2")
- Push notification alerts for price targets
- Apple Watch complication
- Widget gallery (home screen widgets beyond Dynamic Island)
- Portfolio tracking with cost basis

**Known Limitations:**

- Yahoo Finance futures data is delayed ~15 minutes (displayed to user in free tier)
- No charts yet (v2)
- Binance and Finnhub services exist in code but are currently legacy/unused -- all routing goes through Coinbase and FMP
- FMP API key is bundled and obfuscated but not truly secured (adequate for a client-side app, not for a server)
