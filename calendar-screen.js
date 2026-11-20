// --- 📅 CALENDAR SCREEN (redesign, Nov 2026) ---
// A week strip on top and everything logged on the picked day underneath:
// workout, meals, sleep, weight and Fitbit activity, each editable in place.
// App hands in the data and the actions; arithmetic that already lives in app.js
// (grades, calorie targets, cycle days) comes in as functions so it isn't duplicated.

import React from 'react';
import { getSleepVerdict } from './recovery.js';
import { C, Card, Icon, Ring, StageBar, formatMinutes, formatWorkoutName } from './ui.js';

const h = React.createElement;

const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDateStr = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromDateStr(s); d.setDate(d.getDate() + n); return toDateStr(d); };
const weekStart = (s) => { const d = fromDateStr(s); d.setDate(d.getDate() - d.getDay()); return toDateStr(d); };
const fmtNum = (n) => Number(n || 0).toLocaleString();

// "Push/Biceps" -> "Push", "REST" -> "Rest", imported "Workout" -> "Lift"
const shortType = (type) => {
  if (!type) return '';
  if (type === 'REST') return 'Rest';
  if (type === 'Workout') return 'Lift';
  return String(type).split('/')[0].trim();
};

const SmallButton = ({ children, onClick, label, danger = false }) =>
  h('button', {
    type: 'button', onClick, 'aria-label': label,
    className: 'h-9 px-3.5 rounded-full border text-[13px] font-extrabold flex-none',
    style: danger ? { borderColor: C.bad, color: C.bad } : { borderColor: C.line }
  }, children);

const CardTitle = ({ emoji, title, sub, right }) =>
  h('div', { className: 'flex items-center gap-2.5' },
    h('span', { className: 'text-[22px]', 'aria-hidden': 'true' }, emoji),
    h('div', { className: 'flex-1 min-w-0' },
      h('div', { className: 'text-[17px] font-extrabold truncate' }, title),
      sub && h('div', { className: 'text-[13px] text-ink-muted' }, sub)),
    right
  );

const AddRow = ({ children, onClick }) =>
  h('button', {
    type: 'button', onClick,
    className: 'w-full h-11 rounded-full border border-dashed border-ink-line text-ink-muted font-extrabold text-sm'
  }, children);

// --- Week strip ---
const WeekStrip = ({ start, selected, today, dayInfo, onSelect }) =>
  h('div', { className: 'flex gap-0.5', role: 'group', 'aria-label': 'Week' },
    Array.from({ length: 7 }, (_, i) => {
      const ds = addDays(start, i);
      const d = fromDateStr(ds);
      const info = dayInfo(ds);
      const on = ds === selected;
      const isToday = ds === today;
      const trained = info.logged && info.logged !== 'REST';
      const rested = info.logged === 'REST';
      const fg = on ? C.onAccent : C.text;
      return h('button', {
        key: ds, type: 'button', onClick: () => onSelect(ds),
        'aria-pressed': on ? 'true' : 'false',
        'aria-label': `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${info.logged ? `logged ${formatWorkoutName(info.logged)}` : `planned ${formatWorkoutName(info.planned)}`}${info.hasMeals ? ', meals logged' : ''}`,
        className: 'flex-1 min-w-0 h-[86px] rounded-[20px] flex flex-col items-center justify-center gap-[3px] p-0',
        style: {
          background: on ? C.accent : 'transparent', color: fg,
          border: `1px solid ${on ? C.accent : isToday ? C.line : 'transparent'}`
        }
      },
        h('span', { className: 'text-[11px] font-extrabold opacity-85' }, 'SMTWTFS'[i]),
        h('span', { className: 'text-lg font-extrabold leading-5' }, d.getDate()),
        h('span', {
          className: 'w-2 h-2 rounded-full', 'aria-hidden': 'true',
          style: trained
            ? { background: on ? C.onAccent : C.accent }
            : rested ? { boxShadow: `inset 0 0 0 2px ${on ? C.onAccent : C.neutral}` } : { background: 'transparent' }
        }),
        h('span', {
          className: 'text-[10px] font-extrabold truncate max-w-full px-0.5',
          style: { opacity: info.logged ? 1 : 0.55 }
        }, shortType(info.logged || info.planned))
      );
    })
  );

// --- Workout card ---
const topSet = (ex) => {
  const weights = Array.isArray(ex.weights) ? ex.weights : Array((ex.reps || []).length).fill(ex.weight || 0);
  const reps = Array.isArray(ex.reps) ? ex.reps : [];
  let best = null;
  reps.forEach((r, i) => {
    const w = Number(weights[i]) || 0;
    if (!best || w > best.w || (w === best.w && (Number(r) || 0) > best.r)) best = { w, r: Number(r) || 0 };
  });
  return best;
};

