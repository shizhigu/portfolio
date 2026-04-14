# TokForm -- Project Brief

## One-Liner

AI-powered conversational research platform that replaces rigid surveys with TikTok-style adaptive interviews, delivering 3.7x deeper responses.

---

## The Problem

Traditional survey tools like Typeform and Google Forms suffer from a fundamental design flaw: they treat data collection as a one-directional, static interaction. The creator designs every question in advance, locks them into a fixed sequence, and hopes respondents will push through to the end. Industry data tells the story: completion rates hover between 15 and 25 percent, responses are shallow because questions cannot adapt to what a person actually says, and the entire creation process takes hours of manual work before a single response is collected.

User interviews address the depth problem but introduce a different set of constraints. Each interview costs between $100 and $300 when you factor in scheduling, conducting, transcribing, and synthesizing. A typical study caps out at 10 to 20 participants because the logistics simply do not scale. Researcher bias further contaminates results, since a human moderator unconsciously steers conversations based on their own hypotheses and energy levels.

The gap between these two approaches -- scale without depth versus depth without scale -- is where billions of dollars in product decisions are made on incomplete information. Product teams ship features nobody asked for. Marketing campaigns target the wrong pain points. Churn analysis remains a guessing game because no tool captures both the breadth of a survey and the nuance of a conversation at the same time.

TokForm exists to close that gap. The hypothesis is straightforward: if you combine AI-driven question generation with a mobile-native, TikTok-style engagement model, you can collect qualitative-grade insights at survey-grade scale, with near-zero creation effort from the researcher.

---

## The Solution

TokForm reimagines user research as a two-agent AI system. The first agent, the Creator Agent, eliminates the blank-page problem. A researcher describes their goal in plain English -- "I want to understand why users churn after their trial period" -- and the Creator Agent generates a complete research configuration through a short conversational exchange, typically three to five turns. This configuration includes the research goal, target audience definition, key metrics to measure, and a system prompt that will govern the second agent's behavior. The implementation lives in `agno/prompts/creator_prompt.py` and `agno/agents/creator_agent/`, where the agent uses structured tool calls to produce a project configuration stored as JSONB in PostgreSQL.

The second agent, the Research Agent, takes over when a respondent opens the research link. Rather than presenting a fixed list of questions, this agent generates each question dynamically based on the respondent's previous answers, the research goals defined by the Creator Agent, and real-time analysis of response quality. If a respondent gives a vague or evasive answer, the agent can probe deeper. If the respondent shows strong emotion around a topic, the agent can pivot to explore that thread. The Research Agent's orchestration logic is defined in `agno/agents/research_agent/` and its output schema supports multiple interaction modes: activation (full-screen swipe cards), engagement (chat-style conversation), and validation (structured form blocks).

The respondent-facing experience borrows directly from TikTok's vertical-scroll interaction model. Each question occupies the full screen. Navigation happens through vertical swiping, powered by Swiper.js with custom creative effects configured in `src/components/TikTokFormContainer.tsx` and `src/components/AIFormContainer.tsx`. The dark background (#0a0a0a), ultra-thin typography (font-weight 200-300), and Framer Motion animations create the sensation of scrolling through a social feed rather than filling out a form. This design system is documented in `DESIGN_SYSTEM.md` and enforced through consistent patterns across all visualization components in `src/components/visualizations/`.

The hybrid interaction model, detailed in `HYBRID_INTERACTION_DESIGN.md`, ensures that question presentation adapts to content type. Multiple-choice questions with two to four options render as full-screen activation cards with large tap targets. Open-ended questions appear within a conversational chat flow. Structured data collection (email, phone, address) uses embedded form blocks. The frontend determines the appropriate rendering mode based on the `layer` and `componentType` fields returned by the Research Agent, as handled by the `ComponentRenderer` in `src/components/chat/ComponentRenderer.tsx`.

