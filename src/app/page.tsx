"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import SplitType from "split-type";

gsap.registerPlugin(ScrollTrigger);

/* ═══ DATA ═══ */

const projects = [
  { cat: "AI AGENTS", name: "Signal Scout", desc: "What if 1000 AI agents could do a data scientist's job in 5 minutes? Connect your data warehouse, get back a statistically rigorous customer profile — no prompts, no dashboards, no consultants.", tech: ["Claude SDK", "FastAPI", "Modal", "DuckDB", "MCP"], url: "https://github.com/shizhigu/signal-scout", brief: "/briefs/signal-scout.md", featured: false },
  { cat: "CREATIVE AI", name: "film-cli", desc: "Can an AI agent direct a film? Not a clip — a real multi-shot narrative with consistent characters and continuity. This CLI lets Claude Code produce short films, shot by shot, with quality gates that reject anything below 8/10.", tech: ["Bun/TS", "Kling", "Gemini Pro", "Remotion"], url: "https://github.com/shizhigu/film-cli", brief: "/briefs/film-cli.md", featured: true },
  { cat: "iOS", name: "GlanceQuote", desc: "I was tired of unlocking my phone to check ES futures while driving. So I built an app that puts live prices on the Dynamic Island. Glance down, see the number, eyes back on the road.", tech: ["Swift", "SwiftUI", "ActivityKit", "WebSocket"], url: "https://github.com/shizhigu/glance-quote", brief: "/briefs/glancequote.md", featured: false },
  { cat: "AI AGENTS", name: "Marketa-Pro", desc: "Small e-commerce brands can't afford a content team. This platform replaces one — an AI orchestrator dispatches trend, strategy, and content agents to generate platform-ready marketing packages for any marketplace.", tech: ["Google ADK", "LiteLLM", "FastAPI"], url: "https://github.com/shizhigu/marketa-pro", brief: "/briefs/marketa-pro.md", featured: false },
  { cat: "FULL-STACK", name: "venue-ops-ai", desc: "Venue management still runs on walkie-talkies. I built a system where a manager just says \"show me urgent plumbing issues\" and an AI deputy handles the rest — dispatching workers, tracking tasks, escalating emergencies.", tech: ["Next.js", "LangGraph", "Deepgram", "Claude"], url: "https://github.com/shizhigu/venue-ops-ai", brief: "/briefs/venue-ops-ai.md", featured: true },
  { cat: "AI PRODUCT", name: "TokForm", desc: "Surveys get 15% completion rates. What if research felt like scrolling TikTok? Swipe through AI-generated questions that adapt in real-time. Early tests showed 3.7x deeper responses.", tech: ["Next.js", "Agno", "FastAPI", "Redis"], url: "https://github.com/shizhigu/smart-form-frontend", brief: "/briefs/tokform.md", featured: false },
  { cat: "AI AGENTS", name: "QuotientAI", desc: "Content creators leave 25-40% of deal value on the table because they don't know what brands pay. This 7-agent system does the research for them — analyzing brands, finding contacts, generating negotiation strategies.", tech: ["Google ADK", "Pinecone", "Perplexity"], url: "https://github.com/shizhigu/quotientai", brief: "/briefs/quotientai.md", featured: false },
  { cat: "DEVTOOLS", name: "skills-chat", desc: "Most AI chat apps are generic. This one lets you plug in personas, skills, and sandboxed tools like building blocks. Think: an AI that's actually good at specific things, not just everything poorly.", tech: ["React Router", "Claude SDK", "Bun", "MCP"], url: "https://github.com/shizhigu/skills-chat", brief: "/briefs/skills-chat.md", featured: false },
  { cat: "FINTECH", name: "fundley-app", desc: "\"Show me ROE for all tech companies above $10B market cap\" — type that in natural language, and the system compiles it to SQL, runs it, and saves it as a living analysis block you can revisit.", tech: ["Next.js", "AI SDK", "E2B", "Drizzle"], url: "https://github.com/shizhigu/fundley-app-new", brief: "/briefs/fundley-app.md", featured: true },
  { cat: "FULL-STACK", name: "DeductionTracker", desc: "Tax season shouldn't require a spreadsheet. Snap a receipt, categorize it, track deductions across web and mobile with a shared component library under the hood.", tech: ["Next.js", "React", "Drizzle", "Neon"], url: "https://github.com/shizhigu/DeductionTracker", brief: "/briefs/deductiontracker.md", featured: false },
];

const skills = ["Claude Agent SDK", "Multi-Agent", "LangGraph", "MCP", "FastAPI", "Next.js", "React Native", "SwiftUI", "WebSocket", "PostgreSQL", "TypeScript", "Python", "Swift"];

function CopyBriefButton({ briefUrl }: { briefUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(briefUrl);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="copy-btn"
      title="Copy project brief to clipboard — paste it into your LLM"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        background: copied ? "var(--accent)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${copied ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 6,
        padding: "4px 8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        transition: "all 200ms ease",
        zIndex: 2,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 510, color: copied ? "var(--bg)" : "var(--text-4)" }}>
        {copied ? "Copied!" : "Copy for LLM"}
      </span>
    </button>
  );
}

