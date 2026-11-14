import { Component, type ReactNode } from 'react';

/** Dacă un ecran se blochează, utilizatorul vede un mesaj și poate continua; datele locale rămân intacte. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen"><div className="wrap stack">
        <h1>Ceva nu a mers</h1>
        <p className="muted">Ecranul acesta a întâmpinat o eroare. Turele și rapoartele tale sunt în siguranță pe telefon.</p>
        <pre>{this.state.error.message}</pre>
        <div className="grid2">
          <a className="btn" href="#/">Înapoi la hartă</a>
          <button className="btn primary" onClick={() => location.reload()}>Reîncarcă</button>
        </div>
      </div></main>
    );
  }
}
