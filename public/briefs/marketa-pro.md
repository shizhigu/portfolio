# PROJECT BRIEF: Marketa-Pro

## 1. One-Liner

Multi-agent AI platform that automates e-commerce content strategy for Chinese brands and KOL teams.

---

## 2. The Problem

Chinese e-commerce runs on content. Xiaohongshu (Little Red Book) posts, Douyin/TikTok short videos, Taobao product storytelling, and KOL (Key Opinion Leader) collaborations are not optional marketing channels --- they are the primary sales drivers for consumer brands in the Chinese market. A single product launch on Xiaohongshu might require trend research, audience persona development, messaging pillar definition, multi-format copywriting (carousel posts, video scripts, KOL briefs), brand-consistent imagery concepts, a posting calendar tuned to platform algorithms, and performance measurement criteria. This work is continuous: platforms shift trending formats weekly, audience preferences evolve by season, and new product launches are constant across SKU catalogs.

Small and mid-size brands --- the majority of sellers on these platforms --- cannot afford the five-to-ten person content teams that handle this workload at scale. They rely on fragmented freelance work, agency retainers they cannot control, or manual effort from founders who are simultaneously running operations, supply chain, and customer service. The result is inconsistent brand voice, missed trend windows, generic content that underperforms algorithmically, and an inability to execute multi-platform campaigns that reinforce each other. Agencies that serve these brands face the same bottleneck from the other side: they need to produce differentiated content packages for dozens of clients across multiple platforms, often with thin margins that make hiring additional content strategists impractical.

The problem extends beyond domestic Chinese commerce. Chinese brands expanding internationally (Cross-Border E-Commerce, or CBEC) face an even steeper content challenge: they must produce culturally localized content for overseas KOLs who operate on Instagram, YouTube, and international TikTok, while maintaining brand consistency with their domestic identity. The translation is not linguistic --- it is strategic. A product selling point that resonates on Xiaohongshu ("minimalist technology aesthetic") needs entirely different framing for a US Gen-Z TikTok audience. No single tool addresses this end-to-end content orchestration problem with the specificity these teams need.

---

## 3. The Solution

Marketa-Pro is a multi-agent AI platform that transforms a product brief into a complete, platform-optimized marketing content package. A user provides structured input --- product title, selling points, target platform, brand tone, audience demographic, and campaign goal (e.g., "new product seeding" or "holiday promotion") --- and the system orchestrates multiple specialized AI agents to produce trend analysis, campaign strategy, content execution roadmaps, and eventually full content assets (copy, imagery concepts, KOL collaboration briefs, posting schedules). The platform replaces the sequential handoff between trend researcher, content strategist, copywriter, designer, and campaign manager with an automated, coordinated pipeline that executes in minutes rather than days.

The system is built on Google's Agent Development Kit (ADK) for multi-agent orchestration, using LiteLLM as a model-routing abstraction layer that enables flexible access to Gemini, GPT, and Claude models through OpenRouter's cost-optimized API gateway. Each agent in the system is a domain specialist with its own prompt engineering, tool access, and output structure. The Orchestrator Agent receives user input and manages the full execution chain, delegating to the Trend Radar Agent (platform-specific trend intelligence), Campaign Planner Agent (strategic content decomposition), and Content Strategy Map Agent (synthesis of trends and plans into an actionable execution roadmap). The architecture is designed for horizontal expansion: the existing Planning Layer can hand off to a Content Generation Layer (copywriting, imagery, CTA, video scripts), an Execution Layer (multi-channel publishing, KOL brief generation), and a Monitoring Layer (engagement tracking, A/B testing), all coordinated by the same orchestrator pattern.

Marketa-Pro is not a generic content generation tool. It encodes domain knowledge about specific platform conventions (Xiaohongshu carousel best practices, TikTok hook-to-CTA structure, Taobao product storytelling rhythm), audience behavior patterns (optimal posting windows, engagement rate benchmarks by content format), and the specific workflow of Chinese e-commerce content teams (product brief to KOL package pipeline). The system is designed so that its specialized agents accumulate strategic intelligence over time through a planned Learning Memory Module, making the platform progressively more effective as it processes more campaigns.

---

## 4. Architecture Overview

