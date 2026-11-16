import React, { useMemo, useState } from 'react'
import { useLocalState, KEYS } from '../store.js'
import { CATEGORIES, QUESTIONS } from '../data/questions.js'

const DIFFS = [
  { key: 'all', label: '全部难度' },
  { key: 'easy', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '困难' }
]
const DIFF_META = { easy: { label: '简单', cls: 'green' }, medium: { label: '中等', cls: 'orange' }, hard: { label: '困难', cls: 'red' } }

// 极简 markdown 渲染：支持 #标题、- 列表、**加粗**、`code`、段落；纯 React 元素拼接，无 XSS 风险
function inlineMd(text, kp) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) => {
    const key = `${kp}-${i}`
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <strong key={key}>{p.slice(2, -2)}</strong>
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) return <code key={key}>{p.slice(1, -1)}</code>
    return <React.Fragment key={key}>{p}</React.Fragment>
  })
}
function renderMd(md) {
  const out = []
  let list = []
  const flush = () => {
    if (list.length) { out.push(<ul key={`ul-${out.length}`}>{list.map((li, i) => <li key={i}>{inlineMd(li, `li${out.length}-${i}`)}</li>)}</ul>); list = [] }
  }
  md.split('\n').forEach((raw, idx) => {
    const t = raw.trim()
    if (!t) { flush(); return }
    if (t.startsWith('- ')) { list.push(t.slice(2)); return }
    flush()
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const H = `h${h[1].length}`
      out.push(React.createElement(H, { key: idx }, inlineMd(h[2], `h${idx}`)))
    } else out.push(<p key={idx}>{inlineMd(t, `p${idx}`)}</p>)
  })
  flush()
  return out
}

function shuffleTake(arr, n) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

