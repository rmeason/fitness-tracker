'use strict';

// --- ES Module Imports ---
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

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
  calculateSleepMultiplier
} from './recovery.js';

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
const MIGRATION_FLAG_V3_KEY = 'hypertrophyApp.migrationV3.done'; // Migration tracker for sleep split

// The shape App starts from and deleteAllData resets to. Spread, never mutated.
const DEFAULT_DIET_GOALS = {
  protein: 140, calories: 2200, enabled: false,
  goalType: null, calculatedAtWeight: null, calculatedAt: null,
  maintenanceSource: null, maintenanceLastShown: null
};

// --- 🛠️ HELPER FUNCTIONS ---
const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

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

const getGrade = (deepSleepPercent, totalSets) => {
  if (deepSleepPercent === null || totalSets === null) return 'N/A';
  if (deepSleepPercent >= 20 && totalSets >= 22) return 'S++';
  if (deepSleepPercent >= 15 && totalSets >= 20) return 'S/A+';
  if (deepSleepPercent >= 12 && totalSets >= 16) return 'A/A+';
  if (deepSleepPercent >= 10 && totalSets >= 14) return 'B+';
  if (deepSleepPercent < 10 && totalSets < 14) return 'C';
  return 'B';
};

const getSleepQualityStars = (deepSleepPercent) => {
  if (deepSleepPercent >= 20) return '⭐⭐⭐ PR RANGE';
  if (deepSleepPercent >= 15) return '⭐⭐ TARGET RANGE';
  if (deepSleepPercent >= 12) return '⭐ BASELINE RANGE';
  return '⚠️ POOR';
};

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

const caloriesFromMacros = (protein, carbs, fat) =>
  Math.round(
    (Number(protein) || 0) * KCAL_PER_G.protein +
    (Number(carbs) || 0) * KCAL_PER_G.carbs +
    (Number(fat) || 0) * KCAL_PER_G.fat
  );

const hasCompleteMacros = (entry) =>
  macroValue(entry, 'protein') !== null &&
  macroValue(entry, 'carbs') !== null &&
  macroValue(entry, 'fat') !== null;

const formatMacro = (value, suffix = 'g') =>
  value === null ? '—' : `${Math.round(value)}${suffix}`;

// Helper to get nutrition totals for a *specific day*
const getNutritionForDate = (nutritionLog, date) => {
  const entriesForDate = nutritionLog.filter(n => n.date === date);
  // CRITICAL FIX: Explicitly convert to Number to prevent string concatenation
  const totalProtein = entriesForDate.reduce((sum, entry) => sum + (Number(entry.protein) || 0), 0);
  const totalCalories = entriesForDate.reduce((sum, entry) => sum + (Number(entry.calories) || 0), 0);
  // Summing: an entry that never tracked carbs/fat correctly contributes nothing.
  const totalCarbs = entriesForDate.reduce((sum, entry) => sum + (Number(entry.carbs) || 0), 0);
  const totalFat = entriesForDate.reduce((sum, entry) => sum + (Number(entry.fat) || 0), 0);

  // Get latest entry for the date (for sleep, weight, recovery)
  const latestEntry = entriesForDate.length > 0 ? entriesForDate[entriesForDate.length - 1] : null;

  // Get latest entry with weight > 0 (Quick Add Meals have weight: 0)
  const latestWeightEntry = [...entriesForDate].reverse().find(e => Number(e.weight) > 0);

  // Count meals (entries with any of protein, calories, carbs or fat > 0).
  // Old entries have neither carbs nor fat, so their count is unchanged.
  const mealCount = entriesForDate.filter(e =>
    (Number(e.protein) || 0) > 0 ||
    (Number(e.calories) || 0) > 0 ||
    (Number(e.carbs) || 0) > 0 ||
    (Number(e.fat) || 0) > 0
  ).length;

  return {
    totalProtein,
    totalCalories,
    totalCarbs,
    totalFat,
    // Coverage flags let the UI tell "ate no carbs" from "carbs were never logged".
    carbsTracked: entriesForDate.some(e => macroValue(e, 'carbs') !== null),
    fatTracked: entriesForDate.some(e => macroValue(e, 'fat') !== null),
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
const getWindowedWeighIns = (sleepEntries, days) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return sleepEntries
    .filter(e => Number(e.weight) > 0 && new Date(e.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

const getWindowedIntakeDays = (nutrition, days) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const dates = [...new Set(
    nutrition.filter(n => new Date(n.date) >= cutoff).map(n => n.date)
  )];
  return dates
    .map(date => ({ date, totals: getNutritionForDate(nutrition, date) }))
    .filter(d => d.totals.totalCalories > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

// Maintenance from logged data: mean intake minus the calories implied by the weight
// trend (3500 kcal/lb). The formula survives only as a cold start and a sanity clamp.
// Returns { available: false, gateProgress } until there is enough history, so the UI
// can say "log more" rather than look broken. mifflinTdee is echoed back for display.
const estimateEmpiricalMaintenance = (nutrition, sleepEntries, mifflinTdee) => {
  const weighIns = getWindowedWeighIns(sleepEntries, MAINTENANCE_WINDOW_PREFERRED_DAYS);
  const intakeDays = getWindowedIntakeDays(nutrition, MAINTENANCE_WINDOW_PREFERRED_DAYS);

  const oldestRelevant = [...weighIns, ...intakeDays.map(d => ({ date: d.date }))]
    .reduce((min, e) => (!min || new Date(e.date) < new Date(min)) ? e.date : min, null);
  const daysOfHistory = oldestRelevant
    ? Math.round((new Date() - new Date(oldestRelevant)) / 86400000)
    : 0;

  const gateProgress = {
    intakeDays: intakeDays.length, intakeDaysNeeded: MAINTENANCE_MIN_INTAKE_DAYS,
    weighIns: weighIns.length, weighInsNeeded: MAINTENANCE_MIN_WEIGH_INS
  };

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

  return { available: true, empiricalTdee, gateProgress, mifflinTdee };
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
const Button = ({ onClick, children, className = '', variant = 'primary', type = 'button' }) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-slate-600 hover:bg-slate-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  return h('button', {
    type,
    onClick,
    className: `py-2 px-4 rounded-lg font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${variants[variant]} ${className}`
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

// --- 📈 CHART COMPONENT (FIXED FOR MOBILE) ---
const ExerciseProgressChart = ({ entries, allExerciseNames, sleepEntries }) => {
  const [selectedExercise, setSelectedExercise] = useState('');
  const [chartType, setChartType] = useState('weight');

  // Auto-select first exercise when allExerciseNames updates
  useEffect(() => {
    if (!selectedExercise && allExerciseNames.length > 0) {
      setSelectedExercise(allExerciseNames[0]);
    }
  }, [allExerciseNames, selectedExercise]);

  // No data state
  if (!entries || entries.length === 0) {
    return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
      h('p', { className: 'text-slate-400' }, 'No workout data yet. Log a workout to see charts!')
    );
  }

  // No exercises logged state
  if (allExerciseNames.length === 0) {
    return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
      h('p', { className: 'text-slate-400' }, 'No exercises logged yet. Add exercises to your workouts!')
    );
  }

  // Session volume chart
  if (chartType === 'sessionVolume') {
    const sessionData = entries
      .filter(e => e.trainingType !== 'REST' && e.totalVolume > 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sessionData.length === 0) {
      return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
        h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
        h('div', { className: 'mb-4' },
          h(Select, { value: chartType, onChange: (e) => setChartType(e.target.value) },
            h('option', { value: 'weight' }, 'Show Peak Weight'),
            h('option', { value: 'volume' }, 'Show Volume Load'),
            h('option', { value: 'sessionVolume' }, 'Show Session Volume Progress')
          )
        ),
        h('p', { className: 'text-slate-400' }, 'No session volume data yet.')
      );
    }

    const chartData = {
      labels: sessionData.map(d => d.date.slice(5)), // Shorter labels for mobile (MM-DD)
      datasets: [
        {
          label: 'Session Volume (lbs)',
          data: sessionData.map(d => d.totalVolume),
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.1)',
          tension: 0.1,
          fill: true,
        },
      ],
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } } },
        title: { display: true, text: 'Session Volume Progress', color: '#f1f5f9', font: { size: 14 } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxRotation: 45, font: { size: 10 } }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#334155' } }
      }
    };

    return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
      h('div', { className: 'mb-4' },
        h(Select, { value: chartType, onChange: (e) => setChartType(e.target.value) },
          h('option', { value: 'weight' }, 'Show Peak Weight'),
          h('option', { value: 'volume' }, 'Show Volume Load'),
          h('option', { value: 'sessionVolume' }, 'Show Session Volume Progress')
        )
      ),
      h('div', { className: 'relative w-full', style: { height: '300px' } },
        h(Line, { data: chartData, options: chartOptions })
      )
    );
  }

  // Exercise-specific charts (weight and volume)
  const exerciseData = entries
    .map(entry => {
      if (!entry.exercises) return null;
      const ex = entry.exercises.find(e => e.name === selectedExercise);
      if (!ex) return null;

      const maxWeight = Array.isArray(ex.weights)
        ? getMaxWeight(ex.weights)
        : (ex.weight || 0);

      let volumeLoad = ex.volumeLoad;
      if (!volumeLoad && ex.reps) {
        const weights = Array.isArray(ex.weights) ? ex.weights : (ex.weight ? [ex.weight] : []);
        volumeLoad = calculateVolumeLoad(weights, ex.reps, ex.name, sleepEntries, ex.eachHand);
      }

      return {
        date: entry.date,
        weight: maxWeight,
        volumeLoad: volumeLoad || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const chartData = {
    labels: exerciseData.map(d => d.date.slice(5)), // Shorter labels (MM-DD)
    datasets: [
      {
        label: chartType === 'weight' ? `Weight (lbs)` : `Volume (lbs)`,
        data: exerciseData.map(d => chartType === 'weight' ? d.weight : d.volumeLoad),
        borderColor: chartType === 'weight' ? '#38bdf8' : '#34d399',
        backgroundColor: chartType === 'weight' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(52, 211, 153, 0.1)',
        tension: 0.1,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } } },
      title: { 
        display: true, 
        text: selectedExercise ? `${selectedExercise}` : 'Select an Exercise', 
        color: '#f1f5f9',
        font: { size: 14 }
      },
    },
    scales: {
      x: { ticks: { color: '#94a3b8', maxRotation: 45, font: { size: 10 } }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#334155' } }
    }
  };

  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
    h('div', { className: 'grid grid-cols-1 gap-3 mb-4' },
      h(Select, { value: selectedExercise, onChange: (e) => setSelectedExercise(e.target.value) },
        h('option', { value: '' }, 'Select Exercise...'),
        allExerciseNames.map(name => h('option', { key: name, value: name }, name))
      ),
      h(Select, { value: chartType, onChange: (e) => setChartType(e.target.value) },
        h('option', { value: 'weight' }, 'Show Peak Weight'),
        h('option', { value: 'volume' }, 'Show Volume Load'),
        h('option', { value: 'sessionVolume' }, 'Show Session Volume Progress')
      )
    ),
    h('div', { className: 'relative w-full', style: { height: '300px' } },
      exerciseData.length > 0 && selectedExercise
        ? h(Line, { data: chartData, options: chartOptions })
        : h('div', { className: 'flex items-center justify-center h-full' },
            h('p', { className: 'text-slate-400 text-center' }, 
              selectedExercise 
                ? `No data for ${selectedExercise} yet.`
                : 'Select an exercise to view progress.'
            )
          )
    )
  );
};