Marketa-Pro uses a layered multi-agent architecture where each layer addresses a distinct phase of the content creation lifecycle. The Orchestrator Layer sits at the top, receiving user input and managing task state, execution sequencing, error handling, and result aggregation across all downstream agents. The Orchestrator Agent maintains an in-memory task state dictionary that tracks each campaign through discrete phases: initiated, planning, trend analysis, content strategy, content generation, and execution. This state machine pattern allows the system to handle partial failures gracefully --- if trend analysis fails, the orchestrator continues with campaign planning and notes the degraded input.

The Planning Layer contains three agents that operate in a coordinated sequence. The Trend Radar Agent analyzes platform-specific trends by crawling (currently simulated, designed for real API integration) trending topics, hashtags, content formats, engagement metrics, and optimal posting times for Xiaohongshu, TikTok, Taobao, and generic platforms. The Campaign Planner Agent decomposes user goals into structured campaign strategy: objectives, audience personas, messaging pillars, content flow structure, platform customization guidelines, brand voice consistency rules, and measurement signals. The Content Strategy Map Agent then synthesizes the outputs of both the Trend Radar and Campaign Planner into a unified execution roadmap with strategic alignment analysis, content pillars, a platform-specific execution plan, content calendar, performance metrics, and resource allocation recommendations.

Each agent follows a consistent internal architecture pattern: a class wrapping a Google ADK Agent instance configured with LiteLLM model routing, an ADK Runner for async execution, and an InMemorySessionService for conversation state. Agents expose async public methods (e.g., `analyze_platform_trends`, `create_campaign_plan`, `create_content_strategy_map`) that format domain-specific inputs into structured prompts, invoke the Runner, and return standardized result dictionaries with status codes, session IDs, and output payloads. This uniform interface makes agents composable and testable independently --- each agent has its own test script that can be run in isolation.

The workflow can be executed in two modes. The programmatic mode (via `main.py`) runs the Orchestrator's `process_user_input` method directly, which calls agents sequentially with explicit data passing between them. The ADK Web mode (via `run_web.sh` and the `marketa_workflow` SequentialAgent definition) exposes the full agent pipeline through Google ADK's web interface on port 8000, allowing interactive exploration and debugging of agent outputs. The SequentialAgent in `agents/workflow/marketa_workflow.py` wires the Orchestrator, Trend Radar, Campaign Planner, and Content Strategy Map agents into a linear execution chain that ADK discovers and renders in its web UI.

The database schema (defined in `db.sql` for PostgreSQL/Supabase) supports the production vision with tables for users, projects (each campaign task), tasks (agent execution chain with JSONB input/output), outputs (text, image, or ZIP file artifacts), feedbacks (engagement metrics like likes, comments, CTR, conversion), and subscriptions (Stripe integration for SaaS monetization). This schema reveals the intended evolution from the current prototype into a multi-tenant SaaS platform with per-user project management and a data-driven feedback loop.

---

## 5. Technical Deep Dive

**Google ADK as the Orchestration Backbone.** Marketa-Pro uses Google's Agent Development Kit (ADK) as its core multi-agent framework. Each agent is instantiated as a `google.adk.Agent` object with a model, description, instruction prompt, optional tools, and optional sub-agents. The ADK provides the `Runner` class for async agent execution and `InMemorySessionService` for maintaining conversation context across turns within a session. The `SequentialAgent` primitive from `google.adk.agents` is used to compose the workflow into a linear pipeline that ADK's built-in web UI can discover and execute. This choice of framework provides a standardized agent lifecycle, built-in session management, and a web debugging interface without requiring custom infrastructure.

**LiteLLM for Model-Agnostic Routing.** Every agent in the system accesses LLMs through the `google.adk.models.lite_llm.LiteLlm` wrapper, which abstracts the underlying model provider. The `utils/config.py` module centralizes model configuration, reading the OpenRouter API key and base URL from environment variables. The default model is `openrouter/google/gemini-pro-1.5`, but the LiteLLM abstraction means any model accessible through OpenRouter (GPT-4, Claude, Mistral, open-source models) can be swapped in by changing a single configuration string. This is a deliberate architectural decision: different agents may benefit from different models (e.g., a cheaper model for trend data formatting, a more capable model for strategy synthesis), and OpenRouter's unified API with per-token cost optimization makes multi-model routing practical without managing multiple provider SDKs.

