// VNA sprite demo (no middleware)
// - Canvas 2D
// - Carrello top-down (truck_base.png) + fork overlay (fork.png) ruotabile DX/SX
// - Routing: per cambiare corridoio il carrello esce dalla corsia, percorre una "zona esterna" (cross-aisle) e rientra nel corridoio target.
//
// MAPPING corridoio↔scaffali:
//   Corridoio 1 → Scaffale 1 (SX) e 2 (DX)
//   Corridoio 2 → Scaffale 3 (SX) e 4 (DX)
//   ...
//   Corridoio 6 → Scaffale 11 (SX) e 12 (DX)

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

const ui = {
  corridoio: document.getElementById('corridoio'),
  posto: document.getElementById('posto'),
  livello: document.getElementById('livello'),
  scaffale: document.getElementById('scaffale'),
  btnVai: document.getElementById('btnVai'),
  btnStop: document.getElementById('btnStop'),
  btnForkLeft: document.getElementById('btnForkLeft'),
  btnForkRight: document.getElementById('btnForkRight'),
  dbgPos: document.getElementById('dbgPos'),
  dbgHeading: document.getElementById('dbgHeading'),
  dbgFork: document.getElementById('dbgFork'),
  dbgTarget: document.getElementById('dbgTarget'),
};

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function degToRad(d){ return d * Math.PI / 180; }

const MAP = {
  corridors: 6,
  positions: 20,
  levels: 5,

  // layout in pixels
  margin: {x: 110, y: 70},
  aisleGap: 150,     // distanza tra centri corridoio
  laneWidth: 46,     // corsia stretta
  shelfDepth: 60,    // profondità scaffali (uno per lato)
  posGap: 26,        // distanza tra posti lungo corsia
  topY: 90,

  // zona esterna / cross-aisle
  crossAisleHeight: 70,
  crossAislePadding: 20,
};

// Sprites
const sprites = {
  truck: new Image(),
  fork: new Image(),
  loaded: false,
};
sprites.truck.src = 'assets/truck_base.png';
sprites.fork.src = 'assets/fork.png';

let loadCount = 0;
[sprites.truck, sprites.fork].forEach(img => {
  img.onload = () => { if (++loadCount === 2) sprites.loaded = true; };
  img.onerror = () => console.warn('Errore caricamento sprite:', img.src);
});

// Helpers: mapping shelf -> corridor/side
function corridorFromShelf(scaffale){ return Math.ceil(scaffale / 2); }
function shelfSideFromShelf(scaffale){ return (scaffale % 2 === 1) ? 'left' : 'right'; }

function aisleCenterX(corridoio){
  return MAP.margin.x + (corridoio - 1) * MAP.aisleGap;
}
function posY(posto){
  return MAP.topY + (posto - 1) * MAP.posGap;
}
function crossAisleY(){
  return MAP.topY + (MAP.positions - 1) * MAP.posGap + MAP.crossAislePadding + MAP.crossAisleHeight/2;
}
function shelfOffsetX(side){
  const sign = side === 'left' ? -1 : 1;
  return sign * (MAP.laneWidth/2 + MAP.shelfDepth/2);
}

// State: trolley
const trolley = {
  x: aisleCenterX(1),
  y: posY(1),
  headingDeg: 0,      // 0 su, 90 dx, 180 giù, 270 sx
  forkRelDeg: 90,     // default verso DX
  speed: 220,         // px/sec
};

// Target
const target = {
  active: false,
  x: 0, y: 0,
  corridoio: 1,
  posto: 1,
  livello: 1,
  scaffale: 1,
  side: 'right',
};

let waypoints = [];
let moving = false;

// UI events
ui.btnForkLeft.onclick = () => trolley.forkRelDeg = -90;
ui.btnForkRight.onclick = () => trolley.forkRelDeg = 90;

ui.btnStop.onclick = () => { moving = false; waypoints = []; };

