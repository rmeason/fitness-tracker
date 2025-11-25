// muscles.js
// Muscle Recovery & Exercise Activation Database
// EMG-validated activation percentages and muscle-specific recovery rates

'use strict';

// --- 30 MUSCLE GROUPS WITH RECOVERY RATES ---
// Recovery follows exponential decay: fatigue(t) = initialFatigue × exp(-decayRate × hours)
// Rates based on fiber type composition, voluntary activation, and ROM

export const MUSCLES = {
  // === CHEST ===
  pectoralsUpper: { 
    name: "Upper Pecs", 
    hours: 84,      // Slowest recovery (65% Type II, large ROM)
    decayRate: 1.25 // ~1.25% fatigue reduction per hour
  },
  pectoralsLower: { 
    name: "Lower Pecs", 
    hours: 84, 
    decayRate: 1.25 
  },
  
  // === SHOULDERS ===
  deltsFront: { 
    name: "Front Delts", 
    hours: 60, 
    decayRate: 2.25  // Medium recovery
  },
  deltsMid: { 
    name: "Mid Delts", 
    hours: 60, 
    decayRate: 2.25 
  },
  deltsRear: { 
    name: "Rear Delts", 
    hours: 60, 
    decayRate: 2.25 
  },
  
  // === ROTATOR CUFF ===
  infraspinatus: { 
    name: "Infraspinatus", 
    hours: 54, 
    decayRate: 2.5 
  },
  supraspinatus: { 
    name: "Supraspinatus", 
    hours: 54, 
    decayRate: 2.5 
  },
  
  // === LEGS - QUADS ===
  vastusLateralis: { 
    name: "Vastus Lateralis", 
    hours: 48,      // Fast recovery (poor voluntary activation)
    decayRate: 4.0  // ~4% per hour
  },
  vastusMedialis: { 
    name: "Vastus Medialis (VMO)", 
    hours: 48, 
    decayRate: 4.0 
  },
  rectusFemoris: { 
    name: "Rectus Femoris", 
    hours: 48, 
    decayRate: 4.0 
  },
  
  // === LEGS - HAMSTRINGS ===
  bicepsFemoris: { 
    name: "Biceps Femoris", 
    hours: 60,      // Medium recovery (50/50 fiber type)
    decayRate: 2.25 
  },
  semitendinosus: { 
    name: "Semitendinosus", 
    hours: 60, 
    decayRate: 2.25 
  },
  
  // === ARMS - TRICEPS ===
  tricepsLong: { 
    name: "Triceps Long Head", 
    hours: 72,      // Slow recovery (57% fast-twitch)
    decayRate: 1.75 
  },
  tricepsLateral: { 
    name: "Triceps Lateral Head", 
    hours: 72, 
    decayRate: 1.75 
  },
  
  // === ARMS - BICEPS & FOREARMS ===
  bicepsLong: { 
    name: "Biceps Long Head", 
    hours: 66,      // 62% fast-twitch, high activation
    decayRate: 2.0 
  },
  bicepsShort: { 
    name: "Biceps Short Head", 
    hours: 66, 
    decayRate: 2.0 
  },
  brachialis: { 
    name: "Brachialis", 
    hours: 60, 
    decayRate: 2.5 
  },
  brachioradialis: { 
    name: "Brachioradialis", 
    hours: 54, 
    decayRate: 3.0 
  },
  forearms: { 
    name: "Forearms", 
    hours: 36,      // Fast recovery
    decayRate: 4.0 
  },
  
  // === BACK - LATS ===
  latsUpper: { 
    name: "Upper Lats", 
    hours: 60,      // Thin muscle despite large ROM
    decayRate: 2.25 
  },
  latsLower: { 
    name: "Lower Lats", 
    hours: 60, 
    decayRate: 2.25 
  },
  
  // === BACK - TRAPS ===
  trapsUpper: { 
    name: "Upper Traps", 
    hours: 42,      // Fast recovery
    decayRate: 3.0 
  },
  trapsMid: { 
    name: "Mid Traps", 
    hours: 42, 
    decayRate: 3.0 
  },
  trapsLower: { 
    name: "Lower Traps", 
    hours: 42, 
    decayRate: 3.0 
  },
  
  // === CALVES ===
  gastrocnemius: { 
    name: "Gastrocnemius", 
    hours: 36,      // FASTEST recovery (70-96% slow-twitch)
    decayRate: 4.5  // ~4.5% per hour
  },
  soleus: { 
    name: "Soleus", 
    hours: 36, 
    decayRate: 4.5 
  },
  
  // === GLUTES ===
  glutesUpper: { 
    name: "Upper Glutes", 
    hours: 60,      // 55% Type I, massive size
    decayRate: 2.5 
  },
  glutesLower: { 
    name: "Lower Glutes", 
    hours: 60, 
    decayRate: 2.5 
  },
  gluteMed: { 
    name: "Glute Medius", 
    hours: 60, 
    decayRate: 2.5 
  },
  
  // === CORE ===
  rectusAbdominis: { 
    name: "Abs", 
    hours: 48,      // Type I dominant, limited ROM
    decayRate: 3.5 
  },
  obliqueExternal: { 
    name: "External Obliques", 
    hours: 48, 
    decayRate: 3.5 
  },
  obliqueInternal: { 
    name: "Internal Obliques", 
    hours: 48, 
    decayRate: 3.5 
  },
  
  // === OTHER ===
  erectorSpinae: { 
    name: "Erector Spinae", 
    hours: 60,      // 60-70% slow-twitch
    decayRate: 2.5 
  },
  rhomboids: { 
    name: "Rhomboids", 
    hours: 42, 
    decayRate: 3.0 
  },
  serratusAnterior: { 
    name: "Serratus Anterior", 
    hours: 48, 
    decayRate: 3.0 
  }
};

