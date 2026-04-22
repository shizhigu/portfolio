# Voice Companion — Technical Brief

*Engagement under NDA. Client is a tier-1 global entertainment brand; artist is a major-label mainstream pop act. All client-identifying detail omitted.*

## One-Liner

A production-grade realtime AI voice platform that lets fans chat — by text, by voice message, and in full-duplex live call — with a licensed digital persona of a major-label pop artist. Architected for 100K DAU; currently in first-artist rollout.

## The Problem

Mainstream artists have more dedicated fans than they could ever meaningfully engage with. The obvious answers — fan clubs, live chat hours, Weibo/X replies — scale badly, feel performative at scale, and the artist's actual voice/personality never gets to the individual fan. Meanwhile, the AI companion category (Character.ai and peers) has shown that people will spend *hours* in an AI relationship — but those platforms are character-bank marketplaces, not licensed, quality-controlled extensions of a real artist's IP.

The gap the client wanted to close: a single-artist companion product where every piece — voice, persona, memory, mood, roleplay boundaries, moderation — is under label + artist editorial control, and where the AI side feels indistinguishable from "the artist casually messaging you back" for a 10-minute conversation.

That's a different product shape from ChatGPT-style assistants: low-latency, emotionally sticky, speaking in the artist's literal voice, remembering your birthday and what you talked about last Tuesday, and backed by enough compliance infrastructure that a major label can sign off on putting their flagship IP behind it.

## The Solution

A multi-surface product: a native iOS/Android fan app (text chat, voice messages, realtime voice calls), a web admin console for the artist's team (moderation queue, mood timeline, RAG corpus curation, push campaigns, feature flags, kill switches, audit), and a backend service that stitches together LLM + STT + TTS + voice-clone + long-term memory + artist RAG + moderation + billing + multi-tenant isolation.

The engineering principle is "production-grade from day one." This isn't a demo with GPT wrappers — it's 36 Postgres tables, 57 HTTP routes, 400+ tests across backend, admin, and mobile, circuit breakers on every AI upstream, graceful shutdown, sticky-session SSE affinity enforced at boot, per-(user, artist) quota + tier, dual-layer moderation (keyword + LLM) with a human review queue, 4-tier subscription model with independent mock-pay + real-pay code paths, per-tenant data isolation verified by integration tests, and observability (Prometheus / Grafana / Sentry / PagerDuty) wired through middleware.

The non-obvious win is that two very different traffic shapes share the same business logic: text chat + voice messages run REST + SSE through an in-house chat orchestrator, while realtime voice calls run through a LiveKit WebRTC stack with Python agents that call back into the same memory / RAG / safety / persona services. One persona definition, one moderation pipeline, two transport shapes.

## Architecture Overview

Three clients (mobile / admin / edge CDN) → API gateway (JWT, rate limit, circuit-break) → FastAPI monolith backend → fanout to LLM / STT / TTS / voice-clone / moderation upstreams. Async Python throughout. State lives in Postgres (main), Redis (session + short-term memory + rate limits), a vector store (long-term memory + artist RAG), and object storage (audio artifacts). Events pipe into a ClickHouse-style warehouse for analytics.

The MVP stack uses managed AI APIs (OpenAI, a premium STT provider, a commercial voice-clone provider) behind a thin client interface. Production hardening replaces them module-by-module with self-hosted equivalents (vLLM + Qwen-3-14B + LoRA for LLM, FunASR for STT, Fish Speech S2 for TTS, BGE-M3 for embeddings, Milvus for vector store) without touching the caller sites — the swap is one config flag per pipeline.

Realtime voice runs on a separate WebRTC plane: LiveKit SFU + Python agent (`livekit-agents`), same stack as OpenAI Realtime / Retell / Character.ai. The agent handles turn detection, VAD, jitter buffer, and hardware echo cancellation via the client's native WebRTC implementation; it calls back into the backend for persona, memory, and moderation on each turn.

