// VNA sprite demo (no middleware)
// - Canvas 2D
// - Carrello top-down (truck_base.png) + fork overlay (fork.png) ruotabile DX/SX
// - Coordinate: corridoio 1..6, posto 1..20, livello 1..5 (solo label), scaffale 1..12 (1..6 SX, 7..12 DX)

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
  btnForkFront: document.getElementById('btnForkFront'),
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
  margin: {x: 90, y: 60},
  aisleGap: 150,       // distanza tra centri corsia
  laneWidth: 46,       // corsia
  shelfDepth: 52,      // profondità scaffali
  shelfThickness: 10,  // spessore linee scaffali
  posGap: 26,          // distanza tra "posti" lungo corsia
  topY: 80,
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
  img.onload = () => {
    loadCount++;
    if (loadCount === 2) sprites.loaded = true;
  };
  img.onerror = () => {
    console.warn('Errore caricamento sprite:', img.src);
  };
});

// State: trolley
const trolley = {
  x: 0, y: 0,
  headingDeg: 0,      // 0 = su (nord), 90 = destra (est), 180 = giù, 270 = sinistra
  forkRelDeg: 0,      // -90 sx, 0 front, +90 dx (relativa al carrello)
  speed: 220,         // px/sec
};

const target = {
  active: false,
  x: 0, y: 0,
  corridoio: 1,
  posto: 1,
  livello: 1,
  scaffale: 1,
  side: 'left', // left|right derived from scaffale
};

// Path as list of waypoints
let waypoints = [];
let moving = false;

// Map helpers
function aisleCenterX(corridoio){
  return MAP.margin.x + (corridoio - 1) * MAP.aisleGap;
}
function posY(posto){
  // posto 1 in alto, 20 in basso
  return MAP.topY + (posto - 1) * MAP.posGap;
}
function shelfSide(scaffale){
  return scaffale <= 6 ? 'left' : 'right';
}
function shelfOffsetX(side){
  const sign = side === 'left' ? -1 : 1;
  return sign * (MAP.laneWidth/2 + MAP.shelfDepth/2);
}

// Init trolley start
trolley.x = aisleCenterX(1);
trolley.y = posY(1);

// UI events
ui.btnForkLeft.onclick = () => trolley.forkRelDeg = -90;
ui.btnForkFront.onclick = () => trolley.forkRelDeg = 0;
ui.btnForkRight.onclick = () => trolley.forkRelDeg = 90;

ui.btnStop.onclick = () => {
  moving = false;
  waypoints = [];
};

ui.btnVai.onclick = () => {
  const corr = clamp(parseInt(ui.corridoio.value || '1', 10), 1, 6);
  const pos = clamp(parseInt(ui.posto.value || '1', 10), 1, 20);
  const liv = clamp(parseInt(ui.livello.value || '1', 10), 1, 5);
  const sca = clamp(parseInt(ui.scaffale.value || '1', 10), 1, 12);

  target.active = true;
  target.corridoio = corr;
  target.posto = pos;
  target.livello = liv;
  target.scaffale = sca;
  target.side = shelfSide(sca);
  target.x = aisleCenterX(corr);
  target.y = posY(pos);

  // Simple Manhattan path: align Y then X (or viceversa)
  waypoints = [
    {x: trolley.x, y: target.y},
    {x: target.x, y: target.y},
  ];
  moving = true;
};

function setHeadingToward(dx, dy){
  // Choose cardinal heading
  if (Math.abs(dx) > Math.abs(dy)) {
    trolley.headingDeg = dx > 0 ? 90 : 270;
  } else {
    trolley.headingDeg = dy > 0 ? 180 : 0;
  }
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
        // When arrived: orient fork toward shelf side
        trolley.forkRelDeg = target.side === 'left' ? -90 : 90;
      }
    } else {
      setHeadingToward(dx, dy);
      const step = trolley.speed * dt;
      const ux = dx / dist;
      const uy = dy / dist;
      trolley.x += ux * Math.min(step, dist);
      trolley.y += uy * Math.min(step, dist);
    }
  }

  draw();
  debug();
  requestAnimationFrame(tick);
}

function draw(){
  ctx.clearRect(0, 0, cv.width, cv.height);

  // Background
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0, 0, cv.width, cv.height);

  drawWarehouse();

  // Target marker
  if (target.active){
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1a7f37';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Highlight shelf position (schematic)
    const sx = target.x + shelfOffsetX(target.side);
    const sy = target.y;
    ctx.save();
    ctx.strokeStyle = '#1a7f37';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx - 16, sy - 12, 32, 24);
    ctx.restore();
  }

  drawTrolley();
}

function drawWarehouse(){
  // Draw each corridor lane and shelves both sides
  for (let c = 1; c <= MAP.corridors; c++){
    const cx = aisleCenterX(c);

    // lane
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - MAP.laneWidth/2, MAP.topY - 20, MAP.laneWidth, MAP.posGap*(MAP.positions-1) + 40, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // shelves left/right as thick segments per "posto"
    for (let p = 1; p <= MAP.positions; p++){
      const y = posY(p);
      for (const side of ['left','right']){
        const sx = cx + shelfOffsetX(side) - MAP.shelfDepth/2;
        const sy = y - 10;
        ctx.save();
        ctx.fillStyle = '#7a7a7a';
        ctx.globalAlpha = 0.75;
        ctx.fillRect(sx, sy, MAP.shelfDepth, 20);
        ctx.restore();
      }
    }

    // corridor label
    ctx.save();
    ctx.fillStyle = '#444';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`C${c}`, cx - 10, MAP.topY - 30);
    ctx.restore();
  }

  // Position markers
  ctx.save();
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '11px system-ui, sans-serif';
  for (let p = 1; p <= MAP.positions; p += 2){
    const y = posY(p) + 4;
    ctx.fillText(`${p}`, 22, y);
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

  // If sprites not loaded yet, draw placeholder
  if (!sprites.loaded){
    ctx.save();
    ctx.fillStyle = '#d40000';
    ctx.beginPath();
    ctx.arc(trolley.x, trolley.y, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Body
  drawImageCentered(sprites.truck, trolley.x, trolley.y, bodyW, bodyH, trolley.headingDeg);

  // Fork overlay: place at "front" of trolley
  // Front direction vector from heading
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

// Polyfill for roundRect (for older browsers)
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
