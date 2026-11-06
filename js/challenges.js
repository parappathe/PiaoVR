// Desafios do Pião: só você lança, com poucos piões, numa mesa já arrumada. Pinos laranja (do outro)
// que o seu pião acertar viram seus; pinos seus que ele acertar saem. As estrelas pedem pontos (soma
// das casas dos seus pinos no fim). Mesa em texto: 7 linhas, a primeira é a fileira de longe;
// X = seu pino, O = laranja. Sem navegador.
import { newRound, applyLaunch, scoreOf, pinsFromText, PLAYER } from './rules.js';
import { candidates } from './ai.js';

const E = '.....';
export const CHALLENGES = [
  { name: 'Primeiro lance', tops: 1, rows: [E, E, E, E, E, E, E], stars: [2, 4, 6],
    desc: 'Lance com força na medida: as casas do meio, lá no fundo, valem 6 e 8.' },
  { name: 'Vira o pino', tops: 1, rows: [E, '..O..', E, E, E, E, E], stars: [4, 7, 11],
    desc: 'Acerte o pino laranja: ele vira seu. E onde o pião parar nasce outro.' },
  { name: 'Dois de uma vez', tops: 1, rows: [E, E, '.O.O.', E, E, E, E], stars: [3, 6, 8],
    desc: 'Dois laranjas lado a lado. O pião rebate num e pode pegar o outro.' },
  { name: 'Cuidado com o seu', tops: 1, rows: [E, '..O..', E, '..X..', E, E, E], stars: [8, 11, 15],
    desc: 'O seu pino está no caminho: se o pião bater nele, ele sai. Desvie.' },
  { name: 'Tabela', tops: 1, rows: ['O....', E, '.XXX.', E, E, E, E], stars: [13, 15, 17],
    desc: 'Use a parede do lado para contornar os seus pinos.' },
  { name: 'Curva', tops: 2, rows: [E, '.O.O.', '..X..', E, E, E, E], stars: [11, 16, 22],
    desc: 'O giro do pulso faz o pião curvar. Dois piões, dois laranjas.' },
  { name: 'Corredor', tops: 2, rows: ['..O..', 'X...X', 'X...X', E, E, E, E], stars: [15, 20, 24],
    desc: 'Passe pelo meio sem tocar nos seus pinos.' },
  { name: 'Colheita', tops: 2, rows: [E, 'O...O', E, '.O.O.', E, E, E], stars: [5, 10, 15],
    desc: 'Quatro laranjas espalhados. Quantos você vira com dois piões?' },
  { name: 'Muralha', tops: 3, rows: ['.OOO.', E, 'XX.XX', E, E, E, E], stars: [19, 26, 33],
    desc: 'Uma muralha sua com uma brecha só. Três piões para passar.' },
  { name: 'Grande final', tops: 3, rows: ['O.O.O', '.O.O.', E, '..X..', E, E, E], stars: [13, 21, 30],
    desc: 'O fundo cheio de laranjas. Três piões para virar tudo.' },
];

export function setupChallenge(c) { return newRound({ starter: PLAYER, pins: pinsFromText(c.rows), tops: [c.tops, 0], solo: true }); }
export const resultOf = (c, st) => scoreOf(st, PLAYER);
export function gradeState(c, st) { if (!st.over) return 0; const v = resultOf(c, st); return c.stars.filter(s => v >= s).length; }
export function goalText(c) { return `★ ${c.stars[0]} pontos   ★★ ${c.stars[1]}   ★★★ ${c.stars[2]}`; }
export function gradeLaunches(c, launches) {
  let st = setupChallenge(c);
  for (const l of launches) { if (st.over) break; st = applyLaunch(st, l).st; }
  return gradeState(c, st);
}

// Robô que resolve: para cada pião testa a grade fina de lançamentos e fica com o que dá mais pontos
// (olhando também o pião seguinte, se houver). Gerador: para a cada pedaço de lançamentos testados.
const FINE = candidates(true);
const COARSE = candidates(false);
export function* bestChallengeGen(c) {
  let st = setupChallenge(c);
  const launches = [];
  let n = 0;
  while (!st.over) {
    const scored = [];
    for (const l of FINE) {
      scored.push({ l, v: scoreOf(applyLaunch(st, l).st, PLAYER) });
      if (++n % 500 === 0) yield;
    }
    scored.sort((p, q) => q.v - p.v);
    let best = scored[0];
    if (st.tops[PLAYER] > 1) {
      // as 12 melhores: olha o pião seguinte (grade grossa) para não estragar a próxima jogada
      let bv = -Infinity;
      for (const s of scored.slice(0, 12)) {
        const a = applyLaunch(st, s.l).st;
        let nb = s.v;
        for (const l2 of COARSE) { nb = Math.max(nb, scoreOf(applyLaunch(a, l2).st, PLAYER)); if (++n % 500 === 0) yield; }
        if (nb + s.v * 0.01 > bv) { bv = nb + s.v * 0.01; best = s; }
      }
    }
    launches.push(best.l);
    st = applyLaunch(st, best.l).st;
    yield;
  }
  return { stars: gradeState(c, st), launches, result: resultOf(c, st) };
}
export function solveChallenge(c) {
  const g = bestChallengeGen(c);
  let x;
  do { x = g.next(); } while (!x.done);
  return x.value;
}
