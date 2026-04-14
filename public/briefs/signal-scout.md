# Signal Scout — Technical Brief

## One-Liner

Autonomous AI agent swarm that discovers your ideal customer profile from raw CRM data — zero prompts, statistically rigorous, production-grade.

## The Problem

Every B2B sales team asks the same question: "Who are our best customers?" The answer is buried in messy CRM data — thousands of deals with inconsistent fields, manual stage mappings, and no standard schema. Getting a real answer today requires either a $100K data science consulting engagement (4 weeks, 200-page PDF) or a VP of Sales who "just knows" from gut feeling.

Traditional BI tools (Tableau, Looker) can show you dashboards, but they require you to know what questions to ask. If you don't know that "Tech companies with 50-100 employees" is your sweet spot, you'll never build that dashboard. The whole point is that you don't know what you don't know.

LLM-based analysis tools (ChatGPT, Claude web) are convenient but dangerously confident. They'll tell you "Tech companies are your best customers!" without checking if the sample size is 3 or 3,000, without running a chi-square test, without computing effect sizes. They hallucinate statistical significance.

Signal Scout solves this by combining the statistical rigor of a data science team with the autonomous discovery of an AI agent — at the speed of a single API call. Upload your data, wait 5 minutes, get a structured ICP profile backed by p-values, confidence intervals, and effect sizes. No prompts. No dashboards. No consultants.

## The Solution

Signal Scout is a B2B ICP (Ideal Customer Profile) discovery and monitoring platform powered by Claude Agent SDK. It takes raw CRM data — from HubSpot, Salesforce, CSV uploads, or direct database connections — and autonomously discovers which customer segments win at the highest rates, why they win, and what to avoid.

The core innovation is a 4-layer hybrid architecture that separates deterministic computation from AI reasoning. Layers 1-2 handle schema mapping and data normalization. Layer 3 runs fixed SQL queries to compute exact win rates, p-values, chi-square tests, effect sizes (Cramér's V, Cohen's d), and Wilson confidence intervals across every dimension in the data. Layer 4 is a Claude Agent SDK instance that receives Layer 3's statistical output and performs deeper investigation — testing feature interactions, discovering non-obvious correlations, identifying counter-intuitive segments, and generating human-readable business insights.

The key insight is that neither layer alone is sufficient. SQL without AI gives you numbers without context. AI without SQL gives you confident bullshit. Together, they produce intelligence you can trust: "Tech + Enterprise (50-100 employees) has a 75% win rate (p=0.02, Cramér's V=0.25, n=120). This segment closes 2x faster and 32% larger than baseline. Recommendation: increase SDR allocation to this segment."

## Architecture Overview

The system is built as a React Router v7 frontend backed by a FastAPI service, with heavy computation offloaded to Modal serverless containers.

Data enters through a connector layer supporting HubSpot, Salesforce, PostgreSQL, MotherDuck, and CSV uploads. The connector normalizes raw data into a staging area, preserving the original schema alongside standardized views.

Schema mapping (Layer 2) is itself agent-driven. CRM data is notoriously messy — "Stage" vs "Pipeline Stage" vs "Deal Status", "Closed Won" vs "Won" vs "Active-Won". A Claude agent examines the raw fields and values, proposes a semantic mapping to a standard schema (primary key, outcome field, dimension fields), and generates SQL VIEWs that transform the data in place. This eliminates the "95% integration complexity" problem that kills most analytics tools.

Analysis runs on Modal serverless containers. Each user gets their own volume and DuckDB instance. When a user triggers analysis, the system launches a container that executes Layers 3 and 4 sequentially. Layer 3 is pure SQL — deterministic, reproducible, fast. Layer 4 is a Claude Agent SDK client with access to custom MCP tools: `execute_sql` for ad-hoc queries, `record_insight` for incremental findings, `suggest_alert` for monitoring rules, and `submit_report` for the final structured output. The agent runs for up to 30 turns, iteratively querying and reasoning.

Meanwhile, the frontend doesn't wait. A real-time analytics engine queries MotherDuck directly with sub-500ms latency, enabling interactive drill-down into any dimension while the deeper agent analysis runs in the background.

## Technical Deep Dive

### The 4-Layer Hybrid Architecture

Layer 1 (Data Ingestion) handles connector-specific extraction and raw data storage. Each connector implements a common interface with `connect()`, `extract()`, and `get_schema()` methods. Data lands in DuckDB tables on the user's Modal volume.

