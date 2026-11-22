'use strict';
// Veículos que o jogador pode escolher: cada um tem física, consumo, tarifa e ritmo de chamadas próprios.
// A escolha fica guardada no navegador e vale para o solo e para o multiplayer.

// As chaves (uber, n99, taxi, moto) vão pela rede para a sala: mudar o nome mostrado é só em "name" e "app".
const PARCEL_VAN = {
  art: 'van', soloOnly: true, cap: 12,
  phys: { accel: 120, maxSpeed: 185, reverseMax: 50, brake: 285, steerRate: 2.55, off: 6 },
  fare: 1, offerMul: 1, fuelUse: 1.2, tankMul: 1.15, dmgMul: 0.9,
};
const VEHICLES = {
  uber: {
    name: 'Rebu', app: 'REBU', color: '#26282e', art: 'car',
    desc: 'Equilibrado. Tarifa normal, chamadas no ritmo normal.',
    phys: {}, fare: 1, offerMul: 1, fuelUse: 1, tankMul: 1, dmgMul: 1,
  },
  n99: {
    name: '66', app: '66', color: '#ffd21f', art: 'car',
    desc: 'Tarifa 10% menor, mas chove chamada e o carro é econômico.',
    phys: { accel: 150 }, fare: 0.9, offerMul: 0.7, fuelUse: 0.8, tankMul: 1, dmgMul: 1,
  },
  taxi: {
    name: 'Táxi', app: 'TÁXI', color: '#f4f1e6', art: 'taxi',
    desc: 'Tarifa 15% maior e bandeira 2 à noite (+30%). Menos chamadas.',
    phys: { maxSpeed: 220 }, fare: 1.15, offerMul: 1.35, fuelUse: 1.1, tankMul: 1, dmgMul: 0.9, bandeira2: 1.3,
  },
  moto: {
    name: 'Moto Rebu', app: 'REBU MOTO', color: '#d8362b', art: 'moto',
    desc: 'Ágil e barata de abastecer. Tarifa 40% menor, sem executivo. Tombo dói.',
    phys: { accel: 210, maxSpeed: 215, grip: 10, hbGrip: 1.4, steerRate: 3.8, r: 3, off: 3 },
    fare: 0.6, offerMul: 0.6, fuelUse: 0.7, tankMul: 0.35, dmgMul: 1.7, noExec: true, noDirty: true,
  },
  // entregador: em vez de passageiros, pedidos de comida (js/delivery.js). Só no solo por enquanto.
  eucomida: {
    name: 'euComida', app: 'euComida', color: '#e3262e', art: 'moto', bag: true, delivery: true, soloOnly: true,
    desc: 'Entregador! Busque o pedido no restaurante e leve quentinho. Chove pedido, gorjeta salva o dia. (Só no solo.)',
    phys: { accel: 210, maxSpeed: 215, grip: 10, hbGrip: 1.4, steerRate: 3.8, r: 3, off: 3 },
    fare: 1, offerMul: 0.5, fuelUse: 0.7, tankMul: 0.35, dmgMul: 1.7, noExec: true, noDirty: true,
  },
  // entregador de bicicleta do 66Comida: os mesmos pedidos do euComida, mas sem motor (js/delivery.js).
  // pedal: não usa gasolina, gasta fôlego (Care.legs); near: só pega pedido perto e nada de pedido de festa.
  comida66: {
    name: '66Comida', app: '66Comida', color: '#ffd21f', art: 'bike', bag: '#ffd21f', delivery: true, soloOnly: true,
    pedal: true, near: true, timeMul: 1.4,
    desc: 'Entregas de bike! Não paga gasolina: anda no fôlego. Lenta, só pedido perto, mas chove pedido. (Só no solo.)',
    phys: { accel: 125, maxSpeed: 150, reverseMax: 35, brake: 300, grip: 11, hbGrip: 1.5, steerRate: 4.3, r: 3, off: 3 },
    fare: 0.85, offerMul: 0.4, fuelUse: 0, tankMul: 0, dmgMul: 1.3, noExec: true, noDirty: true,
  },
  // autoescola: aulas com instrutor em vez de corridas (js/autoescola.js). Só no solo; o carro é da escola.
  escola: {
    name: 'Autoescola', app: 'AUTOESCOLA', color: '#f4f4f4', art: 'escola', school: true, soloOnly: true,
    desc: 'Aprenda a dirigir! Busque o instrutor e siga as setas. 6 aulas e a prova do DETRAN. (Só no solo.)',
    phys: {}, fare: 1, offerMul: 1, fuelUse: 0, tankMul: 1, dmgMul: 0,
  },
  leve: {
    ...PARCEL_VAN, name: 'Mercado Leve', app: 'Mercado Leve', color: '#ffe600', parcels: 'leve',
    desc: 'Van de encomendas. Carregue até 12 pacotes no galpão e escolha a ordem das paradas. Só no solo.',
  },
  amazoom: {
    ...PARCEL_VAN, name: 'Amazoom', app: 'Amazoom', color: '#ff9900', parcels: 'amazoom',
    desc: 'Van de encomendas. Faça até 12 paradas e volte ao galpão para fechar a rota. Só no solo.',
  },
  xopi: {
    name: 'Xopi', app: 'Xopi', color: '#ee4d2d', art: 'moto', bag: '#ee4d2d', parcels: 'xopi', soloOnly: true, cap: 5,
    desc: 'Moto com baú. Até 5 pacotes por rota, com endereços próximos ao galpão. Só no solo.',
    phys: { accel: 210, maxSpeed: 215, grip: 10, hbGrip: 1.4, steerRate: 3.8, r: 3, off: 3 },
    fare: 1, offerMul: 0.7, fuelUse: 0.7, tankMul: 0.35, dmgMul: 1.7, noExec: true, noDirty: true,
  },
  aereo: {
    name: 'Táxi aéreo', app: 'TÁXI AÉREO', color: '#ffc54a', art: 'helicoptero', soloOnly: true, guided: true,
    desc: 'Pilote um helicóptero entre os helipontos da cidade e receba por voo concluído. Só no solo.',
    phys: { accel: 110, maxSpeed: 215, brake: 240, reverseMax: 35 },
    fare: 1, offerMul: 1, fuelUse: 0, tankMul: 1, dmgMul: 0,
  },
  barcas: {
    name: 'Barcas', app: 'BARCAS DA ORLA', color: '#36a6bb', art: 'barca', soloOnly: true, guided: true,
    desc: 'Conduza a barca entre os dois cais da orla e receba por passageiro desembarcado. Só no solo.',
    phys: { accel: 48, maxSpeed: 118, brake: 110, reverseMax: 25 },
    fare: 1, offerMul: 1, fuelUse: 0, tankMul: 1, dmgMul: 0,
  },
  vlt: {
    name: 'VLT', app: 'VLT · LINHA CIRCULAR', color: '#27b3a7', art: 'vlt', guided: true, soloOnly: true,
    desc: 'Conduza o trem elétrico pelos trilhos e pare nas plataformas da Linha Circular. Só no solo.',
    phys: { accel: 80, maxSpeed: 155, brake: 210, reverseMax: 36 }, electric: true,
    fare: 1, offerMul: 1, fuelUse: 0, tankMul: 1, dmgMul: 0,
  },
  onibus: {
    name: 'Ônibus urbano', app: 'LINHA 01', color: '#3785bd', art: 'onibus', soloOnly: true,
    desc: 'Dirija a linha entre os terminais, pare nos pontos e receba por passageiro transportado. Só no solo.',
    phys: { accel: 95, maxSpeed: 165, reverseMax: 40, brake: 265, steerRate: 2.25, off: 8 },
    fare: 1, offerMul: 1, fuelUse: 1.3, tankMul: 1.4, dmgMul: 0.85,
  },
  passeador: {
    name: 'Passeador de cachorros', app: 'PASSEIOS', color: '#59cca3', art: 'passeador', guided: true, soloOnly: true,
    desc: 'Trabalhe a pé. Busque até três cachorros, contorne três quarteirões com o grupo e receba de cada tutor na volta. Só no solo.',
    phys: { maxSpeed: 42 }, fare: 1, offerMul: 1, fuelUse: 0, tankMul: 1, dmgMul: 0,
  },
  gincana: {
    name: 'Gincana da Rádio', app: 'GINCANA DA RÁDIO', color: '#fcab39', art: 'car', soloOnly: true,
    desc: 'Decifre duas pistas do locutor e complete o desafio final para ganhar o prêmio.',
    phys: {}, fare: 1, offerMul: 1, fuelUse: 1, tankMul: 1, dmgMul: 1,
  },
  policia: {
    name: 'Polícia', app: 'CENTRAL DE PATRULHA', color: '#e9edf2', art: 'viatura', soloOnly: true,
    desc: 'Patrulhe a cidade. Aceite ocorrências da central e pare no local para prestar atendimento. Só no solo.',
    phys: { maxSpeed: 215 }, fare: 1, offerMul: 1, fuelUse: 1, tankMul: 1, dmgMul: 1,
  },
  ambulancia: {
    ...PARCEL_VAN, name: 'Ambulância', app: 'CENTRAL DE RESGATE', color: '#f4f6f5', art: 'ambulancia',
    desc: 'Atenda chamados, resgate pacientes e leve cada pessoa ao pronto-socorro. Só no solo.',
  },
  escolar: {
    ...PARCEL_VAN, name: 'Van escolar', app: 'ESCOLAR', color: '#ffcb39', shuttle: true,
    desc: 'Busque os alunos, leve a turma à escola e volte na saída. Cada família paga por trecho. Só no solo.',
  },
  eletrico: {
    name: 'Carro elétrico', app: 'REBU', color: '#52d8bd', art: 'car', electric: true, soloOnly: true,
    phys: { accel: 175 }, fare: 1, offerMul: 1, fuelUse: 0.8, tankMul: 1, dmgMul: 1,
    desc: 'Começa no Rebu. A bateria recarrega no posto marcado com um raio. Só no solo.',
  },
};
VEHICLES.envios = {
  ...VEHICLES.uber, name: 'Rebu Envios', app: 'REBU ENVIOS', color: '#69ccad', soloOnly: true, bag: '#69ccad',
  desc: 'Retire o pacote com o remetente e entregue em mãos. Alguns envios pedem um código na chegada. Só no solo.',
};
VEHICLES.farmacia = {
  ...VEHICLES.comida66, name: 'Farmácia de bike', app: 'FARMA BIKE', color: '#37c396', bag: '#37c396',
  desc: 'Retire pedidos na farmácia e pedale até o cliente. Proteja os frascos contra batidas. Só no solo.',
};
const VEH_ORDER = ['uber', 'n99', 'taxi', 'moto', 'eucomida', 'comida66', 'escola', 'leve', 'amazoom', 'xopi', 'escolar', 'eletrico', 'envios', 'ambulancia', 'onibus', 'vlt', 'farmacia', 'barcas', 'aereo', 'policia', 'passeador', 'gincana'];
const JOBS_BY_ART = {
  passeador: ['passeador'], viatura: ['policia'], helicoptero: ['aereo'], barca: ['barcas'], vlt: ['vlt'], onibus: ['onibus'], ambulancia: ['ambulancia'], van: ['escolar', 'amazoom', 'leve', 'uber', 'eucomida', 'envios'],
  car: ['uber', 'gincana', 'n99', 'eucomida', 'envios'], taxi: ['taxi', 'uber', 'n99', 'eucomida', 'envios'],
  moto: ['moto', 'eucomida', 'xopi', 'envios'], bike: ['comida66', 'farmacia'], escola: ['escola'],
};
const VEH_KEY = 'bandeira3-veiculo';