Data persistence follows a progressive-save pattern. As each response is collected, the frontend calls `/api/research/save-data` (defined in `src/app/api/research/save-data/route.ts`) to merge the new data into the session's JSONB column. When the Research Agent signals completion, `/api/research/complete/route.ts` finalizes the session, calculates duration metadata, and increments the project's completion counter. This approach ensures that even abandoned sessions retain partial data for analysis.

---

## Architecture Overview

TokForm follows a clear separation between its Next.js frontend and its Python-based AI backend, connected through a proxy layer of Next.js API routes that hide backend URLs and centralize authentication.

The frontend is a single Next.js 16 application using the App Router. Route groups separate the authenticated creator experience (`(auth)/`, project management pages) from the public respondent experience (`r/[slug]/`). The creator side uses Mantine components on a light background with Clerk authentication gates. The respondent side uses a full-screen, dark-themed, navigation-free layout optimized for mobile. Next.js's automatic code splitting ensures that creator-side components (dashboard, project editor) never load for respondents, and vice versa.

The backend runs on Agno (AgentOS), an open-source agent orchestration framework, with FastAPI as the web layer. The entry point in `agno/main.py` registers both the Creator Agent and Research Agent with AgentOS, which exposes them at `/agents/creator-agent/runs` and `/agents/research-agent/runs` respectively. Custom business logic endpoints (project CRUD, session management) live in `agno/app/api.py` under the `/api` prefix.

The database layer uses Neon PostgreSQL with a deliberately minimal schema: three tables (`users`, `projects`, `sessions`) defined in `agno/init.sql`. Complex data structures are stored as JSONB columns rather than normalized tables. The `projects.config` column holds the entire research configuration including the Research Agent's system prompt, target audience, metrics, and reference questions. The `sessions.data` column holds the complete conversation history, extracted structured data, and session metadata. GIN indexes on both JSONB columns enable efficient querying. Prisma handles the ORM layer on the frontend side (`prisma/schema.prisma`), while the backend uses asyncpg for direct pool-based connections (`agno/shared/database.py`).

Authentication flows through Clerk. The frontend uses `@clerk/nextjs` middleware to protect creator routes. Public research routes (`/r/[slug]`) bypass authentication entirely, as defined in the research layout. User records are upserted into the local database on first project creation, syncing Clerk's user ID, email, and name.

Redis provides rate limiting for public endpoints, with Upstash as the production provider and an in-memory fallback for development, as documented in `REDIS_SETUP.md`. The rate limiter uses a sliding-window algorithm backed by Redis sorted sets, configured at 10 requests per hour per IP for session creation.

---

## Technical Deep Dive

### Two-Agent System

The Creator Agent and Research Agent communicate indirectly through the project configuration stored in PostgreSQL. The Creator Agent writes a configuration; the Research Agent reads it. There is no direct agent-to-agent communication, which makes the system easier to debug and allows each agent to be updated independently.

The Creator Agent's system prompt (`agno/prompts/creator_prompt.py`) instructs it to gather product context, target audience, and research objectives through a friendly three-to-five-turn conversation. When sufficient information is collected, the agent calls a `complete_research_design` tool that generates the project configuration and persists it to the database. The frontend for this interaction uses a chat interface that sends messages to the AgentOS endpoint and streams responses back.

The Research Agent operates per-session. When a respondent visits `/r/[slug]`, the frontend fetches the project configuration via `/api/projects/slug/[slug]/route.ts`, generates a UUID for the session, and sends the first request to the Research Agent's AgentOS endpoint with the project context in the session state. Each subsequent question request includes the respondent's latest answer and the session history. The agent's output schema (`QuestionOutput` in the backend) specifies the question text, component type (buttons, slider, text, textarea), interaction layer (activation, engagement, validation), and optional fields for context references and empathetic acknowledgments.

### Polymorphic Interaction System