ui.btnVai.onclick = () => {
  const sca = clamp(parseInt(ui.scaffale.value || '1', 10), 1, 12);
  const corrDerived = corridorFromShelf(sca);
  const side = shelfSideFromShelf(sca);

  const pos = clamp(parseInt(ui.posto.value || '1', 10), 1, 20);
  const liv = clamp(parseInt(ui.livello.value || '1', 10), 1, 5);

  // Corridoio allineato al mapping scaffale->corridoio
  ui.corridoio.value = String(corrDerived);

  target.active = true;
  target.corridoio = corrDerived;
  target.posto = pos;
  target.livello = liv;
  target.scaffale = sca;
  target.side = side;
  target.x = aisleCenterX(corrDerived);
  target.y = posY(pos);

  buildPathToTarget();
  moving = true;
};

function buildPathToTarget(){
  const cxNow = trolley.x;
  const sameCorridor = Math.abs(cxNow - target.x) < 1.0;

  if (sameCorridor){
    waypoints = [{x: target.x, y: target.y}];
    return;
  }

  const yCross = crossAisleY();
  waypoints = [
    {x: cxNow,    y: yCross},
    {x: target.x, y: yCross},
    {x: target.x, y: target.y},
  ];
}

function setHeadingToward(dx, dy){
  if (Math.abs(dx) > Math.abs(dy)) trolley.headingDeg = dx > 0 ? 90 : 270;
  else trolley.headingDeg = dy > 0 ? 180 : 0;
}

// Update loop
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
      trolley.x = wp.x;
      trolley.y = wp.y;
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

function draw(){
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0, 0, cv.width, cv.height);

  drawWarehouse();

  if (target.active){
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1a7f37';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    const sx = target.x + shelfOffsetX(target.side);
    const sy = target.y;
    ctx.save();
    ctx.strokeStyle = '#1a7f37';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx - MAP.shelfDepth/2, sy - 12, MAP.shelfDepth, 24);
    ctx.restore();
  }

  drawTrolley();
}

function drawWarehouse(){
  const yCross = crossAisleY();

  // Cross-aisle esterna
  const leftEdge = aisleCenterX(1) - (MAP.laneWidth/2 + MAP.shelfDepth + 40);
  const rightEdge = aisleCenterX(MAP.corridors) + (MAP.laneWidth/2 + MAP.shelfDepth + 40);
  const crossTop = yCross - MAP.crossAisleHeight/2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(leftEdge, crossTop, rightEdge-leftEdge, MAP.crossAisleHeight, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#666';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('ZONA ESTERNA / CROSS-AISLE', leftEdge + 12, crossTop + 22);
  ctx.restore();

  for (let c = 1; c <= MAP.corridors; c++){
    const cx = aisleCenterX(c);

    // corsia stretta
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - MAP.laneWidth/2, MAP.topY - 22, MAP.laneWidth, MAP.posGap*(MAP.positions-1) + 44, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // scaffali continui legati al corridoio (solo 2: SX e DX)
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

    // label corridoio e scaffali associati
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

  // marker posti
  ctx.save();
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '11px system-ui, sans-serif';
  for (let p = 1; p <= MAP.positions; p += 2){
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
  const bodyW = 150;
  const bodyH = 190;

  if (!sprites.loaded){
    ctx.save();
    ctx.fillStyle = '#d40000';
    ctx.beginPath();
    ctx.arc(trolley.x, trolley.y, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // body
  drawImageCentered(sprites.truck, trolley.x, trolley.y, bodyW, bodyH, trolley.headingDeg);

  // fork overlay
  const ang = degToRad(trolley.headingDeg);
  const fx = trolley.x + Math.sin(ang) * (bodyH*0.34);
  const fy = trolley.y - Math.cos(ang) * (bodyH*0.34);

  const forkW = 220;
  const forkH = 220;
  const totalForkDeg = trolley.headingDeg + trolley.forkRelDeg;

  drawImageCentered(sprites.fork, fx, fy, forkW, forkH, totalForkDeg);
}

function debug(){
  ui.dbgPos.textContent = `${trolley.x.toFixed(1)}, ${trolley.y.toFixed(1)}`;
  ui.dbgHeading.textContent = `${trolley.headingDeg}°`;
  ui.dbgFork.textContent = `${trolley.forkRelDeg}° (rel)`;
  ui.dbgTarget.textContent = target.active
    ? `C${target.corridoio} P${target.posto} L${target.livello} S${target.scaffale} (${target.side})`
    : '—';
}

// roundRect polyfill
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

requestAnimationFrame(tick);
