'use strict';

// --- ES Module Imports ---
import React from 'react';
import ReactDOM from 'react-dom/client';

// --- Import our coach brain ---
import * as Coach from './coach.js';

// Add these imports after the existing imports
import {
  MUSCLES,
  EXERCISE_LIBRARY,
  CARDIO_LIBRARY,
  getAllExerciseNames as getAllLibraryExercises,
  getExerciseData,
  getExercisesForMuscle,
  getAllCardioNames,
  getCardioData,
  getCardioFields
} from './muscles.js';

import {
  processWorkoutHistory,
  getTrainingRecommendation,
  getRecoveryStatus,
  calculateSleepMultiplier,
  getSleepVerdict
} from './recovery.js';

// Cloud sync: watches localStorage, mirrors it to Supabase, restores it on a wiped phone.
import * as Sync from './sync.js';

// Google Health (Takeout) import: sleep, steps, calories burned.
import { readHealthExport, mergeHealthImport, mergeWorkoutImport, keepActivityFields, renameLegacyActivityFields } from './health-import.js';

// Redesign (Nov 2026): shared UI kit, the header + menu shell, and the new home screen.
import { C as UI_COLORS, fatigueColor, formatWorkoutName, SettingsGroup, Switch, getUiPrefs, saveUiPrefs, applyUiPrefs } from './ui.js';
import { AppHeader, MenuDrawer, scrollToTop } from './shell.js';
import { HomeScreen } from './home.js';
import { RecoveryScreen } from './recovery-screen.js';
import { CalendarScreen } from './calendar-screen.js';
import { ChartsScreen } from './charts-screen.js';
import { SessionBar, ExerciseCard, KeypadSheet, RestTimerBar, PRCelebration, AddExerciseSheet, ExerciseOptionsSheet, FinishSummary, Sheet } from './workout-ui.js';

// Alias React.createElement to 'h' for brevity
const h = React.createElement;

// Get React hooks
const { useState, useEffect, useRef, Fragment } = React;

// --- 🎯 USER & TRAINING CONTEXT (from prompt) ---
const USER_CONTEXT = {
  age: 32,
  startWeight: 139.5,
  targetWeight: 160,
  proteinTarget: 140, // Target Met
  proteinExcellent: 150, // Excellent
  proteinOutstanding: 160, // Outstanding
  calorieTargetTraining: 2800,
  calorieTargetRest: 2500,
};

// --- 📐 EMPIRICAL MAINTENANCE (arithmetic only; no AI anywhere in this path) ---
const MAINTENANCE_WINDOW_PREFERRED_DAYS = 28;
const MAINTENANCE_WINDOW_MIN_DAYS = 14;
const MAINTENANCE_MIN_INTAKE_DAYS = 10;
const MAINTENANCE_MIN_WEIGH_INS = 6;
const MAINTENANCE_CLAMP_LOW = 0.7;
const MAINTENANCE_CLAMP_HIGH = 1.5;
// A run of logged days ends when the next logged day is further off than this, so
// intake from before a long break is never paired with weight change from after it.
const MAINTENANCE_MAX_GAP_DAYS = 5;
// Stop estimating once food logging has simply stopped -- unless a marked sick/away
// range explains the silence, in which case the gap is accounted for, not missing.
const MAINTENANCE_MAX_STALE_DAYS = 7;
const MAINTENANCE_ANNOUNCE_THRESHOLD_KCAL = 150;
const GOAL_DRIFT_LB_THRESHOLD = 3;
const GOAL_DRIFT_MIN_WEIGHINS = 3;

// One table for the four modes. The formula calculator, the empirical Apply button and
// the hands-off auto-apply all read it, so the modes cannot drift apart between them.
const GOAL_ADJUSTMENTS = {
  cut: -500,          // 1 lb/week loss
  gaintain: 0,
  leanBulk: +250,     // 0.5 lb/week gain
  bulk: +500          // 1 lb/week gain
};
// An unknown or unset mode (goals saved before goalType existed) adjusts by nothing.
const goalAdjustmentFor = (goalType) =>
  Object.prototype.hasOwnProperty.call(GOAL_ADJUSTMENTS, goalType) ? GOAL_ADJUSTMENTS[goalType] : 0;

// --- 🏋️ TRAINING CYCLE PRESETS (from Claude's file) ---
const CYCLE_PRESETS = {
  'current-14-day': {
    name: 'Current 14-Day (Push/Pull/Legs)',
    days: [
      'REST', 'Push/Biceps', 'REST', 'Pull/Triceps', 'REST', 'Push/Biceps', 'Legs/Core',
      'REST', 'Pull/Triceps', 'REST', 'Push/Biceps', 'REST', 'Pull/Triceps', 'Legs/Core'
    ],
    description: 'Your current optimized 14-day cycle with integrated arm work'
  },
  'upper-lower-4day': {
    name: 'Upper/Lower 4-Day',
    days: ['Upper', 'Lower', 'REST', 'Upper', 'Lower', 'REST', 'REST'],
    description: 'Classic 4-day upper/lower split'
  },
  'ppl-6day': {
    name: 'PPL 6-Day',
    days: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'REST'],
    description: 'High frequency push/pull/legs, 6 days per week'
  },
  'full-body-3day': {
    name: 'Full Body 3x/week',
    days: ['Full Body', 'REST', 'Full Body', 'REST', 'Full Body', 'REST', 'REST'],
    description: 'Ideal for beginners or maintenance phases'
  },
  'arnold-split': {
    name: 'Arnold Split',
    days: ['Chest/Back', 'Shoulders/Arms', 'Legs', 'REST', 'Chest/Back', 'Shoulders/Arms', 'Legs'],
    description: 'Classic Arnold antagonist pairing approach'
  },
  'bro-split-5day': {
    name: 'Bro Split 5-Day',
    days: ['Chest', 'Back', 'REST', 'Shoulders', 'Legs', 'Arms', 'REST'],
    description: 'Traditional bodybuilding split, one muscle group per day'
  }
};

// Available workout types for custom cycles
const WORKOUT_TYPES = [
  'REST',
  'Push/Biceps',
  'Pull/Triceps',
  'Legs/Core',
  'Upper',
  'Lower',
  'Full Body',
  'Push',
  'Pull',
  'Legs',
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Chest/Back',
  'Shoulders/Arms',
  'Cardio',
  'Active Recovery'
];

// --- 💾 LOCALSTORAGE KEYS ---
const DB_KEY = 'hypertrophyApp.entries.v1';
const CYCLE_KEY = 'hypertrophyApp.cycle.v1';
const CUSTOM_CYCLES_KEY = 'hypertrophyApp.customCycles.v1';
const NUTRITION_KEY = 'hypertrophyApp.nutrition.v1'; // Separate nutrition DB (protein/calories only)
const SLEEP_KEY = 'hypertrophyApp.sleep.v1'; // Separate sleep DB (sleep + weight)
const DIET_GOALS_KEY = 'hypertrophyApp.dietGoals.v1'; // Diet goals
const MIGRATION_FLAG_KEY = 'hypertrophyApp.migrationV2.done'; // Migration tracker
const PROFILE_KEY = 'hypertrophyApp.profile.v1'; // User profile (height + age)
const SAVED_MEALS_KEY = 'hypertrophyApp.savedMeals.v1'; // Saved meals: per-serving nutrition you log in one tap (synced)
const MIGRATION_FLAG_V3_KEY = 'hypertrophyApp.migrationV3.done'; // Migration tracker for sleep split

// The shape App starts from and deleteAllData resets to. Spread, never mutated.
const DEFAULT_DIET_GOALS = {
  protein: 140, calories: 2200, enabled: false,
  goalType: null, calculatedAtWeight: null, calculatedAt: null,
  maintenanceSource: null, maintenanceLastShown: null,
  maintenanceExclusions: []
};

// --- 🛠️ HELPER FUNCTIONS ---
const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

// One rule for "is this a dumbbell exercise", shared by the PR card's per-hand display
// and the logging form's each-hand default, so the two cannot drift apart.
const isDumbbellExercise = (name) => /dumbbell|^db\b|\bdb\s/i.test(String(name || ''));

// Parse a YYYY-MM-DD string as LOCAL time (not UTC)
// This fixes the timezone issue where "2025-12-02" parsed as UTC becomes Dec 1 in some timezones
const parseLocalDate = (dateStr) => {
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }
  return new Date(dateStr);
};

// Normalize date to midnight local time (removes time component)
const normalizeDate = (date) => {
  // If it's a string, parse as local time
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Format date as YYYY-MM-DD using LOCAL timezone (not UTC)
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Time conversion helpers
const decimalToTime = (decimalHours) => {
  if (!decimalHours || decimalHours < 0) return { hours: 0, minutes: 0 };
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return { hours, minutes };
};

const timeToDecimal = (hours, minutes) => {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  return Math.max(0, h + (m / 60)); // Ensure non-negative
};

const formatSleepTime = (decimalHours) => {
  if (!decimalHours) return '0h 0m';
  const { hours, minutes } = decimalToTime(decimalHours);
  return `${hours}h ${minutes}m`;
};

const formatSleepDisplay = (totalHours, deepSleepPercent) => {
  const totalFormatted = formatSleepTime(totalHours);
  const deepHours = totalHours * (deepSleepPercent / 100);
  const deepFormatted = formatSleepTime(deepHours);
  return `${totalFormatted} total (${deepFormatted} deep, ${deepSleepPercent.toFixed(1)}%)`;
};

// Parse time strings like "8h 15m" or "1h 40m"
const parseTimeString = (timeStr) => {
  const hMatch = timeStr.match(/(\d+)h/);
  const mMatch = timeStr.match(/(\d+)m/);
  const hours = hMatch ? parseInt(hMatch[1]) : 0;
  const minutes = mMatch ? parseInt(mMatch[1]) : 0;
  return timeToDecimal(hours, minutes);
};

// Parse numbers with 'k' suffix (e.g., "3k" -> 3000)
const parseNumberWithSuffix = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const str = value.toString().trim().toLowerCase();
  if (str.endsWith('k')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? 0 : num * 1000;
  }
  // CRITICAL FIX: Always return a number, not the original string
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};

// Claude often wraps JSON in prose or a markdown code fence, so pull the object out of
// the response rather than parsing the whole string. Both AI callers go through this;
// two near-identical copies is the bug shape this codebase keeps hitting.
const parseAiJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned an invalid response.');
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    throw new Error('AI returned an invalid response.');
  }
};

// Safely get max weight from weights array (handles empty arrays and edge cases)
const getMaxWeight = (weights) => {
  if (!weights) return 0;
  if (!Array.isArray(weights)) return Number(weights) || 0;
  const validWeights = weights.filter(w => w > 0);
  return validWeights.length > 0 ? Math.max(...validWeights) : 0;
};

// Helper to check if an exercise is a pull-up variant
const isPullUpExercise = (exerciseName) => {
  if (!exerciseName) return false;
  const name = exerciseName.toLowerCase();
  return name.includes('pull-up') || name.includes('pullup') || name.includes('pull up');
};

  // Helper to calculate volume load with eachHand support
  const calculateVolumeLoad = (weights, reps, exerciseName = null, sleepEntries = [], eachHand = false) => {
    const weightMultiplier = eachHand ? 2 : 1; // Double weight if using each hand

    if (!Array.isArray(weights) || !Array.isArray(reps)) return 0;

    let totalVolume = 0;
    for (let i = 0; i < Math.min(weights.length, reps.length); i++) {
      const weight = Number(weights[i]) || 0;
      const rep = Number(reps[i]) || 0;
      totalVolume += (weight * weightMultiplier) * rep;
    }
    return totalVolume;
  };

// --- 🏃 CARDIO HELPERS ---
// Cardio lives in its own `cardio` array on a workout entry and is tracked as
// time + steps rather than weight x reps. Entries logged (or exported) before
// cardio existed simply have no `cardio` key, so every reader below defaults to
// an empty list and keeps old data rendering exactly as it always did.
const getCardioList = (entry) => Array.isArray(entry?.cardio) ? entry.cardio : [];

// Reshape saved cardio into the form's editable shape (values kept as strings so
// empty inputs stay empty instead of showing a stray 0)
// '' means "not tracked" for every optional field, so a value the user never entered
// never comes back as 0. A logged 0 survives as "0".
const asFormValue = (raw) => (raw === 0 || raw) ? String(raw) : '';

const normalizeCardioForForm = (cardioList) => (Array.isArray(cardioList) ? cardioList : []).map(c => {
  const row = {
    name: c.name || '',
    minutes: asFormValue(c.minutes),
    steps: asFormValue(c.steps),
    effort: asFormValue(c.effort),
    timing: c.timing || ''
  };
  // Machine-specific keys, whitelisted by the same table the form renders from.
  getCardioFields(c.name).forEach(f => { row[f.key] = asFormValue(c[f.key]); });
  return row;
});

// Save shape for one cardio row. minutes and steps keep their || 0 -- they are real
// summation input. The optional fields must not: a blank effort is null, never 0.
const toSavedCardioItem = (c) => {
  const name = String(c.name).trim();
  const item = {
    name,
    minutes: Number(c.minutes) || 0,
    steps: Number(c.steps) || 0,
    effort: optionalNumber(c.effort),
    timing: (c.timing === 'before' || c.timing === 'after') ? c.timing : null
  };
  getCardioFields(name).forEach(f => { item[f.key] = optionalNumber(c[f.key]); });
  return item;
};

// stepsByMachine is additive; minutes, steps and count keep their existing meaning.
// Two rows on the same machine sum into one key, since addCardio permits duplicates.
// Unnamed rows (a blank row still being filled in) contribute to the flat totals but
// get no key of their own.
const getCardioTotals = (entry) => getCardioList(entry).reduce((acc, c) => {
  const name = String(c.name || '').trim();
  if (name) {
    acc.stepsByMachine[name] = (acc.stepsByMachine[name] || 0) + (Number(c.steps) || 0);
  }
  return {
    minutes: acc.minutes + (Number(c.minutes) || 0),
    steps: acc.steps + (Number(c.steps) || 0),
    count: acc.count + 1,
    stepsByMachine: acc.stepsByMachine
  };
}, { minutes: 0, steps: 0, count: 0, stepsByMachine: {} });

// Renders one optional cardio value. Same missing-is-"—" rule as formatMacro, minus
// the rounding, because speed and incline are legitimately fractional.
const formatCardioValue = (value) => value === null ? '—' : String(value);

// Short one-line summary, e.g. "45 min | 3,200 steps" - null when nothing logged
const formatCardioSummary = (entry) => {
  const { minutes, steps, count } = getCardioTotals(entry);
  if (count === 0) return null;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} min`);
  if (steps > 0) parts.push(`${steps.toLocaleString()} steps`);
  return parts.length > 0 ? parts.join(' | ') : `${count} cardio session${count !== 1 ? 's' : ''}`;
};

// --- 🔄 DATA MIGRATION FUNCTION ---
// Migrates old entries (with sleep/nutrition in workout) to separated structure
const migrateToSeparatedData = () => {
  // Check if migration already completed
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
    console.log('Migration already completed, skipping...');
    return { migrated: false };
  }

  console.log('Starting data migration to separated nutrition/workout structure...');

  const workoutEntries = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
  const existingNutrition = JSON.parse(localStorage.getItem(NUTRITION_KEY) || '[]');

  const newNutritionEntries = [];
  const updatedWorkoutEntries = [];

  workoutEntries.forEach(entry => {
    // Create nutrition entry if this workout has sleep/nutrition data
    if (entry.sleepHours || entry.weight || entry.recoveryRating) {
      const nutritionEntry = {
        id: generateId(),
        date: entry.date,
        sleepHours: entry.sleepHours || 0,
        deepSleepPercent: entry.deepSleepPercent || 0,
        deepSleepMinutes: entry.deepSleepMinutes || 0,
        protein: 0, // Old entries didn't store protein in workout
        calories: 0, // Old entries didn't store calories in workout
        weight: entry.weight || 0,
        recoveryRating: entry.recoveryRating || 8
      };

      // Only add if we don't already have nutrition for this date
      const existsForDate = existingNutrition.some(n => n.date === entry.date) ||
                            newNutritionEntries.some(n => n.date === entry.date);
      if (!existsForDate) {
        newNutritionEntries.push(nutritionEntry);
      }
    }

    // Create cleaned workout entry (remove nutrition fields)
    const { sleepHours, deepSleepPercent, deepSleepMinutes, weight, recoveryRating, grade, ...workoutData } = entry;
    updatedWorkoutEntries.push(workoutData);
  });

  // Save migrated data
  localStorage.setItem(DB_KEY, JSON.stringify(updatedWorkoutEntries));
  localStorage.setItem(NUTRITION_KEY, JSON.stringify([...existingNutrition, ...newNutritionEntries]));
  localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

  console.log(`Migration complete! Created ${newNutritionEntries.length} nutrition entries.`);
  return { migrated: true, nutritionCreated: newNutritionEntries.length };
};

// --- 🔄 DATA MIGRATION V3 FUNCTION ---
// Splits nutrition entries (with sleep + nutrition) into separate sleep and nutrition arrays
const migrateToSplitSleepNutrition = () => {
  // Check if migration already completed
  if (localStorage.getItem(MIGRATION_FLAG_V3_KEY)) {
    console.log('Sleep/Nutrition split migration already completed, skipping...');
    return { migrated: false };
  }

  console.log('Starting migration to split sleep and nutrition data...');

  const existingNutrition = JSON.parse(localStorage.getItem(NUTRITION_KEY) || '[]');
  const existingSleep = JSON.parse(localStorage.getItem(SLEEP_KEY) || '[]');

  const newNutritionEntries = [];
  const newSleepEntries = [];

  // Group existing nutrition by date to handle duplicates
  const sleepByDate = new Map();

  existingNutrition.forEach(entry => {
    // Extract sleep data if present (only keep latest per date)
    if (entry.sleepHours || entry.weight || entry.recoveryRating) {
      const existingSleepForDate = sleepByDate.get(entry.date);

      // Only add if no sleep for this date yet, or this entry has more complete data
      if (!existingSleepForDate || (entry.sleepHours > existingSleepForDate.sleepHours)) {
        const sleepEntry = {
          id: generateId(),
          date: entry.date,
          sleepHours: entry.sleepHours || 0,
          deepSleepPercent: entry.deepSleepPercent || 0,
          weight: entry.weight || 0,
          recoveryRating: entry.recoveryRating || 0
        };
        console.log(`[Migration V3] Creating sleep entry for ${entry.date}:`, sleepEntry);
        sleepByDate.set(entry.date, sleepEntry);
      }
    }

    // Extract nutrition data if present (allow multiple per day)
    if (entry.protein || entry.calories) {
      newNutritionEntries.push({
        id: entry.id, // Keep original ID
        date: entry.date,
        protein: Number(entry.protein) || 0,
        calories: Number(entry.calories) || 0
      });
    }
  });

  // Convert sleep map to array
  sleepByDate.forEach(sleepEntry => {
    newSleepEntries.push(sleepEntry);
  });

  // Save migrated data
  localStorage.setItem(NUTRITION_KEY, JSON.stringify(newNutritionEntries));
  localStorage.setItem(SLEEP_KEY, JSON.stringify([...existingSleep, ...newSleepEntries]));
  localStorage.setItem(MIGRATION_FLAG_V3_KEY, 'true');

  console.log(`Migration V3 complete! Created ${newSleepEntries.length} sleep entries and ${newNutritionEntries.length} nutrition entries.`);
  return { migrated: true, sleepCreated: newSleepEntries.length, nutritionCreated: newNutritionEntries.length };
};

// --- 🔄 DATA MIGRATION V4 FUNCTION ---
// Recalculates cycleDay for all existing entries, anchored to Sundays
// D0 always falls on a Sunday, so any date's cycleDay = daysSinceSunday % cycleLength
const MIGRATION_FLAG_V4_KEY = 'hypertrophy-pwa-migrationV4Done';
const MIGRATION_V4_VERSION = 'v6'; // v6 anchors cycle days to Sundays

// Helper: Get cycle day for any date, anchored to Sundays
// Uses a fixed reference Sunday (Jan 5, 2025) so D0 always falls on Sunday
// For a 14-day cycle: Week 1 = D0-D6, Week 2 = D7-D13
const getCycleDayForDate = (dateInput, cycleLength) => {
  const date = typeof dateInput === 'string' ? parseLocalDate(dateInput) : new Date(dateInput);
  const refSunday = new Date(2025, 0, 5); // Jan 5, 2025 = Sunday
  refSunday.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const daysSinceRef = Math.round((date - refSunday) / (1000 * 60 * 60 * 24));
  return ((daysSinceRef % cycleLength) + cycleLength) % cycleLength; // Handle negative values
};

const recalculateCycleDays = (trainingCycle) => {
  // Check if migration already completed with current version
  const currentVersion = localStorage.getItem(MIGRATION_FLAG_V4_KEY);
  console.log(`[Migration V4] Current flag value: "${currentVersion}", expected: "${MIGRATION_V4_VERSION}"`);

  if (currentVersion === MIGRATION_V4_VERSION) {
    console.log('CycleDay recalculation migration already completed, skipping...');
    return { migrated: false };
  }

  console.log('Starting migration to recalculate cycle days (anchored to Sundays)...');

  const existingData = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
  console.log(`[Migration V4] Found ${existingData.length} entries in localStorage`);

  if (existingData.length === 0) {
    console.log('[Migration V4] No entries to migrate');
    localStorage.setItem(MIGRATION_FLAG_V4_KEY, MIGRATION_V4_VERSION);
    return { migrated: false };
  }

  const cycleLength = trainingCycle.length;

  // Sort entries by date (using parseLocalDate to avoid timezone issues)
  const sortedEntries = [...existingData].sort((a, b) => {
    const dateA = parseLocalDate(a.date);
    const dateB = parseLocalDate(b.date);
    return dateA - dateB;
  });

  // Recalculate cycleDay for each entry based on day of week
  // This ensures D0 always falls on Sunday
  console.log('[Migration V4] Starting cycle day recalculation (Sunday-anchored)...');
  console.log('[Migration V4] Cycle length:', cycleLength);
  console.log('[Migration V4] Training cycle:', trainingCycle);

  sortedEntries.forEach((entry, index) => {
    const date = parseLocalDate(entry.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // For a 14-day cycle, we need to also consider which week we're in
    // Week 1: Sun=D0, Mon=D1, Tue=D2, Wed=D3, Thu=D4, Fri=D5, Sat=D6
    // Week 2: Sun=D7, Mon=D8, Tue=D9, Wed=D10, Thu=D11, Fri=D12, Sat=D13
    // To determine which week, we use the week number since a reference point

    // Use a fixed reference Sunday (e.g., Jan 5, 2025 which is a Sunday)
    const refSunday = new Date(2025, 0, 5); // Jan 5, 2025 = Sunday
    refSunday.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    const daysSinceRef = Math.round((date - refSunday) / (1000 * 60 * 60 * 24));
    const cycleDay = ((daysSinceRef % cycleLength) + cycleLength) % cycleLength; // Handle negative values

    console.log(`[Migration V4] Entry ${index}: ${entry.date} (${date.toLocaleDateString('en-US', {weekday: 'short'})}) -> cycleDay: ${cycleDay} (days since ref Sunday: ${daysSinceRef})`);

    entry.cycleDay = cycleDay;
  });

  // Save the corrected entries
  localStorage.setItem(DB_KEY, JSON.stringify(sortedEntries));
  localStorage.setItem(MIGRATION_FLAG_V4_KEY, MIGRATION_V4_VERSION);

  console.log(`Migration V4 complete! Recalculated cycle days for ${sortedEntries.length} entries.`);
  return { migrated: true, entriesUpdated: sortedEntries.length };
};

// Sleep quality is judged by getSleepVerdict in recovery.js -- duration first,
// deep sleep in absolute MINUTES. These two used to run their own deep-sleep
// PERCENTAGE ladders, which meant the daily panel labelled a 9h30m night with
// 62 min of deep sleep "POOR" (62/570 = 10.9%) while the recovery panel called
// the same night adequate. Percentage falls as duration rises; that is the bug.
const getGrade = (sleep, totalSets) => {
  if (!sleep || totalSets === null || totalSets === undefined) return 'N/A';
  const { tier } = getSleepVerdict(sleep.sleepHours, sleep.deepSleepPercent, sleep.recoveryRating);
  if (tier <= 0 && totalSets >= 22) return 'S++';
  if (tier <= 1 && totalSets >= 20) return 'S/A+';
  if (tier <= 2 && totalSets >= 16) return 'A/A+';
  if (tier <= 2 && totalSets >= 14) return 'B+';
  if (tier === 3 && totalSets < 14) return 'C';
  return 'B';
};

const getSleepQualityStars = (totalSleepHours, deepSleepPercent, recoveryRating) =>
  getSleepVerdict(totalSleepHours, deepSleepPercent, recoveryRating).qualityLabel;

// Flat, symmetric training-day bonus. A weekly training/rest split would need
// day-counting and divides by zero on an all-training cycle; this cannot.
// Anything that is not REST (lifting, cardio, active recovery) counts as training.
const TRAINING_DAY_CALORIE_BONUS = 125; // kcal, symmetric either way

// null when goals are off so callers render "—" rather than a fake 0.
const getTodaysCalorieTarget = (todaysWorkoutType, dietGoals) => {
  if (!dietGoals || !dietGoals.enabled) return null;
  const isRestDay = todaysWorkoutType === 'REST';
  return dietGoals.calories + (isRestDay ? -TRAINING_DAY_CALORIE_BONUS : TRAINING_DAY_CALORIE_BONUS);
};

// Goals are passed in rather than read from localStorage here. App owns them, and a
// second component reading the same concept from a different source is precisely how
// the sleep data went silently wrong. Falls back to USER_CONTEXT when none is given.
const getProteinStatus = (protein, dietGoals = null) => {
  if (dietGoals && dietGoals.enabled) {
    const target = dietGoals.protein;
    if (protein >= target * 1.2) return h('span', { className: 'text-cyan-400 font-bold' }, 'Outstanding');
    if (protein >= target * 1.1) return h('span', { className: 'text-green-400 font-bold' }, 'Excellent');
    if (protein >= target) return h('span', { className: 'text-green-500' }, 'Target Met');
    return h('span', { className: 'text-yellow-500' }, `${target - protein}g short`);
  }

  // Use default USER_CONTEXT targets
  if (protein >= USER_CONTEXT.proteinOutstanding) return h('span', { className: 'text-cyan-400 font-bold' }, 'Outstanding');
  if (protein >= USER_CONTEXT.proteinExcellent) return h('span', { className: 'text-green-400 font-bold' }, 'Excellent');
  if (protein >= USER_CONTEXT.proteinTarget) return h('span', { className: 'text-green-500' }, 'Target Met');
  return h('span', { className: 'text-yellow-500' }, 'Below Target');
};

const calculateAllPRs = (entries) => {
  const prs = new Map();
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const entry of sortedEntries) {
    if (!entry.exercises) continue;
    for (const ex of entry.exercises) {
      // Get max weight from the exercise (support both old and new format)
      const maxWeight = Array.isArray(ex.weights)
        ? getMaxWeight(ex.weights)
        : (ex.weight || 0);

      const currentPR = prs.get(ex.name);
      if (!currentPR || maxWeight > currentPR.weight) {
        prs.set(ex.name, {
          name: ex.name,
          weight: maxWeight,
          sets: ex.sets,
          reps: ex.reps.join('/'),
          date: entry.date,
        });
      }
    }
  }
  return Array.from(prs.values()).sort((a, b) => b.weight - a.weight);
};

const getPreviousPR = (exerciseName, allEntries, currentEntryId) => {
  let maxWeight = 0;
  for (const entry of allEntries) {
    if (entry.id === currentEntryId || !entry.exercises) continue;
    for (const ex of entry.exercises) {
      if (ex.name === exerciseName) {
        // Support both old and new format
        const exMaxWeight = Array.isArray(ex.weights)
          ? getMaxWeight(ex.weights)
          : (ex.weight || 0);
        if (exMaxWeight > maxWeight) {
          maxWeight = exMaxWeight;
        }
      }
    }
  }
  return maxWeight;
};

// Calories per gram. Used to derive calories from macros and to cross-check
// a manually entered calorie figure.
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

// Returns null when a value is absent — absent means "not tracked", which is
// different from a logged zero. The one definition of that rule; the macro fields
// and the optional cardio fields both go through it.
const optionalNumber = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

// Callers decide how to display null.
const macroValue = (entry, field) => {
  if (entry == null) return null;
  return optionalNumber(entry[field]);
};

// Carbs are assumed to be logged the way labels report them, Total Carbohydrate with
// fiber included, so counting every carb gram at 4 overcounts the fiber. fiber is
// optional and defaults to 0, which leaves three-argument callers exactly as they were.
const caloriesFromMacros = (protein, carbs, fat, fiber = 0) =>
  Math.round(
    (Number(protein) || 0) * KCAL_PER_G.protein +
    (Number(fat) || 0) * KCAL_PER_G.fat +
    (Number(carbs) || 0) * KCAL_PER_G.carbs -
    (Number(fiber) || 0) * (KCAL_PER_G.carbs - 2) // fiber nets out at ~2 kcal/g, not 4
  );

const hasCompleteMacros = (entry) =>
  macroValue(entry, 'protein') !== null &&
  macroValue(entry, 'carbs') !== null &&
  macroValue(entry, 'fat') !== null;

const formatMacro = (value, suffix = 'g') =>
  value === null ? '—' : `${Math.round(value)}${suffix}`;

// --- 🍽️ NATURAL-LANGUAGE MEAL LOGGING ---
// Division of labour: the model turns prose into a food name and a gram figure, because
// resolving "a handful" is judgment about language. USDA supplies per-100g facts. The
// arithmetic below is the only thing that multiplies. The model never does.

// Coverage is the share of query words the candidate accounts for. 0.8 is high enough to
// reject a branded search whose brand is simply not in the database (a Costco item scores
// 0.75 against every rotisserie-chicken hit) while still accepting exact generic matches.
const USDA_MIN_COVERAGE = 0.8;
// The generic tier is deliberately looser: it is asking "what everyday food is this like",
// and the answer is labelled as a similar food rather than an exact one. "ham and cheese
// pastry" only covers two thirds of "Danish pastry, cheese", and that is the right match.
// Still high enough that a Costco item (0.75) does not sneak through the specific tier.
const USDA_MIN_COVERAGE_GENERIC = 0.6;

// Filler words carry no food meaning but inflate the denominator: "ham and cheese pastry"
// scored 0.5 purely because "and" could never match anything.
const FOOD_STOPWORDS = new Set(['and', 'with', 'of', 'the', 'a', 'an', 'in', 'on', 'or', 'plus']);

// A candidate must be ABOUT the queried food, not merely mention it. "Ice cream, lowfat,
// no sugar added, cone, added peanuts and sauce" contains both words of "cream sauce" and
// so scored a perfect 1.0, outranking every actual cream -- but only 2 of its 12 words are
// query words. The good match "Danish pastry, cheese" is 2 of 3. Requiring at least a
// third of the description to be query words separates the two.
const USDA_MIN_DENSITY = 1 / 3;

// Plural folding only, applied to both sides, so consistency matters more than
// linguistic correctness: "banana" has to meet "Bananas, raw", and "hummus" mangled the
// same way on both sides still matches itself. Stripping "ed" as well was tried and
// reverted -- it collapsed "rolled" and "rolls" together, matching rolled oats to dinner
// rolls, and the only thing it bought was black coffee at 7 kcal instead of 5.
const stemFoodToken = (t) => t.replace(/s$/, '');

const tokenizeFoodText = (s) =>
  (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).map(stemFoodToken);

// Rank in code rather than with a second AI call: that would double the credit cost of
// every meal to do a job string comparison already handles.
const scoreFoodCandidate = (queryTokens, food) => {
  const descTokens = tokenizeFoodText(food.description);
  const haystack = new Set([...descTokens, ...tokenizeFoodText(food.brandOwner)]);
  const matched = queryTokens.filter(t => haystack.has(t)).length;
  // USDA descriptions read "HeadNoun, qualifier, qualifier" and grow more specific as
  // they lengthen. So the query words should sit as early as possible: for "white rice",
  // "Rice, white, ..." (positions 0,1) is the food itself, while "Rice flour, white"
  // (0,2) and "Flour, rice, white" (1,2) are a different food that merely mentions it.
  // Summing the matched positions captures that; the shorter, more generic entry
  // then wins any remaining tie.
  let positionSum = 0;
  for (const token of queryTokens) {
    const idx = descTokens.indexOf(token);
    positionSum += idx === -1 ? descTokens.length : idx;
  }
  return {
    coverage: queryTokens.length ? matched / queryTokens.length : 0,
    // What share of the description is actually about the query.
    density: descTokens.length ? matched / descTokens.length : 0,
    positionSum,
    length: descTokens.length
  };
};

const pickBestFood = (foods, query, minCoverage = USDA_MIN_COVERAGE) => {
  const all = tokenizeFoodText(query);
  // Score against meaningful words only; fall back to the raw tokens if a query is
  // nothing but stopwords.
  const meaningful = all.filter(t => !FOOD_STOPWORDS.has(t));
  const queryTokens = meaningful.length > 0 ? meaningful : all;
  if (queryTokens.length === 0) return null;
  const ranked = (foods || [])
    .map(food => ({ food, ...scoreFoodCandidate(queryTokens, food) }))
    .filter(c => c.coverage >= minCoverage && c.density >= USDA_MIN_DENSITY)
    .sort((a, b) => (b.coverage - a.coverage) || (a.positionSum - b.positionSum) || (a.length - b.length));
  return ranked.length > 0 ? ranked[0].food : null;
};

// Search results are per 100 g for every dataType, verified against the Core Power label.
// A macro the database does not carry stays null rather than becoming 0.
const scalePer100 = (per100, grams) => {
  const factor = Number(grams) / 100;
  const out = {};
  for (const key of ['protein', 'carbs', 'fat', 'fiber']) {
    const v = optionalNumber(per100 ? per100[key] : null);
    out[key] = v === null ? null : Math.round(v * factor * 10) / 10;
  }
  const cal = optionalNumber(per100 ? per100.calories : null);
  out.calories = cal === null ? null : Math.round(cal * factor);
  return out;
};

// Turns prose into items. No lookups and no arithmetic here.
async function parseMealDescription(text) {
  if (!navigator.onLine) {
    throw new Error('You are offline, so the description cannot be read. Enter the macros by hand.');
  }

  const prompt = `Read this description of a meal and break it into individual food items.

