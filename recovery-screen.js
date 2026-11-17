// --- 💪 RECOVERY SCREEN (redesign "Body first", Nov 2026) ---
// A front/back body map colored by fatigue, a summary of the tapped muscle
// group, and a sorted list underneath. The fatigue numbers all come from
// processWorkoutHistory (recovery.js); this file only groups and draws them.

import React from 'react';
import { MUSCLES, getExercisesForMuscle } from './muscles.js';
import { processWorkoutHistory } from './recovery.js';
import { C, Card, SectionLabel, Icon, fatigueColor, fatigueLabel } from './ui.js';

const h = React.createElement;
const { useState, useMemo } = React;

// Every muscle the app tracks belongs to exactly one map region. A region reads
// as its most fatigued muscle, so one cooked head is never averaged away.
export const REGIONS = {
  traps:       { name: 'Upper traps',   views: ['front', 'back'], muscles: ['trapsUpper'] },
  sideDelts:   { name: 'Side delts',    views: ['front', 'back'], muscles: ['deltsMid'] },
  frontDelts:  { name: 'Front delts',   views: ['front'], muscles: ['deltsFront'] },
  chest:       { name: 'Chest',         views: ['front'], muscles: ['pectoralsUpper', 'pectoralsLower'] },
  biceps:      { name: 'Biceps',        views: ['front'], muscles: ['bicepsLong', 'bicepsShort', 'brachialis'] },
  forearms:    { name: 'Forearms',      views: ['front', 'back'], muscles: ['brachioradialis', 'forearms'] },
  abs:         { name: 'Abs',           views: ['front'], muscles: ['rectusAbdominis'] },
  obliques:    { name: 'Obliques',      views: ['front'], muscles: ['obliqueExternal', 'obliqueInternal', 'serratusAnterior'] },
  quads:       { name: 'Quads',         views: ['front'], muscles: ['vastusLateralis', 'vastusMedialis', 'rectusFemoris'] },
  adductors:   { name: 'Adductors',     views: ['front'], muscles: ['adductorMagnus', 'adductorLongus', 'adductorBrevis', 'gracilis', 'pectineus'] },
  calves:      { name: 'Calves',        views: ['front', 'back'], muscles: ['gastrocnemius', 'soleus'] },
  upperBack:   { name: 'Upper back',    views: ['back'], muscles: ['trapsMid', 'trapsLower', 'rhomboids'] },
  rearDelts:   { name: 'Rear delts',    views: ['back'], muscles: ['deltsRear'] },
  rotatorCuff: { name: 'Rotator cuff',  views: ['back'], muscles: ['infraspinatus', 'supraspinatus'] },
  lats:        { name: 'Lats',          views: ['back'], muscles: ['latsUpper', 'latsLower'] },
  triceps:     { name: 'Triceps',       views: ['back'], muscles: ['tricepsLong', 'tricepsLateral'] },
  lowerBack:   { name: 'Lower back',    views: ['back'], muscles: ['erectorSpinae'] },
  glutes:      { name: 'Glutes & hips', views: ['back'], muscles: ['glutesUpper', 'glutesLower', 'gluteMed', 'glutesMin', 'piriformis', 'TFL'] },
  hamstrings:  { name: 'Hamstrings',    views: ['back'], muscles: ['bicepsFemoris', 'semitendinosus'] }
};

// Drawing for each view, in a 200 x 400 box. Each shape is [region|null, kind, attrs];
// null is the body outline (head, hands, knees, feet) in the neutral color.
const MIRROR = (shapes) => shapes.flatMap(([r, kind, a]) => {
  const flip = { ...a };
  if ('cx' in a) flip.cx = 200 - a.cx;
  if ('x' in a) flip.x = 200 - a.x - a.width;
  return [[r, kind, a], [r, kind, flip]];
});

const SHARED_TOP = [
  [null, 'circle', { cx: 100, cy: 28, r: 20 }],
  [null, 'rect', { x: 90, y: 44, width: 20, height: 16, rx: 6 }]
];

