/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand: dark navy chrome, electric-yellow primary action.
        navy: {
          50: '#f4f6fb',
          100: '#e6eaf3',
          200: '#cdd5e6',
          300: '#a6b2cd',
          400: '#6d7d9f',
          500: '#465575',
          600: '#2f3d5a',
          700: '#1c2740',
          800: '#141d33',
          900: '#0d1526',
          950: '#080e1a',
        },
        volt: {
          // electric yellow — reserved for primary actions & clock-in
          300: '#ffe37a',
          400: '#ffd633',
          500: '#f5c400',
          600: '#d6a800',
        },
        ink: {
          DEFAULT: '#0d1526',
          muted: '#5b6472',
          subtle: '#8a93a3',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,21,38,0.06), 0 1px 3px rgba(13,21,38,0.10)',
        'card-hover': '0 4px 12px rgba(13,21,38,0.10), 0 2px 4px rgba(13,21,38,0.06)',
        pop: '0 10px 30px rgba(13,21,38,0.18)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(245,196,0,0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(245,196,0,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(245,196,0,0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        shimmer: 'shimmer 1.4s infinite',
        'pulse-ring': 'pulse-ring 2s infinite',
        'slide-in': 'slide-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
