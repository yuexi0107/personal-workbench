import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocalState, KEYS } from '../store.js'
import { aiAvailable, chatJson } from '../ai.js'
import { QUESTIONS, CATEGORIES } from '../data/questions.js'

const genId = () => Date.now() + '-' + Math.random().toString(36).slice(2, 7)
const QUEUE_KEY = 'iw:mock-queue'
const DIMS = ['内容完整', '深度', '表达结构', '匹配岗位']
const BANK = Array.isArray(QUESTIONS) ? QUESTIONS : []
const CATS = Array.isArray(CATEGORIES) ? CATEGORIES : []

const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const scoreClass = (n) => (n >= 80 ? 'badge-score good' : n >= 60 ? 'badge-score mid' : 'badge-score bad')

function shuffle(list) {
  const arr = list.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

// 统一题目结构
function normalize(q, i) {
  return {
    id: q.id || genId(),
    question: String(q.question || q.q || '').trim(),
    answer: String(q.answer || q.a || '').trim(),
    why: q.why || '',
    focus: q.focus || '',
    category: q.category || '押题',
    difficulty: q.difficulty || 'medium',
    index: i
  }
}

function pickRandom(category, count) {
  const pool = category && category !== '全部' ? BANK.filter((q) => q.category === category) : BANK
  return shuffle(pool).slice(0, count).map(normalize)
}

// 汇总统计
function summarize(rawQa) {
  const qa = Array.isArray(rawQa) ? rawQa : []
  const scored = qa.filter((r) => typeof r.score === 'number')
  const total = scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : 0
  const totalSec = qa.reduce((s, r) => s + (r.seconds || 0), 0)
  const dimAvg = {}
  DIMS.forEach((d) => {
    const vals = qa.map((r) => r.dims && r.dims[d]).filter((v) => typeof v === 'number')
    if (vals.length) dimAvg[d] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
  })
  return { total, scored: scored.length, unscored: qa.length - scored.length, totalSec, dimAvg }
}

function toMarkdown(report) {
  const { total, dimAvg, totalSec } = summarize(report.qa)
  const lines = []
  lines.push(`# 模拟面试报告：${report.title}`)
  lines.push('')
  if (report.role) lines.push(`- 目标岗位：${report.role}`)
  lines.push(`- 面试日期：${new Date(report.createdAt).toLocaleString()}`)
  lines.push(`- 题目数：${report.qa.length}`)
  lines.push(`- 总分：${total} / 100（已评价 ${report.qa.filter((r) => typeof r.score === 'number').length} 题）`)
  lines.push(`- 总用时：${fmtTime(totalSec)}`)
  if (Object.keys(dimAvg).length) {
    lines.push(`- 维度平均：${DIMS.filter((d) => dimAvg[d] !== undefined).map((d) => `${d} ${dimAvg[d]}`).join(' / ')}`)
  }
  lines.push('')
  lines.push('## 逐题回顾')
  lines.push('')
  report.qa.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.q}`)
    lines.push('')
    lines.push(`- 用时：${fmtTime(r.seconds)}${typeof r.score === 'number' ? ` ｜ 得分：${r.score}` : ' ｜ 未评价'}`)
    if (r.mode) lines.push(`- 评价来源：${r.mode === 'ai' ? 'AI 评价' : '手动自评'}`)
    lines.push('')
    lines.push('**我的回答**')
    lines.push('')
    lines.push((r.a || '（空）').split('\n').join('\n'))
    lines.push('')
    if (r.comment) lines.push(`**评语**：${r.comment}`)
    if (Array.isArray(r.improvements) && r.improvements.length) {
      lines.push('')
      lines.push('**改进建议**')
      r.improvements.forEach((im) => lines.push(`- ${im}`))
    }
    if (r.ref) {
      lines.push('')
      lines.push('<details><summary>参考答案</summary>')
      lines.push('')
      lines.push(r.ref)
      lines.push('')
      lines.push('</details>')
    }
    lines.push('')
  })
  return lines.join('\n')
}

function downloadMd(report) {
  const md = toMarkdown(report)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `模拟面试报告-${report.title || 'interview'}-${new Date(report.createdAt || Date.now()).toISOString().slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ============ AI 单题评价 ============ */
async function aiJudge(qItem, userAnswer, role) {
  const messages = [
    {
      role: 'system',
      content: '你是一名资深技术面试官，正在对候选人的模拟面试作答做逐题评分与复盘。'
        + '评分要严格但公正：只依据回答本身，不臆测未写出的内容。语言使用简体中文。'
    },
    {
      role: 'user',
      content: `请评价下面这道面试题的候选人作答。

${role ? `## 目标岗位\n${role}\n` : ''}## 题目
${qItem.question}

## 参考答案
${qItem.answer || '（无参考答案，请依据题目本身与通用工程实践判断）'}

${qItem.why ? `## 考察点\n${qItem.why}\n` : ''}## 候选人回答（用时 ${fmtTime(qItem.answerSeconds || 0)}）
${userAnswer || '（候选人未作答）'}

## 输出要求
- score：0-100 综合分。参考区间：<60 为不合格，60-79 为基本达标，80-89 为良好，90+ 为优秀。
- dimensions：四个维度各自 0-100 分，键名固定为 "内容完整"、"深度"、"表达结构"、"匹配岗位"。
- comment：2-4 句总体点评，先指出最大亮点，再指出最大问题。
- improvements：3-5 条具体可执行的改进建议（例如补充什么数据、什么原理、怎么组织表达）。
- 只输出 JSON，结构严格为：
{"score":0,"dimensions":{"内容完整":0,"深度":0,"表达结构":0,"匹配岗位":0},"comment":"","improvements":[""]}
4. 不要输出任何 JSON 之外的文字。`
    }
  ]
  const data = await chatJson(messages, { maxTokens: 1200, temperature: 0.2 })
  const clamp = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.min(100, Math.round(n)))
  }
  const dimsRaw = data.dimensions || {}
  const dims = {}
  DIMS.forEach((d) => {
    const v = clamp(dimsRaw[d])
    if (v !== undefined) dims[d] = v
  })
  const score = clamp(data.score) ?? (Object.keys(dims).length
    ? Math.round(Object.values(dims).reduce((s, v) => s + v, 0) / Object.values(dims).length)
    : 0)
  return {
    score,
    dims: Object.keys(dims).length ? dims : null,
    comment: String(data.comment || '').trim(),
    improvements: Array.isArray(data.improvements) ? data.improvements.map((x) => String(x)).slice(0, 6) : [],
    mode: 'ai'
  }
}

/* ============ 评价展示 ============ */
function Evaluation({ rec }) {
  if (typeof rec.score !== 'number') return null
  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--panel-2)', borderRadius: 10 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className={scoreClass(rec.score)}>{rec.score}</span>
        <span className="muted">{rec.mode === 'ai' ? 'AI 评价' : '手动自评'}</span>
        <div className="spacer" />
        <span className="muted">用时 {fmtTime(rec.seconds)}</span>
      </div>
      {rec.dims && (
        <div className="row" style={{ marginBottom: 8 }}>
          {DIMS.filter((d) => rec.dims[d] !== undefined).map((d) => (
            <span key={d} className={`tag ${rec.dims[d] >= 80 ? 'green' : rec.dims[d] >= 60 ? 'orange' : 'red'}`}>
              {d} {rec.dims[d]}
            </span>
          ))}
        </div>
      )}
      {rec.comment && <div style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>{rec.comment}</div>}
      {Array.isArray(rec.improvements) && rec.improvements.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>改进建议</div>
          <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem', lineHeight: 1.7 }}>
            {rec.improvements.map((im, i) => <li key={i}>{im}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ============ 报告卡（复用：本次结束 / 历史回看） ============ */
function ReportCard({ report, onBack }) {
  const qa = Array.isArray(report.qa) ? report.qa : []
  const sum = useMemo(() => summarize(qa), [report.qa])
  const hasDims = Object.keys(sum.dimAvg).length > 0
  return (
    <div className="card">
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <h3 className="card-title" style={{ margin: 0 }}>面试报告：{report.title}</h3>
          <p className="card-sub" style={{ margin: '4px 0 0' }}>
            {report.role ? `岗位：${report.role} · ` : ''}
            {report.qa.length} 题 · 用时 {fmtTime(sum.totalSec)} · {new Date(report.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'center' }}>
          <div className={scoreClass(sum.total)}>{sum.total}</div>
          <div className="stat-label">总分</div>
        </div>
      </div>

      {sum.unscored > 0 && (
        <div className="alert warn" style={{ marginTop: 12 }}>
          有 {sum.unscored} 题未评价，未计入总分（按已评价题目取平均）。
        </div>
      )}

      {hasDims && (
        <div className="grid-2" style={{ marginTop: 14 }}>
          {DIMS.filter((d) => sum.dimAvg[d] !== undefined).map((d) => (
            <div key={d}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="stat-label">{d}</span>
                <span className="muted">{sum.dimAvg[d]}</span>
              </div>
              <div className="progress"><i style={{ width: `${sum.dimAvg[d]}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => downloadMd(report)}>导出 Markdown 报告</button>
        {onBack && <button className="btn" onClick={onBack}>返回面试列表</button>}
      </div>

      <hr className="divider" />
      <h4 className="card-title">逐题回顾</h4>
      {report.qa.map((r, i) => (
        <div className="list-item" key={i}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{i + 1}. {r.q}</div>
              <div className="muted" style={{ marginTop: 6 }}>用时 {fmtTime(r.seconds)}</div>
              <div style={{ marginTop: 8, fontSize: '0.86rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>我的回答：</span>
                {(r.a || '（未作答）').length > 160 ? `${(r.a || '').slice(0, 160)}…` : (r.a || '（未作答）')}
              </div>
              {r.comment && (
                <div style={{ marginTop: 8, fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 600 }}>评语：</span>{r.comment}
                </div>
              )}
            </div>
            <span className={typeof r.score === 'number' ? scoreClass(r.score) : 'tag'}>
              {typeof r.score === 'number' ? r.score : '未评价'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MockInterview() {
  const [interviews, setInterviews] = useLocalState(KEYS.interviews, [])
  const aiOn = aiAvailable()

  const [phase, setPhase] = useState('setup') // setup | running | report
  const [queue, setQueue] = useState(null) // 来自简历押题的题目
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState('')
  const [records, setRecords] = useState([])
  const [reviewing, setReviewing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [judging, setJudging] = useState(false)
  const [judgeErr, setJudgeErr] = useState('')
  const [stars, setStars] = useState(0)
  const [manualComment, setManualComment] = useState('')
  const [category, setCategory] = useState('全部')
  const [count, setCount] = useState(8)
  const [title, setTitle] = useState('')
  const [role, setRole] = useState('')
  const [report, setReport] = useState(null) // 当前或历史回看的报告
  const [notice, setNotice] = useState('')
  const [sourceLabel, setSourceLabel] = useState('') // 题源：押题队列 / 分类抽题
  const startedAt = useRef(0)

  // 读取押题队列（读完即清空，避免重复消费）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(QUEUE_KEY)
      if (!raw) return
      sessionStorage.removeItem(QUEUE_KEY)
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) {
        setQueue(parsed.map((q, i) => normalize(q, i)).filter((q) => q.question))
      }
    } catch {
      sessionStorage.removeItem(QUEUE_KEY)
    }
  }, [])

  // 单题计时
  useEffect(() => {
    if (phase !== 'running' || reviewing) return undefined
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase, reviewing, idx])

  const current = questions[idx] || null
  const currentRec = reviewing ? records[idx] : null

  function startFrom(list, label, roleText, srcLabel) {
    if (!list.length) { setNotice('没有可用题目：离线题库尚未加载或该分类下无题。'); return }
    setNotice('')
    setQuestions(list)
    setSourceLabel(srcLabel || '题库抽题')
    setRecords([])
    setIdx(0)
    setDraft('')
    setElapsed(0)
    setReviewing(false)
    setStars(0)
    setManualComment('')
    setJudgeErr('')
    setTitle(label || `模拟面试-${new Date().toLocaleDateString()}`)
    setRole(roleText || '')
    startedAt.current = Date.now()
    setPhase('running')
  }

  function submitAnswer() {
    if (!current) return
    const rec = {
      q: current.question,
      a: draft.trim(),
      seconds: elapsed,
      ref: current.answer,
      score: undefined,
      comment: '',
      dims: null,
      improvements: [],
      mode: ''
    }
    setRecords((prev) => {
      const next = prev.slice(0, idx)
      next[idx] = rec
      return next
    })
    setReviewing(true)
    setStars(0)
    setManualComment('')
    setJudgeErr('')
  }

  async function runAiJudge() {
    if (!current) return
    setJudging(true)
    setJudgeErr('')
    try {
      const res = await aiJudge({ ...current, answerSeconds: elapsed }, draft.trim(), role)
      setRecords((prev) => prev.map((r, i) => (i === idx ? { ...r, ...res } : r)))
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      setJudgeErr(
        msg === 'AI_NOT_CONFIGURED'
          ? 'AI 未配置，请改用下方手动星级自评。'
          : `AI 评价失败：${msg}。可改用手动自评，不影响继续面试。`
      )
    } finally {
      setJudging(false)
    }
  }

  function saveManualJudge() {
    if (!stars) { setJudgeErr('请先点选 1-5 星评分'); return }
    setJudgeErr('')
    setRecords((prev) => prev.map((r, i) => (
      i === idx ? { ...r, score: stars * 20, comment: manualComment.trim(), dims: null, improvements: [], mode: 'manual' } : r
    )))
  }

  function goNext() {
    if (idx + 1 >= questions.length) { finish(); return }
    setIdx(idx + 1)
    setDraft('')
    setElapsed(0)
    setReviewing(false)
    setJudgeErr('')
    setStars(0)
    setManualComment('')
  }

  function goPrev() {
    if (idx === 0) return
    const target = idx - 1
    setIdx(target)
    setRecords((prev) => prev.slice(0, target))
    setDraft('')
    setElapsed(0)
    setReviewing(false)
    setJudgeErr('')
    setNotice('已回到上一题，本题答案需重新提交。')
  }

  function redoAnswer() {
    setRecords((prev) => prev.slice(0, idx))
    setDraft(currentRec ? currentRec.a : '')
    setElapsed(currentRec ? currentRec.seconds : 0)
    setReviewing(false)
    setJudgeErr('')
  }

  function finish() {
    const qa = records.slice(0, questions.length).filter(Boolean)
    if (!qa.length) { setPhase('setup'); return }
    const payload = {
      id: genId(),
      title: title || `模拟面试-${new Date().toLocaleDateString()}`,
      role: role || '',
      qa,
      totalSec: qa.reduce((s, r) => s + (r.seconds || 0), 0),
      report: '',
      createdAt: new Date().toISOString()
    }
    const finalReport = { ...payload, source: sourceLabel || (queue && questions === queue ? '押题队列' : '题库抽题') }
    finalReport.report = toMarkdown(finalReport)
    setInterviews([finalReport, ...(interviews || [])].slice(0, 50))
    setReport(finalReport)
    setPhase('report')
    setNotice(`面试已结束，报告已保存（开始于 ${new Date(startedAt.current).toLocaleTimeString()}）。`)
  }

  function deleteInterview(id) {
    setInterviews((interviews || []).filter((x) => x.id !== id))
    if (report && report.id === id) setReport(null)
  }

  /* ---------- 准备页 ---------- */
  function setupView() {
    return (
      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">开始一场模拟面试</h3>
          <p className="card-sub">
            优先使用「简历押题」送过来的题目；也可以从题库随机抽题。当前
            {aiOn ? '已连接 AI，作答后可自动评分。' : '为离线模式，每题由你手动 1-5 星自评。'}
          </p>

          {queue && queue.length > 0 && (
            <div className="alert ok">
              检测到简历押题队列：{queue.length} 道题。建议直接使用，题目更贴合你的简历与目标 JD。
            </div>
          )}

          <div className="field">
            <label>面试标题（可选）</label>
            <input className="input" placeholder="如：某某科技 后端一面" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>目标岗位（可选，用于 AI 评价「匹配岗位」维度）</label>
            <input className="input" placeholder="如：Java 后端 / 大模型应用工程师" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>

          {queue && queue.length > 0 && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              onClick={() => startFrom(queue, title || '简历押题模拟面试', role, '简历押题队列')}
            >
              用押题队列开始（{queue.length} 题）
            </button>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">或：从题库抽题</h3>
          <p className="card-sub">默认随机抽 6-8 题；也可指定分类与固定题数（5 / 8 / 12）。</p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => startFrom(pickRandom('全部', 6 + Math.floor(Math.random() * 3)), title || '随机模拟面试', role, '题库随机 6-8 题')}>
              快速开始（随机 6-8 题）
            </button>
            <span className="muted">题库共 {BANK.length} 题</span>
          </div>
          <hr className="divider" />
          <div className="grid-2">
            <div className="field">
              <label>题目分类</label>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="全部">全部分类</option>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>题数</label>
              <div className="segmented">
                {[5, 8, 12].map((n) => (
                  <button key={n} className={count === n ? 'active' : ''} onClick={() => setCount(n)}>{n} 题</button>
                ))}
              </div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => startFrom(pickRandom(category, count), title || '模拟面试', role, `题库抽题：${category} ${count} 题`)}>
              按条件抽题并开始
            </button>
          </div>
          {BANK.length === 0 && (
            <div className="alert warn" style={{ marginTop: 12 }}>
              题库暂不可用（data/questions.js 未就绪）。此时可用「简历押题」生成题目后送入模拟面试。
            </div>
          )}
          {notice && <div className="alert error" style={{ marginTop: 12 }}>{notice}</div>}
        </div>
      </div>
    )
  }

  /* ---------- 作答页 ---------- */
  function runningView() {
    return (
      <>
        <div className="card">
          <div className="row">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>第 {idx + 1} / {questions.length} 题</h3>
              <p className="card-sub" style={{ margin: '4px 0 0' }}>
                {title}
                {role ? ` · ${role}` : ''}
                {sourceLabel ? ` · 题源：${sourceLabel}` : ''}
                {current && current.focus ? ' · ' : ''}
                {current && current.focus && <span className={current.focus === '必问' ? 'tag red' : current.focus === '高频' ? 'tag orange' : 'tag green'}>{current.focus}</span>}
              </p>
            </div>
            <div className="spacer" />
            <div style={{ textAlign: 'right' }}>
              <div className="stat-num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(elapsed)}</div>
              <div className="stat-label">本题用时</div>
            </div>
          </div>
          <div className="progress" style={{ marginTop: 12 }}>
            <i style={{ width: `${((idx + (reviewing ? 1 : 0)) / questions.length) * 100}%` }} />
          </div>
        </div>

        {!reviewing && current && (
          <div className="card">
            <h4 className="card-title">{current.question}</h4>
            {current.why && <p className="card-sub">考察点：{current.why}</p>}
            <div className="field">
              <label>你的回答（开始作答即计时）</label>
              <textarea
                className="textarea"
                style={{ minHeight: 200 }}
                placeholder="像真实面试一样口述后记录：结论先行 → 原理/方案 → 项目实例 → 量化结果"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" disabled={!draft.trim()} onClick={submitAnswer}>提交本题</button>
              <button className="btn" disabled={idx === 0} onClick={goPrev}>上一题</button>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => { setPhase('setup'); setNotice(''); }}>放弃本场</button>
            </div>
            <div className="divider" />
            <details>
              <summary className="muted" style={{ cursor: 'pointer' }}>查看参考答案（练习模式可看，正式模拟建议提交后再看）</summary>
              <div style={{ marginTop: 10, fontSize: '0.86rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: '10px 12px', borderRadius: 10 }}>
                {current.answer || '（本题暂无参考答案）'}
              </div>
            </details>
          </div>
        )}

        {reviewing && currentRec && (
          <div className="card">
            <h4 className="card-title">{currentRec.q}</h4>
            <p className="card-sub">你的回答（{fmtTime(currentRec.seconds)}）：</p>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 10 }}>
              {currentRec.a}
            </div>

            {typeof currentRec.score === 'number' ? (
              <Evaluation rec={currentRec} />
            ) : (
              <>
                <div className="row" style={{ marginTop: 14 }}>
                  {aiOn && (
                    <button className="btn btn-primary" disabled={judging} onClick={runAiJudge}>
                      {judging ? 'AI 评价中…' : 'AI 评价本题'}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={redoAnswer}>重新作答</button>
                  <div className="spacer" />
                  <button className="btn btn-ghost btn-sm" onClick={goNext}>
                    {idx + 1 >= questions.length ? '跳过评价并结束' : '跳过评价并下一题'}
                  </button>
                </div>
                {judging && <div className="loading-line"><span className="spinner" />正在按四个维度打分并生成点评…</div>}
                {judgeErr && <div className="alert error" style={{ marginTop: 10 }}>{judgeErr}</div>}

                {!aiOn && <div className="alert info" style={{ marginTop: 12 }}>离线模式：请手动为本题打分（1-5 星 = 20-100 分）。</div>}
                <hr className="divider" />
                <div className="field">
                  <label>手动自评（星级）</label>
                  <div className="row" style={{ gap: 6 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={`btn btn-sm ${stars === n ? 'btn-primary' : ''}`}
                        onClick={() => setStars(n)}
                      >
                        {'★'.repeat(n)}
                      </button>
                    ))}
                    {stars > 0 && <span className="muted">{stars} 星 = {stars * 20} 分</span>}
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>自评评语（可选）</label>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 80 }}
                    placeholder="记下这题哪里没答好、下次怎么补"
                    value={manualComment}
                    onChange={(e) => setManualComment(e.target.value)}
                  />
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={saveManualJudge}>保存自评</button>
                </div>
              </>
            )}

            {currentRec.ref && (
              <details style={{ marginTop: 14 }}>
                <summary className="muted" style={{ cursor: 'pointer' }}>参考答案对照</summary>
                <div style={{ marginTop: 10, fontSize: '0.86rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: '10px 12px', borderRadius: 10 }}>
                  {currentRec.ref}
                </div>
              </details>
            )}

            <hr className="divider" />
            <div className="row">
              <button className="btn btn-primary" onClick={goNext}>
                {idx + 1 >= questions.length ? '结束面试并生成报告' : '下一题'}
              </button>
              <span className="muted">已提交 {records.filter(Boolean).length} / {questions.length} 题</span>
            </div>
          </div>
        )}
      </>
    )
  }

  /* ---------- 报告页 ---------- */
  function reportView() {
    return (
      <>
        <div className="card" style={{ padding: '14px 20px' }}>
          <div className="row">
            <span className="tag primary">本场结束</span>
            <span className="muted">{notice}</span>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={() => { setReport(null); setPhase('setup'); setNotice('') }}>再练一场</button>
          </div>
        </div>
        {report && <ReportCard report={report} onBack={() => { setReport(null); setPhase('setup'); setNotice('') }} />}
      </>
    )
  }

  return (
    <div className="module">
      <div className="card">
        <h2 className="card-title">模拟面试</h2>
        <p className="card-sub">
          逐题限时作答 → 单题点评 → 结束生成总分与维度报告，可导出 Markdown 复盘。
          题目来源：简历押题队列 / 题库随机抽题。
        </p>
        <div className="row">
          <span className={`tag ${aiOn ? 'green' : 'orange'}`}>{aiOn ? 'AI 点评可用' : '离线：手动自评'}</span>
          <span className="tag primary">题库 {BANK.length} 题</span>
          {phase !== 'setup' && <span className="tag purple">{phase === 'running' ? '面试进行中' : '已生成报告'}</span>}
        </div>
      </div>

      {phase === 'setup' && setupView()}
      {phase === 'running' && runningView()}
      {phase === 'report' && reportView()}

      <div className="card">
        <h3 className="card-title">历史面试</h3>
        <p className="card-sub">保存过的模拟面试报告，可回看或导出。</p>
        {(interviews || []).length === 0 && <div className="empty"><div className="empty-icon">🗂</div>还没有完成的模拟面试</div>}
        {(interviews || []).map((it) => {
          const sum = summarize(it.qa || [])
          return (
            <div className="list-item" key={it.id}>
              <div className="row">
                <span className={scoreClass(sum.total)}>{sum.total}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{it.title}</div>
                  <div className="muted">
                    {it.role ? `${it.role} · ` : ''}{(it.qa || []).length} 题 · 用时 {fmtTime(sum.totalSec)} · {new Date(it.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="spacer" />
                <button className="btn btn-sm" onClick={() => { setReport(it); setPhase('report'); setNotice('以下是历史报告。') }}>查看报告</button>
                <button className="btn btn-sm" onClick={() => downloadMd(it)}>导出 MD</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteInterview(it.id)}>删除</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
