"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Atualiza a página periodicamente enquanto existir processamento em andamento. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
