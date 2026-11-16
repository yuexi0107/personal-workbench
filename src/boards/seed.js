// 看板默认数据（种子）：通用演示数据（可自由修改），仅在本机无数据时作为初始值，
// 之后一切增删改都持久化到 wb:board:<id>，不会被覆盖。
// 各类型数据结构（唯一真实约定）：
//   todo        { items: [{ id, text, note?, done, createdAt, queue?: 'regular'|'weekend' }]（queue 缺省=常规）,
//                 todos: [{ id, text, note?, due?, done, createdAt }] }
//   anniversary { items: [{ id, name, date }] }                          date='YYYY-MM-DD'
//   checklist   { sections: [{ id, name, groups: [{ id, name, steps: [{ id, name }] }] }],
//                 checkDate: 'YYYY-MM-DD', checks: { [stepId]: true } }  每日自动清零
//   weekly      { rows: [{ id, name }], weeks: [{ id, start, summary?, cells: { [rowId]: [{ text, mark } x7] } }],
//                 current: weekId }            mark: 0无/1绿/2橙；summary=每周小结（随周存取）
//   table       { columns: [{ id, name }], rows: [{ id, cells: { [colId]: { text, mark } } }] }
//   habit       { items: [{ id, name, createdAt }],
//                 marks: { [habitId]: { 'YYYY-MM-DD': true } } }      按习惯×日期存勾选（历史保留）

// 生成一周的 7 格，texts 不足时以空格补齐
const week7 = (texts, marks = []) =>
  Array.from({ length: 7 }, (_, i) => ({ text: texts[i] || '', mark: marks[i] || 0 }))

const W = (text, mark = 0) => ({ text, mark })

// 每周数据（演示内容，请按自己的实际记录修改）
const WEEK_ROWS = [
  { name: '天气', cells: week7(['晴', '晴', '多云', '小雨', '晴', '多云', '晴']) },
  { name: '早餐', cells: week7(['牛奶燕麦', '鸡蛋吐司', '豆浆包子', '牛奶燕麦', '鸡蛋吐司', '粥+小菜', '豆浆包子']) },
  {
    name: '中餐',
    cells: week7(
      ['米饭+时蔬', '番茄鸡蛋面', '米饭+时蔬', '饺子', '米饭+时蔬', '番茄鸡蛋面', '饺子'],
      [0, 2, 0, 2, 0, 2, 2]
    )
  },
  {
    name: '晚餐',
    cells: week7(
      ['粥+小菜', '沙拉', '米饭+时蔬', '粥+小菜', '沙拉', '米饭+时蔬', '粥+小菜'],
      [0, 2, 2, 2, 2, 0, 2]
    )
  },
  {
    name: '水果',
    cells: week7(['苹果', '香蕉', '橙子', '苹果', '香蕉', '橙子', '酸奶'])
  },
  { name: '运动', cells: week7(['散步30min', '休息', '慢跑', '力量训练', '休息', '骑行', '散步30min']) },
  { name: '洗澡', cells: week7(['常规洗护', '常规洗护', '常规洗护', '常规洗护', '常规洗护', '常规洗护', '常规洗护']) },
  {
    name: '睡眠',
    cells: week7(
      ['正常', '正常', '偏晚', '正常', '正常', '早睡', '早睡'],
      [0, 0, 2, 0, 0, 1, 1]
    )
  },
  { name: '空腹体重(斤)', cells: week7(['—', '—', '—', '—', '—', '—', '—']) }
]

// 护肤打卡（白天/晚上 × 护肤/洗澡/发型/饮食 层级，演示流程，请按自己习惯修改）
const SK_GROUP = (name, steps) => ({ name, steps: steps.map((s) => ({ name: s })) })
const SK_SECTION = (name, groups) => ({ name, groups })

const SKINCARE_SECTIONS = [
  SK_SECTION('☀️ 白天', [
    SK_GROUP('护肤', ['洗漱', '洁面', '精华', '眼霜', '保湿', '防晒']),
    SK_GROUP('饮食', ['多喝水'])
  ]),
  SK_SECTION('🌙 晚上', [
    SK_GROUP('护肤', ['洗漱', '洁面', '精华', '眼霜', '保湿']),
    SK_GROUP('洗澡', ['洗发水', '护发素', '沐浴露', '身体乳']),
    SK_GROUP('发型', ['吹干定型']),
    SK_GROUP('饮食', ['清淡饮食'])
  ])
]

// 纪念日（演示条目，可编辑或删除）
const ANNIVERSARY_ITEMS = [
  { name: '新年', date: '2026-01-01' },
  { name: '示例纪念日', date: '2026-06-01' }
]

// 任务队列（演示用例，可删）
const TODO_ITEMS = [
  { text: '复盘上一轮面试的问题清单', done: false },
  { text: '更新简历的项目亮点描述', done: false },
  { text: '刷 10 道高频算法题', done: true },
  { text: '准备项目难点讲稿', done: true }
]

// 习惯打卡（演示用例，可删；只给习惯名，不给历史勾选——热力图随真实使用逐步点亮）
const HABIT_ITEMS = [
  { name: '早睡（23:30 前）' },
  { name: '喝水 8 杯' },
  { name: '运动 20 分钟' }
]

let seedSeq = 0
const uid = () => `sd${Date.now().toString(36)}${(seedSeq++).toString(36)}`

// 本地 today 字符串（seed.js 不能 import store.js —— 会循环依赖，此处自给自足）
const todayStrLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 本周一（ISO：周一为一周起点）。种子首周必须锚定「现在」，写死过去日期会让「新一周」只能从旧日期一周周顺延
const mondayStrLocal = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function defaultBoardData(type) {
  if (type === 'weekly') {
    const rows = WEEK_ROWS.map((r) => ({ ...r, id: uid() }))
    const week = {
      id: uid(),
      start: mondayStrLocal(),
      cells: rows.reduce((acc, r) => { acc[r.id] = r.cells; return acc }, {})
    }
    return {
      rows: rows.map(({ id, name }) => ({ id, name })),
      weeks: [week],
      current: week.id
    }
  }
  if (type === 'checklist') {
    return {
      sections: SKINCARE_SECTIONS.map((sec) => ({
        id: uid(),
        name: sec.name,
        groups: sec.groups.map((g) => ({
          id: uid(),
          name: g.name,
          steps: g.steps.map((s) => ({ id: uid(), name: s.name }))
        }))
      })),
      checkDate: null,
      checks: {}
    }
  }
  if (type === 'anniversary') {
    return { items: ANNIVERSARY_ITEMS.map((it) => ({ ...it, id: uid() })) }
  }
  if (type === 'table') {
    const columns = [{ id: uid(), name: '事项' }, { id: uid(), name: '说明' }]
    return {
      columns,
      rows: [
        { id: uid(), name: '示例条目', cells: { [columns[0].id]: W('点击单元格编辑'), [columns[1].id]: W('列头可横向拖拽排序') } }
      ]
    }
  }
  if (type === 'habit') {
    return {
      items: HABIT_ITEMS.map((it) => ({ ...it, id: uid(), name: it.name, createdAt: todayStrLocal() })),
      marks: {}
    }
  }
  // todo
  return { items: TODO_ITEMS.map((it) => ({ ...it, id: uid() })), todos: [] }
}