# Chronicle -- Project Brief

## 1. One-Liner

Chronicle is a multi-agent simulation framework where LLM-driven characters act inside typed rule systems and live governance structures -- describe any world in natural language, watch it play out, and edit it between ticks without restarting the run.

## 2. The Problem

"Agent simulations" are having a moment, but the field is stuck in two failure modes. The first is the toy-village demo: a handful of GPT-driven characters wander around a grid pretending to be bakers and mayors, producing charming transcripts that do not generalize. Change the scenario and you rewrite the simulator. The second is the academic harness: a research codebase tuned to one paper's experiment, impossible to lift into a different setting without forking. Neither approach treats the world itself as a configurable object. Both bake assumptions about what exists, what agents can do, and what "winning" looks like directly into the engine.

The deeper problem is that social simulations need structure that current agent frameworks refuse to provide. Real social behavior is not just characters chatting -- it is rules (what actions are legal), roles (who can do what), groups (who is aligned with whom), proposals (how collective decisions get made), votes (how authority shifts), and economic costs (what actions cost attention, reputation, or resources). Most LLM-agent systems treat these as narrative flavor text rather than typed primitives. The result is agents who roleplay a parliament without ever actually holding a vote, or roleplay a heist without any notion of what the crew legally cannot do. The simulation looks alive but is structurally hollow.

There is also a control problem. Once a simulation is running, researchers and designers want to steer it: add a new law, grant authority to a new role, inject a stranger into a scene, escalate stakes. Existing frameworks force you to stop the run, edit YAML, and restart -- losing all state. Interactive steering of a long-running simulation is effectively unsolved outside of purpose-built game engines. The combination of "describe a world from scratch," "run it with typed structure," and "edit it live without restarting" does not exist in a single system.

## 3. The Solution

Chronicle is a configurable social-simulation substrate. The user describes a scenario in natural language -- a Paris salon in 1924, a cruise ship on its fifth night, a founding parliament drafting a constitution -- and an LLM compiler turns that description into typed agents, rules, groups, locations, and roles. The engine then runs ticks: at each tick, a deterministic pre-filter decides which characters have anything to react to, those characters consult their private memory and call an LLM to produce a typed Effect (propose a law, move to a location, vote on a standing motion, defect from a coalition), and the engine applies accepted Effects to world state. The result is emergent behavior that respects the rules you defined, not generic chatbot improv.

The steering experience is the other half of the product. Chronicle is designed to be driven from Claude Code via natural language. The user sits in CC, types "add a rule that forbids duels between guild members," and a CC tool converts that into a structured edit that applies on the next tick. The simulation becomes a live artifact the user reshapes through conversation -- add-rule, edit-character, grant-authority, create-group, inject-event are all first-class operations. This collapses the normal "stop, edit config, restart" cycle into a continuous authoring loop.

Everything is event-sourced. Every tick, every Effect, every LLM call, every authority change is appended to a SQLite log keyed by the run's seed. Replay from seed reproduces the run byte-identically. This is the foundation for reproducible experiments, debuggable divergences, and the ability to branch a run from an earlier tick to explore counterfactuals ("what if the vote had gone the other way at tick 47?"). The typed-effect design is what makes deterministic replay possible in the first place: the engine never trusts free-form LLM output, only typed Effects that pass validation.

## 4. Architecture Overview

The repo is a Bun/TypeScript monorepo split into `engine`, `frontend`, `cli`, `schema`, `examples`, and shared `packages`. The engine is headless -- it runs ticks, applies Effects, and emits events without any rendering concerns. The frontend is a React Router v7 SPA that subscribes to the event stream and renders a Konva canvas of characters, locations, and governance overlays. The CLI is the entry point for Claude Code and for humans: init a world from a scenario description, run N ticks, apply an edit, export a replay, fork a run at tick K.

### Layer Diagram

```
Scenario Description (natural language)
      |
      v
Scenario Compiler (LLM) --> typed World { agents, rules, groups, locations, roles, authorities }
      |
      v
Engine (tick loop)
      |
      +-- Activation Pre-Filter (5 deterministic signals, no LLM)
      +-- Agent.think() (pi-agent, per-character file-backed memory, LLM call)
      +-- Effect Validation (typed, 14 kinds)
      +-- Rule Resolution (hard / soft / economic tiers)
      +-- World State Apply
      +-- Event Log Append (SQLite, seed-keyed)
      |
      v
Event Stream --> Frontend (React Router v7, Konva canvas, Tailwind v4)
               |
               +--> Claude Code (natural language steering via CLI)
```

### Data Flow

