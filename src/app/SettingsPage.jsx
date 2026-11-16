// 全局设置页：AI 接入（自面试模块上移）+ 数据管理（双模块导入/导出，兼容旧应用导出格式）
// + 模块显示与排序（侧栏菜单树/子模块 + 首页卡片，内联拖拽管理）+ 关于
import React, { useRef, useState } from 'react'
import { useLocalState, readLS, writeLS, WB, layoutKey } from './store.js'
import { KEYS as IW_KEYS } from '../modules/interview/store.js'
import { testConnection } from '../modules/interview/ai.js'
import { KEYS as FP_KEYS } from '../modules/fund/store.js'
import { collectBoardKeys } from '../boards/registry.js'
import { downloadAllData } from './export-data.js'
import { getThemeMode, setThemeMode } from './theme.js'
import ModuleManager from '../components/ModuleManager.jsx'
import { SortableCards, SortableCard, moveByIds, normalizeOrder } from '../components/dnd/magpie.jsx'

const DEFAULT_CFG = { baseUrl: '', model: '', apiKey: '', enabled: false }

// 设置页大模块卡片 id（顺序落盘 WB.settingsOrder，把手拖拽排序）
const SETTINGS_CARDS = ['theme', 'ai', 'presets', 'data', 'modules', 'about']

const PRESETS = [
  { name: 'Kimi (月之暗面)', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0711-preview', modelTip: '可换 kimi-k2-0711-preview / moonshot-v1-8k' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', modelTip: 'deepseek-chat / deepseek-reasoner' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6', modelTip: 'glm-4.6 / glm-4-plus' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', modelTip: 'qwen-plus / qwen-max' },
  { name: '豆包 (火山方舟)', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '', modelTip: '需自填接入点 ID，如 ep-2025xxxx-xxxxx' }
]

// 面试模块数据键（与旧应用导出格式一致）
const IW_DATA_KEYS = [
  { key: IW_KEYS.resumes, label: '简历', init: [] },
  { key: IW_KEYS.jobs, label: '岗位 JD', init: [] },
  { key: IW_KEYS.predictions, label: '押题结果', init: [] },
  { key: IW_KEYS.interviews, label: '模拟面试记录', init: [] },
  { key: IW_KEYS.pipeline, label: '投递追踪', init: [] },
  { key: IW_KEYS.favorites, label: '题库收藏', init: [] },
  { key: IW_KEYS.bankDone, label: '题库刷题进度', init: {} },
  { key: IW_KEYS.practiceStats, label: '刷题统计', init: {} }
]
// 资金模块数据键（账本四件套 + 记账流水；月预算 fp:budget 为数字，单独处理；
// 各页卡片/板块拖拽顺序为字符串数组，随账本一起备份）
const FP_DATA_KEYS = [
  { key: FP_KEYS.modules, label: '账户模块', init: [] },
  { key: FP_KEYS.items, label: '款项条目', init: [] },
  { key: FP_KEYS.snapshots, label: '周度快照', init: [] },
  { key: FP_KEYS.investments, label: '投资持仓', init: [] },
  { key: FP_KEYS.expenses, label: '记账流水', init: [] },
  { key: FP_KEYS.catOrder, label: '板块顺序', init: [] },
  { key: FP_KEYS.threeOrder, label: '三笔钱卡片顺序', init: [] },
  { key: FP_KEYS.weeklyOrder, label: '记录对比卡片顺序', init: [] },
  { key: FP_KEYS.assetsOrder, label: '资产管家卡片顺序', init: [] },
  { key: FP_KEYS.catGroups, label: '板块分组', init: [] },
  { key: FP_KEYS.shopping, label: '购物清单', init: { lists: [], items: [] } }
]

