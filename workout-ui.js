// --- 🏋️ WORKOUT SCREEN PIECES (redesign, Nov 2026) ---
// Presentational parts of the workout flow: exercise cards, the number keypad,
// the rest timer, the record celebration and the finish summary. LogEntryForm in
// app.js owns all state and does all arithmetic; these only draw and report taps.

import React from 'react';
import { C, Card, Icon, Ring, prefersReducedMotion } from './ui.js';

const h = React.createElement;
const { useState, useEffect, useRef } = React;

const fmtNum = (n) => Number(n || 0).toLocaleString();
export const fmtClock = (secs) => {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const isBlank = (v) => v === '' || v === null || v === undefined;

// --- Bottom sheet: overlay + panel, Escape closes, page behind doesn't scroll ---
export const Sheet = ({ label, onClose, children, className = '' }) => {
  const panelRef = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    const first = panelRef.current && panelRef.current.querySelector('button, input, select, textarea');
    if (first) first.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, []);
  return h('div', { className: 'fixed inset-0 z-50', role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('button', {
      type: 'button', tabIndex: -1, 'aria-label': 'Close', onClick: onClose,
      className: 'absolute inset-0 w-full h-full bg-black/70 anim-fade-in'
    }),
    h('div', {
      ref: panelRef,
      className: `absolute left-0 right-0 bottom-0 mx-auto max-w-2xl max-h-[90vh] overflow-y-auto bg-ink-card border-t border-ink-line rounded-t-[28px] px-4 pt-2.5 anim-sheet-in ${className}`,
      style: { paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }
    },
      h('div', { className: 'w-11 h-[5px] rounded-full bg-ink-line mx-auto mb-3', 'aria-hidden': 'true' }),
      children
    )
  );
};

const SheetHeader = ({ title, sub, onClose }) =>
  h('div', { className: 'flex items-center gap-3 mb-3' },
    h('div', { className: 'flex-1 min-w-0' },
      h('div', { className: 'text-xl font-extrabold leading-6' }, title),
      sub && h('div', { className: 'text-[13px] text-ink-muted mt-0.5' }, sub)
    ),
    h('button', {
      type: 'button', onClick: onClose, 'aria-label': 'Close',
      className: 'w-11 h-11 flex-none rounded-full border border-ink-line bg-ink flex items-center justify-center'
    }, h(Icon, { name: 'close', size: 18 }))
  );

// --- Session bar: what you're doing, how long, how far through ---
export const SessionBar = ({ typeLabel, dateLabel, elapsed, doneSets, totalSets, suggestedSets, onDetails, onClose, onFinish }) => {
  const pct = totalSets > 0 ? Math.min(100, (doneSets / totalSets) * 100) : 0;
  return h('div', { className: 'flex flex-col gap-3' },
    h('div', { className: 'flex items-center gap-2.5' },
      h('button', {
        type: 'button', onClick: onClose, 'aria-label': 'Close workout (it stays saved as a draft)',
        className: 'w-11 h-11 flex-none rounded-full border border-ink-line bg-ink-card flex items-center justify-center'
      }, h(Icon, { name: 'chevronLeft', size: 20 })),
      h('button', {
        type: 'button', onClick: onDetails,
        className: 'flex-1 min-w-0 text-center'
      },
        h('div', { className: 'text-[17px] font-extrabold truncate' }, typeLabel, ' ', h('span', { className: 'text-ink-muted text-sm' }, '▾')),
        h('div', { className: 'text-xs text-ink-muted truncate' }, [dateLabel, elapsed !== null ? `⏱ ${fmtClock(elapsed)}` : null].filter(Boolean).join(' · '))
      ),
      h('button', {
        type: 'button', onClick: onFinish,
        className: 'h-11 px-5 flex-none rounded-full border border-accent text-accent font-extrabold text-[15px]'
      }, 'Finish')
    ),
    totalSets > 0 && h('div', { className: 'flex flex-col gap-2 px-1' },
      h('div', { className: 'flex justify-between text-[13px] text-ink-muted' },
        h('span', null, h('b', { className: 'text-ink-text font-extrabold' }, `${doneSets} of ${totalSets}`), ' working sets'),
        suggestedSets ? h('span', null, `Sleep supports about ${suggestedSets}`) : null
      ),
      h('div', {
        className: 'h-2 rounded-full bg-ink-line overflow-hidden', role: 'progressbar',
        'aria-valuemin': 0, 'aria-valuemax': totalSets, 'aria-valuenow': doneSets, 'aria-label': 'Sets done'
      },
        h('div', { className: 'h-full rounded-full bg-accent', style: { width: `${pct}%`, transition: 'width .4s ease' } })
      )
    )
  );
};

// --- One exercise ---
const GRID = { display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 72px 60px 44px', gap: 8, alignItems: 'center' };

const Badge = ({ children, bg, fg, size = 36 }) =>
  h('span', {
    className: 'flex-none rounded-full flex items-center justify-center font-extrabold',
    style: { width: size, height: size, background: bg, color: fg, fontSize: size > 30 ? 15 : 13 }
  }, children);

const lastText = (s, eachHand) => (s ? `${fmtNum(s.weight)}${eachHand ? '/h' : ''} × ${s.reps}` : '—');

// ex: { name, weights[], reps[], rpe, eachHand, done[] }
// last: [{ weight, reps }] from the previous time, best: number (all-time top weight) or 0
export const ExerciseCard = ({
  index, ex, active, last, best, currentSet, prSets,
  onActivate, onCell, onToggleDone, onAddSet, onCopyWeight, onRpe, onStartRest, restRunning, onOptions, coach
}) => {
  const sets = ex.reps.length;
  const doneCount = (ex.done || []).filter(Boolean).length;
  const allDone = sets > 0 && doneCount === sets;
  const name = ex.name || 'Unnamed exercise';

  if (!active) {
    let line;
    if (doneCount > 0) {
      const top = ex.reps.reduce((acc, r, i) => {
        if (!(ex.done || [])[i]) return acc;
        const w = Number(ex.weights[i]) || 0;
        return !acc || w > acc.w || (w === acc.w && Number(r) > acc.r) ? { w, r: Number(r) || 0 } : acc;
      }, null);
      line = `${doneCount} of ${sets} sets · top set ${fmtNum(top.w)} × ${top.r}`;
    } else {
      line = `${sets} set${sets === 1 ? '' : 's'}${last && last.length ? ` · last ${lastText(last[Math.min(1, last.length - 1)], ex.eachHand)}` : ''}`;
    }
    return h(Card, { padding: 'p-3.5' },
      h('button', { type: 'button', onClick: onActivate, className: 'w-full flex items-center gap-3 text-left' },
        h(Badge, { bg: allDone ? C.good : C.key, fg: allDone ? C.onAccent : C.text },
          allDone ? h(Icon, { name: 'check', size: 18, strokeWidth: 3 }) : index + 1),
        h('span', { className: 'flex-1 min-w-0' },
          h('span', { className: 'block text-[17px] font-extrabold truncate' }, name),
          h('span', { className: 'block text-[13px] text-ink-muted truncate' }, line),
          prSets && prSets.length > 0 && h('span', { className: 'block text-[13px] font-bold' }, `🏆 New record: ${fmtNum(prSets[prSets.length - 1])} lb`)
        ),
        h(Icon, { name: 'chevronRight', size: 18, color: C.muted, strokeWidth: 2 })
      )
    );
  }

  const head = (t, extra = '') => h('span', { className: `text-[11px] font-extrabold tracking-[.06em] text-ink-muted ${extra}` }, t);
  const cell = (i, field, value, hint) => {
    const isCur = i === currentSet;
    return h('button', {
      type: 'button', onClick: () => onCell(i, field),
      'aria-label': `${field === 'weight' ? 'Weight' : 'Reps'} for set ${i + 1}${isBlank(value) ? '' : `, ${value}`}`,
      className: 'h-11 rounded-[14px] bg-ink text-[17px] font-extrabold',
      style: { border: `1px solid ${isCur ? C.accent : C.line}` }
    }, isBlank(value)
      ? h('span', { className: 'text-ink-muted font-bold' }, hint === undefined || hint === null ? '–' : hint)
      : value);
  };

  return h(Card, { padding: 'p-4', className: 'flex flex-col gap-3.5', style: { borderColor: C.accent } },
    h('div', { className: 'flex items-center gap-3' },
      h(Badge, { bg: C.accent, fg: C.onAccent }, index + 1),
      h('div', { className: 'flex-1 min-w-0' },
        h('div', { className: 'text-lg font-extrabold leading-[22px]' }, name),
        h('div', { className: 'text-[13px] text-ink-muted' },
          [ex.eachHand ? 'Weight per hand' : null, best > 0 ? `🏆 Best ${fmtNum(best)} lb` : 'No record yet'].filter(Boolean).join(' · '))
      ),
      h('button', {
        type: 'button', onClick: onOptions, 'aria-label': `Options for ${name}`,
        className: 'w-11 h-11 flex-none rounded-full border border-ink-line bg-ink flex items-center justify-center text-lg font-extrabold'
      }, '⋯')
    ),
    coach,
    h('div', null,
      h('div', { style: { ...GRID, paddingBottom: 4 } },
        head('SET', 'text-center'), head('LAST TIME'), head(ex.eachHand ? 'LB/HAND' : 'LB', 'text-center'), head('REPS', 'text-center'), head('DONE', 'text-center')),
      ex.reps.map((r, i) => {
        const done = !!(ex.done || [])[i];
        const isCur = i === currentSet;
        const prev = last && last[i];
        const pr = prSets && prSets.includes(Number(ex.weights[i])) && done;
        return h('div', { key: i, style: { ...GRID, padding: '6px 0', position: 'relative' } },
          h(Badge, { size: 28, bg: isCur ? C.accent : C.key, fg: isCur ? C.onAccent : C.text }, pr ? '🏆' : i + 1),
          h('span', { className: 'text-[13px] text-ink-muted truncate' }, lastText(prev, ex.eachHand)),
          cell(i, 'weight', ex.weights[i], prev ? prev.weight : null),
          cell(i, 'reps', r, prev ? prev.reps : null),
          h('button', {
            type: 'button', onClick: () => onToggleDone(i),
            'aria-pressed': done ? 'true' : 'false', 'aria-label': done ? `Set ${i + 1} done` : `Mark set ${i + 1} done`,
            className: 'w-11 h-11 rounded-full flex items-center justify-center transition-colors',
            style: done ? { background: C.good, color: C.onAccent } : { border: `1px solid ${C.line}`, color: C.muted }
          }, h(Icon, { name: 'check', size: 22, strokeWidth: done ? 2.8 : 2.4 }))
        );
      })
    ),
    h('div', { className: 'flex gap-2' },
      h('button', { type: 'button', onClick: onAddSet, className: 'flex-1 h-11 rounded-full border border-ink-line font-bold text-sm' }, '＋ Add set'),
      h('button', { type: 'button', onClick: onCopyWeight, className: 'flex-1 h-11 rounded-full border border-ink-line font-bold text-sm' }, '📋 Copy weight')
    ),
    h(RpeChips, { value: ex.rpe, onChange: onRpe }),
    h('button', {
      type: 'button', onClick: onStartRest, disabled: restRunning,
      className: `h-12 w-full rounded-full border font-extrabold text-[15px] ${restRunning ? 'border-ink-line text-ink-muted' : 'border-accent text-accent'}`
    }, restRunning ? '⏱ Rest timer running' : '⏱ Start rest')
  );
};

// RPE 5-10 with a half-point toggle, matching the old slider's 0.5 steps.
const RpeChips = ({ value, onChange }) => {
  const v = Number(value) || 8;
  const whole = Math.floor(v);
  const half = v - whole >= 0.5;
  const chip = (n) => {
    const on = whole === n;
    return h('button', {
      key: n, type: 'button', 'aria-pressed': on ? 'true' : 'false',
      onClick: () => onChange(n + (half && n < 10 ? 0.5 : 0)),
      className: 'flex-1 h-11 rounded-full font-extrabold text-[15px]',
      style: on ? { background: C.accent, color: C.onAccent, border: `1px solid ${C.accent}` } : { border: `1px solid ${C.line}` }
    }, n);
  };
  return h('div', null,
    h('div', { className: 'text-[13px] font-bold text-ink-muted mb-2' },
      'How hard was it? RPE ', h('span', { className: 'text-ink-text' }, String(v))),
    h('div', { className: 'flex gap-1.5' },
      [5, 6, 7, 8, 9, 10].map(chip),
      h('button', {
        type: 'button', 'aria-pressed': half ? 'true' : 'false', 'aria-label': 'Add a half point',
        disabled: whole >= 10,
        onClick: () => onChange(half ? whole : Math.min(10, whole + 0.5)),
        className: 'flex-1 h-11 rounded-full font-extrabold text-[15px] disabled:opacity-40',
        style: half ? { background: C.accentDeep, border: `1px solid ${C.accent}` } : { border: `1px solid ${C.line}` }
      }, '½')
    )
  );
};

// --- Number keypad for one set ---
export const KeypadSheet = ({ title, sub, weight, reps, field, eachHand, prText, onField, onKey, onChip, onSave, onClose }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  const fieldBtn = (f, label, value, unit) => {
    const on = field === f;
    return h('button', {
      type: 'button', onClick: () => onField(f), 'aria-pressed': on ? 'true' : 'false',
      className: 'flex-1 h-[76px] rounded-[20px] bg-ink flex flex-col items-center justify-center gap-0.5',
      style: { border: `${on ? 2 : 1}px solid ${on ? C.accent : C.line}` }
    },
      h('span', { className: 'text-xs font-extrabold tracking-[.06em]', style: { color: on ? C.accent : C.muted } }, label),
      h('span', { className: 'text-[32px] font-extrabold leading-9', 'aria-live': on ? 'polite' : undefined },
        isBlank(value) ? h('span', { className: 'text-ink-muted' }, '–') : value,
        unit && h('span', { className: 'text-[15px] text-ink-muted font-bold' }, ` ${unit}`))
    );
  };
  const chips = field === 'weight' ? [['−5', -5], ['+5', 5], ['+10', 10]] : [['−1', -1], ['+1', 1], ['+2', 2]];
  return h(Sheet, { label: title, onClose },
    h(SheetHeader, { title, sub, onClose }),
    h('div', { className: 'flex flex-col gap-3' },
      h('div', { className: 'flex gap-2.5' },
        fieldBtn('weight', eachHand ? 'WEIGHT / HAND' : 'WEIGHT', weight, 'lb'),
        fieldBtn('reps', 'REPS', reps, '')
      ),
      h('div', { className: 'flex gap-1.5' },
        chips.map(([t, d]) => h('button', {
          key: t, type: 'button', onClick: () => onChip(d),
          className: 'flex-1 h-11 rounded-full border border-ink-line font-extrabold text-sm'
        }, t)),
        h('button', {
          type: 'button', onClick: () => onChip('same'),
          className: 'flex-[1.6] h-11 rounded-full border border-ink-line font-extrabold text-sm'
        }, 'Same as last')
      ),
      prText && h('div', {
        className: 'flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-ink anim-fade-in',
        style: { border: `1px solid ${C.warn}` }, role: 'status'
      }, h('span', { className: 'text-xl', 'aria-hidden': 'true' }, '🏆'), h('span', { className: 'text-sm font-bold' }, prText)),
      h('div', { className: 'grid grid-cols-3 gap-2' },
        keys.map(k => h('button', {
          key: k, type: 'button', onClick: () => onKey(k),
          'aria-label': k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k,
          className: 'h-[52px] rounded-[18px] bg-ink-key text-2xl font-extrabold active:bg-ink-line'
        }, k))
      ),
      h('div', { className: 'flex gap-2.5' },
        h('button', {
          type: 'button', onClick: () => onSave(true),
          className: 'flex-1 h-14 rounded-full border border-accent text-accent font-extrabold text-base'
        }, 'Save + rest ⏱'),
        h('button', {
          type: 'button', onClick: () => onSave(false),
          className: 'flex-1 h-14 rounded-full bg-accent text-accent-on font-extrabold text-base'
        }, 'Save set ✓')
      )
    )
  );
};

// --- Rest timer: only runs when you start it; counts from a fixed end time so a
// locked phone or a re-render can't throw it off ---
export const RestTimerBar = ({ endsAt, total, nextLabel, onAdjust, onSkip, onDone }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, (endsAt - now) / 1000);
  useEffect(() => { if (left <= 0) onDone(); }, [left <= 0]);
  const small = (t, label, fn) => h('button', {
    type: 'button', onClick: fn, 'aria-label': label,
    className: 'h-11 px-3.5 rounded-full border border-ink-line bg-ink font-extrabold text-sm'
  }, t);
  return h('div', {
    className: 'fixed left-3 right-3 z-40 mx-auto max-w-2xl anim-sheet-in',
    style: { bottom: 'calc(env(safe-area-inset-bottom) + 14px)' }, role: 'timer', 'aria-label': `Rest, ${fmtClock(left)} left`
  },
    h('div', {
      className: 'flex items-center gap-3 bg-ink-card rounded-[28px] px-3.5 py-3',
      style: { border: `1px solid ${C.accent}`, boxShadow: '0 10px 30px rgba(0,0,0,.45)' }
    },
      h('div', { className: 'relative flex-none', style: { width: 72, height: 72 } },
        h(Ring, { size: 72, pct: total > 0 ? left / total : 0, color: C.accent, strokeWidth: 7 }),
        h('div', { className: 'absolute inset-0 flex flex-col items-center justify-center', 'aria-hidden': 'true' },
          h('span', { className: 'text-lg font-extrabold leading-5' }, fmtClock(left)),
          h('span', { className: 'text-[11px] text-ink-muted' }, 'left'))
      ),
      h('div', { className: 'flex-1 min-w-0' },
        h('div', { className: 'text-base font-extrabold' }, 'Resting'),
        nextLabel && h('div', { className: 'text-[13px] text-ink-muted truncate' }, `Next: ${nextLabel}`),
        h('div', { className: 'flex gap-1.5 mt-2' },
          small('−15s', 'Remove 15 seconds', () => onAdjust(-15)),
          small('+15s', 'Add 15 seconds', () => onAdjust(15)),
          small('Skip', 'Skip rest', onSkip))
      )
    )
  );
};

// --- New record: full screen, confetti, old best vs new best ---
const CONFETTI_COLORS = [C.accent, C.good, C.warn, C.calories, C.rem, '#F472B6'];
export const PRCelebration = ({ exercise, weight, reps, oldBest, oldDate, recordCount, onClose }) => {
  const pieces = useRef(Array.from({ length: prefersReducedMotion() ? 0 : 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    dur: 1.8 + Math.random() * 1.4,
    rot: Math.random() * 360,
    w: 6 + Math.random() * 4,
    h: 10 + Math.random() * 8,
    round: i % 3 === 0,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]
  }))).current;
  const btnRef = useRef(null);
  useEffect(() => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    btnRef.current && btnRef.current.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const gain = oldBest > 0 ? weight - oldBest : null;
  return h('div', {
    className: 'fixed inset-0 z-[60] bg-ink flex flex-col items-center text-center px-6 overflow-hidden anim-fade-in',
    role: 'dialog', 'aria-modal': 'true', 'aria-label': `New personal record: ${exercise} ${weight} pounds`,
    style: { paddingTop: 'calc(env(safe-area-inset-top) + 72px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }
  },
    pieces.map((p, i) => h('span', {
      key: i, className: 'confetti-piece', 'aria-hidden': 'true',
      style: {
        left: `${p.left}%`, width: p.w, height: p.round ? p.w : p.h, background: p.color,
        borderRadius: p.round ? '50%' : 2, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
        transform: `rotate(${p.rot}deg)`
      }
    })),
    h('div', {
      className: 'relative w-[148px] h-[148px] rounded-full bg-ink-card flex items-center justify-center pr-pop',
      style: { border: `3px solid ${C.warn}` }
    }, h('span', { className: 'text-[72px] leading-none', 'aria-hidden': 'true' }, '🏆')),
    h('div', { className: 'text-sm font-extrabold tracking-[.1em] mt-6', style: { color: C.warn } }, 'NEW PERSONAL RECORD'),
    h('div', { className: 'text-2xl font-extrabold mt-1.5' }, exercise),
    h('div', { className: 'text-[72px] leading-[76px] font-extrabold mt-1' }, fmtNum(weight), h('span', { className: 'text-[28px] text-ink-muted' }, ' lb')),
    reps > 0 && h('div', { className: 'text-lg text-ink-muted font-bold' }, `for ${reps} rep${reps === 1 ? '' : 's'}`),
    h(Card, { padding: 'p-4', className: 'w-full max-w-sm mt-6' },
      h('div', { className: 'flex items-center justify-between gap-2' },
        h('div', { className: 'text-left' },
          h('div', { className: 'text-xs font-extrabold tracking-[.06em] text-ink-muted' }, 'OLD BEST'),
          h('div', { className: 'text-xl font-extrabold' }, oldBest > 0 ? `${fmtNum(oldBest)} lb` : 'First time'),
          oldDate && h('div', { className: 'text-xs text-ink-muted' }, oldDate)),
        gain !== null && h('div', {
          className: 'h-9 px-3.5 rounded-full flex items-center text-[15px] font-extrabold',
          style: { background: C.good, color: C.onAccent }
        }, `+${fmtNum(Math.round(gain * 10) / 10)} lb`),
        h('div', { className: 'text-right' },
          h('div', { className: 'text-xs font-extrabold tracking-[.06em] text-ink-muted' }, 'NEW BEST'),
          h('div', { className: 'text-xl font-extrabold' }, `${fmtNum(weight)} lb`),
          h('div', { className: 'text-xs text-ink-muted' }, 'Today'))
      )
    ),
    recordCount > 1 && h('div', { className: 'text-[15px] text-ink-muted mt-3.5' }, `That's ${recordCount} records this workout.`),
    h('div', { className: 'mt-auto w-full max-w-sm' },
      h('button', {
        ref: btnRef, type: 'button', onClick: onClose,
        className: 'w-full h-[60px] rounded-full bg-accent text-accent-on font-extrabold text-lg'
      }, 'Keep going 💪')
    )
  );
};

// --- Pick an exercise: search, recent, or type a new one ---
export const AddExerciseSheet = ({ names, recent, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  // Every word has to appear, in any order: "pulldown lat" finds "Lat Pulldown".
  const words = query.split(/\s+/).filter(Boolean);
  const matches = words.length
    ? names.filter(n => { const low = n.toLowerCase(); return words.every(w => low.includes(w)); }).slice(0, 30)
    : [];
  const exact = names.some(n => n.toLowerCase() === query);
  const row = (n) => h('button', {
    key: n, type: 'button', onClick: () => onPick(n),
    className: 'w-full text-left min-h-[48px] py-2 px-1 border-t border-ink-line text-[15px] font-bold'
  }, n);
  return h(Sheet, { label: 'Add exercise', onClose },
    h(SheetHeader, { title: 'Add exercise', onClose }),
    h('label', { className: 'sr-only', htmlFor: 'exercise-search' }, 'Search exercises'),
    h('input', {
      id: 'exercise-search', type: 'search', value: q, autoComplete: 'off',
      onChange: (e) => setQ(e.target.value), placeholder: 'Search or type a new exercise',
      className: 'w-full h-12 rounded-full bg-ink border border-ink-line px-4 text-base mb-3'
    }),
    query && !exact && h('button', {
      type: 'button', onClick: () => onPick(q.trim()),
      className: 'w-full h-12 rounded-full border border-accent text-accent font-extrabold text-[15px] mb-2'
    }, `＋ Add “${q.trim()}”`),
    query
      ? h('div', null, matches.length ? matches.map(row) : h('div', { className: 'text-sm text-ink-muted py-3' }, 'No matches.'))
      : h('div', null,
          recent.length > 0 && h('div', { className: 'text-xs font-extrabold tracking-[.06em] text-ink-muted mb-1' }, 'RECENT'),
          recent.map(row))
  );
};

// --- ⋯ menu for one exercise ---
export const ExerciseOptionsSheet = ({ ex, canMoveUp, canMoveDown, onRename, onEachHand, onRemoveSet, onMove, onRemove, onClose }) =>
  h(Sheet, { label: `Options for ${ex.name || 'exercise'}`, onClose },
    h(SheetHeader, { title: ex.name || 'Exercise', onClose }),
    h('div', { className: 'flex flex-col' },
      [
        ['✏️ Change exercise', onRename, true],
        [ex.eachHand ? '🤲 Weight is each hand: on' : '🤲 Weight is each hand: off', onEachHand, true],
        ['➖ Remove last set', onRemoveSet, ex.reps.length > 1],
        ['⬆️ Move up', () => onMove(-1), canMoveUp],
        ['⬇️ Move down', () => onMove(1), canMoveDown]
      ].filter(([, , show]) => show).map(([label, fn]) => h('button', {
        key: label, type: 'button', onClick: fn,
        className: 'w-full text-left min-h-[52px] px-1 border-t border-ink-line first:border-t-0 text-[15px] font-bold'
      }, label)),
      h('button', {
        type: 'button', onClick: onRemove,
        className: 'w-full text-left min-h-[52px] px-1 border-t border-ink-line text-[15px] font-bold',
        style: { color: C.bad }
      }, '🗑️ Remove exercise')
    )
  );

// --- Finish: grade, numbers, each exercise's top set, then save ---
export const FinishSummary = ({ grade, gradeNote, stats, rows, skippedSets, duration, onDuration, calories, onCalories, saving, onSave, onBack, isEdit }) =>
  h('div', { className: 'flex flex-col gap-3.5' },
    h('div', { className: 'flex flex-col items-center text-center gap-3 pt-2' },
      h('div', { className: 'relative w-[156px] h-[156px]' },
        h(Ring, { size: 156, pct: grade ? 1 : 0, color: C.accent, strokeWidth: 12, label: grade ? `Workout grade ${grade}` : 'No grade' }),
        h('div', { className: 'absolute inset-0 flex flex-col items-center justify-center', 'aria-hidden': 'true' },
          h('div', { className: 'text-[44px] font-extrabold leading-[48px]' }, grade || '—'),
          h('div', { className: 'text-xs text-ink-muted font-bold' }, 'Workout grade'))
      ),
      gradeNote && h('p', { className: 'text-[15px] leading-[22px] text-ink-muted max-w-[330px]' }, gradeNote)
    ),
    h('div', { className: 'grid grid-cols-2 gap-2.5' },
      stats.map(s => h(Card, { key: s.label, padding: 'p-3.5' },
        h('div', { className: 'text-[13px] text-ink-muted font-bold' }, s.label),
        h('div', { className: 'text-2xl font-extrabold leading-[30px]' }, s.value),
        s.sub && h('div', { className: 'text-xs text-ink-muted' }, s.sub)))
    ),
    rows.length > 0 && h(Card, { padding: 'p-4' },
      h('div', { className: 'flex justify-between text-[13px] font-extrabold tracking-[.06em] text-ink-muted pb-1.5' },
        h('span', null, 'EXERCISE'), h('span', null, 'TOP SET')),
      rows.map((r, i) => h('div', { key: i, className: 'flex items-center gap-2.5 py-2.5 border-t border-ink-line' },
        h('span', { className: 'flex-1 min-w-0 text-[15px] font-bold truncate' }, r.pr ? `🏆 ${r.name}` : r.name),
        h('span', { className: 'text-[13px] text-ink-muted' }, `${r.sets} set${r.sets === 1 ? '' : 's'}`),
        h('span', { className: 'w-[88px] text-right text-[15px] font-extrabold' }, r.top)))
    ),
    skippedSets > 0 && h('div', { className: 'text-[13px] text-ink-muted px-1' },
      `${skippedSets} empty set${skippedSets === 1 ? '' : 's'} with no weight or reps will be left out.`),
    h(Card, { padding: 'p-4', className: 'flex flex-col gap-3' },
      h('label', { className: 'flex items-center justify-between gap-3' },
        h('span', { className: 'text-[15px] font-bold' }, '⏱ Duration (min)'),
        h('input', {
          type: 'number', inputMode: 'numeric', min: 0, step: 5, value: duration,
          onChange: (e) => onDuration(e.target.value),
          className: 'w-24 h-11 rounded-xl bg-ink border border-ink-line px-3 text-right text-base font-bold'
        })),
      h('label', { className: 'flex items-center justify-between gap-3' },
        h('span', { className: 'text-[15px] font-bold' }, '🔥 Calories burned', h('span', { className: 'block text-xs text-ink-muted font-normal' }, 'Optional; the Fitbit import can fill it')),
        h('input', {
          type: 'number', inputMode: 'numeric', min: 0, step: 10, value: calories, placeholder: '—',
          onChange: (e) => onCalories(e.target.value),
          className: 'w-24 h-11 rounded-xl bg-ink border border-ink-line px-3 text-right text-base font-bold'
        }))
    ),
    h('button', {
      type: 'button', onClick: onSave, disabled: saving,
      className: 'w-full h-14 rounded-full bg-accent text-accent-on font-extrabold text-lg disabled:opacity-60'
    }, isEdit ? 'Save changes' : 'Save workout'),
    h('button', {
      type: 'button', onClick: onBack,
      className: 'w-full h-12 rounded-full border border-ink-line font-extrabold text-[15px]'
    }, 'Keep logging')
  );
