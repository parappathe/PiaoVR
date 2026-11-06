# PiaoVR

Pião: jogo de habilidade com regras de tabuleiro em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. No deque de um quiosque de praia numa tarde de sol (mar, areia, coqueiros, guarda-sol,
balcão com cocos), uma mesa de pião tem a pista de lançamento na sua frente, 35 casas com valores e uma
canaleta no fundo. Você pega o pião, joga a mão para a frente girando o pulso e solta o botão: ele
desliza com física simples, rebate nas paredes, vira os pinos do adversário que acertar e, onde parar,
nasce um pino seu. Partida contra 3 adversários com personalidade e 10 desafios com 3 estrelas. Também
joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** o endereço publicado será `https://parappathe.github.io/PiaoVR/` (abrir no navegador do
óculos e apertar "Entrar em VR"). Publicar é com o Eduardo (`python publicar.py PiaoVR` na pasta
`C:\claude code`).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8865` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar o pião | Botão lateral (aperto) com a mão a até 10 cm do pião que espera na pista | Não precisa |
| Lançar | Jogar a mão para a frente e soltar o botão no meio do movimento, em cima da pista. A velocidade e a direção da mão nos últimos 80 ms dão a força (70% da velocidade da mão) e a direção; o giro do pulso nesse tempo dá o giro (mais giro desliza mais e curva mais) | Apertar na pista (o pião vai para aquele lugar), puxar o mouse para baixo como estilingue e soltar: quanto mais puxa, mais força; puxar para um lado manda para o outro |
| Curva e giro | O sentido do giro do pulso escolhe para que lado curva | Q (curva para a esquerda), E (para a direita), 1, 2, 3 (giro fraco, médio, forte) |
| Lugar na pista | Onde a mão solta | Clique na pista ou setas ←/→ |
| Prévia | Enquanto segura e mexe a mão: pontinhos com o caminho previsto, anel onde ele para, anéis nos pinos que vai acertar (verde vira, vermelho é seu e cai) e a placa "Força 46% · giro 85% para a direita / vira 1, para na casa 5 (+9)" | Enquanto puxa: seta, os mesmos pontinhos e a caixa embaixo da tela |
| Só com as mãos | Pinça perto do pião pega; soltar a pinça no movimento lança | |
| Câmera | Você fica em pé de frente para a pista | A/D, W/S ou arrastar com o botão direito; rodinha: zoom |
| Pausa | B ou Y | Esc ou P (Esc enquanto mira cancela) |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

O adversário fica em pé do outro lado da mesa, acompanha o pião com o olhar e reage. Os piões que ainda
faltam ficam numa prateleirinha ao lado da mesa (os seus à direita, perto de você). Os piões do
adversário saem da mesma pista (ele lança do lado de lá com uma fieira comprida: no jogo o pião dele
aparece na pista e é lançado sozinho).

### Regras

- Mesa: pista de lançamento (12 cm) na sua frente, 7 fileiras x 5 colunas de casas de 11 cm e a canaleta
  no fundo. Valores das casas, de perto para longe: 1 1 1 1 1 / 1 2 2 2 1 / 2 2 3 2 2 / 2 3 4 3 2 /
  3 3 5 3 3 / 2 4 6 4 2 / 3 3 8 3 3.
- Cada um tem 5 piões por rodada, alternando. O pião desliza, freia (atrito menor com mais giro), curva
  para o lado do giro e rebate nas paredes dos lados e de trás. Passou do fundo, cai na canaleta.
- Pino do **outro** que o pião acertar **vira seu** (troca de cor e fica na casa). Pino **seu** que ele
  acertar **sai**. Cada pino só é acertado uma vez por lance; o pião rebate nele e perde força.
- Onde o pião parar, se a casa estiver livre, nasce um pino seu. Parou na pista, numa casa ocupada ou
  caiu na canaleta: não nasce nada.
- No fim da rodada cada pino vale o número da casa dele. Partida: 2 rodadas, cada um começa uma (sorteio
  na primeira); soma.
- Adversários (em `js/ai.js`, em ordem de dificuldade): **Tonico Rodopio** (arriscado: lança forte para
  virar os seus pinos e a mão treme bastante), **Dona Fiandeira** (cautelosa: mira casa livre e boa,
  foge dos próprios pinos, mão firme), **Mestre Fieira** (pensa à frente: escolhe lances que dão certo
  mesmo errando um pouco e pensa na sua melhor resposta; mão quase sem tremor). Os três testam
  lançamentos de verdade na mesma física do jogo; o que muda é o que procuram e o tremor da mão.
- Desafios (em `js/challenges.js`, só você lança, mesa já arrumada, estrelas por pontos no fim): 1
  Primeiro lance, 2 Vira o pino, 3 Dois de uma vez, 4 Cuidado com o seu, 5 Tabela, 6 Curva, 7 Corredor,
  8 Colheita, 9 Muralha, 10 Grande final. As metas foram postas em 25%, 50% e 75% do ganho que o robô
  (mira perfeita) consegue. Passar um (1 estrela) libera o próximo.
- Progresso salvo no navegador (localStorage, chave `piaovr.v1`): vitórias e partidas por adversário,
  estrelas por desafio, som, prévia e FPS.

## Como testar

- `npm test` (ou `node tests/run.js`): tabuleiro (35 casas, valores, casa por posição), física (mais
  força vai mais longe, forte demais cai na canaleta, fraco fica na pista, mais giro desliza mais, curva
  simétrica para o lado do giro, rebate na parede, determinística, passo fixo de 1/120 s), regras (vira
  o pino do outro, o seu sai, nasce pino onde para, canaleta não vale, prévia igual ao lance, rodada de
  10 piões, partida de 2 rodadas), IA (sem tremer vira o pino da casa 6, pior lance abaixo de 100 ms, o
  arriscado treme mais que o mestre), IA contra IA em 6 partidas de 2 rodadas por dupla (mostra
  placares; a mais difícil vence a maioria), partidas completas contra os 3, desafios (robô tira 3
  estrelas, lance reto e médio não dá 3) e fumaça do `main.js`. Tem que terminar com "Tudo certo"; sai
  com código 1 se algo falhar (e sozinho se passar de 200 s). Não toca som. Leva uns 45 s (o robô dos
  desafios testa dezenas de milhares de lances).
- A fumaça (`tests/smoke.js` + `tests/three-stub.js`) carrega o jogo no Node com navegador e WebGL de
  mentira e joga **pelo mesmo caminho do jogo**: botões do painel (Partida → Dona Fiandeira, Menu
  principal → Desafios → 1 → Próximo...), aperta na pista e puxa o mouse para baixo (dentro da tela),
  confere a prévia, solta, confere que força e direção vieram do arraste e que o resultado na tela é o
  mesmo da física das regras, deixa o robô terminar a partida conferindo a cada meio segundo que os
  pinos na tela batem com as regras (`dev.check()`), resolve os 10 desafios dentro do jogo, força
  vitória e pausa. Precisa do Node 22.15 ou mais novo.
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()` (pontos, piões, pinos,
  mira, prévia, último lance), `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.press('Desafios')`,
  `dev.launch({ x: 0, angle: 0.1, speed: 1, spin: 0.8, dir: 1 })`, `dev.forceWin()`, `dev.check()`,
  `dev.boardScreen(x, z)` (posição na tela de um ponto da mesa), `dev.resetSave()`. `window.piao` tem
  `match`, `challenge`, `save`, `camera`, `scene`, `renderer`, `world`.