MEAL: ${text}

For each item, resolve the portion the person described into a number of GRAMS, using
ordinary judgment about how much food that is: a handful of shredded cheese, a scoop of
rice, a medium banana. A gram figure is always required -- never null, never a range.

Fields per item:
- "name": the food and the portion as you understood it, echoed back for the person to check.
- "searchTerm": the plain food name for a nutrition database lookup. No portion words and
  no brand: "cheddar cheese", not "a handful of shredded cheddar".
- "grams": the portion resolved to grams, as a number.
- "brand": include ONLY if the person actually named a brand.
- "genericSearchTerm": the closest EVERYDAY food this resembles, used only if the
  specific item is not in the database. Map restaurant and bakery items onto the ordinary
  food they most resemble: "ham and cheese kolache" -> "ham and cheese pastry";
  "breakfast taco" -> "breakfast burrito". Always give one, even when searchTerm is
  already generic -- repeat searchTerm in that case.
- "estimated": your own macro estimate FOR THE STATED PORTION. This is a last-resort
  fallback used only when the database has no match at all, so give your best figures.
  Omit any macro you genuinely do not know -- never use 0 to mean unknown.

Do not underestimate prepared, restaurant or bakery food. Pastries, sandwiches and fried
items carry far more fat and calories than their size suggests; a filled pastry the size
of a fist is several hundred calories, not one hundred. Then check your own arithmetic:
protein*4 + carbs*4 + fat*9 should land within about 10% of the calorie figure you give.
If it does not, correct the figure before answering.

Return per-item values only. Never return totals; those are calculated separately.

Respond with ONLY the JSON object below - no markdown code fences, no prose before or
after it, and no explanation. The entire response must parse as JSON.

{
  "items": [
    {
      "name": "a handful of shredded cheddar (about 30 g)",
      "searchTerm": "cheddar cheese",
      "genericSearchTerm": "cheddar cheese",
      "grams": 30,
      "brand": "",
      "estimated": { "protein": 7, "carbs": 0.7, "fat": 10, "fiber": 0, "calories": 120 }
    }
  ]
}`;

  const res = await fetch('/.netlify/functions/get-vision-extraction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: [{ type: 'text', text: prompt }] })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`AI Gateway failed: ${errData.error || res.statusText}`);
  }

  const data = await res.json();
  // The shared helper, deliberately. It already strips fences and prose and throws the
  // one message every AI caller reports; a fourth private copy is what it exists to stop.
  const parsed = parseAiJson(data.text);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

// One USDA attempt. Returns the best candidate or null; a failure here is never fatal,
// because the caller still has a generic term and an estimate to fall back on.
async function lookupUsda(query, dataType, minCoverage) {
  if (!query) return null;
  try {
    const res = await fetch('/.netlify/functions/lookup-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, dataType })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return pickBestFood(data.foods, query, minCoverage);
  } catch (err) {
    console.error('USDA lookup failed:', err);
    return null;
  }
}

// One resolved row per item, resolved in three tiers: the exact food, then the everyday
// food it resembles, then the model's own guess. The middle tier is what stops a bakery
// item from being guessed at -- a Slowpokes kolache is not in USDA, but "ham and cheese
// pastry" is, and it lands an order of magnitude closer than the estimate did. It costs
// no extra AI call: genericSearchTerm rides along in the parse the model already returns.
async function resolveMealItems(items) {
  const rows = [];

  for (const item of (items || [])) {
    const grams = optionalNumber(item.grams);
    const searchTerm = String(item.searchTerm || item.name || '').trim();
    const genericTerm = String(item.genericSearchTerm || '').trim();
    const brand = String(item.brand || '').trim();
    const estimated = item.estimated || {};

    // The estimate is already for the stated portion, so it is used as-is, never scaled.
    const asEstimate = () => ({
      name: item.name || searchTerm,
      grams,
      source: 'estimate',
      matchedName: null,
      protein: optionalNumber(estimated.protein),
      carbs: optionalNumber(estimated.carbs),
      fat: optionalNumber(estimated.fat),
      fiber: optionalNumber(estimated.fiber),
      calories: optionalNumber(estimated.calories)
    });

    if (!searchTerm || grams === null || !navigator.onLine) {
      rows.push(asEstimate());
      continue;
    }

    // Tier 1: the food as described, branded if a brand was named.
    const query = brand ? `${brand} ${searchTerm}` : searchTerm;
    let best = await lookupUsda(query, brand ? 'Branded' : 'Foundation,SR Legacy');
    let source = 'usda';

    // Tier 2: the everyday equivalent. Generic foods live in Foundation/SR Legacy, so
    // this always searches there even when tier 1 was a branded search. It runs even when
    // the generic term repeats the search term, because the looser gate can still find a
    // match the exact tier rejected.
    if (!best && genericTerm) {
      best = await lookupUsda(genericTerm, 'Foundation,SR Legacy', USDA_MIN_COVERAGE_GENERIC);
      if (best) source = 'usda-generic';
    }

    // Tier 3: the model's own figures for the stated portion.
    if (!best) {
      rows.push(asEstimate());
      continue;
    }

    rows.push({
      name: item.name || searchTerm,
      grams,
      source,
      matchedName: best.description,
      ...scalePer100(best.per100, grams)
    });
  }

  return rows;
}

// Pure. A macro totals to a number ONLY when every row carries it; otherwise null. A
// partial sum presented as a total is a wrong number wearing a right number's clothes,
// and it would flow straight into the daily totals. Calories are deliberately NOT derived
// from the macros here -- MacroCalorieHint already cross-checks the two and offers the
// derived figure, which is the safety net for an internally inconsistent parse.
const sumMealItems = (rows) => {
  const list = rows || [];
  const totals = {};
  for (const key of ['protein', 'carbs', 'fat', 'fiber', 'calories']) {
    let sum = 0;
    let complete = list.length > 0;
    for (const row of list) {
      const v = optionalNumber(row ? row[key] : null);
      if (v === null) { complete = false; break; }
      sum += v;
    }
    totals[key] = complete ? (key === 'calories' ? Math.round(sum) : Math.round(sum * 10) / 10) : null;
  }
  return totals;
};

// Helper to get nutrition totals for a *specific day*
const getNutritionForDate = (nutritionLog, date) => {
  const entriesForDate = nutritionLog.filter(n => n.date === date);
  // CRITICAL FIX: Explicitly convert to Number to prevent string concatenation
  const totalProtein = entriesForDate.reduce((sum, entry) => sum + (Number(entry.protein) || 0), 0);
  const totalCalories = entriesForDate.reduce((sum, entry) => sum + (Number(entry.calories) || 0), 0);
  // Summing: an entry that never tracked carbs/fat/fiber correctly contributes nothing.
  const totalCarbs = entriesForDate.reduce((sum, entry) => sum + (Number(entry.carbs) || 0), 0);
  const totalFat = entriesForDate.reduce((sum, entry) => sum + (Number(entry.fat) || 0), 0);
  const totalFiber = entriesForDate.reduce((sum, entry) => sum + (Number(entry.fiber) || 0), 0);

  // Get latest entry for the date (for sleep, weight, recovery)
  const latestEntry = entriesForDate.length > 0 ? entriesForDate[entriesForDate.length - 1] : null;

  // Get latest entry with weight > 0 (Quick Add Meals have weight: 0)
  const latestWeightEntry = [...entriesForDate].reverse().find(e => Number(e.weight) > 0);

  // Count meals (entries with any of protein, calories, carbs, fat or fiber > 0).
  // Old entries have none of the optional fields, so their count is unchanged.
  const mealCount = entriesForDate.filter(e =>
    (Number(e.protein) || 0) > 0 ||
    (Number(e.calories) || 0) > 0 ||
    (Number(e.carbs) || 0) > 0 ||
    (Number(e.fat) || 0) > 0 ||
    (Number(e.fiber) || 0) > 0
  ).length;

  return {
    totalProtein,
    totalCalories,
    totalCarbs,
    totalFat,
    totalFiber,
    // Coverage flags let the UI tell "ate no carbs" from "carbs were never logged".
    carbsTracked: entriesForDate.some(e => macroValue(e, 'carbs') !== null),
    fatTracked: entriesForDate.some(e => macroValue(e, 'fat') !== null),
    fiberTracked: entriesForDate.some(e => macroValue(e, 'fiber') !== null),
    mealCount,
    sleepHours: latestEntry?.sleepHours || 0,
    deepSleepPercent: latestEntry?.deepSleepPercent || 0,
    deepSleepMinutes: latestEntry?.deepSleepMinutes || 0,
    weight: latestWeightEntry?.weight || 0,
    recoveryRating: latestEntry?.recoveryRating || 0
  };
};

// Helper to get *today's* nutrition totals
const getTodaysNutrition = (nutritionLog) => {
  return getNutritionForDate(nutritionLog, formatDate(new Date()));
};

// Age is DERIVED from the stored birth date on every read and never persisted.
// A stored age goes quietly wrong on the user's next birthday -- the same class of
// bug as the hardcoded 32 this replaced, just one layer down.
//
// The explicit local-midnight construction matters: new Date('1993-04-20') parses as
// UTC, so at UTC-5 it lands on the 19th and the birthday would roll over a day early.
const ageFromBirthDate = (isoDate, today = new Date()) => {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const birth = new Date(year, month - 1, day); // local midnight, not UTC
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return null; // rejects 2025-02-30 and friends, which Date would roll forward
  }
  let age = today.getFullYear() - year;
  const beforeBirthdayThisYear =
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day);
  if (beforeBirthdayThisYear) age -= 1;
  return age >= 0 && age < 120 ? age : null;
};

// User profile: height plus either a birth date (preferred) or a bare age saved by
// an earlier version. Falls back to USER_CONTEXT so installs with no saved profile
// keep working unchanged.
const getProfile = () => {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    const derivedAge = ageFromBirthDate(parsed.birthDate);
    const storedAge = Number(parsed.age) > 0 ? Number(parsed.age) : null;
    return {
      heightInches: Number(parsed.heightInches) > 0 ? Number(parsed.heightInches) : 70,
      birthDate: derivedAge !== null ? parsed.birthDate : null,
      age: derivedAge !== null ? derivedAge : (storedAge !== null ? storedAge : USER_CONTEXT.age),
      ageSource: derivedAge !== null ? 'birthDate' : (storedAge !== null ? 'stored' : 'default')
    };
  } catch (e) {
    return { heightInches: 70, birthDate: null, age: USER_CONTEXT.age, ageSource: 'default' };
  }
};

// Persists a birth date when there is one, and only then falls back to storing a bare
// age -- so once a birth date exists the stale age field is dropped rather than kept
// alongside it, where it could later be read back by mistake.
const saveProfile = (profile) => {
  const clean = { heightInches: Number(profile.heightInches) };
  if (profile.birthDate && ageFromBirthDate(profile.birthDate) !== null) {
    clean.birthDate = profile.birthDate;
  } else if (Number(profile.age) > 0) {
    clean.age = Number(profile.age);
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
};

const inchesToCm = (inches) => Number(inches) * 2.54;

const formatHeight = (inches) => {
  const n = Number(inches);
  if (!(n > 0)) return '—';
  return `${Math.floor(n / 12)}'${Math.round(n % 12)}"`;
};

// Helper to get current weight from sleep entries
const getCurrentWeight = (sleepEntries) => {
  // Find the most recent entry with weight > 0
  const latestWeightEntry = [...sleepEntries].reverse().find(e => Number(e.weight) > 0);
  return latestWeightEntry?.weight || USER_CONTEXT.startWeight;
};

// Mifflin-St Jeor (male) BMR times the activity multiplier. The single home for this
// arithmetic: the calculator and the estimator's clamp both call it, so there is no
// second copy to drift.
const calculateMifflinTdee = (weight, activityLevel) => {
  const profile = getProfile();
  const heightCm = inchesToCm(profile.heightInches);
  const bmr = 10 * (weight * 0.453592) + 6.25 * heightCm - 5 * profile.age + 5;

  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9
  };

  return Math.round(bmr * activityMultipliers[activityLevel]);
};

// Shared windows. The estimator and the drift check both use these, so they cannot
// disagree about what "recent" means.
const getWindowedWeighIns = (sleepEntries, days, now = new Date()) => {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return sleepEntries
    .filter(e => Number(e.weight) > 0 && new Date(e.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

const getWindowedIntakeDays = (nutrition, days, now = new Date()) => {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const dates = [...new Set(
    nutrition.filter(n => new Date(n.date) >= cutoff).map(n => n.date)
  )];
  return dates
    .map(date => ({ date, totals: getNutritionForDate(nutrition, date) }))
    .filter(d => d.totals.totalCalories > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

// --- Sick / away ranges ----------------------------------------------------
// Days the user has marked as unrepresentative. Illness and travel produce real but
// atypical intake (200-750 kcal) whose weight swing is water and glycogen, and it
// rebounds; worse, mean intake counts only days with food logged while the weight
// slope counts every weigh-in, so an unmarked sick spell pairs intake from one
// period with weight change from another.
//
// Shape: [{ id, from, to, reason }] with inclusive "YYYY-MM-DD" dates. Stored on
// dietGoals, so an old backup without the field reads as [].
const normaliseMaintenanceExclusions = (exclusions) => {
  if (!Array.isArray(exclusions)) return [];
  const isRealDate = (s) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && formatDate(parseLocalDate(s)) === s;
  return exclusions.filter(r => r && isRealDate(r.from) && isRealDate(r.to) && r.from <= r.to);
};

// Whole days between two "YYYY-MM-DD" dates. Rounded, so a DST boundary inside the
// span cannot turn an exact number of days into 5.958.
const daysBetweenDates = (fromStr, toStr) =>
  Math.round((parseLocalDate(toStr) - parseLocalDate(fromStr)) / 86400000);

// ISO dates compare correctly as strings, and every range is already normalised.
const isDateExcluded = (dateStr, ranges) => ranges.some(r => dateStr >= r.from && dateStr <= r.to);

const MAINTENANCE_EXCLUSION_REASONS = { sick: 'Sick', away: 'Away', other: 'Other' };

// Last calendar day with any food logged, or null. Drives the "mark the gap" prefill.
const latestIntakeDate = (nutrition) => {
  const dates = (nutrition || [])
    .filter(n => n && typeof n.date === 'string')
    .map(n => n.date)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
};

// "Sep 25 – today", the span the stale prefill would cover.
const staleRangeLabel = (nutrition) => {
  const lastLogged = latestIntakeDate(nutrition);
  if (!lastLogged) return 'the gap';
  const dayAfter = parseLocalDate(lastLogged);
  dayAfter.setDate(dayAfter.getDate() + 1);
  return `${dayAfter.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – today`;
};

// Maintenance from logged data: mean intake minus the calories implied by the weight
// trend (3500 kcal/lb). The formula survives only as a cold start and a sanity clamp.
// Returns { available: false, gateProgress } until there is enough history, so the UI
// can say "log more" rather than look broken. mifflinTdee is echoed back for display.
const estimateEmpiricalMaintenance = (nutrition, sleepEntries, mifflinTdee, exclusions = [], now = new Date()) => {
  const ranges = normaliseMaintenanceExclusions(exclusions);
  const nowStr = formatDate(now);

  // 1. Marked days are not evidence, on either series.
  const windowWeighIns = getWindowedWeighIns(sleepEntries, MAINTENANCE_WINDOW_PREFERRED_DAYS, now)
    .filter(e => !isDateExcluded(e.date, ranges));
  const windowIntakeDays = getWindowedIntakeDays(nutrition, MAINTENANCE_WINDOW_PREFERRED_DAYS, now)
    .filter(d => !isDateExcluded(d.date, ranges));

  // 2. Keep only the run of logged days after the last break. A break is either a
  //    stretch of unlogged days too long to be noise, or a marked range sitting
  //    wholly between two logged days -- both mean the weight either side belongs
  //    to a different period than the intake.
  let segmentStart = 0;
  for (let i = 1; i < windowIntakeDays.length; i++) {
    const prev = windowIntakeDays[i - 1].date;
    const cur = windowIntakeDays[i].date;
    const tooFarApart = daysBetweenDates(prev, cur) > MAINTENANCE_MAX_GAP_DAYS + 1;
    const rangeBetween = ranges.some(r => r.from > prev && r.to < cur);
    if (tooFarApart || rangeBetween) segmentStart = i;
  }
  const intakeDays = windowIntakeDays.slice(segmentStart);

  // 3. Weight only counts where there is intake to pair it with.
  const firstIntake = intakeDays.length ? intakeDays[0].date : null;
  const lastIntake = intakeDays.length ? intakeDays[intakeDays.length - 1].date : null;
  const weighIns = firstIntake
    ? windowWeighIns.filter(e => e.date >= firstIntake && e.date <= lastIntake)
    : [];

  const gateProgress = {
    intakeDays: intakeDays.length, intakeDaysNeeded: MAINTENANCE_MIN_INTAKE_DAYS,
    weighIns: weighIns.length, weighInsNeeded: MAINTENANCE_MIN_WEIGH_INS
  };

  // 4. Staleness. A marked range that has already ended still counts as covered --
  //    the user told us what those days were, so they are accounted for, not absent.
  if (lastIntake) {
    const rangeEnds = ranges.filter(r => r.to <= nowStr).map(r => r.to);
    const lastCovered = [lastIntake, ...rangeEnds].reduce((a, b) => (b > a ? b : a), lastIntake);
    const staleDays = daysBetweenDates(lastCovered, nowStr);
    if (staleDays > MAINTENANCE_MAX_STALE_DAYS) {
      return { available: false, gateProgress, mifflinTdee, staleDays };
    }
  }

  const oldestRelevant = [...weighIns, ...intakeDays.map(d => ({ date: d.date }))]
    .reduce((min, e) => (!min || new Date(e.date) < new Date(min)) ? e.date : min, null);
  const daysOfHistory = oldestRelevant
    ? Math.round((now - new Date(oldestRelevant)) / 86400000)
    : 0;

  if (daysOfHistory < MAINTENANCE_WINDOW_MIN_DAYS
      || intakeDays.length < MAINTENANCE_MIN_INTAKE_DAYS
      || weighIns.length < MAINTENANCE_MIN_WEIGH_INS) {
    return { available: false, gateProgress, mifflinTdee };
  }

  const meanDailyIntake = intakeDays.reduce((s, d) => s + d.totals.totalCalories, 0) / intakeDays.length;

  // Least-squares slope of weight (lb) against day offset — not first-minus-last.
  const x = weighIns.map(e => (new Date(e.date) - new Date(weighIns[0].date)) / 86400000);
  const y = weighIns.map(e => Number(e.weight));
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0), sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
  const sumXX = x.reduce((s, xi) => s + xi * xi, 0);
  const denom = (n * sumXX - sumX * sumX);
  const slopeLbPerDay = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;

  const empiricalTdee = Math.round(meanDailyIntake - (slopeLbPerDay * 3500));

  const ratio = empiricalTdee / mifflinTdee;
  if (ratio < MAINTENANCE_CLAMP_LOW || ratio > MAINTENANCE_CLAMP_HIGH) {
    return { available: false, gateProgress, mifflinTdee, discardedAsUnreliable: true };
  }

  // spanDays is what the copy quotes, so it never claims a fixed 28 days the data
  // does not cover. loggedDays is how many of those days actually have food on them.
  return {
    available: true, empiricalTdee, gateProgress, mifflinTdee,
    loggedDays: intakeDays.length,
    spanDays: daysBetweenDates(firstIntake, lastIntake) + 1
  };
};

// Protein (1 g/lb) is only recomputed inside the calculator, so nothing keeps it
// current as weight moves. This nudges a manual recalc; it never acts on its own.
const checkGoalDrift = (dietGoals, sleepEntries) => {
  if (!dietGoals?.enabled || !dietGoals.calculatedAtWeight) return null;
  const recent = getWindowedWeighIns(sleepEntries, MAINTENANCE_WINDOW_MIN_DAYS);
  if (recent.length < GOAL_DRIFT_MIN_WEIGHINS) return null;
  const latestWeight = Number(recent[recent.length - 1].weight);
  const drift = latestWeight - Number(dietGoals.calculatedAtWeight);
  if (Math.abs(drift) < GOAL_DRIFT_LB_THRESHOLD) return null;
  return { drift, latestWeight, calculatedAtWeight: dietGoals.calculatedAtWeight };
};

// Helper to group all data by date for unified daily cards
const groupDataByDate = (workouts, nutrition, sleepEntries) => {
  const dateMap = new Map();

  // Add workout entries
  workouts.forEach(workout => {
    if (!dateMap.has(workout.date)) {
      dateMap.set(workout.date, { date: workout.date, workouts: [], meals: [], sleep: null });
    }
    dateMap.get(workout.date).workouts.push(workout);
  });

  // Add nutrition entries (meals)
  nutrition.forEach(meal => {
    if (!dateMap.has(meal.date)) {
      dateMap.set(meal.date, { date: meal.date, workouts: [], meals: [], sleep: null });
    }
    dateMap.get(meal.date).meals.push(meal);
  });

  // Add sleep entries (one per day)
  sleepEntries.forEach(sleep => {
    if (!dateMap.has(sleep.date)) {
      dateMap.set(sleep.date, { date: sleep.date, workouts: [], meals: [], sleep: null });
    }
    dateMap.get(sleep.date).sleep = sleep;
  });

  // Convert to array and sort by date (newest first)
  return Array.from(dateMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
};

// --- 🍞 TOAST COMPONENT ---
const ToastContext = React.createContext();
const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: generateId() });
    setTimeout(() => { setToast(null); }, 3000);
  };
  return h(ToastContext.Provider, { value: { showToast } },
    h(Fragment, null,
      children,
      toast && h('div', { className: `toast ${toast.type} ${toast ? 'show' : ''}`, key: toast.id }, toast.message)
    )
  );
};
const useToast = () => React.useContext(ToastContext);

// --- MODAL COMPONENT ---
const Modal = ({ show, onClose, title, children }) => {
  if (!show) return null;
  return h(Fragment, null,
    h('div', { className: 'modal-backdrop', onClick: onClose }),
    h('div', { className: 'modal-content bg-slate-800 rounded-lg p-6 w-11/12 md:w-1/2 max-w-lg shadow-xl' },
      h('div', { className: 'flex justify-between items-center mb-4' },
        h('h3', { className: 'text-xl font-bold' }, title),
        h('button', { className: 'text-slate-400 hover:text-white', onClick: onClose }, 'X')
      ),
      children
    )
  );
};

// --- UI COMPONENTS ---
const Button = ({ onClick, children, className = '', variant = 'primary', type = 'button', size = 'md' }) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-slate-600 hover:bg-slate-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  // 'md' is the padding every existing caller already had, so nothing moves by default.
  const sizes = { md: 'py-2 px-4', sm: 'py-1 px-3 text-sm' };
  return h('button', {
    type,
    onClick,
    className: `${sizes[size]} rounded-lg font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${variants[variant]} ${className}`
  }, children);
};

const Input = (props) => {
  return h('input', {
    ...props,
    className: `w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 ${props.className || ''}`
  });
};

const Select = ({ children, ...props }) => {
  return h('select', {
    ...props,
    className: `w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white ${props.className || ''}`
  }, children);
};

// This is the Slider for "Recovery Rating"
const Slider = ({ label, min, max, value, onChange, ...props }) => {
  return h('div', { className: 'w-full' },
    h('label', { className: 'block text-sm font-medium mb-1' }, `${label}: ${value}`),
    h('input', {
      type: 'range',
      min,
      max,
      value,
      onChange,
      ...props,
      className: 'w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer'
    })
  );
};

// RPE Slider Component
const RpeSlider = ({ value, onChange }) => {
  const rpeDesc = {
    1: '1 (Rest)', 1.5: '1.5',
    2: '2', 2.5: '2.5',
    3: '3', 3.5: '3.5',
    4: '4 (Easy)', 4.5: '4.5',
    5: '5', 5.5: '5.5',
    6: '6 (RIR 4)', 6.5: '6.5 (RIR 3-4)',
    7: '7 (RIR 3)', 7.5: '7.5 (RIR 2-3)',
    8: '8 (RIR 2)', 8.5: '8.5 (RIR 1-2)',
    9: '9 (RIR 1)', 9.5: '9.5 (RIR 0-1)',
    10: '10 (Failure)'
  };
  
  return h('div', { className: 'w-full' },
    h('label', { className: 'block text-sm font-medium mb-1' }, `RPE: ${rpeDesc[value] || 'N/A'}`),
    h('input', {
      type: 'range',
      min: 1,
      max: 10,
      step: 0.5,
      value: value,
      onChange: onChange,
      className: 'w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer'
    })
  );
};

// Coach Suggestion Component
const CoachSuggestionBox = ({ exerciseName, allEntries, todaySleepPercent, trainingType, allExerciseNames = [] }) => {
  const [suggestion, setSuggestion] = useState(null);
  const [volumeTarget, setVolumeTarget] = useState(null);

  useEffect(() => {
    const isKnownExercise = allExerciseNames && allExerciseNames.includes(exerciseName);
    if (exerciseName && isKnownExercise) {
      const s = Coach.getSmartSuggestion(exerciseName, allEntries, todaySleepPercent);
      setSuggestion(s);
    } else {
      setSuggestion(null);
    }

    // Calculate volume target based on last session of same training type
    if (trainingType && trainingType !== 'REST') {
      const lastSameWorkout = [...allEntries]
        .filter(e => e.trainingType === trainingType && e.totalVolume > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

      if (lastSameWorkout) {
        const targetMin = Math.round(lastSameWorkout.totalVolume * 1.0); // Match last session
        const targetMax = Math.round(lastSameWorkout.totalVolume * 1.1); // 10% increase
        setVolumeTarget({
          lastVolume: lastSameWorkout.totalVolume,
          targetMin,
          targetMax,
          lastDate: lastSameWorkout.date
        });
      } else {
        setVolumeTarget(null);
      }
    }
  }, [exerciseName, allEntries, todaySleepPercent, trainingType]);

  if (!suggestion && !volumeTarget) return null;

  return h('div', { className: 'p-3 bg-blue-900/50 border border-blue-700 rounded-lg space-y-1' },
    suggestion && h(Fragment, null,
      h('h5', { className: 'font-bold text-cyan-400' }, `🧠 Coach: ${suggestion.title}`),
      h('p', { className: 'text-sm font-bold' }, `Target: ${suggestion.target}`),
      h('p', { className: 'text-xs text-slate-300' }, `Note: ${suggestion.note}`)
    ),
    volumeTarget && h('div', { className: 'mt-2 pt-2 border-t border-blue-600' },
      h('p', { className: 'text-xs text-slate-300' },
        `💪 Session Volume Target: ${volumeTarget.targetMin.toLocaleString()}-${volumeTarget.targetMax.toLocaleString()} lbs (Last ${trainingType}: ${volumeTarget.lastVolume.toLocaleString()} lbs on ${volumeTarget.lastDate})`
      )
    )
  );
};

// --- 🔄 CYCLE EDITOR COMPONENT ---
const CycleEditor = ({ currentCycle, onSave, onClose, entries }) => {
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [cycleName, setCycleName] = useState('');
  const [cycleDays, setCycleDays] = useState(currentCycle || []);
  const [customCycles, setCustomCycles] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_CYCLES_KEY);
    return saved ? JSON.parse(saved) : {};
  });
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (selectedPreset && selectedPreset !== 'custom' && selectedPreset !== 'saved') {
      if (CYCLE_PRESETS[selectedPreset]) {
        setCycleDays([...CYCLE_PRESETS[selectedPreset].days]);
        setCycleName(CYCLE_PRESETS[selectedPreset].name);
      } else if (customCycles[selectedPreset]) {
        setCycleDays([...customCycles[selectedPreset].days]);
        setCycleName(customCycles[selectedPreset].name);
      }
    }
  }, [selectedPreset, customCycles]);

  const addDay = () => setCycleDays([...cycleDays, 'REST']);
  const removeDay = (index) => {
    if (cycleDays.length > 1) setCycleDays(cycleDays.filter((_, i) => i !== index));
  };
  const updateDay = (index, value) => {
    const newDays = [...cycleDays];
    newDays[index] = value;
    setCycleDays(newDays);
  };

  const saveCustomCycle = () => {
    if (!cycleName.trim()) {
      showToast('Please enter a cycle name', 'error');
      return;
    }
    const cycleId = `custom_${generateId()}`;
    const newCustomCycles = {
      ...customCycles,
      [cycleId]: {
        name: cycleName,
        days: [...cycleDays],
        description: `Custom ${cycleDays.length}-day cycle`
      }
    };
    setCustomCycles(newCustomCycles);
    localStorage.setItem(CUSTOM_CYCLES_KEY, JSON.stringify(newCustomCycles));
    showToast('Custom cycle saved!');
  };

  const deleteCustomCycle = (id) => {
    const newCustomCycles = { ...customCycles };
    delete newCustomCycles[id];
    setCustomCycles(newCustomCycles);
    localStorage.setItem(CUSTOM_CYCLES_KEY, JSON.stringify(newCustomCycles));
    if (selectedPreset === id) setSelectedPreset('custom');
    showToast('Custom cycle deleted');
  };

  const applyCycle = () => {
    if (cycleDays.length === 0) {
      showToast('Cycle must have at least one day', 'error');
      return;
    }
    onSave(cycleDays);
    showToast('Training cycle updated!');
  };

  const cycleStats = {
    length: cycleDays.length,
    trainingDays: cycleDays.filter(d => d !== 'REST').length,
    restDays: cycleDays.filter(d => d === 'REST').length,
    frequency: cycleDays.length > 0 ? ((cycleDays.filter(d => d !== 'REST').length / cycleDays.length) * 100).toFixed(0) : 0
  };

  return h('div', { className: 'space-y-6' },
    h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '🎯 Choose a Preset'),
      h(Select, { value: selectedPreset, onChange: (e) => setSelectedPreset(e.target.value) },
        h('option', { value: 'custom' }, 'Build Custom Cycle'),
        h('optgroup', { label: 'Presets' },
          Object.entries(CYCLE_PRESETS).map(([key, preset]) => h('option', { key, value: key }, preset.name))
        ),
        Object.keys(customCycles).length > 0 && h('optgroup', { label: 'Your Saved Cycles' },
          Object.entries(customCycles).map(([key, cycle]) => h('option', { key, value: key }, cycle.name))
        )
      )
    ),
    h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '📅 Cycle Editor'),
      h('div', { className: 'mb-4' },
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Cycle Name'),
        h(Input, { type: 'text', value: cycleName, onChange: (e) => setCycleName(e.target.value), placeholder: 'e.g., My Custom PPL' })
      ),
      h('div', { className: 'space-y-2 mb-4' },
        cycleDays.map((day, index) =>
          h('div', { key: index, className: 'flex gap-2 items-center' },
            h('span', { className: 'text-sm font-medium w-16' }, `Day ${index + 1}:`),
            h(Select, { value: day, onChange: (e) => updateDay(index, e.target.value), className: 'flex-1' },
              WORKOUT_TYPES.map(type => h('option', { key: type, value: type }, type))
            ),
            cycleDays.length > 1 && h('button', { onClick: () => removeDay(index), className: 'text-red-400 hover:text-red-300' }, '✕')
          )
        )
      ),
      h('div', { className: 'flex gap-2' },
        h(Button, { onClick: addDay, variant: 'secondary' }, '+ Add Day'),
        cycleName.trim() && h(Button, { onClick: saveCustomCycle, variant: 'secondary' }, '💾 Save as Custom')
      )
    ),
    h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Cycle Stats'),
      h('div', { className: 'grid grid-cols-2 gap-4 text-center' },
        h('div', {}, h('div', { className: 'text-2xl font-bold' }, cycleStats.length), h('div', { className: 'text-sm text-slate-400' }, 'Total Days')),
        h('div', {}, h('div', { className: 'text-2xl font-bold text-green-400' }, cycleStats.trainingDays), h('div', { className: 'text-sm text-slate-400' }, 'Training Days')),
        h('div', {}, h('div', { className: 'text-2xl font-bold text-blue-400' }, cycleStats.restDays), h('div', { className: 'text-sm text-slate-400' }, 'Rest Days')),
        h('div', {}, h('div', { className: 'text-2xl font-bold text-cyan-400' }, `${cycleStats.frequency}%`), h('div', { className: 'text-sm text-slate-400' }, 'Training Frequency'))
      )
    ),
    Object.keys(customCycles).length > 0 && h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '💾 Your Saved Cycles'),
      h('div', { className: 'space-y-2' },
        Object.entries(customCycles).map(([id, cycle]) =>
          h('div', { key: id, className: 'flex justify-between items-center bg-slate-700 p-2 rounded' },
            h('div', {},
              h('div', { className: 'font-semibold' }, cycle.name),
              h('div', { className: 'text-xs text-slate-400' }, cycle.description)
            ),
            h('button', { onClick: () => deleteCustomCycle(id), className: 'text-red-400 hover:text-red-300' }, 'Delete')
          )
        )
      )
    ),

    // Live Preview Section
    showPreview && h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('div', { className: 'flex justify-between items-center mb-4' },
        h('h3', { className: 'text-lg font-semibold' }, '👁️ Live Preview'),
        h('button', {
          onClick: () => setShowPreview(!showPreview),
          className: 'text-sm text-slate-400 hover:text-white'
        }, showPreview ? 'Hide' : 'Show')
      ),
      h('div', { className: 'text-sm text-slate-400 mb-3' }, 'How this cycle affects the next 14 days:'),
      h('div', { className: 'grid grid-cols-7 gap-2' },
        Array.from({ length: 14 }, (_, i) => {
          const dayIndex = i % cycleDays.length;
          const workout = cycleDays[dayIndex] || 'REST';
          const isRest = workout === 'REST';
          return h('div', {
            key: i,
            className: `p-2 rounded text-center text-xs ${isRest ? 'bg-slate-700' : 'bg-blue-900'}`
          },
            h('div', { className: 'font-bold' }, `D${i + 1}`),
            h('div', { className: 'text-[10px] mt-1 truncate' }, workout)
          );
        })
      )
    ),

    // Action Buttons
    h('div', { className: 'flex gap-2' },
      h(Button, { onClick: applyCycle, variant: 'primary', className: 'flex-1' }, '✅ Apply This Cycle'),
      onClose && h(Button, { onClick: onClose, variant: 'secondary' }, 'Cancel')
    )
  );
};

