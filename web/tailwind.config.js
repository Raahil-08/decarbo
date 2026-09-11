/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1D2A45",
          light: "#2A3D63",
        },
        brass: {
          DEFAULT: "#A97A2B",
          light: "#C6923B",
        },
        leaf: {
          DEFAULT: "#2D7A57",
          light: "#3A9B6F",
        },
        ember: {
          DEFAULT: "#B5432C",
          light: "#D45339",
        },
        paper: {
          DEFAULT: "#F7F8FA",
          dark: "#EAECEF",
        },
        rule: {
          DEFAULT: "#D6DAE1",
        },
        muted: {
          DEFAULT: "#5A6478",
          light: "#828D9F",
        },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        gujarati: ["'Hind Vadodara'", "sans-serif"],
        devanagari: ["'Hind'", "sans-serif"],
      },
    },
  },
  plugins: [],
}
