# Hypertrophy PWA Fitness Tracker

This is a production-ready, build-less Progressive Web App (PWA) for tracking hypertrophy-focused workouts, sleep, and nutrition. It runs entirely in the browser using `localStorage` and is designed for deployment on GitHub Pages.

## 🚀 Deployment to GitHub Pages

1.  **Create a New GitHub Repository:**
    * Go to GitHub and create a new public repository (e.g., `hypertrophy-pwa`).

2.  **Upload App Files:**
    * Upload the following files to the root of your new repository:
        * `index.html`
        * `app.js`
        * `manifest.json`
        * `sw.js`

3.  **Create PWA Icons:**
    * This is a **required** step for the PWA to be installable.
    * Create a folder named `icons` in your repository.
    * Inside the `icons` folder, add at least two icons:
        * `icon-192x192.png` (a 192x192 pixel PNG)
        * `icon-512x512.png` (a 512x512 pixel PNG)
    * You can use a free tool like [Maskable.app](https://maskable.app/) to generate these.

4.  **Enable GitHub Pages:**
    * In your repository, go to **Settings** > **Pages**.
    * Under "Build and deployment", set the **Source** to **Deploy from a branch**.
    * Set the **Branch** to `main` (or `master`) and the folder to `/ (root)`.
    * Click **Save**.

5.  **Access Your App:**
    * Wait about 1-2 minutes for GitHub to build and deploy your site.
    * Your app will be live at: `https://<YOUR_USERNAME>.github.io/<YOUR_REPO_NAME>/`

## 📱 How to Install on Mobile

### On iOS (Safari)
1.  Open the live URL in Safari.
2.  Tap the "Share" icon (a box with an arrow pointing up).
3.  Scroll down and tap **"Add to Home Screen"**.

### On Android (Chrome)
1.  Open the live URL in Chrome.
2.  A pop-up banner "Add to Home Screen" should appear. Tap it.
3.  If no banner appears, tap the three-dot menu icon.
4.  Tap **"Install app"** or **"Add to Home Screen"**.

## 💡 LocalStorage Data Structure

All data is stored in your browser's `localStorage` under a single key: `hypertrophyApp.entries.v1`. The data is an array of entry objects, structured like this:

```json
[
  {
    "id": "id_1736876527581_t3j9qj",
    "date": "2025-11-15",
    "trainingType": "Push/Biceps",
    "exercises": [
      {
        "name": "Bench Press",
        "weight": 175,
        "eachHand": false,
        "sets": 3,
        "reps": [5, 5, 5]
      },
      {
        "name": "Skull Crushers",
        "weight": 75,
        "eachHand": false,
        "sets": 3,
        "reps": [8, 8, 7]
      }
    ],
    "totalSets": 6,
    "duration": 60,
    "sleepHours": 8.5,
    "deepSleepPercent": 22,
    "deepSleepMinutes": 112,
    "recoveryRating": 9,
    "protein": 165,
    "calories": 2850,
    "weight": 140,
    "grade": "S++"
  }
]
