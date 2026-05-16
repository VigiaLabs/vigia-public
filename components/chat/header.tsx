const tabs = ["Answer", "Sources", "Maps"] as const;

export function ChatHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-100 bg-cream/80 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-6 py-3">
        <div className="flex items-center gap-6">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              className={`pb-1 text-sm font-medium transition-colors ${
                i === 0
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