## Technical Deep Dive

### The dual-transport pipeline

Chat messages stream tokens via Server-Sent Events. The `chat_orchestrator` runs one request through: input moderation (keyword + intent classifier, ~30ms) → context builder (short-term redis cache + long-term vector retrieval + artist RAG) → LLM call with persona-grounded system prompt → output moderation filter tapped into the token stream → inline emotion-tag extraction for the TTS layer. First byte in P50 ~400ms.

Voice messages are a different shape: user sends m4a → STT → the same orchestrator → LLM response → TTS re-synthesized in the artist's cloned voice → m4a back to the client. This path shares every downstream service with text chat but routes through its own endpoint with different audio-handling middleware.

Realtime voice is the third shape. The client (iOS/Android) joins a LiveKit room via signed JWT scoped to `(user, artist, room_id)`. A Python agent (one process per room) subscribes to the user's audio track, feeds Deepgram streaming STT, calls the LLM, pushes tokens into a streaming TTS, and publishes the output audio track back into the room. Server-side turn detection + VAD live in LiveKit; barge-in is free because WebRTC + hardware AEC handles it natively.

### The iOS AEC bug discovery

Early builds of the realtime path used naive WebSocket + raw PCM16 over binary frames. It worked on Android but broke on iOS: AI-generated speech would bleed back through the mic into STT, triggering phantom barge-ins in an infinite loop. Root cause turned out to be an Expo library issue — `expo-audio` resets `AVAudioSession` mode to `.default` on every `setAudioModeAsync`, which silently disables iOS's hardware echo cancellation. A native library (`react-native-live-audio-stream`) had correctly set `.voiceChat` at startup, but the first TTS playback stomped it.

Fixing the library would have solved one bug; VAD, jitter buffer, packet-loss recovery, route-change handling, and bluetooth handoff would still have been homegrown. The discovery forced a full migration to LiveKit — business logic stayed put, only the transport + codec + turn-detection stack was swapped. Same architectural shape every production voice AI converges on.

### Circuit-breaker-everything

Every external AI call goes through a per-provider circuit breaker with a failure threshold and a half-open probe. The Prometheus metric `lay_circuit_breaker_state` exports the current state per upstream. When Deepgram or the LLM has a brown-out, we fast-fail in milliseconds rather than wedging every fan's chat behind a 30s TCP timeout. Chat messages degrade to a template-based fallback response; voice calls surface a graceful "poor connection" notice instead of white-noising.

### Single-worker SSE affinity — enforced

SSE state (short-term memory, in-flight counter, per-user rate limit) is process-local. Running multiple uvicorn workers inside a replica would silently split state and break limits. The backend boot-time asserts it's running with `workers=1` and refuses to start otherwise (`_check_sse_affinity_or_exit`). Scale-out is strictly horizontal replicas behind a sticky-session load balancer. This is documented in the runbook and tested in CI.

### Multi-tenancy from day 1

Every business table carries `artist_id`. Quota, subscription tier, moderation rules, RAG corpus, persona, mood state, and push campaigns are all scoped per-(user, artist). A regression-test suite proves isolation: a paid subscription on artist A doesn't leak benefits to artist B. The architecture is ready for artist #2 the day the label signs them; the MVP restriction is operational (one persona in production), not architectural.

### Memory — two stores, one budget

Short-term memory is a rolling Redis cache of the last N message pairs. Long-term memory is an LLM-driven extraction: after every session, an extractor run pulls facts/preferences/relationship cues out of the conversation, embeds them, and stores them in the vector DB with a pointer back to the source message in Postgres. On each new message, the context builder pulls both: Redis (sub-5ms) for conversational continuity, vector search (sub-100ms) for "what does this character know about this fan." Two stores, one prompt budget; deduplication rules prevent memory from exploding.

## Tech Stack

