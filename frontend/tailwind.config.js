/** @type {import('tailwindcss').Config} */

// Colours are declared as CSS custom properties in src/styles/globals.css and
// mapped here, so `bg-surface` / `text-ink-muted` / `border-line` are real
// classes and light↔dark swaps happen in one place. Before this, the theme
// extended NO colours at all: every page wrote `bg-[var(--h-ffffff)]` inline
// against machine-generated hex-named vars. Those `--h-*` vars still exist and
// still work — this is additive, so unrestyled pages are untouched.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { mono: ['"Fira Code"', 'monospace'] },
      colors: {
        app:     'var(--app-bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          sunken:  'var(--surface-sunken)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          hover:   'var(--sidebar-hover)',
          ink:     'var(--sidebar-ink)',
        },
        ink: {
          DEFAULT:   'var(--ink)',
          secondary: 'var(--ink-secondary)',
          muted:     'var(--ink-muted)',
          inverse:   'var(--ink-inverse)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong:  'var(--line-strong)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          hover:   'var(--brand-hover)',
          soft:    'var(--brand-soft)',
          ink:     'var(--brand-ink)',
        },
        ok:     { DEFAULT: 'var(--ok)',     soft: 'var(--ok-soft)' },
        warn:   { DEFAULT: 'var(--warn)',   soft: 'var(--warn-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        info:   { DEFAULT: 'var(--info)',   soft: 'var(--info-soft)' },
        done:   { DEFAULT: 'var(--done)',   soft: 'var(--done-soft)' },
      },
      borderRadius: {
        card: 'var(--radius)',
      },
      boxShadow: {
        // One soft, low-contrast lift. The mockups use a single card elevation
        // everywhere; more than one reads as noise.
        card:  '0 1px 2px rgba(16, 24, 40, .04), 0 1px 3px rgba(16, 24, 40, .06)',
        pop:   '0 8px 24px rgba(16, 24, 40, .12)',
      },
      ringColor: {
        focus: 'var(--ring-focus)',
      },
    },
  },
  plugins: [],
};