// --- COMPLETE EXERCISE LIBRARY ---
// EMG activation as % MVIC (Maximum Voluntary Isometric Contraction)
// Primary muscles: >50% MVIC, significant contribution
// Secondary muscles: 20-50% MVIC, assists or stabilizes
// Lengthening partial multipliers from research (Tier 1: 2.0x, Tier 2: 1.5x, Tier 3: 1.3x)

export const EXERCISE_LIBRARY = {
  
  // ============================================
  // YOUR LOGGED EXERCISES (from backup)
  // ============================================
  
  "Seated Lat Pull-Downs": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      latsUpper: 110,  // 117% MVC from research (capped at 110)
      latsLower: 105,
      trapsMid: 85,
      rhomboids: 75
    },
    secondaryMuscles: {
      bicepsLong: 45,
      bicepsShort: 45,
      deltsRear: 35
    },
    lengtheningPartials: false
  },
  
  "Rope Cable Face-Pulls": {
    category: "isolation",
    tier: 3,
    primaryMuscles: {
      deltsRear: 110,  // 144% MVC - highest tested for rear delts
      trapsMid: 65,
      rhomboids: 55
    },
    secondaryMuscles: {
      trapsUpper: 25,
      bicepsLong: 15
    },
    lengtheningPartials: false
  },
  
  "Rope Tricep Cable Push-Downs": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLateral: 75,
      tricepsLong: 60
    },
    secondaryMuscles: {
      forearms: 25
    },
    lengtheningPartials: false
  },
  
  "Gym80 3040 Seated Row Machine": {
    category: "compound",
    tier: 2,
    variants: ["Narrow Grip", "Wide Grip"],
    primaryMuscles: {
      // Narrow grip default
      latsUpper: 68,
      latsLower: 64,
      trapsMid: 95,
      rhomboids: 35
    },
    secondaryMuscles: {
      deltsRear: 70,
      bicepsLong: 50,
      bicepsShort: 50,
      erectorSpinae: 25
    },
    variantAdjustments: {
      "Wide Grip": {
        latsUpper: -16,  // 52% vs 68%
        latsLower: -19,  // 45% vs 64%
        trapsMid: +10,   // 105% vs 95%
        rhomboids: +10,  // 45% vs 35%
        deltsRear: +35   // 105% vs 70%
      }
    },
    lengtheningPartials: false
  },
  
  "Dumbbell Incline Bench Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      pectoralsUpper: 70,  // 30% MVIC scales to ~70% at heavy loads
      pectoralsLower: 55,
      deltsFront: 80
    },
    secondaryMuscles: {
      tricepsLong: 50,
      tricepsLateral: 50,
      deltsMid: 20
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3
  },
  
  "Standing EZ-Bar Shoulder Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      deltsFront: 85,
      deltsMid: 75,
      pectoralsUpper: 35
    },
    secondaryMuscles: {
      tricepsLong: 55,
      tricepsLateral: 55,
      trapsUpper: 30,
      erectorSpinae: 20
    },
    lengtheningPartials: false
  },
  
  "Standing Dumbbell Cross-Body Hammer Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 75,
      bicepsShort: 75,
      brachialis: 60,
      brachioradialis: 55
    },
    secondaryMuscles: {
      deltsFront: 15,
      forearms: 40
    },
    lengtheningPartials: false
  },
  
  "Gym80 3022 Pec Fly Machine": {
    category: "isolation",
    tier: 3,
    primaryMuscles: {
      pectoralsLower: 70,  // Sternal emphasis
      pectoralsUpper: 60
    },
    secondaryMuscles: {
      deltsFront: 20,
      bicepsShort: 10,
      serratusAnterior: 15
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3,
    notes: "98% of bench press activation; rotating grips reduce delt compensation"
  },
  
  "Weighted Pull-Ups": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      latsUpper: 110,  // 117% MVC
      latsLower: 110,
      trapsMid: 92,
      rhomboids: 86
    },
    secondaryMuscles: {
      bicepsLong: 60,
      bicepsShort: 60,
      deltsRear: 40,
      forearms: 50,
      brachialis: 55,
      rectusAbdominis: 25
    },
    lengtheningPartials: false
  },
  
  "Gym80 3025 Reverse Fly/Rear Delt": {
    category: "isolation",
    tier: 3,
    variants: ["Neutral Grip", "Pronated Grip"],
    primaryMuscles: {
      // Neutral grip default
      deltsRear: 90,
      infraspinatus: 50,
      rhomboids: 40,
      trapsMid: 45
    },
    secondaryMuscles: {
      trapsLower: 25,
      latsUpper: 12
    },
    variantAdjustments: {
      "Pronated Grip": {
        deltsRear: -7,        // 83% vs 90%
        infraspinatus: -13,   // 37% vs 50%
        rhomboids: +5,        // 45% vs 40%
        trapsMid: +5          // 50% vs 45%
      }
    },
    lengtheningPartials: false,
    notes: "Neutral grip: 7.4% higher rear delt, 13.6% higher infraspinatus"
  },
  
  "Standing Dumbbell Skull-Crushers": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLong: 85,  // Overhead = long head emphasis
      tricepsLateral: 70
    },
    secondaryMuscles: {
      deltsFront: 15,
      pectoralsUpper: 10
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.4,
    notes: "Overhead stretch position enhances long head activation"
  },
  
  "Gym80 4353 Pure Kraft Pendulum Squat": {
    category: "compound",
    tier: 1,
    variants: ["Standard", "Heel Elevated"],
    primaryMuscles: {
      vastusLateralis: 65,
      vastusMedialis: 58,
      rectusFemoris: 35
    },
    secondaryMuscles: {
      glutesUpper: 30,
      glutesLower: 35,
      bicepsFemoris: 15,
      semitendinosus: 13,
      erectorSpinae: 12
    },
    variantAdjustments: {
      "Heel Elevated": {
        vastusLateralis: +10,  // 75% vs 65%
        vastusMedialis: +12,   // 70% vs 58%
        rectusFemoris: +5,     // 40% vs 35%
        glutesUpper: +5,
        glutesLower: +5
      }
    },
    lengtheningPartials: false,
    notes: "Pendulum arc: easier at bottom, harder at lockout; 5-position footplate critical"
  },
  
  "Gym80 3018 Standing Calf Raise Machine": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      gastrocnemius: 53,  // Medial/lateral average
      soleus: 51
    },
    secondaryMuscles: {},
    lengtheningPartials: true,
    lengtheningMultiplier: 2.2,  // STRONGEST EVIDENCE (Kassiano 2023: 2.27x medial)
    notes: "2x gastrocnemius growth vs seated; raised footplate enables full stretch"
  },
  
  "Gym80 3018 Standing Calf Raise Machine Lower-End Partials": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      gastrocnemius: 53,
      soleus: 51
    },
    secondaryMuscles: {},
    lengtheningPartials: true,
    lengtheningMultiplier: 2.2,
    isPartialVariant: true
  },
  
  "Gym80 3001 Leg Extension Machine": {
    category: "isolation",
    tier: 4,
    variants: ["Toes Neutral", "Toes In", "Toes Out"],
    primaryMuscles: {
      // Toes neutral default
      vastusMedialis: 70,
      vastusLateralis: 65,
      rectusFemoris: 43
    },
    secondaryMuscles: {},
    variantAdjustments: {
      "Toes In": {
        vastusMedialis: +10,   // 80% vs 70% (medial rotation)
        vastusLateralis: +10,  // 75% vs 65%
        rectusFemoris: -8      // 35% vs 43%
      },
      "Toes Out": {
        vastusMedialis: -10,   // 60% vs 70%
        vastusLateralis: -10,  // 55% vs 65%
        rectusFemoris: +7      // 50% vs 43%
      }
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.5,
    notes: "Highest VMO/VL activation in final 60° ROM; 9-position foot pad"
  },
  
  "Rope Cable Crunches": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      rectusAbdominis: 90,
      obliqueExternal: 45,
      obliqueInternal: 45
    },
    secondaryMuscles: {
      latsUpper: 15
    },
    lengtheningPartials: false
  },
  
  // ============================================
  // SHOULDERS - COMMON EXERCISES
  // ============================================
  
  "Dumbbell Lateral Raises": {
    category: "isolation",
    tier: 4,
    variants: ["Thumbs Up (External)", "Neutral (Palms Down)", "Thumbs Down (Internal)"],
    primaryMuscles: {
      // Neutral default (mid-delt emphasis)
      deltsMid: 55,
      deltsRear: 52,
      deltsFront: 36
    },
    secondaryMuscles: {
      trapsUpper: 105,  // 86-124% MVC during failure sets
      supraspinatus: 30
    },
    variantAdjustments: {
      "Thumbs Up (External)": {
        deltsFront: +44,  // 80% vs 36%
        deltsMid: -7,     // 48% vs 55%
        deltsRear: -16    // 36% vs 52%
      },
      "Thumbs Down (Internal)": {
        deltsFront: -2,   // 34% vs 36%
        deltsMid: -3,     // 52% vs 55%
        deltsRear: +33    // 85% vs 52%
      }
    },
    lengtheningPartials: false,
    notes: "Grip determines head recruitment; 90° abduction optimal"
  },
  
  "Cable Lateral Raises": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      deltsMid: 55,
      deltsFront: 36,
      deltsRear: 52
    },
    secondaryMuscles: {
      trapsUpper: 105,
      supraspinatus: 30
    },
    lengtheningPartials: false,
    notes: "Constant tension vs DB ascending profile; equivalent hypertrophy"
  },
  
  "Dumbbell Shoulder Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      deltsFront: 74,  // 15% more than standing barbell
      deltsMid: 62
    },
    secondaryMuscles: {
      deltsRear: 10,
      tricepsLong: 55,
      tricepsLateral: 55,
      trapsUpper: 30,
      pectoralsUpper: 25,
      erectorSpinae: 25
    },
    lengtheningPartials: false,
    notes: "Standing > seated for total activation"
  },
  
  "Arnold Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      deltsFront: 95,  // 29% higher than standard DB press
      deltsMid: 71     // 14% higher
    },
    secondaryMuscles: {
      deltsRear: 15,
      tricepsLong: 60,
      tricepsLateral: 60,
      pectoralsUpper: 30
    },
    lengtheningPartials: false
  },
  
  "Front Raises": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      deltsFront: 57,
      deltsMid: 36
    },
    secondaryMuscles: {
      deltsRear: 9,
      pectoralsUpper: 20,
      serratusAnterior: 15
    },
    lengtheningPartials: false
  },
  
  "Upright Rows": {
    category: "compound",
    tier: 3,
    variants: ["Wide Grip (200% biacromial)", "Standard Grip"],
    primaryMuscles: {
      deltsMid: 73,
      trapsMid: 70,
      deltsFront: 33
    },
    secondaryMuscles: {
      deltsRear: 31,
      bicepsLong: 35,
      bicepsShort: 35,
      brachialis: 25
    },
    variantAdjustments: {
      "Standard Grip": {
        bicepsLong: +15,
        bicepsShort: +15
      }
    },
    lengtheningPartials: false,
    notes: "Wide grip: ES 1.9-2.3 for lat/rear delt; reduces biceps"
  },
  
  "Seated Rear Lateral Raise": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      deltsRear: 73,
      deltsMid: 70
    },
    secondaryMuscles: {
      deltsFront: 5,
      rhomboids: 35,
      trapsMid: 40
    },
    lengtheningPartials: false
  },
  
  "45° Incline Row": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      deltsMid: 84,  // HIGHEST of all tested
      deltsRear: 69,
      trapsMid: 75,
      rhomboids: 45
    },
    secondaryMuscles: {
      deltsFront: 6,
      latsUpper: 40,
      latsLower: 40,
      bicepsLong: 50,
      bicepsShort: 50
    },
    lengtheningPartials: false
  },
  
  "Barbell Shrugs": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      trapsUpper: 102,  // HIGHEST tested
      trapsMid: 45
    },
    secondaryMuscles: {
      deltsMid: 15,
      erectorSpinae: 20,
      forearms: 40
    },
    lengtheningPartials: false,
    notes: "30° shoulder abduction enhances activation"
  },
  
  // ============================================
  // ARMS - BICEPS
  // ============================================
  
  "Concentration Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 97,  // GOLD STANDARD - ACE study reference
      bicepsShort: 97
    },
    secondaryMuscles: {
      brachialis: 60,
      brachioradialis: 40,
      deltsFront: 10
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.5,
    notes: "Highest of all tested; humerus braced prevents momentum"
  },
  
  "Cable Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 95,  // Tied 2nd with chin-ups
      bicepsShort: 95
    },
    secondaryMuscles: {
      brachialis: 55,
      brachioradialis: 45,
      deltsFront: 12
    },
    lengtheningPartials: false,
    notes: "Constant tension throughout ROM"
  },
  
  "Chin-Ups": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      latsUpper: 105,
      latsLower: 105,
      bicepsLong: 95,  // Tied 2nd for biceps
      bicepsShort: 95
    },
    secondaryMuscles: {
      trapsMid: 60,
      trapsLower: 48,
      rhomboids: 70,
      deltsRear: 53,
      pectoralsLower: 45,  // Higher than pull-ups
      brachialis: 60,
      brachioradialis: 50,
      forearms: 55,
      rectusAbdominis: 25
    },
    lengtheningPartials: false,
    notes: "No meaningful lat difference vs pull-ups; higher pec/biceps"
  },
  
  "Barbell Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 90,
      bicepsShort: 90
    },
    secondaryMuscles: {
      brachialis: 50,
      brachioradialis: 40,
      deltsFront: 12,
      forearms: 30
    },
    lengtheningPartials: false
  },
  
  "EZ-Bar Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 88,
      bicepsShort: 88
    },
    secondaryMuscles: {
      brachialis: 53,  // Higher than straight bar
      brachioradialis: 48,
      deltsFront: 12,
      forearms: 32
    },
    lengtheningPartials: false,
    notes: "No sig difference from barbell; choose for wrist comfort"
  },
  
  "Incline Dumbbell Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 92,  // Long head emphasis
      bicepsShort: 78
    },
    secondaryMuscles: {
      brachialis: 48,
      brachioradialis: 38,
      deltsFront: 15
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.5,
    notes: "Shoulder extension stretches long head for peak development"
  },
  
  "Preacher Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsLong: 75,  // LOWEST (long head shortened)
      bicepsShort: 88  // Short head compensates
    },
    secondaryMuscles: {
      brachialis: 55,
      brachioradialis: 42,
      deltsFront: 8
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 2.6,  // TIER 2 - Pedrosa 2023 (bottom half)
    notes: "Bottom half partials = 2.62x multiplier (2nd strongest evidence)"
  },
  
  "Hammer Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      brachialis: 80,  // HIGHEST for arm thickness
      brachioradialis: 65,
      bicepsLong: 70,  // LOWEST biceps of all curls
      bicepsShort: 70
    },
    secondaryMuscles: {
      deltsFront: 12,
      forearms: 45
    },
    lengtheningPartials: false,
    notes: "Arm thickness > biceps peak"
  },
  
  // ============================================
  // ARMS - TRICEPS
  // ============================================
  
  "Triangle Push-Ups": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      tricepsLong: 100,  // GOLD STANDARD (ACE reference 100%)
      tricepsLateral: 100,
      pectoralsLower: 75,
      pectoralsUpper: 65
    },
    secondaryMuscles: {
      deltsFront: 55,
      deltsMid: 15,
      serratusAnterior: 30,
      rectusAbdominis: 35
    },
    lengtheningPartials: false,
    notes: "Highest combined triceps + chest activation"
  },
  
  "Dips": {
    category: "compound",
    tier: 2,
    variants: ["Bench Dips", "Parallel Bar Dips"],
    primaryMuscles: {
      tricepsLong: 87,
      tricepsLateral: 88,
      pectoralsLower: 60,
      deltsFront: 55
    },
    secondaryMuscles: {
      pectoralsUpper: 40,
      deltsMid: 20,
      serratusAnterior: 25,
      rectusAbdominis: 25
    },
    lengtheningPartials: false
  },
  
  "Overhead Tricep Extensions": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLong: 95,  // Long head emphasis at 90-180°
      tricepsLateral: 72
    },
    secondaryMuscles: {
      deltsFront: 15,
      pectoralsUpper: 10,
      erectorSpinae: 15
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.5,
    notes: "~40% more growth than pushdowns per training studies"
  },
  
  "Incline Dumbbell Kickbacks": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLong: 106,  // 20% higher than standard
      tricepsLateral: 87
    },
    secondaryMuscles: {
      deltsRear: 20,
      deltsMid: 15
    },
    lengtheningPartials: false,
    notes: "60° bench, face-down, arm retroversion"
  },
  
  "Rope Pushdowns": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLong: 81,
      tricepsLateral: 67
    },
    secondaryMuscles: {
      forearms: 20,
      deltsFront: 10
    },
    lengtheningPartials: false
  },
  
  "Bar Pushdowns": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLong: 75,
      tricepsLateral: 59
    },
    secondaryMuscles: {
      forearms: 18,
      deltsFront: 8
    },
    lengtheningPartials: false
  },
  
  "Skull Crushers": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      tricepsLong: 70,
      tricepsLateral: 55
    },
    secondaryMuscles: {
      deltsFront: 12,
      pectoralsUpper: 10,
      forearms: 20
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.4
  },
  
  "Close-Grip Bench Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      tricepsLong: 61,
      tricepsLateral: 63,
      pectoralsLower: 80,
      pectoralsUpper: 65
    },
    secondaryMuscles: {
      deltsFront: 50,
      deltsMid: 15,
      serratusAnterior: 20
    },
    lengtheningPartials: false
  },
  
  // ============================================
  // CHEST
  // ============================================
  
  "Barbell Bench Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      pectoralsLower: 95,  // Sternal emphasis
      pectoralsUpper: 60,
      deltsFront: 79
    },
    secondaryMuscles: {
      tricepsLong: 67,
      tricepsLateral: 67,
      deltsMid: 25,
      serratusAnterior: 18
    },
    lengtheningPartials: false
  },
  
  "Incline Barbell Bench Press (30°)": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      pectoralsUpper: 70,  // OPTIMAL angle
      pectoralsLower: 55,
      deltsFront: 80
    },
    secondaryMuscles: {
      tricepsLong: 65,
      tricepsLateral: 65,
      deltsMid: 28,
      serratusAnterior: 20
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3,
    notes: "30° optimal for upper pec; 45°+ shifts to delts"
  },
  
  "Incline Bench Press (45°)": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      pectoralsUpper: 62,
      pectoralsLower: 45,
      deltsFront: 90  // Dramatically increased
    },
    secondaryMuscles: {
      tricepsLong: 60,
      tricepsLateral: 60,
      deltsMid: 32
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3
  },
  
  "Incline Bench Press (60°)": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      pectoralsUpper: 50,
      pectoralsLower: 35,
      deltsFront: 105  // Shoulder-dominant
    },
    secondaryMuscles: {
      tricepsLong: 55,
      tricepsLateral: 55,
      deltsMid: 38
    },
    lengtheningPartials: false,
    notes: "Effectively a shoulder press"
  },
  
  "Decline Bench Press": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      pectoralsLower: 100,  // Maximum lower pec
      pectoralsUpper: 45,
      deltsFront: 55
    },
    secondaryMuscles: {
      tricepsLong: 70,
      tricepsLateral: 70,
      deltsMid: 18
    },
    lengtheningPartials: false
  },
  
  "Standard Push-Ups": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      pectoralsLower: 85,  // 61-105% MVIC
      pectoralsUpper: 75,
      deltsFront: 70,
      tricepsLong: 90,  // 73-109% MVIC
      tricepsLateral: 90
    },
    secondaryMuscles: {
      deltsMid: 20,
      serratusAnterior: 35,
      rectusAbdominis: 40
    },
    lengtheningPartials: false
  },
  
  "TRX/Suspension Push-Ups": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      pectoralsLower: 90,
      pectoralsUpper: 80,
      deltsFront: 75,
      tricepsLong: 106,  // 105.83% vs 74.32% traditional
      tricepsLateral: 106
    },
    secondaryMuscles: {
      deltsMid: 22,
      serratusAnterior: 40,
      rectusAbdominis: 55,
      obliqueExternal: 35
    },
    lengtheningPartials: false
  },
  
  "Pec Deck Machine": {
    category: "isolation",
    tier: 3,
    primaryMuscles: {
      pectoralsLower: 93,  // 98% of bench press
      pectoralsUpper: 75
    },
    secondaryMuscles: {
      deltsFront: 22,
      serratusAnterior: 18,
      bicepsShort: 8
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3
  },
  
  "Cable Crossovers": {
    category: "isolation",
    tier: 3,
    primaryMuscles: {
      pectoralsLower: 88,  // 93-94% bent-forward
      pectoralsUpper: 70
    },
    secondaryMuscles: {
      deltsFront: 25,
      serratusAnterior: 20,
      rectusAbdominis: 18
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3,
    notes: "Constant tension superior to DB flyes"
  },
  
  "Dumbbell Flyes": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      pectoralsLower: 63,  // Only 66% vs bench
      pectoralsUpper: 50
    },
    secondaryMuscles: {
      deltsFront: 28,
      bicepsShort: 15
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3,
    notes: "Tension loss at top; cable/machine superior"
  },
  
  // ============================================
  // CORE
  // ============================================
  
  "Bicycle Crunches": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      rectusAbdominis: 169,  // 248% vs standard (68% baseline)
      obliqueExternal: 166,  // 290% vs standard
      obliqueInternal: 166
    },
    secondaryMuscles: {},
    lengtheningPartials: false,
    notes: "HIGHEST tested for abs (ACE study)"
  },
  
  "Captain's Chair/Hanging Leg Raises": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      rectusAbdominis: 144,  // 212% vs standard
      obliqueExternal: 177,  // 310% - HIGHEST for obliques
      obliqueInternal: 177
    },
    secondaryMuscles: {
      latsUpper: 25,
      forearms: 45,
      deltsFront: 15
    },
    lengtheningPartials: false
  },
  
  "Ab Wheel Rollout": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      rectusAbdominis: 58,  // 63% upper / 53% lower
      obliqueExternal: 46,
      obliqueInternal: 46
    },
    secondaryMuscles: {
      erectorSpinae: 8,
      latsUpper: 35,
      latsLower: 30,
      deltsFront: 40
    },
    lengtheningPartials: false
  },
  
  "RKC Plank": {
    category: "isometric",
    tier: 4,
    primaryMuscles: {
      rectusAbdominis: 100,  // >100% MVIC
      obliqueExternal: 100,
      obliqueInternal: 100
    },
    secondaryMuscles: {
      glutesUpper: 85,
      glutesLower: 85,
      erectorSpinae: 8
    },
    lengtheningPartials: false,
    notes: "Long-lever posterior tilt - strengthening threshold"
  },
  
  "Standard Front Plank": {
    category: "isometric",
    tier: 4,
    primaryMuscles: {
      rectusAbdominis: 47,  // Below threshold
      obliqueExternal: 49,
      obliqueInternal: 49
    },
    secondaryMuscles: {
      deltsFront: 30,
      erectorSpinae: 8
    },
    lengtheningPartials: false,
    notes: "Insufficient for strength development"
  },
  
  "Side Planks (Feet Elevated)": {
    category: "isometric",
    tier: 4,
    primaryMuscles: {
      obliqueInternal: 205,  // HIGHEST tested
      obliqueExternal: 145,
      rectusAbdominis: 55
    },
    secondaryMuscles: {
      gluteMed: 65,
      deltsMid: 40
    },
    lengtheningPartials: false
  },
  
  "Traditional Crunches": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      rectusAbdominis: 68,  // Baseline
      obliqueExternal: 57,
      obliqueInternal: 64
    },
    secondaryMuscles: {},
    lengtheningPartials: false,
    notes: "No upper/lower distinction per EMG"
  },
  
  // ============================================
  // BACK
  // ============================================
  
  "Bent-Over Barbell Row": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      latsUpper: 91,
      latsLower: 91,
      trapsMid: 107,  // HIGHEST of all
      rhomboids: 60,
      infraspinatus: 55,
      erectorSpinae: 66  // HIGHEST of rows
    },
    secondaryMuscles: {
      deltsRear: 70,
      trapsLower: 50,
      bicepsLong: 55,
      bicepsShort: 55,
      brachialis: 40,
      forearms: 50,
      rectusAbdominis: 30,
      obliqueExternal: 25
    },
    lengtheningPartials: false,
    notes: "Most comprehensive back exercise - 3 of 5 muscles to highest"
  },
  
  "Pull-Ups": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      latsUpper: 108,  // HIGHEST lat activation
      latsLower: 108,
      trapsMid: 80,
      trapsLower: 54
    },
    secondaryMuscles: {
      rhomboids: 70,
      infraspinatus: 51,
      deltsRear: 40,
      bicepsLong: 55,
      bicepsShort: 55,
      brachialis: 50,
      forearms: 55,
      erectorSpinae: 46,
      rectusAbdominis: 25
    },
    lengtheningPartials: false,
    notes: "Highest lat activation of any exercise"
  },
  
  "Inverted Rows": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      trapsMid: 108,  // Tied highest
      latsUpper: 83,
      latsLower: 83,
      rhomboids: 55,
      infraspinatus: 51
    },
    secondaryMuscles: {
      trapsLower: 55,
      deltsRear: 60,
      bicepsLong: 65,
      bicepsShort: 65,
      brachialis: 45,
      erectorSpinae: 44,
      rectusAbdominis: 35
    },
    lengtheningPartials: false
  },
  
  "Seated Cable Rows": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      latsUpper: 90,
      latsLower: 90,
      trapsMid: 99,
      rhomboids: 45
    },
    secondaryMuscles: {
      trapsLower: 47,
      deltsRear: 55,
      infraspinatus: 46,
      bicepsLong: 50,
      bicepsShort: 50,
      brachialis: 40,
      erectorSpinae: 44
    },
    lengtheningPartials: false
  },
  
  "One-Arm Dumbbell Rows": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      latsUpper: 91,
      latsLower: 91,
      trapsMid: 85,
      rhomboids: 50
    },
    secondaryMuscles: {
      deltsRear: 55,
      trapsLower: 45,
      bicepsLong: 60,
      bicepsShort: 60,
      brachialis: 42,
      obliqueExternal: 95,  // 59-63% higher (anti-rotation)
      rectusAbdominis: 40,
      erectorSpinae: 50
    },
    lengtheningPartials: false,
    notes: "High oblique activation for core stability"
  },
  
  "Lat Pulldowns": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      latsUpper: 88,
      latsLower: 88,
      trapsMid: 61,
      trapsLower: 61
    },
    secondaryMuscles: {
      deltsRear: 37,
      rhomboids: 40,
      bicepsLong: 45,
      bicepsShort: 45,
      brachialis: 35,
      erectorSpinae: 20
    },
    lengtheningPartials: false,
    notes: "Behind-neck: lower activation + injury risk"
  },
  
  // ============================================
  // LEGS
  // ============================================
  
  "Barbell Back Squat": {
    category: "compound",
    tier: 1,
    primaryMuscles: {
      vastusLateralis: 110,  // 216-244% MVC peak
      vastusMedialis: 74,
      rectusFemoris: 45,
      glutesUpper: 30,
      glutesLower: 30
    },
    secondaryMuscles: {
      erectorSpinae: 60,  // +40% vs pendulum
      bicepsFemoris: 35,
      semitendinosus: 30,
      rectusAbdominis: 35,
      obliqueExternal: 25
    },
    lengtheningPartials: false
  },
  
  "Barbell Hip Thrust": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      glutesLower: 87,  // 143% MVC peak end-range
      glutesUpper: 70,
      bicepsFemoris: 41
    },
    secondaryMuscles: {
      semitendinosus: 30,
      erectorSpinae: 25,
      rectusAbdominis: 20
    },
    lengtheningPartials: false,
    notes: "HIGHEST glute activation in literature"
  },
  
  "Step-Ups (Forward)": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      vastusLateralis: 70,
      vastusMedialis: 65,
      rectusFemoris: 55,
      glutesUpper: 65,
      glutesLower: 70,
      gluteMed: 50
    },
    secondaryMuscles: {
      bicepsFemoris: 35,
      semitendinosus: 30,
      erectorSpinae: 30
    },
    lengtheningPartials: false,
    notes: "Knee-height step (~45cm) optimal"
  },
  
  "Step-Ups (Lateral)": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      vastusLateralis: 65,
      vastusMedialis: 60,
      rectusFemoris: 50,
      glutesUpper: 60,
      glutesLower: 64,
      gluteMed: 55  // Higher than forward
    },
    secondaryMuscles: {
      bicepsFemoris: 30,
      semitendinosus: 25,
      obliqueExternal: 35,
      erectorSpinae: 25
    },
    lengtheningPartials: false
  },
  
  "Bulgarian Split Squats": {
    category: "compound",
    tier: 2,
    variants: ["Upright Torso", "Forward Trunk Lean (~40°)"],
    primaryMuscles: {
      vastusLateralis: 78,
      vastusMedialis: 70,
      rectusFemoris: 55,
      glutesUpper: 46,
      glutesLower: 50,
      gluteMed: 50
    },
    secondaryMuscles: {
      bicepsFemoris: 35,
      semitendinosus: 30,
      erectorSpinae: 35
    },
    variantAdjustments: {
      "Forward Trunk Lean (~40°)": {
        glutesUpper: +10,
        glutesLower: +10,
        bicepsFemoris: +15,
        rectusFemoris: +10
      }
    },
    lengtheningPartials: false
  },
  
  "Forward Lunges": {
    category: "compound",
    tier: 3,
    variants: ["Static", "Walking"],
    primaryMuscles: {
      vastusLateralis: 66,
      vastusMedialis: 58,
      rectusFemoris: 48,
      glutesUpper: 41,
      glutesLower: 44,
      gluteMed: 31
    },
    secondaryMuscles: {
      bicepsFemoris: 24,
      semitendinosus: 21,
      erectorSpinae: 24
    },
    variantAdjustments: {
      "Walking": {
        erectorSpinae: +16  // 40% vs 24%
      }
    },
    lengtheningPartials: false
  },
  
  "Single-Leg Deadlift": {
    category: "compound",
    tier: 3,
    primaryMuscles: {
      glutesUpper: 59,
      glutesLower: 59,
      gluteMed: 58,
      bicepsFemoris: 70,
      semitendinosus: 65,
      erectorSpinae: 65
    },
    secondaryMuscles: {
      vastusLateralis: 25,
      vastusMedialis: 20,
      obliqueExternal: 60,
      obliqueInternal: 55,
      forearms: 50
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3
  },
  
  "Wall Sits": {
    category: "isometric",
    tier: 4,
    primaryMuscles: {
      vastusLateralis: 55,
      vastusMedialis: 52,
      rectusFemoris: 45
    },
    secondaryMuscles: {
      glutesLower: 30,
      erectorSpinae: 20
    },
    lengtheningPartials: false
  },
  
  "Nordic Curls": {
    category: "isolation",
    tier: 3,
    primaryMuscles: {
      bicepsFemoris: 85,
      semitendinosus: 85
    },
    secondaryMuscles: {
      gastrocnemius: 35,
      erectorSpinae: 30,
      glutesUpper: 25,
      glutesLower: 25
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.4,
    notes: "Eccentric emphasis extends recovery 24-48hrs"
  },
  
  "Lying Leg Curls": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      bicepsFemoris: 82,
      semitendinosus: 82
    },
    secondaryMuscles: {
      gastrocnemius: 25
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.4
  },
  
  "Conventional Deadlift": {
    category: "compound",
    tier: 1,
    primaryMuscles: {
      erectorSpinae: 90,
      vastusLateralis: 85,
      vastusMedialis: 70,
      glutesUpper: 60,
      glutesLower: 65,
      bicepsFemoris: 70,
      semitendinosus: 65
    },
    secondaryMuscles: {
      trapsMid: 50,
      trapsUpper: 55,
      rhomboids: 35,
      rectusAbdominis: 35,
      forearms: 80,
      latsUpper: 40,
      latsLower: 40
    },
    lengtheningPartials: false
  },
  
  "Romanian Deadlift": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      semitendinosus: 90,
      bicepsFemoris: 85,
      glutesUpper: 70,
      glutesLower: 75,
      erectorSpinae: 70
    },
    secondaryMuscles: {
      vastusLateralis: 20,
      vastusMedialis: 15,
      forearms: 60
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3
  },
  
  "Stiff-Leg Deadlift": {
    category: "compound",
    tier: 2,
    primaryMuscles: {
      erectorSpinae: 95,
      bicepsFemoris: 85,
      semitendinosus: 85,
      glutesUpper: 70,
      glutesLower: 75
    },
    secondaryMuscles: {
      vastusLateralis: 25,
      vastusMedialis: 20,
      forearms: 70,
      latsUpper: 35,
      trapsMid: 45
    },
    lengtheningPartials: true,
    lengtheningMultiplier: 1.3
  },
  
  "Leg Press Calf Raises": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      gastrocnemius: 50,  // 49-51% MVIC (equivalent to standing)
      soleus: 48
    },
    secondaryMuscles: {},
    lengtheningPartials: true,
    lengtheningMultiplier: 2.2,
    notes: "Equivalent EMG to standing; different loading vector"
  },
  
  "Seated Calf Raises": {
    category: "isolation",
    tier: 4,
    primaryMuscles: {
      soleus: 65,  // 90° knee shifts to soleus
      gastrocnemius: 25  // Active insufficiency at 90° knee
    },
    secondaryMuscles: {},
    lengtheningPartials: true,
    lengtheningMultiplier: 2.2,
    notes: "+2.1% soleus growth only; inferior for gastrocnemius"
  }
};

