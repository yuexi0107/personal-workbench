# 个人工作台 · Personal Workbench

统一入口的本地个人工作台：**控制台（首页）+ 面试工作台 + 资金库规划器 + 生活看板**。
由原 `interview-workbench`（面试）与 `fund-planner`（资金）两个应用合并而成，两模块页面组件与数据格式零改动复用；
2026-11-15 加入生活看板（模块化看板）与日常记账，扩展路线见 `docs/扩展路线图.md`。

## 启动

双击 `启动个人工作台.bat`，或：

```bash
npm install
npm run dev     # http://localhost:5177
npm run build   # 产物在 dist/
```

## 结构

```
src/
  main.jsx                入口：装配主题 + 全量样式 + App
  app/                    外壳层：App(侧栏/面包屑/守卫) · router · menu · permissions ·
                          navigate · theme · store(wb:* 存储层) · export-data ·
                          HomePage(控制台) · SettingsPage(全局设置)
  components/             共享 UI：Breadcrumb / ErrorBoundary / PageState / Switch /
                          ModuleManager(模块显示与排序) / dnd/magpie(全站拖拽基建)
  boards/                 生活看板：registry(类型注册) / seed / store +
                          6 类看板组件（每周数据/护肤/纪念日/任务/习惯/自定义表格）
  modules/                扩展模块（自包含，manifest.js 一站式登记菜单+路由+旧链接兼容）
    index.js              模块注册表：新增模块在此追加一行
    interview/            面试工作台（store/ai/questions + 4 页面）
    fund/                 资金库规划器（store/sync/components + FundModule 容器 + 记账）
  widgets/                首页卡片：registry(注册表) + DragGrid(grid/stack 两布局) +
                          速览/快捷入口/待办提醒/模块入口
  styles/                 wb-shell(外壳与设计 token，全局) · wb-interview(.wb-interview 作用域) ·
                          wb-fund(.wb-fund 作用域) · wb-boards · wb-theme(深浅色)
```

> 分层与扩展方式（新增模块 / 自定义看板 / 首页卡片的完整步骤）详见 [docs/架构说明.md](docs/架构说明.md)。

## 关键约定

- **数据键**：沿用旧前缀 `iw:*`（面试）与 `fp:*`（资金），新增外壳键 `wb:*`
  （`wb:layout:<profile>` 首页布局、`wb:layout:<page>:<profile>` 模块页面布局、
  `wb:module-visibility` 模块可见性、`wb:profile` 使用者标识、`wb:last-export` 上次导出时间）。
  记账流水 `fp:expenses`、月预算 `fp:budget` 归资金前缀；习惯打卡等看板数据走 `wb:board:<id>`。
- **拖拽**：卡片头部左侧 `⠿` 把手拖动排序（交互参考 magpie）；首页存 `wb:layout:<profile>`，
  模块页面经 `useDragLayout(pageLayoutKey('页面名'), ids)` 接入；实现基于 @dnd-kit
  （把手拖动 / 占位 / 平滑让位 / 浮层克隆 / 容器边界 / 最近网格碰撞）。
- **模块显示与排序**：统一收在设置页（ModuleManager 内联卡片）——侧栏菜单树（父级/子级同级拖拽）+
  首页卡片的排序与显隐；新增模块在 `modules/<name>/manifest.js` 登记、`modules/index.js` 注册一行，
  即自动获得菜单/路由/权限/排序/显隐全套能力（见 `docs/架构说明.md`）。
- **旧链接兼容**：`#/interview`、`#/fund`、`#/iw/<页签>`、`#/fp/<页签>`、`#/console` 自动跳转对应新路由；未知路由显示 404 引导页。
- **云同步**：资金模块的端到端加密云同步（Qoder Sites Functions）原样保留；本地开发显示"云端不可用"属预期，本机记账不受影响。

## 从旧版迁移数据

见 `使用说明.md` 的「数据迁移」一节（旧应用导出 JSON → 本工作台「设置 → 导入数据」）。

## 许可证

[MIT](LICENSE) — 数据全部保存在你自己的浏览器本地，可自由使用、修改与分发。