// --- 📅 CALENDAR COMPONENT (UPGRADED) ---
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
          const isDumbbell = /dumbbell|^db\b|\bdb\s/i.test(pr.name);
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

// --- 💪 RECOVERY DASHBOARD COMPONENT ---
const RecoveryDashboard = ({ entries, sleepEntries, nutrition, onShowSleepForm, recoveryStatus: precomputedStatus }) => {
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('all');
  const [sortBy, setSortBy] = useState('fatigue'); // 'fatigue', 'name', 'lastTrained'
  const [showDetails, setShowDetails] = useState(null);

  // Calculate current recovery status
  const recoveryStatus = precomputedStatus || processWorkoutHistory(entries, sleepEntries);
  
  // Get today's sleep for recommendations
  const todayStr = formatDate(new Date());
  const todaySleep = sleepEntries.find(s => s.date === todayStr) || 
                     sleepEntries[sleepEntries.length - 1] || 
                     { sleepHours: 8, deepSleepPercent: 15 };

  // Muscle group categories
  const muscleGroups = {
    all: 'All Muscles',
    chest: ['pectoralsUpper', 'pectoralsLower'],
    shoulders: ['deltsFront', 'deltsMid', 'deltsRear', 'infraspinatus', 'supraspinatus'],
    back: ['latsUpper', 'latsLower', 'trapsUpper', 'trapsMid', 'trapsLower', 'rhomboids', 'erectorSpinae'],
    arms: ['bicepsLong', 'bicepsShort', 'brachialis', 'brachioradialis', 'tricepsLong', 'tricepsLateral', 'forearms'],
    legs: ['vastusLateralis', 'vastusMedialis', 'rectusFemoris', 'bicepsFemoris', 'semitendinosus', 'glutesUpper', 'glutesLower', 'gluteMed'],
    calves: ['gastrocnemius', 'soleus'],
    core: ['rectusAbdominis', 'obliqueExternal', 'obliqueInternal', 'serratusAnterior']
  };

  // Filter muscles by selected group
  const visibleMuscles = selectedMuscleGroup === 'all'
    ? Object.entries(recoveryStatus)
    : Object.entries(recoveryStatus).filter(([key, _]) => 
        muscleGroups[selectedMuscleGroup]?.includes(key)
      );

  // Sort muscles
  const sortedMuscles = [...visibleMuscles].sort((a, b) => {
    const [aKey, aData] = a;
    const [bKey, bData] = b;
    
    if (sortBy === 'fatigue') {
      return bData.currentFatiguePercent - aData.currentFatiguePercent;
    } else if (sortBy === 'name') {
      return aData.name.localeCompare(bData.name);
    } else if (sortBy === 'lastTrained') {
      if (!aData.lastTrained && !bData.lastTrained) return 0;
      if (!aData.lastTrained) return 1;
      if (!bData.lastTrained) return -1;
      return new Date(bData.lastTrained) - new Date(aData.lastTrained);
    }
    return 0;
  });

  // Calculate summary stats
  const avgFatigue = visibleMuscles.reduce((sum, [_, data]) => 
    sum + data.currentFatiguePercent, 0) / visibleMuscles.length;
  
  const freshCount = visibleMuscles.filter(([_, data]) => 
    data.currentFatiguePercent < 30).length;
  
  const fatiguedCount = visibleMuscles.filter(([_, data]) => 
    data.currentFatiguePercent >= 70).length;

  // Check for sleep data within last 48 hours
  const now = new Date();
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const hasRecentSleep = sleepEntries.some(s => new Date(s.date) >= cutoff48h);

  return h('div', { className: 'space-y-6' },
    // Sleep prompt banner if no recent sleep data
    !hasRecentSleep && h('div', {
      className: 'flex items-center gap-3 p-4 bg-slate-800 border border-blue-500 rounded-lg text-blue-300 text-sm mb-4'
    },
      '💤 No recent sleep data — recovery forecasts are using baseline estimates. Log tonight\'s sleep for accurate muscle readiness predictions.',
      onShowSleepForm && h('button', {
        type: 'button',
        onClick: onShowSleepForm,
        className: 'ml-auto px-3 py-1 bg-slate-700 hover:bg-slate-600 text-blue-200 rounded text-xs border border-blue-500 transition-colors whitespace-nowrap'
      }, 'Log Sleep')
    ),

    // Header with summary
    h('div', { className: 'bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-lg border border-slate-700' },
      h('h2', { className: 'text-2xl font-bold mb-4' }, '💪 Muscle Recovery Status'),
      h('div', { className: 'grid grid-cols-3 gap-4' },
        h('div', { className: 'text-center' },
          h('div', { className: 'text-3xl font-bold text-cyan-400' }, avgFatigue.toFixed(0) + '%'),
          h('div', { className: 'text-sm text-slate-400' }, 'Avg Fatigue')
        ),
        h('div', { className: 'text-center' },
          h('div', { className: 'text-3xl font-bold text-green-400' }, freshCount),
          h('div', { className: 'text-sm text-slate-400' }, 'Fresh Muscles')
        ),
        h('div', { className: 'text-center' },
          h('div', { className: 'text-3xl font-bold text-red-400' }, fatiguedCount),
          h('div', { className: 'text-sm text-slate-400' }, 'Fatigued Muscles')
        )
      )
    ),

    // Filters
    h('div', { className: 'bg-slate-800 p-4 rounded-lg space-y-3' },
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-2' }, 'Filter by Muscle Group'),
        h('div', { className: 'grid grid-cols-4 gap-2' },
          Object.entries(muscleGroups).map(([key, value]) =>
            h('button', {
              key,
              onClick: () => setSelectedMuscleGroup(key),
              className: `px-3 py-2 rounded text-sm transition-colors ${
                selectedMuscleGroup === key 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`
            }, typeof value === 'string' ? value : key.charAt(0).toUpperCase() + key.slice(1))
          )
        )
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-2' }, 'Sort By'),
        h('div', { className: 'flex gap-2' },
          ['fatigue', 'name', 'lastTrained'].map(sort =>
            h('button', {
              key: sort,
              onClick: () => setSortBy(sort),
              className: `px-3 py-2 rounded text-sm transition-colors ${
                sortBy === sort 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`
            }, sort === 'fatigue' ? 'Fatigue Level' : 
               sort === 'name' ? 'Muscle Name' : 'Last Trained')
          )
        )
      )
    ),

    // Muscle list
    h('div', { className: 'space-y-2' },
      sortedMuscles.map(([muscleKey, muscleData]) => {
        const muscleInfo = MUSCLES[muscleKey];
        const isExpanded = showDetails === muscleKey;
        
        return h('div', { 
          key: muscleKey,
          className: 'bg-slate-800 rounded-lg overflow-hidden border-2',
          style: { 
            borderColor: muscleData.color === 'red' ? '#ef4444' : 
                        muscleData.color === 'yellow' ? '#f59e0b' : '#10b981'
          }
        },
          // Muscle header (clickable)
          h('div', {
            className: 'p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700',
            onClick: () => setShowDetails(isExpanded ? null : muscleKey)
          },
            h('div', { className: 'flex items-center gap-3 flex-1' },
              h('span', { className: 'text-2xl' }, muscleData.recoveryStatus.emoji),
              h('div', { className: 'flex-1' },
                h('div', { className: 'font-bold text-lg' }, muscleData.name),
                h('div', { className: 'text-xs text-slate-400' },
                  muscleData.lastTrained 
                    ? `Last trained: ${muscleData.lastTrained}`
                    : 'Not trained recently'
                )
              )
            ),
            h('div', { className: 'text-right mr-4' },
              h('div', { className: 'text-2xl font-bold', style: { 
                color: muscleData.color === 'red' ? '#ef4444' : 
                       muscleData.color === 'yellow' ? '#f59e0b' : '#10b981'
              }}, muscleData.currentFatiguePercent.toFixed(0) + '%'),
              h('div', { className: 'text-xs text-slate-400' }, muscleData.recoveryStatus.status)
            ),
            h('span', { className: 'text-2xl' }, isExpanded ? '▼' : '▶')
          ),
          
          // Expanded details
          isExpanded && muscleData.fatigueHistory.length > 0 && h('div', { 
            className: 'p-4 pt-0 border-t border-slate-700' 
          },
            h('div', { className: 'mb-3' },
              h('div', { className: 'text-sm font-semibold mb-1' }, 'Recovery Info'),
              h('div', { className: 'text-xs text-slate-300' }, muscleData.recoveryStatus.description),
              h('div', { className: 'text-xs text-slate-400 mt-1' },
                `Recovery time: ${muscleInfo.hours}hrs | Decay rate: ${muscleInfo.decayRate}% per hour`
              )
            ),
            h('div', { className: 'mb-2' },
              h('div', { className: 'text-sm font-semibold mb-2' }, 'Recent Training'),
              h('div', { className: 'space-y-1' },
                muscleData.fatigueHistory.slice(-5).reverse().map((history, idx) =>
                  h('div', { 
                    key: idx,
                    className: 'text-xs bg-slate-900 p-2 rounded flex justify-between'
                  },
                    h('div', {},
                      h('span', { className: 'font-medium' }, history.exercise),
                      h('span', { className: 'text-slate-400 ml-2' }, `(${history.hoursAgo}h ago)`)
                    ),
                    h('div', {},
                      h('span', { className: 'text-slate-400' }, 
                        `${history.currentFatigue.toFixed(0)} pts`
                      )
                    )
                  )
                )
              )
            ),
            // Find exercises that target this muscle
            h('div', {},
              h('div', { className: 'text-sm font-semibold mb-2' }, 'Best Exercises'),
              h('div', { className: 'flex flex-wrap gap-2' },
                getExercisesForMuscle(muscleKey, 60).slice(0, 5).map(ex =>
                  h('div', {
                    key: ex.name,
                    className: 'text-xs bg-blue-900 px-2 py-1 rounded'
                  }, `${ex.name} (${ex.activation}%)`)
                )
              )
            )
          )
        );
      })
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
          responseJson = JSON.parse(data.text);
        } catch(e) {
          console.error("AI returned non-JSON:", data.text);
          throw new Error("AI returned an invalid response.");
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
const MacroCalorieHint = ({ protein, carbs, fat, calories, onUseDerived }) => {
  if (!hasCompleteMacros({ protein, carbs, fat })) return null;
  const derived = caloriesFromMacros(protein, carbs, fat);
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

// 💡 NEW: NUTRITION QUICK-ADD MODAL
const NutritionQuickAddModal = ({ onClose, onSave }) => {
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  // '' means "not tracked". A cleared field goes back to '' rather than 0 so an
  // untouched macro is never saved as a logged zero.
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  // 💡💡💡 THIS IS THE FIX 💡💡💡
  // Add date state, defaulting to today
  const [date, setDate] = useState(formatDate(new Date()));
  const { showToast } = useToast();

  const handleAdd = () => {
    // CRITICAL FIX: Ensure parseNumberWithSuffix result is converted to Number
    const prot = Number(parseNumberWithSuffix(protein)) || 0;
    const cals = Number(parseNumberWithSuffix(calories)) || 0;

    // Note: Allow negative values for corrections (e.g., if user logged wrong meal)
    // But warn if nothing at all was entered
    if (prot === 0 && cals === 0 && carbs === '' && fat === '') {
      showToast('Please enter protein, calories, carbs, or fat', 'error');
      return;
    }

    // Create nutrition entry with ONLY meal fields (separate from sleep).
    // Carbs and fat are included only when entered; an untouched field is
    // omitted entirely so it reads back as "not tracked", never as 0.
    const meal = {
      id: generateId(),
      date: date,
      protein: prot,
      calories: cals
    };
    if (carbs !== '') meal.carbs = Number(parseNumberWithSuffix(carbs)) || 0;
    if (fat !== '') meal.fat = Number(parseNumberWithSuffix(fat)) || 0;
    onSave(meal);

    showToast(`Added ${prot}g protein and ${cals} kcal for ${date}!`, 'success');
    onClose();
  };

  return h(Modal, { show: true, onClose, title: "🍽️ Quick Add Meal" },
    h('div', { className: 'space-y-4' },
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Date'),
        h(Input, { type: 'date', value: date, onChange: e => setDate(e.target.value) })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Protein (g)'),
        h(Input, {
          type: 'text',
          value: protein,
          onChange: e => setProtein(parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 30 or 3k'
        })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Carbs (g)'),
        h(Input, {
          type: 'text',
          value: carbs,
          onChange: e => setCarbs(e.target.value === '' ? '' : parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 50 (optional)'
        })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Fat (g)'),
        h(Input, {
          type: 'text',
          value: fat,
          onChange: e => setFat(e.target.value === '' ? '' : parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 20 (optional)'
        })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Calories (kcal)'),
        h(Input, {
          type: 'text',
          value: calories,
          onChange: e => setCalories(parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 500 or 3k'
        })
      ),
      h(MacroCalorieHint, { protein, carbs, fat, calories, onUseDerived: setCalories }),
      h(Button, { onClick: handleAdd, variant: 'primary', className: 'w-full' }, 'Add Entry')
    )
  );
};

// 🌙 NEW: LOG SLEEP FORM
const LogSleepForm = ({ onSave, onCancel, entryToEdit, sleepEntries }) => {
  const { showToast } = useToast();

  // Form state
  const [date, setDate] = useState(formatDate(new Date()));
  const [sleepHours, setSleepHours] = useState(8);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [deepSleepHours, setDeepSleepHours] = useState(1);
  const [deepSleepMinutes, setDeepSleepMinutes] = useState(36);
  const [recoveryRating, setRecoveryRating] = useState(8);
  const [weight, setWeight] = useState(() => {
    // Get last weight from sleep entries
    const lastSleep = sleepEntries.length > 0 ? sleepEntries[sleepEntries.length - 1] : null;
    return lastSleep?.weight || USER_CONTEXT.startWeight;
  });

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
      setWeight(entryToEdit.weight || USER_CONTEXT.startWeight);
    }
  }, [entryToEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const entry = {
      id: entryToEdit ? entryToEdit.id : generateId(),
      date,
      sleepHours: totalSleepDecimal,
      deepSleepPercent: deepSleepPercent,
      weight: Number(weight) || USER_CONTEXT.startWeight,
      recoveryRating: Number(recoveryRating)
    };

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
        h('p', { className: 'text-sm mt-1' }, getSleepQualityStars(deepSleepPercent))
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
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Weight (lbs)'),
        h(Input, { type: 'number', step: 0.1, value: weight, onChange: (e) => setWeight(e.target.value) })
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

// --- 🥩 NUTRITION LOG FORM (NEW) ---
const NutritionLogForm = ({ onSave, onCancel, entryToEdit, nutrition, allEntries }) => {
  const { showToast } = useToast();

  // Form state
  const [date, setDate] = useState(formatDate(new Date()));
  const [sleepHours, setSleepHours] = useState(8);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [deepSleepHours, setDeepSleepHours] = useState(1);
  const [deepSleepMinutes, setDeepSleepMinutes] = useState(36);
  const [recoveryRating, setRecoveryRating] = useState(8);
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  // '' means "not tracked". A cleared field goes back to '' rather than 0 so an
  // untouched macro is never saved as a logged zero.
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [weight, setWeight] = useState(() => {
    // Get last weight from nutrition entries or workout entries
    const lastNutrition = nutrition.length > 0 ? nutrition[nutrition.length - 1] : null;
    const lastWorkout = allEntries.length > 0 ? allEntries[allEntries.length - 1] : null;
    return lastNutrition?.weight || lastWorkout?.weight || USER_CONTEXT.startWeight;
  });

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
      setProtein(entryToEdit.protein || '');
      setCalories(entryToEdit.calories || '');
      // Prefill only when the entry actually tracked the field; a logged 0 stays 0.
      const editCarbs = macroValue(entryToEdit, 'carbs');
      const editFat = macroValue(entryToEdit, 'fat');
      setCarbs(editCarbs === null ? '' : editCarbs);
      setFat(editFat === null ? '' : editFat);
      setWeight(entryToEdit.weight || USER_CONTEXT.startWeight);
    }
  }, [entryToEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const deepSleepMinutesTotal = Math.round(deepSleepDecimal * 60);

    const entry = {
      id: entryToEdit ? entryToEdit.id : generateId(),
      date,
      sleepHours: totalSleepDecimal,
      deepSleepPercent: deepSleepPercent,
      deepSleepMinutes: deepSleepMinutesTotal,
      // CRITICAL FIX: Wrap in Number() to ensure numeric values
      protein: Number(protein ? parseNumberWithSuffix(protein) : 0),
      calories: Number(calories ? parseNumberWithSuffix(calories) : 0),
      weight: Number(weight) || USER_CONTEXT.startWeight,
      recoveryRating: Number(recoveryRating)
    };
    // Optional macros: included only when entered, so an untouched field is
    // omitted entirely and reads back as "not tracked", never as 0.
    if (carbs !== '') entry.carbs = Number(parseNumberWithSuffix(carbs)) || 0;
    if (fat !== '') entry.fat = Number(parseNumberWithSuffix(fat)) || 0;

    onSave(entry);
    showToast('Nutrition/sleep entry saved!', 'success');
  };

  return h('form', { onSubmit: handleSubmit, className: 'space-y-6 p-4 pb-24' },
    h('div', { className: 'flex justify-between items-center mb-4' },
      h('h2', { className: 'text-2xl font-bold' }, entryToEdit ? 'Edit Nutrition/Sleep' : 'Log Nutrition/Sleep'),
      h('button', {
        type: 'button',
        onClick: onCancel,
        className: 'text-slate-400 hover:text-white text-2xl'
      }, '✕')
    ),

    h('p', { className: 'text-sm text-slate-400 bg-slate-800 p-3 rounded' },
      '💡 Tip: All fields are optional. Log just sleep, just nutrition, or everything together. Multiple entries for the same day are aggregated.'
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
        h('p', { className: 'text-sm mt-1' }, getSleepQualityStars(deepSleepPercent))
      ),
      h(Slider, { label: 'Recovery Rating', min: 1, max: 10, value: recoveryRating, onChange: (e) => setRecoveryRating(Number(e.target.value)) })
    ),

    // Nutrition Section
    h('div', { className: 'bg-slate-800 p-4 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold flex items-center gap-2' },
        h('span', {}, '🥩'),
        'Nutrition'
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Protein (g)'),
        h(Input, {
          type: 'text',
          value: protein,
          onChange: e => setProtein(parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 140 or 3k'
        })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Carbs (g)'),
        h(Input, {
          type: 'text',
          value: carbs,
          onChange: e => setCarbs(e.target.value === '' ? '' : parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 300 (optional)'
        })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Fat (g)'),
        h(Input, {
          type: 'text',
          value: fat,
          onChange: e => setFat(e.target.value === '' ? '' : parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 80 (optional)'
        })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Calories (kcal)'),
        h(Input, {
          type: 'text',
          value: calories,
          onChange: e => setCalories(parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 2800 or 3k'
        })
      ),
      h(MacroCalorieHint, { protein, carbs, fat, calories, onUseDerived: setCalories })
    ),

    // Body Weight Section
    h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold flex items-center gap-2' },
        h('span', {}, '⚖️'),
        'Body Weight'
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Weight (lbs)'),
        h(Input, { type: 'number', step: 0.1, value: weight, onChange: (e) => setWeight(Number(e.target.value)) })
      )
    ),

    // Save Button
    h('div', { className: 'fixed bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-700 flex gap-4 z-50' },
      h(Button, { type: 'submit', variant: 'primary', className: 'flex-1' }, entryToEdit ? '💾 Update Entry' : '💾 Save Entry'),
      h(Button, { type: 'button', variant: 'secondary', onClick: onCancel }, 'Cancel')
    )
  );
};

// --- 📜 WORKOUT LOG FORM (UPDATED) ---
const LogEntryForm = ({ onSave, onCancel, entryToEdit, allEntries, nutrition, allExerciseNames, setAllExerciseNames, trainingCycle, plannedToday, cycleDay, sleepEntries }) => {
  const { showToast } = useToast();
  // Form state
  const [date, setDate] = useState(formatDate(new Date()));
  const [workoutTime, setWorkoutTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [trainingType, setTrainingType] = useState(plannedToday);
  const [exercises, setExercises] = useState([]);
  const [cardio, setCardio] = useState([]);
  const [duration, setDuration] = useState(60);
  const [caloriesBurned, setCaloriesBurned] = useState(''); // NEW: Optional calories burned field

  // Sleep lives in sleepEntries (post-V3), not in the nutrition array. Reading it
  // from nutrition pinned todaySleepPercent at 0, which silently degraded every
  // Smart Coach suggestion and kept the 'no sleep logged' banner permanently on.
  const todaysSleepEntry = (sleepEntries || []).find(s => s.date === formatDate(new Date()));
  const todaySleepPercent = Number(todaysSleepEntry?.deepSleepPercent) > 0
    ? Number(todaysSleepEntry.deepSleepPercent)
    : 0;
  const [isUploading, setIsUploading] = useState(false);

  // UI state for collapsible sections and quick log
  const [quickLogMode, setQuickLogMode] = useState(false);
  const [trainingSectionOpen, setTrainingSectionOpen] = useState(true);
  const [cardioSectionOpen, setCardioSectionOpen] = useState(false);

  const cardioMachines = getAllCardioNames();
  const cardioTotals = getCardioTotals({ cardio });

  const availableWorkoutTypes = [...new Set([plannedToday, 'REST', ...trainingCycle, ...WORKOUT_TYPES])];

  // Get recent exercises (last 10 unique)
  const recentExercises = [...new Set(
    allEntries
      .flatMap(e => (e.exercises || []).map(ex => ex.name))
      .filter(Boolean)
      .reverse()
  )].slice(0, 10);

  // Workout timer
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if ((exercises.length > 0 || cardio.length > 0) && !workoutStartTime) {
      setWorkoutStartTime(Date.now());
    }
  }, [exercises.length, cardio.length]);

  useEffect(() => {
    if (!workoutStartTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - workoutStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [workoutStartTime]);

  const formatElapsedTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const form = document.querySelector('form');
        if (form) form.requestSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Populate form
  useEffect(() => {
    if (entryToEdit) {
      setDate(entryToEdit.date);
      // Pre-populate time from loggedAt if available
      if (entryToEdit.loggedAt) {
        const t = new Date(entryToEdit.loggedAt);
        setWorkoutTime(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
      }
      setTrainingType(entryToEdit.trainingType || 'Push/Biceps');
      // Convert old format exercises to new format with weights array
      const normalizedExercises = (entryToEdit.exercises || []).map(ex => {
        const weights = Array.isArray(ex.weights)
          ? [...ex.weights]
          : (ex.weight ? Array(ex.sets || 3).fill(ex.weight) : ['', '', '']);
        return {
          ...ex,
          weights: weights,
          rpe: ex.rpe || 8
        };
      });
      setExercises(normalizedExercises);
      // Entries saved before cardio existed have no `cardio` key -> empty list
      const normalizedCardio = normalizeCardioForForm(entryToEdit.cardio);
      setCardio(normalizedCardio);
      if (normalizedCardio.length > 0) setCardioSectionOpen(true);
      setDuration(entryToEdit.duration || 60);
      setCaloriesBurned(entryToEdit.caloriesBurned || '');
    } else {
      setTrainingType(plannedToday);
      setCardio([]);
    }
  }, [entryToEdit, allEntries, plannedToday]);

  // --- Exercise Handlers ---
  const addExercise = (data = null) => {
    setExercises([...exercises, data || { name: '', weights: ['', '', ''], eachHand: false, sets: 3, reps: ['', '', ''], rpe: 8 }]);
  };
  const updateExercise = (index, field, value) => {
    const newExercises = [...exercises];
    newExercises[index] = { ...newExercises[index], [field]: value };
    if (field === 'sets') {
      const newSets = Number(value) || 0;
      // Resize reps array
      const newReps = new Array(newSets).fill('');
      for (let i = 0; i < Math.min(newReps.length, newExercises[index].reps.length); i++) {
        newReps[i] = newExercises[index].reps[i];
      }
      newExercises[index].reps = newReps;

      // Resize weights array
      const newWeights = new Array(newSets).fill('');
      const oldWeights = newExercises[index].weights || [];
      for (let i = 0; i < Math.min(newWeights.length, oldWeights.length); i++) {
        newWeights[i] = oldWeights[i];
      }
      newExercises[index].weights = newWeights;
    }
    setExercises(newExercises);
  };
  const updateExerciseRep = (exIndex, repIndex, value) => {
    const newExercises = [...exercises];
    const newReps = [...newExercises[exIndex].reps];
    newReps[repIndex] = value;
    newExercises[exIndex] = { ...newExercises[exIndex], reps: newReps };
    setExercises(newExercises);
  };
  const updateExerciseWeight = (exIndex, weightIndex, value) => {
    const newExercises = [...exercises];
    const newWeights = [...(newExercises[exIndex].weights || [])];
    newWeights[weightIndex] = value;
    // Auto-propagate Set 1 weight to all empty downstream sets
    if (weightIndex === 0 && value) {
      for (let i = 1; i < newWeights.length; i++) {
        if (!newWeights[i]) newWeights[i] = value;
      }
    }
    newExercises[exIndex] = { ...newExercises[exIndex], weights: newWeights };
    setExercises(newExercises);
  };
  const copyWeightToAllSets = (exIndex) => {
    const newExercises = [...exercises];
    const firstWeight = newExercises[exIndex].weights?.[0] || '';
    if (firstWeight) {
      const numSets = newExercises[exIndex].sets || 0;
      newExercises[exIndex].weights = new Array(numSets).fill(firstWeight);
      setExercises(newExercises);
      showToast('Weight copied to all sets!');
    }
  };
  const removeExercise = (index) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };
  const prefillExercise = (index, exName) => {
    const lastEntry = [...allEntries].reverse().find(entry =>
      entry.exercises && entry.exercises.some(ex => ex.name === exName)
    );
    if (lastEntry) {
      const lastEx = lastEntry.exercises.find(ex => ex.name === exName);
      if (lastEx) {
        const newExercises = [...exercises];
        // Convert old format to new format if needed
        const weights = Array.isArray(lastEx.weights)
          ? [...lastEx.weights]
          : (lastEx.weight ? Array(lastEx.sets || 3).fill(lastEx.weight) : ['', '', '']);

        newExercises[index] = {
          ...lastEx,
          weights: weights,
          rpe: lastEx.rpe || 8
        };
        setExercises(newExercises);
        showToast('Exercise pre-filled!');
      }
    } else {
      updateExercise(index, 'name', exName);
    }
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

  // --- Submit Handler (Upgraded) ---
  const handleSubmit = (e) => {
    e.preventDefault();

    const totalSets = trainingType === 'REST' ? 0 : exercises.reduce((sum, ex) => sum + Number(ex.sets), 0);

    const newNames = new Set(allExerciseNames);
    exercises.forEach(ex => {
      if (ex.name && !newNames.has(ex.name)) newNames.add(ex.name);
    });
    setAllExerciseNames(Array.from(newNames));

    const entry = {
      id: entryToEdit ? entryToEdit.id : generateId(),
      date,
      loggedAt: (() => {
        // Combine date + workoutTime into a precise local ISO timestamp
        const [year, month, day] = date.split('-').map(Number);
        const [hours, minutes] = workoutTime.split(':').map(Number);
        const d = new Date(year, month - 1, day, hours, minutes, 0);
        return d.toISOString();
      })(),
      trainingType,
      plannedTrainingType: plannedToday,
      cycleDay: cycleDay,
      exercises: trainingType === 'REST' ? [] : exercises.map(ex => {
        const weights = (ex.weights || []).map(w => Number(w) || 0);
        const reps = ex.reps.map(r => Number(r) || 0);
        return {
          name: ex.name,
          weights: weights,
          eachHand: ex.eachHand,
          sets: Number(ex.sets),
          reps: reps,
          rpe: Number(ex.rpe),
          volumeLoad: calculateVolumeLoad(weights, reps, ex.name, sleepEntries, ex.eachHand)
        };
      }),
      totalSets,
      totalVolume: exercises.reduce((sum, ex) => {
        const weights = (ex.weights || []).map(w => Number(w) || 0);
        const reps = ex.reps.map(r => Number(r) || 0);
        return sum + calculateVolumeLoad(weights, reps, ex.name, sleepEntries, ex.eachHand);
      }, 0),
      duration: Number(duration),
      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null, // NEW: Optional calories burned
      // NEW: Cardio sessions - time + steps instead of weight x reps.
      // Rows with no machine name are dropped so blank rows never persist.
      cardio: trainingType === 'REST' ? [] : cardio
        .filter(c => c.name && String(c.name).trim())
        .map(toSavedCardioItem),
    };

    const prsFound = [];
    if (entry.trainingType !== 'REST') {
      entry.exercises.forEach(ex => {
        const prevPR = getPreviousPR(ex.name, allEntries, entry.id);
        const maxWeight = getMaxWeight(ex.weights);
        if (maxWeight > 0 && maxWeight > prevPR) {
          const percent = prevPR > 0 ? `+${((maxWeight - prevPR) / prevPR * 100).toFixed(0)}%` : '+100%';
          prsFound.push(`🏆 New PR! ${ex.name}: ${maxWeight} lbs (${percent})`);
        }
      });
    }

    // Haptic feedback on PR detection
    if (prsFound.length > 0 && 'vibrate' in navigator) {
      // Three short bursts for celebration: [200ms vibrate, 100ms pause, 200ms vibrate, 100ms pause, 200ms vibrate]
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    onSave(entry);
    prsFound.forEach(pr => showToast(pr, 'success'));
    if (prsFound.length === 0) showToast('Entry saved!', 'success');
  };
  
  // --- 💡 FILE UPLOAD (UPGRADED) 💡 ---
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
    
    let apiContent = [ { type: "text", text: extractPrompt } ];

    try {
      if (file.type.startsWith('image/')) {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = error => reject(error);
        });
        
        apiContent.unshift({
          type: "image",
          source: { type: "base64", media_type: file.type, data: base64Data }
        });
        
      } else if (file.type === 'text/plain') {
        const textData = await file.text();
        apiContent.unshift({ type: "text", text: `FILE CONTENT:\n${textData}` });
      } else {
        throw new Error("Unsupported file type");
      }

      console.log("Calling REAL AI Vision Gateway...");

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
      const resultText = data.text;
      
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI did not return valid JSON.");
      }

      const resultJson = JSON.parse(jsonMatch[0]);

      // Auto-populate form (workout data only - nutrition/sleep handled separately)
      if (resultJson.exercises && resultJson.exercises.length > 0) {
        // Convert extracted exercises to new format with weights array
        const normalizedExercises = resultJson.exercises.map(ex => {
          const weights = ex.weight
            ? Array(ex.sets || 3).fill(ex.weight)
            : (ex.weights || ['', '', '']);
          return {
            ...ex,
            weights: weights,
            rpe: 8
          };
        });
        setExercises(normalizedExercises);
      }
      
      if (resultJson.protein || resultJson.calories) {
        const prot = resultJson.protein || 0;
        const cals = resultJson.calories || 0;
        showToast(`Extracted ${prot}g P / ${cals} kCal. Please add to nutrition log.`, 'success');
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

  // --- Render Form ---
  return h('form', { onSubmit: handleSubmit, className: 'space-y-6 p-4 pb-24' },
    h('div', { className: 'flex justify-between items-center mb-4' },
      h('h2', { className: 'text-2xl font-bold' }, entryToEdit ? 'Edit Log Entry' : 'New Log Entry'),
      h('button', {
        type: 'button',
        onClick: () => setQuickLogMode(!quickLogMode),
        className: 'px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700'
      }, quickLogMode ? '📝 Full Mode' : '⚡ Quick Log')
    ),

    !quickLogMode && h('div', { className: 'p-4 bg-slate-800 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold mb-2' }, '⚡ Auto-Populate (REAL AI)'),
      h('label', { className: 'block text-sm font-medium mb-1', htmlFor: 'file-upload' }, 'Upload Fitbit Image or .txt Log'),
      h(Input, { type: 'file', id: 'file-upload', onChange: handleFileUpload, accept: 'image/*,.txt' }),
      isUploading && h('div', { className: 'flex items-center gap-2 text-blue-400 mt-2' }, 
        h('div', { className: 'animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400' }),
        'Extracting data...'
      )
    ),

    h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' },
      h('div', { className: 'grid grid-cols-2 gap-3' },
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Date'),
          h(Input, { type: 'date', value: date, onChange: (e) => setDate(e.target.value) })
        ),
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Time'),
          h(Input, { type: 'time', value: workoutTime, onChange: (e) => setWorkoutTime(e.target.value) })
        )
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Training Type'),
        h(Select, { value: trainingType, onChange: (e) => setTrainingType(e.target.value) },
          availableWorkoutTypes.map(type =>
            h('option', { key: type, value: type }, type === plannedToday ? `${type} (Planned)` : type)
          )
        )
      )
    ),

    (!todaySleepPercent || todaySleepPercent <= 0) && h('div', {
      className: 'flex items-center gap-2 p-3 bg-slate-700 border border-yellow-600 rounded-lg text-yellow-300 text-sm mb-3'
    }, '🌙 No sleep data logged for today — recovery estimates will use baseline averages. Log sleep for personalized accuracy.'),

    trainingType !== 'REST' && h(CollapsibleSection, {
      title: 'Training',
      icon: '💪',
      isOpen: trainingSectionOpen,
      onToggle: () => setTrainingSectionOpen(!trainingSectionOpen)
    },
      workoutStartTime && h('div', { className: 'mb-4 p-3 bg-slate-900 rounded-lg' },
        h('div', { className: 'flex items-center justify-between' },
          h('div', {},
            h('p', { className: 'text-xs text-slate-400' }, '⏱️ Workout Timer'),
            h('p', { className: 'text-2xl font-bold text-blue-400' }, formatElapsedTime(elapsedTime))
          ),
          h('button', {
            type: 'button',
            onClick: () => setDuration(Math.round(elapsedTime / 60)),
            className: 'px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm transition-colors'
          }, '↓ Use as duration')
        )
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Duration (minutes)'),
        h(Input, { type: 'number', step: 5, value: duration, onChange: (e) => setDuration(Number(e.target.value)) })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Calories Burned (optional)'),
        h(Input, {
          type: 'number',
          step: 10,
          value: caloriesBurned,
          onChange: (e) => setCaloriesBurned(e.target.value),
          placeholder: 'e.g., 350'
        })
      ),
      h('h4', { className: 'font-semibold' }, 'Exercises'),
      recentExercises.length > 0 && h('div', { className: 'mb-3' },
        h('p', { className: 'text-xs text-slate-400 mb-2' }, 'Recent exercises:'),
        h('div', { className: 'flex flex-wrap gap-2' },
          recentExercises.map(exName =>
            h('button', {
              key: exName,
              type: 'button',
              onClick: () => {
                // Find the last time this exercise was performed
                const lastEntry = [...allEntries].reverse().find(e =>
                  e.exercises && e.exercises.some(ex => ex.name === exName)
                );
                const lastExercise = lastEntry?.exercises.find(ex => ex.name === exName);

                // Pre-fill with last performance
                const newExercise = {
                  name: exName,
                  sets: lastExercise?.sets || 3,
                  weights: lastExercise?.weights ? [...lastExercise.weights] : ['', '', ''],
                  reps: lastExercise?.reps ? [...lastExercise.reps] : ['', '', ''],
                  rpe: lastExercise?.rpe || 8
                };
                setExercises([...exercises, newExercise]);
              },
              className: 'px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors min-h-[44px] flex items-center'
            }, exName)
          )
        )
      ),
      h('div', { className: 'space-y-4' },
        exercises.map((ex, i) => quickLogMode
          ? // QUICK LOG MODE: Compact single-row layout
            h('div', { key: i, className: 'p-2 bg-slate-700 rounded-lg' },
              h('div', { className: 'grid grid-cols-12 gap-2 items-center' },
                h('div', { className: 'col-span-4' },
                  h(Input, {
                    type: 'text',
                    list: 'exercise-names',
                    placeholder: 'Exercise',
                    value: ex.name,
                    onChange: (e) => updateExercise(i, 'name', e.target.value),
                    className: 'text-sm'
                  })
                ),
                h('div', { className: 'col-span-2' },
                  h(Input, {
                    type: 'number',
                    min: 1,
                    placeholder: 'Sets',
                    value: ex.sets,
                    onChange: (e) => updateExercise(i, 'sets', e.target.value),
                    className: 'text-sm'
                  })
                ),
                h('div', { className: 'col-span-2' },
                  h(Input, {
                    type: 'number',
                    step: 0.5,
                    placeholder: 'Wt',
                    value: (ex.weights && ex.weights[0]) || '',
                    onChange: (e) => {
                      const val = e.target.value;
                      const newWeights = Array(Number(ex.sets) || 3).fill(val);
                      const newExercises = [...exercises];
                      newExercises[i] = { ...newExercises[i], weights: newWeights };
                      setExercises(newExercises);
                    },
                    className: 'text-sm'
                  })
                ),
                h('div', { className: 'col-span-2' },
                  h(Input, {
                    type: 'number',
                    placeholder: 'Reps',
                    value: ex.reps[0] || '',
                    onChange: (e) => {
                      const val = e.target.value;
                      const newReps = Array(Number(ex.sets) || 3).fill(val);
                      const newExercises = [...exercises];
                      newExercises[i] = { ...newExercises[i], reps: newReps };
                      setExercises(newExercises);
                    },
                    className: 'text-sm'
                  })
                ),
                h('div', { className: 'col-span-2' },
                  h('button', { type: 'button', className: 'text-red-400 text-xs', onClick: () => removeExercise(i) }, '✕')
                )
              ),
              h('datalist', { id: 'exercise-names' }, allExerciseNames.map(name => h('option', { key: name, value: name })))
            )
          : // FULL MODE: Detailed layout
            h('div', { key: i, className: 'p-3 bg-slate-700 rounded-lg space-y-3' },
              h('div', { className: 'flex justify-between items-center' },
                h('span', { className: 'font-semibold' }, `Exercise ${i + 1}`),
                h('button', { type: 'button', className: 'text-red-400', onClick: () => removeExercise(i) }, 'Remove')
              ),

              h(CoachSuggestionBox, {
                exerciseName: ex.name,
                allEntries,
                todaySleepPercent: todaySleepPercent,
                trainingType: trainingType,
                allExerciseNames: allExerciseNames
              }),

              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, 'Exercise Name'),
                h(Input, { type: 'text', list: 'exercise-names', value: ex.name, onChange: (e) => updateExercise(i, 'name', e.target.value) }),
                h('datalist', { id: 'exercise-names' }, allExerciseNames.map(name => h('option', { key: name, value: name })))
              ),
              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, 'Load Previous Data'),
                h(Select, { onChange: (e) => prefillExercise(i, e.target.value), value: '' },
                  h('option', { value: '' }, 'Select to pre-fill...'),
                  allExerciseNames.map(name => h('option', { key: name, value: name }, name))
                )
              ),
              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, 'Number of Sets'),
                h(Input, { type: 'number', min: 1, value: ex.sets, onChange: (e) => updateExercise(i, 'sets', e.target.value) })
              ),
          h('div', { className: 'flex items-center gap-2' },
            h('input', { type: 'checkbox', id: `eachHand-${i}`, checked: ex.eachHand, onChange: (e) => updateExercise(i, 'eachHand', e.target.checked), className: 'h-4 w-4' }),
            h('label', { htmlFor: `eachHand-${i}`, className: 'block text-sm' }, 'Weight is "each hand"')
          ),
          h('div', {},
            h('div', { className: 'flex justify-between items-center mb-1' },
              h('label', { className: 'block text-xs' }, `Weight & Reps per Set (${ex.sets} sets)`),
              (ex.weights && ex.weights[0]) && h('button', {
                type: 'button',
                className: 'text-xs text-blue-400 hover:text-blue-300',
                onClick: () => copyWeightToAllSets(i)
              }, '📋 Copy weight to all sets')
            ),
            h('div', { className: 'space-y-2' },
              ex.reps.map((rep, setIndex) =>
                h('div', { key: setIndex, className: 'grid grid-cols-3 gap-2 items-center' },
                  h('div', { className: 'text-xs text-slate-400' }, `Set ${setIndex + 1}:`),
                  h(Input, {
                    type: 'number',
                    step: 0.5,
                    placeholder: 'Weight',
                    value: (ex.weights && ex.weights[setIndex]) || '',
                    onChange: (e) => updateExerciseWeight(i, setIndex, e.target.value)
                  }),
                  h(Input, {
                    type: 'number',
                    placeholder: 'Reps',
                    value: rep,
                    onChange: (e) => updateExerciseRep(i, setIndex, e.target.value)
                  })
                )
              )
            )
          ),

          h(RpeSlider, { value: ex.rpe, onChange: (e) => updateExercise(i, 'rpe', e.target.value) })
        )),
        h(Button, { type: 'button', variant: 'secondary', onClick: () => addExercise() }, '+ Add Exercise')
      ),
      h('div', { className: 'grid grid-cols-2 gap-4 p-4 bg-slate-900 rounded-lg' },
        h('div', {},
          h('div', { className: 'text-sm text-slate-400' }, 'Total Working Sets'),
          h('div', { className: 'text-2xl font-bold text-cyan-400' }, exercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0))
        ),
        h('div', {},
          h('div', { className: 'text-sm text-slate-400' }, 'Session Volume'),
          h('div', { className: 'text-2xl font-bold text-green-400' },
            (() => {
              const totalVolume = exercises.reduce((sum, ex) => {
                const weights = (ex.weights || []).map(w => Number(w) || 0);
                const reps = ex.reps.map(r => Number(r) || 0);
                return sum + calculateVolumeLoad(weights, reps, ex.name, sleepEntries, ex.eachHand);
              }, 0);
              return `${totalVolume.toLocaleString()} lbs`;
            })()
          )
        )
      )
    ),

    // 🏃 Cardio Section - time + steps instead of weight + reps
    trainingType !== 'REST' && h(CollapsibleSection, {
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
              className: 'px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors min-h-[44px] flex items-center gap-1'
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
              h('button', { type: 'button', className: 'text-red-400', onClick: () => removeCardio(i) }, 'Remove')
            ),
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, 'Machine'),
              h(Input, {
                type: 'text',
                list: 'cardio-machines',
                placeholder: 'e.g., Stairmaster',
                value: c.name,
                onChange: (e) => updateCardio(i, 'name', e.target.value)
              })
            ),
            h('div', { className: 'grid grid-cols-2 gap-2' },
              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, 'Time (minutes)'),
                h(Input, {
                  type: 'number',
                  min: 0,
                  step: 1,
                  placeholder: 'e.g., 20',
                  value: c.minutes,
                  onChange: (e) => updateCardio(i, 'minutes', e.target.value)
                })
              ),
              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, getCardioData(c.name)?.stepLabel || 'Steps'),
                h(Input, {
                  type: 'number',
                  min: 0,
                  step: 1,
                  placeholder: 'e.g., 1500',
                  value: c.steps,
                  onChange: (e) => updateCardio(i, 'steps', e.target.value)
                })
              )
            ),
            // Universal fields, on every row whatever the machine. Both optional:
            // blank means not tracked and saves as null rather than a logged zero.
            h('div', { className: 'grid grid-cols-2 gap-2' },
              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, 'Effort (RPE 1-10)'),
                h(Input, {
                  type: 'number',
                  min: 1,
                  max: 10,
                  step: 1,
                  placeholder: 'optional',
                  value: asFormValue(c.effort),
                  onChange: (e) => updateCardio(i, 'effort', e.target.value)
                })
              ),
              h('div', {},
                h('label', { className: 'block text-xs mb-1' }, 'When'),
                h(Select, {
                  value: c.timing || '',
                  onChange: (e) => updateCardio(i, 'timing', e.target.value)
                },
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
                  h(Input, {
                    type: f.type,
                    min: 0,
                    step: 'any',
                    placeholder: 'optional',
                    value: asFormValue(c[f.key]),
                    onChange: (e) => updateCardio(i, f.key, e.target.value)
                  })
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
        // Only worth breaking the total apart when more than one machine was used.
        Object.keys(cardioTotals.stepsByMachine).length > 1 && h('div', { className: 'text-xs text-slate-400' },
          Object.entries(cardioTotals.stepsByMachine)
            .map(([machine, steps]) => `${machine}: ${steps.toLocaleString()}`)
            .join(' · ')
        )
      )
    ),

    // Floating Save Button
    h('div', { className: 'fixed bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-700 flex gap-4 z-50' },
      h(Button, { type: 'submit', variant: 'primary', className: 'flex-1' }, entryToEdit ? '💾 Update Entry' : '💾 Save Entry'),
      h(Button, { type: 'button', variant: 'secondary', onClick: onCancel }, 'Cancel')
    )
  );
};

