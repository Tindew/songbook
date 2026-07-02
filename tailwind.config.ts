import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#F8F2E8",
        "warm-beige": "#E7D6BE",
        "soft-beige": "#F2E6D4",
        lavender: "#B9A7FF",
        "deep-lavender": "#7B61FF",
        "pale-lavender": "#EEE9FF",
        ink: "#24202B",
        muted: "#7A7285",
        lotionpink: "#F5A8C8",
        success: "#62C99B",
        warning: "#F2B66D",
      },
      boxShadow: {
        soft: "0 18px 42px rgba(36, 32, 43, 0.10)",
        card: "0 8px 22px rgba(36, 32, 43, 0.05)",
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
