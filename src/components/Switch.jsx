// 开关组件：role="switch" 的纯 CSS 拨动开关（设置页与模块显示抽屉共用）
import React from 'react'

export default function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`wb-switch ${checked ? 'on' : ''}`}
      onClick={() => { if (!disabled) onChange(!checked) }}
    >
      <span className="wb-switch-knob" />
    </button>
  )
}
