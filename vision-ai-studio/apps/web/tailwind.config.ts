import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0B0B0C", 900: "#111113", 850: "#151518", 800: "#1B1B1F", 700: "#26262B", 600: "#34343A", 500: "#4A4A52" },
        gold: { 300: "#EBD58A", 400: "#E0C25C", 500: "#D4AF37", 600: "#B8962A", 700: "#8C7020" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: { panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)" },
    },
  },
  plugins: [],
} satisfies Config;
