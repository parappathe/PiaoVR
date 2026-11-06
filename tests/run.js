// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { COLS, ROWS, CELL, HALF_W, LEN, LAUNCH_Z, TOP_R, V_MIN, V_MAX, DT, simulate, cellAt, cellCenter } from '../js/physics.js';
import { TOPS, VALUES, PLAYER, CPU, newRound, applyLaunch, preview, scoreOf, pinsFromText, Match } from '../js/rules.js';
import { OPPONENTS, ROBOT, rng, chooseLaunch, playRound } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, gradeLaunches, gradeState } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 200 s'); process.exit(1); }, 200000).unref();
const E = '.....';
const L = (o) => ({ x: 0, angle: 0, speed: 1, spin: 0.8, dir: 1, ...o });

console.log('Tabuleiro');
{
  ok(COLS * ROWS === 35 && VALUES.length === 35, '35 casas com valor');
  ok(VALUES[32] === 8 && VALUES[27] === 6 && VALUES[0] === 1, 'fundo no meio vale 8, perto vale 1');
  ok(cellAt(0, CELL * 6.5) === 32 && cellAt(-HALF_W + 0.001, 0.001) === 0 && cellAt(0, -0.01) === -1 && cellAt(0, LEN + 0.01) === -1, 'casa por posição (pista e canaleta ficam fora)');
  const c = cellCenter(17);
  ok(cellAt(c.x, c.z) === 17, 'centro da casa volta para a mesma casa');
}

console.log('Física');
{
  const a = simulate(L({ speed: 0.6 }), []), b = simulate(L({ speed: 1.0 }), []);
  ok(b.rest.z > a.rest.z && !a.rest.out, `mais força, mais longe (${a.rest.z.toFixed(2)} → ${b.rest.z.toFixed(2)} m)`);
  ok(simulate(L({ speed: 2.0 }), []).rest.out, 'forte demais: cai na canaleta');
  ok(simulate(L({ speed: V_MIN }), []).rest.cell === -1, 'fraco demais: fica na pista');
  const hi = simulate(L({ spin: 1, speed: 0.8 }), []), lo = simulate(L({ spin: 0.2, speed: 0.8 }), []);
  ok(hi.rest.z > lo.rest.z, 'mais giro desliza mais');
  const r = simulate(L({ dir: 1, speed: 1.1 }), []), l = simulate(L({ dir: -1, speed: 1.1 }), []);
  ok(r.rest.x > 0.01 && l.rest.x < -0.01 && Math.abs(r.rest.x + l.rest.x) < 1e-9, 'curva para o lado do giro (simétrica)');
  const w = simulate(L({ x: 0.15, angle: 0.8, speed: 1.2 }), []);
  ok(w.walls.length >= 1 && Math.abs(w.rest.x) <= HALF_W - TOP_R + 1e-9, 'rebate na parede e não sai pelo lado');
  const s1 = simulate(L({ x: 0.03, angle: 0.11, speed: 0.93, spin: 0.7, dir: -1 }), pinsFromText([E, E, E, '..O..', E, E, E]));
  const s2 = simulate(L({ x: 0.03, angle: 0.11, speed: 0.93, spin: 0.7, dir: -1 }), pinsFromText([E, E, E, '..O..', E, E, E]));
  ok(JSON.stringify(s1.rest) === JSON.stringify(s2.rest) && s1.path.length === s2.path.length, 'determinística (mesmo lançamento, mesmo resultado)');
  ok(DT === 1 / 120, 'passo fixo de 1/120 s');
}

console.log('Regras');
{
  // acertar pino do outro: vira seu; acertar o seu: sai
  const st = newRound({ starter: PLAYER, pins: pinsFromText([E, E, E, E, E, '..O..', E]) });
  let hitL = null;
  for (let s = 0.5; s < 1.4 && !hitL; s += 0.02) { const x = applyLaunch(st, L({ speed: s })); if (x.info.converted.length) hitL = x; }
  ok(hitL && hitL.st.pins.find(p => p.cell === 7).owner === PLAYER, 'pino do outro que o pião acerta vira seu');
  const own = newRound({ starter: PLAYER, pins: pinsFromText([E, E, E, E, E, '..X..', E]) });
  let ko = null;
  for (let s = 0.5; s < 1.4 && !ko; s += 0.02) { const x = applyLaunch(own, L({ speed: s })); if (x.info.knocked.length) ko = x; }
  ok(ko && ko.info.knocked[0].cell === 7 && ko.st.pins.length === (ko.info.placed ? 1 : 0), 'pino seu que o pião acerta sai');
  // onde para nasce um pino
  const e0 = newRound({ starter: PLAYER });
  const x = applyLaunch(e0, L({ speed: 0.9 }));
  ok(x.info.placed && x.st.pins.length === 1 && x.st.pins[0].cell === x.info.rest.cell && scoreOf(x.st, PLAYER) === VALUES[x.info.rest.cell], 'onde o pião para nasce um pino seu, que vale a casa');
  ok(applyLaunch(e0, L({ speed: 2 })).st.pins.length === 0, 'caiu na canaleta: não vale');
  ok(x.st.turn === CPU && x.st.tops[0] === TOPS - 1, 'passa a vez e gasta o pião');
  const pv = preview(e0, L({ speed: 0.9 }));
  ok(pv.rest.cell === x.info.rest.cell && e0.pins.length === 0, 'prévia igual ao lance e não mexe no jogo');
  let s = newRound();
  while (!s.over) s = applyLaunch(s, L({ speed: 0.7 + s.moves * 0.05 })).st;
  ok(s.moves === 2 * TOPS, `rodada acaba com os ${2 * TOPS} piões`);
  let threw = false;
  try { applyLaunch(s, L()); } catch { threw = true; }
  ok(threw, 'não deixa lançar depois do fim');
  const m = new Match({ starter: PLAYER });
  const starters = [];
  while (!m.over) { starters.push(m.round.starter); while (!m.roundOver) m.play(L({ speed: 0.8 })); m.closeRound(); if (!m.over) m.nextRound(); }
  ok(starters.join() === '0,1', 'partida: 2 rodadas, cada um começa uma');
}

