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
  
// --- 💡 NEW: Import our coach brain ---
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

// --- 🛠️ HELPER FUNCTIONS ---
const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;
const formatDate = (date) => date.toISOString().split('T')[0];

/**
 * 💡 NEW: Calculates volume load (tonnage)
 */
const calculateVolumeLoad = (weight, sets, reps) => {
  if (!weight || !sets || !reps || reps.length === 0) return 0;
  const totalReps = reps.reduce((sum, rep) => sum + (Number(rep) || 0), 0);
  return (totalReps * weight);
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
      const currentPR = prs.get(ex.name);
      if (!currentPR || ex.weight > currentPR.weight) {
        prs.set(ex.name, {
          name: ex.name,
          weight: ex.weight,
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
      if (ex.name === exerciseName && ex.weight > maxWeight) {
        maxWeight = ex.weight;
      }
    }
  }
  return maxWeight;
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

// 💡 NEW: RPE Slider Component
const RpeSlider = ({ value, onChange }) => {
  const rpeDesc = [
    '', '1 (Rest)', '2', '3', '4 (Easy)', '5',
    '6 (RIR 4)', '7 (RIR 3)', '8 (RIR 2)', '9 (RIR 1)', '10 (Failure)'
  ];
  const rpeValue = rpeDesc[Math.round(value)] || rpeDesc[Math.round(value*2)/2];
  
  return h('div', { className: 'w-full' },
    h('label', { className: 'block text-sm font-medium mb-1' }, `RPE: ${rpeValue}`),
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

// 💡 NEW: Coach Suggestion Component
const CoachSuggestionBox = ({ exerciseName, allEntries, todaySleepPercent }) => {
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    if (exerciseName) {
      // Pass chronologically sorted entries
      const s = Coach.getSmartSuggestion(exerciseName, allEntries, todaySleepPercent);
      setSuggestion(s);
    } else {
      setSuggestion(null);
    }
  }, [exerciseName, allEntries, todaySleepPercent]);

  if (!suggestion) return null;

  return h('div', { className: 'p-3 bg-blue-900/50 border border-blue-700 rounded-lg space-y-1' },
    h('h5', { className: 'font-bold text-cyan-400' }, `🧠 Coach: ${suggestion.title}`),
    h('p', { className: 'text-sm font-bold' }, `Target: ${suggestion.target}`),
    h('p', { className: 'text-xs text-slate-300' }, `Note: ${suggestion.note}`)
  );
};

// --- 🔄 CYCLE EDITOR COMPONENT (from Claude's file) ---
const CycleEditor = ({ currentCycle, onSave }) => {
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [cycleName, setCycleName] = useState('');
  const [cycleDays, setCycleDays] = useState(currentCycle || []);
  const [customCycles, setCustomCycles] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_CYCLES_KEY);
    return saved ? JSON.parse(saved) : {};
  });

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
  }, [selectedPreset]);

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
    h(Button, { onClick: applyCycle, variant: 'primary', className: 'w-full' }, '✅ Apply This Cycle')
  );
};