| Layer | Stack |
|---|---|
| Mobile | Expo SDK 52, React 19, TypeScript 5.8, NativeWind |
| Admin web | React Router v7, Vite 6, shadcn/ui, TanStack Query |
| Backend | FastAPI, Python 3.13, async throughout |
| Realtime | LiveKit SFU (Go) + `livekit-agents` (Python) via WebRTC |
| Data | PostgreSQL 17, Redis 7, Chroma (MVP) / Milvus (prod), MinIO/OSS |
| AI — MVP | OpenAI GPT-4o-mini, Deepgram streaming STT, Fish Audio voice clone |
| AI — prod | vLLM + Qwen-3-14B + LoRA, FunASR, Fish Speech S2, BGE-M3 |
| Infra | Docker Compose (MVP), Kubernetes (prod), Makefile-driven local dev |
| Observability | Prometheus, Grafana, Loki, Tempo, Sentry, PagerDuty |
| Payments | 4-tier subscription model with independent mock-pay / real-pay adapters |

## Challenges & Solutions

**1. Making the AI feel present, not like an assistant.** The client's product bar was "could a fan believe this was a 10-minute chat with the artist." Solved by grounding the persona in a curated RAG corpus co-authored with the artist's team (interviews, known phrases, favorite topics, pet peeves), running an LLM-driven memory extractor over every session, and weighting short-term conversational continuity over long-term recall — real people remember what you just said, not everything you ever said.

**2. Subscription leakage across artists.** A subscription system naively keyed on `user_id` would let a paid fan of artist A get VIP benefits for artist B the moment a second artist launched. Found and fixed pre-production: every quota / tier lookup now takes `(user_id, artist_id)` as its effective tier key, verified by a dedicated test suite.

**3. Content safety at both ends.** Input moderation to stop fans from steering the model somewhere the label wouldn't sign off on. Output moderation to catch the rare case where the model goes somewhere on its own. Both run in the hot path; outputs stream through a token-aware filter so the banned-content case never reaches the client. Human review queue on top, surfaced in the admin console.

**4. One persona, two transport shapes.** Solved by putting every business rule (persona, memory, RAG, safety, billing, mood, scheduling) in services callable from both the chat orchestrator and the LiveKit agent. The transport layer is *only* transport — no business logic lives there. The LiveKit migration, when it happened, was ~2,000 lines of new transport code and zero lines changed in services.

**5. Provider lock-in from the managed-AI stack.** Every upstream (LLM / STT / TTS / embedding / moderation) is behind a local interface; the MVP implementation calls the cloud API, the production implementation calls the self-hosted model. Swapping is one config change per pipeline, no caller-site edits. Circuit breakers and metrics wrap the interface, not the implementation.

## What I Learned

The biggest lesson was that **the hard parts of consumer AI are not the model**. GPT-4o-mini is perfectly capable of playing this persona — what matters is the infrastructure around it: the memory shape, the moderation pipeline, the per-tenant isolation, the circuit breakers, the shutdown semantics, the observability. Model capability is rarely the gating factor; operational trust is.

The second lesson was about **owning the transport boundary**. Building naive WebSocket + PCM for realtime voice was a technical dead-end the moment we hit iOS — and every production voice AI team (OpenAI Realtime, Retell, Character.ai, Discord voice) has walked exactly the same path to WebRTC. Knowing when to stop rolling your own transport and adopt an industry-standard stack saved weeks.

Third, **compliance posture is a feature**, not paperwork. Major-label IP doesn't live behind a product unless the label can audit every prompt, every moderation decision, every user's data journey. Admin console, audit log, feature flags, and kill switches aren't bonus features — they're the reason the deal closes.

## Status

Phase A (laptop MVP) complete and hardened. 18 checkpoints delivered, 400+ passing tests across backend / admin / mobile / e2e, load-tested baseline established. Phase B (cloud deploy + self-hosted AI + first-artist launch) in progress under NDA.
