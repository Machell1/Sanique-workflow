/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          50: '#f4f4f7',
          100: '#e6e7ec',
          200: '#c2c4d0',
          300: '#9ca0b3',
          400: '#5e6379',
          500: '#363b51',
          600: '#252a3d',
          700: '#181c2e',
          800: '#10131f',
          900: '#0A0A0F',
          950: '#05060A',
        },
        gilt: {
          50: '#fbf8ed',
          100: '#f5edca',
          200: '#ecda93',
          300: '#e2c259',
          400: '#daab35',
          500: '#cc9027',
          600: '#b07020',
          700: '#8c5320',
          800: '#754322',
          900: '#643822',
          950: '#3a1e0e',
        },
        truth: {
          verified: '#22c55e',
          high: '#eab308',
          escalation: '#f97316',
          blocked: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-gilt': '0 0 24px -8px rgba(218, 171, 53, 0.45)',
        'glow-verified': '0 0 24px -8px rgba(34, 197, 94, 0.45)',
        'panel': '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -24px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'truth-grid': 'radial-gradient(circle at 1px 1px, rgba(218, 171, 53, 0.12) 1px, transparent 0)',
      },
    },
  },
  plugins: [],
};
