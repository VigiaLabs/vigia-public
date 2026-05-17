import { ArrowUp, ChevronDown, Crosshair } from "lucide-react";

export function InputBar() {
  return (
    <div className="fixed bottom-4 left-0 right-0 z-20 md:bottom-6 md:left-[260px]">
      <div className="w-full px-4 md:mx-auto md:max-w-3xl md:px-6">
        <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-gray-300 focus-within:shadow-md focus-within:ring-1 focus-within:ring-gray-200 transition-all duration-200">
          {/* Focus Dropdown */}
          <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <Crosshair className="h-4 w-4" />
            <span className="hidden sm:inline">Focus</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* Text Input */}
          <input
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
            placeholder="Ask a follow-up about this budget..."
          />

          {/* Submit Button — larger on mobile for thumb tap */}
          <button className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition-colors">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
