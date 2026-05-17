import { Plus, Settings, User } from "lucide-react";

const history = [
  "SH-15 Pothole Budget",
  "Ward 4 Contractor Audit",
  "Bridge Safety Compliance Q3",
  "Drainage Fund Utilization",
  "Smart City Mission — Phase 2",
];

export function SidebarContent() {
  return (
    <div className="flex h-full flex-col">
      {/* Branding */}
      <div className="flex items-center gap-1 px-2 py-3">
        <span className="text-lg font-bold text-gray-900">VIGIA</span>
        <span className="text-lg font-normal text-gray-500">Search</span>
      </div>

      {/* New Thread */}
      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-200/50 transition-colors">
        <Plus className="h-4 w-4" />
        New Thread
      </button>

      {/* History */}
      <div className="mt-6 flex-1 overflow-y-auto">
        <p className="px-3 text-xs font-medium uppercase tracking-wide text-gray-400">
          History
        </p>
        <nav className="mt-2 space-y-0.5">
          {history.map((item, i) => (
            <button
              key={item}
              className={`w-full truncate rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                i === 0
                  ? "bg-gray-200/60 text-gray-900"
                  : "text-gray-600 hover:bg-gray-200/40"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      {/* User Profile */}
      <div className="flex items-center gap-2 rounded-lg px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300">
          <User className="h-4 w-4 text-gray-600" />
        </div>
        <span className="text-sm text-gray-700">Citizen User</span>
        <Settings className="ml-auto h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-[260px] border-r border-gray-200 bg-sidebar-bg p-4 md:flex md:flex-col">
      <SidebarContent />
    </aside>
  );
}
