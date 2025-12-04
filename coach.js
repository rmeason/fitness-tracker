// --- 🧠 The Hypertrophy Coach ---

/**
 * Finds the last 5 times a specific exercise was performed.
 * @param {string} exerciseName - The name of the exercise (e.g., "Bench Press")
 * @param {Array} allEntries - The full logbook (must be sorted oldest-to-newest)
 * @param {number} limit - How many recent sessions to return
 * @returns {Array} - An array of { date, weight, weights, sets, reps, rpe, volumeLoad }
 */
function getExerciseHistory(exerciseName, allEntries, limit = 5) {
  const history = [];
  // Iterate backwards (newest to oldest)
  for (let i = allEntries.length - 1; i >= 0; i--) {
    const entry = allEntries[i];
    if (entry.exercises) {
      const foundExercise = entry.exercises.find(ex => ex.name === exerciseName);
      if (foundExercise) {
        // Normalize to new format: ensure weights is an array
        const weights = Array.isArray(foundExercise.weights)
          ? foundExercise.weights
          : (foundExercise.weight ? Array(foundExercise.sets || 3).fill(foundExercise.weight) : []);

        const maxWeight = weights.length > 0 ? Math.max(...weights.filter(w => w > 0)) : 0;

        history.push({
          date: entry.date,
          sleepPercent: entry.deepSleepPercent,
          ...foundExercise,
          weights: weights, // Always provide as array
          weight: maxWeight, // Provide max weight for backward compatibility
        });
      }
    }
    if (history.length >= limit) break;
  }
  return history.reverse(); // Return in chronological order (oldest-to-newest)
}

/**
 * Analyzes the exercise history to find performance patterns.
 * This is the "learning" part.
 * @param {Array} history - Array from getExerciseHistory
 * @returns {object} - A profile object
 */
function analyzePerformanceProfile(history) {
  if (history.length === 0) {
    return {
      status: 'NEW_EXERCISE',
      note: 'First time logging this! Let\'s set a baseline.',
      lastSession: null
    };
  }

  const last = history[history.length - 1];
  const lastWeight = last.weight;
  const lastRPE = last.rpe;

  // Check for RPE (for backward compatibility with old entries)
  if (lastRPE === undefined) {
    return {
      status: 'NO_RPE_DATA',
      note: 'No RPE logged for the last session. Cannot analyze trend.',
      lastSession: last
    }
  }

  // Pattern: Is RPE trending down at the same weight?
  const sessionsAtWeight = history.filter(s => s.weight === lastWeight && s.rpe !== undefined);
  let rpeTrend = 'flat';
  if (sessionsAtWeight.length >= 2) {
    const firstRPE = sessionsAtWeight[0].rpe;
    const latestRPE = sessionsAtWeight[sessionsAtWeight.length - 1].rpe;
    if (latestRPE < firstRPE) rpeTrend = 'down'; // Good, you're adapting
    if (latestRPE > firstRPE) rpeTrend = 'up'; // Bad, you're fatigued
  }

  // Pattern: Did you hit RPE 10 (max failure) last time?
  if (lastRPE >= 9.5) {
    return {
      status: 'MAXED_OUT',
      note: 'You hit RPE 10 last session. We must priorize recovery.',
      lastSession: last,
      rpeTrend
    };
  }

  // Pattern: Is RPE low and consistent?
  if (rpeTrend === 'down' || (rpeTrend === 'flat' && lastRPE <= 8)) {
    return {
      status: 'MASTERED',
      note: 'RPE is stable or decreasing. You\'ve mastered this weight.',
      lastSession: last,
      rpeTrend
    };
  }
  
  // Default case
  return {
    status: 'PROGRESSING',
    note: 'You\'re still working at this weight. Let\'s get more reps.',
    lastSession: last,
    rpeTrend
  };
}

/**
 * Generates the Smart 2.0 progressive overload suggestion
 * @param {string} exerciseName
 * @param {Array} allEntries
 * @param {number} todaySleepPercent
 * @returns {object} - { title, target, note }
 */
