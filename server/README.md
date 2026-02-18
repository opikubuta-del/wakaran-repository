# Library Backend (Supabase)

## 1) Supabase table
Create a `books` table with the following SQL:

```sql
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  publisher text,
  status text,
  rating int,
  note text,
  cover text,
  finished_date date,
  added date default (now()::date),
  created_at timestamptz default now()
);
```

## 2) Environment
Copy `.env.example` to `.env` and fill in:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (recommended for read-only requests)
- `ADMIN_PASSWORD` (shared password for write operations)
- `CORS_ORIGIN` (comma-separated list, e.g. `http://localhost:5173,https://your-app.vercel.app`)

## 2.5) Supabase RLS (recommended)
Enable RLS and allow read-only access for anonymous users:

```sql
alter table public.books enable row level security;

create policy "public read books"
on public.books
for select
using (true);
```

Block anonymous writes (default when RLS is enabled). If you previously created policies,
ensure there are no insert/update/delete policies for anon.

## 3) Install + Run
```bash
cd server
npm install
npm run dev
```

API will start at `http://localhost:4000`.

## 3.5) Vercel (serverless)
This repo supports Vercel serverless functions via `/api/index.js`.
Set Vercel Environment Variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `ADMIN_PASSWORD`
- `CORS_ORIGIN`

When frontend and API are on the same Vercel project, you can use:
`VITE_API_BASE=/api` (frontend env var).

## 4) Endpoints
- `GET /health`
- `GET /books?q=keyword&status=Reading|Finished|Wishlist|All`
- `GET /books/:id`
- `POST /books` (requires `X-Admin-Token`)
- `PATCH /books/:id` (requires `X-Admin-Token`)
- `DELETE /books/:id` (requires `X-Admin-Token`)

Request body (POST/PATCH) example:
```json
{
  "title": "Book Title",
  "author": "Author",
  "publisher": "Publisher",
  "status": "Reading",
  "rating": 4,
  "note": "memo",
  "cover": "https://...",
  "finishedDate": "2026-02-10"
}
```

Write requests must include a header:
```
X-Admin-Token: <ADMIN_PASSWORD>
```