const BODY = {
  front: [
    ...SHARED_TOP,
    ...MIRROR([
      ['traps', 'ellipse', { cx: 79, cy: 62, rx: 13, ry: 6 }],
      ['sideDelts', 'ellipse', { cx: 46, cy: 86, rx: 7, ry: 16 }],
      ['frontDelts', 'ellipse', { cx: 59, cy: 82, rx: 12, ry: 15 }],
      ['chest', 'rect', { x: 71, y: 69, width: 27, height: 35, rx: 11 }],
      ['biceps', 'ellipse', { cx: 48, cy: 124, rx: 10, ry: 22 }],
      ['forearms', 'ellipse', { cx: 41, cy: 172, rx: 9, ry: 24 }],
      [null, 'circle', { cx: 37, cy: 205, r: 8 }],
      ['obliques', 'ellipse', { cx: 74, cy: 141, rx: 8, ry: 27 }],
      ['quads', 'rect', { x: 66, y: 188, width: 26, height: 86, rx: 13 }],
      [null, 'rect', { x: 69, y: 277, width: 22, height: 12, rx: 6 }],
      ['calves', 'ellipse', { cx: 80, cy: 323, rx: 11, ry: 32 }],
      [null, 'ellipse', { cx: 80, cy: 367, rx: 12, ry: 7 }]
    ]),
    ['abs', 'rect', { x: 85, y: 108, width: 30, height: 68, rx: 10 }],
    ['adductors', 'rect', { x: 93, y: 190, width: 14, height: 46, rx: 7 }]
  ],
  back: [
    ...SHARED_TOP,
    ['traps', 'path', { d: 'M100 52 L128 68 L112 79 L88 79 L72 68 Z' }],
    ['upperBack', 'path', { d: 'M88 82 L112 82 L115 118 L100 136 L85 118 Z' }],
    ['lowerBack', 'rect', { x: 86, y: 139, width: 28, height: 36, rx: 9 }],
    ...MIRROR([
      ['sideDelts', 'ellipse', { cx: 46, cy: 86, rx: 7, ry: 16 }],
      ['rearDelts', 'ellipse', { cx: 59, cy: 82, rx: 12, ry: 15 }],
      ['rotatorCuff', 'ellipse', { cx: 76, cy: 96, rx: 8, ry: 10 }],
      ['lats', 'rect', { x: 66, y: 108, width: 18, height: 52, rx: 9 }],
      ['triceps', 'ellipse', { cx: 48, cy: 124, rx: 10, ry: 22 }],
      ['forearms', 'ellipse', { cx: 41, cy: 172, rx: 9, ry: 24 }],
      [null, 'circle', { cx: 37, cy: 205, r: 8 }],
      ['glutes', 'ellipse', { cx: 84, cy: 196, rx: 17, ry: 17 }],
      ['hamstrings', 'rect', { x: 68, y: 215, width: 26, height: 62, rx: 13 }],
      [null, 'rect', { x: 70, y: 280, width: 22, height: 10, rx: 5 }],
      ['calves', 'ellipse', { cx: 81, cy: 320, rx: 13, ry: 34 }],
      [null, 'ellipse', { cx: 81, cy: 367, rx: 12, ry: 7 }]
    ])
  ]
};

// One summary per region: its worst muscle, every muscle's reading, last trained.
export const summarizeRegions = (recoveryStatus) => {
  const out = {};
  for (const [id, region] of Object.entries(REGIONS)) {
    const muscles = region.muscles
      .filter(key => recoveryStatus && recoveryStatus[key])
      .map(key => ({ key, ...recoveryStatus[key] }));
    const fatigue = muscles.reduce((max, m) => Math.max(max, m.currentFatiguePercent || 0), 0);
    const lastTrained = muscles.reduce((latest, m) => (m.lastTrained && (!latest || m.lastTrained > latest) ? m.lastTrained : latest), null);
    out[id] = { id, name: region.name, views: region.views, fatigue, lastTrained, muscles };
  }
  return out;
};

const READY_BELOW = 40; // same line as getRecoveryColor's green

// Hours until the region drops under 40%, by re-running the app's own fatigue
// model at future times (binary search, 1-hour precision, up to a week).
const hoursUntilReady = (regionId, entries, sleepEntries, now) => {
  const muscles = REGIONS[regionId].muscles;
  const fatigueAt = (hours) => {
    const status = processWorkoutHistory(entries, sleepEntries, new Date(now.getTime() + hours * 3600000));
    return muscles.reduce((max, key) => Math.max(max, (status[key] && status[key].currentFatiguePercent) || 0), 0);
  };
  if (fatigueAt(0) < READY_BELOW) return 0;
  if (fatigueAt(168) >= READY_BELOW) return null;
  let lo = 0, hi = 168;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fatigueAt(mid) < READY_BELOW) hi = mid; else lo = mid;
  }
  return hi;
};

const readyText = (hours, now) => {
  if (hours === 0) return 'Ready to train';
  if (hours === null) return 'More than a week to recover';
  const when = new Date(now.getTime() + hours * 3600000);
  const sameDay = when.toDateString() === now.toDateString();
  const day = sameDay ? 'today' : when.toLocaleDateString('en-US', { weekday: 'short' });
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '').toLowerCase();
  return `Ready ${day} ~${time} (${hours} h)`;
};

