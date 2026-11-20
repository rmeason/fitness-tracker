// --- 🎨 UI KIT (redesign, Nov 2026) ---
// Small presentational pieces shared by the new screens: colors, icons, rings,
// cards, buttons. React only -- no app data, no localStorage -- so any screen can
// import it without dragging app.js along.

import React from 'react';

const h = React.createElement;
const { useState, useEffect } = React;

// The palette. Tailwind classes use the same values through the names set up in
// index.html (bg-ink, bg-ink-card, border-ink-line, text-ink-muted, bg-accent...).
// SVG strokes need the raw hex, which is what this object is for.
export const C = {
  bg: '#0D1320',
  card: '#161E2E',
  line: '#243049',
  key: '#1E2840',
  text: '#EEF2FA',
  muted: '#A3B0C7',
  accent: '#4C9BFF',
  onAccent: '#08111F',
  accentDeep: '#1C3B66',
  good: '#34D399',
  warn: '#FBBF24',
  bad: '#F87171',
  protein: '#4C9BFF',
  calories: '#FB923C',
  deep: '#4C9BFF',
  rem: '#8E7CF0',
  light: '#5B7DB8',
  neutral: '#2A3550'
};

// Same thresholds as recovery.js getRecoveryColor (>=70 red, >=40 yellow).
export const fatigueColor = (fatiguePercent) =>
  fatiguePercent >= 70 ? C.bad : fatiguePercent >= 40 ? C.warn : C.good;
export const fatigueLabel = (fatiguePercent) =>
  fatiguePercent >= 70 ? 'Rest' : fatiguePercent >= 40 ? 'Recovering' : 'Fresh';

// Honors the phone's Reduce Motion setting; index.html also turns transitions off.
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (
    (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion')) ||
    (!!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));

// --- Display preferences (this device only; not synced) ---
const UI_PREFS_KEY = 'hypertrophy-ui-prefs';
export const DEFAULT_UI_PREFS = { animations: true, celebrations: true, headerTapTop: true };
export const getUiPrefs = () => {
  try { return { ...DEFAULT_UI_PREFS, ...JSON.parse(localStorage.getItem(UI_PREFS_KEY) || '{}') }; }
  catch (e) { return { ...DEFAULT_UI_PREFS }; }
};
// Animations off adds .reduce-motion to <html>, which index.html uses to stop every
// animation and transition, the same as the phone's own Reduce Motion setting.
export const applyUiPrefs = (prefs = getUiPrefs()) => {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduce-motion', !prefs.animations);
};
export const saveUiPrefs = (prefs) => {
  try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  applyUiPrefs(prefs);
};

// --- Icons: inline stroke SVG paths, sized by the caller ---
export const ICONS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14'
};

export const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 2.2 }) =>
  h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
    strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
  }, h('path', { d: ICONS[name] || name }));

// --- Progress ring ---
// `pct` is 0..1 (clamped). It draws from 0 on mount so the ring fills once.
export const Ring = ({ size, pct, color, strokeWidth, track = C.line, label }) => {
  const sw = strokeWidth || Math.max(4, Math.round(size / 9));
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, Number(pct) || 0));
  const [shown, setShown] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(target); return undefined; }
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const o = size / 2;
  return h('svg', {
    width: size, height: size, viewBox: `0 0 ${size} ${size}`,
    role: label ? 'img' : undefined, 'aria-label': label, 'aria-hidden': label ? undefined : 'true',
    style: { display: 'block', flex: 'none' }
  },
    h('circle', { cx: o, cy: o, r, fill: 'none', stroke: track, strokeWidth: sw }),
    shown > 0 && h('circle', {
      cx: o, cy: o, r, fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round',
      strokeDasharray: `${(circ * shown).toFixed(1)} ${circ.toFixed(1)}`,
      transform: `rotate(-90 ${o} ${o})`,
      style: { transition: 'stroke-dasharray 0.9s cubic-bezier(.2,.8,.2,1)' }
    })
  );
};

// Ring with a big number and a small caption stacked in the middle.
export const RingStat = ({ size, pct, color, big, small, label }) =>
  h('div', { className: 'relative flex-none', style: { width: size, height: size } },
    h(Ring, { size, pct, color, label }),
    h('div', { className: 'absolute inset-0 flex flex-col items-center justify-center text-center', 'aria-hidden': 'true' },
      h('div', { className: 'font-extrabold leading-tight', style: { fontSize: Math.round(size / 5.2) } }, big),
      small && h('div', { className: 'text-xs text-ink-muted' }, small)
    )
  );

// --- Layout pieces ---
export const Card = ({ children, className = '', padding = 'p-4', ...rest }) =>
  h('div', { className: `bg-ink-card border border-ink-line rounded-3xl ${padding} ${className}`, ...rest }, children);

export const SectionLabel = ({ children }) =>
  h('div', { className: 'text-[13px] font-extrabold tracking-[.06em] text-ink-muted px-1 pt-1' }, children);