const WorkoutCard = ({ w, grade, onEdit, onDelete }) => {
  const isRest = w.trainingType === 'REST';
  const sets = Number(w.totalSets) || 0;
  const sub = isRest
    ? (w.fromFitbit ? 'Marked as rest from your Fitbit (no workout recorded)' : 'Rest day logged')
    : [`${sets} set${sets === 1 ? '' : 's'}`, w.duration ? `${w.duration} min` : null, w.caloriesBurned ? `${fmtNum(w.caloriesBurned)} kcal burned` : null].filter(Boolean).join(' · ');
  const cardio = Array.isArray(w.cardio) ? w.cardio.filter(c => c && c.name) : [];
  return h(Card, { padding: 'p-4', className: 'flex flex-col gap-2' },
    h(CardTitle, {
      emoji: isRest ? '😴' : '🏋️', title: formatWorkoutName(w.trainingType), sub,
      right: h('div', { className: 'flex items-center gap-2 flex-none' },
        grade && grade !== 'N/A' && h('span', {
          className: 'h-9 px-3 rounded-full bg-ink-key flex items-center text-[15px] font-extrabold', 'aria-label': `Grade ${grade}`
        }, grade),
        h(SmallButton, { onClick: onEdit, label: `Edit ${formatWorkoutName(w.trainingType)}` }, 'Edit'))
    }),
    w.needsDetails && h('div', { className: 'text-[13px] font-bold rounded-2xl px-3 py-2.5', style: { color: C.warn, border: `1px solid ${C.warn}` } },
      `⌚ Fitbit recorded ${w.duration || '?'} min of weights here. Tap Edit to add your exercises.`),
    (w.exercises || []).length > 0 && h('div', null,
      w.exercises.map((ex, i) => {
        const t = topSet(ex);
        const n = Array.isArray(ex.reps) ? ex.reps.length : Number(ex.sets) || 0;
        return h('div', { key: i, className: 'flex items-center gap-3 py-2 border-t border-ink-line' },
          h('span', { className: 'flex-1 min-w-0 text-[15px] font-bold truncate' }, ex.name || 'Exercise'),
          h('span', { className: 'text-[13px] text-ink-muted' }, `${n} set${n === 1 ? '' : 's'}`),
          h('span', { className: 'w-[84px] text-right text-[15px] font-extrabold' }, t ? `${fmtNum(t.w)} × ${t.r}` : '—'));
      })),
    cardio.length > 0 && h('div', null,
      cardio.map((c, i) => h('div', { key: `c${i}`, className: 'flex items-center gap-3 py-2 border-t border-ink-line' },
        h('span', { className: 'flex-1 min-w-0 text-[15px] font-bold truncate' }, `🏃 ${c.name}`),
        h('span', { className: 'text-[13px] text-ink-muted' }, [c.minutes ? `${c.minutes} min` : null, c.steps ? `${fmtNum(c.steps)} steps` : null].filter(Boolean).join(' · ') || '—')))),
    h('div', { className: 'flex justify-end pt-1' },
      h('button', {
        type: 'button', onClick: onDelete, className: 'h-9 px-2 text-[13px] font-bold',
        style: { color: C.bad }
      }, 'Delete workout'))
  );
};

// --- Meals card ---
const MealsCard = ({ meals, proteinTarget, calorieTarget, onAdd, onEdit, onDelete }) => {
  const protein = meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
  const calories = meals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
  const mini = (pct, color, big, small, label) => h('div', { className: 'flex items-center gap-2' },
    h(Ring, { size: 44, pct, color, strokeWidth: 6, label }),
    h('div', null,
      h('div', { className: 'text-base font-extrabold leading-5' }, big),
      h('div', { className: 'text-xs text-ink-muted' }, small)));
  return h(Card, { padding: 'p-4', className: 'flex flex-col gap-2' },
    h(CardTitle, { emoji: '🍽️', title: 'Meals', sub: meals.length ? `${meals.length} logged` : 'Nothing logged' }),
    meals.length > 0 && h('div', { className: 'flex gap-5 my-1.5' },
      mini(proteinTarget > 0 ? protein / proteinTarget : 0, C.protein, `${fmtNum(Math.round(protein))} g`, proteinTarget > 0 ? `of ${proteinTarget} g protein` : 'protein', `Protein ${Math.round(protein)} grams`),
      mini(calorieTarget > 0 ? calories / calorieTarget : 0, C.calories, fmtNum(Math.round(calories)), calorieTarget > 0 ? `of ${fmtNum(calorieTarget)} kcal` : 'kcal eaten', `Calories eaten ${Math.round(calories)}`)),
    meals.map((m, i) => h('div', { key: m.id || i, className: 'flex items-center gap-2 border-t border-ink-line' },
      h('button', {
        type: 'button', onClick: () => onEdit(m), className: 'flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left',
        'aria-label': `Edit ${m.description || 'meal'}`
      },
        h('span', { className: 'flex-1 min-w-0 text-[15px] font-bold truncate' }, m.description || 'Meal'),
        h('span', { className: 'text-sm font-extrabold' }, `${fmtNum(Math.round(Number(m.protein) || 0))} g`),
        h('span', { className: 'w-[74px] text-right text-sm text-ink-muted' }, `${fmtNum(Math.round(Number(m.calories) || 0))} kcal`)),
      h('button', {
        type: 'button', onClick: () => onDelete(m.id), 'aria-label': `Delete ${m.description || 'meal'}`,
        className: 'w-9 h-9 flex-none rounded-full flex items-center justify-center text-ink-muted'
      }, h(Icon, { name: 'close', size: 16 })))),
    h(AddRow, { onClick: onAdd }, '＋ Add meal')
  );
};

