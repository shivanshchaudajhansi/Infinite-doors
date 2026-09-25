/* INFINITE ROOMS — 3D first-person horror (Three.js r128 + WebAudio) */
'use strict';
const $ = i => document.getElementById(i), R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const pad = n => String(n).padStart(3, '0'), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (MOBILE) document.body.classList.add('mobile-device');
const cv = $('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.4 : 1.6));
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(72, 1, .05, 60);
cam.rotation.order = 'YXZ'; scene.add(cam);
function resize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

/* ---------- data ---------- */
const DIFF = {
  easy: { dmgBase: 20, dmgGrow: 1.2, spd: 1.25, spdGrow: .025, gap: [13, 22], amb: .26, fog: .05, heal: 45 },
  normal: { dmgBase: 30, dmgGrow: 1.8, spd: 1.75, spdGrow: .04, gap: [8, 15], amb: .12, fog: .08, heal: 35 },
  nightmare: { dmgBase: 45, dmgGrow: 2.6, spd: 2.5, spdGrow: .055, gap: [5, 9], amb: .03, fog: .13, heal: 30 }
};
const ENV = {
  hotel: { name: 'ABANDONED HOTEL', wall: '#6b5645', wk: 'paper', floor: '#3a2620', fk: 'carpet', ceil: '#2b2724', light: 0xffd9a0, h: 3, hum: 55, foot: 500, items: ['table', 'chair', 'sofa', 'lamp', 'sofa'], art: ['painting', '#2a1d14', '#c9b28a'], ev: ['bang', 'creak', 'ding', 'steps'] },
  school: { name: 'OLD SCHOOL', wall: '#5d6a56', wk: 'tile', floor: '#4a4a3c', fk: 'tile', ceil: '#2a2d29', light: 0xdfe8d0, h: 3.2, hum: 60, foot: 1400, items: ['desk', 'desk', 'desk', 'chair', 'locker'], art: ['board', '#16261c', '#d8ddd0', 'HE IS BEHIND YOU'], ev: ['bang', 'creak', 'steps', 'whisper'] },
  house: { name: 'EMPTY HOUSE', wall: '#75624d', wk: 'paper', floor: '#4b3220', fk: 'planks', ceil: '#2c2620', light: 0xffc98a, h: 2.8, hum: 50, foot: 700, items: ['table', 'chair', 'chair', 'sofa', 'lamp'], art: ['painting', '#221a12', '#b9a184'], ev: ['bang', 'creak', 'steps', 'whisper'] },
  factory: { name: 'ABANDONED FACTORY', wall: '#55554f', wk: 'concrete', floor: '#333431', fk: 'concrete', ceil: '#1c1d1c', light: 0xc4cbb8, h: 5.5, hum: 42, foot: 900, items: ['crate', 'machine', 'crate', 'machine'], art: ['sign', '#d8b000', '#111', 'DANGER'], ev: ['clank', 'bang', 'creak', 'zap'] },
  station: { name: 'UNDERGROUND STATION', wall: '#5d666a', wk: 'tile', floor: '#2d3235', fk: 'concrete', ceil: '#181b1d', light: 0xc8d6da, h: 4.5, hum: 48, foot: 1100, items: ['bench', 'pillar', 'bench', 'pillar'], art: ['sign', '#0e2a4a', '#e6eef5', 'NO EXIT'], ev: ['rumble', 'steps', 'bang', 'whisper'] },
  laboratory: { name: 'SECRET LABORATORY', wall: '#6c7a77', wk: 'tile', floor: '#2b3331', fk: 'tile', ceil: '#1c2221', light: 0xd0f0e6, h: 3.4, hum: 70, foot: 1600, items: ['labtable', 'tank', 'labtable', 'locker'], art: ['sign', '#5a0a0a', '#ffd6d6', 'RESTRICTED'], ev: ['zap', 'bang', 'creak', 'whisper'] }
};
const S = {
  run: false, pause: false, over: false, frozen: false, env: 'hotel', diff: 'easy', room: 1, hp: 100, fl: true,
  p: { x: 0, z: 0 }, yaw: 0, pitch: 0, shake: 0, hasKey: false, stepD: 0, bob: 0, gt: 5, ev: 10, beat: 0, whis: 4,
  eye: 1.65, flash: 0, door: 0, doorT: 0, jumpY: 0, jumpV: 0, jumping: false, nextHealRoom: 3
};
let selEnv = 'hotel', selDiff = 'easy';
document.querySelectorAll('.environment').forEach(b => b.onclick = () => { document.querySelectorAll('.environment').forEach(i => i.classList.remove('selected')); b.classList.add('selected'); selEnv = b.dataset.environment; });
document.querySelectorAll('.difficulty').forEach(b => b.onclick = () => { document.querySelectorAll('.difficulty').forEach(i => i.classList.remove('selected')); b.classList.add('selected'); selDiff = b.dataset.difficulty; });
if (MOBILE) $('controlsHint').textContent = 'TOUCH D-PAD TO MOVE · DRAG SCREEN TO LOOK · E INTERACT · JUMP · F FLASHLIGHT';

/* ---------- audio ---------- */
let AC, master, nb, amb = [];
function audio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .85; master.connect(AC.destination);
  nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function noise(dur, type, f, q, vol, pan = 0, at = 0, to) {
  if (!AC) return; const t = AC.currentTime + at, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(), p = AC.createStereoPanner();
  s.buffer = nb; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(.05, dur / 3)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  p.pan.value = clamp(pan, -1, 1); s.connect(fl); fl.connect(g); g.connect(p); p.connect(master); s.start(t); s.stop(t + dur + .1);
}
function tone(type, f1, f2, dur, vol, pan = 0, at = 0) {
  if (!AC) return; const t = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain(), p = AC.createStereoPanner();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); p.pan.value = clamp(pan, -1, 1);
  o.connect(g); g.connect(p); p.connect(master); o.start(t); o.stop(t + dur + .05);
}
const X = {
  step() { noise(.14, 'lowpass', ENV[S.env].foot, .7, .35, 0); },
  click() { noise(.04, 'highpass', 3000, 1, .25); },
  key() { tone('sine', 1200, 1200, .6, .15); tone('sine', 1800, 1800, .8, .12, 0, .1); },
  door() { noise(1.4, 'bandpass', 500, 18, .4, 0, 0, 140); tone('sawtooth', 90, 60, 1.3, .08); },
  locked() { noise(.15, 'bandpass', 900, 6, .4); noise(.15, 'bandpass', 700, 6, .4, 0, .2); },
  bang(p) { noise(.7, 'lowpass', 260, 1, .8, p); tone('sine', 70, 30, .5, .5, p); },
  creak(p) { noise(1.5, 'bandpass', 700, 25, .28, p, 0, 180); },
  whisper(p) { for (let i = 0; i < 7; i++) noise(R(.15, .3), 'bandpass', R(900, 2800), 10, .32, p, i * .2); },
  growl(p) { noise(.9, 'lowpass', 180, 2, .4, p); tone('sawtooth', 90, 45, .9, .3, p); },
  beat(v) { tone('sine', 65, 35, .18, v); tone('sine', 60, 30, .2, v * .8, 0, .22); },
  scream() { tone('sawtooth', 600, 1500, .9, .4); tone('square', 900, 300, .9, .18); noise(1, 'highpass', 1500, 1, .65); tone('sine', 55, 30, 1.2, .85); },
  banish() { noise(.8, 'bandpass', 3000, 3, .5, 0, 0, 300); tone('sawtooth', 1200, 120, .8, .2); },
  clank(p) { tone('square', 180, 90, .3, .2, p); noise(.4, 'bandpass', 1500, 8, .35, p); },
  rumble() { noise(4, 'lowpass', 110, 1, .6); },
  zap(p) { noise(.5, 'highpass', 2500, 1, .35, p); tone('sawtooth', 2000, 200, .3, .1, p); },
  ding(p) { tone('sine', 880, 880, 2.2, .15, p); },
  steps(p) { for (let i = 0; i < 6; i++) noise(.12, 'lowpass', 400, .7, .18, p, i * .45); },
  heal() { tone('sine', 500, 900, .5, .18); tone('sine', 700, 1100, .6, .14, 0, .12); }
};
function startAmbient() {
  stopAmbient(); const e = ENV[S.env], o1 = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(), lfo = AC.createOscillator(), lg = AC.createGain();
  o1.type = o2.type = 'sawtooth'; o1.frequency.value = e.hum; o2.frequency.value = e.hum * 1.503; f.type = 'lowpass'; f.frequency.value = 180; g.gain.value = .06;
  lfo.frequency.value = .13; lg.gain.value = .03; lfo.connect(lg); lg.connect(g.gain); o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  const n = AC.createBufferSource(), nf = AC.createBiquadFilter(), ng = AC.createGain(); n.buffer = nb; n.loop = true; nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = .6; ng.gain.value = .05;
  n.connect(nf); nf.connect(ng); ng.connect(master); amb = [o1, o2, lfo, n]; amb.forEach(x => x.start());
}
function stopAmbient() { amb.forEach(x => { try { x.stop(); } catch (e) { } }); amb = []; }
const panOf = (x, z) => { const dx = x - S.p.x, dz = z - S.p.z, d = Math.hypot(dx, dz) || 1; return (dx * Math.cos(S.yaw) - dz * Math.sin(S.yaw)) / d; };

