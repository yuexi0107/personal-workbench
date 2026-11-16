// 首页 widget 注册表：新增模块卡片只需在这里登记（id 唯一，permission 决定可见性）
import StatsInterview from './StatsInterview.jsx'
import StatsFund from './StatsFund.jsx'
import StatsExpense from './StatsExpense.jsx'
import QuickActions from './QuickActions.jsx'
import Reminders from './Reminders.jsx'
import ModuleEntries from './ModuleEntries.jsx'

export const WIDGETS = [
  { id: 'quick-actions', title: '快捷入口', icon: '⚡', permission: 'workbench.view', el: QuickActions },
  { id: 'reminders', title: '待办提醒', icon: '⏰', permission: 'workbench.view', el: Reminders },
  { id: 'stats-interview', title: '面试速览', icon: '📚', permission: 'interview.view', el: StatsInterview },
  { id: 'stats-fund', title: '资金速览', icon: '💰', permission: 'fund.view', el: StatsFund },
  { id: 'stats-expense', title: '记账速览', icon: '🧾', permission: 'fund.view', el: StatsExpense },
  { id: 'module-entries', title: '模块入口', icon: '🧩', permission: 'workbench.view', el: ModuleEntries }
]

export const DEFAULT_ORDER = WIDGETS.map((w) => w.id)
