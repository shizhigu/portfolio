# PROJECT_BRIEF.md

## 1. One-Liner

Fundley (branded "Foga pi") is an AI-powered financial analysis platform that turns natural-language questions about public companies into interactive, reusable analysis reports -- combining a conversational chatbot, multi-agent orchestration, sandboxed Python execution, and institutional-grade financial data in a single workspace.

---

## 2. The Problem

Professional financial analysis is stuck in a fragmented, manual workflow. Analysts, portfolio managers, and investment professionals routinely juggle five or six disconnected tools just to answer a single question:

**Bloomberg or Capital IQ** for raw data retrieval. **Excel** for pivoting, modeling, and ratio calculations. **Python notebooks** for anything more sophisticated -- rolling TTM computations, custom screeners, peer-comparison charts. **SEC EDGAR** for filing text (MD&A sections, risk factors, business descriptions). **PowerPoint or Word** for packaging the output into something stakeholders can read.

Each tool switch costs context. Copy-pasting numbers between a terminal and a spreadsheet introduces transcription errors. Running a Python notebook in Jupyter means leaving the data context entirely and managing a separate environment. By the time the analyst has an answer, hours have passed, and the "analysis" is a collection of scattered files with no audit trail connecting the original question to the final chart.

The situation is worse for recurring analyses. Quarterly portfolio monitoring, for instance, means repeating the same fragmented workflow every three months -- same companies, same metrics, same charts, slightly different numbers. There is no mechanism to parameterize and reuse the analytical logic. Each cycle starts from scratch.

Generic AI chatbots (ChatGPT, Claude, Gemini) do not solve this. They lack direct access to verified financial data, cannot execute code to produce auditable calculations, generate plain-text responses that disappear after the conversation ends, and are prone to hallucinating numbers when asked quantitative questions. The gap between "explain the concept of ROE" and "calculate trailing-four-quarter ROE for NVDA, AMD, and INTC, then chart the trend" is enormous, and general-purpose models fall squarely on the wrong side of it.

The core problem, then, is not that analysts lack intelligence or tools -- it is that no single environment connects the question, the data, the computation, and the deliverable into a coherent, auditable, reusable chain.

---

## 3. The Solution

Fundley addresses this by collapsing the entire analysis workflow into a single conversational interface backed by specialized AI agents.

A user types a question in natural language -- "Compare NVDA and AMD gross margins over the last 8 quarters with QoQ and YoY trends" -- and the system handles everything else. Behind the scenes, a multi-agent pipeline retrieves verified financial data from institutional-grade APIs (Financial Modeling Prep covering 6,000+ public companies; Polygon.io for options data; EODHD for news), executes Python analysis code in a secure E2B cloud sandbox, generates interactive visualizations, and packages the result into a persistent **Analysis Block** -- a self-contained knowledge card combining an executive summary (Markdown), data tables (JSON), and interactive charts (HTML).

What makes this more than a chatbot:

- **Analysis Blocks as Knowledge Artifacts.** Every analytical output is saved as an independent, reusable block. Blocks persist across chat sessions, can be searched, pinned, duplicated, and exported to Excel. They are the unit of institutional knowledge -- a growing library of analyses that the user (or team) can reference, update, and build upon.

- **Transparent, Auditable Computation.** The AI does not "guess" at numbers. It retrieves real financial data via authenticated APIs, writes Python code that executes in a sandboxed Jupyter notebook, and stores the notebook alongside its artifacts. Users can inspect exactly which data was fetched, how calculations were performed, and what code generated each chart. This is not a black box -- it is a glass box.

- **Financial Data Panel and Screener.** Beyond the chat interface, the right-panel provides a dedicated Financial Data panel where users select stock symbols, custom metrics (with SQL formulas stored in the database), and time periods to generate comparative tables with QoQ and YoY trends. A separate Screener panel lets users describe stock-screening criteria in natural language, which a specialized agent translates into SQL queries executed against a MotherDuck/DuckDB warehouse containing the full market dataset.

- **Multi-Source Research Integration.** The system extracts key sections from SEC filings (10-K/10-Q MD&A, risk factors, business descriptions) via SEC-API.io, ingests financial news through EODHD with time-aware narrative analysis (Temporal RAG), and runs web searches when needed -- all coordinated by the orchestrator agent so the user never has to specify where to look.