// --- 📈 CHART COMPONENT (UPGRADED) ---
const ExerciseProgressChart = ({ entries, allExerciseNames }) => {
  const [selectedExercise, setSelectedExercise] = useState(allExerciseNames[0] || '');
  const [chartType, setChartType] = useState('weight'); // 'weight' or 'volume'

  if (!entries || entries.length === 0) {
    return h('p', { className: 'text-slate-400' }, 'No workout data yet to display charts.');
  }

  const exerciseData = entries
    .map(entry => {
      if (!entry.exercises) return null;
      const ex = entry.exercises.find(e => e.name === selectedExercise);
      if (!ex) return null;
      return {
        date: entry.date,
        weight: ex.weight,
        volumeLoad: ex.volumeLoad || 0 // Get new metric
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

  const chartOptions = { /* ... (same as before) ... */ };

  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, '📊 Exercise Progression'),
    h('div', { className: 'grid grid-cols-2 gap-4 mb-4' },
      h(Select, { value: selectedExercise, onChange: (e) => setSelectedExercise(e.target.value) },
        allExerciseNames.map(name => h('option', { key: name, value: name }, name))
      ),
      h(Select, { value: chartType, onChange: (e) => setChartType(e.target.value) },
        h('option', { value: 'weight' }, 'Show Peak Weight'),
        h('option', { value: 'volume' }, 'Show Volume Load')
      )
    ),
    exerciseData.length > 0
      ? h(Line, { data: chartData, options: chartOptions })
      : h('p', { className: 'text-slate-400' }, 'No data for this exercise yet.')
  );
};

// --- 📅 CALENDAR COMPONENT (UPGRADED) ---
const TrainingCalendar = ({ entries, trainingCycle, dynamicToday }) => {
  const [startDate] = useState(new Date());
  const cycleLength = trainingCycle.length;
  const dates = [];
  
  // Show *at least* 14 days, or the full cycle if longer
  const daysToShow = Math.max(14, cycleLength);
  
  for (let i = 0; i < daysToShow; i++) {
    const date = new Date();
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }

  const todayStr = formatDate(new Date());

  const entriesByDate = entries.reduce((acc, entry) => {
    acc[entry.date] = entry;
    return acc;
  }, {});

  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, `📅 ${cycleLength}-Day Training Cycle`),
    h('div', { className: 'grid grid-cols-7 gap-2' },
      dates.map((date, index) => {
        const dateStr = formatDate(date);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayOfMonth = date.getDate();
        
        // 💡 NEW: Uses dynamic "today" but falls back to static cycle
        const planned = (dateStr === todayStr) ? dynamicToday : trainingCycle[index % cycleLength];
        const actual = entriesByDate[dateStr];

        let bgColor = 'bg-slate-700';
        if (actual) {
          bgColor = actual.plannedTrainingType === actual.trainingType ? 'bg-green-600' : 'bg-yellow-600';
        }
        if (dateStr === todayStr) {
          bgColor += ' ring-2 ring-blue-500';
        }

        return h('div', { key: dateStr, className: `p-2 rounded-lg text-center ${bgColor}` },
          h('div', { className: 'font-bold text-xs' }, dayOfWeek.toUpperCase()),
          h('div', { className: 'text-lg font-bold' }, dayOfMonth),
          h('div', { className: 'text-xs truncate' }, actual ? actual.trainingType : planned)
        );
      })
    )
  );
};

// (PRDashboard and StatsSummary are unchanged from Claude's file)
const PRDashboard = ({ prs }) => { /* ... (same as file) ... */ };
const StatsSummary = ({ entries }) => { /* ... (same as file) ... */ };

// (AIWorkoutSuggestion is unchanged from Claude's file, still uses mock)
const AIWorkoutSuggestion = ({ entries, prs, trainingCycle, onClose }) => { /* ... (same as file) ... */ };

