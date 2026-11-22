'use strict';
// Loop principal, entrada, câmera, desenho do mundo, menus de oficina/posto e save.

const SAVE_KEY = 'bandeira3-save-v1';
function defaultSave() {
  return { v: 1, seed: 20261118, money: 150, ratings: [5, 5, 5, 5, 5], rides: 0, parcels: 0, envios: 0, rescues: 0, ocorrencias: 0, busPassengers: 0, vltTrips: 0, ferryTrips: 0, airTrips: 0, dogWalks: 0, schoolLegs: 0, garage: {}, earned: 0, aura: 0,
    car: { spare: true, fuel: 70, health: 100, wear: 8, temp: 50, problems: { flat: false, overheat: false, brakes: false, battery: false, dirty: false } } };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 1) {
      // Garagens antigas guardavam carros, vans e bikes pelo tipo de carroceria.
      const oldSlots = { car: 'uber', van: 'escolar', bike: 'comida66' };
      const garage = Object.fromEntries(Object.entries(s.garage || {}).map(([key, car]) => [oldSlots[key] || key, car]));
      const carSlot = s.vehicle || oldSlots[s.carSlot] || s.carSlot || (Veh.cur.school ? 'uber' : Veh.key);
      return { parcels: 0, envios: 0, rescues: 0, ocorrencias: 0, busPassengers: 0, vltTrips: 0, ferryTrips: 0, airTrips: 0, dogWalks: 0, schoolLegs: 0, ...s, dogWalk: Passeador.restore(s.dogWalk), garage, carSlot, car: { spare: true, ...s.car } };
    }
  } catch (e) { /* sem save */ }
  return null;
}
// Modo de jogo. Só o solo lê e grava o save local; o multiplayer terá um estado próprio que nunca toca no save.
const GAME = { mode: 'solo' };
function writeSave() {
  if (mode === 'title' || GAME.mode !== 'solo' || Veh.cur.school) return; // a autoescola não mexe no save (o carro é da escola)
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage bloqueado */ }
}

let S = loadSave() || defaultSave();

const city = generateCity(S.seed);
const mapCanvas = prerenderCity(city);
const mapCtx = mapCanvas.getContext('2d');
const minimapBase = prerenderMinimap(city);
const SPR = { player: null, npc: NPC_COLORS.map((c) => makeCarSprites(c, false)) };

const canvas = $('game'), ctx = canvas.getContext('2d');
const overhead = $('world3d').dataset.camera === 'top';
let drawing3D = false;
const view = { w: 480, h: 270, scale: 4 };
let camX = 0, camY = 0;
function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  const sc = Math.max(2, Math.round(height / 290));
  view.scale = sc;
  view.w = Math.max(Math.ceil(width / sc), overhead ? 480 : 720);
  view.h = Math.max(Math.ceil(height / sc), overhead ? 330 : 720);
  if (canvas.width !== view.w) canvas.width = view.w;
  if (canvas.height !== view.h) canvas.height = view.h;
  canvas.style.width = Math.ceil(view.w * sc) + 'px'; canvas.style.height = Math.ceil(view.h * sc) + 'px';
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const player = makePlayer(0, 0, 0);
function activeJob() {
  if (Veh.job === 'gincana') return Gincana;
  if (Veh.job === 'passeador') return Passeador;
  if (Veh.job === 'aereo') return TaxiAereo;
  if (Veh.job === 'barcas') return Barcas;
  if (Veh.job === 'vlt') return VLT;
  if (Veh.job === 'onibus') return Onibus;
  if (Veh.job === 'policia') return Patrulha;
  if (Veh.job === 'ambulancia') return Ambulancia;
  if (Veh.job === 'envios') return Envios;
  if (Veh.cur.shuttle) return Escolar;
  if (Veh.cur.parcels) return Parcels;
  return Veh.cur.school ? Autoescola : Rides;
}
// Veículo escolhido na tela inicial: sprite, física e nome do app no celular.
const roadHelp = $('help').textContent;
function applyVehicle() {
  const v = Veh.cur;
  if (Veh.job !== 'policia') Patrulha.setSiren(false);
  SPR.player = v.art === 'passeador' ? null : makeCarSprites(v.color, true, v.art, v.bag);
  player.p = Veh.phys();
  const guided = !!v.guided;
  document.body.classList.toggle('guided-cab', guided);
  document.body.classList.toggle('on-foot', v.art === 'passeador');
  $('help').textContent = Veh.job === 'passeador' ? 'WASD ou setas para caminhar · E aceitar passeio · C cancelar · J modalidade · Esc pausa' : Veh.job === 'aereo' ? 'W/↑ acelerar · A/D ou ←/→ girar · S/↓ recuar · Espaço frear · E embarcar · C cancelar · J modalidade' : guided ? 'W/↑ acelerar · S/↓ frear e recuar · Espaço frear · E iniciar · C encerrar · J modalidade · Esc pausa' : roadHelp;
  $('appname').textContent = v.app;
  $('phone').classList.toggle('food', !!v.delivery);
  $('phone').classList.toggle('food66', Veh.job === 'comida66');
  $('phone').classList.toggle('pharmacy', Veh.job === 'farmacia');
  $('fuellbl').textContent = v.art === 'vlt' ? 'REDE' : v.pedal ? 'FÔLEGO' : v.electric ? 'BATERIA' : 'COMBUST.';
  $('phone').classList.toggle('escola', !!v.school);
  $('phone').classList.toggle('parcels', !!v.parcels);
  document.documentElement.style.setProperty('--parcel-color', VEHICLES[Veh.job].color);
  $('lghub').classList.toggle('hidden', !v.parcels);
  $('lgstops').classList.toggle('hidden', !v.parcels);
  $('lgsurge').classList.toggle('hidden', !!v.parcels || !!v.school || !!v.shuttle || guided);
  $('lgcasa').classList.toggle('hidden', !Garagem.enabled);
  $('lgrecarga').classList.toggle('hidden', !Garagem.enabled);
  $('jobbtn').classList.toggle('hidden', !Garagem.enabled);
  $('lgrest').classList.toggle('hidden', !v.delivery || Veh.job === 'farmacia');
  $('lgfarmacia').classList.toggle('hidden', Veh.job !== 'farmacia');
}
applyVehicle();
let lastPlace = null;
function placeCarAt(p) {
  Garagem.pushing = false;
  player.x = p.cx; player.y = p.cy;
  player.a = { top: -Math.PI / 2, bottom: Math.PI / 2, left: Math.PI, right: 0 }[p.side];
  Object.assign(player, { vx: 0, vy: 0, vF: 0, vR: 0, steer: 0, speed: 0, throttle: 0, braking: false });
  lastPlace = p;
}
placeCarAt(city.places.find((p) => p.kind === 'posto') || city.places[0]);