const shortDay = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const BodyMap = ({ view, regions, selected, onSelect }) => {
  const summary = Object.values(regions)
    .filter(r => r.views.includes(view))
    .sort((a, b) => b.fatigue - a.fatigue)
    .slice(0, 3)
    .map(r => `${r.name} ${Math.round(r.fatigue)}%`)
    .join(', ');
  return h('svg', {
    viewBox: '0 0 200 400', width: 150, height: 300,
    role: 'img', 'aria-label': `${view === 'front' ? 'Front' : 'Back'} muscle map. Most fatigued: ${summary}`,
    style: { display: 'block', flex: 'none', touchAction: 'manipulation' }
  },
    BODY[view].map(([region, kind, attrs], i) => {
      const isSel = region && region === selected;
      return h(kind, {
        key: i,
        ...attrs,
        fill: region ? fatigueColor(regions[region].fatigue) : C.neutral,
        fillOpacity: region && selected && !isSel ? 0.55 : 1,
        stroke: isSel ? C.text : C.bg,
        strokeWidth: isSel ? 3 : 1.5,
        style: region ? { cursor: 'pointer', transition: 'fill-opacity .2s' } : undefined,
        onClick: region ? () => onSelect(region) : undefined
      });
    })
  );
};

const Legend = () =>
  h('div', { className: 'flex justify-center gap-4 text-xs text-ink-muted' },
    [['Fresh', C.good, 'under 40%'], ['Recovering', C.warn, '40–69%'], ['Rest', C.bad, '70%+']].map(([label, color, range]) =>
      h('span', { key: label, className: 'flex items-center gap-1.5' },
        h('span', { className: 'w-2.5 h-2.5 rounded-full', style: { background: color }, 'aria-hidden': 'true' }),
        `${label} `, h('span', { className: 'opacity-80' }, range)
      )
    )
  );

const Callout = ({ region, readyLine }) => {
  if (!region) {
    return h('div', { className: 'text-sm text-ink-muted leading-5 pt-2' },
      'Tap a muscle on the map, or a row below, to see how long until it’s fresh.');
  }
  const color = fatigueColor(region.fatigue);
  return h(Card, { padding: 'p-3.5', className: 'anim-fade-in', 'aria-live': 'polite' },
    h('div', { className: 'text-base font-extrabold leading-5' }, region.name),
    h('div', { className: 'text-[15px] font-extrabold mt-1', style: { color } },
      `${Math.round(region.fatigue)}% · ${fatigueLabel(region.fatigue)}`),
    h('div', { className: 'text-xs text-ink-muted mt-1 leading-4' },
      region.lastTrained ? `Trained ${shortDay(region.lastTrained)}` : 'Not trained in the last 10 days'),
    h('div', { className: 'text-xs font-bold mt-1.5 leading-4' }, readyLine)
  );
};

const RegionRow = ({ region, open, onToggle }) => {
  const color = fatigueColor(region.fatigue);
  const worst = [...region.muscles].sort((a, b) => b.currentFatiguePercent - a.currentFatiguePercent)[0];
  const recent = worst && worst.fatigueHistory
    ? worst.fatigueHistory.slice(-3).reverse()
    : [];
  const best = worst ? getExercisesForMuscle(worst.key, 60).slice(0, 4) : [];
  return h('div', { className: 'border-t border-ink-line first:border-t-0' },
    h('button', {
      type: 'button', onClick: onToggle, 'aria-expanded': open ? 'true' : 'false',
      className: `w-full flex items-center gap-2.5 py-3 text-left ${open ? 'text-accent' : ''}`
    },
      h('span', { className: 'w-2.5 h-2.5 rounded-full flex-none', style: { background: color }, 'aria-hidden': 'true' }),
      h('span', { className: 'flex-1 text-[15px] font-bold' }, region.name),
      h('span', { className: 'text-[13px] text-ink-muted' }, fatigueLabel(region.fatigue)),
      h('span', { className: 'w-11 text-right text-[15px] font-extrabold text-ink-text' }, `${Math.round(region.fatigue)}%`),
      h('span', { className: `transition-transform ${open ? 'rotate-90' : ''}` }, h(Icon, { name: 'chevronRight', size: 16, color: C.muted }))
    ),
    open && h('div', { className: 'pb-3.5 pl-5 pr-1 space-y-3 anim-fade-in' },
      region.muscles.length > 1 && h('div', { className: 'space-y-1' },
        [...region.muscles].sort((a, b) => b.currentFatiguePercent - a.currentFatiguePercent).map(m =>
          h('div', { key: m.key, className: 'flex justify-between text-[13px]' },
            h('span', { className: 'text-ink-muted' }, m.name),
            h('span', { className: 'font-bold', style: { color: fatigueColor(m.currentFatiguePercent) } }, `${Math.round(m.currentFatiguePercent)}%`)
          )
        )
      ),
      recent.length > 0 && h('div', null,
        h('div', { className: 'text-xs font-extrabold tracking-[.06em] text-ink-muted mb-1' }, 'RECENT TRAINING'),
        recent.map((r, i) => h('div', { key: i, className: 'flex justify-between text-[13px]' },
          h('span', null, r.exercise),
          h('span', { className: 'text-ink-muted' }, shortDay(r.date))
        ))
      ),
      best.length > 0 && h('div', null,
        h('div', { className: 'text-xs font-extrabold tracking-[.06em] text-ink-muted mb-1.5' }, 'BEST EXERCISES'),
        h('div', { className: 'flex flex-wrap gap-1.5' },
          best.map(ex => h('span', { key: ex.name, className: 'text-xs px-2.5 py-1 rounded-full bg-ink border border-ink-line' }, ex.name))
        )
      ),
      worst && MUSCLES[worst.key] && h('div', { className: 'text-xs text-ink-muted' },
        `Full recovery for ${worst.name} takes about ${MUSCLES[worst.key].hours} h after a hard session.`)
    )
  );
};

