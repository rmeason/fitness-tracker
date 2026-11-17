// --- 🏠 HOME SCREEN (redesign "Focus", Nov 2026) ---
// Presentational only: App works out every number and hands it in. Nothing here
// reads localStorage or does training arithmetic, so the screen can't drift from
// the rest of the app.

import React from 'react';
import { C, Card, SectionLabel, PillButton, RingStat, ListRow, StageBar, formatMinutes } from './ui.js';

const h = React.createElement;

const fmt = (n) => Number(n || 0).toLocaleString();

// hero: { kicker, title, note, isRest, done, doneDetail, next }
const Hero = ({ hero, onStart, onEditToday, onAddMeal, onSleep, sleepButtonLabel }) =>
  h('section', { className: 'flex flex-col items-center text-center px-2 pt-6 pb-2', 'aria-label': 'Today' },
    h('div', { className: 'text-[13px] font-extrabold tracking-[.06em] text-accent' }, hero.kicker),
    h('h1', { className: 'text-[40px] leading-[44px] font-extrabold mt-1.5 break-words max-w-full' }, hero.title),
    hero.note && h('p', { className: 'text-[15px] leading-[22px] text-ink-muted mt-2.5 max-w-[330px]' }, hero.note),

    hero.done
      ? h('div', { className: 'flex flex-col items-center gap-3 mt-5 w-full' },
          h('div', {
            className: 'w-[120px] h-[120px] rounded-full border-[6px] border-accent-deep bg-ink-card flex flex-col items-center justify-center',
            'aria-label': hero.doneDetail
          },
            h('span', { className: 'text-[34px]', 'aria-hidden': 'true' }, '✅'),
            h('span', { className: 'text-sm font-extrabold' }, 'Logged')
          ),
          h('div', { className: 'text-[15px] font-bold' }, hero.doneDetail),
          h('button', {
            type: 'button', onClick: onEditToday,
            className: 'h-11 px-5 rounded-full border border-accent text-accent font-extrabold text-[15px]'
          }, 'View or edit')
        )
      : h('button', {
          type: 'button', onClick: onStart,
          className: 'mt-6 w-[168px] h-[168px] rounded-full border-[6px] border-accent-deep bg-accent text-accent-on font-extrabold text-[22px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform start-pulse'
        },
          h('span', { className: 'text-[40px] leading-none', 'aria-hidden': 'true' }, hero.isRest ? '😴' : '💪'),
          hero.isRest ? 'Log rest' : 'Start'
        ),

    hero.next && h('div', { className: 'text-[13px] text-ink-muted mt-3' }, hero.next),

    h('div', { className: 'flex gap-2.5 mt-5 w-full' },
      h(PillButton, { onClick: onAddMeal }, '🍽️ Add meal'),
      h(PillButton, { onClick: onSleep }, sleepButtonLabel)
    )
  );

// protein / calories: { value, target } -- target null means no goal set.
const NutritionRings = ({ protein, calories, onOpen }) => {
  const ringCard = (key, emoji, name, value, target, unit, color) => {
    const hasTarget = Number(target) > 0;
    const pct = hasTarget ? value / target : 0;
    const left = hasTarget ? target - value : null;
    const caption = !hasTarget ? 'No target set'
      : left > 0 ? `${fmt(left)}${unit === 'g' ? ' g' : ''} to go` : 'Target met';
    return h(Card, { key, padding: 'p-4' },
      h('button', {
        type: 'button', onClick: onOpen,
        className: 'w-full flex flex-col items-center gap-1.5',
        'aria-label': `${name}: ${fmt(value)}${unit === 'g' ? ' grams' : ''}${hasTarget ? ` of ${fmt(target)}` : ''}. ${caption}`
      },
        h(RingStat, {
          size: 104, pct, color,
          big: unit === 'g' ? `${fmt(value)}g` : fmt(value),
          small: hasTarget ? `of ${fmt(target)}${unit === 'g' ? 'g' : ''}` : 'eaten'
        }),
        h('div', { className: 'text-sm font-bold' }, `${emoji} ${name}`),
        h('div', { className: 'text-xs font-bold', style: { color: hasTarget && left <= 0 ? C.good : C.muted } }, caption)
      )
    );
  };
  return h('div', { className: 'grid grid-cols-2 gap-3' },
    ringCard('p', '🥩', 'Protein', protein.value, protein.target, 'g', C.protein),
    ringCard('c', '🔥', 'Calories eaten', calories.value, calories.target, 'kcal', C.calories)
  );
};

