// 权限层：模块注册表与权限码定义在 menu.js（唯一真实来源），此处提供 hook 与兼容导出
// 当前为本地单用户：节点可见性（存 wb:module-visibility）决定 can() 结果；
// 权限码保留（<module>.<page>.view），未来接入账号体系可直接映射为角色规则。
import { useLocalState, WB } from './store.js'
import { MENU_NODES, NODE_BY_KEY, nodeAllowed, hiddenNodeName as hiddenName } from './menu.js'

// 兼容旧引用：MODULES / moduleByKey
export const MODULES = MENU_NODES
export const moduleByKey = (key) => NODE_BY_KEY[key]

export function usePermissions() {
  const [visibility, setVisibility] = useLocalState(WB.visibility, {})
  const can = (permission) => nodeAllowed(permission, visibility)
  const setModuleVisible = (nodeId, visible) =>
    setVisibility((v) => ({ ...(v || {}), [nodeId]: visible }))
  const resetVisibility = () => setVisibility({})
  return { visibility, can, setModuleVisible, resetVisibility }
}

export { hiddenName as hiddenNodeName }
