// --- 📈 CHARTS SCREEN (redesign, Nov 2026) ---
// Line charts for strength, weekly training volume, bodyweight, sleep and food.
// Lines break where data is missing instead of drawing across the gap, and a
// tap-and-hold (or hover) shows the exact values for that day. One y-axis per
// chart, always. App passes raw data; all the grouping and averaging is here and
// is plain arithmetic.

import React from 'react';
import { C, Card, Icon } from './ui.js';

const h = React.createElement;
const { useState, useMemo, useRef, useEffect } = React;

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateStr = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (n, digits = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const shortDate = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const RANGES = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365 };
const MUTED_DOT = '#6A7AA0';

// Trailing average over the last `days` calendar days of whichever points exist.
const rollingAverage = (points, days) => points.map((p, i) => {
  let sum = 0, n = 0;
  for (let k = i; k >= 0 && p.t - points[k].t < days * DAY; k--) { sum += points[k].v; n++; }
  return { t: p.t, v: sum / n };
});

// Nice round axis ticks.
const niceTicks = (min, max, count = 4) => {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
};

// Width of the card, so labels are drawn at real size rather than stretched.
const useWidth = (ref, fallback = 320) => {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const measure = () => ref.current && setW(Math.max(240, Math.round(ref.current.getBoundingClientRect().width)) || fallback);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return w;
};

