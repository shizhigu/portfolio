# sqlv — Technical Brief

## One-Liner

A SQLite viewer built for humans *and* coding agents to drive at the same time — native desktop app, CLI, and MCP server sharing one Rust core, with a live CLI-to-GUI sync that nothing else in the category has.

## The Problem

Every existing SQLite tool picks a side. TablePlus, DB Browser, and Beekeeper are GUI-first — great for humans, hostile to automation: no stable output, no exit codes, no machine interface. The `sqlite3` CLI is the opposite — fine for scripts but brittle for agents (whitespace-aligned tables that break on the next version) and invisible to the human sitting next to them.

Agents and humans can't collaborate because the tools don't meet in the middle. If Claude Code runs a query in a terminal, nothing shows up in my SQLite browser. If I click through DB Browser, the agent has no way to see what I explored. We both end up narrating state back and forth in chat: "okay, the `orders` table has a `status` column, let me count nulls…" — a UX built entirely out of screenshots and paste.

Also: the safety defaults are terrible. Most GUI tools open writable by default; most CLIs too. An agent with shell access to `sqlite3` can do `DROP TABLE` on your production replica before you finish the sentence.

## The Solution

`sqlv` is a SQLite workspace where the CLI, the desktop app, and the MCP server are three faces of the same core. Any query run from any surface hits the same Rust code path with the same serialization — so semantics don't drift, and a query run in the terminal can *live-mirror* into the desktop app I'm already looking at.

The headline interaction is `sqlv push "<SQL>"`. From Claude Code's terminal, it sends SQL into my running GUI over an auth-gated HTTP loopback; the SQL appears in my editor, the grid renders the result, and a "↓ pushed from CLI" badge flashes in the toolbar. If the SQL mutates, the GUI doesn't execute it — it lands behind a loud preview banner with EXPLAIN QUERY PLAN and an "affects N rows in `<table>`" pill, waiting for me to click Run. That asymmetric consent flow (agent proposes, human approves writes) is the whole design thesis.

Everything else — virtualized grid, staged-changes panel, live row-count ghost, attached-DB sidebar, persistent activity log shared across all three surfaces — exists to make that collaboration feel *native* instead of bolted-on.

## Architecture Overview

The repo is a Cargo + Bun monorepo with four Rust crates and one React frontend:

- `crates/core` — the shared library: `Db::open`, typed schema introspection (tables, views, indexes, triggers, foreign keys), parameterized query + exec, JSON-stable `Value` enum, EXPLAIN QUERY PLAN, SQL classifier (`ReadOnly` vs `Mutating`), schema diff, persistent activity log (`~/.sqlv/activity.db`).
- `crates/cli` — the `sqlv` binary: clap subcommands that delegate to core. JSON output is the default when stdout isn't a TTY; `--table` renders pretty only for humans. Stable exit codes (`0` ok, `2` usage, `3` not-found, `4` readonly, `5` sql) and structured `{"error":{"code":...,"message":...}}` on stderr.
- `crates/mcp` — a stdio MCP server (JSON-RPC 2.0) that exposes every useful core operation as a structured tool: `sqlv_tables`, `sqlv_schema`, `sqlv_query`, `sqlv_push_query`, `sqlv_push_open`. Claude Desktop / Cursor / Windsurf / Zed see them natively.
- `apps/desktop/src-tauri` — the Tauri backend: Tauri commands that thin-wrap `Db`, plus a `tiny_http` loopback server on `127.0.0.1:50500..=50509` with per-instance auth tokens published to `~/.sqlv/instances/<pid>.json` so the CLI can find the running GUI.
- `apps/desktop/src` — React + Vite + TypeScript frontend. CodeMirror 6 for the SQL editor with SQLite dialect + schema-aware completion. `@tanstack/react-virtual` for the row grid. Zustand for state.

One query path, three callers. If I fix a bug in `core::query`, the CLI, the GUI, and the agent-facing MCP all get it simultaneously.

## Technical Deep Dive

### The JSON-stable `Value` layer

Bridging SQLite's type system to JSON safely is not optional when agents consume the output. SQLite has 64-bit integers (JS can't represent past 2^53), non-finite floats (`NaN`, `Infinity`), and arbitrary blobs (not UTF-8). `sqlv-core` defines a custom `Serialize` impl on `Value` with tagged forms:

- Integers in range → JSON number
- Integers outside JS-safe range → `{"$int64": "1234567890123456789"}`
- Non-finite floats → `{"$real": "NaN" | "Infinity" | "-Infinity"}`
- Blobs up to 16KB → `{"$blob_base64": "..."}`
- Larger blobs → `{"$blob_base64_truncated": "...", "$blob_size": 123456}`

The frontend's `formatValue` understands the tags; the CLI emits them verbatim in `--json`; agents see a schema they can match against. No silent precision loss, no "why is this number off by one."

### The asymmetric push/consent flow

`sqlv push` classifies SQL via a heuristic in `classify.rs` (comment-strip + word-boundary match against `INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH|VACUUM|PRAGMA`). Policy:

- `SqlKind::ReadOnly` → execute immediately, emit `pushed-query` event with the result.
- `SqlKind::Mutating` with `mode=auto` (default) → don't execute. Populate the editor, emit the event with `pending: true`, the plan tree (from `EXPLAIN QUERY PLAN`), and — for simple UPDATE/DELETE shapes — an `affects: { table, count }` computed via a hand-rolled `take_ident`-based parser that extracts the table + WHERE clause and runs `SELECT COUNT(*) FROM <t> WHERE <w>`.
- `mode=run` → always execute (for trusted agent loops that already have consent).

The human sees the proposal before anything runs. The "affects N rows" pill is the single most useful UX element in the app — it turns "trust me bro" into "trust me, here's exactly what this will touch."

### Virtualized grid + staging

The grid renders up to 1000 rows per page but only keeps ~20 DOM nodes alive via `@tanstack/react-virtual`, absolute-positioning rows inside a scrollable div-grid. Inline cell edit, FK navigation (↗ link jumps to the referenced table), type-aware coercion from the string the user types, and per-cell validation all work inside the virtualized layout.

A `Stage` toggle in the footer diverts every mutation — inline edit commit, add row, delete selected — into a Zustand-held queue instead of hitting the DB. The staged-changes panel above the grid shows each pending change as `UPDATE | INSERT | DELETE · table · summary`, with per-row Revert. "Commit all" hands every statement to `Db::exec_many` in one transaction; if any statement fails, the whole batch rolls back. Agents can propose ten edits, the human reviews the diff, commits once.

### Live row-count ghost

While the user types in the editor, a debounced 400ms timer parses the SQL looking for a simple `SELECT … FROM <table> [WHERE …]` shape (reject JOIN / UNION / subqueries / `?N` placeholders). If it matches, a Tauri `count_rows(table, where_clause)` command runs `SELECT COUNT(*)` in the background and renders a subtle "≈ N rows match this WHERE · `users`" annotation between the editor and the results. It's the feature I've wanted in every query tool for ten years.

### Auth-gated loopback

The Tauri backend binds `127.0.0.1:50500` (fallback up to `:50509` for multiple GUI instances). Every request except `GET /health` requires an `X-Sqlv-Token` header matching a per-instance token written to `~/.sqlv/instances/<pid>.json` at startup and removed on graceful shutdown. Constant-time token comparison because why not. The CLI reads the instance file, picks the highest-PID live instance, attaches the token, fires the request.

No listening on `0.0.0.0`, no CORS, no "well, it's localhost so it's fine" handwave.

### Persistent activity log

Shared `~/.sqlv/activity.db` (SQLite-backed, WAL mode). Every `query`, `exec`, `open`, and `cancel` from the UI, CLI, and MCP surfaces writes a row with `{ts_ms, source, kind, sql, db_path, elapsed_ms, rows, error_*}`. The CLI's `sqlv history` subcommand and the GUI's Activity panel (Persistent tab) read from the same table — so "what happened here" is one grep away regardless of which surface did it.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | Tauri 2 | Native webview, <15 MB DMG, Rust backend you already wrote |
| Frontend | React 18 + Vite + TypeScript | Fast HMR, type-safe `invoke` wrappers, boring |
| Editor | CodeMirror 6 + `@codemirror/lang-sql` (SQLite dialect) | Actually extensible, schema-aware completion via the sqlv core |
| Grid | `@tanstack/react-virtual` | Keep DOM node count constant for any page size |
| Core | Rust + `rusqlite` 0.32 (bundled SQLite 3.46) | Same code powers CLI + GUI + MCP |
| CLI | `clap` (derive), `serde_json`, `comfy-table` | JSON-first, TTY-detected pretty output as fallback |
| MCP | stdio JSON-RPC 2.0, hand-rolled | No dependencies on the host, composes with any MCP client |
| Loopback | `tiny_http` | Tiny, no async runtime, perfect for 10-req-per-session use |
| State | Zustand | One store, selectors for everything, no ceremony |
| Motion | CSS Bézier tokens + `prefers-reduced-motion` | Smooth tab/panel transitions without a heavy animation lib |

