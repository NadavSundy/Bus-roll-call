# Bus Role Call App

A mobile-friendly React app for school camp bus attendance. Students are tracked per bus with fuzzy search, auto-suggestions, and manual additions for names that are not yet in the list.

## Features

- Select bus 1, 2, or 3
- Search student names with fuzzy matching
- Tick students off as present
- Add new student names if not found
- View combined summaries for checked-in, not checked-in, and manually added students
- Built with React, Vite, TypeScript, and Supabase.

## Setup

1. Create a Supabase project.
2. Run the SQL in `supabase-schema.sql` to create the `students` table.
3. Copy `.env.example` to `.env`.
4. Add your Supabase project values:

```bash
VITE_SUPABASE_URL=https://your-supabase-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

5. Install dependencies:

```bash
npm install
```

6. Start the app:

```bash
npm run dev
```

## Deployment

Build the app for production:

```bash
npm run build
```

Then publish the `dist` folder to GitHub Pages. The Vite config is already set to use a relative base path.

## Supabase Schema

The app uses a single `students` table with the following fields:

- `id`
- `name`
- `bus_number`
- `checked_in`
- `is_added_manually`
- `created_at`

## Notes

- No login is required.
- Bus capacity is not part of the app.
- The app works entirely through the Supabase `students` table.
