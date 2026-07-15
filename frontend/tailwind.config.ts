import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./services/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        panel: "hsl(var(--panel))",
        primary: "hsl(var(--primary))",
        danger: "hsl(var(--danger))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        xl:  "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        subtle:   "0 1px 2px rgba(15, 23, 42, 0.08)",
        ios:      "0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)",
        "ios-md": "0 4px 16px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.04)",
        "ios-lg": "0 8px 32px rgba(0,0,0,0.10), 0 0 1px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
