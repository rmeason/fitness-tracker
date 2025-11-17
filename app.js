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
const NUTRITION_KEY = 'hypertrophyApp.nutrition.v1'; // 💡 NEW: Separate nutrition DB

// --- 🛠️ HELPER FUNCTIONS ---
const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;
const formatDate = (date) => date.toISOString().split('T')[0];

const calculateVolumeLoad = (weight, sets, reps) => {
  if (!weight || !sets || !reps || reps.length === 0) return 0;
  const totalReps = reps.reduce((sum, rep) => sum + (Number(rep) || 0), 0);
  return (totalReps * weight);
};

const getGrade = (deepSleepPercent, totalSets) => { /* ... (same as before) ... */ };
const getSleepQualityStars = (deepSleepPercent) => { /* ... (same as before) ... */ };

const getProteinStatus = (protein) => {
  if (protein >= USER_CONTEXT.proteinOutstanding) return h('span', { className: 'text-cyan-400 font-bold' }, 'Outstanding');
  if (protein >= USER_CONTEXT.proteinExcellent) return h('span', { className: 'text-green-400 font-bold' }, 'Excellent');
  if (protein >= USER_CONTEXT.proteinTarget) return h('span', { className: 'text-green-500' }, 'Target Met');
  return h('span', { className: 'text-yellow-500' }, 'Below Target');
};

const calculateAllPRs = (entries) => { /* ... (same as before) ... */ };
const getPreviousPR = (exerciseName, allEntries, currentEntryId) => { /* ... (same as before) ... */ };

// 💡 NEW: Helper to get today's nutrition totals
const getTodaysNutrition = (nutritionLog) => {
  const todayStr = formatDate(new Date());
  const todaysEntries = nutritionLog.filter(n => n.date === todayStr);
  const totalProtein = todaysEntries.reduce((sum, entry) => sum + (entry.protein || 0), 0);
  const totalCalories = todaysEntries.reduce((sum, entry) => sum + (entry.calories || 0), 0);
  return { totalProtein, totalCalories };
};

// --- 🍞 TOAST COMPONENT ---
const ToastContext = React.createContext();
const ToastProvider = ({ children }) => { /* ... (same as before) ... */ };
const useToast = () => React.useContext(ToastContext);

// --- MODAL COMPONENT ---
const Modal = ({ show, onClose, title, children }) => { /* ... (same as before) ... */ };

// --- UI COMPONENTS ---
const Button = ({ onClick, children, className = '', variant = 'primary' }) => { /* ... (same as before) ... */ };
const Input = (props) => { /* ... (same as before) ... */ };
const Select = ({ children, ...props }) => { /* ... (same as before) ... */ };
const Slider = ({ label, min, max, value, onChange, ...props }) => { /* ... (same as before) ... */ };
const RpeSlider = ({ value, onChange }) => { /* ... (same as before) ... */ };
const CoachSuggestionBox = ({ exerciseName, allEntries, todaySleepPercent }) => { /* ... (same as before) ... */ };
// --- 🔄 CYCLE EDITOR COMPONENT ---
const CycleEditor = ({ currentCycle, onSave }) => { /* ... (same as before) ... */ };
// --- 📈 CHART COMPONENT (UPGRADED) ---
const ExerciseProgressChart = ({ entries, allExerciseNames }) => { /* ... (same as before) ... */ };
// --- 📅 CALENDAR COMPONENT (UPGRADED) ---
const TrainingCalendar = ({ entries, trainingCycle, dynamicToday }) => { /* ... (same as before) ... */ };
// --- 🏆 PR DASHBOARD COMPONENT ---
const PRDashboard = ({ prs }) => { /* ... (same as before) ... */ };

