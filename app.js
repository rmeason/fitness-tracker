'use strict';

// --- ES Module Imports ---
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Line } from 'react-chartjs-2';
import { 
  Chart, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
  
// --- Import our coach brain ---
import * as Coach from './coach.js';

// Alias React.createElement to 'h' for brevity
const h = React.createElement;

// Get React hooks
const { useState, useEffect, useRef, Fragment } = React;

// Register Chart.js components
Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

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
const NUTRITION_KEY = 'hypertrophyApp.nutrition.v1'; // Separate nutrition DB
const DIET_GOALS_KEY = 'hypertrophyApp.dietGoals.v1'; // Diet goals
const MIGRATION_FLAG_KEY = 'hypertrophyApp.migrationV2.done'; // Migration tracker

// --- 🛠️ HELPER FUNCTIONS ---
const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;
const formatDate = (date) => date.toISOString().split('T')[0];

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

const calculateVolumeLoad = (weights, reps) => {
  if (!weights || !reps || reps.length === 0) return 0;
  // Support both old format (single weight) and new format (array of weights)
  const weightsArray = Array.isArray(weights) ? weights : Array(reps.length).fill(weights);

  let totalVolume = 0;
  for (let i = 0; i < reps.length; i++) {
    const weight = Number(weightsArray[i]) || 0;
    const rep = Number(reps[i]) || 0;
    totalVolume += weight * rep;
  }
  return totalVolume;
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

const getProteinStatus = (protein) => {
  // Check for custom diet goals
  const savedGoals = localStorage.getItem(DIET_GOALS_KEY);
  const customGoals = savedGoals ? JSON.parse(savedGoals) : null;

  if (customGoals && customGoals.enabled) {
    const target = customGoals.protein;
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

// Helper to get nutrition totals for a *specific day*
const getNutritionForDate = (nutritionLog, date) => {
  const entriesForDate = nutritionLog.filter(n => n.date === date);
  // CRITICAL FIX: Explicitly convert to Number to prevent string concatenation
  const totalProtein = entriesForDate.reduce((sum, entry) => sum + (Number(entry.protein) || 0), 0);
  const totalCalories = entriesForDate.reduce((sum, entry) => sum + (Number(entry.calories) || 0), 0);

  // Get latest entry for the date (for sleep, weight, recovery)
  const latestEntry = entriesForDate.length > 0 ? entriesForDate[entriesForDate.length - 1] : null;

  // Get latest entry with weight > 0 (Quick Add Meals have weight: 0)
  const latestWeightEntry = [...entriesForDate].reverse().find(e => Number(e.weight) > 0);

  // Count meals (entries with protein or calories > 0)
  const mealCount = entriesForDate.filter(e => (Number(e.protein) || 0) > 0 || (Number(e.calories) || 0) > 0).length;

  return {
    totalProtein,
    totalCalories,
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

// Helper to get current weight from all nutrition entries
const getCurrentWeight = (nutritionLog) => {
  // Find the most recent entry with weight > 0
  const latestWeightEntry = [...nutritionLog].reverse().find(e => Number(e.weight) > 0);
  return latestWeightEntry?.weight || USER_CONTEXT.startWeight;
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
const Button = ({ onClick, children, className = '', variant = 'primary' }) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-slate-600 hover:bg-slate-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  return h('button', {
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
const CoachSuggestionBox = ({ exerciseName, allEntries, todaySleepPercent, trainingType }) => {
  const [suggestion, setSuggestion] = useState(null);
  const [volumeTarget, setVolumeTarget] = useState(null);

  useEffect(() => {
    if (exerciseName) {
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

// --- 📈 CHART COMPONENT (UPGRADED) ---
const ExerciseProgressChart = ({ entries, allExerciseNames }) => {
  const [selectedExercise, setSelectedExercise] = useState(allExerciseNames[0] || '');
  const [chartType, setChartType] = useState('weight');

  // Auto-select first exercise when allExerciseNames updates
  useEffect(() => {
    if (!selectedExercise && allExerciseNames.length > 0) {
      setSelectedExercise(allExerciseNames[0]);
    }
  }, [allExerciseNames, selectedExercise]);

  if (!entries || entries.length === 0) {
    return h('p', { className: 'text-slate-400' }, 'No workout data yet to display charts.');
  }

  // Session volume chart shows total volume for each workout
  if (chartType === 'sessionVolume') {
    const sessionData = entries
      .filter(e => e.trainingType !== 'REST' && e.totalVolume > 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const chartData = {
      labels: sessionData.map(d => `${d.date} (${d.trainingType})`),
      datasets: [
        {
          label: 'Total Session Volume (lbs)',
          data: sessionData.map(d => d.totalVolume),
          borderColor: '#a78bfa',
          backgroundColor: '#a78bfa',
          tension: 0.1,
        },
      ],
    };

    const chartOptions = {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { color: '#cbd5e1' } },
        title: { display: true, text: 'Session Volume Progress', color: '#f1f5f9' },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
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
      sessionData.length > 0
        ? h(Line, { data: chartData, options: chartOptions })
        : h('p', { className: 'text-slate-400' }, 'No workout data yet. Log a workout!')
    );
  }

  // Exercise-specific charts (weight and volume)
  const exerciseData = entries
    .map(entry => {
      if (!entry.exercises) return null;
      const ex = entry.exercises.find(e => e.name === selectedExercise);
      if (!ex) return null;

      // Get max weight from weights array
      const maxWeight = Array.isArray(ex.weights)
        ? getMaxWeight(ex.weights)
        : (ex.weight || 0);

      // Calculate volumeLoad on the fly if not stored (for backward compatibility)
      let volumeLoad = ex.volumeLoad;
      if (!volumeLoad && ex.reps) {
        const weights = Array.isArray(ex.weights) ? ex.weights : (ex.weight ? [ex.weight] : []);
        volumeLoad = calculateVolumeLoad(weights, ex.reps);
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
    labels: exerciseData.map(d => d.date),
    datasets: [
      {
        label: chartType === 'weight' ? `${selectedExercise} Weight (lbs)` : `${selectedExercise} Volume (lbs)`,
        data: exerciseData.map(d => chartType === 'weight' ? d.weight : d.volumeLoad),
        borderColor: chartType === 'weight' ? '#38bdf8' : '#34d399',
        backgroundColor: chartType === 'weight' ? '#38bdf8' : '#34d399',
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top', labels: { color: '#cbd5e1' } },
      title: { display: true, text: `Progression for ${selectedExercise}`, color: '#f1f5f9' },
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
  };

  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
    h('div', { className: 'grid grid-cols-2 gap-4 mb-4' },
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
    exerciseData.length > 0 && selectedExercise
      ? h(Line, { data: chartData, options: chartOptions })
      : h('p', { className: 'text-slate-400' }, 'No data for this exercise yet. Log a workout!')
  );
};

// --- 📅 CALENDAR COMPONENT (UPGRADED) ---
const TrainingCalendar = ({ entries, trainingCycle, dynamicToday, onEditCycle, onSetCycleDay }) => {
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

  // Calculate planned workout for a given date using Coach logic
  const getPlannedWorkout = (dateStr) => {
    // If this is today and we have dynamicToday, use it
    if (dateStr === todayStr) {
      return dynamicToday;
    }

    // Find the most recent logged entry before or on this date
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const lastEntryBeforeDate = sortedEntries
      .filter(e => new Date(e.date) <= new Date(dateStr))
      .pop();

    if (!lastEntryBeforeDate) {
      // No entries yet, start from beginning of cycle
      const daysSinceEpoch = Math.floor((new Date(dateStr) - new Date('2025-01-01')) / (1000 * 60 * 60 * 24));
      return trainingCycle[daysSinceEpoch % cycleLength];
    }

    // Calculate days difference from last logged entry
    const daysDiff = Math.floor((new Date(dateStr) - new Date(lastEntryBeforeDate.date)) / (1000 * 60 * 60 * 24));

    // Use cycleDay from last entry if available, otherwise infer it
    const lastCycleDay = lastEntryBeforeDate.cycleDay !== undefined
      ? lastEntryBeforeDate.cycleDay
      : trainingCycle.indexOf(lastEntryBeforeDate.plannedTrainingType);

    // Handle skipped days: if user logged REST on a training day, don't advance cycle
    let nextCycleDay = lastCycleDay;
    if (lastEntryBeforeDate.trainingType === 'REST' && lastEntryBeforeDate.plannedTrainingType !== 'REST') {
      // They skipped, so the planned workout stays the same
      nextCycleDay = lastCycleDay;
    } else {
      // Normal progression
      nextCycleDay = (lastCycleDay + daysDiff) % cycleLength;
    }

    return trainingCycle[nextCycleDay];
  };

  // Get cycle position for current plan
  const getCurrentCycleDay = () => {
    if (entries.length === 0) return 1;
    const lastEntry = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (lastEntry.cycleDay !== undefined) {
      const lastCycleDay = lastEntry.cycleDay;
      // Check if they skipped
      if (lastEntry.trainingType === 'REST' && lastEntry.plannedTrainingType !== 'REST') {
        return lastCycleDay + 1; // Still on the same day they skipped
      }
      return ((lastCycleDay + 1) % cycleLength) + 1; // +1 for display (1-indexed)
    }
    return 1;
  };

  const currentCycleDay = getCurrentCycleDay();

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
        h('p', { className: 'text-sm text-slate-400' }, `Day ${currentCycleDay} of ${cycleLength}`)
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
        const planned = getPlannedWorkout(dateStr);

        // Calculate cycle day for this date
        const getCycleDayForDate = (date) => {
          const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
          const lastEntryBeforeDate = sortedEntries
            .filter(e => new Date(e.date) <= new Date(date))
            .pop();

          if (!lastEntryBeforeDate) {
            const daysSinceEpoch = Math.floor((new Date(date) - new Date('2025-01-01')) / (1000 * 60 * 60 * 24));
            return (daysSinceEpoch % cycleLength) + 1;
          }

          const daysDiff = Math.floor((new Date(date) - new Date(lastEntryBeforeDate.date)) / (1000 * 60 * 60 * 24));
          const lastCycleDay = lastEntryBeforeDate.cycleDay !== undefined
            ? lastEntryBeforeDate.cycleDay
            : 0;

          return ((lastCycleDay + daysDiff) % cycleLength) + 1;
        };

        const cycleDayNumber = getCycleDayForDate(dateStr);
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
        topPRs.map(pr =>
          h('li', { key: pr.name, className: 'flex justify-between items-center bg-slate-700 p-2 rounded' },
            h('span', { className: 'font-semibold' }, pr.name),
            h('span', { className: 'text-cyan-400 font-bold' }, `${pr.weight} lbs`),
            h('span', { className: 'text-xs text-slate-400' }, `${pr.sets}x${pr.reps}`)
          )
        )
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

// --- 🤖 AI SUGGESTION MODAL (UPGRADED) ---
const AIWorkoutSuggestion = ({ entries, prs, trainingCycle, nutrition, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecommendation = async () => {
      try {
        const last10Workouts = entries.slice(-10);
        const topPRs = prs.slice(0, 10);

        // Get last night's sleep from nutrition array
        const lastNutrition = nutrition.length > 0 ? nutrition[nutrition.length - 1] : null;
        const lastSleep = lastNutrition ? lastNutrition.deepSleepPercent : 15;
        const hours = lastNutrition ? lastNutrition.sleepHours : 7;
        // Use dynamic calendar logic for correct cycle position
        const { cycleDay, today: plannedWorkout } = Coach.getDynamicCalendar(entries, trainingCycle);

        const prompt = `You are a hypertrophy training coach analyzing workout data for a 32-year-old male (139.5 lbs) in a body composition phase.

RECENT WORKOUTS (includes RPE and Volume): ${JSON.stringify(last10Workouts)}
CURRENT PRs: ${JSON.stringify(topPRs)}
LAST NIGHT'S SLEEP: ${lastSleep}% deep sleep (${hours}h total)
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
  "reasoning": "Based on your ${lastSleep}% deep sleep and cycle position...",
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
  }, [entries, prs, trainingCycle, nutrition]);
  
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

// 💡 NEW: NUTRITION QUICK-ADD MODAL
const NutritionQuickAddModal = ({ onClose, onSave }) => {
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  // 💡💡💡 THIS IS THE FIX 💡💡💡
  // Add date state, defaulting to today
  const [date, setDate] = useState(formatDate(new Date()));
  const { showToast } = useToast();

  const handleAdd = () => {
    // CRITICAL FIX: Ensure parseNumberWithSuffix result is converted to Number
    const prot = Number(parseNumberWithSuffix(protein)) || 0;
    const cals = Number(parseNumberWithSuffix(calories)) || 0;

    if (prot === 0 && cals === 0) {
      showToast('Please enter protein or calories', 'error');
      return;
    }

    // Create nutrition entry with only protein/calories (no sleep data)
    onSave({
      id: generateId(),
      date: date,
      protein: prot,
      calories: cals,
      sleepHours: 0,
      deepSleepPercent: 0,
      deepSleepMinutes: 0,
      weight: 0,
      recoveryRating: 0
    });

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
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Calories (kcal)'),
        h(Input, {
          type: 'text',
          value: calories,
          onChange: e => setCalories(parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 500 or 3k'
        })
      ),
      h(Button, { onClick: handleAdd, variant: 'primary', className: 'w-full' }, 'Add Entry')
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
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Calories (kcal)'),
        h(Input, {
          type: 'text',
          value: calories,
          onChange: e => setCalories(parseNumberWithSuffix(e.target.value)),
          placeholder: 'e.g., 2800 or 3k'
        })
      )
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
const LogEntryForm = ({ onSave, onCancel, entryToEdit, allEntries, nutrition, allExerciseNames, setAllExerciseNames, trainingCycle, plannedToday, cycleDay }) => {
  const { showToast } = useToast();
  // Form state
  const [date, setDate] = useState(formatDate(new Date()));
  const [trainingType, setTrainingType] = useState(plannedToday);
  const [exercises, setExercises] = useState([]);
  const [duration, setDuration] = useState(60);
  const [caloriesBurned, setCaloriesBurned] = useState(''); // NEW: Optional calories burned field

  // Get today's sleep data from nutrition array
  const todaysNutritionData = getTodaysNutrition(nutrition);
  const todaySleepPercent = todaysNutritionData.deepSleepPercent;
  const [isUploading, setIsUploading] = useState(false);

  // UI state for collapsible sections and quick log
  const [quickLogMode, setQuickLogMode] = useState(false);
  const [trainingSectionOpen, setTrainingSectionOpen] = useState(true);

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
    if (exercises.length > 0 && !workoutStartTime) {
      setWorkoutStartTime(Date.now());
    }
  }, [exercises.length]);

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
      setDuration(entryToEdit.duration || 60);
      setCaloriesBurned(entryToEdit.caloriesBurned || '');
    } else {
      setTrainingType(plannedToday);
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
          volumeLoad: calculateVolumeLoad(weights, reps)
        };
      }),
      totalSets,
      totalVolume: exercises.reduce((sum, ex) => {
        const weights = (ex.weights || []).map(w => Number(w) || 0);
        const reps = ex.reps.map(r => Number(r) || 0);
        return sum + calculateVolumeLoad(weights, reps);
      }, 0),
      duration: Number(duration),
      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null, // NEW: Optional calories burned
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
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Date'),
        h(Input, { type: 'date', value: date, onChange: (e) => setDate(e.target.value) })
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
                trainingType: trainingType
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
                return sum + calculateVolumeLoad(weights, reps);
              }, 0);
              return `${totalVolume.toLocaleString()} lbs`;
            })()
          )
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

// --- 📜 ENTRY CARD COMPONENT (UPGRADED) ---
const EntryCard = ({ entry, nutrition, onEdit, onDelete, allEntries }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get all nutrition data for this entry's date
  const nutritionData = getNutritionForDate(nutrition, entry.date);

  const totalVolume = entry.totalVolume || 0;
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
          )
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
const Settings = ({ entries, setEntries, trainingCycle, setTrainingCycle, nutrition, setNutrition }) => {
  const { showToast } = useToast();
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [customCycles, setCustomCycles] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_CYCLES_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  // Diet Goals state
  const [dietGoals, setDietGoals] = useState(() => {
    const saved = localStorage.getItem(DIET_GOALS_KEY);
    return saved ? JSON.parse(saved) : { protein: 140, calories: 2200, enabled: false };
  });
  const [showDietGoals, setShowDietGoals] = useState(false);
  const [goalType, setGoalType] = useState('maintain');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [currentWeight, setCurrentWeight] = useState(() => {
    return nutrition.length > 0 ? nutrition[nutrition.length - 1].weight : USER_CONTEXT.startWeight;
  });

  const calculateDietGoals = () => {
    const weight = currentWeight || USER_CONTEXT.startWeight;

    // Protein: 1g per lb minimum
    const protein = Math.round(weight * 1.0);

    // Calculate BMR (simplified Mifflin-St Jeor for males)
    const bmr = 10 * (weight * 0.453592) + 6.25 * (USER_CONTEXT.height || 175) - 5 * USER_CONTEXT.age + 5;

    // Activity multipliers
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };

    const tdee = Math.round(bmr * activityMultipliers[activityLevel]);

    // Goal adjustments
    const goalAdjustments = {
      cut: -500,          // 1 lb/week loss
      maintain: 0,
      leanBulk: +250,     // 0.5 lb/week gain
      bulk: +500          // 1 lb/week gain
    };

    const calories = tdee + goalAdjustments[goalType];

    const newGoals = { protein, calories, enabled: true };
    setDietGoals(newGoals);
    localStorage.setItem(DIET_GOALS_KEY, JSON.stringify(newGoals));
    showToast(`Diet goals set: ${protein}g protein, ${calories} kcal`, 'success');
    setShowDietGoals(false);
  };

  const exportData = () => {
    const dataStr = JSON.stringify({ entries, trainingCycle, customCycles, nutrition }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hypertrophy-backup-v6-${formatDate(new Date())}.json`; // v6 data structure
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
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          setEntries(imported); // Old v1 format
        } else {
          // New v2-v6 format
          if (imported.entries) setEntries(imported.entries);
          if (imported.trainingCycle) setTrainingCycle(imported.trainingCycle);
          if (imported.customCycles) {
            setCustomCycles(imported.customCycles);
            localStorage.setItem(CUSTOM_CYCLES_KEY, JSON.stringify(imported.customCycles));
          }
          if (imported.nutrition) setNutrition(imported.nutrition);
        }
        showToast('Data imported successfully!');
      } catch (err) {
        showToast('Failed to import data.', 'error');
        console.error(err);
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
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(CYCLE_KEY);
      localStorage.removeItem(CUSTOM_CYCLES_KEY);
      localStorage.removeItem(NUTRITION_KEY);
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
      h('h3', { className: 'text-lg font-semibold' }, '🎯 Diet Goals'),
      dietGoals.enabled && h('div', { className: 'text-sm text-slate-300 mb-2' },
        `Current: ${dietGoals.protein}g protein, ${dietGoals.calories} kcal`
      ),
      h(Button, { onClick: () => setShowDietGoals(!showDietGoals), variant: 'primary' },
        showDietGoals ? 'Hide Calculator' : 'Set Diet Goals'
      ),
      showDietGoals && h('div', { className: 'mt-4 space-y-3' },
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Current Weight (lbs)'),
          h(Input, { type: 'number', step: 0.1, value: currentWeight, onChange: (e) => setCurrentWeight(Number(e.target.value)) })
        ),
        h('div', {},
          h('label', { className: 'block text-sm font-medium mb-1' }, 'Goal Type'),
          h('select', {
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white',
            value: goalType,
            onChange: (e) => setGoalType(e.target.value)
          },
            h('option', { value: 'cut' }, 'Cut (-500 kcal/day)'),
            h('option', { value: 'maintain' }, 'Maintain'),
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
  
  const [view, setView] = useState('dashboard');
  const [entryToEdit, setEntryToEdit] = useState(null);
  const [nutritionEntryToEdit, setNutritionEntryToEdit] = useState(null);

  // Run data migration on mount (only once)
  useEffect(() => {
    const result = migrateToSeparatedData();
    if (result.migrated) {
      console.log(`Migration successful: ${result.nutritionCreated} nutrition entries created`);
      // Force reload data after migration
      window.location.reload();
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

  // --- DERIVED STATE (Upgraded) ---
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)); 
  
  const [allExerciseNames, setAllExerciseNames] = useState(() =>
    Array.from(new Set(entries.flatMap(e => e.exercises || []).map(ex => ex.name)))
  );
  const allPRs = calculateAllPRs(entries);
  
  const todayStr = formatDate(new Date());
  const hasLoggedToday = sortedEntries.some(e => e.date === todayStr);
  const { today: nextWorkout, note: coachNote, cycleDay } = Coach.getDynamicCalendar(sortedEntries, trainingCycle);
  const planTitle = hasLoggedToday ? "💡 Tomorrow's Plan" : "💡 Today's Plan";

  const todaysNutrition = getTodaysNutrition(nutrition);

  // Calculate weekly calories burned (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weeklyCaloriesBurned = sortedEntries
    .filter(e => new Date(e.date) >= sevenDaysAgo && e.caloriesBurned)
    .reduce((sum, e) => sum + (e.caloriesBurned || 0), 0);

  // Analyze recovery status from nutrition data
  const recoveryAnalysis = Coach.analyzeRecoveryPattern(nutrition);

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

  const handleDeleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setShowDeleteModal(null);
  };

  const handleDeleteNutrition = (id) => {
    if (window.confirm('Are you sure you want to delete this nutrition entry?')) {
      setNutrition(prev => prev.filter(e => e.id !== id));
    }
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
          cycleDay: cycleDay
        });
      case 'nutritionForm':
        return h(NutritionLogForm, {
          onSave: handleSaveNutrition,
          onCancel: () => setView('dashboard'),
          entryToEdit: nutritionEntryToEdit,
          nutrition: nutrition,
          allEntries: sortedEntries
        });
      case 'calendar':
        return h('div', { className: 'space-y-4' },
          h(TrainingCalendar, {
            entries: sortedEntries,
            trainingCycle,
            dynamicToday: nextWorkout,
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
        return h(ExerciseProgressChart, { entries: sortedEntries, allExerciseNames });
      case 'settings':
        return h(Settings, { 
          entries: sortedEntries, 
          setEntries, 
          trainingCycle, 
          setTrainingCycle,
          nutrition: nutrition,
          setNutrition: setNutrition
        });
      case 'dashboard':
      default:
        return h('div', { className: 'space-y-6' },
          // Enhanced Header with Planned Workout + Today's Stats
          h('div', { className: 'bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-lg border border-slate-700' },
            h('div', { className: 'mb-4' },
              h('h3', { className: 'text-sm font-semibold text-slate-400 mb-1' }, planTitle),
              h('p', { className: 'text-3xl font-bold text-cyan-400' }, nextWorkout),
              h('p', { className: 'text-sm text-slate-300 mt-1' }, coachNote)
            ),
            h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-700' },
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Today\'s Protein'),
                h('div', { className: 'text-2xl font-bold text-green-400' }, `${Number(todaysNutrition.totalProtein).toLocaleString()}g`),
                h('div', { className: 'text-xs mt-1' }, getProteinStatus(todaysNutrition.totalProtein)),
                todaysNutrition.mealCount > 1 && h('div', { className: 'text-xs text-slate-500 mt-1' }, `(${todaysNutrition.mealCount} meals)`)
              ),
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Today\'s Calories'),
                h('div', { className: 'text-2xl font-bold text-orange-400' }, Number(todaysNutrition.totalCalories).toLocaleString()),
                todaysNutrition.mealCount > 1 && h('div', { className: 'text-xs text-slate-500 mt-1' }, `(${todaysNutrition.mealCount} meals)`)
              ),
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Current Weight'),
                h('div', { className: 'text-2xl font-bold' }, `${getCurrentWeight(nutrition)} lbs`)
              ),
              h('div', { className: 'text-center' },
                h('div', { className: 'text-xs text-slate-400' }, 'Week Burned'),
                h('div', { className: 'text-2xl font-bold text-red-400' }, weeklyCaloriesBurned),
                h('div', { className: 'text-xs mt-1 text-slate-500' }, 'kcal (7 days)')
              )
            )
          ),
          // Recovery Status Indicator
          h('div', { className: 'bg-slate-800 p-4 rounded-lg border-2', style: { borderColor: recoveryAnalysis.status === 'FRESH' ? '#10b981' : recoveryAnalysis.status === 'GOOD' ? '#3b82f6' : recoveryAnalysis.status === 'FATIGUED' ? '#f59e0b' : '#ef4444' } },
            h('div', { className: 'flex items-center justify-between' },
              h('div', {},
                h('div', { className: 'flex items-center gap-2' },
                  h('span', { className: 'text-3xl' }, recoveryAnalysis.emoji),
                  h('div', {},
                    h('h3', { className: 'text-lg font-bold' }, recoveryAnalysis.label),
                    h('p', { className: 'text-xs text-slate-400' }, recoveryAnalysis.note)
                  )
                )
              ),
              h('div', { className: 'text-right text-sm' },
                h('div', {}, `Sleep: ${recoveryAnalysis.avgSleep}%`),
                h('div', {}, `Recovery: ${recoveryAnalysis.avgRecovery}/10`),
                h('div', { className: 'text-xs mt-1' },
                  recoveryAnalysis.trend === 'improving' ? '📈 Improving' :
                  recoveryAnalysis.trend === 'declining' ? '📉 Declining' : '➡️ Stable'
                )
              )
            )
          ),
          h('div', { className: 'grid grid-cols-2 gap-4' },
            h(Button, {
              onClick: () => setShowNutritionModal(true),
              variant: 'primary',
              className: 'text-lg'
            }, '🍽️ Quick Add Meal'),
            h(Button, {
              onClick: () => handleShowNutritionForm(),
              variant: 'secondary',
              className: 'text-lg'
            }, '🌙 Log Sleep/Nutrition')
          ),
          sortedEntries.filter(e => e.trainingType !== 'REST').length > 0 && h('div', { className: 'grid grid-cols-2 gap-4' },
            h(Button, {
              onClick: handleDuplicateLastWorkout,
              variant: 'secondary',
              className: 'text-lg'
            }, '📋 Duplicate Last Workout'),
            h(Button, {
              onClick: () => handleShowForm(null),
              variant: 'secondary',
              className: 'text-lg'
            }, '💪 Log Workout')
          ),
          h(Button, {
            onClick: () => setShowAIModal(true),
            variant: 'primary',
            className: 'w-full text-lg'
          }, '🤖 Get Full Workout (REAL AI)'),
          h(PRDashboard, { prs: allPRs }),

          // Today's Nutrition Log
          nutrition.filter(n => n.date === formatDate(new Date())).length > 0 && h('div', { className: 'space-y-4' },
            h('h2', { className: 'text-xl font-bold' }, 'Today\'s Nutrition Log'),
            h('div', { className: 'space-y-2' },
              nutrition.filter(n => n.date === formatDate(new Date())).map(entry =>
                h('div', { key: entry.id, className: 'bg-slate-800 p-4 rounded-lg flex justify-between items-center' },
                  h('div', {},
                    h('div', { className: 'font-semibold' },
                      [
                        entry.protein > 0 ? `${Number(entry.protein).toLocaleString()}g protein` : null,
                        entry.calories > 0 ? `${Number(entry.calories).toLocaleString()} kcal` : null,
                        entry.weight > 0 ? `${entry.weight} lbs` : null,
                        entry.sleepHours > 0 ? `${formatSleepTime(entry.sleepHours)} sleep` : null
                      ].filter(Boolean).join(' • ')
                    ),
                    h('div', { className: 'text-xs text-slate-400 mt-1' },
                      new Date(entry.id).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    )
                  ),
                  h('div', { className: 'flex gap-2' },
                    h(Button, {
                      variant: 'secondary',
                      onClick: () => handleShowNutritionForm(entry),
                      className: 'text-sm px-3 py-1'
                    }, 'Edit'),
                    h(Button, {
                      variant: 'danger',
                      onClick: () => handleDeleteNutrition(entry.id),
                      className: 'text-sm px-3 py-1'
                    }, 'Delete')
                  )
                )
              )
            )
          ),

          h('h2', { className: 'text-xl font-bold' }, 'Recent Entries'),
          h('div', { className: 'space-y-4' },
            sortedEntries.length > 0
              ? [...sortedEntries].reverse().map(entry => h(EntryCard, {
                  key: entry.id,
                  entry: entry,
                  nutrition: nutrition, // 💡 Pass full nutrition log here
                  allEntries: sortedEntries, // For volume comparison
                  onEdit: handleShowForm,
                  onDelete: openDeleteModal
                }))
              : h('p', { className: 'text-slate-400' }, 'No entries yet. Log a workout!')
          )
        );
    }
  };

  return h(ToastProvider, null,
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
        onClose: () => setShowAIModal(false)
      }),
      showDeleteModal && h(Modal, { show: !!showDeleteModal, onClose: () => setShowDeleteModal(null), title: "Confirm Deletion" },
        h('div', {},
          h('p', { className: 'mb-4' }, 'Are you sure you want to delete this entry?'),
          h('div', { className: 'flex justify-end gap-4' },
            h(Button, { variant: 'secondary', onClick: () => setShowDeleteModal(null) }, 'Cancel'),
            h(Button, { variant: 'danger', onClick: () => handleDeleteEntry(showDeleteModal) }, 'Delete')
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
        h('div', { className: 'space-y-4' },
          h('p', {}, 'How would you like to start this new training cycle?'),
          h('div', { className: 'flex flex-col gap-3' },
            h(Button, {
              variant: 'primary',
              className: 'w-full',
              onClick: () => {
                setTrainingCycle(pendingCycle);
                // Reset cycle position by clearing entries or adding marker
                showToast('Cycle updated! Starting fresh from Day 1 today.');
                setShowCycleStartModal(false);
                setPendingCycle(null);
              }
            }, '🔄 Start from Day 1 Today'),
            h(Button, {
              variant: 'secondary',
              className: 'w-full',
              onClick: () => {
                setTrainingCycle(pendingCycle);
                showToast('Cycle updated! Continuing from current position.');
                setShowCycleStartModal(false);
                setPendingCycle(null);
              }
            }, '➡️ Continue from Current Position')
          ),
          h('div', { className: 'text-sm text-slate-400 mt-4' },
            h('p', {}, 'Starting from Day 1 will reset your cycle position.'),
            h('p', {}, 'Continuing will keep your current progress through the cycle.')
          )
        )
      )
    ), // <-- Main scrolling div closes here
    
    // Bottom Nav Bar is now a sibling to the scrolling div
    h('nav', { className: 'fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-slate-800 border-t border-slate-700 grid grid-cols-5' },
      h(NavButton, { icon: '🔥', label: 'Log', active: view === 'dashboard', onClick: () => setView('dashboard') }),
      h(NavButton, { icon: '📅', label: 'Calendar', active: view === 'calendar', onClick: () => setView('calendar') }),
      h('div', { className: 'relative' },
        h('button', {
          className: 'absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-4xl shadow-lg hover:bg-blue-700',
          onClick: () => handleShowForm(null)
        }, '+')
      ),
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

// --- 🚀 MOUNT THE APP ---
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(h(App));

