// recovery.js
// Muscle Fatigue Calculation & Recovery Tracking System
// Processes workout history to calculate real-time muscle recovery status

'use strict';

import { MUSCLES, EXERCISE_LIBRARY, EXERCISE_TIERS, getExerciseData } from './muscles.js';

// ============================================
// CORE FATIGUE CALCULATION
// ============================================

/**
 * Calculate RPE-based intensity multiplier
 * Higher RPE = more fatigue accumulation
 * @param {number} rpe - Rate of Perceived Exertion (1-10)
 * @returns {number} Multiplier for fatigue calculation
 */
function getRPEMultiplier(rpe) {
  if (rpe >= 10) return 1.5;      // Max effort / failure
  if (rpe >= 9) return 1.3;       // 1 RIR or less
  if (rpe >= 8) return 1.2;       // 2 RIR
  if (rpe >= 7) return 1.0;       // 3 RIR (baseline)
  if (rpe >= 6) return 0.8;       // 4 RIR
  return 0.6;                      // 5+ RIR (very easy)
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
 * 
 * @param {object} exercise - Exercise data from workout log
 * @returns {number} Total volume load in lbs
 */
function calculateVolumeLoad(exercise) {
  const reps = exercise.reps || [];
  
  // New format: array of weights per set
  if (Array.isArray(exercise.weights)) {
    let totalVolume = 0;
    for (let i = 0; i < reps.length; i++) {
      const weight = Number(exercise.weights[i]) || 0;
      const rep = Number(reps[i]) || 0;
      totalVolume += weight * rep;
    }
    return totalVolume;
  }
  
  // Old format: single weight for all sets
  const weight = Number(exercise.weight) || 0;
  const totalReps = reps.reduce((sum, r) => sum + (Number(r) || 0), 0);
  return weight * totalReps;
}

/**
 * Calculate fatigue contribution for a single exercise
 * Core formula: (volumeLoad / 500) × activation% × RPE × tier × lengthening × sleep
 * NORMALIZED TO 0-100 SCALE for meaningful baseline comparison
 * 
 * @param {object} exercise - Exercise from workout log
 * @param {number} sleepMultiplier - Sleep quality modifier (from calculateSleepMultiplier)
 * @returns {object} Fatigue contributions by muscle { muscleName: fatiguePoints, ... }
 */
export function calculateMuscleFatigue(exercise, sleepMultiplier = 1.0) {
  // Get exercise data from library
  const exerciseData = getExerciseData(exercise.name, exercise.variant);
  
  if (!exerciseData) {
    console.warn(`Exercise not found in library: ${exercise.name}`);
    return {};
  }
  
  // Calculate base volume load
  const rawVolumeLoad = calculateVolumeLoad(exercise);
  
  if (rawVolumeLoad === 0) return {}; // No volume = no fatigue
  
  // NORMALIZE VOLUME LOAD TO 0-100 SCALE
  // Dividing by 500 makes typical workout volumes (15,000-30,000 lbs) 
  // result in 30-60 base points before multipliers
  const volumeLoad = rawVolumeLoad / 175;
  
  // Get multipliers
  const rpeMultiplier = getRPEMultiplier(exercise.rpe || 8);
  const tierMultiplier = EXERCISE_TIERS[exerciseData.tier]?.multiplier || 1.0;
  
  // Lengthened partial bonus
  const lengtheningMultiplier = (exercise.isLengtheningPartial && exerciseData.lengtheningPartials)
    ? exerciseData.lengtheningMultiplier
    : 1.0;
  
  // Calculate fatigue for each muscle
  const muscleFatigue = {};
  
  // Process primary muscles (>50% activation)
  for (const [muscleName, activationPercent] of Object.entries(exerciseData.primaryMuscles)) {
    const baseFatigue = volumeLoad * (activationPercent / 100) * rpeMultiplier * tierMultiplier;
    const actualFatigue = baseFatigue * lengtheningMultiplier * sleepMultiplier;
    muscleFatigue[muscleName] = actualFatigue;
  }
  
  // Process secondary muscles (20-50% activation) - less fatigue accumulation
  for (const [muscleName, activationPercent] of Object.entries(exerciseData.secondaryMuscles)) {
    const baseFatigue = volumeLoad * (activationPercent / 100) * rpeMultiplier * tierMultiplier * 0.7; // 30% reduction for secondary
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
 * Process workout history to calculate current recovery status
 * Analyzes last 7 days of training and applies time-based decay
 * Now includes sleep-adjusted recovery rates for personalized tracking
 * 
 * @param {Array} workoutEntries - Workout entries (sorted oldest to newest)
 * @param {Array} sleepEntries - Sleep entries (sorted oldest to newest)  
 * @param {Date} currentDate - Current date/time (default: now)
 * @param {number} lookbackDays - Days to analyze (default: 7)
 * @returns {object} Recovery status for all muscles
 */
export function processWorkoutHistory(workoutEntries, sleepEntries, currentDate = new Date(), lookbackDays = 7) {
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
    if (workout.trainingType === 'REST' || !workout.exercises) continue;
    
    const workoutDate = new Date(workout.date);
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
    
    // Process each exercise in the workout
    for (const exercise of workout.exercises) {
      const muscleFatigue = calculateMuscleFatigue(exercise, workoutSleepMultiplier);
      
      // Add fatigue to each affected muscle
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
          exercise: exercise.name,
          initialFatigue: initialFatigue,
          currentFatigue: currentFatigue,
          hoursAgo: hoursAgo.toFixed(1)
        });
        
        // Update last trained date
        if (!muscleRecovery[muscleName].lastTrained || workoutDate > new Date(muscleRecovery[muscleName].lastTrained)) {
          muscleRecovery[muscleName].lastTrained = workout.date;
        }
      }
    }
  }
  
  // Calculate final recovery percentages and status
  // Baseline fatigue for comparison: 100 points = moderate single workout worth
  const BASELINE_FATIGUE = 100;
  
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
  
  // Get muscles involved in planned workout
  const involvedMuscles = [];
  const workoutLower = plannedWorkout.toLowerCase();
  
  // Map workout type to muscle groups
  if (workoutLower.includes('push') || workoutLower.includes('chest')) {
    involvedMuscles.push('pectoralsUpper', 'pectoralsLower', 'deltsFront', 'tricepsLong', 'tricepsLateral');
  }
  if (workoutLower.includes('pull') || workoutLower.includes('back')) {
    involvedMuscles.push('latsUpper', 'latsLower', 'trapsMid', 'rhomboids');
  }
  if (workoutLower.includes('biceps') || workoutLower.includes('arm')) {
    involvedMuscles.push('bicepsLong', 'bicepsShort', 'brachialis');
  }
  if (workoutLower.includes('triceps') || workoutLower.includes('arm')) {
    involvedMuscles.push('tricepsLong', 'tricepsLateral');
  }
  if (workoutLower.includes('legs') || workoutLower.includes('squat')) {
    involvedMuscles.push('vastusLateralis', 'vastusMedialis', 'rectusFemoris', 'glutesUpper', 'glutesLower');
  }
  if (workoutLower.includes('shoulder')) {
    involvedMuscles.push('deltsFront', 'deltsMid', 'deltsRear');
  }
  
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
  
  // Fatigue impact
  if (maxFatigue >= 90) {
    recommendation.proceed = false;
    recommendation.fatigueWarning = `🔴 ${mostFatiguedMuscle} severely fatigued (${maxFatigue.toFixed(0)}%). REST DAY RECOMMENDED.`;
    recommendation.volumeAdjustment = 0;
  } else if (maxFatigue >= 70) {
    recommendation.fatigueWarning = `🟠 ${mostFatiguedMuscle} fatigued (${maxFatigue.toFixed(0)}%). Reduce volume by 30-40%.`;
    recommendation.volumeAdjustment *= 0.65;
  } else if (avgFatigue >= 50) {
    recommendation.fatigueWarning = `🟡 Moderate fatigue (avg ${avgFatigue.toFixed(0)}%). Reduce volume by 15-20%.`;
    recommendation.volumeAdjustment *= 0.85;
  } else if (avgFatigue < 20) {
    recommendation.fatigueWarning = `✅ Muscles fresh (avg ${avgFatigue.toFixed(0)}%). Ready for progressive overload!`;
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
  calculateSleepMultiplier,
  calculateMuscleFatigue,
  calculateCurrentFatigue,
  getRecoveryColor,
  getRecoveryStatus,
  processWorkoutHistory,
  getTrainingRecommendation
};