// series: [{ name, color, points: [{t, v}], kind: 'line' | 'dots', gapDays }]
// band: { from, to, label }   refs: [{ v, label }]   fmtV: value formatter
const LineChart = ({ series, start, end, band, refs = [], fmtV, unit = '', label, height = 190 }) => {
  const boxRef = useRef(null);
  const width = useWidth(boxRef);
  const [hover, setHover] = useState(null);
  const L = 40, R = 14, T = 12, B = 26;
  const pw = width - L - R, ph = height - T - B;

  const all = series.flatMap(s => s.points.map(p => p.v));
  const hasData = all.length > 0;
  const extra = [...refs.map(r => r.v), ...(band ? [band.from, band.to] : [])];
  const ticks = hasData ? niceTicks(Math.min(...all, ...extra), Math.max(...all, ...extra)) : [0, 1];
  const ymin = ticks[0], ymax = ticks[ticks.length - 1];
  const X = (t) => L + pw * (t - start) / Math.max(1, end - start);
  const Y = (v) => T + ph * (1 - (v - ymin) / Math.max(1e-9, ymax - ymin));

  // About four date labels across the bottom.
  const xTicks = [];
  const span = end - start;
  for (let k = 0; k <= 3; k++) xTicks.push(start + span * k / 3);

  const pathFor = (s) => {
    const gap = (s.gapDays || 14) * DAY;
    let d = '';
    s.points.forEach((p, i) => {
      const prev = s.points[i - 1];
      d += `${!prev || p.t - prev.t > gap ? 'M' : 'L'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)} `;
    });
    return d.trim();
  };

  // Nearest day with a value in any series to the pointer.
  const allTimes = [...new Set(series.flatMap(s => s.points.map(p => p.t)))].sort((a, b) => a - b);
  const onPointer = (e) => {
    if (!allTimes.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = start + (x - L) / pw * (end - start);
    let best = allTimes[0];
    for (const at of allTimes) if (Math.abs(at - t) < Math.abs(best - t)) best = at;
    setHover(best);
  };
  const hoverRows = hover === null ? [] : series.map(s => {
    const p = s.points.find(q => q.t === hover);
    return p ? { name: s.name, color: s.color, v: p.v } : null;
  }).filter(Boolean);

  return h('div', { ref: boxRef, className: 'relative select-none', style: { touchAction: 'pan-y' } },
    h('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label, style: { display: 'block' },
      onPointerMove: onPointer, onPointerDown: onPointer, onPointerLeave: () => setHover(null)
    },
      band && h('g', null,
        h('rect', { x: L, y: Y(band.to), width: pw, height: Math.max(0, Y(band.from) - Y(band.to)), fill: C.accent, fillOpacity: 0.13 }),
        h('text', { x: L + 6, y: Y(band.to) + 13, fontSize: 11, fill: C.muted, fontWeight: 700 }, band.label)),
      ticks.map(t => h('g', { key: t },
        h('line', { x1: L, x2: L + pw, y1: Y(t), y2: Y(t), stroke: C.line, strokeWidth: 1 }),
        h('text', { x: L - 8, y: Y(t) + 4, fontSize: 11, fill: C.muted, textAnchor: 'end' }, fmt(t, 1)))),
      xTicks.map((t, i) => h('text', {
        key: i, x: X(t), y: height - 7, fontSize: 11, fill: C.muted,
        textAnchor: i === 0 ? 'start' : i === 3 ? 'end' : 'middle'
      }, shortDate(t))),
      refs.map(r => h('g', { key: r.label },
        h('line', { x1: L, x2: L + pw, y1: Y(r.v), y2: Y(r.v), stroke: C.muted, strokeWidth: 1.5, strokeDasharray: '4 4' }),
        h('text', { x: L + pw - 4, y: Y(r.v) - 6, fontSize: 11, fill: C.muted, fontWeight: 700, textAnchor: 'end' }, r.label))),
      series.map(s => s.kind === 'dots'
        ? h('g', { key: s.name }, s.points.map((p, i) => h('circle', { key: i, cx: X(p.t), cy: Y(p.v), r: 3.5, fill: s.color, stroke: C.card, strokeWidth: 1.5 })))
        : h('g', { key: s.name },
            h('path', { d: pathFor(s), fill: 'none', stroke: s.color, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
            // A lone point between gaps still needs a mark.
            s.points.map((p, i) => {
              const gap = (s.gapDays || 14) * DAY;
              const prev = s.points[i - 1], next = s.points[i + 1];
              const alone = (!prev || p.t - prev.t > gap) && (!next || next.t - p.t > gap);
              return alone ? h('circle', { key: i, cx: X(p.t), cy: Y(p.v), r: 4, fill: s.color }) : null;
            }))),
      hover !== null && h('g', null,
        h('line', { x1: X(hover), x2: X(hover), y1: T, y2: T + ph, stroke: C.text, strokeOpacity: 0.35, strokeWidth: 1 }),
        hoverRows.map(r => h('circle', { key: r.name, cx: X(hover), cy: Y(r.v), r: 5, fill: r.color, stroke: C.text, strokeWidth: 2 }))),
      !hasData && h('text', { x: L + pw / 2, y: T + ph / 2, fontSize: 13, fill: C.muted, textAnchor: 'middle', fontWeight: 700 }, 'Nothing logged in this range')
    ),
    hover !== null && hoverRows.length > 0 && h('div', {
      className: 'absolute top-1 pointer-events-none bg-ink border border-ink-line rounded-xl px-3 py-2 text-xs shadow-lg',
      style: X(hover) > width / 2 ? { right: width - X(hover) + 10 } : { left: X(hover) + 10 },
      role: 'status'
    },
      h('div', { className: 'font-extrabold mb-0.5' }, new Date(hover).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
      hoverRows.map(r => h('div', { key: r.name, className: 'flex items-center gap-1.5 whitespace-nowrap' },
        h('span', { className: 'w-2 h-2 rounded-full', style: { background: r.color } }),
        `${r.name}: `, h('b', null, `${fmtV ? fmtV(r.v) : fmt(r.v, 1)}${unit}`))))
  );
};

const Legend = ({ items }) =>
  h('div', { className: 'flex flex-wrap gap-4 text-xs text-ink-muted' },
    items.map(it => h('span', { key: it.name, className: 'flex items-center gap-1.5' },
      it.kind === 'dots'
        ? h('span', { className: 'w-2 h-2 rounded-full', style: { background: it.color } })
        : h('span', { className: 'w-4 h-0.5 rounded', style: { background: it.color } }),
      it.name)));

const Toggle = ({ options, value, onChange, label }) =>
  h('div', { className: 'flex gap-1 p-1 rounded-full bg-ink border border-ink-line', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', {
      key: v, type: 'button', 'aria-pressed': value === v ? 'true' : 'false', onClick: () => onChange(v),
      className: `flex-1 h-9 px-3 rounded-full text-[13px] whitespace-nowrap ${value === v ? 'bg-accent text-accent-on font-extrabold' : 'font-bold'}`
    }, text)));

const Stats = ({ items }) =>
  h('div', { className: 'flex gap-2.5 pt-3 border-t border-ink-line' },
    items.map(([k, v]) => h('div', { key: k, className: 'flex-1 min-w-0' },
      h('div', { className: 'text-xs text-ink-muted font-bold' }, k),
      h('div', { className: 'text-[17px] font-extrabold truncate' }, v))));

const ChartCard = ({ emoji, title, sub, controls, legend, chart, stats }) =>
  h(Card, { padding: 'p-4', className: 'flex flex-col gap-3' },
    h('div', { className: 'flex items-start gap-2.5' },
      h('span', { className: 'text-[22px]', 'aria-hidden': 'true' }, emoji),
      h('div', { className: 'flex-1 min-w-0' },
        h('div', { className: 'text-[17px] font-extrabold' }, title),
        sub && h('div', { className: 'text-[13px] text-ink-muted' }, sub))),
    controls, legend, chart, stats && h(Stats, { items: stats }));

const topWeight = (ex) => {
  const ws = Array.isArray(ex.weights) ? ex.weights : [ex.weight];
  return ws.reduce((m, w) => Math.max(m, Number(w) || 0), 0);
};

export const ChartsScreen = ({ entries, nutrition, sleepEntries, exerciseNames, proteinTarget, calorieTargetFor, volumeFor }) => {
  const [range, setRange] = useState('3M');
  const [section, setSection] = useState('all');
  const end = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }, []);
  const start = end - RANGES[range] * DAY + 1;
  const inRange = (t) => t >= start && t <= end;

  // --- Strength ---
  const liftCounts = useMemo(() => {
    const counts = {};
    entries.forEach(e => (e.exercises || []).forEach(ex => { if (ex.name && topWeight(ex) > 0) counts[ex.name] = (counts[ex.name] || 0) + 1; }));
    return counts;
  }, [entries]);
  const lifts = useMemo(() => {
    // Most-logged first, then anything else you've named.
    const logged = Object.keys(liftCounts).sort((a, b) => liftCounts[b] - liftCounts[a] || a.localeCompare(b));
    return [...new Set([...logged, ...exerciseNames.filter(n => liftCounts[n])])];
  }, [liftCounts, exerciseNames]);
  const [lift, setLift] = useState(null);
  const chosen = lift && lifts.includes(lift) ? lift : (() => {
    // Default: the lift you've trained most in the last 90 days.
    const recent = {};
    entries.filter(e => fromDateStr(e.date).getTime() > end - 90 * DAY)
      .forEach(e => (e.exercises || []).forEach(ex => { if (ex.name && topWeight(ex) > 0) recent[ex.name] = (recent[ex.name] || 0) + 1; }));
    return Object.keys(recent).sort((a, b) => recent[b] - recent[a])[0] || lifts[0] || null;
  })();
  const [liftMetric, setLiftMetric] = useState('top');
  const liftAll = useMemo(() => {
    if (!chosen) return [];
    const pts = [];
    entries.forEach(e => (e.exercises || []).forEach(ex => {
      if (ex.name !== chosen) return;
      const v = liftMetric === 'top' ? topWeight(ex) : volumeFor(ex);
      if (v > 0) pts.push({ t: fromDateStr(e.date).getTime(), v });
    }));
    // One point per day (the better of two logs that day).
    const byDay = {};
    pts.forEach(p => { byDay[p.t] = Math.max(byDay[p.t] || 0, p.v); });
    return Object.entries(byDay).map(([t, v]) => ({ t: Number(t), v })).sort((a, b) => a.t - b.t);
  }, [entries, chosen, liftMetric]);
  const liftPts = liftAll.filter(p => inRange(p.t));
  const liftBest = liftAll.reduce((m, p) => Math.max(m, p.v), 0);
  const liftFmt = (v) => fmt(v);

  // --- Weekly working sets (Sunday weeks) ---
  const weekly = useMemo(() => {
    const byWeek = {};
    entries.forEach(e => {
      if (e.trainingType === 'REST') return;
      const d = fromDateStr(e.date);
      d.setDate(d.getDate() - d.getDay());
      const t = d.getTime();
      byWeek[t] = (byWeek[t] || 0) + (Number(e.totalSets) || 0);
    });
    return Object.entries(byWeek).map(([t, v]) => ({ t: Number(t), v })).filter(p => p.v > 0).sort((a, b) => a.t - b.t);
  }, [entries]);
  const weeklyPts = weekly.filter(p => inRange(p.t) || inRange(p.t + 6 * DAY));
  const avgWeekly = weeklyPts.length ? weeklyPts.reduce((s, p) => s + p.v, 0) / weeklyPts.length : 0;

  // --- Bodyweight ---
  const weighIns = useMemo(() => sleepEntries.filter(s => Number(s.weight) > 0)
    .map(s => ({ t: fromDateStr(s.date).getTime(), v: Number(s.weight) })).sort((a, b) => a.t - b.t), [sleepEntries]);
  const weightAvg = rollingAverage(weighIns, 7);
  const wIn = weighIns.filter(p => inRange(p.t));
  const wAvgIn = weightAvg.filter(p => inRange(p.t));
  const wChange = wAvgIn.length > 1 ? wAvgIn[wAvgIn.length - 1].v - wAvgIn[0].v : null;

  // --- Sleep ---
  const [sleepMetric, setSleepMetric] = useState('deep');
  const nights = useMemo(() => sleepEntries.filter(s => Number(s.sleepHours) > 0)
    .map(s => ({ t: fromDateStr(s.date).getTime(), deep: Number(s.deepSleepPercent) || 0, hours: Number(s.sleepHours) }))
    .sort((a, b) => a.t - b.t), [sleepEntries]);
  const sleepRaw = nights.map(n => ({ t: n.t, v: sleepMetric === 'deep' ? n.deep : n.hours }));
  const sleepAvg = rollingAverage(sleepRaw, 7);
  const sRaw = sleepRaw.filter(p => inRange(p.t));
  const sAvg = sleepAvg.filter(p => inRange(p.t));
  const inTarget = sRaw.filter(p => (sleepMetric === 'deep' ? p.v >= 15 && p.v <= 20 : p.v >= 7)).length;
  const sleepBest = sRaw.reduce((m, p) => Math.max(m, p.v), 0);

  // --- Food: daily totals on days with anything logged ---
  const [foodMetric, setFoodMetric] = useState('protein');
  const dailyFood = useMemo(() => {
    const byDay = {};
    nutrition.forEach(n => {
      const t = fromDateStr(n.date).getTime();
      const d = byDay[t] || (byDay[t] = { protein: 0, calories: 0, date: n.date });
      d.protein += Number(n.protein) || 0;
      d.calories += Number(n.calories) || 0;
    });
    return Object.entries(byDay).map(([t, d]) => ({ t: Number(t), ...d })).sort((a, b) => a.t - b.t);
  }, [nutrition]);
  const foodRaw = dailyFood.map(d => ({ t: d.t, v: d[foodMetric] })).filter(p => p.v > 0);
  const foodAvg = rollingAverage(foodRaw, 7);
  const fRaw = foodRaw.filter(p => inRange(p.t));
  const fAvg = foodAvg.filter(p => inRange(p.t));
  const trainingTypeOn = useMemo(() => {
    const m = {};
    entries.forEach(e => { m[e.date] = e.trainingType; });
    return m;
  }, [entries]);
  const foodTargetFor = (t) => (foodMetric === 'protein' ? proteinTarget : calorieTargetFor(trainingTypeOn[toDateStr(new Date(t))] || 'REST'));
  const daysHit = fRaw.filter(p => { const tg = foodTargetFor(p.t); return tg > 0 && p.v >= tg; }).length;
  const calorieRef = foodMetric === 'calories' ? calorieTargetFor('Push/Biceps') : null;

  const show = (k) => section === 'all' || section === k;
  const tabs = [['all', 'All'], ['strength', 'Strength'], ['body', 'Body'], ['sleep', 'Sleep'], ['food', 'Food']];

  return h('div', { className: 'flex flex-col gap-3' },
    h('div', { className: 'flex gap-0.5 p-1 rounded-full bg-ink-card border border-ink-line', role: 'group', 'aria-label': 'Show charts for' },
      tabs.map(([k, t]) => h('button', {
        key: k, type: 'button', 'aria-pressed': section === k ? 'true' : 'false', onClick: () => setSection(k),
        className: `flex-1 h-10 rounded-full text-sm ${section === k ? 'bg-accent text-accent-on font-extrabold' : 'font-bold'}`
      }, t))),
    h('div', { className: 'flex gap-1.5', role: 'group', 'aria-label': 'Time range' },
      Object.keys(RANGES).map(r => h('button', {
        key: r, type: 'button', 'aria-pressed': range === r ? 'true' : 'false', onClick: () => setRange(r),
        className: 'flex-1 h-10 rounded-full text-sm font-extrabold',
        style: range === r ? { background: C.accentDeep, border: `1px solid ${C.accent}` } : { border: `1px solid ${C.line}` }
      }, r))),

    show('strength') && h(ChartCard, {
      emoji: '💪', title: 'Strength', sub: liftMetric === 'top' ? 'Heaviest set each session · lb' : 'Volume each session (weight × reps) · lb',
      controls: h('div', { className: 'flex flex-col gap-2' },
        h('label', { className: 'sr-only', htmlFor: 'chart-lift' }, 'Exercise'),
        h('select', {
          id: 'chart-lift', value: chosen || '', onChange: (e) => setLift(e.target.value),
          className: 'w-full h-11 rounded-full bg-ink border border-ink-line px-4 text-sm font-bold'
        }, lifts.length ? lifts.map(n => h('option', { key: n, value: n }, `${n} (${liftCounts[n]})`)) : h('option', { value: '' }, 'No lifts logged yet')),
        h(Toggle, { label: 'Strength measure', value: liftMetric, onChange: setLiftMetric, options: [['top', 'Top set'], ['volume', 'Volume']] })),
      chart: h(LineChart, {
        label: `${chosen || 'Exercise'} ${liftMetric === 'top' ? 'top set' : 'volume'} over ${range}`,
        series: [{ name: liftMetric === 'top' ? 'Top set' : 'Volume', color: C.accent, points: liftPts, gapDays: 21 }],
        start, end, fmtV: liftFmt, unit: ' lb',
        refs: liftBest > 0 && liftMetric === 'top' ? [{ v: liftBest, label: `Best ${fmt(liftBest)}` }] : []
      }),
      stats: [
        ['Latest', liftPts.length ? `${fmt(liftPts[liftPts.length - 1].v)} lb` : '—'],
        [`${range} change`, liftPts.length > 1 ? `${liftPts[liftPts.length - 1].v - liftPts[0].v >= 0 ? '+' : ''}${fmt(liftPts[liftPts.length - 1].v - liftPts[0].v)} lb` : '—'],
        ['All-time best', liftBest ? `${fmt(liftBest)} lb` : '—']
      ]
    }),

    show('strength') && h(ChartCard, {
      emoji: '🔢', title: 'Weekly working sets', sub: 'All lifting sets, Sunday–Saturday weeks',
      chart: h(LineChart, {
        label: `Working sets per week over ${range}`,
        series: [{ name: 'Sets', color: C.accent, points: weeklyPts, gapDays: 15 }],
        start, end, fmtV: (v) => fmt(v), unit: ' sets'
      }),
      stats: [
        ['This week', weekly.length && weekly[weekly.length - 1].t > end - 7 * DAY ? `${weekly[weekly.length - 1].v} sets` : '0 sets'],
        ['Average', weeklyPts.length ? `${fmt(avgWeekly)} / week` : '—'],
        ['Most', weeklyPts.length ? `${Math.max(...weeklyPts.map(p => p.v))} sets` : '—']
      ]
    }),

    show('body') && h(ChartCard, {
      emoji: '⚖️', title: 'Bodyweight', sub: '7-day average · lb',
      legend: h(Legend, { items: [{ name: '7-day average', color: C.accent }, { name: 'Weigh-in', color: MUTED_DOT, kind: 'dots' }] }),
      chart: h(LineChart, {
        label: `Bodyweight over ${range}`,
        series: [
          { name: 'Weigh-in', color: MUTED_DOT, kind: 'dots', points: wIn },
          { name: '7-day avg', color: C.accent, points: wAvgIn, gapDays: 10 }
        ],
        start, end, fmtV: (v) => fmt(v, 1), unit: ' lb'
      }),
      stats: [
        ['7-day avg', wAvgIn.length ? `${fmt(wAvgIn[wAvgIn.length - 1].v, 1)} lb` : '—'],
        ['Latest', wIn.length ? `${fmt(wIn[wIn.length - 1].v, 1)} lb` : '—'],
        [`${range} change`, wChange === null ? '—' : `${wChange >= 0 ? '+' : ''}${fmt(wChange, 1)} lb`]
      ]
    }),

    show('sleep') && h(ChartCard, {
      emoji: '🌙', title: sleepMetric === 'deep' ? 'Deep sleep' : 'Sleep time',
      sub: sleepMetric === 'deep' ? '7-night average · % of the night' : '7-night average · hours',
      controls: h(Toggle, { label: 'Sleep measure', value: sleepMetric, onChange: setSleepMetric, options: [['deep', 'Deep %'], ['hours', 'Hours']] }),
      legend: h(Legend, { items: [{ name: '7-night average', color: C.accent }, { name: 'Each night', color: MUTED_DOT, kind: 'dots' }] }),
      chart: h(LineChart, {
        label: `${sleepMetric === 'deep' ? 'Deep sleep percent' : 'Sleep hours'} over ${range}`,
        series: [
          { name: 'Night', color: MUTED_DOT, kind: 'dots', points: sRaw },
          { name: '7-night avg', color: C.accent, points: sAvg, gapDays: 7 }
        ],
        start, end, fmtV: (v) => fmt(v, 1), unit: sleepMetric === 'deep' ? '%' : ' h',
        band: sleepMetric === 'deep' ? { from: 15, to: 20, label: 'Target 15–20%' } : { from: 7, to: 9, label: '7–9 h' }
      }),
      stats: [
        ['Last night', sRaw.length ? `${fmt(sRaw[sRaw.length - 1].v, 1)}${sleepMetric === 'deep' ? '%' : ' h'}` : '—'],
        ['Best', sleepBest ? `${fmt(sleepBest, 1)}${sleepMetric === 'deep' ? '%' : ' h'}` : '—'],
        [sleepMetric === 'deep' ? 'In target' : '7 h or more', sRaw.length ? `${inTarget} of ${sRaw.length}` : '—']
      ]
    }),

    show('food') && h(ChartCard, {
      emoji: '🍽️', title: foodMetric === 'protein' ? 'Protein' : 'Calories eaten',
      sub: `Daily totals on days you logged food · ${foodMetric === 'protein' ? 'g' : 'kcal'}`,
      controls: h(Toggle, { label: 'Food measure', value: foodMetric, onChange: setFoodMetric, options: [['protein', 'Protein'], ['calories', 'Calories']] }),
      legend: h(Legend, { items: [{ name: '7-day average', color: foodMetric === 'protein' ? C.protein : C.calories }, { name: 'Each day', color: MUTED_DOT, kind: 'dots' }] }),
      chart: h(LineChart, {
        label: `${foodMetric === 'protein' ? 'Protein' : 'Calories'} per day over ${range}`,
        series: [
          { name: 'Day', color: MUTED_DOT, kind: 'dots', points: fRaw },
          { name: '7-day avg', color: foodMetric === 'protein' ? C.protein : C.calories, points: fAvg, gapDays: 7 }
        ],
        start, end, fmtV: (v) => fmt(v), unit: foodMetric === 'protein' ? ' g' : ' kcal',
        refs: foodMetric === 'protein'
          ? (proteinTarget > 0 ? [{ v: proteinTarget, label: `Target ${proteinTarget} g` }] : [])
          : (calorieRef > 0 ? [{ v: calorieRef, label: `Training-day target ${fmt(calorieRef)}` }] : [])
      }),
      stats: [
        ['Daily average', fRaw.length ? `${fmt(fRaw.reduce((s, p) => s + p.v, 0) / fRaw.length)}${foodMetric === 'protein' ? ' g' : ''}` : '—'],
        ['Days logged', `${fRaw.length}`],
        ['Hit target', fRaw.length ? `${daysHit} of ${fRaw.length}` : '—']
      ]
    }),

    h('div', { className: 'text-[13px] text-ink-muted text-center flex items-center justify-center gap-1.5' },
      h(Icon, { name: 'M12 3v18M3 12h18', size: 14, color: C.muted }), 'Touch and slide across a chart to read exact values')
  );
};