// --- 📜 ENTRY LOG FORM (UPGRADED) ---
const LogEntryForm = ({ onSave, onCancel, entryToEdit, allEntries, allExerciseNames, setAllExerciseNames, trainingCycle, plannedToday, cycleDay }) => {
  const { showToast } = useToast();
  // Form state
  const [date, setDate] = useState(formatDate(new Date()));
  const [trainingType, setTrainingType] = useState(plannedToday);
  const [exercises, setExercises] = useState([]);
  const [duration, setDuration] = useState(60);
  const [sleepHours, setSleepHours] = useState(8);
  const [deepSleepPercent, setDeepSleepPercent] = useState(20);
  const [recoveryRating, setRecoveryRating] = useState(8);
  const [protein, setProtein] = useState(160);
  const [calories, setCalories] = useState(2800);
  const [weight, setWeight] = useState(USER_CONTEXT.startWeight);
  const [isUploading, setIsUploading] = useState(false);

  // Get available workout types from current cycle
  const availableWorkoutTypes = [...new Set([plannedToday, 'REST', ...trainingCycle, ...WORKOUT_TYPES])];

  // Populate form
  useEffect(() => {
    if (entryToEdit) {
      setDate(entryToEdit.date);
      setTrainingType(entryToEdit.trainingType || 'Push/Biceps');
      // 💡 NEW: Populate RPE
      setExercises(entryToEdit.exercises.map(ex => ({ ...ex, rpe: ex.rpe || 8 })) || []);
      setDuration(entryToEdit.duration || 60);
      setSleepHours(entryToEdit.sleepHours || 8);
      setDeepSleepPercent(entryToEdit.deepSleepPercent || 20);
      setRecoveryRating(entryToEdit.recoveryRating || 8);
      setProtein(entryToEdit.protein || 160);
      setCalories(entryToEdit.calories || 2800);
      setWeight(entryToEdit.weight || USER_CONTEXT.startWeight);
    } else {
      // New entry
      const lastWeight = allEntries.length > 0 ? allEntries[allEntries.length - 1].weight : USER_CONTEXT.startWeight;
      setWeight(lastWeight);
      setTrainingType(plannedToday); // Set to dynamic plan
    }
  }, [entryToEdit, allEntries, plannedToday]);

  // --- Exercise Handlers (Upgraded) ---
  const addExercise = (data = null) => {
    setExercises([...exercises, data || { name: '', weight: '', eachHand: false, sets: 3, reps: ['', '', ''], rpe: 8 }]);
  };

  const updateExercise = (index, field, value) => {
    const newExercises = [...exercises];
    newExercises[index] = { ...newExercises[index], [field]: value };
    if (field === 'sets') {
      const newReps = new Array(Number(value) || 0).fill('');
      for (let i = 0; i < Math.min(newReps.length, newExercises[index].reps.length); i++) {
        newReps[i] = newExercises[index].reps[i];
      }
      newExercises[index].reps = newReps;
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
        newExercises[index] = { ...lastEx, rpe: lastEx.rpe || 8 }; // Prefill with RPE
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
    const grade = getGrade(deepSleepPercent, totalSets);
    const deepSleepMinutes = Math.round((sleepHours * 60) * (deepSleepPercent / 100));

    const newNames = new Set(allExerciseNames);
    exercises.forEach(ex => {
      if (ex.name && !newNames.has(ex.name)) newNames.add(ex.name);
    });
    setAllExerciseNames(Array.from(newNames));

    const entry = {
      id: entryToEdit ? entryToEdit.id : generateId(),
      date,
      trainingType,
      plannedTrainingType: plannedToday, // 💡 NEW: Store what was *planned*
      cycleDay: cycleDay, // 💡 NEW: Store cycle day index
      exercises: trainingType === 'REST' ? [] : exercises.map(ex => ({
        name: ex.name,
        weight: Number(ex.weight),
        eachHand: ex.eachHand,
        sets: Number(ex.sets),
        reps: ex.reps.map(r => Number(r)),
        rpe: Number(ex.rpe), // 💡 NEW: Save RPE
        volumeLoad: calculateVolumeLoad(ex.weight, ex.sets, ex.reps) // 💡 NEW: Save Volume
      })),
      totalSets,
      totalVolume: exercises.reduce((sum, ex) => sum + calculateVolumeLoad(ex.weight, ex.sets, ex.reps), 0),
      duration: Number(duration),
      sleepHours: Number(sleepHours),
      deepSleepPercent: Number(deepSleepPercent),
      deepSleepMinutes,
      recoveryRating: Number(recoveryRating),
      protein: Number(protein),
      calories: Number(calories),
      weight: Number(weight),
      grade,
    };

    // (PR Check is the same)
    const prsFound = [];
    if (entry.trainingType !== 'REST') {
      entry.exercises.forEach(ex => {
        const prevPR = getPreviousPR(ex.name, allEntries, entry.id);
        if (ex.weight > prevPR) {
          const percent = prevPR > 0 ? `+${((ex.weight - prevPR) / prevPR * 100).toFixed(0)}%` : '+100%';
          prsFound.push(`🏆 New PR! ${ex.name}: ${ex.weight} lbs (${percent})`);
        }
      });
    }

    onSave(entry);
    prsFound.forEach(pr => showToast(pr, 'success'));
    if (prsFound.length === 0) showToast('Entry saved!', 'success');
  };
  
  // (File Upload is unchanged)
  const handleFileUpload = async (e) => { /* ... (rest of mock API call logic is unchanged) */ };

  // --- Render Form (Upgraded) ---
  return h('form', { onSubmit: handleSubmit, className: 'space-y-6 p-4' },
    h('h2', { className: 'text-2xl font-bold' }, entryToEdit ? 'Edit Log Entry' : 'New Log Entry'),
    h('div', { className: 'p-4 bg-slate-800 rounded-lg' }, /* ... (File Upload UI unchanged) ... */),
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
    h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' }, /* ... (Sleep UI unchanged) ... */),
    
    // --- Training Log (Upgraded) ---
    trainingType !== 'REST' && h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold' }, '💪 Training'),
      h('div', {}, /* ... (Duration UI unchanged) ... */),
      h('h4', { className: 'font-semibold' }, 'Exercises'),
      h('div', { className: 'space-y-4' },
        exercises.map((ex, i) => h('div', { key: i, className: 'p-3 bg-slate-700 rounded-lg space-y-3' },
          h('div', { className: 'flex justify-between items-center' },
            h('span', { className: 'font-semibold' }, `Exercise ${i + 1}`),
            h('button', { type: 'button', className: 'text-red-400', onClick: () => removeExercise(i) }, 'Remove')
          ),
          // 💡 NEW: Smart Coach Suggestion Box
          h(CoachSuggestionBox, { 
            exerciseName: ex.name, 
            allEntries, 
            todaySleepPercent: deepSleepPercent 
          }),
          h('div', {}, /* ... (Exercise Name) ... */ ),
          h('div', {}, /* ... (Load Previous) ... */ ),
          h('div', { className: 'grid grid-cols-2 gap-2' }, /* ... (Weight & Sets) ... */ ),
          h('div', { className: 'flex items-center' }, /* ... (Each hand checkbox) ... */),
          h('div', {}, /* ... (Reps per Set) ... */ ),
          
          // 💡 NEW: RPE Slider
          h(RpeSlider, { value: ex.rpe, onChange: (e) => updateExercise(i, 'rpe', e.target.value) })
        )),
        h(Button, { type: 'button', variant: 'secondary', onClick: () => addExercise() }, '+ Add Exercise')
      ),
      h('div', { className: 'text-lg font-bold' }, `Total Working Sets: ${exercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0)}`)
    ),
    h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' }, /* ... (Nutrition UI unchanged) ... */),
    h('div', { className: 'flex gap-4' },
      h(Button, { type: 'submit', variant: 'primary', className: 'flex-1' }, entryToEdit ? 'Update Entry' : 'Save Entry'),
      h(Button, { type: 'button', variant: 'secondary', onClick: onCancel }, 'Cancel')
    )
  );
};