**Orchestrator Agent: Task State Machine.** The Orchestrator Agent (`agents/orchestrator_agent.py`) is the system's control plane. Its `process_user_input` method implements a sequential execution pipeline: (1) format user input into a structured prompt, (2) call the ADK Runner for initial planning, (3) invoke the Campaign Planner Agent, (4) invoke the Trend Radar Agent, (5) invoke the Content Strategy Map Agent with the combined outputs, (6) aggregate all results into a unified response dictionary. Each step updates a `task_states` dictionary keyed by task ID, recording the current phase, intermediate results, and any errors. The method returns a comprehensive result object containing the task ID, overall status, initial planning output, campaign plan, trend analysis, content strategy, and a list of suggested next steps (content generation, execution). Error handling is layered: individual agent failures are caught and logged but do not halt the pipeline, and the orchestrator records the specific failure point in the task state for debugging.

**Trend Radar Agent: Platform Intelligence with Tool Integration.** The Trend Radar Agent (`agents/trend_radar_agent.py`) demonstrates ADK's tool integration pattern. It registers a `FunctionTool` wrapping the `_crawl_platform_trends` method, which the LLM agent can invoke during its reasoning process. The current implementation returns simulated trend data structured by platform (Xiaohongshu, TikTok, or generic), including trending topics with engagement rates, relevant hashtags, content format performance metrics (conversion rates, save rates, comment rates), optimal posting time windows by content type, and emerging conversation topics. The data structures are designed to be directly replaceable with real crawler/API outputs --- the agent's prompt instructs it to use the tool, analyze the returned data, and produce a structured trend report. This separation of data retrieval (tool) from analysis (LLM reasoning) is a clean pattern for evolving from simulated to production data sources.

**Campaign Planner Agent: Strategic Decomposition.** The Campaign Planner Agent (`agents/campaign_planner_agent.py`) takes user input (goal, product details, platform, brand tone, audience) and an optional trend analysis, then produces a structured campaign strategy document. Its instruction prompt defines seven output sections: Campaign Objectives (3-5 specific goals like increasing saves or driving comments), Audience Insights (target persona and platform-specific resonance factors), Messaging Pillars (3-5 core messages derived from product value), Suggested Content Flow (format-specific structure like Hook to Scene to Product to CTA), Platform Customization (tone, pacing, hashtag strategy, visual direction), Brand Voice Consistency (guidelines for maintaining tone across components), and Measurement Signals (2-3 performance indicators). The agent can operate with or without trend data, producing a baseline strategy from product information alone or an enhanced strategy when trend context is available.

**Content Strategy Map Agent: Synthesis Layer.** The Content Strategy Map Agent (`agents/content_strategy_map_agent.py`) is the Planning Layer's integration point. It receives the Campaign Planner's strategy output and the Trend Radar's analysis, then synthesizes them into a unified execution roadmap. Its output structure includes an Executive Summary, Strategic Alignment analysis (how trends and objectives intersect), Content Pillars (3-5 themes combining trend opportunities with campaign goals), a Platform-Specific Execution Plan, Content Calendar (timing and sequence for deployment), Performance Metrics (success indicators derived from both trend benchmarks and campaign targets), and Resource Allocation Recommendations (where to focus effort based on trend opportunities). This agent addresses a real workflow gap: in manual content operations, the handoff between trend research and campaign planning often produces misaligned strategies because no single person synthesizes both inputs holistically.

**Async Execution Pattern.** All agent interactions use Python's `asyncio` for non-blocking execution. The `Runner.run()` method is awaited, and the orchestrator's `process_user_input` is an async method. Test scripts handle event loop creation explicitly, including Windows-specific `WindowsSelectorEventLoopPolicy` configuration. This async-first design is essential for a multi-agent system where LLM calls have significant latency (seconds per call): it enables future parallelization of independent agent calls (e.g., running Trend Radar and Campaign Planner simultaneously) and integration with async web frameworks like FastAPI for the planned production API.

**ADK Web Interface Integration.** The `run_web.sh` script launches Google ADK's built-in web UI via `adk web --port 8000`, which discovers the `root_agent` defined in `agents/workflow/marketa_workflow.py`. This file creates a `SequentialAgent` named `marketa_workflow` that chains the Orchestrator, Trend Radar, Campaign Planner, and Content Strategy Map agents. The web interface provides an interactive chat-based UI for testing agent behavior, inspecting intermediate outputs, and debugging prompt engineering. The project's `__init__.py` imports both the `agent` module (exposing the root agent) and the `marketa_workflow` module, making both entry points discoverable by ADK's agent discovery mechanism.