/* ═══ TYPEWRITER ═══ */

const taglines = [
  "I build autonomous AI agent systems",
  "I ship multi-agent orchestration platforms",
  "I build real-time data pipelines",
  "I create AI-native products from scratch",
];

function TypewriterTagline() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState("");
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = taglines[lineIndex];
    const speed = deleting ? 25 : 45;

    const timer = setTimeout(() => {
      if (!deleting) {
        if (charIndex < current.length) {
          setText(current.slice(0, charIndex + 1));
          setCharIndex(charIndex + 1);
        } else {
          // Pause then start deleting
          setTimeout(() => setDeleting(true), 2000);
        }
      } else {
        if (charIndex > 0) {
          setText(current.slice(0, charIndex - 1));
          setCharIndex(charIndex - 1);
        } else {
          setDeleting(false);
          setLineIndex((lineIndex + 1) % taglines.length);
        }
      }
    }, speed);

    return () => clearTimeout(timer);
  }, [charIndex, deleting, lineIndex]);

  return (
    <p
      ref={ref}
      className="hero-sub"
      style={{
        fontSize: "clamp(20px, 3.5vw, 36px)",
        fontWeight: 510,
        color: "var(--accent-bright)",
        letterSpacing: "-0.8px",
        lineHeight: 1.1,
        marginBottom: 28,
        minHeight: "1.2em",
        opacity: 0,
        transform: "translateY(16px)",
      }}
    >
      {text}
      <span style={{ color: "var(--accent)", animation: "blink 1s step-end infinite" }}>|</span>
    </p>
  );
}

/* ═══ PAGE ═══ */