const cam = { x: player.x, y: player.y };
let shake = 0;
const traffic = new Traffic(city, 46);
traffic.onHonk = () => Sfx.horn(0.035);
const peds = new Peds(city, 70);
Rides.init(city);
Light.init(city);
World.init(city, mapCtx);
Delivery.init(city, mapCtx); // restaurantes do euComida (depois do World: não pega colégio nem área de risco)
Parcels.init(city, mapCtx);
Garagem.init();
Ambulancia.init(city, mapCtx);
Delivery.initPharmacies(city, mapCtx);
Patrulha.init(city, mapCtx);
Onibus.init(city);
VLT.init(city);
Barcas.init(city);
TaxiAereo.init(city);
Autoescola.init(city);
traffic.capFn = (x, y) => World.trafficCap(x, y);
Signals.init(city);
traffic.stopFn = (i, j, d, dist) => Signals.npcStop(i, j, d, dist);
HUD.init();
Multi.initTitle();
const particles = [], floaters = [];
// ?hora=22 começa o solo nessa hora (para testar a noite)
const START_HOUR = clamp(+new URLSearchParams(location.search).get('hora') || 7, 0, 23.99);
let mode = 'title', time = 0, saveT = 5, gameMin = START_HOUR * 60, prevWheels = null;

function clockStr() {
  return String(Math.floor(gameMin / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(gameMin) % 60).padStart(2, '0');
}
function addFloater(x, y, text, col) { floaters.push({ x, y, text, col, t: 0 }); }

// ---------- entrada ----------
const driving = createDrivingInput();
const input = driving.state;
function clearInput() { driving.clear(); }
const canDrive = () => mode === 'play' && !document.hidden;
function suspendInput() { Patrulha.setSiren(false); clearInput(); writeSave(); }
window.addEventListener('pagehide', suspendInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendInput();
});
// teclas digitadas em campos de texto (apelido, código da sala) não comandam o carro
const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
const nativeActivation = (e) => (e.code === 'Enter' || e.code === 'Space') &&
  e.target.closest?.('button, a, summary') && (mode !== 'play' || e.target.matches(':focus-visible'));
window.addEventListener('keydown', (e) => {
  if (typing(e) || nativeActivation(e)) return;
  if (KEYMAP[e.code] && canDrive()) {
    if (!e.repeat) driving.key(e.code, true);
    e.preventDefault();
  }
  if (e.repeat) return;
  onKey(e.code);
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) {
    driving.key(e.code, false);
    if (canDrive() && !typing(e)) e.preventDefault();
  }
});
window.addEventListener('blur', clearInput);

function onKey(code) {
  if (mode === 'title') {
    if (Multi.titleKey(code)) return;
    if (code === 'KeyF') { Easy.toggle(true); return; }
    if (code === 'KeyG') { pickVehicle('gincana'); return; }
    if (code === 'KeyC') { pickVehicle('passeador'); return; }
    if (code === 'KeyD') { pickVehicle('farmacia'); return; }
    if (code === 'KeyH') { pickVehicle('aereo'); return; }
    if (code === 'KeyB') { pickVehicle('barcas'); return; }
    if (code === 'KeyT') { pickVehicle('vlt'); return; }
    if (code === 'KeyO') { pickVehicle('onibus'); return; }
    if (code === 'KeyP') { pickVehicle('policia'); return; }
    if (code === 'KeyA') { pickVehicle('ambulancia'); return; }
    if (code === 'KeyN') { pickVehicle('envios'); return; }
    if (code === 'KeyV') { pickVehicle('escolar'); return; }
    if (code === 'KeyE') { pickVehicle('eletrico'); return; }
    const d = code.match(/^(Digit|Numpad)(\d)$/);
    if (d) { pickVehicle(VEH_ORDER[(+d[2] || 10) - 1]); return; }
    if ((code === 'Enter' || code === 'Space') && !$('startbtn').disabled) startGame();
    return;
  }
  if (mode === 'menu') {
    if (code === 'Escape') closeModal();
    else { const m = code.match(/^(Digit|Numpad)(\d)$/); if (m) clickModalIndex(+m[2] || 10); }
    return;
  }
  if (Veh.cur.guided && ['KeyO', 'KeyB', 'KeyT', 'KeyU', 'KeyP', 'KeyL', 'KeyG'].includes(code)) return;
  if (Multi.roomKey(code)) return;
  switch (code) {
    case 'KeyE': activeJob().accept(); break;
    case 'KeyK': if (Veh.job === 'policia') Patrulha.setSiren(!Patrulha.sirenOn); break;
    case 'KeyZ': if (Veh.job === 'policia') Patrulha.startRound(); break;
    case 'KeyI': if (Veh.job === 'barcas') Barcas.accept(true); break;
    case 'KeyQ': activeJob().decline?.(); break;
    case 'KeyC': activeJob().cancel(); break;
    case 'KeyV': if (Veh.cur.parcels && Parcels.state === 'route') Parcels.startReturn(); break;
    case 'KeyF': Easy.toggle(); break;
    case 'KeyH': if (Veh.job === 'aereo' || Veh.job === 'passeador') break; Sfx.horn(0.09); peds.scare(player.x, player.y); break;
    case 'KeyG': callTow(); break;
    case 'KeyM': Sfx.setMuted(!Sfx.muted); toast(Sfx.muted ? 'Som desligado' : 'Som ligado'); break;
    case 'KeyR': Radio.next(); break;
    case 'KeyX': Pega.key(); break;
    case 'KeyO': Nav.toggle('oficina'); break;
    case 'KeyJ': Garagem.jobsMenu(); break;
    case 'KeyB': if (Garagem.enabled) Nav.toggle('casa'); break;
    case 'KeyT': Garagem.spare(); break;
    case 'KeyU': Garagem.push(); break;
    case 'KeyP': Nav.toggle(Care.station()); break;
    case 'KeyL': Nav.toggle('lavajato'); break;
    case 'Escape': openPause(); break;
  }
}