- **Só dá para testar no óculos:** a leitura do lançamento pela mão (velocidade dos últimos 80 ms, fator
  de 70%, mínimo de 0,25 m/s), a leitura do giro do pulso e o sentido da curva, soltar fora da pista,
  pinça, alcance, placas, vibração, rastreamento de mãos e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar, caixa da prévia e dica do PC |
| `js/physics.js` | Mesa (casas, pista, canaleta), física do pião em 2D com passo fixo (`simulate`: atrito, giro, curva, paredes, pinos), casa por posição. Sem navegador |
| `js/rules.js` | Valores, pinos, `applyLaunch` (vira, derruba, nasce pino), `preview`, pontos, `Match`, mesa em texto. Sem navegador |
| `js/ai.js` | Adversários, robô, grade de lançamentos, avaliação, resposta do outro (mestre), tremor da mão, escolha em passos (`chooseLaunchGen`), `playRound`. Sem navegador |
| `js/challenges.js` | Os 10 desafios (mesa, piões, metas) e o robô que resolve (grade fina e um pião à frente). Sem navegador |
| `js/main.js` | Liga tudo: render, VR (pegar o pião, histórico da mão, lançamento pela velocidade e giro), mouse/teclado (estilingue), prévia, animação do pião (gira, bambeia, tomba) e dos pinos (vira pulando, cai voando, nasce), turnos, menus, HUD, placar, `dev` |
| `js/scene.js` | Praia (mar, areia, céu, coqueiros, guarda-sol, quiosque, balcão com cocos), mesa de pião (tampo pintado com valores, paredes, canaleta), pião e pinos, prateleiras, pontinhos da prévia, seta, adversário, placa do placar |
| `js/avatar.js` | Boneco do adversário |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: zumbido do pião que acompanha o giro e a velocidade, batida no pino, pino virando, parede, tombo, ondas e gaivotas, fanfarras |
| `js/save.js` | Progresso e opções salvos |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8865, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: na física, x = 0 no meio da mesa (positivo à direita) e z = 0 na beira de perto das casas,
crescendo para longe (a pista vai de −0,12 a 0, com a linha de lançamento em −0,06). No mundo isso vira
(x, 0,87, −0,22 − z). Tampo a 0,87 m. No VR a cabeça fica em x = 0, z = 0,20.