const TrainingCalendar = ({ entries, trainingCycle, dynamicToday, currentCycleDay, onEditCycle, onSetCycleDay }) => {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [weekStartDay, setWeekStartDay] = useState(0); // 0 = Sunday, 1 = Monday
  const [contextMenuDate, setContextMenuDate] = useState(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const cycleLength = trainingCycle.length;
  const todayStr = formatDate(new Date());

  // Create a map of entries by date for quick lookup
  const entriesByDate = entries.reduce((acc, entry) => {
    acc[entry.date] = entry;
    return acc;
  }, {});

  // Get the start of the current week based on preference
  const getWeekStart = (offset = 0) => {
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const diff = currentDay - weekStartDay;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diff + (offset * 7));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  };

  // Generate dates for the current week view
  const weekStart = getWeekStart(currentWeekOffset);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push(date);
  }

  // DEBUG: Log what TrainingCalendar receives
  console.log('=== CALENDAR DEBUG ===');
  console.log('currentCycleDay (from parent):', currentCycleDay);
  console.log('dynamicToday:', dynamicToday);
  console.log('cycleLength:', cycleLength);
  console.log('todayStr:', todayStr);
  console.log('entries count:', entries.length);
  console.log('======================');

  // Calculate planned workout and cycle day for a given date
  // Uses Sunday-anchored calculation: D0 always falls on a Sunday
  const getPlannedWorkoutAndCycleDay = (dateStr) => {
    // Check if this date already has a logged entry
    const entry = entriesByDate[dateStr];
    if (entry && entry.cycleDay !== undefined) {
      // Use the saved cycleDay from the entry (historical data)
      console.log(`[Calendar] ${dateStr}: Using logged entry cycleDay=${entry.cycleDay}, trainingType=${entry.trainingType}`);
      return {
        planned: entry.plannedTrainingType || trainingCycle[entry.cycleDay],
        cycleDay: entry.cycleDay
      };
    }

    // For unlogged dates, calculate cycle day based on Sunday anchor
    // This ensures D0 always falls on a Sunday
    const calculatedCycleDay = getCycleDayForDate(dateStr, cycleLength);
    const targetDate = parseLocalDate(dateStr);

    console.log(`[Calendar] ${dateStr}: ${targetDate.toLocaleDateString('en-US', {weekday: 'short'})} -> cycleDay=${calculatedCycleDay}, planned=${trainingCycle[calculatedCycleDay]}`);

    return {
      planned: trainingCycle[calculatedCycleDay],
      cycleDay: calculatedCycleDay
    };
  };

  // currentCycleDay is now passed from parent (from getDynamicCalendar)
  // It's 0-indexed, so we add 1 when displaying

  return h('div', { className: 'bg-slate-800 p-4 rounded-lg relative' },
    // Context menu for setting cycle day
    contextMenuDate && h('div', {
      className: 'fixed bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-50',
      style: { left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` },
      onClick: (e) => e.stopPropagation()
    },
      h('div', { className: 'text-xs font-semibold text-slate-400 px-2 py-1' }, `Set ${contextMenuDate} as...`),
      Array.from({ length: cycleLength }, (_, i) => i + 1).map(day =>
        h('button', {
          key: day,
          className: 'w-full text-left px-3 py-2 hover:bg-slate-800 rounded text-sm',
          onClick: () => {
            onSetCycleDay && onSetCycleDay(contextMenuDate, day - 1);
            setContextMenuDate(null);
          }
        }, `Day ${day} of ${cycleLength}`)
      )
    ),

    h('div', { className: 'flex justify-between items-center mb-4' },
      h('div', {},
        h('h3', { className: 'text-lg font-semibold' }, `📅 ${cycleLength}-Day Training Cycle`),
        h('p', { className: 'text-sm text-slate-400' }, `Day ${currentCycleDay + 1} of ${cycleLength}`)
      ),
      h('div', { className: 'flex gap-2 items-center' },
        onEditCycle && h(Button, {
          onClick: onEditCycle,
          variant: 'primary',
          className: 'px-3 py-1 text-sm'
        }, '⚙️ Edit Cycle'),
        h(Button, {
          onClick: () => setCurrentWeekOffset(currentWeekOffset - 1),
          variant: 'secondary',
          className: 'px-2 py-1 text-sm'
        }, '← Prev'),
        h('span', { className: 'text-sm text-slate-400' },
          currentWeekOffset === 0 ? 'This Week' :
          currentWeekOffset > 0 ? `+${currentWeekOffset}w` :
          `${currentWeekOffset}w`
        ),
        h(Button, {
          onClick: () => setCurrentWeekOffset(currentWeekOffset + 1),
          variant: 'secondary',
          className: 'px-2 py-1 text-sm'
        }, 'Next →')
      )
    ),
    h('div', { className: 'flex gap-2 mb-2 text-xs' },
      h('button', {
        onClick: () => setWeekStartDay(0),
        className: `px-2 py-1 rounded text-slate-400 ${weekStartDay === 0 ? 'bg-blue-600 text-white' : 'bg-slate-700'}`
      }, 'Start Sunday'),
      h('button', {
        onClick: () => setWeekStartDay(1),
        className: `px-2 py-1 rounded text-slate-400 ${weekStartDay === 1 ? 'bg-blue-600 text-white' : 'bg-slate-700'}`
      }, 'Start Monday'),
      h('button', {
        onClick: () => {
          if (confirm('Reset cycle position to Day 1 today? This will recalculate all future planned workouts.')) {
            // This could call a handler to reset cycle position
            onSetCycleDay && onSetCycleDay(todayStr, 0);
            alert('Cycle position reset to Day 1!');
          }
        },
        className: 'px-2 py-1 rounded bg-orange-900 text-orange-300 hover:bg-orange-800 ml-auto'
      }, '🔄 Reset Cycle Position')
    ),
    h('div', { className: 'grid grid-cols-7 gap-2' },
      dates.map((date) => {
        const dateStr = formatDate(date);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayOfMonth = date.getDate();
        const actual = entriesByDate[dateStr];

        // Get planned workout and cycle day from single source of truth
        const { planned, cycleDay } = getPlannedWorkoutAndCycleDay(dateStr);
        const cycleDayNumber = cycleDay + 1; // Convert 0-indexed to 1-indexed for display
        const isCycleBoundary = cycleDayNumber === 1 || cycleDayNumber === cycleLength;

        let bgColor = 'bg-slate-700';
        if (actual) {
          bgColor = (actual.plannedTrainingType === actual.trainingType) ? 'bg-green-600' : 'bg-yellow-600';
        }
        if (dateStr === todayStr) {
          bgColor += ' ring-2 ring-blue-500';
        }
        if (isCycleBoundary) {
          bgColor += ' ring-1 ring-purple-400';
        }

        return h('div', {
          key: dateStr,
          className: `p-2 rounded-lg text-center ${bgColor} cursor-pointer hover:opacity-80 transition-opacity relative`,
          onContextMenu: (e) => {
            e.preventDefault();
            setContextMenuDate(dateStr);
            setContextMenuPosition({ x: e.clientX, y: e.clientY });
          },
          onTouchStart: (e) => {
            // Long press detection for mobile
            const touchTimer = setTimeout(() => {
              const touch = e.touches[0];
              setContextMenuDate(dateStr);
              setContextMenuPosition({ x: touch.clientX, y: touch.clientY });
            }, 500);
            e.target._touchTimer = touchTimer;
          },
          onTouchEnd: (e) => {
            if (e.target._touchTimer) {
              clearTimeout(e.target._touchTimer);
            }
          }
        },
          h('div', { className: 'font-bold text-xs' }, dayOfWeek.toUpperCase()),
          h('div', { className: 'text-lg font-bold' }, dayOfMonth),
          h('div', { className: 'text-xs truncate' }, actual ? actual.trainingType : planned),
          h('div', { className: 'text-[10px] text-slate-400 mt-0.5' }, `D${cycleDayNumber}`)
        );
      })
    ),

    // Click outside to close context menu
    contextMenuDate && h('div', {
      className: 'fixed inset-0 z-40',
      onClick: () => setContextMenuDate(null)
    })
  );
};

// --- 🏆 PR DASHBOARD COMPONENT ---
const PRDashboard = ({ prs }) => {
  const topPRs = [...prs].slice(0, 10);
  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, '🏆 Personal Records'),
    topPRs.length === 0
      ? h('p', { className: 'text-slate-400' }, 'No PRs logged yet. Start training!')
      : h('ul', { className: 'space-y-2' },
        topPRs.map(pr => {
          const isDumbbell = isDumbbellExercise(pr.name);
          const isPerHand = isDumbbell && pr.weight < 100;
          return h('li', { key: pr.name, className: 'flex justify-between items-center bg-slate-700 p-2 rounded' },
            h('span', { className: 'font-semibold' }, pr.name),
            h('div', { className: 'text-right' },
              h('span', { className: 'text-cyan-400 font-bold' },
                isPerHand ? `${pr.weight} lbs / hand` : `${pr.weight} lbs`
              ),
              isPerHand && h('div', { className: 'text-xs text-slate-400' }, `(${pr.weight * 2} lbs total)`)
            ),
            h('span', { className: 'text-xs text-slate-400' }, `${pr.sets}x${pr.reps}`)
          );
        })
      )
  );
};

// --- 📊 STATS SUMMARY COMPONENT (UPGRADED) ---
const StatsSummary = ({ entries, nutrition, liveProtein, liveCalories }) => {
  const totalWorkouts = entries.filter(e => e.trainingType !== 'REST').length;

  // Get current weight from latest nutrition entry
  const currentWeight = nutrition.length > 0
    ? (nutrition[nutrition.length - 1].weight || USER_CONTEXT.startWeight)
    : USER_CONTEXT.startWeight;

  // Calculate average deep sleep from nutrition entries
  const validSleepEntries = nutrition.filter(n => n.deepSleepPercent !== null && n.deepSleepPercent > 0);
  const avgDeepSleep = validSleepEntries.length > 0
    ? (validSleepEntries.reduce((sum, n) => sum + n.deepSleepPercent, 0) / validSleepEntries.length).toFixed(1)
    : 'N/A';

  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, '🔥 Quick Stats'),
    h('div', { className: 'grid grid-cols-2 gap-4' },
      h('div', { className: 'text-center' }, h('div', { className: 'text-2xl font-bold' }, totalWorkouts), h('div', { className: 'text-sm text-slate-400' }, 'Workouts')),
      h('div', { className: 'text-center' }, h('div', { className: 'text-2xl font-bold' }, `${currentWeight} lbs`), h('div', { className: 'text-sm text-slate-400' }, 'Current')),
      h('div', { className: 'text-center' },
        h('div', { className: 'text-2xl font-bold' }, `${liveProtein}g`),
        h('div', { className: 'text-sm text-slate-400' }, "Today's Protein"),
        h('div', { className: 'text-xs' }, getProteinStatus(liveProtein))
      ),
      h('div', { className: 'text-center' },
        h('div', { className: 'text-2xl font-bold' }, `${liveCalories}`),
        h('div', { className: 'text-sm text-slate-400' }, "Today's Cals")
      )
    )
  );
};

// --- 🧠 SMART RECOVERY CARD ---
const SmartRecoveryCard = ({ entries, sleepEntries, plannedWorkout, recoveryStatus: precomputedStatus }) => {
  const recoveryStatus = precomputedStatus || processWorkoutHistory(entries, sleepEntries);
  
  const todayStr = formatDate(new Date());
  const todaySleep = sleepEntries.find(s => s.date === todayStr) || 
                     sleepEntries[sleepEntries.length - 1] || 
                     { sleepHours: 8, deepSleepPercent: 15 };

  const recommendation = getTrainingRecommendation(recoveryStatus, todaySleep, plannedWorkout);

  return h('div', { 
    className: 'bg-slate-800 p-4 rounded-lg border-2',
    style: { borderColor: recommendation.proceed ? '#10b981' : '#ef4444' }
  },
    h('h3', { className: 'text-lg font-semibold mb-3 flex items-center gap-2' },
      h('span', {}, '🧠'),
      'Smart Recovery Analysis'
    ),
    
    // Recommendation
    h('div', { className: 'mb-4 p-3 rounded', style: {
      backgroundColor: recommendation.proceed ? '#064e3b' : '#7f1d1d'
    }},
      h('div', { className: 'font-bold mb-1' },
        recommendation.proceed 
          ? '✅ Good to train ' + plannedWorkout
          : '🛑 Consider rest day'
      ),
      h('div', { className: 'text-sm' }, recommendation.reasoning)
    ),

    // Sleep impact
    todaySleep && h('div', { className: 'mb-3 p-3 bg-slate-900 rounded' },
      h('div', { className: 'text-sm font-semibold mb-1' }, 'Sleep Quality'),
      h('div', { className: 'text-sm' }, recommendation.sleepImpact || 
        `${todaySleep.sleepHours.toFixed(1)}h total, ${todaySleep.deepSleepPercent.toFixed(1)}% deep`)
    ),

    // Fatigue warning
    recommendation.fatigueWarning && h('div', { className: 'mb-3 p-3 bg-slate-900 rounded' },
      h('div', { className: 'text-sm' }, recommendation.fatigueWarning)
    ),

    // Suggested sets
    h('div', { className: 'flex justify-between items-center' },
      h('div', { className: 'text-sm text-slate-400' }, 'Recommended Volume'),
      h('div', { className: 'text-2xl font-bold text-cyan-400' }, 
        `${recommendation.suggestedSets} sets`
      )
    )
  );
};

// --- 💪 EXERCISE SELECTOR WITH RECOVERY ---
const ExerciseSelectorWithRecovery = ({ 
  exerciseName, 
  onSelect, 
  recoveryStatus, 
  allExerciseNames 
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState(exerciseName || '');

  // Get exercise data
  const exerciseData = exerciseName ? getExerciseData(exerciseName) : null;

  // Calculate affected muscles and their recovery
  const affectedMuscles = exerciseData ? Object.keys({
    ...exerciseData.primaryMuscles,
    ...exerciseData.secondaryMuscles
  }).map(muscleKey => ({
    key: muscleKey,
    name: MUSCLES[muscleKey]?.name,
    fatigue: recoveryStatus[muscleKey]?.currentFatiguePercent || 0,
    color: recoveryStatus[muscleKey]?.color || 'green'
  })).sort((a, b) => b.fatigue - a.fatigue) : [];

  // Filter exercises by search
  const filteredExercises = allExerciseNames.filter(name =>
    name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return h('div', { className: 'space-y-2' },
    // Search input
    h('div', { className: 'relative' },
      h(Input, {
        type: 'text',
        value: searchTerm,
        onChange: (e) => {
          setSearchTerm(e.target.value);
          setShowSuggestions(true);
        },
        onFocus: () => setShowSuggestions(true),
        placeholder: 'Search exercises...',
        list: 'exercise-suggestions'
      }),
      
      // Dropdown suggestions
      showSuggestions && filteredExercises.length > 0 && h('div', {
        className: 'absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-60 overflow-y-auto'
      },
        filteredExercises.slice(0, 10).map(name =>
          h('button', {
            key: name,
            type: 'button',
            className: 'w-full text-left px-3 py-2 hover:bg-slate-800 text-sm',
            onClick: () => {
              setSearchTerm(name);
              onSelect(name);
              setShowSuggestions(false);
            }
          }, name)
        )
      )
    ),

    // Warning: exercise not in muscle library
    exerciseName && !exerciseData && h('span', {
      className: 'text-yellow-400 text-xs mt-1 block'
    }, '⚠️ Exercise not in muscle library — volume won\'t count toward recovery'),

    // Affected muscles display
    exerciseName && affectedMuscles.length > 0 && h('div', {
      className: 'p-3 bg-slate-900 rounded-lg'
    },
      h('div', { className: 'text-xs font-semibold mb-2 text-slate-400' }, 
        'Muscles Targeted:'
      ),
      h('div', { className: 'flex flex-wrap gap-2' },
        affectedMuscles.map(muscle =>
          h('div', {
            key: muscle.key,
            className: 'text-xs px-2 py-1 rounded',
            style: {
              backgroundColor: muscle.color === 'red' ? '#7f1d1d' :
                             muscle.color === 'yellow' ? '#78350f' : '#064e3b',
              color: 'white'
            }
          }, `${muscle.name} (${muscle.fatigue.toFixed(0)}%)`)
        )
      )
    ),

    // Close suggestions when clicking outside
    showSuggestions && h('div', {
      className: 'fixed inset-0 z-0',
      onClick: () => setShowSuggestions(false)
    })
  );
};

// --- 🤖 AI SUGGESTION MODAL (UPGRADED) ---
const AIWorkoutSuggestion = ({ entries, prs, trainingCycle, nutrition, sleepEntries = [], onClose }) => {
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecommendation = async () => {
      try {
        const last10Workouts = entries.slice(-10);
        const topPRs = prs.slice(0, 10);

        // Sleep lives in sleepEntries (post-V3). Sort by date rather than trusting
        // array order, because meals and sleep can be backdated via the date picker.
        const sortedSleep = [...sleepEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
        const lastSleepEntry = sortedSleep.length > 0 ? sortedSleep[sortedSleep.length - 1] : null;
        const hasSleepData = lastSleepEntry && Number(lastSleepEntry.deepSleepPercent) > 0;
        const lastSleep = hasSleepData ? Number(lastSleepEntry.deepSleepPercent) : null;
        const hours = hasSleepData ? Number(lastSleepEntry.sleepHours) || null : null;
        // Use dynamic calendar logic for correct cycle position
        const { cycleDay, today: plannedWorkout } = Coach.getDynamicCalendar(entries, trainingCycle);

        const currentWeightLbs = getCurrentWeight(sleepEntries);
        const prompt = `You are a hypertrophy training coach analyzing workout data for a ${USER_CONTEXT.age}-year-old male (${currentWeightLbs} lbs) in a body composition phase.

RECENT WORKOUTS (includes RPE and Volume): ${JSON.stringify(last10Workouts)}
CARDIO SCHEMA: each entry's optional "cardio" array holds items shaped { name (machine), minutes, steps, effort (RPE 1-10), timing ("before"/"after" lifting), plus machine-specific numbers such as level/floors for a Stairmaster or incline/speed for a Treadmill }; null means that field was not tracked, which is not the same as zero.
CURRENT PRs: ${JSON.stringify(topPRs)}
LAST NIGHT'S SLEEP: ${hasSleepData ? `${lastSleep}% deep sleep (${hours}h total)` : 'NOT LOGGED — do not make sleep-based volume claims; recommend a moderate set count and tell the user to log sleep for a better recommendation'}
TRAINING CYCLE: ${trainingCycle.length}-day cycle (${trainingCycle.join(', ')})
CYCLE POSITION: Day ${cycleDay + 1} - Planned: ${plannedWorkout}
OFF-CYCLE STATUS: 8+ weeks natural training

GUIDELINES:
- 20%+ deep sleep → 22-24 working sets optimal
- 15-20% deep sleep → 20-22 working sets  
- 12-16% deep sleep → 16-20 working sets
- <12% deep sleep → 12-16 sets or recommend rest
- Progressive overload: Use the "Smart Coach" logic. Analyze RPE from past workouts to suggest adding weight (if RPE <= 8) or adding reps (if RPE 8.5-9.5).
- If sleep is poor (<12%), suggest a 10-15% weight deload for higher reps.

Respond with ONLY the JSON object below — no markdown code fences, no prose before or
after it, and no explanation. The entire response must parse as JSON.

Provide recommendation as JSON:
{
  "recommendation": "${plannedWorkout}",
  "recommendedSets": 18,
  "reasoning": "Based on your ${hasSleepData ? `${lastSleep}% deep sleep` : 'unlogged sleep'} and cycle position...",
  "exercises": [
    {"name": "Exercise Name", "weight": "Weight Range", "sets": "4", "reps": "6-8"},
    ...
  ],
  "notes": "Focus on controlled form..."
}`;

        console.log("Calling REAL AI Gateway...");
        
        const res = await fetch(`/.netlify/functions/get-ai-suggestion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(`AI Gateway failed: ${errData.error || res.statusText}`);
        }
        
        const data = await res.json();
        let responseJson;
        try {
          responseJson = parseAiJson(data.text);
        } catch (e) {
          console.error("AI returned non-JSON:", data.text);
          throw e;
        }
        setRecommendation(responseJson);

      } catch (err) {
        console.error("AI Error:", err);
        setError(`Failed to get AI recommendation: ${err.message}.`);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendation();
  }, [entries, prs, trainingCycle, nutrition, sleepEntries]);
  
  const renderContent = () => {
    if (loading) {
      return h('div', { className: 'flex justify-center items-center h-32' },
        h('div', { className: 'animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500' })
      );
    }
    if (error) {
      return h('p', { className: 'text-red-400' }, error);
    }
    if (recommendation) {
      return h('div', { className: 'space-y-4' },
        h('div', {},
          h('h4', { className: 'text-lg font-bold text-cyan-400' }, recommendation.recommendation),
          recommendation.recommendation !== 'REST' && h('p', { className: 'text-sm text-slate-400' }, `${recommendation.recommendedSets} recommended sets.`)
        ),
        h('p', { className: 'italic' }, recommendation.reasoning),
        recommendation.exercises && recommendation.exercises.length > 0 && h('ul', { className: 'space-y-2' },
          recommendation.exercises.map((ex, i) =>
            h('li', { key: i, className: 'bg-slate-700 p-2 rounded' },
              h('span', { className: 'font-semibold' }, `${ex.name}: `),
              h('span', {}, `${ex.sets} sets of ${ex.reps} at ${ex.weight}`)
            )
          )
        ),
        h('p', { className: 'text-sm text-slate-400' }, h('strong', null, 'Coach Notes: '), recommendation.notes)
      );
    }
    return null;
  };

  return h(Modal, { show: true, onClose, title: "🤖 AI Workout Recommendation" },
    renderContent()
  );
};

// Shared by both nutrition forms. Derives calories from the three macros and flags
// a manually entered calorie figure that disagrees with them by more than 10%.
// Advisory only: it never blocks the save. Code does the arithmetic here.
const MacroCalorieHint = ({ protein, carbs, fat, fiber, calories, onUseDerived }) => {
  // Deliberately still keyed on protein/carbs/fat only. Fiber refines the figure when
  // it is there, but leaving it blank must not hide the hint.
  if (!hasCompleteMacros({ protein, carbs, fat })) return null;
  const derived = caloriesFromMacros(protein, carbs, fat, fiber);
  const entered = macroValue({ calories }, 'calories');
  const mismatch = entered !== null && entered > 0 && Math.abs(entered - derived) > derived * 0.1;
  return h('div', { className: 'space-y-1' },
    h('p', { className: 'text-xs text-slate-400' }, `Calories from macros: ${derived}`),
    mismatch && h('div', { className: 'flex items-center gap-2 text-xs text-yellow-500' },
      h('span', {}, `Your macros work out to ${derived} kcal — check the numbers.`),
      h('button', {
        type: 'button',
        onClick: () => onUseDerived(derived),
        className: 'px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white whitespace-nowrap'
      }, `Use ${derived}`)
    )
  );
};

// --- 🍽️ ADD MEAL SHEET (redesign, Nov 2026) ---
// Two tabs. "Saved" holds meals whose nutrition you've already worked out: one tap
// logs a serving, or open one to pick servings, edit or delete it. "Type it" is the
// old quick-add (describe + parse, or type the numbers, or read a label photo), with
// a switch to keep the meal for next time. Editing a logged meal opens "Type it".
//
// A saved meal is { id, name, protein, calories, carbs?, fat?, fiber?, note?,
// createdAt, lastUsedAt, useCount } -- per ONE serving. Logging one writes an ordinary
// nutrition entry, so nothing downstream knows or cares that it came from a template.

const MEAL_OPTIONAL_MACROS = ['carbs', 'fat', 'fiber'];
const roundTenth = (n) => Math.round(n * 10) / 10;

// Typed text -> number, '' stays ''. "3k" still means 3000 like the old fields.
const macroText = (v) => (v === '' || v === null || v === undefined ? '' : String(v));
const macroFromText = (text) => (String(text).trim() === '' ? '' : Number(parseNumberWithSuffix(text)) || 0);

// Saved meal x servings -> nutrition entry. Grams to 0.1, calories to whole kcal (as
// the meal parser rounds). A macro the saved meal never tracked stays off the entry.
const nutritionFromSavedMeal = (saved, servings, date) => {
  const entry = {
    id: generateId(),
    date,
    protein: roundTenth((Number(saved.protein) || 0) * servings),
    calories: Math.round((Number(saved.calories) || 0) * servings)
  };
  for (const k of MEAL_OPTIONAL_MACROS) {
    const v = macroValue(saved, k);
    if (v !== null) entry[k] = roundTenth(v * servings);
  }
  entry.description = servings === 1 ? saved.name : `${saved.name} × ${servings}`;
  return entry;
};

const savedMealLine = (m) => {
  const parts = [`${formatMacro(macroValue(m, 'protein'))} protein`, `${Math.round(Number(m.calories) || 0).toLocaleString()} kcal`];
  if (macroValue(m, 'carbs') !== null) parts.push(`${formatMacro(macroValue(m, 'carbs'))} carbs`);
  if (macroValue(m, 'fat') !== null) parts.push(`${formatMacro(macroValue(m, 'fat'))} fat`);
  return parts.join(' · ');
};

// `text` fields (names, notes) get the normal keyboard; number fields get the
// decimal pad on phones.
const MacroField = ({ id, label, value, onChange, placeholder, text = false }) =>
  h('div', null,
    h('label', { htmlFor: id, className: 'block text-[13px] font-bold text-ink-muted mb-1' }, label),
    h('input', {
      id, type: 'text', inputMode: text ? 'text' : 'decimal', autoComplete: 'off', autoCapitalize: text ? 'words' : 'off', value, placeholder,
      onChange: (e) => onChange(e.target.value),
      className: 'w-full h-12 rounded-2xl bg-ink border border-ink-line px-3.5 text-base font-bold'
    })
  );

// Five macro boxes + the calorie cross-check. `f` is { protein, calories, carbs, fat,
// fiber } as text; `set(key, text)` updates one.
const MacroFields = ({ prefix, f, set }) =>
  h('div', { className: 'flex flex-col gap-2.5' },
    h('div', { className: 'grid grid-cols-2 gap-2.5' },
      h(MacroField, { id: `${prefix}-protein`, label: 'Protein (g)', value: f.protein, onChange: v => set('protein', v), placeholder: 'e.g. 42' }),
      h(MacroField, { id: `${prefix}-calories`, label: 'Calories (kcal)', value: f.calories, onChange: v => set('calories', v), placeholder: 'e.g. 230' })
    ),
    h('div', { className: 'grid grid-cols-3 gap-2.5' },
      h(MacroField, { id: `${prefix}-carbs`, label: 'Carbs (g)', value: f.carbs, onChange: v => set('carbs', v), placeholder: 'optional' }),
      h(MacroField, { id: `${prefix}-fat`, label: 'Fat (g)', value: f.fat, onChange: v => set('fat', v), placeholder: 'optional' }),
      h(MacroField, { id: `${prefix}-fiber`, label: 'Fiber (g)', value: f.fiber, onChange: v => set('fiber', v), placeholder: 'optional' })
    ),
    h(MacroCalorieHint, {
      protein: macroFromText(f.protein) === '' ? null : macroFromText(f.protein),
      carbs: macroFromText(f.carbs) === '' ? null : macroFromText(f.carbs),
      fat: macroFromText(f.fat) === '' ? null : macroFromText(f.fat),
      fiber: macroFromText(f.fiber) === '' ? null : macroFromText(f.fiber),
      calories: macroFromText(f.calories) === '' ? null : macroFromText(f.calories),
      onUseDerived: (kcal) => set('calories', String(kcal))
    })
  );

// Ask the vision function to read a nutrition label or a meal photo. Returns text
// values for the macro boxes; the person reviews them before anything is saved.
const readNutritionPhoto = async (file) => {
  if (!file || !file.type.startsWith('image/')) throw new Error('Pick a photo.');
  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });
  const prompt = `This is a nutrition facts label or a photo of a meal.
Reply with ONLY a JSON object (null for anything you cannot read or estimate):
{"name": string, "protein": number, "carbs": number, "fat": number, "fiber": number, "calories": number}
For a label, use the values for ONE serving as printed. For a meal photo, estimate the whole plate.
"carbs" is Total Carbohydrate; "fiber" is Dietary Fiber.`;
  const res = await fetch('/.netlify/functions/get-vision-extraction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: [
      { type: 'image', source: { type: 'base64', media_type: file.type, data: base64Data } },
      { type: 'text', text: prompt }
    ] })
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch (e) { /* keep statusText */ }
    throw new Error(`Couldn't read the photo: ${msg}`);
  }
  const data = await res.json();
  const r = parseAiJson(data.text);
  const t = (v) => (optionalNumber(v) === null ? '' : String(optionalNumber(v)));
  return {
    name: typeof r.name === 'string' ? r.name.trim() : '',
    fields: { protein: t(r.protein), calories: t(r.calories), carbs: t(r.carbs), fat: t(r.fat), fiber: t(r.fiber) }
  };
};

const PhotoButton = ({ busy, onFile }) =>
  h('label', {
    className: `h-11 px-4 rounded-full border border-ink-line flex items-center justify-center gap-2 text-sm font-bold cursor-pointer ${busy ? 'opacity-60' : ''}`
  },
    busy
      ? h(Fragment, null, h('span', { className: 'animate-spin rounded-full h-4 w-4 border-b-2 border-accent' }), 'Reading…')
      : '📷 Read a label or photo',
    h('input', {
      type: 'file', accept: 'image/*', className: 'sr-only', disabled: busy,
      onChange: (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) onFile(file); }
    })
  );