1. **Scenario compilation.** The user hands Chronicle a free-form paragraph. The compiler (an LLM chain with a strict schema) produces a typed `WorldSpec`: agents with personality/backstory, rules grouped by tier, locations with capacity and adjacency, groups with membership, roles with authority grants. The compiler is pure: same description plus same seed produces the same world.

2. **Tick entry.** The engine increments the tick counter and runs the activation pre-filter over all agents. The pre-filter is deterministic and uses five signals: proximity changes, direct mentions, group-state changes, standing proposals touching the agent, and scheduled wake-ups. Agents with zero signals are skipped entirely -- no LLM call, no cost, no drift.

3. **Per-agent deliberation.** For each activated agent, the engine loads the agent's private memory transcript (file-backed, curated by the agent itself), builds a context window with visible world state, and invokes pi-agent to produce a typed Effect. The LLM is constrained by schema -- it cannot emit free-form actions, only one of 14 typed Effect kinds.

4. **Effect validation and rule resolution.** Each Effect passes through validation against the three rule tiers. Hard rules are engine-enforced (illegal Effects are rejected). Soft rules are social norms (the Effect applies but incurs reputation cost). Economic rules attach action costs (attention, resources, favor).

5. **World apply and event log.** Accepted Effects mutate world state and append to the event log. The log is the ground truth; world state is a materialized projection that can be rebuilt by replaying the log from seed.

### Module Layout

- **engine** -- tick loop, Effect validation, rule resolution, activation pre-filter, event log. Headless and pure.
- **frontend** -- React Router v7 SPA, Konva canvas, Tailwind v4 styling, live subscription to the event stream.
- **cli** -- `chronicle init`, `chronicle run`, `chronicle edit`, `chronicle replay`, `chronicle fork`. The primary surface for Claude Code integration.
- **schema** -- shared Zod schemas for WorldSpec, Effect, Rule, Authority, Group, Role. Single source of truth across engine, frontend, and CLI.
- **examples** -- curated scenarios: Paris salon, cruise ship, founding parliament. Each is a ~2KB description file that compiles into a playable world.
- **packages** -- shared utilities (seeded RNG, SQLite drivers, memory-transcript tools).

## 5. Technical Deep Dive

### The Typed Effect System

The core decision is that LLMs never produce world changes directly -- they produce typed `Effect` values that the engine validates and applies. There are 14 Effect kinds covering the full governance lifecycle: `Speak`, `Move`, `ProposeRule`, `VoteOnProposal`, `WithdrawProposal`, `CreateGroup`, `JoinGroup`, `LeaveGroup`, `GrantAuthority`, `RevokeAuthority`, `AssignRole`, `UnassignRole`, `TransferResource`, `ScheduleWakeUp`. Every Effect is a discriminated union with its own Zod schema. The agent prompt injects the current list of legal Effects for that agent at that tick (based on role, authority, and location), and pi-agent's structured output enforces that only legal Effects come back. This eliminates an entire class of failures where the agent says "I assassinate the duke" and the engine has no idea what to do with that.

### Three-Tier Rule System

Rules are not a single flat list. Hard rules are engine-enforced and block the Effect entirely when violated (a guild member cannot duel another guild member, full stop). Soft rules are social norms -- the Effect goes through but the actor accrues reputation cost visible to other agents, which affects their future deliberation. Economic rules attach resource or attention costs to specific Effect kinds (proposing a rule costs 2 attention, granting authority costs 5 favor with the group). The three tiers compose: an Effect can pass hard rules, violate a soft norm (incurring reputation), and consume economic resources all in the same apply step.

### File-Backed Per-Character Memory

Chronicle deliberately avoids embeddings. Each character has a plaintext transcript file that the character itself curates via dedicated Effects (`AppendMemory`, `SummarizeMemory`). When the agent is activated, the engine injects the last N tokens of their transcript plus a summary of older entries. This gives agents strong identity continuity across hundreds of ticks without the retrieval latency and silent-failure modes of vector search. It also keeps the simulation legible -- you can open any character's memory file and read exactly what they believe, in their own words.

### Deterministic 5-Signal Activation Pre-Filter

The naive approach would call the LLM for every agent every tick. That scales terribly and produces a lot of "nothing changed, I continue what I was doing" responses. Chronicle pre-filters using five deterministic signals computed from the event log since the agent's last activation: did anyone enter or leave the agent's location, did anyone address the agent by name, did the agent's group membership or role change, is there a standing proposal the agent can still vote on, and has a scheduled wake-up fired. If all five signals are negative the agent is skipped this tick -- saving an LLM call and keeping the simulation cheap enough to run at scale.

### Claude Code Steering Loop