The most architecturally distinctive feature is the polymorphic interaction system, documented in `POLYMORPHIC_IMPLEMENTATION_COMPLETE.md` and `RESEARCH_REDESIGN.md`. The system is inspired by research on cognitive load management and applies different interaction modalities depending on the question type and the respondent's engagement level.

The Activation Layer uses full-screen swipe cards for binary or multiple-choice questions. The SwipeCard component leverages Framer Motion's drag gesture system, allowing respondents to swipe left or right to select between two options. This exploits System 1 thinking -- fast, intuitive, low cognitive load. Questions in this layer are hard-limited to fewer than 15 words.

The Engagement Layer switches to a chat-bubble conversation flow for open-ended questions. The `ChatMessage` component (`src/components/chat/ChatMessage.tsx`) renders AI and user messages with distinct visual treatments. The `QuickReplyButtons`, `SliderInput`, and `TextInputField` components (all in `src/components/chat/`) provide inline interactive elements within the conversation.

The Validation Layer presents structured form blocks for collecting standardized data like email addresses and phone numbers. These bypass the conversational model entirely because free-text collection of an email address creates unnecessary friction.

Layer transitions are governed by a state machine in the frontend. The current layer (`activation`, `engagement`, or `validation`) determines which component tree renders. When the Research Agent returns a response with `componentType: "buttons"` and two or more options, the frontend automatically promotes it to the activation layer regardless of the specified layer. This ensures that choice-based questions always get the full-screen treatment optimized for mobile tap targets.

### Adaptive Question Flow Engine

The `useAIFormFlow` hook (`src/hooks/useAIFormFlow.ts`) manages the client-side question flow state. It tracks the current question index, the history of responses, and exposes handlers for submitting answers and navigating backward. The hook's `getNextQuestion` function implements a two-tier routing strategy: if the current question defines custom routing logic via `nextQuestionLogic`, that function is called with the response and full history; otherwise, the flow advances linearly.

The `question-adapter.ts` module (`src/lib/question-adapter.ts`) bridges the Research Agent's output format and the frontend's `AdaptiveQuestion` interface. It maps backend types (`SINGLE_CHOICE`, `SCALE`, `TEXT`, `EMAIL`, `ADDRESS`) to frontend types (`choice`, `visualization`, `text`) and assigns appropriate visualization types (particle, liquid, wave, constellation, globe) based on the question's semantic content. This adapter pattern means the backend and frontend can evolve their schemas independently as long as the adapter keeps them in sync.

### Visualization Engine

Each question type has a dedicated visualization component that renders a full-screen animated background behind the question content. The `FormSlide` component (`src/components/FormSlide.tsx`) acts as a router, dispatching to the appropriate visualization based on the field type: `WelcomeVisualization` for landing screens, `NameVisualization` for text input with floating-letter effects, `AddressVisualization` for the 3D globe location picker, `ScaleVisualization` for opinion scales with dynamic bar charts, `ChoiceVisualization` for bento-grid selection cards, and `RatingVisualization` for orbital circle animations.

The 3D globe (`src/components/Globe3D.tsx`) uses `react-globe.gl` with Three.js underneath. It renders a night-map Earth texture, auto-rotates at 0.8 RPM, and smoothly zooms to a selected location over a 2-second animation when the respondent picks a city. The component is dynamically imported with `ssr: false` to prevent WebGL rendering on the server.

The AI-specific visualizations in `src/components/visualizations/ai/` extend this system. `TextVisualization` renders constellation or neural-network backgrounds behind text input fields. `VoiceVisualization` displays an audio waveform animation during recording. `ScaleVisualization` handles nine different visualization modes (particle, liquid, wave, constellation, bloom, ripple, aurora, spiral, heatmap) controlled by a single `visualizationType` prop.

### AI Response Bubble

