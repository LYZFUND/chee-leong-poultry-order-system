import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefdf8',
          100: '#d4f8ee',
          500: '#14b286',
          600: '#0d8f6d',
          700: '#0d7259',
        },
        ink: {
          900: '#14201f',
          700: '#364642',
          500: '#697671',
        },
      },
      boxShadow: {
        panel: '0 12px 34px rgba(20, 32, 31, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
