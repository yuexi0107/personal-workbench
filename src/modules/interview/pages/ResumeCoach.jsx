import React, { useMemo, useState } from 'react'
import { useLocalState, KEYS } from '../store.js'
import { aiAvailable, chatJson } from '../ai.js'
import { QUESTIONS } from '../data/questions.js'

// 生成唯一 id
const genId = () => Date.now() + '-' + Math.random().toString(36).slice(2, 7)

const FOCUS_LIST = ['必问', '高频', '加分']
const focusClass = (f) => (f === '必问' ? 'tag red' : f === '高频' ? 'tag orange' : 'tag green')

/* ============ 离线押题：技术关键词词表（约 60 项，含中英文别名） ============ */
const TECH_LEXICON = [
  ['React', ['react', 'reactjs', 'react.js', 'hooks', 'redux', 'mobx']],
  ['Vue', ['vue', 'vue.js', 'vuejs', 'vuex', 'pinia', 'nuxt']],
  ['Angular', ['angular', 'angularjs']],
  ['Svelte', ['svelte']],
  ['Next.js', ['next.js', 'nextjs', 'ssr', '服务端渲染']],
  ['TypeScript', ['typescript', 'ts']],
  ['JavaScript', ['javascript', 'js', 'es6', 'ecmascript']],
  ['Node.js', ['node.js', 'nodejs', 'node', 'express', 'koa', 'nestjs']],
  ['Python', ['python', 'python3', 'django', 'flask', 'fastapi']],
  ['Java', ['java', 'jvm', 'spring', 'springboot', 'mybatis', 'dubbo', 'jdk']],
  ['Go', ['golang', 'go', 'gin', 'grpc']],
  ['Rust', ['rust', 'cargo']],
  ['C++', ['c++', 'cpp']],
  ['C#/.NET', ['c#', '.net', 'dotnet', 'wpf']],
  ['PHP', ['php', 'laravel']],
  ['MySQL', ['mysql', 'innodb', 'maria']],
  ['PostgreSQL', ['postgresql', 'postgres']],
  ['MongoDB', ['mongodb', 'mongo']],
  ['Redis', ['redis', '缓存穿透', '缓存雪崩']],
  ['Elasticsearch', ['elasticsearch', 'es', 'elastic', 'kibana', 'logstash']],
  ['ClickHouse', ['clickhouse', 'olap', 'doris']],
  ['Kafka', ['kafka']],
  ['RabbitMQ', ['rabbitmq']],
  ['RocketMQ', ['rocketmq']],
  ['Flink', ['flink', '实时计算', '流计算']],
  ['Spark', ['spark', 'sparksql']],
  ['Hadoop 生态', ['hadoop', 'hdfs', 'hive', 'hbase', 'mapreduce', 'yarn']],
  ['Docker', ['docker', '容器化', '镜像', 'container']],
  ['Kubernetes', ['kubernetes', 'k8s', 'helm', 'istio', '容器编排']],
  ['Nginx', ['nginx', '网关', '负载均衡']],
  ['Linux', ['linux', 'centos', 'ubuntu', 'shell', 'bash']],
  ['CI/CD', ['ci/cd', 'cicd', 'jenkins', 'github actions', 'gitlab ci', '持续集成', '持续部署']],
  ['Git', ['git', 'gitflow', '版本控制']],
  ['云服务', ['aws', 'azure', 'gcp', '阿里云', '腾讯云', '华为云', 'serverless', 'lambda']],
  ['GraphQL', ['graphql']],
  ['RESTful API', ['restful', 'rest api', 'openapi', 'swagger', '接口设计']],
  ['WebSocket', ['websocket', '长连接', 'socket.io', 'sse']],
  ['微服务', ['microservice', '微服务', '服务治理', '注册中心', '链路追踪']],
  ['分布式', ['distributed', '分布式', '一致性', 'raft', 'paxos', '分布式事务', 'cap']],
  ['高并发', ['高并发', '并发', '压测', '吞吐量', 'qps', 'tps', '限流', '熔断', '降级']],
  ['消息队列', ['消息队列', 'mq', 'event driven', '异步解耦']],
  ['系统设计', ['系统设计', 'system design', '架构设计', '高可用', '可扩展']],
  ['数据结构算法', ['数据结构', '算法', 'leetcode', '力扣', '复杂度']],
  ['Android', ['android', '安卓', 'kotlin', 'jetpack']],
  ['iOS', ['ios', 'swift', 'objective-c']],
  ['Flutter', ['flutter', 'dart']],
  ['React Native', ['react native', 'rn']],
  ['小程序', ['小程序', 'wechat mini', 'uniapp']],
  ['Electron', ['electron', '桌面端']],
  ['Web 性能优化', ['性能优化', '首屏', 'lighthouse', '懒加载', '预加载']],
  ['前端工程化', ['webpack', 'vite', 'rollup', 'babel', 'monorepo', '工程化']],
  ['单元测试', ['单元测试', 'jest', 'vitest', 'mocha', 'pytest', 'junit', '测试覆盖率']],
  ['自动化测试', ['selenium', 'cypress', 'playwright', 'appium', '接口测试', '自动化测试']],
  ['LLM', ['llm', 'large language model', '大模型', '大语言模型', 'gpt', 'claude', 'qwen', 'llama']],
  ['RAG', ['rag', '检索增强', '知识库问答', 'embedding', '向量检索', '向量数据库', 'milvus', 'faiss', 'chroma']],
  ['Agent', ['agent', '智能体', '多智能体', 'multi-agent', 'mcp', 'function call', '工具调用']],
  ['Prompt 工程', ['prompt', '提示词', 'few-shot', 'chain of thought', 'cot']],
  ['模型微调', ['finetune', 'fine-tune', '微调', 'lora', 'sft', 'rlhf', 'dpo', '训练数据', '数据清洗', 'webfiner', 'fineweb']],
  ['PyTorch', ['pytorch', 'tensorflow', 'keras', 'cuda', 'onnx', '深度学习框架']],
  ['爬虫', ['爬虫', 'scrapy', 'selenium 采集', '反爬']],
  ['数据分析', ['数据分析', 'pandas', 'numpy', 'sql 查询', 'excel', 'jupyter']],
  ['数据库优化', ['索引', '慢查询', 'sql 优化', '分库分表', '读写分离', '事务', '隔离级别']],
  ['安全', ['网络安全', '鉴权', 'oauth', 'jwt', 'xss', 'csrf', '加密', '越权']],
  ['行为面试', ['团队协作', '沟通', '冲突', '抗压', '职业规划', '带团队', '项目管理', '跨部门']]
]