function startGame() {
  if (mode !== 'title') return;
  Sfx.init();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  mode = 'play';
  clearInput();
  if (Garagem.enabled) {
    Garagem.buildHome();
    Garagem.takeVehicle(Veh.key, resumeJob);
  } else applyVehicle();
  if (Veh.cur.school) {
    // o carro da escola: tanque cheio e inteiro (o carro do save fica guardado, a autoescola não grava nada)
    S.car = defaultSave().car; S.car.fuel = 100; S.car.wear = 0;
    $('money').classList.add('hidden'); $('aura').classList.add('hidden'); // o dinheiro do solo não entra na aula
    Autoescola.start();
  } else if (Veh.job === 'gincana') {
    toast('Gincana da Rádio · Confira a missão no celular.', 'good');
  } else if (Veh.job === 'passeador') {
    toast(S.dogWalk ? 'Passeio retomado. Confira a parada no celular.' : 'Aperte E para aceitar um passeio.', 'good');
  } else if (Veh.job === 'aereo') {
    toast(S.flight ? 'Voo retomado. Confira o destino no painel.' : 'Helicóptero pronto. Aperte E para aceitar um voo.', 'good');
  } else if (Veh.job === 'barcas') {
    toast(S.ferryRun ? 'Travessia retomada. Siga até o cais indicado.' : 'Barca atracada. Aperte E para embarcar os passageiros.', 'good');
  } else if (Veh.job === 'vlt') {
    toast(S.vltRun ? 'Serviço retomado na Linha Circular.' : 'VLT pronto. Inicie o serviço no painel.', 'good');
  } else if (Veh.job === 'onibus') {
    toast(S.busRoute ? 'Linha retomada. Siga a seta até o próximo ponto.' : 'Ônibus em serviço. Aguarde a viagem no celular.', 'good');
  } else if (Veh.job === 'policia') {
    toast(S.ocorrencia ? 'Ocorrência retomada. Siga a seta.' : 'Viatura em patrulha. Aguarde a central chamar.', 'good');
  } else if (Veh.job === 'ambulancia') {
    toast(S.rescue ? 'Resgate retomado. Siga a seta.' : 'Ambulância de plantão. Aguarde um chamado no celular.', 'good');
  } else if (Veh.job === 'envios') {
    toast(S.shipment ? 'Envio retomado. Siga a seta para continuar.' : 'Rebu Envios online. Os pedidos chegam no celular.', 'good');
  } else if (Veh.cur.shuttle) {
    toast(Escolar.busy ? 'Rota escolar retomada. Termine o trecho ou use Encerrar contrato no celular.' :
      'Van escolar online! Os contratos das famílias chegam no celular.', 'good');
  } else if (Veh.cur.parcels) {
    toast(`Você está online no ${Veh.cur.app}! Aceite uma rota no celular e carregue no galpão.`, 'good');
  } else if (Veh.cur.delivery) {
    Care.legs = 100;
    toast(`Você está online no ${Veh.cur.app}! Os pedidos chegam no celular.`, 'good');
    if (Veh.job === 'farmacia') toast('Procure a cruz verde no mapa. Pare na farmácia para retirar o pacote.');
    else setTimeout(() => toast('Restaurantes têm toldo listrado. Retire o pedido e leve quentinho!'), 2500);
    if (Veh.cur.pedal) setTimeout(() => toast('Bike não gasta gasolina, gasta perna: de olho no FÔLEGO. Parado, ele volta.'), 5000);
  } else {
    toast('Você está online! As corridas chegam no celular.', 'good');
    setTimeout(() => toast('Áreas laranjas = tarifa dinâmica. Chamadas de lá pagam mais.'), 2500);
  }
}
$('jobbtn').addEventListener('click', () => { if (canDrive()) Garagem.jobsMenu(); });
$('startbtn').addEventListener('click', startGame);

// ---------- escolha do veículo (tela inicial) ----------
let resumeJob;
function pickVehicle(k, resume = false) {
  Veh.set(k);
  resumeJob = resume && S.vehicle === k ? S.job : undefined;
  applyVehicle();
  const preview = $('vehpreview').getContext('2d');
  for (const b of document.querySelectorAll('#vehbtns button')) {
    const selected = b.dataset.veh === Veh.key;
    b.setAttribute('aria-pressed', selected);
    if (selected) {
      preview.clearRect(0, 0, 44, 24);
      preview.drawImage(b.firstElementChild, 0, 0);
    }
  }
  $('vehname').textContent = Veh.cur.name;
  $('vehdesc').textContent = VEHICLES[resumeJob] && resumeJob !== Veh.job
    ? 'Retomar com ' + Veh.cur.name + ' no app ' + VEHICLES[resumeJob].name + '.' : Veh.cur.desc;
}
$('easybtn').addEventListener('click', () => Easy.toggle(true));
Easy.refresh();
(function buildVehiclePicker() {
  const box = $('vehbtns');
  const picker = $('vehpick');
  const summary = picker.querySelector('summary');
  VEH_ORDER.forEach((k, i) => {
    const v = VEHICLES[k], b = document.createElement('button');
    b.className = 'ghost'; b.dataset.veh = k;
    const [cv, g] = makeCanvas(44, 24);
    if (k === 'passeador') {
      g.scale(2, 2);
      g.fillStyle = '#ebbc78'; g.fillRect(6, 6, 9, 1);
      drawPedSprite(g, 5, 6, v.color, '#573826', 0, false);
      World.drawPet(g, { dog: true, col: '#d9b26a', anim: 0 }, 15, 7);
    } else {
      const { img } = makeCarSprites(v.color, true, v.art, v.bag);
      const thumbScale = Math.min(2, cv.width / img.width);
      const w = Math.round(img.width * thumbScale), h = Math.round(img.height * thumbScale);
      g.drawImage(img, Math.round((cv.width - w) / 2), Math.round((cv.height - h) / 2), w, h);
    }
    const shortcut = i < 10 ? (i + 1) % 10 : { escolar: 'V', eletrico: 'E', envios: 'N', policia: 'P', ambulancia: 'A', onibus: 'O', vlt: 'T', aereo: 'H', barcas: 'B', farmacia: 'D', gincana: 'G', passeador: 'C' }[k];
    cv.setAttribute('aria-hidden', 'true');
    const key = document.createElement('kbd');
    key.textContent = shortcut;
    key.setAttribute('aria-hidden', 'true');
    b.append(cv, document.createTextNode(v.name), key);
    b.addEventListener('click', () => {
      pickVehicle(k);
      picker.open = false;
      summary.focus();
    });
    box.appendChild(b);
  });
  pickVehicle(Veh.key, true);
})();
window.addEventListener('beforeunload', writeSave);

