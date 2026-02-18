import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:4000')

const statusOptions = [
  { value: 'All', label: 'すべて' },
  { value: 'Reading', label: '読書中' },
  { value: 'Finished', label: '読了' },
  { value: 'Wishlist', label: '積読・購入予定' },
]

const emptyForm = {
  title: '',
  author: '',
  publisher: '',
  status: 'Reading',
  rating: '0',
  note: '',
  cover: '',
  finishedDate: '',
}

function App() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [view, setView] = useState('list')
  const [editingId, setEditingId] = useState(null)
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem('adminToken') || ''
  )
  const [adminInput, setAdminInput] = useState('')

  const isAdmin = Boolean(adminToken)

  const normalizeBook = (book) => ({
    ...book,
    rating: Number(book.rating) || 0,
    finishedDate: book.finishedDate ?? book.finished_date ?? '',
    added: book.added ?? '',
  })

  const fetchBooks = async ({ status = filter, q = query, signal } = {}) => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (q?.trim()) params.set('q', q.trim())
    const url = `${API_BASE}/books?${params.toString()}`
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new Error(`読み込みに失敗しました (${response.status})`)
      }
      const data = await response.json()
      setBooks(Array.isArray(data) ? data.map(normalizeBook) : [])
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || '読み込みに失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchBooks({ status: filter, q: query, signal: controller.signal })
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [filter, query])

  const metrics = useMemo(() => {
    const safeBooks = Array.isArray(books) ? books : []
    const total = safeBooks.length
    const reading = safeBooks.filter((book) => book.status === 'Reading').length
    const finished = safeBooks.filter((book) => book.status === 'Finished').length
    const wishlist = safeBooks.filter((book) => book.status === 'Wishlist').length
    const rated = safeBooks.filter((book) => Number(book.rating) > 0)
    const averageRating = rated.length
      ? (rated.reduce((sum, book) => sum + Number(book.rating), 0) / rated.length)
          .toFixed(1)
      : '—'

    return { total, reading, finished, wishlist, averageRating }
  }, [books])

  const visibleBooks = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    const safeBooks = Array.isArray(books) ? books : []
    return safeBooks
      .filter((book) => (filter === 'All' ? true : book.status === filter))
      .filter((book) => {
        if (!trimmed) return true
        return [book.title, book.author]
          .join(' ')
          .toLowerCase()
          .includes(trimmed)
      })
      .sort((a, b) => {
        const order = { Reading: 0, Finished: 1, Wishlist: 2 }
        const statusGap = (order[a.status] ?? 3) - (order[b.status] ?? 3)
        if (statusGap !== 0) return statusGap
        if (a.status === 'Finished' && b.status === 'Finished') {
          const aDate = a.finishedDate || ''
          const bDate = b.finishedDate || ''
          if (aDate !== bDate) return aDate < bDate ? 1 : -1
        }
        return a.added < b.added ? 1 : -1
      })
  }, [books, filter, query])

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const ensureAdmin = () => {
    if (!adminToken) {
      setError('管理用パスワードが必要です')
      return false
    }
    return true
  }

  const handleAdminLogin = (event) => {
    event.preventDefault()
    const nextToken = adminInput.trim()
    if (!nextToken) return
    localStorage.setItem('adminToken', nextToken)
    setAdminToken(nextToken)
    setAdminInput('')
    setError('')
  }

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken')
    setAdminToken('')
    setEditingId(null)
    setForm(emptyForm)
    setView('list')
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!ensureAdmin()) return
    if (!form.title.trim() || !form.author.trim()) return

    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      publisher: form.publisher.trim(),
      status: form.status,
      rating: Number(form.rating),
      note: form.note.trim(),
      cover: form.cover.trim(),
      finishedDate: form.finishedDate.trim(),
    }

    const adminHeaders = adminToken ? { 'X-Admin-Token': adminToken } : {}

    const request = editingId
      ? fetch(`${API_BASE}/books/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...adminHeaders },
          body: JSON.stringify(payload),
        })
      : fetch(`${API_BASE}/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...adminHeaders },
          body: JSON.stringify(payload),
        })

    setLoading(true)
    setError('')
    request
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('管理用パスワードが正しくありません')
          }
          throw new Error(`保存に失敗しました (${response.status})`)
        }
        await response.json()
        setEditingId(null)
        setForm(emptyForm)
        setView('list')
        await fetchBooks({ status: filter, q: query })
      })
      .catch((err) => {
        setError(err.message || '保存に失敗しました')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const removeBook = (id) => {
    if (!ensureAdmin()) return
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/books/${id}`, {
      method: 'DELETE',
      headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
    })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('管理用パスワードが正しくありません')
          }
          throw new Error(`削除に失敗しました (${response.status})`)
        }
        return fetchBooks({ status: filter, q: query })
      })
      .catch((err) => {
        setError(err.message || '削除に失敗しました')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const updateStatus = (id, nextStatus) => {
    if (!ensureAdmin()) return
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/books/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      },
      body: JSON.stringify({ status: nextStatus }),
    })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('管理用パスワードが正しくありません')
          }
          throw new Error(`更新に失敗しました (${response.status})`)
        }
        return fetchBooks({ status: filter, q: query })
      })
      .catch((err) => {
        setError(err.message || '更新に失敗しました')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const startEdit = (book) => {
    if (!ensureAdmin()) return
    setForm({
      title: book.title ?? '',
      author: book.author ?? '',
      publisher: book.publisher ?? '',
      status: book.status ?? 'Reading',
      rating: String(book.rating ?? '0'),
      note: book.note ?? '',
      cover: book.cover ?? '',
      finishedDate: book.finishedDate ?? '',
    })
    setEditingId(book.id)
    setView('form')
  }

  const startCreate = () => {
    if (!ensureAdmin()) return
    setEditingId(null)
    setForm(emptyForm)
    setView('form')
  }

  const backToList = () => {
    setEditingId(null)
    setForm(emptyForm)
    setView('list')
  }

  const renderStars = (rating) => {
    const count = Number(rating)
    if (!count) return '未評価'
    const clamped = Math.max(0, Math.min(5, count))
    return `${'★'.repeat(clamped)}${'☆'.repeat(5 - clamped)}`
  }

  return (
    <div className="page">
      <div className="backdrop" />
      <div className="paper-noise" />

      <header className="hero">
        <div className="hero-media">
          <img
            className="hero-cat"
            src="https://images.unsplash.com/photo-1598439210625-5067c578f3f6?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8JUUzJTgzJTlBJUUzJTgzJUIzJUUzJTgyJUFFJUUzJTgzJUIzfGVufDB8fDB8fHww"
            alt="猫のポートレート"
            role="button"
            tabIndex={0}
            onClick={backToList}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                backToList()
              }
            }}
          />
        </div>
        <div className="hero-actions">
          <div className="metric">
            <span>総冊数</span>
            <strong>{metrics.total}</strong>
          </div>
          <div className="metric">
            <span>平均評価</span>
            <strong>{metrics.averageRating}</strong>
          </div>
        </div>
      </header>

      <main className="layout layout-single">
        {(loading || error) && (
          <div className={`status-banner ${error ? 'error' : ''}`}>
            {loading && <span>同期中…</span>}
            {!loading && error && <span>{error}</span>}
          </div>
        )}
        {view === 'form' && isAdmin ? (
          <section className="panel form-panel">
            <div className="panel-head">
              <div>
                <h2>{editingId ? '本を編集' : '本を登録'}</h2>
                <p>タイトルと著者名は必須です。</p>
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={backToList}
              >
                一覧に戻る
              </button>
            </div>

            <form className="book-form" onSubmit={handleSubmit}>
              <label className="field">
                タイトル
                <input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="例: 未来の古書店"
                />
              </label>
              <label className="field">
                著者
                <input
                  name="author"
                  value={form.author}
                  onChange={handleFormChange}
                  placeholder="例: 佐藤 玲奈"
                />
              </label>
              <label className="field">
                出版社
                <input
                  name="publisher"
                  value={form.publisher}
                  onChange={handleFormChange}
                  placeholder="例: 青灯社"
                />
              </label>
              <label className="field">
                ステータス
                <select name="status" value={form.status} onChange={handleFormChange}>
                  <option value="Reading">読書中</option>
                  <option value="Finished">読了</option>
                  <option value="Wishlist">積読・購入予定</option>
                </select>
              </label>
              <label className="field">
                評価
                <select name="rating" value={form.rating} onChange={handleFormChange}>
                  <option value="0">未評価</option>
                  <option value="1">★☆☆☆☆</option>
                  <option value="2">★★☆☆☆</option>
                  <option value="3">★★★☆☆</option>
                  <option value="4">★★★★☆</option>
                  <option value="5">★★★★★</option>
                </select>
              </label>
              <label className="field">
                表紙画像URL
                <input
                  name="cover"
                  value={form.cover}
                  onChange={handleFormChange}
                  placeholder="https://example.com/cover.jpg"
                />
              </label>
              <label className="field">
                読了日
                <input
                  type="date"
                  name="finishedDate"
                  value={form.finishedDate}
                  onChange={handleFormChange}
                />
              </label>
              <label className="field wide">
                メモ
                <textarea
                  name="note"
                  value={form.note}
                  onChange={handleFormChange}
                  placeholder="一言メモや感想を記録"
                />
              </label>
              <div className="form-actions">
                <button className="btn ghost" type="button" onClick={backToList}>
                  戻る
                </button>
                <button className="btn primary" type="submit">
                  {editingId ? '更新する' : '登録する'}
                </button>
              </div>
            </form>
          </section>
        ) : view === 'form' && !isAdmin ? (
          <section className="panel form-panel">
            <div className="panel-head">
              <div>
                <h2>管理者ログインが必要です</h2>
                <p>編集・登録には管理用パスワードが必要です。</p>
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={backToList}
              >
                一覧に戻る
              </button>
            </div>
            <div className="form-collapsed">
              画面上部の「管理者」欄からログインしてください。
            </div>
          </section>
        ) : (
          <section className="panel list-panel">
            <div className="panel-head">
              <div>
                <h2>読書メモ</h2>
                <p>{metrics.reading}冊読書中 ・ {metrics.finished}冊読了 ・ {metrics.wishlist}冊積読</p>
              </div>
              <div className="list-tools">
                <button
                  type="button"
                  className="btn primary"
                  onClick={startCreate}
                  disabled={!isAdmin}
                  title={isAdmin ? '' : '管理者ログインが必要です'}
                >
                  登録フォームを開く
                </button>
                <div className="search">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="タイトル・著者で検索"
                  />
                </div>
                <div className="status-chips">
                  {statusOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={filter === item.value ? 'chip active' : 'chip'}
                      onClick={() => setFilter(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="book-list">
              {visibleBooks.length === 0 && (
                <div className="empty">
                  <p>該当する本がありません。検索条件を変えるか、新しく登録しましょう。</p>
                </div>
              )}
              {visibleBooks.map((book) => (
                <article key={book.id} className="book-card">
                  <div className="book-cover">
                    {book.cover ? (
                      <img src={book.cover} alt={`${book.title} 表紙`} loading="lazy" />
                    ) : (
                      <div className="cover-placeholder">NO COVER</div>
                    )}
                  </div>
                  <div>
                    <div className="book-top">
                      <h3>{book.title}</h3>
                      <span className={`badge ${book.status.toLowerCase()}`}>
                        {statusOptions.find((item) => item.value === book.status)?.label}
                      </span>
                  </div>
                  <p className="meta">{book.author} · {book.publisher || '出版社未入力'}</p>
                  {book.finishedDate && book.status === 'Finished' && (
                    <p className="meta">読了日: {book.finishedDate}</p>
                  )}
                  {book.note && <p className="note">{book.note}</p>}
                </div>
                  <div className="book-actions">
                    <div className="rating">評価: {renderStars(book.rating)}</div>
                    <div className="action-row">
                      <button
                        className={`btn ghost ${book.status === 'Reading' ? 'active' : ''}`}
                        onClick={() => updateStatus(book.id, 'Reading')}
                        disabled={!isAdmin}
                        title={isAdmin ? '' : '管理者ログインが必要です'}
                      >
                        読書中
                      </button>
                      <button
                        className={`btn ghost ${book.status === 'Finished' ? 'active' : ''}`}
                        onClick={() => updateStatus(book.id, 'Finished')}
                        disabled={!isAdmin}
                        title={isAdmin ? '' : '管理者ログインが必要です'}
                      >
                        読了
                      </button>
                      <button
                        className={`btn ghost ${book.status === 'Wishlist' ? 'active' : ''}`}
                        onClick={() => updateStatus(book.id, 'Wishlist')}
                        disabled={!isAdmin}
                        title={isAdmin ? '' : '管理者ログインが必要です'}
                      >
                        積読
                      </button>
                    </div>
                    <div className="action-footer">
                      <button
                        className="btn edit"
                        onClick={() => startEdit(book)}
                        disabled={!isAdmin}
                        title={isAdmin ? '' : '管理者ログインが必要です'}
                      >
                        編集
                      </button>
                      <button
                        className="btn danger"
                        onClick={() => removeBook(book.id)}
                        disabled={!isAdmin}
                        title={isAdmin ? '' : '管理者ログインが必要です'}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="admin-card footer-admin">
          <div className="admin-status">
            <span>管理者</span>
            <strong>{isAdmin ? 'ON' : 'OFF'}</strong>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="btn ghost"
              onClick={handleAdminLogout}
            >
              ログアウト
            </button>
          ) : (
            <form className="admin-row" onSubmit={handleAdminLogin}>
              <input
                className="admin-input"
                type="password"
                value={adminInput}
                onChange={(event) => setAdminInput(event.target.value)}
                placeholder="管理用パスワード"
              />
              <button className="btn primary" type="submit">
                ログイン
              </button>
            </form>
          )}
          <p className="admin-note">編集・削除は管理者のみ</p>
        </div>
        <span>Library Desk v1.0</span>
      </footer>
    </div>
  )
}

export default App
