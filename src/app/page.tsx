"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import SplitType from "split-type";

gsap.registerPlugin(ScrollTrigger);

/* ═══════════════════════════════════════════════════════════════════
 * DATA
 *
 * The site is intentionally editorial — treat it like a monograph,
 * not a dashboard. One "now building" spread up top, then a vertical
 * archive of selected work. Each project has a one-line description
 * that reads like a museum label, not a README summary.
 * ══════════════════════════════════════════════════════════════════ */

const nowBuilding = {
  case: "Case no. 01 — Currently in the studio",
  date: "April 2026",
  version: "v0.1",
  name: "sqlv",
  cat: "Devtools",
  tagline:
    "A SQLite viewer built for humans and coding agents to drive at the same time.",
  desc: "Native Tauri desktop app, JSON-first CLI, and MCP server share one Rust core — with a live push flow that mirrors terminal queries straight into the GUI my agent and I both watch. Less demo magic, more shared keyboard.",
  highlights: [
    {
      title: "One Rust core, three surfaces.",
      body: "CLI, Tauri desktop, and MCP server all delegate to the same `sqlv-core` library — semantics can't drift between the human view and the agent view.",
    },
    {
      title: "The agent proposes. The human approves writes.",
      body: "`sqlv push \"SQL\"` from any terminal lands the query in the running desktop app's editor. Reads run immediately; writes wait behind a loud consent banner with EXPLAIN QUERY PLAN and an affects-N-rows pill.",
    },
    {
      title: "Virtualized grid with a staging queue.",
      body: "1000-row pages via react-virtual, inline cell edit, FK navigation, and a Stage toggle that batches edits for a single-transaction commit with per-row revert.",
    },
  ],
  tech: ["Rust", "Tauri 2", "TypeScript", "CodeMirror 6", "rusqlite", "MCP"],
  url: "https://github.com/shizhigu/sqlite-viewer",
  brief: "/briefs/sqlv.md",
};

const projects = [
  {
    cat: "AI Agents",
    name: "Chronicle",
    desc: "Multi-agent simulation where LLM-driven characters act inside typed rule systems and live governance structures. Describe any world in plain English; an engine turns it into agents, rules, and locations.",
    tech: ["Bun/TS", "React Router v7", "SQLite", "pi-agent", "Konva"],
    url: "https://github.com/shizhigu/chronicle",
    brief: "/briefs/chronicle.md",
    year: "2026",
  },
  {
    cat: "AI Agents",
    name: "Signal Scout",
    desc: "A swarm of database-connected investigators that find ICP patterns, test them statistically, and return conclusions with evidence instead of vibes.",
    tech: ["Claude SDK", "FastAPI", "Modal", "DuckDB", "MCP"],
    url: "https://github.com/shizhigu/signal-scout",
    brief: "/briefs/signal-scout.md",
    year: "2026",
  },
  {
    cat: "Creative AI",
    name: "film-cli",
    desc: "Coherent films are hard. film-cli gives agents a quality-gated production loop for multi-shot storytelling, continuity control, and shot-by-shot iteration.",
    tech: ["Bun/TS", "Kling", "Gemini Pro", "Remotion"],
    url: "https://github.com/shizhigu/film-cli",
    brief: "/briefs/film-cli.md",
    year: "2026",
  },
  {
    cat: "Fintech",
    name: "Fundley",
    desc: "Ask a financial question in plain English, get back a reusable analysis artifact. Combines verified data, sandboxed code execution, and agent orchestration in one research workspace.",
    tech: ["Next.js", "AI SDK", "E2B", "Drizzle"],
    url: "https://github.com/shizhigu/fundley-app-new",
    brief: "/briefs/fundley-app.md",
    year: "2025",
  },
  {
    cat: "Full-stack",
    name: "venue-ops-ai",
    desc: "Walkie-talkies are terrible software. venue-ops-ai turns messy venue operations into a conversational command layer that triages issues, dispatches work, and keeps a live audit trail.",
    tech: ["Next.js", "LangGraph", "Deepgram", "Claude"],
    url: "https://github.com/shizhigu/venue-ops-ai",
    brief: "/briefs/venue-ops-ai.md",
    year: "2025",
  },
  {
    cat: "AI Agents",
    name: "Marketa-Pro",
    desc: "An AI content team for brands that can't afford one: trend research, audience strategy, creative direction, and marketplace-ready copy generated through orchestrated specialist agents.",
    tech: ["Google ADK", "LiteLLM", "FastAPI"],
    url: "https://github.com/shizhigu/marketa-pro",
    brief: "/briefs/marketa-pro.md",
    year: "2025",
  },
  {
    cat: "AI Product",
    name: "TokForm",
    desc: "Surveys are rigid and shallow. TokForm makes research feel like a feed: adaptive AI interviews, swipe-native UX, and responses that go materially deeper than static forms.",
    tech: ["Next.js", "Agno", "FastAPI", "Redis"],
    url: "https://github.com/shizhigu/smart-form-frontend",
    brief: "/briefs/tokform.md",
    year: "2025",
  },
  {
    cat: "AI Agents",
    name: "QuotientAI",
    desc: "A negotiation copilot for creators who are tired of getting outpriced. Multi-agent workflows research brands, benchmark deal value, find contacts, and generate smarter counteroffers.",
    tech: ["Google ADK", "Pinecone", "Perplexity"],
    url: "https://github.com/shizhigu/quotientai",
    brief: "/briefs/quotientai.md",
    year: "2025",
  },
  {
    cat: "iOS",
    name: "GlanceQuote",
    desc: "A market data app built for glancing, not tapping. Live crypto, stocks, and futures stream straight to the Dynamic Island so you can check price action without opening a brokerage app.",
    tech: ["Swift", "SwiftUI", "ActivityKit", "WebSocket"],
    url: "https://github.com/shizhigu/glance-quote",
    brief: "/briefs/glancequote.md",
    year: "2025",
  },
  {
    cat: "Devtools",
    name: "skills-chat",
    desc: "Generic chatbots are boring. skills-chat turns personas, tools, and reusable skills into a modular AI workspace where the assistant can actually do domain-specific work.",
    tech: ["React Router", "Claude SDK", "Bun", "MCP"],
    url: "https://github.com/shizhigu/skills-chat",
    brief: "/briefs/skills-chat.md",
    year: "2025",
  },
  {
    cat: "Full-stack",
    name: "DeductionTracker",
    desc: "A calmer take on expense tracking for freelancers: capture receipts, classify deductions, and manage tax-season chaos across web and mobile from one shared system.",
    tech: ["Next.js", "React", "Drizzle", "Neon"],
    url: "https://github.com/shizhigu/DeductionTracker",
    brief: "/briefs/deductiontracker.md",
    year: "2024",
  },
];

