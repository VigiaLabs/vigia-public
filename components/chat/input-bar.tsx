import { ArrowUp, ChevronDown, Crosshair } from "lucide-react";

export function InputBar() {
  return (
    <div className="fixed bottom-6 left-[260px] right-0 z-20">
      <div className="mx-auto max-w-3xl px-6">
        <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-gray-300 focus-within:shadow-md focus-within:ring-1 focus-within:ring-gray-200 transition-all duration-200">
          {/* Focus Dropdown */}
          <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <Crosshair className="h-4 w-4" />
            <span>Focus</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* Text Input */}
          <input
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
            placeholder="Ask a follow-up about this budget..."
          />

          {/* Submit Button */}
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition-colors">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
