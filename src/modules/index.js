// ============================================================
// 扩展模块注册表：新增模块 = 新建 modules/<name>/（含 manifest.js）+ 在此追加一行。
// 清单声明的菜单节点 / 路由 / 旧链接兼容会被 app/menu.js 与 app/router.js
// 自动聚合，外壳无需任何其他改动（权限码约定 <module>.<page>.view）。
// ============================================================
import interview from './interview/manifest.js'
import fund from './fund/manifest.js'

export const MODULE_MANIFESTS = [interview, fund]
