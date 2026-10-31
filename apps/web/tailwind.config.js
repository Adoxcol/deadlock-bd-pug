/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      // Deadlock-inspired: smoky charcoal, worn brass, aged-paper text, condensed display caps, engraved serif accents.
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'sans-serif'],
        serif: ['"IM Fell English SC"', 'Georgia', 'serif'],
      },
      colors: {
        bg: '#0c0a08', surface: '#15120e', raised: '#1e1a15', line: '#2f2920', muted: '#9c907c', text: '#ece2cc',
        primary: '#d4a24c', accent: '#74b49b', warn: '#e3a33b', danger: '#cf4a3c', draft: '#e2b965',
        amber: { team: '#e8a33a' }, sapphire: { team: '#5a8fe0' },
      },
      borderRadius: { DEFAULT: '4px', lg: '5px', xl: '6px' },
      keyframes: {
        'slot-in': { '0%': { transform: 'scale(1.25)', opacity: '0', filter: 'brightness(2)' }, '60%': { transform: 'scale(0.96)', opacity: '1' }, '100%': { transform: 'scale(1)', filter: 'brightness(1)' } },
        'ban-slash': { '0%': { transform: 'scaleX(0) rotate(-45deg)' }, '100%': { transform: 'scaleX(1) rotate(-45deg)' } },
        'glow': { '0%,100%': { boxShadow: '0 0 0 0 rgba(212,162,76,0)' }, '50%': { boxShadow: '0 0 0 4px rgba(212,162,76,.35), 0 0 22px -4px rgba(212,162,76,.6)' } },
        'glow-danger': { '0%,100%': { boxShadow: '0 0 0 0 rgba(207,74,60,0)' }, '50%': { boxShadow: '0 0 0 4px rgba(207,74,60,.35), 0 0 22px -4px rgba(207,74,60,.6)' } },
        'fade-up': { '0%': { transform: 'translateY(6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'tick': { '0%': { transform: 'scale(1.12)' }, '100%': { transform: 'scale(1)' } },
        // Pick/ban reveal: wash and band sweep in, card punches in, name rises, everything fades by ~1.6s.
        'splash-wash': { '0%': { opacity: '0' }, '15%': { opacity: '1' }, '75%': { opacity: '1' }, '100%': { opacity: '0' } },
        'splash-band': { '0%': { transform: 'translateY(-50%) scaleY(0)' }, '18%': { transform: 'translateY(-50%) scaleY(1)' }, '80%': { opacity: '1' }, '100%': { transform: 'translateY(-50%) scaleY(1)', opacity: '0' } },
        'splash-card': { '0%': { transform: 'scale(1.6) rotate(-4deg)', opacity: '0', filter: 'brightness(3)' }, '30%': { transform: 'scale(.95) rotate(0)', opacity: '1', filter: 'brightness(1.4)' }, '45%': { transform: 'scale(1)', filter: 'brightness(1)' }, '100%': { transform: 'scale(1)' } },
        'splash-sheen': { '0%,25%': { backgroundPosition: '150% 0' }, '60%,100%': { backgroundPosition: '-100% 0' } },
        'splash-label': { '0%,15%': { opacity: '0', transform: 'translateX(-16px)' }, '35%,100%': { opacity: '1', transform: 'translateX(0)' } },
        'splash-name': { '0%,20%': { opacity: '0', transform: 'translateY(24px)', letterSpacing: '-0.06em' }, '45%,100%': { opacity: '1', transform: 'translateY(0)', letterSpacing: '-0.01em' } },
        'splash-out': { '0%,80%': { opacity: '1' }, '100%': { opacity: '0', transform: 'scale(1.04)' } },
        'draft-shake': { '0%,30%,100%': { translate: '0' }, '35%,55%,75%': { translate: '-5px 0' }, '45%,65%,85%': { translate: '5px 0' } },
        'confetti': { '0%': { transform: 'translateY(-10vh) rotate(0)', opacity: '1' }, '100%': { transform: 'translateY(105vh) rotate(720deg)', opacity: '0' } },
      },
      animation: {
        'slot-in': 'slot-in .45s cubic-bezier(.2,.8,.2,1) both', 'ban-slash': 'ban-slash .35s ease-out .1s both',
        glow: 'glow 1.6s ease-in-out infinite', 'glow-danger': 'glow-danger 1.6s ease-in-out infinite',
        'fade-up': 'fade-up .3s ease-out both', tick: 'tick .3s ease-out',
        'splash-wash': 'splash-wash 1.6s ease-out both', 'splash-band': 'splash-band 1.6s cubic-bezier(.2,.8,.2,1) both',
        'splash-card': 'splash-card 1.6s cubic-bezier(.2,.8,.2,1) both', 'splash-sheen': 'splash-sheen 1.6s ease-in-out both',
        'splash-label': 'splash-label 1.6s ease-out both', 'splash-name': 'splash-name 1.6s cubic-bezier(.2,.8,.2,1) both',
        'splash-out': 'splash-out 1.6s ease-in both', 'draft-shake': 'draft-shake .7s ease-out both',
        confetti: 'confetti 2.6s cubic-bezier(.3,.6,.5,1) both',
      },
    },
  },
};
