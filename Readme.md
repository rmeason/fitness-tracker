# Hypertrophy PWA v 0.8 (Netlify Version)

This is a production-ready, build-less Progressive Web App (PWA) for tracking hypertrophy-focused workouts, sleep, and nutrition. It runs as a full-stack app on Netlify, using Netlify Functions and the AI Gateway for secure, live AI features.

## 🚀 Deployment to Netlify (Required)

This app **will not work** on GitHub Pages. It must be deployed to Netlify to use the secure AI functions.

1.  **Commit All Files to GitHub:**
    * Push all 9 files in this project (including `package.json`, `netlify.toml`, and the `netlify/` folder) to your GitHub repository.

2.  **Create a New Netlify Site:**
    * Log in to Netlify.
    * Click **"Add new site"** -> **"Import an existing project"**.
    * Connect to GitHub and select your `fitness-tracker` repository.

3.  **Configure Build & Deploy:**
    * Netlify will read your `netlify.toml` file. The settings should be correct by default (Publish directory: `/`, Build command: *blank*).
    * Click **"Deploy site"**. Netlify will build and deploy your site, installing the AI dependencies from `package.json`.

4.  **Enable AI Gateway (CRITICAL STEP):**
    * Once the site is deployed, go to its new dashboard on Netlify.
    * Go to **Team settings** (click your team name in the top-left).
    * Go to **General** > **AI enablement**.
    * Click **"Configure"** and enable AI features. You will need to add a payment method for credit-based billing (the free plan includes a generous starting credit).
    * Connect the **Anthropic (Claude)** provider and paste in your secret API key.

5.  **Access Your App:**
    * Your app will be live at the Netlify URL (e.g., `https://fitness-tracker-ai.netlify.app`).

## 📱 How to Install on Mobile

1.  Open your new Netlify URL in your phone's browser (Safari or Chrome).
2.  Tap the "Share" icon (on iOS) or the three-dot menu (on Android).
3.  Tap **"Add to Home Screen"** or **"Install app"**.
4.  (Optional) Create an `icons` folder in your repo and add `icon-192x192.png` and `icon-512x512.png` to give your app a custom icon.
