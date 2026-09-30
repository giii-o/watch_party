import { createClient } from '@supabase/supabase-js'

// This file creates ONE Supabase client that the whole app shares.
//
// Setup (one time):
// 1. Create a free account at https://supabase.com and create a project
// 2. In your project: Settings -> API
// 3. Copy the "Project URL" and the "anon public" key
// 4. Create a file named .env in the project root (next to package.json) with:
//
//    VITE_SUPABASE_URL=your-project-url
//    VITE_SUPABASE_ANON_KEY=your-anon-key
//
// 5. Restart the dev server (npm run dev)
//
// IMPORTANT: in a Vite app, ONLY variables whose name starts with VITE_
// are visible to browser code (import.meta.env). That is why both names
// above must start with VITE_ — a variable named SUPABASE_URL (no prefix)
// would always be undefined here, no matter what is written in .env.
//
// The anon key is safe to use in the browser — it only allows actions
// your database rules permit. Never put the secret "service role" key here.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// True when the keys are set. The login/signup pages use this to show
// a friendly hint instead of a confusing error when setup is missing.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// The placeholder values only stop createClient from throwing when keys
// are missing. Nothing real works until .env has the actual values.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key',
)