// --- EXERCISE TIER SYSTEM (for fatigue calculation) ---
// Tier 1 (1.5x): High CNS demand - squats, deadlifts, Olympic lifts
// Tier 2 (1.2x): Multiple muscle groups - bench, rows, overhead press
// Tier 3 (1.0x): Single joint compounds - lunges, RDLs, dips
// Tier 4 (0.6x): Isolation - curls, extensions, raises, crunches

export const EXERCISE_TIERS = {
  1: { multiplier: 1.5, name: "High CNS Demand" },  // ← CHANGED from 1.3
  2: { multiplier: 1.2, name: "Multi-Muscle Compound" },
  3: { multiplier: 1.0, name: "Single-Joint Compound" },
  4: { multiplier: 0.6, name: "Isolation" }
};

// --- LENGTHENING PARTIAL TIER SYSTEM ---
// Based on research evidence strength
export const LENGTHENING_TIERS = {
  TIER_1: { multiplier: 2.2, evidence: "Strongest (Kassiano 2023)" },    // Calves
  TIER_2: { multiplier: 1.5, evidence: "Strong (Pedrosa 2023)" },        // Preacher curls, overhead triceps
  TIER_3: { multiplier: 1.3, evidence: "Moderate" },                     // Leg extensions, DB flies, RDLs
  TIER_4: { multiplier: 1.0, evidence: "Full ROM baseline" }
};

