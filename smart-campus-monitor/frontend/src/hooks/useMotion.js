import { useEffect, useRef, useState } from 'react';

const query = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

/** true when the user asked the OS for reduced motion. */
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => Boolean(query('(prefers-reduced-motion: reduce)')?.matches));
  useEffect(() => {
    const mq = query('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
};

/** true below the given width (phones / small tablets get lighter visuals). */
export const useIsCompact = (maxWidth = 768) => {
  const [compact, setCompact] = useState(() => Boolean(query(`(max-width: ${maxWidth}px)`)?.matches));
  useEffect(() => {
    const mq = query(`(max-width: ${maxWidth}px)`);
    if (!mq) return undefined;
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [maxWidth]);
  return compact;
};

/** Observe an element; returns [ref, inView]. `once` keeps it true after first reveal. */
export const useInView = ({ threshold = 0.2, once = false, rootMargin = '0px' } = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);
  return [ref, inView];
};

/** Adds .is-visible to every .reveal descendant when it scrolls into view. */
export const useRevealChildren = () => {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const nodes = root.querySelectorAll('.reveal');
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.15 }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);
  return ref;
};

/** Loops through `steps` steps while `active`, for scripted demo sequences. */
export const useSequence = (steps, { active = true, interval = 1400, loop = true } = {}) => {
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) {
      if (reduced) setStep(steps - 1);
      return undefined;
    }
    const timer = setInterval(() => {
      setStep((current) => {
        if (current + 1 < steps) return current + 1;
        return loop ? 0 : current;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [active, reduced, steps, interval, loop]);
  return step;
};