- **Custom Metric Engine.** Users can define custom financial metrics using mathematical formulas (stored as LaTeX for display and SQL for computation). The system includes a formula parser that generates Abstract Syntax Trees, a compiler that converts ASTs into step-by-step LLM instructions, and an Enhanced Financial Engine that translates ASTs directly into DuckDB SQL for market-wide scanning. Pre-built metrics include ROE (net income / average equity), ROA (net income / average assets), gross margin, operating margin, free cash flow yield, and more.

- **Watchlist with SQL Templates.** Users maintain watchlists of tracked symbols organized into groups, with associated SQL templates for recurring analyses. The Watchlist Table Panel executes these templates against the MotherDuck warehouse, producing sortable, filterable result tables with Excel export.

- **Credit-Based Monetization.** A Stripe-integrated subscription system with three tiers (Starter at $99/month, Pro at $249/month, Institutional at $1,249/month) meters usage via a dual credit pool (subscription credits that reset monthly plus permanent add-on credits). Token-level billing ensures precise cost attribution per conversation.

---

## 4. Architecture Overview

The system is a **dual-runtime hybrid** -- a Next.js 15 application (TypeScript) handling the frontend, API routing, authentication, and database operations, paired with a Python agent service (Agno framework) handling AI orchestration, tool execution, and code sandboxing.

```
User Browser
    |
    v
Next.js 15 (App Router) -- Vercel/Node.js runtime
    |-- Clerk (authentication, session management, webhooks)
    |-- PostgreSQL via Neon (users, chats, messages, blocks, credits, watchlists)
    |-- API Routes:
    |     /api/chat/[chatId]/stream  --> SSE streaming to Python agent service
    |     /api/financial-data         --> SQL formula execution via Python microservice
    |     /api/screener              --> Natural-language-to-SQL via screener agent
    |     /api/earnings-transcript   --> FMP transcript API proxy
    |     /api/company-compare       --> MotherDuck-backed comparison
    |     /api/news                  --> FMP stock news + press releases
    |     /api/stripe/*              --> Subscription lifecycle
    |     /api/blocks/*              --> CRUD for analysis blocks
    |     /api/watchlist/*           --> Watchlist and group management
    |     /api/sql-templates/*       --> Saved SQL template management
    |
    v
Python Agent Service (Agno / AgentOS) -- FastAPI on Render
    |-- Financial Analyst Agent (primary, GPT-5.2 w/ reasoning)
    |     |-- E2B Sandbox (Jupyter notebook execution, artifact generation)
    |     |-- FMP Toolkit (structured financial data retrieval)
    |     |-- FMP API Discovery (RAG-based endpoint search + dynamic API calls)
    |     |-- SEC Filings Tools (MD&A, risk factors, business overview extraction)
    |     |-- SQL Query Tool (MotherDuck/DuckDB data warehouse)
    |     |-- Block Tools (create, update, switch analysis blocks)
    |     |-- Web Search / Research Delegation
    |     |-- Financial Timeline (temporal news narrative analysis)
    |     |-- Analysis Templates Toolkit
    |     |-- Currency Conversion
    |     |-- Reasoning Tools (structured think/analyze scratchpad)
    |
    |-- Orchestrator Team (GPT-5-mini coordinator)
    |     |-- Financial Agent (market data specialist)
    |     |-- Research Agent (qualitative signals from filings and news)
    |     |-- Data Coding Agent (programmatic workflows, visualizations, blocks)
    |
    |-- Screener Agent (natural language to SQL)
    |-- Recommendation Agent (contextual follow-up suggestions)
    |-- Conversation Naming Agent (auto-title generation)
    |
    |-- Shared Infrastructure:
          |-- Redis (sandbox pool management, active block state, block history)
          |-- Qdrant (vector search for API docs, financial field metadata)
          |-- Voyage-finance-2 (financial document embeddings)
          |-- MotherDuck/DuckDB (cached financial data warehouse)
```

**Communication flow for a chat message:**

1. User sends message via the browser. The Next.js API route (`/api/chat/[chatId]/stream`) authenticates via Clerk, checks credit balance, saves the user message to PostgreSQL, and opens an SSE stream.
2. The route forwards the message to the Python agent service (`/agents/financial-analyst/runs`) with session context (active block ID loaded from Redis, financial data from the panel, watchlist symbols).
3. The Analyst agent (or Orchestrator team, depending on configuration) processes the request -- calling tools, executing code in E2B sandboxes, fetching data from APIs.
4. Streaming events flow back through the SSE connection. The Next.js route intercepts each event type: `RunContent` chunks are accumulated and batch-saved to the messages table; `ToolCallCompleted` events are persisted as tool messages; `RunCompleted` events trigger credit deduction based on token metrics.
5. The browser renders content in real-time: chat text streams into the left panel, while analysis blocks, financial data tables, and screener results populate the right panel.