// --- 📜 ENTRY CARD COMPONENT (UPGRADED) ---
const EntryCard = ({ entry, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 💡 NEW: Calculate avg RPE and total volume
  const totalVolume = entry.totalVolume || 0;
  const avgRPE = entry.exercises && entry.exercises.length > 0
    ? (entry.exercises.reduce((sum, ex) => sum + (ex.rpe || 0), 0) / entry.exercises.length).toFixed(1)
    : 'N/A';

  return h('div', { className: 'bg-slate-800 rounded-lg shadow-lg overflow-hidden' },
    h('div', {
      className: 'p-4 flex justify-between items-center cursor-pointer hover:bg-slate-700',
      onClick: () => setIsExpanded(!isExpanded)
    },
      h('div', { className: 'flex items-center gap-3' },
        h('span', { className: 'text-3xl' }, entry.trainingType === 'REST' ? '🛌' : '💪'),
        h('div', {},
          h('h3', { className: 'text-lg font-bold' }, `${entry.date} - ${entry.trainingType}`),
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
      h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 text-center' }, /* ... (Sleep/Nutrition unchanged) ... */),
      entry.exercises && entry.exercises.length > 0 && h('div', {},
        h('h4', { className: 'text-md font-semibold mb-2' }, 'Exercises'),
        h('ul', { className: 'space-y-1' },
          entry.exercises.map((ex, i) =>
            h('li', { key: i, className: 'flex justify-between text-sm bg-slate-700 p-2 rounded' },
              h('span', { className: 'font-medium' }, ex.name),
              h('span', {}, `${ex.weight} lbs | ${ex.sets}x(${ex.reps.join('/')})`),
              h('span', { className: 'text-slate-400' }, `RPE: ${ex.rpe || 'N/A'}`)
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
const Settings = ({ entries, setEntries, trainingCycle, setTrainingCycle }) => {
  const { showToast } = useToast();
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [customCycles, setCustomCycles] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_CYCLES_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  const exportData = () => {
    // 💡 NEW: Export custom cycles along with data
    const dataStr = JSON.stringify({ entries, trainingCycle, customCycles }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hypertrophy-backup-v2-${formatDate(new Date())}.json`;
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
          setEntries(imported); // Old format
        } else {
          // New format
          if (imported.entries) setEntries(imported.entries);
          if (imported.trainingCycle) setTrainingCycle(imported.trainingCycle);
          if (imported.customCycles) {
            setCustomCycles(imported.customCycles);
            localStorage.setItem(CUSTOM_CYCLES_KEY, JSON.stringify(imported.customCycles));
          }
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
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(CYCLE_KEY);
      localStorage.removeItem(CUSTOM_CYCLES_KEY);
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
            localStorage.setItem(CYCLE_KEY, JSON.stringify(newCycle));
            setShowCycleEditor(false);
          }
        })
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
  
  const [view, setView] = useState('dashboard');
  const [entryToEdit, setEntryToEdit] = useState(null);
  
  // Persist entries
  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(entries));
  }, [entries]);
  
  // Persist cycle
  useEffect(() => {
    localStorage.setItem(CYCLE_KEY, JSON.stringify(trainingCycle));
  }, [trainingCycle]);

  // --- DERIVED STATE (Upgraded) ---
  // 💡 NEW: Sort chronological for coach logic
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)); 
  
  const [allExerciseNames, setAllExerciseNames] = useState(() =>
    Array.from(new Set(entries.flatMap(e => e.exercises || []).map(ex => ex.name)))
  );
  const allPRs = calculateAllPRs(entries);
  
  // 💡 NEW: Dynamic calendar logic
  const { today: plannedToday, note: coachNote, cycleDay } = Coach.getDynamicCalendar(sortedEntries, trainingCycle);
  
  // Modals
  const [showAIModal, setShowAIModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);

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
    // 💡 NEW: Update exercise list if new one was added
    const newNames = new Set(allExerciseNames);
    entry.exercises.forEach(ex => {
      if (ex.name && !newNames.has(ex.name)) newNames.add(ex.name);
    });
    setAllExerciseNames(Array.from(newNames));
    
    setView('dashboard');
    setEntryToEdit(null);
  };

  const handleShowForm = (entry = null) => {
    setEntryToEdit(entry);
    setView('form');
  };
  
  const handleDeleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setShowDeleteModal(null);
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
          allEntries: sortedEntries, // Pass chronological
          allExerciseNames: allExerciseNames,
          setAllExerciseNames: setAllExerciseNames,
          trainingCycle: trainingCycle,
          plannedToday: plannedToday, // 💡 Pass plan
          cycleDay: cycleDay // 💡 Pass cycle day
        });
      case 'calendar':
        return h(TrainingCalendar, { 
          entries: sortedEntries, 
          trainingCycle, 
          dynamicToday: plannedToday 
        });
      case 'charts':
        return h(ExerciseProgressChart, { entries: sortedEntries, allExerciseNames });
      case 'settings':
        return h(Settings, { 
          entries: sortedEntries, 
          setEntries, 
          trainingCycle, 
          setTrainingCycle 
        });
      case 'dashboard':
      default:
        return h('div', { className: 'space-y-6' },
          // 💡 NEW: Today's Plan card
          h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
            h('h3', { className: 'text-lg font-semibold mb-2' }, '💡 Today\'s Plan'),
            h('p', { className: 'text-2xl font-bold text-cyan-400' }, plannedToday),
            h('p', { className: 'text-sm text-slate-300' }, coachNote)
          ),
          h(StatsSummary, { entries: sortedEntries }),
          h(Button, { 
            onClick: () => setShowAIModal(true), 
            variant: 'primary',
            className: 'w-full text-lg'
          }, '🤖 Get Full Workout (Mock)'),
          h(PRDashboard, { prs: allPRs }),
          h('h2', { className: 'text-xl font-bold' }, 'Recent Entries'),
          h('div', { className: 'space-y-4' },
            // 💡 NEW: Reverse sorted entries for display
            sortedEntries.length > 0
              ? [...sortedEntries].reverse().map(entry => h(EntryCard, {
                  key: entry.id,
                  entry: entry,
                  onEdit: handleShowForm,
                  onDelete: openDeleteModal
                }))
              : h('p', { className: 'text-slate-400' }, 'No entries yet. Log a workout!')
          )
        );
    }
  };

  return h(ToastProvider, null,
    h('div', { className: 'container mx-auto max-w-2xl p-4 pb-24' },
      h('header', { className: 'text-center my-6' },
        h('h1', { className: 'text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600' }, 'Hypertrophy PWA v3')
      ),
      h('main', {}, renderView()),
      
      // Modals
      showAIModal && h(AIWorkoutSuggestion, { 
        entries: sortedEntries, 
        prs: allPRs, 
        trainingCycle, 
        onClose: () => setShowAIModal(false) 
      }),
      h(Modal, { show: !!showDeleteModal, onClose: () => setShowDeleteModal(null), title: "Confirm Deletion" },
        h('div', {},
          h('p', { className: 'mb-4' }, 'Are you sure you want to delete this entry?'),
          h('div', { className: 'flex justify-end gap-4' },
            h(Button, { variant: 'secondary', onClick: () => setShowDeleteModal(null) }, 'Cancel'),
            h(Button, { variant: 'danger', onClick: () => handleDeleteEntry(showDeleteModal) }, 'Delete')
          )
        )
      ),
      
      // Bottom Nav Bar
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