export default function Home() {
  const nameRef = useRef<HTMLHeadingElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Lenis smooth scroll
    const lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    function raf(time: number) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // Hero name: character-by-character reveal
    if (nameRef.current) {
      const split = new SplitType(nameRef.current, { types: "chars" });
      if (split.chars) {
        gsap.set(split.chars, { y: "110%", opacity: 0 });
        gsap.to(split.chars, {
          y: "0%", opacity: 1,
          duration: 0.9, stagger: 0.05,
          ease: "power4.out", delay: 0.2,
        });
      }
    }

    // Hero fade-ins
    gsap.to(".hero-sub", { opacity: 1, y: 0, duration: 0.7, delay: 0.7, ease: "power2.out" });
    gsap.to(".hero-deck", { opacity: 1, y: 0, duration: 0.6, delay: 0.9, ease: "power2.out" });
    gsap.to(".hero-actions", { opacity: 1, y: 0, duration: 0.5, delay: 1.1, ease: "power2.out" });

    // Horizontal scroll projects (2 rows)
    if (trackRef.current && pinRef.current) {
      const totalScroll = trackRef.current.scrollWidth - window.innerWidth + 120;
      gsap.to(trackRef.current, {
        x: -totalScroll,
        ease: "none",
        scrollTrigger: {
          trigger: pinRef.current,
          start: "top top",
          end: () => `+=${totalScroll}`,
          scrub: 1.2,
          pin: true,
          anticipatePin: 1,
        },
      });
    }

    // About reveal
    if (aboutRef.current) {
      gsap.from(aboutRef.current.querySelectorAll(".fade-up"), {
        y: 50, opacity: 0, stagger: 0.08, duration: 0.7,
        ease: "power2.out",
        scrollTrigger: { trigger: aboutRef.current, start: "top 80%" },
      });
    }

    return () => { lenis.destroy(); ScrollTrigger.getAll().forEach(t => t.kill()); };
  }, []);

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-gradient" />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto", padding: "0 32px", width: "100%" }}>
          <p className="hero-sub" style={{ fontSize: 14, fontWeight: 510, color: "var(--text-3)", letterSpacing: "-0.1px", marginBottom: 16, opacity: 0, transform: "translateY(16px)" }}>
            AI Engineer &middot; Full-Stack Builder
          </p>

          <h1 ref={nameRef} className="hero-name" style={{ marginBottom: 20 }}>
            SHIZHI GU
          </h1>

          <TypewriterTagline />

          <p className="hero-deck" style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.7, color: "var(--text-3)", maxWidth: 460, marginBottom: 36, opacity: 0, transform: "translateY(16px)" }}>
            Multi-agent orchestration, real-time data pipelines, AI-native products. I ship fast and I ship complete.
          </p>

          <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0, transform: "translateY(16px)" }}>
            <a href="https://github.com/shizhigu" target="_blank" rel="noopener" className="btn-primary">
              View GitHub &rarr;
            </a>
            <a href="mailto:shizhigu97@gmail.com" className="btn-ghost">
              Get in touch
            </a>
          </div>
        </div>

        {/* scroll line only, no text */}
        <div className="scroll-hint">
          <div className="scroll-line" />
        </div>
      </section>

      {/* ═══ PROJECTS — HORIZONTAL SCROLL, 2 ROWS ═══ */}
      <section ref={pinRef} style={{ background: "var(--bg)", overflow: "hidden" }}>
        <div style={{ padding: "48px 48px 24px" }}>
          <p style={{ fontSize: 13, fontWeight: 510, color: "var(--text-4)", letterSpacing: "-0.1px" }}>
            Selected projects &mdash; 2024&ndash;2026
          </p>
        </div>

        <div ref={trackRef} style={{ display: "grid", gridTemplateRows: "1fr 1fr", gridAutoFlow: "column", gridAutoColumns: "400px", gap: 24, padding: "0 48px 48px", willChange: "transform" }}>
          {projects.map((p, i) => {
            const isFeatured = p.featured;
            return (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener"
                className={`project-card ${isFeatured ? "featured" : ""}`}
              >
                {p.brief && <CopyBriefButton briefUrl={p.brief} />}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span
                    className="cat-pill"
                    style={{
                      color: isFeatured ? "rgba(255,255,255,0.8)" : "var(--accent-bright)",
                      background: isFeatured ? "rgba(255,255,255,0.15)" : "rgba(6,182,212,0.1)",
                    }}
                  >
                    {p.cat}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 510, color: isFeatured ? "rgba(255,255,255,0.4)" : "var(--text-4)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <h3 style={{
                  fontFamily: '"Bebas Neue", Impact, sans-serif',
                  fontSize: 34, fontWeight: 400, lineHeight: 1.0,
                  letterSpacing: "1px",
                  color: isFeatured ? "var(--accent-bright)" : "var(--text-1)",
                  marginBottom: 10,
                }}>
                  {p.name.toUpperCase()}
                </h3>

                <p style={{
                  fontSize: 14, fontWeight: 400, lineHeight: 1.6,
                  color: isFeatured ? "rgba(255,255,255,0.7)" : "var(--text-3)",
                  marginBottom: 20,
                }}>
                  {p.desc}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.tech.map(t => (
                    <span key={t} className="tag" style={isFeatured ? { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.1)" } : {}}>
                      {t}
                    </span>
                  ))}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* ═══ ABOUT ═══ */}
      <section ref={aboutRef} style={{ maxWidth: 1000, margin: "0 auto", padding: "120px 32px 80px" }}>
        <p className="fade-up" style={{ fontSize: 13, fontWeight: 510, color: "var(--text-4)", marginBottom: 28 }}>
          About
        </p>

        {/* Stats row */}
        <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          {[
            { num: "10+", label: "Projects shipped" },
            { num: "7", label: "Multi-agent systems" },
            { num: "3", label: "Languages (TS/Py/Swift)" },
            { num: "5+", label: "AI/LLM integrations" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "20px 16px", border: "1px solid var(--border)", textAlign: "center" }}>
              <p style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', fontSize: 32, color: "var(--accent-bright)", marginBottom: 4 }}>{s.num}</p>
              <p style={{ fontSize: 11, fontWeight: 510, color: "var(--text-4)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="fade-up" style={{
          background: "rgba(255,255,255,0.02)",
          borderRadius: 12,
          padding: "32px 28px",
          border: "1px solid var(--border)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          gap: 32,
          alignItems: "flex-start",
        }}>
          {/* Avatar */}
          <div style={{ flexShrink: 0 }}>
            <img
              src="/images/avatar.png"
              alt="Shizhi Gu"
              style={{
                width: 140,
                height: 140,
                borderRadius: 10,
                objectFit: "cover",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Bio + skills */}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.8, color: "var(--text-2)", marginBottom: 16 }}>
              AI engineer with a background in quantitative finance. I built ML-driven research systems at a hedge fund, then went independent to build the tools I wished existed.
            </p>
            <p style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.8, color: "var(--text-3)", marginBottom: 24 }}>
              My sweet spot is the intersection of autonomous agents and real-time systems — building things that run, reason, and react without hand-holding. Every project above was built end-to-end by me, from architecture to deployment.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {skills.map(s => (
                <span key={s} className="skill-pill">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CONTACT ═══ */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 32px 80px" }}>
        <p style={{ fontSize: 13, fontWeight: 510, color: "var(--text-4)", marginBottom: 20 }}>
          Contact
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {[
            { label: "Email", href: "mailto:shizhigu97@gmail.com" },
            { label: "GitHub", href: "https://github.com/shizhigu" },
            { label: "LinkedIn", href: "https://linkedin.com/in/shizhigu" },
            { label: "X", href: "https://x.com/shizhigu" },
          ].map(l => (
            <a key={l.label} href={l.href} target={l.href.startsWith("mailto") ? undefined : "_blank"} rel="noopener" className="btn-ghost" style={{ fontSize: 13 }}>
              {l.label} &rarr;
            </a>
          ))}
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "28px 0", textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 510, color: "var(--text-4)" }}>
          &copy; 2026 Shizhi Gu
        </p>
      </footer>
    </>
  );
}