/* ---------- procedural textures & materials ---------- */
function tex(base, kind, rx, ry) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) { g.fillStyle = Math.random() < .5 ? `rgba(0,0,0,${Math.random() * .1})` : `rgba(255,255,255,${Math.random() * .06})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  if (kind === 'planks') for (let x = 0; x < 256; x += 42) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  if (kind === 'tile') for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.moveTo(0, x); g.lineTo(256, x); g.stroke(); }
  if (kind === 'paper') { g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 12, 256); }
  for (let i = 0; i < 6; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = R(20, 60), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .8 }, o));
const M = { wood: mat(0x4a3020), dark: mat(0x1a1a1a, { metalness: .6, roughness: .5 }), metal: mat(0x666b6b, { metalness: .7, roughness: .45 }), cloth: mat(0x4a2020, { roughness: 1 }), paint: mat(0x666655) };
let room, W, L, H, cols, dx, pivot, dust, lights, mons, terminalMesh, terminalGlow, termPos, healPack;
function box(w, h, d, m, x, y, z, p) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (p || room).add(o); return o; }
function art(txt, bg, fg, w, h, face) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w); const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, c.height);
  if (face) { g.fillStyle = fg; g.beginPath(); g.ellipse(128, c.height / 2, 40, 55, 0, 0, 7); g.fill(); g.fillStyle = '#000'; g.fillRect(105, c.height / 2 - 15, 14, 18); g.fillRect(137, c.height / 2 - 15, 14, 18); g.fillRect(122, c.height / 2 + 20, 12, 25); }
  else { g.fillStyle = fg; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText(txt, 128, c.height / 2 + 10, 240); }
  return new THREE.CanvasTexture(c);
}

/* ---------- furniture (returns [halfW, halfD, topHeight]) ---------- */
const B = {
  table(g) { box(1.5, .08, .85, M.wood, 0, .76, 0, g); for (const x of [-.66, .66]) for (const z of [-.35, .35]) box(.07, .72, .07, M.wood, x, .36, z, g); return [.75, .43, .8]; },
  chair(g) { box(.45, .05, .45, M.wood, 0, .45, 0, g); box(.45, .55, .05, M.wood, 0, .75, -.2, g); for (const x of [-.2, .2]) for (const z of [-.2, .2]) box(.04, .44, .04, M.wood, x, .22, z, g); g.rotation.y = R(.1, 6.2); return [.28, .28, 0]; },
  desk(g) { box(.9, .05, .6, M.wood, 0, .74, 0, g); box(.05, .72, .5, M.metal, -.4, .36, 0, g); box(.05, .72, .5, M.metal, .4, .36, 0, g); box(.4, .04, .4, M.wood, 0, .44, .5, g); return [.48, .5, .78]; },
  sofa(g) { box(1.9, .4, .85, M.cloth, 0, .25, 0, g); box(1.9, .55, .2, M.cloth, 0, .65, -.35, g); box(.2, .6, .85, M.cloth, -.95, .4, 0, g); box(.2, .6, .85, M.cloth, .95, .4, 0, g); return [1, .45, .5]; },
  lamp(g) { box(.3, .04, .3, M.dark, 0, .02, 0, g); box(.03, 1.5, .03, M.dark, 0, .75, 0, g); const s = box(.35, .3, .35, mat(0xffe0a0, { emissive: 0xffb060, emissiveIntensity: .8 }), 0, 1.55, 0, g); s.castShadow = false; return [.2, .2, 0]; },
  locker(g) { box(.5, 1.9, .5, M.metal, 0, .95, 0, g); box(.02, 1.6, .01, M.dark, 0, 1, .26, g); box(.1, .02, .01, M.dark, .12, 1.4, .26, g); return [.27, .27, 0]; },
  crate(g) { const s = R(.7, 1.2); box(s, s, s, M.wood, 0, s / 2, 0, g); g.rotation.y = R(.1, 1); return [s * .7, s * .7, s + .05]; },
  machine(g) { box(1.6, 1.8, 1.1, M.metal, 0, .9, 0, g); box(1.2, .3, .9, M.dark, 0, 1.95, 0, g); box(.15, .15, .02, mat(0xff2200, { emissive: 0xff2200, emissiveIntensity: 1.5 }), .5, 1.3, .56, g); return [.85, .6, 0]; },
  bench(g) { box(2, .08, .5, M.wood, 0, .48, 0, g); box(.08, .46, .45, M.metal, -.8, .23, 0, g); box(.08, .46, .45, M.metal, .8, .23, 0, g); box(2, .5, .06, M.wood, 0, .8, -.22, g); return [1, .28, 0]; },
  pillar(g) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, H, 14), M.paint); p.position.y = H / 2; p.castShadow = p.receiveShadow = true; g.add(p); return [.4, .4, 0]; },
  labtable(g) { box(1.8, .06, .8, M.metal, 0, .9, 0, g); box(1.7, .85, .7, M.dark, 0, .43, 0, g); const s = mat(0x113322, { emissive: 0x33ff88, emissiveIntensity: 1 }); box(.5, .35, .04, s, -.3, 1.12, -.15, g); box(.06, .2, .06, M.dark, -.3, .98, -.15, g); mons.push(s); return [.9, .42, .93]; },
  tank(g) { const t = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 2, 16), mat(0x66ffaa, { transparent: true, opacity: .35, emissive: 0x22aa55, emissiveIntensity: .6, roughness: .1 })); t.position.y = 1.05; g.add(t); box(1.1, .1, 1.1, M.dark, 0, .05, 0, g); box(1.1, .1, 1.1, M.dark, 0, 2.1, 0, g); return [.6, .6, 0]; }
};

/* ---------- puzzle terminal & heal pack meshes ---------- */
function makeTerminal() {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.6, .9, .16), mat(0x141414, { emissive: 0x1c5570, emissiveIntensity: .9, metalness: .6, roughness: .4 }));
  panel.position.y = 1.15; panel.castShadow = panel.receiveShadow = true; g.add(panel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.4, .42), new THREE.MeshBasicMaterial({ color: 0x2fd0ff }));
  screen.position.set(0, 1.3, .09); g.add(screen);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.15, .3), M.metal); stand.position.y = .58; stand.castShadow = stand.receiveShadow = true; g.add(stand);
  const gl = new THREE.PointLight(0x2fd0ff, .9, 4.5); gl.position.set(0, 1.3, .3); g.add(gl);
  terminalMesh = panel; terminalGlow = gl;
  return g;
}
function makeHealPack() {
  const g = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(.36, .22, .36), mat(0xe8e8e0, { roughness: .5 })); b1.position.y = .11; b1.castShadow = b1.receiveShadow = true; g.add(b1);
  const rm = mat(0xdd2222, { emissive: 0xff3333, emissiveIntensity: .7 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(.22, .05, .05), rm); c1.position.set(0, .11, .185); g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .22), rm); c2.position.set(0, .11, .185); g.add(c2);
  const gl = new THREE.PointLight(0xff5555, .7, 3); gl.position.set(0, .4, 0); g.add(gl);
  g.userData.light = gl;
  return g;
}

/* ---------- room builder ---------- */
function buildRoom() {
  if (room) { scene.remove(room); room.traverse(o => { o.geometry && o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { m.map && m.map.dispose(); m.dispose(); }); }); }
  const e = ENV[S.env], d = DIFF[S.diff]; room = new THREE.Group(); scene.add(room);
  W = R(8, 12); L = R(14, 22); H = e.h; cols = []; mons = []; lights = []; S.hasKey = false; S.door = 0; S.doorT = 0; healPack = null;
  scene.fog = new THREE.FogExp2(0x030303, d.fog); scene.background = new THREE.Color(0x020202);
  room.add(new THREE.AmbientLight(e.light, d.amb));
  const wmW = () => mat(0xffffff, { map: tex(e.wall, e.wk, W / 2.2, H / 2.2), roughness: .95 }), wmL = mat(0xffffff, { map: tex(e.wall, e.wk, L / 2.2, H / 2.2), roughness: .95 });
  const fm = mat(0xffffff, { map: tex(e.floor, e.fk, W / 2, L / 2), roughness: .7 }), cm = mat(0xffffff, { map: tex(e.ceil, 'concrete', W / 2, L / 2) });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, L), fm); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; room.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, L), cm); ce.rotation.x = Math.PI / 2; ce.position.y = H; room.add(ce);
  box(.3, H, L, wmL, -W / 2 - .15, H / 2, 0); box(.3, H, L, wmL, W / 2 + .15, H / 2, 0); box(W + .6, H, .3, wmW(), 0, H / 2, L / 2 + .15);
  /* exit door */
  dx = R(-W / 2 + 1.5, W / 2 - 1.5); const dw = 1.3, dh = 2.3, fz = -L / 2 - .15, w1 = wmW();
  const seg = (a, b, y1, y2) => box(b - a, y2 - y1, .3, w1, (a + b) / 2, (y1 + y2) / 2, fz);
  seg(-W / 2 - .3, dx - dw / 2, 0, H); seg(dx + dw / 2, W / 2 + .3, 0, H); seg(dx - dw / 2, dx + dw / 2, dh, H);
  box(.1, dh, .34, M.dark, dx - dw / 2, dh / 2, fz); box(.1, dh, .34, M.dark, dx + dw / 2, dh / 2, fz); box(dw + .1, .1, .34, M.dark, dx, dh, fz);
  pivot = new THREE.Group(); pivot.position.set(dx - dw / 2 + .04, 0, -L / 2 + .03); room.add(pivot);
  box(dw - .08, dh - .04, .06, mat(0x3a2a20, { roughness: .6 }), (dw - .08) / 2, dh / 2 - .02, 0, pivot); box(.08, .08, .1, mat(0xb08a30, { metalness: .8 }), dw - .2, 1.05, 0, pivot);
  box(dw, dh, .4, mat(0x000000), dx, dh / 2, -L / 2 - .25);
  /* ceiling lights */
  for (let i = 0; i < 3; i++) {
    const z = -L / 2 + L * (i + .5) / 3, x = R(-W / 4, W / 4), fm2 = mat(0x222222, { emissive: e.light, emissiveIntensity: 1.2 });
    const fx = box(1.1, .06, .3, fm2, x, H - .04, z); fx.castShadow = false; const pl = new THREE.PointLight(e.light, 1.1, 13, 2); pl.position.set(x, H - .4, z); room.add(pl);
    const dead = S.diff === 'nightmare' && i === 1; if (dead) { pl.intensity = 0; fm2.emissiveIntensity = 0; }
    lights.push({ pl, fm: fm2, base: dead ? 0 : 1.1, k: 0 });
  }
  /* wall art */
  const a = e.art;
  for (let i = 0; i < 3; i++) {
    const right = Math.random() < .5, big = a[0] === 'board', w = big ? 3 : 1.1, h = big ? 1.1 : 1.4, z = R(-L / 2 + 2.5, L / 2 - 2.5), s = right ? -1 : 1;
    if (a[0] === 'board' && i > 0) break;
    const gr = new THREE.Group(); gr.position.set(-s * (W / 2 - .04), a[0] === 'sign' ? 1.8 : 1.6, z); gr.rotation.y = right ? -Math.PI / 2 : Math.PI / 2; room.add(gr);
    box(w + .1, h + .1, .05, M.dark, 0, 0, 0, gr);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: art(a[3] || '', a[1], a[2], w, h, a[0] === 'painting'), roughness: .9 })); pl.position.z = .03; gr.add(pl);
  }
  if (S.env === 'factory') for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, L, 10), M.metal); p.rotation.x = Math.PI / 2; p.position.set(s * (W / 2 - .3), H - .6, 0); p.castShadow = true; room.add(p); }
  /* puzzle terminal — always present, solid, against a side wall */
  const tSide = Math.random() < .5 ? -1 : 1, tz = clamp(R(-L / 2 + 3, L / 2 - 3), -L / 2 + 3, L / 2 - 3);
  const tGroup = makeTerminal(); tGroup.position.set(tSide * (W / 2 - .42), 0, tz); tGroup.rotation.y = tSide > 0 ? -Math.PI / 2 : Math.PI / 2; room.add(tGroup);
  termPos = { x: tGroup.position.x, z: tGroup.position.z }; cols.push({ x: termPos.x, z: termPos.z, hw: .5, hd: .5 });
  /* furniture */
  const cnt = { easy: 7, normal: 9, nightmare: 11 }[S.diff] + (S.env === 'school' ? 4 : 0), tops = [];
  for (let n = 0, tr = 0; n < cnt && tr < 250; tr++) {
    const k = pick(e.items), g = new THREE.Group(), [hw0, hd0, top] = B[k](g), q = Math.random() < .5;
    if (!g.rotation.y) g.rotation.y = q ? Math.PI / 2 : 0; const rot = g.rotation.y > 1.5 && g.rotation.y < 1.65, hw = rot ? hd0 : hw0, hd = rot ? hw0 : hd0;
    const x = R(-W / 2 + hw + .6, W / 2 - hw - .6), z = R(-L / 2 + hd + 1.5, L / 2 - hd - 3.5);
    if (z < -L / 2 + 3.2 && Math.abs(x - dx) < 1.6 + hw) continue;
    if (!cols.every(c => Math.abs(x - c.x) > c.hw + hw + .9 || Math.abs(z - c.z) > c.hd + hd + .9)) continue;
    g.position.set(x, 0, z); room.add(g); cols.push({ x, z, hw, hd }); if (top > 0) tops.push({ x, z, top }); n++;
  }
  /* heal pack on the floor, every 2-3 rooms */
  if (S.room >= S.nextHealRoom) {
    for (let tr = 0; tr < 60; tr++) {
      const x = R(-W / 2 + 1, W / 2 - 1), z = R(-L / 2 + 4, L / 2 - 3);
      if (!cols.every(c => Math.abs(x - c.x) > c.hw + .6 || Math.abs(z - c.z) > c.hd + .6)) continue;
      healPack = makeHealPack(); healPack.position.set(x, 0, z); room.add(healPack); cols.push({ x, z, hw: .3, hd: .3 }); break;
    }
    S.nextHealRoom = S.room + (Math.random() < .5 ? 2 : 3);
  }
  /* dust motes */
  const posArr = new Float32Array(300 * 3); for (let i = 0; i < 300; i++) { posArr[i * 3] = R(-W / 2, W / 2); posArr[i * 3 + 1] = R(0, H); posArr[i * 3 + 2] = R(-L / 2, L / 2); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(posArr, 3)); dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xbbb0a8, size: .035, transparent: true, opacity: .4 })); room.add(dust);
  S.p.x = R(-W / 4, W / 4); S.p.z = L / 2 - 1.5; S.yaw = R(-.4, .4); S.pitch = 0; S.gt = R(...d.gap) * 1.15; S.ev = R(6, 12);
  vanish();
}

/* ---------- flashlight (held) ---------- */
const spot = new THREE.SpotLight(0xfff0d0, 2.6, 26, .4, .55, 1.1); spot.position.set(.18, -.12, 0); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = .2; spot.shadow.bias = -.0004;
const spotT = new THREE.Object3D(); spotT.position.set(0, 0, -5); cam.add(spot, spotT); spot.target = spotT;
const torch = new THREE.Group(); torch.position.set(.26, -.24, -.5); torch.rotation.x = Math.PI / 2 + .05; cam.add(torch);
const tb = new THREE.Mesh(new THREE.CylinderGeometry(.035, .03, .28, 12), mat(0x222222, { metalness: .7, roughness: .4 })), th = new THREE.Mesh(new THREE.CylinderGeometry(.055, .038, .09, 12), mat(0x111111, { metalness: .8 })), lens = new THREE.Mesh(new THREE.CircleGeometry(.05, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
th.position.y = -.17; lens.position.y = -.216; lens.rotation.x = Math.PI / 2; torch.add(tb, th, lens);

/* ---------- ghost (creepier model) ---------- */
const G = { st: 'wait', fade: 0, age: 0, lit: 0, at: 0, dist: 99, g: new THREE.Group() };
(function () {
  const skin = new THREE.MeshStandardMaterial({ color: 0x9aa89a, emissive: 0x1c2a1c, emissiveIntensity: .5, roughness: 1, transparent: true, opacity: .82, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1, transparent: true, opacity: .92, side: THREE.DoubleSide }), void_ = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
  G.mats = [skin, black]; const dg = new THREE.CylinderGeometry(.15, .55, 1.6, 16, 8, true); G.dress = new THREE.Mesh(dg, skin); G.dress.position.y = .82; G.base = dg.attributes.position.array.slice();
  const head = new THREE.Group(); head.position.y = 1.9; const hd = new THREE.Mesh(new THREE.SphereGeometry(.15, 18, 16), skin); hd.scale.set(.92, 1.35, .92); head.add(hd);
  G.eyes = []; for (const s of [-1, 1]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 10), eyeMat); ey.scale.set(1, 1.9, .4); ey.position.set(s * .06, .05, .14); head.add(ey); G.eyes.push(ey); const gl = new THREE.PointLight(0xff2222, .6, 1.2); gl.position.copy(ey.position); head.add(gl); }
  G.mouth = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 10), void_); G.mouth.scale.set(1, 1.8, .6); G.mouth.position.set(0, -.1, .15); head.add(G.mouth);
  for (let i = -2; i <= 2; i++) { const t1 = new THREE.Mesh(new THREE.ConeGeometry(.008, .03, 4), mat(0xe8e0d0)); t1.position.set(i * .018, -.05, .195); t1.rotation.x = Math.PI; head.add(t1); const t2 = t1.clone(); t2.position.y = -.15; t2.rotation.x = 0; head.add(t2); }
  const hair = new THREE.Mesh(new THREE.CylinderGeometry(.19, .32, 1.3, 14, 1, true), black); hair.position.set(0, -.55, -.06); head.add(hair);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.18, 14, 10, 0, 6.3, 0, 1.4), black); cap.position.set(0, .04, -.03); head.add(cap); G.head = head;
  G.arms = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .21, 1.68, 0); const a = new THREE.Mesh(new THREE.CylinderGeometry(.03, .022, 1.25, 8), skin); a.position.y = -.62; p.add(a);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(.007, .003, .32, 4), black); f.position.set((i - 1.5) * .018, -1.4, 0); f.rotation.x = .12; p.add(f); }
    return p;
  });
  G.g.add(G.dress, head, ...G.arms, new THREE.PointLight(0x552222, .8, 7)); G.g.visible = false; scene.add(G.g);
})();
const camF = new THREE.Vector3(), tv = new THREE.Vector3();
function isLit(p, r) { if (!S.fl) return false; tv.set(p.x - cam.position.x, 1.2 - cam.position.y, p.z - cam.position.z); const d = tv.length(); if (d > r) return false; cam.getWorldDirection(camF); return tv.normalize().dot(camF) > .9; }
function vanish() { G.st = 'wait'; G.g.visible = false; G.lit = 0; const d = DIFF[S.diff]; S.gt = R(...d.gap) / (1 + (S.room - 1) * .05); }
function spawn() {
  const d = DIFF[S.diff]; let placed = false;
  for (let i = 0; i < 20 && !placed; i++) { const a = R(0, 6.28), r = R(8, 13), x = S.p.x + Math.cos(a) * r, z = S.p.z + Math.sin(a) * r; if (Math.abs(x) < W / 2 - .8 && Math.abs(z) < L / 2 - .8) { G.g.position.set(x, 0, z); placed = true; } }
  if (!placed) G.g.position.set(clamp(S.p.x + R(-4, 4), -W / 2 + 1, W / 2 - 1), 0, clamp(S.p.z - 9, -L / 2 + 1, L / 2 - 1));
  G.st = 'hunt'; G.fade = 0; G.age = 0; G.lit = 0; G.g.visible = true; X.whisper(panOf(G.g.position.x, G.g.position.z)); X.growl(panOf(G.g.position.x, G.g.position.z)); S.whis = R(4, 7);
}
function hit() {
  const d = DIFF[S.diff], dmg = Math.round(d.dmgBase + d.dmgGrow * (S.room - 1));
  G.st = 'attack'; G.at = .55; S.hp = Math.max(0, S.hp - dmg); S.shake = 1.4; S.flash = 1; $('flash').style.background = '#a00'; X.scream(); updateHUD();
}
function updGhost(dt, t) {
  if (G.st === 'wait') { S.gt -= dt; if (S.gt <= 0) spawn(); return; }
  const gp = G.g.position, d = DIFF[S.diff]; G.dist = Math.hypot(S.p.x - gp.x, S.p.z - gp.z);
  if (G.st === 'hunt') {
    const lit = isLit({ x: gp.x, z: gp.z }, 14), spBase = d.spd * (1 + (S.room - 1) * d.spdGrow), sp = spBase * (lit ? .3 : 1);
    gp.x += (S.p.x - gp.x) / G.dist * sp * dt; gp.z += (S.p.z - gp.z) / G.dist * sp * dt; gp.y = .12 + Math.sin(t * 2) * .08;
    G.fade = Math.min(1, G.fade + dt * .8); G.age += dt; G.lit = lit ? G.lit + dt : Math.max(0, G.lit - dt * .5);
    if (G.lit > 2.2) { X.banish(); S.flash = .8; $('flash').style.background = '#fff'; vanish(); return; }
    if (G.dist < 1.1) hit(); else if (G.age > 32) vanish();
    S.whis -= dt; if (S.whis < 0) { X.whisper(panOf(gp.x, gp.z)); S.whis = R(4, 8); }
    const T = clamp(1 - G.dist / 12, 0, 1); S.beat -= dt; if (S.beat <= 0) { X.beat(.25 + T * .6); S.beat = 1.3 - T * .8; }
    for (const e of G.eyes) e.material.color.setHSL(0, 1, .35 + T * .3);
  } else {
    G.at -= dt; cam.getWorldDirection(camF); camF.y = 0; camF.normalize(); gp.set(S.p.x + camF.x * .75, 0, S.p.z + camF.z * .75); G.fade = 1;
    G.mouth.scale.y = 3.5 + Math.random(); G.head.position.x = R(-.04, .04);
    if (G.at <= 0) { G.mouth.scale.y = 1.8; G.head.position.x = 0; if (S.hp <= 0) return gameOver(); vanish(); return; }
  }
  G.g.lookAt(S.p.x, gp.y, S.p.z);
  const av = G.dress.geometry.attributes.position, b = G.base;
  for (let i = 0; i < av.count; i++) { const y = b[i * 3 + 1], k = Math.max(0, .75 - y) / 1.5; av.array[i * 3] = b[i * 3] + Math.sin(t * 3 + y * 4) * .09 * k; av.array[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 2.4 + y * 5) * .09 * k; }
  av.needsUpdate = true;
  G.arms[0].rotation.x = G.arms[1].rotation.x = Math.PI - 1.35 + Math.sin(t * 2) * .12; G.arms[0].rotation.z = -.15 + Math.sin(t * 1.7) * .1; G.arms[1].rotation.z = .15 - Math.sin(t * 1.9) * .1;
  G.head.rotation.z = Math.sin(t * 1.3) * .22; G.head.rotation.x = .1 + Math.sin(t * .9) * .09;
  const glitch = Math.random() < (S.diff === 'nightmare' ? .09 : .035); if (glitch) gp.x += R(-.15, .15);
  const op = G.fade * (glitch ? .3 : .82); G.mats.forEach(m => m.opacity = op);
}

/* ---------- overlays (puzzle / heal) ---------- */
function openOverlay(el) { S.frozen = true; if (document.pointerLockElement) document.exitPointerLock(); el.classList.add('active'); }
function closeOverlay(el) { el.classList.remove('active'); S.frozen = false; if (!MOBILE && S.run && !S.pause && !S.over) cv.requestPointerLock(); }

/* ---------- puzzles ---------- */
const PUZZLES = ['simon', 'code', 'wires', 'memory'];
let lastPuzzle = null;
function openPuzzle() {
  if (S.hasKey) { showHint('TERMINAL ALREADY UNLOCKED', 1.3); return; }
  openOverlay($('puzzleModal'));
  const opts = PUZZLES.filter(p => p !== lastPuzzle), type = pick(opts.length ? opts : PUZZLES); lastPuzzle = type;
  buildPuzzle(type);
}
function solvePuzzle() {
  S.hasKey = true; if (terminalMesh) terminalMesh.material.emissive.setHex(0x22ff66); if (terminalGlow) terminalGlow.color.setHex(0x22ff66);
  $('puzzleTitle').textContent = 'ACCESS GRANTED'; $('puzzleBody').innerHTML = '<div class="solved">&#10003; KEY ACQUIRED</div>';
  X.key(); updateHUD();
  setTimeout(() => closeOverlay($('puzzleModal')), 1100);
}
$('puzzleClose').onclick = () => closeOverlay($('puzzleModal'));
function buildPuzzle(t) { ({ simon: buildSimon, code: buildCode, wires: buildWires, memory: buildMemory })[t](); }
function buildSimon() {
  $('puzzleTitle').textContent = 'REPEAT THE SEQUENCE';
  const colors = ['#ee3333', '#33dd66', '#3399ee', '#eedd33']; const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
  const body = $('puzzleBody'); body.innerHTML = '<div class="simon-grid">' + colors.map((c, i) => '<button class="simon-tile" data-i="' + i + '" style="--c:' + c + ';background:' + c + '33"></button>').join('') + '</div><p class="puzzle-msg" id="pMsg">Watch closely...</p>';
  const tiles = [...body.querySelectorAll('.simon-tile')]; tiles.forEach(tl => tl.disabled = true);
  let i = 0; const flash = () => { if (i >= seq.length) { tiles.forEach(tl => tl.disabled = false); $('pMsg').textContent = 'Your turn'; return; } tiles[seq[i]].classList.add('lit'); setTimeout(() => { tiles[seq[i]].classList.remove('lit'); i++; setTimeout(flash, 250); }, 450); };
  setTimeout(flash, 600);
  let p = 0;
  tiles.forEach(tl => tl.onclick = () => {
    tl.classList.add('lit'); setTimeout(() => tl.classList.remove('lit'), 200);
    if (+tl.dataset.i === seq[p]) { p++; if (p === seq.length) solvePuzzle(); }
    else { $('pMsg').textContent = 'Wrong! Watch again...'; p = 0; tiles.forEach(x => x.disabled = true); i = 0; setTimeout(flash, 900); }
  });
}
function buildCode() {
  $('puzzleTitle').textContent = 'ENTER ACCESS CODE';
  const code = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
  const body = $('puzzleBody');
  body.innerHTML = '<div class="code-display" id="codeDisp">' + code.join(' ') + '</div><div class="code-input" id="codeIn">_ _ _ _</div><div class="keypad">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map(k => '<button class="key-btn" data-k="' + k + '">' + k + '</button>').join('') + '</div><p class="puzzle-msg">Memorize the code before it hides</p>';
  setTimeout(() => { const dsp = $('codeDisp'); if (dsp) dsp.style.visibility = 'hidden'; }, 2800);
  let input = [];
  body.querySelectorAll('.key-btn').forEach(bt => bt.onclick = () => {
    const k = bt.dataset.k;
    if (k === 'C') { input = []; }
    else if (k === 'OK') { if (input.join('') === code.join('')) { solvePuzzle(); return; } else { input = []; $('codeIn').classList.add('shake'); setTimeout(() => $('codeIn').classList.remove('shake'), 400); } }
    else if (input.length < 4) { input.push(k); }
    $('codeIn').textContent = Array.from({ length: 4 }, (_, i) => input[i] !== undefined ? input[i] : '_').join(' ');
  });
}
function buildWires() {
  $('puzzleTitle').textContent = 'RECONNECT THE WIRES';
  const colors = ['#ee3333', '#33dd66', '#3399ee', '#eedd33']; const right = [...colors].sort(() => Math.random() - .5);
  const body = $('puzzleBody');
  body.innerHTML = '<div class="wire-grid"><div class="wire-col">' + colors.map(c => '<button class="wire-dot" data-side="l" data-c="' + c + '" style="--c:' + c + ';background:' + c + '33"></button>').join('') +
    '</div><div class="wire-col">' + right.map(c => '<button class="wire-dot" data-side="r" data-c="' + c + '" style="--c:' + c + ';background:' + c + '33"></button>').join('') + '</div></div><p class="puzzle-msg" id="pMsg">Match left to right</p>';
  let sel = null, done = 0;
  body.querySelectorAll('.wire-dot').forEach(dd => dd.onclick = () => {
    if (dd.classList.contains('locked')) return;
    if (dd.dataset.side === 'l') { if (sel) sel.classList.remove('sel'); sel = dd; dd.classList.add('sel'); }
    else if (sel) {
      if (sel.dataset.c === dd.dataset.c) { sel.classList.add('locked'); dd.classList.add('locked'); sel.classList.remove('sel'); sel = null; done++; if (done === 4) solvePuzzle(); }
      else { $('pMsg').textContent = 'Not a match'; sel.classList.remove('sel'); sel = null; }
    }
  });
}
function buildMemory() {
  $('puzzleTitle').textContent = 'MATCH THE SYMBOLS';
  const syms = ['\u2620', '\u263E', '\u2613', '\u25C8']; const deck = [...syms, ...syms].sort(() => Math.random() - .5);
  const body = $('puzzleBody');
  body.innerHTML = '<div class="mem-grid">' + deck.map(s => '<button class="mem-card" data-s="' + s + '">?</button>').join('') + '</div>';
  let a = null, b = null, lock = false, found = 0;
  body.querySelectorAll('.mem-card').forEach(c => c.onclick = () => {
    if (lock || c.classList.contains('done') || c === a) return;
    c.textContent = c.dataset.s; c.classList.add('flip');
    if (!a) { a = c; } else {
      b = c; lock = true;
      setTimeout(() => {
        if (a.dataset.s === b.dataset.s) { a.classList.add('done'); b.classList.add('done'); found++; if (found === syms.length) solvePuzzle(); }
        else { a.textContent = '?'; b.textContent = '?'; a.classList.remove('flip'); b.classList.remove('flip'); }
        a = null; b = null; lock = false;
      }, 700);
    }
  });
}

/* ---------- input: keyboard ---------- */
const K = {};
addEventListener('keydown', e => {
  K[e.code] = true;
  if (e.code === 'Escape' && S.frozen) { closeOverlay($('puzzleModal')); closeOverlay($('healPrompt')); return; }
  if (!S.run || S.pause || S.frozen) return;
  if (e.code === 'KeyF') toggleFlash();
  if (e.code === 'KeyE') interact();
  if (e.code === 'Space') { doJump(); e.preventDefault(); }
});
addEventListener('keyup', e => K[e.code] = false);
function toggleFlash() { S.fl = !S.fl; X.click(); $('flStatus').textContent = 'F — FLASHLIGHT ' + (S.fl ? 'ON' : 'OFF'); }
function doJump() { if (!S.jumping) { S.jumping = true; S.jumpV = 3.1; X.click(); } }

/* ---------- input: mouse look (desktop) ---------- */
addEventListener('mousemove', e => { if (document.pointerLockElement === cv && S.run && !S.pause && !S.frozen) { S.yaw -= e.movementX * .0022; S.pitch = clamp(S.pitch - e.movementY * .0022, -1.4, 1.4); } });
cv.addEventListener('click', () => { if (S.run && !S.pause && !S.frozen && !MOBILE && document.pointerLockElement !== cv) cv.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { if (!MOBILE && document.pointerLockElement !== cv && S.run && !S.over && !S.frozen) setPause(true); });

/* ---------- input: touch (mobile) ---------- */
const TK = { up: false, down: false, left: false, right: false };
function bindHold(id, key) {
  const el = $(id); if (!el) return;
  const on = ev => { TK[key] = true; ev.preventDefault(); }, off = ev => { TK[key] = false; ev.preventDefault(); };
  el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
  el.addEventListener('mousedown', on); el.addEventListener('mouseup', off);
}
bindHold('btnUp', 'up'); bindHold('btnDown', 'down'); bindHold('btnLeft', 'left'); bindHold('btnRight', 'right');
$('btnJump') && $('btnJump').addEventListener('touchstart', e => { e.preventDefault(); if (S.run && !S.pause && !S.frozen) doJump(); });
$('btnFlash') && $('btnFlash').addEventListener('touchstart', e => { e.preventDefault(); if (S.run && !S.pause && !S.frozen) toggleFlash(); });
$('btnInteract') && $('btnInteract').addEventListener('touchstart', e => { e.preventDefault(); if (S.run && !S.pause && !S.frozen) interact(); });
let touchId = null, lastTX = 0, lastTY = 0;
const lookZone = $('lookZone');
if (lookZone) {
  lookZone.addEventListener('touchstart', e => { if (touchId === null) { const t = e.changedTouches[0]; touchId = t.identifier; lastTX = t.clientX; lastTY = t.clientY; } }, { passive: false });
  lookZone.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) { if (t.identifier === touchId) { const dxm = t.clientX - lastTX, dym = t.clientY - lastTY; lastTX = t.clientX; lastTY = t.clientY;
      if (S.run && !S.pause && !S.frozen) { S.yaw -= dxm * .0045; S.pitch = clamp(S.pitch - dym * .0045, -1.4, 1.4); } } }
    e.preventDefault();
  }, { passive: false });
  lookZone.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === touchId) touchId = null; });
}

/* ---------- pause / menu ---------- */
function setPause(on) { S.pause = on; $('pause').classList.toggle('active', on); if (AC) on ? AC.suspend() : AC.resume(); }
$('resumeButton').onclick = () => { setPause(false); if (!MOBILE) cv.requestPointerLock(); };
$('menuButton').onclick = () => {
  S.run = false; S.pause = false; S.frozen = false; stopAmbient(); if (AC) AC.resume();
  $('pause').classList.remove('active'); $('puzzleModal').classList.remove('active'); $('healPrompt').classList.remove('active');
  $('game').classList.remove('active'); $('menu').style.display = ''; if (document.pointerLockElement) document.exitPointerLock(); G.g.visible = false;
};
$('retryButton').onclick = startGame; $('startButton').onclick = startGame;
addEventListener('keydown', e => { if (e.code === 'Escape' && S.run && !S.frozen && !S.over) setPause(!S.pause); });

/* ---------- heal prompt ---------- */
$('healYes').onclick = () => {
  const d = DIFF[S.diff]; S.hp = Math.min(100, S.hp + d.heal); updateHUD(); X.heal();
  if (healPack) { room.remove(healPack); healPack = null; }
  closeOverlay($('healPrompt'));
};
$('healNo').onclick = () => { closeOverlay($('healPrompt')); };

/* ---------- interaction targeting ---------- */
function target() {
  cam.getWorldDirection(camF); camF.y = 0; camF.normalize(); const c = [];
  if (!S.hasKey) c.push({ t: 'terminal', x: termPos.x, z: termPos.z, r: 2.3 });
  c.push({ t: 'door', x: dx, z: -L / 2, r: 2.4 });
  if (healPack) c.push({ t: 'heal', x: healPack.position.x, z: healPack.position.z, r: 1.9 });
  for (const q of c) { const vx = q.x - S.p.x, vz = q.z - S.p.z, d = Math.hypot(vx, vz); if (d < q.r && (vx * camF.x + vz * camF.z) / d > .55) return q; }
}
function interact() {
  if (S.frozen || S.doorT) return; const q = target(); if (!q) return;
  if (q.t === 'terminal') openPuzzle();
  else if (q.t === 'heal') { if (S.hp >= 100) showHint('HEALTH ALREADY FULL', 1.4); else openOverlay($('healPrompt')); }
  else if (q.t === 'door') { if (!S.hasKey) { X.locked(); showHint('SOLVE THE TERMINAL TO GET THE KEY', 1.6); } else { S.doorT = 1; X.door(); } }
}
let hintT = 0; function showHint(t, s) { $('interaction').textContent = t; $('interaction').classList.add('visible'); hintT = s; }

/* ---------- flow ---------- */
function updateHUD() {
  $('roomNumber').textContent = pad(S.room); $('environmentName').textContent = ENV[S.env].name;
  $('healthFill').style.width = S.hp + '%'; $('healthText').textContent = Math.round(S.hp);
  document.querySelector('.health-container').classList.toggle('critical', S.hp > 0 && S.hp <= 30);
  $('objectiveText').textContent = S.hasKey ? 'Reach the exit door.' : 'Solve the terminal to get the key.';
}
function loadRoom() {
  S.run = false; const ld = $('loading'), bar = $('loadingProgress'), st = ['Constructing environment...', 'Placing furniture...', 'Something is watching...', 'Entering...'];
  ld.classList.add('active'); $('loadingRoom').textContent = pad(S.room); bar.style.width = '0'; let i = 0;
  const iv = setInterval(() => { bar.style.width = ++i * 25 + '%'; $('loadingStatus').textContent = st[i % 4]; }, 200);
  setTimeout(() => { clearInterval(iv); buildRoom(); ld.classList.remove('active'); S.run = true; updateHUD(); }, 900);
}
function startGame() {
  audio(); AC.resume(); S.env = selEnv; S.diff = selDiff; S.room = 1; S.hp = 100; S.over = false; S.pause = false; S.frozen = false; S.run = false; S.fl = true; S.nextHealRoom = 2 + Math.floor(R(0, 2));
  $('flStatus').textContent = 'F — FLASHLIGHT ON';
  $('menu').style.display = 'none'; $('game').classList.add('active'); $('gameOver').classList.remove('active'); $('pause').classList.remove('active');
  if (!MOBILE) cv.requestPointerLock(); startAmbient(); loadRoom();
}
function gameOver() { S.over = true; S.run = false; if (document.pointerLockElement) document.exitPointerLock(); $('finalRoom').textContent = 'ROOM ' + pad(S.room); $('gameOver').classList.add('active'); G.g.visible = false; }

/* ---------- main loop ---------- */
const clock = new THREE.Clock(); let T = 0;
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), .05); T += dt;
  if (S.run && !S.pause && !S.frozen) update(dt);
  renderer.render(scene, cam);
}
function update(dt) {
  /* movement */
  const fw = (K.KeyW || K.ArrowUp || TK.up ? 1 : 0) - (K.KeyS || K.ArrowDown || TK.down ? 1 : 0);
  const st = (K.KeyD || K.ArrowRight || TK.right ? 1 : 0) - (K.KeyA || K.ArrowLeft || TK.left ? 1 : 0);
  const crouch = K.KeyC || K.ControlLeft, run = (K.ShiftLeft || K.ShiftRight) && !crouch;
  const sp = crouch ? 1.3 : run ? 4.6 : 2.7, sn = Math.sin(S.yaw), cs = Math.cos(S.yaw); let mx = -sn * fw + cs * st, mz = -cs * fw - sn * st; const ml = Math.hypot(mx, mz);
  const blocked = (x, z) => Math.abs(x) > W / 2 - .4 || Math.abs(z) > L / 2 - .4 || cols.some(c => Math.abs(x - c.x) < c.hw + .3 && Math.abs(z - c.z) < c.hd + .3);
  if (ml) { mx = mx / ml * sp * dt; mz = mz / ml * sp * dt; if (!blocked(S.p.x + mx, S.p.z)) S.p.x += mx; if (!blocked(S.p.x, S.p.z + mz)) S.p.z += mz; S.bob += dt * sp * 2.6; S.stepD += sp * dt; if (S.stepD > 1.7) { S.stepD = 0; X.step(); } }
  S.eye += ((crouch ? 1 : 1.65) - S.eye) * Math.min(1, dt * 8);
  /* jump */
  if (S.jumping) { S.jumpV -= 9 * dt; S.jumpY += S.jumpV * dt; if (S.jumpY <= 0) { S.jumpY = 0; S.jumpV = 0; S.jumping = false; } }
  /* camera */
  S.shake *= Math.pow(.02, dt); const sh = S.shake * .055;
  cam.position.set(S.p.x, S.eye + S.jumpY + (ml && !S.jumping ? Math.sin(S.bob) * (run ? .06 : .035) : Math.sin(T * 1.2) * .006), S.p.z);
  cam.rotation.set(S.pitch + R(-sh, sh), S.yaw + R(-sh, sh), (ml ? Math.cos(S.bob * .5) * .008 : 0) + R(-sh, sh));
  torch.position.y = -.24 + (ml ? Math.sin(S.bob * 2) * .006 : 0);
  /* door */
  if (S.doorT) { S.doorT += dt; S.door = Math.min(1, S.doorT); pivot.rotation.y = S.door * 1.7; if (S.doorT > 1.6) { S.doorT = 0; S.room++; loadRoom(); return; } }
  /* ghost + tension */
  updGhost(dt, T); const tension = G.st === 'hunt' ? clamp(1 - G.dist / 9, 0, 1) : (G.st === 'attack' ? 1 : 0);
  /* lights flicker */
  lights.forEach(l => { l.k = Math.max(0, l.k - dt); if (l.base && Math.random() < .004 + tension * .07) l.k = R(.05, .35); const f = l.k > 0 ? R(0, .25) : 1; l.pl.intensity = l.base * f; l.fm.emissiveIntensity = l.base ? 1.2 * f : 0; });
  mons.forEach(m => m.emissiveIntensity = .7 + Math.sin(T * 30) * .2 + Math.random() * .2);
  spot.intensity = S.fl ? 2.6 * (Math.random() < tension * .15 ? .15 : 1) : 0; lens.visible = S.fl;
  /* heal pack bob + light pulse */
  if (healPack) { healPack.position.y = .06 + Math.sin(T * 2) * .04; healPack.rotation.y += dt * .9; if (healPack.userData.light) healPack.userData.light.intensity = .6 + Math.sin(T * 4) * .3; }
  /* dust */
  const dp = dust.geometry.attributes.position; for (let i = 0; i < 300; i++) { dp.array[i * 3 + 1] += Math.sin(T + i) * dt * .03; dp.array[i * 3] += Math.cos(T * .5 + i) * dt * .03; } dp.needsUpdate = true;
  /* random ambient horror events */
  S.ev -= dt; if (S.ev <= 0) { S.ev = R(7, 18); const a = pick(ENV[S.env].ev), p = R(-1, 1); X[a](p); }
  /* screen fx */
  const vg = $('vignette'); vg.classList.toggle('tense', tension > .55); vg.style.opacity = .6 + tension * .35;
  if (S.flash > .01) { S.flash *= Math.pow(.03, dt); $('flash').style.opacity = S.flash * .7; } else $('flash').style.opacity = tension > .7 ? tension * .12 : 0;
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('interaction').classList.remove('visible'); }
  else { const q = target(); const el = $('interaction'); if (q) { el.textContent = q.t === 'terminal' ? 'E — ACCESS TERMINAL' : q.t === 'heal' ? 'E — TAKE MEDICAL KIT' : S.hasKey ? 'E — OPEN DOOR' : 'E — DOOR (LOCKED)'; el.classList.add('visible'); } else el.classList.remove('visible'); }
}
loop();