# Plano: pacote de recursos novos

Checklist para implementar os recursos pedidos em etapas. Cada etapa deixa o jogo funcionando.
Marque `[x]` quando a etapa estiver pronta e testada no navegador. Se a sessão acabar no meio,
continue pela primeira etapa sem `[x]` (as notas de cada uma dizem onde mexer).

Regras que valem para todas as etapas:
- Tudo continua sem build, sem arquivos de arte ou som (desenho e som gerados por código).
- O solo não pode quebrar o save antigo: campos novos do save ganham valor padrão em `loadSave()` (main.js).
- O servidor (`server/`) importa `js/util.js`, `js/city.js`, `js/rides.js` e `js/carcare.js`. Mudou um desses? Rode `npm test` em `server/`.
- Os tiles da cidade entram no hash da sala (`cityHash`). Mudou a geração da cidade, o servidor precisa ser publicado de novo.
- Dinheiro no multiplayer só muda pela sala: cobrança obrigatória via `Care.charge(valor, tipo)` com o tipo em `OBRIGATORIOS` (server/src/regras.js); compra via `shopItem(..., kinds)` com o item em `SHOP_MAX` (carcare.js).

## Etapas

- [x] **1. Escolha do veículo: Rebu, 66, Táxi** (e base para a moto)
  - `js/vehicles.js` (novo): tabela `VEHICLES` com nome, cor, física (aceleração, velocidade, aderência, raio de colisão), consumo, multiplicador de tarifa, intervalo entre chamadas, tipos de passageiro aceitos.
  - Tela inicial: seletor de veículo (setas/clique). Fica salvo em `S.veh` (solo) e em localStorage para o multiplayer.
  - Rebu = equilibrado · 66 = tarifa menor, mais chamadas, mais econômico · Táxi = tarifa maior, bandeira 2 à noite (+30%).
  - `car.js` lê a física do veículo; sprites por veículo em `render-city.js`.
- [x] **2. Moto Rebu**
  - Sprite próprio (estreito), colisão menor, acelera mais, aderência menor, tanque pequeno e econômico.
  - Tarifa menor, não aceita executivo, batida forte = "caiu da moto" (mais dano).
- [x] **3. Dia e noite**
  - Escurecimento pelo relógio (`gameMin`), com amanhecer e anoitecer graduais. Faróis do jogador e do trânsito, postes nos cruzamentos.
  - Camada de luz em canvas separado (`js/light.js`), desenhada por cima do mundo.
  - Táxi cobra bandeira 2 das 20:00 às 06:00.
- [x] **4. Rádio do carro**
  - `js/radio.js`: estações sintetizadas com Web Audio (sequenciador com batida, baixo e melodia), mais uma estação falada (speechSynthesis, se existir).
  - Tecla **R** troca a estação (no fim do turno do multiplayer, R continua abrindo o ranking). Nome da estação aparece no painel.
- [x] **5. Posto com gasolina adulterada**
  - Um dos postos vira "posto preço baixo" (só muda o nome em city.js, não os tiles): gasolina ~40% mais barata.
  - Combustível batizado (`S.car.bad`, fração do tanque) gasta mais rápido, faz o motor engasgar e aumenta o desgaste.
- [x] **6. Passageiro que suja o carro + lava jato**
  - Tipo novo de passageiro "Voltando da praia" (areia por todo lado): suja o carro no fim da viagem.
  - Lugar novo: lava jato (tipo de place em city.js; muda os tiles → republicar o servidor). Menu de lavagem.
  - Carro sujo só sai no lava jato (a oficina deixa de limpar). Item `lavagem` em `SHOP_MAX`.
- [x] **7. Área de risco com bandidos + AURA**
  - Duas áreas de risco sorteadas pela seed (sem mudar tiles): chão mais escuro, aviso no minimapa.
  - Bandidos a pé nessas áreas (mais à noite). Parou ou passou devagar perto: assalto. Leva dinheiro, o carro ou os dois.
  - Carro roubado: o seguro devolve na oficina, com franquia. Fugir acelerando funciona.
  - Atropelar bandido não dá multa: dá **+AURA** (mostrada no painel). Aura alta assusta os bandidos.
  - Multiplayer: `assalto` e `franquia` em `OBRIGATORIOS`.
- [x] **8. Trânsito em frente aos colégios**
  - Três prédios viram colégios (sorteio pela seed, sem mudar tiles): telhado e placa próprios.
  - Na entrada e na saída (06:45–07:30, 11:45–12:30, 17:15–18:00) a rua da frente engarrafa: carros extras a passo de tartaruga e crianças atravessando.
  - Passar rápido demais na zona escolar com crianças: multa (radar) e polícia.
- [x] **9. Fuga da polícia**
  - `js/police.js`: viaturas com sirene e giroflex que perseguem o jogador por um mapa de distâncias (BFS nos tiles).
  - Procurado ao: atropelar pedestre, bater numa viatura, passar no radar da escola.
  - Pego (viatura colada e você parado) = multa e perde a corrida. Despistar (longe por um tempo) = +AURA.
  - Multiplayer: `policia` em `OBRIGATORIOS`.
- [x] **10. Pega no multiplayer (largada e chegada)**
  - Servidor (`regras.js`): um pega por vez. Alguém chama (tecla **X**), a sala sorteia a chegada, quem estiver na largada em 20 s entra.
  - Contagem 3-2-1, corrida até a chegada, ordem de chegada validada pela sala (distância e tempo mínimo).
  - Durante o turno, cada um paga R$ 20 de inscrição e o primeiro leva tudo (livro-caixa). Fora do turno é só pela glória.
  - Cliente: bandeiras de largada e chegada, seta, painel do pega, resultado.
  - Testes em `server/test/regras.test.mjs`.