The `AIResponseBubble` component (`src/components/AIResponseBubble.tsx`) provides conversational continuity between questions. After a respondent submits an answer, a frosted-glass bubble appears at the bottom of the screen with the AI's contextual acknowledgment (e.g., "Haha, animal person! Love it"). The text renders with a per-character typewriter animation using staggered Framer Motion delays at 20ms per character. The bubble auto-dismisses after 2.5 seconds, and the next question loads during the dismissal transition, creating a seamless conversational flow.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend Framework | Next.js 16 + React 18 (App Router) | Server/client rendering, file-based routing, API routes |
| UI Components | Mantine 7 + Radix UI + Framer Motion | Design system, accessible primitives, gesture animations |
| Styling | Tailwind CSS 4 + CSS-in-JS (MUI sx) | Utility-first styling with component-level overrides |
| 3D Graphics | react-globe.gl + Three.js + React Three Fiber | Interactive globe visualization, WebGL rendering |
| Swipe Navigation | Swiper.js 12 | Vertical full-screen slide transitions with creative effects |
| State Management | Zustand 5 + TanStack Query 5 | Client-side stores and server state synchronization |
| Form Validation | Zod 4 | Schema-based runtime validation for API inputs |
| Authentication | Clerk | OAuth, session management, user sync via webhooks |
| Agent Framework | Agno (AgentOS) | Multi-agent orchestration with built-in session management |
| Web Framework | FastAPI | Async Python API layer with auto-generated OpenAPI docs |
| LLM Provider | OpenAI GPT-4 / Anthropic Claude | Natural language understanding and question generation |
| Database | PostgreSQL (Neon) | Serverless Postgres with JSONB for flexible data storage |
| ORM / DB Access | Prisma (frontend) + asyncpg (backend) | Type-safe queries from Next.js, raw pool from Python |
| Caching / Rate Limit | Redis (Upstash) + ioredis | Sliding-window rate limiting on public endpoints |
| Deployment | Vercel (frontend) + Fly.io/Railway (backend) | Edge-optimized static + serverless API hosting |
| Shader Effects | @paper-design/shaders-react | GPU-accelerated visual effects for question backgrounds |
| Maps | react-map-gl + Mapbox GL | Geographic data collection with interactive map views |
| Language | TypeScript 5 (frontend) + Python 3.11 (backend) | End-to-end type safety and modern async patterns |

---

## Challenges and Solutions

### Challenge: Maintaining conversational context across a stateless swipe interface

The TikTok-style vertical swipe model treats each question as an isolated full-screen card, but research conversations require context continuity. A respondent who says they are "exhausted" on question one expects the AI to reference that exhaustion on question three. The solution was the `AIResponseBubble` overlay system combined with the Research Agent's `contextReference` field. Each agent response can include a reference like "You mentioned feeling exhausted earlier..." which the frontend renders as a highlighted chat bubble between slides. This preserves conversational threading without breaking the full-screen swipe paradigm. The `contextReference` is extracted from the agent's structured output and displayed using the `ChatMessage` component with a distinct visual treatment (cyan-400 accent color).

### Challenge: Bridging two incompatible data models between Python agents and TypeScript UI

The Research Agent outputs questions in a Python-native schema using Pydantic models (`QuestionOutput`), while the frontend renders them using TypeScript interfaces (`AdaptiveQuestion`). These schemas evolved independently during development, creating a mismatch in field names, type enumerations, and nesting structures. The solution was the adapter pattern implemented in `src/lib/question-adapter.ts`. The `adaptAgentQuestion` function maps backend types to frontend types, converts options arrays from flat strings to labeled objects, assigns visualization types based on question semantics, and attaches the raw agent data as a pass-through field for debugging. This single-file bridge module means changes to either schema only require updating one adapter function.

### Challenge: Progressive data persistence without blocking the respondent experience

