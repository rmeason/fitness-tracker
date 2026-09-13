// recovery.js
// Muscle Fatigue Calculation & Recovery Tracking System
// Processes workout history to calculate real-time muscle recovery status

'use strict';

import { MUSCLES, EXERCISE_LIBRARY, EXERCISE_TIERS, getExerciseData, getCardioMuscles } from './muscles.js';

// ============================================
// CORE FATIGUE CALCULATION
// ============================================

/**
 * RPE -> fatigue weight curve.
 *
 * RPE is the only direct measure we have of proximity to failure, so it is the
 * strongest term in the model. The old curve spanned 0.6 to 1.5 (2.5x) while
 * tonnage swung 10x, which meant equipment scale drowned out effort. This curve
 * spans 0.3 to 2.0 (~6.7x) across the useful range: a set left 4+ reps short is
 * a fraction of a set taken to failure, which is what the hypertrophy and
 * fatigue literature actually describes.
 *
 * RPE 8 is the anchor at 1.0 -- it is also the default for entries with no rpe.
 */
const RPE_CURVE = [
  [6.0, 0.30],   // 4+ RIR -- barely a stimulus
  [7.0, 0.60],   // 3 RIR
  [8.0, 1.00],   // 2 RIR -- reference point
  [8.5, 1.20],   // 1-2 RIR
  [9.0, 1.45],   // 1 RIR
  [9.5, 1.70],   // 0-1 RIR
  [10.0, 2.00]   // failure
];

/**
 * Calculate the RPE fatigue weight, linearly interpolated between curve points.
 * Clamped flat below RPE 6 and above RPE 10.
 *
 * @param {number} rpe - Rate of Perceived Exertion (1-10)
 * @returns {number} Fatigue weight (0.3 - 2.0)
 */