- [x] **11. Multiplayer acompanha os veículos**
  - `PROTO`/`NET_PROTO` sobem para 4. O estado do carro leva o veículo (`v`) para os outros verem o sprite certo.
  - `embarcar` leva o veículo; a sala paga com o multiplicador dele (a bandeira 2 do táxi não entra na sala: o turno vai das 07:00 às 19:30, sempre de dia).
- [x] **12. Fechamento**
  - README (controles, o que existe), testes do servidor, conferência geral no navegador (solo e duas janelas na sala local).
  - Lembrete: publicar o servidor (`npm run deploy` em `server/`) antes do site.

## Notas de andamento

### 2026-11-19 — todas as etapas implementadas
- Testado: `npm test` (35 testes, 4 novos: tarifa por veículo, cobranças novas, pega com prêmio e pega com estorno),
  `npm run fumaca` no servidor local, e no navegador: solo (veículos, noite, lava jato, posto batizado, colégio,
  polícia, assalto) e sala local com `server/test/pega-bot.mjs` (pega completo, sprite da moto do rival).
- Não testado no navegador: o pega valendo dinheiro (só nos testes das regras), e duas pessoas reais na sala.
  - Atualização: o pega valendo dinheiro foi testado no navegador (sala local, turno de 2 min, contra `pega-bot.mjs`):
    inscrição de R$ 20 de cada um, pote de R$ 40 para quem chegou primeiro, ranking certo e "livro confere" no log.
  - Servidor publicado (protocolo 4) e site no ar com a versão nova. Falta só jogar com pessoas reais.
- A cidade mudou (dois lava jatos novos): o hash da sala mudou e o protocolo foi para 4.
  **Publicar o servidor antes do site**, senão o multiplayer do site recusa a entrada.
- Polícia, bandidos, colégios e rádio são locais de cada jogador; só o dinheiro passa pela sala.

### 2026-11-19 — pedidos seguintes
- [x] Atropelar gato ou cachorro tira 15 de AURA (`World.pets` em js/world.js).
- [x] Guincho em looping: com o carro já na oficina (ou no posto) o G não cobra de novo, só abre o menu.
  Quem está sem dinheiro nem no fiado ganha remendo grátis (lataria 15%) ou 8% de gasolina emprestada.
- [x] Teclas O / P / L: seta até a oficina, o posto ou o lava jato mais perto (a pausa ficou só no Esc).
- [x] Página de ajuda (`ajuda.html`) com todas as regras, aberta pela tela inicial e pela pausa.

- [x] Entregador do euComida (`js/delivery.js`): 5º veículo, moto com bag, pedidos de 8 restaurantes sorteados pela seed
  (sem mudar tiles), espera da cozinha, comida esfriando, tipos de pedido (lanche, pizza, açaí, com refri, festa).
  Só no solo: entrar numa sala com ele troca para Moto Rebu sem mexer na escolha salva. O servidor não mudou.
- [x] Entregador de bike do 66Comida: 6º veículo (Autoescola virou a tecla 7), mesmos pedidos do euComida, só perto,
  sem festa e com 40% mais prazo. Sem gasolina: fôlego (`Care.legs`, fora do save) que cai pedalando e volta parado
  ou com café no posto; perna bamba tira força. Sem radiador, bateria nem gasolina batizada. Só no solo.

- [x] **Direção fácil** (`js/facil.js`, tecla F) e **Autoescola** (`js/autoescola.js`, 6º veículo, só no solo), pedidos para a filha
  de 10 anos que estava com dificuldade. Testado no navegador: aula completa (instrutor → cruzamentos → vaga → estrelas),
  limite de velocidade, contramão, PARE furado, caminho errado com recálculo, aula à noite e a carteira depois da prova;
  direção fácil com velocidade máxima, volante voltando sozinho e freio automático antes do pedestre. O servidor não mudou.

- [x] **Semáforos** (`js/semaforo.js`): metade dos cruzamentos com 3 ou 4 saídas, sorteados pela seed (sem mudar tiles),
  ciclo pelo relógio do computador (numa sala fica quase igual para todos). Trânsito para no vermelho e espera em fila
  (sem o "fantasma" atravessar a fila). Avançar o vermelho: multa de R$ 60 como `radar` (a sala já aceita, o servidor
  não mudou); na direção fácil do solo só avisa; na autoescola é falta de 15 pontos e o instrutor avisa do sinal.
  Testado no navegador: 54 entradas do trânsito em cruzamentos com semáforo em 15 s, nenhuma no vermelho.

### Ideias soltas para depois
- Autoescola: dar seta (pisca) antes de virar; baliza; aula com chuva.
- Semáforo piscando amarelo de madrugada; viatura que vê você avançar o vermelho vem atrás.
- euComida no multiplayer: pedidos vindos da sala (precisa de regras novas no servidor e protocolo 5).
- Interpretar de novo "gasolina adulterada... vai durar mesmo": hoje ela rende MENOS. Se a ideia era render mais, é trocar o sinal do consumo em `Care.update`.
- Viaturas também patrulhando a cidade sem perseguição; blitz à noite.
- Bandidos e polícia sincronizados no multiplayer.