// ---------- menus (oficina, posto, pausa) ----------
const modal = $('modal'), modalBox = $('modalbox');
let modalItems = [];
function showModal(title, sub, items, closeLabel, noMoney) {
  modalItems = items;
  modalBox.innerHTML =
    `<div class="m-title" id="modaltitle">${title}</div>` +
    (sub ? `<div class="m-sub">${sub}</div>` : '') +
    (noMoney ? '' : `<div class="m-money">Saldo: <b class="${S.money < 0 ? 'neg' : ''}">${fmtMoney(S.money)}</b></div>`) +
    `<div class="m-list">${items.map((it, i) =>
      `<button class="mbtn" data-i="${i + 1}" ${it.disabled ? 'disabled' : ''}><span>${i < 10 ? `<kbd>${(i + 1) % 10}</kbd> ` : ''}${it.label}</span>` +
      `${it.cost != null ? `<span class="price">${fmtMoney(it.cost)}</span>` : ''}</button>`).join('')}</div>` +
    `<button class="mbtn ghost" data-close="1"><span><kbd>Esc</kbd> ${closeLabel || 'Sair'}</span></button>`;
  modal.classList.remove('hidden');
  mode = 'menu';
  $('hud').inert = true;
  modalBox.focus();
  Police.sirenVol(0); Patrulha.sound?.sirenVol(0);
  Sfx.engine(0, 0, false); Sfx.screech(0);
  clearInput();
}
function closeModal() {
  modal.classList.add('hidden');
  mode = 'play';
  if (Patrulha.sirenOn) Patrulha.sound.sirenVol(0);
  $('hud').inert = false;
  clearInput();
  writeSave();
}
modal.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.close) { closeModal(); return; }
  if (b.dataset.i) clickModalIndex(+b.dataset.i);
});
function clickModalIndex(n) { const it = modalItems[n - 1]; if (it && !it.disabled) it.run(); }

const MECH_LINES = ['"Hmm... isso aí vai dar trabalho, patrão."', '"Trouxe na hora certa!"', '"Já vi pior. Bem pior."',
  '"Quer o orçamento com ou sem chorinho?"', '"Esse barulho aí não é normal não."'];

// "kinds" = o que está sendo comprado (a sala do multiplayer confere o valor pelo teto de cada item)
function shopItem(label, cost, fn, reopen, kinds) {
  return { label, cost, fn, kinds, disabled: !Care.canPay(cost),
    run() {
      if (!Care.canPay(cost)) return;
      if (GAME.mode === 'multi') { Multi.buy(kinds, cost, (open) => { fn(); Sfx.cash(); if (open) reopen(); }); return; }
      S.money -= cost; fn(); Sfx.cash(); writeSave(); reopen();
    } };
}

function garageMenu(place) {
  const c = S.car, items = [], reopen = () => garageMenu(place);
  if (c.health < 99.5) items.push(shopItem(`Funilaria (lataria em ${Math.round(c.health)}%)`, Math.ceil((100 - c.health) * 2.2), () => { c.health = 100; }, reopen, ['funilaria']));
  for (const k in PROBLEMS) if (c.problems[k] && k !== 'dirty') items.push(shopItem(PROBLEMS[k].fix, PROBLEMS[k].cost, () => {
    c.problems[k] = false;
    if (k === 'overheat') { Care.overheated = false; c.temp = 50; }
  }, reopen, [k]));
  if (c.wear >= 5) items.push(shopItem(`Revisão completa (desgaste ${Math.round(c.wear)}%)`, Math.ceil(30 + c.wear * 1.5), () => { c.wear = 0; }, reopen, ['revisao']));
  if (items.length > 1) {
    const total = items.reduce((a, i) => a + i.cost, 0), fns = items.map((i) => i.fn);
    items.push(shopItem('Consertar tudo', total, () => fns.forEach((f) => f()), reopen, items.flatMap((i) => i.kinds)));
  }
  // quebrado e sem dinheiro nem no fiado: o mecânico faz um remendo de graça para não ficar preso aqui
  if (c.health <= 0 && !Care.canPay(Math.ceil(100 * 2.2))) items.unshift({ label: `Remendo de emergência (de graça, lataria em ${EMERGENCY_FIX}%)`, cost: null,
    run() { c.health = EMERGENCY_FIX; c.wear = Math.min(100, c.wear + 10); toast('"Vai com Deus, mas volta pra pagar o conserto!"', 'good'); reopen(); } });
  if (Garagem.enabled && !Veh.twoWheel() && !c.spare) items.push(shopItem('Repor estepe no porta-malas', PROBLEMS.flat.cost, () => { c.spare = true; }, reopen));
  const sub = items.length ? `${R.pick(MECH_LINES)}<br><small>Dá pra pagar no fiado até ${fmtMoney(CREDIT_LIMIT)}.</small>` : 'Seu carro está nos trinques! Nada pra fazer aqui.';
  showModal(`OFICINA · ${place.name}`, sub, items);
}