export function getRPEWeight(rpe) {
  const value = Number(rpe);
  if (!Number.isFinite(value)) return 1.0; // unparseable -> treat as the RPE 8 default

  if (value <= RPE_CURVE[0][0]) return RPE_CURVE[0][1];
  const last = RPE_CURVE[RPE_CURVE.length - 1];
  if (value >= last[0]) return last[1];

  for (let i = 1; i < RPE_CURVE.length; i++) {
    const [x0, y0] = RPE_CURVE[i - 1];
    const [x1, y1] = RPE_CURVE[i];
    if (value <= x1) {
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * Calculate sleep quality multiplier
 * Better sleep = less fatigue accumulation
 * Based on user's validated correlation: 20%+ deep = optimal recovery
 * 
 * @param {number} totalSleepHours - Total sleep duration
 * @param {number} deepSleepPercent - Deep sleep percentage
 * @returns {number} Multiplier for fatigue (lower = better recovery)
 */
export function calculateSleepMultiplier(totalSleepHours, deepSleepPercent) {
  // Duration modifier (7-9 hours optimal)
  let durationMod = 1.0;
  if (totalSleepHours < 6) durationMod = 1.2;      // Insufficient sleep
  else if (totalSleepHours < 7) durationMod = 1.1; // Suboptimal
  else if (totalSleepHours > 9) durationMod = 1.05; // Slightly too much
  
  // Deep sleep quality modifier (primary factor based on user's data)
  let qualityMod = 1.0;
  if (deepSleepPercent >= 20) qualityMod = 0.8;      // Excellent (20%+ = -20% fatigue)
  else if (deepSleepPercent >= 15) qualityMod = 0.9; // Target range (-10% fatigue)
  else if (deepSleepPercent >= 12) qualityMod = 1.0; // Baseline (neutral)
  else if (deepSleepPercent >= 8) qualityMod = 1.15; // Poor (+15% fatigue)
  else qualityMod = 1.3;                             // Very poor (+30% fatigue)
  
  return durationMod * qualityMod;
}

/**
 * Calculate sleep-adjusted decay rate
 * Better sleep = faster recovery
 * 
 * @param {number} baseDecayRate - Base decay rate from MUSCLES object
 * @param {number} sleepMultiplier - Sleep quality modifier (from calculateSleepMultiplier)
 * @returns {number} Adjusted decay rate
 */
function getSleepAdjustedDecayRate(baseDecayRate, sleepMultiplier) {
  // Inverse relationship: lower sleep multiplier (better sleep) = higher decay rate (faster recovery)
  // sleepMultiplier range: 0.8 (excellent) to 1.3 (poor)
  // Adjusted decay: 1.44x faster (0.8 sleep) to 0.77x slower (1.3 sleep)
  const adjustmentFactor = 2.0 - sleepMultiplier;
  return baseDecayRate * adjustmentFactor;
}

/**
 * Calculate volume load for an exercise
 * Supports both new format (weights array) and old format (single weight)
 * SUPPORTS eachHand property for dumbbell exercises
 *
 * NOTE: volume load is NO LONGER the fatigue driver -- displayed plate load is
 * not force, and it varies by an order of magnitude between a pendulum squat
 * (carriage, lever arm and bodyweight all invisible) and a cable stack. It now
 * feeds only the RELATIVE loadFactor term, where an exercise is compared
 * against its own history on the same machine and the arbitrary scale cancels.
 *
 * @param {object} exercise - Exercise data from workout log
 * @returns {number} Total volume load in lbs
 */
function calculateVolumeLoad(exercise) {
  const reps = exercise.reps || [];
  const weightMultiplier = exercise.eachHand ? 2 : 1; // Double weight if using each hand

  // New format: array of weights per set
  if (Array.isArray(exercise.weights)) {
    let totalVolume = 0;
    for (let i = 0; i < reps.length; i++) {
      const weight = Number(exercise.weights[i]) || 0;
      const rep = Number(reps[i]) || 0;
      totalVolume += (weight * weightMultiplier) * rep;
    }
    return totalVolume;
  }

  // Old format: single weight for all sets
  const weight = Number(exercise.weight) || 0;
  const totalReps = reps.reduce((sum, r) => sum + (Number(r) || 0), 0);
  return (weight * weightMultiplier) * totalReps;
}

/**
 * Count the hard sets actually performed.
 * Prefers the reps array (a set logged with 0 reps was not performed), and
 * falls back to the stored set count for older entries with no reps array.
 *
 * @param {object} exercise - Exercise from workout log
 * @returns {number} Number of working sets
 */
function countEffectiveSets(exercise) {
  const reps = Array.isArray(exercise.reps) ? exercise.reps : null;

  if (reps) {
    const performed = reps.filter(r => (Number(r) || 0) > 0).length;
    if (performed > 0) return performed;
  }

  return Math.max(0, Number(exercise.sets) || 0);
}

/**
 * Median of a numeric array. Returns 0 for an empty array.
 * @param {Array<number>} values
 * @returns {number}
 */
function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * How many prior sessions of the same exercise the loadFactor median looks back
 * over. Short enough to track progressive overload, long enough that one heavy
 * or one deload session does not become "normal".
 */
const LOAD_FACTOR_WINDOW = 6;

/** loadFactor is clamped so a scale quirk can never dominate the model. */
const LOAD_FACTOR_MIN = 0.75;
const LOAD_FACTOR_MAX = 1.30;

/**
 * Relative load term: is this session heavier than usual FOR THIS EXERCISE?
 *
 * Comparing an exercise against its own trailing median on the same machine
 * cancels the equipment's arbitrary scale -- a pendulum squat's 620 "lbs" and a
 * cable stack's 4,433 "lbs" both become ~1.0 on a normal day -- while genuinely
 * going heavier than usual still raises fatigue.
 *
 * Defaults to exactly 1.0 when there is not enough history to have an opinion.
 *
 * @param {number} volumePerSet - This session's volume load / effective sets
 * @param {Array<number>} priorVolumePerSet - Prior sessions' volume-per-set, same exercise name
 * @returns {number} Clamped ratio in [0.75, 1.30]
 */
function getLoadFactor(volumePerSet, priorVolumePerSet) {
  if (!Array.isArray(priorVolumePerSet) || priorVolumePerSet.length < 2) return 1.0;
  if (!(volumePerSet > 0)) return 1.0; // bodyweight / unweighted: no load signal, not a penalty

  const baseline = median(priorVolumePerSet.slice(-LOAD_FACTOR_WINDOW));
  if (!(baseline > 0)) return 1.0;

  const ratio = volumePerSet / baseline;
  return Math.min(LOAD_FACTOR_MAX, Math.max(LOAD_FACTOR_MIN, ratio));
}

/**
 * Resolve a workout's timestamp.
 * Uses loggedAt (exact save time) if available; falls back to noon on the date
 * string to avoid midnight-UTC phantom recovery (date-only parses as 12:00am,
 * adding up to 23h of fake recovery).
 *
 * @param {object} workout - Workout entry
 * @returns {Date}
 */
function getWorkoutDate(workout) {
  if (workout.loggedAt) return new Date(workout.loggedAt);
  const d = new Date(workout.date);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Build the per-exercise load history that loadFactor compares against.
 *
 * Built from the FULL entry list, not just the recovery lookback window -- the
 * baseline is "what he normally does on this machine", which needs more than a
 * week of history. Threaded into calculateMuscleFatigue explicitly so the
 * fatigue calculation stays a pure function of its arguments.
 *
 * @param {Array} workoutEntries - All workout entries
 * @returns {Object<string, Array<{time: number, volumePerSet: number}>>} Keyed by exercise name, oldest first
 */
export function buildExerciseHistory(workoutEntries) {
  const history = {};

  for (const entry of workoutEntries || []) {
    if (!entry || !Array.isArray(entry.exercises)) continue;
    const time = getWorkoutDate(entry).getTime();
    if (!Number.isFinite(time)) continue;

    for (const exercise of entry.exercises) {
      if (!exercise || !exercise.name) continue;
      const sets = countEffectiveSets(exercise);
      if (sets <= 0) continue;
      const volume = calculateVolumeLoad(exercise);
      if (volume <= 0) continue;

      if (!history[exercise.name]) history[exercise.name] = [];
      history[exercise.name].push({ time, volumePerSet: volume / sets });
    }
  }

  for (const list of Object.values(history)) {
    list.sort((a, b) => a.time - b.time);
  }

  return history;
}

/**
 * Pull the prior-session volume-per-set values for one exercise.
 * Strictly before the given time, so the session being scored never compares
 * against itself.
 *
 * @param {object} exerciseHistory - Output of buildExerciseHistory
 * @param {string} exerciseName
 * @param {number} beforeTime - Timestamp (ms) of the session being scored
 * @returns {Array<number>} Trailing volume-per-set values, oldest first
 */
function getPriorVolumePerSet(exerciseHistory, exerciseName, beforeTime) {
  const list = (exerciseHistory && exerciseHistory[exerciseName]) || [];
  return list
    .filter(record => record.time < beforeTime)
    .map(record => record.volumePerSet)
    .slice(-LOAD_FACTOR_WINDOW);
}

/**
 * Calculate fatigue contribution for a single exercise.
 *
 * Core formula (per muscle):
 *   effectiveSets x rpeWeight x (activation/100) x tier x loadFactor
 *   x 0.7 if secondary, x lengthening, x sleep
 *
 * The driver is HARD SETS AT AN RPE, not tonnage. Tonnage survives only inside
 * loadFactor, as a ratio against this same exercise's own history, so the
 * equipment's arbitrary scale cancels out. Result is in "fatigue points"
 * compared against BASELINE_FATIGUE in processWorkoutHistory.
 *
 * @param {object} exercise - Exercise from workout log
 * @param {number} sleepMultiplier - Sleep quality modifier (from calculateSleepMultiplier)
 * @param {Array<number>} priorVolumePerSet - Prior volume-per-set for this exercise name (see getPriorVolumePerSet)
 * @returns {object} Fatigue contributions by muscle { muscleName: fatiguePoints, ... }
 */
export function calculateMuscleFatigue(exercise, sleepMultiplier = 1.0, priorVolumePerSet = []) {
  // Get exercise data from library
  const exerciseData = getExerciseData(exercise.name, exercise.variant);

  if (!exerciseData) {
    console.warn(`Exercise not found in library: ${exercise.name}`);
    return {};
  }

  // Hard sets are the driver. No sets performed = no fatigue.
  const effectiveSets = countEffectiveSets(exercise);
  if (effectiveSets === 0) return {};

  // Get multipliers
  const rpeWeight = getRPEWeight(exercise.rpe || 8); // missing rpe still defaults to 8
  const tierMultiplier = EXERCISE_TIERS[exerciseData.tier]?.multiplier || 1.0;

  // Relative load: this session vs this exercise's own trailing median
  const volumePerSet = calculateVolumeLoad(exercise) / effectiveSets;
  const loadFactor = getLoadFactor(volumePerSet, priorVolumePerSet);

  // Lengthened partial bonus
  const lengtheningMultiplier = (exercise.isLengtheningPartial && exerciseData.lengtheningPartials)
    ? exerciseData.lengtheningMultiplier
    : 1.0;

  // Everything except activation and the secondary discount
  const setFatigue = effectiveSets * rpeWeight * tierMultiplier * loadFactor;

  // Calculate fatigue for each muscle
  const muscleFatigue = {};

  // Process primary muscles (>50% activation)
  for (const [muscleName, activationPercent] of Object.entries(exerciseData.primaryMuscles)) {
    const baseFatigue = setFatigue * (activationPercent / 100);
    const actualFatigue = baseFatigue * lengtheningMultiplier * sleepMultiplier;
    muscleFatigue[muscleName] = actualFatigue;
  }

  // Process secondary muscles (20-50% activation) - less fatigue accumulation
  for (const [muscleName, activationPercent] of Object.entries(exerciseData.secondaryMuscles)) {
    const baseFatigue = setFatigue * (activationPercent / 100) * 0.7; // 30% reduction for secondary
    const actualFatigue = baseFatigue * lengtheningMultiplier * sleepMultiplier;

    // Accumulate if muscle already has fatigue from primary role
    if (muscleFatigue[muscleName]) {
      muscleFatigue[muscleName] += actualFatigue;
    } else {
      muscleFatigue[muscleName] = actualFatigue;
    }
  }

  return muscleFatigue;
}

/**
 * Per-10-minute discount applied to steady-state cardio.
 *
 * Ten minutes on a step mill is materially less fatiguing than a hard working
 * set: sub-maximal contractions, no eccentric overload, no proximity to
 * failure. Calibrated by replay so a 15-minute Stairmaster after legs nudges
 * quads and calves rather than dominating them.
 */
export const CARDIO_TIER = 0.5;

/** Cardio effort default when `effort` is missing -- moderate, the cardio
 *  analogue of the exercise rpe default of 8. */
const DEFAULT_CARDIO_EFFORT = 7;

/**
 * Calculate fatigue contribution for a single cardio item.
 *
 *   cardioFatigue = (minutes / 10) x rpeWeight(effort) x (activation/100) x CARDIO_TIER
 *
 * MISSING IS NOT ZERO: a cardio item with null/missing `minutes` contributes
 * NOTHING and is skipped -- it is never treated as 0 minutes, and never throws.
 * A machine that is not in CARDIO_LIBRARY is skipped silently; there is no
 * fuzzy name matching, so free text like "Dance/Walk" resolves to nothing
 * rather than being guessed at.
 *
 * `timing` (e.g. "after lifting") is deliberately ignored. An after-lifting
 * multiplier is plausible but there is no evidence base to set the number from,
 * so it stays out rather than being guessed.
 *
 * @param {object} cardioItem - Cardio item from workout log { name, minutes, effort, ... }
 * @param {number} sleepMultiplier - Sleep quality modifier, applied as for exercises
 * @returns {object} Fatigue contributions by muscle { muscleName: fatiguePoints, ... }
 */
export function calculateCardioFatigue(cardioItem, sleepMultiplier = 1.0) {
  if (!cardioItem || !cardioItem.name) return {};

  const muscles = getCardioMuscles(cardioItem.name);
  if (!muscles || Object.keys(muscles).length === 0) return {}; // unrecognised machine

  // Missing minutes is not zero minutes -- it is an unknown, and contributes nothing.
  if (cardioItem.minutes === null || cardioItem.minutes === undefined || cardioItem.minutes === '') return {};
  const minutes = Number(cardioItem.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return {};

  const effort = (cardioItem.effort === null || cardioItem.effort === undefined || cardioItem.effort === '')
    ? DEFAULT_CARDIO_EFFORT
    : cardioItem.effort;
  const rpeWeight = getRPEWeight(effort);

  const durationUnits = minutes / 10;
  const muscleFatigue = {};

  for (const [muscleName, activationPercent] of Object.entries(muscles)) {
    muscleFatigue[muscleName] =
      durationUnits * rpeWeight * (activationPercent / 100) * CARDIO_TIER * sleepMultiplier;
  }

  return muscleFatigue;
}

// ============================================
// RECOVERY TRACKING
// ============================================

/**
 * Calculate current fatigue level after time has passed
 * Uses exponential decay: fatigue(t) = initial × e^(-decayRate × t / 100)
 * Now includes sleep-adjusted decay rates for personalized recovery
 * 
 * @param {number} initialFatigue - Fatigue points at time of workout
 * @param {object} muscle - Muscle data from MUSCLES object
 * @param {number} hoursElapsed - Hours since workout
 * @param {number} sleepMultiplier - Sleep quality for recovery period (default 1.0)
 * @returns {number} Current fatigue points (0-100+ scale)
 */
export function calculateCurrentFatigue(initialFatigue, muscle, hoursElapsed, sleepMultiplier = 1.0) {
  if (initialFatigue <= 0 || hoursElapsed < 0) return 0;
  
  // Adjust decay rate based on sleep quality
  const adjustedDecayRate = getSleepAdjustedDecayRate(muscle.decayRate, sleepMultiplier);
  
  // Exponential decay formula
  // decayRate is % per hour, divide by 100 to get proper constant
  const currentFatigue = initialFatigue * Math.exp(-adjustedDecayRate * hoursElapsed / 100);
  
  // Return 0 if essentially recovered (< 1% of initial)
  return currentFatigue < (initialFatigue * 0.01) ? 0 : currentFatigue;
}

/**
 * Get recovery color coding for UI
 * Red = fatigued, Yellow = recovering, Green = ready
 * 
 * @param {number} fatiguePercent - Current fatigue as % of baseline (0-100+)
 * @returns {string} Color code: 'red', 'yellow', 'green'
 */
export function getRecoveryColor(fatiguePercent) {
  if (fatiguePercent >= 70) return 'red';      // Highly fatigued
  if (fatiguePercent >= 40) return 'yellow';   // Recovering
  return 'green';                              // Ready to train
}

/**
 * Get human-readable recovery status
 * @param {number} fatiguePercent - Current fatigue as % of baseline
 * @returns {object} { status: string, emoji: string, description: string }
 */
export function getRecoveryStatus(fatiguePercent) {
  if (fatiguePercent >= 90) {
    return {
      status: 'SEVERELY_FATIGUED',
      emoji: '🔴',
      description: 'Severely fatigued - avoid training this muscle'
    };
  }
  if (fatiguePercent >= 70) {
    return {
      status: 'FATIGUED',
      emoji: '🟠',
      description: 'Fatigued - reduce volume or take rest day'
    };
  }
  if (fatiguePercent >= 50) {
    return {
      status: 'RECOVERING',
      emoji: '🟡',
      description: 'Recovering - light work acceptable'
    };
  }
  if (fatiguePercent >= 30) {
    return {
      status: 'GOOD',
      emoji: '🟢',
      description: 'Good to train - moderate volume'
    };
  }
  if (fatiguePercent >= 15) {
    return {
      status: 'FRESH',
      emoji: '✅',
      description: 'Fresh - ready for high volume'
    };
  }
  return {
    status: 'FULLY_RECOVERED',
    emoji: '💪',
    description: 'Fully recovered - optimal for PRs'
  };
}

// ============================================
// WORKOUT HISTORY PROCESSING
// ============================================

/**
 * Per-muscle fatigue points that read as 100%.
 *
 * This is a PER-MUSCLE denominator, not a whole-session one. Under the old
 * tonnage-driven model it was 88, a whole-session quantity, which meant a
 * single muscle needed more volume load on one exercise than the user's entire
 * session produced before it could read 100% -- quads never got above ~43% in
 * four years of logs.
 *
 * Replayed across the full export, peak single-session per-muscle points under
 * the sets x RPE model run from ~3.5 (gastrocnemius) to ~24 (mid traps) with a
 * median near 6.6. Calibrated by replaying the 2026-09-12 Legs/Core session:
 * 9.3 puts vastus lateralis at 88% at session end, 51% 24h later, and 17%
 * after two full rest days -- the targets for a hard, directly-targeted
 * session. getRecoveryColor / getRecoveryStatus thresholds are unchanged --
 * the point of the recalibration is to make the percentages mean what those
 * thresholds already assume.
 */
export const BASELINE_FATIGUE = 9.3;

/**
 * Process workout history to calculate current recovery status
 * Analyzes last 7 days of training and applies time-based decay
 * Now includes sleep-adjusted recovery rates for personalized tracking
 * 
 * Strength work and cardio both feed fatigue: cardio used to be invisible, so a
 * 15-minute Stairmaster after a leg session contributed nothing at all.
 *
 * @param {Array} workoutEntries - Workout entries (sorted oldest to newest)
 * @param {Array} sleepEntries - Sleep entries (sorted oldest to newest)  
 * @param {Date} currentDate - Current date/time (default: now)
 * @param {number} lookbackDays - Days to analyze (default: 7)
 * @returns {object} Recovery status for all muscles
 */
export function processWorkoutHistory(workoutEntries, sleepEntries, currentDate = new Date(), lookbackDays = 10) {
  // Initialize recovery state for all muscles
  const muscleRecovery = {};
  
  for (const [muscleName, muscleData] of Object.entries(MUSCLES)) {
    muscleRecovery[muscleName] = {
      name: muscleData.name,
      totalFatigue: 0,
      fatigueHistory: [],  // Array of { date, fatigue, hoursAgo }
      currentFatiguePercent: 0,
      recoveryStatus: null,
      color: 'green',
      lastTrained: null
    };
  }
  
  // Per-exercise load history for the relative loadFactor term. Built from the
  // FULL entry list (not just the lookback window) so the baseline is "what he
  // normally does on this machine", and threaded through explicitly below.
  const exerciseHistory = buildExerciseHistory(workoutEntries);
  
  // Get date range
  const cutoffDate = new Date(currentDate);
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  
  // Filter to recent workouts
  const recentWorkouts = workoutEntries.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate >= cutoffDate && entryDate <= currentDate;
  });
  
  if (recentWorkouts.length === 0) {
    // No recent workouts - all muscles fully recovered
    for (const muscleName of Object.keys(muscleRecovery)) {
      muscleRecovery[muscleName].recoveryStatus = getRecoveryStatus(0);
    }
    return muscleRecovery;
  }
  
  // Process each workout
  for (const workout of recentWorkouts) {
    if (workout.trainingType === 'REST') continue;
    
    const hasExercises = Array.isArray(workout.exercises) && workout.exercises.length > 0;
    const hasCardio = Array.isArray(workout.cardio) && workout.cardio.length > 0;
    if (!hasExercises && !hasCardio) continue;
    
    // Use loggedAt (exact save time) if available; fall back to noon on the date string
    // to avoid midnight-UTC phantom recovery (date-only parses as 12:00am, adding up to 23h of fake recovery)
    const workoutDate = getWorkoutDate(workout);
    const hoursAgo = (currentDate - workoutDate) / (1000 * 60 * 60);
    
    // Get sleep data for this workout (from night before)
    // For fatigue accumulation during workout
    const workoutSleep = sleepEntries.find(s => s.date === workout.date);
    const workoutSleepMultiplier = workoutSleep
      ? calculateSleepMultiplier(workoutSleep.sleepHours, workoutSleep.deepSleepPercent)
      : 1.0;
    
    // Get average sleep quality for recovery period (all sleep since workout)
    const sleepsSinceWorkout = sleepEntries.filter(s => {
      const sleepDate = new Date(s.date);
      return sleepDate >= workoutDate && sleepDate <= currentDate;
    });
    
    let avgRecoverySleepMultiplier = 1.0;
    if (sleepsSinceWorkout.length > 0) {
      const avgSleepHours = sleepsSinceWorkout.reduce((sum, s) => sum + (s.sleepHours || 8), 0) / sleepsSinceWorkout.length;
      const avgDeepSleep = sleepsSinceWorkout.reduce((sum, s) => sum + (s.deepSleepPercent || 15), 0) / sleepsSinceWorkout.length;
      avgRecoverySleepMultiplier = calculateSleepMultiplier(avgSleepHours, avgDeepSleep);
    }
    
    // Decay each muscle's contribution and fold it into the running total.
    // Shared by the strength and cardio paths so both are tracked identically.
    const accumulate = (muscleFatigue, sourceName) => {
      for (const [muscleName, initialFatigue] of Object.entries(muscleFatigue)) {
        if (!muscleRecovery[muscleName]) continue; // Skip if muscle not in our database
        
        const muscle = MUSCLES[muscleName];
        
        // Calculate current fatigue after decay (with sleep-adjusted recovery)
        const currentFatigue = calculateCurrentFatigue(initialFatigue, muscle, hoursAgo, avgRecoverySleepMultiplier);
        
        // Accumulate total current fatigue
        muscleRecovery[muscleName].totalFatigue += currentFatigue;
        
        // Track fatigue history
        muscleRecovery[muscleName].fatigueHistory.push({
          date: workout.date,
          exercise: sourceName,
          initialFatigue: initialFatigue,
          currentFatigue: currentFatigue,
          hoursAgo: hoursAgo.toFixed(1)
        });
        
        // Update last trained date
        if (!muscleRecovery[muscleName].lastTrained || workoutDate > new Date(muscleRecovery[muscleName].lastTrained)) {
          muscleRecovery[muscleName].lastTrained = workout.date;
        }
      }
    };
    
    // Process each exercise in the workout
    if (hasExercises) {
      for (const exercise of workout.exercises) {
        if (!exercise || !exercise.name) continue;
        const priorVolumePerSet = getPriorVolumePerSet(exerciseHistory, exercise.name, workoutDate.getTime());
        accumulate(calculateMuscleFatigue(exercise, workoutSleepMultiplier, priorVolumePerSet), exercise.name);
      }
    }
    
    // Process cardio. Unrecognised machines and items with no logged minutes
    // return {} and so contribute nothing -- missing is not zero.
    if (hasCardio) {
      for (const cardioItem of workout.cardio) {
        if (!cardioItem || !cardioItem.name) continue;
        accumulate(calculateCardioFatigue(cardioItem, workoutSleepMultiplier), cardioItem.name);
      }
    }
  }
  
  // Calculate final recovery percentages and status
  // BASELINE_FATIGUE is a PER-MUSCLE denominator -- see the constant's comment.
  for (const [muscleName, recovery] of Object.entries(muscleRecovery)) {
    const fatiguePercent = (recovery.totalFatigue / BASELINE_FATIGUE) * 100;
    recovery.currentFatiguePercent = Math.round(fatiguePercent * 10) / 10; // Round to 1 decimal
    recovery.recoveryStatus = getRecoveryStatus(fatiguePercent);
    recovery.color = getRecoveryColor(fatiguePercent);
  }
  
  return muscleRecovery;
}

// ============================================
// TRAINING RECOMMENDATIONS
// ============================================

/**
 * Get smart training recommendations based on recovery status
 * Considers both muscle fatigue and sleep quality
 * 
 * @param {object} recoveryStatus - Output from processWorkoutHistory
 * @param {object} todaysSleep - Today's sleep data { sleepHours, deepSleepPercent }
 * @param {string} plannedWorkout - Planned training type (e.g., "Push/Biceps")
 * @returns {object} Recommendations for today's training
 */
export function getTrainingRecommendation(recoveryStatus, todaysSleep, plannedWorkout) {
  const sleepMultiplier = calculateSleepMultiplier(
    todaysSleep.sleepHours || 8,
    todaysSleep.deepSleepPercent || 15
  );
  
  // Get muscles involved in planned workout.
  // Keyword -> muscle table. Every training type in the log has to hit at least
  // one row, or the recommendation silently runs on zero fatigue input: "Upper"
  // was the second most-used split in the log and matched nothing at all, so
  // those sessions were advised on sleep alone.
  const WORKOUT_MUSCLE_MAP = [
    [['push', 'chest', 'bench', 'press'], ['pectoralsUpper', 'pectoralsLower', 'deltsFront', 'tricepsLong', 'tricepsLateral']],
    [['pull', 'back', 'row', 'lat'],      ['latsUpper', 'latsLower', 'trapsMid', 'trapsLower', 'rhomboids']],
    [['biceps', 'arm', 'curl'],           ['bicepsLong', 'bicepsShort', 'brachialis']],
    [['triceps', 'arm'],                  ['tricepsLong', 'tricepsLateral']],
    [['legs', 'squat', 'quad'],           ['vastusLateralis', 'vastusMedialis', 'rectusFemoris', 'glutesUpper', 'glutesLower', 'bicepsFemoris', 'semitendinosus']],
    [['shoulder', 'delt'],                ['deltsFront', 'deltsMid', 'deltsRear']],
    [['core', 'abs'],                     ['rectusAbdominis', 'obliqueExternal', 'obliqueInternal']],
    [['calf', 'calves'],                  ['gastrocnemius', 'soleus']],
    [['glute', 'hip'],                    ['glutesUpper', 'glutesLower', 'gluteMed']],
    // Whole-body upper splits: everything the pushing and pulling rows cover.
    [['upper'], ['pectoralsUpper', 'pectoralsLower', 'deltsFront', 'deltsMid', 'deltsRear',
                 'latsUpper', 'latsLower', 'trapsMid', 'rhomboids',
                 'tricepsLong', 'tricepsLateral', 'bicepsLong', 'bicepsShort']],
    // Cardio and active-recovery days still load the legs and calves.
    [['cardio', 'recovery', 'walk', 'run', 'stair'], ['vastusLateralis', 'glutesUpper', 'gastrocnemius', 'soleus']]
  ];
  
  const workoutLower = String(plannedWorkout || '').toLowerCase();
  const involvedSet = new Set();
  for (const [keywords, muscles] of WORKOUT_MUSCLE_MAP) {
    if (keywords.some(k => workoutLower.includes(k))) {
      for (const m of muscles) involvedSet.add(m);
    }
  }
  // De-duplicated: a name like "Push/Arms" used to add the triceps twice and
  // drag the average toward them.
  const involvedMuscles = [...involvedSet];
  
  // Calculate average fatigue for involved muscles
  let totalFatigue = 0;
  let maxFatigue = 0;
  let mostFatiguedMuscle = null;
  
  for (const muscleName of involvedMuscles) {
    const muscle = recoveryStatus[muscleName];
    if (muscle) {
      totalFatigue += muscle.currentFatiguePercent;
      if (muscle.currentFatiguePercent > maxFatigue) {
        maxFatigue = muscle.currentFatiguePercent;
        mostFatiguedMuscle = muscle.name;
      }
    }
  }
  
  const avgFatigue = involvedMuscles.length > 0 ? totalFatigue / involvedMuscles.length : 0;
  
  // Generate recommendation
  let recommendation = {
    proceed: true,
    volumeAdjustment: 1.0,
    intensityNote: '',
    reasoning: '',
    sleepImpact: '',
    fatigueWarning: ''
  };
  
  // Sleep impact
  if (sleepMultiplier <= 0.85) {
    recommendation.sleepImpact = `💪 Excellent sleep (${todaysSleep.deepSleepPercent}%)! Optimal for high volume.`;
    recommendation.volumeAdjustment = 1.1;
  } else if (sleepMultiplier >= 1.2) {
    recommendation.sleepImpact = `⚠️ Poor sleep (${todaysSleep.deepSleepPercent}%). Consider deload or rest.`;
    recommendation.volumeAdjustment = 0.75;
  }
  
  // Fatigue impact.
  // maxFatigue (the single worst muscle about to be re-trained) is the primary
  // signal -- avgFatigue can only ever be <= maxFatigue, so it exists to catch
  // widespread moderate fatigue that isn't concentrated in one muscle, not to
  // override a real peak. Every branch below produces a message: the old
  // ladder had a 20-70% max / 20-50% avg gap that fell through silently,
  // which the UI renders as no warning box at all (see app.js) -- indistinguishable
  // from "checked and fine". A muscle sitting at 68% RECOVERING on its own card
  // should never pair with an empty fatigue section here.
  if (maxFatigue >= 90) {
    recommendation.proceed = false;
    recommendation.fatigueWarning = `🔴 ${mostFatiguedMuscle} severely fatigued (${maxFatigue.toFixed(0)}%). REST DAY RECOMMENDED.`;
    recommendation.volumeAdjustment = 0;
  } else if (maxFatigue >= 60) {
    recommendation.fatigueWarning = `🟠 ${mostFatiguedMuscle} fatigued (${maxFatigue.toFixed(0)}%). Reduce volume by 30-40%.`;
    recommendation.volumeAdjustment *= 0.65;
  } else if (avgFatigue >= 50) {
    recommendation.fatigueWarning = `🟡 Widespread fatigue (avg ${avgFatigue.toFixed(0)}%). Reduce volume by 15-20%.`;
    recommendation.volumeAdjustment *= 0.85;
  } else if (maxFatigue >= 50) {
    recommendation.fatigueWarning = `🟡 ${mostFatiguedMuscle} still recovering (${maxFatigue.toFixed(0)}%). Trim volume ~10%.`;
    recommendation.volumeAdjustment *= 0.90;
  } else if (avgFatigue < 20) {
    recommendation.fatigueWarning = `✅ Muscles fresh (avg ${avgFatigue.toFixed(0)}%). Ready for progressive overload!`;
  } else {
    recommendation.fatigueWarning = `🔵 Some residual fatigue (avg ${avgFatigue.toFixed(0)}%, peak ${maxFatigue.toFixed(0)}% in ${mostFatiguedMuscle}). Proceed as planned.`;
  }
  
  // Suggested working sets based on sleep and fatigue
  let baselineSets = 18;
  if (todaysSleep.deepSleepPercent >= 20) baselineSets = 22;
  else if (todaysSleep.deepSleepPercent >= 15) baselineSets = 20;
  else if (todaysSleep.deepSleepPercent < 12) baselineSets = 14;
  
  const suggestedSets = Math.round(baselineSets * recommendation.volumeAdjustment);
  
  recommendation.suggestedSets = suggestedSets;
  recommendation.reasoning = `Baseline: ${baselineSets} sets (sleep-based). Adjusted to ${suggestedSets} sets (fatigue × ${recommendation.volumeAdjustment.toFixed(2)}).`;
  
  return recommendation;
}

// ============================================
// EXPORT ALL
// ============================================

export default {
  BASELINE_FATIGUE,
  CARDIO_TIER,
  getRPEWeight,
  calculateSleepMultiplier,
  buildExerciseHistory,
  calculateMuscleFatigue,
  calculateCardioFatigue,
  calculateCurrentFatigue,
  getRecoveryColor,
  getRecoveryStatus,
  processWorkoutHistory,
  getTrainingRecommendation
};