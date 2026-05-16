/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Phase Q.0.2 — KDPBook design DNA fonts.
      // Inter = UI/body (sans), Playfair Display = wordmark + PageHeader H1 (display),
      // JetBrains Mono = metrics/numbers/chart ticks (mono).
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '28px' }],
        '2xl': ['22px', { lineHeight: '30px' }],
        '3xl': ['28px', { lineHeight: '36px' }],
      },
      colors: {
        // Legacy v1 tokens (kept for backward compat — used by Card, Kpi, etc.)
        border: 'rgb(228 228 231)',
        input: 'rgb(228 228 231)',
        ring: 'rgb(16 185 129)', // Phase Q.0.2: emerald-500 (was zinc-900)
        background: 'rgb(255 255 255)',
        foreground: 'rgb(9 9 11)',
        muted: {
          DEFAULT: 'rgb(244 244 245)',
          foreground: 'rgb(113 113 122)',
        },

        // Phase Q.0.2 — semantic tokens (the v2 system the broken primitives reference).
        // After these are defined, Button/Input/Badge/Num/NavItem/DataTable stop rendering invisible.
        accent: {
          DEFAULT: '#10b981', // emerald-500 — KDPBook accent
          hover: '#059669', // emerald-600
          soft: '#10b98126', // emerald-500 @ ~15% alpha (for focus ring)
          fg: '#ffffff',
        },
        'accent-soft': '#10b98126', // alias for utility class generation
        'accent-hover': '#059669',
        'accent-fg': '#ffffff',

        surface: {
          DEFAULT: '#ffffff',
          2: '#f4f4f5', // zinc-100
          3: '#e4e4e7', // zinc-200
        },
        'surface-2': '#f4f4f5',
        'surface-3': '#e4e4e7',

        fg: {
          DEFAULT: '#09090b',
          muted: '#71717a', // zinc-500
          subtle: '#a1a1aa', // zinc-400
        },
        'fg-muted': '#71717a',
        'fg-subtle': '#a1a1aa',

        'border-strong': '#d4d4d8', // zinc-300

        success: {
          DEFAULT: '#10b981',
          soft: '#ecfdf5', // emerald-50
          fg: '#065f46', // emerald-800
        },
        'success-soft': '#ecfdf5',
        warning: {
          DEFAULT: '#f59e0b',
          soft: '#fffbeb', // amber-50
          fg: '#92400e', // amber-800
        },
        'warning-soft': '#fffbeb',
        error: {
          DEFAULT: '#ef4444',
          soft: '#fef2f2', // red-50
          fg: '#991b1b', // red-800
        },
        'error-soft': '#fef2f2',
        info: {
          DEFAULT: '#3b82f6',
          soft: '#eff6ff', // blue-50
          fg: '#1e40af', // blue-800
        },
        'info-soft': '#eff6ff',

        // Module colors per book-platform/design-dna.json
        module: {
          ads: '#10b981',
          analytics: '#3b82f6',
          publishing: '#8b5cf6',
          ai: '#f59e0b',
          marketplace: '#f43f5e',
        },
      },
      borderRadius: {
        btn: '6px',
        card: '8px',
        modal: '12px',
        pill: '9999px',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        card: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        popover:
          '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        modal:
          '0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '200ms',
        modal: '300ms',
      },
    },
  },
  plugins: [],
};
