import { useState } from 'react';
import {
  Sparkles, ChevronLeft, ChevronRight, CalendarCheck, Flame, Tags,
  Wrench, Mountain, Compass,
} from 'lucide-react';
import { useRecap, type InternshipRecap as Recap } from '@/hooks/useRecap';

/**
 * End-of-internship recap — a short sequence of cards built ONLY from what the
 * student wrote themselves. No score, no grade, no supervisor assessment ever
 * reaches this component; the endpoint behind it cannot read them.
 *
 * Designed for the low-data path first: a student with three entries gets a
 * coherent sequence, because every card that has nothing to say is dropped
 * before render rather than shown empty.
 *
 * Animation is CSS only (opacity + translate on mount) — this runs on low-end
 * devices over unreliable connections.
 */

interface Card {
  key: string;
  icon: React.ElementType;
  eyebrow: string;
  headline: React.ReactNode;
  body?: React.ReactNode;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }) : null;

function buildCards(r: Recap): Card[] {
  const cards: Card[] = [];
  const span = fmtDate(r.firstEntryDate) && fmtDate(r.lastEntryDate)
    ? `${fmtDate(r.firstEntryDate)} — ${fmtDate(r.lastEntryDate)}`
    : null;

  cards.push({
    key: 'entries',
    icon: CalendarCheck,
    eyebrow: 'Your attachment',
    headline: r.totalEntries === 0
      ? 'You finished your attachment.'
      : <>You logged <strong>{r.totalEntries}</strong> day{r.totalEntries === 1 ? '' : 's'} across{' '}
        <strong>{r.weeksCovered}</strong> week{r.weeksCovered === 1 ? '' : 's'}.</>,
    body: span ?? 'Your logbook is closed and signed off.',
  });

  // Consistency only says something once there is a run worth naming.
  if (r.longestOnTimeStreak >= 2) {
    cards.push({
      key: 'streak',
      icon: Flame,
      eyebrow: 'Consistency',
      headline: <>Your longest run was <strong>{r.longestOnTimeStreak}</strong> weeks in a row, submitted on time.</>,
      body: r.daysOnTime > 0
        ? `${r.daysOnTime} of your ${r.totalEntries} entries were written on the day itself.`
        : undefined,
    });
  } else if (r.daysOnTime > 0) {
    cards.push({
      key: 'streak',
      icon: Flame,
      eyebrow: 'Consistency',
      headline: <><strong>{r.daysOnTime}</strong> of your {r.totalEntries} entr{r.totalEntries === 1 ? 'y was' : 'ies were'} written on the day itself.</>,
      body: 'Writing it the same day is the hardest part of a logbook.',
    });
  }

  if (r.themes.length > 0) {
    cards.push({
      key: 'themes',
      icon: Tags,
      eyebrow: 'What you kept coming back to',
      headline: <>{r.themes[0].tag} showed up in <strong>{r.themes[0].count}</strong> of your activities.</>,
      body: (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.themes.map((t) => (
            <span
              key={t.tag}
              className="rounded-full bg-[var(--h-e1e8ff)] px-3 py-1 text-xs font-semibold text-[var(--h-15157d)]"
            >
              {t.tag} · {t.count}
            </span>
          ))}
        </div>
      ),
    });
  }

  if (r.skills.length > 0) {
    cards.push({
      key: 'skills',
      icon: Wrench,
      eyebrow: 'Skills you picked up',
      headline: r.skills.length === 1
        ? 'One skill you wrote down:'
        : <>You recorded <strong>{r.skills.length}</strong> different things you learned.</>,
      body: (
        <ul className="mt-3 space-y-2 text-left">
          {r.skills.map((s, i) => (
            <li key={i} className="rounded-lg bg-[var(--h-f8f9fc)] px-3 py-2 text-sm text-[var(--h-464652)]">
              {s}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // Challenges are surfaced for reflection, never as judgment.
  if (r.challenges.length > 0) {
    cards.push({
      key: 'challenges',
      icon: Mountain,
      eyebrow: 'What you found hard',
      headline: 'In your own words:',
      body: (
        <ul className="mt-3 space-y-2 text-left">
          {r.challenges.map((c, i) => (
            <li
              key={i}
              className="border-l-2 border-[var(--h-8a4cfc)] bg-[var(--h-f8f9fc)] px-3 py-2 text-sm italic text-[var(--h-464652)]"
            >
              “{c}”
            </li>
          ))}
        </ul>
      ),
    });
  }

  cards.push({
    key: 'forward',
    icon: Compass,
    eyebrow: 'What comes next',
    headline: 'Which part of this would you want to do more of?',
    body: 'Your logbook is the record of what you actually did — the best answer to that question is already in it.',
  });

  return cards;
}

/**
 * A worked example, shown before a student's own recap unlocks so the page can
 * say what is coming rather than only that it is locked. Ghanaian placement
 * data, per the project's demo-data convention.
 */
export const SAMPLE_RECAP: Recap = {
  totalEntries: 42,
  weeksCovered: 8,
  totalWeeksInAttachment: 8,
  daysOnTime: 35,
  longestOnTimeStreak: 5,
  themes: [
    { tag: 'Teamwork', count: 14 },
    { tag: 'Problem Solving', count: 11 },
    { tag: 'Technical Writing', count: 7 },
    { tag: 'Testing', count: 6 },
    { tag: 'Communication', count: 4 },
  ],
  skills: [
    'Configured the branch router and documented the address plan',
    'Ran the month-end reconciliation with the accounts officer',
    'Wrote the handover notes for the stock-taking process',
  ],
  challenges: [
    'The first week I did not understand the filing system and kept asking the same questions.',
    'Explaining a delay to a client on the phone was harder than doing the actual work.',
  ],
  firstEntryDate: '2026-02-02',
  lastEntryDate: '2026-03-27',
};

export function InternshipRecap({ enabled, sample = false }: { enabled: boolean; sample?: boolean }) {
  const { data, isLoading } = useRecap(enabled && !sample);
  const [index, setIndex] = useState(0);

  const source = sample ? SAMPLE_RECAP : data?.recap;
  if (!sample && (!enabled || isLoading || !data?.available || !source)) return null;
  if (!source) return null;

  const cards = buildCards(source);
  const card = cards[Math.min(index, cards.length - 1)];
  const Icon = card.icon;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--h-d3c4ff)] bg-gradient-to-br from-[var(--h-f6f1ff)] to-[var(--h-eef1ff)] p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--h-712ae2)]" />
        <h2 className="text-sm font-bold text-[var(--h-712ae2)]">
          {sample ? 'Example — what your recap will look like' : 'Your internship, wrapped'}
        </h2>
        {sample && (
          <span className="ml-auto rounded-full bg-[var(--h-fff4e0)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--h-9a6700)]">
            Sample data
          </span>
        )}
      </div>

      {/* key on the card so remounting replays the CSS transition */}
      <div key={card.key} className="animate-[recapIn_320ms_ease-out] text-center">
        <Icon className="mx-auto mb-3 h-8 w-8 text-[var(--h-8a4cfc)]" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--h-757684)]">
          {card.eyebrow}
        </p>
        <p className="mx-auto mt-1 max-w-lg text-lg font-bold leading-snug text-[var(--h-0b1c30)]">
          {card.headline}
        </p>
        {card.body && (
          <div className="mx-auto mt-2 max-w-lg text-sm text-[var(--h-464652)]">{card.body}</div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--h-ffffff)] text-[var(--h-15157d)] shadow-sm transition-opacity disabled:opacity-30"
          aria-label="Previous card"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5" role="tablist" aria-label="Recap cards">
          {cards.map((c, i) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={c.eyebrow}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? 'w-6 bg-[var(--h-712ae2)]' : 'w-1.5 bg-[var(--h-d3c4ff)]'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(cards.length - 1, i + 1))}
          disabled={index >= cards.length - 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--h-ffffff)] text-[var(--h-15157d)] shadow-sm transition-opacity disabled:opacity-30"
          aria-label="Next card"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