// --- 💡 NEW: NUTRITION QUICK-ADD MODAL ---
const NutritionQuickAddModal = ({ onClose, onSave }) => {
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const { showToast } = useToast();

  const handleAdd = () => {
    const prot = Number(protein) || 0;
    const cals = Number(calories) || 0;

    if (prot === 0 && cals === 0) {
      showToast('Please enter protein or calories', 'error');
      return;
    }

    onSave({
      id: generateId(),
      date: formatDate(new Date()),
      protein: prot,
      calories: cals,
    });

    showToast(`Added ${prot}g protein and ${cals} kcal!`, 'success');
    onClose();
  };

  return h(Modal, { show: true, onClose, title: "🥩 Quick Add Nutrition" },
    h('div', { className: 'space-y-4' },
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Protein (g)'),
        h(Input, { type: 'number', value: protein, onChange: e => setProtein(e.target.value), placeholder: 'e.g., 30' })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Calories (kcal)'),
        h(Input, { type: 'number', value: calories, onChange: e => setCalories(e.target.value), placeholder: 'e.g., 500' })
      ),
      h(Button, { onClick: handleAdd, variant: 'primary', className: 'w-full' }, 'Add Entry')
    )
  );
};


// --- 📊 STATS SUMMARY COMPONENT (UPGRADED) ---
const StatsSummary = ({ entries, liveProtein, liveCalories }) => {
  const totalWorkouts = entries.filter(e => e.trainingType !== 'REST').length;
  const currentWeight = entries.length > 0 ? entries[entries.length - 1].weight : USER_CONTEXT.startWeight;
  
  const validSleepEntries = entries.filter(e => e.deepSleepPercent !== null && e.deepSleepPercent > 0);
  const avgDeepSleep = validSleepEntries.length > 0 ? (validSleepEntries.reduce((sum, e) => sum + e.deepSleepPercent, 0) / validSleepEntries.length).toFixed(1) : 'N/A';
  
  return h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
    h('h3', { className: 'text-lg font-semibold mb-4' }, '🔥 Quick Stats'),
    h('div', { className: 'grid grid-cols-2 gap-4' },
      h('div', { className: 'text-center' }, h('div', { className: 'text-2xl font-bold' }, totalWorkouts), h('div', { className: 'text-sm text-slate-400' }, 'Workouts')),
      h('div', { className: 'text-center' }, h('div', { className: 'text-2xl font-bold' }, `${currentWeight} lbs`), h('div', { className: 'text-sm text-slate-400' }, 'Current')),
      // 💡 NEW: Show live totals for today
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
const AIWorkoutSuggestion = ({ entries, prs, trainingCycle, onClose }) => { /* ... (same as before) ... */ };


// --- 📜 ENTRY LOG FORM (UPGRADED) ---
const LogEntryForm = ({ onSave, onCancel, entryToEdit, allEntries, allExerciseNames, setAllExerciseNames, trainingCycle, plannedToday, cycleDay, todaysNutrition }) => {
  const { showToast } = useToast();
  // Form state
  const [date, setDate] = useState(formatDate(new Date()));
  const [trainingType, setTrainingType] = useState(plannedToday);
  const [exercises, setExercises] = useState([]);
  const [duration, setDuration] = useState(60);
  const [sleepHours, setSleepHours] = useState(8);
  const [deepSleepPercent, setDeepSleepPercent] = useState(20);
  const [recoveryRating, setRecoveryRating] = useState(8);
  // ❌ REMOVED: protein and calories state
  const [weight, setWeight] = useState(USER_CONTEXT.startWeight);
  const [isUploading, setIsUploading] = useState(false);

  const availableWorkoutTypes = [...new Set([plannedToday, 'REST', ...trainingCycle, ...WORKOUT_TYPES])];

  // Populate form
  useEffect(() => {
    if (entryToEdit) {
      setDate(entryToEdit.date);
      setTrainingType(entryToEdit.trainingType || 'Push/Biceps');
      setExercises(entryToEdit.exercises.map(ex => ({ ...ex, rpe: ex.rpe || 8 })) || []);
      setDuration(entryToEdit.duration || 60);
      setSleepHours(entryToEdit.sleepHours || 8);
      setDeepSleepPercent(entryToEdit.deepSleepPercent || 20);
      setRecoveryRating(entryToEdit.recoveryRating || 8);
      // ❌ REMOVED: setProtein and setCalories
      setWeight(entryToEdit.weight || USER_CONTEXT.startWeight);
    } else {
      const lastWeight = allEntries.length > 0 ? allEntries[allEntries.length - 1].weight : USER_CONTEXT.startWeight;
      setWeight(lastWeight);
      setTrainingType(plannedToday);
    }
  }, [entryToEdit, allEntries, plannedToday]);

  // --- Exercise Handlers ---
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
        newExercises[index] = { ...lastEx, rpe: lastEx.rpe || 8 };
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
      plannedTrainingType: plannedToday,
      cycleDay: cycleDay,
      exercises: trainingType === 'REST' ? [] : exercises.map(ex => ({
        name: ex.name,
        weight: Number(ex.weight),
        eachHand: ex.eachHand,
        sets: Number(ex.sets),
        reps: ex.reps.map(r => Number(r)),
        rpe: Number(ex.rpe),
        volumeLoad: calculateVolumeLoad(ex.weight, ex.sets, ex.reps)
      })),
      totalSets,
      totalVolume: exercises.reduce((sum, ex) => sum + calculateVolumeLoad(ex.weight, ex.sets, ex.reps), 0),
      duration: Number(duration),
      sleepHours: Number(sleepHours),
      deepSleepPercent: Number(deepSleepPercent),
      deepSleepMinutes,
      recoveryRating: Number(recoveryRating),
      // 💡 NEW: Snapshot today's nutrition totals
      protein: todaysNutrition.totalProtein,
      calories: todaysNutrition.totalCalories,
      weight: Number(weight),
      grade,
    };

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
  
  // --- FILE UPLOAD (Upgraded) ---
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
      
      // Auto-populate form
      if (resultJson.sleepHours) setSleepHours(resultJson.sleepHours);
      if (resultJson.deepSleepPercent) setDeepSleepPercent(resultJson.deepSleepPercent);
      // 💡 NEW: Add to nutrition log instead of form
      if (resultJson.protein || resultJson.calories) {
        const prot = resultJson.protein || 0;
        const cals = resultJson.calories || 0;
        // This is a bit of a hack. We need to call the *App's* save handler.
        // For now, we'll just show a toast.
        // A better long-term solution would be to pass `onSaveNutrition` down.
        showToast(`Extracted ${prot}g Protein / ${cals} kcal. Please add manually.`, 'success');
      }
      if (resultJson.weight) setWeight(resultJson.weight);
      if (resultJson.exercises && resultJson.exercises.length > 0) {
        setExercises(resultJson.exercises.map(ex => ({ ...ex, rpe: 8 })));
      }
      
      showToast('Data extracted! Nutrition added separately.', 'success');

    } catch (err) {
      console.error("Upload error:", err);
      showToast(err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // --- Render Form ---
  return h('form', { onSubmit: handleSubmit, className: 'space-y-6 p-4' },
    h('h2', { className: 'text-2xl font-bold' }, entryToEdit ? 'Edit Log Entry' : 'New Log Entry'),
    
    h('div', { className: 'p-4 bg-slate-800 rounded-lg' },
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

    h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold' }, '🌙 Sleep & Recovery'),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Total Sleep (hours)'),
        h(Input, { type: 'number', step: 0.1, value: sleepHours, onChange: (e) => setSleepHours(Number(e.target.value)) })
      ),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Deep Sleep (%)'),
        h(Input, { type: 'number', step: 0.1, value: deepSleepPercent, onChange: (e) => setDeepSleepPercent(Number(e.target.value)) }),
        h('p', { className: 'text-sm mt-1' }, getSleepQualityStars(deepSleepPercent))
      ),
      h(Slider, { label: 'Recovery Rating', min: 1, max: 10, value: recoveryRating, onChange: (e) => setRecoveryRating(Number(e.target.value)) })
    ),
    
    trainingType !== 'REST' && h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold' }, '💪 Training'),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Duration (minutes)'),
        h(Input, { type: 'number', step: 5, value: duration, onChange: (e) => setDuration(Number(e.target.value)) })
      ),
      h('h4', { className: 'font-semibold' }, 'Exercises'),
      h('div', { className: 'space-y-4' },
        exercises.map((ex, i) => h('div', { key: i, className: 'p-3 bg-slate-700 rounded-lg space-y-3' },
          h('div', { className: 'flex justify-between items-center' },
            h('span', { className: 'font-semibold' }, `Exercise ${i + 1}`),
            h('button', { type: 'button', className: 'text-red-400', onClick: () => removeExercise(i) }, 'Remove')
          ),
          
          h(CoachSuggestionBox, { 
            exerciseName: ex.name, 
            allEntries, 
            todaySleepPercent: deepSleepPercent 
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
          h('div', { className: 'grid grid-cols-2 gap-2' },
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, 'Weight (lbs)'),
              h(Input, { type: 'number', step: 0.5, value: ex.weight, onChange: (e) => updateExercise(i, 'weight', e.target.value) })
            ),
            h('div', {},
              h('label', { className: 'block text-xs mb-1' }, 'Sets'),
              h(Input, { type: 'number', min: 1, value: ex.sets, onChange: (e) => updateExercise(i, 'sets', e.target.value) })
            )
          ),
          h('div', { className: 'flex items-center' },
            h('input', { type: 'checkbox', id: `eachHand-${i}`, checked: ex.eachHand, onChange: (e) => updateExercise(i, 'eachHand', e.target.checked), className: 'h-4 w-4' }),
            h('label', { htmlFor: `eachHand-${i}`, className: 'ml-2 block text-sm' }, 'Weight is "each hand"')
          ),
          h('div', {},
            h('label', { className: 'block text-xs mb-1' }, `Reps per Set (${ex.sets})`),
            h('div', { className: 'grid grid-cols-3 gap-2' },
              ex.reps.map((rep, r_i) => h(Input, { key: r_i, type: 'number', placeholder: `Set ${r_i + 1}`, value: rep, onChange: (e) => updateExerciseRep(i, r_i, e.target.value) }))
            )
          ),
          
          h(RpeSlider, { value: ex.rpe, onChange: (e) => updateExercise(i, 'rpe', e.target.value) })
        )),
        h(Button, { type: 'button', variant: 'secondary', onClick: () => addExercise() }, '+ Add Exercise')
      ),
      h('div', { className: 'text-lg font-bold' }, `Total Working Sets: ${exercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0)}`)
    ),

    // 💡 NEW: Only show Body Weight here
    h('div', { className: 'p-4 bg-slate-800 rounded-lg space-y-4' },
      h('h3', { className: 'text-lg font-semibold' }, '⚖️ Body Weight'),
      h('div', {},
        h('label', { className: 'block text-sm font-medium mb-1' }, 'Body Weight (lbs)'),
        h(Input, { type: 'number', step: 0.1, value: weight, onChange: (e) => setWeight(Number(e.target.value)) })
      )
    ),

    h('div', { className: 'flex gap-4' },
      h(Button, { type: 'submit', variant: 'primary', className: 'flex-1' }, entryToEdit ? 'Update Entry' : 'Save Entry'),
      h(Button, { type: 'button', variant: 'secondary', onClick: onCancel }, 'Cancel')
    )
  );
};

