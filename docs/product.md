# Product: Watch Party

## What it is

This app allows people across plattforms, rooms and countries to watch videos together live from the designated admin user.

## Who it is for

Families and friends seperated by miles and countries.

## The problem it solves

Movies and youtube videos can't be watched this way and for apps that allow videos to be watched this way, this feature is treated as secondary and thus, it is not really used. For couples and families who want to watch videos together despite their distance away from each other this is a pain point worth looking at.

## Core features

1. Streaming embedded videos from a users device
2. Voice chat and danmaku ( chat )
3. Hourly charged rating 

## First version

For the first version, a user should be able to:

1. Start or join a watch party with another
2. Create an account
3. Add video links to be watched

## Not building yet

- Payments and subscriptions
- Heavy UI/UX models

## Architecture (how the pieces fit)

- **Frontend:** React + Vite. Pages live in `src/pages`, reusable UI in `src/components`.
- **Backend:** Supabase — one rented backend instead of a self-written server:
  - **Auth** — signup, login, sessions. The browser library stores the session token automatically.
  - **Postgres** — our tables (`rooms` so far). Access rules are Row Level Security policies in the database itself, so they cannot be bypassed from the browser.
  - **Realtime** (steps 5–8) — will sync playback and chat between browsers.
- **Where logic lives:** UI logic in React; security rules in the database; secrets (third-party API keys) never in the browser — those would go into Supabase Edge Functions.
- **Planned external services:** YouTube IFrame Player API (video, step 6), LiveKit (voice chat, step 9), Vercel/Netlify (hosting, step 10).