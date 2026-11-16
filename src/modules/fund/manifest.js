// 资金库规划器模块清单：菜单节点 + 路由 + 旧应用链接兼容，一站式登记
// 六个子页共用一个 FundModule 容器（props.tab 区分），均为懒加载分包
import { lazy } from 'react'

const FundModule = lazy(() => import('./FundModule.jsx'))

export default {
  // —— 菜单节点（侧栏「资金库规划器」组）——
  id: 'fund',
  name: '资金库规划器',
  icon: '💰',
  tone: 'orange',
  permission: 'fund.view',
  children: [
    { id: 'dashboard', name: '数据看板', icon: '📊', desc: '资产全景与走势', path: '/workbench/fund/dashboard', permission: 'fund.dashboard.view' },
    { id: 'assets', name: '资产管家', icon: '🏦', desc: '账户模块与款项管理', path: '/workbench/fund/assets', permission: 'fund.assets.view' },
    { id: 'three', name: '三笔钱', icon: '💵', desc: '五分类结构视图', path: '/workbench/fund/three', permission: 'fund.three.view' },
    { id: 'weekly', name: '记录对比', icon: '🕘', desc: '任选两期对比变化', path: '/workbench/fund/weekly', permission: 'fund.weekly.view' },
    { id: 'invest', name: '投资收益', icon: '📈', desc: '持仓与收益概览', path: '/workbench/fund/invest', permission: 'fund.invest.view' },
    { id: 'expense', name: '购物清单', icon: '🛒', desc: '常规购物与大促清单', path: '/workbench/fund/expense', permission: 'fund.expense.view' }
  ],

  // —— 路由（module/crumb 由 app/router.js 统一补齐）——
  routes: [
    { path: '/workbench/fund', redirect: '/workbench/fund/dashboard' },
    { path: '/workbench/fund/dashboard', el: FundModule, props: { tab: 'dashboard' }, title: '数据看板' },
    { path: '/workbench/fund/assets', el: FundModule, props: { tab: 'assets' }, title: '资产管家' },
    { path: '/workbench/fund/three', el: FundModule, props: { tab: 'three' }, title: '三笔钱' },
    { path: '/workbench/fund/weekly', el: FundModule, props: { tab: 'weekly' }, title: '记录对比' },
    { path: '/workbench/fund/invest', el: FundModule, props: { tab: 'invest' }, title: '投资收益' },
    { path: '/workbench/fund/expense', el: FundModule, props: { tab: 'expense' }, title: '日常记账' }
  ],

  // —— 旧应用链接兼容：#/fp/<tab> → /workbench/fund/<tab>（无效页签回看板）——
  legacy: { prefix: '/fp', tabs: ['dashboard', 'assets', 'three', 'weekly', 'invest'], fallback: '/workbench/fund/dashboard' }
}
