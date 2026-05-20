import type { Config } from "tailwindcss";

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
      fontFamily: {
        heading: ['Montserrat', 'sans-serif'],
        body: ['Open Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(30px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-40px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(40px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.9)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-green": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(130 100% 36% / 0.3)" },
          "50%": { boxShadow: "0 0 60px hsl(130 100% 36% / 0.6)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "counter": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "xp-rise": {
          "0%":   { opacity: "0", transform: "translateY(8px) scale(0.8)" },
          "20%":  { opacity: "1", transform: "translateY(0) scale(1.05)" },
          "70%":  { opacity: "1", transform: "translateY(-30px) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-50px) scale(0.9)" },
        },
        "combo-pop": {
          "0%":   { transform: "scale(0.6) rotate(-6deg)", opacity: "0" },
          "60%":  { transform: "scale(1.15) rotate(2deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0)", opacity: "1" },
        },
        "shimmer-gold": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%":      { backgroundPosition: "100% 50%" },
        },
        "card-flip": {
          "0%":   { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(360deg)" },
        },
        "field-flash": {
          "0%":   { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.6)", transform: "scale(1)" },
          "40%":  { boxShadow: "0 0 0 8px hsl(var(--primary) / 0)",   transform: "scale(1.03)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)",     transform: "scale(1)" },
        },
        "bg-drift": {
          "0%, 100%": { backgroundPosition: "0% 0%" },
          "50%":      { backgroundPosition: "100% 100%" },
        },
        "boss-pulse": {
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 24px hsl(var(--primary)/0.4)" },
          "50%":      { transform: "scale(1.025)", boxShadow: "0 0 48px hsl(45 95% 55%/0.5)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-in-left": "slide-in-left 0.6s ease-out forwards",
        "slide-in-right": "slide-in-right 0.6s ease-out forwards",
        "scale-in": "scale-in 0.5s ease-out forwards",
        "pulse-green": "pulse-green 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "counter": "counter 0.8s ease-out forwards",
        "xp-rise": "xp-rise 1.4s ease-out forwards",
        "combo-pop": "combo-pop 0.4s cubic-bezier(.34,1.56,.64,1) forwards",
        "shimmer-gold": "shimmer-gold 4s ease-in-out infinite",
        "card-flip": "card-flip 0.6s ease-in-out",
        "field-flash": "field-flash 0.6s ease-out",
        "bg-drift": "bg-drift 14s ease-in-out infinite",
        "boss-pulse": "boss-pulse 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