const Veh = {
  key: 'uber', job: 'uber', profile: VEHICLES.uber,

  load() {
    try { this.set(localStorage.getItem(VEH_KEY), false); } catch (e) { /* storage bloqueado */ }
  },
  // persist = false troca só nesta partida (ex.: o euComida vira Moto Rebu dentro de uma sala)
  set(k, persist = true) {
    if (!VEHICLES[k]) return;
    this.key = k;
    this.setJob(k === 'eletrico' ? 'uber' : k);
    if (persist) try { localStorage.setItem(VEH_KEY, k); } catch (e) { /* idem */ }
  },
  get jobs() { return JOBS_BY_ART[VEHICLES[this.key].art]; },
  setJob(k) {
    if (!this.jobs.includes(k)) return;
    const base = VEHICLES[this.key], work = VEHICLES[k];
    this.job = k;
    this.profile = { ...base, app: work.app, delivery: !!work.delivery, parcels: work.parcels,
      shuttle: !!work.shuttle, offerMul: work.offerMul, fare: work.fare, bandeira2: work.bandeira2,
      cap: work.cap, bag: (base.art === 'moto' || base.art === 'bike') && work.bag };
  },
  get cur() { return this.profile; },

  // moto e bike: duas rodas (tombo, farol estreito, nada de areia no banco)
  twoWheel(k = this.key) { const a = VEHICLES[k].art; return a === 'moto' || a === 'bike'; },
  // nome do veículo nos avisos: "carro", "moto" ou "bike" (fem: usa "a")
  noun(k = this.key) { const a = VEHICLES[k].art; if (a === 'passeador') return 'a pé'; if (a === 'viatura') return 'viatura'; if (a === 'helicoptero') return 'helicóptero'; if (a === 'barca') return 'barca'; if (a === 'vlt') return 'VLT'; if (a === 'onibus') return 'ônibus'; if (a === 'ambulancia') return 'ambulância'; return ['moto', 'bike', 'van'].includes(a) ? a : 'carro'; },
  fem(k = this.key) { return !['helicóptero', 'carro', 'ônibus', 'VLT'].includes(this.noun(k)); },

  // física completa do veículo (o que não muda fica igual ao carro padrão)
  phys(k = this.key) { return Object.assign({}, CARP, VEHICLES[k].phys); },

  // bandeira 2 do táxi: das 20:00 às 06:00 do relógio do jogo
  isNight(min) { const h = Math.floor(min / 60) % 24; return h >= 20 || h < 6; },
  // multiplicador da tarifa para o veículo atual na hora "min"
  fareMul(min, k = this.job) {
    const v = VEHICLES[k];
    return v.fare * (v.bandeira2 && this.isNight(min) ? v.bandeira2 : 1);
  },
};
Veh.load();

// No Node (servidor do multiplayer) exporta a tabela; no navegador esta linha não faz nada.
if (typeof module !== 'undefined' && module.exports) module.exports = { VEHICLES, VEH_ORDER };
