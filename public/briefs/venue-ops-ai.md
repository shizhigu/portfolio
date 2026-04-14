# venue-ops-ai: PROJECT BRIEF

## One-Liner

AI-powered venue operations platform replacing walkie-talkies with conversation-driven task management via LangGraph and voice input.

---

## The Problem

Large venue operations -- stadiums, convention centers, concert halls -- still run on walkie-talkies, paper checklists, and shouted instructions. When a field worker discovers a burst pipe on Level 3, they radio dispatch, who tries to find a free plumber, who may or may not hear the call. The manager, meanwhile, juggles dozens of simultaneous issues on a whiteboard or a basic spreadsheet with no sense of priority, worker availability, or historical patterns. Critical information is lost between shifts, recurring issues go unnoticed, and accountability is nearly impossible to enforce because there is no durable audit trail.

The information asymmetry between the field and the control room is the root cause. Workers see problems first-hand but lack the context to triage them. Managers have authority but depend on fragmented, delayed, second-hand reports to make decisions. The result is slow response times, misallocated labor, and a reactive posture that only addresses problems after they escalate. A leaking faucet becomes a flooded corridor; a flickering light becomes a safety hazard in a darkened stairwell.

Existing facility management software digitizes the paperwork but does not close the intelligence gap. Most tools offer CRUD dashboards where a manager must manually review each ticket, decide priority, look up available workers, and dispatch assignments one by one. There is no system that listens to what the manager actually wants -- "Handle all urgent plumbing issues" -- and executes it end-to-end. This project was built to prove that a conversational AI layer on top of structured operations data can collapse the entire triage-assign-track loop into a natural language exchange.

---

## The Solution

venue-ops-ai is a full-stack AI operations platform with two distinct interfaces that meet users where they are. For field workers, the Worker App provides a voice-first, camera-first mobile experience: snap photos of the problem, record a voice memo, and let the AI analyze what is wrong, estimate repair time, and suggest tools -- all before the worker even types a word. For managers, the AI Deputy replaces the traditional dashboard with a chat-first command center where natural language commands like "Show me urgent tasks in Zone B" or "Assign the plumbing issue to Wang" are interpreted and executed by a LangGraph-powered agent backed by real database operations.

The core architectural innovation is the dual-layer conversation model. A Main Deputy Context maintains the global view of the venue -- pending tasks, worker availability, performance metrics -- while isolated Task Contexts let the manager drill into any specific issue for a focused discussion without losing the bigger picture. Each conversation thread has its own LangGraph state, its own checkpointed memory, and its own set of quick-action buttons that the AI generates dynamically based on context. The system implements Human-in-the-Loop controls at every critical decision point: workers confirm AI analysis before a task is created, managers approve high-priority assignments, and emergency escalations require explicit acknowledgment.

The two-step task creation workflow (analyze first, confirm second) is a deliberate design choice that keeps humans in control while letting AI do the heavy lifting. When a worker submits photos and a voice recording, the backend runs the capture-analysis pipeline through LangGraph's StateGraph, produces a structured JSON assessment with issue type, priority, confidence score, required tools, and estimated resolution time, then returns it to the worker for review before any database record is created. Only after human confirmation does the system persist the task, trigger event logging, and -- if the priority is high enough -- notify the manager through the AI Deputy conversation.

---

## Architecture Overview

The system follows a decoupled frontend-backend architecture with two separately deployable services. The frontend is a Next.js 15 application using React 19 with the App Router, Turbopack for development builds, and Tailwind CSS for styling. It hosts the Worker Dashboard, Manager Dashboard, AI Deputy chat interface, Issue Reporter camera/voice capture flow, and all API route handlers for authentication, voice transcription, and chat streaming. The backend is a FastAPI service (the langgraph-service) that owns the LangGraph graph definitions, the AI agent logic, all database write operations, and the tool execution layer. Communication between the two services happens over REST, with the Next.js API routes acting as a BFF (Backend for Frontend) layer that enriches requests with Clerk authentication context before forwarding them to FastAPI.

The AI layer is implemented in two complementary patterns. The first is a traditional LangGraph StateGraph with explicit nodes for capture, analysis, intent understanding, overview generation, and task action handling. Each node is an async Python function that reads from and writes to a typed state dictionary (TaskState or DeputyState), and conditional edges route execution based on priority levels, confidence scores, and detected intents. The second pattern is a LangGraph ReAct agent created via `create_react_agent` with five registered tools (get_pending_tasks, get_task_details, assign_task_to_worker, get_venue_statistics, escalate_to_emergency). The ReAct agent handles the v2 Deputy API and uses an InMemorySaver checkpointer so that each conversation thread (identified by a composite thread_id like `venue:{venue_id}` or `venue:{venue_id}:task:{task_id}`) retains full message history across requests.

