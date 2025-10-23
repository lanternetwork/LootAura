import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export function useOverflowChips<T extends { id: string; priority?: number }>(
  items: T[]
) {
  const centerRef = useRef<HTMLDivElement|null>(null);
  const measureRef = useRef<HTMLDivElement|null>(null);
  const [visible, setVisible] = useState<T[]>(items);
  const [overflow, setOverflow] = useState<T[]>([]);
  const [_widthCache, setWidthCache] = useState<Record<string, number>>({});
  const [hysteresisState, setHysteresisState] = useState<{ count: number; lastResult: { visible: T[]; overflow: T[] } }>({ count: 0, lastResult: { visible: [], overflow: [] } });

  const ordered = useMemo(() => {
    // Higher priority stays visible longer. Default 0.
    return [...items].sort((a,b) => (b.priority ?? 0) - (a.priority ?? 0));
  }, [items]);

  const measure = useCallback(() => {
    const center = centerRef.current;
    const measure = measureRef.current;
    if (!center || !measure) return;

    const availableWidth = center.getBoundingClientRect().width - 4; // 4px safety margin
    const gap = 8; // must match gap-2 in Tailwind
    
    // Get widths from offscreen measurement container
    const measureChildren = Array.from(measure.children) as HTMLElement[];
    const chipMeasureEls = measureChildren.filter(el => el.dataset.role === 'chip-measure');
    
    // Update width cache
    const newWidthCache: Record<string, number> = {};
    chipMeasureEls.forEach((el, idx) => {
      const item = ordered[idx];
      if (item) {
        newWidthCache[item.id] = Math.ceil(el.getBoundingClientRect().width);
      }
    });
    setWidthCache(newWidthCache);

    // Calculate visible/overflow based on cached widths
    let used = 0;
    const nextVisible: T[] = [];
    const nextOverflow: T[] = [];

    ordered.forEach((item) => {
      const width = newWidthCache[item.id] ?? 0;
      const widthWithGap = nextVisible.length === 0 ? width : width + gap;
      
      if (used + widthWithGap <= availableWidth) {
        nextVisible.push(item);
        used += widthWithGap;
      } else {
        nextOverflow.push(item);
      }
    });

    // Hysteresis: prevent oscillation when overflow state changes
    const currentResult = { visible: nextVisible, overflow: nextOverflow };
    const isSameResult = 
      currentResult.visible.length === hysteresisState.lastResult.visible.length &&
      currentResult.overflow.length === hysteresisState.lastResult.overflow.length;

    if (isSameResult) {
      setHysteresisState({ count: 0, lastResult: currentResult });
      setVisible(nextVisible);
      setOverflow(nextOverflow);
    } else {
      const newCount = hysteresisState.count + 1;
      setHysteresisState({ count: newCount, lastResult: currentResult });
      
      // Only apply change after 2 consecutive stable measurements
      if (newCount >= 2) {
        setVisible(nextVisible);
        setOverflow(nextOverflow);
        setHysteresisState({ count: 0, lastResult: currentResult });
      }
    }

    const visibleIds = nextVisible.map(item => item.id);
    const overflowIds = nextOverflow.map(item => item.id);
    console.log('[OVERFLOW]', { available: availableWidth, visible: visibleIds.length, overflow: overflowIds.length });
  }, [ordered, hysteresisState]);

  useLayoutEffect(() => { 
    setVisible(ordered); 
    setOverflow([]); 
    setHysteresisState({ count: 0, lastResult: { visible: ordered, overflow: [] } });
  }, [ordered]);

  useEffect(() => {
    const center = centerRef.current;
    if (!center) return;
    
    const ro = new ResizeObserver(() => measure());
    ro.observe(center);
    
    // Initial measurement after mount
    requestAnimationFrame(measure);
    
    // Recompute on font load
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        requestAnimationFrame(measure);
      });
    }
    
    return () => ro.disconnect();
  }, [measure]);

  return { 
    centerRef, 
    measureRef, 
    visible, 
    overflow, 
    recompute: measure 
  };
}
