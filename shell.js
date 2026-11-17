// --- 🧭 APP SHELL (redesign, Nov 2026) ---
// The fixed header and the slide-out menu that replace the bottom nav bar.
// The page itself is the scroller, so the iPhone status-bar tap still scrolls to
// the top; tapping the header does the same thing as a backup.

import React from 'react';
import * as Sync from './sync.js';
import { C, Icon, Ring, IconButton, prefersReducedMotion } from './ui.js';

const h = React.createElement;
const { useState, useEffect, useRef } = React;

export const scrollToTop = () => {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
};

// readiness: { pct: 0..100, color, label } or null to hide the chip.
export const AppHeader = ({ title, subtitle, readiness, onMenu, onReadiness }) =>
  h('header', {
    className: 'sticky top-0 z-30 bg-ink/95 backdrop-blur border-b border-ink-line',
    style: { paddingTop: 'env(safe-area-inset-top)' },
    // Anywhere on the header that isn't a button jumps back to the top.
    onClick: (e) => { if (!e.target.closest('button')) scrollToTop(); }
  },
    h('div', { className: 'max-w-2xl mx-auto h-[68px] px-4 flex items-center justify-between gap-3' },
      h(IconButton, { icon: 'menu', label: 'Open menu', onClick: onMenu }),
      h('div', { className: 'flex-1 min-w-0 text-center cursor-default select-none' },
        h('div', { className: 'text-base font-extrabold truncate' }, title),
        subtitle && h('div', { className: 'text-xs text-ink-muted truncate' }, subtitle)
      ),
      readiness
        ? h('button', {
            type: 'button', onClick: onReadiness,
            'aria-label': `${readiness.label}. Open recovery`,
            className: 'flex-none flex items-center gap-1.5 h-11 pl-1.5 pr-3 rounded-full bg-ink-card border border-ink-line'
          },
            h(Ring, { size: 30, pct: readiness.pct / 100, color: readiness.color, strokeWidth: 4 }),
            h('span', { className: 'text-sm font-extrabold' }, `${Math.round(readiness.pct)}%`)
          )
        : h('div', { className: 'w-11 flex-none' })
    )
  );

// --- Cloud backup status line for the bottom of the menu ---
const useSyncStatus = () => {
  const [status, setStatus] = useState(Sync.getStatus());
  useEffect(() => Sync.subscribe(setStatus), []);
  return status;
};

const syncLine = (s) => {
  if (!s.enabled) return { color: C.muted, text: 'Cloud backup is off' };
  if (!s.signedIn) return { color: C.warn, text: 'Not signed in to cloud backup' };
  if (s.state === 'blocked') return { color: C.bad, text: 'Backup paused. See Settings' };
  if (s.state === 'error') return { color: C.bad, text: 'Backup error. See Settings' };
  if (s.state === 'offline') return { color: C.warn, text: 'Offline. Will back up later' };
  if (s.state === 'syncing') return { color: C.accent, text: 'Backing up…' };
  if ((s.pendingKeys || []).length) return { color: C.warn, text: 'Changes waiting to back up' };
  return { color: C.good, text: 'Cloud backup synced' };
};

export const MENU_ITEMS = [
  { view: 'dashboard', emoji: '🏠', label: 'Home' },
  { view: 'calendar', emoji: '📅', label: 'Calendar' },
  { view: 'log', emoji: '📋', label: 'Daily log' },
  { view: 'recovery', emoji: '💪', label: 'Recovery' },
  { view: 'charts', emoji: '📈', label: 'Charts' },
  { view: 'records', emoji: '🏆', label: 'Personal records' },
  { view: 'settings', emoji: '⚙️', label: 'Settings' }
];

// week: [{ key, letter, day, isToday, trained, planned }] for Sunday..Saturday.
export const MenuDrawer = ({ open, onClose, view, onNavigate, week, lastImport, onImport }) => {
  const closeRef = useRef(null);
  const sync = useSyncStatus();

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current && closeRef.current.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;
  const line = syncLine(sync);

  return h('div', { className: 'fixed inset-0 z-50', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu' },
    h('button', {
      type: 'button', 'aria-label': 'Close menu', tabIndex: -1, onClick: onClose,
      className: 'absolute inset-0 w-full h-full bg-black/70 anim-fade-in'
    }),
    h('nav', {
      className: 'absolute left-0 top-0 bottom-0 w-[318px] max-w-[85vw] bg-ink-card border-r border-ink-line flex flex-col gap-1.5 px-3.5 pb-5 overflow-y-auto anim-drawer-in',
      style: { paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }
    },
      h('div', { className: 'flex items-center justify-between px-1.5 pb-2.5' },
        h('div', { className: 'text-xl font-extrabold' }, 'Hypertrophy'),
        h('button', {
          ref: closeRef, type: 'button', 'aria-label': 'Close menu', onClick: onClose,
          className: 'w-11 h-11 rounded-full border border-ink-line bg-ink flex items-center justify-center'
        }, h(Icon, { name: 'close', size: 18 }))
      ),

      // This week at a glance: a dot on days with a logged workout.
      h('div', { className: 'flex justify-between px-0.5 pb-3', 'aria-label': 'This week' },
        week.map(d => h('div', {
          key: d.key,
          title: d.planned,
          className: `flex flex-col items-center gap-1 w-9 py-2 rounded-full ${d.isToday ? 'bg-accent text-accent-on' : ''}`
        },
          h('span', { className: 'text-[11px] font-bold' }, d.letter),
          h('span', { className: 'text-sm font-extrabold' }, d.day),
          h('span', {
            className: 'w-1.5 h-1.5 rounded-full',
            style: { background: d.trained ? (d.isToday ? C.onAccent : C.accent) : 'transparent', boxShadow: d.trained ? 'none' : `inset 0 0 0 1.5px ${d.isToday ? C.onAccent : C.neutral}` }
          })
        ))
      ),

      MENU_ITEMS.map(item => {
        const active = view === item.view;
        return h('button', {
          key: item.view, type: 'button',
          'aria-current': active ? 'page' : undefined,
          onClick: () => onNavigate(item.view),
          className: `flex items-center gap-3.5 h-14 px-4 rounded-full text-left text-[17px] ${active ? 'bg-accent text-accent-on font-extrabold' : 'text-ink-text font-bold'}`
        },
          h('span', { className: 'text-[22px] w-7 text-center', 'aria-hidden': 'true' }, item.emoji),
          item.label
        );
      }),

      h('div', { className: 'mt-auto bg-ink border border-ink-line rounded-[20px] p-3.5' },
        h('div', { className: 'text-sm font-bold' }, '⌚ Google Health'),
        h('div', { className: 'text-xs text-ink-muted mt-0.5' }, lastImport ? `Imported through ${lastImport}` : 'Not imported yet'),
        h('div', { className: 'flex gap-2 mt-2.5' },
          h('button', {
            type: 'button', onClick: onImport,
            className: 'flex-1 h-11 rounded-full border border-ink-line bg-ink-card font-bold text-sm'
          }, 'Import file'),
          h('button', {
            type: 'button', disabled: true, 'aria-disabled': 'true',
            className: 'flex-1 h-11 rounded-full border border-ink-line bg-transparent text-ink-muted font-bold text-sm cursor-not-allowed'
          }, 'Sync · soon')
        ),
        h('div', { className: 'flex items-center gap-1.5 text-xs text-ink-muted mt-2.5', role: 'status' },
          h('span', { className: 'w-2 h-2 rounded-full flex-none', style: { background: line.color } }),
          line.text
        )
      )
    )
  );
};
