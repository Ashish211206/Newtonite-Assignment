/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f7f7",
          100: "#e4ecec",
          200: "#c9d6d6",
          700: "#2f3f40",
          800: "#1c2a2b",
          900: "#121c1d",
          950: "#0b1213",
        },
        accent: {
          50: "#eefbf6",
          400: "#2dd4a8",
          500: "#12b890",
          600: "#0d9475",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