function postoMenu(place) {
  const c = S.car, items = [], reopen = () => postoMenu(place);
  if (Veh.cur.pedal) { // bike não abastece: o posto vira parada pro café (que devolve o fôlego)
    items.push(shopItem('Café + pão de queijo (fôlego cheio)', COFFEE_PRICE, () => { Care.legs = 100; toast('Café na veia. Bora pedalar!', 'good'); }, reopen, ['cafe']));
    showModal(`POSTO · ${place.name}`, `"Gasolina pra bike? Essa é boa!"<br><small>Fôlego: ${Math.round(Care.legs)}%</small>`, items);
    return;
  }
  if (Veh.cur.electric) {
    const plugged = place === Garagem.charger;
    if (plugged && c.fuel < 100) items.push({ label: 'Recarregar bateria · grátis', run() {
      c.fuel = 100; writeSave(); Sfx.ding(); reopen();
    } });
    if (!plugged) items.push({ label: 'Traçar rota para recarga', run() { closeModal(); Nav.go('recarga'); } });
    showModal(plugged ? 'PONTO DE RECARGA' : place.name, (plugged ? 'Carregador público' : 'Este posto só vende combustível') + ' · Bateria ' + Math.round(c.fuel) + '%', items);
    return;
  }
  if (c.kitGas && c.gas < 100) {
    const cost = Math.ceil((100 - c.gas) * 0.32 * Veh.cur.tankMul * 100) / 100;
    items.push(shopItem('Completar GNV (' + Math.round(c.gas) + '% no cilindro)', cost, () => { c.gas = 100; }, reopen));
  }
  // tanque de moto é menor; o posto preço baixo é mais barato... e batiza a gasolina
  const missing = 100 - c.fuel, price = FUEL_PRICE * Veh.cur.tankMul * (place.cheap ? CHEAP_FUEL : 1), bad = !!place.cheap;
  if (missing > 1) {
    const full = Math.ceil(missing * price * 100) / 100;
    items.push(shopItem('Completar o tanque de gasolina', full, () => Care.refuel(missing, bad), reopen, ['tanque']));
    if (full > FUEL_SMALL) items.push(shopItem('Colocar R$ 20 de gasolina', FUEL_SMALL, () => Care.refuel(FUEL_SMALL / price, bad), reopen, ['gasolina']));
  }
  // tanque vazio e sem dinheiro nem no fiado: o frentista empresta um pouquinho para não ficar preso aqui
  if (Care.empty() && !Care.canPay(Math.min(FUEL_SMALL, Math.ceil(missing * price * 100) / 100))) items.unshift({ label: `Frentista empresta ${EMERGENCY_FUEL}% de gasolina (de graça)`, cost: null,
    run() { Care.refuel(EMERGENCY_FUEL, false); toast('"Corre atrás de uma corrida e volta pra acertar!"', 'good'); reopen(); } });
  items.push(shopItem('Café + pão de queijo', COFFEE_PRICE, () => toast('Delícia. Bora trabalhar!', 'good'), reopen, ['cafe']));
  const sub = `Gasolina: ${fmtMoney(price)} por % do tanque · Tanque: ${Math.round(c.fuel)}%` +
    (place.cheap ? '<br><small>"Gasolina aditivada, patrão, pode confiar." (Ela rende menos, o motor engasga e gasta mais.)</small>'
      : (c.bad || 0) > 0.05 ? `<br><small>Seu tanque tem ${Math.round(c.bad * 100)}% de gasolina batizada. Completar aqui dilui.</small>` : '');
  showModal(`POSTO · ${place.name}`, sub, items);
}

const LAVA_LINES = ['"Vai querer o pretinho no pneu?"', '"Areia de novo? Esse pessoal da praia..."', '"Deixa comigo que sai brilhando!"'];

function lavaMenu(place) {
  const c = S.car, items = [], reopen = () => lavaMenu(place);
  if (c.problems.dirty) items.push(shopItem(PROBLEMS.dirty.fix, PROBLEMS.dirty.cost, () => { c.problems.dirty = false; toast('Carro limpinho e cheiroso!', 'good'); }, reopen, ['dirty']));
  const sub = items.length ? R.pick(LAVA_LINES) : (Veh.twoWheel() ? `${Veh.noun()[0].toUpperCase() + Veh.noun().slice(1)} não junta areia por dentro. Tá liberado!` : 'Seu carro está limpinho! Nada pra lavar.');
  showModal(`LAVA JATO · ${place.name}`, sub, items);
}

const PLACE_CLOSED = { oficina: 'A oficina', posto: 'O posto', lavajato: 'O lava jato' };
function openPlaceMenu(pl) {
  if (GAME.mode === 'multi' && !Multi.moneyLive()) {
    toast(`${PLACE_CLOSED[pl.kind]} só abre durante o turno.`);
    return;
  }
  player.vx = player.vy = 0; player.speed = 0;
  Garagem.pushing = false;
  if (pl.kind === 'casa') Garagem.menu();
  else if (pl.kind === 'oficina') garageMenu(pl);
  else if (pl.kind === 'lavajato') lavaMenu(pl);
  else postoMenu(pl);
}

function openPause(confirmReset) {
  if (GAME.mode === 'multi') {
    showModal(`PAUSA · SALA ${Multi.sala}`, 'O jogo continua para os outros: seu carro fica parado onde está.', [
      { label: 'Continuar', run: closeModal },
      ...Multi.pauseItems(),
      { label: `Direção fácil: ${Easy.on ? 'LIGADA' : 'desligada'}`, run: () => { Easy.toggle(true); openPause(); } },
      { label: Sfx.muted ? 'Ligar o som' : 'Desligar o som', run: () => { Sfx.setMuted(!Sfx.muted); openPause(); } },
      { label: 'Ajuda: todas as regras', run: openHelp },
      { label: 'Copiar o link da sala', run: () => {
        navigator.clipboard.writeText(location.href).then(() => toast('Link copiado!', 'good'),
          () => toast('Não deu pra copiar. Use o endereço da barra do navegador.', 'warn'));
      } },
      { label: 'Sair da sala', run: () => Multi.leave() },
    ], 'Voltar');
    return;
  }
  if (Veh.cur.guided) {
    const trips = { aereo: S.airTrips, barcas: S.ferryTrips, vlt: S.vltTrips };
    const summary = Veh.job === 'passeador' ? 'Passeios concluídos: ' + S.dogWalks : 'Viagens concluídas: ' + trips[Veh.job];
    showModal('PAUSA · ' + Veh.cur.app, summary, [
      { label: 'Continuar', run: closeModal },
      { label: 'Trocar modalidade', run: () => Garagem.jobsMenu() },
      { label: 'Trocar estação do rádio', run: () => { closeModal(); Radio.next(); } },
      { label: 'Ajuda: todas as regras', run: openHelp },
    ], 'Voltar');
    return;
  }
  if (Veh.cur.school) {
    showModal('PAUSA · AUTOESCOLA', `Aulas concluídas: ${Autoescola.passed()} de ${LESSONS.length} · Estrelas: ${Autoescola.totalStars()} de ${LESSONS.length * 3}` +
      (Autoescola.prog.cnh ? ' · Carteira: ✓' : ''), [
      { label: 'Continuar', run: closeModal },
      { label: 'Escolher a aula', run: () => Autoescola.lessonMenu() },
      { label: `Direção fácil: ${Easy.on ? 'LIGADA' : 'desligada'}`, run: () => { Easy.toggle(true); openPause(); } },
      { label: Sfx.muted ? 'Ligar o som (e a voz do instrutor)' : 'Desligar o som (e a voz do instrutor)', run: () => { Sfx.setMuted(!Sfx.muted); openPause(); } },
      { label: 'Ajuda: todas as regras', run: openHelp },
    ], 'Voltar', true);
    return;
  }
  showModal('PAUSA', `${Veh.job === 'onibus' ? 'Passageiros transportados' : Veh.job === 'policia' ? 'Ocorrências atendidas' : Veh.job === 'ambulancia' ? 'Resgates' : Veh.job === 'envios' ? 'Envios' : Veh.cur.shuttle ? 'Trechos escolares' : Veh.cur.parcels ? 'Pacotes' : Veh.cur.delivery ? 'Entregas' : 'Corridas'}: ${Veh.job === 'onibus' ? S.busPassengers : Veh.job === 'policia' ? S.ocorrencias : Veh.job === 'ambulancia' ? S.rescues : Veh.job === 'envios' ? S.envios : Veh.cur.shuttle ? S.schoolLegs : Veh.cur.parcels ? S.parcels : S.rides} · Total ganho: ${fmtMoney(S.earned)} · Nota: ${Rides.ratingAvg().toFixed(2).replace('.', ',')}`, [
    { label: 'Continuar', run: closeModal },
    { label: 'Trocar modalidade', run: () => Garagem.jobsMenu() },
    { label: 'Minha casa', run: () => { if (Garagem.atHome()) Garagem.menu(); else { closeModal(); Nav.go('casa'); } } },
    ...(!Veh.twoWheel() && S.car.problems.flat ? [{ label: S.car.spare ? 'Montar estepe · grátis' : 'Estepe usado · reponha na oficina', disabled: !S.car.spare || player.speed >= 8, run: () => { closeModal(); Garagem.spare(); } }] : []),
    ...(!Rides.canWork() || Garagem.pushing ? [{ label: Garagem.pushing ? 'Voltar ao volante' : 'Descer e empurrar', run: () => { closeModal(); Garagem.push(); } }] : []),
    { label: `Direção fácil: ${Easy.on ? 'LIGADA' : 'desligada'}`, run: () => { Easy.toggle(true); openPause(); } },
    { label: Sfx.muted ? 'Ligar o som' : 'Desligar o som', run: () => { Sfx.setMuted(!Sfx.muted); openPause(); } },
    { label: 'Ajuda: todas as regras', run: openHelp },
    { label: confirmReset ? 'Tem certeza? Clique de novo pra apagar tudo' : 'Recomeçar do zero', run: () => {
      if (!confirmReset) { openPause(true); return; }
      S = defaultSave(); writeSave(); location.reload();
    } },
  ], 'Voltar');
}

