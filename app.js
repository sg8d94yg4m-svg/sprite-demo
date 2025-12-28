// VNA sprite demo (2D) — Codespaces
// Missioni: endpoint richiesto POST /setMissione
// Fallback: GET /checkMissione (polling)
// WS: /ws (se disponibile)

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

const ui = {
  corridoio: document.getElementById('corridoio'),
  posto: document.getElementById('posto'),
  livello: document.getElementById('livello'),
  scaffale: document.getElementById('scaffale'),
  missione: document.getElementById('missione'),
  btnVai: document.getElementById('btnVai'),
  btnStop: document.getElementById('btnStop'),
  btnForkLeft: document.getElementById('btnForkLeft'),
  btnForkRight: document.getElementById('btnForkRight'),
  dbgPos: document.getElementById('dbgPos'),
  dbgHeading: document.getElementById('dbgHeading'),
  dbgFork: document.getElementById('dbgFork'),
  dbgTarget: document.getElementById('dbgTarget'),
  dbgMission: document.getElementById('dbgMission'),
  dbgServer: document.getElementById('dbgServer'),
};

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function degToRad(d){ return d * Math.PI / 180; }

const MAP = {
  corridors: 6,
  positions: 20,
  levels: 5,
  margin: {x: 110, y: 70},
  aisleGap: 150,
  laneWidth: 46,
  shelfDepth: 60,
  posGap: 26,
  topY: 90,
  crossAisleHeight: 70,
  crossAislePadding: 22,
  prestockW: 56,
  prestockH: 34,
  prestockOffsetX: 110,
  prestockOffsetY: 0,
};

// Sprites
const sprites = { truck: new Image(), fork: new Image(), loaded: false };
sprites.truck.src = 'assets/truck_base.png';
sprites.fork.src = 'assets/fork.png';
let loadCount = 0;
[sprites.truck, sprites.fork].forEach(img => {
  img.onload = () => { if (++loadCount === 2) sprites.loaded = true; };
  img.onerror = () => console.warn('Errore caricamento sprite:', img.src);
});

// Helpers
function corridorFromShelf(s){ return Math.ceil(s / 2); }
function shelfSideFromShelf(s){ return (s % 2 === 1) ? 'left' : 'right'; }
function aisleCenterX(c){ return MAP.margin.x + (c - 1) * MAP.aisleGap; }
function posY(p){ return MAP.topY + (p - 1) * MAP.posGap; }
function crossAisleYTop(){ return MAP.topY - MAP.crossAislePadding - MAP.crossAisleHeight/2; }
function crossAisleYBottom(){ return MAP.topY + (MAP.positions - 1) * MAP.posGap + MAP.crossAislePadding + MAP.crossAisleHeight/2; }
function shelfOffsetX(side){
  const sign = side === 'left' ? -1 : 1;
  return sign * (MAP.laneWidth/2 + MAP.shelfDepth/2);
}
function prestockRect(c){
  const x = aisleCenterX(c) + MAP.prestockOffsetX - MAP.prestockW/2;
  const y = crossAisleYTop() - MAP.prestockH/2 + MAP.prestockOffsetY;
  return {x, y, w: MAP.prestockW, h: MAP.prestockH};
}

// Mission state
const mission = { code: 1, lastRaw: '', lastSeq: 0 };

// Trolley
const trolley = {
  x: aisleCenterX(1),
  y: posY(1),
  headingDeg: 0,
  forkRelDeg: 90,
  speed: 220 / 1.5, // rallentato di 1,5x
};

const target = { active:false, x:0, y:0, corridoio:1, posto:1, livello:1, scaffale:1, side:'right' };
let waypoints = [];
let moving = false;

// UI
ui.btnForkLeft.onclick = () => trolley.forkRelDeg = -90;
ui.btnForkRight.onclick = () => trolley.forkRelDeg = 90;
ui.btnStop.onclick = () => { moving = false; waypoints = []; };