**Structured Prompt Engineering.** Each agent's instruction prompt is carefully structured with numbered responsibilities, a defined workflow process, and explicit output format specifications using markdown headers. For example, the Trend Radar Agent's prompt specifies five output sections (Current Platform Trends, Relevant Hashtags, Content Format Recommendations, Optimal Posting Times, Emerging Conversations) with expected content descriptions. This structured prompting ensures consistent, parseable output across runs, which is critical when downstream agents consume upstream agent outputs as input context. The Orchestrator Agent's prompt explicitly instructs it not to ask the user for additional information, enforcing an autonomous execution pattern.

**Database Design for Production Evolution.** The `db.sql` schema defines five tables in PostgreSQL: `users` (with plan tiers), `projects` (per-campaign tasks linked to users), `tasks` (agent execution chain with JSONB input/output data, status tracking, and execution timestamps), `outputs` (content artifacts with type classification and file URLs), and `feedbacks` (engagement metrics: likes, comments, CTR, conversion rate). A `subscriptions` table with Stripe integration fields indicates the planned SaaS monetization model. The JSONB columns in `tasks` and `outputs` provide schema flexibility for different agent types and content formats, while the relational structure maintains referential integrity across the campaign lifecycle.

---

## 6. Tech Stack

| Technology | Role in Project | Why This Choice |
|---|---|---|
| **Python 3.11+** | Primary language | Dominant language for AI/ML tooling; native async support; strong ecosystem for LLM frameworks, data processing, and web APIs |
| **Google ADK (Agent Development Kit)** | Multi-agent orchestration framework | Provides standardized agent lifecycle, Runner-based async execution, SequentialAgent composition, FunctionTool integration, InMemorySessionService, and a built-in web UI for debugging --- purpose-built for multi-agent systems |
| **LiteLLM** | Model routing abstraction | Enables calling any LLM provider (Gemini, GPT, Claude, open-source) through a single interface; avoids vendor lock-in; integrates natively with Google ADK via the `LiteLlm` model wrapper |
| **OpenRouter** | Cost-optimized LLM API gateway | Unified API endpoint for 100+ models with automatic cost optimization and fallback routing; eliminates the need to manage separate API keys and SDKs for each model provider |
| **Gemini Pro 1.5** | Default LLM for all agents | Strong multilingual capabilities (critical for Chinese/English content); large context window for processing complex campaign briefs; cost-effective via OpenRouter |
| **Pydantic** | Data validation (dependency) | Industry-standard Python data validation; used by ADK and LiteLLM internally; planned for structured agent input/output schemas as the system matures |
| **AsyncIO** | Asynchronous execution | Essential for non-blocking LLM calls in a multi-agent pipeline; enables future parallelization of independent agent executions; integrates with async web frameworks |
| **python-dotenv** | Environment configuration | Loads API keys and configuration from `.env` files; keeps secrets out of source code; standard practice for twelve-factor app configuration |
| **PostgreSQL (Supabase)** | Production database (planned) | JSONB columns for flexible agent output storage; relational integrity for user/project/task hierarchies; Supabase provides managed hosting with built-in auth and real-time capabilities |
| **Stripe** | Payment processing (planned) | Schema includes subscription management tables; standard choice for SaaS billing with usage-based pricing support |

---

## 7. Challenges and Solutions

### Challenge 1: Agent Output Consistency Across the Pipeline

When multiple LLM-based agents produce free-form text outputs that downstream agents must consume as structured input, output variability becomes a pipeline reliability problem. The Campaign Planner Agent might format its messaging pillars differently across runs, causing the Content Strategy Map Agent to miss or misinterpret key strategic elements.

**Solution:** Each agent's instruction prompt defines explicit output sections with markdown headers and content descriptions (e.g., "## Campaign Objectives: List 3-5 specific campaign goals"). The `_format_inputs` methods in downstream agents wrap upstream outputs in labeled context blocks with clear section headers. This structured prompting creates a soft contract between agents without requiring rigid schema validation, balancing output consistency with the creative flexibility that makes LLM-generated content valuable. The architecture is designed to add Pydantic-based output validation as the system matures.

