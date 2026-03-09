import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#0D0F12',
        surface: '#13161B',
        card:    '#191D24',
        border:  '#232830',
      },
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-up':   'fadeUp 0.35s ease both',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity:'0', transform:'translateY(12px)' },
          '100%': { opacity:'1', transform:'translateY(0)' },
        },
        pulseDot: {
          '0%,100%': { opacity:'0.4' },
          '50%':     { opacity:'1'   },
        },
      },
    },
  },
  plugins: [],
};

export default config;