export const RecoveryScreen = ({ recoveryStatus, entries, sleepEntries, onLogSleep }) => {
  const [view, setView] = useState('front');
  const [selected, setSelected] = useState(null);
  const now = useMemo(() => new Date(), [recoveryStatus]);

  const regions = useMemo(() => summarizeRegions(recoveryStatus), [recoveryStatus]);
  const inView = Object.values(regions)
    .filter(r => r.views.includes(view))
    .sort((a, b) => b.fatigue - a.fatigue || a.name.localeCompare(b.name));

  const counts = Object.values(regions).reduce((acc, r) => {
    acc[r.fatigue >= 70 ? 'rest' : r.fatigue >= 40 ? 'recovering' : 'fresh'] += 1;
    return acc;
  }, { rest: 0, recovering: 0, fresh: 0 });

  const readyLine = useMemo(
    () => (selected ? readyText(hoursUntilReady(selected, entries, sleepEntries, now), now) : ''),
    [selected, entries, sleepEntries, now]
  );

  const cutoff = new Date(now.getTime() - 48 * 3600000);
  const hasRecentSleep = sleepEntries.some(s => {
    const [y, m, d] = String(s.date).split('-').map(Number);
    return new Date(y, m - 1, d) >= cutoff;
  });

  const switchView = (next) => {
    setView(next);
    if (selected && !REGIONS[selected].views.includes(next)) setSelected(null);
  };
  const toggle = (id) => setSelected(prev => (prev === id ? null : id));
  const selectedRegion = selected ? regions[selected] : null;

  return h('div', { className: 'flex flex-col gap-3.5' },
    !hasRecentSleep && h(Card, { padding: 'p-3.5', className: 'flex items-center gap-3' },
      h('span', { className: 'text-xl', 'aria-hidden': 'true' }, '💤'),
      h('div', { className: 'flex-1 text-[13px] text-ink-muted leading-5' },
        'No sleep in the last 2 days, so recovery uses baseline estimates.'),
      h('button', {
        type: 'button', onClick: onLogSleep,
        className: 'h-11 px-4 rounded-full border border-accent text-accent font-extrabold text-sm flex-none'
      }, 'Log sleep')
    ),

    h('div', { className: 'flex justify-center gap-2 text-[13px] font-bold' },
      [['rest', 'need rest', C.bad], ['recovering', 'recovering', C.warn], ['fresh', 'fresh', C.good]].map(([k, label, color]) =>
        h('span', { key: k, className: 'px-3 py-1.5 rounded-full bg-ink-card border border-ink-line' },
          h('span', { style: { color } }, counts[k]), ` ${label}`)
      )
    ),

    h('div', { className: 'grid grid-cols-2 h-11 p-1 rounded-full bg-ink-card border border-ink-line', role: 'group', 'aria-label': 'Body side' },
      ['front', 'back'].map(v => h('button', {
        key: v, type: 'button', 'aria-pressed': view === v ? 'true' : 'false', onClick: () => switchView(v),
        className: `rounded-full text-sm ${view === v ? 'bg-accent text-accent-on font-extrabold' : 'text-ink-text font-bold'}`
      }, v === 'front' ? 'Front' : 'Back'))
    ),

    h('div', { className: 'flex gap-3 items-start' },
      h(BodyMap, { view, regions, selected, onSelect: toggle }),
      h('div', { className: 'flex-1 min-w-0 pt-6' }, h(Callout, { region: selectedRegion, readyLine }))
    ),

    h(Legend),

    h(SectionLabel, null, view === 'front' ? 'FRONT MUSCLES' : 'BACK MUSCLES'),
    h(Card, { padding: 'px-4 py-1' },
      inView.map(r => h(RegionRow, { key: r.id, region: r, open: selected === r.id, onToggle: () => toggle(r.id) }))
    )
  );
};
