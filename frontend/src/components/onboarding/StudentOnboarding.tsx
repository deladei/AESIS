import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The first-run logbook walkthrough a student sees once, before anything else.
 *
 * Six panels from the department's tutorial artwork, in order. The captions are
 * real text rather than part of the picture so a screen reader has something to
 * read, the browser can translate them, and they stay legible on a phone where
 * the artwork itself is scaled well below the size its type was drawn for.
 */
interface Slide {
  src:   string;
  /** Reader-facing description of the artwork — never decorative here. */
  alt:   string;
  title: string;
  body:  string;
}

const SLIDES: Slide[] = [
  {
    src:   '/onboarding/slide-1.webp',
    alt:   'A student with a laptop beside a checklist of the internship journey: Learn, Log activities, Get feedback, Grow.',
    title: 'How to log your weekly logbook',
    body:  'Track your learning, record your internship activities, and build your future. Five short steps — this takes a minute.',
  },
  {
    src:   '/onboarding/slide-2.webp',
    alt:   'The AESIS sign-in form, showing the institutional email and password fields.',
    title: 'Sign in',
    body:  'Use your institutional email address and password. You can also sign in with your index number.',
  },
  {
    src:   '/onboarding/slide-3.webp',
    alt:   'The dashboard sidebar with Profile Logbook highlighted, beside a card showing this week’s logbook entries.',
    title: 'Open your logbook',
    body:  'From your dashboard, open Logbook in the sidebar. Your current week is selected for you.',
  },
  {
    src:   '/onboarding/slide-4.webp',
    alt:   'The weekly logbook entry form: week, date, activities completed, skills learned, challenges and hours worked.',
    title: 'Record your week',
    body:  'Fill in your activities, the skills you used, any challenges, and your hours. Be specific — this is what your supervisor reads.',
  },
  {
    src:   '/onboarding/slide-5.webp',
    alt:   'A completed logbook entry with Save draft and Submit for review buttons, and a confirmation that it was submitted.',
    title: 'Submit for review',
    body:  'Save a draft while you are still working. Submit when the week is done and it goes to your supervisor.',
  },
  {
    src:   '/onboarding/slide-6.webp',
    alt:   'Supervisor feedback, an overall progress ring, and a weekly history list showing submitted, reviewed and approved weeks.',
    title: 'Review feedback and keep progressing',
    body:  'Read your supervisor’s feedback, watch your progress, and see every week you have submitted. That is everything — welcome to AESIS.',
  },
];

export default function StudentOnboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const nextRef  = useRef<HTMLButtonElement>(null);
  const isLast   = index === SLIDES.length - 1;
  const slide    = SLIDES[index];

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => {
    setIndex((i) => {
      if (i < SLIDES.length - 1) return i + 1;
      onDone();
      return i;
    });
  }, [onDone]);

  // The next panel is fetched while the current one is being read, so advancing
  // never shows an empty frame on a slow connection.
  useEffect(() => {
    const upcoming = SLIDES[index + 1];
    if (upcoming) new Image().src = upcoming.src;
  }, [index]);

  // Arrow keys because this is a slideshow, Escape because it is a dialog.
  // Escape is the same as finishing: a student who wants out has effectively
  // seen it, and showing it again on the next sign-in would be nagging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft')  back();
      if (e.key === 'Escape')     onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onDone]);

  // Focus moves to the primary action on open so the whole thing is operable
  // from the keyboard without hunting for it first.
  useEffect(() => { nextRef.current?.focus(); }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Step {index + 1} of {SLIDES.length}
          </span>
          {/* An explicit way out. Without one the only exits are finishing or
              guessing that Escape works. */}
          <button
            type="button"
            onClick={onDone}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label="Skip the walkthrough"
            title="Skip the walkthrough"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* A fixed aspect box: the source panels are not all the same height,
              and without this the dialog would jump as you advance. */}
          <div className="grid aspect-[49/48] w-full place-items-center bg-surface-sunken">
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              className="h-full w-full object-contain"
              // The first panel is what the student is waiting on; the rest are
              // prefetched a step ahead anyway.
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </div>

          <div className="px-5 py-4">
            <h2 id="onboarding-title" className="text-lg font-bold text-ink">{slide.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{slide.body}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {SLIDES.map((s, i) => (
              <span
                key={s.src}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  i === index ? 'w-5 bg-brand' : 'w-1.5 bg-line',
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={back}
              disabled={index === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={next}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {isLast ? <>Get started <Check className="h-4 w-4" /></>
                      : <>Next <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
