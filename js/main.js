// Liga a física, as regras e a IA à tela, ao Quest (lançar com o pulso) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { HALF_W, LAUNCH_Z, LANE_MIN, LEN, TOP_R, V_MIN, V_MAX, cellCenter } from './physics.js';
import { TOPS, VALUES, Match, applyLaunch, preview, scoreOf, PLAYER, CPU } from './rules.js';
import { OPPONENTS, ROBOT, rng, chooseLaunchGen } from './ai.js';
import { CHALLENGES, setupChallenge, bestChallengeGen, gradeState, goalText, resultOf } from './challenges.js';
import { buildWorld, BOARD, TEAM_COLOR, toWorld, toLocal } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent || '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const VR_STAND = { x: 0, z: BOARD.z0 + 0.42 };
const GRAB_DIST = 0.1;
const HAND_SPEED = 0.7;             // velocidade da mão → velocidade do pião
const BOARD_MID = new THREE.Vector3(0, BOARD.h, BOARD.z0 - LEN / 2);

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 200);
rig.add(camera);
const UP = new THREE.Vector3(0, 1, 0);

const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const statusLabel = new Label(0.62, 1024, 200);
statusLabel.mesh.position.set(0, 1.55, BOARD.z0 - LEN - 0.35);
statusLabel.mesh.rotation.x = -0.12;
statusLabel.mesh.visible = false;
scene.add(statusLabel.mesh);
const previewLabel = new Label(0.3, 768, 160);
previewLabel.mesh.visible = false;
scene.add(previewLabel.mesh);

// ---------- Estado ----------
let app = 'menu';
let mode = 'match';
let match = null;
let ch = null;
let oppIndex = 0;
let phase = 'idle';          // 'intro' | 'turn' | 'think' | 'anim' | 'roundEnd' | 'over'
let time = 0;
let msg = null;
let random = rng((Date.now() % 100000) + 1);
let held = null;             // VR: pião na mão { entry, via, hist }
let aim = { x: 0, angle: 0, speed: 0.9, spin: 0.85, dir: 1 };   // PC: lançamento sendo mirado
let dragging = null;         // PC: arrastando para mirar { start }
let thinker = null;
let thinkT = 0;
let chResult = null;
let lastLaunch = null;
const opponent = () => OPPONENTS[oppIndex];
const cur = () => (mode === 'match' ? match?.round : ch?.st);
const pinMeshes = new Map();  // casa → pino
const effects = [];           // pinos virando / caindo, pião tombando
let spinning = null;          // pião andando { mesh, info, t, ... }
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const padTop = world.makeTop(PLAYER);   // pião em cima da pista, esperando o lançamento
world.boardG.add(padTop);

function clearBoard() {
  for (const m of pinMeshes.values()) m.parent?.remove(m);
  pinMeshes.clear();
  for (const e of effects) e.mesh.parent?.remove(e.mesh);
  effects.length = 0;
  if (spinning) { spinning.mesh.parent?.remove(spinning.mesh); spinning = null; sfx.whirStop(); }
  timers.length = 0;
}
function syncPins(st) {
  const cells = new Set(st.pins.map(p => p.cell));
  for (const [c, m] of pinMeshes) if (!cells.has(c)) { m.parent?.remove(m); pinMeshes.delete(c); }
  for (const p of st.pins) {
    let m = pinMeshes.get(p.cell);
    if (!m) { m = world.makePin(p.owner); const cc = cellCenter(p.cell); toWorld(cc.x, cc.z, m.position); m.userData.cell = p.cell; world.pinsG.add(m); pinMeshes.set(p.cell, m); }
    if (m.userData.team !== p.owner) world.setPinTeam(m, p.owner);
    m.scale.setScalar(1); m.rotation.set(0, 0, 0);
  }
}
function syncShelves() {
  const st = cur();
  if (!st || app === 'menu') { world.setShelf(0, 0); world.setShelf(1, 0); return; }
  const waiting = phase === 'turn' && st.turn === PLAYER && !held ? 1 : 0;
  world.setShelf(PLAYER, Math.max(0, st.tops[PLAYER] - waiting));
  world.setShelf(CPU, st.tops[CPU]);
}
function updatePad() {
  const st = cur();
  const show = app === 'play' && phase === 'turn' && st?.turn === PLAYER && !held;
  padTop.visible = show;
  if (show) toWorld(aim.x, LAUNCH_Z, padTop.position);
}

// ---------- Partidas e desafios ----------
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  const o = opponent();
  world.avatar.setStyle(o.style, o.color);
  match = new Match({ starter: random() < 0.5 ? PLAYER : CPU });
  ch = null;
  startRound();
  msg = { text: match.round.starter === PLAYER ? 'Sorteio: você começa.' : `Sorteio: ${o.name} começa.`, t: 3.5 };
}
function startRound() {
  app = 'play';
  panel.hide();
  dropHeld();
  clearBoard();
  syncPins(cur());
  placeForPlay();
  beginTurn();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  oppIndex = 2;
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k, c: CHALLENGES[k], st: setupChallenge(CHALLENGES[k]), plan: null };
  match = null;
  world.avatar.setStyle('master', OPPONENTS[2].color);
  app = 'play';
  dropHeld();
  clearBoard();
  syncPins(ch.st);
  msg = null; chResult = null; thinker = null;
  placeForPlay();
  if (skipIntro || dev.autoplay) { panel.hide(); beginTurn(); } else { phase = 'intro'; showScreen('chIntro'); }
}
function beginTurn() {
  const st = cur();
  thinker = null;
  if (st.over) { endOfRound(); return; }
  if (st.turn === PLAYER) { phase = 'turn'; thinkT = 0; aim = { ...aim, angle: 0 }; }
  else {
    phase = 'think';
    thinkT = 0;
    world.avatar.state.thinking = true;
    thinker = { gen: chooseLaunchGen(st, CPU, opponent(), random), done: false, result: null };
  }
  syncShelves();
  updatePad();
  updateHint();
}
function pumpThinker(budgetMs = 6) {
  if (!thinker || thinker.done) return;
  const t0 = performance.now();
  do {
    const x = thinker.gen.next();
    if (x.done) { thinker.done = true; thinker.result = x.value; return; }
  } while (performance.now() - t0 < budgetMs);
}

