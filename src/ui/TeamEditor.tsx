import { useRef, useState } from 'react';
import type { LogoShape, TeamDef } from '../engine/types.ts';
import { LOGO_SHAPES, TeamLogo } from './TeamLogo.tsx';

interface Props {
  teams: TeamDef[];
  onChange: (teams: TeamDef[]) => void;
  onReset: () => void;
  onClose: () => void;
}

const MAX_LOGO_PX = 128;

/** Downscale an uploaded image so it stays small enough for localStorage. */
function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_LOGO_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not process the image.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

export function TeamEditor({ teams, onChange, onReset, onClose }: Props) {
  const [id, setId] = useState(teams[0].id);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const team = teams.find((t) => t.id === id) ?? teams[0];

  const update = (patch: (t: TeamDef) => TeamDef) => onChange(teams.map((t) => (t.id === team.id ? patch(t) : t)));

  const setDriver = (i: 0 | 1, patch: Partial<TeamDef['drivers'][0]>) =>
    update((t) => {
      const drivers: TeamDef['drivers'] = [{ ...t.drivers[0] }, { ...t.drivers[1] }];
      drivers[i] = { ...drivers[i], ...patch };
      return { ...t, drivers };
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await readLogo(file);
      update((t) => ({ ...t, logo: { ...t.logo, imageDataUrl: dataUrl } }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  return (
    <div className="page stack">
      <div className="row wrap">
        <h2 className="page-title" style={{ flex: 1 }}>Teams and drivers</h2>
        <button className="btn" onClick={onReset}>Reset all to defaults</button>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
      <div className="muted">Rename teams and drivers, pick colours, and design or upload a logo. Changes save automatically and apply everywhere, including the map and timing tower.</div>

      <div className="editor-grid">
        <div className="panel" style={{ padding: 6 }}>
          {teams.map((t) => (
            <button
              key={t.id}
              className={`btn ${t.id === team.id ? 'active' : ''}`}
              style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}
              onClick={() => setId(t.id)}
            >
              <TeamLogo team={t} size={24} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>

        <div className="stack">
          <div className="panel">
            <h3>Identity</h3>
            <div className="row wrap" style={{ alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center' }}>
                <TeamLogo team={team} size={96} />
              </div>
              <div className="stack" style={{ flex: 1, minWidth: 260, gap: 10 }}>
                <label className="field">
                  Team name
                  <input type="text" maxLength={28} value={team.name} onChange={(e) => update((t) => ({ ...t, name: e.target.value }))} />
                </label>
                <label className="field">
                  Short name (timing screens)
                  <input type="text" maxLength={12} value={team.shortName} onChange={(e) => update((t) => ({ ...t, shortName: e.target.value }))} />
                </label>
                <div className="row wrap">
                  <label className="field">
                    Primary colour
                    <input type="color" value={team.colors.primary} onChange={(e) => update((t) => ({ ...t, colors: { ...t.colors, primary: e.target.value } }))} />
                  </label>
                  <label className="field">
                    Secondary colour
                    <input type="color" value={team.colors.secondary} onChange={(e) => update((t) => ({ ...t, colors: { ...t.colors, secondary: e.target.value } }))} />
                  </label>
                  <label className="field">
                    Emblem shape
                    <select
                      value={team.logo.shape}
                      onChange={(e) => update((t) => ({ ...t, logo: { ...t.logo, shape: e.target.value as LogoShape } }))}
                    >
                      {LOGO_SHAPES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Initials
                    <input
                      type="text"
                      maxLength={3}
                      style={{ width: 70 }}
                      value={team.logo.initials}
                      onChange={(e) => update((t) => ({ ...t, logo: { ...t.logo, initials: e.target.value.toUpperCase() } }))}
                    />
                  </label>
                </div>
                <div className="row wrap">
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
                  <button className="btn small" onClick={() => fileRef.current?.click()}>Upload logo image</button>
                  {team.logo.imageDataUrl && (
                    <button
                      className="btn small"
                      onClick={() =>
                        update((t) => ({ ...t, logo: { ...t.logo, imageDataUrl: undefined } }))
                      }
                    >
                      Use generated emblem
                    </button>
                  )}
                  {error && <span className="bad">{error}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Drivers</h3>
            {([0, 1] as const).map((i) => {
              const d = team.drivers[i];
              return (
                <div className="row wrap" key={d.id} style={{ marginBottom: 8 }}>
                  <label className="field" style={{ flex: 1, minWidth: 180 }}>
                    Name
                    <input type="text" maxLength={28} value={d.name} onChange={(e) => setDriver(i, { name: e.target.value })} />
                  </label>
                  <label className="field">
                    Code
                    <input type="text" maxLength={3} style={{ width: 70 }} value={d.code} onChange={(e) => setDriver(i, { code: e.target.value.toUpperCase() })} />
                  </label>
                  <label className="field">
                    Number
                    <input
                      type="number"
                      min={1}
                      max={99}
                      style={{ width: 70 }}
                      value={d.number}
                      onChange={(e) => setDriver(i, { number: Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1))) })}
                    />
                  </label>
                </div>
              );
            })}
            <div className="muted small">Ratings stay fixed so every team keeps the same competitive balance. Names are cosmetic.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
