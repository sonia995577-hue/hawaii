/* Hawaii Dual-Mode Living Plush Felt 3D Map (1:1 Homepage Style + Full Motion Choreography)
 * - Native 1280x720 HD sharpened 60-frame 360° plush felt turntable (`turntable` · default)
 *   + pure-white real-time long-pile velvet WebGL (`free3d`) switchable in one tap.
 * - Deep crisp zoom (up to 3.8x) + generous full-screen framing.
 * - Living 3D-synchronized micro-animations at EVERY landmark (steaming glowing volcano,
 *   twinkling Mauna Kea stars, rippling jelly bay + gliding manta ray, breezy ranch sparkles,
 *   coffee aroma wisps, gliding landing plane, lapping beach waves + tap bursts).
 * - Directional animated daily routes (marching chevrons + progressive draw-in + heading-aligned
 *   cruising vehicle showing exact From -> To travel flow).
 * - Flexible step-by-step journey choreography (`focusStep(i)` & `togglePlayJourney()`):
 *   tap any stop or hit Play to smoothly orbit, zoom, drive leg-by-leg (1 -> 2 -> 3), and burst!
 */
(function(global){
"use strict";

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t){ return a + (b - a) * t; }
function srgbCol(hex){
  const c = new THREE.Color(hex);
  if(c.convertSRGBToLinear) c.convertSRGBToLinear();
  return c;
}
function shortestAngleDelta(from, to){
  const tau = Math.PI * 2;
  let d = ((to - from) % tau + tau) % tau;
  if(d > Math.PI) d -= tau;
  return d;
}

const SPAN = 10.0;
const FRAME_COUNT = 60;

// ==================== SHARED 2D LABEL DE-COLLISION ENGINE ====================
function layoutLabels(pinLayerEl, projectedPins, rw, rh){
  const sheetEl = document.getElementById("mapSheet");
  const sheetRect = sheetEl ? sheetEl.getBoundingClientRect() : null;
  const sheetOpen = sheetRect && sheetRect.height > 120;
  const sheetTop = sheetOpen ? (rh - sheetRect.height - 94) : (rh - 148);
  const items = [];
  projectedPins.forEach(p=>{
    if(!p._vis){
      p.el.style.opacity = "0"; p.el.style.pointerEvents = "none";
      p.line.style.display = "none"; p.dot.style.display = "none";
      return;
    }
    const w = p.el.offsetWidth || 84;
    const h = p.el.offsetHeight || 28;
    const sx = clamp(p._sx, 10 + w * 0.5, rw - 10 - w * 0.5);
    const sy = clamp(p._sy - 14, 112 + h, Math.max(220, sheetTop));
    items.push({p, ax: p._ax, ay: p._ay, x: sx, y: sy, ox: sx, oy: sy, w, h, z: p._depth});
  });

  items.sort((a, b) => a.oy - b.oy);
  for(let iter = 0; iter < 14; iter++){
    for(let i = 0; i < items.length; i++){
      for(let j = i + 1; j < items.length; j++){
        const A = items[i], B = items[j];
        const minDx = (A.w + B.w) * 0.5 + 6;
        const minDy = (A.h + B.h) * 0.5 + 6;
        const dx = B.x - A.x;
        const dy = (B.y - B.h * 0.5) - (A.y - A.h * 0.5);
        const ox = minDx - Math.abs(dx);
        const oy = minDy - Math.abs(dy);
        if(ox > 0 && oy > 0){
          if(oy <= ox * 0.85){
            const push = oy * 0.55;
            A.y -= push; B.y += push;
          } else {
            const sgn = dx >= 0 ? 1 : -1;
            const pushX = ox * 0.36;
            A.x -= sgn * pushX; B.x += sgn * pushX;
            A.y -= oy * 0.22; B.y += oy * 0.22;
          }
        }
      }
    }
    for(let i = 0; i < items.length; i++){
      const it = items[i];
      it.x = clamp(it.x, 10 + it.w * 0.5, rw - 10 - it.w * 0.5);
      it.y = clamp(it.y, 112 + it.h, Math.max(220, sheetTop));
    }
  }

  items.forEach(it=>{
    const p = it.p;
    p.el.style.opacity = "1";
    p.el.style.pointerEvents = "auto";
    p.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -100%)`;
    p.el.style.zIndex = String((p._active ? 220 : 10) + Math.round((1 - it.z) * 100));
    p.el.classList.toggle("is-active-step", !!p._active);

    const dist = Math.hypot(it.x - it.ax, (it.y - 4) - it.ay);
    const isStop = p.stepIdx >= 0;
    // Whisper-light rule: ZERO duplicate dots!
    // - Day labels (`D3 骑马`) have NO dot inside text -> show the ONE clean jewel dot on the terrain.
    // - Stop labels (`1 Hāwī`) already have their numbered circle -> only show anchor dot + hair-thin dotted connector if nudged > 22px away!
    const showLine = dist > 22;
    const showDot = !isStop || showLine;

    p.line.style.display = showLine ? "" : "none";
    p.dot.style.display = showDot ? "" : "none";
    if(showLine){
      p.line.setAttribute("x1", it.x.toFixed(1));
      p.line.setAttribute("y1", (it.y - 2).toFixed(1));
      p.line.setAttribute("x2", it.ax.toFixed(1));
      p.line.setAttribute("y2", it.ay.toFixed(1));
      p.line.setAttribute("stroke-width", p._active ? "1.6" : "1.0");
      p.line.setAttribute("stroke-dasharray", p._active ? "" : "2 2.5");
    }
    if(showDot){
      p.dot.setAttribute("cx", it.ax.toFixed(1));
      p.dot.setAttribute("cy", it.ay.toFixed(1));
      p.dot.setAttribute("r", p._active ? "4.8" : "3.8");
    }
  });
}

// ==================== MODE A: CINEMA-GRADE 360° PLUSH TURNTABLE DATA ====================
const TT_BI_LOC = {
  koa:           [-0.78, 0.14,  0.00],
  hotel:         [-0.58, 0.16, -0.22],
  kuabay:        [-0.71, 0.14, -0.09],
  maunalani:     [-0.52, 0.17, -0.27],
  beach69:       [-0.47, 0.18, -0.32],
  waimea:        [-0.18, 0.28, -0.34],
  horse:         [-0.30, 0.24, -0.38],
  kona:          [-0.64, 0.12,  0.18],
  doutor:        [-0.45, 0.15,  0.29],
  greenwell:     [-0.42, 0.15,  0.34],
  kahaluu:       [-0.58, 0.10,  0.25],
  manta:         [-0.56, 0.09,  0.28],
  twostep:       [-0.50, 0.08,  0.44],
  paintedchurch: [-0.46, 0.11,  0.42],
  carlsmith:     [ 0.66, 0.13, -0.14],
  hilo:          [ 0.58, 0.15, -0.12],
  punaluu:       [ 0.12, 0.10,  0.48],
  kilaueaiki:    [ 0.64, 0.28,  0.20],
  uekahuna:      [ 0.56, 0.34,  0.14],
  vis:           [-0.02, 0.36, -0.16],
  summit:        [-0.04, 0.54, -0.32]
};

const TT_BI_ROADS = {
  d0: [[-0.78,0.14,0.00],[-0.68,0.15,-0.12],[-0.58,0.16,-0.22]],
  d1: [[-0.58,0.16,-0.22],[-0.02,0.32,-0.16],[0.38,0.22,-0.12],[0.66,0.13,-0.14],[0.58,0.15,-0.12],[0.54,0.26,0.14],[0.64,0.28,0.20],[0.56,0.34,0.14],[-0.02,0.32,-0.16],[-0.58,0.16,-0.22]],
  d2: [[-0.58,0.16,-0.22],[-0.18,0.28,-0.34],[-0.52,0.17,-0.27],[-0.30,0.24,-0.38],[-0.58,0.16,-0.22]],
  d3: [[-0.58,0.16,-0.22],[-0.71,0.14,-0.09],[-0.64,0.12,0.18],[-0.58,0.16,-0.22]],
  d4: [[-0.58,0.16,-0.22],[-0.66,0.13,0.12],[-0.50,0.08,0.44],[-0.46,0.11,0.42],[-0.64,0.12,0.18],[-0.58,0.10,0.25],[-0.56,0.09,0.28]],
  d5: [[-0.58,0.16,-0.22],[-0.45,0.15,0.29],[-0.42,0.15,0.34],[-0.64,0.12,0.18],[-0.58,0.16,-0.22],[-0.32,0.24,-0.18],[-0.02,0.36,-0.16],[-0.04,0.54,-0.32]],
  d6: [[-0.58,0.16,-0.22],[-0.64,0.12,0.18],[-0.78,0.14,0.00]]
};

const TT_BI_BADGE = {
  d0: [-0.78, 0.14,  0.00],
  d1: [ 0.58, 0.36,  0.14],
  d2: [-0.26, 0.26, -0.38],
  d3: [-0.71, 0.16, -0.10],
  d4: [-0.50, 0.08,  0.42],
  d5: [-0.04, 0.56, -0.32],
  d6: [-0.58, 0.17, -0.22]
};

// Best turntable rotation snapped straight onto our native 2K (2752x1536) macro keyframes!
const TT_2K_KEYS = {
  big:  [0, 7, 15, 22, 37, 45, 52],
  oahu: [0, 15, 30, 45]
};
function nearest2KDeg(isle, deg){
  const keys = TT_2K_KEYS[isle] || [0];
  let best = keys[0] * 6, bestDiff = 999;
  keys.forEach(k=>{
    const kd = k * 6;
    const diff = Math.abs(shortestAngleDelta(deg * Math.PI / 180, kd * Math.PI / 180) * 180 / Math.PI);
    if(diff < bestDiff){ bestDiff = diff; best = kd; }
  });
  return best;
}

const TT_BI_FOCUS = {
  d0: {deg: 312, zoom: 1.72, px:  0.34, py:  0.04},
  d1: {deg:  42, zoom: 1.62, px: -0.06, py: -0.04},
  d2: {deg: 312, zoom: 1.76, px:  0.14, py:  0.10},
  d3: {deg: 312, zoom: 1.72, px:  0.24, py: -0.02},
  d4: {deg:   0, zoom: 1.76, px:  0.26, py: -0.10},
  d5: {deg: 132, zoom: 1.68, px:  0.00, py:  0.08},
  d6: {deg: 312, zoom: 1.70, px:  0.30, py:  0.06}
};

const TT_OAHU_STOPS = [
  {num:"1", label:"HNL 机场",            p:[-0.24, 0.10, 0.16], col:"#1F1D1A", fx:"plane", q:"Daniel K. Inouye International Airport"},
  {num:"2", label:"买检疫鸡蛋花",        p:[ 0.42, 0.14, 0.18], col:"#15803D", fx:"coffee", q:"Longs Drugs Waikiki Honolulu"},
  {num:"3", label:"Outrigger (⚠水母期)", p:[ 0.52, 0.08, 0.36], col:"#0284C7", fx:"bay", q:"OUTRIGGER Waikiki Beachcomber Hotel 2300 Kalakaua Ave Honolulu"},
  {num:"4", label:"鱼三松露海胆饭",      p:[ 0.24, 0.18, 0.06], col:"#EA580C", fx:"coffee", q:"Izakaya Uosan 1221 Kapiolani Blvd Honolulu HI 96814"}
];
const TT_OAHU_ROAD = [[-0.24,0.10,0.16],[0.02,0.16,0.10],[0.24,0.18,0.06],[0.42,0.14,0.18],[0.52,0.08,0.36]];

// Living landmark effects that continuously animate in 3D lockstep!
const BI_LIVING_FX = [
  {kind:"volcano", p:[ 0.58, 0.36,  0.15]},
  {kind:"stars",   p:[-0.04, 0.58, -0.32]},
  {kind:"bay",     p:[-0.54, 0.06,  0.34]},
  {kind:"ranch",   p:[-0.32, 0.24, -0.44]},
  {kind:"coffee",  p:[-0.50, 0.16,  0.24]},
  {kind:"plane",   p:[-0.78, 0.18,  0.00]},
  {kind:"beach",   p:[-0.58, 0.15, -0.22]}
];
const OAHU_LIVING_FX = [
  {kind:"bay",     p:[ 0.56, 0.06,  0.36]},
  {kind:"beach",   p:[-0.24, 0.07,  0.14]},
  {kind:"plane",   p:[-0.26, 0.16,  0.16]},
  {kind:"coffee",  p:[ 0.34, 0.16,  0.12]},
  {kind:"ranch",   p:[ 0.12, 0.34, -0.34]}
];

// Optimal turntable angle for a 3D point so it swings cleanly toward the viewer front!
function bestDegForPoint(pt){
  // In projectTT: rx = x*cos(t) - z*sin(t), rz = x*sin(t) + z*cos(t).
  // Maximize rz (bring point to front) -> t = atan2(x, z)
  const rad = Math.atan2(pt[0], pt[2]);
  return (((rad * 180 / Math.PI) % 360) + 360) % 360;
}

// Smooth Catmull-Rom interpolation on an array of 2D points [{x,y}]
function sampleDense2D(pts, segSub){
  if(pts.length < 2) return pts.slice();
  const out = [];
  const N = pts.length;
  for(let i = 0; i < N - 1; i++){
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(N - 1, i + 2)];
    for(let s = 0; s < segSub; s++){
      const t = s / segSub, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
      const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
      out.push({x, y});
    }
  }
  out.push(pts[N - 1]);
  return out;
}

function measurePolyline(pts){
  const cum = [0];
  let total = 0;
  for(let i = 1; i < pts.length; i++){
    total += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    cum.push(total);
  }
  return {cum, total};
}

function sampleAtDist(pts, cum, dist){
  const total = cum[cum.length - 1] || 1;
  const d = clamp(dist, 0, total);
  let lo = 0, hi = cum.length - 1;
  while(lo < hi - 1){
    const mid = (lo + hi) >> 1;
    if(cum[mid] <= d) lo = mid; else hi = mid;
  }
  const segL = (cum[hi] - cum[lo]) || 1e-6;
  const f = (d - cum[lo]) / segL;
  const x = lerp(pts[lo].x, pts[hi].x, f);
  const y = lerp(pts[lo].y, pts[hi].y, f);
  const ang = Math.atan2(pts[hi].y - pts[lo].y, pts[hi].x - pts[lo].x);
  return {x, y, ang};
}

// Draw cute miniature heading-aligned vehicle (cream SUV or airplane) directly on 2D HD canvas!
function drawMiniVehicle2D(ctx, x, y, ang, colorHex, isPlane){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Soft drop shadow
  ctx.beginPath();
  ctx.ellipse(0, 3, isPlane ? 11 : 12, isPlane ? 7 : 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(31,29,26,0.18)";
  ctx.fill();

  if(isPlane){
    // Crisp white airplane silhouette pointing right (+x)
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#1F1D1A";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(2, -2.5);
    ctx.lineTo(-3, -10);
    ctx.lineTo(-6, -10);
    ctx.lineTo(-3, -2.2);
    ctx.lineTo(-9, -1.6);
    ctx.lineTo(-11, -5);
    ctx.lineTo(-12.5, -5);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-12.5, 5);
    ctx.lineTo(-11, 5);
    ctx.lineTo(-9, 1.6);
    ctx.lineTo(-3, 2.2);
    ctx.lineTo(-6, 10);
    ctx.lineTo(-3, 10);
    ctx.lineTo(2, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Adorable top-3/4 miniature cream SUV with turquoise surfboard & accent roof badge!
    ctx.fillStyle = "#FFFDF8";
    ctx.strokeStyle = "#1F1D1A";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-10, -5.5, 20, 11, 4);
    ctx.fill();
    ctx.stroke();
    // Windshield
    ctx.fillStyle = "#334855";
    ctx.beginPath();
    ctx.roundRect(2.5, -4, 4.2, 8, 1.5);
    ctx.fill();
    // Accent roof stripe / surfboard
    ctx.fillStyle = colorHex || "#4FC3C8";
    ctx.beginPath();
    ctx.roundRect(-7.5, -2.2, 10, 4.4, 2.2);
    ctx.fill();
    // Headlight glow beams!
    const grad = ctx.createRadialGradient(11, 0, 1, 16, 0, 10);
    grad.addColorStop(0, "rgba(255,244,190,0.75)");
    grad.addColorStop(1, "rgba(255,244,190,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(10, -3.5); ctx.lineTo(22, -7); ctx.lineTo(22, 7); ctx.lineTo(10, 3.5);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Calm, restrained living micro-animations (ZERO noisy strobe / zero visual clutter!).
// In overview: only soft volcano mist & subtle bay glint. Spot-specific effects activate ONLY for the selected day!
function drawLivingLandmarkFX(ctx, isle, focusDayId, projectFn, zoom, tAcc){
  const s = clamp(0.82 + zoom * 0.22, 0.85, 1.70);
  const fxList = isle === "oahu"
    ? [{kind:"bay", p:[0.56, 0.06, 0.36]}]
    : [{kind:"volcano", p:[0.58, 0.36, 0.15]}, {kind:"bay", p:[-0.54, 0.06, 0.34]}];

  // Add gentle spot-specific accent ONLY when that day is actively selected!
  if(isle === "big"){
    if(focusDayId === "d5") fxList.push({kind:"stars", p:[-0.04, 0.58, -0.32]});
    if(focusDayId === "d1") fxList.push({kind:"coffee", p:[-0.50, 0.16, 0.24]});
  }

  fxList.forEach(item=>{
    const pt = projectFn(item.p);
    const x = pt.x, y = pt.y;
    ctx.save();
    if(item.kind === "volcano"){
      // Subtle slow warm glow + 2 quiet curling mist puffs (never loud or busy)
      const pulse = 0.65 + 0.35 * Math.sin(tAcc * 1.6);
      const rg = ctx.createRadialGradient(x, y, 1, x, y, 16 * s);
      rg.addColorStop(0, `rgba(255, 132, 52, ${(0.34 * pulse).toFixed(3)})`);
      rg.addColorStop(1, "rgba(255, 92, 38, 0)");
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(x, y, 16 * s, 0, Math.PI * 2); ctx.fill();

      for(let i = 0; i < 2; i++){
        const ph = (tAcc * 0.16 + i * 0.5) % 1;
        const sx = x + Math.sin(tAcc * 0.9 + i * 2.1) * (3 + ph * 5) * s;
        const sy = y - (6 + ph * 26) * s;
        const sr = (3.6 + ph * 5.8) * s;
        ctx.fillStyle = `rgba(255, 253, 248, ${(Math.sin(ph * Math.PI) * 0.42).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      }
    } else if(item.kind === "bay"){
      // One calm slow shimmer ripple in the jelly bay
      const ph = (tAcc * 0.20) % 1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${((1 - ph) * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, (7 + ph * 16) * s, (4 + ph * 8) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if(item.kind === "stars"){
      const offs = [[-14,-14,0],[12,-18,1.5],[0,-24,3.0]];
      offs.forEach(([ox, oy, ph])=>{
        const tw = 0.40 + 0.60 * Math.pow(0.5 + 0.5 * Math.sin(tAcc * 1.8 + ph), 2);
        const sx = x + ox * s, sy = y + oy * s, r = (3.0 + tw * 2.6) * s;
        ctx.fillStyle = `rgba(255, 210, 96, ${(0.80 * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r); ctx.quadraticCurveTo(sx, sy, sx + r * 0.7, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + r); ctx.quadraticCurveTo(sx, sy, sx - r * 0.7, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - r); ctx.fill();
      });
    } else if(item.kind === "coffee"){
      const ph = (tAcc * 0.24) % 1;
      ctx.strokeStyle = `rgba(255, 245, 224, ${(Math.sin(ph * Math.PI) * 0.55).toFixed(3)})`;
      ctx.lineWidth = 1.4; ctx.lineCap = "round";
      ctx.beginPath();
      const by = y - ph * 12 * s;
      ctx.moveTo(x, by);
      ctx.bezierCurveTo(x - 3 * s, by - 4 * s, x + 3 * s, by - 8 * s, x, by - 12 * s);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// ==================== MODE B: REAL-TIME PURE-WHITE SILKY PLUSH 3D WEBGL ====================
const META = {
  bi: {
    z: 10, tx0: 67.26466602913237, tx1: 72.39755619308986,
    ty0: 452.585578170638, ty1: 457.7184683345954,
    maxElevM: 4144.0, yScale: 1.15, yExp: 0.85,
    demUrl: "data/terrain/bi_dem.png", craterGPS: [19.4069, -155.2834]
  },
  oahu: {
    z: 11, tx0: 122.7662222222223, tx1: 127.77244444444449,
    ty0: 896.3298322961068, ty1: 901.3360545183291,
    maxElevM: 1206.5, yScale: 0.88, yExp: 0.82,
    demUrl: "data/terrain/oahu_dem.png", craterGPS: null
  }
};
function gpsToUV(lat, lon, m){
  const n = Math.pow(2, m.z);
  const tx = (lon + 180.0) / 360.0 * n;
  const ty = (1.0 - Math.asinh(Math.tan(lat * Math.PI / 180.0)) / Math.PI) / 2.0 * n;
  return [(tx - m.tx0) / (m.tx1 - m.tx0), (ty - m.ty0) / (m.ty1 - m.ty0)];
}
function gpsToXZ(lat, lon, m){ const [u, v] = gpsToUV(lat, lon, m); return [(u - 0.5) * SPAN, (v - 0.5) * SPAN]; }

const BI_GPS = {
  koa:[19.7388,-156.0456], hotel:[19.9158,-155.8878], kuabay:[19.8098,-156.0086],
  maunalani:[19.9447,-155.8626], beach69:[19.9830,-155.8290],
  waimea:[20.0234,-155.6678], horse:[20.1180,-155.7720],
  kona:[19.6400,-155.9969], doutor:[19.5562,-155.9324], greenwell:[19.5122,-155.9218],
  kahaluu:[19.5800,-155.9663], manta:[19.5612,-155.9620],
  twostep:[19.4222,-155.9108], paintedchurch:[19.4337,-155.8931],
  carlsmith:[19.7327,-155.0268], hilo:[19.7241,-155.0706],
  punaluu:[19.1361,-155.5047], kilaueaiki:[19.4150,-155.2498], uekahuna:[19.4202,-155.2882],
  vis:[19.7598,-155.4561], summit:[19.8207,-155.4681]
};
const BI_ROADS_GPS = {
  d0:[[19.7388,-156.0456],[19.805,-155.992],[19.865,-155.932],[19.9158,-155.8878]],
  d1:[[19.9158,-155.8878],[19.758,-155.665],[19.692,-155.470],[19.688,-155.285],[19.7327,-155.0268],[19.7241,-155.0706],[19.540,-155.145],[19.4150,-155.2498],[19.4202,-155.2882],[19.692,-155.470],[19.9158,-155.8878]],
  d2:[[19.9158,-155.8878],[20.0234,-155.6678],[19.9447,-155.8626],[20.1180,-155.7720],[19.9158,-155.8878]],
  d3:[[19.9158,-155.8878],[19.8098,-156.0086],[19.6400,-155.9969],[19.9158,-155.8878]],
  d4:[[19.9158,-155.8878],[19.740,-156.020],[19.610,-155.965],[19.4222,-155.9108],[19.4337,-155.8931],[19.6400,-155.9969],[19.5800,-155.9663],[19.5612,-155.9620]],
  d5:[[19.9158,-155.8878],[19.5562,-155.9324],[19.5122,-155.9218],[19.6400,-155.9969],[19.9158,-155.8878],[19.772,-155.642],[19.692,-155.470],[19.7598,-155.4561],[19.8207,-155.4681]],
  d6:[[19.9158,-155.8878],[19.740,-156.020],[19.6400,-155.9969],[19.7388,-156.0456]]
};
const BI_BADGE_GPS = {
  d0:[19.7388,-156.0456], d1:[19.4150,-155.2750], d2:[20.0650,-155.7350],
  d3:[19.8098,-156.0086], d4:[19.4337,-155.9100], d5:[19.8207,-155.4681], d6:[19.9158,-155.8878]
};
const OAHU_STOPS_GPS = [
  {num:"1", label:"HNL 机场",            lat:21.3187, lon:-157.9225, col:"#1F1D1A", q:"Daniel K. Inouye International Airport"},
  {num:"2", label:"买检疫鸡蛋花",        lat:21.2788, lon:-157.8295, col:"#15803D", q:"Longs Drugs Waikiki Honolulu"},
  {num:"3", label:"Outrigger (⚠水母期)", lat:21.2768, lon:-157.8256, col:"#0284C7", q:"OUTRIGGER Waikiki Beachcomber Hotel 2300 Kalakaua Ave Honolulu"},
  {num:"4", label:"鱼三松露海胆饭",      lat:21.2929, lon:-157.8452, col:"#EA580C", q:"Izakaya Uosan 1221 Kapiolani Blvd Honolulu HI 96814"}
];
const OAHU_ROAD_GPS = [
  [21.3187,-157.9225],[21.309,-157.882],[21.295,-157.855],[21.2925,-157.8415],[21.2788,-157.8295],[21.2735,-157.8240]
];

function loadImage(url){
  return new Promise((resolve, reject)=>{
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = ()=> resolve(img); img.onerror = reject; img.src = url;
  });
}
function makeSherpaCloudMaterial(){
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {uSunDir: {value: new THREE.Vector3(0.70, 0.74, 0.44).normalize()}},
    vertexShader: `varying vec3 vNormalW, vWorldPos, vLocalPos;
      void main(){ vLocalPos = position; vNormalW = normalize(mat3(modelMatrix)*normal);
        vec4 wp = modelMatrix*vec4(position,1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uSunDir; varying vec3 vNormalW, vWorldPos, vLocalPos;
      float hash3(vec3 p){ p=fract(p*0.3183099+0.1)*17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float vnoise3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){ vec3 N=normalize(vNormalW),V=normalize(cameraPosition-vWorldPos);
        float wool=vnoise3(vLocalPos*26.0)*0.65+vnoise3(vLocalPos*56.0+3.1)*0.35;
        float lit=smoothstep(-0.42,0.86,dot(N,uSunDir)+(wool-0.5)*0.40);
        vec3 col=mix(vec3(0.83,0.85,0.86),vec3(0.996,0.990,0.972),lit)*(0.90+wool*0.16);
        col=mix(col,vec3(1.0,0.998,0.985),pow(1.0-max(0.0,dot(N,V)),2.2)*0.52);
        gl_FragColor=vec4(col,0.98); }`
  });
}
function makeSherpaBank(mat, puffs, scale){
  const g = new THREE.Group(), sph = new THREE.SphereGeometry(1, 14, 12);
  puffs.forEach(([x,y,z,r])=>{ const m = new THREE.Mesh(sph, mat); m.position.set(x,y,z); m.scale.set(r,r*0.9,r); g.add(m); });
  g.scale.setScalar(scale || 1.0); return g;
}
function makeMiniSUV(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({color: srgbCol("#FBF6EA"), roughness: 0.55});
  const trimMat = new THREE.MeshStandardMaterial({color: srgbCol("#DF7B52"), roughness: 0.55});
  const glassMat = new THREE.MeshStandardMaterial({color: srgbCol("#334855"), roughness: 0.28});
  const tireMat = new THREE.MeshStandardMaterial({color: srgbCol("#2A2724"), roughness: 0.92});
  const surfMat = new THREE.MeshStandardMaterial({color: srgbCol("#4FC3C8"), roughness: 0.42});
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.050, 0.195), bodyMat); base.position.y = 0.046;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.014, 0.198), trimMat); stripe.position.y = 0.038;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.046, 0.11), glassMat); cab.position.set(0, 0.088, -0.014);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.015, 0.115), bodyMat); roof.position.set(0, 0.114, -0.014);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.012, 0.16), surfMat); board.position.set(0, 0.128, -0.008);
  g.add(base, stripe, cab, roof, board);
  [[-0.056,0.025,0.056],[0.056,0.025,0.056],[-0.056,0.025,-0.056],[0.056,0.025,-0.056]].forEach(([wx,wy,wz])=>{
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.024,10), tireMat);
    w.rotation.z = Math.PI/2; w.position.set(wx,wy,wz); g.add(w);
  });
  return g;
}
function addPlushPalms(root, gpsList, meta, getH){
  const trunkMat = new THREE.MeshStandardMaterial({color: srgbCol("#9E774D"), roughness: 0.92});
  const fm1 = new THREE.MeshStandardMaterial({color: srgbCol("#98BA42"), roughness: 0.88});
  const fm2 = new THREE.MeshStandardMaterial({color: srgbCol("#729B36"), roughness: 0.88});
  const leafGeo = new THREE.SphereGeometry(0.055, 8, 6);
  gpsList.forEach(([lat, lon], idx)=>{
    const [x, z] = gpsToXZ(lat, lon, meta), y = getH(x, z);
    if(y < 0.02) return;
    const g = new THREE.Group(), lean = 0.036;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(lean*0.5,0.08,lean*0.2), new THREE.Vector3(lean,0.16,lean*0.35)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 5, 0.014, 5, false), trunkMat));
    const crown = new THREE.Group(); crown.position.set(lean, 0.16, lean * 0.35);
    for(let f = 0; f < 6; f++){
      const ang = (f / 6) * Math.PI * 2 + idx * 0.7;
      const leaf = new THREE.Mesh(leafGeo, f % 2 ? fm1 : fm2);
      leaf.scale.set(1.6, 0.56, 0.65); leaf.rotation.y = ang; leaf.rotation.z = -0.32;
      leaf.position.set(Math.cos(ang)*0.048, -0.004, -Math.sin(ang)*0.048); crown.add(leaf);
    }
    g.add(crown); g.position.set(x, y - 0.008, z); g.scale.setScalar(0.92 + (idx % 3) * 0.18); root.add(g);
  });
}
function addCuteBuddies(root, lat, lon, meta, getH){
  const [x, z] = gpsToXZ(lat, lon, meta), y = getH(x, z);
  const eyeW = new THREE.MeshBasicMaterial({color: 0xFFFFFF}), eyeB = new THREE.MeshBasicMaterial({color: 0x1A1918});
  [{dx:0,dz:0,r:0.055,h:0.11,col:"#9B6DD7"},{dx:0.11,dz:0.03,r:0.036,h:0.07,col:"#E86C52"},{dx:0.21,dz:0.02,r:0.044,h:0.09,col:"#F0C342"}].forEach(b=>{
    const bg = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color: srgbCol(b.col), roughness: 0.45});
    const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r*1.05, b.h, 12), mat); body.position.y = b.h*0.5;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(b.r, 12, 8), mat); cap.position.y = b.h;
    bg.add(body, cap);
    [-0.36,0.36].forEach(ex=>{
      const ew = new THREE.Mesh(new THREE.SphereGeometry(b.r*0.26,8,6), eyeW); ew.position.set(ex*b.r,b.h*0.85,b.r*0.88);
      const eb = new THREE.Mesh(new THREE.SphereGeometry(b.r*0.14,6,5), eyeB); eb.position.set(ex*b.r,b.h*0.85,b.r*1.04);
      bg.add(ew, eb);
    });
    bg.position.set(x + b.dx, y + 0.05, z + b.dz); root.add(bg);
  });
}

function buildFreePlushWorld(key, demImg){
  const m = META[key], S = 160;
  const c2d = document.createElement("canvas"); c2d.width = S; c2d.height = S;
  const ctx = c2d.getContext("2d"); ctx.drawImage(demImg, 0, 0, S, S);
  const pix = ctx.getImageData(0, 0, S, S).data;
  let elev = new Float32Array(S * S), mask = new Float32Array(S * S);
  for(let i = 0; i < S * S; i++){
    const e = ((pix[i*4]*256 + pix[i*4+1]) / 65535.0) * 4300.0;
    elev[i] = e; mask[i] = e > 2.0 ? 1.0 : 0.0;
  }
  function blurGrid(src, passes){
    let a = new Float32Array(src), b = new Float32Array(src.length);
    for(let p = 0; p < passes; p++){
      for(let y = 1; y < S - 1; y++){
        const row = y * S;
        for(let x = 1; x < S - 1; x++){
          const i = row + x;
          b[i] = (a[i]*4 + a[i-1]*2 + a[i+1]*2 + a[i-S]*2 + a[i+S]*2 + a[i-S-1] + a[i-S+1] + a[i+S-1] + a[i+S+1]) / 16.0;
        }
      }
      const tmp = a; a = b; b = tmp;
    }
    return a;
  }
  const smoothElev = blurGrid(elev, 7), smoothMask = blurGrid(mask, 4);
  const texData = new Uint8Array(S * S * 4);
  for(let i = 0; i < S * S; i++){
    texData[i*4] = Math.round(clamp(smoothElev[i]/m.maxElevM,0,1)*255);
    texData[i*4+1] = Math.round(clamp(smoothMask[i],0,1)*255);
    texData[i*4+2] = 0; texData[i*4+3] = 255;
  }
  const smoothTex = new THREE.DataTexture(texData, S, S, THREE.RGBAFormat);
  smoothTex.magFilter = THREE.LinearFilter; smoothTex.minFilter = THREE.LinearFilter; smoothTex.needsUpdate = true;
  function sampleField(arr, u, v){
    const fx = clamp(u,0,1)*(S-1), fy = clamp(v,0,1)*(S-1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(S-1,x0+1), y1 = Math.min(S-1,y0+1);
    const tx = fx-x0, ty = fy-y0;
    return lerp(lerp(arr[y0*S+x0],arr[y0*S+x1],tx),lerp(arr[y1*S+x0],arr[y1*S+x1],tx),ty);
  }
  function getH(x, z){
    const u = x/SPAN + 0.5, v = z/SPAN + 0.5;
    if(u<0||u>1||v<0||v>1) return -0.35;
    const mk = sampleField(smoothMask, u, v);
    if(mk < 0.08) return -0.35;
    const hN = clamp(sampleField(smoothElev, u, v)/m.maxElevM, 0, 1);
    const cushion = Math.pow(clamp((mk-0.08)/0.82, 0, 1), 0.52);
    return (0.14 + Math.pow(hN, m.yExp)*m.yScale)*cushion - (1.0 - cushion)*0.20;
  }
  function buildGeo(seg){
    const geo = new THREE.PlaneGeometry(SPAN, SPAN, seg, seg); geo.rotateX(-Math.PI/2);
    const pos = geo.attributes.position;
    for(let i = 0; i < pos.count; i++) pos.setY(i, getH(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals(); return geo;
  }
  const craterUV = m.craterGPS ? gpsToUV(m.craterGPS[0], m.craterGPS[1], m) : [-10,-10];
  const mkUV = key === "bi" ? gpsToUV(19.8207, -155.4681, m) : [-10,-10];
  const paletteChunk = `
    float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float vnoise2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y); }
    vec3 feltColor(vec2 uv, float hN, float uIsBI, vec2 uCraterUV, vec2 uMkUV){
      float dCrater=length(uv-uCraterUV), dMK=length(uv-uMkUV);
      vec3 col=mix(vec3(0.81,0.82,0.33), vec3(0.55,0.65,0.25), smoothstep(0.08,0.55,hN));
      vec3 deepMoss=vec3(0.17,0.34,0.14);
      if(uIsBI>0.5){
        col=mix(col,deepMoss,clamp(smoothstep(0.46,0.72,uv.x)*0.72+smoothstep(0.12,0.04,dCrater)*0.75,0.0,0.85));
        col=mix(col,vec3(0.86,0.43,0.24),smoothstep(0.085,0.022,dCrater)*0.96);
        col=mix(col,vec3(0.98,0.64,0.34),smoothstep(0.024,0.006,dCrater));
        col=mix(col,vec3(0.98,0.96,0.90),smoothstep(0.62,0.86,hN)*smoothstep(0.24,0.08,dMK)*0.95);
      } else {
        col=mix(col,deepMoss,smoothstep(0.38,0.66,uv.x)*smoothstep(0.22,0.68,hN)*0.84);
        col=mix(col,vec3(0.76,0.56,0.32),smoothstep(0.06,0.015,length(uv-vec2(0.665,0.768)))*0.85);
      }
      return col;
    }`;
  const baseMat = new THREE.ShaderMaterial({
    uniforms:{uSmooth:{value:smoothTex},uSunDir:{value:new THREE.Vector3(0.66,0.68,0.44).normalize()},uCraterUV:{value:new THREE.Vector2(craterUV[0],craterUV[1])},uMkUV:{value:new THREE.Vector2(mkUV[0],mkUV[1])},uIsBI:{value:key==="bi"?1.0:0.0}},
    vertexShader:`varying vec2 vUv; varying vec3 vNormalW,vWorldPos;
      void main(){ vUv=vec2(uv.x,1.0-uv.y); vNormalW=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vWorldPos=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader:`uniform sampler2D uSmooth; uniform vec3 uSunDir; uniform vec2 uCraterUV,uMkUV; uniform float uIsBI; varying vec2 vUv; varying vec3 vNormalW,vWorldPos;
      ${paletteChunk}
      void main(){ vec2 sm=texture2D(uSmooth,vUv).rg; if(sm.y<0.24) discard;
        vec3 N=normalize(vNormalW),V=normalize(cameraPosition-vWorldPos);
        float ndl=dot(N,uSunDir), lit=smoothstep(-0.38,0.86,ndl), direct=max(0.0,ndl);
        vec3 base=feltColor(vUv,sm.x,uIsBI,uCraterUV,uMkUV)*(0.88+vnoise2(vUv*360.0)*0.14+vnoise2(vUv*120.0+2.1)*0.08);
        vec3 col=mix(base*vec3(0.48,0.56,0.46),base*vec3(1.06,1.04,0.94)*(0.95+direct*0.22),lit)*mix(0.68,1.0,smoothstep(0.24,0.62,sm.y));
        col=mix(col,vec3(0.99,0.98,0.80),clamp(pow(1.0-max(0.0,dot(N,V)),2.0)*(0.45+0.55*lit)*0.62,0.0,0.66));
        gl_FragColor=vec4(col,1.0); }`
  });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(buildGeo(180), baseMat));
  const shellGeo = buildGeo(128);
  for(let s = 1; s <= 12; s++){
    const hNorm = s / 12;
    const shellMat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false,
      uniforms:{uSmooth:{value:smoothTex},uShellH:{value:hNorm},uLift:{value:hNorm*0.092},uSunDir:{value:new THREE.Vector3(0.66,0.68,0.44).normalize()},uCraterUV:{value:new THREE.Vector2(craterUV[0],craterUV[1])},uMkUV:{value:new THREE.Vector2(mkUV[0],mkUV[1])},uIsBI:{value:key==="bi"?1.0:0.0}},
      vertexShader:`uniform float uLift; varying vec2 vUv; varying vec3 vNormalW,vWorldPos;
        void main(){ vUv=vec2(uv.x,1.0-uv.y); vec3 n=normalize(normal); vec4 wp=modelMatrix*vec4(position+n*uLift,1.0); vNormalW=normalize(mat3(modelMatrix)*n); vWorldPos=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader:`uniform sampler2D uSmooth; uniform float uShellH,uIsBI; uniform vec3 uSunDir; uniform vec2 uCraterUV,uMkUV; varying vec2 vUv; varying vec3 vNormalW,vWorldPos;
        ${paletteChunk}
        void main(){ vec2 sm=texture2D(uSmooth,vUv).rg; if(sm.y<0.28) discard;
          if(hash21(floor(vUv*420.0))*0.70+vnoise2(vUv*95.0)*0.30<uShellH*0.86) discard;
          vec3 N=normalize(vNormalW),V=normalize(cameraPosition-vWorldPos);
          float lit=smoothstep(-0.36,0.86,dot(N,uSunDir));
          vec3 base=feltColor(vUv,sm.x,uIsBI,uCraterUV,uMkUV);
          vec3 col=mix(base*vec3(0.55,0.64,0.52),base*vec3(1.10,1.07,0.94),lit)*mix(0.72,1.24,uShellH);
          col=mix(col,vec3(1.0,0.99,0.86),pow(1.0-max(0.0,dot(N,V)),1.8)*uShellH*0.56);
          gl_FragColor=vec4(col,(1.0-uShellH*0.58)*0.60*smoothstep(0.28,0.52,sm.y)); }`
    });
    const msh = new THREE.Mesh(shellGeo, shellMat); msh.renderOrder = 2 + s; root.add(msh);
  }
  const shadowMat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, uniforms:{uSmooth:{value:smoothTex}},
    vertexShader:`varying vec2 vUv; void main(){ vUv=vec2(uv.x,1.0-uv.y); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform sampler2D uSmooth; varying vec2 vUv;
      void main(){ vec2 suv=vUv+vec2(-0.022,-0.025); float a=0.0;
        for(int x=-2;x<=2;x++) for(int y=-2;y<=2;y++) a+=texture2D(uSmooth,clamp(suv+vec2(float(x),float(y))*0.014,0.0,1.0)).g;
        gl_FragColor=vec4(0.32,0.34,0.36,(a/25.0)*0.16); }`
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(SPAN*1.15, SPAN*1.15), shadowMat);
  shadowPlane.rotation.x = -Math.PI/2; shadowPlane.position.y = -0.22; root.add(shadowPlane);

  const jellyMat = new THREE.MeshStandardMaterial({color:srgbCol("#6FE3DE"), roughness:0.14, metalness:0.05, transparent:true, opacity:0.78});
  const anims = {steam:[], clouds:[], manta:null};
  const sherpaMat = makeSherpaCloudMaterial();
  if(key === "bi"){
    const [bx, bz] = gpsToXZ(19.56, -155.94, m);
    const bay = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.62, 0.14, 24), jellyMat);
    bay.scale.set(0.95, 1, 1.35); bay.position.set(bx, 0.06, bz); root.add(bay);
    const manta = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 4), new THREE.MeshStandardMaterial({color:srgbCol("#2A5298"), roughness:0.4}));
    manta.rotation.x = Math.PI/2; manta.scale.set(1.5,1,0.22); manta.position.set(bx,0.08,bz); manta.userData={bx,bz};
    root.add(manta); anims.manta = manta;
    const [sx, sz] = gpsToXZ(19.8207, -155.4681, m);
    const domeMat = new THREE.MeshStandardMaterial({color:srgbCol("#FFFFFF"), roughness:0.38});
    [[-0.08,-0.02,0.085],[0.08,0.03,0.075]].forEach(([ox,oz,r])=>{
      const d = new THREE.Mesh(new THREE.SphereGeometry(r,14,10,0,Math.PI*2,0,Math.PI*0.65), domeMat);
      d.position.set(sx+ox, getH(sx+ox,sz+oz)+0.06, sz+oz); root.add(d);
    });
    const [c1x, c1z] = gpsToXZ(19.96, -155.46, m);
    const bank1 = makeSherpaBank(sherpaMat, [[-0.6,0,0,0.28],[-0.32,0.12,-0.1,0.34],[0.05,0.18,-0.15,0.36],[0.42,0.10,-0.08,0.30],[0.72,-0.02,0.05,0.24]], 1.15);
    bank1.position.set(c1x, getH(c1x,c1z)+0.34, c1z); bank1.userData={bx:c1x,by:bank1.position.y,phase:0.3}; root.add(bank1); anims.clouds.push(bank1);
    const [kx, kz] = gpsToXZ(19.4069, -155.2834, m), ky = getH(kx, kz);
    const bank2 = makeSherpaBank(sherpaMat, [[-0.35,0,-0.25,0.22],[0,0.08,-0.32,0.26],[0.36,0.04,-0.18,0.24],[0.42,-0.04,0.16,0.20]], 1.05);
    bank2.position.set(kx, ky+0.16, kz); bank2.userData={bx:kx,by:bank2.position.y,phase:1.9}; root.add(bank2); anims.clouds.push(bank2);
    for(let i=0;i<4;i++){
      const sp = makeSherpaBank(sherpaMat, [[0,0,0,0.16],[0.06,0.08,0.02,0.13],[-0.05,0.05,-0.04,0.11]], 0.72);
      sp.userData={phase:i/4,bx:kx,by:ky+0.14,bz:kz}; root.add(sp); anims.steam.push(sp);
    }
    addCuteBuddies(root, 19.62, -155.62, m, getH);
    addPlushPalms(root, [[19.92,-155.88],[19.98,-155.82],[19.65,-155.98],[19.55,-155.95],[19.48,-155.91],[19.14,-155.50]], m, getH);
  } else {
    const [bx, bz] = gpsToXZ(21.30, -157.88, m);
    const bay = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.54, 0.13, 24), jellyMat);
    bay.scale.set(1.15, 1, 0.85); bay.position.set(bx, 0.06, bz); root.add(bay);
    const [cx, cz] = gpsToXZ(21.48, -157.85, m);
    const bank = makeSherpaBank(sherpaMat, [[-0.65,0,0,0.26],[-0.28,0.14,-0.08,0.34],[0.15,0.16,-0.10,0.34],[0.55,0.06,0.04,0.26]], 1.15);
    bank.position.set(cx, getH(cx,cz)+0.30, cz); bank.userData={bx:cx,by:bank.position.y,phase:1.0}; root.add(bank); anims.clouds.push(bank);
    addCuteBuddies(root, 21.45, -158.02, m, getH);
    addPlushPalms(root, [[21.28,-157.83],[21.29,-157.85],[21.62,-158.08],[21.58,-158.11]], m, getH);
  }
  return {group: root, getH, anims, meta: m};
}

// ==================== UNIFIED DUAL-MODE LIVING CONTROLLER ====================
function createIsland3DController(mountEl, pinLayerEl, opts){
  const W = Math.max(320, mountEl.clientWidth || 412);
  const H = Math.max(520, mountEl.clientHeight || 840);
  mountEl.innerHTML = "";
  mountEl.style.background = "#FFFFFF";

  const ttCanvas = document.createElement("canvas");
  ttCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  mountEl.appendChild(ttCanvas);
  const ttCtx = ttCanvas.getContext("2d");

  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 2, 2.5));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:none;touch-action:none";
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xFFFFFF);
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.2, 160);
  scene.add(new THREE.HemisphereLight(0xFFFDF8, 0xD8E3C8, 0.82));
  const sun = new THREE.DirectionalLight(0xFFF6E6, 1.18); sun.position.set(10, 12, 8); scene.add(sun);

  const worlds = {big: null, oahu: null};
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const miniSUV = makeMiniSUV(); miniSUV.visible = false; scene.add(miniSUV);

  // Preload 60-frame smooth turntable images + native 2K (2752x1536) tack-sharp macro keyframes!
  const ttFrames = {big: new Array(FRAME_COUNT), oahu: new Array(FRAME_COUNT)};
  const tt2kFrames = {big: {}, oahu: {}};
  ["big", "oahu"].forEach(k=>{
    const dir = k === "big" ? "art/map3d/bi" : "art/map3d/oahu";
    const dir2k = k === "big" ? "art/map3d/bi_2k" : "art/map3d/oahu_2k";
    for(let i = 0; i < FRAME_COUNT; i++){
      const img = new Image();
      img.src = `${dir}/f${String(i + 1).padStart(2, "0")}.jpg?v=r32`;
      ttFrames[k][i] = img;
    }
    (TT_2K_KEYS[k] || []).forEach(idx=>{
      const hi = new Image();
      hi.src = `${dir2k}/k${String(idx).padStart(2, "0")}.jpg?v=r32`;
      tt2kFrames[k][idx] = hi;
    });
  });

  let currentMode = (opts && opts.mode3d === "free3d") ? "free3d" : "turntable";
  let currentIsle = "big";
  let currentFocusDay = null;
  let lastViewArgs = null;
  let pendingAngle = null;
  let activeCurve = null;
  let suvProg = 0;
  let projectedPins = [];
  let ttActiveRoutes = [];
  let activeStops = [];     // [{num, label, col, ttPos, wPos, pin, q}]
  let activeStepIdx = -1;   // -1 = full day overview; 0..N-1 = focused step!
  let stepLegProg = 0;      // 0..1 progressive animated draw-in & vehicle drive for current leg!
  let isPlayingJourney = false;
  let playTimer = 0;
  let bursts = [];          // [{p:[x,y,z], col, born}]
  let dayDrawProg = 1;      // 0..1 progressive route draw-in when selecting a day

  // Turntable camera state (Bigger default, deep crisp 3.8x zoom!)
  const tt = {
    deg: 0, tDeg: 0,
    zoom: 1.24, tZoom: 1.24,
    px: 0, tPx: 0,
    py: 0, tPy: 0,
    vel: 0, autoSpin: false
  };

  // WebGL Free-3D camera state
  const cam = {
    yaw: -0.24, pitch: 0.64, dist: 19.6, tx: 0.04, ty: 0.0, tz: 0.20,
    tYaw: -0.24, tPitch: 0.64, tDist: 19.6, tTx: 0.04, tTy: 0.0, tTz: 0.20,
    autoSpin: false
  };

  function applyVisibility(){
    const isTT = currentMode === "turntable";
    ttCanvas.style.display = isTT ? "block" : "none";
    renderer.domElement.style.display = isTT ? "none" : "block";
  }
  applyVisibility();

  function triggerBurst(ttPos, col){
    bursts.push({p: ttPos.slice(), col: col || "#FF385C", born: tAcc});
    if(bursts.length > 8) bursts.shift();
  }

  function clearRoutes(){
    while(routeGroup.children.length){
      const ch = routeGroup.children.pop();
      if(ch.geometry) ch.geometry.dispose();
      if(ch.material) ch.material.dispose();
    }
    activeCurve = null;
    miniSUV.visible = false;
  }

  function add3dRouteGPS(gpsList, wObj, colorHex, active){
    const ptsMain = [], ptsRim = [];
    const subSteps = active ? 3 : 2;
    const lift = 0.085;
    for(let i = 0; i < gpsList.length; i++){
      const [lat, lon] = gpsList[i];
      const [x, z] = gpsToXZ(lat, lon, wObj.meta);
      const h = Math.max(0.06, wObj.getH(x, z));
      ptsMain.push(new THREE.Vector3(x, h + lift + (active ? 0.042 : 0.024), z));
      ptsRim.push(new THREE.Vector3(x, h + lift + 0.020, z));
      if(i < gpsList.length - 1){
        const [nlat, nlon] = gpsList[i + 1];
        for(let s = 1; s < subSteps; s++){
          const f = s / subSteps;
          const [mx, mz] = gpsToXZ(lerp(lat, nlat, f), lerp(lon, nlon, f), wObj.meta);
          const mh = Math.max(0.06, wObj.getH(mx, mz));
          ptsMain.push(new THREE.Vector3(mx, mh + lift + (active ? 0.044 : 0.026), mz));
          ptsRim.push(new THREE.Vector3(mx, mh + lift + 0.022, mz));
        }
      }
    }
    const curve = new THREE.CatmullRomCurve3(ptsMain);
    const rMain = active ? 0.036 : 0.022;
    const col = new THREE.Color(colorHex);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, active ? 120 : 56, rMain, 8, false),
      new THREE.MeshBasicMaterial({color: col, transparent: !active, opacity: active ? 1.0 : 0.88})
    );
    tube.renderOrder = 20; routeGroup.add(tube);
    if(active){
      const rimTube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ptsRim), 120, rMain * 1.48, 8, false),
        new THREE.MeshBasicMaterial({color: 0xFFFFFF, transparent: true, opacity: 0.94})
      );
      rimTube.renderOrder = 19; routeGroup.add(rimTube);
    }
    return curve;
  }

  function setPins(pinSpecs){
    pinLayerEl.innerHTML = "";
    projectedPins = [];
    const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    leaderSvg.setAttribute("class", "p3d-leaders");
    leaderSvg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1";
    pinLayerEl.appendChild(leaderSvg);

    pinSpecs.forEach((sp, idx)=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = sp.kind === "day" ? "p3d-day" : "p3d-stop";
      if(sp.col) btn.style.setProperty("--pc", sp.col);
      if(sp.kind === "day"){
        // ONE single jewel dot lives on the terrain — pure whisper-light text only (ZERO duplicate dot!)
        btn.innerHTML = `<span class="p3d-txt">D${sp.num} ${sp.tag || ""}</span>`;
        btn.onclick = (e)=>{
          e.stopPropagation();
          triggerBurst(sp.ttPos, sp.col);
          if(opts.onSelectDay) opts.onSelectDay(sp.dayId);
        };
      } else {
        btn.innerHTML = `<b class="p3d-num">${sp.num}</b><span class="p3d-lbl">${sp.label}</span>`;
        btn.onclick = (e)=>{
          e.stopPropagation();
          focusStep(idx, false);
        };
      }
      pinLayerEl.appendChild(btn);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", sp.col || "#1F1D1A");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("stroke-opacity", "0.75");
      line.setAttribute("stroke-linecap", "round");
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "3.8");
      dot.setAttribute("fill", sp.col || "#1F1D1A");
      dot.setAttribute("stroke", "#FFFFFF");
      dot.setAttribute("stroke-width", "1.6");
      leaderSvg.appendChild(line);
      leaderSvg.appendChild(dot);

      projectedPins.push({
        el: btn, line, dot,
        stepIdx: sp.kind === "stop" ? idx : -1,
        ttPos: sp.ttPos || [0, 0.2, 0],
        wPos: sp.wPos || new THREE.Vector3(0, 0.2, 0),
        wGround: sp.wGround || new THREE.Vector3(0, 0.05, 0),
        _vis: false, _sx: 0, _sy: 0, _ax: 0, _ay: 0, _depth: 0, _active: false
      });
    });
  }

  // Flexible Step-by-Step Choreography: focus ANY stop (0..N-1), spin cleanly to face it, zoom in,
  // animate the driving leg from previous stop -> this stop, and fire a celebratory landmark burst!
  function focusStep(idx, keepPlay){
    if(!activeStops.length) return;
    const clamped = ((idx % activeStops.length) + activeStops.length) % activeStops.length;
    activeStepIdx = clamped;
    stepLegProg = 0;
    if(!keepPlay){
      isPlayingJourney = false;
      if(opts.onPlayChange) opts.onPlayChange(false);
    }
    const st = activeStops[clamped];
    triggerBurst(st.ttPos, st.col);

    // Snap smoothly onto the nearest native 2K (2752x1536) macro keyframe facing this stop + zoom right in!
    const deg = nearest2KDeg(currentIsle, bestDegForPoint(st.ttPos));
    const rad = deg * Math.PI / 180;
    const rx = st.ttPos[0] * Math.cos(rad) - st.ttPos[2] * Math.sin(rad);
    const rz = st.ttPos[0] * Math.sin(rad) + st.ttPos[2] * Math.cos(rad);
    tt.autoSpin = false;
    tt.tDeg = deg;
    tt.tZoom = 2.25;
    tt.tPx = clamp(-rx * 0.42, -0.45, 0.45);
    tt.tPy = clamp(-rz * 0.14 + 0.04, -0.28, 0.28);

    // Also fly Free-3D WebGL camera smoothly to that stop!
    if(st.wGround && (st.wGround.x !== 0 || st.wGround.z !== 0)){
      cam.autoSpin = false;
      cam.tTx = st.wGround.x;
      cam.tTy = st.wGround.y * 0.5;
      cam.tTz = st.wGround.z + 0.25;
      cam.tDist = 8.8;
      cam.tPitch = 0.54;
    }

    if(opts.onStepChange) opts.onStepChange(clamped, st, activeStops.length);
  }

  function togglePlayJourney(){
    if(!activeStops.length) return false;
    isPlayingJourney = !isPlayingJourney;
    if(isPlayingJourney){
      playTimer = 0;
      const startIdx = (activeStepIdx >= 0 && activeStepIdx < activeStops.length - 1) ? activeStepIdx + 1 : 0;
      focusStep(startIdx, true);
    }
    if(opts.onPlayChange) opts.onPlayChange(isPlayingJourney);
    return isPlayingJourney;
  }

  function setView(isle, focusDayId, biDays, dCols, snapNow){
    lastViewArgs = [isle, focusDayId, biDays, dCols, snapNow];
    currentIsle = isle === "oahu" ? "oahu" : "big";
    currentFocusDay = focusDayId || null;
    activeStepIdx = -1;
    isPlayingJourney = false;
    dayDrawProg = snapNow ? 1 : 0;
    if(opts.onPlayChange) opts.onPlayChange(false);
    if(opts.onStepChange) opts.onStepChange(-1, null, 0);

    if(worlds.big) worlds.big.group.visible = (currentIsle === "big");
    if(worlds.oahu) worlds.oahu.group.visible = (currentIsle === "oahu");
    clearRoutes();
    ttActiveRoutes = [];
    activeStops = [];

    const wObj = worlds[currentIsle];
    const DAY_SHORT = {d0:"落地", d1:"火山", d2:"骑马", d3:"白沙滩", d4:"夜潜", d5:"观星", d6:"弹性"};

    if(currentIsle === "oahu"){
      ttActiveRoutes = [{pts: TT_OAHU_ROAD, col: "#0284C7", active: true, isPlane: false}];
      tt.tDeg = 0; tt.tZoom = 1.26; tt.tPx = 0; tt.tPy = -0.02;
      if(wObj){
        activeCurve = add3dRouteGPS(OAHU_ROAD_GPS, wObj, "#0284C7", true);
        miniSUV.visible = true;
      }
      const specs = OAHU_STOPS_GPS.map((s, idx)=>{
        let wPos = new THREE.Vector3(), wGround = new THREE.Vector3();
        if(wObj){
          const [x, z] = gpsToXZ(s.lat, s.lon, wObj.meta);
          const gy = Math.max(0.08, wObj.getH(x, z)) + 0.09;
          wGround.set(x, gy, z); wPos.set(x, gy + 0.24, z);
        }
        return {kind:"stop", num:s.num, label:s.label, col:s.col, q:s.q, ttPos: TT_OAHU_STOPS[idx].p, wPos, wGround};
      });
      activeStops = specs;
      setPins(specs);
      cam.tYaw = -0.22; cam.tPitch = 0.64; cam.tDist = 19.2; cam.tTx = -0.04; cam.tTy = 0.0; cam.tTz = 0.25;
    } else {
      const activeDay = focusDayId ? biDays.find(d => d.id === focusDayId) : null;
      if(activeDay){
        const di = biDays.findIndex(d => d.id === activeDay.id);
        const col = dCols[di] || "#FF385C";
        const ttR = TT_BI_ROADS[activeDay.id] || [];
        if(ttR.length >= 2) ttActiveRoutes = [{pts: ttR, col, active: true, isPlane: activeDay.id === "d0" || activeDay.id === "d6"}];
        const fp = TT_BI_FOCUS[activeDay.id] || {deg: 0, zoom: 1.65, px: 0, py: 0};
        tt.tDeg = fp.deg; tt.tZoom = fp.zoom; tt.tPx = fp.px; tt.tPy = fp.py;

        if(wObj){
          const roadGps = BI_ROADS_GPS[activeDay.id] || [];
          if(roadGps.length >= 2){
            activeCurve = add3dRouteGPS(roadGps, wObj, col, true);
            miniSUV.visible = true;
          }
        }
        const stopPins = activeDay.stops.filter(s => s.pin && TT_BI_LOC[s.pin]);
        let cx = 0, cz = 0;
        const specs = stopPins.map((s, pi)=>{
          let wPos = new THREE.Vector3(), wGround = new THREE.Vector3();
          if(wObj && BI_GPS[s.pin]){
            const [lat, lon] = BI_GPS[s.pin];
            const [lx, lz] = gpsToXZ(lat, lon, wObj.meta);
            cx += lx; cz += lz;
            const gy = Math.max(0.08, wObj.getH(lx, lz)) + 0.10;
            wGround.set(lx, gy, lz); wPos.set(lx, gy + 0.24, lz);
          }
          const shortName = s.n.replace(/\s*\(.+?\)/g,"").replace(/\s*[+&]\s*.+$/,"").slice(0,12);
          return {kind:"stop", num:pi+1, label:shortName, col, pin:s.pin, ttPos: TT_BI_LOC[s.pin], wPos, wGround};
        });
        activeStops = specs;
        setPins(specs);
        if(stopPins.length && wObj){
          cx /= stopPins.length; cz /= stopPins.length;
          const presets = {
            d0:{yaw:-0.55,pitch:0.58,dist:11.6}, d1:{yaw:0.32,pitch:0.58,dist:13.8},
            d2:{yaw:-0.36,pitch:0.58,dist:11.2}, d3:{yaw:-0.58,pitch:0.56,dist:11.4},
            d4:{yaw:-0.62,pitch:0.56,dist:11.4}, d5:{yaw:0.22,pitch:0.52,dist:11.6}, d6:{yaw:-0.50,pitch:0.58,dist:11.4}
          };
          const pr = presets[activeDay.id] || {yaw:-0.26,pitch:0.60,dist:12.2};
          cam.tYaw = pr.yaw; cam.tPitch = pr.pitch; cam.tDist = pr.dist;
          cam.tTx = cx * 0.78; cam.tTy = 0.08; cam.tTz = cz * 0.78 + 0.55;
        }
      } else {
        // Overview mode: ZERO tangled spaghetti lines! Keep the 2K plush island 100% clean & calm until a day is selected!
        ttActiveRoutes = [];
        tt.tDeg = 0; tt.tZoom = 1.24; tt.tPx = 0; tt.tPy = -0.02;
        setPins(biDays.map((d, di)=>{
          let wPos = new THREE.Vector3(), wGround = new THREE.Vector3();
          if(wObj && BI_BADGE_GPS[d.id]){
            const [lat, lon] = BI_BADGE_GPS[d.id];
            const [bx, bz] = gpsToXZ(lat, lon, wObj.meta);
            const gy = Math.max(0.08, wObj.getH(bx, bz)) + 0.10;
            wGround.set(bx, gy, bz); wPos.set(bx, gy + 0.24, bz);
          }
          return {
            kind:"day", dayId:d.id, num:d.num, tag:DAY_SHORT[d.id] || "", col:dCols[di],
            ttPos: TT_BI_BADGE[d.id] || [0,0.2,0], wPos, wGround
          };
        }));
        cam.tYaw = -0.24; cam.tPitch = 0.64; cam.tDist = 19.6; cam.tTx = 0.04; cam.tTy = 0.0; cam.tTz = 0.20;
      }
    }

    if(pendingAngle){
      if(typeof pendingAngle[0] === "number"){ tt.tDeg = pendingAngle[0]; cam.tYaw = pendingAngle[0]*Math.PI/180; }
      if(typeof pendingAngle[1] === "number") cam.tPitch = pendingAngle[1]*Math.PI/180;
      if(typeof pendingAngle[2] === "number"){
        if(pendingAngle[2] < 5) tt.tZoom = clamp(pendingAngle[2], 0.85, 3.8);
        else cam.tDist = pendingAngle[2];
      }
    }
    if(snapNow || pendingAngle){
      tt.deg = tt.tDeg; tt.zoom = tt.tZoom; tt.px = tt.tPx; tt.py = tt.tPy;
      cam.yaw = cam.tYaw; cam.pitch = cam.tPitch; cam.dist = cam.tDist;
      cam.tx = cam.tTx; cam.ty = cam.tTy; cam.tz = cam.tTz;
      tickFrame(0.016);
    }
  }

  ["bi", "oahu"].forEach(key=>{
    loadImage(META[key].demUrl).then(demImg=>{
      const wKey = key === "bi" ? "big" : "oahu";
      const wObj = buildFreePlushWorld(key, demImg);
      worlds[wKey] = wObj; wObj.group.visible = (currentIsle === wKey);
      scene.add(wObj.group);
      if(lastViewArgs && currentIsle === wKey) setView(lastViewArgs[0], lastViewArgs[1], lastViewArgs[2], lastViewArgs[3], true);
    }).catch(err => console.error("DEM load failed:", key, err));
  });

  // Flexible Touch & Mouse Orbit / Pan / Deep Zoom (immediately hands control back if auto-playing!)
  const pointers = new Map();
  let lastDist = 0, lastX = 0, lastY = 0;

  function onDown(e){
    mountEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    tt.autoSpin = false; cam.autoSpin = false; tt.vel = 0; pendingAngle = null;
    if(isPlayingJourney){ isPlayingJourney = false; if(opts.onPlayChange) opts.onPlayChange(false); }
    if(opts.onSpinChange) opts.onSpinChange(false);
    if(pointers.size === 1){ lastX = e.clientX; lastY = e.clientY; }
    else if(pointers.size === 2){
      const arr = [...pointers.values()];
      lastDist = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
    }
  }
  function onMove(e){
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if(pointers.size === 1){
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if(currentMode === "turntable"){
        tt.tDeg += dx * 0.56;
        tt.vel = dx * 0.56;
        if(tt.tZoom > 1.28) tt.tPy = clamp(tt.tPy + dy * 0.0024, -0.55, 0.55);
      } else {
        cam.tYaw -= dx * 0.0085;
        cam.tPitch = clamp(cam.tPitch + dy * 0.0065, 0.20, 1.38);
      }
    } else if(pointers.size === 2){
      const arr = [...pointers.values()];
      const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if(lastDist > 0){
        if(currentMode === "turntable") tt.tZoom = clamp(tt.tZoom * (d / lastDist), 0.90, 3.80);
        else cam.tDist = clamp(cam.tDist * (lastDist / d), 5.2, 24.0);
      }
      lastDist = d;
    }
  }
  function onUp(e){ pointers.delete(e.pointerId); if(pointers.size < 2) lastDist = 0; }
  mountEl.addEventListener("pointerdown", onDown);
  mountEl.addEventListener("pointermove", onMove);
  mountEl.addEventListener("pointerup", onUp);
  mountEl.addEventListener("pointercancel", onUp);
  mountEl.addEventListener("wheel", e=>{
    e.preventDefault();
    if(currentMode === "turntable") tt.tZoom = clamp(tt.tZoom * (e.deltaY > 0 ? 0.90 : 1.12), 0.90, 3.80);
    else cam.tDist = clamp(cam.tDist * (e.deltaY > 0 ? 1.09 : 0.91), 5.2, 24.0);
  }, {passive: false});

  function projectTT(pt, theta, cx, cy, rxScale, rzScale, ryScale){
    const ct = Math.cos(theta), st = Math.sin(theta);
    const rx = pt[0] * ct - pt[2] * st;
    const rz = pt[0] * st + pt[2] * ct;
    return {x: cx + rx * rxScale, y: cy + rz * rzScale - pt[1] * ryScale, depth: (1.0 - rz) * 0.5};
  }

  const tmpV = new THREE.Vector3(), tmpG = new THREE.Vector3(), nextV = new THREE.Vector3();
  let tAcc = 0;

  function renderTurntable(dt, rw, rh){
    const dpr = Math.min(window.devicePixelRatio || 2, 2.5);
    const cw = Math.round(rw * dpr), ch = Math.round(rh * dpr);
    if(ttCanvas.width !== cw || ttCanvas.height !== ch){ ttCanvas.width = cw; ttCanvas.height = ch; }
    ttCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ttCtx.imageSmoothingEnabled = true;
    ttCtx.imageSmoothingQuality = "high";
    ttCtx.fillStyle = "#FFFFFF";
    ttCtx.fillRect(0, 0, rw, rh);

    // Advance one-shot draw-in & step playback (stops peacefully at the final stop instead of looping endlessly!)
    dayDrawProg = Math.min(1, dayDrawProg + dt * 0.85);
    if(activeStepIdx >= 0){
      stepLegProg = Math.min(1, stepLegProg + dt * 0.72);
      if(isPlayingJourney){
        playTimer += dt;
        if(playTimer >= 2.8){
          playTimer = 0;
          if(activeStepIdx < activeStops.length - 1){
            focusStep(activeStepIdx + 1, true);
          } else {
            // Arrived cleanly at the last stop -> pause peacefully!
            isPlayingJourney = false;
            if(opts.onPlayChange) opts.onPlayChange(false);
          }
        }
      }
    }

    if(tt.autoSpin) tt.tDeg += dt * 30.0;
    else if(pointers.size === 0){
      if(Math.abs(tt.vel) > 0.18){
        tt.tDeg += tt.vel * 0.45;
        tt.vel *= Math.pow(0.88, dt * 60);
      } else if(!pendingAngle){
        // Gently magnetically settle onto the nearest native 2K macro keyframe once drag finishes!
        tt.vel = 0;
        const snapDeg = nearest2KDeg(currentIsle, tt.tDeg);
        const snapD = shortestAngleDelta(tt.tDeg * Math.PI / 180, snapDeg * Math.PI / 180) * 180 / Math.PI;
        if(Math.abs(snapD) > 0.1) tt.tDeg += snapD * Math.min(1, dt * 6.0);
      }
    }

    const k = 1 - Math.exp(-8.5 * dt);
    const dDeg = shortestAngleDelta(tt.deg * Math.PI / 180, tt.tDeg * Math.PI / 180) * 180 / Math.PI;
    tt.deg += dDeg * k;
    tt.zoom = lerp(tt.zoom, tt.tZoom, k);
    tt.px = lerp(tt.px, tt.tPx, k);
    tt.py = lerp(tt.py, tt.tPy, k);

    const degNorm = ((tt.deg % 360) + 360) % 360;
    const frameIdx = Math.floor((degNorm / 360) * FRAME_COUNT) % FRAME_COUNT;
    const frames = ttFrames[currentIsle];
    let img = frames[frameIdx];
    if(!img || !img.complete || !img.naturalWidth) img = frames[0];

    // Generous hero sizing
    const sheetEl = document.getElementById("mapSheet");
    const sheetOpen = sheetEl && sheetEl.getBoundingClientRect().height > 120;
    const baseCy = sheetOpen ? rh * 0.34 : rh * 0.46;
    const drawW = rw * 1.18 * tt.zoom;
    const drawH = drawW * (9 / 16);
    const cx = rw * 0.5 + tt.px * rw * 0.46;
    const cy = baseCy + tt.py * rh * 0.32;

    if(img && img.complete && img.naturalWidth > 0){
      ttCtx.drawImage(img, cx - drawW * 0.5, cy - drawH * 0.5, drawW, drawH);
    }
    // Seamless native 2K (2752x1536) tack-sharp macro cross-fade when near any 2K keyframe!
    const keys2k = TT_2K_KEYS[currentIsle] || [];
    let best2kIdx = -1, best2kDiff = 999;
    keys2k.forEach(idx=>{
      const diff = Math.abs(shortestAngleDelta(degNorm * Math.PI / 180, (idx * 6) * Math.PI / 180) * 180 / Math.PI);
      if(diff < best2kDiff){ best2kDiff = diff; best2kIdx = idx; }
    });
    if(best2kIdx >= 0 && best2kDiff < 5.5){
      const hiImg = tt2kFrames[currentIsle][best2kIdx];
      if(hiImg && hiImg.complete && hiImg.naturalWidth > 0){
        const hiAlpha = clamp((5.5 - best2kDiff) / 4.2, 0, 1);
        ttCtx.save();
        ttCtx.globalAlpha = hiAlpha;
        ttCtx.drawImage(hiImg, cx - drawW * 0.5, cy - drawH * 0.5, drawW, drawH);
        ttCtx.restore();
      }
    }

    const theta = degNorm * Math.PI / 180;
    const rxScale = drawW * 0.365;
    const rzScale = drawW * 0.168;
    const ryScale = drawH * 0.38;
    const islandCy = cy + drawH * 0.055;
    const projFn = (pt) => projectTT(pt, theta, cx, islandCy, rxScale, rzScale, ryScale);

    // 1. Calm restrained ambient breath (zero visual chaos!)
    drawLivingLandmarkFX(ttCtx, currentIsle, currentFocusDay, projFn, tt.zoom, tAcc);

    // 2. Single-Active-Route clean directional display (ONLY the 1 selected day is drawn — zero spaghetti!
    //    One-shot smooth draw-in + static crisp directional chevrons + car drives ONCE and rests peacefully!)
    ttActiveRoutes.forEach(r=>{
      if(!r.pts || r.pts.length < 2 || !r.active) return;
      const raw2d = r.pts.map(projFn);
      const dense = sampleDense2D(raw2d, 14);
      const {cum, total} = measurePolyline(dense);
      if(total < 2) return;

      ttCtx.save();
      ttCtx.lineCap = "round";
      ttCtx.lineJoin = "round";

      const tracePartial = (maxFrac)=>{
        const limitD = total * clamp(maxFrac, 0, 1);
        ttCtx.beginPath();
        ttCtx.moveTo(dense[0].x, dense[0].y);
        for(let i = 1; i < dense.length; i++){
          if(cum[i] <= limitD) ttCtx.lineTo(dense[i].x, dense[i].y);
          else { const p = sampleAtDist(dense, cum, limitD); ttCtx.lineTo(p.x, p.y); break; }
        }
      };

      // Subtle dashed full route preview so user always sees the upcoming shape without visual weight
      tracePartial(1);
      ttCtx.strokeStyle = "rgba(255,255,255,0.72)";
      ttCtx.lineWidth = 5.4;
      ttCtx.stroke();
      tracePartial(1);
      ttCtx.strokeStyle = r.col;
      ttCtx.globalAlpha = 0.22;
      ttCtx.setLineDash([4, 5]);
      ttCtx.lineWidth = 2.6;
      ttCtx.stroke();
      ttCtx.setLineDash([]);
      ttCtx.globalAlpha = 1;

      // Active completed + current leg drawn cleanly ONCE (settles calmly!)
      const drawFrac = activeStepIdx >= 0
        ? clamp((activeStepIdx + stepLegProg) / Math.max(1, activeStops.length), 0.14, 1)
        : dayDrawProg;
      tracePartial(drawFrac);
      ttCtx.strokeStyle = "rgba(255,255,255,0.95)";
      ttCtx.lineWidth = 6.6;
      ttCtx.stroke();
      tracePartial(drawFrac);
      ttCtx.strokeStyle = r.col;
      ttCtx.lineWidth = 3.6;
      ttCtx.stroke();

      // Static crisp white directional chevrons (`›`) showing exact From -> To flow (zero endless strobe!)
      const chevSpacing = 34;
      const activeLen = total * drawFrac;
      for(let d = 20; d < activeLen - 16; d += chevSpacing){
        const pt = sampleAtDist(dense, cum, d);
        ttCtx.save();
        ttCtx.translate(pt.x, pt.y);
        ttCtx.rotate(pt.ang);
        ttCtx.strokeStyle = "#FFFFFF";
        ttCtx.lineWidth = 1.8;
        ttCtx.beginPath();
        ttCtx.moveTo(-2.8, -2.8);
        ttCtx.lineTo(2.2, 0);
        ttCtx.lineTo(-2.8, 2.8);
        ttCtx.stroke();
        ttCtx.restore();
      }

      // Clean origin start dot
      const startPt = dense[0];
      ttCtx.beginPath();
      ttCtx.arc(startPt.x, startPt.y, 4.8, 0, Math.PI * 2);
      ttCtx.fillStyle = "#FFFFFF"; ttCtx.fill();
      ttCtx.strokeStyle = r.col; ttCtx.lineWidth = 2.2; ttCtx.stroke();

      // Miniature SUV / Plane glides ONCE smoothly to the current step destination, then parks calmly!
      let vehFrac;
      if(activeStepIdx >= 0 && activeStops.length > 0){
        const legStartF = activeStepIdx === 0 ? 0 : (activeStepIdx / activeStops.length) * 0.85;
        const legEndF = ((activeStepIdx + 1) / activeStops.length) * 0.92;
        const easeOut = 1 - Math.pow(1 - stepLegProg, 3);
        vehFrac = lerp(legStartF, legEndF, easeOut);
      } else {
        const easeOut = 1 - Math.pow(1 - dayDrawProg, 3);
        vehFrac = lerp(0.06, 0.88, easeOut);
      }
      const vp = sampleAtDist(dense, cum, total * vehFrac);
      drawMiniVehicle2D(ttCtx, vp.x, vp.y, vp.ang, r.col, r.isPlane);
      ttCtx.restore();
    });

    // 3. One-shot calm arrival burst only (NO infinite pulsing ring!)
    bursts = bursts.filter(b => tAcc - b.born < 0.95);
    bursts.forEach(b=>{
      const ph = (tAcc - b.born) / 0.95;
      const bp = projFn(b.p);
      ttCtx.save();
      ttCtx.strokeStyle = b.col;
      ttCtx.globalAlpha = (1 - ph) * 0.72;
      ttCtx.lineWidth = 2.2 * (1 - ph * 0.4);
      ttCtx.beginPath();
      ttCtx.arc(bp.x, bp.y, 6 + ph * 24, 0, Math.PI * 2);
      ttCtx.stroke();
      ttCtx.restore();
    });

    // 4. Sync 3D pins (hide off-frame pins cleanly when deeply zoomed in so edges NEVER crowd!)
    projectedPins.forEach(p=>{
      const g = projFn(p.ttPos);
      const inView = g.x > 16 && g.x < rw - 16 && g.y > 96 && g.y < rh - 110;
      p._vis = inView;
      p._ax = g.x; p._ay = g.y;
      p._sx = g.x; p._sy = g.y - 14;
      p._depth = g.depth;
      p._active = (activeStepIdx >= 0 && p.stepIdx === activeStepIdx);
    });
    layoutLabels(pinLayerEl, projectedPins, rw, rh);
  }

  function renderFree3D(dt, rw, rh){
    if(activeStepIdx >= 0 && isPlayingJourney){
      playTimer += dt;
      if(playTimer >= 3.2){
        playTimer = 0;
        focusStep(activeStepIdx < activeStops.length - 1 ? activeStepIdx + 1 : 0, true);
      }
    }
    if(cam.autoSpin) cam.tYaw += dt * 0.36;
    const k = 1 - Math.exp(-8.5 * dt);
    cam.yaw = lerp(cam.yaw, cam.tYaw, k); cam.pitch = lerp(cam.pitch, cam.tPitch, k);
    cam.dist = lerp(cam.dist, cam.tDist, k); cam.tx = lerp(cam.tx, cam.tTx, k);
    cam.ty = lerp(cam.ty, cam.tTy, k); cam.tz = lerp(cam.tz, cam.tTz, k);

    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(cam.tx + cam.dist*cp*Math.sin(cam.yaw), cam.ty + cam.dist*sp, cam.tz + cam.dist*cp*Math.cos(cam.yaw));
    camera.lookAt(cam.tx, cam.ty, cam.tz);

    const wObj = worlds[currentIsle];
    if(wObj && wObj.anims){
      wObj.anims.steam.forEach(st=>{
        const p = (st.userData.phase + tAcc * 0.22) % 1;
        st.position.set(st.userData.bx + Math.sin(tAcc*1.1+p*4.5)*0.08*p, st.userData.by + p*0.72, st.userData.bz + Math.cos(tAcc*0.9+p*4)*0.06*p);
        st.scale.setScalar(0.36 + Math.sin(p*Math.PI)*0.62);
      });
      wObj.anims.clouds.forEach(cl=>{
        cl.position.x = cl.userData.bx + Math.sin(tAcc*0.35+cl.userData.phase)*0.12;
        cl.position.y = cl.userData.by + Math.sin(tAcc*0.7+cl.userData.phase)*0.025;
      });
      if(wObj.anims.manta){
        const mn = wObj.anims.manta, a = tAcc * 0.7;
        mn.position.x = mn.userData.bx + Math.cos(a)*0.22;
        mn.position.z = mn.userData.bz + Math.sin(a)*0.28;
        mn.rotation.z = -a;
      }
    }
    if(activeCurve && miniSUV.visible){
      suvProg = (suvProg + dt * 0.11) % 1;
      activeCurve.getPointAt(suvProg, tmpV);
      activeCurve.getPointAt((suvProg + 0.018) % 1, nextV);
      miniSUV.position.copy(tmpV); miniSUV.position.y += 0.020;
      miniSUV.lookAt(nextV.x, tmpV.y + 0.020, nextV.z);
    }

    renderer.render(scene, camera);

    projectedPins.forEach(p=>{
      tmpV.copy(p.wPos).project(camera);
      tmpG.copy(p.wGround).project(camera);
      if(tmpV.z > 1){ p._vis = false; return; }
      p._vis = true;
      p._ax = (tmpG.x * 0.5 + 0.5) * rw; p._ay = (-tmpG.y * 0.5 + 0.5) * rh;
      p._sx = (tmpV.x * 0.5 + 0.5) * rw; p._sy = (-tmpV.y * 0.5 + 0.5) * rh;
      p._depth = tmpV.z;
      p._active = (activeStepIdx >= 0 && p.stepIdx === activeStepIdx);
    });
    layoutLabels(pinLayerEl, projectedPins, rw, rh);
  }

  function tickFrame(dt){
    tAcc += dt;
    const rw = mountEl.clientWidth || W, rh = mountEl.clientHeight || H;
    if(currentMode === "turntable") renderTurntable(dt, rw, rh);
    else renderFree3D(dt, rw, rh);
  }

  let alive = true, lastTs = 0, raf = 0;
  function loop(ts){
    if(!alive) return;
    if(!lastTs) lastTs = ts;
    const dt = Math.min(0.05, Math.max(0.008, (ts - lastTs) / 1000));
    lastTs = ts;
    if(mountEl.offsetParent !== null){
      const nw = mountEl.clientWidth, nh = mountEl.clientHeight;
      if(nw > 0 && nh > 0 && (Math.abs(nw - renderer.domElement.clientWidth) > 2 || Math.abs(nh - renderer.domElement.clientHeight) > 2)){
        camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh);
      }
      tickFrame(dt);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    setView,
    focusStep,
    togglePlayJourney,
    setMode(mode){
      currentMode = mode === "free3d" ? "free3d" : "turntable";
      applyVisibility();
      tickFrame(0.016);
    },
    zoom(f){
      if(currentMode === "turntable") tt.tZoom = clamp(tt.tZoom / f, 0.90, 3.80);
      else cam.tDist = clamp(cam.tDist * f, 5.2, 24.0);
    },
    toggleSpin(){
      const next = !(currentMode === "turntable" ? tt.autoSpin : cam.autoSpin);
      tt.autoSpin = next; cam.autoSpin = next;
      return next;
    },
    setAngle(yawDeg, pitchDeg, dist){
      pendingAngle = [yawDeg, pitchDeg, dist];
      if(typeof yawDeg === "number"){ tt.deg = tt.tDeg = yawDeg; cam.yaw = cam.tYaw = yawDeg*Math.PI/180; }
      if(typeof pitchDeg === "number") cam.pitch = cam.tPitch = pitchDeg*Math.PI/180;
      if(typeof dist === "number"){
        if(dist < 5) tt.zoom = tt.tZoom = clamp(dist, 0.90, 3.80);
        else cam.dist = cam.tDist = dist;
      }
      tickFrame(0.016);
    },
    reset(){
      tt.autoSpin = false; cam.autoSpin = false; pendingAngle = null;
      activeStepIdx = -1; isPlayingJourney = false;
      if(opts.onPlayChange) opts.onPlayChange(false);
      if(opts.onStepChange) opts.onStepChange(-1, null, 0);
      tt.tDeg = 0; tt.tZoom = currentIsle === "oahu" ? 1.26 : 1.24; tt.tPx = 0; tt.tPy = -0.02;
      cam.tYaw = currentIsle === "oahu" ? -0.22 : -0.24; cam.tPitch = 0.64;
      cam.tDist = currentIsle === "oahu" ? 19.2 : 19.6;
      cam.tTx = currentIsle === "oahu" ? -0.04 : 0.04; cam.tTy = 0.0; cam.tTz = currentIsle === "oahu" ? 0.25 : 0.20;
    },
    resize(){
      const nw = mountEl.clientWidth, nh = mountEl.clientHeight;
      if(nw > 0 && nh > 0){
        camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh);
        tickFrame(0.016);
      }
    },
    destroy(){ alive = false; cancelAnimationFrame(raf); renderer.dispose(); }
  };
}

global.HawaiiIsland3D = { create: createIsland3DController };
})(window);
