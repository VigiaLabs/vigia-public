export function CitationPill({ number, label }: { number: number; label: string }) {
  return (
    <sup>
      <span className="ml-1 inline-flex cursor-pointer items-center rounded-full border border-border bg-[#f4f4f5] px-2 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:bg-[#e4e4e7]">
        [{number}] {label}
      </span>
    </sup>
  );
}
