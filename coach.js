// --- 🧠 The Hypertrophy Coach ---

/**
 * Finds the last 5 times a specific exercise was performed.
 * @param {string} exerciseName - The name of the exercise (e.g., "Bench Press")
 * @param {Array} allEntries - The full logbook (must be sorted oldest-to-newest)
 * @param {number} limit - How many recent sessions to return
 * @returns {Array} - An array of { date, weight, sets, reps, rpe, volumeLoad }
 */
function getExerciseHistory(exerciseName, allEntries, limit = 5) {
  const history = [];
  // Iterate backwards (newest to oldest)
  for (let i = allEntries.length - 1; i >= 0; i--) {
    const entry = allEntries[i];
    if (entry.exercises) {
      const foundExercise = entry.exercises.find(ex => ex.name === exerciseName);
      if (foundExercise) {
        history.push({
          date: entry.date,
          sleepPercent: entry.deepSleepPercent,
          ...foundExercise
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
 * Calculates the dynamic training schedule.
 * This handles your "skipped day" request.
 * @param {Array} allEntries - (must be sorted oldest-to-newest)
 * @param {Array} trainingCycle - The user's defined cycle
 * @returns {object} - { today, note, cycleDay }
 */
export function getDynamicCalendar(allEntries, trainingCycle) {
  const cycleLength = trainingCycle.length;
  
  if (allEntries.length === 0) {
    return { 
      today: trainingCycle[0], 
      note: 'Starting your first cycle!',
      cycleDay: 0
    };
  }
  
  const lastLog = allEntries[allEntries.length - 1];
  const lastPlannedWorkout = lastLog.plannedTrainingType;
  const lastActualWorkout = lastLog.trainingType;
  
  // Find the index of the last *planned* workout
  // Use lastLog.cycleDay if it exists (from v3+), otherwise fall back
  const lastCycleIndex = lastLog.cycleDay !== undefined 
    ? lastLog.cycleDay 
    : trainingCycle.indexOf(lastPlannedWorkout);
  
  let nextCycleIndex = (lastCycleIndex + 1) % cycleLength;
  let todayPlanned = trainingCycle[nextCycleIndex];
  let note = `Last workout was ${lastLog.date}. Next up is ${todayPlanned}.`;

  // --- This is the "skipped day" logic ---
  if (lastActualWorkout === 'REST' && lastPlannedWorkout !== 'REST') {
    // You logged "REST" on a day you were supposed to train.
    todayPlanned = lastPlannedWorkout; // Today, you should do the workout you skipped.
    nextCycleIndex = lastCycleIndex; // We are re-doing this day
    note = `You skipped ${lastPlannedWorkout} yesterday. Let's hit that today to stay on track.`;
  }

  return { 
    today: todayPlanned,
    note,
    cycleDay: nextCycleIndex // This is the index for today's plan
  };
}
