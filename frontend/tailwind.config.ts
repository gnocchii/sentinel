import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Catppuccin Mocha
        bg:       "#11111b",  // crust
        surface:  "#181825",  // mantle
        border:   "#313244",  // surface0
        muted:    "#45475a",  // surface1
        text:     "#eff1f8",  // brighter text
        dim:      "#bac2de",  // subtext1 (brighter than subtext0)
        cyan:     "#89b4fa",  // blue
        green:    "#a6e3a1",  // green
        amber:    "#fab387",  // peach
        red:      "#f38ba8",  // red
        purple:   "#cba6f7",  // mauve
        pink:     "#f5c2e7",  // pink
        teal:     "#94e2d5",  // teal
        lavender: "#b4befe",  // lavender
        yellow:   "#f9e2af",  // yellow
      },
      fontFamily: {
        sans:    ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono:    ["'Geist Mono'", "ui-monospace", "monospace"],
        display: ["'Instrument Serif'", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