// página de ajuda numa aba nova (o jogo fica pausado aqui)
function openHelp() { window.open('ajuda.html', '_blank', 'noopener'); }

function callTow() {
  const c = S.car;
  const kind = c.health <= 0 ? 'oficina' : (Care.empty() ? Care.station() : null);
  if (!kind) { toast('O guincho só vem quando o carro não anda (quebrado ou sem energia).', 'warn'); return; }
  // já está no lugar certo: o guincho não tem para onde levar (e não cobra de novo)
  const here = city.placeAt(player.x, player.y);
  if (here && Nav.matches(here, kind)) {
    toast(`Você já está ${kind === 'oficina' ? 'na oficina' : 'no posto'}. O guincho não precisa vir.`, 'warn');
    openPlaceMenu(here);
    return;
  }
  if (Veh.job === 'onibus') Onibus.cancel(true);
  else if (Veh.job === 'gincana') Gincana.cancel();
  else if (Veh.job === 'policia') Patrulha.cancel();
  else if (Veh.job === 'ambulancia') Ambulancia.cancel(true);
  else if (Veh.job === 'envios') Envios.cancel(true);
  else if (Veh.cur.shuttle) Escolar.cancel(true);
  else if (Veh.cur.parcels) Parcels.cancel(true);
  else if (Rides.ride) Rides.cancel(true);
  const best = Nav.nearest(kind);
  if (!best) return;
  const free = GAME.mode === 'multi' && !Multi.moneyLive(); // fora do turno da sala, o guincho é de graça
  if (!free) Care.charge(TOW_COST, 'guincho');
  toast(free ? `Guincho: te deixamos em ${best.name}.` : `Guincho: -${fmtMoney(TOW_COST)}. Te deixamos em ${best.name}.`, 'bad');
  placeCarAt(best);
  Multi.onTeleport();
  lastPlace = null;
  cam.x = player.x; cam.y = player.y;
}

// ---------- navegação até o posto, a oficina ou o lava jato mais perto (O, P, L) ----------
const NAV_NAMES = { oficina: 'oficina', posto: 'posto', lavajato: 'lava jato', casa: 'casa', recarga: 'ponto de recarga' };
const Nav = {
  place: null, kind: null,
  matches(p, kind) { return kind === 'recarga' ? p === Garagem.charger : p.kind === kind; },
  nearest(kind) {
    if (kind === 'casa') return Garagem.home;
    const distance = p => Math.hypot(p.cx - player.x, p.cy - player.y);
    return city.places.filter(p => this.matches(p, kind)).sort((a,b) => distance(a) - distance(b))[0];
  },
  // aperta de novo a mesma tecla para cancelar
  toggle(kind) {
    if (this.place && this.kind === kind) { this.clear(); toast('Navegação cancelada.'); return; }
    this.go(kind);
  },
  go(kind) {
    const best = this.nearest(kind);
    if (!best) return;
    this.place = best; this.kind = kind;
    const bd = Math.hypot(best.cx - player.x, best.cy - player.y);
    if (!Veh.cur.school && player.speed < 8 && (kind === 'casa' ? Garagem.atHome() : city.placeAt(player.x, player.y) === best)) {
      this.clear(); lastPlace = best; openPlaceMenu(best); return;
    }
    const extra = best.cheap ? ' (gasolina batizada!)' : '';
    toast(`Seta para ${best.name}${extra}, ${NAV_NAMES[kind]} mais perto (${kmStr(bd)}). A mesma tecla cancela.`);
  },
  clear(msg) { this.place = null; if (msg) toast(msg, 'good'); },
  target() { return this.place ? { x: this.place.cx, y: this.place.cy, kind: 'nav', place: this.kind } : null; },
};

// ---------- simulação ----------
// atropelou alguém (pedestre ou criança na frente do colégio): multa e polícia
function onPedHit(who) {
  if (Veh.cur.school) { Autoescola.onPedHit(); player.vx *= 0.85; player.vy *= 0.85; return; }
  Care.charge(RUN_OVER_FINE, 'multa');
  toast(`Você atropelou ${who === 'criança' ? 'uma criança' : 'um pedestre'}! Multa de ${fmtMoney(RUN_OVER_FINE)}.`, 'bad');
  Sfx.bad(); activeJob().onImpact(80);
  player.vx *= 0.85; player.vy *= 0.85;
  Police.alert('atropelamento');
}

