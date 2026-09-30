# Watch Party

A web app for couples, families and friends far apart to share moments live with each other.

**Repository:** https://github.com/giii-o/watch_party

## Current status

The core version of this app is being built. A public demo landing page
with an email waitlist lives at `/`.

## Core features

- Watching embedded videos
- Streaming videos from a user to another [starting a watch party]
- Joining a watch party

## Running the app

Install dependencies once:

```
npm install
```

Start the development server (the app opens at http://localhost:5173):

```
npm run dev
```

## Pages

- `/` — Demo landing: the public front door with the email waitlist form
- `/app` — App home: start a watch party (creates a real room) or join with a code
- `/login` — Log in with email and password (Supabase)
- `/signup` — Create an account (confirmation email)
- `/room/:roomCode` — The watch party room, e.g. `/room/ABC123`

## Supabase setup

1. Create a free project at supabase.com and put the URL + anon key in a
   `.env` file — step-by-step at the top of `src/lib/supabaseClient.js`.
2. Run the SQL in the Supabase SQL Editor:
   - Run `supabase/schema-current.sql` — that is the ONLY file you need,
     whether your project is brand new or was set up in an earlier step.
     It is safe to run again at any time: it builds the full schema from
     scratch, repairs an existing database (adds any missing columns,
     fixes policies, ensures realtime pushes), and removes the
     removed playlist feature.
   - To check it worked, run this in the SQL Editor:

     ```sql
     select column_name from information_schema.columns
     where table_schema = 'public' and table_name in ('rooms', 'demo_signups');
     ```

     The rooms list must include `is_playing`, `position_seconds`, and
     `state_updated_at`; the demo_signups table must exist. If so,
     playback sync and the waitlist are ready.

## Sync tests

The sync decision math and the link parser have plain Node tests
(no framework needed):

```
node scripts/sync-engine.test.mjs
node scripts/video-links.test.mjs
```

## Built by

giiio