export function CitationPill({ number, label }: { number: number; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-sans font-medium text-gray-600 cursor-pointer hover:bg-gray-300 hover:scale-[1.02] transition-all duration-150">
      <span className="mr-1 text-[10px] font-semibold text-gray-500">{number}</span>
      {label}
    </span>
  );
}