---

## 5. Technical Deep Dive

### 5.1 Analysis Block Lifecycle

The Analysis Block is the central abstraction. Each block is an independent entity stored in PostgreSQL (`analysis_blocks` table) with a UUID, user ownership, title, description, associated ticker symbols (stored as a `TEXT[]` array with GIN index for multi-symbol queries), tags, and flexible JSONB content.

On the file system, each block maps to a directory: `/tmp/fundley/{user_id}/blocks/{block_id}/` containing a Jupyter notebook (`analysis.ipynb`), generated reports (`report.html`), data tables (`data.json`), and charts. The notebook is managed programmatically via `nbformat` -- the agent adds cells incrementally (parameters, data fetching, analysis, visualization), and the E2B sandbox executes them with variable persistence across cells.

The frontend renders blocks through `AnalysisBlockRenderer`, which handles Markdown summaries, interactive data tables (TanStack Table with sorting, filtering, pagination), and embedded HTML visualizations. Blocks support pinning, duplication, Excel export, context-menu operations, and detail/fullscreen views.

Active block state is synchronized through Redis. When a user opens a block in the UI, the block ID is written to Redis. The agent's pre-hook (`update_session_state`) reads this value before every request, ensuring the agent always knows which block to update -- without requiring the frontend to pass block IDs in every message.

### 5.2 Custom Metric Engine and Formula System

The platform implements a sophisticated three-layer metric computation system:

**Layer 1 -- Formula Parser (`lib/formula/parser.ts`).** A recursive-descent parser that tokenizes mathematical expressions (supporting fields, numbers, operators, parentheses, function calls like `ABS()`, `GROWTH()`, `IF()`) and produces a typed AST. The parser includes validation against known financial fields and function arity checking.

**Layer 2 -- Formula Compiler (`lib/formula/compiler.ts`).** Converts the AST into step-by-step calculation instructions formatted as an LLM prompt. This ensures the AI follows the exact computation sequence specified by the user's formula, rather than attempting its own mathematical reasoning. Each step specifies the operation, inputs, output variable, and the expression to evaluate.

**Layer 3 -- Enhanced Financial Engine (`lib/financial/enhanced-engine.ts`).** An AST-to-SQL transpiler targeting DuckDB/MotherDuck. It recursively converts AST nodes into SQL expressions, handling field references (with rolling window selectors using `LAG` and window functions), arithmetic operations, aggregations (`SUM`, `TTM`, `AVERAGE`), rolling computations, and conditional logic (`CASE WHEN`). The engine constructs a complete CTE-based query that joins income statements, balance sheets, and cash flow statements, applies time filters, and ranks results. For small batches it queries by symbol; for large batches (>100 symbols) it switches to a full market scan.

Metric definitions are stored per-user in the `latex_metrics` table, with LaTeX code for display rendering and a JSONB `formula` field containing the SQL expression. The migration `0023_add_roe_roa_metrics.sql` illustrates this pattern: it inserts ROE and ROA formulas for all users, using `netincomeaccounting` with `LAG()` window functions to compute average equity/assets across periods.

### 5.3 Streaming Architecture and Credit System

The streaming endpoint (`/api/chat/[chatId]/stream`) implements a resilient SSE architecture:

- **Heartbeat mechanism:** A 5-second interval heartbeat prevents connection timeouts during long-running analyses (E2B sandbox operations can take minutes).
- **Client disconnect resilience:** If the browser disconnects mid-stream, the server continues processing the backend response to completion. This is critical because credit deduction occurs in the `RunCompleted` event -- if the server stopped early, the user would consume AI resources without being billed.
- **Backend stall detection:** A 30-second monitor detects if the Python backend stops sending data, logging warnings and sending extra heartbeats to keep the connection alive.
- **Batch database updates:** Assistant content is accumulated and written to the database every 500 characters rather than on every token, reducing write amplification.
- **Sensitive information sanitization:** Display messages from tool calls are filtered to remove references to internal data sources (FMP, Polygon, MotherDuck, DuckDB), programming error types, and implementation details before reaching the user.

