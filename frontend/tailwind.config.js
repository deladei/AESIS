/** @type {import('tailwindcss').Config} */

/**
 * A theme colour that survives an opacity modifier.
 *
 * The tokens are authored as complete colours in globals.css (`--surface:
 * #ffffff`), not as channel triplets, so a plain `var(--surface)` here makes
 * `bg-surface/60` compile to nothing — Tailwind has no channels to apply the
 * alpha to. Several pages had been writing `/60` and `/70` for months against
 * a value that silently dropped it. `color-mix` applies the alpha to the
 * finished colour instead, and `<alpha-value>` resolves to 1 when no modifier
 * is used, so the un-suffixed class is unchanged.
 */
const alpha = (token) =>
  `color-mix(in srgb, var(${token}) calc(<alpha-value> * 100%), transparent)`;


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
        app:     alpha('--app-bg'),
        surface: {
          DEFAULT: alpha('--surface'),
          sunken:  alpha('--surface-sunken'),
        },
        sidebar: {
          DEFAULT: alpha('--sidebar'),
          hover:   alpha('--sidebar-hover'),
          ink:     alpha('--sidebar-ink'),
        },
        ink: {
          DEFAULT:   alpha('--ink'),
          secondary: alpha('--ink-secondary'),
          muted:     alpha('--ink-muted'),
          inverse:   alpha('--ink-inverse'),
        },
        line: {
          DEFAULT: alpha('--line'),
          strong:  alpha('--line-strong'),
        },
        brand: {
          DEFAULT: alpha('--brand'),
          hover:   alpha('--brand-hover'),
          soft:    alpha('--brand-soft'),
          ink:     alpha('--brand-ink'),
        },
        ok:     { DEFAULT: alpha('--ok'),     soft: alpha('--ok-soft') },
        warn:   { DEFAULT: alpha('--warn'),   soft: alpha('--warn-soft') },
        danger: { DEFAULT: alpha('--danger'), soft: alpha('--danger-soft') },
        info:   { DEFAULT: alpha('--info'),   soft: alpha('--info-soft') },
        done:   { DEFAULT: alpha('--done'),   soft: alpha('--done-soft') },
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