const skills = [
  "Claude Agent SDK",
  "Structured Outputs",
  "LangGraph",
  "MCP",
  "FastAPI",
  "Next.js",
  "SwiftUI",
  "DuckDB",
  "PostgreSQL",
  "TypeScript",
  "Rust",
  "Python",
  "Modal",
  "React",
];

/* ═══════════════════════════════════════════════════════════════════
 * PAGE
 * ══════════════════════════════════════════════════════════════════ */

export default function Home() {
  const nameRef = useRef<HTMLHeadingElement>(null);
  const heroSubRef = useRef<HTMLParagraphElement>(null);
  const heroMetaRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLElement>(null);
  const workRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Smooth scroll — kept but with a slightly slower ramp so motion
    // feels "published" rather than "app".
    const lenis = new Lenis({
      duration: 1.6,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // Hero name — char-level reveal. The italic descender lets each
    // glyph rise individually; staggered slowly so it reads.
    if (nameRef.current) {
      const split = new SplitType(nameRef.current, { types: "chars" });
      if (split.chars) {
        gsap.to(split.chars, {
          y: "0%",
          opacity: 1,
          duration: 1.1,
          stagger: 0.045,
          ease: "expo.out",
          delay: 0.35,
        });
      }
    }
    gsap.to(heroSubRef.current, {
      y: 0,
      opacity: 1,
      duration: 1,
      ease: "power3.out",
      delay: 1.0,
    });
    gsap.to(heroMetaRef.current, {
      y: 0,
      opacity: 1,
      duration: 0.9,
      ease: "power3.out",
      delay: 1.2,
    });

    // "Now building": diary entry reveal. Title letters lift; the rest
    // of the spread fades up on its own timing so the page doesn't
    // feel like a single choreographed unit.
    if (nowRef.current) {
      const title = nowRef.current.querySelector<HTMLElement>(".now__name");
      if (title) {
        const split = new SplitType(title, { types: "chars" });
        if (split.chars) {
          gsap.set(split.chars, { y: "110%", opacity: 0 });
          gsap.to(split.chars, {
            y: "0%",
            opacity: 1,
            duration: 0.9,
            stagger: 0.03,
            ease: "expo.out",
            scrollTrigger: { trigger: nowRef.current, start: "top 70%" },
          });
        }
      }
      gsap.from(nowRef.current.querySelectorAll(".now-reveal"), {
        y: 28,
        opacity: 0,
        duration: 0.9,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: nowRef.current, start: "top 70%" },
        delay: 0.2,
      });
    }

    // Archive list: each row fades in on scroll. Staggered by index.
    if (workRef.current) {
      gsap.from(workRef.current.querySelectorAll(".work__row"), {
        y: 24,
        opacity: 0,
        duration: 0.7,
        stagger: 0.06,
        ease: "power2.out",
        scrollTrigger: { trigger: workRef.current, start: "top 78%" },
      });
      gsap.from(workRef.current.querySelector(".work__header"), {
        y: 24,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: workRef.current, start: "top 82%" },
      });
    }

    if (aboutRef.current) {
      gsap.from(aboutRef.current.querySelectorAll(".fade-up"), {
        y: 28,
        opacity: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: aboutRef.current, start: "top 78%" },
      });
    }

    return () => {
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  const copyBrief = async (url: string) => {
    try {
      const res = await fetch(url);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op — minor feature
    }
  };

  return (
    <>
      {/* ═══ MASTHEAD ═══ */}
      <header className="masthead">
        <div className="masthead__mark-group">
          <span className="masthead__monogram" aria-hidden>
            SG
          </span>
          <span className="masthead__mark">Shizhi Gu</span>
        </div>
        <nav className="masthead__nav" aria-label="Primary">
          <a href="#now">Now</a>
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="hero">
        <div className="hero__eyebrow eyebrow">
          <span className="hero__eyebrow-dot" aria-hidden />
          <span>Studio, est. 2024 — Independent practice</span>
        </div>

        <h1 ref={nameRef} className="hero__name">
          Shizhi Gu
        </h1>

        <p ref={heroSubRef} className="hero__sub">
          An independent studio building <em>AI systems with teeth</em>
          &thinsp;— agent products that touch real data, survive messy inputs,
          and return outputs you can trust.
        </p>

        <div ref={heroMetaRef} className="hero__meta">
          <div className="hero__meta-col">
            <span className="hero__meta-label eyebrow">Practice</span>
            <span className="hero__meta-value">
              AI &amp; applied systems
            </span>
          </div>
          <div className="hero__meta-col">
            <span className="hero__meta-label eyebrow">Index</span>
            <span className="hero__meta-value">
              {projects.length + 1} works, 2024 &ndash; 2026
            </span>
          </div>
          <div className="hero__meta-col">
            <span className="hero__meta-label eyebrow">Based</span>
            <span className="hero__meta-value">United States / Remote</span>
          </div>
          <div className="hero__meta-col">
            <span className="hero__meta-label eyebrow">Status</span>
            <span className="hero__meta-value">
              Open to collaborations
            </span>
          </div>
        </div>

        <div className="hero__scroll eyebrow" aria-hidden>
          <span>Scroll</span>
          <span className="hero__scroll-line" />
        </div>
      </section>

      {/* ═══ NOW BUILDING ═══ */}
      <section
        ref={nowRef}
        id="now"
        className="now"
        aria-label="Currently in the studio"
      >
        <div className="now__inner">
          <aside className="now__side">
            <div className="now__side-kind">
              <span className="now__pulse" aria-hidden />
              In the studio
            </div>
            <div className="now__side-date">{nowBuilding.date}</div>
            <div className="now__side-version">{nowBuilding.version}</div>
          </aside>

          <div className="now__body">
            <p className="now__case now-reveal">{nowBuilding.case}</p>

            <h2 className="now__name">{nowBuilding.name}</h2>

            <p className="now__tagline now-reveal">{nowBuilding.tagline}</p>
            <p className="now__desc now-reveal">{nowBuilding.desc}</p>

            <ol className="now__highlights now-reveal">
              {nowBuilding.highlights.map((h, i) => (
                <li key={h.title} className="now__highlight">
                  <span className="now__highlight-num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="now__highlight-title">{h.title}</h3>
                    <p className="now__highlight-body">{h.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="now__tech now-reveal">
              {nowBuilding.tech.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>

            <div className="now__actions now-reveal">
              <a
                href={nowBuilding.url}
                target="_blank"
                rel="noopener"
                className="editorial-link editorial-link--accent"
              >
                View on GitHub{" "}
                <span className="editorial-link__arrow">&rarr;</span>
              </a>
              <button
                type="button"
                onClick={() => copyBrief(nowBuilding.brief)}
                className="editorial-link"
              >
                Copy brief for LLM
              </button>
              <a
                href={nowBuilding.brief}
                target="_blank"
                rel="noopener"
                className="editorial-link"
              >
                Read the case note{" "}
                <span className="editorial-link__arrow">&rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WORK — archival list ═══ */}
      <section ref={workRef} id="work" className="work" aria-label="Selected work">
        <div className="work__header">
          <h2 className="work__header-title">
            <em>Selected</em> work
          </h2>
          <div className="work__header-meta">
            An archive, 2024 &ndash; 2026
            <br />
            {projects.length} entries
          </div>
        </div>

        <ul>
          {projects.map((p, i) => (
            <li key={p.name}>
              <a
                href={p.url}
                target="_blank"
                rel="noopener"
                className="work__row"
              >
                <span className="work__num">
                  {String(i + 1).padStart(3, "0")}
                </span>
                <h3 className="work__name">
                  <em>{p.name}</em>
                </h3>
                <p className="work__desc">{p.desc}</p>
                <span className="work__cat">
                  {p.cat}
                  <br />
                  {p.year}
                </span>
                <span className="work__arrow" aria-hidden>
                  &rarr;
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* ═══ ABOUT ═══ */}
      <section ref={aboutRef} id="about" className="about">
        <div className="about__label">
          <span className="eyebrow fade-up">Biography</span>
          {/* No portrait — a developer studio doesn't need an author
           * photo. The name in the masthead + hero is enough identity;
           * the work is the face. */}
        </div>

        <div>
          <p className="about__quote fade-up">
            <em>Make the model earn its keep</em> — the rest is typography.
          </p>

          <div className="about__body">
            <p className="fade-up">
              I build AI systems for domains where bluffing gets expensive:
              investment research, analytics, operations, and developer
              workflows. My background is a mix of quantitative finance,
              backend engineering, and product-minded shipping.
            </p>
            <p className="fade-up">
              The common thread across this archive is simple: make the model
              earn its keep. Structured outputs, sandboxed execution,
              reproducible pipelines, and interfaces that feel sharp enough
              to ship — not just cool enough to demo.
            </p>
          </div>

          <dl className="about__specimens fade-up">
            <div>
              <dt className="about__specimen-label">Shipped</dt>
              <dd className="about__specimen-value">
                12+ products &amp; prototypes
              </dd>
            </div>
            <div>
              <dt className="about__specimen-label">Specialism</dt>
              <dd className="about__specimen-value">
                Agent systems with teeth
              </dd>
            </div>
            <div>
              <dt className="about__specimen-label">Stack</dt>
              <dd className="about__specimen-value">
                Rust · Python · TypeScript
              </dd>
            </div>
            <div>
              <dt className="about__specimen-label">Years</dt>
              <dd className="about__specimen-value">
                Building since 2018, AI since 2022
              </dd>
            </div>
          </dl>

          <div className="about__skills fade-up">
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              Tools &amp; materials
            </p>
            <div className="about__skills-list">
              {skills.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CONTACT ═══ */}
      <section id="contact" className="contact">
        <div className="about__label">
          <span className="eyebrow">Correspondence</span>
        </div>

        <div>
          <p className="contact__lead">
            Commission, collaborate, <em>or just say hello.</em>
          </p>

          <div className="contact__list">
            {[
              { label: "Email", value: "shizhigu97@gmail.com", href: "mailto:shizhigu97@gmail.com" },
              { label: "GitHub", value: "@shizhigu", href: "https://github.com/shizhigu" },
              { label: "LinkedIn", value: "in/shizhi-gu", href: "https://www.linkedin.com/in/shizhi-gu-264924193" },
              { label: "X", value: "@MikeG_builds", href: "https://x.com/MikeG_builds" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.href.startsWith("mailto") ? undefined : "_blank"}
                rel="noopener"
                className="contact__item"
              >
                <span className="contact__item-label">{l.label}</span>
                <span className="contact__item-value">{l.value}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="footer">
        <span>&copy; 2024 &ndash; 2026</span>
        <span className="footer__mark">Shizhi Gu — an independent studio.</span>
        <span>Set in Fraunces &amp; Inter</span>
      </footer>
    </>
  );
}
