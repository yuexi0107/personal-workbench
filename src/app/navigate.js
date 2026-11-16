// 统一导航：hash 路由跳转 + 旧应用全局跳转钩子的兼容垫片
// 旧面试应用的 window.__iwNavigate(key)、旧资金应用的 window.__fpNavigate(key)
// 在模块源码零改动的前提下，被映射到统一路由。
export function navigate(path) {
  const target = path.startsWith('#') ? path.slice(1) : path
  if (window.location.hash.slice(1) !== target) {
    window.location.hash = target
  }
}

export function installNavShims() {
  // 面试模块内部跳转（如 简历押题 → 发起模拟面试）
  window.__iwNavigate = (key) => {
    if (key === 'settings') navigate('/workbench/settings')
    else navigate(`/workbench/interview/${key}`)
  }
  // 资金模块内部跳转（Dashboard/ThreeMoney 的"去管理/去拍快照"等）
  window.__fpNavigate = (key) => navigate(`/workbench/fund/${key}`)
}
