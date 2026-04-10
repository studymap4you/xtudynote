/**
 * Design tokens mirror (CSS variables in src/index.css — primary source of truth).
 * Install tailwindcss + postcss if you want to use @tailwind in components.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0a1224",
          soft: "#0f1a30",
          muted: "#94a3b8",
          faint: "#64748b",
        },
        silk: {
          DEFAULT: "#e2e8f0",
          card: "#111c32",
        },
        skybrand: {
          DEFAULT: "#5eb8ec",
          soft: "#7ec8f4",
          muted: "#7eb0d4",
        },
      },
      borderRadius: {
        ui: "8px",
      },
      spacing: {
        /* 8 / 16 / 24 grid */
        1: "8px",
        2: "16px",
        3: "24px",
      },
      boxShadow: {
        silk: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(30, 41, 59, 0.06)",
        "silk-lg":
          "0 4px 6px rgba(15, 23, 42, 0.04), 0 16px 40px rgba(30, 41, 59, 0.08)",
      },
    },
  },
  plugins: [],
};