const NutritionQuickAddModal = ({ onClose, onSave, entryToEdit = null, savedMeals = [], setSavedMeals = () => {}, initialDate = null }) => {
  const { showToast } = useToast();
  const isEdit = !!entryToEdit;
  const [tab, setTab] = useState(isEdit || savedMeals.length === 0 ? 'type' : 'saved');
  const [date, setDate] = useState(() => entryToEdit?.date || initialDate || formatDate(new Date()));
  const [addedCount, setAddedCount] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);

  // --- "Type it" state. '' means "not tracked": an untouched macro never saves as 0.
  const seed = (field) => macroText(macroValue(entryToEdit, field));
  const [fields, setFields] = useState(() => ({
    protein: seed('protein'), calories: seed('calories'), carbs: seed('carbs'), fat: seed('fat'), fiber: seed('fiber')
  }));
  const setField = (k, v) => setFields(f => ({ ...f, [k]: v }));
  // The person's own words, kept verbatim. Trustworthy in a way the resolved numbers are not.
  const [description, setDescription] = useState(() => entryToEdit?.description || '');
  const [parseStage, setParseStage] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [keepMeal, setKeepMeal] = useState(false);
  const [keepName, setKeepName] = useState('');

  // --- "Saved" state
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [servings, setServings] = useState(1);
  const [editor, setEditor] = useState(null); // null | { id|null, name, note, fields }

  const sortedMeals = [...savedMeals].sort((a, b) =>
    (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '') || String(a.name).localeCompare(String(b.name)));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shownMeals = words.length
    ? sortedMeals.filter(m => { const low = `${m.name} ${m.note || ''}`.toLowerCase(); return words.every(w => low.includes(w)); })
    : sortedMeals;

  const dateLabel = date === formatDate(new Date())
    ? 'Today'
    : parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // --- Saved: log a serving count of one meal
  const addSaved = (meal, count) => {
    onSave(nutritionFromSavedMeal(meal, count, date));
    const now = new Date().toISOString();
    setSavedMeals(list => list.map(m => (m.id === meal.id ? { ...m, lastUsedAt: now, useCount: (m.useCount || 0) + 1 } : m)));
    setAddedCount(n => n + 1);
    setOpenId(null);
    setServings(1);
    showToast(`Added ${count === 1 ? '' : `${count} × `}${meal.name} to ${dateLabel.toLowerCase() === 'today' ? 'today' : dateLabel}`, 'success');
  };

  const deleteSaved = (meal) => {
    if (!window.confirm(`Delete the saved meal "${meal.name}"? Meals you already logged stay.`)) return;
    setSavedMeals(list => list.filter(m => m.id !== meal.id));
    setOpenId(null);
  };

  // Build a saved meal from name + text fields. null (with a toast) if not usable.
  const buildSavedMeal = (base, name, f, note) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) { showToast('Give the meal a name', 'error'); return null; }
    const protein = macroFromText(f.protein);
    const calories = macroFromText(f.calories);
    if ((protein === '' || protein === 0) && (calories === '' || calories === 0)) {
      showToast('Enter at least protein or calories', 'error');
      return null;
    }
    const meal = {
      ...(base || {}),
      id: base?.id || generateId(),
      name: trimmed,
      protein: protein === '' ? 0 : protein,
      calories: calories === '' ? 0 : Math.round(calories),
      createdAt: base?.createdAt || new Date().toISOString()
    };
    for (const k of MEAL_OPTIONAL_MACROS) {
      const v = macroFromText(f[k]);
      if (v !== '') meal[k] = v; else delete meal[k];
    }
    if (note && note.trim()) meal.note = note.trim(); else delete meal.note;
    return meal;
  };

  const saveEditor = (alsoLog) => {
    const base = editor.id ? savedMeals.find(m => m.id === editor.id) : null;
    const meal = buildSavedMeal(base, editor.name, editor.fields, editor.note);
    if (!meal) return;
    setSavedMeals(list => (base ? list.map(m => (m.id === meal.id ? meal : m)) : [...list, meal]));
    setEditor(null);
    if (alsoLog) addSaved(meal, 1);
    else showToast(base ? `Updated ${meal.name}` : `Saved ${meal.name}. Tap it any time to log it`, 'success');
  };

  // --- Type it: parse a description (AI + USDA), unchanged from the old quick-add
  const handleParse = async () => {
    const text = description.trim();
    if (!text) return;
    setParsedRows([]);
    try {
      setParseStage('Reading description…');
      const items = await parseMealDescription(text);
      if (items.length === 0) throw new Error('No foods were recognised in that description.');
      setParseStage('Looking up foods…');
      const rows = await resolveMealItems(items);
      setParsedRows(rows);
      // Overwriting is intended: nothing is stored until Save. A macro no row could
      // supply stays blank rather than showing a partial sum as though it were a total.
      const totals = sumMealItems(rows);
      setFields({
        protein: macroText(totals.protein), calories: macroText(totals.calories),
        carbs: macroText(totals.carbs), fat: macroText(totals.fat), fiber: macroText(totals.fiber)
      });
      const matched = rows.filter(r => r.source === 'usda').length;
      showToast(`Parsed ${rows.length} item${rows.length === 1 ? '' : 's'}, ${matched} matched in USDA.`, 'success');
    } catch (err) {
      console.error('Meal parse failed:', err);
      // Every field is left exactly as it was: a failed parse must never block manual entry.
      showToast(err.message, 'error');
    } finally {
      setParseStage(null);
    }
  };

  const handlePhoto = async (file, target) => {
    setPhotoBusy(true);
    try {
      const { name, fields: read } = await readNutritionPhoto(file);
      if (target === 'editor') {
        setEditor(ed => ({ ...ed, name: ed.name || name, fields: read }));
      } else {
        setFields(read);
        if (name && !description.trim()) setDescription(name);
      }
      showToast('Read the photo. Check the numbers before saving', 'success');
    } catch (err) {
      console.error('Photo read failed:', err);
      showToast(err.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleAdd = () => {
    const prot = Number(parseNumberWithSuffix(fields.protein)) || 0;
    const cals = Number(parseNumberWithSuffix(fields.calories)) || 0;
    // Negative values are allowed for corrections, but not an entirely empty meal.
    if (prot === 0 && cals === 0 && fields.carbs === '' && fields.fat === '' && fields.fiber === '') {
      showToast('Please enter protein, calories, carbs, fat, or fiber', 'error');
      return;
    }
    // Editing spreads the original rather than rebuilding it: a row imported from a
    // pre-V3 backup still carries sleep/weight fields, and keeping the id is what makes
    // the save update the entry instead of appending a copy.
    const meal = entryToEdit
      ? { ...entryToEdit, date, protein: prot, calories: cals }
      : { id: generateId(), date, protein: prot, calories: cals };
    // Set when entered, delete when cleared, so the spread can't resurrect a blanked macro.
    for (const k of MEAL_OPTIONAL_MACROS) {
      if (String(fields[k]).trim() !== '') meal[k] = Number(parseNumberWithSuffix(fields[k])) || 0;
      else delete meal[k];
    }
    if (description.trim() !== '') meal.description = description.trim();
    else delete meal.description;

    if (keepMeal) {
      const saved = buildSavedMeal(null, keepName || description, fields, '');
      if (!saved) return;
      saved.lastUsedAt = new Date().toISOString();
      saved.useCount = 1;
      setSavedMeals(list => [...list, saved]);
      // Logged under the saved name when nothing was described, so the day's log reads well.
      if (!meal.description) meal.description = saved.name;
    }
    onSave(meal);
    showToast(entryToEdit
      ? `Updated to ${prot}g protein and ${cals} kcal for ${date}.`
      : `Added ${prot}g protein and ${cals} kcal${keepMeal ? ' and saved the meal' : ''}.`, 'success');
    onClose();
  };

  const tabBtn = (id, label) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', onClick: () => { setTab(id); setEditor(null); },
    className: `flex-1 h-10 rounded-full text-sm ${tab === id ? 'bg-accent text-accent-on font-extrabold' : 'font-bold'}`
  }, label);

  const header = h('div', { className: 'flex items-center gap-3 mb-3' },
    h('div', { className: 'flex-1 min-w-0' },
      h('div', { className: 'text-xl font-extrabold' }, isEdit ? 'Edit meal' : 'Add meal'),
      h('label', { className: 'flex items-center gap-2 text-[13px] text-ink-muted mt-0.5' },
        'For',
        h('input', {
          type: 'date', value: date, onChange: (e) => setDate(e.target.value), 'aria-label': 'Meal date',
          className: 'bg-transparent text-ink-text font-bold'
        }),
        addedCount > 0 && h('span', { className: 'font-bold', style: { color: UI_COLORS.good } }, `· ${addedCount} added`)
      )
    ),
    h('button', {
      type: 'button', onClick: onClose, 'aria-label': addedCount ? 'Done' : 'Close',
      className: addedCount
        ? 'h-11 px-4 rounded-full bg-accent text-accent-on font-extrabold text-sm flex-none'
        : 'w-11 h-11 flex-none rounded-full border border-ink-line bg-ink flex items-center justify-center'
    }, addedCount ? 'Done' : '✕')
  );

  // --- Saved tab ---
  const renderEditor = () => h('div', { className: 'flex flex-col gap-3' },
    h('div', { className: 'text-base font-extrabold' }, editor.id ? 'Edit saved meal' : 'Save a meal from its nutrition facts'),
    h('p', { className: 'text-[13px] text-ink-muted -mt-1.5' }, 'Numbers for one serving. You pick how many servings when you log it.'),
    h(MacroField, { id: 'sm-name', text: true, label: 'Name', value: editor.name, onChange: v => setEditor(ed => ({ ...ed, name: v })), placeholder: 'e.g. Core Power Elite' }),
    h(MacroFields, { prefix: 'sm', f: editor.fields, set: (k, v) => setEditor(ed => ({ ...ed, fields: { ...ed.fields, [k]: v } })) }),
    h(MacroField, { id: 'sm-note', text: true, label: 'Note (optional)', value: editor.note, onChange: v => setEditor(ed => ({ ...ed, note: v })), placeholder: 'e.g. 1 bottle, 14 oz' }),
    h(PhotoButton, { busy: photoBusy, onFile: (file) => handlePhoto(file, 'editor') }),
    h('div', { className: 'flex gap-2.5' },
      h('button', { type: 'button', onClick: () => saveEditor(false), className: 'flex-1 h-12 rounded-full border border-accent text-accent font-extrabold text-[15px]' }, 'Save'),
      h('button', { type: 'button', onClick: () => saveEditor(true), className: 'flex-1 h-12 rounded-full bg-accent text-accent-on font-extrabold text-[15px]' }, 'Save + log 1')
    ),
    h('button', { type: 'button', onClick: () => setEditor(null), className: 'h-11 text-sm font-bold text-ink-muted' }, 'Cancel')
  );

  const renderMealRow = (m, i) => {
    const open = openId === m.id;
    const preview = open ? nutritionFromSavedMeal(m, servings, date) : null;
    return h('div', { key: m.id, className: i ? 'border-t border-ink-line' : '' },
      h('div', { className: 'flex items-center gap-3 py-3' },
        h('button', {
          type: 'button', onClick: () => { setOpenId(open ? null : m.id); setServings(1); }, 'aria-expanded': open ? 'true' : 'false',
          className: 'flex-1 min-w-0 text-left'
        },
          h('span', { className: 'block text-[15px] font-extrabold truncate' }, m.name),
          h('span', { className: 'block text-[13px] text-ink-muted truncate' }, savedMealLine(m)),
          m.note && h('span', { className: 'block text-xs text-ink-muted truncate' }, m.note)
        ),
        h('button', {
          type: 'button', onClick: () => addSaved(m, 1), 'aria-label': `Log one serving of ${m.name}`,
          className: 'w-11 h-11 flex-none rounded-full bg-accent text-accent-on text-2xl font-extrabold flex items-center justify-center'
        }, '+')
      ),
      open && h('div', { className: 'pb-3.5 flex flex-col gap-3 anim-fade-in' },
        h('div', { className: 'flex items-center gap-3' },
          h('span', { className: 'text-sm font-bold flex-1' }, 'Servings'),
          h('button', { type: 'button', 'aria-label': 'Fewer servings', disabled: servings <= 0.5, onClick: () => setServings(s => Math.max(0.5, roundTenth(s - 0.5))), className: 'w-11 h-11 rounded-full border border-ink-line text-xl font-extrabold disabled:opacity-40' }, '−'),
          h('span', { className: 'w-12 text-center text-lg font-extrabold', 'aria-live': 'polite' }, servings),
          h('button', { type: 'button', 'aria-label': 'More servings', disabled: servings >= 10, onClick: () => setServings(s => Math.min(10, roundTenth(s + 0.5))), className: 'w-11 h-11 rounded-full border border-ink-line text-xl font-extrabold disabled:opacity-40' }, '+')
        ),
        h('div', { className: 'text-[13px] text-ink-muted' }, `That's ${savedMealLine(preview)}`),
        h('button', { type: 'button', onClick: () => addSaved(m, servings), className: 'h-12 rounded-full bg-accent text-accent-on font-extrabold text-[15px]' },
          `Log ${servings} serving${servings === 1 ? '' : 's'}`),
        h('div', { className: 'flex gap-2.5' },
          h('button', {
            type: 'button', className: 'flex-1 h-11 rounded-full border border-ink-line font-bold text-sm',
            onClick: () => setEditor({ id: m.id, name: m.name, note: m.note || '', fields: { protein: macroText(m.protein), calories: macroText(m.calories), carbs: macroText(m.carbs), fat: macroText(m.fat), fiber: macroText(m.fiber) } })
          }, '✏️ Edit'),
          h('button', { type: 'button', onClick: () => deleteSaved(m), className: 'flex-1 h-11 rounded-full border font-bold text-sm', style: { borderColor: UI_COLORS.bad, color: UI_COLORS.bad } }, '🗑️ Delete')
        )
      )
    );
  };

  const renderSaved = () => editor ? renderEditor() : h('div', { className: 'flex flex-col gap-3' },
    savedMeals.length > 0 && h(Fragment, null,
      h('label', { className: 'sr-only', htmlFor: 'saved-meal-search' }, 'Search saved meals'),
      h('input', {
        id: 'saved-meal-search', type: 'search', value: query, autoComplete: 'off', onChange: (e) => setQuery(e.target.value),
        placeholder: 'Search your saved meals', className: 'w-full h-12 rounded-full bg-ink border border-ink-line px-4 text-base'
      })
    ),
    savedMeals.length === 0
      ? h('div', { className: 'text-center py-4' },
          h('div', { className: 'text-base font-extrabold' }, 'No saved meals yet'),
          h('p', { className: 'text-sm text-ink-muted mt-1' }, 'Save the meals you eat often, with their nutrition facts, and log them in one tap.'))
      : h('div', { className: 'bg-ink border border-ink-line rounded-3xl px-4' },
          shownMeals.length ? shownMeals.map(renderMealRow) : h('div', { className: 'py-4 text-sm text-ink-muted' }, 'No saved meal matches.')),
    h('button', {
      type: 'button',
      onClick: () => setEditor({ id: null, name: query.trim(), note: '', fields: { protein: '', calories: '', carbs: '', fat: '', fiber: '' } }),
      className: 'h-12 rounded-full border border-dashed border-ink-line text-ink-muted font-extrabold text-[15px]'
    }, '＋ Save a new meal from nutrition facts')
  );

  // --- Type it tab ---
  const renderType = () => h('div', { className: 'flex flex-col gap-3' },
    h('div', null,
      h('label', { htmlFor: 'meal-desc', className: 'block text-[13px] font-bold text-ink-muted mb-1' }, 'Describe the meal'),
      h('textarea', {
        id: 'meal-desc', rows: 2, value: description, onChange: e => setDescription(e.target.value),
        placeholder: 'e.g. two Core Power shakes and a handful of shredded cheddar',
        className: 'w-full p-3 rounded-2xl bg-ink border border-ink-line text-base'
      }),
      h('div', { className: 'flex flex-wrap items-center gap-2 mt-2' },
        h('button', {
          type: 'button', onClick: handleParse, disabled: !!parseStage || description.trim() === '',
          className: 'h-11 px-4 rounded-full border border-accent text-accent font-extrabold text-sm disabled:opacity-40'
        }, '✨ Work out the numbers'),
        h(PhotoButton, { busy: photoBusy, onFile: (file) => handlePhoto(file, 'type') }),
        parseStage && h('span', { className: 'flex items-center gap-2 text-xs text-ink-muted' },
          h('span', { className: 'animate-spin rounded-full h-4 w-4 border-b-2 border-accent' }), parseStage)
      ),
      // Review surface: "looked up" vs "guessed" stays obvious per row.
      parsedRows.length > 0 && h('div', { className: 'mt-3 space-y-2' },
        parsedRows.map((row, i) => h('div', { key: i, className: 'bg-ink border border-ink-line p-2.5 rounded-2xl text-xs space-y-1' },
          h('div', { className: 'flex justify-between gap-2' },
            h('span', { className: 'font-bold min-w-0 truncate' }, row.name),
            h('span', { className: 'text-ink-muted shrink-0' }, row.grams === null ? '—' : `${row.grams} g`)),
          h('div', { className: 'text-ink-muted' },
            `${formatMacro(macroValue(row, 'protein'))} P / ${formatMacro(macroValue(row, 'carbs'))} C / ${formatMacro(macroValue(row, 'fat'))} F / ${formatMacro(macroValue(row, 'fiber'))} Fi / ${formatMacro(macroValue(row, 'calories'), ' kcal')}`),
          row.source === 'usda'
            ? h('div', { className: 'truncate', style: { color: UI_COLORS.good } }, `USDA: ${row.matchedName}`)
            : row.source === 'usda-generic'
              ? h('div', { className: 'truncate text-accent' }, `USDA, similar food: ${row.matchedName}`)
              : h('div', { style: { color: UI_COLORS.warn } }, 'estimated — no database match')
        ))
      )
    ),
    h(MacroFields, { prefix: 'meal', f: fields, set: setField }),
    h('label', { className: 'flex items-center gap-3 p-3.5 rounded-2xl bg-ink border border-ink-line cursor-pointer' },
      h('input', { type: 'checkbox', checked: keepMeal, onChange: (e) => setKeepMeal(e.target.checked), className: 'w-5 h-5 accent-[#4C9BFF]' }),
      h('span', { className: 'flex-1' },
        h('span', { className: 'block text-[15px] font-bold' }, '⭐ Save as a meal for next time'),
        h('span', { className: 'block text-xs text-ink-muted' }, 'Adds it to your Saved tab with these numbers as one serving'))
    ),
    keepMeal && h(MacroField, { id: 'keep-name', text: true, label: 'Saved meal name', value: keepName, onChange: setKeepName, placeholder: description.trim() || 'e.g. Chicken rice bowl' }),
    h('button', { type: 'button', onClick: handleAdd, className: 'w-full h-14 rounded-full bg-accent text-accent-on font-extrabold text-lg' },
      isEdit ? 'Save changes' : 'Add meal')
  );

  return h(Sheet, { label: isEdit ? 'Edit meal' : 'Add meal', onClose },
    header,
    !isEdit && h('div', { className: 'flex gap-1 p-1 rounded-full bg-ink border border-ink-line mb-3', role: 'tablist' },
      tabBtn('saved', `⭐ Saved${savedMeals.length ? ` (${savedMeals.length})` : ''}`),
      tabBtn('type', '✍️ Type it')),
    tab === 'saved' && !isEdit ? renderSaved() : renderType()
  );
};

// 🌙 NEW: LOG SLEEP FORM
const LogSleepForm = ({ onSave, onCancel, entryToEdit, sleepEntries, initialDate = null }) => {
  const { showToast } = useToast();

  // Form state
  const [date, setDate] = useState(initialDate || formatDate(new Date()));
  const [sleepHours, setSleepHours] = useState(8);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [deepSleepHours, setDeepSleepHours] = useState(1);
  const [deepSleepMinutes, setDeepSleepMinutes] = useState(36);
  const [recoveryRating, setRecoveryRating] = useState(8);
  // Blank, never carried over from the last entry. Prefilling meant every saved
  // sleep entry recorded a weigh-in whether or not one happened -- ten identical
  // 133 lb entries in a row, each counted by the maintenance estimator as a real
  // data point for both its gate and its weight slope.
  const [weight, setWeight] = useState('');

  // Most recent actual weigh-in, shown only as a placeholder hint.
  const lastWeighIn = [...sleepEntries]
    .filter(e => Number(e.weight) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .pop();

  // Auto-calculate deep sleep percentage
  const totalSleepDecimal = timeToDecimal(sleepHours, sleepMinutes);
  const deepSleepDecimal = timeToDecimal(deepSleepHours, deepSleepMinutes);
  const deepSleepPercent = totalSleepDecimal > 0 ? Math.min(100, (deepSleepDecimal / totalSleepDecimal) * 100) : 0;

  // Populate form if editing
  useEffect(() => {
    if (entryToEdit) {
      setDate(entryToEdit.date);
      const totalSleep = decimalToTime(entryToEdit.sleepHours || 8);
      setSleepHours(totalSleep.hours);
      setSleepMinutes(totalSleep.minutes);

      const deepSleepHoursDecimal = (entryToEdit.sleepHours || 8) * ((entryToEdit.deepSleepPercent || 20) / 100);
      const deepSleep = decimalToTime(deepSleepHoursDecimal);
      setDeepSleepHours(deepSleep.hours);
      setDeepSleepMinutes(deepSleep.minutes);

      setRecoveryRating(entryToEdit.recoveryRating || 8);
      // Only a real weigh-in prefills; an entry saved without one stays blank so
      // editing it for some other reason cannot invent a weight.
      setWeight(Number(entryToEdit.weight) > 0 ? entryToEdit.weight : '');
    }
  }, [entryToEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const entry = {
      id: entryToEdit ? entryToEdit.id : generateId(),
      date,
      sleepHours: totalSleepDecimal,
      deepSleepPercent: deepSleepPercent,
      recoveryRating: Number(recoveryRating)
    };
    // No weigh-in means no key at all -- not 0, and not a stand-in start weight.
    // handleSaveSleep replaces the stored entry rather than merging into it, so
    // clearing the field while editing genuinely removes the weight.
    if (Number(weight) > 0) entry.weight = Number(weight);

    onSave(entry);
    showToast('Sleep entry saved!', 'success');
  };

  return h('form', { onSubmit: handleSubmit, className: 'space-y-6 p-4 pb-24' },
    h('div', { className: 'flex justify-between items-center mb-4' },
      h('h2', { className: 'text-2xl font-bold' }, entryToEdit ? 'Edit Sleep' : 'Log Sleep'),
      h('button', {
        type: 'button',
        onClick: onCancel,
        className: 'text-slate-400 hover:text-white text-2xl'
      }, '✕')
    ),

    h('p', { className: 'text-sm text-slate-400 bg-slate-800 p-3 rounded' },
      '💡 Tip: Log your sleep once per day. Weight is tracked with sleep data.'
    ),

    // Date
    h('div', {},
      h('label', { className: 'block text-sm font-medium mb-1' }, 'Date'),
      h(Input, { type: 'date', value: date, onChange: e => setDate(e.target.value) })
    ),

    // Sleep Section
    h('div', { className: 'bg-slate-800 p-4 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold flex items-center gap-2' },
        h('span', {}, '🌙'),
        'Sleep & Recovery'
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Total Sleep Time'),
        h('div', { className: 'grid grid-cols-2 gap-2' },
          h('div', {},
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Hours'),
            h(Input, { type: 'number', min: 0, max: 24, value: sleepHours, onChange: (e) => setSleepHours(Number(e.target.value)) })
          ),
          h('div', {},
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Minutes'),
            h(Input, { type: 'number', min: 0, max: 59, value: sleepMinutes, onChange: (e) => setSleepMinutes(Number(e.target.value)) })
          )
        ),
        h('p', { className: 'text-xs text-slate-400 mt-1' }, `Total: ${formatSleepTime(totalSleepDecimal)}`)
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Deep Sleep Time'),
        h('div', { className: 'grid grid-cols-2 gap-2' },
          h('div', {},
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Hours'),
            h(Input, { type: 'number', min: 0, max: 24, value: deepSleepHours, onChange: (e) => setDeepSleepHours(Number(e.target.value)) })
          ),
          h('div', {},
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Minutes'),
            h(Input, { type: 'number', min: 0, max: 59, value: deepSleepMinutes, onChange: (e) => setDeepSleepMinutes(Number(e.target.value)) })
          )
        ),
        h('p', { className: 'text-xs text-slate-400 mt-1' }, `Deep: ${formatSleepTime(deepSleepDecimal)} (${deepSleepPercent.toFixed(1)}%)`),
        h('p', { className: 'text-sm mt-1' }, getSleepQualityStars(totalSleepDecimal, deepSleepPercent, recoveryRating))
      ),
      h(Slider, { label: 'Recovery Rating', min: 1, max: 10, value: recoveryRating, onChange: (e) => setRecoveryRating(Number(e.target.value)) })
    ),

    // Weight Section
    h('div', { className: 'bg-slate-800 p-4 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold flex items-center gap-2' },
        h('span', {}, '⚖️'),
        'Weight'
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Weight (optional)'),
        h(Input, {
          type: 'number', step: 0.1, value: weight,
          placeholder: lastWeighIn ? `Last: ${lastWeighIn.weight} lb` : undefined,
          onChange: (e) => setWeight(e.target.value)
        }),
        h('p', { className: 'text-xs text-slate-400 mt-1' }, "Leave blank if you didn't weigh in.")
      )
    ),

    // Submit buttons
    h('div', { className: 'flex gap-4' },
      h(Button, { type: 'submit', variant: 'primary', className: 'flex-1' }, 'Save'),
      h(Button, { type: 'button', onClick: onCancel, variant: 'secondary', className: 'flex-1' }, 'Cancel')
    )
  );
};

// Collapsible Section Component
const CollapsibleSection = ({ title, isOpen, onToggle, children, icon = '📋' }) => {
  return h('div', { className: 'bg-slate-800 rounded-lg overflow-hidden' },
    h('button', {
      type: 'button',
      onClick: onToggle,
      className: 'w-full p-4 flex justify-between items-center hover:bg-slate-700 transition-colors'
    },
      h('h3', { className: 'text-lg font-semibold flex items-center gap-2' },
        h('span', {}, icon),
        title
      ),
      h('span', { className: 'text-2xl' }, isOpen ? '▼' : '▶')
    ),
    isOpen && h('div', { className: 'p-4 pt-0 space-y-4' }, children)
  );
};

// --- 📜 WORKOUT LOGGING (redesign, Nov 2026) ---
// One card per exercise, a number keypad, a rest timer you start yourself and a
// record celebration. Saves exactly the same entry shape as the old form.
// In-progress workouts survive a reload, a swipe-away or a trip to another
// screen: the form keeps a local draft until the workout is saved or discarded.
// Local only (not one of the synced keys), and ignored once it is 18 hours old.
const WORKOUT_DRAFT_KEY = 'hypertrophy-workout-draft';
const REST_SECONDS_KEY = 'hypertrophy-rest-seconds';
const readWorkoutDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(WORKOUT_DRAFT_KEY) || 'null');
    return d && Array.isArray(d.exercises) && Date.now() - (d.savedAt || 0) < 18 * 3600 * 1000 ? d : null;
  } catch (e) { return null; }
};
const clearWorkoutDraft = () => { try { localStorage.removeItem(WORKOUT_DRAFT_KEY); } catch (e) { /* ignore */ } };

const isBlankVal = (v) => v === '' || v === null || v === undefined;
const nowHHMM = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// Saved exercise -> form exercise. reps[] decides the set count (it is what volume
// is computed from); weights[] is padded to match; old single-weight logs expand.
// done[] is form-only: sets that already hold numbers count as done.
const exerciseToForm = (ex) => {
  const sets = Array.isArray(ex.reps) && ex.reps.length ? ex.reps.length : Math.max(1, Number(ex.sets) || 3);
  const reps = Array.isArray(ex.reps) ? [...ex.reps] : Array(sets).fill(isBlankVal(ex.reps) ? '' : ex.reps);
  const weights = Array.isArray(ex.weights) ? [...ex.weights] : Array(sets).fill(isBlankVal(ex.weight) ? '' : ex.weight);
  while (reps.length < sets) reps.push('');
  while (weights.length < sets) weights.push('');
  reps.length = sets;
  weights.length = sets;
  return {
    ...ex,
    sets,
    reps,
    weights,
    rpe: ex.rpe || 8,
    done: reps.map((r, i) => !isBlankVal(r) || !isBlankVal(weights[i]))
  };
};

// Sets with neither weight nor reps typed are dropped at save, so an untouched row
// never becomes a logged 0 x 0 set. Exercises with no name or no sets are dropped.
const cleanFormExercises = (list) => list
  .filter(ex => String(ex.name || '').trim())
  .map(ex => {
    const keep = ex.reps.map((r, i) => !(isBlankVal(r) && isBlankVal(ex.weights[i])));
    const reps = ex.reps.filter((_, i) => keep[i]);
    const weights = ex.weights.filter((_, i) => keep[i]);
    return { ...ex, name: String(ex.name).trim(), reps, weights, sets: reps.length };
  })
  .filter(ex => ex.sets > 0);

