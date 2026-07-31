"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-border px-1 pb-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-mutedfg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-shadow",
          className
        )}
        {...props}
      />
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-mutedfg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-shadow",
          className
        )}
        {...props}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-mutedfg">{children}</label>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint && <p className="text-xs text-mutedfg">{hint}</p>}
    </div>
  );
}

type Variant = "primary" | "secondary";
const variants: Record<Variant, string> = {
  primary: "btn-gradient text-white",
  secondary: "bg-surface border border-border text-fg hover:bg-subtle",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; showArrow?: boolean }
>(function Button({ variant = "secondary", showArrow, className, children, ...props }, ref) {
  const withArrow = showArrow ?? variant === "primary";
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-all disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
      {withArrow && (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
);