### Challenge 2: Graceful Degradation in a Sequential Pipeline

In a multi-agent pipeline where each agent depends on previous outputs, a single agent failure can cascade and halt the entire workflow. The Trend Radar Agent might fail due to crawler timeouts or API rate limits, but the Campaign Planner can still produce a useful strategy without trend data.

**Solution:** The Orchestrator Agent implements layered error handling where individual agent failures are caught, logged, and recorded in the task state, but do not halt the pipeline. The Trend Radar call is wrapped in a conditional: if it fails, the Content Strategy Map Agent receives a null trend analysis parameter and operates on campaign plan data alone. Each agent's public method returns a standardized result dictionary with a `status` field ("success" or "failed") and an optional `error` field, giving the Orchestrator explicit signals to branch its execution logic. The task state dictionary records the exact failure point, enabling debugging without re-running the full pipeline.

### Challenge 3: Model Cost Management Across Multiple Agent Calls

A single campaign execution invokes four LLM agents sequentially, each potentially making multiple model calls. With Gemini Pro 1.5 as the default model, a full pipeline run can accumulate significant token costs, especially when processing detailed product briefs with rich trend data context.

**Solution:** The architecture uses OpenRouter as a cost-optimization layer, providing automatic model fallback and per-token pricing comparison across providers. The LiteLLM abstraction enables per-agent model selection: the system defines both `MODEL_GEMINI_1_5_PRO` and `MODEL_GEMINI_1_5_FLASH` constants, allowing cost-sensitive agents (like trend data formatting) to use cheaper, faster models while strategy-intensive agents use more capable models. The centralized `utils/config.py` module makes model swaps a single-line configuration change without touching agent logic.

### Challenge 4: Platform-Specific Content Knowledge

Different e-commerce platforms have fundamentally different content conventions, audience behaviors, and algorithmic preferences. A Xiaohongshu carousel post strategy is irrelevant for TikTok short video, and posting time optimization varies by platform and content type.

**Solution:** The Trend Radar Agent encodes platform-specific knowledge through differentiated simulated data structures for each platform (Xiaohongshu, TikTok, generic). Each platform's data includes distinct trending topics with engagement rates, platform-specific hashtag conventions, content format performance metrics tailored to the platform's native formats (carousel vs. short video vs. image gallery), and optimal posting windows segmented by content type. The agent's prompt instructs it to ensure analysis is "specific to the platform indicated in the request." This design creates a clean extension point: adding a new platform requires adding a new data branch in the crawler tool and updating the trend data schema, without modifying the agent's analysis logic.

### Challenge 5: Bridging Domestic and Cross-Border Content Strategy

The architecture document reveals a dual-market ambition: Marketa-Pro serves both domestic Chinese e-commerce (Xiaohongshu, Douyin, Taobao) and cross-border expansion (international TikTok, Instagram, YouTube). These markets require fundamentally different content localization strategies --- not just translation, but cultural reframing of product value propositions.

**Solution:** The architecture separates content strategy (Campaign Planner Agent) from platform intelligence (Trend Radar Agent) and execution synthesis (Content Strategy Map Agent). This separation means cross-border campaigns can use the same Campaign Planner with a different Trend Radar configuration (international platform data) and a Content Strategy Map Agent that accounts for cultural localization requirements. The architecture document describes a planned Localization Knowledge Base using a vector database (Qdrant or Chroma) with RAG integration for the Planner Agent, providing culturally specific insights about target markets, platform conventions, and successful CBEC campaign patterns. This planned RAG layer would enable the system to produce strategies informed by curated cross-cultural marketing intelligence rather than relying solely on the LLM's training data.

---

## 8. What I Learned

Building Marketa-Pro taught me that multi-agent AI systems require as much architectural discipline as any distributed system. The most important lesson was that agent boundaries should follow domain expertise boundaries, not technical convenience. The initial instinct was to build a single powerful agent with a long prompt covering everything from trend analysis to content strategy. Decomposing into specialized agents (Trend Radar, Campaign Planner, Content Strategy Map) with clear input/output contracts made each agent independently testable, debuggable, and improvable, and it mirrors how real content teams organize their work.