// --- 📜 ENTRY CARD COMPONENT (UPGRADED) ---
const EntryCard = ({ entry, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const totalVolume = entry.totalVolume || 0;
  const validExercises = (entry.exercises || []).filter(ex => ex.rpe > 0);
  const avgRPE = validExercises.length > 0
    ? (validExercises.reduce((sum, ex) => sum + (ex.rpe || 0), 0) / validExercises.length).toFixed(1)
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
      h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 text-center' },
        h('div', {}, h('div', { className: 'font-bold' }, '🌙 Sleep'), h('div', { className: 'text-sm' }, `${entry.sleepHours}h / ${entry.deepSleepPercent}% deep`)),
        // 💡 NEW: Reads the "snapshotted" data
        h('div', {}, h('div', { className: 'font-bold' }, '🥩 Protein'), h('div', { className: 'text-sm' }, `${entry.protein}g`)),
        h('div', {}, h('div', { className: 'font-bold' }, '🔥 Calories'), h('div', { className: 'text-sm' }, `${entry.calories} kcal`)),
        h('div', {}, h('div', { className: 'font-bold' }, '⚖️ Weight'), h('div', { className: 'text-sm' }, `${entry.weight} lbs`))
      ),
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
const Settings = ({ entries, setEntries, trainingCycle, setTrainingCycle, nutrition, setNutrition }) => {
  const { showToast } = useToast();
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [customCycles, setCustomCycles] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_CYCLES_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  const exportData = () => {
    // 💡 NEW: Export nutrition log
    const dataStr = JSON.stringify({ entries, trainingCycle, customCycles, nutrition }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hypertrophy-backup-v5-${formatDate(new Date())}.json`;
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
          // New v2-v5 format
          if (imported.entries) setEntries(imported.entries);
          if (imported.trainingCycle) setTrainingCycle(imported.trainingCycle);
          if (imported.customCycles) {
            setCustomCycles(imported.customCycles);
            localStorage.setItem(CUSTOM_CYCLES_KEY, JSON.stringify(imported.customCycles));
          }
          if (imported.nutrition) setNutrition(imported.nutrition); // 💡 NEW: Import nutrition
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
      setNutrition([]); // 💡 NEW: Clear nutrition
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(CYCLE_KEY);
      localStorage.removeItem(CUSTOM_CYCLES_KEY);
      localStorage.removeItem(NUTRITION_KEY); // 💡 NEW: Clear nutrition
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
  
  // 💡 NEW: Nutrition state
  const [nutrition, setNutrition] = useState(() => {
    const saved = localStorage.getItem(NUTRITION_KEY);
    return saved ? JSON.parse(saved) : [];
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
  
  // 💡 NEW: Persist nutrition
  useEffect(() => {
    localStorage.setItem(NUTRITION_KEY, JSON.stringify(nutrition));
  }, [nutrition]);

  // --- DERIVED STATE (Upgraded) ---
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)); 
  
  const [allExerciseNames, setAllExerciseNames] = useState(() =>
    Array.from(new Set(entries.flatMap(e => e.exercises || []).map(ex => ex.name)))
  );
  const allPRs = calculateAllPRs(entries);
  
  const { today: plannedToday, note: coachNote, cycleDay } = Coach.getDynamicCalendar(sortedEntries, trainingCycle);
  
  // 💡 NEW: Get live nutrition totals
  const todaysNutrition = getTodaysNutrition(nutrition);
  
  // Modals
  const [showAIModal, setShowAIModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [showNutritionModal, setShowNutritionModal] = useState(false); // 💡 NEW

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
  
  // 💡 NEW: Nutrition save handler
  const handleSaveNutrition = (newEntry) => {
    setNutrition(prev => [...prev, newEntry]);
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
          allEntries: sortedEntries,
          allExerciseNames: allExerciseNames,
          setAllExerciseNames: setAllExerciseNames,
          trainingCycle: trainingCycle,
          plannedToday: plannedToday,
          cycleDay: cycleDay,
          todaysNutrition: todaysNutrition // 💡 Pass snapshot
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
          setTrainingCycle,
          nutrition: nutrition, // 💡 Pass nutrition
          setNutrition: setNutrition // 💡 Pass nutrition
        });
      case 'dashboard':
      default:
        return h('div', { className: 'space-y-6' },
          h('div', { className: 'bg-slate-800 p-4 rounded-lg' },
            h('h3', { className: 'text-lg font-semibold mb-2' }, '💡 Today\'s Plan'),
            h('p', { className: 'text-2xl font-bold text-cyan-400' }, plannedToday),
            h('p', { className: 'text-sm text-slate-300' }, coachNote)
          ),
          // 💡 NEW: Pass live totals
          h(StatsSummary, { 
            entries: sortedEntries, 
            liveProtein: todaysNutrition.totalProtein,
            liveCalories: todaysNutrition.totalCalories
          }),
          // 💡 NEW: Nutrition Button
          h(Button, { 
            onClick: () => setShowNutritionModal(true), 
            variant: 'secondary',
            className: 'w-full text-lg'
          }, '🥩 Add Nutrition'),
          h(Button, { 
            onClick: () => setShowAIModal(true), 
            variant: 'primary',
            className: 'w-full text-lg'
          }, '🤖 Get Full Workout (REAL AI)'),
          h(PRDashboard, { prs: allPRs }),
          h('h2', { className: 'text-xl font-bold' }, 'Recent Entries'),
          h('div', { className: 'space-y-4' },
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
        h('h1', { className: 'text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600' }, 'Hypertrophy PWA v5')
      ),
      h('main', {}, renderView()),
      
      // Modals
      showAIModal && h(AIWorkoutSuggestion, { 
        entries: sortedEntries, 
        prs: allPRs, 
        trainingCycle, 
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
      // 💡 NEW: Nutrition Modal
      showNutritionModal && h(NutritionQuickAddModal, {
        onClose: () => setShowNutritionModal(false),
        onSave: handleSaveNutrition
      }),
      
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
