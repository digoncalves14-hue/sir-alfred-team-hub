import "react-native-get-random-values";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { LargeSecureStore } from "./secure-storage";

export const supabase = createClient(config.supabaseUrl || "https://invalid.local", config.supabaseAnonKey || "missing", {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renova o token apenas com o app em primeiro plano (recomendação da Supabase para RN).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