// Lança o pião (de quem estiver na vez) e anima o caminho da física, com batidas e o tombo no fim.
function doLaunch(l) {
  const st = cur();
  if (!st || st.over || phase === 'anim' || st.tops[st.turn] <= 0) return false;
  const launch = { x: clamp(l.x, -HALF_W + TOP_R, HALF_W - TOP_R), angle: clamp(l.angle, -1.2, 1.2), speed: clamp(l.speed, 0, V_MAX), spin: clamp(l.spin, 0, 1), dir: l.dir >= 0 ? 1 : -1 };
  const who = st.turn;
  let info;
  if (mode === 'match') info = match.play(launch);
  else { const r = applyLaunch(ch.st, launch); ch.st = r.st; info = r.info; }
  lastLaunch = { launch, by: who, rest: info.rest.cell, converted: info.converted.length, knocked: info.knocked.length };
  phase = 'anim';
  hidePreview();
  padTop.visible = false;
  if (who === CPU) world.avatar.state.thinking = false;
  const mesh = world.makeTop(who);
  world.boardG.add(mesh);
  toWorld(launch.x, LAUNCH_Z, mesh.position);
  spinning = { mesh, info, t: 0, hitI: 0, wallI: 0, spin: launch.spin, dir: launch.dir, done: false };
  syncShelves();
  sfx.launch(); sfx.whirStart();
  if (renderer.xr.isPresenting && who === PLAYER) pulse(lastHandSide, 0.4, 30);
  return true;
}
function updateSpinning(dt) {
  const s = spinning;
  if (!s || s.done) return;
  s.t += dt;
  const { sim } = s.info;
  const P = sim.path;
  const end = P[P.length - 1].t;
  const t = Math.min(s.t, end);
  let j = 0;
  while (j < P.length - 1 && P[j + 1].t < t) j++;
  const a = P[j], b = P[Math.min(P.length - 1, j + 1)];
  const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
  toWorld(x, z, s.mesh.position);
  const speed = Math.hypot(b.x - a.x, b.z - a.z) / Math.max(1e-3, b.t - a.t);
  s.mesh.userData.spin.rotation.y += dt * (25 + 30 * s.spin) * s.dir;
  s.mesh.rotation.z = Math.sin(s.t * 9) * 0.05;
  sfx.whirSet(s.spin, speed);
  // batidas nos pinos na hora certa
  while (s.hitI < sim.hits.length && sim.hits[s.hitI].t <= t) pinHit(sim.hits[s.hitI++], s.info.by);
  while (s.wallI < sim.walls.length && sim.walls[s.wallI] <= t) { s.wallI++; sfx.wall(); if (renderer.xr.isPresenting) pulseAll(0.15, 15); }
  if (s.t < end) return;
  s.done = true;
  sfx.whirStop();
  if (sim.rest.out) {
    // caiu na canaleta: some no fundo
    effects.push({ mesh: s.mesh, kind: 'gutter', t0: time, p0: s.mesh.position.clone() });
    spinning = null;
    msg = { text: 'Caiu na canaleta: não vale.', t: 2.5 };
    later(0.7, () => afterLaunch(s.info));
    return;
  }
  effects.push({ mesh: s.mesh, kind: 'topple', t0: time, axis: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), placed: s.info.placed });
  spinning = null;
  later(0.35, () => sfx.topple());
  later(0.9, () => {
    if (s.info.placed) { syncPins(cur()); const m = pinMeshes.get(s.info.placed.cell); if (m) { m.scale.setScalar(0.01); effects.push({ mesh: m, kind: 'grow', t0: time }); sfx.grow(); } }
    afterLaunch(s.info);
  });
}
function pinHit(h, shooter) {
  const m = pinMeshes.get(h.cell);
  if (!m) return;
  if (h.owner === shooter) {
    // pino seu: cai e sai
    pinMeshes.delete(h.cell);
    effects.push({ mesh: m, kind: 'knock', t0: time, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9, (Math.random() - 0.5) * 0.6), p0: m.position.clone() });
    sfx.hitPin(true);
    world.avatar.react(shooter === CPU ? -1 : 1);
  } else {
    // pino do outro: pula e troca de cor
    effects.push({ mesh: m, kind: 'convert', t0: time, team: shooter, y0: m.position.y });
    sfx.hitPin(false); later(0.12, () => sfx.convert());
    world.avatar.react(shooter === CPU ? 1 : -1);
  }
  if (renderer.xr.isPresenting) pulseAll(0.35, 30);
}
function updateEffects() {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const t = time - e.t0;
    if (e.kind === 'convert') {
      const k = clamp(t / 0.45, 0, 1);
      e.mesh.position.y = e.y0 + Math.sin(Math.PI * k) * 0.06;
      e.mesh.rotation.y = k * Math.PI * 4;
      if (k > 0.5 && e.mesh.userData.team !== e.team) world.setPinTeam(e.mesh, e.team);
      if (k >= 1) { e.mesh.position.y = e.y0; e.mesh.rotation.y = 0; effects.splice(i, 1); }
    } else if (e.kind === 'knock') {
      e.mesh.position.set(e.p0.x + e.v.x * t, e.p0.y + e.v.y * t - 4.9 * t * t, e.p0.z + e.v.z * t);
      e.mesh.rotation.x = t * 9; e.mesh.rotation.z = t * 6;
      if (t > 0.8) { e.mesh.parent?.remove(e.mesh); effects.splice(i, 1); }
    } else if (e.kind === 'topple') {
      const k = clamp(t / 0.4, 0, 1);
      e.mesh.quaternion.setFromAxisAngle(e.axis, k * k * 1.3);
      if (t > 0.6) e.mesh.scale.setScalar(Math.max(0.01, 1 - (t - 0.6) / 0.3));
      if (t > 0.9) { e.mesh.parent?.remove(e.mesh); effects.splice(i, 1); }
    } else if (e.kind === 'gutter') {
      e.mesh.position.set(e.p0.x, e.p0.y - 2 * t * t, e.p0.z - 0.15 * t);
      if (t > 0.6) { e.mesh.parent?.remove(e.mesh); effects.splice(i, 1); }
    } else if (e.kind === 'grow') {
      const k = clamp(t / 0.3, 0, 1);
      e.mesh.scale.setScalar(Math.max(0.01, k * (1 + Math.sin(Math.PI * k) * 0.3)));
      if (k >= 1) { e.mesh.scale.setScalar(1); effects.splice(i, 1); }
    }
  }
}
function afterLaunch(info) {
  const st = cur();
  syncPins(st);
  const who = info.by === PLAYER ? 'Você' : mode === 'match' ? opponent().name : 'Você';
  const parts = [];
  if (info.converted.length) parts.push(`virou ${info.converted.length} pino${info.converted.length > 1 ? 's' : ''}`);
  if (info.knocked.length) parts.push(`derrubou ${info.knocked.length} seu${info.knocked.length > 1 ? 's' : ''}`);
  if (info.placed) parts.push(`parou na casa ${VALUES[info.placed.cell]}`);
  else if (!info.rest.out) parts.push(info.rest.cell < 0 ? 'parou na pista (não vale)' : 'parou numa casa ocupada');
  if (parts.length) msg = { text: `${who}: ${parts.join(', ')}.`, t: 3 };
  if (st.over) { later(0.4, () => endOfRound()); return; }
  beginTurn();
}