export function getSmartSuggestion(exerciseName, allEntries, todaySleepPercent) {
  const history = getExerciseHistory(exerciseName, allEntries);
  const profile = analyzePerformanceProfile(history);
  const last = profile.lastSession;

  // --- 1. NEW EXERCISE ---
  if (profile.status === 'NEW_EXERCISE') {
    return {
      title: '🎯 Set a Baseline',
      target: 'Find a weight for 3-4 sets of 6-8 reps (RPE 8)',
      note: 'Focus on perfect form. We\'ll build from here.'
    };
  }

  // --- 2. NO RPE DATA (Backward compatibility) ---
  if (profile.status === 'NO_RPE_DATA') {
    return {
      title: '📈 Add Reps',
      target: `No RPE data for last session. Aim to beat ${last.reps.join('/')} reps at ${last.weight} lbs.`,
      note: 'Start logging RPE on this exercise to unlock smarter suggestions.'
    };
  }
  
  const { weight, sets, reps, rpe } = last;
  const repsStr = reps.join('/');

  // --- 3. HANDLE SLEEP QUALITY ---
  if (todaySleepPercent < 12) {
    // Injury Prevention / Deload
    return {
      title: '📉 Deload Day (Sleep < 12%)',
      target: `${Math.round(weight * 0.85)} lbs for 3 sets of 8-10 reps (RPE 7)`,
      note: `Last time: ${weight} lbs for ${repsStr}. Sleep is very low. Today is about stimulus, not PRs. Avoid injury.`
    };
  }
  
  // --- 4. HANDLE MAXED OUT (RPE 10) ---
  if (profile.status === 'MAXED_OUT') {
    return {
      title: '⚠️ Manage Fatigue (RPE 10)',
      target: `${Math.round(weight * 0.9)} lbs for 3 sets of 5-7 reps (RPE 8)`,
      note: `You hit RPE 10 at ${weight} lbs last time. Let's do a light back-off to recover and build volume.`
    };
  }
  
  // --- 5. HANDLE MASTERED (RPE <= 8) ---
  if (profile.status === 'MASTERED' && todaySleepPercent >= 15) {
    return {
      title: '📈 Add Weight (Sleep >= 15%)',
      target: `${weight + 5} lbs for 3 sets of 4-6 reps (RPE 9)`,
      note: `You mastered ${weight} lbs (RPE ${rpe}). Your sleep is good. Let's push for a 5lb PR!`
    };
  }

  // --- 6. HANDLE PROGRESSING (Default Case) ---
  // This is for adding reps
  const nextRep = (reps[0] || 0) + 1;
  return {
    title: '📈 Add Reps',
    target: `${weight} lbs for 3 sets. Try to beat ${repsStr} (e.g., ${nextRep}/${reps[1] || nextRep}/${reps[2] || nextRep})`,
    note: `Last RPE was ${rpe}. Your sleep is solid. Let's own this weight by adding more reps.`
  };
}

/**
 * Calculates the dynamic training schedule using smart pattern matching.
 * Looks at last 3 NON-REST workouts to determine cycle position.
 * @param {Array} allEntries - (must be sorted oldest-to-newest)
 * @param {Array} trainingCycle - The user's defined cycle
 * @returns {object} - { today, note, cycleDay }
 */
