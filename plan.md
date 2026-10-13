# Implementation Plan — Cafe Menu & Ordering System

> **Note:** This project was originally planned with Firebase but has been fully migrated to Supabase.
> All backend operations now use Supabase (Auth, PostgreSQL, Storage, Realtime).
> See `supabase-migration.sql` for the database schema.

## Architecture Overview

- **Frontend:** React + Vite SPA
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Auth:** Supabase Auth (email/password), RBAC via `user_roles` table
- **Database:** PostgreSQL with RLS policies
- **Real-time:** Supabase Realtime (Postgres changes replication)
- **Storage:** Supabase Storage buckets
- **Deployment:** Vercel / Netlify