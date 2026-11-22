import { VARIABLE_ROLE_LABEL, VariableRole } from '../domain/types';

export interface DiagramNode {
  id: string;
  code: string;
  name: string;
  role: VariableRole;
}
export interface DiagramEdge {
  fromId: string;
  toId: string;
  label: string;
  moderatorIds: string[];
}

const W = 168;
const H = 54;
const FILL: Record<VariableRole, string> = {
  independent: '#e8eef8',
  mediator: '#e3f4ea',
  dependent: '#fdf1d8',
  moderator: '#f1e9f9',
  control: '#f0f2f6',
};

function wrap(name: string): string[] {
  if (name.length <= 11) return [name];
  const mid = Math.ceil(name.length / 2);
  const sp = name.indexOf(' ', mid - 4);
  const cut = sp > 0 && sp < mid + 5 ? sp : mid;
  const a = name.slice(0, cut).trim();
  let b = name.slice(cut).trim();
  if (b.length > 13) b = b.slice(0, 12) + '…';
  return [a, b];
}

/** 사각형 중심에서 (tx,ty) 방향으로 나갈 때 테두리와 만나는 점 */
function edgePoint(cx: number, cy: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(W / 2 / Math.abs(dx || 1e-9), H / 2 / Math.abs(dy || 1e-9));
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * 연구모형 경로도 (SVG). 모든 스타일을 속성으로 넣어 PNG 변환·인쇄에서도 동일하게 보인다.
 * 독립변수(왼쪽) → 매개변수(가운데 위) → 종속변수(오른쪽), 조절변수(가운데 아래), 통제변수(오른쪽 아래)
 */
export function ModelDiagram({ nodes, edges }: { nodes: DiagramNode[]; edges: DiagramEdge[] }) {
  const by = (r: VariableRole) => nodes.filter((n) => n.role === r);
  const iv = by('independent');
  const dv = by('dependent');
  const med = by('mediator');
  const mod = by('moderator');
  const ctl = by('control');
  const gap = 22;
  const colH = (n: number) => (n ? n * H + (n - 1) * gap : 0);
  const medH = colH(med.length);
  const sideH = Math.max(colH(iv.length), colH(dv.length), H);
  const modH = colH(mod.length);
  const top = 20;
  const medTop = top;
  const sideTop = medTop + (med.length ? medH + 46 : 0);
  const modTop = sideTop + sideH + 46;
  const ctlTop = modTop + (mod.length ? 0 : 0);
  const bottomH = Math.max(modH, colH(ctl.length));
  const width = 760;
  const height = (mod.length || ctl.length ? modTop + bottomH : sideTop + sideH) + 24;
  const xL = 40 + W / 2;
  const xC = width / 2;
  const xR = width - 40 - W / 2;
  const pos = new Map<string, { x: number; y: number }>();
  const place = (list: DiagramNode[], x: number, y0: number, total: number) => {
    const start = y0 + (total - colH(list.length)) / 2;
    list.forEach((n, i) => pos.set(n.id, { x, y: start + i * (H + gap) + H / 2 }));
  };
  place(iv, xL, sideTop, sideH);
  place(dv, xR, sideTop, sideH);
  place(med, xC, medTop, medH);
  place(mod, xC, modTop, bottomH);
  place(ctl, xR, ctlTop, bottomH);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="연구모형 경로도" data-testid="model-diagram" fontFamily="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR',sans-serif">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#334155" />
        </marker>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      {edges.map((e, i) => {
        const a = pos.get(e.fromId);
        const b = pos.get(e.toId);
        if (!a || !b) return null;
        const p1 = edgePoint(a.x, a.y, b.x, b.y);
        const p2 = edgePoint(b.x, b.y, a.x, a.y);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const lw = Math.max(30, e.label.length * 8 + 12);
        return (
          <g key={i} data-edge={`${e.fromId}>${e.toId}`}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth="1.6" markerEnd="url(#arrow)" />
            {e.label && (
              <>
                <rect x={mx - lw / 2} y={my - 10} width={lw} height={20} rx="4" fill="#ffffff" stroke="#c5ccd8" />
                <text x={mx} y={my + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#2b5aa6">{e.label}</text>
              </>
            )}
            {e.moderatorIds.map((mid) => {
              const m = pos.get(mid);
              if (!m) return null;
              const pm = edgePoint(m.x, m.y, mx, my);
              return <line key={mid} x1={pm.x} y1={pm.y} x2={mx} y2={my + (m.y > my ? 12 : -12)} stroke="#7c3aed" strokeWidth="1.4" strokeDasharray="5 4" markerEnd="url(#arrow)" />;
            })}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        const lines = wrap(n.name);
        return (
          <g key={n.id} data-node={n.code}>
            <title>{`${n.code} ${n.name} (${VARIABLE_ROLE_LABEL[n.role]})`}</title>
            <rect x={p.x - W / 2} y={p.y - H / 2} width={W} height={H} rx="8" fill={FILL[n.role]} stroke="#64748b" strokeWidth="1.2" strokeDasharray={n.role === 'control' ? '5 4' : undefined} />
            <text x={p.x} y={p.y - H / 2 + 14} textAnchor="middle" fontSize="10.5" fill="#5f6b7c">{`${VARIABLE_ROLE_LABEL[n.role]} · ${n.code}`}</text>
            {lines.map((t, i) => (
              <text key={i} x={p.x} y={p.y + (lines.length === 1 ? 10 : 3 + i * 15)} textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#1c2430">{t}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** SVG 를 PNG 로 변환 (DOCX 삽입용). 실패하면 null → 문서에는 경로 표만 들어간다. */
export async function svgToPng(svgMarkup: string, width: number, height: number): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg'));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
  } catch {
    return null;
  }
}