const LogEntryForm = ({ onSave, onCancel, entryToEdit, allEntries, nutrition, allExerciseNames, setAllExerciseNames, trainingCycle, plannedToday, cycleDay, sleepEntries, suggestedSets, initialDate = null, initialType = null }) => {
  const { showToast } = useToast();
  const isEdit = !!(entryToEdit && entryToEdit.id);
  const entryId = isEdit ? entryToEdit.id : null;

  // A new workout for today picks up where a draft left off. A past day opened from
  // the Calendar is a quick back-fill: no draft is read or written for it, so it can
  // never clobber a live workout's draft.
  const startedForPastDay = !isEdit && !!initialDate && initialDate !== formatDate(new Date());
  const usesDraft = !isEdit && !startedForPastDay;
  const draftRef = useRef(usesDraft ? readWorkoutDraft() : null);
  const draft = draftRef.current;

  // Form state
  const [date, setDate] = useState(draft?.date || initialDate || formatDate(new Date()));
  // Back-filled workouts default to noon rather than "now" on some other day.
  const [workoutTime, setWorkoutTime] = useState(draft?.workoutTime || (startedForPastDay ? '12:00' : nowHHMM()));
  const [trainingType, setTrainingType] = useState(draft?.trainingType || initialType || plannedToday);
  const [exercises, setExercises] = useState(() => (draft?.exercises || []).map(exerciseToForm).map((ex, i) => ({ ...ex, done: draft.exercises[i].done || ex.done })));
  const [cardio, setCardio] = useState(draft?.cardio || []);
  const [duration, setDuration] = useState(60);
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [cardioSectionOpen, setCardioSectionOpen] = useState((draft?.cardio || []).length > 0);

  // Flow state
  const [activeIndex, setActiveIndex] = useState(draft?.activeIndex ?? 0);
  const [keypad, setKeypad] = useState(null);   // { ex, set, field, weight, reps, fresh }
  const [sheet, setSheet] = useState(null);     // 'add' | 'options' | 'details'
  const [renameIndex, setRenameIndex] = useState(null);
  const [rest, setRest] = useState(null);       // { endsAt, total }
  const [celebration, setCelebration] = useState(null);
  const [sessionPRs, setSessionPRs] = useState(draft?.sessionPRs || {}); // name -> [weights]
  const [phase, setPhase] = useState('log');    // 'log' | 'summary'
  const durationTouched = useRef(false);

  // Workout timer: new workouts only, from the first exercise added.
  const [workoutStartTime, setWorkoutStartTime] = useState(draft?.startTime || null);
  const [elapsedTime, setElapsedTime] = useState(0);
  useEffect(() => {
    if (usesDraft && (exercises.length > 0 || cardio.length > 0) && !workoutStartTime) setWorkoutStartTime(Date.now());
  }, [exercises.length, cardio.length]);
  useEffect(() => {
    if (!workoutStartTime) return undefined;
    const tick = () => setElapsedTime(Math.floor((Date.now() - workoutStartTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [workoutStartTime]);

  useEffect(() => {
    if (draft && draft.exercises.length) showToast('Picked up your workout where you left off');
  }, []);

  // Sleep lives in sleepEntries (post-V3), not in the nutrition array.
  const todaysSleepEntry = (sleepEntries || []).find(s => s.date === formatDate(new Date()));
  const todaySleepPercent = Number(todaysSleepEntry?.deepSleepPercent) > 0 ? Number(todaysSleepEntry.deepSleepPercent) : 0;

  const cardioMachines = getAllCardioNames();
  const cardioTotals = getCardioTotals({ cardio });

  // An imported Fitbit placeholder is typed 'Workout' until you pick the real split.
  const availableWorkoutTypes = [...new Set([plannedToday, 'REST', ...trainingCycle, ...WORKOUT_TYPES, ...(entryToEdit?.trainingType ? [entryToEdit.trainingType] : [])])];

  // Most recent first, unique, last 10.
  const recentExercises = [...new Set(
    allEntries.flatMap(e => (e.exercises || []).map(ex => ex.name)).filter(Boolean).reverse()
  )].slice(0, 10);

  // Populate from the entry being edited (once).
  useEffect(() => {
    if (!entryToEdit) return;
    setDate(entryToEdit.date);
    if (entryToEdit.loggedAt) {
      const t = new Date(entryToEdit.loggedAt);
      setWorkoutTime(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
    }
    setTrainingType(entryToEdit.trainingType || 'Push/Biceps');
    setExercises((entryToEdit.exercises || []).map(exerciseToForm));
    const normalizedCardio = normalizeCardioForForm(entryToEdit.cardio);
    setCardio(normalizedCardio);
    if (normalizedCardio.length > 0) setCardioSectionOpen(true);
    setDuration(entryToEdit.duration || 60);
    setCaloriesBurned(entryToEdit.caloriesBurned || '');
    setActiveIndex(0);
  }, [entryToEdit]);

  // Keep the draft current while a new workout is being logged.
  useEffect(() => {
    if (!usesDraft) return;
    if (exercises.length === 0 && cardio.length === 0) return;
    try {
      localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(), date, workoutTime, trainingType, exercises, cardio,
        startTime: workoutStartTime, activeIndex, sessionPRs
      }));
    } catch (e) { /* storage full: the workout is still on screen */ }
  }, [exercises, cardio, date, workoutTime, trainingType, activeIndex, sessionPRs]);

  // --- History lookups (this entry excluded) ---
  const lastTimeFor = (name) => {
    if (!name) return null;
    for (let i = allEntries.length - 1; i >= 0; i--) {
      const entry = allEntries[i];
      if (entry.id === entryId) continue;
      const ex = (entry.exercises || []).find(x => x.name === name);
      if (ex) {
        const f = exerciseToForm(ex);
        return { date: entry.date, rpe: ex.rpe, eachHand: ex.eachHand, sets: f.reps.map((r, k) => ({ weight: f.weights[k], reps: r })) };
      }
    }
    return null;
  };
  const bestFor = (name) => (name ? getPreviousPR(name, allEntries, entryId) : 0);
  const bestDateFor = (name, weight) => {
    for (const entry of allEntries) {
      if (entry.id === entryId) continue;
      const ex = (entry.exercises || []).find(x => x.name === name);
      if (ex && getMaxWeight(Array.isArray(ex.weights) ? ex.weights : [ex.weight]) === weight) {
        return parseLocalDate(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    return null;
  };

  // Default for "Weight is each hand". Your own last log of this exact exercise wins:
  // it already encodes what a name rule cannot see -- a dumbbell skull-crusher is one
  // dumbbell held in both hands, so it is NOT each hand. The dumbbell name rule only
  // decides for exercises you have never logged.
  const defaultEachHandFor = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    for (let i = allEntries.length - 1; i >= 0; i--) {
      const match = (allEntries[i].exercises || []).find(ex => ex.name === trimmed && typeof ex.eachHand === 'boolean');
      if (match) return match.eachHand;
    }
    return isDumbbellExercise(trimmed);
  };

  // --- Exercise edits ---
  const patchExercise = (i, fn) => setExercises(list => list.map((ex, k) => (k === i ? fn(ex) : ex)));
  const setAt = (arr, idx, val) => { const next = [...arr]; next[idx] = val; return next; };

  const addExerciseNamed = (name) => {
    const last = lastTimeFor(name);
    const count = last ? last.sets.length : 3;
    const ex = {
      name,
      sets: count,
      weights: Array(count).fill(''),
      reps: Array(count).fill(''),
      done: Array(count).fill(false),
      rpe: (last && last.rpe) || 8,
      eachHand: defaultEachHandFor(name)
    };
    setExercises(list => [...list, ex]);
    setActiveIndex(exercises.length);
  };

  const renameExercise = (i, name) => {
    // Follow the name only when its each-hand default actually changes, so a box set
    // by hand survives typo fixes but a different kind of exercise still updates it.
    const before = defaultEachHandFor(exercises[i].name);
    const after = defaultEachHandFor(name);
    patchExercise(i, ex => ({ ...ex, name, ...(before !== after ? { eachHand: after } : {}) }));
  };

  const addSet = (i) => patchExercise(i, ex => ({
    ...ex, sets: ex.reps.length + 1, weights: [...ex.weights, ''], reps: [...ex.reps, ''], done: [...(ex.done || []), false]
  }));
  const removeLastSet = (i) => patchExercise(i, ex => (ex.reps.length <= 1 ? ex : {
    ...ex, sets: ex.reps.length - 1, weights: ex.weights.slice(0, -1), reps: ex.reps.slice(0, -1), done: (ex.done || []).slice(0, ex.reps.length - 1)
  }));
  const copyWeightToAllSets = (i) => {
    const ex = exercises[i];
    const first = ex.weights.find(w => !isBlankVal(w));
    if (isBlankVal(first)) { showToast('Enter a weight on one set first'); return; }
    patchExercise(i, x => ({ ...x, weights: x.weights.map((w, k) => ((x.done || [])[k] ? w : first)) }));
    showToast('Same weight on every set left to do');
  };
  const moveExercise = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= exercises.length) return;
    setExercises(list => { const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next; });
    setActiveIndex(j);
  };
  const removeExercise = (i) => {
    const ex = exercises[i];
    if ((ex.done || []).some(Boolean) && !window.confirm(`Remove ${ex.name || 'this exercise'} and its logged sets?`)) return;
    setExercises(list => list.filter((_, k) => k !== i));
    setActiveIndex(a => Math.max(0, Math.min(a > i ? a - 1 : a, exercises.length - 2)));
    setSheet(null);
  };

  // What to put in a set you haven't typed: weight follows your previous set today
  // (or this set last time); reps follow this set last time (or your previous set).
  const suggestFor = (i, s) => {
    const ex = exercises[i];
    const last = lastTimeFor(ex.name);
    const lastSet = last && (last.sets[s] || last.sets[last.sets.length - 1]);
    let prevToday = null;
    for (let k = s - 1; k >= 0; k--) if ((ex.done || [])[k]) { prevToday = { weight: ex.weights[k], reps: ex.reps[k] }; break; }
    return {
      weight: prevToday && !isBlankVal(prevToday.weight) ? prevToday.weight : (lastSet ? lastSet.weight : ''),
      reps: lastSet && !isBlankVal(lastSet.reps) ? lastSet.reps : (prevToday ? prevToday.reps : '')
    };
  };

  // --- Records ---
  const sessionBestFor = (name) => Math.max(bestFor(name), ...(sessionPRs[name] || [0]));
  const checkRecord = (name, weight, reps) => {
    const w = Number(weight) || 0;
    const prev = bestFor(name);
    if (!name || w <= 0 || prev <= 0) return; // first time on an exercise isn't a record
    const sessionBest = sessionBestFor(name);
    if (w <= sessionBest) return;
    const nextPRs = { ...sessionPRs, [name]: [...(sessionPRs[name] || []), w] };
    setSessionPRs(nextPRs);
    if (!getUiPrefs().celebrations) {
      showToast(`🏆 New record: ${name} ${w} lb`, 'success');
      return;
    }
    setCelebration({
      exercise: name, weight: w, reps: Number(reps) || 0,
      oldBest: sessionBest, oldDate: sessionBest === prev ? bestDateFor(name, prev) : 'Earlier today',
      recordCount: Object.keys(nextPRs).length
    });
  };

  // --- Rest timer (only when you start it) ---
  const restSeconds = () => {
    const saved = Number(localStorage.getItem(REST_SECONDS_KEY));
    return saved >= 15 && saved <= 900 ? saved : 120;
  };
  const startRest = () => {
    const total = restSeconds();
    setRest({ endsAt: Date.now() + total * 1000, total });
  };
  const adjustRest = (delta) => setRest(r => {
    if (!r) return r;
    const total = Math.max(15, r.total + delta);
    try { localStorage.setItem(REST_SECONDS_KEY, String(total)); } catch (e) { /* ignore */ }
    return { endsAt: r.endsAt + delta * 1000, total };
  });
  const finishRest = () => {
    setRest(null);
    if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
    showToast("Rest's up. Next set 💪");
  };

  // --- Logging a set ---
  const commitSet = (i, s, weight, reps, thenRest) => {
    const name = exercises[i].name;
    patchExercise(i, ex => ({
      ...ex,
      weights: setAt(ex.weights, s, isBlankVal(weight) ? '' : String(weight)),
      reps: setAt(ex.reps, s, isBlankVal(reps) ? '' : String(reps)),
      done: setAt(ex.done || [], s, true)
    }));
    checkRecord(name, weight, reps);
    if (thenRest) startRest();
  };

  const openKeypad = (i, s, field) => {
    const ex = exercises[i];
    const sug = suggestFor(i, s);
    setActiveIndex(i);
    setKeypad({
      ex: i, set: s, field,
      weight: String(isBlankVal(ex.weights[s]) ? (sug.weight ?? '') : ex.weights[s]),
      reps: String(isBlankVal(ex.reps[s]) ? (sug.reps ?? '') : ex.reps[s]),
      fresh: { weight: true, reps: true }
    });
  };

  const toggleDone = (i, s) => {
    const ex = exercises[i];
    if ((ex.done || [])[s]) { patchExercise(i, x => ({ ...x, done: setAt(x.done || [], s, false) })); return; }
    const sug = suggestFor(i, s);
    const weight = isBlankVal(ex.weights[s]) ? sug.weight : ex.weights[s];
    const reps = isBlankVal(ex.reps[s]) ? sug.reps : ex.reps[s];
    if (isBlankVal(weight) && isBlankVal(reps)) { openKeypad(i, s, 'weight'); return; }
    commitSet(i, s, weight, reps, false);
  };

  const keypadKey = (k) => setKeypad(kp => {
    const f = kp.field;
    let v = kp.fresh[f] ? '' : kp[f];
    if (k === '⌫') v = (kp.fresh[f] ? kp[f] : v).slice(0, -1);
    else if (k === '.') { if (f === 'reps' || v.includes('.')) return kp; v = (v || '0') + '.'; }
    else if (v.length < 6) v = v === '0' ? k : v + k;
    return { ...kp, [f]: v, fresh: { ...kp.fresh, [f]: false } };
  });
  const keypadChip = (d) => setKeypad(kp => {
    if (d === 'same') {
      const last = lastTimeFor(exercises[kp.ex].name);
      const s = last && (last.sets[kp.set] || last.sets[last.sets.length - 1]);
      if (!s) { showToast('No earlier log of this exercise'); return kp; }
      return { ...kp, weight: String(s.weight ?? ''), reps: String(s.reps ?? ''), fresh: { weight: false, reps: false } };
    }
    const f = kp.field;
    const next = Math.max(0, Math.round(((Number(kp[f]) || 0) + d) * 10) / 10);
    return { ...kp, [f]: String(next), fresh: { ...kp.fresh, [f]: false } };
  });
  const keypadSave = (thenRest) => {
    const kp = keypad;
    setKeypad(null);
    if (isBlankVal(kp.weight) && isBlankVal(kp.reps)) return;
    commitSet(kp.ex, kp.set, kp.weight, kp.reps, thenRest);
  };

  // --- Cardio Handlers ---
  // Cardio rows track time + steps, so they get their own list rather than
  // being squeezed into the weight/reps shape of a strength exercise.
  const addCardio = (name = '') => {
    // '' for the optional fields, not 0 -- an untouched field must save as null.
    setCardio([...cardio, { name, minutes: '', steps: '', effort: '', timing: '' }]);
  };
  const updateCardio = (index, field, value) => {
    const newCardio = [...cardio];
    newCardio[index] = { ...newCardio[index], [field]: value };
    setCardio(newCardio);
  };
  const removeCardio = (index) => {
    setCardio(cardio.filter((_, i) => i !== index));
  };
  // Pre-fill a machine with the last session logged on it
  const addCardioFromHistory = (name) => {
    const lastEntry = [...allEntries].reverse().find(entry =>
      getCardioList(entry).some(c => c.name === name)
    );
    const lastCardio = lastEntry && getCardioList(lastEntry).find(c => c.name === name);
    if (lastCardio) {
      setCardio([...cardio, ...normalizeCardioForForm([lastCardio])]);
      showToast('Cardio pre-filled!');
    } else {
      addCardio(name);
    }
  };

  // --- Building the saved entry (same shape as before the redesign) ---
  const buildEntry = () => {
    const cleaned = trainingType === 'REST' ? [] : cleanFormExercises(exercises);
    const savedExercises = cleaned.map(ex => {
      const weights = (ex.weights || []).map(w => Number(w) || 0);
      const reps = ex.reps.map(r => Number(r) || 0);
      return {
        name: ex.name,
        weights,
        eachHand: ex.eachHand,
        sets: Number(ex.sets),
        reps,
        rpe: Number(ex.rpe),
        volumeLoad: calculateVolumeLoad(weights, reps, ex.name, sleepEntries, ex.eachHand)
      };
    });
    return {
      id: entryToEdit ? entryToEdit.id : generateId(),
      date,
      loggedAt: (() => {
        // Combine date + workoutTime into a precise local ISO timestamp
        const [year, month, day] = date.split('-').map(Number);
        const [hours, minutes] = workoutTime.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes, 0).toISOString();
      })(),
      trainingType,
      plannedTrainingType: plannedToday,
      cycleDay: cycleDay,
      exercises: savedExercises,
      totalSets: trainingType === 'REST' ? 0 : savedExercises.reduce((sum, ex) => sum + Number(ex.sets), 0),
      totalVolume: savedExercises.reduce((sum, ex) => sum + ex.volumeLoad, 0),
      duration: Number(duration),
      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
      // Rows with no machine name are dropped so blank rows never persist.
      cardio: trainingType === 'REST' ? [] : cardio
        .filter(c => c.name && String(c.name).trim())
        .map(toSavedCardioItem),
    };
  };

  const handleSave = () => {
    const entry = buildEntry();
    const newNames = new Set(allExerciseNames);
    entry.exercises.forEach(ex => { if (ex.name) newNames.add(ex.name); });
    setAllExerciseNames(Array.from(newNames));
    const records = Object.keys(sessionPRs).length;
    onSave(entry);
    if (usesDraft) clearWorkoutDraft(); // a back-filled past day never touches today's draft
    showToast(records ? `Workout saved · ${records} new record${records === 1 ? '' : 's'} 🏆` : 'Workout saved!', 'success');
  };

  const closeWorkout = () => {
    if (usesDraft && (exercises.length || cardio.length)) showToast('Saved as a draft. Tap Resume on Home to carry on');
    onCancel();
  };
  const discardWorkout = () => {
    if (!window.confirm('Discard this workout? Nothing from it will be saved.')) return;
    if (usesDraft) clearWorkoutDraft();
    onCancel();
  };

  const goToSummary = () => {
    if (!durationTouched.current && !isEdit && workoutStartTime) {
      setDuration(Math.max(1, Math.round(elapsedTime / 60)));
    }
    setRest(null);
    setPhase('summary');
  };

  // --- 💡 FILE UPLOAD (AI fill from a photo or text log) ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);

    const extractPrompt = `Extract fitness data from this file/image.
Provide ONLY a JSON object with the following fields (use null if not found):
{
  "sleepHours": number,
  "deepSleepPercent": number,
  "protein": number,
  "calories": number,
  "weight": number,
  "exercises": [
    {"name": "string", "weight": number, "sets": number, "reps": [number, number]}
  ]
}
Example from Fitbit screenshot: "8h 15m sleep", "1h 40m deep" -> "sleepHours": 8.25, "deepSleepPercent": 20.4
Example from text: "Bench 175 3x5" -> "exercises": [{"name": "Bench Press", "weight": 175, "sets": 3, "reps": [5, 5, 5]}]
`;

    let apiContent = [{ type: "text", text: extractPrompt }];

    try {
      if (file.type.startsWith('image/')) {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = error => reject(error);
        });
        apiContent.unshift({ type: "image", source: { type: "base64", media_type: file.type, data: base64Data } });
      } else if (file.type === 'text/plain') {
        const textData = await file.text();
        apiContent.unshift({ type: "text", text: `FILE CONTENT:\n${textData}` });
      } else {
        throw new Error("Unsupported file type");
      }

      const res = await fetch(`/.netlify/functions/get-vision-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: apiContent })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(`AI Gateway failed: ${errData.error || res.statusText}`);
      }
      const data = await res.json();
      const resultJson = parseAiJson(data.text);

      // Workout data only - nutrition/sleep are logged separately.
      if (resultJson.exercises && resultJson.exercises.length > 0) {
        setExercises(resultJson.exercises.map(ex => exerciseToForm({
          ...ex,
          weights: ex.weight ? Array(ex.sets || 3).fill(ex.weight) : (ex.weights || ['', '', '']),
          rpe: 8
        })));
        setActiveIndex(0);
        setSheet(null);
      }
      if (resultJson.protein || resultJson.calories) {
        showToast(`Extracted ${resultJson.protein || 0}g P / ${resultJson.calories || 0} kCal. Please add to nutrition log.`, 'success');
      } else {
        showToast('Data extracted!', 'success');
      }
    } catch (err) {
      console.error("Upload error:", err);
      showToast(err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // --- Derived numbers for the screen ---
  const totalSetRows = exercises.reduce((sum, ex) => sum + ex.reps.length, 0);
  const doneSets = exercises.reduce((sum, ex) => sum + (ex.done || []).filter(Boolean).length, 0);
  const isToday = date === formatDate(new Date());
  const dateLabel = isToday ? 'Today' : parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const typeLabel = trainingType === 'REST' ? 'Rest day' : String(trainingType).split('/').join(' / ');
  const active = exercises[activeIndex];
  const currentSetOf = (ex) => (ex ? (ex.done || []).findIndex(d => !d) : -1);
  const restNext = (() => {
    if (!active) return null;
    const s = currentSetOf(active);
    if (s >= 0) return `${active.name || 'exercise'}, set ${s + 1}`;
    const nextEx = exercises.find((ex, k) => k > activeIndex && currentSetOf(ex) >= 0);
    return nextEx ? nextEx.name : null;
  })();

  // --- Cardio section (unchanged fields; restyled by the theme) ---
  const renderCardio = () => h(CollapsibleSection, {
    title: cardio.length > 0 ? `Cardio (${cardio.length})` : 'Cardio',
    icon: '🏃',
    isOpen: cardioSectionOpen,
    onToggle: () => setCardioSectionOpen(!cardioSectionOpen)
  },
    h('datalist', { id: 'cardio-machines' }, cardioMachines.map(machine => h('option', { key: machine, value: machine }))),
    h('div', { className: 'mb-3' },
      h('p', { className: 'text-xs text-slate-400 mb-2' }, 'Quick add:'),
      h('div', { className: 'flex flex-wrap gap-2' },
        cardioMachines.map(machine =>
          h('button', {
            key: machine,
            type: 'button',
            onClick: () => addCardioFromHistory(machine),
            className: 'px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-full text-sm transition-colors min-h-[44px] flex items-center gap-1'
          }, getCardioData(machine)?.icon || '', machine)
        )
      )
    ),
    h('div', { className: 'space-y-4' },
      cardio.map((c, i) => {
        // [] for a free-text or unrecognised machine, which is exactly what keeps
        // free-text machines working: they get the universal fields and nothing else.
        const machineFields = getCardioFields(c.name);
        return h('div', { key: i, className: 'p-3 bg-slate-700 rounded-lg space-y-3' },
          h('div', { className: 'flex justify-between items-center' },
            h('span', { className: 'font-semibold' }, `Cardio ${i + 1}`),
            h('button', { type: 'button', className: 'text-red-400 min-h-[44px] px-2', onClick: () => removeCardio(i) }, 'Remove')
          ),
          h('div', {},
            h('label', { className: 'block text-xs mb-1' }, 'Machine'),
            h(Input, { type: 'text', list: 'cardio-machines', placeholder: 'e.g., Stairmaster', value: c.name, onChange: (e) => updateCardio(i, 'name', e.target.value) })
          ),
          h('div', { className: 'grid grid-cols-2 gap-2' },
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, 'Time (minutes)'),
              h(Input, { type: 'number', min: 0, step: 1, placeholder: 'e.g., 20', value: c.minutes, onChange: (e) => updateCardio(i, 'minutes', e.target.value) })
            ),
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, getCardioData(c.name)?.stepLabel || 'Steps'),
              h(Input, { type: 'number', min: 0, step: 1, placeholder: 'e.g., 1500', value: c.steps, onChange: (e) => updateCardio(i, 'steps', e.target.value) })
            )
          ),
          // Universal fields, on every row whatever the machine. Both optional:
          // blank means not tracked and saves as null rather than a logged zero.
          h('div', { className: 'grid grid-cols-2 gap-2' },
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, 'Effort (RPE 1-10)'),
              h(Input, { type: 'number', min: 1, max: 10, step: 1, placeholder: 'optional', value: asFormValue(c.effort), onChange: (e) => updateCardio(i, 'effort', e.target.value) })
            ),
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, 'When'),
              h(Select, { value: c.timing || '', onChange: (e) => updateCardio(i, 'timing', e.target.value) },
                h('option', { value: '' }, 'Not tracked'),
                h('option', { value: 'before' }, 'Before lifting'),
                h('option', { value: 'after' }, 'After lifting')
              )
            )
          ),
          // Machine-specific fields, rendered from the library table so the keys
          // written here are the same keys the save mapper whitelists.
          machineFields.length > 0 && h('div', { className: 'grid grid-cols-2 gap-2' },
            machineFields.map(f =>
              h('div', { key: f.key },
                h('label', { className: 'block text-xs mb-1' }, f.label),
                h(Input, { type: f.type, min: 0, step: 'any', placeholder: 'optional', value: asFormValue(c[f.key]), onChange: (e) => updateCardio(i, f.key, e.target.value) })
              )
            )
          )
        );
      }),
      h(Button, { type: 'button', variant: 'secondary', onClick: () => addCardio() }, '+ Add Cardio')
    ),
    cardio.length > 0 && h('div', { className: 'p-4 bg-slate-900 rounded-lg space-y-2' },
      h('div', { className: 'grid grid-cols-2 gap-4' },
        h('div', {},
          h('div', { className: 'text-sm text-slate-400' }, 'Total Time'),
          h('div', { className: 'text-2xl font-bold text-orange-400' }, `${cardioTotals.minutes} min`)
        ),
        h('div', {},
          h('div', { className: 'text-sm text-slate-400' }, 'Total Steps'),
          h('div', { className: 'text-2xl font-bold text-orange-400' }, cardioTotals.steps.toLocaleString())
        )
      ),
      Object.keys(cardioTotals.stepsByMachine).length > 1 && h('div', { className: 'text-xs text-slate-400' },
        Object.entries(cardioTotals.stepsByMachine).map(([machine, steps]) => `${machine}: ${steps.toLocaleString()}`).join(' · ')
      )
    )
  );

  // --- Details sheet: date, time, type, photo fill, discard ---
  const renderDetails = () => h(Sheet, { label: 'Workout details', onClose: () => setSheet(null) },
    h('div', { className: 'flex items-center gap-3 mb-3' },
      h('div', { className: 'flex-1 text-xl font-extrabold' }, 'Workout details'),
      h('button', { type: 'button', onClick: () => setSheet(null), 'aria-label': 'Close', className: 'w-11 h-11 rounded-full border border-ink-line bg-ink flex items-center justify-center' }, '✕')
    ),
    h('div', { className: 'flex flex-col gap-3' },
      h('div', { className: 'grid grid-cols-2 gap-3' },
        h('div', {},
          h('label', { className: 'block text-sm font-bold mb-1', htmlFor: 'wk-date' }, 'Date'),
          h(Input, { id: 'wk-date', type: 'date', value: date, onChange: (e) => setDate(e.target.value) })
        ),
        h('div', {},
          h('label', { className: 'block text-sm font-bold mb-1', htmlFor: 'wk-time' }, 'Time'),
          h(Input, { id: 'wk-time', type: 'time', value: workoutTime, onChange: (e) => setWorkoutTime(e.target.value) })
        )
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-bold mb-1', htmlFor: 'wk-type' }, 'Workout'),
        h(Select, { id: 'wk-type', value: trainingType, onChange: (e) => setTrainingType(e.target.value) },
          availableWorkoutTypes.map(type => h('option', { key: type, value: type }, type === plannedToday ? `${type} (planned)` : type))
        )
      ),
      trainingType !== 'REST' && h('div', { className: 'p-3.5 rounded-2xl bg-ink border border-ink-line' },
        h('label', { className: 'block text-sm font-bold mb-1', htmlFor: 'file-upload' }, '📷 Fill from a photo or text log'),
        h('p', { className: 'text-xs text-ink-muted mb-2' }, 'AI reads the exercises; this replaces the ones on screen.'),
        h(Input, { type: 'file', id: 'file-upload', onChange: handleFileUpload, accept: 'image/*,.txt' }),
        isUploading && h('div', { className: 'flex items-center gap-2 text-blue-400 mt-2' },
          h('div', { className: 'animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400' }),
          'Reading…'
        )
      ),
      !isEdit && h('button', {
        type: 'button', onClick: discardWorkout,
        className: 'h-12 w-full rounded-full border font-extrabold text-[15px]',
        style: { borderColor: UI_COLORS.bad, color: UI_COLORS.bad }
      }, 'Discard workout')
    )
  );

  // --- Summary phase ---
  if (phase === 'summary') {
    const cleaned = cleanFormExercises(exercises);
    const entry = buildEntry();
    const skipped = exercises.reduce((n, ex) => n + ex.reps.filter((r, i) => isBlankVal(r) && isBlankVal(ex.weights[i])).length, 0);
    const sleep = sleepEntries.find(s => s.date === date);
    const grade = trainingType === 'REST' ? null : getGrade(sleep, entry.totalSets);
    const records = Object.keys(sessionPRs).length;
    const note = trainingType === 'REST'
      ? 'Rest day. Nothing to grade.'
      : [
          `${entry.totalSets} working set${entry.totalSets === 1 ? '' : 's'}${records ? ` with ${records} new record${records === 1 ? '' : 's'}` : ''}.`,
          sleep
            ? `Sleep that night: ${Number(sleep.sleepHours).toFixed(1)} h, ${Number(sleep.deepSleepPercent || 0).toFixed(0)}% deep${isToday && suggestedSets ? `, enough for about ${suggestedSets} sets` : ''}.`
            : 'Log that night’s sleep to get a grade.'
        ].join(' ');
    const rows = cleaned.map(ex => {
      let topI = 0;
      ex.weights.forEach((w, k) => {
        const wn = Number(w) || 0, tn = Number(ex.weights[topI]) || 0;
        if (wn > tn || (wn === tn && (Number(ex.reps[k]) || 0) > (Number(ex.reps[topI]) || 0))) topI = k;
      });
      return {
        name: ex.name, sets: ex.sets, pr: !!sessionPRs[ex.name],
        top: `${(Number(ex.weights[topI]) || 0).toLocaleString()} × ${Number(ex.reps[topI]) || 0}`
      };
    });
    const timeRange = !isEdit && workoutStartTime
      ? `${new Date(workoutStartTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – now`
      : null;
    return h('div', { className: 'flex flex-col gap-3.5' },
      h('div', { className: 'text-center' },
        h('div', { className: 'text-xl font-extrabold' }, isEdit ? 'Review changes' : 'Workout done'),
        h('div', { className: 'text-[13px] text-ink-muted' }, `${dateLabel} · ${typeLabel}`)
      ),
      h(FinishSummary, {
        grade: grade && grade !== 'N/A' ? grade : null,
        gradeNote: note,
        stats: [
          { label: '⏱ Duration', value: `${Number(duration) || 0} min`, sub: timeRange },
          { label: '🔢 Working sets', value: String(entry.totalSets), sub: isToday && suggestedSets ? `sleep allowed about ${suggestedSets}` : null },
          { label: '🏋️ Volume', value: `${Math.round(entry.totalVolume).toLocaleString()} lb`, sub: 'weight × reps' },
          { label: '🏆 Records', value: records ? `${records} new` : 'None', sub: records ? Object.keys(sessionPRs).slice(0, 2).join(', ') : null }
        ],
        rows,
        skippedSets: skipped,
        duration,
        onDuration: (v) => { durationTouched.current = true; setDuration(v); },
        calories: caloriesBurned,
        onCalories: setCaloriesBurned,
        isEdit,
        onSave: handleSave,
        onBack: () => setPhase('log')
      })
    );
  }

  // --- Log phase ---
  return h('div', { className: 'flex flex-col gap-3', style: { paddingBottom: rest ? 120 : 0 } },
    h(SessionBar, {
      typeLabel, dateLabel,
      elapsed: !isEdit && workoutStartTime ? elapsedTime : null,
      doneSets, totalSets: totalSetRows,
      suggestedSets: isToday ? suggestedSets : null,
      onDetails: () => setSheet('details'),
      onClose: usesDraft ? closeWorkout : onCancel,
      onFinish: goToSummary
    }),

    trainingType === 'REST'
      ? h('div', { className: 'bg-ink-card border border-ink-line rounded-3xl p-5 flex flex-col items-center text-center gap-3' },
          h('span', { className: 'text-4xl', 'aria-hidden': 'true' }, '😴'),
          h('div', { className: 'text-lg font-extrabold' }, 'Rest day'),
          h('p', { className: 'text-sm text-ink-muted max-w-xs' }, 'Logging it keeps your cycle and recovery on track. Tap the workout name above to switch to a training day.'),
          h('button', { type: 'button', onClick: handleSave, className: 'w-full h-14 rounded-full bg-accent text-accent-on font-extrabold text-lg' }, isEdit ? 'Save changes' : 'Log rest day')
        )
      : h(Fragment, null,
          exercises.length === 0 && h('div', { className: 'bg-ink-card border border-ink-line rounded-3xl p-5 text-center' },
            h('div', { className: 'text-lg font-extrabold' }, 'Add your first exercise'),
            h('p', { className: 'text-sm text-ink-muted mt-1' }, 'Each exercise gets its own card. Tap a weight or reps box to type it, or the check to log the set.')
          ),
          exercises.map((ex, i) => h(ExerciseCard, {
            key: i,
            index: i,
            ex,
            active: i === activeIndex,
            last: (lastTimeFor(ex.name) || { sets: [] }).sets,
            best: bestFor(ex.name),
            currentSet: currentSetOf(ex),
            prSets: sessionPRs[ex.name] || [],
            restRunning: !!rest,
            onActivate: () => setActiveIndex(i),
            onCell: (s, field) => openKeypad(i, s, field),
            onToggleDone: (s) => toggleDone(i, s),
            onAddSet: () => addSet(i),
            onCopyWeight: () => copyWeightToAllSets(i),
            onRpe: (v) => patchExercise(i, x => ({ ...x, rpe: v })),
            onStartRest: startRest,
            onOptions: () => { setActiveIndex(i); setSheet('options'); },
            coach: i === activeIndex && ex.name ? h(CoachSuggestionBox, {
              exerciseName: ex.name,
              allEntries,
              todaySleepPercent,
              trainingType,
              allExerciseNames
            }) : null
          })),
          h('button', {
            type: 'button', onClick: () => { setRenameIndex(null); setSheet('add'); },
            className: 'h-[52px] rounded-full border border-dashed border-ink-line text-ink-muted font-extrabold text-[15px]'
          }, '＋ Add exercise'),
          renderCardio(),
          exercises.length > 0 && h('button', {
            type: 'button', onClick: goToSummary,
            className: 'w-full h-14 rounded-full bg-accent text-accent-on font-extrabold text-lg mt-1'
          }, '✓ Finish workout')
        ),

    sheet === 'details' && renderDetails(),
    sheet === 'add' && h(AddExerciseSheet, {
      // Your own names first, then the exercise library: library names are what
      // the recovery model knows, so picking one keeps fatigue tracking accurate.
      names: [...new Set([...allExerciseNames.filter(Boolean), ...getAllLibraryExercises()])],
      recent: recentExercises,
      onClose: () => setSheet(null),
      onPick: (name) => {
        if (renameIndex !== null) renameExercise(renameIndex, name);
        else addExerciseNamed(name);
        setRenameIndex(null);
        setSheet(null);
      }
    }),
    sheet === 'options' && active && h(ExerciseOptionsSheet, {
      ex: active,
      canMoveUp: activeIndex > 0,
      canMoveDown: activeIndex < exercises.length - 1,
      onRename: () => { setRenameIndex(activeIndex); setSheet('add'); },
      onEachHand: () => { patchExercise(activeIndex, x => ({ ...x, eachHand: !x.eachHand })); setSheet(null); },
      onRemoveSet: () => { removeLastSet(activeIndex); setSheet(null); },
      onMove: (d) => { moveExercise(activeIndex, d); setSheet(null); },
      onRemove: () => removeExercise(activeIndex),
      onClose: () => setSheet(null)
    }),
    keypad && (() => {
      const ex = exercises[keypad.ex];
      const last = lastTimeFor(ex.name);
      const lastSet = last && last.sets[keypad.set];
      const best = sessionBestFor(ex.name);
      const w = Number(keypad.weight) || 0;
      return h(KeypadSheet, {
        title: `${ex.name || 'Exercise'} · Set ${keypad.set + 1}`,
        sub: [lastSet ? `Last time ${lastSet.weight} × ${lastSet.reps}` : null, best > 0 ? `Best ${best} lb` : null].filter(Boolean).join(' · ') || 'First time logging this',
        weight: keypad.weight,
        reps: keypad.reps,
        field: keypad.field,
        eachHand: ex.eachHand,
        prText: bestFor(ex.name) > 0 && w > best ? `${w} lb beats your best of ${best} lb` : null,
        onField: (f) => setKeypad(kp => ({ ...kp, field: f })),
        onKey: keypadKey,
        onChip: keypadChip,
        onSave: keypadSave,
        onClose: () => setKeypad(null)
      });
    })(),
    rest && h(RestTimerBar, {
      endsAt: rest.endsAt,
      total: rest.total,
      nextLabel: restNext,
      onAdjust: adjustRest,
      onSkip: () => setRest(null),
      onDone: finishRest
    }),
    celebration && h(PRCelebration, { ...celebration, onClose: () => setCelebration(null) })
  );
};

// --- 📅 UNIFIED DAILY CARD COMPONENT ---
const DailyCard = ({ dailyData, allEntries, onEditWorkout, onDeleteWorkout, onEditSleep, onDeleteSleep, onEditMeal, onDeleteMeal }) => {
  const { date, workouts, meals, sleep } = dailyData;

  const [sleepExpanded, setSleepExpanded] = useState(false);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);
  const [workoutExpanded, setWorkoutExpanded] = useState(false);

  // Calculate nutrition totals
  const totalProtein = meals.reduce((sum, meal) => sum + (Number(meal.protein) || 0), 0);
  const totalCalories = meals.reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + (Number(meal.carbs) || 0), 0);
  const totalFat = meals.reduce((sum, meal) => sum + (Number(meal.fat) || 0), 0);
  const totalFiber = meals.reduce((sum, meal) => sum + (Number(meal.fiber) || 0), 0);
  // The sums above cannot tell "ate none" from "never logged", so a day where no
  // meal tracked carbs/fat/fiber renders as "—" rather than 0.
  const carbsTracked = meals.some(m => macroValue(m, 'carbs') !== null);
  const fatTracked = meals.some(m => macroValue(m, 'fat') !== null);
  const fiberTracked = meals.some(m => macroValue(m, 'fiber') !== null);
  const carbsDisplay = formatMacro(carbsTracked ? totalCarbs : null);
  const fatDisplay = formatMacro(fatTracked ? totalFat : null);
  const fiberDisplay = formatMacro(fiberTracked ? totalFiber : null);

  // Get workout data
  const workout = workouts.length > 0 ? workouts[0] : null;
  const workoutType = workout?.trainingType || 'None';
  const totalVolume = workout?.totalVolume || 0;
  const totalSets = workout?.totalSets || 0;
  const validExercises = (workout?.exercises || []).filter(ex => ex.rpe > 0);
  const avgRPE = validExercises.length > 0
    ? (validExercises.reduce((sum, ex) => sum + (ex.rpe || 0), 0) / validExercises.length).toFixed(1)
    : 'N/A';
  const cardioList = getCardioList(workout);
  const cardioSummary = formatCardioSummary(workout);

  // Calculate volume comparison for workout
  const getVolumeComparison = () => {
    if (!workout || workout.trainingType === 'REST') return null;

    const previousWorkouts = allEntries
      .filter(e => e.trainingType === workout.trainingType && e.date < workout.date && e.totalVolume > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (previousWorkouts.length === 0) return null;

    const lastWorkout = previousWorkouts[0];
    const volumeDiff = totalVolume - lastWorkout.totalVolume;
    const volumePercent = ((volumeDiff / lastWorkout.totalVolume) * 100).toFixed(1);

    return {
      diff: volumeDiff,
      percent: volumePercent,
      isIncrease: volumeDiff > 0,
      lastVolume: lastWorkout.totalVolume
    };
  };

  const volumeComparison = getVolumeComparison();

  // Calculate grade using sleep data
  const grade = sleep
    ? getGrade(sleep, totalSets)
    : 'N/A';

  return h('div', { className: 'bg-slate-800 rounded-lg shadow-lg overflow-hidden mb-4' },
    // Header with date and summary
    h('div', { className: 'p-4 bg-slate-700 border-b border-slate-600' },
      h('div', { className: 'flex justify-between items-center' },
        h('h2', { className: 'text-xl font-bold' }, date),
        h('div', { className: 'flex items-center gap-2' },
          sleep && sleep.weight > 0 && h('span', { className: 'text-sm text-slate-300' }, `⚖️ ${sleep.weight} lbs`),
          h('span', { className: 'text-xl font-bold text-cyan-400' }, grade)
        )
      ),
      // flex-wrap + nowrap on each item: they break onto their own lines rather than
      // squeezing to a third of the width and wrapping mid-figure.
      h('div', { className: 'flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-300' },
        h('span', { className: 'whitespace-nowrap' }, `🥩 ${totalProtein}g P / ${carbsDisplay} C / ${fatDisplay} F / ${fiberDisplay} Fi / ${totalCalories} kcal`),
        h('span', { className: 'whitespace-nowrap' }, `💪 ${workoutType}`),
        cardioSummary && h('span', { className: 'whitespace-nowrap' }, `🏃 ${cardioSummary}`)
      )
    ),

    // 🌙 Sleep Section
    h(CollapsibleSection, {
      title: 'Sleep & Recovery',
      icon: '🌙',
      isOpen: sleepExpanded,
      onToggle: () => setSleepExpanded(!sleepExpanded)
    },
      sleep
        ? h('div', { className: 'space-y-2' },
            h('div', { className: 'grid grid-cols-2 gap-4' },
              h('div', {},
                h('div', { className: 'text-sm font-medium text-slate-400' }, 'Total Sleep'),
                h('div', {}, formatSleepTime(sleep.sleepHours))
              ),
              h('div', {},
                h('div', { className: 'text-sm font-medium text-slate-400' }, 'Deep Sleep'),
                h('div', {}, `${formatSleepTime(sleep.sleepHours * (sleep.deepSleepPercent / 100))} (${sleep.deepSleepPercent.toFixed(1)}%)`),
                h('div', { className: 'text-sm' }, getSleepQualityStars(sleep.sleepHours, sleep.deepSleepPercent, sleep.recoveryRating))
              ),
              h('div', {},
                h('div', { className: 'text-sm font-medium text-slate-400' }, 'Recovery Rating'),
                // Imported nights have no self-rating until one is added via Edit.
                h('div', {}, Number(sleep.recoveryRating) > 0 ? `${sleep.recoveryRating}/10` : '—')
              ),
              Number(sleep.steps) > 0 && h('div', {},
                h('div', { className: 'text-sm font-medium text-slate-400' }, 'Steps'),
                h('div', {}, Number(sleep.steps).toLocaleString())
              ),
              // Whole-day burn (incl. resting) -- not the workout's own calories.
              Number(sleep.totalCaloriesBurned) > 0 && h('div', {},
                h('div', { className: 'text-sm font-medium text-slate-400' }, 'Calories Burned (day)'),
                h('div', {}, `${Number(sleep.totalCaloriesBurned).toLocaleString()}${Number(sleep.activeCaloriesBurned) > 0 ? ` (${Number(sleep.activeCaloriesBurned).toLocaleString()} active)` : ''}`)
              )
            ),
            h('div', { className: 'flex gap-2 mt-4' },
              h(Button, { variant: 'secondary', onClick: () => onEditSleep(sleep) }, 'Edit'),
              h(Button, { variant: 'danger', onClick: () => onDeleteSleep(sleep.id) }, 'Delete')
            )
          )
        : h('p', { className: 'text-slate-400' }, 'Not logged yet')
    ),

    // 🥩 Nutrition Section
    h(CollapsibleSection, {
      title: `Nutrition (${meals.length} meal${meals.length !== 1 ? 's' : ''})`,
      icon: '🥩',
      isOpen: nutritionExpanded,
      onToggle: () => setNutritionExpanded(!nutritionExpanded)
    },
      meals.length > 0
        ? h('div', { className: 'space-y-2' },
            h('div', { className: 'bg-slate-900 p-3 rounded-lg' },
              // gap-2: the figures now fill the remaining width, so without it they butt
              // straight up against the "Total" label.
              h('div', { className: 'flex justify-between items-center gap-2' },
                h('span', { className: 'font-bold shrink-0' }, 'Total'),
                h('span', { className: 'text-sm sm:text-lg text-right' }, `${totalProtein}g P / ${carbsDisplay} C / ${fatDisplay} F / ${fiberDisplay} Fi / ${totalCalories} kcal`)
              )
            ),
            h('div', { className: 'mt-3 space-y-2' },
              h('h4', { className: 'text-sm font-semibold text-slate-400' }, 'Meals'),
              meals.map((meal, idx) =>
                h('div', { key: meal.id, className: 'bg-slate-700 p-2 rounded' },
                  h('div', { className: 'flex justify-between items-center gap-2' },
                    // Entries logged before descriptions existed keep reading "Meal 1".
                    // Only the label truncates; the full text is there in the edit form.
                    h('span', { className: 'text-sm min-w-0 truncate' }, meal.description || `Meal ${idx + 1}`),
                    h('div', { className: 'flex gap-2 items-center shrink-0' },
                      h(Button, { variant: 'secondary', size: 'sm', onClick: () => onEditMeal(meal) }, 'Edit'),
                      h(Button, { variant: 'danger', size: 'sm', onClick: () => onDeleteMeal(meal.id) }, 'Delete')
                    )
                  ),
                  // Its own line, so every macro stays visible rather than being clipped.
                  h('div', { className: 'text-xs text-slate-300 mt-1' },
                    `${Number(meal.protein)}g P / ${formatMacro(macroValue(meal, 'carbs'))} C / ${formatMacro(macroValue(meal, 'fat'))} F / ${formatMacro(macroValue(meal, 'fiber'))} Fi / ${Number(meal.calories)} kcal`
                  )
                )
              )
            )
          )
        : h('p', { className: 'text-slate-400' }, 'Not logged yet')
    ),

    // 💪 Workout Section
    workout && h(CollapsibleSection, {
      title: `Workout (${workoutType})`,
      icon: workoutType === 'REST' ? '🛌' : '💪',
      isOpen: workoutExpanded,
      onToggle: () => setWorkoutExpanded(!workoutExpanded)
    },
      h('div', { className: 'space-y-4' },
        workout.needsDetails && h('div', { className: 'p-3 rounded-lg bg-amber-900/40 border border-amber-700 text-sm' },
          `⌚ Fitbit recorded ${workout.duration || '?'} min of ${(workout.fitbit?.activities || ['weights']).join(', ').toLowerCase()}${workout.caloriesBurned ? `, ${workout.caloriesBurned} cal` : ''}. Tap Edit to pick the split and add your exercises.`
        ),
        // Summary stats
        workoutType !== 'REST' && h('div', { className: 'grid grid-cols-3 gap-4 text-center' },
          h('div', {},
            h('div', { className: 'font-bold' }, 'Volume'),
            h('div', { className: 'text-sm' }, `${totalVolume.toLocaleString()} lbs`)
          ),
          h('div', {},
            h('div', { className: 'font-bold' }, 'Sets'),
            h('div', { className: 'text-sm' }, totalSets)
          ),
          h('div', {},
            h('div', { className: 'font-bold' }, 'Avg RPE'),
            h('div', { className: 'text-sm' }, avgRPE)
          )
        ),

        // Volume comparison
        volumeComparison && h('div', { className: 'p-3 bg-slate-900 rounded-lg' },
          h('h4', { className: 'text-sm font-semibold mb-2' }, '📊 Volume Comparison'),
          h('div', { className: 'flex justify-between items-center' },
            h('div', {},
              h('div', { className: 'text-xs text-slate-400' }, 'vs. Last ' + workoutType),
              h('div', { className: 'text-sm' }, `Previous: ${volumeComparison.lastVolume.toLocaleString()} lbs`)
            ),
            h('div', { className: 'text-right' },
              h('div', {
                className: `text-lg font-bold ${volumeComparison.isIncrease ? 'text-green-400' : 'text-red-400'}`
              }, `${volumeComparison.isIncrease ? '+' : ''}${volumeComparison.percent}%`),
              h('div', { className: 'text-xs text-slate-400' },
                `${volumeComparison.isIncrease ? '+' : ''}${volumeComparison.diff.toLocaleString()} lbs`
              )
            )
          )
        ),

        // Exercises
        workout.exercises && workout.exercises.length > 0 && h('div', {},
          h('h4', { className: 'text-md font-semibold mb-2' }, 'Exercises'),
          h('ul', { className: 'space-y-1' },
            workout.exercises.map((ex, i) => {
              const weights = Array.isArray(ex.weights) ? ex.weights : (ex.weight ? [ex.weight] : []);
              const validWeights = weights.filter(w => w > 0);
              const weightDisplay = validWeights.length > 0
                ? (validWeights.every(w => w === validWeights[0])
                  ? `${validWeights[0]} lbs`
                  : `${Math.min(...validWeights)}-${Math.max(...validWeights)} lbs`)
                : 'N/A';

              return h('li', { key: i, className: 'flex justify-between text-sm bg-slate-700 p-2 rounded' },
                h('span', { className: 'font-medium' }, ex.name),
                h('span', {}, `${weightDisplay} | ${ex.sets}x(${ex.reps.join('/')})`),
                h('span', { className: 'text-slate-400' }, `RPE: ${ex.rpe || 'N/A'}`)
              );
            })
          )
        ),

        // Cardio (only present on entries logged with a cardio section)
        cardioList.length > 0 && h('div', {},
          h('h4', { className: 'text-md font-semibold mb-2' }, '🏃 Cardio'),
          h('ul', { className: 'space-y-1' },
            cardioList.map((c, i) => {
              // Effort, timing and the machine's own fields. Rows logged before these
              // existed track none of them and keep rendering exactly as they did.
              const detail = [
                { label: 'RPE', value: formatCardioValue(macroValue(c, 'effort')) },
                { label: 'When', value: c.timing || '—' },
                ...getCardioFields(c.name).map(f => ({
                  label: f.label,
                  value: formatCardioValue(macroValue(c, f.key))
                }))
              ];
              const anyTracked = macroValue(c, 'effort') !== null
                || !!c.timing
                || getCardioFields(c.name).some(f => macroValue(c, f.key) !== null);

              return h('li', { key: i, className: 'bg-slate-700 p-2 rounded space-y-1' },
                h('div', { className: 'flex justify-between text-sm' },
                  h('span', { className: 'font-medium' }, `${getCardioData(c.name)?.icon || ''} ${c.name}`.trim()),
                  h('span', {}, `${Number(c.minutes) || 0} min`),
                  h('span', { className: 'text-slate-400' }, `${(Number(c.steps) || 0).toLocaleString()} steps`)
                ),
                anyTracked && h('div', { className: 'text-xs text-slate-400' },
                  detail.map(d => `${d.label} ${d.value}`).join(' · ')
                )
              );
            })
          )
        ),

        // Action buttons
        h('div', { className: 'flex gap-2 mt-4' },
          h(Button, { variant: 'secondary', onClick: () => onEditWorkout(workout) }, 'Edit'),
          h(Button, { variant: 'danger', onClick: () => onDeleteWorkout(workout.id) }, 'Delete')
        )
      )
    )
  );
};

// --- 📜 ENTRY CARD COMPONENT (UPGRADED) ---
const EntryCard = ({ entry, nutrition, onEdit, onDelete, allEntries }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get all nutrition data for this entry's date
  const nutritionData = getNutritionForDate(nutrition, entry.date);

  const totalVolume = entry.totalVolume || 0;
  const cardioList = getCardioList(entry);
  const cardioSummary = formatCardioSummary(entry);
  const validExercises = (entry.exercises || []).filter(ex => ex.rpe > 0);
  const avgRPE = validExercises.length > 0
    ? (validExercises.reduce((sum, ex) => sum + (ex.rpe || 0), 0) / validExercises.length).toFixed(1)
    : 'N/A';

  // Find last workout of same type for volume comparison
  const getVolumeComparison = () => {
    if (entry.trainingType === 'REST') return null;

    const previousWorkouts = allEntries
      .filter(e => e.trainingType === entry.trainingType && e.date < entry.date && e.totalVolume > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (previousWorkouts.length === 0) return null;

    const lastWorkout = previousWorkouts[0];
    const volumeDiff = totalVolume - lastWorkout.totalVolume;
    const volumePercent = ((volumeDiff / lastWorkout.totalVolume) * 100).toFixed(1);

    return {
      diff: volumeDiff,
      percent: volumePercent,
      isIncrease: volumeDiff > 0,
      lastVolume: lastWorkout.totalVolume
    };
  };

  const volumeComparison = getVolumeComparison();

  return h('div', { className: 'bg-slate-800 rounded-lg shadow-lg overflow-hidden' },
    h('div', {
      className: 'p-4 flex justify-between items-center cursor-pointer hover:bg-slate-700',
      onClick: () => setIsExpanded(!isExpanded)
    },
      h('div', { className: 'flex items-center gap-3' },
        h('span', { className: 'text-3xl' }, entry.trainingType === 'REST' ? '🛌' : '💪'),
        h('div', {},
          h('div', { className: 'flex items-center gap-2' },
            h('h3', { className: 'text-lg font-bold' }, `${entry.date} - ${entry.trainingType}`),
            volumeComparison && h('span', { className: 'text-xl' }, volumeComparison.isIncrease ? '📈' : '📉')
          ),
          h('p', { className: 'text-sm text-slate-400' },
            entry.trainingType !== 'REST'
              ? `Vol: ${totalVolume.toLocaleString()} lbs | Sets: ${entry.totalSets} | Avg RPE: ${avgRPE}`
              : 'Rest Day'
          ),
          cardioSummary && h('p', { className: 'text-sm text-slate-400' }, `🏃 ${cardioSummary}`)
        )
      ),
      h('div', { className: 'flex items-center gap-4' },
        h('span', { className: 'text-xl font-bold text-cyan-400' }, entry.grade),
        h('span', { className: 'text-2xl' }, isExpanded ? '▲' : '▼')
      )
    ),

    isExpanded && h('div', { className: 'p-4 border-t border-slate-700 space-y-4' },
      h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 text-center' },
        h('div', {},
          h('div', { className: 'font-bold' }, '🌙 Sleep'),
          h('div', { className: 'text-xs' }, nutritionData.sleepHours > 0 ? formatSleepTime(nutritionData.sleepHours) : 'N/A'),
          nutritionData.sleepHours > 0 && h('div', { className: 'text-xs text-slate-400' },
            `${formatSleepTime(nutritionData.sleepHours * (nutritionData.deepSleepPercent / 100))} deep (${nutritionData.deepSleepPercent.toFixed(1)}%)`)
        ),
        h('div', {},
          h('div', { className: 'font-bold' }, '🥩 Protein'),
          h('div', { className: 'text-sm' }, `${Number(nutritionData.totalProtein).toLocaleString()}g`)
        ),
        h('div', {},
          h('div', { className: 'font-bold' }, '🔥 Calories'),
          h('div', { className: 'text-sm' }, `${Number(nutritionData.totalCalories).toLocaleString()} kcal`),
          entry.caloriesBurned && h('div', { className: 'text-xs text-slate-400' }, `Burned: ${Number(entry.caloriesBurned).toLocaleString()}`)
        ),
        h('div', {},
          h('div', { className: 'font-bold' }, '⚖️ Weight'),
          h('div', { className: 'text-sm' }, nutritionData.weight > 0 ? `${nutritionData.weight} lbs` : 'N/A')
        )
      ),
      // Net Calories row (if both consumed and burned exist)
      (nutritionData.totalCalories > 0 || entry.caloriesBurned) && h('div', { className: 'bg-slate-900 p-3 rounded-lg' },
        h('div', { className: 'flex justify-between items-center' },
          h('span', { className: 'font-bold' }, '📊 Net Calories'),
          h('span', { className: 'text-lg' },
            `${(Number(nutritionData.totalCalories) - Number(entry.caloriesBurned || 0)).toLocaleString()} kcal`,
            h('span', { className: 'text-xs text-slate-400 ml-2' },
              `(${Number(nutritionData.totalCalories).toLocaleString()} consumed - ${Number(entry.caloriesBurned || 0).toLocaleString()} burned)`
            )
          )
        )
      ),
      entry.exercises && entry.exercises.length > 0 && h('div', {},
        h('h4', { className: 'text-md font-semibold mb-2' }, 'Exercises'),
        h('ul', { className: 'space-y-1' },
          entry.exercises.map((ex, i) => {
            // Support both old and new format
            const weights = Array.isArray(ex.weights) ? ex.weights : (ex.weight ? [ex.weight] : []);
            const validWeights = weights.filter(w => w > 0);
            const weightDisplay = validWeights.length > 0
              ? (validWeights.every(w => w === validWeights[0])
                ? `${validWeights[0]} lbs`  // All weights same
                : `${Math.min(...validWeights)}-${Math.max(...validWeights)} lbs`) // Weight range
              : 'N/A';

            return h('li', { key: i, className: 'flex justify-between text-sm bg-slate-700 p-2 rounded' },
              h('span', { className: 'font-medium' }, ex.name),
              h('span', {}, `${weightDisplay} | ${ex.sets}x(${ex.reps.join('/')})`),
              h('span', { className: 'text-slate-400' }, `RPE: ${ex.rpe || 'N/A'}`)
            );
          })
        )
      ),
      // Cardio (only present on entries logged with a cardio section)
      cardioList.length > 0 && h('div', {},
        h('h4', { className: 'text-md font-semibold mb-2' }, '🏃 Cardio'),
        h('ul', { className: 'space-y-1' },
          cardioList.map((c, i) =>
            h('li', { key: i, className: 'flex justify-between text-sm bg-slate-700 p-2 rounded' },
              h('span', { className: 'font-medium' }, `${getCardioData(c.name)?.icon || ''} ${c.name}`.trim()),
              h('span', {}, `${Number(c.minutes) || 0} min`),
              h('span', { className: 'text-slate-400' }, `${(Number(c.steps) || 0).toLocaleString()} steps`)
            )
          )
        )
      ),
      volumeComparison && h('div', { className: 'p-3 bg-slate-900 rounded-lg' },
        h('h4', { className: 'text-sm font-semibold mb-2' }, '📊 Volume Comparison'),
        h('div', { className: 'flex justify-between items-center' },
          h('div', {},
            h('div', { className: 'text-xs text-slate-400' }, 'vs. Last ' + entry.trainingType),
            h('div', { className: 'text-sm' }, `Previous: ${volumeComparison.lastVolume.toLocaleString()} lbs`)
          ),
          h('div', { className: 'text-right' },
            h('div', {
              className: `text-lg font-bold ${volumeComparison.isIncrease ? 'text-green-400' : 'text-red-400'}`
            }, `${volumeComparison.isIncrease ? '+' : ''}${volumeComparison.percent}%`),
            h('div', { className: 'text-xs text-slate-400' },
              `${volumeComparison.isIncrease ? '+' : ''}${volumeComparison.diff.toLocaleString()} lbs`
            )
          )
        )
      ),
      h('div', { className: 'flex gap-4 pt-4' },
        h(Button, { variant: 'secondary', onClick: () => onEdit(entry) }, 'Edit'),
        h(Button, { variant: 'danger', onClick: () => onDelete(entry.id) }, 'Delete')
      )
    )
  );
};

// --- ⚙️ SETTINGS COMPONENT (UPGRADED) ---
// --- ☁️ CLOUD SYNC UI ---
const SYNC_LABELS = {
  entries: 'Workouts', trainingCycle: 'Training cycle', customCycles: 'Saved cycles',
  nutrition: 'Nutrition', sleep: 'Sleep & weight', dietGoals: 'Diet goals', profile: 'Profile'
};
const syncLabelList = (names) => names.map(n => SYNC_LABELS[n] || n).join(', ');

const useSyncStatus = () => {
  const [status, setStatus] = useState(Sync.getStatus());
  useEffect(() => {
    const unsubscribe = Sync.subscribe(setStatus);
    return () => { unsubscribe(); };
  }, []);
  return status;
};

const formatSyncTime = (iso) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// Shown above every screen, only when sync needs a decision or a reload.
const SyncBanner = () => {
  const status = useSyncStatus();
  if (status.state === 'blocked' && status.blockedKeys.length) {
    return h('div', { className: 'mb-4 p-3 rounded-lg bg-amber-900/60 border border-amber-600 text-sm space-y-2' },
      h('p', { className: 'font-semibold' }, '⚠️ Sync paused to protect your data'),
      h('p', {}, `This phone has much less ${syncLabelList(status.blockedKeys)} data than the cloud. That usually means the phone's storage was wiped.`),
      h('div', { className: 'flex gap-2' },
        h(Button, { size: 'sm', onClick: async () => { await Sync.keepCloud(); window.location.reload(); } }, 'Restore from cloud'),
        h(Button, { size: 'sm', variant: 'secondary', onClick: () => {
          if (window.confirm(`Replace the cloud copy of ${syncLabelList(status.blockedKeys)} with what's on this phone? The 5am backups are kept either way.`)) Sync.overwriteCloud();
        } }, 'Overwrite cloud')
      )
    );
  }
  if (status.needsReload) {
    return h('div', { className: 'mb-4 p-3 rounded-lg bg-blue-900/60 border border-blue-600 text-sm flex items-center justify-between gap-2' },
      h('span', {}, '☁️ Newer data came down from the cloud.'),
      h(Button, { size: 'sm', onClick: () => window.location.reload() }, 'Reload')
    );
  }
  return null;
};

const CloudSyncCard = ({ embedded = false }) => {
  const { showToast } = useToast();
  const status = useSyncStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState(null);
  const [backupId, setBackupId] = useState('');

  const card = (...children) => embedded ? h('div', { className: 'space-y-3' }, ...children) : h('div', { className: 'space-y-3 bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold' }, '☁️ Cloud Sync'),
    ...children
  );

  if (!status.enabled) {
    return card(h('p', { className: 'text-sm text-slate-400' },
      'Cloud sync is not set up yet. Add your Supabase URL and key to sync-config.js.'));
  }

  if (!status.signedIn) {
    const handleSignIn = async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        const result = await Sync.signIn(email.trim(), password);
        setPassword('');
        if (result?.changedLocal) {
          showToast('Restored your data from the cloud. Reloading…');
          setTimeout(() => window.location.reload(), 900);
        } else {
          showToast('Signed in. Sync is on.');
        }
      } catch (err) {
        showToast(err.message || 'Sign in failed', 'error');
      } finally {
        setBusy(false);
      }
    };
    return card(
      h('p', { className: 'text-sm text-slate-400' }, 'Sign in to back up this phone and restore it if it ever gets wiped.'),
      h('form', { onSubmit: handleSignIn, className: 'space-y-2' },
        h(Input, { type: 'email', placeholder: 'Email', value: email, autoComplete: 'username', onChange: (e) => setEmail(e.target.value) }),
        h(Input, { type: 'password', placeholder: 'Password', value: password, autoComplete: 'current-password', onChange: (e) => setPassword(e.target.value) }),
        h(Button, { type: 'submit', className: 'w-full' }, busy ? 'Signing in…' : 'Sign in')
      )
    );
  }

  const stateText = {
    idle: status.pendingKeys.length ? 'Waiting to upload' : 'Up to date',
    syncing: 'Syncing…',
    offline: 'Offline. Changes will upload when you reconnect.',
    blocked: 'Paused (see the warning at the top)',
    error: `Error: ${status.error || 'unknown'}`,
    'signed-out': 'Signed out'
  }[status.state] || status.state;
  const dot = { idle: 'bg-green-500', syncing: 'bg-blue-400', offline: 'bg-slate-400', blocked: 'bg-amber-500', error: 'bg-red-500' }[status.state] || 'bg-slate-400';

  const loadBackups = async () => {
    try {
      const list = await Sync.listBackups();
      setBackups(list);
      setBackupId(list[0] ? String(list[0].id) : '');
      if (!list.length) showToast('No daily backups yet. The first one runs at 5am.');
    } catch (err) {
      showToast(err.message || 'Could not load backups', 'error');
    }
  };

  return card(
    h('div', { className: 'flex items-center gap-2 text-sm' },
      h('span', { className: `inline-block w-2.5 h-2.5 rounded-full ${dot}` }),
      h('span', {}, stateText)
    ),
    h('p', { className: 'text-xs text-slate-400' }, `${status.email} · Last synced ${formatSyncTime(status.lastSyncAt)}`),
    status.pendingKeys.length > 0 && h('p', { className: 'text-xs text-slate-400' }, `Not uploaded yet: ${syncLabelList(status.pendingKeys)}`),
    h('div', { className: 'flex gap-2' },
      h(Button, { size: 'sm', onClick: () => Sync.syncNow() }, 'Sync now'),
      h(Button, { size: 'sm', variant: 'secondary', onClick: () => Sync.signOut() }, 'Sign out')
    ),
    h('div', { className: 'pt-2 border-t border-slate-700 space-y-2' },
      h('p', { className: 'text-sm font-medium' }, 'Daily backups (5am, kept 30 days)'),
      backups === null
        ? h(Button, { size: 'sm', variant: 'secondary', onClick: loadBackups }, 'Show backups')
        : backups.length > 0 && h('div', { className: 'flex gap-2' },
            h('select', {
              value: backupId,
              onChange: (e) => setBackupId(e.target.value),
              className: 'flex-1 p-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
            }, backups.map(b => h('option', { key: b.id, value: String(b.id) }, formatSyncTime(b.taken_at)))),
            h(Button, { size: 'sm', onClick: () => Sync.downloadBackup(Number(backupId)).catch(err => showToast(err.message, 'error')) }, 'Download')
          ),
      h('p', { className: 'text-xs text-slate-500' }, 'A downloaded backup can be restored with Import below.')
    )
  );
};