The credit system implements dual-pool deduction: subscription credits (which reset monthly) are consumed first; when exhausted, add-on credits (permanent, purchased separately) are used. Token metrics from the agent run (input, output, and reasoning tokens) are converted to credits using a formula based on GPT-5 pricing ($1.25/M input, $10/M output+reasoning tokens, with 1 credit = $0.20). The `credit_transactions` table provides a complete audit trail.

### 5.4 RAG-Based API Discovery

Rather than hardcoding API endpoints, the system uses a vector-search-powered discovery mechanism. FMP API documentation (270+ endpoints) and Polygon API documentation are embedded and stored in a PostgreSQL-backed vector store (using OpenAI `text-embedding-3-small`). When the agent needs financial data, it calls `search_docs()` with a natural language query like "balance sheet quarterly data", retrieves the most relevant API documentation with full parameter specifications, and then calls `call_api()` with structured arguments. This design means the system can leverage new API endpoints as they are added to the documentation store, without any code changes.

### 5.5 Temporal RAG for News Analysis

The news analysis pipeline implements a novel algorithm for discovering time-aware financial narratives:

1. Financial news is fetched from EODHD and structured into events using LLM extraction.
2. Events are embedded using Voyage-finance-2 (a domain-specific embedding model optimized for financial text).
3. Events are stored in Qdrant with temporal metadata.
4. A greedy sliding-window algorithm discovers narrative chains: it finds events similar to the query within configurable time windows, connects causally-related events through temporal proximity and embedding similarity, and produces a scored narrative without relying on LLM causal judgment (which MIT 2024 research found to be unreliable for financial causation).

### 5.6 Multi-Agent Coordination

The system offers two agent configurations:

**Single-Agent Mode (Production Default).** The Financial Analyst agent handles everything directly. It has access to all tools (E2B sandbox, FMP API, SEC filings, SQL queries, block management, web search, timeline analysis, templates) and uses GPT-5.2 with reasoning capabilities. Pre-hooks load workspace state from Redis before each request.

**Team Mode (Orchestrator).** A GPT-5-mini coordinator delegates to three specialists: a Financial Agent for quantitative data retrieval, a Research Agent for qualitative signals from filings and news, and a Data Coding Agent for programmatic analysis and block creation. The orchestrator plans the workflow, assigns tasks to the relevant specialist, reconciles outputs, and assembles the final response.

Both modes use Agno's `AgentOS` framework, which provides session management, state persistence (via PostgreSQL), streaming event protocols, and tool execution infrastructure.

---

## 6. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Framework** | Next.js 15 (App Router, Canary) | Server-side rendering, API routes, streaming |
| **UI Library** | React 19, Tailwind CSS 3, shadcn/ui (Radix) | Component system, theming, accessibility |
| **State Management** | Zustand, React Context, TanStack Query | Client state, chat context, server cache |
| **Data Tables** | TanStack Table v8, react-data-grid | Sortable/filterable financial data grids |
| **Charts** | Recharts, Chart.js, Lightweight Charts | Data visualization, trading charts |
| **Rich Content** | KaTeX, Mermaid, Markdown-it, highlight.js | LaTeX formulas, diagrams, syntax highlighting |
| **3D / Motion** | Three.js, Framer Motion, Aceternity UI | Welcome splash, animations, visual effects |
| **Spreadsheet Export** | ExcelJS, XLSX, PapaParse | Multi-sheet Excel export with formatting |
| **Authentication** | Clerk (Next.js SDK) | OAuth, session management, webhook sync |
| **Database** | PostgreSQL (Neon Serverless) | Users, chats, messages, blocks, credits, metrics |
| **ORM / Query** | Drizzle ORM, raw SQL via `@neondatabase/serverless` | Schema management, migrations, queries |
| **Data Warehouse** | MotherDuck / DuckDB | Cached financial data, market-wide scans |
| **Vector Database** | Qdrant | API doc search, financial field metadata, news embeddings |
| **Embeddings** | Voyage-finance-2, OpenAI text-embedding-3-small | Financial document embeddings, API doc search |
| **AI Framework** | Agno (AgentOS) | Agent lifecycle, tool execution, session state, streaming |
| **LLM Models** | GPT-5.2 (primary), GPT-5-mini (orchestrator), xAI Grok-4-fast (memory) | Reasoning, planning, memory management |
| **Code Sandbox** | E2B Code Interpreter | Isolated Python execution, notebook management |
| **Financial Data** | Financial Modeling Prep (FMP) | 6,000+ company fundamentals, statements, ratios |
| **Options Data** | Polygon.io | Options contracts, market operations |
| **SEC Filings** | SEC-API.io | 10-K/10-Q extraction (MD&A, risks, business) |
| **News Data** | EODHD | Financial news events for temporal analysis |
| **Caching / State** | Redis | Sandbox pool, active block sync, block history |
| **Payments** | Stripe | Subscriptions, checkout, customer portal, webhooks |
| **Deployment** | Vercel (frontend), Render (Python service) | Edge CDN, serverless functions, container hosting |
| **Internationalization** | next-intl | English and Chinese locale support |
| **CI/CD** | GitHub Actions | Lint checks, Playwright E2E tests |
| **Monitoring** | OpenTelemetry, Vercel Analytics | Distributed tracing, usage analytics |