export default function Bank() {
  const [favorites, setFavorites] = useLocalState(KEYS.favorites, [])
  const [bankDone, setBankDone] = useLocalState(KEYS.bankDone, {})
  const [cat, setCat] = useState('全部')
  const [diff, setDiff] = useState('all')
  const [kw, setKw] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [doneFilter, setDoneFilter] = useState('all') // all | todo | done
  const [expanded, setExpanded] = useState({})
  const [practice, setPractice] = useState(null) // {list, idx, draft, phase:'answer'|'reveal', stats}

  const catCounts = useMemo(() => {
    const m = { 全部: QUESTIONS.length }
    CATEGORIES.forEach((c) => { m[c] = QUESTIONS.filter((q) => q.category === c).length })
    return m
  }, [])

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase()
    return QUESTIONS.filter((q) => {
      if (cat !== '全部' && q.category !== cat) return false
      if (diff !== 'all' && q.difficulty !== diff) return false
      if (favOnly && !favorites.includes(q.id)) return false
      const done = !!(bankDone[q.id] && bankDone[q.id].done)
      if (doneFilter === 'done' && !done) return false
      if (doneFilter === 'todo' && done) return false
      if (k) {
        const hay = `${q.question} ${q.tags.join(' ')} ${q.answer}`.toLowerCase()
        if (!hay.includes(k)) return false
      }
      return true
    })
  }, [cat, diff, kw, favOnly, doneFilter, favorites, bankDone])

  const doneCount = useMemo(() => QUESTIONS.filter((q) => bankDone[q.id] && bankDone[q.id].done).length, [bankDone])

  const toggleFav = (id) => setFavorites((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleDone = (id) => setBankDone((prev) => ({ ...prev, [id]: { done: !(prev[id] && prev[id].done), star: prev[id] ? !!prev[id].star : false } }))

  const markRemembered = (id) => {
    setBankDone((prev) => ({ ...prev, [id]: { done: true, star: prev[id] ? !!prev[id].star : false } }))
  }

  const startPractice = () => {
    const pool = filtered.length >= 3 ? filtered : (cat === '全部' ? QUESTIONS : QUESTIONS.filter((q) => q.category === cat))
    const list = shuffleTake(pool, Math.min(10, pool.length))
    setPractice({ list, idx: 0, draft: '', phase: 'answer', remembered: 0, needsWork: 0 })
  }
  const practiceNext = () => {
    setPractice((p) => {
      if (!p) return null
      if (p.idx + 1 >= p.list.length) return { ...p, phase: 'finish' }
      return { ...p, idx: p.idx + 1, draft: '', phase: 'answer' }
    })
  }

  const p = practice

  return (
    <div className="module">
      {/* 顶部统计 */}
      <div className="card">
        <div className="row">
          <div><div className="stat-num">{QUESTIONS.length}</div><div className="stat-label">总题数</div></div>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 8px' }} />
          <div><div className="stat-num">{doneCount}</div><div className="stat-label">已刷题数</div></div>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 8px' }} />
          <div><div className="stat-num">{favorites.length}</div><div className="stat-label">收藏题数</div></div>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={startPractice} disabled={!filtered.length && !QUESTIONS.length}>
            ▶ 开始刷题（随机 {Math.min(10, filtered.length || (cat === '全部' ? QUESTIONS.length : catCounts[cat]))} 题）
          </button>
        </div>
      </div>

      {/* 筛选区 */}
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="segmented">
            {['全部', ...CATEGORIES].map((c) => (
              <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>
                {c} <span className="muted" style={{ marginLeft: 4 }}>{catCounts[c]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <select className="select" style={{ width: 120 }} value={diff} onChange={(e) => setDiff(e.target.value)}>
            {DIFFS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="搜索题干 / 标签 / 答案关键词…" value={kw} onChange={(e) => setKw(e.target.value)} />
          <select className="select" style={{ width: 120 }} value={doneFilter} onChange={(e) => setDoneFilter(e.target.value)}>
            <option value="all">未刷+已刷</option>
            <option value="todo">只看未刷</option>
            <option value="done">只看已刷</option>
          </select>
          <button className={`btn btn-sm ${favOnly ? 'btn-primary' : ''}`} onClick={() => setFavOnly(!favOnly)}>
            ★ 只看收藏
          </button>
          <div className="spacer" />
          <span className="muted">共 {filtered.length} 题</span>
        </div>
      </div>

      {/* 题目列表 */}
      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          没有符合条件的题目，试试放宽筛选条件
        </div>
      ) : filtered.map((q) => {
        const fav = favorites.includes(q.id)
        const done = !!(bankDone[q.id] && bankDone[q.id].done)
        const open = !!expanded[q.id]
        const dm = DIFF_META[q.difficulty]
        return (
          <div key={q.id} className="list-item">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, lineHeight: 1.5, cursor: 'pointer' }} onClick={() => setExpanded((e) => ({ ...e, [q.id]: !e[q.id] }))}>
                  {done && <span className="tag green" style={{ marginRight: 8 }}>已刷</span>}
                  {q.question}
                </div>
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  <span className="tag primary">{q.category}</span>
                  <span className={`tag ${dm.cls}`}>{dm.label}</span>
                  {q.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <button className={`btn btn-sm ${fav ? 'btn-primary' : ''}`} title="收藏" onClick={() => toggleFav(q.id)}>★</button>
                <button className={`btn btn-sm ${done ? 'btn-primary' : ''}`} onClick={() => toggleDone(q.id)}>{done ? '撤销已刷' : '标记已刷'}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setExpanded((e) => ({ ...e, [q.id]: !e[q.id] }))}>{open ? '收起答案 ▲' : '展开答案 ▼'}</button>
              </div>
            </div>
            {open && (
              <React.Fragment>
                <hr className="divider" />
                <div className="md">{renderMd(q.answer)}</div>
              </React.Fragment>
            )}
          </div>
        )
      })}

      {/* 刷题模式 */}
      {p && p.phase !== 'finish' && (
        <div className="modal-mask" onClick={() => setPractice(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h3 className="modal-title" style={{ margin: 0 }}>刷题模式</h3>
              <div className="spacer" />
              <span className="muted">{p.idx + 1} / {p.list.length}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setPractice(null)}>✕ 退出</button>
            </div>
            <div className="progress" style={{ margin: '12px 0 16px' }}>
              <i style={{ width: `${(p.idx / p.list.length) * 100}%` }} />
            </div>
            {(() => {
              const q = p.list[p.idx]
              const dm = DIFF_META[q.difficulty]
              return (
                <React.Fragment>
                  <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                    <span className="tag primary">{q.category}</span>
                    <span className={`tag ${dm.cls}`}>{dm.label}</span>
                    {q.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.02rem', lineHeight: 1.6, marginBottom: 12 }}>{q.question}</div>
                  <div className="field">
                    <label>先自己组织一遍答案（口述或打字均可）</label>
                    <textarea className="textarea" style={{ minHeight: 100 }} placeholder="尝试回忆要点，写完再看参考答案对比…"
                      value={p.draft} onChange={(e) => setPractice((s) => s && { ...s, draft: e.target.value })} />
                  </div>
                  {p.phase === 'answer' ? (
                    <div className="row" style={{ marginTop: 12 }}>
                      <div className="spacer" />
                      <button className="btn btn-primary" onClick={() => setPractice((s) => s && { ...s, phase: 'reveal' })}>看参考答案 →</button>
                    </div>
                  ) : (
                    <React.Fragment>
                      <hr className="divider" />
                      <div className="md" style={{ maxHeight: '30vh', overflowY: 'auto' }}>{renderMd(q.answer)}</div>
                      <div className="row" style={{ marginTop: 14 }}>
                        <div className="spacer" />
                        <button className="btn" onClick={() => { markRemembered(q.id); setPractice((s) => s && { ...s, remembered: s.remembered + 1 }); practiceNext() }}>
                          ✅ 记住了
                        </button>
                        <button className="btn btn-danger" onClick={() => { setPractice((s) => s && { ...s, needsWork: s.needsWork + 1 }); practiceNext() }}>
                          🔄 还需练习
                        </button>
                      </div>
                    </React.Fragment>
                  )}
                </React.Fragment>
              )
            })()}
          </div>
        </div>
      )}
      {p && p.phase === 'finish' && (
        <div className="modal-mask">
          <div className="modal">
            <h3 className="modal-title">🎉 本轮刷题完成</h3>
            <div className="alert ok">
              共 {p.list.length} 题：记住了 <b>{p.remembered}</b> 题，还需练习 <b>{p.needsWork}</b> 题。
              {p.needsWork > 0 ? ' 建议明天再来一轮巩固。' : ' 全部掌握，太棒了！'}
            </div>
            <div className="row">
              <div className="spacer" />
              <button className="btn" onClick={() => setPractice(null)}>关闭</button>
              <button className="btn btn-primary" onClick={startPractice}>再来一轮</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
