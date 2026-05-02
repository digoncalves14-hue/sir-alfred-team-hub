import { ReactNode } from "react";

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`bg-card border border-border rounded-2xl p-6 shadow-card ${className}`}>{children}</div>
);

export const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold text-foreground">{title}</h2>
    {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
  </div>
);

export const Badge = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${className}`}>{children}</span>
);

export const Stars = ({ n }: { n: number }) => (
  <span className="text-gold tracking-tight">{"★".repeat(Math.round(n))}<span className="text-muted-foreground">{"★".repeat(5 - Math.round(n))}</span></span>
);

export const ProgressBar = ({ value, max, color = "gold" }: { value: number; max: number; color?: "gold" | "success" | "destructive" }) => {
  const pct = Math.min(100, (value / max) * 100);
  const colorClass = pct >= 100 ? "bg-success" : color === "destructive" ? "bg-destructive" : "gradient-gold";
  return (
    <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
};
