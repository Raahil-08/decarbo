/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
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
      animation: {
        "float-slow": "float 8s ease-in-out infinite",
        "float-slower": "float 12s ease-in-out infinite",
        "float-fast": "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        "fade-up": "fade-up 0.8s ease-out forwards",
        "fade-up-delay-1": "fade-up 0.8s ease-out 0.15s forwards",
        "fade-up-delay-2": "fade-up 0.8s ease-out 0.3s forwards",
        "fade-up-delay-3": "fade-up 0.8s ease-out 0.45s forwards",
        "scale-in": "scale-in 0.6s ease-out forwards",
        "slide-in-left": "slide-in-left 0.8s ease-out forwards",
        "slide-in-right": "slide-in-right 0.8s ease-out forwards",
        "spin-slow": "spin 20s linear infinite",
        "gradient-x": "gradient-x 6s ease infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0) rotateX(0)" },
          "50%": { transform: "translateY(-20px) rotateX(2deg)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
}

