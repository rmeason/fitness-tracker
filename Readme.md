# Hypertrophy Tracker Pro - PWA

A comprehensive fitness tracking Progressive Web App for bodybuilding and hypertrophy training.

## Features
- ✅ PR Tracker with automatic detection
- ✅ Exercise progression charts
- ✅ 14-day training calendar  
- ✅ Benchmark dashboard
- ✅ AI workout suggestions
- ✅ File upload (Fitbit screenshots, notes)
- ✅ Offline support
- ✅ Installable as native app

## Quick Start

**Important:** This app needs to be hosted on a web server to work. Opening `index.html` directly won't work due to browser security restrictions.

### Option 1: GitHub Pages (Recommended - Free & Easy)

1. Create a new GitHub repository
2. Upload all 4 files:
   - `index.html`
   - `fitness-tracker-pwa.jsx`
   - `manifest.json`
   - `sw.js`
3. Go to Settings → Pages → Source → Select "main" branch
4. Your app will be live at: `https://yourusername.github.io/repo-name`
5. Visit on your phone and click "Add to Home Screen"

### Option 2: Vercel (Fastest)

1. Install Vercel CLI: `npm i -g vercel`
2. In the folder with these files, run: `vercel`
3. Follow prompts
4. Get instant URL: `https://your-project.vercel.app`

### Option 3: Local Development

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve

# Then visit: http://localhost:8000
```

## Installation on Phone

Once hosted:
1. Visit the URL on your phone
2. Browser shows "Add to Home Screen" prompt
3. Install - works like a native app!
4. Data stored locally on your device
5. Works offline after first load

## Files

- `index.html` - App entry point
- `fitness-tracker-pwa.jsx` - Main React component
- `manifest.json` - PWA configuration
- `sw.js` - Service worker for offline support

## Data Storage

All your workout data is stored locally in your browser's localStorage. To backup:
1. Open browser console (F12)
2. Run: `console.log(localStorage.getItem('fitnessEntries'))`
3. Copy the JSON output

To restore:
1. Open console
2. Run: `localStorage.setItem('fitnessEntries', 'PASTE_JSON_HERE')`
