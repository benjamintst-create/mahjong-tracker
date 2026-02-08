# 🀄 Mahjong Score Tracker

A real-time mahjong score tracker for your group. Everyone sees the same data — scores, leaderboard, and charts update live across all devices.

## Quick Setup (15 minutes)

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `mahjong-tracker`) → Continue
3. Disable Google Analytics (not needed) → **Create project**

### 2. Add a Web App

1. In your Firebase project, click the **</>** (web) icon
2. Name it anything (e.g. `mahjong-web`) → **Register app**
3. You'll see a `firebaseConfig` object — **copy it**

### 3. Enable Firestore

1. In Firebase Console → **Build** → **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (we'll secure it later)
4. Select the closest region to Singapore (e.g. `asia-southeast1`)

### 4. Configure the App

Open `src/firebase.js` and replace the placeholder config with your actual Firebase config:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 5. Deploy to Vercel

**Option A: Via GitHub (recommended)**
1. Push this project to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. Vercel auto-detects Vite — just click **Deploy**
5. Done! You'll get a URL like `mahjong-tracker.vercel.app`

**Option B: Via CLI**
```bash
npm install -g vercel
npm install
vercel
```

### 6. Share the URL with Your Friends 🎉

Everyone opens the same URL on their phone. All data syncs in real-time.

---

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

---

## Securing Firestore (Optional but Recommended)

After deploying, go to Firebase Console → Firestore → **Rules** and replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone can read and write players and sessions
    // Good enough for a small private group
    match /players/{playerId} {
      allow read, write: if true;
    }
    match /sessions/{sessionId} {
      allow read, write: if true;
    }
  }
}
```

For a small friends group this is fine. The URL itself acts as a "password" — only people who know the URL can access it. If you want proper auth, you can add Firebase Authentication later.

---

## Firestore Data Structure

```
players/
  {playerId}/
    name: "Ben"
    emoji: "🀄"
    createdAt: 1234567890

sessions/
  {sessionId}/
    date: "2026-02-08T20:00:00.000Z"
    scores: { playerId1: 2.40, playerId2: -0.80, ... }
    transactions: [{ from: "id1", to: "id2", amount: 1.20 }, ...]
```

---

## Features

- **Up to 20 players** with customizable emoji icons
- **Score entry** with zero-sum validation
- **Minimized settlements** — fewest transfers needed
- **Real-time sync** — all phones see updates instantly
- **Player profiles** with stats, charts, and session history
- **Leaderboard** with lifetime rankings
- **Cumulative score charts** (line + bar)
- **Mobile-first** dark theme inspired by mahjong table felt
