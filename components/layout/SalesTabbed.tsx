import React from "react";

type Props = {
  filters: React.ReactNode;
  map: React.ReactNode;
  list: React.ReactNode;
};

export default function SalesTabbed({ filters, map, list }: Props) {
  const [tab, setTab] = React.useState<"map" | "list">("map");
  return (
    <div className="lg:hidden min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b">{filters}</div>

      <div className="px-3 py-2 border-b bg-white">
        <div className="inline-flex rounded-xl border overflow-hidden">
          <button
            className={`px-4 py-2 text-sm ${tab==="map" ? "bg-gray-100 font-medium" : "bg-white"}`}
            onClick={() => setTab("map")}
            aria-pressed={tab==="map"}
          >
            Map
          </button>
          <button
            className={`px-4 py-2 text-sm ${tab==="list" ? "bg-gray-100 font-medium" : "bg-white"}`}
            onClick={() => setTab("list")}
            aria-pressed={tab==="list"}
          >
            List
          </button>
        </div>
      </div>

      {/* Content area fills viewport below filters/tabs */}
      <div className="flex-1 overflow-hidden">
        {tab === "map" ? (
          <div className="relative h-full">
            <div className="absolute inset-0">{map}</div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto bg-white">{list}</div>
        )}
      </div>
    </div>
  );
}
