// Adversários do Pião. A física é a mesma do jogo, então a IA testa lançamentos de verdade; o que
// separa os três é o que cada um procura e o quanto a mão treme (erro no ângulo e na força).
import { HALF_W, TOP_R } from './physics.js';
import { applyLaunch, scoreOf } from './rules.js';

export const OPPONENTS = [
  {
    id: 'arriscado', name: 'Tonico Rodopio', title: 'Arriscado',
    desc: 'Lança forte para virar os seus pinos e a mão treme bastante',
    style: 'risky', convert: 1.6, ownLoss: 0.6, angleErr: 0.08, speedErr: 0.09, robust: 0, color: 0xe05a2a, think: 0.9,
  },
  {
    id: 'cautelosa', name: 'Dona Fiandeira', title: 'Cautelosa',
    desc: 'Mira casa livre e boa, foge dos próprios pinos',
    style: 'careful', convert: 0.9, ownLoss: 1.6, angleErr: 0.045, speedErr: 0.05, robust: 0, color: 0x3a9a8a, think: 1.1,
  },
  {
    id: 'mestre', name: 'Mestre Fieira', title: 'Pensa à frente',
    desc: 'Escolhe lances garantidos e pensa na sua resposta',
    style: 'master', convert: 1.1, ownLoss: 1.2, angleErr: 0.02, speedErr: 0.022, robust: 4, reply: 0.7, color: 0x5a4ab8, think: 1.5,
  },
];
export const ROBOT = { id: 'robo', name: 'Robô', style: 'master', convert: 1.1, ownLoss: 1.2, angleErr: 0, speedErr: 0, robust: 0, think: 0.35 };

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

// Lançamentos candidatos (grade). fine = grade mais fina (robô dos desafios)
export function candidates(fine = false) {
  const out = [];
  const xs = fine ? [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2] : [-0.2, -0.1, 0, 0.1, 0.2];
  const nA = fine ? 25 : 15, nS = fine ? 36 : 18;
  for (const x of xs) for (let a = 0; a < nA; a++) for (let s = 0; s < nS; s++) for (const spin of fine ? [0.3, 0.9] : [0.85]) for (const dir of [1, -1]) {
    out.push({ x: Math.max(-HALF_W + TOP_R, Math.min(HALF_W - TOP_R, x)), angle: -0.5 + a / (nA - 1), speed: 0.4 + s * (1.1 / (nS - 1)), spin, dir });
  }
  return out;
}
const CANDS = candidates(false);
// grade pequena para imaginar a resposta do outro
const REPLY = [];
for (const x of [-0.15, 0, 0.15]) for (let a = 0; a < 6; a++) for (let sp = 0; sp < 7; sp++) REPLY.push({ x, angle: -0.45 + a * 0.18, speed: 0.45 + sp * 0.15, spin: 0.85, dir: a % 2 ? 1 : -1 });

// Valor de um lançamento para "who": o que ele ganha, o que tira do outro (pesado pelo gosto de virar
// pinos) e quanto perde dos próprios pinos (pesado pelo medo de perder)
import { VALUES } from './rules.js';
function judge(st, launch, who, o) {
  const r = applyLaunch(st, launch);
  const a = r.st, op = 1 - who;
  const gain = scoreOf(a, who) - scoreOf(st, who), loss = scoreOf(st, op) - scoreOf(a, op);
  const ownLost = r.info.knocked.reduce((s, p) => s + VALUES[p.cell], 0);
  let v = gain + loss * o.convert - ownLost * (o.ownLoss - 1);
  if (!r.info.placed) v -= 0.3;
  return v;
}

// Escolha em passos (gerador). Devolve o lançamento já com o "tremor" da mão do adversário.
export function* chooseLaunchGen(st, who, o, rand = Math.random) {
  const scored = [];
  let n = 0;
  for (const c of CANDS) {
    scored.push({ c, v: judge(st, c, who, o) });
    if (++n % 150 === 0) yield;
  }
  scored.sort((a, b) => b.v - a.v);
  let best = scored[0];
  if (o.robust) {
    // o mestre testa as 25 melhores com pequenos erros e fica com a mais garantida
    let bv = -Infinity;
    for (const s of scored.slice(0, o.reply ? 8 : 25)) {
      let sum = s.v;
      for (const [da, ds] of [[0.02, 0], [-0.02, 0], [0, 0.025], [0, -0.025]].slice(0, o.robust)) sum += judge(st, { ...s.c, angle: s.c.angle + da, speed: s.c.speed + ds }, who, o);
      let avg = sum / (o.robust + 1);
      if (o.reply) {
        // a melhor resposta do outro depois desse lance (grade pequena, sem tremor)
        const a = applyLaunch(st, s.c).st;
        if (!a.over && a.turn !== who) {
          let rb = 0;
          for (const r of REPLY) rb = Math.max(rb, judge(a, r, a.turn, o));
          avg -= rb * o.reply;
        }
      }
      if (avg > bv) { bv = avg; best = s; }
      yield;
    }
  }
  const c = best.c;
  return { ...c, angle: c.angle + (o.angleErr ? gauss(rand) * o.angleErr : 0), speed: Math.max(0.3, c.speed * (1 + (o.speedErr ? gauss(rand) * o.speedErr : 0))) };
}
export function chooseLaunch(st, who, o, rand) {
  const g = chooseLaunchGen(st, who, o, rand);
  let x;
  do { x = g.next(); } while (!x.done);
  return x.value;
}
export function playRound(st, a, b, rand) {
  let n = 0;
  while (!st.over) { st = applyLaunch(st, chooseLaunch(st, st.turn, st.turn === 0 ? a : b, rand)).st; if (++n > 30) throw new Error('rodada não terminou'); }
  return st;
}