---

## 7. Challenges & Solutions

### Bridging Two Runtimes with Reliable Streaming

The dual TypeScript/Python architecture means every chat message crosses a network boundary twice (browser to Next.js, Next.js to Python service) before any AI processing begins. Keeping the SSE stream alive across both hops during analyses that can take several minutes (complex E2B sandbox operations, multi-tool chains) was the hardest infrastructure problem. The solution was a layered resilience system: 5-second heartbeats on the Next.js side, a backend stall detector that escalates if no data arrives for 30 seconds, and a critical design decision to never abort the backend stream even if the client disconnects -- because credit deduction happens at `RunCompleted`, and losing that event means lost revenue.

### Custom Metric Computation at Scale

Users expect to define arbitrary financial formulas and see results across hundreds of companies instantly. The naive approach -- computing each metric per-symbol with individual API calls -- does not scale. The solution was the three-layer metric engine: formulas are parsed into ASTs, ASTs are transpiled into DuckDB SQL with window functions for rolling computations and LAG for period-over-period comparisons, and the resulting query runs against the MotherDuck warehouse in a single pass. For batches under 100 symbols the engine uses targeted queries; above 100 it switches to a full market scan with ranking.

### Making AI Calculations Trustworthy

Financial professionals will not use a tool that "makes up numbers." The architecture enforces auditability at every layer: data comes from authenticated API calls (not LLM knowledge), calculations run as Python code in E2B sandboxes (not mental math by the model), and the Jupyter notebook is preserved alongside the results so anyone can inspect the exact code that produced each number. The formula compiler takes this further by converting user-defined formulas into rigid step-by-step instructions that the LLM follows mechanically, preventing it from taking "shortcuts" that might introduce errors.

### Agent State Management Across Sessions

Analysis blocks are independent of chats -- a user might create a block in one conversation and continue modifying it in another. This required a centralized state mechanism. Redis serves as the single source of truth for the "active block" per user. The agent's pre-hook reads from Redis before every request; the frontend writes to Redis when the user opens or closes a block. This decouples the block lifecycle from the chat lifecycle, enabling true cross-session persistence without passing block IDs in every API call.

### Sensitive Information Leakage

The multi-tool agent produces verbose internal status messages referencing data sources (FMP, Polygon, MotherDuck), error types (IndentationError, SyntaxError), and implementation details that should never reach end users. A sanitization layer in the streaming route filters display messages against a keyword blocklist before forwarding them to the browser, preserving the feeling of a polished product while keeping the debugging information in server logs.

---

## 8. What I Learned

**Dual-runtime architectures are powerful but operationally expensive.** TypeScript for the frontend and Python for AI/ML is the right technical choice -- Python's ecosystem for data science, sandboxing, and agent frameworks is unmatched -- but the operational overhead of maintaining two deployment targets, two dependency trees, and a network boundary between them is significant. Every feature touches both sides.

**Agent frameworks are still immature.** Agno (AgentOS) provides useful primitives (session management, tool registration, streaming protocols), but production hardening -- timeout handling, error recovery, state cleanup after partial failures -- required substantial custom code. The agent framework handled the happy path; we built the error paths.

**The gap between "AI chatbot" and "AI application" is enormous.** A chatbot responds to messages. An application manages state, enforces business rules (credits, subscriptions), persists structured artifacts, handles concurrent users, integrates with payment systems, and maintains audit trails. The AI model is perhaps 20% of the engineering effort; the other 80% is the application infrastructure around it.

