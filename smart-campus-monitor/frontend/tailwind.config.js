/** @type {import('tailwindcss').Config} */
// Sentinel design system: midnight navy / graphite surfaces, cool-white type,
// restrained electric blue + cyan accents, emerald for "authorised".
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        ink: {
          950: '#04060b',
          900: '#070b14',
          850: '#0b111d',
          800: '#0f1726',
          750: '#131d30',
          700: '#19253b',
          600: '#24324d',
          500: '#344563',
          400: '#56677f',
          300: '#8593a8',
          200: '#b5c0d0',
          100: '#dde3ec',
          50: '#f1f4f9',
        },
        signal: {
          cyan: '#22d3ee',
          blue: '#3d6dff',
          emerald: '#10b981',
          amber: '#f59e0b',
          red: '#f04444',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(61,109,255,0.35), 0 0 32px -8px rgba(61,109,255,0.45)',
      },
      keyframes: {
        'scan-line': {
          '0%': { transform: 'translateY(-10%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(110%)', opacity: '0' },
        },
        'dash-flow': { to: { strokeDashoffset: '-40' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.6)', opacity: '0.7' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'scan-line': 'scan-line 2.2s cubic-bezier(.45,.05,.55,.95) infinite',
        'dash-flow': 'dash-flow 1.6s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(.2,.6,.3,1) infinite',
        rise: 'rise .6s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .4s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