// --- 📅 UNIFIED DAILY CARD COMPONENT ---
const DailyCard = ({ dailyData, allEntries, onEditWorkout, onDeleteWorkout, onEditSleep, onDeleteSleep, onDeleteMeal }) => {
  const { date, workouts, meals, sleep } = dailyData;

  const [sleepExpanded, setSleepExpanded] = useState(false);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);
  const [workoutExpanded, setWorkoutExpanded] = useState(false);

  // Calculate nutrition totals
  const totalProtein = meals.reduce((sum, meal) => sum + (Number(meal.protein) || 0), 0);
  const totalCalories = meals.reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + (Number(meal.carbs) || 0), 0);
  const totalFat = meals.reduce((sum, meal) => sum + (Number(meal.fat) || 0), 0);
  // The sums above cannot tell "ate none" from "never logged", so a day where no
  // meal tracked carbs/fat renders as "—" rather than 0.
  const carbsTracked = meals.some(m => macroValue(m, 'carbs') !== null);
  const fatTracked = meals.some(m => macroValue(m, 'fat') !== null);
  const carbsDisplay = formatMacro(carbsTracked ? totalCarbs : null);
  const fatDisplay = formatMacro(fatTracked ? totalFat : null);

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
    ? getGrade(sleep.deepSleepPercent, totalSets)
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
      h('div', { className: 'flex gap-4 mt-2 text-sm text-slate-300' },
        h('span', {}, `🥩 ${totalProtein}g P / ${carbsDisplay} C / ${fatDisplay} F / ${totalCalories} kcal`),
        h('span', {}, `💪 ${workoutType}`),
        cardioSummary && h('span', {}, `🏃 ${cardioSummary}`)
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
                h('div', { className: 'text-sm' }, getSleepQualityStars(sleep.deepSleepPercent))
              ),
              h('div', {},
                h('div', { className: 'text-sm font-medium text-slate-400' }, 'Recovery Rating'),
                h('div', {}, `${sleep.recoveryRating}/10`)
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
              h('div', { className: 'flex justify-between items-center' },
                h('span', { className: 'font-bold' }, 'Total'),
                h('span', { className: 'text-lg' }, `${totalProtein}g P / ${carbsDisplay} C / ${fatDisplay} F / ${totalCalories} kcal`)
              )
            ),
            h('div', { className: 'mt-3 space-y-2' },
              h('h4', { className: 'text-sm font-semibold text-slate-400' }, 'Meals'),
              meals.map((meal, idx) =>
                h('div', { key: meal.id, className: 'flex justify-between items-center bg-slate-700 p-2 rounded' },
                  h('span', { className: 'text-sm' }, `Meal ${idx + 1}`),
                  h('span', {}, `${Number(meal.protein)}g P / ${formatMacro(macroValue(meal, 'carbs'))} C / ${formatMacro(macroValue(meal, 'fat'))} F / ${Number(meal.calories)} kcal`),
                  h('button', {
                    className: 'text-red-400 text-sm hover:text-red-300',
                    onClick: () => onDeleteMeal(meal.id)
                  }, 'Delete')
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
const Settings = ({ entries, setEntries, trainingCycle, setTrainingCycle, nutrition, setNutrition, sleepEntries, setSleepEntries, dietGoals, setDietGoals, maintenanceEstimate }) => {
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
      maintenanceLastShown: dietGoals.maintenanceLastShown == null ? null : dietGoals.maintenanceLastShown
    };
    setDietGoals(newGoals); // App persists this; no direct write from here
    showToast(`Diet goals set: ${protein}g protein, ${calories} kcal`, 'success');
    setShowDietGoals(false);
  };

  const exportData = () => {
    const cardioSessions = entries.reduce((sum, e) => sum + getCardioList(e).length, 0);
    console.log(`[Export] Exporting data: ${entries.length} workouts (${cardioSessions} cardio sessions), ${nutrition.length} meals, ${sleepEntries.length} sleep entries`);
    const dataStr = JSON.stringify({ entries, trainingCycle, customCycles, nutrition, sleep: sleepEntries, dietGoals, profile: getProfile() }, null, 2);
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
            setDietGoals(imported.dietGoals);
            localStorage.setItem(DIET_GOALS_KEY, JSON.stringify(imported.dietGoals));
            console.log('[Import] Restored diet goals');
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
      setDietGoals({ ...DEFAULT_DIET_GOALS });
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(CYCLE_KEY);
      localStorage.removeItem(CUSTOM_CYCLES_KEY);
      localStorage.removeItem(NUTRITION_KEY);
      localStorage.removeItem(SLEEP_KEY);
      localStorage.removeItem(DIET_GOALS_KEY);
      localStorage.removeItem(PROFILE_KEY);
      // Same reason as the import: these inputs are seeded at mount, not reactive.
      refreshProfileInputs();
      showToast('All data deleted.', 'danger');
    }
  };

  return h('div', { className: 'p-4 space-y-6' },
    h('h2', { className: 'text-2xl font-bold' }, '⚙️ Settings'),
    h('div', { className: 'space-y-4 bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold' }, '🔄 Training Cycle'),
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
    h('div', { className: 'space-y-4 bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold' }, '👤 Profile'),
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
    h('div', { className: 'space-y-4 bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold' }, '🎯 Diet Goals'),
      dietGoals.enabled && h('div', { className: 'text-sm text-slate-300 mb-2' },
        `Current: ${dietGoals.protein}g protein, ${dietGoals.calories} kcal`
      ),
      // Gate progress while history accumulates: a missing switch reads as "log more".
      !maintenanceEstimate.available && h('p', { className: 'text-xs text-slate-400' },
        `Empirical maintenance: ${maintenanceEstimate.gateProgress.intakeDays} of ${maintenanceEstimate.gateProgress.intakeDaysNeeded} days with logged intake, ${maintenanceEstimate.gateProgress.weighIns} of ${maintenanceEstimate.gateProgress.weighInsNeeded} weigh-ins.`
        + (maintenanceEstimate.discardedAsUnreliable
          ? ' The latest estimate fell outside the plausible range and was discarded.'
          : '')
      ),
      maintenanceEstimate.available && h('p', { className: 'text-xs text-slate-400' },
        `Last ${MAINTENANCE_WINDOW_PREFERRED_DAYS} days: ${maintenanceEstimate.empiricalTdee} kcal maintenance`
        + (dietGoals.maintenanceSource === 'empirical' ? ' — in use, updates itself.' : ' — formula in use.')
      ),
      showTransitionCard && h('div', { className: 'bg-slate-900 border border-cyan-700 p-3 rounded-lg space-y-2' },
        h('p', { className: 'text-sm' },
          `Your last ${MAINTENANCE_WINDOW_PREFERRED_DAYS} days say ${maintenanceEstimate.empiricalTdee} kcal maintenance; the formula estimated ${formulaMaintenance} kcal.`
        ),
        h('div', { className: 'flex gap-2' },
          h(Button, { onClick: applyEmpiricalMaintenance, variant: 'primary', className: 'flex-1' }, 'Apply'),
          h(Button, { onClick: keepFormulaMaintenance, variant: 'secondary', className: 'flex-1' }, 'Keep formula')
        )
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
    h('div', { className: 'space-y-4 bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold' }, 'Data Backup'),
      h(Button, { onClick: exportData, variant: 'primary' }, 'Export All Data (JSON)'),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1', htmlFor: 'import-file' }, 'Import Data (JSON)'),
        h(Input, { type: 'file', id: 'import-file', accept: '.json', onChange: importData })
      )
    ),
    h('div', { className: 'space-y-4 bg-slate-800 p-4 rounded-lg' },
      h('h3', { className: 'text-lg font-semibold' }, 'Danger Zone'),
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
      showToast(`Maintenance updated to ${maintenanceEstimate.empiricalTdee} kcal based on your last ${MAINTENANCE_WINDOW_PREFERRED_DAYS} days.`, 'success');
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

  const [sleepEntries, setSleepEntries] = useState(() => {
    const saved = localStorage.getItem(SLEEP_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    console.log(`[App Init] Sleep entries loaded from localStorage: ${parsed.length} entries`);
    return parsed;
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
    localStorage.setItem(SLEEP_KEY, JSON.stringify(sleepEntries));
  }, [sleepEntries]);

  useEffect(() => {
    localStorage.setItem(DIET_GOALS_KEY, JSON.stringify(dietGoals));
  }, [dietGoals]);

  // Empirical maintenance is derived here, once, from App-owned data. Settings renders
  // what it is handed and never recomputes its own copy. 'moderate' feeds the sanity
  // clamp only and is never saved.
  const maintenanceEstimate = React.useMemo(
    () => estimateEmpiricalMaintenance(nutrition, sleepEntries, calculateMifflinTdee(getCurrentWeight(sleepEntries), 'moderate')),
    [nutrition, sleepEntries]
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


  const planTitle = hasLoggedToday ? "💡 Tomorrow's Plan" : "💡 Today's Plan";

  const todaysNutrition = getTodaysNutrition(nutrition);

  // Calculate weekly calories burned (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weeklyCaloriesBurned = sortedEntries
    .filter(e => new Date(e.date) >= sevenDaysAgo && e.caloriesBurned)
    .reduce((sum, e) => sum + (e.caloriesBurned || 0), 0);

  // Analyze recovery status from sleep data
  const recoveryAnalysis = Coach.analyzeRecoveryPattern(sleepEntries);

  // Modals
  const [showAIModal, setShowAIModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [showCycleStartModal, setShowCycleStartModal] = useState(false);
  const [pendingCycle, setPendingCycle] = useState(null);

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
    
    setView('dashboard');
    setEntryToEdit(null);
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

    setView('dashboard');
    setNutritionEntryToEdit(null);
  };

  const handleSaveSleep = (entry) => {
    setSleepEntries(prev => {
      const existing = prev.find(e => e.id === entry.id);
      if (existing) {
        // Update existing
        return prev.map(e => e.id === entry.id ? entry : e);
      } else {
        // Check if there's already a sleep entry for this date (one per day)
        const existingForDate = prev.find(e => e.date === entry.date);
        if (existingForDate) {
          // Replace the existing entry for this date
          return prev.map(e => e.date === entry.date ? entry : e);
        } else {
          // Add new
          return [...prev, entry];
        }
      }
    });

    setView('dashboard');
    setSleepEntryToEdit(null);
  };

  const handleShowForm = (entry = null) => {
    setEntryToEdit(entry);
    setView('form');
  };

  const handleShowNutritionForm = (entry = null) => {
    setNutritionEntryToEdit(entry);
    setView('nutritionForm');
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

  const handleShowSleepForm = (entry = null) => {
    setSleepEntryToEdit(entry);
    setView('sleepForm');
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
          onCancel: () => setView('dashboard'),
          entryToEdit: entryToEdit,
          allEntries: sortedEntries,
          nutrition: nutrition,
          allExerciseNames: allExerciseNames,
          setAllExerciseNames: setAllExerciseNames,
          trainingCycle: trainingCycle,
          plannedToday: nextWorkout,
          cycleDay: cycleDay,
          sleepEntries: sleepEntries
        });
      case 'nutritionForm':
        return h(NutritionLogForm, {
          onSave: handleSaveNutrition,
          onCancel: () => setView('dashboard'),
          entryToEdit: nutritionEntryToEdit,
          nutrition: nutrition,
          allEntries: sortedEntries
        });
      case 'sleepForm':
        return h(LogSleepForm, {
          onSave: handleSaveSleep,
          onCancel: () => setView('dashboard'),
          entryToEdit: sleepEntryToEdit,
          sleepEntries: sleepEntries
        });
      case 'calendar':
        return h('div', { className: 'space-y-4' },
          h(TrainingCalendar, {
            entries: sortedEntries,
            trainingCycle,
            dynamicToday: nextWorkout,
            currentCycleDay: cycleDay,
            onEditCycle: () => setShowCycleEditor(true),
            onSetCycleDay: (date, dayNumber) => {
              // Handle manual cycle day setting
              const entry = {
                id: generateId(),
                date: date,
                manualCycleDay: dayNumber,
                note: `Manually set to Day ${dayNumber} of cycle`
              };
              // You can store this in a separate state or as a marker
              console.log('Set cycle day:', date, dayNumber);
            }
          })
        );
      case 'charts':
        return h(ExerciseProgressChart, { entries: sortedEntries, allExerciseNames, sleepEntries });
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
          maintenanceEstimate: maintenanceEstimate
        });

        case 'recovery':
          return h(RecoveryDashboard, {
            entries: sortedEntries,
            sleepEntries: sleepEntries,
            nutrition: nutrition,
            onShowSleepForm: handleShowSleepForm,
            recoveryStatus: recoveryStatus
          });

      case 'dashboard':
      default:
        const cycleLength = trainingCycle.length;  // ADD THIS LINE at the top of the case
        
        return h('div', { className: 'space-y-6' },
          // Enhanced Header with Planned Workout + Today's Stats
          h('div', { className: 'bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-lg border border-slate-700' },
            h('div', { className: 'mb-4' },
              h('h3', { className: 'text-sm font-semibold text-slate-400 mb-1' }, planTitle),
              h('p', { className: 'text-3xl font-bold text-cyan-400' }, nextWorkout),
              // ADD THESE 2 LINES:
              h('p', { className: 'text-sm text-blue-300 mt-1' }, 
                `Day ${cycleDay + 1} of ${cycleLength} in your ${cycleLength}-day cycle`
              ),
              h('p', { className: 'text-sm text-slate-300 mt-2' }, coachNote)
            ),
            h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-700' },
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Today\'s Macros'),
                h('div', { className: 'flex justify-center gap-3 mt-1' },
                  h('div', {},
                    h('div', { className: 'text-lg font-bold text-green-400 leading-tight' }, `${Number(todaysNutrition.totalProtein).toLocaleString()}g`),
                    h('div', { className: 'text-[10px] text-slate-500' }, 'P')
                  ),
                  h('div', {},
                    h('div', { className: 'text-lg font-bold text-amber-400 leading-tight' }, formatMacro(todaysNutrition.carbsTracked ? todaysNutrition.totalCarbs : null)),
                    h('div', { className: 'text-[10px] text-slate-500' }, 'C')
                  ),
                  h('div', {},
                    h('div', { className: 'text-lg font-bold text-pink-400 leading-tight' }, formatMacro(todaysNutrition.fatTracked ? todaysNutrition.totalFat : null)),
                    h('div', { className: 'text-[10px] text-slate-500' }, 'F')
                  )
                ),
                h('div', { className: 'text-xs mt-1' }, getProteinStatus(todaysNutrition.totalProtein, dietGoals)),
                todaysNutrition.mealCount > 1 && h('div', { className: 'text-xs text-slate-500 mt-1' }, `(${todaysNutrition.mealCount} meals)`)
              ),
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Today\'s Calories'),
                h('div', { className: 'text-2xl font-bold text-orange-400' }, Number(todaysNutrition.totalCalories).toLocaleString()),
                h('div', { className: 'text-xs mt-1 text-slate-400' },
                  `Target: ${todaysCalorieTarget === null ? '—' : todaysCalorieTarget.toLocaleString()} kcal`
                ),
                todaysNutrition.mealCount > 1 && h('div', { className: 'text-xs text-slate-500 mt-1' }, `(${todaysNutrition.mealCount} meals)`)
              ),
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Current Weight'),
                h('div', { className: 'text-2xl font-bold' }, `${getCurrentWeight(sleepEntries)} lbs`)
              ),
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Week Burned'),
                h('div', { className: 'text-2xl font-bold text-red-400' }, weeklyCaloriesBurned.toLocaleString()),
                h('div', { className: 'text-xs mt-1 text-slate-500' }, 'kcal (7 days)')
              )
            )
          ),

          // In the dashboard view, add the SmartRecoveryCard after the plan card:

          h(SmartRecoveryCard, {
            entries: sortedEntries,
            sleepEntries: sleepEntries,
            plannedWorkout: nextWorkout,
            recoveryStatus: recoveryStatus
          }),

          h('div', { className: 'grid grid-cols-3 gap-4' },
            h(Button, {
              onClick: () => handleShowSleepForm(),
              variant: 'primary',
              className: 'text-lg'
            }, '🌙 Log Sleep'),
            h(Button, {
              onClick: () => setShowNutritionModal(true),
              variant: 'primary',
              className: 'text-lg'
            }, '🍽️ Quick Add Meal'),
            h(Button, {
              onClick: () => handleShowForm(null),
              variant: 'primary',
              className: 'text-lg'
            }, '💪 Log Workout')
          ),
          !hasLoggedToday && h(Button, {
            onClick: () => setShowAIModal(true),
            variant: 'primary',
            className: 'w-full text-lg'
          }, '🤖 Get AI Workout Suggestion'),
          h(PRDashboard, { prs: allPRs }),

          // Daily Log (unified view)
          h('h2', { className: 'text-xl font-bold' }, '📅 Daily Log'),
          h('div', { className: 'space-y-4' },
            (() => {
              const dailyData = groupDataByDate(sortedEntries, nutrition, sleepEntries);
              return dailyData.length > 0
                ? dailyData.map(dayData => h(DailyCard, {
                    key: dayData.date,
                    dailyData: dayData,
                    allEntries: sortedEntries,
                    onEditWorkout: handleShowForm,
                    onDeleteWorkout: openDeleteModal,
                    onEditSleep: handleShowSleepForm,
                    onDeleteSleep: handleDeleteSleep,
                    onDeleteMeal: handleDeleteNutrition
                  }))
                : h('p', { className: 'text-slate-400' }, 'No entries yet. Start logging!')
            })()
          )
        );
    }
  };

  return h(ToastProvider, null,
    h(MaintenanceAutoApply, { maintenanceEstimate, dietGoals, setDietGoals }),
    // 💡💡💡 THIS IS THE NAV BAR FIX 💡💡💡
    // The Nav Bar is now *outside* the main scrolling container.
    h('div', { className: 'container mx-auto max-w-2xl p-4 pb-24' },
      h('header', { className: 'text-center my-6' },
        h('h1', { className: 'text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600' }, 'Hypertrophy PWA V 1.0')
      ),
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
        onClose: () => setShowNutritionModal(false),
        onSave: handleSaveNutrition
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
    ), // <-- Main scrolling div closes here
    
    // Bottom Nav Bar is now a sibling to the scrolling div
    h('nav', { className: 'fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-slate-800 border-t border-slate-700 grid grid-cols-6' }, // 👈 Changed from cols-5 to cols-6
      h(NavButton, { icon: '🔥', label: 'Log', active: view === 'dashboard', onClick: () => setView('dashboard') }),
      h(NavButton, { icon: '📅', label: 'Calendar', active: view === 'calendar', onClick: () => setView('calendar') }),
      h('div', { className: 'relative' },
        h('button', {
          className: 'absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-4xl shadow-lg hover:bg-blue-700',
          onClick: () => handleShowForm(null)
        }, '+')
      ),
      // 👇 NEW Recovery tab
      h(NavButton, { icon: '💪', label: 'Recovery', active: view === 'recovery', onClick: () => setView('recovery') }),
      h(NavButton, { icon: '📊', label: 'Charts', active: view === 'charts', onClick: () => setView('charts') }),
      h(NavButton, { icon: '⚙️', label: 'Settings', active: view === 'settings', onClick: () => setView('settings') })
    )
  );
};

// Nav Button Component
const NavButton = ({ icon, label, active, onClick }) => {
  return h('button', {
    onClick,
    className: `flex flex-col items-center justify-center p-2 pt-3 hover:bg-slate-700 ${active ? 'text-blue-400' : 'text-slate-400'}`
  },
    h('span', { className: 'text-2xl' }, icon),
    h('span', { className: 'text-xs' }, label)
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
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(h(App));