ui.btnVai.onclick = async () => {
  const sca = clamp(parseInt(ui.scaffale.value || '1', 10), 1, 12);
  const pos = clamp(parseInt(ui.posto.value || '1', 10), 1, 20);
  const liv = clamp(parseInt(ui.livello.value || '1', 10), 1, 5);
  const mis = clamp(parseInt(ui.missione.value || '1', 10), 1, 3);

  // Applica in locale e invia al server /setMissione (se attivo)
  applyMission({scaffale: sca, posto: pos, livello: liv, missione: mis, raw: 'manual'});
  try{ await fetch('/setMissione', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({scaffale:sca, posto:pos, livello:liv, missione:mis})}); }catch(_e){}
};

// Routing
function chooseCrossYForTarget(){
  const half = MAP.positions / 2;
  return (target.posto <= half) ? crossAisleYBottom() : crossAisleYTop();
}
function buildPathToTarget(){
  const cxNow = trolley.x;
  const same = Math.abs(cxNow - target.x) < 1.0;
  if (same){ waypoints = [{x:target.x, y:target.y}]; return; }
  const yCross = chooseCrossYForTarget();
  waypoints = [{x:cxNow, y:yCross},{x:target.x, y:yCross},{x:target.x, y:target.y}];
}
function setHeadingToward(dx, dy){
  if (Math.abs(dx) > Math.abs(dy)) trolley.headingDeg = dx > 0 ? 90 : 270;
  else trolley.headingDeg = dy > 0 ? 180 : 0;
}

// Mission handling
function applyMission(obj){
  if (!obj) return;
  const sca = clamp(parseInt(obj.scaffale,10), 1, 12);
  const pos = clamp(parseInt(obj.posto,10), 1, 20);
  const liv = clamp(parseInt(obj.livello,10), 1, 5);
  const mis = clamp(parseInt(obj.missione,10), 1, 3);
  mission.code = mis;
  mission.lastRaw = obj.raw || `${sca}-${pos}-${liv}-${mis}`;
  if (obj.seq) mission.lastSeq = Math.max(mission.lastSeq, parseInt(obj.seq,10));

  ui.scaffale.value = String(sca);
  ui.posto.value = String(pos);
  ui.livello.value = String(liv);
  ui.missione.value = String(mis);

  const corr = corridorFromShelf(sca);
  const side = shelfSideFromShelf(sca);
  ui.corridoio.value = String(corr);

  target.active = true;
  target.corridoio = corr;
  target.posto = pos;
  target.livello = liv;
  target.scaffale = sca;
  target.side = side;
  target.x = aisleCenterX(corr);
  target.y = posY(pos);

  buildPathToTarget();
  moving = true;
}

// WS preferred, polling fallback
let wsOk = false;
ui.dbgServer.textContent = 'Endpoint: /setMissione';