## Challenges & Solutions

**Challenge 1: one query path, three callers.**
The CLI, the Tauri backend, and the MCP server all need to run the "same" query with the "same" semantics. Solution: everything lives in `sqlv-core`. Every caller goes through `Db::query` / `Db::exec` with the same `OpenOpts`. When I fixed a bug in WAL-mode initialization, the CLI, the GUI, and the MCP all got it the same commit.

**Challenge 2: JS can't represent SQLite's type system.**
Silently truncating a 64-bit ID to JS `number` is the single worst bug a DB tool can have. Solution: the tagged-value `Serialize` impl. Anything JS can't hold becomes a tagged string (`$int64`, `$real`, `$blob_base64`), and every consumer (CLI, GUI, MCP clients) knows the tags. Zero precision loss, zero silent corruption.

**Challenge 3: agent-driven writes without YOLO-mode.**
Giving a shell-having agent the ability to run SQL against your prod DB is terrifying. Solution: the `mode=auto` preview flow. Mutating SQL lands in the GUI behind a loud banner with the plan tree and an affected-rows count. Nothing runs until I click Run. The agent proposes; the human approves. Same semantics as a code-review PR, except for SQL.

**Challenge 4: GUI animations without killing input latency.**
CodeMirror breaks in subtle ways if its parent container is `display: flex` with the wrong min-size rules — you lose cursor positioning mid-word. Solution: the whole `QueryPane` is an explicit 6-row CSS grid with fixed `grid-row: N` on every child, `minmax(0, 1fr)` on the editor track so it can shrink, and no `display` override from outside. Pointer events stay clean, zoom works, nothing collapses.

**Challenge 5: CI-safe formatting.**
CI failed the first push because I ran `cargo fmt` locally but forgot to re-run after a follow-up edit. Solution: `cargo fmt --all --check` is now the first step in CI and a mental pre-commit habit. Boring, effective.

## What I Learned

The biggest lesson was that **the CLI ↔ GUI push flow is the whole product.** Before building it, I thought the differentiator would be the CLI's JSON output or the SKILL.md onboarding — standard "agent-friendly tool" stuff. After using the push flow for a week, I realized it's the only thing I genuinely can't get from any other SQLite tool. Claude Code pushes a query into my GUI, I see the results render, we both look at the same cells. That collaboration mode doesn't exist anywhere else in the category, and once you have it you can't go back.

I also learned that **shared-core monorepos are worth the upfront pain.** There was a week where I kept banging my head against Cargo workspace + Bun workspace interop, multi-crate clippy, cross-crate serde derives. But once it settled, the velocity was enormous — every feature I added to `sqlv-core` got three UI surfaces for free. If I'd split CLI and desktop into two repos I'd still be copy-pasting schema introspection.

Finally, **safety defaults are product decisions, not engineering details.** Read-only by default with an OS-level flag (not advisory) is a trivial one-line change that meaningfully changes who can trust the tool. A 3-pixel warning strip when read-write is enabled costs nothing and makes the mode legible from across the room. These felt small while building them; they're load-bearing in practice.

## Motivation & Context

I built `sqlv` because I watch coding agents chain-call `sqlite3` CLI with `head -20 | awk` hacks and it feels like 2008. The agents have the capability to drive real tooling, the tools just don't want to be driven.

The other reason: I'm tired of context-switching between my terminal and DB Browser forty times per session. The push flow was the feature I wanted for myself — one glance at the GUI instead of scrolling back through terminal history to find that query. Claude Code + `sqlv push` is the first time the "terminal + GUI" split has actually felt like one tool.

## Status

v0.1 shipped. CLI + desktop app (macOS DMG) + MCP server + SKILL.md all in the GitHub release.

- Binaries: `sqlv-v0.1.0-{aarch64|x86_64}-apple-darwin.tar.gz`, Linux + Windows zips, `SQLite-Viewer-0.1.0.dmg`.
- Open source under MIT.
- [github.com/shizhigu/sqlite-viewer](https://github.com/shizhigu/sqlite-viewer)
