# Backlog (pós-lançamento)

Ideias de mecânicas novas, deliberadamente adiadas até depois do v1.0 sair do ar. Até lá, foco é só polimento/bugs.

## Tática de verdade

Hoje a força do time só depende de **quem** está escalado (posição + nota efetiva), nunca de **como** o time joga. Não existe formação, estilo (retranca/equilíbrio/ataque) nem marcação -- é a maior lacuna estrutural do jogo pra quem quer pensar como técnico, não só como diretor de futebol.

Desenho em duas camadas que se combinam:

1. **Formação** (quantos jogadores em cada linha): escolher entre esquemas clássicos -- 4-4-2, 4-3-3, 3-5-2, 5-3-2, 4-2-3-1 -- muda quantos jogadores ocupam cada posição na hora de montar os titulares. Hoje isso é fixo (sempre 2 ZAG, 1 LD, 1 LE, 2 VOL/MEI, 2 CA/PON, em `getAutoStarters`); um 4-3-3 jogaria com um atacante a mais e um meio a menos que o 4-4-2, por exemplo. Já muda o equilíbrio defesa/meio/ataque só pela escalação.

2. **Postura** (mais avançado / recuado): dentro da mesma formação, um seletor de 3 posições -- Retraído / Equilibrado / Ofensivo -- desloca uma fatia do peso que cada linha contribui (laterais/volantes "sobem" e pesam mais no ataque no modo Ofensivo, e vice-versa no Retraído). É o "4-4-2 mais avançado" vs. "4-4-2 recuado".

Trade-off real: jogar ofensivo aumenta o ataque mas expõe mais a defesa; jogar recuado é mais seguro mas com menos poder de fogo -- dá uma decisão tática de verdade contra cada adversário, não só "escale os melhores".

Tecnicamente: formação mexe em `getAutoStarters` (quem é escalado), postura mexe em `calculateTeamForces` (como cada um pesa) -- ambos em `src/utils/matchEngine.ts`. Dá pra construir em cima do que já existe, sem reescrever o motor do zero.

## Treino ativo de jovens

O potencial oculto (`rollYouthPotential`, src/data/database.ts) hoje só é *observado* com o tempo (jogos como titular) -- não existe nenhuma forma de acelerar ou direcionar o desenvolvimento de um jogador específico.

Ideia inicial: um sistema de treino (talvez ligado à Categoria de Base) que deixe o usuário focar o desenvolvimento de 1-2 jovens promissores por vez, acelerando o quanto da nota potencial é revelada/atingida.