function endOfRound() {
  if (mode === 'challenge') { finishChallenge(); return; }
  if (phase === 'roundEnd' || phase === 'over') return;
  match.closeRound();
  phase = match.over ? 'over' : 'roundEnd';
  const r = match.results[match.results.length - 1].score;
  if (match.over) {
    save.games[oppIndex]++;
    if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); world.avatar.react(-1); } else if (match.winner === CPU) { sfx.bad(); world.avatar.react(1); }
    storeSave(save);
    showScreen('over');
  } else { if (r[0] > r[1]) sfx.good(); else if (r[1] > r[0]) sfx.bad(); showScreen('roundEnd'); }
  timerAuto = 2.5;
  updateHint();
}
let timerAuto = 0;
function nextRound() {
  match.nextRound();
  startRound();
  msg = { text: match.round.starter === PLAYER ? 'Rodada 2: você começa.' : `Rodada 2: ${opponent().name} começa.`, t: 3 };
}
function finishChallenge() {
  if (phase === 'over') return;
  phase = 'over';
  const stars = gradeState(ch.c, ch.st);
  chResult = { stars, result: resultOf(ch.c, ch.st) };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
  if (stars === 3) later(0.8, () => sfx.fanfare());
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu';
  phase = 'idle';
  match = null; ch = null;
  dropHeld();
  clearBoard();
  syncPins({ pins: [{ cell: 32, owner: 0 }, { cell: 27, owner: 1 }, { cell: 21, owner: 1 }, { cell: 17, owner: 0 }, { cell: 13, owner: 1 }] });
  world.avatar.setStyle('master', OPPONENTS[2].color);
  world.avatar.state.thinking = false;
  syncShelves(); updatePad();
  if (renderer.xr.isPresenting) placeRig(VR_STAND.x, VR_STAND.z);
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; panel.hide(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  if (vr) placePanelVR();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Pião', 72, 64);
      p.text('Lance com o pulso, vire os pinos do outro e pare nas casas que valem mais', 512, 132, { size: 25, color: '#b8d8ee' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Prévia: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 474, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#ffd25a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#b8d8ee' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, 116 + i * 156, 800, 136, { size: 36, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` }));
      p.text(`2 rodadas de ${TOPS} piões para cada um. Cada um começa uma.`, 512, 600, { size: 24, color: '#b8d8ee' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#b8d8ee' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Lance o seu pião da pista. Ele desliza, rebate nas paredes e para numa casa.',
        'Onde ele parar nasce um pino seu (se a casa estiver livre).',
        'Pino do outro que o pião acertar VIRA seu. Pino seu que ele acertar SAI.',
        'Passou do fundo, cai na canaleta. No fim, cada pino vale o número da casa.',
        'Mais giro: desliza mais e curva mais para o lado do giro.',
        vr ? 'VR: aperto perto do pião pega; jogue a mão para a frente e solte o botão.' : 'PC: aperte na pista, puxe o mouse para baixo e solte (estilingue).',
        vr ? 'Girar o pulso ao soltar dá giro (o lado do giro escolhe a curva).' : 'Q/E: curva para a esquerda/direita · 1, 2, 3: giro fraco, médio, forte.',
        vr ? 'Os pontinhos mostram o caminho previsto. B ou Y: pausa.' : 'Setas: mudam o lugar na pista · A/D: câmera · Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 124 + i * 54, { size: 24, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · Rodada ${match.index + 1} de 2` : `Desafio ${ch.i + 1}: ${ch.c.name}`, 512, 130, { size: 28, color: '#b8d8ee' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); placeForPlay(true); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'roundEnd') {
      const r = match.results[match.results.length - 1].score;
      p.title('Fim da rodada 1', 66);
      p.text(`Você ${r[0]} x ${r[1]} ${opponent().name}`, 512, 150, { size: 40, bold: true, color: r[0] > r[1] ? '#9aff9a' : r[1] > r[0] ? '#ff9a8a' : '#f8f6ee' });
      p.text(`Na rodada 2 começa: ${match.round.starter === PLAYER ? 'você' : opponent().name}`, 512, 220, { size: 26, color: '#b8d8ee' });
      p.button('Próxima rodada', () => nextRound(), 262, 300, 500, 96, { size: 38 });
      p.button('Menu principal', () => goMenu(), 262, 430, 500, 80);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 150, { size: 40, bold: true });
      p.text(`Rodadas: ${match.results.map(r => `${r.score[0]}-${r.score[1]}`).join('   ')}`, 512, 210, { size: 28, color: '#b8d8ee' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 258, { size: 24, color: '#b8d8ee' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = ch.c;
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66, 46);
      p.text(c.desc, 512, 150, { size: 25 });
      p.text(`Piões: ${c.tops}. Os pinos azuis viram seus se o pião acertar.`, 512, 200, { size: 24, color: '#b8d8ee' });
      p.text(goalText(c), 512, 252, { size: 24, color: '#ffd25a' });
      p.button('Começar', () => { panel.hide(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = ch.c;
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(`Pontos: ${chResult.result}`, 512, 236, { size: 30 });
      p.text(goalText(c), 512, 280, { size: 22, color: '#b8d8ee' });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 330, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 330, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 434, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 534, 500, 80);
    }
  });
  hidePreview();
  updateHint();
}

// ---------- Painel e VR ----------
function fitPC() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.quaternion.identity();
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}
function placePanelVR() {
  const head = new THREE.Vector3(), hq = new THREE.Quaternion();
  camera.getWorldPosition(head);
  camera.getWorldQuaternion(hq);
  const yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
  panel.mesh.position.copy(head).addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 0.95);
  panel.mesh.position.y = head.y - 0.05;
  panel.mesh.rotation.set(0, yaw, 0);
}
function placeRig(x, z) {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().setY(0).applyAxisAngle(UP, rig.rotation.y);
  rig.position.set(x - head.x, 0, z - head.z);
  rig.updateMatrixWorld(true);
}
let rigPlaced = false;
function placeForPlay(force = false) {
  if (renderer.xr.isPresenting && (force || !rigPlaced)) { placeRig(VR_STAND.x, VR_STAND.z); rigPlaced = true; }
  pcCamSnap = true;
}
const canAct = () => app === 'play' && phase === 'turn' && !panel.visible && !dev.autoplay && cur()?.turn === PLAYER;

// ---------- Controles do VR: pegar o pião e soltar com o movimento da mão ----------
const ctrls = [];
const markMat = new THREE.MeshStandardMaterial({ color: 0xffd84a, roughness: 0.3, metalness: 0.5 });
let lastHandSide = 'right';
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand ? renderer.xr.getHand(i) : null;
  rig.add(ctrl, grip);
  if (hand) rig.add(hand);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffd84a }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), markMat);
  grip.add(mark);
  const pinchDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffd84a }));
  pinchDot.visible = false;
  scene.add(pinchDot);
  const entry = { ctrl, grip, hand, laser, mark, pinchDot, source: null, side: null, prevButtons: [], hoverIndex: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (held?.entry === entry) dropHeld(); entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (held?.entry === entry && held.via === 'select') releaseHeld(); });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (!entry.source?.hand) tryGrab(entry, 'squeeze'); });
  ctrl.addEventListener('squeezeend', () => { if (held?.entry === entry && held.via === 'squeeze') releaseHeld(); });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) { try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ } }
const pulseAll = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };
function grabPoint(entry, out = new THREE.Vector3()) {
  if (entry.source?.hand && entry.hand?.joints) {
    const a = entry.hand.joints['index-finger-tip'], b = entry.hand.joints['thumb-tip'];
    if (a && b && a.visible !== false) { a.getWorldPosition(out); b.getWorldPosition(_v2); return out.add(_v2).multiplyScalar(0.5); }
  }
  entry.grip.getWorldPosition(out);
  if (!entry.source?.hand) out.add(new THREE.Vector3(0, -0.02, -0.04).applyQuaternion(entry.grip.getWorldQuaternion(_q)));
  return out;
}
function tryGrab(entry, via) {
  if (held || !canAct()) return false;
  const p = grabPoint(entry);
  padTop.getWorldPosition(_v);
  if (_v.distanceTo(p) > GRAB_DIST) return false;
  const mesh = world.makeTop(PLAYER);
  scene.add(mesh);
  held = { entry, via, mesh, hist: [] };
  lastHandSide = entry.side || lastHandSide;
  updatePad(); syncShelves();
  sfx.pick(); pulse(entry.side, 0.3, 25);
  return true;
}
// lançamento a partir do movimento da mão nos últimos ~80 ms
function launchFromHand(h) {
  const hist = h.hist;
  if (hist.length < 3) return null;
  const now = hist[hist.length - 1];
  let k = hist.length - 1;
  while (k > 0 && now.t - hist[k].t < 0.08) k--;
  const old = hist[k];
  const dt = Math.max(1e-3, now.t - old.t);
  const vx = (now.p.x - old.p.x) / dt, vzBoard = -(now.p.z - old.p.z) / dt;   // para longe = -z do mundo
  const sp = Math.hypot(vx, vzBoard) * HAND_SPEED;
  // giro: quanto o pulso girou nesse tempo (em volta do eixo do antebraço)
  const dq = old.q.clone().invert().multiply(now.q);
  const ang = 2 * Math.acos(clamp(Math.abs(dq.w), 0, 1));
  const axis = new THREE.Vector3(dq.x, dq.y, dq.z);
  const sign = Math.sign(axis.z || 1) * Math.sign(dq.w || 1);
  const spin = clamp(0.35 + (ang / dt) / 14, 0.35, 1);
  return { x: clamp(now.p.x, -HALF_W + TOP_R, HALF_W - TOP_R), angle: Math.atan2(vx, Math.max(0.01, vzBoard)), speed: sp, spin, dir: sign >= 0 ? -1 : 1, forward: vzBoard > 0.1 };
}
function updateHeld() {
  if (!held) return;
  const e = held.entry;
  const p = grabPoint(e);
  held.mesh.position.copy(p).add(new THREE.Vector3(0, -0.03, 0));
  held.mesh.userData.spin.rotation.y += 0.1;
  e.grip.getWorldQuaternion(_q);
  held.hist.push({ t: time, p: p.clone(), q: _q.clone() });
  while (held.hist.length > 30) held.hist.shift();
  const l = launchFromHand(held);
  if (l && l.forward && l.speed >= V_MIN && save.preview) showPreviewFor(l); else hidePreview();
}
function releaseHeld() {
  if (!held) return;
  const h = held;
  held = null;
  scene.remove(h.mesh);
  const l = launchFromHand(h);
  const local = toLocal(h.mesh.position);
  if (!l || !l.forward || l.speed < V_MIN) { msg = { text: 'Jogue a mão para a frente e solte o botão no meio do movimento.', t: 3 }; updatePad(); syncShelves(); hidePreview(); return; }
  if (local.z > 0.25) { msg = { text: 'Solte o pião em cima da pista (na beira de perto).', t: 3 }; updatePad(); syncShelves(); hidePreview(); return; }
  if (canAct() || (app === 'play' && phase === 'turn')) doLaunch(l);
}
function dropHeld() { if (!held) return; scene.remove(held.mesh); held = null; hidePreview(); updatePad(); }
function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) { if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } } return; }
  if (entry.source?.hand) tryGrab(entry, 'select');
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) togglePause();
    e.prevButtons = b;
  }
}