The CLI exposes a set of structured edits as subcommands designed for CC to call: `add-rule`, `edit-character`, `grant-authority`, `create-group`, `inject-event`, `set-location`. Each subcommand takes typed JSON and produces a world-state patch that applies on the next tick. The user's experience is: sit in CC, describe the change in natural language ("make the council now require a two-thirds majority for expulsion"), CC invokes the right subcommand with the right JSON, and the simulation absorbs the edit without restarting. Because every edit is itself logged as an event, replay from seed reproduces the steered run exactly -- the CC edits are part of the run's history, not an out-of-band override.

### Event-Sourced Replay

The SQLite event log is the source of truth. World state, agent memories, rule sets, and authority graphs are all projections built by replaying the log from tick 0. Given a seed and a log, replay is byte-identical: same RNG draws, same LLM cache hits (Chronicle uses a content-addressed prompt cache keyed by (prompt, seed) so replays do not re-incur LLM costs), same Effect order. Forking a run from tick K copies the log up to K, truncates, and continues from a new seed -- enabling counterfactual exploration.

## 6. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Bun | Native TypeScript execution, fast startup, built-in SQLite, test runner |
| Language | TypeScript (strict) | End-to-end type safety across engine, frontend, and CLI |
| Frontend Router | React Router v7 | SPA routing, data loaders, nested layouts |
| Rendering | Konva | 2D canvas for characters, locations, governance overlays |
| Styling | Tailwind v4 | Utility-first styling, CSS-native config |
| Persistence | bun:sqlite + drizzle-orm | Event log, world projections, agent memory indices |
| Agent Runtime | pi-agent | Structured-output LLM calls with schema validation |
| Schemas | Zod | Shared WorldSpec / Effect / Rule definitions across all packages |
| Monorepo | Bun workspaces | engine / frontend / cli / schema / examples / packages |
| Testing | bun test | 690+ unit and integration tests |
| Governance Artifacts | Markdown ADRs | 14 architecture decision records committed alongside code |

## 7. Challenges & Solutions

### Challenge 1: Free-Form LLM Output Is the Enemy of Determinism

**Problem.** If agents produce free-form text that the engine parses, determinism is impossible. Two runs with the same seed will diverge the moment the LLM's phrasing shifts by a token. Replay breaks, reproducibility breaks, and the simulation becomes a storytelling toy instead of an experimental substrate.

**Solution.** Typed Effects. The LLM is constrained to emit one of 14 Effect variants, each with a strict Zod schema. pi-agent enforces the structure at the decode step. The engine never parses prose. Combined with a content-addressed prompt cache keyed by (prompt, seed), replay is byte-identical and free.

### Challenge 2: LLM Cost at Simulation Scale

**Problem.** A 50-agent simulation running for 200 ticks is 10,000 potential LLM calls. At a realistic per-call cost, this is prohibitive for the kind of exploratory, iterative workflow the product is designed for.

**Solution.** The deterministic 5-signal activation pre-filter. Agents who have nothing to react to are skipped, with zero LLM involvement. In practice this reduces LLM calls by 70-90% depending on scenario density. Combined with the prompt cache on replays, an iterated scenario run becomes nearly free after the first pass.

### Challenge 3: Live Editing Without Breaking Replay

**Problem.** Allowing Claude Code to edit the running simulation conflicts with the event-sourced replay guarantee. If edits are an out-of-band mutation, replay diverges.

**Solution.** Edits are events. Every CC-issued edit is appended to the event log as a first-class event type before the next tick begins. Replay from seed re-applies the edits at the ticks they originally landed, reproducing the steered run exactly. The user can even replay a steered run up to tick K and then fork with different edits from there.

### Challenge 4: Governance Needs More Than Roleplay

**Problem.** Early prototypes had agents "roleplay" voting and proposing laws, but the engine did not actually track proposals, votes, or authority. Characters would claim the motion passed when it had not, or vote twice, or ignore the outcome. The governance layer was performative theater.

**Solution.** L2 governance is first-class typed state. Proposals are objects with quora, expiration, and vote tallies. Authority grants are edges in a graph the engine queries before accepting governance Effects. Role assignments gate which Effect kinds an agent may even emit. The 14 typed Effects cover the full lifecycle (propose, vote, withdraw, grant, revoke, assign, unassign) so the engine, not the narrative, decides what actually happened.

### Challenge 5: Agent Memory Drift Across Long Runs

**Problem.** Conventional RAG-style agent memory (embeddings + vector search) had two failure modes in long simulation runs. Retrieval would silently miss critical older events, and the agent's "sense of self" would drift as the retrieved context shifted per query.

**Solution.** File-backed, agent-curated plaintext transcripts. Each character appends to and summarizes their own memory via typed Effects. The engine injects the recent transcript plus the character's own running summary. No embeddings, no retrieval surprise. Identity persists because the agent is reading the same running narrative every tick, not a different stochastic slice of it.

