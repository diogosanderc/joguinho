# Backlog (pós-lançamento)

Ideias de mecânicas novas, deliberadamente adiadas até depois do v1.0 sair do ar. Até lá, foco é só polimento/bugs.

## Tática de verdade

Hoje a força do time só depende de **quem** está escalado (posição + nota efetiva), nunca de **como** o time joga. Não existe formação, estilo (retranca/equilíbrio/ataque) nem marcação -- é a maior lacuna estrutural do jogo pra quem quer pensar como técnico, não só como diretor de futebol.

Ideia inicial: um seletor de estilo de jogo (ex: Defensivo / Equilibrado / Ofensivo) que ajusta os pesos de defesa/meio/ataque em `calculateTeamForces` (src/utils/matchEngine.ts), com trade-off real -- jogar ofensivo contra um favorito aumenta a força de ataque mas expõe a defesa, por exemplo.

## Treino ativo de jovens

O potencial oculto (`rollYouthPotential`, src/data/database.ts) hoje só é *observado* com o tempo (jogos como titular) -- não existe nenhuma forma de acelerar ou direcionar o desenvolvimento de um jogador específico.

Ideia inicial: um sistema de treino (talvez ligado à Categoria de Base) que deixe o usuário focar o desenvolvimento de 1-2 jovens promissores por vez, acelerando o quanto da nota potencial é revelada/atingida.
