import React from "react";

type Props = {
  filters: React.ReactNode;
  map: React.ReactNode;
  list: React.ReactNode;
};

export default function SalesTwoPane({ filters, map, list }: Props) {
  // Sticky filters; main area fills remaining viewport height.
  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b">{filters}</div>

      {/* Desktop: two-pane; Mobile: hidden here, mobile uses tabbed version */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Map pane */}
        <div className="relative flex-1 overflow-hidden">
          <div className="absolute inset-0">{map}</div>
        </div>

        {/* List pane */}
        <aside
          className="w-[38vw] min-w-[360px] max-w-[480px] border-l bg-white shadow-sm h-full overflow-y-auto"
          aria-label="Sales list panel"
        >
          {list}
        </aside>
      </div>
    </div>
  );
}