// --- Sleep card ---
const SleepCard = ({ sleep, onEdit, onAdd, onDelete }) => {
  if (!sleep || !(Number(sleep.sleepHours) > 0)) {
    return h(Card, { padding: 'p-4', className: 'flex flex-col gap-2.5' },
      h(CardTitle, { emoji: '🌙', title: 'Sleep', sub: 'No sleep logged for this night' }),
      sleep ? h(SmallButton, { onClick: onEdit }, 'Edit') : h(AddRow, { onClick: onAdd }, '＋ Log sleep'));
  }
  const minutes = Number(sleep.sleepHours) * 60;
  const deepPct = Number(sleep.deepSleepPercent) || 0;
  const deep = minutes * deepPct / 100;
  const v = getSleepVerdict(sleep.sleepHours, sleep.deepSleepPercent, sleep.recoveryRating);
  const tier = [['PR range', C.good], ['Target range', C.good], ['Baseline', C.warn], ['Poor', C.bad]][v.tier] || ['', C.muted];
  return h(Card, { padding: 'p-4', className: 'flex flex-col gap-2.5' },
    h(CardTitle, {
      emoji: '🌙', title: `Sleep · ${formatMinutes(minutes)}`,
      sub: `${deepPct.toFixed(0)}% deep${sleep.recoveryRating ? ` · recovery ${sleep.recoveryRating}/10` : ''}`,
      right: h('div', { className: 'flex items-center gap-2 flex-none' },
        h('span', { className: 'text-xs font-extrabold', style: { color: tier[1] } }, tier[0]),
        h(SmallButton, { onClick: onEdit, label: 'Edit sleep' }, 'Edit'))
    }),
    h(StageBar, { segments: [{ label: 'Other', minutes: minutes - deep, color: C.light }, { label: 'Deep', minutes: deep, color: C.deep }] }),
    h('div', { className: 'flex justify-between text-xs text-ink-muted' },
      h('span', null, `Light + REM ${formatMinutes(minutes - deep)}`),
      h('span', null, `Deep ${formatMinutes(deep)}`)),
    h('div', { className: 'flex justify-end' },
      h('button', { type: 'button', onClick: onDelete, className: 'h-9 px-2 text-[13px] font-bold', style: { color: C.bad } }, 'Delete sleep'))
  );
};

const BodyTiles = ({ sleep }) => {
  if (!sleep) return null;
  const tiles = [];
  if (Number(sleep.weight) > 0) tiles.push(['⚖️', 'Weight', String(sleep.weight), 'lb']);
  if (Number(sleep.steps) > 0) tiles.push(['👟', 'Steps', fmtNum(sleep.steps), 'Google Health']);
  if (Number(sleep.totalCaloriesBurned) > 0) {
    tiles.push(['🔥', 'Burned', fmtNum(sleep.totalCaloriesBurned),
      Number(sleep.activeCaloriesBurned) > 0 ? `kcal · ${fmtNum(sleep.activeCaloriesBurned)} active` : 'kcal']);
  }
  if (!tiles.length) return null;
  return h(Card, { padding: 'p-3', className: 'flex gap-2' },
    tiles.map(([e, t, v, s]) => h('div', { key: t, className: 'flex-1 min-w-0 bg-ink border border-ink-line rounded-[18px] p-3' },
      h('div', { className: 'text-xs text-ink-muted font-bold' }, `${e} ${t}`),
      h('div', { className: 'text-xl font-extrabold' }, v),
      h('div', { className: 'text-[11px] text-ink-muted truncate' }, s))));
};