// --- ⌚ GOOGLE HEALTH IMPORT UI ---
const daysAgoLocal = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const HealthImportCard = ({ sleepEntries, setSleepEntries, entries, setEntries, embedded = false }) => {
  const { showToast } = useToast();
  const [files, setFiles] = useState([]);
  const [from, setFrom] = useState(() => daysAgoLocal(60));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null); // { result, dayCount }

  // Yesterday is the last complete day; today's steps and calories are still counting.
  const to = daysAgoLocal(1);

  const handleRead = async () => {
    if (!files.length) { showToast('Choose your Takeout ZIP first', 'error'); return; }
    setBusy(true);
    setPreview(null);
    setProgress(0);
    try {
      const { days } = await readHealthExport(files, { from, to, onProgress: setProgress });
      const result = mergeHealthImport(sleepEntries, days, { makeId: generateId });
      const workouts = mergeWorkoutImport(entries, days, { makeId: generateId });
      setPreview({ result, workouts, dayCount: Object.keys(days).length });
    } catch (err) {
      console.error('[HealthImport]', err);
      showToast(err.message || 'Could not read the export', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    setSleepEntries(preview.result.next);
    if (preview.workouts.changes.length > 0) setEntries(preview.workouts.next);
    const { created, updated } = preview.result.stats;
    const { workoutsCreated, restCreated } = preview.workouts.stats;
    showToast(`Imported: ${created} new nights, ${updated} days updated, ${workoutsCreated} workouts, ${restCreated} rest days`, 'success');
    setPreview(null);
  };

  const stats = preview?.result.stats;
  const wStats = preview?.workouts.stats;
  const workoutDays = preview ? preview.workouts.changes.filter(c => c.action === 'workout') : [];
  const totalChanges = preview ? stats.created + stats.updated + preview.workouts.changes.length : 0;
  const sample = preview ? preview.result.changes.slice(-5).reverse() : [];

  return h('div', { id: 'health-import', className: embedded ? 'space-y-3 scroll-mt-24' : 'space-y-3 bg-slate-800 p-4 rounded-lg scroll-mt-24' },
    !embedded && h('h3', { className: 'text-lg font-semibold' }, '⌚ Google Health Import'),
    h('p', { className: 'text-sm text-slate-400' },
      'Pick your Google Takeout ZIP (or the CSVs from Takeout/Google Health). Sleep, steps, calories burned and Fitbit workout days are read on this phone; nothing is uploaded.'),
    h(Input, {
      type: 'file', multiple: true, accept: '.zip,.csv',
      onChange: (e) => { setFiles(Array.from(e.target.files || [])); setPreview(null); }
    }),
    h('div', { className: 'flex items-center gap-2 text-sm' },
      h('label', { htmlFor: 'health-from', className: 'text-slate-300' }, 'Import from'),
      h('input', {
        id: 'health-from', type: 'date', value: from, max: to,
        onChange: (e) => { setFrom(e.target.value); setPreview(null); },
        className: 'p-2 bg-slate-700 border border-slate-600 rounded-lg text-white'
      }),
      h('span', { className: 'text-slate-400' }, `to ${to}`)
    ),
    h(Button, { type: 'button', onClick: handleRead, className: 'w-full' },
      busy ? `Reading… ${Math.round(progress * 100)}%` : 'Read export'),
    stats && h('div', { className: 'p-3 rounded-lg bg-slate-900 text-sm space-y-1' },
      h('p', { className: 'font-medium' }, `Found ${preview.dayCount} days of data`),
      h('p', {}, `• ${stats.created} new nights of sleep`),
      h('p', {}, `• ${stats.updated} existing days get steps / calories`),
      stats.keptManualSleep > 0 && h('p', { className: 'text-slate-400' }, `• ${stats.keptManualSleep} nights you typed in keep your numbers`),
      stats.skippedNoSleep > 0 && h('p', { className: 'text-slate-400' }, `• ${stats.skippedNoSleep} days skipped (no sleep recorded)`),
      stats.noStages > 0 && h('p', { className: 'text-slate-400' }, `• ${stats.noStages} nights skipped (no sleep stages)`),
      h('p', { className: 'font-medium pt-2' }, 'Workout log (days with nothing logged)'),
      h('p', {}, `• ${wStats.workoutsCreated} workout days from Fitbit${wStats.workoutsCreated ? ' (add your exercises)' : ''}`),
      workoutDays.length > 0 && h('p', { className: 'text-xs text-slate-400 pl-3' },
        workoutDays.map(c => `${c.date} (${c.entry.duration} min)`).join(', ')),
      h('p', {}, `• ${wStats.restCreated} rest days (no Fitbit workout)`),
      wStats.detailsFilled > 0 && h('p', {}, `• ${wStats.detailsFilled} logged workouts get Fitbit duration / calories`),
      wStats.notWorn > 0 && h('p', { className: 'text-slate-400' }, `• ${wStats.notWorn} days left blank (watch not worn)`),
      wStats.otherActivity > 0 && h('p', { className: 'text-slate-400' }, `• ${wStats.otherActivity} days left blank (non-lifting activity)`),
      wStats.restButFitbitWorkout > 0 && h('p', { className: 'text-slate-400' }, `• ${wStats.restButFitbitWorkout} days you marked rest kept as rest (Fitbit saw a workout)`),
      sample.length > 0 && h('div', { className: 'pt-2 text-xs text-slate-400 space-y-0.5' },
        sample.map(c => h('p', { key: c.date },
          `${c.date}: ${c.entry.sleepHours ? `${c.entry.sleepHours.toFixed(1)}h sleep · ` : ''}${(c.entry.steps ?? 0).toLocaleString()} steps · ${(c.entry.totalCaloriesBurned ?? 0).toLocaleString()} cal burned`))
      ),
      totalChanges > 0
        ? h(Button, { type: 'button', onClick: handleApply, className: 'w-full mt-2' }, `Import ${totalChanges} changes`)
        : h('p', { className: 'text-slate-400 pt-1' }, 'Everything is already up to date.')
    )
  );
};

const Settings = ({ entries, setEntries, trainingCycle, setTrainingCycle, nutrition, setNutrition, sleepEntries, setSleepEntries, dietGoals, setDietGoals, maintenanceEstimate, savedMeals = [], setSavedMeals = () => {}, uiPrefs = getUiPrefs(), onUiPrefs = () => {}, onOpenMeals = () => {}, initialGroup = null }) => {
  // One group open at a time keeps the page short; the menu's import shortcut opens
  // straight onto Google Health.
  const [openGroup, setOpenGroup] = useState(initialGroup);
  const toggleGroup = (id) => setOpenGroup(g => (g === id ? null : id));
  useEffect(() => {
    if (!initialGroup) return;
    const el = document.getElementById(`settings-${initialGroup}`);
    if (el && el.scrollIntoView) setTimeout(() => el.scrollIntoView({ block: 'start' }), 60);
  }, []);
  const [restLength, setRestLength] = useState(() => {
    const saved = Number(localStorage.getItem(REST_SECONDS_KEY));
    return saved >= 15 && saved <= 900 ? saved : 120;
  });
  const { showToast } = useToast();
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [customCycles, setCustomCycles] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_CYCLES_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  // Profile state (height + birth date) — feeds the BMR calculation below.
  const [profileFeet, setProfileFeet] = useState(() => Math.floor(getProfile().heightInches / 12));
  const [profileInches, setProfileInches] = useState(() => Math.round(getProfile().heightInches % 12));
  const [profileBirthDate, setProfileBirthDate] = useState(() => getProfile().birthDate || '');
  // An age saved by the previous version, kept working until a birth date replaces it.
  const [legacyAge, setLegacyAge] = useState(() => {
    const p = getProfile();
    return p.ageSource === 'stored' ? p.age : null;
  });

  // The profile is not React state -- these inputs are seeded from getProfile() at
  // mount, so anything that rewrites PROFILE_KEY underneath them (an import, a wipe)
  // must pull the new values back in or the form keeps showing the old ones.
  const refreshProfileInputs = () => {
    const p = getProfile();
    setProfileFeet(Math.floor(p.heightInches / 12));
    setProfileInches(Math.round(p.heightInches % 12));
    setProfileBirthDate(p.birthDate || '');
    setLegacyAge(p.ageSource === 'stored' ? p.age : null);
  };

  // Recomputed every render rather than stored, so it is never stale.
  const derivedAge = ageFromBirthDate(profileBirthDate);
  const effectiveAge = derivedAge !== null ? derivedAge : legacyAge;

  const saveProfileSettings = () => {
    const totalInches = (Number(profileFeet) || 0) * 12 + (Number(profileInches) || 0);
    if (!(totalInches > 0)) {
      showToast('Enter a valid height.', 'error');
      return;
    }
    if (profileBirthDate && derivedAge === null) {
      showToast('That date of birth is not valid.', 'error');
      return;
    }
    if (!profileBirthDate && !(legacyAge > 0)) {
      showToast('Enter your date of birth.', 'error');
      return;
    }
    saveProfile({ heightInches: totalInches, birthDate: profileBirthDate || null, age: legacyAge });
    showToast(`Profile saved: ${formatHeight(totalInches)}, age ${effectiveAge}`, 'success');
  };

  // Diet Goals UI state only — the goals themselves are owned by App and arrive as props.
  const [showDietGoals, setShowDietGoals] = useState(false);
  // Seeded from the saved mode so re-running the calculator keeps the mode you chose.
  const [goalType, setGoalType] = useState(dietGoals.goalType || 'gaintain');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [exclusionFrom, setExclusionFrom] = useState('');
  const [exclusionTo, setExclusionTo] = useState('');
  const [exclusionReason, setExclusionReason] = useState('sick');
  const [exclusionError, setExclusionError] = useState('');

  const maintenanceExclusions = normaliseMaintenanceExclusions(dietGoals.maintenanceExclusions);

  // "Sep 25 – Oct 7" -- parsed as local dates so the label cannot slip a day.
  const formatExclusionRange = (from, to) => {
    const opts = { month: 'short', day: 'numeric' };
    const a = parseLocalDate(from).toLocaleDateString(undefined, opts);
    const b = parseLocalDate(to).toLocaleDateString(undefined, opts);
    return from === to ? a : `${a} – ${b}`;
  };

  const addExclusion = () => {
    if (!exclusionFrom || !exclusionTo) { setExclusionError('Pick both dates.'); return; }
    if (exclusionFrom > exclusionTo) { setExclusionError('"From" must be on or before "To".'); return; }
    setExclusionError('');
    setDietGoals({
      ...dietGoals,
      maintenanceExclusions: [
        ...maintenanceExclusions,
        { id: generateId(), from: exclusionFrom, to: exclusionTo, reason: exclusionReason }
      ]
    });
    setExclusionFrom(''); setExclusionTo(''); setExclusionReason('sick');
  };

  const removeExclusion = (id) => {
    setDietGoals({
      ...dietGoals,
      maintenanceExclusions: maintenanceExclusions.filter(r => r.id !== id)
    });
  };

  // Offered when logging simply stopped: prefills the gap the estimator is stuck on.
  const prefillStaleExclusion = () => {
    const lastLogged = latestIntakeDate(nutrition);
    if (!lastLogged) return;
    const dayAfter = parseLocalDate(lastLogged);
    dayAfter.setDate(dayAfter.getDate() + 1);
    setExclusionFrom(formatDate(dayAfter));
    setExclusionTo(formatDate(new Date()));
    setExclusionReason('sick');
    setExclusionError('');
  };

  // Display only. The maintenance estimate is computed once in App and arrives as a
  // prop; Settings never recomputes its own copy from nutrition or sleepEntries.
  const goalDrift = checkGoalDrift(dietGoals, sleepEntries);
  const formulaMaintenance = dietGoals.enabled
    ? dietGoals.calories - goalAdjustmentFor(dietGoals.goalType)
    : maintenanceEstimate.mifflinTdee;
  const empiricalMoved = dietGoals.maintenanceLastShown == null
    || Math.abs(maintenanceEstimate.empiricalTdee - dietGoals.maintenanceLastShown) >= MAINTENANCE_ANNOUNCE_THRESHOLD_KCAL;
  const showTransitionCard = dietGoals.enabled
    && maintenanceEstimate.available
    && dietGoals.maintenanceSource !== 'empirical'
    && empiricalMoved;

  // Explicit hand-over. After this, MaintenanceAutoApply keeps calories current on its own.
  const applyEmpiricalMaintenance = () => {
    const mode = dietGoals.goalType || goalType;
    const calories = maintenanceEstimate.empiricalTdee + goalAdjustmentFor(mode);
    setDietGoals({
      ...dietGoals,
      calories,
      goalType: mode,
      maintenanceSource: 'empirical',
      maintenanceLastShown: maintenanceEstimate.empiricalTdee
    });
    showToast(`Maintenance set to ${maintenanceEstimate.empiricalTdee} kcal from your logged data; target ${calories} kcal.`, 'success');
  };

  // Dismiss without changing anything; the card returns only once the estimate has
  // moved another announce-threshold from this figure.
  const keepFormulaMaintenance = () => {
    setDietGoals({ ...dietGoals, maintenanceLastShown: maintenanceEstimate.empiricalTdee });
  };

  const calculateDietGoals = () => {
    // Always the most recent logged weigh-in, never a hand-typed copy that can go stale.
    // getCurrentWeight already falls back to USER_CONTEXT.startWeight when nothing is logged.
    const weight = getCurrentWeight(sleepEntries);

    // Protein: 1g per lb minimum
    const protein = Math.round(weight * 1.0);

    // BMR x activity multiplier lives in calculateMifflinTdee, shared with the estimator.
    const tdee = calculateMifflinTdee(weight, activityLevel);

    const calories = tdee + goalAdjustmentFor(goalType);

    // goalType / calculatedAtWeight / calculatedAt give the drift check and the estimator
    // something to compare against. Running the formula is an explicit choice of the
    // formula, so maintenanceSource resets; maintenanceLastShown is kept so a figure
    // already dismissed does not come straight back.
    const newGoals = {
      protein,
      calories,
      enabled: true,
      goalType,
      calculatedAtWeight: weight,
      calculatedAt: formatDate(new Date()),
      maintenanceSource: 'formula',
      maintenanceLastShown: dietGoals.maintenanceLastShown == null ? null : dietGoals.maintenanceLastShown,
      // Built from scratch rather than spread, so anything not named here is erased.
      // Sick/away ranges are the user's own annotations and survive a recalculation.
      maintenanceExclusions: normaliseMaintenanceExclusions(dietGoals.maintenanceExclusions)
    };
    setDietGoals(newGoals); // App persists this; no direct write from here
    showToast(`Diet goals set: ${protein}g protein, ${calories} kcal`, 'success');
    setShowDietGoals(false);
  };

  const exportData = () => {
    const cardioSessions = entries.reduce((sum, e) => sum + getCardioList(e).length, 0);
    console.log(`[Export] Exporting data: ${entries.length} workouts (${cardioSessions} cardio sessions), ${nutrition.length} meals, ${sleepEntries.length} sleep entries`);
    const dataStr = JSON.stringify({ entries, trainingCycle, customCycles, nutrition, sleep: sleepEntries, dietGoals, profile: getProfile(), savedMeals }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hypertrophy-backup-v8-${formatDate(new Date())}.json`; // v8 data structure (workout entries may include cardio)
    link.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!');
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let restoredProfile = false;
        const imported = JSON.parse(event.target.result);
        console.log('[Import] Imported data:', {
          entries: imported.entries?.length || 0,
          nutrition: imported.nutrition?.length || 0,
          sleep: imported.sleep?.length || 0,
          isArray: Array.isArray(imported)
        });

        // Backfill the cardio array on entries from pre-v8 exports so every
        // entry has the same shape; exercises/weights/reps are left untouched.
        const withCardio = (list) => (list || []).map(entry => ({
          ...entry,
          cardio: getCardioList(entry)
        }));

        if (Array.isArray(imported)) {
          setEntries(withCardio(imported)); // Old v1 format
          console.log('[Import] Loaded v1 format (array only)');
        } else {
          // New v2-v8 format
          if (imported.entries) {
            const importedEntries = withCardio(imported.entries);
            setEntries(importedEntries);
            localStorage.setItem(DB_KEY, JSON.stringify(importedEntries));
            console.log(`[Import] Restored ${importedEntries.length} workout entries`);

            // Force recalculate cycle days for imported data
            console.log('[Import] Recalculating cycle days for imported entries...');
            localStorage.removeItem(MIGRATION_FLAG_V4_KEY); // Clear migration flag to force re-run
            const cycle = imported.trainingCycle || trainingCycle;
            const migrationResult = recalculateCycleDays(cycle);
            if (migrationResult.migrated) {
              // Reload the updated entries from localStorage
              const updatedEntries = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
              setEntries(updatedEntries);
              console.log(`[Import] Cycle days recalculated for ${migrationResult.entriesUpdated} entries`);
            }
          }
          if (imported.trainingCycle) setTrainingCycle(imported.trainingCycle);
          if (imported.customCycles) {
            setCustomCycles(imported.customCycles);
            localStorage.setItem(CUSTOM_CYCLES_KEY, JSON.stringify(imported.customCycles));
          }
          if (imported.nutrition) {
            setNutrition(imported.nutrition);
            localStorage.setItem(NUTRITION_KEY, JSON.stringify(imported.nutrition));
            console.log(`[Import] Restored ${imported.nutrition.length} nutrition entries`);
          }
          if (imported.sleep) {
            setSleepEntries(imported.sleep);
            localStorage.setItem(SLEEP_KEY, JSON.stringify(imported.sleep));
            console.log(`[Import] Restored ${imported.sleep.length} sleep entries`);
          } else {
            console.warn('[Import] No sleep data found in import file');
          }
          // No warning when absent: most export files predate diet goals, so a missing
          // key is the normal case rather than a red flag.
          if (imported.dietGoals) {
            // Spread over the defaults, as the initial load does: a backup written
            // before a field existed restores it as the default rather than undefined.
            const restoredGoals = { ...DEFAULT_DIET_GOALS, ...imported.dietGoals };
            restoredGoals.maintenanceExclusions = normaliseMaintenanceExclusions(restoredGoals.maintenanceExclusions);
            setDietGoals(restoredGoals);
            localStorage.setItem(DIET_GOALS_KEY, JSON.stringify(restoredGoals));
            console.log('[Import] Restored diet goals');
          }
          // Saved meals only exist in exports from Nov 2026 on; older files leave the list alone.
          if (Array.isArray(imported.savedMeals)) {
            setSavedMeals(imported.savedMeals);
            localStorage.setItem(SAVED_MEALS_KEY, JSON.stringify(imported.savedMeals));
            console.log(`[Import] Restored ${imported.savedMeals.length} saved meals`);
          }
          // Also absent from every export written before today, so no warning.
          // saveProfile rather than a direct write: it drops the stale age key once a
          // valid birth date exists, which a legacy age-only profile needs on the way in.
          if (imported.profile) {
            saveProfile(imported.profile);
            refreshProfileInputs();
            restoredProfile = true;
            console.log('[Import] Restored profile');
          }
        }
        showToast(restoredProfile
          ? 'Data imported successfully! Profile restored.'
          : 'Data imported successfully!');
      } catch (err) {
        showToast('Failed to import data.', 'error');
        console.error('[Import] Error:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const deleteAllData = () => {
    if (window.confirm('Are you sure you want to delete ALL data? This cannot be undone.')) {
      setEntries([]);
      setTrainingCycle(CYCLE_PRESETS['current-14-day'].days);
      setCustomCycles({});
      setNutrition([]);
      setSleepEntries([]);
      setSavedMeals([]);
      setDietGoals({ ...DEFAULT_DIET_GOALS });
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(CYCLE_KEY);
      localStorage.removeItem(CUSTOM_CYCLES_KEY);
      localStorage.removeItem(NUTRITION_KEY);
      localStorage.removeItem(SLEEP_KEY);
      localStorage.removeItem(SAVED_MEALS_KEY);
      localStorage.removeItem(DIET_GOALS_KEY);
      localStorage.removeItem(PROFILE_KEY);
      // Same reason as the import: these inputs are seeded at mount, not reactive.
      refreshProfileInputs();
      showToast('All data deleted.', 'danger');
    }
  };

  return h('div', { className: 'space-y-3' },
    h(SettingsGroup, { id: 'cycle', emoji: '🔄', title: 'Training cycle', summary: `${trainingCycle.length}-day cycle`, open: openGroup === 'cycle', onToggle: () => toggleGroup('cycle') },
      h('p', { className: 'text-sm text-slate-400 mb-2' }, `Current: ${trainingCycle.length}-day cycle`),
      h(Button, { onClick: () => setShowCycleEditor(!showCycleEditor), variant: 'primary' }, 
        showCycleEditor ? 'Hide Cycle Editor' : 'Edit Training Cycle'
      ),
      showCycleEditor && h('div', { className: 'mt-4' },
        h(CycleEditor, {
          currentCycle: trainingCycle,
          onSave: (newCycle) => {
            setTrainingCycle(newCycle);
            setShowCycleEditor(false);
          }
        })
      )
    ),
    h(SettingsGroup, { id: 'profile', emoji: '👤', title: 'Profile', summary: `${formatHeight((Number(profileFeet) || 0) * 12 + (Number(profileInches) || 0))}, age ${effectiveAge > 0 ? effectiveAge : '—'}`, open: openGroup === 'profile', onToggle: () => toggleGroup('profile') },
      h('p', { className: 'text-sm text-slate-300' },
        `Current: ${formatHeight((Number(profileFeet) || 0) * 12 + (Number(profileInches) || 0))}, age ${effectiveAge > 0 ? effectiveAge : '—'}`
      ),
      h('div', { className: 'grid grid-cols-2 gap-3' },
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Height (ft)'),
          h(Input, { type: 'number', min: 3, max: 8, value: profileFeet, onChange: (e) => setProfileFeet(e.target.value) })
        ),
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Height (in)'),
          h(Input, { type: 'number', min: 0, max: 11, value: profileInches, onChange: (e) => setProfileInches(e.target.value) })
        )
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Date of birth'),
        h(Input, {
          type: 'date',
          max: formatDate(new Date()),
          value: profileBirthDate,
          onChange: (e) => setProfileBirthDate(e.target.value)
        }),
        derivedAge !== null && h('p', { className: 'text-xs text-slate-400 mt-1' },
          `Age ${derivedAge} — updates itself on your birthday.`),
        !profileBirthDate && legacyAge > 0 && h('p', { className: 'text-xs text-yellow-500 mt-1' },
          `Still using the age ${legacyAge} you saved earlier. Add your date of birth so it stops going stale.`)
      ),
      h('p', { className: 'text-xs text-slate-400' }, 'Used to calculate your BMR and calorie targets.'),
      h(Button, { onClick: saveProfileSettings, variant: 'primary', className: 'w-full' }, 'Save Profile')
    ),
    h(SettingsGroup, { id: 'diet', emoji: '🎯', title: 'Diet goals', summary: dietGoals.enabled ? `${dietGoals.protein} g protein · ${Number(dietGoals.calories).toLocaleString()} kcal` : 'Not set', open: openGroup === 'diet', onToggle: () => toggleGroup('diet') },
      dietGoals.enabled && h('div', { className: 'text-sm text-slate-300 mb-2' },
        `Current: ${dietGoals.protein}g protein, ${dietGoals.calories} kcal`
      ),
      // Gate progress while history accumulates: a missing switch reads as "log more".
      !maintenanceEstimate.available && h('p', { className: 'text-xs text-slate-400' },
        `Empirical maintenance: ${maintenanceEstimate.gateProgress.intakeDays} of ${maintenanceEstimate.gateProgress.intakeDaysNeeded} days with logged intake, ${maintenanceEstimate.gateProgress.weighIns} of ${maintenanceEstimate.gateProgress.weighInsNeeded} weigh-ins.`
        + (maintenanceEstimate.staleDays
          ? ` No food logged for ${maintenanceEstimate.staleDays} days — maintenance estimate paused; your calorie target is unchanged.`
          : '')
        + (maintenanceEstimate.discardedAsUnreliable
          ? ' The latest estimate fell outside the plausible range and was discarded.'
          : '')
      ),
      maintenanceEstimate.available && h('p', { className: 'text-xs text-slate-400' },
        `Your last ${maintenanceEstimate.spanDays} days of logs: ${maintenanceEstimate.empiricalTdee} kcal maintenance`
        + (dietGoals.maintenanceSource === 'empirical' ? ' — in use, updates itself.' : ' — formula in use.')
      ),
      showTransitionCard && h('div', { className: 'bg-slate-900 border border-cyan-700 p-3 rounded-lg space-y-2' },
        h('p', { className: 'text-sm' },
          `Your last ${maintenanceEstimate.spanDays} days of logs say ${maintenanceEstimate.empiricalTdee} kcal maintenance; the formula estimated ${formulaMaintenance} kcal.`
        ),
        h('div', { className: 'flex gap-2' },
          h(Button, { onClick: applyEmpiricalMaintenance, variant: 'primary', className: 'flex-1' }, 'Apply'),
          h(Button, { onClick: keepFormulaMaintenance, variant: 'secondary', className: 'flex-1' }, 'Keep formula')
        )
      ),
      // Sick or away: days the estimator should not read as normal eating.
      h('div', { className: 'bg-slate-900 p-3 rounded-lg space-y-2' },
        h('div', { className: 'text-sm font-semibold' }, 'Sick or away'),
        h('p', { className: 'text-xs text-slate-400' },
          'These days are left out of the maintenance estimate. Include your first couple of days back to normal eating — weight rebounds faster than fat.'
        ),
        maintenanceExclusions.length > 0 && h('div', { className: 'space-y-1' },
          maintenanceExclusions.map(r => h('div', {
            key: r.id,
            className: 'flex justify-between items-center text-xs bg-slate-800 px-2 py-1 rounded'
          },
            h('span', {}, `${formatExclusionRange(r.from, r.to)} · ${MAINTENANCE_EXCLUSION_REASONS[r.reason] || 'Other'}`),
            h('button', {
              type: 'button',
              onClick: () => removeExclusion(r.id),
              className: 'text-slate-400 hover:text-red-400 px-2',
              'aria-label': 'Remove'
            }, '✕')
          ))
        ),
        maintenanceEstimate.staleDays && h(Button, {
          onClick: prefillStaleExclusion, variant: 'secondary', size: 'sm', className: 'w-full'
        }, `Mark ${staleRangeLabel(nutrition)} as sick or away`),
        h('div', { className: 'grid grid-cols-2 gap-2' },
          h('div', {},
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'From'),
            h(Input, { type: 'date', value: exclusionFrom, onChange: (e) => setExclusionFrom(e.target.value) })
          ),
          h('div', {},
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'To'),
            h(Input, { type: 'date', value: exclusionTo, onChange: (e) => setExclusionTo(e.target.value) })
          )
        ),
        h('div', { className: 'flex gap-2 items-end' },
          h('div', { className: 'flex-1' },
            h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Reason'),
            h('select', {
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white text-sm',
              value: exclusionReason,
              onChange: (e) => setExclusionReason(e.target.value)
            },
              h('option', { value: 'sick' }, 'Sick'),
              h('option', { value: 'away' }, 'Away'),
              h('option', { value: 'other' }, 'Other')
            )
          ),
          h(Button, { onClick: addExclusion, variant: 'secondary', size: 'sm' }, 'Add')
        ),
        exclusionError && h('p', { className: 'text-xs text-red-400' }, exclusionError)
      ),
      goalDrift && h('p', { className: 'text-xs text-yellow-500' },
        `Weight has moved ${goalDrift.drift > 0 ? '+' : ''}${goalDrift.drift.toFixed(1)} lbs since goals were last calculated (${goalDrift.calculatedAtWeight} → ${goalDrift.latestWeight}) — protein target may be stale.`
      ),
      h(Button, { onClick: () => setShowDietGoals(!showDietGoals), variant: 'primary' },
        showDietGoals ? 'Hide Calculator' : 'Set Diet Goals'
      ),
      showDietGoals && h('div', { className: 'mt-4 space-y-3' },
        h('p', { className: 'text-sm text-slate-300' },
          `Using your most recent logged weight: ${getCurrentWeight(sleepEntries)} lbs`
        ),
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Goal Type'),
          h('select', {
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white',
            value: goalType,
            onChange: (e) => setGoalType(e.target.value)
          },
            h('option', { value: 'cut' }, 'Cut (-500 kcal/day)'),
            h('option', { value: 'gaintain' }, 'Gaintain'),
            h('option', { value: 'leanBulk' }, 'Lean Bulk (+250 kcal/day)'),
            h('option', { value: 'bulk' }, 'Bulk (+500 kcal/day)')
          )
        ),
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Activity Level'),
          h('select', {
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white',
            value: activityLevel,
            onChange: (e) => setActivityLevel(e.target.value)
          },
            h('option', { value: 'sedentary' }, 'Sedentary (little/no exercise)'),
            h('option', { value: 'light' }, 'Light (1-3 days/week)'),
            h('option', { value: 'moderate' }, 'Moderate (3-5 days/week)'),
            h('option', { value: 'active' }, 'Active (6-7 days/week)'),
            h('option', { value: 'veryActive' }, 'Very Active (2x/day)')
          )
        ),
        h(Button, { onClick: calculateDietGoals, variant: 'primary', className: 'w-full' }, 'Calculate & Save Goals')
      )
    ),
    h(SettingsGroup, { id: 'meals', emoji: '⭐', title: 'Saved meals', summary: savedMeals.length ? `${savedMeals.length} saved` : 'None yet', open: openGroup === 'meals', onToggle: () => toggleGroup('meals') },
      savedMeals.length === 0
        ? h('p', { className: 'text-sm text-ink-muted' }, 'Save meals you eat often from Add meal → Saved, then log them in one tap.')
        : h('div', null, [...savedMeals].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((m, i) =>
            h('div', { key: m.id, className: `flex items-center gap-3 py-2.5 ${i ? 'border-t border-ink-line' : ''}` },
              h('div', { className: 'flex-1 min-w-0' },
                h('div', { className: 'text-[15px] font-bold truncate' }, m.name),
                h('div', { className: 'text-xs text-ink-muted' }, `${m.protein} g protein · ${Math.round(Number(m.calories) || 0)} kcal${m.useCount ? ` · logged ${m.useCount}×` : ''}`)),
              h('button', {
                type: 'button', 'aria-label': `Delete ${m.name}`,
                onClick: () => { if (window.confirm(`Delete the saved meal "${m.name}"? Meals you already logged stay.`)) setSavedMeals(list => list.filter(x => x.id !== m.id)); },
                className: 'w-9 h-9 flex-none rounded-full flex items-center justify-center text-ink-muted text-lg'
              }, '×')))),
      h(Button, { onClick: onOpenMeals, variant: 'secondary', className: 'w-full' }, 'Open Add meal to add or edit')
    ),
    h(SettingsGroup, { id: 'cloud', emoji: '☁️', title: 'Cloud backup', summary: 'Sign-in, sync and the daily 5 am backups', open: openGroup === 'cloud', onToggle: () => toggleGroup('cloud') },
      h(CloudSyncCard, { embedded: true })
    ),
    h(SettingsGroup, { id: 'health', emoji: '⌚', title: 'Google Health', summary: 'Import sleep, steps and workouts from Takeout', open: openGroup === 'health', onToggle: () => toggleGroup('health') },
      h(HealthImportCard, { sleepEntries, setSleepEntries, entries, setEntries, embedded: true })
    ),
    h(SettingsGroup, { id: 'display', emoji: '✨', title: 'Display', summary: 'Animations, record celebrations, rest timer', open: openGroup === 'display', onToggle: () => toggleGroup('display') },
      h(Switch, { label: 'Animations', sub: 'Rings filling, sheets sliding, the Start button glow', on: uiPrefs.animations, onChange: (v) => onUiPrefs({ ...uiPrefs, animations: v }) }),
      h(Switch, { label: 'Record celebrations', sub: 'Full-screen trophy and confetti on a new best (off: a short message)', on: uiPrefs.celebrations, onChange: (v) => onUiPrefs({ ...uiPrefs, celebrations: v }) }),
      h(Switch, { label: 'Tap the header to jump to the top', sub: 'The iPhone status-bar tap works either way', on: uiPrefs.headerTapTop, onChange: (v) => onUiPrefs({ ...uiPrefs, headerTapTop: v }) }),
      h('div', { className: 'flex items-center gap-3 min-h-[52px]' },
        h('label', { htmlFor: 'rest-length', className: 'flex-1 text-[15px] font-bold' }, 'Rest timer length',
          h('span', { className: 'block text-xs text-ink-muted font-normal' }, 'Starting length; ±15s on the timer changes it too')),
        h('select', {
          id: 'rest-length', value: String(restLength),
          onChange: (e) => { setRestLength(Number(e.target.value)); try { localStorage.setItem(REST_SECONDS_KEY, e.target.value); } catch (err) { /* ignore */ } },
          className: 'h-11 rounded-full bg-ink border border-ink-line px-3 text-sm font-bold'
        }, [...new Set([60, 90, 120, 150, 180, 240, 300, restLength])].sort((a, b) => a - b).map(sec =>
          h('option', { key: sec, value: String(sec) }, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`))))
    ),
    h(SettingsGroup, { id: 'backup', emoji: '💾', title: 'Backup file', summary: 'Export or import a JSON file', open: openGroup === 'backup', onToggle: () => toggleGroup('backup') },
      h(Button, { onClick: exportData, variant: 'primary' }, 'Export All Data (JSON)'),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1', htmlFor: 'import-file' }, 'Import Data (JSON)'),
        h(Input, { type: 'file', id: 'import-file', accept: '.json', onChange: importData })
      )
    ),
    h(SettingsGroup, { id: 'danger', emoji: '🗑️', title: 'Danger zone', summary: 'Delete all data', open: openGroup === 'danger', onToggle: () => toggleGroup('danger'), danger: true },
      h(Button, { onClick: deleteAllData, variant: 'danger' }, 'Delete All Data')
    )
  );
};

