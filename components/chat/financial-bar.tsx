export function FinancialBar() {
  return (
    <div className="my-4 rounded-xl border border-gray-200 bg-white p-4 font-sans">
      <div className="flex justify-between text-xs text-gray-600 mb-2">
        <span>Disbursed: <strong className="text-gray-900">₹1.8 Cr</strong></span>
        <span>Allocated: <strong className="text-gray-900">₹4.2 Cr</strong></span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={43}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-2 rounded-full bg-gray-800 animate-fill-bar"
          style={{ "--fill-width": "43%", width: 0 } as React.CSSProperties}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">43% disbursed as of Q3 FY25</p>
    </div>
  );
}