// ---------- Mouse e teclado: arrastar para trás e soltar ----------
const mouse = { ndc: new THREE.Vector2(-9, -9), right: false, lx: 0, ly: 0 };
const keys = new Set();
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD.h);
function mouseBoard() {
  raycaster.setFromCamera(mouse.ndc, camera);
  const p = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  return p ? toLocal(p) : null;
}
// Mira pelo arraste na tela (estilingue): puxar para baixo dá força, para o lado dá a direção oposta
const mousePx = { x: 0, y: 0 };
function aimFromDrag(start) {
  const H = window.innerHeight || 720;
  const dx = mousePx.x - start.px, pull = mousePx.y - start.py;
  const speed = clamp(V_MIN + (pull / (0.42 * H)) * (1.55 - V_MIN), 0, V_MAX);
  return { ...aim, angle: clamp(Math.atan2(-dx, Math.max(1, pull)), -0.9, 0.9), speed, ok: pull > 8 };
}
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (e.button === 2) { mouse.right = true; mouse.lx = e.clientX; mouse.ly = e.clientY; return; }
  raycaster.setFromCamera(mouse.ndc, camera);
  if (panel.visible) { const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv)); if (a) { sfx.click(); a(); } return; }
  if (!canAct() || renderer.xr.isPresenting) return;
  const p = mouseBoard();
  if (!p) return;
  // clicou na pista: o pião vai para lá e começa a mirar
  if (p.z < 0.18 && Math.abs(p.x) < HALF_W + 0.05) {
    aim.x = clamp(p.x, -HALF_W + TOP_R, HALF_W - TOP_R);
    mousePx.x = e.clientX; mousePx.y = e.clientY;
    dragging = { start: { px: e.clientX, py: e.clientY } };
    updatePad();
  } else msg = { text: 'Aperte em cima da pista (perto de você) e arraste para trás.', t: 2.5 };
});
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mousePx.x = e.clientX; mousePx.y = e.clientY;
  if (mouse.right) { pcOrbit.yaw -= (e.clientX - mouse.lx) * 0.005; pcOrbit.pitch = clamp(pcOrbit.pitch + (e.clientY - mouse.ly) * 0.004, 0.2, 1.4); mouse.lx = e.clientX; mouse.ly = e.clientY; }
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) { mouse.right = false; return; }
  if (!dragging) return;
  if (e.clientX != null) { mousePx.x = e.clientX; mousePx.y = e.clientY; }
  const d = dragging;
  dragging = null;
  world.arrow.visible = false;
  if (!canAct()) { hidePreview(); return; }
  const l = aimFromDrag(d.start);
  if (!l.ok || l.speed < V_MIN) { msg = { text: 'Arraste mais para trás para dar força.', t: 2 }; hidePreview(); return; }
  doLaunch(l);
});
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault?.(); pcOrbit.dist = clamp(pcOrbit.dist + e.deltaY * 0.0008, 0.5, 2.0); }, { passive: false });
window.addEventListener('blur', () => { keys.clear(); mouse.right = false; dragging = null; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = (e.key || '').toLowerCase();
  if (k === 'escape') { if (dragging) { dragging = null; world.arrow.visible = false; hidePreview(); return; } togglePause(); return; }
  if (k === 'p') { togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (k === 'q') { aim.dir = -1; msg = { text: 'Giro para a esquerda: curva para a esquerda.', t: 1.5 }; }
  if (k === 'e') { aim.dir = 1; msg = { text: 'Giro para a direita: curva para a direita.', t: 1.5 }; }
  if (k === '1' || k === '2' || k === '3') { aim.spin = [0.3, 0.6, 0.95][+k - 1]; msg = { text: `Giro ${['fraco', 'médio', 'forte'][+k - 1]}.`, t: 1.5 }; }
  if (k === 'arrowleft' && canAct()) { aim.x = clamp(aim.x - 0.03, -HALF_W + TOP_R, HALF_W - TOP_R); updatePad(); }
  if (k === 'arrowright' && canAct()) { aim.x = clamp(aim.x + 0.03, -HALF_W + TOP_R, HALF_W - TOP_R); updatePad(); }
  keys.add(k);
});
window.addEventListener('keyup', (e) => { keys.delete((e.key || '').toLowerCase()); });
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); fitPC(); });