function countOf(v) {
  if (Array.isArray(v)) return v.length
  if (v && typeof v === 'object') return Object.keys(v).length
  return 0
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const dateTag = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export default function SettingsPage() {
  const [cfg, setCfg] = useLocalState(IW_KEYS.aiConfig, DEFAULT_CFG)
  const [form, setForm] = useState({ ...DEFAULT_CFG, ...cfg })
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null) // {ok, message}
  const [msg, setMsg] = useState(null) // {kind, text}
  const [theme, setTheme] = useState(getThemeMode()) // 当前外观偏好：'auto' | 'light' | 'dark'
  const fileRef = useRef(null)
  // 大模块卡片顺序（把手拖拽，落盘 wb:settings-card-order）
  const [cardOrder, setCardOrder] = useLocalState(WB.settingsOrder, SETTINGS_CARDS)
  const cardIds = normalizeOrder(cardOrder, SETTINGS_CARDS)

  const patch = (p) => setForm((f) => ({ ...f, ...p }))
  const persist = (next) => { setCfg(next); setForm(next); return next }

  // 外观：切换全局主题（写入 wb:theme 并立即生效，再同步分段按钮的选中态）
  const changeTheme = (mode) => { setThemeMode(mode); setTheme(getThemeMode()) }

  const onSave = () => {
    persist({
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      apiKey: form.apiKey.trim(),
      enabled: !!form.enabled
    })
    setResult(null)
    setMsg({ kind: 'ok', text: 'AI 配置已保存（本机 localStorage，不上传）。' })
  }

  const onTest = async () => {
    const next = { baseUrl: form.baseUrl.trim(), model: form.model.trim(), apiKey: form.apiKey.trim(), enabled: true }
    if (!next.baseUrl || !next.model || !next.apiKey) {
      setResult({ ok: false, message: '请先填写完整的 Base URL、模型名和 API Key' })
      return
    }
    persist(next)
    setTesting(true)
    setResult(null)
    const r = await testConnection()
    setResult(r)
    setTesting(false)
  }

  // ---------- 生活看板数据（wb:custom-modules + wb:board:*） ----------
  const boardEntries = () => {
    const out = {}
    for (const k of collectBoardKeys()) {
      if (localStorage.getItem(k) !== null) out[k] = readLS(k, null)
    }
    return out
  }
  const applyBoardData = (data) => {
    let n = 0
    Object.entries(data || {}).forEach(([k, v]) => {
      if ((k === WB.customModules || k.startsWith('wb:board:')) && (v && typeof v === 'object')) {
        writeLS(k, v)
        n += 1
      }
    })
    return n
  }

  // ---------- 数据导出 ----------
  const iwPayload = () => ({
    app: 'interview-workbench',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: IW_DATA_KEYS.reduce((acc, d) => { acc[d.key] = readLS(d.key, d.init); return acc }, {})
  })
  const fundPayload = () => {
    const ledger = { schema: 1, exportedAt: new Date().toISOString() }
    FP_DATA_KEYS.forEach((d) => { ledger[d.key.replace('fp:', '')] = readLS(d.key, d.init) })
    ledger.budget = readLS(FP_KEYS.budget, 0)
    return ledger
  }
  // 全量导出走共享层（src/export-data.js）：与首页「备份提醒」的一键导出保持同一文件结构，
  // 并统一写 wb:last-export 时间戳。
  const onExportAll = () => {
    downloadAllData()
    setMsg({ kind: 'ok', text: '已导出全部数据（含 AI 配置与 Key，注意妥善保管）。' })
  }

  // ---------- 数据导入 ----------
  const applyIwData = (data) => {
    let n = 0
    IW_DATA_KEYS.forEach((d) => {
      if (data[d.key] === undefined) return
      const expectedArray = Array.isArray(d.init)
      const v = data[d.key]
      if (expectedArray && !Array.isArray(v)) throw new Error(`${d.label} 数据类型不正确`)
      if (!expectedArray && (typeof v !== 'object' || v === null)) throw new Error(`${d.label} 数据类型不正确`)
      writeLS(d.key, v)
      n += 1
    })
    if (data[IW_KEYS.aiConfig] && typeof data[IW_KEYS.aiConfig] === 'object') {
      const c = { ...DEFAULT_CFG, ...data[IW_KEYS.aiConfig] }
      persist({ baseUrl: c.baseUrl || '', model: c.model || '', apiKey: c.apiKey || '', enabled: !!c.enabled })
    }
    return n
  }
  const applyFundLedger = (ledger) => {
    // 旧版资金备份没有 expenses 等新键 → 回退到 init，保证旧文件可继续导入
    FP_DATA_KEYS.forEach((d) => {
      const k = d.key.replace('fp:', '')
      const v = ledger[k] === undefined ? d.init : ledger[k]
      // 数组键（流水/顺序/分组）与对象键（购物清单 {lists,items}）都是合法的非空对象结构
      if (!v || typeof v !== 'object') throw new Error(`${d.label} 数据类型不正确`)
    })
    FP_DATA_KEYS.forEach((d) => {
      const k = d.key.replace('fp:', '')
      localStorage.setItem(d.key, JSON.stringify(ledger[k] === undefined ? d.init : ledger[k]))
    })
    if (ledger.budget !== undefined) {
      if (typeof ledger.budget !== 'number') throw new Error('月预算 数据类型不正确')
      localStorage.setItem(FP_KEYS.budget, JSON.stringify(ledger.budget))
    }
    localStorage.setItem('fp:seeded', '1') // 有真实数据后不再种示例
    return FP_DATA_KEYS.length
  }

  const onImportFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (parsed && parsed.app === 'personal-workbench' && parsed.data && typeof parsed.data === 'object') {
        const n = applyIwData(parsed.data)
        // 部分备份防护：文件里一个资金键都没有时不碰资金数据（applyFundLedger 会把缺失键重置为空 init，
        // 若直接调用会把用户真实资金/记账数据清空——例如只导出过生活看板的备份）
        const hasFundData = FP_DATA_KEYS.some((d) => parsed.data[d.key] !== undefined)
        const f = hasFundData
          ? applyFundLedger({ ...parsed.data, modules: parsed.data[FP_KEYS.modules] || [], items: parsed.data[FP_KEYS.items] || [], snapshots: parsed.data[FP_KEYS.snapshots] || [], investments: parsed.data[FP_KEYS.investments] || [] })
          : 0
        const b = applyBoardData(parsed.data)
        setMsg({ kind: 'ok', text: `导入成功：面试 ${n} 类、资金 ${f} 类、生活看板 ${b} 类数据已覆盖。建议刷新页面（F5）。` })
      } else if (parsed && parsed.app === 'interview-workbench' && parsed.data && typeof parsed.data === 'object') {
        const n = applyIwData(parsed.data)
        setMsg({ kind: 'ok', text: `导入成功：来自旧版面试工作台，${n} 类数据已覆盖。建议刷新页面（F5）。` })
      } else if (parsed && parsed.schema === 1 && Array.isArray(parsed.modules)) {
        const f = applyFundLedger(parsed)
        setMsg({ kind: 'ok', text: `导入成功：来自资金账本备份，${f} 类数据已覆盖。建议刷新页面（F5）。` })
      } else if (parsed && typeof parsed === 'object' && IW_DATA_KEYS.some((d) => parsed[d.key] !== undefined)) {
        const n = applyIwData(parsed)
        setMsg({ kind: 'ok', text: `导入成功：${n} 类数据已覆盖。建议刷新页面（F5）。` })
      } else {
        throw new Error('无法识别的文件格式（支持：工作台全量 / 旧面试导出 / 资金账本备份）')
      }
    } catch (err) {
      setMsg({ kind: 'error', text: `导入失败：${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onClear = () => {
    if (!window.confirm('确定清空全部本地数据？（面试 + 资金 + 生活看板（含自定义模块） + AI 配置）')) return
    if (!window.confirm('此操作不可撤销，真的要全部清空吗？')) return
    IW_DATA_KEYS.forEach((d) => writeLS(d.key, d.init))
    FP_DATA_KEYS.forEach((d) => writeLS(d.key, d.init))
    writeLS(FP_KEYS.budget, 0) // 月预算是数字键，不在 FP_DATA_KEYS（数组校验）里
    collectBoardKeys().forEach((k) => localStorage.removeItem(k)) // 生活看板：登记表 + 全部看板数据
    localStorage.removeItem(IW_KEYS.aiConfig)
    localStorage.removeItem('fp:seeded')
    localStorage.removeItem(layoutKey())
    persist({ ...DEFAULT_CFG })
    setMsg({ kind: 'warn', text: '已清空全部数据与布局。建议刷新页面。' })
  }

  const counts = [
    ...IW_DATA_KEYS, ...FP_DATA_KEYS,
    { label: '自定义看板', key: WB.customModules, init: [] },
    { label: '看板数据', key: 'wb:board:*', init: collectBoardKeys().filter((k) => k.startsWith('wb:board:')) }
  ].map((d) => ({ label: d.label, value: d.key ? readLS(d.key, d.init) : d.init }))

  // 各卡内容（grip 注入标题；卡片按 cardIds 顺序渲染，拖动后顺序落盘）
  const cardBodies = {
    // 外观：全局浅色/深色主题切换（偏好存 localStorage 键 wb:theme，只保存在本机浏览器）
    theme: (grip) => (
      <>
        <h2 className="card-title">{grip} 🎨 外观</h2>
        <p className="card-sub">
          浅色 / 深色 / 跟随系统，点击立即生效，偏好只保存在本机浏览器。
        </p>
        <div className="segmented">
          <button className={theme === 'auto' ? 'active' : ''} onClick={() => changeTheme('auto')}>跟随系统</button>
          <button className={theme === 'light' ? 'active' : ''} onClick={() => changeTheme('light')}>☀️ 浅色</button>
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => changeTheme('dark')}>🌙 深色</button>
        </div>
      </>
    ),
    // AI 接入（自面试工作台设置上移）
    ai: (grip) => (
      <>
        <h2 className="card-title">{grip} 🤖 AI 接入配置</h2>
        <p className="card-sub">
          兼容任意 OpenAI 格式的服务（/chat/completions），供「简历押题 / 模拟面试」使用。所有配置只写在当前浏览器的 localStorage。
        </p>
        <div className="row" style={{ marginBottom: 14 }}>
          <button className={`btn ${form.enabled ? 'btn-primary' : ''}`} onClick={() => patch({ enabled: !form.enabled })}>
            {form.enabled ? '✅ AI 功能已启用' : '⭕ AI 功能已关闭（离线模式）'}
          </button>
          <span className="muted">关闭后押题/模拟面试仍可用模板题库，但不会生成个性化内容</span>
        </div>
        <div className="col">
          <div className="field">
            <label>Base URL（接口根地址，不含 /chat/completions）</label>
            <input className="input" placeholder="https://api.moonshot.cn/v1" value={form.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
          </div>
          <div className="field">
            <label>模型名 Model</label>
            <input className="input" placeholder="kimi-k2-0711-preview 或 deepseek-chat" value={form.model} onChange={(e) => patch({ model: e.target.value })} />
          </div>
          <div className="field">
            <label>API Key</label>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" style={{ flex: 1 }} type={showKey ? 'text' : 'password'} placeholder="sk-…" value={form.apiKey} onChange={(e) => patch({ apiKey: e.target.value })} />
              <button className="btn btn-sm" title={showKey ? '隐藏' : '显示'} onClick={() => setShowKey(!showKey)}>
                {showKey ? '🙈 隐藏' : '👁 显示'}
              </button>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>Key 仅保存在本机浏览器，导出备份时请注意保密。</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onSave}>💾 保存配置</button>
          <button className="btn" disabled={testing} onClick={onTest}>{testing ? '测试中…' : '🔌 测试连接'}</button>
          <div className="spacer" />
          {form.baseUrl && form.model && (
            <span className="muted">当前调用：{form.baseUrl.replace(/\/+$/, '')}/chat/completions · {form.model}</span>
          )}
        </div>
        {testing && <div className="loading-line"><span className="spinner" />正在请求模型，请稍候…</div>}
        {result && (
          <div className={`alert ${result.ok ? 'ok' : 'error'}`} style={{ marginTop: 12, marginBottom: 0 }}>
            {result.ok ? '✅ ' : '❌ '}{result.message}
          </div>
        )}
      </>
    ),
    // 服务商预设
    presets: (grip) => (
      <>
        <h2 className="card-title">{grip} ⚡ 常用服务商一键填充</h2>
        <p className="card-sub">点一下自动填入 Base URL 和默认模型，你只需再粘贴 API Key 即可。</p>
        <div className="row" style={{ gap: 10 }}>
          {PRESETS.map((p) => (
            <button key={p.name} className="btn" onClick={() => { patch({ baseUrl: p.baseUrl, model: p.model }); setMsg({ kind: 'info', text: `已填入 ${p.name} 的地址，填上 API Key 后点保存。` }) }} title={`${p.baseUrl} · ${p.modelTip}`}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          说明：豆包(火山方舟)需要填写自己在 Ark 创建的推理接入点 ID（形如 ep-20250101-abcdefg）作为模型名。
        </div>
      </>
    ),
    // 数据管理（双模块）
    data: (grip) => (
      <>
        <h2 className="card-title">{grip} 🗂 数据管理</h2>
        <p className="card-sub">
          统计的是当前浏览器 localStorage 中的条目数。兼容导入旧版「面试工作台」与「资金库规划器」的导出文件，实现无缝迁移。
        </p>
        <div className="row" style={{ gap: 18 }}>
          {counts.map((s) => (
            <div key={s.label}>
              <div className="stat-num" style={{ fontSize: '1.3rem' }}>{countOf(s.value)}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        <hr className="divider" />
        <div className="row">
          <button className="btn btn-primary" onClick={onExportAll}>⬇ 导出全部数据</button>
          <button className="btn" onClick={() => downloadJSON(iwPayload(), `interview-workbench-${dateTag()}.json`)}>⬇ 仅导出面试</button>
          <button className="btn" onClick={() => downloadJSON(fundPayload(), `fund-planner-${dateTag()}.json`)}>⬇ 仅导出资金</button>
          <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>⬆ 导入数据</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onImportFile} />
          <div className="spacer" />
          <button className="btn btn-danger" onClick={onClear}>🗑 清空所有数据</button>
        </div>
        {msg && (
          <div className={`alert ${msg.kind}`} style={{ marginTop: 14, marginBottom: 0 }}>
            {msg.kind === 'error' ? '❌ ' : msg.kind === 'warn' ? '⚠ ' : msg.kind === 'info' ? 'ℹ ' : '✅ '}
            {msg.text}
          </div>
        )}
      </>
    ),
    // 模块显示与排序（内联：侧栏菜单树/子模块 + 首页卡片的拖拽排序与显隐）
    modules: (grip) => (
      <>
        <h2 className="card-title">{grip} 🧩 模块显示与排序</h2>
        <ModuleManager />
      </>
    ),
    // 关于
    about: (grip) => (
      <>
        <h2 className="card-title">{grip} 📖 关于个人工作台</h2>
        <div className="md">
          <ul>
            <li><strong>统一入口</strong>：控制台（#/workbench）聚合面试、资金两模块的速览、快捷入口与待办提醒，卡片可拖拽排序。</li>
            <li><strong>旧链接兼容</strong>：#/interview、#/fund、#/iw/&lt;页签&gt;、#/fp/&lt;页签&gt; 等旧路径自动跳转到对应新路由。</li>
            <li><strong>数据迁移</strong>：旧版两个应用的导出 JSON 可直接在上方「导入数据」恢复。</li>
            <li><strong>AI 智能功能</strong>：简历押题、模拟面试点评需配置 OpenAI 兼容服务；未配置时离线模板可用。</li>
          </ul>
        </div>
      </>
    ),
  }

  return (
    <div className="module">
      {/* 大模块卡片：均可拖动左上把手排序，顺序按 cardIds 渲染 */}
      <SortableCards ids={cardIds} onMove={(a, o) => setCardOrder((prev) => moveByIds(prev, a, o))}>
        {cardIds.map((id) => (
          <SortableCard key={id} id={id} gripLabel="拖动排序此卡片">
            {(grip) => cardBodies[id](grip)}
          </SortableCard>
        ))}
      </SortableCards>
    </div>
  )
}
