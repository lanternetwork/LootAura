import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export function useOverflowChips<T extends { id: string; priority?: number }>(items: T[]) {
  const railRef = useRef<HTMLDivElement|null>(null);
  const [visible, setVisible] = useState<T[]>(items);
  const [overflow, setOverflow] = useState<T[]>([]);

  const ordered = useMemo(() => {
    // Higher priority stays visible longer. Default 0.
    return [...items].sort((a,b) => (b.priority ?? 0) - (a.priority ?? 0));
  }, [items]);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const avail = rail.clientWidth - 12; // safety pad
    let used = 0;
    const gap = 8; // must match gap-2 in Tailwind
    const nextVisible: T[] = [];
    const nextOverflow: T[] = [];
    // Measure using temporary offscreen render widths via childNodes
    const temp = Array.from(rail.children) as HTMLElement[];
    // If first child is the "More" button placeholder, ignore it for measuring chips
    const chipEls = temp.filter(el => el.dataset.role === 'chip');
    // Fallback: approximate if not mounted yet
    const widths = chipEls.map(el => Math.ceil(el.getBoundingClientRect().width)) as number[];
    // If no DOM yet, keep all visible for now
    if (widths.length === 0) { setVisible(ordered); setOverflow([]); return; }
    // Map widths back to ordered items one-to-one based on order of render
    ordered.forEach((item, idx) => {
      const w = widths[idx] ?? 0;
      const withGap = nextVisible.length === 0 ? w : w + gap;
      if (used + withGap <= avail) {
        nextVisible.push(item); used += withGap;
      } else {
        nextOverflow.push(item);
      }
    });
    setVisible(nextVisible);
    setOverflow(nextOverflow);
  }, [ordered]);

  useLayoutEffect(() => { setVisible(ordered); setOverflow([]); }, [ordered]);
  useEffect(() => {
    const el = railRef.current;
   if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    // initial after mount
    requestAnimationFrame(measure);
    return () => ro.disconnect();
  }, [measure]);

  return { railRef, visible, overflow, recompute: measure };
}