// --- HELPER FUNCTIONS ---

/**
 * Get exercise data from library
 * @param {string} exerciseName - Name of exercise
 * @param {string} variant - Optional variant (e.g., "Wide Grip")
 * @returns {object} Exercise data with activation percentages
 */
export function getExerciseData(exerciseName, variant = null) {
  const exercise = EXERCISE_LIBRARY[exerciseName];
  if (!exercise) return null;
  
  // Clone to avoid mutations
  const exerciseData = JSON.parse(JSON.stringify(exercise));
  
  // Apply variant adjustments if specified
  if (variant && exercise.variantAdjustments && exercise.variantAdjustments[variant]) {
    const adjustments = exercise.variantAdjustments[variant];
    for (const [muscle, adjustment] of Object.entries(adjustments)) {
      if (exerciseData.primaryMuscles[muscle] !== undefined) {
        exerciseData.primaryMuscles[muscle] += adjustment;
      } else if (exerciseData.secondaryMuscles[muscle] !== undefined) {
        exerciseData.secondaryMuscles[muscle] += adjustment;
      }
    }
  }
  
  return exerciseData;
}

/**
 * Get all exercise names (for autocomplete/dropdown)
 * @returns {Array<string>} Sorted array of exercise names
 */
export function getAllExerciseNames() {
  return Object.keys(EXERCISE_LIBRARY).sort();
}