The database layer uses PostgreSQL (Neon serverless in production, local Postgres in Docker for development) with four core tables: venues, users, tasks, and events. Tasks store all business data -- description, priority, location, images, AI analysis, progress updates, resolution details -- in a single JSONB `data` column, which provides schema flexibility without sacrificing queryability thanks to GIN indexes and computed JSON path expressions in WHERE clauses. Events form an append-only audit log; every status change, assignment, AI decision, and emergency escalation is recorded as an immutable event row. PostgreSQL triggers automatically generate `task_status_changed` events whenever a task's status column is updated, ensuring the audit trail is complete even if application code forgets to log explicitly.

The authentication and multi-tenancy layer is built on Clerk. Each venue maps to a Clerk Organization, and each user maps to a Clerk User with a role (manager or worker). The Next.js middleware intercepts requests, verifies Clerk JWT tokens, and the backend resolves the user's venue_id from their clerk_user_id to enforce tenant isolation at the data layer. This means every database query is scoped to a single venue_id, and workers can only see tasks from their own venue.

Infrastructure is containerized with Docker Compose, defining three services: the langgraph FastAPI app, Redis (for LangGraph state management and caching), and Postgres. The frontend runs on its own dev server (Next.js default port 3000) and connects to the langgraph-service on port 8001. In production, the Neon serverless driver replaces the local Postgres container, and the frontend can be deployed to Vercel while the langgraph-service runs on any container platform.

---

## Technical Deep Dive

**LangGraph StateGraph for Task Processing.** The task processing pipeline is defined as a LangGraph StateGraph with a typed `TaskState` schema containing 14 fields spanning input data (images, audio_description, location), processed data (processed_images, validated_location), AI analysis results (ai_analysis, priority, issue_type), message history (using an `Annotated[List, operator.add]` reducer for append-only accumulation), and routing flags (is_emergency, auto_assignable, needs_manager_review). The graph has two nodes -- `capture` and `analysis` -- connected by a deterministic edge, followed by a conditional edge that routes to either `manager_review` or `assignment` based on the `should_review` function. The graph is compiled with a `MemorySaver` checkpointer, which means each invocation's state is persisted and can be resumed, enabling the two-step confirm workflow where the first invocation runs capture+analysis and the second invocation (after user confirmation) continues with assignment.

**AI Analysis Node with Structured JSON Output.** The analysis node calls Claude 3.5 Sonnet via OpenRouter's OpenAI-compatible API with `response_format={"type": "json_object"}` and `temperature=0.2` for deterministic, parseable output. The system prompt instructs the model to return a JSON object with fields for issue_type (leak, damage, malfunction, safety, cleaning, other), priority (1-5), description, suggested_tools, estimated_minutes, confidence (0.0-1.0), and reasoning. The node then sets routing flags: `is_emergency` if priority >= 4, `auto_assignable` if confidence > 0.8 and priority < 4, and `needs_manager_review` if either emergency or low confidence. This tiered routing ensures that the AI only acts autonomously on high-confidence, low-risk tasks while escalating everything else.

**ReAct Agent with Tool-Calling and Conversation Memory.** The v2 Deputy API uses LangGraph's `create_react_agent` with a `ChatOpenAI` model bound to a system prompt that explicitly instructs the agent when to call tools and when to just chat. The agent has five tools, each returning a `StructuredResponse` object that includes a display message, typed data (task_list, task_detail, statistics, confirmation, emergency), action buttons, and optional confirmation context. The agent's checkpointer (InMemorySaver) maps each `thread_id` to a persistent conversation, so the manager can say "Show me pending tasks," then follow up with "Assign the first one to Wang" and the agent remembers the previous tool output. The v2 API endpoint carefully isolates "this turn's" messages from historical messages by finding the last HumanMessage matching the current request and only processing subsequent ToolMessages and AIMessages.

**Dual-Layer Conversation Architecture.** The frontend AIDeputy component maintains an array of ConversationContext objects, each with a type (main or task), an id, a title, and its own message history. The Main context is always present and shows the venue overview. When the manager clicks on a task or the AI suggests opening a task thread, a new Task context is added as a tab. Each tab communicates with the backend using a different thread_id, so the LangGraph agent maintains separate state for each. The manager can freely switch between tabs without losing context. Task tabs can be closed; the main tab cannot.

