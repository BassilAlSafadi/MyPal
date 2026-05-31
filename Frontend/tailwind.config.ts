import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const shadcnAnimationPlugin = plugin(({ addUtilities, matchUtilities, theme }) => {
  addUtilities({
    "@keyframes enter": {
      from: {
        opacity: "var(--tw-enter-opacity, 1)",
        transform:
          "translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1))",
      },
    },
    "@keyframes exit": {
      to: {
        opacity: "var(--tw-exit-opacity, 1)",
        transform:
          "translate3d(var(--tw-exit-translate-x, 0), var(--tw-exit-translate-y, 0), 0) scale3d(var(--tw-exit-scale, 1), var(--tw-exit-scale, 1), var(--tw-exit-scale, 1))",
      },
    },
    ".animate-in": {
      animationName: "enter",
      animationDuration: "150ms",
      "--tw-enter-opacity": "initial",
      "--tw-enter-scale": "initial",
      "--tw-enter-translate-x": "initial",
      "--tw-enter-translate-y": "initial",
    },
    ".animate-out": {
      animationName: "exit",
      animationDuration: "150ms",
      "--tw-exit-opacity": "initial",
      "--tw-exit-scale": "initial",
      "--tw-exit-translate-x": "initial",
      "--tw-exit-translate-y": "initial",
    },
  });

  matchUtilities(
    {
      "fade-in": (value) => ({ "--tw-enter-opacity": value }),
      "fade-out": (value) => ({ "--tw-exit-opacity": value }),
    },
    { values: { 0: "0", 80: "0.8", DEFAULT: "0" } },
  );

  matchUtilities(
    {
      "zoom-in": (value) => ({ "--tw-enter-scale": value }),
      "zoom-out": (value) => ({ "--tw-exit-scale": value }),
    },
    { values: { 90: ".9", 95: ".95", DEFAULT: "0" } },
  );

  matchUtilities(
    {
      "slide-in-from-top": (value) => ({ "--tw-enter-translate-y": `-${value}` }),
      "slide-in-from-bottom": (value) => ({ "--tw-enter-translate-y": value }),
      "slide-in-from-left": (value) => ({ "--tw-enter-translate-x": `-${value}` }),
      "slide-in-from-right": (value) => ({ "--tw-enter-translate-x": value }),
      "slide-out-to-top": (value) => ({ "--tw-exit-translate-y": `-${value}` }),
      "slide-out-to-bottom": (value) => ({ "--tw-exit-translate-y": value }),
      "slide-out-to-left": (value) => ({ "--tw-exit-translate-x": `-${value}` }),
      "slide-out-to-right": (value) => ({ "--tw-exit-translate-x": value }),
    },
    {
      values: {
        ...theme("spacing"),
        "1/2": "50%",
        full: "100%",
      },
    },
  );
});

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        'xs': '375px',  // iPhone SE / small Android
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        cobalt: {
          DEFAULT: "hsl(var(--cobalt))",
          light: "hsl(var(--cobalt-light))",
          glow: "hsl(var(--cobalt-glow))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 15px hsl(var(--cobalt) / 0.4)" },
          "50%": { boxShadow: "0 0 30px hsl(var(--cobalt) / 0.7)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "caret-blink": {
          "0%, 70%, 100%": { opacity: "1" },
          "20%, 50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "shimmer": "shimmer 2s linear infinite",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [shadcnAnimationPlugin],
} satisfies Config;
