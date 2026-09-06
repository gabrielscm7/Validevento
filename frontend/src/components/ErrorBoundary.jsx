import { Component } from 'react'
import Logo from './Logo'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('ErrorBoundary caught:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="page-body narrow">
            <div className="card card-pad" style={{ marginTop: 60, textAlign: 'center' }}>
              <Logo withText />
              <div style={{ marginTop: 28 }}>
                <p className="empty-title">Algo deu errado</p>
                <p className="empty-sub mt-2">Ocorreu um erro inesperado. Tente recarregar a página.</p>
                <details className="mt-4" style={{ textAlign: 'left' }}>
                  <summary className="btn-text">Detalhes técnicos</summary>
                  <pre className="report-pre mt-2">{this.state.error?.toString()}</pre>
                </details>
                <button type="button" className="btn-primary btn mt-4" onClick={() => window.location.reload()}>
                  Recarregar página
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