**Voice-to-Text Pipeline with Deepgram.** The Worker App records audio via the browser's MediaRecorder API (WebM format), sends the blob to a Next.js API route at `/api/voice/transcribe`, which uses the Deepgram SDK's `nova-2` model for English transcription with smart formatting and punctuation. The transcription result is stored as `audioDescription` in the captured data and fed into the AI analysis node as part of the context string. This enables a truly hands-free reporting workflow: a worker with dirty hands can tap the mic button, describe the problem, and the system handles the rest.

**Smart Worker Assignment Algorithm.** The assignment node scores available workers using a weighted multi-factor model: skill match (30%), location proximity (30%), current workload (20%), and historical performance (20%). The skill matching compares the AI-detected required_skills against each worker's skills array stored in their JSONB metadata. Location proximity uses a simplified indoor distance model that accounts for same-area/different-area and same-floor/different-floor scenarios, with per-floor penalties. The estimated arrival time is computed from the distance at an assumed walking speed of 5 km/h plus a two-minute buffer for elevators and doors. When no suitable worker is found, the system flags the task for manager review rather than making a suboptimal assignment.

**Event-Driven Audit Trail.** Every significant action in the system produces an event record in the `events` table: task creation (source, trigger, input method), task assignment (method, reason, alternatives considered), AI decisions (intent, analysis, actions, confidence), status changes (from/to states), and emergency triggers (type, location, automated responses). The PostgreSQL trigger `log_task_status_change` fires AFTER UPDATE on the tasks table and inserts a `task_status_changed` event whenever the status column differs between OLD and NEW rows. This guarantees audit completeness at the database level regardless of which application endpoint initiated the change.

**Human-in-the-Loop Confirmation Pattern.** The system implements HITL at three levels. First, workers confirm AI analysis results before a task is created (the analyze-then-confirm two-step API). Second, the ReAct agent's `assign_task_to_worker` tool checks `require_confirmation=True` for high-priority tasks (priority >= 4) and returns a `confirmation` data type with confirm/cancel action buttons instead of executing immediately. Third, emergency escalation via `escalate_to_emergency` always requires confirmation by default. When the manager clicks "Confirm" in the chat UI, the frontend sends a follow-up request with `confirmation_action: "confirm"` and the original `confirmation_context`, which the backend processes via a dedicated `handle_confirmation` handler that re-invokes the tool with `require_confirmation=False`.

**Multimodal Input Processing.** The capture node handles three input modalities. Images arrive as base64 data URIs, HTTP URLs, or file upload objects; base64 images are decoded, opened with Pillow, optimized to 85% JPEG quality, and saved to a configurable upload directory with UUID filenames. The node validates location data by extracting area, floor, spot, and GPS coordinates, then generates a human-readable description string. All processed data is assembled into the graph state for the analysis node, which builds a context string combining location, voice description, manual notes, and image count for the LLM prompt.

**Frontend Streaming with AI SDK.** The Manager Dashboard V2 uses Vercel's AI SDK (`@ai-sdk/react` useChat hook) for real-time chat streaming. The Next.js API route at `/api/chat` creates a `streamText` call through the OpenRouter provider with four registered tools (getPendingTasks, getTaskDetails, assignTaskToWorker, getVenueStatistics) that query Neon PostgreSQL directly via the `@neondatabase/serverless` driver. The `maxSteps: 3` configuration allows the agent to chain up to three tool calls in a single turn. The response is returned as a UI message stream via `result.toUIMessageStreamResponse()`, providing real-time token-by-token rendering in the chat interface.

---

## Tech Stack