## 8. What I Learned

**Types are the load-bearing beam of any non-toy agent system.** Every serious correctness problem in the first months of the project resolved to the same root: letting the LLM produce something the engine had to parse. Once Effects became a discriminated union validated at the decode step, entire categories of bugs -- drift, replay divergence, illegal actions slipping through -- stopped reproducing. The type system is doing the work that prompt engineering cannot.

**Activation is the real performance knob, not model size.** Smaller models per-call were never going to make simulation-scale agent systems affordable. The breakthrough was realizing most activations are wasted -- agents responding to nothing because nothing changed. The 5-signal deterministic pre-filter did more for cost and latency than any model-swap experiment.

**Claude Code is the right frontend for creative tools with deep state.** Chronicle has a web UI, but the primary authoring experience is a CLI driven by CC. The natural-language-to-structured-edit flow is dramatically faster than clicking through forms, and because every edit is logged, the CC transcript doubles as a versioned audit trail of creative decisions. This pattern -- structured backend, typed edit surface, CC as the natural-language frontend -- generalizes far beyond simulations.

**Event sourcing pays for itself the day you need to debug a divergence.** Early on, event sourcing felt like over-engineering for a simulation project. The first time a weird behavior appeared at tick 140 and I replayed from seed to tick 139 and single-stepped through the next tick's Effects, that feeling evaporated. Replayable simulations are debuggable simulations. Non-replayable simulations are storytelling toys.

**ADRs ship better code than design docs.** Fourteen architecture decision records now live in the repo. Each one captures a specific choice (typed Effects over free-form, file-backed memory over embeddings, 5-signal activation, three-tier rules, CC-first authoring surface) with its context and consequences. Future me -- and contributors -- get the reasoning along with the code, and the ADR format forces a level of commitment that a wiki page never does.

## 9. Motivation & Context

Chronicle started from frustration with the "agent village" genre of AI demo. Those demos are aesthetic wins but structural dead ends -- the moment you change the scenario, you rewrite the simulator. I wanted a substrate where describing a new world was the only work, not re-plumbing the engine. That meant every world primitive (rules, groups, roles, authority, proposals, votes, locations, resources) had to live in the engine as a typed thing, not in the narrative as flavor text.

The second motivation was an experiment in Claude Code as a creative frontend for long-lived state. Most CC use is transient -- edit some code, run a test, ship a PR. Simulation authoring is the opposite: state lives for hours or days, and the user wants to keep reshaping it. I wanted to see whether CC could serve as the natural-language authoring layer over a persistent, typed world. The answer so far is an emphatic yes -- being able to sit in CC and say "grant the council veto authority over resource transfers" and have that apply on the next tick is a dramatically better authoring loop than any GUI I have built.

The third motivation is more personal. Social systems -- parliaments, guilds, salons, jury rooms -- are fascinating precisely because the rules and the people interact in ways that are hard to reason about analytically but easy to observe in simulation. Chronicle is a tool for that kind of observation. The aspiration is that a historian, a game designer, a governance researcher, or a curious person with a question about emergent behavior can describe a world in a paragraph and watch it play out under rules they control.

## 10. Status

**Current: v0.1.0-alpha -- Core Engine and Governance Shipped**

The simulation substrate is functional end-to-end:

- Scenario compiler turns natural-language descriptions into typed WorldSpecs
- Engine runs ticks with 5-signal activation pre-filter and 14 typed Effect kinds
- Three-tier rule system (hard / soft / economic) fully wired
- L2 governance layer with proposals, votes, authority grants, role assignments
- File-backed per-character memory with agent-curated summarization
- Event-sourced SQLite log with byte-identical replay from seed
- React Router v7 + Konva frontend subscribing to the live event stream
- CLI with init / run / edit / replay / fork, designed for Claude Code steering
- 690+ tests passing, 14 ADRs committed
- Example scenarios: Paris salon, cruise ship, founding parliament

**Planned Next:**

- Branching UI in the frontend for forking runs at arbitrary ticks
- Scenario marketplace: community-shared WorldSpecs with one-command import
- Multi-run comparison tools: diff event logs across counterfactuals
- Richer economic rule primitives (markets, currency, credit)
- LLM provider abstraction beyond the current pi-agent backend

**Known Limitations:**

- No spatial reasoning beyond discrete locations (no continuous 2D movement yet)
- Frontend canvas is read-only; all authoring happens via CLI / Claude Code
- Scenario compiler occasionally needs a human pass on edge-case ontologies
- Prompt cache is local-only; no shared cache across machines yet
