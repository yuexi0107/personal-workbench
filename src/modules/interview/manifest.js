// 面试工作台模块清单：菜单节点 + 路由 + 旧应用链接兼容，一站式登记
// 新增页面只需在此追加 child + route，侧栏菜单/权限/路由即自动生效
import { lazy } from 'react'

const Bank = lazy(() => import('./pages/Bank.jsx'))
const ResumeCoach = lazy(() => import('./pages/ResumeCoach.jsx'))
const MockInterview = lazy(() => import('./pages/MockInterview.jsx'))
const Pipeline = lazy(() => import('./pages/Pipeline.jsx'))

export default {
  // —— 菜单节点（侧栏「面试工作台」组；children 顺序为默认顺序，可被用户排序覆盖）——
  id: 'interview',
  name: '面试工作台',
  icon: '📚',
  tone: 'blue',
  permission: 'interview.view',
  children: [
    { id: 'bank', name: '面经题库', icon: '📚', desc: '浏览、搜索、收藏、刷题', path: '/workbench/interview/bank', permission: 'interview.bank.view' },
    { id: 'coach', name: '简历押题', icon: '🎯', desc: '简历 + JD 生成针对性问题', path: '/workbench/interview/coach', permission: 'interview.coach.view' },
    { id: 'mock', name: '模拟面试', icon: '🎤', desc: '逐题作答与复盘报告', path: '/workbench/interview/mock', permission: 'interview.mock.view' },
    { id: 'pipeline', name: '投递追踪', icon: '📈', desc: '面试进度看板', path: '/workbench/interview/pipeline', permission: 'interview.pipeline.view' }
  ],

  // —— 路由（module/crumb 由 app/router.js 统一补齐：crumb = [模块名, 页面名]）——
  routes: [
    { path: '/workbench/interview', redirect: '/workbench/interview/bank' },
    { path: '/workbench/interview/bank', el: Bank, title: '面经题库' },
    { path: '/workbench/interview/coach', el: ResumeCoach, title: '简历押题' },
    { path: '/workbench/interview/mock', el: MockInterview, title: '模拟面试' },
    { path: '/workbench/interview/pipeline', el: Pipeline, title: '投递追踪' },
    // 旧面试应用「设置」页上移为全局设置
    { path: '/workbench/interview/settings', redirect: '/workbench/settings' }
  ],

  // —— 旧应用链接兼容：#/iw/<tab> → /workbench/interview/<tab>（无效页签回题库）——
  legacy: { prefix: '/iw', tabs: ['bank', 'coach', 'mock', 'pipeline'], fallback: '/workbench/interview/bank' }
}
