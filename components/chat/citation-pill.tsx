export function CitationPill({ number, label }: { number: number; label: string }) {
  return (
    <sup>
      <span className="inline-flex items-center px-1.5 py-0.5 ml-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer transition-colors">
        [{number}] {label}
      </span>
    </sup>
  );
}
