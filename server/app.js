import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  PORT = 4000,
  CORS_ORIGIN,
  ADMIN_PASSWORD,
} = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const supabaseRead = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : supabaseAdmin

const app = express()

const allowedOrigins = CORS_ORIGIN
  ? CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : '*'

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json())

const requireAdmin = (req, res, next) => {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server is missing ADMIN_PASSWORD' })
  }
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  return next()
}

const statusOrder = { Reading: 0, Finished: 1, Wishlist: 2 }

const sortBooks = (a, b) => {
  const statusGap = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  if (statusGap !== 0) return statusGap
  if (a.status === 'Finished' && b.status === 'Finished') {
    const aDate = a.finished_date || ''
    const bDate = b.finished_date || ''
    if (aDate !== bDate) return aDate < bDate ? 1 : -1
  }
  const aAdded = a.added || ''
  const bAdded = b.added || ''
  return aAdded < bAdded ? 1 : -1
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/books', async (req, res) => {
  const { q, status } = req.query
  let query = supabaseRead.from('books').select('*')

  if (status && status !== 'All') {
    query = query.eq('status', status)
  }

  if (q && String(q).trim()) {
    const term = String(q).trim()
    query = query.or(`title.ilike.%${term}%,author.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const sorted = (data ?? []).slice().sort(sortBooks)
  return res.json(sorted)
})

app.get('/books/:id', async (req, res) => {
  const { id } = req.params
  const { data, error } = await supabaseRead
    .from('books')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return res.status(500).json({ error: error.message })
  }
  if (!data) {
    return res.status(404).json({ error: 'Not found' })
  }
  return res.json(data)
})

app.post('/books', requireAdmin, async (req, res) => {
  const {
    title,
    author,
    publisher = '',
    status = 'Reading',
    rating = 0,
    note = '',
    cover = '',
    finishedDate = '',
  } = req.body || {}

  if (!title?.trim() || !author?.trim()) {
    return res.status(400).json({ error: 'title and author are required' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const finished = status === 'Finished' ? finishedDate || today : finishedDate

  const { data, error } = await supabaseAdmin
    .from('books')
    .insert({
      title: title.trim(),
      author: author.trim(),
      publisher: publisher.trim(),
      status,
      rating: Number(rating) || 0,
      note: note.trim(),
      cover: cover.trim(),
      finished_date: finished || null,
      added: today,
    })
    .select('*')
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(201).json(data)
})

app.patch('/books/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const payload = req.body || {}

  const patch = {
    title: payload.title?.trim(),
    author: payload.author?.trim(),
    publisher: payload.publisher?.trim(),
    status: payload.status,
    rating: payload.rating !== undefined ? Number(payload.rating) : undefined,
    note: payload.note?.trim(),
    cover: payload.cover?.trim(),
    finished_date: payload.finishedDate ? payload.finishedDate : undefined,
  }

  Object.keys(patch).forEach((key) => {
    if (patch[key] === undefined) delete patch[key]
  })

  if (patch.title === '' || patch.author === '') {
    return res.status(400).json({ error: 'title and author cannot be empty' })
  }

  if (patch.status === 'Finished') {
    const today = new Date().toISOString().slice(0, 10)
    patch.finished_date = patch.finished_date || today
  }

  const { data, error } = await supabaseAdmin
    .from('books')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    return res.status(500).json({ error: error.message })
  }
  if (!data) {
    return res.status(404).json({ error: 'Not found' })
  }

  return res.json(data)
})

app.delete('/books/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { error } = await supabaseAdmin.from('books').delete().eq('id', id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(204).send()
})

export default app

export const localPort = PORT
