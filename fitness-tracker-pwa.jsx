import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, Moon, Utensils, Dumbbell, Plus, X, ChevronDown, ChevronUp, Edit2, Trash2, Award, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function FitnessTracker() {
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState(null);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    trainingType: 'Push/Biceps',
    exercises: [],
    totalSets: 0,
    duration: '',
    sleepTotal: '',
    deepSleepPercent: '',
    protein: '',
    calories: '',
    weight: '',
    recovery: 5,
    notes: ''
  });

  const [exerciseInput, setExerciseInput] = useState({ name: '', weight: '', sets: '', reps: [], weightType: 'total' });
  const [showExerciseHistory, setShowExerciseHistory] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showCharts, setShowCharts] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [newPRs, setNewPRs] = useState([]);

  // Update reps array when sets count changes
  const updateSetsCount = (count) => {
    const numSets = parseInt(count) || 0;
    const newReps = Array(numSets).fill('').map((_, i) => exerciseInput.reps[i] || '');
    setExerciseInput({...exerciseInput, sets: count, reps: newReps});
  };

  const updateRep = (index, value) => {
    const newReps = [...exerciseInput.reps];
    newReps[index] = value;
    setExerciseInput({...exerciseInput, reps: newReps});
  };

  // Get unique exercises from history
  const getExerciseHistoryList = () => {
    const exerciseMap = new Map();
    entries.forEach(entry => {
      entry.exercises.forEach(ex => {
        const key = ex.name.toLowerCase();
        if (!exerciseMap.has(key) || 
            new Date(entry.date) > new Date(exerciseMap.get(key).date)) {
          exerciseMap.set(key, { ...ex, date: entry.date });
        }
      });
    });
    return Array.from(exerciseMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const selectExercise = (ex) => {
    const repsArray = ex.reps.split('/').map(r => r.trim());
    setExerciseInput({
      name: ex.name,
      weight: ex.weight,
      sets: ex.sets,
      reps: repsArray,
      weightType: ex.weightType || 'total'
    });
    setShowExerciseHistory(false);
  };

  const processFile = async (file) => {
    setIsProcessing(true);
    setUploadError('');

    try {
      let content = [];
      
      if (file.type.startsWith('image/')) {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });

        content = [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type,
              data: base64Data,
            }
          },
          {
            type: "text",
            text: `Extract workout data from this image. This could be a Fitbit screenshot showing sleep data, or a photo of workout notes. 

Return ONLY a valid JSON object with this exact structure (use null for any fields you cannot find):
{
  "sleepTotal": "hours as decimal (e.g., 7.5)",
  "deepSleepPercent": "percentage as decimal (e.g., 15.8)",
  "exercises": [
    {
      "name": "exercise name",
      "weight": "weight in lbs",
      "sets": "number of sets",
      "reps": "reps per set separated by / (e.g., 8/7/6/5)",
      "weightType": "total or each"
    }
  ],
  "protein": "grams",
  "calories": "total calories",
  "weight": "body weight in lbs",
  "totalSets": "total working sets",
  "duration": "workout duration (e.g., 1h 15m)",
  "recovery": "1-10 scale",
  "notes": "any additional notes or observations"
}

DO NOT include any text outside the JSON object. DO NOT use markdown code blocks.`
          }
        ];
      } else if (file.type === 'text/plain') {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(file);
        });

        content = [
          {
            type: "text",
            text: `Extract workout data from these notes:

${text}

Return ONLY a valid JSON object with this exact structure (use null for any fields you cannot find):
{
  "sleepTotal": "hours as decimal (e.g., 7.5)",
  "deepSleepPercent": "percentage as decimal (e.g., 15.8)",
  "exercises": [
    {
      "name": "exercise name",
      "weight": "weight in lbs",
      "sets": "number of sets",
      "reps": "reps per set separated by / (e.g., 8/7/6/5)",
      "weightType": "total or each"
    }
  ],
  "protein": "grams",
  "calories": "total calories",
  "weight": "body weight in lbs",
  "totalSets": "total working sets",
  "duration": "workout duration (e.g., 1h 15m)",
  "recovery": "1-10 scale",
  "notes": "any additional notes or observations"
}

DO NOT include any text outside the JSON object. DO NOT use markdown code blocks.`
          }
        ];
      } else {
        throw new Error('Unsupported file type. Please upload an image or text file.');
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content }]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let responseText = data.content[0].text;
      responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      const extractedData = JSON.parse(responseText);

      const newFormData = { ...formData };
      
      if (extractedData.sleepTotal) newFormData.sleepTotal = extractedData.sleepTotal;
      if (extractedData.deepSleepPercent) newFormData.deepSleepPercent = extractedData.deepSleepPercent;
      if (extractedData.protein) newFormData.protein = extractedData.protein;
      if (extractedData.calories) newFormData.calories = extractedData.calories;
      if (extractedData.weight) newFormData.weight = extractedData.weight;
      if (extractedData.totalSets) newFormData.totalSets = extractedData.totalSets;
      if (extractedData.duration) newFormData.duration = extractedData.duration;
      if (extractedData.recovery) newFormData.recovery = extractedData.recovery;
      if (extractedData.notes) newFormData.notes = extractedData.notes;
      
      if (extractedData.exercises && extractedData.exercises.length > 0) {
        const processedExercises = extractedData.exercises.map((ex, i) => ({
          ...ex,
          id: Date.now() + i
        }));
        newFormData.exercises = [...newFormData.exercises, ...processedExercises];
      }

      setFormData(newFormData);
      setIsProcessing(false);
      
    } catch (error) {
      console.error("Error processing file:", error);
      setUploadError(error.message || "Failed to process file. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  };

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fitnessEntries');
    if (saved) {
      setEntries(JSON.parse(saved));
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('fitnessEntries', JSON.stringify(entries));
  }, [entries]);

  const addExercise = () => {
    if (exerciseInput.name && exerciseInput.weight && exerciseInput.sets) {
      const repsString = exerciseInput.reps.join('/');
      setFormData({
        ...formData,
        exercises: [...formData.exercises, { 
          ...exerciseInput, 
          reps: repsString,
          id: Date.now() 
        }]
      });
      setExerciseInput({ name: '', weight: '', sets: '', reps: [], weightType: 'total' });
    }
  };

  const removeExercise = (id) => {
    setFormData({
      ...formData,
      exercises: formData.exercises.filter(ex => ex.id !== id)
    });
  };

  const calculateGrade = () => {
    const deepSleep = parseFloat(formData.deepSleepPercent) || 0;
    const sets = parseInt(formData.totalSets) || 0;
    
    if (deepSleep >= 20 && sets >= 22) return 'S++';
    if (deepSleep >= 15 && sets >= 20) return 'S/A+';
    if (deepSleep >= 12 && sets >= 16) return 'A/A+';
    if (deepSleep >= 10 && sets >= 14) return 'B+';
    if (deepSleep >= 8 && sets >= 12) return 'B';
    return 'C+';
  };

  // Detect PRs in current entry
  const detectPRs = (currentEntry) => {
    const prs = [];
    const previousEntries = entries.filter(e => e.id !== currentEntry.id);
    
    currentEntry.exercises.forEach(ex => {
      const key = ex.name.toLowerCase();
      const currentWeight = parseFloat(ex.weight) || 0;
      
      let previousMax = 0;
      previousEntries.forEach(entry => {
        entry.exercises.forEach(prevEx => {
          if (prevEx.name.toLowerCase() === key) {
            const prevWeight = parseFloat(prevEx.weight) || 0;
            if (prevWeight > previousMax) previousMax = prevWeight;
          }
        });
      });
      
      if (currentWeight > previousMax && previousMax > 0) {
        prs.push({
          exercise: ex.name,
          newWeight: currentWeight,
          oldWeight: previousMax,
          improvement: ((currentWeight - previousMax) / previousMax * 100).toFixed(1)
        });
      }
    });
    
    return prs;
  };

  const submitEntry = () => {
    const newEntry = {
      ...formData,
      id: editingId || Date.now(),
      deepSleepMinutes: formData.sleepTotal && formData.deepSleepPercent 
        ? Math.round((parseFloat(formData.sleepTotal) * parseFloat(formData.deepSleepPercent) / 100) * 60)
        : 0,
      grade: calculateGrade()
    };
    
    // Detect PRs
    const detectedPRs = detectPRs(newEntry);
    if (detectedPRs.length > 0) {
      setNewPRs(detectedPRs);
      setTimeout(() => setNewPRs([]), 5000); // Clear after 5 seconds
    }
    
    if (editingId) {
      setEntries(entries.map(e => e.id === editingId ? newEntry : e));
      setEditingId(null);
    } else {
      setEntries([newEntry, ...entries]);
    }
    
    setFormData({
      date: new Date().toISOString().split('T')[0],
      trainingType: 'Push/Biceps',
      exercises: [],
      totalSets: 0,
      duration: '',
      sleepTotal: '',
      deepSleepPercent: '',
      protein: '',
      calories: '',
      weight: '',
      recovery: 5,
      notes: ''
    });
    setShowForm(false);
  };

  const editEntry = (entry) => {
    setFormData({
      date: entry.date,
      trainingType: entry.trainingType,
      exercises: entry.exercises,
      totalSets: entry.totalSets,
      duration: entry.duration,
      sleepTotal: entry.sleepTotal,
      deepSleepPercent: entry.deepSleepPercent,
      protein: entry.protein,
      calories: entry.calories || '',
      weight: entry.weight,
      recovery: entry.recovery,
      notes: entry.notes
    });
    setEditingId(entry.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteEntry = (id) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = () => {
    const id = deleteConfirm;
    const newEntries = entries.filter(e => e.id !== id);
    setEntries(newEntries);
    localStorage.setItem('fitnessEntries', JSON.stringify(newEntries));
    
    if (expandedEntry === id) {
      setExpandedEntry(null);
    }
    
    setDeleteConfirm(null);
  };

  // Get current benchmarks
  const getBenchmarks = () => {
    const exerciseMaxes = new Map();
    
    entries.forEach(entry => {
      entry.exercises.forEach(ex => {
        const key = ex.name.toLowerCase();
        const weight = parseFloat(ex.weight) || 0;
        
        if (!exerciseMaxes.has(key) || weight > exerciseMaxes.get(key).weight) {
          exerciseMaxes.set(key, {
            name: ex.name,
            weight: weight,
            date: entry.date,
            sets: ex.sets,
            reps: ex.reps
          });
        }
      });
    });
    
    return Array.from(exerciseMaxes.values())
      .sort((a, b) => b.weight - a.weight);
  };

  // Get exercise history for charting
  const getExerciseHistory = (exerciseName) => {
    const history = [];
    
    entries.slice().reverse().forEach(entry => {
      entry.exercises.forEach(ex => {
        if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
          history.push({
            date: entry.date,
            weight: parseFloat(ex.weight) || 0
          });
        }
      });
    });
    
    return history;
  };

  // Get unique exercises for chart selection
  const getUniqueExercises = () => {
    const exercises = new Set();
    entries.forEach(entry => {
      entry.exercises.forEach(ex => {
        exercises.add(ex.name);
      });
    });
    return Array.from(exercises).sort();
  };

  // Generate 14-day calendar
  const generate14DayCalendar = () => {
    const days = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const entry = entries.find(e => e.date === dateStr);
      const dayOfWeek = date.getDay();
      
      // Determine expected training based on 14-day cycle
      let expectedType = 'REST';
      const cycleDay = i % 14;
      
      if (cycleDay === 1 || cycleDay === 5) expectedType = 'Push/Biceps';
      else if (cycleDay === 3 || cycleDay === 8 || cycleDay === 12) expectedType = 'Pull/Triceps';
      else if (cycleDay === 6 || cycleDay === 13) expectedType = 'Legs/Core';
      else if (cycleDay === 10) expectedType = 'Push/Biceps';
      
      days.push({
        date: dateStr,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        expected: expectedType,
        actual: entry ? entry.trainingType : null,
        completed: !!entry,
        isToday: dateStr === today.toISOString().split('T')[0]
      });
    }
    
    return days;
  };

  const generateWorkoutSuggestion = async () => {
    setLoadingSuggestion(true);
    setSuggestion(null);

    try {
      const recentWorkouts = entries.slice(0, 10).map(e => ({
        date: e.date,
        type: e.trainingType,
        exercises: e.exercises.map(ex => `${ex.name}: ${ex.weight}lbs`).join(', '),
        sets: e.totalSets,
        deepSleep: e.deepSleepPercent
      }));

      const benchmarks = getBenchmarks().slice(0, 10).map(b => `${b.name}: ${b.weight} lbs`).join(', ');

      const lastEntry = entries[0];
      const lastSleep = lastEntry ? `${lastEntry.deepSleepPercent}% (${lastEntry.sleepTotal}h)` : 'Unknown';

      const prompt = `You are a hypertrophy training coach. Analyze this training data and provide a workout recommendation for TODAY.

TRAINING SCHEDULE (14-day cycle):
Week 1: Rest, Push/Bi, Rest, Pull/Tri, Rest, Push/Bi, Legs
Week 2: Rest, Pull/Tri, Rest, Push/Bi, Rest, Pull/Tri, Legs

RECENT WORKOUTS (last 10):
${JSON.stringify(recentWorkouts, null, 2)}

CURRENT STRENGTH BENCHMARKS:
${benchmarks}

LAST NIGHT'S SLEEP: ${lastSleep}

GUIDELINES:
- 20%+ deep sleep → 22-24 working sets optimal
- 15-20% deep sleep → 20-22 working sets
- 12-16% deep sleep → 16-20 working sets
- <12% deep sleep → 12-16 working sets or rest
- Off-cycle (natural training, no supplements)
- Body composition phase at 139.5 lbs

Provide a recommendation with:
1. What training type to do today (or rest)
2. Recommended volume (sets) based on sleep
3. 3-5 suggested exercises with target weights
4. Any special notes or adjustments

Return ONLY valid JSON:
{
  "recommendation": "Push/Biceps, Pull/Triceps, Legs/Core, or REST",
  "recommendedSets": "number",
  "reasoning": "brief explanation",
  "exercises": [
    {"name": "exercise", "weight": "weight", "sets": "sets", "reps": "target reps"}
  ],
  "notes": "any additional guidance"
}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let responseText = data.content[0].text;
      responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      const suggestionData = JSON.parse(responseText);
      setSuggestion(suggestionData);
      setLoadingSuggestion(false);
      
    } catch (error) {
      console.error("Error generating suggestion:", error);
      setSuggestion({ error: "Failed to generate suggestion. Please try again." });
      setLoadingSuggestion(false);
    }
  };

  const getSleepTargetStatus = (percent) => {
    const p = parseFloat(percent);
    if (p >= 20) return '⭐⭐⭐ PERSONAL RECORD RANGE';
    if (p >= 15) return '⭐⭐ TARGET RANGE';
    if (p >= 12) return '⭐ BASELINE RANGE';
    return 'Below Baseline';
  };

  const getProteinStatus = (grams) => {
    const g = parseInt(grams);
    if (g >= 160) return 'Outstanding';
    if (g >= 150) return 'Excellent';
    if (g >= 140) return 'Target Met';
    return 'Below Target';
  };

  const getCalorieStatus = (cals, isTrainingDay) => {
    const c = parseInt(cals);
    const trainingTarget = isTrainingDay ? 2800 : 2500;
    if (c >= 3200) return 'Surplus';
    if (c >= trainingTarget) return 'Target Met';
    if (c >= trainingTarget - 300) return 'Close';
    return 'Below Target';
  };

  const stats = {
    avgDeepSleep: entries.length > 0 
      ? (entries.reduce((sum, e) => sum + parseFloat(e.deepSleepPercent || 0), 0) / entries.length).toFixed(1)
      : 0,
    avgProtein: entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + parseInt(e.protein || 0), 0) / entries.length)
      : 0,
    avgCalories: entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + parseInt(e.calories || 0), 0) / entries.length)
      : 0,
    totalWorkouts: entries.length,
    targetSleepDays: entries.filter(e => parseFloat(e.deepSleepPercent) >= 15).length,
    currentWeight: entries.length > 0 && entries[0].weight ? entries[0].weight : '139.5'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border-2 border-red-500/50 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-red-400 mb-3">Delete Entry?</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete this entry? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR Notification */}
      {newPRs.length > 0 && (
        <div className="fixed top-4 right-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-4 rounded-lg shadow-2xl z-50 max-w-sm animate-bounce">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-6 h-6" />
            <h3 className="font-bold text-lg">New Personal Record!</h3>
          </div>
          {newPRs.map((pr, i) => (
            <div key={i} className="text-sm">
              {pr.exercise}: {pr.newWeight} lbs (+{pr.improvement}%)
            </div>
          ))}
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Hypertrophy Tracker Pro
          </h1>
          <p className="text-slate-400">Body Composition Phase - 14-Day Cycle</p>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur p-4 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Dumbbell className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">Workouts</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalWorkouts}</div>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur p-4 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Moon className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-slate-400">Avg Deep Sleep</span>
            </div>
            <div className="text-2xl font-bold">{stats.avgDeepSleep}%</div>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur p-4 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Utensils className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-400">Avg Protein</span>
            </div>
            <div className="text-2xl font-bold">{stats.avgProtein}g</div>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur p-4 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Utensils className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-slate-400">Avg Calories</span>
            </div>
            <div className="text-2xl font-bold">{stats.avgCalories}</div>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur p-4 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">Weight</span>
            </div>
            <div className="text-2xl font-bold">{stats.currentWeight} lbs</div>
          </div>
        </div>

        {/* Benchmark Dashboard */}
        {getBenchmarks().length > 0 && (
          <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-700/50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-yellow-300">Current PRs</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {getBenchmarks().slice(0, 6).map((benchmark, i) => (
                <div key={i} className="bg-slate-800/50 rounded p-3">
                  <div className="font-semibold text-sm text-yellow-300">{benchmark.name}</div>
                  <div className="text-2xl font-bold text-white">{benchmark.weight} lbs</div>
                  <div className="text-xs text-slate-400">
                    {benchmark.sets} sets × {benchmark.reps} reps • {benchmark.date}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 14-Day Calendar & Charts Toggle */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2"
          >
            <Calendar className="w-5 h-5" />
            {showCalendar ? 'Hide' : 'Show'} 14-Day Calendar
          </button>
          
          <button
            onClick={() => setShowCharts(!showCharts)}
            disabled={getUniqueExercises().length === 0}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            <BarChart3 className="w-5 h-5" />
            {showCharts ? 'Hide' : 'Show'} Progress Charts
          </button>
        </div>

        {/* 14-Day Calendar View */}
        {showCalendar && (
          <div className="bg-slate-800/70 backdrop-blur border border-slate-700 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-lg mb-3 text-purple-300">Next 14 Days</h3>
            <div className="grid grid-cols-7 gap-2">
              {generate14DayCalendar().map((day, i) => (
                <div
                  key={i}
                  className={`p-3 rounded border ${
                    day.isToday ? 'border-yellow-500 bg-yellow-900/20' :
                    day.completed ? 'border-green-700 bg-green-900/20' :
                    'border-slate-600 bg-slate-700/30'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-400">{day.dayName}</div>
                  <div className="text-xs text-slate-500 mb-1">{day.date.slice(5)}</div>
                  <div className={`text-xs font-bold ${
                    day.completed && day.actual === day.expected ? 'text-green-400' :
                    day.completed ? 'text-yellow-400' :
                    'text-slate-400'
                  }`}>
                    {day.actual || day.expected}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exercise Charts */}
        {showCharts && (
          <div className="bg-slate-800/70 backdrop-blur border border-slate-700 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-lg mb-3 text-cyan-300">Exercise Progression</h3>
            <div className="mb-4">
              <select
                value={selectedExercise || ''}
                onChange={(e) => setSelectedExercise(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              >
                <option value="">Select an exercise</option>
                {getUniqueExercises().map((ex, i) => (
                  <option key={i} value={ex}>{ex}</option>
                ))}
              </select>
            </div>
            
            {selectedExercise && getExerciseHistory(selectedExercise).length > 0 && (
              <div className="bg-slate-900/50 rounded p-4">
                <h4 className="font-semibold mb-3">{selectedExercise} - Weight Progression</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={getExerciseHistory(selectedExercise)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Add Entry Button */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full mb-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all"
        >
          {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {showForm ? 'Cancel' : editingId ? 'Edit Entry' : 'Add New Entry'}
        </button>

        {/* Workout Suggestion */}
        <div className="mb-6">
          <button
            onClick={generateWorkoutSuggestion}
            disabled={loadingSuggestion || entries.length === 0}
            className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
          >
            <TrendingUp className="w-5 h-5" />
            {loadingSuggestion ? 'Analyzing...' : "Get Today's Workout Recommendation"}
          </button>
          
          {suggestion && !suggestion.error && (
            <div className="mt-4 bg-gradient-to-r from-green-900/30 to-teal-900/30 border border-green-700/50 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <Dumbbell className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-bold text-xl text-green-300 mb-1">
                    Recommended: {suggestion.recommendation}
                  </h3>
                  <p className="text-sm text-slate-300 mb-2">{suggestion.reasoning}</p>
                  <p className="text-sm font-semibold text-teal-300">
                    Target Volume: {suggestion.recommendedSets} working sets
                  </p>
                </div>
              </div>
              
              {suggestion.exercises && suggestion.exercises.length > 0 && (
                <div className="bg-slate-800/50 rounded p-3 mb-3">
                  <h4 className="font-semibold text-sm mb-2 text-slate-300">Suggested Exercises:</h4>
                  <div className="space-y-1">
                    {suggestion.exercises.map((ex, i) => (
                      <div key={i} className="text-sm text-slate-200">
                        • {ex.name}: {ex.weight} × {ex.sets} sets × {ex.reps} reps
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {suggestion.notes && (
                <p className="text-sm text-slate-400 italic">{suggestion.notes}</p>
              )}
            </div>
          )}
          
          {suggestion?.error && (
            <div className="mt-4 bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300">
              {suggestion.error}
            </div>
          )}
        </div>

        {/* Entry Form */}
        {showForm && (
          <div className="bg-slate-800/70 backdrop-blur border border-slate-700 rounded-lg p-6 mb-6">
            {/* File Upload Section */}
            <div className="bg-slate-700/50 rounded-lg p-4 mb-6 border-2 border-dashed border-slate-600">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-blue-400">Quick Import</h3>
                {isProcessing && (
                  <span className="text-sm text-yellow-400 animate-pulse">Processing...</span>
                )}
              </div>
              <p className="text-sm text-slate-400 mb-3">
                Upload Fitbit screenshots, workout notes, or any image/text file with your data
              </p>
              <input
                type="file"
                accept="image/*,.txt"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600 file:cursor-pointer disabled:opacity-50"
              />
              {uploadError && (
                <div className="mt-2 text-sm text-red-400 bg-red-900/20 rounded p-2">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Training Type</label>
                <select
                  value={formData.trainingType}
                  onChange={(e) => setFormData({...formData, trainingType: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                >
                  <option>Push/Biceps</option>
                  <option>Pull/Triceps</option>
                  <option>Legs/Core</option>
                  <option>REST</option>
                </select>
              </div>
            </div>

            {/* Exercise Entry */}
            <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Exercises</h3>
                {getExerciseHistoryList().length > 0 && (
                  <button
                    onClick={() => setShowExerciseHistory(!showExerciseHistory)}
                    className="text-sm bg-slate-600 hover:bg-slate-500 px-3 py-1 rounded text-blue-300"
                  >
                    {showExerciseHistory ? 'Hide' : 'Show'} History
                  </button>
                )}
              </div>

              {showExerciseHistory && getExerciseHistoryList().length > 0 && (
                <div className="mb-3 bg-slate-800/50 rounded-lg p-3 max-h-60 overflow-y-auto">
                  <div className="text-xs text-slate-400 mb-2">Click to use previous exercise:</div>
                  <div className="space-y-1">
                    {getExerciseHistoryList().map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => selectExercise(ex)}
                        className="w-full text-left text-sm bg-slate-700 hover:bg-slate-600 rounded px-3 py-2 transition-colors"
                      >
                        <div className="font-medium">{ex.name}</div>
                        <div className="text-xs text-slate-400">
                          {ex.weight} lbs {ex.weightType === 'each' ? '(each)' : ''} × {ex.sets} sets × {ex.reps} reps
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-4 gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Exercise name"
                  value={exerciseInput.name}
                  onChange={(e) => setExerciseInput({...exerciseInput, name: e.target.value})}
                  className="bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
                />
                <input
                  type="number"
                  placeholder="Weight (lbs)"
                  value={exerciseInput.weight}
                  onChange={(e) => setExerciseInput({...exerciseInput, weight: e.target.value})}
                  className="bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
                />
                <select
                  value={exerciseInput.weightType}
                  onChange={(e) => setExerciseInput({...exerciseInput, weightType: e.target.value})}
                  className="bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="total">Total</option>
                  <option value="each">Each Hand</option>
                </select>
                <input
                  type="number"
                  placeholder="# of Sets"
                  value={exerciseInput.sets}
                  onChange={(e) => updateSetsCount(e.target.value)}
                  className="bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              
              {exerciseInput.sets && parseInt(exerciseInput.sets) > 0 && (
                <div className="mb-3">
                  <label className="text-sm text-slate-300 mb-2 block">Reps per set:</label>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {Array(parseInt(exerciseInput.sets)).fill(0).map((_, i) => (
                      <input
                        key={i}
                        type="number"
                        placeholder={`Set ${i + 1}`}
                        value={exerciseInput.reps[i] || ''}
                        onChange={(e) => updateRep(i, e.target.value)}
                        className="bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm text-center"
                      />
                    ))}
                  </div>
                </div>
              )}
              
              <button
                onClick={addExercise}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm mb-3"
              >
                Add Exercise
              </button>
              
              {formData.exercises.map(ex => (
                <div key={ex.id} className="flex justify-between items-center bg-slate-800 rounded px-3 py-2 mb-2 text-sm">
                  <span>{ex.name}: {ex.weight} lbs {ex.weightType === 'each' ? '(each hand)' : ''} × {ex.sets} sets × {ex.reps} reps</span>
                  <button onClick={() => removeExercise(ex.id)} className="text-red-400 hover:text-red-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Total Working Sets</label>
                <input
                  type="number"
                  value={formData.totalSets}
                  onChange={(e) => setFormData({...formData, totalSets: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Duration (e.g., 1h 15m)</label>
                <input
                  type="text"
                  value={formData.duration}
                  onChange={(e) => setFormData({...formData, duration: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Total Sleep (hours)</label>
                <input
                  type="number"
                  step="0.25"
                  value={formData.sleepTotal}
                  onChange={(e) => setFormData({...formData, sleepTotal: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Deep Sleep %</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.deepSleepPercent}
                  onChange={(e) => setFormData({...formData, deepSleepPercent: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Protein (grams)</label>
                <input
                  type="number"
                  value={formData.protein}
                  onChange={(e) => setFormData({...formData, protein: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Calories</label>
                <input
                  type="number"
                  value={formData.calories}
                  onChange={(e) => setFormData({...formData, calories: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  placeholder="Total calories for the day"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Body Weight (lbs)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">Recovery (1-10)</label>
              <input
                type="range"
                min="1"
                max="10"
                value={formData.recovery}
                onChange={(e) => setFormData({...formData, recovery: e.target.value})}
                className="w-full"
              />
              <div className="text-center text-lg font-bold">{formData.recovery}/10</div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows="3"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                placeholder="Training notes, achievements, how you felt..."
              />
            </div>

            <button
              onClick={submitEntry}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg"
            >
              {editingId ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        )}

        {/* Entries List */}
        <div className="space-y-4">
          {entries.map(entry => (
            <div key={entry.id} className="bg-slate-800/70 backdrop-blur border border-slate-700 rounded-lg overflow-hidden">
              <div 
                className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-lg font-bold">{entry.date}</span>
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm font-semibold">
                        {entry.trainingType}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        entry.grade.includes('S') ? 'bg-yellow-500/20 text-yellow-300' :
                        entry.grade.includes('A') ? 'bg-green-500/20 text-green-300' :
                        'bg-blue-500/20 text-blue-300'
                      }`}>
                        {entry.grade}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-300">
                      <span>💪 {entry.totalSets} sets</span>
                      <span>🌙 {entry.deepSleepPercent}% deep sleep</span>
                      <span>🥩 {entry.protein}g protein</span>
                      {entry.calories && <span>🔥 {entry.calories} cal</span>}
                      {!entry.calories && entry.weight && <span>⚖️ {entry.weight} lbs</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editEntry(entry);
                      }}
                      className="p-2 hover:bg-blue-500/20 rounded transition-colors"
                      title="Edit entry"
                    >
                      <Edit2 className="w-4 h-4 text-blue-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEntry(entry.id);
                      }}
                      className="p-2 hover:bg-red-500/20 rounded transition-colors border border-red-500/30"
                      title="Delete entire entry"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                    {expandedEntry === entry.id ? <ChevronUp /> : <ChevronDown />}
                  </div>
                </div>
              </div>

              {expandedEntry === entry.id && (
                <div className="px-4 pb-4 border-t border-slate-700 pt-4">
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <h4 className="font-semibold mb-2 text-purple-400">Sleep Analysis</h4>
                      <div className="text-sm space-y-1">
                        <p>Total: {entry.sleepTotal} hours</p>
                        <p>Deep: {entry.deepSleepPercent}% ({entry.deepSleepMinutes} min)</p>
                        <p className="text-xs text-slate-400">{getSleepTargetStatus(entry.deepSleepPercent)}</p>
                      </div>
                    </div>
                    
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <h4 className="font-semibold mb-2 text-green-400">Nutrition</h4>
                      <div className="text-sm space-y-1">
                        <p>Protein: {entry.protein}g</p>
                        <p className="text-xs text-slate-400">{getProteinStatus(entry.protein)}</p>
                        {entry.calories && (
                          <>
                            <p>Calories: {entry.calories}</p>
                            <p className="text-xs text-slate-400">
                              {getCalorieStatus(entry.calories, entry.trainingType !== 'REST')}
                            </p>
                          </>
                        )}
                        <p>Recovery: {entry.recovery}/10</p>
                      </div>
                    </div>
                  </div>

                  {entry.exercises.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold mb-2 text-blue-400">Exercises</h4>
                      <div className="space-y-1">
                        {entry.exercises.map((ex, i) => (
                          <div key={i} className="text-sm bg-slate-700/30 rounded px-3 py-2">
                            {ex.name}: {ex.weight} lbs {ex.weightType === 'each' ? '(each hand)' : ''} × {ex.sets} sets × {ex.reps} reps
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {entry.notes && (
                    <div>
                      <h4 className="font-semibold mb-2 text-orange-400">Notes</h4>
                      <p className="text-sm text-slate-300 bg-slate-700/30 rounded p-3">{entry.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {entries.length === 0 && !showForm && (
          <div className="text-center py-12 text-slate-400">
            <Dumbbell className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No entries yet. Start tracking your progress!</p>
          </div>
        )}
      </div>
    </div>
  );
}