// Hands-off mode. Once the empirical figure has been applied explicitly, every later
// recompute moves calories to follow it: a move of at least the announce threshold gets
// a toast, smaller moves apply silently. Renderless. It is mounted inside ToastProvider
// because App itself sits outside the provider and so cannot call useToast.
const MaintenanceAutoApply = ({ maintenanceEstimate, dietGoals, setDietGoals }) => {
  const { showToast } = useToast();
  useEffect(() => {
    if (!dietGoals || !dietGoals.enabled || dietGoals.maintenanceSource !== 'empirical') return;
    if (!maintenanceEstimate || !maintenanceEstimate.available) return;
    const adjustment = goalAdjustmentFor(dietGoals.goalType);
    const impliedMaintenance = dietGoals.calories - adjustment;
    const delta = maintenanceEstimate.empiricalTdee - impliedMaintenance;
    if (delta === 0) return; // already following the estimate; nothing to write
    setDietGoals({
      ...dietGoals,
      calories: maintenanceEstimate.empiricalTdee + adjustment,
      maintenanceLastShown: maintenanceEstimate.empiricalTdee
    });
    if (Math.abs(delta) >= MAINTENANCE_ANNOUNCE_THRESHOLD_KCAL) {
      showToast(`Maintenance updated to ${maintenanceEstimate.empiricalTdee} kcal based on your last ${maintenanceEstimate.spanDays} days of logs.`, 'success');
    }
  }, [maintenanceEstimate, dietGoals]);
  return null;
};