## Regras e convenções do projeto

- `physics.js`, `rules.js`, `ai.js` e `challenges.js` não podem usar navegador nem Three.js: os testes
  rodam no Node.
- A animação só toca o caminho que a física calculou (o mesmo da prévia e da IA): mexeu em `PHYS` ou na
  simulação, rodar `npm test` e recalibrar as metas dos desafios (75% do que o robô faz).
- A IA no navegador pensa em pedaços (gerador) e fica abaixo de 100 ms por lance.
- Testes nunca tocam som.
- Desempenho no Quest: uma luz com sombra (o sol, mapa 1024 em volta da mesa), postes, pernas da mesa,
  cocos e pontinhos da prévia em `InstancedMesh`, geometrias e materiais de pião e pinos compartilhados.

## Decisões

- Pino do outro acertado vira seu e o seu acertado sai: acertar vale muito (troca de dono), mas jogar
  forte no meio dos seus é arriscado.
- Física própria em 2D com passo fixo em vez de motor de física: a prévia, a IA e o jogo dão o mesmo
  resultado e os desafios são reproduzíveis.
- A dificuldade dos adversários vem do tremor da mão (erro de ângulo e força) e do que cada um procura;
  todos enxergam a física de verdade.
- No PC o estilingue é pela tela (puxar o mouse para baixo), não pelo tampo: puxando pelo tampo o mouse
  saía da tela antes de dar força.
- Lançamento no VR pela velocidade da mão nos últimos 80 ms (70% dela) ao soltar o botão lateral; abaixo
  de 0,25 m/s ou para trás não lança (o pião volta para a pista).
- Os dois lançam da mesma pista: espelhar a mesa para o adversário dobraria a física e os testes.
- Porta do servidor local 8865.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: o mais incerto é a leitura do lançamento pela mão (o fator de 70% e o
  mínimo podem precisar de ajuste) e do giro do pulso (o sentido da curva sai do eixo da rotação do
  controle e pode estar invertido). Também pinça, alcance, placas, vibração, rastreamento de mãos e FPS.
- A dificuldade foi calibrada com IA contra IA; contra gente o Mestre pode estar difícil demais.
- `npm test` demora uns 45 s por causa do robô dos desafios.
- No PC, com a mesa grande na câmera padrão, do adversário aparece só o corpo no alto.