/**
 * Get exercises by category
 * @param {string} category - "compound" or "isolation"
 * @returns {Array<string>} Exercise names in category
 */
export function getExercisesByCategory(category) {
  return Object.entries(EXERCISE_LIBRARY)
    .filter(([_, data]) => data.category === category)
    .map(([name, _]) => name)
    .sort();
}

/**
 * Get exercises that target a specific muscle
 * @param {string} muscleName - Muscle key (e.g., "bicepsLong")
 * @param {number} minActivation - Minimum activation % (default 50)
 * @returns {Array<object>} Exercises with activation data
 */
export function getExercisesForMuscle(muscleName, minActivation = 50) {
  return Object.entries(EXERCISE_LIBRARY)
    .filter(([_, data]) => {
      const primaryAct = data.primaryMuscles[muscleName] || 0;
      const secondaryAct = data.secondaryMuscles[muscleName] || 0;
      return Math.max(primaryAct, secondaryAct) >= minActivation;
    })
    .map(([name, data]) => ({
      name,
      activation: Math.max(
        data.primaryMuscles[muscleName] || 0,
        data.secondaryMuscles[muscleName] || 0
      )
    }))
    .sort((a, b) => b.activation - a.activation);
}

// Export for use in other modules
export default {
  MUSCLES,
  EXERCISE_LIBRARY,
  EXERCISE_TIERS,
  LENGTHENING_TIERS,
  getExerciseData,
  getAllExerciseNames,
  getExercisesByCategory,
  getExercisesForMuscle
};