// The confirmation body for a cycle change. Its own component for the same reason
// MaintenanceAutoApply is: App renders ToastProvider as its return value, so App sits
// above the provider and cannot call useToast. Both handlers previously called a
// showToast that was never in scope, which threw after setTrainingCycle had already
// run -- leaving the modal open and pendingCycle uncleared.
const CycleStartConfirm = ({ pendingCycle, setTrainingCycle, onDone }) => {
  const { showToast } = useToast();
  return h('div', { className: 'space-y-4' },
    h('p', {}, 'How would you like to start this new training cycle?'),
    h('div', { className: 'flex flex-col gap-3' },
      h(Button, {
        variant: 'primary',
        className: 'w-full',
        onClick: () => {
          setTrainingCycle(pendingCycle);
          // Reset cycle position by clearing entries or adding marker
          showToast('Cycle updated! Starting fresh from Day 1 today.');
          onDone();
        }
      }, '🔄 Start from Day 1 Today'),
      h(Button, {
        variant: 'secondary',
        className: 'w-full',
        onClick: () => {
          setTrainingCycle(pendingCycle);
          showToast('Cycle updated! Continuing from current position.');
          onDone();
        }
      }, '➡️ Continue from Current Position')
    ),
    h('div', { className: 'text-sm text-slate-400 mt-4' },
      h('p', {}, 'Starting from Day 1 will reset your cycle position.'),
      h('p', {}, 'Continuing will keep your current progress through the cycle.')
    )
  );
};

// --- MAIN APP COMPONENT (UPGRADED) ---
const App = () => {
  // --- STATE ---
  const [entries, setEntries] = useState(() => {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [trainingCycle, setTrainingCycle] = useState(() => {
    const saved = localStorage.getItem(CYCLE_KEY);
    return saved ? JSON.parse(saved) : CYCLE_PRESETS['current-14-day'].days;
  });
  
  const [nutrition, setNutrition] = useState(() => {
    const saved = localStorage.getItem(NUTRITION_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [savedMeals, setSavedMeals] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_MEALS_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (e) { return []; }
  });

  const [sleepEntries, setSleepEntries] = useState(() => {
    const saved = localStorage.getItem(SLEEP_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    console.log(`[App Init] Sleep entries loaded from localStorage: ${parsed.length} entries`);
    // First-release imports used caloriesBurned/activeCalories; rename to the unambiguous
    // totalCaloriesBurned/activeCaloriesBurned. Idempotent, so it is safe on every load.
    return parsed.map(renameLegacyActivityFields);
  });

  // Diet goals live in App, not Settings: the dashboard reads them, Settings writes
  // them, and the empirical-maintenance gate will update them too. Three owners of one
  // concept, each reaching for its own copy, is how the sleep-source bug happened.
  const [dietGoals, setDietGoals] = useState(() => {
    // Copied, so state is never a reference to the shared constant.
    const fallback = { ...DEFAULT_DIET_GOALS };
    try {
      const saved = localStorage.getItem(DIET_GOALS_KEY);
      // Spread over the fallback so goals saved before these fields existed read as
      // null rather than undefined. Additive: nothing already saved is renamed or dropped.
      return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
    } catch (e) {
      return fallback; // a corrupt value here would otherwise throw during mount
    }
  });

  const [view, setView] = useState('dashboard');
  const [entryToEdit, setEntryToEdit] = useState(null);
  // Where the workout/sleep forms return to, and the day they open on when started
  // from the Calendar (null = today).
  const [returnView, setReturnView] = useState('dashboard');
  const [formStart, setFormStart] = useState(null); // { date, type } | null
  const [calendarDate, setCalendarDate] = useState(() => formatDate(new Date()));
  const [mealDate, setMealDate] = useState(null);
  const [uiPrefs, setUiPrefsState] = useState(() => getUiPrefs());
  useEffect(() => { applyUiPrefs(uiPrefs); }, []);
  const updateUiPrefs = (next) => { saveUiPrefs(next); setUiPrefsState(next); };
  const [settingsGroup, setSettingsGroup] = useState({ id: null, n: 0 });
  const [nutritionEntryToEdit, setNutritionEntryToEdit] = useState(null);
  const [sleepEntryToEdit, setSleepEntryToEdit] = useState(null);

  // Run data migration on mount (only once)
  useEffect(() => {
    const result = migrateToSeparatedData();
    if (result.migrated) {
      console.log(`[Migration V2] Successful: ${result.nutritionCreated} nutrition entries created`);
      // Force reload data after migration
      window.location.reload();
    }
  }, []); // Empty deps = run once on mount

  // Run V3 migration to split sleep/nutrition (only once)
  useEffect(() => {
    const result = migrateToSplitSleepNutrition();
    if (result.migrated) {
      console.log(`[Migration V3] Successful: ${result.sleepCreated} sleep entries and ${result.nutritionCreated} nutrition entries created`);
      // Force reload data after migration
      window.location.reload();
    }
  }, []); // Empty deps = run once on mount

  // Run V4 migration to recalculate cycle days (only once)
  useEffect(() => {
    const result = recalculateCycleDays(trainingCycle);
    if (result.migrated) {
      console.log(`[Migration V4] Successful: Recalculated cycle days for ${result.entriesUpdated} entries`);
      // Reload entries from localStorage after migration
      const updated = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
      setEntries(updated);
      console.log(`[Migration V4] Reloaded ${updated.length} entries into state`);
    }
  }, []); // Empty deps = run once on mount


  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(CYCLE_KEY, JSON.stringify(trainingCycle));
  }, [trainingCycle]);

  useEffect(() => {
    localStorage.setItem(NUTRITION_KEY, JSON.stringify(nutrition));
  }, [nutrition]);

  useEffect(() => {
    localStorage.setItem(SAVED_MEALS_KEY, JSON.stringify(savedMeals));
  }, [savedMeals]);

  useEffect(() => {
    localStorage.setItem(SLEEP_KEY, JSON.stringify(sleepEntries));
  }, [sleepEntries]);

  useEffect(() => {
    localStorage.setItem(DIET_GOALS_KEY, JSON.stringify(dietGoals));
  }, [dietGoals]);

  // Empirical maintenance is derived here, once, from App-owned data. Settings renders
  // what it is handed and never recomputes its own copy. 'moderate' feeds the sanity
  // clamp only and is never saved.
  const maintenanceEstimate = React.useMemo(
    () => estimateEmpiricalMaintenance(
      nutrition, sleepEntries,
      calculateMifflinTdee(getCurrentWeight(sleepEntries), 'moderate'),
      dietGoals?.maintenanceExclusions || []
    ),
    [nutrition, sleepEntries, dietGoals?.maintenanceExclusions]
  );

  // --- DERIVED STATE (Upgraded) ---
  const sortedEntries = React.useMemo(
    () => [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [entries]
  );
  
  const [allExerciseNames, setAllExerciseNames] = useState(() =>
    Array.from(new Set(entries.flatMap(e => e.exercises || []).map(ex => ex.name)))
  );

  // Add this useEffect right after the useState above
  useEffect(() => {
    const names = Array.from(new Set(entries.flatMap(e => e.exercises || []).map(ex => ex.name)));
    setAllExerciseNames(names);
  }, [entries]);

  const allPRs = React.useMemo(() => calculateAllPRs(entries), [entries]);

  const recoveryStatus = React.useMemo(
    () => processWorkoutHistory(sortedEntries, sleepEntries),
    [sortedEntries, sleepEntries]
  );

  const todayStr = formatDate(new Date());
  const hasLoggedToday = sortedEntries.some(e => e.date === todayStr);

  // Use Coach.getDynamicCalendar as THE SINGLE SOURCE OF TRUTH for today's cycle position
  const coachResult = React.useMemo(
    () => Coach.getDynamicCalendar(sortedEntries, trainingCycle),
    [sortedEntries, trainingCycle]
  );
  const { today: nextWorkout, note: coachNote, cycleDay: coachCycleDay } = coachResult;

  // The calendar says what was scheduled; a logged entry says what actually happened.
  // Prefer the latter, since swapped days should move the calorie target with them.
  const todaysActualEntry = sortedEntries.find(e => e.date === todayStr);
  const todaysWorkoutType = todaysActualEntry ? todaysActualEntry.trainingType : nextWorkout;
  const todaysCalorieTarget = getTodaysCalorieTarget(todaysWorkoutType, dietGoals);

  // Use the coach's cycle day - this is the authoritative source
  const cycleDay = coachCycleDay;


  const todaysNutrition = getTodaysNutrition(nutrition);

  // Modals
  const [showAIModal, setShowAIModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [showCycleStartModal, setShowCycleStartModal] = useState(false);
  const [pendingCycle, setPendingCycle] = useState(null);

  // --- 🏠 HOME + SHELL DATA (redesign) ---
  // Every number the new home screen and header show is worked out here, from the
  // same App-owned state the rest of the app reads. home.js only renders it.
  const [menuOpen, setMenuOpen] = useState(false);

  // A new screen starts at its top, like a new page.
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const cycleLength = trainingCycle.length;
  const shortDate = (dateStr) => parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const todaysSleep = sleepEntries.find(s => s.date === todayStr) || null;
  const latestSleep = React.useMemo(
    () => sleepEntries.filter(s => Number(s.sleepHours) > 0).sort((a, b) => a.date.localeCompare(b.date)).pop() || null,
    [sleepEntries]
  );

  // Same call SmartRecoveryCard makes, for today's PLANNED session.
  const todayRecommendation = React.useMemo(
    () => getTrainingRecommendation(
      recoveryStatus,
      todaysSleep || latestSleep || { sleepHours: 8, deepSleepPercent: 15 },
      nextWorkout
    ),
    [recoveryStatus, todaysSleep, latestSleep, nextWorkout]
  );

  // Readiness = how recovered the muscles today trains are (100 - their average
  // fatigue). On a rest day it covers whatever was trained in the last 10 days.
  const readiness = React.useMemo(() => {
    const muscles = Object.values(recoveryStatus || {});
    let avg = null;
    if (todayRecommendation.involvedMuscleCount > 0) {
      avg = todayRecommendation.avgFatigue;
    } else {
      const recent = muscles.filter(m => m.lastTrained);
      if (recent.length) avg = recent.reduce((sum, m) => sum + (m.currentFatiguePercent || 0), 0) / recent.length;
    }
    const restCount = muscles.filter(m => m.currentFatiguePercent >= 70).length;
    const recoveringCount = muscles.filter(m => m.currentFatiguePercent >= 40 && m.currentFatiguePercent < 70).length;
    if (avg === null) return { pct: null, restCount, recoveringCount };
    const pct = Math.max(0, Math.min(100, 100 - avg));
    return {
      pct, restCount, recoveringCount,
      color: fatigueColor(avg),
      label: todayRecommendation.involvedMuscleCount > 0
        ? `Today's muscles are ${Math.round(pct)}% recovered`
        : `Recently trained muscles are ${Math.round(pct)}% recovered`
    };
  }, [recoveryStatus, todayRecommendation]);

  const homeHero = (() => {
    const kickerDay = `DAY ${cycleDay + 1} OF ${cycleLength}`;
    const tomorrow = trainingCycle[(cycleDay + 1) % cycleLength];
    if (todaysActualEntry) {
      const isRestEntry = todaysActualEntry.trainingType === 'REST';
      const sets = Number(todaysActualEntry.totalSets) || 0;
      const grade = todaysSleep ? getGrade(todaysSleep, sets) : 'N/A';
      let doneDetail;
      if (isRestEntry) doneDetail = 'Rest day logged';
      else if (todaysActualEntry.needsDetails) doneDetail = 'Fitbit recorded this one. Add your exercises.';
      else doneDetail = `${sets} working sets${grade !== 'N/A' ? ` · grade ${grade}` : ''}`;
      return {
        done: true,
        kicker: `DONE TODAY · ${kickerDay}`,
        title: formatWorkoutName(todaysActualEntry.trainingType),
        doneDetail,
        next: `Tomorrow: ${formatWorkoutName(tomorrow)}`
      };
    }
    const isRest = nextWorkout === 'REST';
    let note;
    if (isRest) {
      note = 'Scheduled rest. Your muscles keep recovering today, so keep protein up.';
    } else {
      const r = todayRecommendation;
      const muscle = r.mostFatiguedMuscle;
      const max = Math.round(r.maxFatigue || 0);
      const avg = Math.round(r.avgFatigue || 0);
      let fatigue;
      if (!r.proceed) fatigue = `${muscle} is still very fatigued (${max}%), so a rest day would help more.`;
      else if (max >= 60) fatigue = `${muscle} is at ${max}% fatigue, so trim volume by about a third.`;
      else if (avg >= 50) fatigue = `Fatigue is widespread (about ${avg}%), so trim volume a little.`;
      else if (max >= 50) fatigue = `${muscle} is still recovering (${max}%), so go a little lighter there.`;
      else if (avg < 20) fatigue = 'The muscles today trains are fresh.';
      else fatigue = `A little leftover fatigue (about ${avg}%), but you're good to go.`;
      const sets = r.proceed
        ? ` Aim for about ${r.suggestedSets} working sets${todaysSleep ? '' : ' (log last night’s sleep to fine-tune this)'}.`
        : '';
      note = fatigue + sets;
    }
    return {
      done: false,
      isRest,
      resume: !!readWorkoutDraft(),
      kicker: `TODAY · ${kickerDay}`,
      title: formatWorkoutName(nextWorkout),
      note
    };
  })();

  const homeSleep = (() => {
    if (!todaysSleep || !(Number(todaysSleep.sleepHours) > 0)) return null;
    const minutes = Number(todaysSleep.sleepHours) * 60;
    const deepPercent = Number(todaysSleep.deepSleepPercent) || 0;
    const deepMinutes = Number(todaysSleep.deepSleepMinutes) > 0 ? Number(todaysSleep.deepSleepMinutes) : minutes * deepPercent / 100;
    const rem = Number(todaysSleep.remMinutes) || 0;
    const light = Number(todaysSleep.lightMinutes) || 0;
    // Typed and imported nights only carry total + deep, so the bar splits deep
    // from the rest; light/REM show up if an entry ever has them.
    const segments = (rem > 0 || light > 0)
      ? [
          { label: 'Light', minutes: light, color: UI_COLORS.light },
          { label: 'REM', minutes: rem, color: UI_COLORS.rem },
          { label: 'Deep', minutes: deepMinutes, color: UI_COLORS.deep }
        ]
      : [
          { label: 'Other sleep', minutes: Math.max(0, minutes - deepMinutes), color: UI_COLORS.light },
          { label: 'Deep', minutes: deepMinutes, color: UI_COLORS.deep }
        ];
    const verdict = getSleepVerdict(todaysSleep.sleepHours, todaysSleep.deepSleepPercent, todaysSleep.recoveryRating);
    const tierLabels = ['PR range', 'Target range', 'Baseline', 'Poor'];
    const tierColors = [UI_COLORS.good, UI_COLORS.good, UI_COLORS.warn, UI_COLORS.bad];
    return { minutes, deepMinutes, deepPercent, segments, verdict: { label: tierLabels[verdict.tier], color: tierColors[verdict.tier] } };
  })();

  const homeWeight = (() => {
    const weighIns = sleepEntries
      .filter(e => Number(e.weight) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = weighIns[weighIns.length - 1];
    if (!latest) return { value: null, sub: 'No weigh-ins yet' };
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const recent = weighIns.filter(e => e.date >= formatDate(weekAgo));
    const parts = [];
    if (recent.length >= 2) {
      const avg = recent.reduce((sum, e) => sum + Number(e.weight), 0) / recent.length;
      parts.push(`7-day avg ${avg.toFixed(1)}`);
    }
    parts.push(latest.date === todayStr ? 'weighed today' : `weighed ${shortDate(latest.date)}`);
    const text = parts.join(' · ');
    return { value: Number(latest.weight), sub: text.charAt(0).toUpperCase() + text.slice(1) };
  })();

  const homeRecords = (() => {
    const weighted = allPRs.filter(p => Number(p.weight) > 0);
    if (!weighted.length) return { value: '', sub: 'No records yet' };
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const recentCount = weighted.filter(p => p.date >= formatDate(monthAgo)).length;
    const newest = [...weighted].sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      value: recentCount ? `${recentCount} in 30 days` : '',
      sub: `Latest: ${newest.name} ${newest.weight} lb · ${shortDate(newest.date)}`
    };
  })();

  const recoverySub = (() => {
    const { restCount, recoveringCount } = readiness;
    if (restCount) return `${restCount} muscle${restCount === 1 ? ' needs' : 's need'} rest${recoveringCount ? ` · ${recoveringCount} recovering` : ''}`;
    if (recoveringCount) return `${recoveringCount} recovering, none need rest`;
    return 'Everything is fresh';
  })();

  // Sunday..Saturday of this week for the menu's week strip.
  const menuWeek = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = formatDate(d);
      return {
        key: ds,
        letter: 'SMTWTFS'[i],
        day: d.getDate(),
        isToday: ds === todayStr,
        trained: sortedEntries.some(e => e.date === ds && e.trainingType && e.trainingType !== 'REST'),
        planned: formatWorkoutName(trainingCycle[getCycleDayForDate(d, cycleLength)])
      };
    });
  })();

  const lastImportDate = (() => {
    const imported = sleepEntries.filter(e => Array.isArray(e.importedFields) && e.importedFields.length);
    if (!imported.length) return null;
    return shortDate(imported.reduce((max, e) => (e.date > max ? e.date : max), imported[0].date));
  })();

  const navigate = (next) => {
    setMenuOpen(false);
    setView(next);
  };

  const VIEW_TITLES = {
    calendar: 'Calendar', log: 'Calendar', recovery: 'Recovery', charts: 'Charts',
    records: 'Personal records', settings: 'Settings', sleepForm: 'Sleep'
  };
  const headerTitle = view === 'dashboard'
    ? new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : view === 'form'
      ? (entryToEdit && entryToEdit.id ? 'Edit workout' : 'Log workout')
      : (VIEW_TITLES[view] || 'Hypertrophy');
  const headerSubtitle = view === 'recovery' && readiness.pct !== null ? readiness.label : null;

  // Planned type for any day, from the same calendar-anchored cycle the coach uses.
  const plannedForDate = (ds) => trainingCycle[getCycleDayForDate(parseLocalDate(ds), trainingCycle.length)] || 'REST';
  // For "log a workout" on a planned rest day: the next lifting day in the cycle.
  const firstLiftingTypeFrom = (ds) => {
    const len = trainingCycle.length;
    const start = getCycleDayForDate(parseLocalDate(ds), len);
    for (let k = 0; k < len; k++) {
      const t = trainingCycle[(start + k) % len];
      if (t && t !== 'REST') return t;
    }
    return 'Push/Biceps';
  };

  // --- HANDLERS ---
  const handleSaveEntry = (entry) => {
    setEntries(prev => {
      const existing = prev.find(e => e.id === entry.id);
      if (existing) {
        return prev.map(e => e.id === entry.id ? entry : e);
      } else {
        return [...prev, entry];
      }
    });
    const newNames = new Set(allExerciseNames);
    (entry.exercises || []).forEach(ex => {
      if (ex.name && !newNames.has(ex.name)) newNames.add(ex.name);
    });
    setAllExerciseNames(Array.from(newNames));

    if (returnView === 'calendar') setCalendarDate(entry.date);
    setView(returnView);
    setEntryToEdit(null);
    setFormStart(null);
  };
  
  const handleSaveNutrition = (entry) => {
    setNutrition(prev => {
      const existing = prev.find(e => e.id === entry.id);
      if (existing) {
        // Update existing
        return prev.map(e => e.id === entry.id ? entry : e);
      } else {
        // Add new
        return [...prev, entry];
      }
    });

    // No setView here: the modal saves in place.
    setNutritionEntryToEdit(null);
  };

  const handleSaveSleep = (entry) => {
    setSleepEntries(prev => {
      const existing = prev.find(e => e.id === entry.id);
      if (existing) {
        // Update existing. The form rebuilds the entry from scratch, so carry over the
        // imported steps/calories rather than silently dropping them.
        return prev.map(e => e.id === entry.id ? keepActivityFields(entry, existing) : e);
      } else {
        // Check if there's already a sleep entry for this date (one per day)
        const existingForDate = prev.find(e => e.date === entry.date);
        if (existingForDate) {
          // Replace the existing entry for this date
          return prev.map(e => e.date === entry.date ? keepActivityFields(entry, existingForDate) : e);
        } else {
          // Add new
          return [...prev, entry];
        }
      }
    });

    if (returnView === 'calendar') setCalendarDate(entry.date);
    setView(returnView);
    setSleepEntryToEdit(null);
    setFormStart(null);
  };

  // opts.date opens a NEW workout on that day (from the Calendar); opts.type
  // overrides the planned type ('lift' = the cycle's next lifting day).
  const handleShowForm = (entry = null, opts = {}) => {
    setEntryToEdit(entry);
    setFormStart(!entry && opts.date ? { date: opts.date, type: opts.type || null } : null);
    setReturnView(view === 'form' || view === 'sleepForm' ? returnView : view);
    setView('form');
  };

  // Reuses nutritionEntryToEdit; the quick-add modal doubles as the meal editor.
  const handleEditMeal = (meal) => {
    setNutritionEntryToEdit(meal);
    setShowNutritionModal(true);
  };

  const handleDuplicateLastWorkout = () => {
    const lastWorkout = sortedEntries.filter(e => e.trainingType !== 'REST').pop();
    if (lastWorkout) {
      const duplicated = {
        ...lastWorkout,
        id: null, // Will be generated in form
        date: formatDate(new Date()), // Set to today
      };
      setEntryToEdit(duplicated);
      setView('form');
    }
  };

  const handleDeleteEntry = (id, type = 'workout') => {
    if (type === 'nutrition') {
      setNutrition(prev => prev.filter(e => e.id !== id));
    } else if (type === 'sleep') {
      setSleepEntries(prev => prev.filter(e => e.id !== id));
    } else {
      setEntries(prev => prev.filter(e => e.id !== id));
    }
    setShowDeleteModal(null);
  };

  const handleDeleteNutrition = (id) => {
    setShowDeleteModal({ type: 'nutrition', id });
  };

  const handleShowSleepForm = (entry = null, date = null) => {
    setSleepEntryToEdit(entry);
    setFormStart(!entry && date ? { date } : null);
    setReturnView(view === 'form' || view === 'sleepForm' ? returnView : view);
    setView('sleepForm');
  };

  const openMealFor = (date = null) => {
    setMealDate(date);
    setNutritionEntryToEdit(null);
    setShowNutritionModal(true);
  };

  const handleDeleteSleep = (id) => {
    setShowDeleteModal({ type: 'sleep', id });
  };

  const openDeleteModal = (id) => {
    setShowDeleteModal(id);
  };
  
  // --- RENDER ---
  const renderView = () => {
    switch (view) {
      case 'form':
        return h(LogEntryForm, {
          onSave: handleSaveEntry,
          onCancel: () => { setView(returnView); setFormStart(null); },
          entryToEdit: entryToEdit,
          initialDate: formStart ? formStart.date : null,
          initialType: formStart && formStart.date
            ? (formStart.type === 'lift' ? firstLiftingTypeFrom(formStart.date) : plannedForDate(formStart.date))
            : null,
          allEntries: sortedEntries,
          nutrition: nutrition,
          allExerciseNames: allExerciseNames,
          setAllExerciseNames: setAllExerciseNames,
          trainingCycle: trainingCycle,
          // A past day started from the Calendar records that day's plan, not today's.
          plannedToday: formStart && formStart.date ? plannedForDate(formStart.date) : nextWorkout,
          cycleDay: formStart && formStart.date ? getCycleDayForDate(parseLocalDate(formStart.date), trainingCycle.length) : cycleDay,
          sleepEntries: sleepEntries,
          suggestedSets: todayRecommendation.suggestedSets
        });
      case 'sleepForm':
        return h(LogSleepForm, {
          onSave: handleSaveSleep,
          onCancel: () => { setView(returnView); setFormStart(null); },
          initialDate: formStart ? formStart.date : null,
          entryToEdit: sleepEntryToEdit,
          sleepEntries: sleepEntries
        });
      case 'calendar':
      case 'log':
        return h(CalendarScreen, {
          entries: sortedEntries,
          nutrition,
          sleepEntries,
          selected: calendarDate,
          onSelect: setCalendarDate,
          plannedFor: plannedForDate,
          cycleDayFor: (ds) => getCycleDayForDate(parseLocalDate(ds), trainingCycle.length),
          cycleLength: trainingCycle.length,
          gradeFor: (sleep, sets) => (sleep ? getGrade(sleep, sets) : 'N/A'),
          proteinTarget: dietGoals && dietGoals.enabled ? dietGoals.protein : USER_CONTEXT.proteinTarget,
          calorieTargetFor: (type) => getTodaysCalorieTarget(type, dietGoals),
          onEditWorkout: (w) => handleShowForm(w),
          onAddWorkout: (date, type) => handleShowForm(null, { date, type }),
          onDeleteWorkout: openDeleteModal,
          onAddMeal: openMealFor,
          onEditMeal: handleEditMeal,
          onDeleteMeal: handleDeleteNutrition,
          onEditSleep: (entry) => handleShowSleepForm(entry),
          onAddSleep: (date) => handleShowSleepForm(null, date),
          onDeleteSleep: handleDeleteSleep
        });
      case 'charts':
        return h(ChartsScreen, {
          entries: sortedEntries,
          nutrition,
          sleepEntries,
          exerciseNames: allExerciseNames,
          proteinTarget: dietGoals && dietGoals.enabled ? dietGoals.protein : USER_CONTEXT.proteinTarget,
          calorieTargetFor: (type) => getTodaysCalorieTarget(type, dietGoals),
          // Saved volumeLoad when present; older logs are computed the same way the
          // workout form does it.
          volumeFor: (ex) => Number(ex.volumeLoad) || calculateVolumeLoad(
            Array.isArray(ex.weights) ? ex.weights : (ex.weight ? Array((ex.reps || []).length).fill(ex.weight) : []),
            Array.isArray(ex.reps) ? ex.reps : [], ex.name, sleepEntries, ex.eachHand)
        });
      case 'settings':
        return h(Settings, {
          entries: sortedEntries,
          setEntries,
          trainingCycle,
          setTrainingCycle,
          nutrition: nutrition,
          setNutrition: setNutrition,
          sleepEntries: sleepEntries,
          setSleepEntries: setSleepEntries,
          dietGoals: dietGoals,
          setDietGoals: setDietGoals,
          maintenanceEstimate: maintenanceEstimate,
          savedMeals,
          setSavedMeals,
          uiPrefs,
          onUiPrefs: updateUiPrefs,
          onOpenMeals: () => openMealFor(null),
          key: `settings-${settingsGroup.n}`,
          initialGroup: settingsGroup.id
        });

        case 'recovery':
          return h(RecoveryScreen, {
            recoveryStatus,
            entries: sortedEntries,
            sleepEntries,
            onLogSleep: () => handleShowSleepForm(todaysSleep)
          });

      case 'records':
        return h(PRDashboard, { prs: allPRs });

      case 'dashboard':
      default:
        return h(HomeScreen, {
          hero: homeHero,
          hasLoggedToday,
          protein: {
            value: Number(todaysNutrition.totalProtein) || 0,
            target: dietGoals && dietGoals.enabled ? dietGoals.protein : USER_CONTEXT.proteinTarget
          },
          calories: { value: Number(todaysNutrition.totalCalories) || 0, target: todaysCalorieTarget },
          sleep: homeSleep,
          weight: homeWeight,
          recovery: { pct: readiness.pct, sub: recoverySub },
          records: homeRecords,
          sleepButtonLabel: todaysSleep ? '🌙 Edit sleep' : '🌙 Log sleep',
          onStart: () => handleShowForm(null),
          onEditToday: () => handleShowForm(todaysActualEntry),
          onAddMeal: () => openMealFor(null),
          onSleep: () => handleShowSleepForm(todaysSleep),
          onOpenLog: () => { setCalendarDate(formatDate(new Date())); setView('calendar'); },
          onOpenCharts: () => setView('charts'),
          onOpenRecovery: () => setView('recovery'),
          onOpenRecords: () => setView('records'),
          onOpenAI: () => setShowAIModal(true)
        });
    }
  };

  return h(ToastProvider, null,
    h(MaintenanceAutoApply, { maintenanceEstimate, dietGoals, setDietGoals }),
    // The page is the scroller and the header is sticky, so nothing slides when you
    // scroll and the iPhone status-bar tap still jumps to the top.
    h(AppHeader, {
      title: headerTitle,
      subtitle: headerSubtitle,
      readiness: view === 'recovery' || readiness.pct === null ? null : readiness,
      onMenu: () => setMenuOpen(true),
      onReadiness: () => setView('recovery'),
      tapToTop: uiPrefs.headerTapTop
    }),
    h(MenuDrawer, {
      open: menuOpen,
      onClose: () => setMenuOpen(false),
      view,
      onNavigate: navigate,
      week: menuWeek,
      lastImport: lastImportDate,
      onImport: () => {
        setSettingsGroup(g => ({ id: 'health', n: g.n + 1 }));
        navigate('settings');
      }
    }),
    h('div', { className: 'mx-auto max-w-2xl px-4 pt-4 pb-12' },
      h(SyncBanner),
      h('main', {}, renderView()),
      
      // Modals
      showAIModal && h(AIWorkoutSuggestion, {
        entries: sortedEntries,
        prs: allPRs,
        trainingCycle,
        nutrition: nutrition,
        sleepEntries: sleepEntries,
        onClose: () => setShowAIModal(false)
      }),
      showDeleteModal && h(Modal, { show: !!showDeleteModal, onClose: () => setShowDeleteModal(null), title: "Confirm Deletion" },
        h('div', {},
          h('p', { className: 'mb-4' }, 'Are you sure you want to delete this entry?'),
          h('div', { className: 'flex justify-end gap-4' },
            h(Button, { variant: 'secondary', onClick: () => setShowDeleteModal(null) }, 'Cancel'),
            h(Button, { variant: 'danger', onClick: () => handleDeleteEntry(showDeleteModal?.id || showDeleteModal, showDeleteModal?.type) }, 'Delete')
          )
        )
      ),
      showNutritionModal && h(NutritionQuickAddModal, {
        // Clearing the pending meal on close matters: without it the next plain
        // Quick Add would open prefilled with whatever was last edited.
        onClose: () => {
          setShowNutritionModal(false);
          setNutritionEntryToEdit(null);
          setMealDate(null);
        },
        initialDate: mealDate,
        onSave: handleSaveNutrition,
        entryToEdit: nutritionEntryToEdit,
        savedMeals,
        setSavedMeals
      }),

      // Cycle Editor Modal
      showCycleEditor && h(Modal, {
        show: showCycleEditor,
        onClose: () => setShowCycleEditor(false),
        title: "Edit Training Cycle"
      },
        h(CycleEditor, {
          currentCycle: trainingCycle,
          entries: sortedEntries,
          onClose: () => setShowCycleEditor(false),
          onSave: (newCycle) => {
            setPendingCycle(newCycle);
            setShowCycleStartModal(true);
            setShowCycleEditor(false);
          }
        })
      ),

      // Start Cycle Confirmation Modal
      showCycleStartModal && h(Modal, {
        show: showCycleStartModal,
        onClose: () => setShowCycleStartModal(false),
        title: "Start New Cycle?"
      },
        h(CycleStartConfirm, {
          pendingCycle,
          setTrainingCycle,
          onDone: () => {
            setShowCycleStartModal(false);
            setPendingCycle(null);
          }
        })
      )
    ) // <-- Main content closes here
  );
};

// --- 🔍 DEBUG HELPERS (accessible from browser console) ---
window.debugSleepData = () => {
  const sleep = localStorage.getItem(SLEEP_KEY);
  const nutrition = localStorage.getItem(NUTRITION_KEY);
  const workouts = localStorage.getItem(DB_KEY);

  console.log('=== DEBUG: Sleep Data ===');
  console.log('Raw localStorage (SLEEP_KEY):', sleep);
  console.log('Parsed sleep entries:', sleep ? JSON.parse(sleep) : null);
  console.log('Sleep count:', sleep ? JSON.parse(sleep).length : 0);
  console.log('\n=== Migration Status ===');
  console.log('Migration V2 done:', localStorage.getItem(MIGRATION_FLAG_KEY));
  console.log('Migration V3 done:', localStorage.getItem(MIGRATION_FLAG_V3_KEY));
  console.log('\n=== All Data Counts ===');
  console.log('Workouts:', workouts ? JSON.parse(workouts).length : 0);
  console.log('Nutrition:', nutrition ? JSON.parse(nutrition).length : 0);
  console.log('Sleep:', sleep ? JSON.parse(sleep).length : 0);

  return {
    sleepCount: sleep ? JSON.parse(sleep).length : 0,
    nutritionCount: nutrition ? JSON.parse(nutrition).length : 0,
    workoutsCount: workouts ? JSON.parse(workouts).length : 0,
    migrationV2: localStorage.getItem(MIGRATION_FLAG_KEY),
    migrationV3: localStorage.getItem(MIGRATION_FLAG_V3_KEY)
  };
};

console.log('💡 Debug helper available: Type debugSleepData() in console to check sleep data state');

// --- 🚀 MOUNT THE APP ---
// Cloud data is pulled before the first render, because every useState above reads
// localStorage once at mount. initSync never throws and gives up waiting after 5s.
const root = ReactDOM.createRoot(document.getElementById('root'));
Sync.initSync()
  .catch((err) => console.error('[Sync] init failed, running local-only:', err))
  .finally(() => root.render(h(App)));