function driveRoad(inp, dt, m) {
  if (Garagem.pushing) Garagem.stepPush(player, inp, dt);
  else stepPlayer(player, inp, dt, m);
  Easy.assist(player, inp, dt);  // direção fácil: volante se endireita
  Easy.autoBrake(player, dt);    // e freio automático
  // batida em outro jogador conta metade (ninguém controla o carro do outro)
  // viaturas e rivais empurram antes, para a colisão com o cenário ter a palavra final (nada de ser empurrado para dentro da água)
  const pushed = Math.max(Multi.collide(player) * 0.5, Police.collide(player));
  const imp = Math.max(collidePlayer(player, city, traffic.cars, m.wallSlide), pushed);
  if (imp > 35) {
    Care.onImpact(imp); activeJob().onImpact(imp);
    Sfx.crash(clamp(imp / 220, 0.15, 1));
    shake = Math.min(5, imp / 40);
    if (imp > 60) for (let k = 0; k < 8; k++)
      particles.push({ x: player.x + Math.cos(player.a) * 8, y: player.y + Math.sin(player.a) * 8,
        vx: R.f(-60, 60), vy: R.f(-60, 60), life: 0.4, max: 0.4, size: 1, col: '#ffd27a', grow: 0 });
  }
}

function update(dt) {
  time += dt; gameMin += dt;
  const surface = city.tileAtPx(player.x, player.y);
  const px = player.x, py = player.y, inp = Multi.frozen() ? NO_INPUT : input; // na contagem 3-2-1 o carro espera
  const guided = Veh.cur.guided;
  const walking = Veh.job === 'passeador';
  if (walking) Passeador.drive(player, inp, dt, traffic.cars.concat(Police.cops));
  else if (guided) activeJob().drive(player, inp, dt);
  else driveRoad(inp, dt, Easy.mods(Care.mods(surface)));
  const moved = Math.hypot(player.x - px, player.y - py);
  if (!guided && !Garagem.pushing) Care.update(dt, player, moved);
  else Care.stallT = Math.max(0, Care.stallT - dt);
  const airborne = Veh.job === 'aereo';
  traffic.update(dt, player, airborne, walking);
  const hits = peds.update(dt, player, airborne || walking);
  for (let k = 0; k < hits; k++) onPedHit('pedestre');
  if (!guided) {
    World.update(dt, player);
    Signals.update(dt, player);
    Police.update(dt, player);
  }
  if (Garagem.enabled) Escolar.tickClass(dt);
  activeJob().update(dt, player);

  // marcas de pneu (ficam pintadas no mapa)
  const fx = Math.cos(player.a), fy = Math.sin(player.a), rx = -fy, ry = fx;
  const wheels = [[player.x - fx * 5 + rx * 3, player.y - fy * 5 + ry * 3], [player.x - fx * 5 - rx * 3, player.y - fy * 5 - ry * 3]];
  const sliding = !guided && (Math.abs(player.vR) > 50 || (input.hb && player.speed > 40) || (player.braking && player.speed > 140));
  if (sliding && prevWheels && Math.hypot(wheels[0][0] - prevWheels[0][0], wheels[0][1] - prevWheels[0][1]) < 12) {
    mapCtx.strokeStyle = surface === T.GRASS ? 'rgba(70,45,20,0.45)' : 'rgba(16,16,18,0.4)';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    for (let k = 0; k < 2; k++) { mapCtx.moveTo(prevWheels[k][0], prevWheels[k][1]); mapCtx.lineTo(wheels[k][0], wheels[k][1]); }
    mapCtx.stroke();
  }
  prevWheels = wheels;
  Sfx.screech(sliding && surface !== T.GRASS ? clamp(Math.abs(player.vR) / 120 + 0.3, 0, 1) : 0);

  if ((S.car.health < 30 || Care.overheated) && R.chance(dt * (Care.overheated ? 25 : 12)))
    particles.push({ x: player.x + fx * 7, y: player.y + fy * 7, vx: R.f(-8, 8) + player.vx * 0.2, vy: R.f(-8, 8) + player.vy * 0.2 - 6,
      life: 1.2, max: 1.2, size: 2, col: Care.overheated ? '#e6e6e6' : '#555', grow: 3 });
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.size += p.grow * dt;
  }
  for (let k = floaters.length - 1; k >= 0; k--) {
    const f = floaters[k];
    f.t += dt; f.y -= 12 * dt;
    if (f.t > 1.6) floaters.splice(k, 1);
  }

  const pl = airborne || walking ? null : city.placeAt(player.x, player.y);
  if (pl && pl === Nav.place) Nav.clear(`Você chegou: ${pl.name}.`);
  if (pl && pl !== lastPlace && (player.speed < 18 || Garagem.pushing) && !Veh.cur.school) { lastPlace = pl; openPlaceMenu(pl); }
  if (!pl) lastPlace = null;

  Sfx.engine(clamp(player.speed / 230, 0, 1), player.throttle, !walking && !Garagem.pushing && !Veh.cur.electric && !Veh.cur.pedal && !Care.empty() && S.car.health > 0 && Care.stallT <= 0); // bike não ronca

  cam.x += (player.x + player.vx * 0.4 - cam.x) * Math.min(1, 4 * dt);
  cam.y += (player.y + player.vy * 0.4 - cam.y) * Math.min(1, 4 * dt);
  shake = Math.max(0, shake - dt * 12);
  saveT -= dt;
  if (saveT <= 0) { saveT = 5; writeSave(); }
}

// ---------- desenho ----------
function drawCar(spr, x, y, a, braking) {
  world3D.vehicle(spr, x, y, a, braking, spr === SPR.player, spr === Police.spr, ctx.globalAlpha);
}

