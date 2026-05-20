"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  children,
  className = "",
  ...props
}: DialogPrimitive.DialogContentProps & { className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-sidebar-bg p-4 shadow-[0_24px_80px_rgba(17,17,17,0.12)] transition-transform duration-300 data-[state=open]:translate-x-0 data-[state=closed]:-translate-x-full ${className}`}
        {...props}
      >
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-full p-1.5 text-text-muted hover:bg-white hover:text-text-primary transition-colors">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
