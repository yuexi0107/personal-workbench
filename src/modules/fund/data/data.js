// ============================================================
// 资金库规划器 · 数据契约（唯一真实来源，勿随意改字段名）
// ============================================================
//
// 概念分层（参照鲨鱼记账"资产管家"）：
//   模块 MODULES  = 账户容器（现金、信用卡、公积金、理财通…）
//   款项 ITEMS    = 模块内的使用款项条目（含金额、方向）
//   三笔钱 CATEGORIES = 模块的分组标签：生活消费/投资增值/保险金/固定资产/借出应收
//                      （借出应收 = 借给别人的钱、待收回的款项，第5分类）
//   周度快照 SNAPSHOTS = 每周手动拍一次全量余额快照，用于结构对比
//   投资持仓 INVESTMENTS = 理财通等投资款项的收益展示（独立数据区，预留扩展）
//
// 记账口径：金额一律填正数，方向由 item.direction 区分。
//   direction = 'asset'     → 该款项是资产（余额、市值、存入）
//   direction = 'liability' → 该款项是负债（欠款余额，正数表示欠多少）
// 净资产 = Σ资产 - Σ负债

// 三笔钱 + 固定资产 + 借出应收分组（模块的 category 取其中一个 key）
export const CATEGORIES = [
  { key: 'life',     name: '生活消费', color: '#3aa675', desc: '日常开销、现金、活期、花呗备用金等' },
  { key: 'invest',   name: '投资增值', color: '#e8a33d', desc: '理财通、基金、股票等增值账户' },
  { key: 'insurance',name: '保险金',   color: '#8f6fd8', desc: '保单现金价值、专用保障金' },
  { key: 'fixed',    name: '固定资产', color: '#4a90d9', desc: '公积金、社保、房产车辆等' },
  { key: 'lend',     name: '借出应收', color: '#17a2b4', desc: '借给别人的钱、待收回的款项' }, // 第5分类：借出去还没收回的钱
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// 内置默认模块（首次启动时写入 localStorage，用户可自行增删改）
export const DEFAULT_MODULES = [
  { id: 'm_cash',   name: '现金/银行卡', category: 'life',      note: '日常可动用资金', archived: false, createdAt: 'seed' },
  { id: 'm_hsb',    name: '花呗/信用卡', category: 'life',      note: '消费负债',       archived: false, createdAt: 'seed' },
  { id: 'm_lct',    name: '腾讯理财通',   category: 'invest',    note: '投资增值主账户', archived: false, createdAt: 'seed' },
  { id: 'm_ins',    name: '保障保险金',   category: 'insurance', note: '保单/专用金',    archived: false, createdAt: 'seed' },
  { id: 'm_gjj',    name: '住房公积金',   category: 'fixed',     note: '固定资产',       archived: false, createdAt: 'seed' },
  { id: 'm_sb',     name: '社保账户',     category: 'fixed',     note: '固定资产',       archived: false, createdAt: 'seed' },
];

// 示例款项（首启演示用，用户可删除；负债示例为账单待还）
export const DEFAULT_ITEMS = [
  { id: 'i_seed1', moduleId: 'm_cash', name: '工资结余', amount: 0,     direction: 'asset',     note: '示例，可编辑或删除', createdAt: 'seed', updatedAt: 'seed' },
  { id: 'i_seed2', moduleId: 'm_hsb',  name: '账单待还', amount: 0,     direction: 'liability', note: '示例，可编辑或删除', createdAt: 'seed', updatedAt: 'seed' },
];

// ---- 记录形状（JSDoc 供各模块组件参照）----
/**
 * @typedef Module
 * @property {string} id          'm_' + Date.now()
 * @property {string} name        模块名
 * @property {string} category    CATEGORIES 里的 key: life|invest|insurance|fixed|lend
 * @property {string} note        备注（可空）
 * @property {boolean} archived   归档隐藏
 * @property {string} createdAt   ISO 时间
 */
/**
 * @typedef Item 使用款项
 * @property {string} id          'i_' + Date.now()
 * @property {string} moduleId    所属模块
 * @property {string} name        款项名
 * @property {number} amount      金额（元，正数）
 * @property {'asset'|'liability'} direction
 * @property {string} note
 * @property {string} createdAt @property {string} updatedAt
 */
/**
 * @typedef Snapshot 周度快照
 * @property {string} id          's_' + Date.now()
 * @property {string} weekLabel   如 '2026-W40'（由 store.currentWeekLabel() 生成）
 * @property {string} takenAt     ISO 时间
 * @property {Object<string,number>} moduleBalances  { [moduleId]: balance }
 * @property {Object<string,number>} categoryTotals  { [categoryKey]: 资产合计(正数) }
 * @property {Object<string,number>} categoryDebts   { [categoryKey]: 负债合计(正数) }
 * @property {number} totalAsset @property {number} totalLiability @property {number} netWorth
 */
/**
 * @typedef Investment 投资款项（理财通收益面板）
 * @property {string} id          'v_' + Date.now()
 * @property {string} name        如 '理财通-活期+'
 * @property {string} source      'licaitong' | 'manual'（预留 'csv' | 'ocr' | 'api'）
 * @property {number} principal   本金
 * @property {number|null} currentValue 当前市值；null 表示按 rate 估算
 * @property {number} rate        预期年化（小数，0.0235 = 2.35%），用于估算日收益
 * @property {string} updatedAt   ISO 时间
 * @property {string} note
 * 派生：return = currentValue!=null ? currentValue-principal : principal*rate*(daysHold/365)
 *       daily = principal*rate/365
 */