console.log('IA');
{
  const r = rng(7);
  const st = newRound({ starter: CPU, pins: pinsFromText([E, '..X..', E, E, E, E, E]), tops: [3, 3] });
  for (const o of OPPONENTS) {
    const l = chooseLaunch(st, CPU, { ...o, angleErr: 0, speedErr: 0 }, r);
    const x = applyLaunch(st, l);
    ok(x.info.converted.length === 1 || scoreOf(x.st, CPU) >= 6, `${o.name} sem tremer vira o pino da casa 6 ou pontua bem (${scoreOf(x.st, CPU)})`);
  }
  let worst = 0;
  for (const o of OPPONENTS) {
    let s = newRound({ starter: CPU });
    while (!s.over) { const t0 = performance.now(); const l = chooseLaunch(s, s.turn, o, r); worst = Math.max(worst, performance.now() - t0); s = applyLaunch(s, l).st; }
  }
  ok(worst < 100, `IA pensa rápido (pior lance: ${worst.toFixed(0)} ms)`);
  // tremor: o arriscado erra mais que o mestre
  const spread = (o) => { const xs = []; for (let k = 0; k < 20; k++) xs.push(chooseLaunch(newRound({ starter: CPU }), CPU, o, r).angle); const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  ok(spread(OPPONENTS[0]) > spread(OPPONENTS[2]), 'a mão do arriscado treme mais que a do mestre');
}

console.log('IA contra IA');
{
  const r = rng(2026);
  const duel = (a, b, G = 6) => {
    let wa = 0, wb = 0; const lines = [];
    for (let g = 0; g < G; g++) {
      let ta = 0, tb = 0;
      for (const starter of [0, 1]) { const st = playRound(newRound({ starter }), a, b, r); ta += scoreOf(st, 0); tb += scoreOf(st, 1); }
      if (ta > tb) wa++; else if (tb > ta) wb++;
      lines.push(`${ta}x${tb}`);
    }
    console.log(`  ${a.name} ${wa} x ${wb} ${b.name} em partidas (${lines.join(' ')})`);
    return wa;
  };
  ok(duel(OPPONENTS[2], OPPONENTS[1]) > 3, 'mestre vence a cautelosa na maioria das partidas');
  ok(duel(OPPONENTS[2], OPPONENTS[0]) > 3, 'mestre vence o arriscado na maioria das partidas');
  ok(duel(OPPONENTS[1], OPPONENTS[0]) > 3, 'cautelosa vence o arriscado na maioria das partidas');
  let done = 0;
  for (const o of OPPONENTS) {
    const m = new Match({ starter: CPU });
    while (!m.over) { while (!m.roundOver) m.play(chooseLaunch(m.round, m.round.turn, m.round.turn === CPU ? o : ROBOT, r)); m.closeRound(); if (!m.over) m.nextRound(); }
    if (m.winner !== null) done++;
  }
  ok(done === 3, 'partidas completas contra os 3 adversários terminam');
}

console.log('Desafios');
{
  ok(CHALLENGES.length >= 8 && CHALLENGES.length <= 10, `${CHALLENGES.length} desafios`);
  for (const [i, c] of CHALLENGES.entries()) {
    ok(c.rows.length === ROWS && c.rows.every(r => r.length === COLS && /^[.XO]+$/.test(r)) && c.desc && c.tops >= 1 && c.tops <= 3, `desafio ${i + 1}: mesa válida, 1 a 3 piões`);
    ok(c.stars.every((s, k) => !k || s > c.stars[k - 1]), `desafio ${i + 1}: metas crescentes`);
    const t0 = performance.now();
    const best = solveChallenge(c);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  ${best.result} pontos (meta ${c.stars.join('/')})  (${(performance.now() - t0).toFixed(0)} ms)`);
    ok(best.stars === 3 && gradeLaunches(c, best.launches) === 3, `robô tira 3 estrelas no desafio ${i + 1}`);
    ok(gradeLaunches(c, Array(c.tops).fill(L({ speed: 0.9, spin: 0.85 }))) < 3, `desafio ${i + 1}: lance reto e médio não dá 3 estrelas`);
  }
  ok(gradeState(CHALLENGES[0], setupChallenge(CHALLENGES[0])) === 0, 'sem jogar: 0 estrela');
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try { for (const [cond, msg] of await smoke()) ok(cond, msg); } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
