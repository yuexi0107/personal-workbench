// 统一错误状态：路由级/卡片级错误边界，避免单个模块崩溃拖垮整个工作台
import React from 'react'
import PageState from './PageState.jsx'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[personal-workbench]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <PageState
          status="error"
          title={this.props.title || '页面出错了'}
          desc={String((this.state.error && this.state.error.message) || this.state.error)}
          action={
            <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>重试</button>
          }
        />
      )
    }
    return this.props.children
  }
}