export const CalendarScreen = (props) => {
  const {
    entries, nutrition, sleepEntries, selected, onSelect,
    plannedFor, cycleDayFor, cycleLength, gradeFor, proteinTarget, calorieTargetFor
  } = props;
  const today = toDateStr(new Date());
  const start = weekStart(selected);
  const end = addDays(start, 6);

  const workoutsOn = (ds) => entries.filter(e => e.date === ds);
  const dayInfo = (ds) => {
    const ws = workoutsOn(ds);
    const lifted = ws.find(w => w.trainingType && w.trainingType !== 'REST');
    return {
      logged: lifted ? lifted.trainingType : ws.length ? 'REST' : null,
      planned: plannedFor(ds),
      hasMeals: nutrition.some(n => n.date === ds)
    };
  };

  const ws = workoutsOn(selected);
  const meals = nutrition.filter(n => n.date === selected);
  const sleep = sleepEntries.find(s => s.date === selected) || null;
  const planned = plannedFor(selected);
  const typeForTargets = (ws.find(w => w.trainingType) || {}).trainingType || planned;
  const d = fromDateStr(selected);
  const rangeLabel = (() => {
    const a = fromDateStr(start), b = fromDateStr(end);
    const m = (x) => x.toLocaleDateString('en-US', { month: 'short' });
    return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getDate()} – ${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
  })();

  return h('div', { className: 'flex flex-col gap-3' },
    h('div', { className: 'flex items-center gap-2' },
      h('button', { type: 'button', 'aria-label': 'Previous week', onClick: () => onSelect(addDays(selected, -7)), className: 'w-11 h-11 flex-none rounded-full border border-ink-line bg-ink-card flex items-center justify-center' }, h(Icon, { name: 'chevronLeft' })),
      h('label', { className: 'relative flex-1 text-center text-base font-extrabold cursor-pointer' },
        rangeLabel, h('span', { className: 'text-ink-muted text-sm' }, ' ▾'),
        h('input', {
          type: 'date', value: selected, 'aria-label': 'Jump to a date',
          onChange: (e) => e.target.value && onSelect(e.target.value),
          className: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer'
        })),
      h('button', { type: 'button', 'aria-label': 'Next week', onClick: () => onSelect(addDays(selected, 7)), className: 'w-11 h-11 flex-none rounded-full border border-ink-line bg-ink-card flex items-center justify-center' }, h(Icon, { name: 'chevronRight' })),
      h('button', {
        type: 'button', onClick: () => onSelect(today), disabled: selected === today,
        className: 'h-11 px-4 flex-none rounded-full border border-ink-line bg-ink-card font-extrabold text-sm disabled:opacity-40'
      }, 'Today')
    ),
    h(WeekStrip, { start, selected, today, dayInfo, onSelect }),
    h('div', { className: 'px-1 pt-1.5' },
      h('h2', { className: 'text-2xl font-extrabold' },
        selected === today ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })),
      h('div', { className: 'text-sm text-ink-muted' },
        `Day ${cycleDayFor(selected) + 1} of ${cycleLength} · planned ${formatWorkoutName(planned)}`)),

    ws.length
      ? ws.map(w => h(WorkoutCard, {
          key: w.id, w, grade: w.trainingType === 'REST' ? null : gradeFor(sleep, Number(w.totalSets) || 0),
          onEdit: () => props.onEditWorkout(w), onDelete: () => props.onDeleteWorkout(w.id)
        }))
      : h(Card, { padding: 'p-4', className: 'flex flex-col gap-2.5' },
          h(CardTitle, { emoji: planned === 'REST' ? '😴' : '🏋️', title: 'No workout logged', sub: `Planned: ${formatWorkoutName(planned)}` }),
          h('div', { className: 'flex gap-2' },
            h('button', { type: 'button', onClick: () => props.onAddWorkout(selected), className: 'flex-1 h-11 rounded-full bg-accent text-accent-on font-extrabold text-sm' },
              planned === 'REST' ? '😴 Log rest day' : '💪 Log workout'),
            planned === 'REST' && h('button', { type: 'button', onClick: () => props.onAddWorkout(selected, 'lift'), className: 'flex-1 h-11 rounded-full border border-ink-line font-extrabold text-sm' }, 'Log a workout'))),

    h(MealsCard, {
      meals, proteinTarget, calorieTarget: calorieTargetFor(typeForTargets),
      onAdd: () => props.onAddMeal(selected), onEdit: props.onEditMeal, onDelete: props.onDeleteMeal
    }),
    h(SleepCard, {
      sleep, onEdit: () => props.onEditSleep(sleep), onAdd: () => props.onAddSleep(selected),
      onDelete: () => props.onDeleteSleep(sleep.id)
    }),
    h(BodyTiles, { sleep })
  );
};
