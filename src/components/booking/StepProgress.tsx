"use client";
import { cn } from "@/lib/utils";

export function StepProgress({ labels, currentIndex }: { labels: string[]; currentIndex: number }) {
  return (
    <ol className="mb-6 flex items-start">
      {labels.map((label, i) => (
        <li key={label} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-center">
            <div className={cn("h-px flex-1", i === 0 ? "opacity-0" : i <= currentIndex ? "bg-primary" : "bg-border")} />
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < currentIndex && "bg-primary text-white",
                i === currentIndex && "bg-primary text-white ring-4 ring-primary/15",
                i > currentIndex && "border border-border bg-surface text-mutedfg"
              )}
            >
              {i + 1}
            </div>
            <div className={cn("h-px flex-1", i === labels.length - 1 ? "opacity-0" : i < currentIndex ? "bg-primary" : "bg-border")} />
          </div>
          <span className={cn("mt-1.5 text-center text-[11px] leading-tight", i === currentIndex ? "font-semibold text-fg" : "text-mutedfg")}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