// 统计别名出现次数：ASCII 别名加词边界（避免 es 命中 services 这类误匹配），中文别名直接子串匹配
function countHits(lowerText, alias) {
  const isAscii = /^[\x00-\x7f]+$/.test(alias)
  if (!isAscii) {
    let n = 0
    let i = 0
    while ((i = lowerText.indexOf(alias, i)) !== -1) {
      n += 1
      i += alias.length
    }
    return n
  }
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const head = /^[\w$]/.test(escaped) ? '\\b' : ''
  const tail = /[\w$]$/.test(escaped) ? '\\b' : ''
  let re
  try {
    re = new RegExp(head + escaped + tail, 'gi')
  } catch {
    return 0
  }
  return (lowerText.match(re) || []).length
}

// 从一段文本提取命中的技术词：Map<标准词, 出现次数>
function extractTerms(text) {
  const lower = (text || '').toLowerCase()
  const found = new Map()
  TECH_LEXICON.forEach(([canon, aliases]) => {
    let total = 0
    aliases.forEach((a) => { total += countHits(lower, a.toLowerCase()) })
    if (total > 0) found.set(canon, total)
  })
  return found
}

const BANK = Array.isArray(QUESTIONS) ? QUESTIONS : []

// 某道题库题命中的标准词
function questionTerms(q) {
  const hay = ((q.question || '') + ' ' + (q.answer || '') + ' ' + (q.category || '') + ' ' +
    (Array.isArray(q.tags) ? q.tags.join(' ') : '')).toLowerCase()
  const hits = []
  TECH_LEXICON.forEach(([canon, aliases]) => {
    if (aliases.some((a) => countHits(hay, a.toLowerCase()) > 0)) hits.push(canon)
  })
  return hits
}