I learned that structured prompting is the contract layer of multi-agent systems. When Agent B consumes Agent A's output, the reliability of the pipeline depends on output format consistency. Defining explicit markdown-section output formats in agent instructions creates a soft schema that downstream agents can reliably parse without brittle regex or JSON extraction.

Working with Google ADK showed me the value of opinionated frameworks for agent development. ADK's Runner, Session, and SequentialAgent abstractions eliminated entire categories of boilerplate (session management, agent lifecycle, web UI for debugging) and let me focus on the domain-specific prompt engineering and workflow logic that actually differentiates the product.

The LiteLLM and OpenRouter combination revealed how model-agnostic design future-proofs AI applications. During development, I could switch between Gemini Pro 1.5 and Flash models with a single config change to test cost-quality tradeoffs. This flexibility is not just a development convenience; it is a production requirement, since the optimal model for each agent will change as new models are released and pricing shifts.

Finally, I learned that the hardest part of building an AI content platform is not the AI --- it is encoding the domain knowledge of Chinese e-commerce content operations into agent instructions and tool outputs. Understanding Xiaohongshu posting rhythms, TikTok engagement mechanics, and KOL brief conventions required extensive research into real content team workflows. The AI system is only as good as the domain expertise embedded in its prompts and data structures.

---

## 9. Motivation and Context

This project was motivated by a direct observation of the Chinese e-commerce content production bottleneck. My sister runs a marketing agency that helps Chinese brands with KOL collaborations and content strategy for Xiaohongshu, Douyin, and Taobao. Her team spends the majority of its time on repetitive content operations: researching platform trends, decomposing campaign goals into content briefs, adapting messaging for different KOL personas and platform formats, and coordinating the handoff between strategy, copywriting, and design. For each new brand or product launch, the cycle restarts from scratch.

I built Marketa-Pro to demonstrate that this workflow can be automated through specialized AI agents that collaborate the way a content team does --- with a trend researcher informing a strategist who informs a content creator. The system targets two user segments: small Chinese brands (the majority of sellers on Xiaohongshu and Taobao) who cannot afford full content teams, and marketing agencies like my sister's that need to scale content production across multiple clients without proportionally scaling headcount.

The cross-border dimension adds a second motivation. Chinese brands expanding internationally through KOL marketing on Instagram, YouTube, and international TikTok face a localization challenge that goes beyond translation. The planned Localization Knowledge Base and RAG-enhanced Planner Agent are designed to address this gap by providing culturally specific strategic intelligence for overseas markets. Marketa-Pro aims to be the end-to-end content operations platform for Chinese e-commerce --- domestically and internationally --- replacing fragmented tool usage with a unified, intelligent pipeline.

---

## 10. Status

Marketa-Pro is in active development with the Planning Layer fully implemented and operational. The Orchestrator Agent, Trend Radar Agent, Campaign Planner Agent, and Content Strategy Map Agent are functional with complete async execution pipelines, structured prompt engineering, and independent test suites. The system can process a product brief through the full planning pipeline (initial analysis, trend intelligence, campaign strategy, execution roadmap synthesis) via both programmatic invocation and Google ADK's web interface.

**Implemented:**
- Orchestrator Agent with task state management and sequential pipeline execution
- Trend Radar Agent with FunctionTool-based platform trend analysis (Xiaohongshu, TikTok, generic)
- Campaign Planner Agent with seven-section structured strategy output
- Content Strategy Map Agent for trend-strategy synthesis
- ADK SequentialAgent workflow for web UI exposure
- LiteLLM/OpenRouter model routing infrastructure
- PostgreSQL database schema for production deployment
- Individual agent test scripts and full workflow integration test

**In Progress / Planned:**
- Content Generation Layer: Copywriting Agent, Image Agent, CTA Agent, Video Script Agent
- Execution Layer: Multichannel Publish Agent, KOL Brief Generator
- Monitoring and Optimization Layer: Data Feedback Collector, Engagement Tracker, Critic Agents, A/B Testing
- Learning Feedback Layer: Learning Memory Module for accumulating campaign intelligence
- Real platform trend crawlers replacing simulated data in Trend Radar Agent
- Localization Knowledge Base with vector database and RAG integration for cross-border campaigns
- FastAPI web API for production deployment
- React frontend for interactive campaign management
- Stripe subscription billing integration
- Refiner Agent (Text Micro-Tuner) for guided content fine-tuning
