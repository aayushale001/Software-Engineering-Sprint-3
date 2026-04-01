import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        mist: "#f3f7fb",
        accent: "#0b7a75",
        accent2: "#0f4c81",
        warm: "#f4b942"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "serif"]
      },
      boxShadow: {
        glow: "0 28px 70px -34px rgba(15,76,129,0.55), 0 24px 50px -38px rgba(11,122,117,0.4)"
      }
    }
  },
  plugins: []
};

export default config;