// sleep: { minutes, deepMinutes, deepPercent, segments, verdict: { label, color } } or null
const SleepCard = ({ sleep, onLog }) => {
  if (!sleep) {
    return h(Card, null,
      h('div', { className: 'flex items-center gap-3' },
        h('span', { className: 'text-2xl', 'aria-hidden': 'true' }, '🌙'),
        h('div', { className: 'flex-1' },
          h('div', { className: 'text-[15px] font-bold' }, 'No sleep logged for last night'),
          h('div', { className: 'text-[13px] text-ink-muted' }, 'Sleep sets how much volume today can take')
        ),
        h('button', {
          type: 'button', onClick: onLog,
          className: 'h-11 px-4 rounded-full border border-accent text-accent font-extrabold text-sm flex-none'
        }, 'Log it')
      )
    );
  }
  const legend = sleep.segments.filter(s => s.minutes > 0);
  return h(Card, null,
    h('div', { className: 'flex justify-between items-baseline' },
      h('span', { className: 'text-[15px] font-bold' }, '🌙 Sleep'),
      h('span', { className: 'text-xs font-extrabold', style: { color: sleep.verdict.color } }, sleep.verdict.label)
    ),
    h('div', { className: 'text-[28px] font-extrabold leading-[34px]' }, formatMinutes(sleep.minutes)),
    h('div', { className: 'mt-2.5' }, h(StageBar, { segments: sleep.segments })),
    h('div', { className: 'flex justify-between text-xs text-ink-muted mt-2' },
      legend.map(s => h('span', { key: s.label, className: 'flex items-center gap-1.5' },
        h('span', { className: 'w-2 h-2 rounded-full', style: { background: s.color }, 'aria-hidden': 'true' }),
        `${s.label} ${formatMinutes(s.minutes)}`
      ))
    )
  );
};

export const HomeScreen = (props) => {
  const { hero, protein, calories, sleep, weight, recovery, records, hasLoggedToday } = props;
  return h('div', { className: 'flex flex-col gap-3.5' },
    h(Hero, {
      hero,
      onStart: props.onStart,
      onEditToday: props.onEditToday,
      onAddMeal: props.onAddMeal,
      onSleep: props.onSleep,
      sleepButtonLabel: props.sleepButtonLabel
    }),
    h(SectionLabel, null, 'TODAY'),
    h(NutritionRings, { protein, calories, onOpen: props.onOpenLog }),
    h(SleepCard, { sleep, onLog: props.onSleep }),
    h(Card, { padding: 'px-3 py-1' },
      h(ListRow, {
        first: true, emoji: '⚖️', title: 'Weight',
        value: weight.value ? `${weight.value} lb` : '—',
        sub: weight.sub,
        onClick: props.onOpenCharts
      }),
      h(ListRow, {
        emoji: '💪', title: 'Recovery',
        value: recovery.pct === null ? '—' : `${Math.round(recovery.pct)}%`,
        sub: recovery.sub,
        onClick: props.onOpenRecovery
      }),
      h(ListRow, {
        emoji: '🏆', title: 'Personal records',
        value: records.value, sub: records.sub,
        onClick: props.onOpenRecords
      }),
      h(ListRow, {
        emoji: '🤖', title: 'AI workout suggestion',
        sub: hasLoggedToday ? 'Plan your next session' : "Build today's session from your recovery",
        onClick: props.onOpenAI
      })
    )
  );
};
