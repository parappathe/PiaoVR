// Regras do Pião. Sem navegador e sem Three.js (os testes rodam no Node).
//
// Cada um lança o seu pião da pista de lançamento. Ele desliza girando, rebate nas paredes e nos pinos e
// para numa casa:
//   - pino do OUTRO que o pião acertar vira SEU (troca de cor e fica na casa);
//   - pino SEU que o pião acertar cai e sai do tabuleiro;
//   - onde o pião parar, se a casa estiver livre, nasce um pino seu. Parou na pista ou caiu na canaleta
//     do fundo: não vale.
// No fim da rodada cada pino vale o número da casa dele. 5 piões para cada um, 2 rodadas.
import { COLS, ROWS, simulate } from './physics.js';

export const PLAYER = 0, CPU = 1;
export const TOPS = 5;
// valor das casas: fileira 0 (perto) até 6 (longe), coluna 0 (esquerda) até 4
export const VALUES = [
  1, 1, 1, 1, 1,
  1, 2, 2, 2, 1,
  2, 2, 3, 2, 2,
  2, 3, 4, 3, 2,
  3, 3, 5, 3, 3,
  2, 4, 6, 4, 2,
  3, 3, 8, 3, 3,
];
export const CELLS = COLS * ROWS;

export function newRound({ starter = PLAYER, pins = [], tops = [TOPS, TOPS], solo = false } = {}) {
  return { pins: pins.map(p => ({ ...p })), tops: tops.slice(), turn: starter, starter, moves: 0, over: false, solo, converted: [0, 0], knocked: [0, 0] };
}
export const cloneState = (st) => ({ ...st, pins: st.pins.map(p => ({ ...p })), tops: st.tops.slice(), converted: st.converted.slice(), knocked: st.knocked.slice() });
export const scoreOf = (st, who) => st.pins.reduce((s, p) => s + (p.owner === who ? VALUES[p.cell] : 0), 0);
export const pinAt = (st, cell) => st.pins.find(p => p.cell === cell);

export function applyLaunch(st0, launch) {
  if (st0.over) throw new Error('rodada acabou');
  const who = st0.turn;
  if (st0.tops[who] <= 0) throw new Error('sem pião');
  const st = cloneState(st0);
  const sim = simulate(launch, st.pins);
  const converted = [], knocked = [];
  for (const h of sim.hits) {
    const p = st.pins[h.index];
    if (p.owner === who) { knocked.push({ ...p }); p.gone = true; }
    else { converted.push({ ...p }); p.owner = who; }
  }
  st.pins = st.pins.filter(p => !p.gone);
  let placed = null;
  if (sim.rest.cell >= 0 && !pinAt(st, sim.rest.cell)) { placed = { cell: sim.rest.cell, owner: who }; st.pins.push(placed); }
  st.converted[who] += converted.length;
  st.knocked[who] += knocked.length;
  st.tops[who]--;
  st.moves++;
  if (st.solo) st.over = st.tops[PLAYER] <= 0;
  else {
    st.turn = 1 - who;
    if (st.tops[0] <= 0 && st.tops[1] <= 0) st.over = true;
    else if (st.tops[st.turn] <= 0) st.turn = who;
  }
  return { st, info: { by: who, launch, sim, converted, knocked, placed, rest: sim.rest } };
}
// o que aconteceria (sem mexer no jogo)
export function preview(st, launch) { return st.over ? null : applyLaunch(st, launch).info; }

export class Match {
  constructor({ starter = PLAYER } = {}) { this.firstStarter = starter; this.results = []; this.index = 0; this.round = newRound({ starter }); }
  get roundOver() { return this.round.over; }
  play(l) { const r = applyLaunch(this.round, l); this.round = r.st; return r.info; }
  closeRound() { this.results.push({ score: [scoreOf(this.round, 0), scoreOf(this.round, 1)] }); }
  nextRound() { this.index++; this.round = newRound({ starter: 1 - this.firstStarter }); }
  get over() { return this.results.length >= 2; }
  total(who) { return this.results.reduce((s, r) => s + r.score[who], 0); }
  get winner() { if (!this.over) return null; const a = this.total(0), b = this.total(1); return a > b ? PLAYER : b > a ? CPU : -1; }
}

// Pinos em texto: 7 linhas (fileira 6 = a de longe primeiro), 5 letras. X = seu, O = do outro.
export function pinsFromText(rows) {
  const pins = [];
  rows.forEach((row, k) => { const r = ROWS - 1 - k; [...row].forEach((ch, c) => { if (ch === 'X' || ch === 'O') pins.push({ cell: r * COLS + c, owner: ch === 'X' ? PLAYER : CPU }); }); });
  return pins;
}