// ---------- Prévia: caminho previsto, onde para e o que acerta ----------
let previewKey = '', previewInfo = null;
function hidePreview() {
  world.dots.visible = false;
  world.restRing.visible = false;
  for (const m of world.hitMarks) m.visible = false;
  previewLabel.mesh.visible = false;
  previewInfo = null; previewKey = '';
  previewEl.style.display = 'none';
}
function showPreviewFor(l) {
  const st = cur();
  if (!st || st.over) { hidePreview(); return; }
  const key = [l.x, l.angle, l.speed, l.spin, l.dir].map(v => Math.round(v * 200)).join(':') + ':' + st.moves;
  if (key !== previewKey) { previewKey = key; previewInfo = preview(st, l); }
  const info = previewInfo;
  if (!info) return;
  const gain = scoreOf(applyLaunch(st, l).st, PLAYER) - scoreOf(st, PLAYER);
  world.setPath(info.sim.path, info.rest.out ? 0xff6a5a : gain > 0 ? 0x9aff9a : 0xffffff);
  if (!info.rest.out) { toWorld(info.rest.x, info.rest.z, world.restRing.position).y += 0.004; world.restRing.visible = true; } else world.restRing.visible = false;
  world.hitMarks.forEach((m, k) => { const h = info.sim.hits[k]; m.visible = !!h; if (h) { toWorld(h.x, h.z, m.position).y += 0.005; m.material.color.set(h.owner === st.turn ? 0xff4a3a : 0x6aff8a); } });
  updatePreviewText(info, l, gain);
}
function previewText(info, l, gain) {
  const a = `Força ${Math.round(l.speed / V_MAX * 100)}% · giro ${Math.round(l.spin * 100)}% para a ${l.dir > 0 ? 'direita' : 'esquerda'}`;
  const parts = [];
  if (info.converted.length) parts.push(`vira ${info.converted.length}`);
  if (info.knocked.length) parts.push(`derruba ${info.knocked.length} seu${info.knocked.length > 1 ? 's' : ''}`);
  if (info.rest.out) parts.push('cai na canaleta');
  else if (info.placed) parts.push(`para na casa ${VALUES[info.placed.cell]}`);
  else parts.push(info.rest.cell < 0 ? 'para na pista' : 'para em casa ocupada');
  return [a, `${parts.join(', ')} (${gain >= 0 ? '+' : ''}${gain})`, info.knocked.length || info.rest.out ? 'bad' : gain > 0 ? 'good' : 'ok'];
}
const previewEl = document.getElementById('preview');
function updatePreviewText(info, l, gain) {
  const [a, b, kind] = previewText(info, l, gain);
  const color = kind === 'bad' ? '#ff8a7a' : kind === 'good' ? '#9aff9a' : '#f8f6ee';
  if (renderer.xr.isPresenting) {
    previewLabel.set([{ text: a, size: 0.4, color: '#ffd84a' }, { text: b, size: 0.36, color }]);
    previewLabel.mesh.visible = true;
    toWorld(0, LEN * 0.55, previewLabel.mesh.position, BOARD.h + 0.28);
    camera.getWorldPosition(_v);
    previewLabel.mesh.lookAt(_v.x, previewLabel.mesh.position.y, _v.z);
  } else {
    previewEl.style.display = 'block';
    const html = `<div class="txt">${a}</div><div class="txt" style="color:${color}">${b}</div>`;
    if (previewEl.dataset.last !== html) { previewEl.innerHTML = html; previewEl.dataset.last = html; }
  }
}
function updatePCDrag() {
  if (!dragging || renderer.xr.isPresenting) return;
  const l = aimFromDrag(dragging.start);
  if (l.ok && l.speed >= V_MIN) { world.setArrow(l.x, l.angle, l.speed); if (save.preview) showPreviewFor(l); else updatePreviewText(preview(cur(), l), l, 0); }
  else { world.arrow.visible = false; hidePreview(); }
}

