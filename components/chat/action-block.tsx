import { Shield, Mail } from "lucide-react";

export function ActionBlock() {
  return (
    <div
      className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-0 animate-fade-in-up"
      style={{ animationDelay: "400ms", animationFillMode: "forwards" }}
    >
      <p className="text-sm font-sans text-gray-600 mb-3">
        Based on this verified audit, you can take official action:
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 transition-colors">
          <Shield className="h-3.5 w-3.5" />
          Escalate to NHAI PIU
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Mail className="h-3.5 w-3.5" />
          Notify Local Ward Member
        </button>
      </div>
    </div>
  );
}
