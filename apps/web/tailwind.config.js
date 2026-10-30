/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        bg: '#070b14', surface: '#0c1220', raised: '#121a2c', line: '#1d2740', muted: '#8590a8', text: '#e8ecf5',
        primary: '#7c5cff', accent: '#2dd4bf', warn: '#f59e0b', danger: '#ef4444', draft: '#a78bfa',
        amber: { team: '#f5a524' }, sapphire: { team: '#4f8ff7' },
      },
      borderRadius: { DEFAULT: '8px', lg: '10px', xl: '12px' },
      keyframes: {
        'slot-in': { '0%': { transform: 'scale(1.25)', opacity: '0', filter: 'brightness(2)' }, '60%': { transform: 'scale(0.96)', opacity: '1' }, '100%': { transform: 'scale(1)', filter: 'brightness(1)' } },
        'ban-slash': { '0%': { transform: 'scaleX(0) rotate(-45deg)' }, '100%': { transform: 'scaleX(1) rotate(-45deg)' } },
        'glow': { '0%,100%': { boxShadow: '0 0 0 0 rgba(124,92,255,0)' }, '50%': { boxShadow: '0 0 0 4px rgba(124,92,255,.35)' } },
        'glow-danger': { '0%,100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0)' }, '50%': { boxShadow: '0 0 0 4px rgba(239,68,68,.35)' } },
        'fade-up': { '0%': { transform: 'translateY(6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'tick': { '0%': { transform: 'scale(1.12)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        'slot-in': 'slot-in .45s cubic-bezier(.2,.8,.2,1) both', 'ban-slash': 'ban-slash .35s ease-out .1s both',
        glow: 'glow 1.6s ease-in-out infinite', 'glow-danger': 'glow-danger 1.6s ease-in-out infinite',
        'fade-up': 'fade-up .3s ease-out both', tick: 'tick .3s ease-out',
      },
    },
  },
};