| Technology | Role | Why |
|---|---|---|
| **Next.js 15** | Frontend framework | App Router for file-based routing, React Server Components for performance, Turbopack for fast dev builds, and API routes as BFF layer |
| **React 19** | UI library | Latest concurrent features, seamless integration with Next.js 15, and hooks-based architecture for chat state management |
| **TypeScript** | Language (frontend) | Strict mode catches type errors at compile time; essential for complex state shapes in conversation contexts |
| **Tailwind CSS** | Styling | Utility-first approach enables rapid UI iteration; pairs with shadcn/ui for accessible, composable component primitives |
| **shadcn/ui** | Component library | Unstyled Radix UI primitives with Tailwind; no vendor lock-in, fully customizable, and accessible by default |
| **FastAPI** | Backend framework | Async-first Python framework with automatic OpenAPI docs; native async/await aligns perfectly with LangGraph's async graph execution |
| **LangGraph** | AI orchestration | StateGraph for deterministic multi-step workflows with checkpointing; ReAct agent pattern for tool-calling conversation agents; built-in memory persistence |
| **LangChain** | LLM abstraction | ChatOpenAI wrapper provides a uniform interface to OpenRouter/Claude; tool decorator simplifies function-to-tool conversion |
| **Claude 3.5 Sonnet** | LLM (via OpenRouter) | Strong JSON-mode compliance for structured analysis output; excellent instruction following for conversational agent behavior; multimodal capability for future image analysis |
| **OpenRouter** | LLM gateway | Single API key for multiple model providers; OpenAI-compatible interface means zero code changes to swap models |
| **Deepgram** | Speech-to-text | Nova-2 model provides fast, accurate English transcription with smart formatting; SDK integrates cleanly into Next.js API routes |
| **Clerk** | Authentication | Organization-based multi-tenancy maps naturally to venues; webhook sync for user management; JWT middleware for Next.js |
| **Neon PostgreSQL** | Database (production) | Serverless Postgres with branching; JSONB columns with GIN indexes for flexible schema; triggers for audit automation |
| **asyncpg** | Database driver (backend) | High-performance async Postgres driver for FastAPI; connection pooling with configurable pool sizes |
| **Redis** | State/cache | LangGraph checkpointer backend for production conversation persistence; session caching for fast context loading |
| **Docker Compose** | Local infrastructure | Three-service stack (app + Redis + Postgres) for reproducible local development environment |
| **Pydantic** | Validation | Settings management via pydantic-settings; request/response model validation in FastAPI endpoints |
| **structlog** | Logging | Structured JSON logging for production; human-readable console output for development; contextual key-value pairs per log entry |
| **Vercel AI SDK** | Streaming chat | `useChat` hook manages client-side chat state; `streamText` enables real-time token streaming from LLM to browser |
| **Framer Motion** | Animation | Smooth transitions for dashboard state changes and chat message appearance |
| **Pillow** | Image processing | Server-side image optimization (resize, compress) before storage; reduces upload sizes for mobile workers |

---

## Challenges & Solutions

### 1. Preventing the ReAct Agent from Over-Calling Tools

**Problem:** The LangGraph ReAct agent aggressively called `get_task_details` or `get_pending_tasks` on every message, including casual greetings like "what's up" or "hello." In a task context, the agent interpreted every message as a request for task information, creating unnecessary database load and jarring user experiences where a simple "hi" would trigger a wall of task data.

**Solution:** Implemented a multi-layered filtering strategy. The system prompt was rewritten with explicit NEVER/ALWAYS rules using emoji markers for visual emphasis, telling the agent to default to no tools. On the API side, the v2 endpoint maintains a whitelist of casual phrases and personal information patterns; when a message matches, the `[Task context: ...]` prefix is stripped so the agent receives a bare message with no contextual hint to fetch data. An additional whitelist of explicit request phrases (like "show me the details") ensures that genuine data requests still work. This approach keeps prompt engineering and application logic in sync rather than relying on either one alone.

### 2. Isolating Conversation History in Multi-Turn Agent Threads

