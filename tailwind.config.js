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
          DEFAULT: "#0f172a",
          soft: "#1e293b",
          muted: "#475569",
          faint: "#64748b",
        },
        silk: {
          DEFAULT: "#f0f4fa",
          card: "#ffffff",
        },
        slatebrand: {
          500: "#486581",
          600: "#334e68",
          700: "#243b53",
          800: "#102a43",
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
