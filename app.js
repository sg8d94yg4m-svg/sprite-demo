// VNA sprite demo — 2,5D (no middleware)
// Obiettivo: mantenere la mappa 2D “top-down” ma rendere scaffali e livelli in 2,5D (estrusione).
// - Scaffali: prismi estrusi con 5 livelli (MAP.levels) e tacche livello.
// - Target livello: evidenziato sullo scaffale target.
// - Carrello: sprite 2D + “alzata” (mast) come indicatore verticale 2,5D.
//
// DOPPIA CROSS-AISLE:
// - una in TESTATA (in alto)
// - una BASSA (in basso)
// REGOLA:
// - target sopra la metà (posti 1..10) -> asse bassa
// - target sotto la metà (posti 11..20) -> asse testata
//
// Mapping corridoio↔scaffali:
// Corridoio 1 -> S1 (SX) / S2 (DX) ... Corridoio 6 -> S11 (SX) / S12 (DX)

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
function lerp(a,b,t){ return a + (b-a)*t; }

const MAP = {
  corridors: 6,
  positions: 20,
  levels: 5,

  margin: {x: 110, y: 88},
  aisleGap: 150,
  laneWidth: 46,
  shelfDepth: 66,
  posGap: 26,
  topY: 120,

  crossAisleHeight: 70,
  crossAislePadding: 22,

  // 2,5D params
  prismDx: -14,        // “profondità” verso alto-sinistra
  prismDy: -10,
  levelHeightPx: 14,   // altezza “verticale” di ogni livello
  prismTopLift: 0,     // extra lift (opzionale)
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

// Mapping helpers
function corridorFromShelf(scaffale){ return Math.ceil(scaffale / 2); }
function shelfSideFromShelf(scaffale){ return (scaffale % 2 === 1) ? 'left' : 'right'; }

function aisleCenterX(c){
  return MAP.margin.x + (c - 1) * MAP.aisleGap;
}
function posY(p){
  return MAP.topY + (p - 1) * MAP.posGap;
}
function crossAisleYTop(){
  return MAP.topY - MAP.crossAislePadding - MAP.crossAisleHeight/2;
}
function crossAisleYBottom(){
  return MAP.topY + (MAP.positions - 1) * MAP.posGap + MAP.crossAislePadding + MAP.crossAisleHeight/2;
}
function shelfOffsetX(side){
  const sign = side === 'left' ? -1 : 1;
  return sign * (MAP.laneWidth/2 + MAP.shelfDepth/2);
}

// State
const trolley = {
  x: aisleCenterX(1),
  y: posY(1),
  headingDeg: 0,
  forkRelDeg: 90,
  speed: 220,
};

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

// UI
ui.btnForkLeft.onclick = () => trolley.forkRelDeg = -90;
ui.btnForkRight.onclick = () => trolley.forkRelDeg = 90;
ui.btnStop.onclick = () => { moving = false; waypoints = []; };

ui.btnVai.onclick = () => {
  const sca = clamp(parseInt(ui.scaffale.value || '1', 10), 1, 12);
  const corrDerived = corridorFromShelf(sca);
  const side = shelfSideFromShelf(sca);

  const pos = clamp(parseInt(ui.posto.value || '1', 10), 1, 20);
  const liv = clamp(parseInt(ui.livello.value || '1', 10), 1, 5);

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

function chooseCrossYForTarget(){
  const half = MAP.positions / 2; // 10
  return (target.posto <= half) ? crossAisleYBottom() : crossAisleYTop();
}

function buildPathToTarget(){
  const cxNow = trolley.x;
  const sameCorridor = Math.abs(cxNow - target.x) < 1.0;

  if (sameCorridor){
    waypoints = [{x: target.x, y: target.y}];
    return;
  }

  const yCross = chooseCrossYForTarget();
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

// 2,5D drawing primitives
function prismHeight(){ return MAP.levels * MAP.levelHeightPx + MAP.prismTopLift; }

function drawPrism(x, y, w, h, height, fillFront, fillSide, fillTop, alpha=0.70){
  const dx = MAP.prismDx, dy = MAP.prismDy;
  // top face is shifted by (dx,dy) and lifted by height (up)
  const tx = x + dx;
  const ty = y + dy - height;

  // FRONT face (vertical): base rect + height up (we draw as polygon for 2.5D)
  // We'll represent the “front” as the near face (toward viewer): it’s the base rectangle extruded up.
  // In oblique projection: front face is a quad along one edge. For simplicity we draw:
  // 1) top face polygon
  // 2) side face polygon
  // 3) front-ish face polygon (base “wall”)

  ctx.save();
  ctx.globalAlpha = alpha;

  // Side face (right)
  ctx.fillStyle = fillSide;
  ctx.beginPath();
  ctx.moveTo(x+w, y);
  ctx.lineTo(tx+w, ty+height);       // note: ty already includes -height, so ty+height is y+dy
  ctx.lineTo(tx+w, ty);
  ctx.lineTo(x+w, y-height);
  ctx.closePath();
  ctx.fill();

  // Front face (bottom edge)
  ctx.fillStyle = fillFront;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x+w, y);
  ctx.lineTo(x+w, y-height);
  ctx.lineTo(x, y-height);
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.fillStyle = fillTop;
  ctx.beginPath();
  ctx.moveTo(x, y-height);
  ctx.lineTo(x+w, y-height);
  ctx.lineTo(tx+w, ty);
  ctx.lineTo(tx, ty);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Outline (subtle)
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 1;
  // outline top
  ctx.beginPath();
  ctx.moveTo(x, y-height);
  ctx.lineTo(x+w, y-height);
  ctx.lineTo(tx+w, ty);
  ctx.lineTo(tx, ty);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawLevelTicksOnShelf(x, y, w, height){
  // ticks on the front face: horizontal lines at each level
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let l=1; l<MAP.levels; l++){
    const yy = y - l*MAP.levelHeightPx;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x+w, yy);
    ctx.stroke();
  }
  ctx.restore();
}

function highlightShelfLevel(x, y, w, level){
  // highlight on the front face between (level-1) and level
  const top = y - level*MAP.levelHeightPx;
  const bottom = y - (level-1)*MAP.levelHeightPx;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#1a7f37';
  ctx.fillRect(x, top, w, bottom-top);
  ctx.restore();
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
      noteArrive(wp);
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

function noteArrive(_wp){
  // placeholder for future behaviors
}

function draw(){
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0, 0, cv.width, cv.height);

  drawWarehouse25D();
  if (target.active) drawTargetOverlay();
  drawTrolley25D();
}

function drawCrossAisle2D(yCenter, label){
  const leftEdge = aisleCenterX(1) - (MAP.laneWidth/2 + MAP.shelfDepth + 40);
  const rightEdge = aisleCenterX(MAP.corridors) + (MAP.laneWidth/2 + MAP.shelfDepth + 40);
  const top = yCenter - MAP.crossAisleHeight/2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(leftEdge, top, rightEdge-leftEdge, MAP.crossAisleHeight, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#666';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(label, leftEdge + 12, top + 22);
  ctx.restore();
}

function drawWarehouse25D(){
  // Cross-aisles (2D)
  drawCrossAisle2D(crossAisleYTop(), 'CROSS-AISLE TESTATA (ALTA)');
  drawCrossAisle2D(crossAisleYBottom(), 'CROSS-AISLE BASSA');

  const shelfH = MAP.posGap*(MAP.positions-1) + 44;
  const shelfY = MAP.topY - 22;

  for (let c=1; c<=MAP.corridors; c++){
    const cx = aisleCenterX(c);

    // lane (2D)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - MAP.laneWidth/2, MAP.topY - 22, MAP.laneWidth, shelfH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // shelves (2,5D prisms)
    for (const side of ['left','right']){
      const sx = cx + shelfOffsetX(side) - MAP.shelfDepth/2;
      const sy = shelfY + shelfH; // base y at bottom of shelf for prism drawing
      const w = MAP.shelfDepth;
      const h = shelfH; // footprint height on y-axis

      const H = prismHeight();
      const fillFront = '#808080';
      const fillSide  = '#6f6f6f';
      const fillTop   = '#8d8d8d';

      // Draw prism “standing” on the shelf footprint:
      // We use x = sx, y = sy (bottom), w = width, h = 0 is not used (we extrude along vertical)
      // But we want the prism to extend along the corridor (upwards in screen y). So we interpret:
      // - x: shelf left
      // - y: bottom (shelfY + shelfH)
      // - w: shelfDepth
      // - h: 0 (not used), and we draw the front face as the depth only, while the shelf length is drawn separately.
      //
      // Instead: draw multiple prisms segments to suggest the length (cheap & readable).
      const segments = 6;
      for (let i=0;i<segments;i++){
        const segTop = shelfY + (i/segments)*shelfH;
        const segBot = shelfY + ((i+1)/segments)*shelfH;
        const segY = segBot;             // bottom anchor
        const segHeightFoot = segBot - segTop;
        // make segment a small “block” (w x segHeightFoot) extruded by H
        drawPrism(sx, segY, w, segHeightFoot, H, fillFront, fillSide, fillTop, 0.62);
        drawLevelTicksOnShelf(sx, segY, w, H);
      }
    }

    // labels
    const shelfL = (c*2)-1;
    const shelfR = (c*2);
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`C${c}`, cx - 10, MAP.topY - 36);
    ctx.fillStyle = '#555';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`S${shelfL} / S${shelfR}`, cx - 24, MAP.topY - 20);
    ctx.restore();
  }

  // marker posti
  ctx.save();
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '11px system-ui, sans-serif';
  for (let p=1; p<=MAP.positions; p+=2){
    ctx.fillText(`${p}`, 22, posY(p) + 4);
  }
  ctx.restore();
}