**Formula-to-SQL transpilation is underappreciated.** Letting users define custom metrics that execute as SQL against a columnar data warehouse turned out to be one of the most powerful features. The AST approach -- parse once, compile to multiple targets (LLM instructions, DuckDB SQL, display LaTeX) -- provides a clean separation of concerns and enables features like market-wide screening that would be impossibly slow with row-by-row computation.

**Vector search for API discovery is a force multiplier.** Embedding API documentation and searching it semantically means the agent can use hundreds of API endpoints without any of them being hardcoded. When FMP adds a new endpoint, we embed the docs and the agent discovers it automatically. This pattern generalizes well beyond financial APIs.

**Credit systems need to be bulletproof.** Financial applications attract scrutiny around billing accuracy. The dual-pool credit system (subscription first, then add-on) with a complete transaction audit trail, combined with the "never abort the stream" policy for credit deduction, was essential for building trust. Every token is accounted for, every deduction is logged, and the system errs on the side of the customer when edge cases arise.

---

## 9. Motivation & Context

I built Fundley to solve a problem I experienced directly. As someone working at the intersection of finance and technology, I watched analysts spend 60-70% of their time on data wrangling -- not analysis. The tools existed (Bloomberg, Python, Excel) but they were islands, each requiring context switches that destroyed flow and introduced errors.

The emergence of capable LLMs created an opportunity to build the connecting tissue between these islands. But the early wave of "AI for finance" products made a mistake: they treated the LLM as the source of truth for financial data. An LLM that hallucinates a company's revenue is worse than no tool at all.

Fundley's design philosophy is that **the LLM is an orchestrator, not an oracle**. It understands the user's question, plans the analytical workflow, coordinates data retrieval from authoritative sources, writes and executes code for computation, and packages the results -- but it never invents a number. Every data point traces back to an API call, every calculation traces back to executable code.

The Analysis Block concept emerged from observing how analysts actually work: they build up knowledge incrementally, reuse analytical frameworks across companies, and need to share structured outputs (not chat logs) with colleagues and stakeholders. Blocks are designed to be the atomic unit of institutional knowledge -- self-contained, reusable, exportable, and versionable.

The project also served as a deep exploration of modern AI application architecture. Building a production multi-agent system with sandboxed code execution, vector search, streaming protocols, credit billing, and multi-tenant authentication required solving problems that do not appear in tutorials or demos. The 342 commits across six months of development reflect the iterative process of discovering and resolving these challenges.

---

## 10. Status

**Active development.** The platform is functional with the following capabilities deployed:

- Conversational financial analysis with streaming AI responses
- Analysis Block creation, persistence, search, pinning, duplication, and Excel export
- Financial Data Panel with custom SQL-based metrics, QoQ/YoY trends, and multi-symbol comparison
- Stock Screener with natural-language-to-SQL translation
- Watchlist management with groups, SQL templates, and MotherDuck query execution
- Earnings transcript viewer (via FMP API)
- Company comparison panel (multi-metric peer benchmarks)
- SEC filing extraction (MD&A, risk factors, business overview)
- Credit-based billing with Stripe subscription integration (three tiers)
- Clerk authentication with webhook-synced user database
- Bilingual interface (English and Chinese)
- White-label branding system (configurable via environment variables)
- Playwright E2E test suite and GitHub Actions CI

**Recent work** has focused on refining financial metric accuracy (the latest commit corrects ROE and ROA formulas to use `netincomeaccounting` instead of `netincome`), adding symbol sorting and improved Excel export formatting in the Financial Data Panel, and enhancing the Analysis Blocks Panel with stock lookup and performance comparison sub-tabs.

**Architecture evolution:** The project migrated from Convex to PostgreSQL (Neon) for database flexibility, from single-script execution to Jupyter notebook-based analysis for incremental development and debugging, and from a tightly-coupled chat-block model to independent block storage for cross-session reusability. The Python agent service evolved from a custom ADK implementation to the Agno AgentOS framework for standardized agent lifecycle management.

**Repository:** [github.com/shizhigu/fundley-app-new](https://github.com/shizhigu/fundley-app-new)
**File count:** ~305 tracked source files across TypeScript and Python
**Commit history:** 342 commits over approximately six months of development (August 2025 -- February 2026)