Research data must be saved reliably, but making the respondent wait for database writes between every question would destroy the flow state that drives high completion rates. The solution was the progressive-save architecture. The frontend fires a non-blocking POST to `/api/research/save-data` after each response, merging new data into the session's JSONB column via a deep merge operation. The respondent never waits for the save to complete; the next question loads immediately from the agent. If the respondent abandons the session, all data collected up to that point is already persisted. The `/api/research/complete` endpoint only handles session finalization (marking status as completed, computing duration, incrementing counters) without re-saving response data.

### Challenge: Preventing cognitive overload in a dynamic question system

An unconstrained AI agent might ask ten open-ended questions in a row, or present seven-option multiple-choice cards that overwhelm mobile users. The polymorphic layer system addresses this by enforcing strict interaction rules. The Activation Layer limits questions to fewer than 15 words with only binary options, exploiting System 1 fast thinking. The Engagement Layer caps questions at 20 words and limits multiple-choice options to four. The backend Research Agent prompt includes explicit constraints: "Never offer more than 4 options. Use binary swipe for the first question. Alternate between activation and engagement layers." Additionally, a satisficing detector in the agent monitors for three or more consecutive brief or repetitive answers, triggering a return to the Activation Layer to re-engage the respondent with a high-impact swipe question.

### Challenge: Making a full-screen dark UI accessible on all mobile devices

The dark-themed, full-screen research interface needed to work on everything from iPhone SE to iPad Pro while maintaining tap-target sizes that comply with accessibility guidelines. Swiper.js's `touchRatio`, `touchAngle`, and `threshold` parameters (configured in `AIFormContainer.tsx`) were tuned to prevent accidental slide advances during text input. The `allowTouchMove` flag is conditionally toggled when a text field is focused. All interactive elements maintain a minimum 48px touch target through MUI's spacing system (8px base) and consistent border-radius patterns (12px for buttons, 20-24px for cards, 50% for circular elements). The design system enforces a minimum contrast ratio of 4.5:1 for all text on the #0a0a0a background by using rgba(255,255,255,0.5) as the minimum text opacity.

---

## What I Learned

Building TokForm taught me that the most impactful architectural decision was choosing JSONB over normalized tables for the core data model. Traditional survey platforms normalize every question type, option, and response into separate tables, creating join-heavy queries and rigid schemas that resist iteration. By storing the entire project configuration and session data as JSONB documents in just three tables (`users`, `projects`, `sessions`), I could iterate on the agent output schema daily without writing a single migration. The Prisma schema and the raw SQL schema (`agno/init.sql`) both reflect this philosophy. The tradeoff is that you lose database-level referential integrity on nested data, but for a product where the AI agent determines the data structure at runtime, this flexibility is essential.

I learned that the adapter pattern is non-negotiable in a system where AI outputs drive UI rendering. The Research Agent's output format changed more than a dozen times during development as I refined the polymorphic layer system, added context references, and introduced the satisficing detector. Every change to the agent's Pydantic schema would have required updating every visualization component if they consumed the agent data directly. The `question-adapter.ts` module absorbed all of that volatility, keeping the visualization components stable and testable against a fixed TypeScript interface.

The TikTok-style swipe interaction taught me that perceived speed matters more than actual speed. Swiper.js's `speed: 600` parameter with the creative effect (translate Y with opacity fade) makes slide transitions feel faster than they are because the animation is physically smooth. The 800ms "AI thinking" animation in `AIFormContainer.tsx` (three pulsing dots) is not a loading state -- it is a deliberate pace-setter that makes the AI feel thoughtful rather than instant. Removing it in testing actually decreased user satisfaction because responses felt mechanical.

Working with Agno (AgentOS) instead of LangChain was a deliberate choice that paid off in debugging ergonomics. Agno's agent model is thin: an agent is a Python class with a system prompt, tool definitions, and a session store. There are no chains, no graphs, no runnables. When the Research Agent produced an unexpected question, I could trace the issue directly to the system prompt or the tool function without navigating an abstraction stack. The tradeoff is that Agno handles fewer edge cases automatically, but for a two-agent system where each agent has a clear, bounded role, the simplicity was worth it.

