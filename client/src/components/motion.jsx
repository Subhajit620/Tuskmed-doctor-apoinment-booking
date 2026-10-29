import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Wraps route content so every navigation gets a subtle fade + rise instead
 * of a hard cut - the single highest-leverage animation in the app, since
 * every page routes through Layout/DoctorLayout's <Outlet>.
 */
export function PageTransition({ children }) {
  const location = useLocation();
  const reduced = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

/** Stagger-reveals its children on mount - use for card grids and lists. */
export function StaggerGrid({ children, className }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={listVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/** A single element that fades/rises in on mount - use for cards, banners, empty states. */
export function Reveal({ children, className, delay = 0 }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/** Smoothly counts up to a numeric value whenever it changes - dashboard/summary stats. */
export function AnimatedNumber({ value, className }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value ?? 0);
  const prev = useRef(value ?? 0);

  useEffect(() => {
    const target = Number(value ?? 0);
    if (reduced || !Number.isFinite(target)) {
      setDisplay(target);
      prev.current = target;
      return undefined;
    }
    const start = prev.current;
    const startTime = performance.now();
    const duration = 500;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(start + (target - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else prev.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <span className={className}>{Number.isFinite(Number(value)) ? display : (value ?? '–')}</span>;
}

/** Shimmering placeholder block for loading states - replaces plain "Loading..." text. */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export { motion, AnimatePresence };
