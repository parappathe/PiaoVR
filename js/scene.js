// Cenário: deque de madeira de um quiosque de praia numa tarde de sol, mar, areia, coqueiros,
// guarda-sol e barquinho ao longe. Na frente, a mesa de pião: pista de lançamento, 35 casas com valores,
// paredes que rebatem e a canaleta no fundo.
import * as THREE from '../vendor/three/three.module.js';
import { COLS, ROWS, CELL, HALF_W, LEN, LANE_MIN, LAUNCH_Z, TOP_R, PIN_R, cellCenter } from './physics.js';
import { VALUES } from './rules.js';
import { makeAvatar } from './avatar.js';

export const TABLE = { top: 0.84 };
export const BOARD = { h: 0.87, z0: -0.22 };     // altura do tampo e z do mundo onde começam as casas
export const TEAM_COLOR = [0xe03a3a, 0x2a6ad8];  // vermelho (você) e azul (adversário)
// local do tabuleiro (x, z para longe) → mundo
export const toWorld = (x, z, out = new THREE.Vector3(), y = BOARD.h) => out.set(x, y, BOARD.z0 - z);
export const toLocal = (p) => ({ x: p.x, z: BOARD.z0 - p.z });

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function woodCanvas(w, h, base, dark, seed = 1, planks = 0, vertical = false) {
  const c = canvas(w, h), g = c.getContext('2d'), r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${dark},${0.04 + r() * 0.1})`; g.lineWidth = 1 + r() * 3;
    const y = r() * (vertical ? w : h); g.beginPath();
    for (let x = 0; x <= (vertical ? h : w); x += 32) { const yy = y + Math.sin(x * 0.01 + i) * 5; if (vertical) g.lineTo(yy, x); else g.lineTo(x, yy); }
    g.stroke();
  }
  if (planks) { g.strokeStyle = `rgba(${dark},0.5)`; g.lineWidth = 4; for (let k = 0; k <= planks; k++) { const p = k * (vertical ? w : h) / planks; g.beginPath(); if (vertical) { g.moveTo(p, 0); g.lineTo(p, h); } else { g.moveTo(0, p); g.lineTo(w, p); } g.stroke(); } }
  return c;
}
// Tampo: casas pintadas com o valor, pista de lançamento clara, canaleta escura
function boardCanvas() {
  const PX = 1000;                                  // pixels por metro
  const Wm = HALF_W * 2, Hm = LEN - LANE_MIN;
  const c = canvas(Math.round(Wm * PX), Math.round(Hm * PX)), g = c.getContext('2d');
  const wood = woodCanvas(c.width, c.height, '#e8cfa0', '140,100,50', 3, 0, true);
  g.drawImage(wood, 0, 0);
  const zToY = (z) => c.height - (z - LANE_MIN) * PX;
  // pista
  g.fillStyle = 'rgba(255,250,235,0.6)'; g.fillRect(0, zToY(0), c.width, (0 - LANE_MIN) * PX);
  g.strokeStyle = '#c84a2a'; g.lineWidth = 5; g.setLineDash([16, 10]);
  g.beginPath(); g.moveTo(0, zToY(LAUNCH_Z)); g.lineTo(c.width, zToY(LAUNCH_Z)); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#c84a2a'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LANCE DAQUI', c.width / 2, zToY(LAUNCH_Z / 2 + LANE_MIN / 2) + 4);
  const colors = { 1: '#f6e6c4', 2: '#f2d49a', 3: '#e8b86a', 4: '#e09a5a', 5: '#d8784a', 6: '#c85a4a', 8: '#a83a5a' };
  for (let i = 0; i < COLS * ROWS; i++) {
    const cc = cellCenter(i), v = VALUES[i];
    const x = (cc.x + HALF_W - CELL / 2) * PX, y = zToY(cc.z + CELL / 2);
    g.fillStyle = colors[v] || '#f2d49a'; g.globalAlpha = 0.85;
    g.fillRect(x + 3, y + 3, CELL * PX - 6, CELL * PX - 6);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(90,50,20,0.55)'; g.lineWidth = 3; g.strokeRect(x + 3, y + 3, CELL * PX - 6, CELL * PX - 6);
    g.fillStyle = v >= 5 ? '#fff4e0' : '#6a3a1a'; g.font = `bold ${v >= 5 ? 54 : 46}px Georgia, serif`;
    g.fillText(String(v), x + CELL * PX / 2, y + CELL * PX / 2 + 4);
  }
  return c;
}
function seaCanvas() {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rand(5);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.5); sky.addColorStop(0, '#4aa0e8'); sky.addColorStop(1, '#bfe4f6');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { const x = r() * W, y = 40 + r() * 120; g.fillStyle = 'rgba(255,255,255,0.9)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + k * 26, y + Math.sin(k) * 6, 20 + r() * 12, 0, Math.PI * 2); g.fill(); } }
  const sea = g.createLinearGradient(0, H * 0.5, 0, H * 0.75); sea.addColorStop(0, '#2a7ac8'); sea.addColorStop(1, '#4ac0d8');
  g.fillStyle = sea; g.fillRect(0, H * 0.5, W, H * 0.25);
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
  for (let i = 0; i < 60; i++) { const x = r() * W, y = H * 0.52 + r() * H * 0.22; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 30, y); g.stroke(); }
  g.fillStyle = '#f2dca8'; g.fillRect(0, H * 0.75, W, H * 0.25);
  // barquinho
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(700, 255); g.lineTo(740, 255); g.lineTo(730, 265); g.lineTo(710, 265); g.fill();
  g.beginPath(); g.moveTo(720, 255); g.lineTo(720, 215); g.lineTo(740, 250); g.fill();
  return c;
}
function stripeCanvas(colA, colB) {
  const c = canvas(256, 64), g = c.getContext('2d');
  for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? colA : colB; g.fillRect(k * 32, 0, 32, 64); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 28, 256, 8);
  return c;
}

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe4f6);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0xd8c098, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
  sun.position.set(1.8, 3.4, 0.6);
  sun.target.position.set(0, BOARD.h, BOARD.z0 - LEN / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -0.7; sc.right = 0.7; sc.top = 0.8; sc.bottom = -0.8; sc.near = 0.5; sc.far = 7;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // ---------- Praia ----------
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2dca8 }));
  sand.position.y = -0.3; scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a8ac8 }));
  sea.position.set(0, -0.28, -45); scene.add(sea);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), new THREE.MeshBasicMaterial({ map: tex(seaCanvas()), fog: false }));
  view.position.set(0, 8, -70); scene.add(view);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 6), new THREE.MeshLambertMaterial({ map: tex(woodCanvas(1024, 1024, '#b88a5a', '90,60,30', 7, 12, true), { repeat: [2, 2] }) }));
  deck.position.set(0, -0.15, -0.8); deck.receiveShadow = true; scene.add(deck);
  // quiosque: postes, telhado de palha
  const post = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 2.8, 8);
  const posts = new THREE.InstancedMesh(postGeo, post, 4);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  [[-2.6, -3.4], [2.6, -3.4], [-2.6, 1.8], [2.6, 1.8]].forEach(([x, z], k) => { mtx.compose(new THREE.Vector3(x, 1.4, z), q, one); posts.setMatrixAt(k, mtx); });
  scene.add(posts);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.4, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0xc8a050, side: THREE.DoubleSide }));
  roof.position.set(0, 3.4, -0.8); roof.rotation.y = Math.PI / 4; scene.add(roof);
  // coqueiros
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7448 }), leafMat = new THREE.MeshLambertMaterial({ color: 0x3a9a3a, side: THREE.DoubleSide });
  const palms = new THREE.Group();
  for (const [x, z, h, lean] of [[-5, -6, 5, 0.15], [4.5, -7, 6, -0.2], [-8, -3, 5.5, 0.25], [8, -2, 4.5, -0.1], [6.5, -12, 6, 0.1]]) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 8), trunkMat); trunk.position.y = h / 2; p.add(trunk);
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), leafMat);
      leaf.position.set(0, h, 0); leaf.rotation.set(-0.5, k * Math.PI * 2 / 7, 0); leaf.translateX(1.0); p.add(leaf);
    }
    p.position.set(x, -0.3, z); p.rotation.z = lean; palms.add(p);
  }
  scene.add(palms);
  // guarda-sol listrado e cadeira de praia
  const umb = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0xffffff })); pole.position.y = 1.1; umb.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 16, 1, true), new THREE.MeshLambertMaterial({ map: tex(stripeCanvas('#ffffff', '#e84a3a')), side: THREE.DoubleSide })); canopy.position.y = 2.2; umb.add(canopy);
  umb.position.set(-3.6, -0.3, -4.5); scene.add(umb);
  // balcão do quiosque com cocos
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.6), new THREE.MeshLambertMaterial({ map: tex(woodCanvas(512, 256, '#a87a4a', '70,40,15', 4, 6, true)) }));
  counter.position.set(2.0, 0.5, -3.2); scene.add(counter);
  const cocos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshLambertMaterial({ color: 0x6aa83a }), 5);
  for (let k = 0; k < 5; k++) { mtx.compose(new THREE.Vector3(1.3 + k * 0.3, 1.08, -3.2), q, one); cocos.setMatrixAt(k, mtx); }
  scene.add(cocos);

  // ---------- Mesa de pião ----------
  const boardG = new THREE.Group();
  scene.add(boardG);
  const Wm = HALF_W * 2, Hm = LEN - LANE_MIN;
  const midZ = BOARD.z0 - (LEN + LANE_MIN) / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(Wm, 0.03, Hm), [post, post, new THREE.MeshLambertMaterial({ map: tex(boardCanvas()) }), post, post, post]);
  top.position.set(0, BOARD.h - 0.015, midZ); top.receiveShadow = true; boardG.add(top);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x5a8ab8 });
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, Hm + 0.14), railMat); r.position.set(s * (HALF_W + 0.015), BOARD.h + 0.01, midZ - 0.04); r.castShadow = true; boardG.add(r); }
  const back = new THREE.Mesh(new THREE.BoxGeometry(Wm + 0.06, 0.05, 0.03), railMat); back.position.set(0, BOARD.h + 0.01, BOARD.z0 - LANE_MIN + 0.015); boardG.add(back);
  // canaleta do fundo
  const gutter = new THREE.Mesh(new THREE.BoxGeometry(Wm, 0.02, 0.1), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
  gutter.position.set(0, BOARD.h - 0.04, BOARD.z0 - LEN - 0.05); boardG.add(gutter);
  const farRail = new THREE.Mesh(new THREE.BoxGeometry(Wm + 0.06, 0.08, 0.03), railMat); farRail.position.set(0, BOARD.h - 0.01, BOARD.z0 - LEN - 0.11); boardG.add(farRail);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, BOARD.h - 0.03, 0.06), post, 4);
  [[-HALF_W, BOARD.z0 + 0.05], [HALF_W, BOARD.z0 + 0.05], [-HALF_W, BOARD.z0 - LEN], [HALF_W, BOARD.z0 - LEN]].forEach(([x, z], k) => { mtx.compose(new THREE.Vector3(x, (BOARD.h - 0.03) / 2, z), q, one); legs.setMatrixAt(k, mtx); });
  boardG.add(legs);
  // plano para apontar/clicar no tabuleiro
  const boardHit = new THREE.Mesh(new THREE.PlaneGeometry(Wm + 0.3, Hm + 0.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  boardHit.position.set(0, BOARD.h + 0.001, midZ); boardG.add(boardHit);

  // ---------- Pião e pinos ----------
  const tp = [new THREE.Vector2(0, 0), new THREE.Vector2(0.004, 0.004), new THREE.Vector2(TOP_R * 0.7, 0.02), new THREE.Vector2(TOP_R, 0.032), new THREE.Vector2(TOP_R * 0.85, 0.042), new THREE.Vector2(0.008, 0.046), new THREE.Vector2(0.006, 0.062), new THREE.Vector2(0, 0.064)];
  const topGeo = new THREE.LatheGeometry(tp, 20);
  const topMats = [new THREE.MeshStandardMaterial({ map: tex(stripeCanvas('#ffffff', '#e03a3a')), roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: tex(stripeCanvas('#ffe14a', '#2a6ad8')), roughness: 0.4 })];
  function makeTop(team) {
    const g = new THREE.Group();
    const spin = new THREE.Group(); g.add(spin);
    const m = new THREE.Mesh(topGeo, topMats[team]); m.castShadow = true; spin.add(m);
    g.userData = { team, spin };
    return g;
  }
  const pp = [new THREE.Vector2(0, 0), new THREE.Vector2(PIN_R, 0.002), new THREE.Vector2(PIN_R, 0.018), new THREE.Vector2(PIN_R * 0.55, 0.03), new THREE.Vector2(PIN_R * 0.75, 0.04), new THREE.Vector2(PIN_R * 0.6, 0.05), new THREE.Vector2(0, 0.053)];
  const pinGeo = new THREE.LatheGeometry(pp, 14);
  const pinMats = TEAM_COLOR.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
  function makePin(team) { const m = new THREE.Mesh(pinGeo, pinMats[team]); m.castShadow = true; m.userData = { team }; return m; }
  function setPinTeam(m, team) { m.material = pinMats[team]; m.userData.team = team; }
  const pinsG = new THREE.Group(); boardG.add(pinsG);
  // piões que ainda faltam lançar, numa prateleirinha ao lado da pista
  const shelf = [0, 1].map(team => {
    const g = new THREE.Group();
    g.position.set(team === 0 ? HALF_W + 0.09 : -HALF_W - 0.09, BOARD.h - 0.03, team === 0 ? BOARD.z0 + 0.02 : BOARD.z0 - LEN + 0.1);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.36), post); plank.position.y = -0.008; g.add(plank);
    boardG.add(g);
    return g;
  });
  function setShelf(team, n) {
    const g = shelf[team];
    while (g.children.length > 1) g.remove(g.children[1]);
    for (let k = 0; k < n; k++) { const t = makeTop(team); t.position.set(0, 0, (team === 0 ? -1 : 1) * (k * 0.065 - 0.13)); g.add(t); }
  }

  // ---------- Prévia: pontinhos da trajetória e anel onde para ----------
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.004, 6, 4), dotMat, 90);
  dots.visible = false; dots.frustumCulled = false; dots.renderOrder = 5; boardG.add(dots);
  const restRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.038, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
  restRing.visible = false; restRing.renderOrder = 5; boardG.add(restRing);
  const hitMarks = [];
  for (let k = 0; k < 10; k++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.016, 0.022, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 5; boardG.add(m); hitMarks.push(m); }
  function setPath(path, color) {
    let n = 0;
    const step = Math.max(1, Math.floor(path.length / 90));
    for (let i = 0; i < path.length && n < 90; i += step) { mtx.makeTranslation(path[i].x, BOARD.h + 0.006, BOARD.z0 - path[i].z); dots.setMatrixAt(n++, mtx); }
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
    dotMat.color.set(color); dots.visible = true;
  }
  // seta do lançamento no PC (mostra direção e força)
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xffd84a }));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 10).rotateX(-Math.PI / 2), shaft.material);
  arrow.add(shaft, head); arrow.visible = false; boardG.add(arrow);
  function setArrow(x, angle, speed) {
    const len = 0.05 + speed * 0.12;
    arrow.position.set(x, BOARD.h + 0.01, BOARD.z0 - LAUNCH_Z);
    arrow.rotation.set(0, -angle, 0);
    shaft.scale.z = len; head.position.z = -len;
    arrow.visible = true;
  }

  // ---------- Adversário: do outro lado da mesa ----------
  const avatar = makeAvatar({ headY: 1.42, build: buildParts, skin: 0xd09a70 });
  avatar.group.position.set(0.15, 0, BOARD.z0 - LEN - 0.5);
  scene.add(avatar.group);

  // ---------- Placar: placa de madeira no poste do quiosque ----------
  const plC = canvas(1024, 384);
  const plTex = tex(plC);
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: plTex }));
  placa.position.set(-1.0, 1.75, BOARD.z0 - LEN - 0.9); placa.rotation.y = 0.3; scene.add(placa);
  function drawBoard({ names, scores, round, footer }) {
    const g = plC.getContext('2d');
    g.fillStyle = '#f8ecd0'; g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#2a8ac8'; g.lineWidth = 22; g.strokeRect(11, 11, 1002, 362);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#c83a2a'; g.font = 'bold 54px Georgia, serif'; g.fillText('PIÃO', 512, 62);
    for (const k of [0, 1]) {
      const x = k ? 768 : 256;
      g.fillStyle = k ? '#2a6ad8' : '#e03a3a'; g.font = 'bold 40px sans-serif'; g.fillText(names[k], x, 135);
      g.fillStyle = '#3a2a1a'; g.font = 'bold 120px Georgia, serif'; g.fillText(String(scores[k]), x, 240);
    }
    g.fillStyle = '#5a4a3a'; g.font = '32px sans-serif'; g.fillText(round || '', 512, 240);
    g.font = '30px sans-serif'; g.fillText(footer || '', 512, 335);
    plTex.needsUpdate = true;
  }

  function animate(dt, time) {
    palms.children.forEach((p, k) => { p.rotation.x = Math.sin(time * 0.6 + k) * 0.02; });
    sea.position.y = -0.28 + Math.sin(time * 0.8) * 0.01;
  }

  return {
    scene, sun, boardG, boardHit, pinsG, makeTop, makePin, setPinTeam, setShelf, dots, setPath, restRing, hitMarks,
    arrow, setArrow, avatar, drawBoard, animate,
  };
}

// Enfeites: boné virado e brinco (arriscado), chapéu de palha com flor (cautelosa), chapéu-panamá e
// bigode branco (mestre)
function buildParts() {
  const parts = {};
  parts.risky = new THREE.Group();
  const capMat = new THREE.MeshLambertMaterial({ color: 0xe05a2a });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.138, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.position.y = 0.03; parts.risky.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, Math.PI / 2, Math.PI), capMat); brim.position.set(0, 0.04, -0.12); parts.risky.add(brim);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.8, roughness: 0.3 })); ring.position.set(0.13, -0.04, 0); ring.rotation.y = Math.PI / 2; parts.risky.add(ring);

  parts.careful = new THREE.Group();
  const straw = new THREE.MeshLambertMaterial({ color: 0xf0d890 });
  const brim2 = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.01, 22), straw); brim2.position.y = 0.09; parts.careful.add(brim2);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), straw); crown.position.y = 0.09; parts.careful.add(crown);
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshLambertMaterial({ color: 0xff6a9a })); flower.position.set(0.1, 0.12, 0.06); parts.careful.add(flower);

  parts.master = new THREE.Group();
  const panama = new THREE.MeshLambertMaterial({ color: 0xf6f0e0 });
  const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 22), panama); b3.position.y = 0.1; parts.master.add(b3);
  const c3 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 18), panama); c3.position.y = 0.15; parts.master.add(c3);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.121, 0.02, 18), new THREE.MeshLambertMaterial({ color: 0x2a2a3a })); band.position.y = 0.115; parts.master.add(band);
  const stache = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.09, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })); stache.position.set(0, -0.035, 0.125); parts.master.add(stache);
  return parts;
}
