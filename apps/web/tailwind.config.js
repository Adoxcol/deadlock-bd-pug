/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        bg: '#0a0f1c', surface: '#111827', raised: '#162033', line: '#24304a', muted: '#8b97ad', text: '#e6ebf5',
        accent: '#2dd4bf', warn: '#f59e0b', danger: '#ef4444', draft: '#a78bfa',
        amber: { team: '#f5a524' }, sapphire: { team: '#4f8ff7' },
      },
      borderRadius: { DEFAULT: '8px', lg: '10px', xl: '12px' },
    },
  },
};
