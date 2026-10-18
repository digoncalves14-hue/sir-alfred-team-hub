"use client";
import { Loader2, X } from "lucide-react";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" | "lg" }>(
  function Button({ variant = "secondary", loading, size = "md", className, children, disabled, ...rest }, ref) {
    const v: Record<Variant, string> = {
      primary: "bg-gold-500 text-ink-950 hover:bg-gold-400 font-semibold",
      secondary: "border border-ink-600 bg-ink-800 text-neutral-100 hover:border-ink-500 hover:bg-ink-700",
      ghost: "text-neutral-300 hover:bg-ink-800 hover:text-white",
      danger: "border border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/40",
    };
    const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" }[size];
    return (
      <button
        ref={ref}
        className={cx("inline-flex items-center justify-center gap-2 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50", v[variant], s, className)}
        disabled={disabled || loading}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("panel", className)}>{children}</div>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-ink-700", className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400 transition-[width] duration-500" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-ink-700 text-neutral-300",
  editing: "bg-sky-950/60 text-sky-200 border-sky-900/60",
  queued: "bg-ink-700 text-neutral-200",
  analyzing: "bg-amber-950/50 text-amber-200 border-amber-900/50",
  transcribing: "bg-amber-950/50 text-amber-200 border-amber-900/50",
  selecting: "bg-amber-950/50 text-amber-200 border-amber-900/50",
  rendering: "bg-gold-700/20 text-gold-300 border-gold-700/40",
  ready: "bg-emerald-950/50 text-emerald-200 border-emerald-900/50",
  error: "bg-red-950/50 text-red-200 border-red-900/50",
  succeeded: "bg-emerald-950/50 text-emerald-200 border-emerald-900/50",
  failed: "bg-red-950/50 text-red-200 border-red-900/50",
  running: "bg-gold-700/20 text-gold-300 border-gold-700/40",
  canceled: "bg-ink-700 text-neutral-400",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const busy = ["analyzing", "transcribing", "selecting", "rendering", "running", "queued"].includes(status);
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium", STATUS_STYLE[status] ?? STATUS_STYLE.draft)}>
      {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" | "warn" }) {
  const t = { neutral: "bg-ink-700 text-neutral-300", gold: "bg-gold-700/20 text-gold-300", warn: "bg-amber-950/60 text-amber-200" }[tone];
  return <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className={cx("panel max-h-[90vh] w-full overflow-auto scroll-thin rounded-b-none p-5 sm:rounded-xl", wide ? "max-w-3xl" : "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:bg-ink-800 hover:text-white" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 px-6 py-12 text-center">
      <div className="mb-3 text-gold-500">{icon}</div>
      <p className="font-medium text-neutral-200">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-neutral-400">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const t = {
    info: "border-ink-600 bg-ink-850 text-neutral-300",
    warn: "border-amber-900/60 bg-amber-950/30 text-amber-100",
    error: "border-red-900/60 bg-red-950/30 text-red-100",
    success: "border-emerald-900/60 bg-emerald-950/30 text-emerald-100",
  }[tone];
  return <div className={cx("rounded-lg border px-3 py-2 text-sm", t)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin text-gold-500", className)} />;
}