export const PillButton = ({ children, onClick, className = '', ...rest }) =>
  h('button', {
    type: 'button', onClick,
    className: `h-12 flex-1 rounded-full border border-ink-line bg-ink-card text-ink-text font-bold text-[15px] active:scale-[.98] transition-transform ${className}`,
    ...rest
  }, children);

export const PrimaryButton = ({ children, onClick, className = '', height = 56, ...rest }) =>
  h('button', {
    type: 'button', onClick,
    className: `w-full rounded-full bg-accent text-accent-on font-extrabold text-lg active:scale-[.98] transition-transform ${className}`,
    style: { height },
    ...rest
  }, children);

export const OutlineButton = ({ children, onClick, className = '', color = C.accent, ...rest }) =>
  h('button', {
    type: 'button', onClick,
    className: `h-12 w-full rounded-full border bg-transparent font-extrabold text-[15px] ${className}`,
    style: { borderColor: color, color },
    ...rest
  }, children);

// Round icon-only button with a required accessible name.
export const IconButton = ({ icon, label, onClick, size = 44, className = '' }) =>
  h('button', {
    type: 'button', onClick, 'aria-label': label,
    className: `flex-none flex items-center justify-center rounded-full border border-ink-line bg-ink-card text-ink-text ${className}`,
    style: { width: size, height: size }
  }, h(Icon, { name: icon }));

// A Settings section: a row with a summary that opens in place.
export const SettingsGroup = ({ id, emoji, title, summary, open, onToggle, danger = false, children }) =>
  h('section', { id: `settings-${id}`, className: 'bg-ink-card border border-ink-line rounded-3xl overflow-hidden scroll-mt-24' },
    h('button', {
      type: 'button', onClick: onToggle, 'aria-expanded': open ? 'true' : 'false',
      className: 'w-full min-h-[64px] flex items-center gap-3 px-4 py-3 text-left'
    },
      h('span', { className: 'text-[22px] w-8 text-center flex-none', 'aria-hidden': 'true' }, emoji),
      h('span', { className: 'flex-1 min-w-0' },
        h('span', { className: 'block text-base font-extrabold', style: danger ? { color: C.bad } : undefined }, title),
        summary && h('span', { className: 'block text-[13px] text-ink-muted truncate' }, summary)),
      h('span', { className: `flex-none transition-transform ${open ? 'rotate-90' : ''}` }, h(Icon, { name: 'chevronRight', size: 18, color: C.muted }))),
    open && h('div', { className: 'px-4 pb-4 pt-1 space-y-4 anim-fade-in' }, children));

export const Switch = ({ label, sub, on, onChange }) =>
  h('div', { className: 'flex items-center gap-3 min-h-[52px]' },
    h('span', { className: 'flex-1 min-w-0' },
      h('span', { className: 'block text-[15px] font-bold' }, label),
      sub && h('span', { className: 'block text-xs text-ink-muted' }, sub)),
    h('button', {
      type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, onClick: () => onChange(!on),
      className: 'w-[52px] h-8 flex-none rounded-full p-[3px] flex transition-colors',
      style: { background: on ? C.accent : C.neutral, justifyContent: on ? 'flex-end' : 'flex-start' }
    }, h('span', { className: 'w-[26px] h-[26px] rounded-full', style: { background: C.text } })));

// One tappable row in a list card: emoji, title/subtitle, value, chevron.
export const ListRow = ({ emoji, title, sub, value, onClick, first = false }) =>
  h('button', {
    type: 'button', onClick,
    className: `w-full flex items-center gap-3.5 py-3.5 px-1 text-left ${first ? '' : 'border-t border-ink-line'}`
  },
    h('span', { className: 'text-2xl w-8 text-center flex-none', 'aria-hidden': 'true' }, emoji),
    h('span', { className: 'flex-1 min-w-0' },
      h('span', { className: 'block text-[15px] font-bold' }, title),
      sub && h('span', { className: 'block text-[13px] text-ink-muted truncate' }, sub)
    ),
    value && h('span', { className: 'text-[17px] font-extrabold flex-none' }, value),
    h(Icon, { name: 'chevronRight', size: 18, color: C.muted, strokeWidth: 2 })
  );

// Horizontal sleep-stage bar. Shows light/REM/deep when the entry has them,
// otherwise deep vs the rest of the night (typed entries only carry deep %).
export const StageBar = ({ segments }) =>
  h('div', { className: 'flex h-3 rounded-md overflow-hidden gap-0.5', 'aria-hidden': 'true' },
    segments.filter(s => s.minutes > 0).map(s =>
      h('div', { key: s.label, style: { flexGrow: s.minutes, flexBasis: 0, background: s.color } })
    )
  );

export const formatMinutes = (mins) => {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// "Pull/Triceps" -> "Pull / Triceps", "REST" -> "Rest day".
export const formatWorkoutName = (type) => {
  if (!type) return 'Workout';
  if (type === 'REST') return 'Rest day';
  return String(type).split('/').map(s => s.trim()).join(' / ');
};