const world3D = BandeiraView.create({ canvas: $('world3d'), surface: canvas, atlas: mapCanvas, city, overhead, lamps: Light.lamps });
function render(dt) {
  const vw = view.w, vh = view.h;
  let cx = cam.x - vw / 2, cy = cam.y - vh / 2;
  if (shake > 0) { cx += R.f(-shake, shake); cy += R.f(-shake, shake); }
  const ferry = Veh.job === 'barcas';
  const padX = ferry ? vw / 2 : 0, padY = ferry ? vh / 2 : 0;
  camX = Math.round(clamp(cx, -padX, Math.max(0, mapCanvas.width - vw + padX)));
  camY = Math.round(clamp(cy, -padY, Math.max(0, mapCanvas.height - vh + padY)));

  const flying = Veh.job === 'aereo' && S.flight?.boarded;
  const flightHeight = Veh.job === 'aereo' ? (flying ? 69 : world3D.height(player.x, player.y) + 1) : 0;
  world3D.begin({ player, focus: cam, flightHeight, flying, walking: Veh.job === 'passeador',
    siren: Patrulha.sirenOn, time, dt, dark: Light.darkness(gameMin) / NIGHT_MAX });
  drawing3D = true;
  ctx.fillStyle = PAL.water; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(mapCanvas, camX, camY, Math.min(vw, mapCanvas.width), Math.min(vh, mapCanvas.height),
    0, 0, Math.min(vw, mapCanvas.width), Math.min(vh, mapCanvas.height));

  if (Veh.job === 'vlt') VLT.drawTrack(ctx, camX, camY);

  // áreas de tarifa dinâmica
  ctx.font = '12px VT323, monospace'; ctx.textAlign = 'center';
  for (const s of Veh.cur.school || Veh.cur.parcels || Veh.cur.shuttle || Veh.job === 'policia' || Veh.job === 'ambulancia' || Veh.job === 'onibus' || Veh.cur.guided ? [] : Rides.surges) {
    const sx = s.x - camX, sy = s.y - camY;
    if (sx + s.r < 0 || sy + s.r < 0 || sx - s.r > vw || sy - s.r > vh) continue;
    const a = clamp(Math.min(s.age / 2, (s.life - s.age) / 2), 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,120,20,0.10)';
    ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([4, 4]); ctx.lineDashOffset = -time * 8;
    ctx.strokeStyle = 'rgba(255,150,40,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#000'; ctx.fillText('DINÂMICA ' + multStr(s.mult), Math.round(sx) + 1, Math.round(sy) + 1);
    ctx.fillStyle = '#ffb347'; ctx.fillText('DINÂMICA ' + multStr(s.mult), Math.round(sx), Math.round(sy));
    ctx.globalAlpha = 1;
  }

  // ícones flutuando sobre postos e oficinas
  for (const p of city.places) {
    if (p.kind === 'casa') continue;
    const sx = Math.round(p.cx - camX), sy = Math.round(p.cy - camY + Math.sin(time * 3 + p.cx) * 2);
    if (sx < -20 || sy < -20 || sx > vw + 20 || sy > vh + 20) continue;
    const ic = p.kind === 'posto' ? ICONS.fuel : p.kind === 'lavajato' ? ICONS.drop : ICONS.wrench;
    const hasCharger = Garagem.enabled && p === Garagem.charger;
    const left = sx - ic.width - (hasCharger ? 10 : 0);
    ctx.drawImage(ic, left, sy - ic.height - 4, ic.width * 2, ic.height * 2);
    if (hasCharger) ctx.drawImage(ICONS.charge, left + ic.width * 2 + 4, sy - 12, 16, 16);
  }

  Signals.draw(ctx, camX, camY, vw, vh);
  World.draw(ctx, camX, camY, vw, vh);
  Delivery.draw(ctx, camX, camY, vw, vh);
  Parcels.draw(ctx, camX, camY, vw, vh);
  peds.draw(ctx, camX, camY, vw, vh);
  activeJob().drawWorld(ctx, camX, camY);
  for (const n of traffic.cars) drawCar(SPR.npc[n.ci], n.x, n.y, n.a, n.speed < 5);
  Police.draw();
  Multi.drawCars();
  if (Multi.ghostT > 0) ctx.globalAlpha = Math.floor(time * 8) % 2 ? 0.35 : 0.7; // pisca enquanto é fantasma
  if (Garagem.pushing) drawPedSprite(ctx, player.x - Math.cos(player.a)*12 - camX, player.y - Math.sin(player.a)*12 - camY, '#78bffa', '#604028', player.speed ? time*5 : 0, false);
  if (Veh.job === 'passeador') drawPedSprite(ctx, player.x - camX, player.y - camY, Veh.cur.color, '#573826', player.speed ? time * 8 : 0, false);
  else drawCar(SPR.player, player.x, player.y, player.a, player.braking);
  ctx.globalAlpha = 1;

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.7;
    ctx.fillStyle = p.col;
    const s = Math.max(1, Math.round(p.size));
    ctx.fillRect(Math.round(p.x - camX - s / 2), Math.round(p.y - camY - s / 2), s, s);
  }
  ctx.globalAlpha = 1;

  // noite: escurece tudo e recorta faróis e postes
  const moto = Veh.twoWheel();
  const lit = Veh.job === 'passeador' ? [] : [{ x: player.x, y: player.y, a: player.a, front: moto ? 6 : 8, len: 95, spread: moto ? 0.32 : 0.42 }];
  for (const n of traffic.cars) lit.push({ x: n.x, y: n.y, a: n.a, front: 8, len: 50, k: 0.7 });
  Multi.lightCars(lit);
  Police.lightCars(lit);
  Light.render(ctx, vw, vh, camX, camY, lit, (L) => {
    World.drawLights(L, camX, camY); Delivery.drawLights(L, camX, camY); Parcels.drawLights(L, camX, camY); Autoescola.drawLights(L, camX, camY); Signals.drawLights(L, camX, camY);
  });
  Police.drawGlow();
  if (Patrulha.sirenOn) {
    ctx.save(); ctx.translate(Math.round(player.x - camX), Math.round(player.y - camY)); ctx.rotate(player.a);
    const flip = Math.floor(time * 5) % 2;
    ctx.shadowBlur = 8;
    ctx.fillStyle = ctx.shadowColor = flip ? '#ff3344' : '#fff'; ctx.fillRect(-2, -4, 3, 4);
    ctx.fillStyle = ctx.shadowColor = flip ? '#fff' : '#437cff'; ctx.fillRect(-2, 0, 3, 4);
    ctx.restore();
  }
  Multi.drawTags();

  // seta orbitando o carro apontando o objetivo
  const tg = Nav.target() || (GAME.mode === 'multi' && Pega.target()) || activeJob().target();
  if (tg && mode !== 'title') {
    const ic = tg.kind === 'pick' ? ICONS.arrowGo : tg.kind === 'pega' ? ICONS.arrowPega : tg.kind === 'nav' ? ICONS['arrow_' + tg.place] : ICONS.arrowDrop;
    world3D.direction(tg, ic);
  }

  for (const f of floaters) world3D.worldText(f.text, f.x, f.y, f.col, 15);
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  if (canDrive()) {
    acc += dt;
    while (acc >= STEP && canDrive()) { update(STEP); acc -= STEP; }
  } else {
    acc = 0;
    if (mode === 'title') { time += dt; traffic.update(dt, player); peds.update(dt, player); }
  }
  Multi.update(dt); // roda até no menu: o jogo continua para os outros
  render(dt);
  drawing3D = false;
  world3D.finish(camX, camY);
  if (mode !== 'title') HUD.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
