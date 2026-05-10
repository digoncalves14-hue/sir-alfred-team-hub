import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

let cache: Map<string, string> | null = null;
const listeners = new Set<(m: Map<string, string>) => void>();

async function load() {
  const { data } = await supabase.from("profiles").select("nome, foto_url");
  const map = new Map<string, string>();
  (data ?? []).forEach((p: any) => {
    if (p.foto_url) map.set(norm(p.nome), p.foto_url);
  });
  cache = map;
  listeners.forEach((l) => l(map));
}

export function usePhotos() {
  const [photos, setPhotos] = useState<Map<string, string>>(cache ?? new Map());

  useEffect(() => {
    listeners.add(setPhotos);
    if (!cache) load();
    return () => {
      listeners.delete(setPhotos);
    };
  }, []);

  const refresh = useCallback(() => load(), []);
  const getPhoto = useCallback((name: string) => photos.get(norm(name)), [photos]);

  return { photos, getPhoto, refresh };
}