**Problem:** LangGraph's ReAct agent returns all historical messages in the thread alongside the current turn's response. When the v2 API tried to extract the tool response from the latest turn, it would accidentally pick up a ToolMessage from a previous turn, causing the UI to display stale data (e.g., showing yesterday's task list when the manager asked for statistics).

**Solution:** The v2 endpoint implements a reverse-scan algorithm that finds the last HumanMessage in the full message array whose content exactly matches the current request's transformed message. It then only examines messages after that index, stopping if it hits another HumanMessage. If a ToolMessage with structured data is found in this window, it becomes the response; otherwise, the last AIMessage in the window is used as a plain text response. This guarantees that each API response reflects only the current conversational turn, regardless of how long the thread's history is.

### 3. Two-Step Task Creation Across Stateless HTTP Requests

**Problem:** The task creation workflow requires two separate user interactions (analyze, then confirm) but the LangGraph graph execution is stateless from the HTTP perspective. The analysis results from the first request need to be available when the second request arrives, potentially minutes later if the worker is still reviewing.

**Solution:** The analyze endpoint generates a UUID `analysis_id`, runs the capture and analysis nodes, and stores the full graph state in an in-memory cache keyed by that ID. The frontend receives the analysis_id along with the AI results and includes it in the confirmation request. The confirm endpoint retrieves the cached state, validates the venue_id via Clerk user lookup, creates the task in the database, generates audit events, and cleans up the cache. For production, this cache would be backed by Redis with a TTL to handle server restarts and expiration of abandoned analyses.

### 4. Mapping Clerk Organizations to Database Venues

**Problem:** Clerk manages authentication and organizations, but the application needs venue_id (a UUID in the local database) for all data operations. Users authenticate with Clerk tokens, but the backend needs to translate clerk_user_id to a local user record with a venue_id. This mapping must work both in the Next.js BFF layer (for the Neon-based streaming chat) and in the FastAPI layer (for the LangGraph agent).

**Solution:** Created a `/api/venues/current` endpoint that uses Clerk's server-side auth to get the current user's organization ID, queries the venues table for the matching `clerk_org_id`, and returns the local `venue_id`. The frontend calls this endpoint before any venue-scoped operation. The FastAPI backend has a parallel `get_user_by_clerk_id` method on the Database class that resolves the same mapping. Both paths enforce that no data operation can proceed without a valid venue_id, preventing cross-tenant data leakage.

### 5. Handling Camera and Microphone Permissions on Mobile

**Problem:** The Issue Reporter needs simultaneous access to the rear camera (for photos) and the microphone (for voice memos) on mobile browsers, but requesting both at once causes permission prompts to stack confusingly, and some browsers revoke one stream when the other is requested.

**Solution:** The component requests camera and microphone separately. Camera access is requested when the capture step mounts (via `getUserMedia` with `facingMode: { ideal: 'environment' }` for the rear camera). Microphone access is requested only when the user taps the voice memo button, using a fresh `getUserMedia` call. When the user finishes recording, the audio stream tracks are immediately stopped. When transitioning from capture to review step, the camera stream is explicitly stopped. This sequential, on-demand approach avoids permission conflicts and ensures resources are released promptly.

---

## What I Learned

Building venue-ops-ai taught me that the hardest part of an AI-powered application is not the AI itself but the boundary management between autonomous AI behavior and human control. The ReAct agent pattern is powerful, but without careful prompt engineering and application-layer guardrails, it becomes a tool-calling machine that treats every input as a database query. The principle I arrived at: AI should do nothing by default and everything when asked. Casual conversation stays casual; explicit commands trigger actions.

LangGraph's StateGraph abstraction proved invaluable for making complex workflows debuggable. Each node is a pure function from state to state, which means I can unit-test analysis logic without standing up the full graph. The conditional edge pattern (routing based on priority and confidence) made it natural to express business rules like "escalate emergencies but auto-assign routine tasks" without nested if-else chains. The checkpointer pattern, even with the simple InMemorySaver, demonstrated how conversation memory can be treated as infrastructure rather than application logic.

I also learned that multi-tenant data isolation is a cross-cutting concern that must be enforced at the data layer, not just the API layer. Every database query in this project is scoped by venue_id, and the PostgreSQL schema uses foreign key constraints with ON DELETE CASCADE to ensure venues cannot leak data into each other. The Clerk integration maps organizations to venues at the authentication boundary, so tenant isolation is established before any business logic runs.

---

## Motivation & Context

I built venue-ops-ai because I watched venue operations managers drown in radio chatter during events. The gap between "someone found a problem" and "the right person is fixing it" was measured in tens of minutes when it should be seconds. Every existing tool I evaluated was a glorified ticket system -- it digitized the paper but did not add intelligence. I wanted to build something where a manager could say one sentence and the system would handle routing, assignment, notification, and follow-up autonomously, with the manager retaining override authority at every step.

This project is also a deliberate portfolio piece demonstrating full-stack AI engineering. It covers the entire stack from PostgreSQL schema design with JSONB and triggers, through Python async backends with LangGraph orchestration, to React 19 frontends with real-time streaming. The choice of LangGraph over a simpler chain-based approach was intentional: I wanted to show mastery of stateful graph execution, conditional routing, tool-calling agents, and conversation memory -- capabilities that are becoming the foundation of production AI applications. The dual-frontend approach (voice-first mobile for workers, chat-first desktop for managers) demonstrates that the same AI backend can power fundamentally different user experiences.

---

## Status

The project is in **advanced prototype** stage. The core workflow is functional end-to-end: workers can capture photos and voice descriptions, the AI analyzes and classifies issues, managers interact with the AI Deputy via natural language to view, triage, and assign tasks, and all actions are recorded in the event audit trail. The LangGraph task processing graph (capture -> analysis -> conditional routing) and the ReAct conversation agent (with five tools and persistent memory) are both implemented and tested. The database schema supports full multi-tenancy with Clerk integration.

Areas that remain as next steps include: replacing the in-memory analysis cache with Redis for production resilience, implementing push notifications for worker task dispatch (currently only logged), adding the execution and completion nodes to the task graph for full lifecycle tracking, implementing vector search over historical issues for pattern detection and similar-issue recommendation, and adding WebSocket support for real-time dashboard updates instead of polling. The assignment optimization algorithm has the factor weights and scoring structure but would benefit from real-world calibration data.