// ---------- Câmera do PC ----------
const pcOrbit = { yaw: 0, pitch: 0.82, dist: 1.0 };
const pcCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
let pcCamSnap = true;
function updatePCCamera(dt) {
  if (renderer.xr.isPresenting) return;
  if (keys.has('a')) pcOrbit.yaw += 1.2 * dt;
  if (keys.has('d')) pcOrbit.yaw -= 1.2 * dt;
  if (keys.has('w')) pcOrbit.pitch = clamp(pcOrbit.pitch + 0.8 * dt, 0.2, 1.4);
  if (keys.has('s')) pcOrbit.pitch = clamp(pcOrbit.pitch - 0.8 * dt, 0.2, 1.4);
  let yaw = pcOrbit.yaw, pitch = pcOrbit.pitch, dist = pcOrbit.dist;
  let look = BOARD_MID.clone().add(new THREE.Vector3(0, 0, 0.16));
  if (app === 'menu') { yaw = Math.sin(time * 0.12) * 0.4; pitch = 0.35; dist = 1.6; look = new THREE.Vector3(0, 1.1, BOARD.z0 - 0.5); }
  const pos = new THREE.Vector3(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  if (pcCamSnap) { pcCam.pos.copy(pos); pcCam.look.copy(look); pcCamSnap = false; }
  pcCam.pos.lerp(pos, damp(6, dt));
  pcCam.look.lerp(look, damp(6, dt));
  camera.position.copy(pcCam.pos);
  camera.lookAt(pcCam.look);
}

// ---------- VR: sessão ----------
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5; rigPlaced = false;
  if (panel.mesh.parent) panel.mesh.parent.remove(panel.mesh);
  scene.add(panel.mesh);
  panel.mesh.scale.setScalar(1);
  hidePreview(); updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  dropHeld();
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 0.5); camera.quaternion.identity();
  pcCamSnap = true;
  fitPC(); updateHint();
});

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr) {
    if (panel.visible) {
      raycaster.setFromCamera(mouse.ndc, camera);
      hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
      renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
    } else renderer.domElement.style.cursor = dragging ? 'grabbing' : canAct() ? 'grab' : 'default';
  }
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'turn') t = 'Aperte na pista e puxe o mouse para baixo (estilingue) · Q/E: curva · 1 2 3: giro · setas: lugar · Esc: pausa';
  else t = 'A/D ou botão direito: câmera · rodinha: zoom · Esc: pausa';
  hintEl.innerHTML = `<span>${t}</span>`;
}
function statusLines() {
  const st = cur();
  if (mode === 'challenge') {
    const c = ch.c;
    return [`Desafio ${ch.i + 1}: ${c.name} · pontos: ${scoreOf(st, PLAYER)} · piões: ${st.tops[PLAYER]}`, goalText(c)];
  }
  const o = opponent();
  const s = [scoreOf(st, 0), scoreOf(st, 1)];
  const head = `Você ${s[0]} x ${s[1]} ${o.name} · Rodada ${match.index + 1} de 2${match.index ? ` (total ${match.total(0) + s[0]} x ${match.total(1) + s[1]})` : ''} · piões ${st.tops[0]} x ${st.tops[1]}`;
  let line = '';
  if (phase === 'turn') line = renderer.xr.isPresenting ? 'Sua vez: pegue o pião na pista (botão lateral), jogue a mão para a frente girando o pulso e solte.' : 'Sua vez.';
  else if (phase === 'think') line = `${o.name} está mirando...`;
  return [head, line];
}
function updateHud(dt) {
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const vr = renderer.xr.isPresenting;
  const playing = app === 'play' && cur() && !panel.visible;
  if (!vr) {
    statusLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    if (playing) {
      const [a, b] = statusLines();
      const html = `<b>${a}</b>${b ? `<br>${b}` : ''}${msg && msg.text ? `<br><em>${msg.text}</em>` : ''}`;
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    }
    return;
  }
  hudEl.style.display = 'none';
  statusLabel.mesh.visible = playing;
  if (!playing) return;
  const [a, b] = statusLines();
  statusLabel.set([{ text: a, size: 0.34, color: '#ffd84a' }, { text: msg?.text || b, size: 0.3, bold: false, color: msg?.text ? '#ffe3a0' : '#f8f6ee' }]);
}
let boardKey = '';
function updateScoreboard() {
  let data;
  const st = cur();
  if (!st || app === 'menu') data = { names: ['Você', 'Adversário'], scores: [0, 0], round: '', footer: 'Escolha uma partida ou um desafio' };
  else if (mode === 'challenge') data = { names: ['Pontos', 'Piões'], scores: [scoreOf(st, PLAYER), st.tops[PLAYER]], round: `Desafio ${ch.i + 1}`, footer: ch.c.name };
  else data = { names: ['Você', opponent().name], scores: [match.total(0) + scoreOf(st, 0), match.total(1) + scoreOf(st, 1)], round: `Rodada ${match.index + 1}`, footer: `Piões: ${st.tops[0]} x ${st.tops[1]}` };
  const key = JSON.stringify(data);
  if (key !== boardKey) { boardKey = key; world.drawBoard(data); }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) { vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS'; vrBtn.disabled = true; return; }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) { vrBtn.textContent = 'Erro ao entrar em VR'; console.error(err); }
  };
}
setupVR();