Layer 2 (Schema Mapping) is where AI first enters. The schema mapper agent receives the raw table schemas and sample values, then generates a structured mapping JSON: which field is the primary key, which field represents the outcome (won/lost), which fields are dimensions (industry, company size, region), and what value transformations are needed ("Closed Won" → "won"). This mapping is validated against the actual data before proceeding.

Layer 3 (Deterministic Analytics) executes a fixed battery of SQL queries through the `ICPAnalyticsEngine`. For each dimension in the data, it computes: total deals, win count, win rate, lift over baseline. It then runs statistical tests: chi-square for categorical variables, t-tests for numerical variables. For significant findings, it computes effect sizes (Cramér's V for categorical, Cohen's d for numerical) and Wilson confidence intervals. The output is a structured JSON of statistically validated segments.

Layer 4 (Agent Interpretation) receives Layer 3's output and goes deeper. The Claude Agent SDK client has full tool access — it can run arbitrary SQL queries, execute Python scripts (scipy, pandas), and record findings incrementally via MCP tools. The agent's system prompt instructs it to: investigate feature interactions (is Tech + Enterprise better than either alone?), test for confounders (is the high win rate in Tech because your best rep covers Tech?), identify anti-ICP segments (who to actively avoid), and propose monitoring alerts (notify if ICP win rate drops below X%).

The MCP tool `submit_report` enforces output structure — the agent must provide `icp_attributes` (array of {dimension, value, win_rate, confidence, evidence}), `anti_icp_attributes`, `summary` (markdown), and `metrics` (baseline vs ICP comparison). This eliminates hallucinated output formats.

### Real-Time Analytics Engine

While Layer 4 runs (2-5 minutes), users interact with the Workspace/Explorer UI. The `RealtimeAnalyticsEngine` in `icp/realtime/engine.py` handles this by querying MotherDuck directly. It supports dynamic filtering (select industry=Tech, see updated win rates), dimension overview (all dimensions ranked by statistical signal), and pipeline scoring (which open deals match the current ICP).

Key optimization: column detection is cached per-session, and queries are templated with parameterized filters. This keeps latency under 500ms even with 100K+ deals.

### Statistical Methods

The statistics module (`icp/analytics/statistics.py`) implements:
- Chi-square test for independence (categorical dimensions)
- Student's t-test (numerical dimensions)
- Cramér's V (effect size for categorical, 0-1 scale)
- Cohen's d (effect size for numerical)
- Wilson confidence intervals (better than Wald for small samples)
- Composite confidence score: `f(p_value) × f(effect_size) × f(sample_size)`

This is critical for trust. The system doesn't report "Tech has a high win rate" — it reports "Tech has a 68% win rate (p=0.02, V=0.25, n=85, 95% CI [57%, 77%])". Sales leaders can verify the claim independently.

### Modal Serverless Orchestration

Each analysis runs in an isolated Modal container with its own compute, storage, and DuckDB instance. The `analysis_runner.py` orchestrates the full 4-layer pipeline within a single container invocation. Modal handles scaling automatically — 1 user gets 1 container, 1000 users get 1000 containers, with no server management.

The Modal volume persists between runs, so subsequent analyses on the same data skip Layer 1-2 (data already mapped) and go straight to Layer 3-4 (re-analysis with potentially new statistical methods or agent prompts).

### Frontend Architecture

The frontend is React Router v7 with Mantine UI. Key pages include:

- **Discover**: Launch analyses, view history, compare profiles over time
- **Analysis Detail**: Hero headline ("Your best customers are..."), key metrics (win rate, deal size, close time), ICP attributes with confidence scores, anti-ICP attributes, AI-generated insights
- **Workspace/Explorer**: Interactive drill-down with filter chips per dimension, real-time metric recalculation, pipeline fit scoring
- **Health Monitor**: ICP drift score (0-100), alert feed, evolution timeline
- **Alerts**: Configurable monitoring rules (e.g., "alert if ICP win rate drops below 70%")

