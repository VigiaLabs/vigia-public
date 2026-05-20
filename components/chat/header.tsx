const tabs = ["Answer", "Sources", "Maps"] as const;

export function ChatHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border/80 bg-cream/80 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              className={`shell-chip pb-2 pt-1 text-sm font-medium transition-colors ${
                i === 0
                  ? "shell-chip-active rounded-none border-b border-text-primary bg-transparent px-0 text-text-primary shadow-none"
                  : "shell-chip-inactive rounded-none bg-transparent px-0 hover:bg-transparent"
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
