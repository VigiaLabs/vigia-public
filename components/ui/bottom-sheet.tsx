"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export const BottomSheet = DialogPrimitive.Root;
export const BottomSheetTrigger = DialogPrimitive.Trigger;
export const BottomSheetClose = DialogPrimitive.Close;

export function BottomSheetContent({
  children,
  className = "",
  ...props
}: DialogPrimitive.DialogContentProps & { className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[28px] border border-border/80 bg-white/95 p-4 shadow-[0_-18px_48px_rgba(18,14,10,0.2)] backdrop-blur data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-6 data-[state=open]:slide-in-from-bottom-6 ${className}`}
        {...props}
      >
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[#e7dece]" aria-hidden />
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted hover:bg-[#f5efe6] hover:text-text-primary transition-colors">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
