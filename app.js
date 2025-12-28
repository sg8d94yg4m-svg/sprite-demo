// VNA sprite demo (2D) + Missioni via REST/WS (passivo per ora)
// - Carrello rallentato di 1,5x
// - Doppia cross-aisle + regola (posti 1..10 -> bassa, 11..20 -> testata)
// - Pre-stoccaggi in testata (1 per corsia, livello 1) per ora solo disegnati
// - Missione: "scaffale-posto-livello-missione" (1..3), ricevuta via WS/REST e applicata al target

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

const sprites = { truck: new Image(), fork: new Image(), loaded: false };
sprites.truck.src = 'assets/truck_base.png';
sprites.fork.src = 'assets/fork.png';
let loadCount = 0;
[sprites.truck, sprites.fork].forEach(img => {
  img.onload = () => { if (++loadCount === 2) sprites.loaded = true; };
  img.onerror = () => console.warn('Errore caricamento sprite:', img.src);
});

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

const mission = { code: 1, lastRaw: '' };

const trolley = {
  x: aisleCenterX(1),
  y: posY(1),
  headingDeg: 0,
  forkRelDeg: 90,
  speed: 220 / 1.5,
};

const target = {
  active: false, x: 0, y: 0,
  corridoio: 1, posto: 1, livello: 1, scaffale: 1, side: 'right',
};

let waypoints = [];
let moving = false;

ui.btnForkLeft.onclick = () => trolley.forkRelDeg = -90;
ui.btnForkRight.onclick = () => trolley.forkRelDeg = 90;
ui.btnStop.onclick = () => { moving = false; waypoints = []; };

ui.btnVai.onclick = () => {
  const sca = clamp(parseInt(ui.scaffale.value || '1', 10), 1, 12);
  const pos = clamp(parseInt(ui.posto.value || '1', 10), 1, 20);
  const liv = clamp(parseInt(ui.livello.value || '1', 10), 1, 5);
  const mis = clamp(parseInt(ui.missione.value || '1', 10), 1, 3);
  applyMission({scaffale: sca, posto: pos, livello: liv, missione: mis, raw: 'manual'});
};

function chooseCrossYForTarget(){
  const half = MAP.positions / 2;
  return (target.posto <= half) ? crossAisleYBottom() : crossAisleYTop();
}

function buildPathToTarget(){
  const cxNow = trolley.x;
  const sameCorridor = Math.abs(cxNow - target.x) < 1.0;
  if (sameCorridor){ waypoints = [{x: target.x, y: target.y}]; return; }
  const yCross = chooseCrossYForTarget();
  waypoints = [{x: cxNow, y: yCross},{x: target.x, y: yCross},{x: target.x, y: target.y}];
}

function setHeadingToward(dx, dy){
  if (Math.abs(dx) > Math.abs(dy)) trolley.headingDeg = dx > 0 ? 90 : 270;
  else trolley.headingDeg = dy > 0 ? 180 : 0;
}

function parseMissionString(s){
  const m = String(s).trim().match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!m) return null;
  return {scaffale:+m[1], posto:+m[2], livello:+m[3], missione:+m[4], raw:String(s).trim()};
}

function applyMission(obj){
  if (!obj) return;
  const sca = clamp(parseInt(obj.scaffale,10), 1, 12);
  const pos = clamp(parseInt(obj.posto,10), 1, 20);
  const liv = clamp(parseInt(obj.livello,10), 1, 5);
  const mis = clamp(parseInt(obj.missione,10), 1, 3);

  mission.code = mis;
  mission.lastRaw = obj.raw || `${sca}-${pos}-${liv}-${mis}`;

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

// WS client
function wsUrl(){
  const proto = (location.protocol === 'https:') ? 'wss:' : 'ws:';
  const host = location.host || 'localhost:8080';
  return `${proto}//${host}/ws`;
}
function connectWS(){
  try {
    ui.dbgServer.textContent = 'WS connecting…';
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => ui.dbgServer.textContent = 'WS connected';
    ws.onclose = () => ui.dbgServer.textContent = 'WS disconnected';
    ws.onerror = () => ui.dbgServer.textContent = 'WS error';
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data && data.scaffale) applyMission({...data, raw: ev.data});
      } catch {
        const parsed = parseMissionString(ev.data);
        if (parsed) applyMission(parsed);
      }
    };
  } catch {
    ui.dbgServer.textContent = 'WS not available';
  }
}
connectWS();

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
