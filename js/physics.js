// Física do pião: simples, em 2D (no plano do tabuleiro) e determinística (passo fixo), para a prévia,
// a IA e o jogo darem exatamente o mesmo resultado. Sem navegador.
//
// Tabuleiro: 5 colunas x 7 fileiras de casas de 11 cm. x = 0 no meio, z = 0 na beira de perto do
// tabuleiro e cresce para longe. Antes da fileira 0 fica a pista de lançamento (12 cm). Paredes dos
// lados e de perto rebatem; passou da beira de longe, cai na canaleta (não vale).

export const COLS = 5, ROWS = 7, CELL = 0.11;
export const HALF_W = COLS * CELL / 2;
export const LEN = ROWS * CELL;                 // comprimento das casas
export const LAUNCH_Z = -0.06;                  // linha de lançamento (antes da fileira 0)
export const LANE_MIN = -0.12;                  // começo da pista
export const TOP_R = 0.028, PIN_R = 0.012;
export const DT = 1 / 120;
export const V_MAX = 2.2, V_MIN = 0.25;

// Freio: atrito constante (menor com mais giro) mais arrasto; curva para o lado do giro.
export const PHYS = { fric: 0.5, fricSpin: 0.35, drag: 0.55, curve: 0.9, wallE: 0.55, pinE: 0.45, pinKeep: 0.8, stopV: 0.02 };

export const cellAt = (x, z) => {
  if (z < 0 || z >= LEN || x < -HALF_W || x >= HALF_W) return -1;
  return Math.floor(z / CELL) * COLS + Math.floor((x + HALF_W) / CELL);
};
export const cellCenter = (i) => ({ x: (i % COLS + 0.5) * CELL - HALF_W, z: (Math.floor(i / COLS) + 0.5) * CELL });

// Lançamento: { x (na linha), angle (rad, 0 = reto para longe, positivo = para a direita), speed (m/s),
// spin (0 a 1), dir (+1 gira para a direita / -1 para a esquerda) }.
// pins: [{ cell, owner }]. Devolve { path, rest: { x, z, cell, out }, hits: [{ index, t }], walls: [t] }.
export function simulate(launch, pins, { record = true } = {}) {
  const spin = Math.min(1, Math.max(0, launch.spin));
  const speed = Math.min(V_MAX, Math.max(0, launch.speed));
  let x = Math.min(HALF_W - TOP_R, Math.max(-HALF_W + TOP_R, launch.x)), z = LAUNCH_Z;
  let vx = Math.sin(launch.angle) * speed, vz = Math.cos(launch.angle) * speed;
  const fric = PHYS.fric + PHYS.fricSpin * (1 - spin);
  const curve = PHYS.curve * spin * (launch.dir >= 0 ? 1 : -1) * 0.25;
  const pinPos = pins.map(p => cellCenter(p.cell));
  const hit = new Uint8Array(pins.length);
  const hits = [], walls = [];
  const path = record ? [{ t: 0, x, z }] : null;
  let t = 0, out = false;
  for (let step = 0; step < 120 * 8; step++) {
    const v = Math.hypot(vx, vz);
    if (v < PHYS.stopV) break;
    // freio e curva
    const dec = (fric + PHYS.drag * v) * DT;
    const k = Math.max(0, v - dec) / v;
    vx *= k; vz *= k;
    const cx = vz * curve * DT, cz = -vx * curve * DT;   // perpendicular à velocidade
    vx += cx; vz += cz;
    x += vx * DT; z += vz * DT;
    t += DT;
    // paredes: lados e a de perto (atrás da pista)
    if (x < -HALF_W + TOP_R) { x = -HALF_W + TOP_R; vx = -vx * PHYS.wallE; vz *= 0.9; walls.push(t); }
    if (x > HALF_W - TOP_R) { x = HALF_W - TOP_R; vx = -vx * PHYS.wallE; vz *= 0.9; walls.push(t); }
    if (z < LANE_MIN + TOP_R) { z = LANE_MIN + TOP_R; vz = -vz * PHYS.wallE; vx *= 0.9; walls.push(t); }
    if (z > LEN) { out = true; if (record) path.push({ t, x, z }); break; }   // canaleta
    // pinos
    for (let i = 0; i < pins.length; i++) {
      if (hit[i]) continue;
      const dx = x - pinPos[i].x, dz = z - pinPos[i].z;
      const d = Math.hypot(dx, dz);
      if (d >= TOP_R + PIN_R) continue;
      hit[i] = 1;
      hits.push({ index: i, t, x: pinPos[i].x, z: pinPos[i].z, owner: pins[i].owner, cell: pins[i].cell });
      const nx = dx / (d || 1), nz = dz / (d || 1);
      const vn = vx * nx + vz * nz;
      if (vn < 0) { vx -= (1 + PHYS.pinE) * vn * nx; vz -= (1 + PHYS.pinE) * vn * nz; }
      vx *= PHYS.pinKeep; vz *= PHYS.pinKeep;
      x = pinPos[i].x + nx * (TOP_R + PIN_R); z = pinPos[i].z + nz * (TOP_R + PIN_R);
    }
    if (record && step % 3 === 0) path.push({ t, x, z });
  }
  if (record && !out) path.push({ t, x, z });
  const cell = out ? -1 : cellAt(x, z);
  return { path, rest: { x, z, cell, out, t }, hits, walls };
}
