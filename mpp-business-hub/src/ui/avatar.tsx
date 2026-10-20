import { useState } from 'react';
import { useAct, useMe } from './hubContext';

/** A small round picture of a person. Their own photo if they chose one, otherwise the first three letters of their name. */
export function Avatar({ uid, size = 32, title }: { uid: string; size?: number; title?: string }) {
  const { hub } = useMe();
  const u = hub.state.users.find((x) => x.id === uid);
  if (!u) return null;
  const letters = u.name.replace(/[^A-Za-z]/g, '').slice(0, 3);
  const label = title ?? u.name;
  const common = { width: size, height: size, borderRadius: '50%', flex: '0 0 auto' } as const;
  return u.photo
    ? <img src={u.photo} alt={label} title={label} style={{ ...common, objectFit: 'cover', border: '1px solid var(--border)' }} />
    : <span role="img" aria-label={label} title={label} className="avatar" style={{ ...common, fontSize: Math.max(10, Math.round(size * 0.36)) }}>{letters}</span>;
}

/** Name with a small avatar in front. */
export function Person({ uid, size = 28, strong }: { uid: string; size?: number; strong?: boolean }) {
  const { hub } = useMe();
  return <span className="person"><Avatar uid={uid} size={size} />{strong ? <strong>{hub.userName(uid)}</strong> : <span>{hub.userName(uid)}</span>}</span>;
}

async function toSmallJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not a picture.')); i.src = url; });
    const side = Math.min(img.width, img.height); const c = document.createElement('canvas'); c.width = 160; c.height = 160;
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 160, 160);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

/** Each person chooses their own picture. A face-only photo works best. */
export function PhotoPicker() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [err, setErr] = useState('');
  return (
    <div className="setrow">
      <div className="row" style={{ gap: 12 }}>
        <Avatar uid={uid} size={56} />
        <div><strong>My photo</strong><p className="small muted" style={{ margin: 0 }}>Shown next to your name for your team. A photo of just your face works best. Until you add one, your picture is the first three letters of your name ({me.name.replace(/[^A-Za-z]/g, '').slice(0, 3)}).</p>{err && <p className="small" style={{ color: 'var(--bad)', margin: 0 }} role="alert">{err}</p>}</div>
      </div>
      <div className="row">
        <label className="btn" style={{ cursor: 'pointer', margin: 0, fontWeight: 500 }}>Choose a photo<input type="file" accept="image/*" aria-label="Choose a photo" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setErr(''); const d = await toSmallJpeg(f); await act(() => hub.setMyPhoto(uid, d), 'Photo saved'); } catch (x) { setErr((x as Error).message); } }} /></label>
        {me.photo && <button className="quiet" onClick={() => act(() => hub.setMyPhoto(uid, null), 'Photo removed')}>Remove</button>}
      </div>
    </div>
  );
}