// 兜底通用题：简历/JD 文本信息量太少（离线关键词命中不足 8 题）时补齐
const GENERIC_FALLBACK = [
  {
    question: '介绍一下你自己，以及为什么投这个岗位。',
    why: '开场必考，用于锚定后续追问方向，也是你主动引导话题的唯一机会。',
    focus: '必问',
    answer: '1) 一句话定位（年限+主技术栈+业务领域）；2) 1-2 个最能代表能力的成果，带量化数字；3) 与该岗位的匹配点（对着 JD 的关键词说）；4) 收尾讲动机与期望。控制在 90 秒。',
    tips: '不要背简历流水账，不要从大学讲起。'
  },
  {
    question: '你最近主动学习的一项新技术是什么？是怎么学的，学到什么程度？',
    why: '离线押题未命中足够关键词时，此题用于评估学习能力与技术热情。',
    focus: '高频',
    answer: '说明学习动机 → 信息源（官方文档/源码/论文） → 动手验证的小 demo → 遇到的一个具体坑 → 目前能做什么、还不能做什么。',
    tips: '给出可验证的证据（仓库链接、demo 截图）比形容词有力。'
  },
  {
    question: '你的技术栈里最不熟悉但工作中必须用的是哪个？你如何保证不出事故？',
    why: '考察自我认知与风险控制意识，常用于判断简历真实性。',
    focus: '高频',
    answer: '诚实点出薄弱项 → 说明依赖的护栏（评审、测试、灰度、监控告警、找人 backup） → 举一次因此避免问题的实例。',
    tips: '回避"我全都熟"这类回答，面试官一追就崩。'
  },
  {
    question: '如果入职后第一个月要独立负责一个你不熟悉的模块，你会怎么开始？',
    why: '情境题，评估上手方法与主动性，岗位适配度未知时用通用工作场景兜底。',
    focus: '加分',
    answer: '第一周读代码与文档、跑通本地环境、梳理调用链 → 找 1-2 个小 bug 或文档改动做首次提交 → 主动约上下游对齐边界 → 输出自己的理解文档反向确认 → 建立风险清单。',
    tips: '强调"输出物"与"主动确认"，而不是只说"我会努力学习"。'
  },
  {
    question: '面试最后你有什么想问我的？',
    why: '反问环节几乎必考，用来判断你对岗位的真实思考与成熟度。',
    focus: '高频',
    answer: '问 2-3 个有信息量的问题：团队当前的核心目标与最大瓶颈 → 这个岗位前 3 个月的成功标准 → 技术决策与评审机制 → 成长路径与考核方式。每个问题都能延伸出对话。',
    tips: '别说"没有了"；也别在技术面问薪资，那属于 HR 环节。'
  },
  {
    question: '未来 2-3 年的职业规划是什么？为什么选择这个方向？',
    why: 'HR 与终面常规题，用于判断稳定性与岗位投入意愿。',
    focus: '高频',
    answer: '给出主线（深耕某方向或向某角色演进） → 拆解为可验证的阶段目标 → 说明该岗位如何在这条主线上提供支点 → 表明在当前公司长期投入的意愿。',
    tips: '避免"我想创业/我想转管理"这类让对方担心流失率的表述。'
  }
]

