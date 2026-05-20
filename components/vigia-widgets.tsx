import { AlertTriangle, ShieldAlert, Activity, MapPin, IndianRupee, ImageIcon } from 'lucide-react';

export function ContradictionBanner() {
  return (
    <div className="shell-card px-4 py-3 animate-fade-in">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Verified Contradiction Detected
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Official documents claim project completion, but visual and telemetry
            evidence shows severe infrastructure damage. This discrepancy has been
            verified through a secondary document review.
          </p>
        </div>
      </div>
    </div>
  );
}

export function RetryAlert() {
  return (
    <div className="shell-card px-4 py-3 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 animate-pulse text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Contradiction Detected — Re-evaluating Sources
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Paper claims &apos;Completed&apos;, but visual evidence shows severe damage.
            Searching for amendment clauses and variation orders...
          </p>
        </div>
      </div>
    </div>
  );
}

export function SeverityBadge({
  severity,
  findings,
  imageUrl,
}: {
  severity: string;
  findings: string[];
  imageUrl?: string;
}) {
  const colorMap: Record<string, string> = {
    critical: 'bg-[#fcf2ef] text-[#9a3412] border-[#edd3ca]',
    severe: 'bg-[#faf3ea] text-[#a16207] border-[#e8dac4]',
    moderate: 'bg-[#f8f7ed] text-[#8a6d1a] border-[#e6e1c9]',
    minor: 'bg-[#f1f4f8] text-[#3b4a60] border-[#dde4ec]',
    none: 'bg-[#eef4ef] text-[#2f6b45] border-[#d8e6db]',
  };

  const colors = colorMap[severity] ?? colorMap['moderate'];

  return (
    <div className={`shell-card p-4 ${colors}`}>
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4 text-text-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Visual Assessment
        </span>
      </div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold capitalize text-text-primary">{severity}</span>
        <span className="text-xs text-text-muted">damage level</span>
      </div>
      <ul className="space-y-1">
        {findings.slice(0, 3).map((f, i) => (
          <li key={i} className="text-xs leading-relaxed text-text-secondary">
            • {f}
          </li>
        ))}
      </ul>
      {imageUrl && (
        <div className="mt-3 flex items-center gap-1.5 truncate text-xs text-text-muted">
          <ImageIcon className="h-3.5 w-3.5 flex-shrink-0" />
          {imageUrl}
        </div>
      )}
    </div>
  );
}

export function BudgetDeltaWidget({
  allocated,
  disbursed,
  currency,
  percentDisbursed,
}: {
  allocated: number;
  disbursed: number;
  currency: string;
  percentDisbursed: number;
}) {
  const formatCrore = (n: number) => `${(n / 10_000_000).toFixed(1)} Cr`;

  return (
    <div className="shell-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-text-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Budget Status
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Allocated</span>
          <span className="font-medium text-text-primary">
            {currency} {formatCrore(allocated)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Disbursed</span>
          <span className="font-medium text-text-primary">
            {currency} {formatCrore(disbursed)}
          </span>
        </div>
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-xs text-text-muted">
            <span>Utilization</span>
            <span>{percentDisbursed.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f0ece6]">
            <div
              className="h-full rounded-full bg-[#111111] transition-all duration-700"
              style={{ width: `${Math.min(percentDisbursed, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MapOverlay({
  lat,
  lng,
  label,
  severity,
}: {
  lat: number;
  lng: number;
  label: string;
  severity: string;
}) {
  const severityColor: Record<string, string> = {
    critical: 'text-[#9a3412]',
    severe: 'text-[#a16207]',
    moderate: 'text-[#8a6d1a]',
    minor: 'text-[#3b4a60]',
  };

  return (
    <div className="shell-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className={`h-4 w-4 ${severityColor[severity] ?? 'text-text-muted'}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Telemetry Location
        </span>
      </div>
      <div className="mb-2 text-sm text-text-primary">{label}</div>
      <div className="flex gap-4 text-xs text-text-muted">
        <span>Lat: {lat.toFixed(4)}</span>
        <span>Lng: {lng.toFixed(4)}</span>
      </div>
      <div className="mt-3 flex h-24 items-center justify-center rounded-2xl bg-[#f6f3ee] text-xs text-text-muted">
        Map view — {lat.toFixed(2)}, {lng.toFixed(2)}
      </div>
    </div>
  );
}