export function getDynamicCalendar(allEntries, trainingCycle) {
  const cycleLength = trainingCycle.length;

  console.log('=== COACH getDynamicCalendar DEBUG ===');
  console.log('allEntries count:', allEntries.length);
  console.log('trainingCycle:', trainingCycle);
  console.log('cycleLength:', cycleLength);

  if (allEntries.length === 0) {
    console.log('No entries - returning cycleDay: 0');
    console.log('======================================');
    return {
      today: trainingCycle[0],
      note: 'Starting your first cycle!',
      cycleDay: 0
    };
  }

  // Get the last entry (most recent log)
  const lastEntry = allEntries[allEntries.length - 1];
  console.log('Last entry:', { date: lastEntry.date, trainingType: lastEntry.trainingType, plannedTrainingType: lastEntry.plannedTrainingType, cycleDay: lastEntry.cycleDay });

  // PRIMARY METHOD: Use stored cycleDay from last entry + days elapsed
  // This is the most reliable method when we have cycleDay data
  if (lastEntry.cycleDay !== undefined) {
    const lastEntryDate = new Date(lastEntry.date);
    lastEntryDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSinceLastEntry = Math.round((today - lastEntryDate) / (1000 * 60 * 60 * 24));

    console.log('Using stored cycleDay method');
    console.log('lastEntry.cycleDay:', lastEntry.cycleDay);
    console.log('daysSinceLastEntry:', daysSinceLastEntry);

    // Calculate today's cycle day
    let todayCycleDay;

    // Check if last entry was a skipped workout (logged REST when workout was planned)
    if (lastEntry.trainingType === 'REST' && lastEntry.plannedTrainingType && lastEntry.plannedTrainingType !== 'REST') {
      // They skipped the planned workout - stay on same cycle position, then add remaining days
      // If they skipped yesterday, we want them to do that workout today
      if (daysSinceLastEntry === 1) {
        todayCycleDay = lastEntry.cycleDay; // Same day - redo the skipped workout
        console.log('Skipped workout yesterday - suggesting same cycle day');
      } else {
        // Multiple days passed - advance but subtract 1 for the skip
        todayCycleDay = (lastEntry.cycleDay + daysSinceLastEntry - 1) % cycleLength;
        console.log('Skipped workout, multiple days passed');
      }
    } else {
      // Normal progression: add days since last entry
      todayCycleDay = (lastEntry.cycleDay + daysSinceLastEntry) % cycleLength;
      console.log('Normal progression');
    }

    const todayPlanned = trainingCycle[todayCycleDay];

    // Get last 3 non-REST workouts for the note
    const nonRestWorkouts = allEntries
      .filter(entry => entry.trainingType && entry.trainingType !== 'REST')
      .slice(-3);
    const last3Types = nonRestWorkouts.map(entry => entry.trainingType);

    console.log('Result: todayCycleDay:', todayCycleDay, ', todayPlanned:', todayPlanned);
    console.log('======================================');

    return {
      today: todayPlanned,
      note: `Based on last 3 workouts pattern: [${last3Types.join(', ')}]`,
      cycleDay: todayCycleDay
    };
  }

  // FALLBACK: No cycleDay stored - use pattern matching (legacy behavior)
  console.log('No cycleDay stored - using pattern matching fallback');

  // --- Get last 3 NON-REST workouts ---
  const nonRestWorkouts = allEntries
    .filter(entry => entry.trainingType && entry.trainingType !== 'REST')
    .slice(-3);

  console.log('Last 3 non-REST workouts:', nonRestWorkouts.map(e => ({ date: e.date, type: e.trainingType, cycleDay: e.cycleDay })));

  if (nonRestWorkouts.length < 3) {
    const lastPlannedWorkout = lastEntry.plannedTrainingType;
    const lastActualWorkout = lastEntry.trainingType;

    console.log('Less than 3 workouts - using simple progression');

    const lastCycleIndex = trainingCycle.indexOf(lastPlannedWorkout);
    let nextCycleIndex = (lastCycleIndex + 1) % cycleLength;
    let todayPlanned = trainingCycle[nextCycleIndex];
    let note = `Less than 3 workouts logged. Using simple progression. Next up: ${todayPlanned}`;

    // Handle skipped day
    if (lastActualWorkout === 'REST' && lastPlannedWorkout !== 'REST') {
      todayPlanned = lastPlannedWorkout;
      nextCycleIndex = lastCycleIndex;
      note = `You skipped ${lastPlannedWorkout}. Let's hit that today to stay on track.`;
    }

    console.log('Fallback result: cycleDay =', nextCycleIndex, ', today =', todayPlanned);
    console.log('======================================');

    return {
      today: todayPlanned,
      note,
      cycleDay: nextCycleIndex
    };
  }

  // Extract training types from last 3 workouts for pattern matching
  const last3Types = nonRestWorkouts.map(entry => entry.trainingType);
  console.log('last3Types pattern:', last3Types);

  // Create a map of cycle positions to NON-REST workouts
  const cycleWithPositions = trainingCycle.map((type, index) => ({ type, index }));
  const nonRestCycle = cycleWithPositions.filter(item => item.type !== 'REST');
  console.log('nonRestCycle (workout positions):', nonRestCycle);

  // Find the pattern in NON-REST cycle items
  let patternFoundAt = -1;
  const patternLength = last3Types.length;

  for (let i = 0; i <= nonRestCycle.length - patternLength; i++) {
    let match = true;
    for (let j = 0; j < patternLength; j++) {
      if (nonRestCycle[i + j].type !== last3Types[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      patternFoundAt = i;
      break;
    }
  }

  console.log('patternFoundAt:', patternFoundAt);

  if (patternFoundAt !== -1) {
    const lastMatchedPosition = nonRestCycle[patternFoundAt + patternLength - 1].index;
    const nextCycleIndex = (lastMatchedPosition + 1) % cycleLength;
    const todayPlanned = trainingCycle[nextCycleIndex];

    console.log('Pattern found! lastMatchedPosition:', lastMatchedPosition, ', nextCycleIndex:', nextCycleIndex, ', todayPlanned:', todayPlanned);
    console.log('======================================');

    return {
      today: todayPlanned,
      note: `Based on last 3 workouts pattern: [${last3Types.join(', ')}]`,
      cycleDay: nextCycleIndex
    };
  }

  // Pattern not found - use frequency-based suggestion
  console.log('Pattern NOT found - using frequency fallback');

  const recentWorkouts = allEntries
    .filter(entry => entry.trainingType && entry.trainingType !== 'REST')
    .slice(-7);

  const workoutCounts = {};
  recentWorkouts.forEach(entry => {
    const type = entry.trainingType;
    workoutCounts[type] = (workoutCounts[type] || 0) + 1;
  });

  console.log('workoutCounts:', workoutCounts);

  const nonRestCycleTypes = trainingCycle.filter(type => type !== 'REST');
  const uniqueTypes = [...new Set(nonRestCycleTypes)];

  let leastFrequentType = uniqueTypes[0];
  let minCount = workoutCounts[leastFrequentType] || 0;

  for (const type of uniqueTypes) {
    const count = workoutCounts[type] || 0;
    if (count < minCount) {
      minCount = count;
      leastFrequentType = type;
    }
  }

  const suggestedIndex = trainingCycle.indexOf(leastFrequentType);
  const todayPlanned = leastFrequentType;

  console.log('Frequency fallback: leastFrequentType:', leastFrequentType, ', suggestedIndex:', suggestedIndex);
  console.log('======================================');

  return {
    today: todayPlanned,
    note: `Pattern [${last3Types.join(', ')}] not found in cycle. Suggesting ${todayPlanned} based on frequency balance.`,
    cycleDay: suggestedIndex >= 0 ? suggestedIndex : 0
  };
}

/**
 * Analyzes recovery patterns from nutrition data
 * @param {Array} nutritionEntries - All nutrition entries (sorted oldest-to-newest)
 * @returns {object} - Recovery analysis with status and recommendations
 */
export function analyzeRecoveryPattern(nutritionEntries) {
  if (nutritionEntries.length < 3) {
    return {
      status: 'INSUFFICIENT_DATA',
      label: 'Building Profile',
      emoji: '📊',
      note: 'Log more sleep data to unlock recovery insights.',
      avgRecovery: 0,
      avgSleep: 0,
      trend: 'neutral'
    };
  }

  // Get last 14 days of data
  const last14Days = nutritionEntries.slice(-14);
  const validEntries = last14Days.filter(e => e.sleepHours > 0 && e.recoveryRating > 0);

  if (validEntries.length < 3) {
    return {
      status: 'INSUFFICIENT_DATA',
      label: 'Building Profile',
      emoji: '📊',
      note: 'More data needed for recovery analysis.',
      avgRecovery: 0,
      avgSleep: 0,
      trend: 'neutral'
    };
  }

  // Calculate averages
  const avgRecovery = validEntries.reduce((sum, e) => sum + e.recoveryRating, 0) / validEntries.length;
  const avgSleep = validEntries.reduce((sum, e) => sum + e.deepSleepPercent, 0) / validEntries.length;

  // Analyze trend (compare first half vs second half)
  const midpoint = Math.floor(validEntries.length / 2);
  const firstHalf = validEntries.slice(0, midpoint);
  const secondHalf = validEntries.slice(midpoint);

  const firstHalfAvg = firstHalf.reduce((sum, e) => sum + e.recoveryRating, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, e) => sum + e.recoveryRating, 0) / secondHalf.length;

  let trend = 'neutral';
  if (secondHalfAvg > firstHalfAvg + 0.5) trend = 'improving';
  if (secondHalfAvg < firstHalfAvg - 0.5) trend = 'declining';

  // Determine recovery status
  if (avgRecovery >= 8.5 && avgSleep >= 18) {
    return {
      status: 'FRESH',
      label: 'Fresh & Ready',
      emoji: '🔥',
      note: 'Recovery is excellent. Perfect time to push for PRs.',
      avgRecovery: avgRecovery.toFixed(1),
      avgSleep: avgSleep.toFixed(1),
      trend
    };
  } else if (avgRecovery >= 7.5 && avgSleep >= 15) {
    return {
      status: 'GOOD',
      label: 'Well Recovered',
      emoji: '💪',
      note: 'Good recovery. Maintain volume and intensity.',
      avgRecovery: avgRecovery.toFixed(1),
      avgSleep: avgSleep.toFixed(1),
      trend
    };
  } else if (avgRecovery >= 6.5 || avgSleep >= 12) {
    return {
      status: 'FATIGUED',
      label: 'Fatigued',
      emoji: '⚠️',
      note: 'Recovery is declining. Consider reducing volume or taking a rest day.',
      avgRecovery: avgRecovery.toFixed(1),
      avgSleep: avgSleep.toFixed(1),
      trend
    };
  } else {
    return {
      status: 'OVERTRAINED',
      label: 'Overtrained',
      emoji: '🛑',
      note: 'Severe fatigue detected. Prioritize rest and recovery.',
      avgRecovery: avgRecovery.toFixed(1),
      avgSleep: avgSleep.toFixed(1),
      trend
    };
  }
}
