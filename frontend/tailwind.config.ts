import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Sentinel design system — dark monospace dashboard
        bg:       "#0a0c0f",
        surface:  "#111418",
        border:   "#1e2530",
        muted:    "#2a3240",
        text:     "#c8d4e0",
        dim:      "#5a6a7a",
        cyan:     "#00d4ff",
        green:    "#00ff88",
        amber:    "#ffaa00",
        red:      "#ff4444",
        purple:   "#8855ff",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
