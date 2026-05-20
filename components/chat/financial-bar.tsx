export function FinancialBar() {
  return (
    <div className="my-4 shell-card p-4 font-sans">
      <div className="mb-2 flex justify-between text-xs text-text-secondary">
        <span>Disbursed: <strong className="text-text-primary">₹1.8 Cr</strong></span>
        <span>Allocated: <strong className="text-text-primary">₹4.2 Cr</strong></span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-[#f0ece6]"
        role="progressbar"
        aria-valuenow={43}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-2 rounded-full bg-[#111111] animate-fill-bar"
          style={{ "--fill-width": "43%", width: 0 } as React.CSSProperties}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">43% disbursed as of Q3 FY25</p>
    </div>
  );
}