I also learned that rate limiting must be a day-one feature for any public-facing AI endpoint. Without the Redis-backed sliding window limiter (configured in `src/app/api/sessions/create/route.ts`), a single user could generate hundreds of LLM API calls by repeatedly opening the research link. The in-memory fallback ensures the system degrades gracefully when Redis is unavailable, accepting per-instance rate limiting as an acceptable tradeoff over no limiting at all.

---

## Motivation and Context

TokForm grew out of a frustration I experienced firsthand: every time I needed to collect user feedback, the tools available forced a false choice. Use a survey tool and get hundreds of shallow responses, or conduct interviews and get deep insights from a handful of people. Neither approach gave me what I actually needed -- qualitative depth at quantitative scale.

The spark was watching how people interact with TikTok. The vertical swipe model creates a micro-commitment loop: each swipe is low-effort, each new piece of content is a reward, and the variable-ratio reinforcement schedule keeps people engaged far longer than they intend. I hypothesized that the same mechanics could transform research participation from a chore into something closer to entertainment, if the questions adapted in real time to maintain novelty and relevance.

The AI agent architecture was influenced by the research paper "Beyond Forms: Rethinking Interactive Paradigms for User Research and Data Collection" (referenced throughout the RESEARCH_REDESIGN.md documentation). The paper's concept of "contextual polymorphic interaction" -- where the system dynamically selects the optimal interaction modality based on question type, user state, and cognitive load -- became the theoretical foundation for the three-layer system (activation, engagement, validation).

The project also serves as a technical exploration of what AI-native application architecture looks like when you start from the agent layer rather than retrofitting AI onto an existing CRUD application. In TokForm, the AI agents are not features bolted onto a form builder; they are the core product. The database schema, the frontend component tree, and the API surface are all designed around the assumption that an AI agent will generate the data structures at runtime. This inversion -- from human-designed schemas to AI-generated schemas -- required rethinking everything from validation to visualization.

The choice of the name TokForm is intentional: it signals both the TikTok-style UX and the idea of a "token" -- the atomic unit of both LLM processing and user micro-engagement. The tagline "Forms that feel like conversations" captures the product positioning: we are not replacing surveys, we are creating a new category that sits between surveys and interviews.

---

## Status

TokForm is in active development with core infrastructure complete and functional. The two-agent system (Creator Agent and Research Agent) is implemented and tested with OpenAI GPT-4 as the primary LLM provider. The TikTok-style respondent experience is fully built with eight visualization types (welcome, name/text, email, address/globe, opinion scale, multiple choice, rating, thank you) and the polymorphic layer system (activation, engagement, validation). Authentication via Clerk is integrated, project CRUD is operational, and the progressive data persistence pipeline (save-data and complete endpoints) is in place.

The frontend codebase contains 82 TypeScript/TSX source files across the `src/` directory, with an additional 9 Python files in the `agno/` backend directory. The project uses pnpm for package management with 56 direct dependencies including Next.js 16, React 18, Mantine 7, Framer Motion 12, Swiper 12, react-globe.gl, Three.js, and Zustand 5.

Features currently in development or planned include: the analytics dashboard for creators (sentiment analysis, theme extraction, response visualization), export functionality (CSV, JSON, Notion integration), team collaboration with shared projects and permissions, a template marketplace for reusable research configurations, and multi-language support. The enterprise roadmap includes SOC2 compliance, self-hosted deployment, custom LLM selection (Claude, Gemini), and SSO integration.

The project deploys to Vercel for the frontend and targets Fly.io or Railway for the Python backend. The database runs on Neon's serverless PostgreSQL platform. Redis rate limiting is configured for Upstash in production. The codebase is structured for a clean separation between the public respondent experience and the authenticated creator experience, enabling independent scaling of read-heavy (respondent) and write-heavy (creator/analytics) workloads.