Visualization uses ECharts for standard charts, Vega-Lite for statistical plots, and Plotly for interactive exploration.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React Router v7, React 19, Mantine UI | Server components, file-based routing, rich component library |
| Visualization | ECharts, Vega-Lite, Plotly | Statistical charts + interactive exploration |
| Auth | Clerk | JWT-based, role management, webhook sync |
| Backend | FastAPI (Python) | Async-first, type-safe with Pydantic |
| AI Engine | Claude Agent SDK + MCP Tools | Autonomous agent with structured tool interfaces |
| Compute | Modal (serverless) | Per-user container isolation, auto-scaling, persistent volumes |
| Analytics DB | DuckDB / MotherDuck | In-memory SQL for fast analytics, cloud-native |
| App DB | PostgreSQL (Neon) + Drizzle ORM | Serverless Postgres, TypeScript schema-as-code |
| Statistics | scipy, numpy, pandas | Chi-square, effect sizes, confidence intervals |
| Styling | TailwindCSS v4 | Utility-first, works with Mantine |

## Challenges & Solutions

**Challenge 1: AI confidently reporting noise as signal.**
Every LLM will tell you "Industry X is your best segment!" even if the sample size is 3. Solution: Layer 3 computes statistical tests BEFORE the agent sees the data. The agent receives pre-validated findings with p-values and effect sizes, so it reasons about real patterns, not noise.

**Challenge 2: Messy CRM schemas breaking the pipeline.**
No two CRM exports look the same. "Stage", "Deal Stage", "Pipeline Status" all mean the same thing. Solution: Layer 2 uses a dedicated Claude agent for semantic schema mapping. It examines field names, sample values, and data types to propose mappings, then validates them against the actual data before proceeding.

**Challenge 3: Agent output format unpredictability.**
Asking Claude to "write a JSON report" produces different structures every time. Solution: MCP tools define exact function signatures. `submit_report(icp_attributes: List[ICPAttribute], anti_icp_attributes: List[...], summary: str, metrics: dict)` — the agent must call this function with these exact types, or the tool returns a validation error.

**Challenge 4: Analysis latency vs user experience.**
Full Layer 3+4 analysis takes 2-5 minutes. Users expect instant feedback. Solution: Dual-engine architecture — the real-time analytics engine serves sub-500ms queries for interactive exploration while the deep agent analysis runs asynchronously on Modal.

**Challenge 5: Scaling per-user compute.**
Each user needs isolated data storage and compute. Traditional servers = expensive. Solution: Modal serverless containers with per-user volumes. Pay only for compute time used. Scale from 1 to 10,000 users with zero infrastructure changes.

## What I Learned

The biggest lesson was that the hybrid approach (deterministic + agentic) is strictly superior to either alone. I initially built a pure agent system — Claude analyzing raw data directly. It was impressive in demos but unreliable in production: sometimes brilliant, sometimes confidently wrong. Adding the deterministic SQL layer as a foundation gave the agent "ground truth" to reason about, and the MCP tools gave it structured output rails. The combination is what makes it production-grade.

I also learned that the hardest part of a data product isn't analysis — it's ingestion. 80% of development time went into schema mapping, connector edge cases, and data normalization. The actual AI agent (Layer 4) was maybe 15% of the work. If I rebuilt this, I'd invest even more in the data layer and less in fancy UI.

Finally, the "unlimited token budget" philosophy was counterintuitive but correct. Most AI products optimize for cost — shorter prompts, fewer turns, cheaper models. I went the opposite direction: give the agent 30 turns, use the best model, let it explore. The result is dramatically better insights at a cost of maybe $0.50 per analysis. For a B2B product charging $200+/month, that's nothing.

## Motivation & Context

I built Signal Scout because I spent 2 years at a hedge fund watching analysts manually sift through data to find patterns. They were brilliant people doing repetitive work — running SQL queries, eyeballing distributions, writing reports. The process took weeks and the insights were only as good as the questions the analyst thought to ask.

When Claude Agent SDK launched with MCP tool support, I saw the opportunity to automate this entire workflow. Not by replacing the analyst's judgment (that's what the agent layer does), but by replacing their manual labor (that's what the SQL layer does) and giving the AI agent the same statistical tools the analyst would use.

The "1000 agents" framing comes from the scaling potential: on Modal, you can literally spin up 1000 concurrent analyses — one per user, each with its own Claude agent instance, running autonomously without a single human prompt. That's the vision: democratize data science by making every sales team's data self-analyzing.

## Status

Prototype complete. Core pipeline functional. Not yet commercially launched.
Open source under MIT license.