function drawTargetOverlay(){
  // Center target marker
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#1a7f37';
  ctx.beginPath();
  ctx.arc(target.x, target.y, 8, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // Highlight shelf block at target position and level
  const sx = target.x + shelfOffsetX(target.side) - MAP.shelfDepth/2;
  const sy = target.y + 12; // bottom anchor for one block at this posto
  const w = MAP.shelfDepth;
  const H = prismHeight();

  // block height footprint representing “one posto”
  const blockFoot = MAP.posGap; 
  const yBottom = target.y + blockFoot/2;

  // highlight segment on front face
  highlightShelfLevel(sx, yBottom, w, target.livello);

  // Outline target block
  ctx.save();
  ctx.strokeStyle = '#1a7f37';
  ctx.lineWidth = 3;
  ctx.strokeRect(sx - 2, target.y - blockFoot/2 - H - 2, w + 4, blockFoot + H + 4);
  ctx.restore();

  // Show which cross-aisle chosen (dashed guide)
  const yCross = chooseCrossYForTarget();
  ctx.save();
  ctx.strokeStyle = '#1a7f37';
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(target.x, yCross);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.restore();
}

function drawImageCentered(img, x, y, w, h, rotDeg){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(degToRad(rotDeg));
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
}

function drawTrolley25D(){
  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(trolley.x + 10, trolley.y + 18, 34, 18, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // Sprite body
  const bodyW = 150;
  const bodyH = 190;

  if (sprites.loaded){
    drawImageCentered(sprites.truck, trolley.x, trolley.y, bodyW, bodyH, trolley.headingDeg);
  } else {
    ctx.save();
    ctx.fillStyle = '#d40000';
    ctx.beginPath();
    ctx.arc(trolley.x, trolley.y, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // Fork overlay
  const ang = degToRad(trolley.headingDeg);
  const fx = trolley.x + Math.sin(ang) * (bodyH*0.34);
  const fy = trolley.y - Math.cos(ang) * (bodyH*0.34);

  const forkW = 220;
  const forkH = 220;
  const totalForkDeg = trolley.headingDeg + trolley.forkRelDeg;

  if (sprites.loaded){
    drawImageCentered(sprites.fork, fx, fy, forkW, forkH, totalForkDeg);
  }

  // Lift indicator (2,5D): a vertical mast line rising based on target livello when target active,
  // otherwise small idle.
  const level = target.active ? target.livello : 1;
  const lift = lerp(10, MAP.levels*MAP.levelHeightPx, (level-1)/(MAP.levels-1));
  ctx.save();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + MAP.prismDx*0.6, fy + MAP.prismDy*0.6 - lift);
  ctx.stroke();
  ctx.restore();
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

let lastTs = performance.now();
requestAnimationFrame(function tick(ts){
  // delegate to global tick function above
  // (we reuse the name tick, so wrap carefully)
});

// Start loop
(function start(){
  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

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
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
