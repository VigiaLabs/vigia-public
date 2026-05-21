import { Shield, Mail } from "lucide-react";

export function ActionBlock() {
  return (
    <div
      className="mt-6 shell-muted-card p-4 opacity-0 animate-fade-in-up"
      style={{ animationDelay: "400ms", animationFillMode: "forwards" }}
    >
      <p className="mb-3 text-sm text-text-secondary">
        Based on this verified audit, you can take official action:
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-1.5 rounded-full bg-[#1f3a5f] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#233e67]">
          <Shield className="h-3.5 w-3.5" />
          Escalate to NHAI PIU
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-[#f7f4ee]">
          <Mail className="h-3.5 w-3.5" />
          Notify Local Ward Member
        </button>
      </div>
    </div>
  );
}
