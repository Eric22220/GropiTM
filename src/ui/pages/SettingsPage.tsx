import { useState } from 'react';
import type { Thresholds } from '../../core/aggregate';
import { DEFAULT_CONFIG } from '../../core/config';
import { t } from '../../i18n/ro';
import { updateSettings, useApp } from '../../state/store';

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const [cfgText, setCfgText] = useState(() => JSON.stringify(settings.cfg, null, 2));
  const [thText, setThText] = useState(() => (settings.fixedThresholds ? settings.fixedThresholds.join(', ') : ''));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack">
      <p className="small muted">Ștergerea tuturor datelor locale e în Mai mult → Confidențialitate.</p>
      {(
        <div className="card stack">
          <h2 style={{ marginTop: 0 }}>VibrationConfig</h2>
          <p className="small muted">Valorile [EXPERIMENTAL] sunt puncte de plecare. După modificare, turele se reprocesează din „Ture → Reprocesează”. Schimbă și processing_version.</p>
          <textarea rows={16} value={cfgText} onChange={(e) => setCfgText(e.target.value)} spellCheck={false} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <div className="row">
            <button className="btn primary" onClick={() => { try { updateSettings({ cfg: { ...DEFAULT_CONFIG, ...JSON.parse(cfgText) } }); setMsg('Configurația a fost salvată.'); } catch (e) { setMsg('JSON invalid: ' + (e as Error).message); } }}>{t.common.save}</button>
            <button className="btn" onClick={() => { setCfgText(JSON.stringify(DEFAULT_CONFIG, null, 2)); updateSettings({ cfg: DEFAULT_CONFIG }); }}>Implicit</button>
          </div>
          <label>Praguri fixe A|B|C|D|E (4 valori rms_v, goale = automat)
            <input className="input" type="text" value={thText} onChange={(e) => setThText(e.target.value)} placeholder="ex. 1.0, 1.6, 2.4, 3.6" />
          </label>
          <button className="btn" onClick={() => {
            const v = thText.split(/[,;\s]+/).filter(Boolean).map(Number);
            if (!thText.trim()) { updateSettings({ fixedThresholds: null }); setMsg('Praguri automate.'); return; }
            if (v.length !== 4 || v.some((x) => !Number.isFinite(x)) || v.some((x, i) => i && x <= v[i - 1])) { setMsg('Sunt necesare 4 valori crescătoare.'); return; }
            updateSettings({ fixedThresholds: v as Thresholds });
            setMsg('Pragurile au fost fixate.');
          }}>Aplică pragurile</button>
        </div>
      )}
      {msg && <p className="banner info" role="status">{msg}</p>}
      <p className="small muted">Versiunea aplicației: {__APP_VERSION__} · build {__BUILD_TIME__}</p>
    </div>
  );
}