function wsUrl(){
  const proto = (location.protocol === 'https:') ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function startWS(){
  try{
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => { wsOk = true; ui.dbgServer.textContent = 'Endpoint: /setMissione • WS ok'; };
    ws.onclose = () => { wsOk = false; ui.dbgServer.textContent = 'Endpoint: /setMissione • WS closed (polling)'; };
    ws.onerror = () => { wsOk = false; ui.dbgServer.textContent = 'Endpoint: /setMissione • WS error (polling)'; };
    ws.onmessage = (ev) => {
      try{
        const data = JSON.parse(ev.data);
        if (data && data.scaffale) applyMission({...data, raw: ev.data});
      }catch(_e){}
    };
  }catch(_e){
    wsOk = false;
    ui.dbgServer.textContent = 'Endpoint: /setMissione • WS n/a (polling)';
  }
}

async function poll(){
  if (wsOk) return;
  try{
    const r = await fetch('/checkMissione', {cache:'no-store'});
    const j = await r.json();
    const m = j && j.mission;
    if (m && m.seq && m.seq > mission.lastSeq){
      applyMission({...m, raw: `${m.scaffale}-${m.posto}-${m.livello}-${m.missione}`});
    }
  }catch(_e){}
}

startWS();
setInterval(poll, 1000);

// Drawing
function drawCrossAisle(yCenter, label){
  const leftEdge = aisleCenterX(1) - (MAP.laneWidth/2 + MAP.shelfDepth + 40);
  const rightEdge = aisleCenterX(MAP.corridors) + (MAP.laneWidth/2 + MAP.shelfDepth + 40);
  const top = yCenter - MAP.crossAisleHeight/2;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(leftEdge, top, rightEdge-leftEdge, MAP.crossAisleHeight, 14);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#666';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(label, leftEdge + 12, top + 22);
  ctx.restore();
}

function drawPrestock(){
  ctx.save();
  ctx.strokeStyle = '#b98c00';
  ctx.lineWidth = 2;
  ctx.font = '11px system-ui, sans-serif';
  for (let c=1;c<=MAP.corridors;c++){
    const r = prestockRect(c);
    ctx.fillStyle = '#ffe8b5';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#5a4300';
    ctx.fillText(`PRE C${c}`, r.x + 6, r.y + 20);
  }
  ctx.restore();
}

function drawWarehouse(){
  drawCrossAisle(crossAisleYTop(), 'CROSS-AISLE TESTATA (ALTA)');
  drawCrossAisle(crossAisleYBottom(), 'CROSS-AISLE BASSA');
  drawPrestock();

  for (let c=1;c<=MAP.corridors;c++){
    const cx = aisleCenterX(c);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - MAP.laneWidth/2, MAP.topY - 22, MAP.laneWidth, MAP.posGap*(MAP.positions-1) + 44, 12);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    for (const side of ['left','right']){
      const sx = cx + shelfOffsetX(side) - MAP.shelfDepth/2;
      const sy = MAP.topY - 22;
      const h = MAP.posGap*(MAP.positions-1) + 44;
      ctx.save();
      ctx.fillStyle = '#7a7a7a';
      ctx.globalAlpha = 0.70;
      ctx.fillRect(sx, sy, MAP.shelfDepth, h);
      ctx.restore();
    }

    const shelfL = (c*2)-1;
    const shelfR = (c*2);
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`C${c}`, cx - 10, MAP.topY - 34);
    ctx.fillStyle = '#555';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`S${shelfL} / S${shelfR}`, cx - 24, MAP.topY - 18);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '11px system-ui, sans-serif';
  for (let p=1;p<=MAP.positions;p+=2){
    ctx.fillText(`${p}`, 22, posY(p) + 4);
  }
  ctx.restore();
}

function drawImageCentered(img, x, y, w, h, rotDeg){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(degToRad(rotDeg));
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
}

function drawTrolley(){
  const bodyW = 150, bodyH = 190;
  if (!sprites.loaded){
    ctx.save(); ctx.fillStyle = '#d40000';
    ctx.beginPath(); ctx.arc(trolley.x, trolley.y, 10, 0, Math.PI*2); ctx.fill();
    ctx.restore(); return;
  }
  drawImageCentered(sprites.truck, trolley.x, trolley.y, bodyW, bodyH, trolley.headingDeg);
  const ang = degToRad(trolley.headingDeg);
  const fx = trolley.x + Math.sin(ang) * (bodyH*0.34);
  const fy = trolley.y - Math.cos(ang) * (bodyH*0.34);
  const totalForkDeg = trolley.headingDeg + trolley.forkRelDeg;
  drawImageCentered(sprites.fork, fx, fy, 220, 220, totalForkDeg);
}

