"use client";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Motion rules for the site (from the studio's motion playbook):
 *   - springs, never linear; damping ratio >= 0.72, so things settle with a whisper of overshoot, never a bounce
 *   - one thing moves at a time: staggers, not explosions
 *   - text rises out of a mask, word by word, with a hair of rotation
 *   - everything respects prefers-reduced-motion (it simply appears)
 */

// Stiffness / damping presets: ratio = d / (2 * sqrt(k)).
export const SPRING = {
  snappy: { type: "spring", stiffness: 320, damping: 30 } as const, // 0.84: UI pieces, toggles, chips
  base: { type: "spring", stiffness: 170, damping: 26 } as const, // 1.00: cards, phones, containers
  heavy: { type: "spring", stiffness: 120, damping: 24 } as const, // 1.10: big type and logos
};

/** A headline that rises out of a mask word by word (55 ms stagger), once, when it scrolls in. */
export function Words({ text, className, as = "h2", delay = 0, accent }: { text: string; className?: string; as?: "h1" | "h2" | "h3"; delay?: number; accent?: string[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const lines = text.split("\n");
  let i = 0;
  return (
    <Tag ref={ref} className={className} aria-label={text.replace(/\n/g, " ")}>
      {lines.map((line, l) => (
        <span key={l} className="w-line" aria-hidden>
          {line.split(" ").map((w, wi) => {
            const k = i++;
            const hot = accent?.some((a) => w.toLowerCase().startsWith(a.toLowerCase()));
            return (
              <Fragment key={k}>{wi > 0 && " "}<span className="w-mask">
                <motion.span
                  className={`w-word${hot ? " w-hot" : ""}`}
                  initial={reduce ? false : { y: "105%", rotate: 4 }}
                  animate={inView || reduce ? { y: "0%", rotate: 0 } : undefined}
                  transition={{ ...SPRING.heavy, delay: delay + k * 0.055 }}
                >
                  {w}
                </motion.span>
              </span></Fragment>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

/** Rises into place on a spring when scrolled into view. */
export function Reveal({ children, className, delay = 0, y = 28, as = "div" }: { children: ReactNode; className?: string; delay?: number; y?: number; as?: "div" | "li" | "section" }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ ...SPRING.base, delay, opacity: { duration: 0.5, delay } }}
    >
      {children}
    </Tag>
  );
}

/** Counts up to a number once, when it scrolls into view. */
export function CountUp({ to, suffix = "", prefix = "" }: { to: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (n) => setV(Math.round(n)) });
    return () => c.stop();
  }, [inView, reduce, to]);
  return <span ref={ref}>{prefix}{v.toLocaleString("en-GB")}{suffix}</span>;
}