// 离线押题主逻辑
function offlinePredict(resume, job) {
  const rTerms = extractTerms(resume.text)
  const jTerms = extractTerms(job.text)
  const items = []

  // 1) 题库命中：按命中词数排序
  const scored = BANK.map((q) => {
    const terms = questionTerms(q)
    const inResume = terms.filter((t) => rTerms.has(t))
    const inJob = terms.filter((t) => jTerms.has(t))
    return { q, terms, inResume, inJob, score: inResume.length * 2 + inJob.length * 3 }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)

  scored.slice(0, 7).forEach(({ q, inResume, inJob }) => {
    const both = inResume.filter((t) => inJob.includes(t))
    const focus = both.length ? '必问' : inJob.length ? '高频' : '加分'
    const src = []
    if (both.length) src.push(`简历与 JD 共同出现：${both.join('、')}`)
    if (inJob.length) src.push(`JD 命中：${inJob.join('、')}`)
    if (inResume.length) src.push(`简历命中：${inResume.join('、')}`)
    items.push({
      question: q.question,
      why: `题库「${q.category || '未分类'}」按关键词命中（${q.difficulty || 'medium'}）。命中来源：${src.join('；')}。`,
      focus,
      answer: q.answer || '（题库未提供参考答案，建议结合项目实例自行组织）',
      tips: '离线模式：本题由关键词匹配得出，建议再对照简历中的具体项目数据补充细节。'
    })
  })

  // 2) JD 缺口：JD 要求但简历未提及
  const gaps = [...jTerms.keys()].filter((t) => !rTerms.has(t)).slice(0, 4)
  gaps.forEach((t) => {
    items.push({
      question: `JD 要求掌握「${t}」，但简历中未提及，请准备一段「${t}」的入门话术：你了解它解决什么问题、和哪些技术配合、目前学到什么程度。`,
      why: `JD 中出现「${t}」${jTerms.get(t)} 次，简历中未出现，属于能力缺口，面试官很可能追问。`,
      focus: '高频',
      answer: `1) 一句话说明 ${t} 的定位与解决的问题；2) 说出 1-2 个典型使用场景与配套技术；3) 诚实说明当前掌握程度（看过文档 / 做过 demo / 用于生产），并给出学习计划与时间节点；4) 主动关联简历里相近的技术栈，证明可迁移性。`,
      tips: '切忌不懂装懂；用"已上手 + 待深入"的表达比硬撑更安全。'
    })
  })

  // 3) 项目深挖（优先取题库"项目"类，缺省用模板）
  const projQ = BANK.filter((q) => /项目|难点|挑战/.test((q.category || '') + (q.question || ''))).slice(0, 2)
  if (projQ.length) {
    projQ.forEach((q) => {
      items.push({
        question: q.question,
        why: '项目深挖是简历面试的固定环节，任何简历都必考。',
        focus: '必问',
        answer: q.answer || '',
        tips: '用 STAR 结构 + 可量化收益回答。'
      })
    })
  } else {
    items.push({
      question: '请挑一个简历中最有代表性的项目，讲清背景、你的职责、技术选型理由，以及最有挑战的一个问题是如何解决的。',
      why: '面试官一定会深挖简历项目，用于验证真实贡献度与技术深度。',
      focus: '必问',
      answer: '按 STAR（情境-任务-行动-结果）展开：背景与规模 → 你负责的模块 → 选型对比与被否决方案 → 一个具体难点的定位过程（现象/排查/根因/修复） → 量化收益（耗时下降、成本、覆盖率等）。',
      tips: '准备 2-3 个可下钻 3 层的细节点，避免只停留在架构图层面。'
    })
    items.push({
      question: '这个项目里你做过哪些性能/稳定性优化？如何发现瓶颈、用什么指标验证效果？',
      why: '简历项目描述通常提到优化成果，面试官会追问测量手段与过程。',
      focus: '必问',
      answer: '说清基线数据 → 瓶颈定位工具（监控/火焰图/慢日志/profiling） → 优化方案与取舍 → 优化后指标对比 → 灰度与回滚策略。',
      tips: '没有真实数据就别编，改为讲"如何设计埋点去获得数据"。'
    })
  }

  // 4) 行为题
  const behQ = BANK.filter((q) => /行为|HR|综合|沟通|协作/.test(q.category || '')).slice(0, 1)
  if (behQ.length) {
    items.push({
      question: behQ[0].question,
      why: '行为面用于评估协作与稳定性，几乎所有公司都会问。',
      focus: '高频',
      answer: behQ[0].answer || '',
      tips: '准备真实案例，结论落在成长与反思。'
    })
  } else {
    items.push({
      question: '说一次你与他人意见不一致或项目出现重大分歧的经历，你是如何沟通并推动落地的？',
      why: '行为面试题，考察沟通、协作与复盘能力，跨团队岗位必问。',
      focus: '高频',
      answer: '用 STAR 讲一个真实冲突：先陈述共同目标 → 你如何补齐信息差（数据/调研/原型） → 达成的折中方案 → 结果与事后复盘得到的原则。',
      tips: '避免把对方描述成"错误的一方"，落点在方法论。'
    })
  }

  // 去重 → 按 focus 优先级稳定排序（必问 > 高频 > 加分）→ 不足 8 题用兜底补齐 → 上限 12 题
  const seen = new Set()
  const uniq = []
  items.forEach((it) => {
    const k = (it.question || '').trim()
    if (!k || seen.has(k)) return
    seen.add(k)
    uniq.push(it)
  })
  const rank = { 必问: 0, 高频: 1, 加分: 2 }
  const byFocus = (a, b) => (rank[a.focus] === undefined ? 1 : rank[a.focus]) - (rank[b.focus] === undefined ? 1 : rank[b.focus])
  uniq.sort(byFocus)
  if (uniq.length < 8) {
    GENERIC_FALLBACK.forEach((g) => {
      if (uniq.length >= 8) return
      if (seen.has(g.question.trim())) return
      seen.add(g.question.trim())
      uniq.push({ ...g })
    })
    uniq.sort(byFocus) // 兜底题补齐后重新按优先级排序
  }
  return uniq.slice(0, 12)
}

/* ============ AI 押题 ============ */
async function aiPredict(resume, job) {
  const messages = [
    {
      role: 'system',
      content: '你是一名有 10 年以上经验的资深技术面试官，长期负责一线互联网公司的技术面试与简历评估。'
        + '你擅长从简历与岗位描述（JD）的差异中定位面试官最可能追问的点：项目真实性深挖、JD 技能点与简历的能力缺口、以及行为面试题。'
        + '你的输出始终专业、具体、可执行，不复述简历原文。'
    },
    {
      role: 'user',
      content: `请基于以下【候选人简历】和【岗位 JD】做一次面试押题。

## 候选人简历
${resume.name}
${resume.text}

## 岗位 JD
${job.name}${job.company ? `（${job.company}）` : ''}
${job.text}

## 押题要求
1. 输出 8-12 道题，按被问概率从高到低排列。
2. 必须同时覆盖三类：
   - 项目深挖：针对简历中的具体项目追问实现细节、技术选型理由、难点与量化收益，用来验证真实性。
   - JD 技能缺口：JD 要求但简历未体现或表述模糊的技术点，考察候选人如何补齐或转译已有经验。
   - 行为/软素质：协作冲突、抗压、职业规划等。
3. 每题字段说明：
   - question：面试官会真实说出的题目原文（中文，具体到候选人项目/技术点，不要泛泛而谈）。
   - why：这题考察什么、为什么会问到他（结合简历/JD 的具体证据，一到两句话）。
   - focus：只能是 "必问" / "高频" / "加分" 三者之一。必问=极大概率被问；高频=常见；加分=答好能拉开差距。
   - answer：参考答案要点，用 1) 2) 3) 分点，给出可落地的作答框架与示例内容。
   - tips：作答注意事项或常见失分点，一句话。
4. 只输出 JSON，不要任何解释文字，结构严格为：
{"questions":[{"question":"...","why":"...","focus":"必问","answer":"...","tips":"..."}]}`
    }
  ]

  const data = await chatJson(messages, { maxTokens: 6000, temperature: 0.5 })
  const raw = Array.isArray(data && data.questions) ? data.questions : Array.isArray(data) ? data : []
  if (!raw.length) throw new Error('模型未返回有效题目（questions 为空）')
  return raw.slice(0, 12).map((q) => ({
    question: String(q.question || '').trim(),
    why: String(q.why || '').trim(),
    focus: FOCUS_LIST.includes(q.focus) ? q.focus : '高频',
    answer: String(q.answer || '').trim(),
    tips: String(q.tips || '').trim()
  })).filter((q) => q.question)
}

/* ============ 子组件：可展开的题目卡 ============ */
function ItemCard({ item, index }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="list-item">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, lineHeight: 1.6 }}>
            {index + 1}. {item.question}
          </div>
          <div style={{ marginTop: 8 }}>
            <span className={focusClass(item.focus)}>{item.focus}</span>
            {item.mode === 'ai' ? <span className="tag purple">AI 押题</span> : <span className="tag primary">离线押题</span>}
          </div>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-2)' }}>为什么考这题：</strong>{item.why || '（无说明）'}
          </div>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>
            {open ? '收起参考答案 ▲' : '展开参考答案与提示 ▼'}
          </button>
          {open && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 10, lineHeight: 1.7, fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>参考答案</div>
              <div>{item.answer || '（暂无参考答案）'}</div>
              {item.tips && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>提示：</span>{item.tips}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============ 子组件：简历 / JD 编辑器 Modal ============ */
function EditorModal({ title, fields, initial, onCancel, onSave }) {
  const [form, setForm] = useState(() => {
    const base = {}
    fields.forEach((f) => { base[f.key] = initial && initial[f.key] !== undefined ? initial[f.key] : '' })
    return base
  })
  const valid = fields.every((f) => !f.required || String(form[f.key] || '').trim())

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <div className="col">
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              {f.multiline ? (
                <textarea
                  className="textarea"
                  style={{ minHeight: f.minHeight || 200 }}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  )
}

export default function ResumeCoach() {
  const [resumes, setResumes] = useLocalState(KEYS.resumes, [])
  const [jobs, setJobs] = useLocalState(KEYS.jobs, [])
  const [predictions, setPredictions] = useLocalState(KEYS.predictions, [])

  const [resumeId, setResumeId] = useState('')
  const [jobId, setJobId] = useState('')
  const [editing, setEditing] = useState(null) // {kind:'resume'|'job', item}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // {mode, items, resumeName, jobName}
  const [notice, setNotice] = useState('')
  const [manualMode, setManualMode] = useState('') // '' = 自动

  const aiOn = aiAvailable()
  const resume = useMemo(() => (resumes || []).find((r) => r.id === resumeId) || null, [resumes, resumeId])
  const job = useMemo(() => (jobs || []).find((j) => j.id === jobId) || null, [jobs, jobId])

  const mode = manualMode || (aiOn ? 'ai' : 'offline')

  function saveEntity(kind, form, existing) {
    const list = kind === 'resume' ? resumes : jobs
    const setList = kind === 'resume' ? setResumes : setJobs
    const item = {
      id: existing ? existing.id : genId(),
      name: String(form.name || '').trim(),
      company: kind === 'job' ? String(form.company || '').trim() : undefined,
      text: String(form.text || '').trim(),
      createdAt: existing ? existing.createdAt : new Date().toISOString()
    }
    const next = existing ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]
    setList(next)
    if (!existing) (kind === 'resume' ? setResumeId : setJobId)(item.id)
    setEditing(null)
  }

  function removeEntity(kind, id) {
    const list = kind === 'resume' ? resumes : jobs
    const setList = kind === 'resume' ? setResumes : setJobs
    setList(list.filter((x) => x.id !== id))
  }

  async function runPredict() {
    if (!resume || !job) { setError('请先选择一份简历和一个 JD'); return }
    setLoading(true)
    setError('')
    setNotice('')
    setResult(null)
    try {
      let items
      let usedMode
      if (mode === 'ai') {
        items = await aiPredict(resume, job)
        usedMode = 'ai'
      } else {
        items = offlinePredict(resume, job)
        usedMode = 'offline'
        if (items.length < 8) {
          setNotice(`离线模式命中题量偏少（${items.length} 题），配置 AI 后可获得更贴近简历的押题。`)
        }
      }
      if (!items.length) throw new Error('未生成任何题目，请检查简历/JD 文本是否为空')
      const payload = {
        id: genId(),
        resumeId: resume.id,
        jobId: job.id,
        mode: usedMode,
        items: items.map((it) => ({ ...it, mode: usedMode })),
        createdAt: new Date().toISOString(),
        resumeName: resume.name,
        jobName: job.name
      }
      setPredictions([payload, ...(predictions || [])].slice(0, 50))
      setResult(payload)
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      setError(
        msg === 'AI_NOT_CONFIGURED'
          ? 'AI 未配置或已关闭，请切换到离线押题，或到「设置」中完成 AI 配置。'
          : `AI 押题失败：${msg}。可切换到「离线押题」重试（不依赖网络）。`
      )
    } finally {
      setLoading(false)
    }
  }

  function startMock(items, label) {
    try {
      sessionStorage.setItem('iw:mock-queue', JSON.stringify(items))
    } catch {
      setError('浏览器阻止了 sessionStorage 写入，无法传递题目')
      return
    }
    if (typeof window.__iwNavigate === 'function') {
      window.__iwNavigate('mock')
      setNotice(`已把 ${items.length} 道题送入模拟面试队列。`)
    } else {
      setNotice(`已保存 ${items.length} 道押题到模拟面试队列（${label || '当前结果'}）。请手动切换到左侧「模拟面试」页签开始。`)
    }
  }

  function deletePrediction(id) {
    setPredictions((predictions || []).filter((p) => p.id !== id))
    if (result && result.id === id) setResult(null)
  }

  return (
    <div className="module">
      <div className="card">
        <h2 className="card-title">简历押题</h2>
        <p className="card-sub">
          维护简历与目标 JD，选定后一键生成针对性面试预测题。已配置 AI 时由大模型出题；
          未配置则走离线的关键词匹配 + 缺口模板，两者都不会中断流程。
        </p>
        <div className="row">
          <span className={`tag ${aiOn ? 'green' : 'orange'}`}>{aiOn ? 'AI 可用' : 'AI 未配置'}</span>
          <span className={focusClass('必问')}>必问</span>
          <span className={focusClass('高频')}>高频</span>
          <span className={focusClass('加分')}>加分</span>
          <div className="spacer" />
          <div className="segmented">
            <button className={mode === 'ai' ? 'active' : ''} disabled={!aiOn} onClick={() => setManualMode('ai')}>AI 押题</button>
            <button className={mode === 'offline' ? 'active' : ''} onClick={() => setManualMode('offline')}>离线押题</button>
          </div>
        </div>
        {!aiOn && (
          <div className="alert info" style={{ marginTop: 12 }}>
            当前为离线模式：题目由技术关键词匹配（题库 + 词表）与 JD 缺口模板生成。
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* 简历管理 */}
        <div className="card">
          <h3 className="card-title">简历管理</h3>
          <p className="card-sub">可保存多份简历版本，面试时选一份作为押题依据。</p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ kind: 'resume', item: null })}>
              + 新增简历
            </button>
            <div className="spacer" />
            <span className="muted">共 {(resumes || []).length} 份</span>
          </div>
          {(resumes || []).length === 0 && <div className="empty"><div className="empty-icon">📄</div>还没有简历，先新增一份</div>}
          {(resumes || []).map((r) => (
            <div className="list-item" key={r.id} style={{ outline: resumeId === r.id ? '2px solid var(--primary)' : 'none' }}>
              <div className="row">
                <button
                  className={`btn btn-sm ${resumeId === r.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setResumeId(resumeId === r.id ? '' : r.id)}
                >
                  {resumeId === r.id ? '已选' : '选择'}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="muted">{(r.text || '').length} 字 · {new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <div className="spacer" />
                <button className="btn btn-sm" onClick={() => setEditing({ kind: 'resume', item: r })}>编辑</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeEntity('resume', r.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>

        {/* JD 管理 */}
        <div className="card">
          <h3 className="card-title">JD 管理</h3>
          <p className="card-sub">粘贴岗位描述原文，技能要求越完整，缺口押题越准。</p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ kind: 'job', item: null })}>
              + 新增 JD
            </button>
            <div className="spacer" />
            <span className="muted">共 {(jobs || []).length} 个</span>
          </div>
          {(jobs || []).length === 0 && <div className="empty"><div className="empty-icon">🎯</div>还没有 JD，先新增一个</div>}
          {(jobs || []).map((j) => (
            <div className="list-item" key={j.id} style={{ outline: jobId === j.id ? '2px solid var(--primary)' : 'none' }}>
              <div className="row">
                <button
                  className={`btn btn-sm ${jobId === j.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setJobId(jobId === j.id ? '' : j.id)}
                >
                  {jobId === j.id ? '已选' : '选择'}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{j.name}</div>
                  <div className="muted">{j.company ? j.company + ' · ' : ''}{(j.text || '').length} 字</div>
                </div>
                <div className="spacer" />
                <button className="btn btn-sm" onClick={() => setEditing({ kind: 'job', item: j })}>编辑</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeEntity('job', j.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 押题操作 */}
      <div className="card">
        <h3 className="card-title">开始押题</h3>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>已选简历</label>
            <select className="select" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
              <option value="">请选择简历</option>
              {(resumes || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>已选 JD</label>
            <select className="select" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">请选择 JD</option>
              {(jobs || []).map((j) => <option key={j.id} value={j.id}>{j.name}{j.company ? ` · ${j.company}` : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={!resume || !job || loading} onClick={runPredict}>
            {loading ? '生成中…' : mode === 'ai' ? '开始押题（AI）' : '开始押题（离线）'}
          </button>
          {result && <button className="btn" onClick={() => startMock(result.items, `${result.resumeName} × ${result.jobName}`)}>用此结果发起模拟面试</button>}
          <span className="muted">{!resume || !job ? '需要同时选择简历与 JD' : ''}</span>
        </div>
        {loading && (
          <div className="loading-line">
            <span className="spinner" />
            {mode === 'ai' ? '正在让大模型分析简历与 JD 差异…' : '正在做关键词匹配与缺口分析…'}
          </div>
        )}
        {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
        {notice && <div className="alert ok" style={{ marginTop: 12 }}>{notice}</div>}
      </div>

      {/* 结果区 */}
      {result && (
        <div className="card">
          <h3 className="card-title">
            押题结果：{result.resumeName} × {result.jobName}
          </h3>
          <p className="card-sub">
            共 {result.items.length} 题 ·{' '}
            <span className={result.mode === 'ai' ? 'tag purple' : 'tag primary'}>
              {result.mode === 'ai' ? '来源：AI 生成' : '来源：离线匹配'}
            </span>
            {' '}· {new Date(result.createdAt).toLocaleString()}
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => startMock(result.items, `${result.resumeName} × ${result.jobName}`)}>
              用此结果发起模拟面试
            </button>
            <span className="muted">点击后到「模拟面试」按这批题目逐题作答</span>
          </div>
          {result.items.map((it, i) => <ItemCard key={i} item={it} index={i} />)}
        </div>
      )}

      {/* 历史 */}
      <div className="card">
        <h3 className="card-title">押题历史</h3>
        <p className="card-sub">每次押题都会留存，可随时回看或直接送入模拟面试。</p>
        {(predictions || []).length === 0 && <div className="empty"><div className="empty-icon">🗂</div>暂无押题记录</div>}
        {(predictions || []).map((p) => (
          <div className="list-item" key={p.id}>
            <div className="row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.resumeName || '简历'} × {p.jobName || 'JD'}</div>
                <div className="muted">{(p.items || []).length} 题 · {new Date(p.createdAt).toLocaleString()}</div>
              </div>
              <span className={p.mode === 'ai' ? 'tag purple' : 'tag primary'}>{p.mode === 'ai' ? 'AI' : '离线'}</span>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={() => { setResult(p); setNotice(''); setError('') }}>回看</button>
              <button className="btn btn-sm" onClick={() => startMock(p.items || [], `${p.resumeName} × ${p.jobName}`)}>发起模拟面试</button>
              <button className="btn btn-sm btn-danger" onClick={() => deletePrediction(p.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditorModal
          title={(editing.item ? '编辑' : '新增') + (editing.kind === 'resume' ? '简历' : ' JD')}
          fields={
            editing.kind === 'resume'
              ? [
                { key: 'name', label: '简历名称', placeholder: '如：后端-3年-2026春招', required: true },
                { key: 'text', label: '简历正文', multiline: true, minHeight: 260, placeholder: '粘贴简历纯文本（项目经历、技能清单越详细越好）', required: true }
              ]
              : [
                { key: 'name', label: '岗位名称', placeholder: '如：前端工程师（国际化）', required: true },
                { key: 'company', label: '公司（可选）', placeholder: '如：某某科技' },
                { key: 'text', label: 'JD 正文', multiline: true, minHeight: 220, placeholder: '粘贴岗位描述：职责、任职要求、加分项', required: true }
              ]
          }
          initial={editing.item || undefined}
          onCancel={() => setEditing(null)}
          onSave={(form) => saveEntity(editing.kind, form, editing.item)}
        />
      )}
    </div>
  )
}