// ---------- Laço ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) { placeRig(VR_STAND.x, VR_STAND.z); rigPlaced = true; if (panel.visible) placePanelVR(); }
  pollButtons();
  rig.updateMatrixWorld(true);
  if (app !== 'paused') for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
  if (app === 'play' && cur()) {
    if (phase === 'turn') { updateHeld(); updatePCDrag(); if (dev.autoplay) robotTurn(dt); }
    else if (phase === 'think') { thinkT += dt; pumpThinker(); if (thinkT >= opponent().think && thinker?.done) doLaunch(thinker.result); }
    else if ((phase === 'roundEnd' || phase === 'over') && dev.autoplay) {
      timerAuto -= dt;
      if (timerAuto <= 0) { if (phase === 'roundEnd') nextRound(); else if (mode === 'match') newMatch(oppIndex); }
    }
  }
  if (app !== 'paused') { updateSpinning(dt); updateEffects(); }
  if (padTop.visible) padTop.userData.spin.rotation.y += dt * 2;
  camera.getWorldPosition(_v);
  const look = spinning ? spinning.mesh.getWorldPosition(_v2) : phase === 'think' ? BOARD_MID : _v;
  world.avatar.update(dt, time, look);
  world.animate(dt, time);
  updatePCCamera(dt);
  updateHud(dt);
  updateRays();
  updateScoreboard();
  for (const e of ctrls) {
    e.mark.visible = vr && !!e.source && !e.source.hand;
    e.pinchDot.visible = vr && !!e.source?.hand && canAct();
    if (e.pinchDot.visible) grabPoint(e, e.pinchDot.position);
  }
  sfx.updateAmbience(dt);
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}
let robotT = 0;
function robotTurn(dt) {
  robotT += dt;
  if (!thinker) {
    robotT = 0;
    if (mode === 'challenge') thinker = ch.plan ? { done: true, kind: 'ch' } : { gen: bestChallengeGen(ch.c), done: false, result: null, kind: 'ch' };
    else thinker = { gen: chooseLaunchGen(cur(), PLAYER, ROBOT, random), done: false, result: null };
  }
  pumpThinker(14);
  if (!thinker.done || robotT < ROBOT.think) return;
  let l;
  if (thinker.kind === 'ch') { if (!ch.plan) ch.plan = thinker.result.launches.slice(); l = ch.plan.shift(); }
  else l = thinker.result;
  thinker = null;
  if (l) doLaunch(l);
}
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true | dev.advance(5) | dev.state() | dev.loadLevel(3) | dev.startMatch(2)
// dev.press('Desafios') aperta um botão do painel | dev.launch({ x: 0, angle: 0, speed: 1, spin: 0.8, dir: 1 })
// dev.forceWin() | dev.check() confere tela x regras | dev.boardScreen(x, z) posição na tela | dev.resetSave()
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; dropHeld(); if (phase === 'turn') thinker = null; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  press(label) { const b = panel.visible && panel.find(label); if (!b || !b.action) return false; b.action(); return true; },
  launch(l) { return doLaunch({ x: 0, angle: 0, speed: 1, spin: 0.8, dir: 1, ...l }); },
  forceWin() {
    const st = cur();
    if (!st || app !== 'play') return false;
    timers.length = 0;
    if (spinning) { spinning.mesh.parent?.remove(spinning.mesh); spinning = null; sfx.whirStop(); }
    st.over = true;
    // pinos seus nas casas de 8, 6 e 5
    for (const cell of [32, 27, 22]) { const p = st.pins.find(q => q.cell === cell); if (p) p.owner = PLAYER; else st.pins.push({ cell, owner: PLAYER }); }
    if (mode === 'challenge') { let k = 0; while (scoreOf(st, PLAYER) < ch.c.stars[2] && k < 35) { if (!st.pins.some(q => q.cell === k)) st.pins.push({ cell: k, owner: PLAYER }); k++; } }
    st.pins = st.pins.filter(p => p.owner === PLAYER || mode === 'challenge');
    phase = 'anim';
    syncPins(st);
    endOfRound();
    return this.state();
  },
  advance(sec, step = 1 / 60) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  boardScreen(x, z) {
    const p = toWorld(x, z).project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  check() {
    const st = cur();
    const errs = [];
    if (!st || spinning || effects.length || phase === 'anim') return errs;
    if (pinMeshes.size !== st.pins.length) errs.push(`pinos na tela ${pinMeshes.size}, nas regras ${st.pins.length}`);
    for (const p of st.pins) {
      const m = pinMeshes.get(p.cell);
      if (!m) { errs.push(`falta o pino da casa ${p.cell}`); continue; }
      if (m.userData.team !== p.owner) errs.push(`pino da casa ${p.cell} com a cor errada`);
      const cc = cellCenter(p.cell);
      if (m.position.distanceTo(toWorld(cc.x, cc.z)) > 1e-4) errs.push(`pino da casa ${p.cell} fora do lugar`);
    }
    return errs;
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    const st = cur();
    if (!st) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${ch.c.name}` : null,
      rodada: mode === 'match' ? match.index + 1 : null,
      vez: st.turn === PLAYER ? 'você' : 'computador',
      pontos: [scoreOf(st, 0), scoreOf(st, 1)], pioes: st.tops.slice(),
      pinos: st.pins.map(p => `${p.owner === PLAYER ? 'V' : 'A'}${p.cell}`).join(' '),
      total: mode === 'match' ? [match.total(0), match.total(1)] : null,
      mira: { ...aim },
      arrastando: !!dragging,
      previa: previewInfo ? previewText(previewInfo, previewInfo.launch, 0).slice(0, 2).join(' / ') : null,
      ultimoLance: lastLaunch,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && match.over ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      animando: (spinning ? 1 : 0) + effects.length + timers.length,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.piao = { dev, get match() { return match; }, get challenge() { return ch; }, save, camera, scene, renderer, world };

fitPC();
goMenu();
renderer.setAnimationLoop(frame);