function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0,0,cv.width,cv.height);
  drawWarehouse();

  if (target.active){
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#1a7f37';
    ctx.beginPath(); ctx.arc(target.x, target.y, 8, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    const sx = target.x + shelfOffsetX(target.side);
    ctx.save();
    ctx.strokeStyle = '#1a7f37'; ctx.lineWidth = 3;
    ctx.strokeRect(sx - MAP.shelfDepth/2, target.y - 12, MAP.shelfDepth, 24);
    ctx.restore();

    const yCross = chooseCrossYForTarget();
    ctx.save();
    ctx.strokeStyle = '#1a7f37';
    ctx.setLineDash([6,6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(target.x, yCross); ctx.lineTo(target.x, target.y); ctx.stroke();
    ctx.restore();
  }

  drawTrolley();
}

function debug(){
  ui.dbgPos.textContent = `${trolley.x.toFixed(1)}, ${trolley.y.toFixed(1)}`;
  ui.dbgHeading.textContent = `${trolley.headingDeg}°`;
  ui.dbgFork.textContent = `${trolley.forkRelDeg}° (rel)`;
  ui.dbgTarget.textContent = target.active ? `C${target.corridoio} P${target.posto} L${target.livello} S${target.scaffale} (${target.side})` : '—';
  const name = mission.code === 1 ? '1 (prelievo)' : mission.code === 2 ? '2 (deposito)' : '3 (picking)';
  ui.dbgMission.textContent = mission.lastRaw ? `${name} • ${mission.lastRaw}` : '—';
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  }
}

let lastTs = performance.now();
function tick(ts){
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if (moving && waypoints.length){
    const wp = waypoints[0];
    const dx = wp.x - trolley.x;
    const dy = wp.y - trolley.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2){
      trolley.x = wp.x; trolley.y = wp.y;
      waypoints.shift();
      if (!waypoints.length){
        moving = false;
        trolley.forkRelDeg = (target.side === 'left') ? -90 : 90;
      }
    } else {
      setHeadingToward(dx, dy);
      const step = trolley.speed * dt;
      trolley.x += (dx / dist) * Math.min(step, dist);
      trolley.y += (dy / dist) * Math.min(step, dist);
    }
  }

  draw();
  debug();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);


// -----------------------
// Simulatore missioni (UI)
// -----------------------
const sim = {
  missionText: document.getElementById('missionText'),
  btnSend: document.getElementById('btnSendMission'),
  btnQ1: document.getElementById('btnQuick1'),
  btnQ2: document.getElementById('btnQuick2'),
  btnQ3: document.getElementById('btnQuick3'),
  status: document.getElementById('missionSendStatus'),
};

function setSimStatus(msg){
  if (sim.status) sim.status.textContent = msg;
}

async function sendMissionText(text){
  const raw = String(text || '').trim();
  if (!raw){
    setSimStatus('Inserisci una missione tipo 4-12-1-2');
    return;
  }
  setSimStatus('Invio...');
  try{
    const r = await fetch('/setMissione', {
      method: 'POST',
      headers: {'Content-Type':'text/plain'},
      body: raw
    });
    const j = await r.json().catch(()=>null);
    if (!r.ok){
      setSimStatus(`Errore ${r.status}: ${(j && j.error) ? j.error : 'payload non valido'}`);
      return;
    }
    const m = j && j.mission;
    if (m && m.scaffale){
      applyMission({...m, raw});
      setSimStatus(`OK: ${raw}`);
    } else {
      const parsed = parseMissionString(raw);
      if (parsed) applyMission(parsed);
      setSimStatus(`OK: ${raw}`);
    }
  }catch(_e){
    const parsed = parseMissionString(raw);
    if (parsed){
      applyMission(parsed);
      setSimStatus(`Offline: applicata localmente (${raw})`);
    } else {
      setSimStatus('Offline e formato non valido.');
    }
  }
}

if (sim.btnSend){
  sim.btnSend.addEventListener('click', () => sendMissionText(sim.missionText ? sim.missionText.value : ''));
}
if (sim.missionText){
  sim.missionText.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') sendMissionText(sim.missionText.value);
  });
}
if (sim.btnQ1) sim.btnQ1.addEventListener('click', () => { if (sim.missionText) sim.missionText.value='4-12-1-1'; sendMissionText('4-12-1-1'); });
if (sim.btnQ2) sim.btnQ2.addEventListener('click', () => { if (sim.missionText) sim.missionText.value='4-12-1-2'; sendMissionText('4-12-1-2'); });
if (sim.btnQ3) sim.btnQ3.addEventListener('click', () => { if (sim.missionText) sim.missionText.value='4-12-1-3'; sendMissionText('4-12-1-3'); });

