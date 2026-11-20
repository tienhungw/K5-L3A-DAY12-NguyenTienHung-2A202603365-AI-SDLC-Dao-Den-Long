// Browser renderer for Đảo Đèn Lồng (Phase 2). All rules live in /sim/world.js (same code as headless);
// this file turns sim state into pictures/sound, handles menus, and maps keyboard/mouse to contract inputs.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, step, timeLeft, DT, SPEC, distXZ, capacity } from '/sim/world.js';
import { MAPS } from '/sim/maps.js';
import { createRng } from '/sim/rng.js';
import { createAudio } from './audio.js';
import { autopilot } from './autopilot.js';

const params = new URLSearchParams(location.search);
const T = (await (await fetch('/game.contract.json')).json()).tuning;
const $ = (id) => document.getElementById(id);
const C = { // Ticket-02 standard palette
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lampOn: 0xffb347, lampCore: 0xffe9b0, lampOff: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shadeBody: 0x120a1a, shadeRim: 0x7a3cff, shadeStun: 0x3a3450, shirt: 0xe8e2d0, scarf: 0xc8102e,
  gold: 0xf2c14e, drifter: 0x8fa3b8,
};
const INTRO = {
  1: '"Sương đen tràn qua bến cũ rồi, Mây à. Năm ngọn Đèn Lồng Lớn đã tắt. Gom đom đóm, thắp lại từng ngọn — Bóng Mực sợ ánh đèn lắm."',
  2: '"Đảo Cau có hai nửa, nối nhau bằng cây cầu tre không lan can. Bục nhảy sẽ đưa con vượt biển mây. Coi chừng Gió Lạc: chúng mê những ai mang nhiều ánh sáng."',
  3: '"Đảo Chuông cao ba tầng, tháp chuông đứng giữa. Gió mạnh thổi từng cơn — thấy lá bay là sắp có gió. Thắp đủ bảy ngọn, bình minh sẽ về."',
};

// ---------- settings (persisted) ----------
const settings = { volume: 0.7, sens: 0.6, colorblind: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('ddl-settings') || '{}')); } catch { /* storage unavailable */ }
const saveSettings = () => { try { localStorage.setItem('ddl-settings', JSON.stringify(settings)); } catch { /* ignore */ } };
const audio = createAudio(settings);

// Ticket-03 §6 colour-blind palette: shade rim/eyes #00B3FF, UI danger white + ⚠ (CSS class on <body>).
const shadeRimColor = () => (settings.colorblind ? 0x00b3ff : C.shadeRim);
const applyColorblind = () => document.body.classList.toggle('cb', !!settings.colorblind);
applyColorblind();
const FULL_FUEL = T.fuel_max, LOW_FUEL = T.low_fuel_threshold;
const costOf = (l) => (l.everLit ? T.relight_cost : T.lantern_cost);
const fuelNow = (l) => (l.lit ? l.fuelU / 60 : 0);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
let pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.FogExp2(C.fog, 0.011);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
const ambient = new THREE.HemisphereLight(0x8090d0, 0x1a1020, 0.15); // intensity = 0.15 + 0.55 * lit/total
scene.add(ambient);
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.75);
moon.position.set(-30, 60, -20);
scene.add(moon);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.85, 0.55, 0.6);
composer.addPass(bloom);
if (params.get('q') === 'low') { bloom.enabled = false; }
composer.addPass(new OutputPass());
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
const mat = (color, emissive = 0x000000, ei = 0, rough = 0.85) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: rough });

// static sky: stars + cloud sea (shared by all nights)
{
  const deco = createRng(7), pts = [];
  for (let i = 0; i < 900; i++) {
    const a = deco.range(0, Math.PI * 2), e = deco.range(0.05, 1.4), r = 300;
    pts.push(Math.cos(e) * Math.sin(a) * r, Math.sin(e) * r, Math.cos(e) * Math.cos(a) * r);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff1d6, size: 1, fog: false })));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: C.sea }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -12; scene.add(sea);
}

// ---------- map geometry per night ----------
let mapGroup = null;
function islandDisc(r, x, z, grp) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.6, 8, 64), mat(C.sand));
  body.position.set(x, -4, z); grp.add(body);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r - 2.2, 64), mat(C.grass));
  top.rotation.x = -Math.PI / 2; top.position.set(x, 0.02, z); grp.add(top);
}
function buildMap(night) {
  if (mapGroup) scene.remove(mapGroup);
  const grp = new THREE.Group(), m = MAPS[night], deco = createRng(night * 13);
  if (night === 1) islandDisc(40, 0, 0, grp);
  if (night === 2) {
    islandDisc(28, 0, 0, grp); islandDisc(28, 70, 0, grp);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mat(C.wood));
    bridge.position.set(35, -0.15, 0); grp.add(bridge);
    for (let x = 26.5; x < 44; x += 1.2) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 4.1), mat(0x4a3220));
      plank.position.set(x, 0.02, 0); grp.add(plank);
    }
  }
  if (night === 3) {
    islandDisc(45, 0, 0, grp);
    const s = new THREE.Shape();
    s.absarc(0, 0, 24, Math.PI, 2 * Math.PI, false); s.absarc(0, 0, 12, 2 * Math.PI, Math.PI, true);
    const tier1 = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false, curveSegments: 48 }), mat(C.grass));
    tier1.rotation.x = -Math.PI / 2; grp.add(tier1);
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 48), mat(C.grass));
    tier2.position.y = 3; grp.add(tier2);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 24), mat(0x7a6a58));
    tower.position.y = 10; grp.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.2, 8), mat(C.wood));
    roof.position.y = 15.1; grp.add(roof);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), mat(C.gold, C.gold, 0.25, 0.4));
    bell.position.y = 13.4; grp.add(bell);
    for (const deg of [30, 150]) {
      const a = (deg * Math.PI) / 180, holder = new THREE.Group();
      holder.rotation.y = -a; holder.position.set(27 * Math.cos(a), 0, 27 * Math.sin(a));
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(6.71, 0.4, 3), mat(C.sand));
      ramp.rotation.z = -Math.atan2(3, 6); ramp.position.y = 1.4; holder.add(ramp);
      grp.add(holder);
    }
  }
  for (const pad of m.pads) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.16, 24), mat(C.gold, C.lampOn, 0.8));
    p.position.set(pad.pos.x, pad.pos.y + 0.08, pad.pos.z); grp.add(p);
  }
  // grass tufts + rocks (decor only, seeded; never touches the sim) — instanced: 2 draw calls
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.6, 4), mat(0x3f7a5e), 260);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0), mat(0x4b4f63), 60);
  let nt = 0, nr = 0;
  const o = new THREE.Object3D();
  for (let i = 0; i < 320; i++) {
    const x = deco.range(-m.bounds, m.bounds + (night === 2 ? 70 : 0)), z = deco.range(-m.bounds, m.bounds);
    const g = m.ground(x, z);
    if (typeof g !== 'number' || m.motePoints.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5)) continue;
    const isRock = i % 6 === 0;
    o.position.set(x, g + (isRock ? 0.15 : 0.3), z); o.rotation.set(0, deco.range(0, 6), 0); o.scale.setScalar(isRock ? deco.range(0.4, 1.2) : 1);
    o.updateMatrix();
    if (isRock && nr < 60) rocks.setMatrixAt(nr++, o.matrix); else if (!isRock && nt < 260) tufts.setMatrixAt(nt++, o.matrix);
  }
  tufts.count = nt; rocks.count = nr; grp.add(tufts, rocks);
  scene.add(grp);
  mapGroup = grp;
}

// ---------- dynamic actors ----------
let world, input, lanternViews = [], shadeViews = new Map(), drifterViews = new Map(), charmViews = new Map(), playerView, moteCore, moteHalo, pulseRing, leaves;
function buildLantern(l) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3, 8), mat(C.wood)); post.position.y = 1.5; g.add(post);
  const lampMat = mat(C.lampOff, C.lampOn, 0.05);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), lampMat); lamp.position.y = 3.4; lamp.scale.y = 1.3; g.add(lamp);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat(C.lampCore, C.lampCore, 0)); core.position.y = 3.4; g.add(core);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.5, 6), mat(0x3b2618)); roof.position.y = 4.25; g.add(roof);
  const light = new THREE.Mesh(new THREE.CircleGeometry(T.safe_radius, 40), new THREE.MeshBasicMaterial({ color: C.lampOn, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  light.rotation.x = -Math.PI / 2; light.position.y = 0.04; g.add(light);
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.15, T.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: C.lampOn, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const prog = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 40, 0.001), mat(C.moteHalo, C.moteHalo, 2.5));
  prog.position.y = 3.4; g.add(prog);
  // unlit lantern = torn paper (shape cue, not only colour): two dark slashes on the lamp
  const tear = new THREE.Group();
  for (const [x, rz] of [[-0.12, 0.6], [0.14, -0.5]]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.9), new THREE.MeshBasicMaterial({ color: 0x15121c })); t.position.set(x, 0, 0); t.rotation.z = rz; tear.add(t); }
  tear.position.y = 3.4; g.add(tear);
  // fuel bar above lit lanterns (faces the camera)
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x1b2350, transparent: true, opacity: 0.85 }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.11), new THREE.MeshBasicMaterial({ color: C.lampOn }));
  fill.position.z = 0.01; bar.add(bg, fill); bar.position.y = 4.9; g.add(bar);
  g.position.set(l.pos.x, l.pos.y, l.pos.z);
  scene.add(g);
  return { g, lamp, lampMat, core, light, ring, prog, tear, bar, fill, lastDep: -1, lastCost: -1, wasLit: false, flash: 0 };
}
function buildPlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 12), mat(C.shirt)); body.position.y = 0.55; g.add(body);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), mat(C.scarf)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.08; g.add(scarf);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.04), mat(C.scarf)); tail.position.set(0.12, 0.9, -0.22); g.add(tail);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat(0xf2d2b0)); head.position.y = 1.32; g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 16), mat(0xd9b46a)); hat.position.y = 1.66; g.add(hat);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat(C.lampCore, C.lampOn, 2.2)); lamp.position.set(0.32, 1.2, 0.7); g.add(lamp);
  const light = new THREE.PointLight(C.lampOn, 5, 10, 1.8); light.position.copy(lamp.position); g.add(light);
  scene.add(g);
  return { g, body, light, tail, yaw: 0 };
}
function buildShade() {
  const g = new THREE.Group();
  const bodyMat = mat(C.shadeBody, C.shadeRim, 0.35, 0.6);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 12), bodyMat); body.scale.y = 1.15; g.add(body);
  const rim = new THREE.Mesh(new THREE.SphereGeometry(0.82, 18, 12), new THREE.MeshBasicMaterial({ color: C.shadeRim, transparent: true, opacity: 0.22, side: THREE.BackSide }));
  rim.scale.y = 1.15; g.add(rim);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 12), bodyMat); tail.position.y = -0.85; tail.rotation.x = Math.PI; g.add(tail);
  const eyeMat = mat(0xffffff, 0xd9c2ff, 2);
  for (const x of [-0.25, 0.25]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat); e.position.set(x, 0.18, 0.62); g.add(e); }
  scene.add(g);
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: C.shadeRim, transparent: true, opacity: 0.8 }));
  beam.visible = false; scene.add(beam);
  return { g, bodyMat, rim, eyeMat, beam, phase: Math.random() * 6 };
}
function buildDrifter() {
  const segs = [], m = new THREE.MeshStandardMaterial({ color: C.drifter, emissive: C.drifter, emissiveIntensity: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18 - i * 0.015), m); scene.add(s); segs.push(s); }
  return { segs, trail: [], m };
}
function buildCharm() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.05), mat(C.scarf, C.scarf, 0.5));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.7, 0.06)), new THREE.LineBasicMaterial({ color: C.gold }));
  g.add(card, edge); scene.add(g);
  return { g };
}

function clearActors() {
  for (const v of lanternViews) scene.remove(v.g);
  for (const v of shadeViews.values()) { scene.remove(v.g); scene.remove(v.beam); }
  for (const v of drifterViews.values()) v.segs.forEach((s) => scene.remove(s));
  for (const v of charmViews.values()) scene.remove(v.g);
  for (const o of [playerView?.g, moteCore, moteHalo, pulseRing, leaves]) if (o) scene.remove(o);
  shadeViews = new Map(); drifterViews = new Map(); charmViews = new Map();
}
function buildActors() {
  clearActors();
  lanternViews = world.lanterns.map(buildLantern);
  playerView = buildPlayer();
  for (const c of world.charms) charmViews.set(c.id, buildCharm());
  moteCore = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), mat(C.moteCore, C.moteCore, 3), 80);
  moteHalo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshBasicMaterial({ color: C.moteHalo, transparent: true, opacity: 0.35, depthWrite: false }), 80);
  scene.add(moteCore, moteHalo);
  pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: C.lampCore, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  pulseRing.rotation.x = -Math.PI / 2; scene.add(pulseRing);
  const lp = new Float32Array(120 * 3);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lc = document.createElement('canvas'); lc.width = lc.height = 32;
  const cx = lc.getContext('2d'); cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(16, 16, 14, 7, 0.6, 0, Math.PI * 2); cx.fill();
  leaves = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0x9ccf6a, size: 0.22, map: new THREE.CanvasTexture(lc), alphaTest: 0.3, transparent: true, opacity: 0, depthWrite: false }));
  leaves.userData.seeds = Array.from({ length: 120 }, (_, i) => [Math.random() * 60 - 30, Math.random() * 6, Math.random() * 60 - 30]);
  scene.add(leaves);
}

// ---------- game flow ----------
const G = { mode: 'menu', night: 1, won: [0, 0, 0, 0], prevScreen: 'menu' };
const screens = ['menu', 'intro', 'result', 'dawn', 'pause', 'settings'];
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); $('hud').classList.toggle('hidden', !(id === null || id === 'pause')); }
const bot = params.has('autoplay') ? autopilot(T) : null;
let camYaw = 0, lastBeep = -1, warnShown = -1, lastShadeCount = 0;

function loadNight(n) {
  G.night = n;
  const seed = params.has('seed') ? Number(params.get('seed')) + n : (Date.now() % 1e9);
  world = createWorld(T, seed, null, n);
  input = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  camYaw = 0; lastBeep = -1; lastShadeCount = 0; hudCache.clear();
  buildMap(n); buildActors();
  $('nightName').textContent = `Đêm ${n} – ${MAPS[n].name}`;
  $('lcount').textContent = world.lanterns.length;
  $('introTitle').textContent = `Đêm ${n} – ${MAPS[n].name}`;
  $('introQuote').textContent = INTRO[n] + ' — Ông Đăng';
  const need = Math.ceil(T.win_ratio * world.lanterns.length - 1e-9);
  $('introGoal').textContent = `Giữ ít nhất ${need}/${world.lanterns.length} Đèn Lồng Lớn còn sáng khi bình minh tới (${Math.round(timeLeft(world) / 60)} phút). Đèn hao dầu 1/giây — nạp đom đóm để châm dầu. Đèn mới cần ${T.lantern_cost} đom đóm, thắp lại cần ${T.relight_cost}.`;
  const s = world.player.pos; camPos.set(s.x, s.y + 5.5, s.z - 9);
  G.mode = 'intro'; show('intro');
}
function play() { G.mode = 'playing'; show(null); audio.unlock(); audio.music(true); }
function pauseGame() { if (G.mode !== 'playing') return; G.mode = 'paused'; show('pause'); }
function resume() { G.mode = 'playing'; show(null); }
function toMenu() { G.mode = 'menu'; show('menu'); audio.music(false); }
function openSettings(from) { G.prevScreen = from; $('vol').value = settings.volume; $('sens').value = settings.sens; $('cbMode').checked = !!settings.colorblind; show('settings'); }
function onGameOver({ result, reason }) {
  G.mode = 'result';
  const won = result === 'won';
  if (won) G.won[G.night] = world.score;
  const why = { dawn_survived: 'Bình minh đã tới và đảo vẫn sáng. Sương đen tan dần.', dawn: 'Bình minh tới nhưng không đủ đèn còn sáng.', no_flames: 'Ngọn lửa nhỏ của Mây đã tắt.' }[reason];
  won ? audio.win() : audio.lose();
  setTimeout(() => {
    if (won && G.night === 3) { $('dawnScore').textContent = G.won[1] + G.won[2] + G.won[3]; show('dawn'); G.mode = 'dawn'; return; }
    $('resultTitle').innerHTML = won ? `Đêm ${G.night} – ${MAPS[G.night].name} bừng sáng!` : `<span class="lost">Đêm ${G.night} đã khép lại…</span>`;
    $('resultText').innerHTML = `${why}<br>Điểm đêm này: <b>${world.score}</b> · Đèn ${world.lanterns.filter((l) => l.lit).length}/${world.lanterns.length} · Lửa còn ${world.player.flames}<br>Tổng điểm các đêm đã thắng: <b>${G.won[1] + G.won[2] + G.won[3]}</b>`;
    $('btnNext').textContent = won ? `Sang Đêm ${G.night + 1}` : 'Chơi lại Đêm';
    show('result');
    if (bot) setTimeout(() => $('btnNext').click(), 2500);
  }, 900);
}
$('btnStart').onclick = () => { audio.unlock(); G.won = [0, 0, 0, 0]; loadNight(1); };
$('btnPlay').onclick = play;
$('btnNext').onclick = () => { loadNight(world.state === 'won' ? G.night + 1 : G.night); if (bot) setTimeout(play, 1500); };
$('btnResultMenu').onclick = toMenu;
$('btnDawnMenu').onclick = toMenu;
$('btnResume').onclick = resume;
$('btnRestart').onclick = () => { G.won[G.night] = 0; loadNight(G.night); play(); };
$('btnPauseMenu').onclick = toMenu;
$('btnSettingsMenu').onclick = () => openSettings('menu');
$('btnSettingsPause').onclick = () => openSettings('pause');
$('btnSettingsBack').onclick = () => { saveSettings(); show(G.prevScreen); };
$('vol').oninput = (e) => { settings.volume = Number(e.target.value); audio.setVolume(settings.volume); };
$('cbMode').onchange = (e) => { settings.colorblind = e.target.checked; applyColorblind(); saveSettings(); };
$('sens').oninput = (e) => { settings.sens = Number(e.target.value); };

// ---------- input ----------
const keys = new Set();
let dragging = false, lastX = 0;
addEventListener('keydown', (e) => {
  keys.add(e.code); audio.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'playing') pauseGame(); else if (G.mode === 'paused') resume(); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); pauseGame(); });
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => { if (dragging && G.mode === 'playing') { camYaw -= (e.clientX - lastX) * 0.5 * settings.sens; lastX = e.clientX; } });
function readInput(dt) {
  if (keys.has('ArrowLeft')) camYaw += 110 * dt;
  if (keys.has('ArrowRight')) camYaw -= 110 * dt;
  // Contract: input [1,0] is the camera's LEFT for a camera behind the player, so A -> +x, D -> -x.
  input.move = [(keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0), (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)];
  input.cam_yaw_deg = camYaw;
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE');
  input.pulse = keys.has('KeyF');
  input.dash = keys.has('ShiftLeft') || keys.has('ShiftRight');
}

// ---------- events -> feedback ----------
let toastTimer = 0;
function toast(msg) { $('toast').textContent = msg; $('toast').classList.remove('hidden'); hudCache.set('ctoasthidden', false); toastTimer = 2.2; }
function onEvents(events) {
  for (const e of events) {
    switch (e.name) {
      case 'mote_picked': audio.pickup(e.data.carried); break;
      case 'deposit': audio.deposit(); break;
      case 'lantern_lit': audio.lit(); toast(e.data.relight ? `Đèn ${e.data.lantern_id} được thắp lại!` : `Đèn ${e.data.lantern_id} đã sáng!`); break;
      case 'refuel': audio.deposit(); break;
      case 'lantern_out': audio.lose(); toast(`Đèn ${e.data.lantern_id} đã tắt — thắp lại cần ${T.relight_cost} đom đóm.`); break;
      case 'pulse': audio.pulse(); break;
      case 'player_hit': audio.hit(); if (e.data.by === 'fall') toast('Mây rơi xuống biển mây…'); break;
      case 'dash': audio.dash(); break;
      case 'shade_spawned': audio.shade(); break;
      case 'drifter_steal': audio.steal(); toast(`Gió Lạc cướp mất ${e.data.amount} đom đóm! Tỏa Sáng để giành lại.`); break;
      case 'drifter_drop': toast('Gió Lạc đánh rơi đom đóm!'); break;
      case 'charm_picked': audio.charm(); toast('Bùa Gió! Chạy nhanh và lướt liên tục trong 10 giây.'); break;
      case 'game_over': onGameOver(e.data); break;
    }
  }
}

// ---------- HUD ----------
for (let i = 0; i < T.capacity_max; i++) { const s = document.createElement('div'); s.className = 'slot'; $('moteBar').appendChild(s); }
{ const c = document.createElement('b'); c.id = 'capText'; c.style.marginLeft = '6px'; $('moteBar').appendChild(c); }
const proj = new THREE.Vector3();
// DOM writes are expensive: every HUD setter only touches the DOM when its value changes.
const hudCache = new Map();
const changed = (key, v) => { if (hudCache.get(key) === v) return false; hudCache.set(key, v); return true; };
const setText = (id, v) => { if (changed('t' + id, v)) $(id).textContent = v; };
const setClass = (el, key, cls, on) => { if (changed('c' + key + cls, on)) el.classList.toggle(cls, on); };
const setStyle = (el, key, prop, v) => { if (changed('s' + key + prop, v)) el.style[prop] = v; };
const slots = () => [...$('moteBar').querySelectorAll('.slot')];
function updateHud(dt) {
  const p = world.player;
  if (changed('flames', p.flames)) $('flames').innerHTML = Array.from({ length: T.flames }, (_, i) => `<span class="flame${i < p.flames ? '' : ' off'}"></span>`).join('');
  const tl = timeLeft(world), s = Math.ceil(tl - 1e-9);
  setText('time', `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  setClass($('timer'), 'timer', 'danger', tl <= 30);
  if (G.mode === 'playing' && tl <= 10 && s !== lastBeep && s > 0) { lastBeep = s; audio.tick(s <= 3); }
  setText('lit', String(world.lanterns.filter((l) => l.lit).length));
  setText('scoreVal', String(G.won.slice(1, G.night).reduce((a, b) => a + b, 0) + world.score));
  const cap = capacity(world);
  if (changed('carried', p.carried * 100 + cap)) {
    slots().forEach((el, i) => { el.classList.toggle('on', i < p.carried); el.style.display = i < cap ? '' : 'none'; });
    $('capText').textContent = `${p.carried}/${cap}`;
  }
  setStyle($('cdDash').lastElementChild, 'dash', 'height', `${Math.round((p.charm > 0 ? 0 : p.dashCd / world.k.dashCd) * 20) * 5}%`);
  setClass($('cdDash'), 'cdDash', 'charm', p.charm > 0);
  setStyle($('cdPulse').lastElementChild, 'pulse', 'height', `${Math.round(Math.max(p.pulseCd / world.k.pulseCd, p.carried < T.pulse_cost ? 1 : 0) * 20) * 5}%`);
  const near = world.lanterns.find((l) => (!l.lit || l.fuelU < FULL_FUEL * 60) && distXZ(p.pos, l.pos) <= T.interact_radius);
  setClass($('prompt'), 'prompt', 'hidden', !near);
  if (near) setText('prompt', near.lit ? `E — Châm dầu (${Math.floor(fuelNow(near))}/${FULL_FUEL})` : `E — Nạp ánh sáng (${near.deposited}/${costOf(near)})`);
  toastTimer -= dt; if (toastTimer <= 0) setClass($('toast'), 'toast', 'hidden', true);
  // off-screen arrow to the nearest unlit lantern
  const target = world.lanterns.filter((l) => !l.lit || fuelNow(l) < LOW_FUEL).sort((a, b) => distXZ(a.pos, p.pos) - distXZ(b.pos, p.pos))[0];
  const arrow = $('arrow');
  let off = false;
  if (target) {
    proj.set(target.pos.x, target.pos.y + 3.4, target.pos.z).project(camera);
    const behind = proj.z > 1;
    off = behind || Math.abs(proj.x) > 0.95 || Math.abs(proj.y) > 0.95;
    if (off) {
      let x = proj.x, y = proj.y; if (behind) { x = -x; y = -y; }
      const k = 0.88 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x *= k; y *= k;
      setStyle(arrow, 'arrow', 'left', `${Math.round((x * 0.5 + 0.5) * innerWidth - 14)}px`);
      setStyle(arrow, 'arrow', 'top', `${Math.round((-y * 0.5 + 0.5) * innerHeight - 15)}px`);
      setStyle(arrow, 'arrow', 'transform', `rotate(${Math.atan2(x, y).toFixed(2)}rad)`);
    }
  }
  setClass(arrow, 'arrow', 'hidden', !off);
}

// ---------- per-frame sync ----------
const dummy = new THREE.Object3D();
const camPos = new THREE.Vector3(0, 6, -9);
function sync(time, dt) {
  const p = world.player, pv = playerView;
  pv.g.position.set(p.pos.x, p.pos.y, p.pos.z);
  const target = Math.atan2(p.facing.x, p.facing.z);
  let d = target - pv.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); pv.yaw += d * 0.25;
  pv.g.rotation.y = pv.yaw;
  const moving = Math.hypot(p.vel.x, p.vel.z) > 0.1;
  pv.body.position.y = 0.55 + (moving && p.grounded ? Math.abs(Math.sin(time * 11)) * 0.06 : 0);
  pv.tail.rotation.x = moving ? 0.6 + Math.sin(time * 14) * 0.2 : 0.1;
  pv.g.visible = p.fallWait > 0 ? false : !(p.invuln > 0) || Math.floor(time * 12) % 2 === 0;
  pv.light.intensity = 3 + p.carried * 0.6;
  if (world.fx.lastJumpTick === world.tick) audio.jump();
  // motes
  const n = Math.min(world.motes.length, 80);
  moteCore.count = n; moteHalo.count = n;
  for (let i = 0; i < n; i++) {
    const m = world.motes[i], h = (parseInt(m.id.slice(1), 10) * 1.7) % 6.28;
    const fade = m.kind === 'dropped' && m.ttl < 120 ? (Math.floor(time * 8) % 2 ? 0.4 : 1) : 1;
    dummy.position.set(m.pos.x + Math.sin(time * 1.3 + h) * 0.12, m.pos.y + 0.45 + Math.sin(time * 2.1 + h) * 0.15, m.pos.z + Math.cos(time * 1.1 + h) * 0.12);
    dummy.scale.setScalar(fade * (0.85 + 0.3 * Math.sin(time * 6 + h * 3)));
    dummy.updateMatrix(); moteCore.setMatrixAt(i, dummy.matrix); moteHalo.setMatrixAt(i, dummy.matrix);
  }
  moteCore.instanceMatrix.needsUpdate = true; moteHalo.instanceMatrix.needsUpdate = true;
  // lanterns + ambient light that grows with progress
  const lit = world.lanterns.filter((l) => l.lit).length;
  ambient.intensity = 0.15 + 0.55 * (lit / world.lanterns.length);
  world.lanterns.forEach((l, i) => {
    const v = lanternViews[i];
    if (l.lit && !v.wasLit) v.flash = 1;
    v.wasLit = l.lit; v.flash = Math.max(0, v.flash - dt * 1.2);
    const fuel = fuelNow(l), low = l.lit && fuel < LOW_FUEL;
    const blinkOff = low && Math.floor(time * 2) % 2 === 1; // 1 Hz slow blink when fuel < 30
    v.lampMat.color.set(l.lit ? C.lampOn : C.lampOff);
    v.lampMat.emissiveIntensity = l.lit ? (blinkOff ? 0.3 : 1.6 + v.flash * 4) : 0.05 + (l.deposited / costOf(l)) * 0.5;
    v.core.material.emissiveIntensity = l.lit && !blinkOff ? 3 + Math.sin(time * 3 + i) * 0.4 : 0;
    v.lamp.scale.y = l.lit ? 1.3 : 1.3 * 0.8; v.lamp.position.y = l.lit ? 3.4 : 3.3; // unlit = squashed 20%
    v.tear.visible = !l.lit;
    v.bar.visible = l.lit && !blinkOff;
    if (l.lit) { v.fill.scale.x = Math.max(0.001, fuel / FULL_FUEL); v.fill.position.x = -0.75 * (1 - fuel / FULL_FUEL); v.fill.material.color.set(low ? (settings.colorblind ? 0xffffff : 0xff5a5f) : C.lampOn); v.bar.quaternion.copy(camera.quaternion); }
    v.light.material.opacity = l.lit ? (blinkOff ? 0.04 : 0.16 + v.flash * 0.4) : 0;
    v.ring.material.opacity = l.lit && !low ? 0.3 + Math.sin(time * 2) * 0.08 : 0; // no safe zone below 30
    if (v.lastDep !== l.deposited || v.lastCost !== costOf(l)) {
      v.lastDep = l.deposited; v.lastCost = costOf(l);
      v.prog.geometry.dispose();
      v.prog.geometry = new THREE.TorusGeometry(0.85, 0.05, 6, 40, Math.max(0.001, (l.deposited / costOf(l)) * Math.PI * 2));
    }
    v.prog.visible = !l.lit; v.prog.rotation.z = time * 0.5;
  });
  // shades
  const alive = new Set();
  for (const s of world.shades) {
    alive.add(s.id);
    let v = shadeViews.get(s.id); if (!v) { v = buildShade(); shadeViews.set(s.id, v); }
    const stunned = s.state === 'stunned', spawning = s.state === 'spawning';
    v.g.position.set(s.pos.x, s.pos.y + Math.sin(time * 2 + v.phase) * 0.15, s.pos.z);
    v.g.rotation.y = Math.atan2(p.pos.x - s.pos.x, p.pos.z - s.pos.z) + (stunned ? Math.sin(time * 20) * 0.3 : 0);
    v.g.scale.setScalar(spawning ? 1 - s.stateTicks / SPEC.shade_spawning_ticks : stunned ? 0.8 : 1 + Math.sin(time * 4 + v.phase) * 0.05);
    v.bodyMat.color.set(stunned ? C.shadeStun : C.shadeBody);
    v.bodyMat.emissive.set(stunned ? C.shadeStun : shadeRimColor());
    v.rim.material.color.set(shadeRimColor());
    v.rim.material.opacity = stunned ? 0.05 : 0.22;
    v.eyeMat.emissive.set(settings.colorblind ? 0x00b3ff : 0xd9c2ff);
    v.eyeMat.emissiveIntensity = stunned ? 0.2 : 2;
    const tl = s.state === 'drain' && world.lanterns.find((l) => l.id === s.target);
    v.beam.visible = !!tl;
    if (tl) { const a = v.beam.geometry.attributes.position; a.setXYZ(0, s.pos.x, s.pos.y, s.pos.z); a.setXYZ(1, tl.pos.x, tl.pos.y + 3.4, tl.pos.z); a.needsUpdate = true; v.beam.material.color.set(shadeRimColor()); }
  }
  for (const [id, v] of shadeViews) if (!alive.has(id)) { scene.remove(v.g); scene.remove(v.beam); shadeViews.delete(id); }
  // drifters (silk ribbons following their own trail)
  for (const dr of world.drifters) {
    let v = drifterViews.get(dr.id); if (!v) { v = buildDrifter(); drifterViews.set(dr.id, v); }
    const gone = dr.state === 'removed';
    v.trail.unshift([dr.pos.x, dr.pos.y + Math.sin(time * 5) * 0.2, dr.pos.z]); v.trail.length = Math.min(v.trail.length, 24);
    v.segs.forEach((s, i) => {
      const tp = v.trail[Math.min(i * 3, v.trail.length - 1)];
      s.visible = !gone; s.position.set(tp[0], tp[1] + Math.sin(time * 7 + i) * 0.12, tp[2]);
      s.rotation.set(Math.sin(time * 3 + i) * 0.6, time * 2 + i * 0.4, 0);
    });
    v.m.emissiveIntensity = dr.state === 'chase' ? 1.2 : dr.stolen > 0 ? 0.9 : 0.4;
  }
  // charms
  for (const c of world.charms) {
    const v = charmViews.get(c.id);
    v.g.visible = c.available;
    v.g.position.set(c.pos.x, c.pos.y + 0.9 + Math.sin(time * 2) * 0.12, c.pos.z); v.g.rotation.y = time * 1.5;
  }
  // pulse ring
  const since = (world.tick - world.fx.lastPulseTick) / 60;
  if (since < 0.45) { pulseRing.position.set(p.pos.x, p.pos.y + 0.3, p.pos.z); pulseRing.scale.setScalar(0.5 + (since / 0.45) * T.pulse_radius); pulseRing.material.opacity = 0.8 * (1 - since / 0.45); }
  else pulseRing.material.opacity = 0;
  // wind: leaves 2 s before and during a gust (Night 3)
  const st = world.simTick, warn = world.windEnabled && (st % SPEC.wind_every) >= SPEC.wind_every - SPEC.wind_warn_ticks;
  if (warn && warnShown !== Math.floor(st / SPEC.wind_every)) { warnShown = Math.floor(st / SPEC.wind_every); audio.wind(); toast('Gió mạnh sắp tới!'); }
  const showLeaves = warn || world.wind.active;
  leaves.material.opacity += ((showLeaves ? 0.9 : 0) - leaves.material.opacity) * 0.05;
  if (leaves.material.opacity > 0.01) {
    const pos = leaves.geometry.attributes.position, wx = world.wind.active ? world.wind.x : 0.7, wz = world.wind.active ? world.wind.z : 0.7;
    leaves.userData.seeds.forEach((sd, i) => {
      const u = ((time * 6 + i * 3.7) % 60) - 30;
      pos.setXYZ(i, p.pos.x + sd[0] + wx * u, p.pos.y + 0.5 + sd[1] + Math.sin(time * 3 + i) * 0.4, p.pos.z + sd[2] + wz * u);
    });
    pos.needsUpdate = true;
  }
  // camera behind the player along the camera yaw
  const th = (camYaw * Math.PI) / 180;
  const want = new THREE.Vector3(p.pos.x - Math.sin(th) * 9, p.pos.y + 5.5, p.pos.z - Math.cos(th) * 9);
  camPos.lerp(want, 0.12); camera.position.copy(camPos);
  camera.lookAt(p.pos.x + Math.sin(th) * 2, p.pos.y + 1.2, p.pos.z + Math.cos(th) * 2);
}

// ---------- main loop (fixed 60 Hz sim, render every frame) ----------
loadNight(Number(params.get('night')) || 1);
if (!bot) { G.mode = 'menu'; show('menu'); } else play();
if (bot && params.has('skip')) {
  for (let i = 0; i < Number(params.get('skip')) * 60 && world.state === 'playing'; i++) {
    Object.assign(input, bot(world)); camYaw = input.cam_yaw_deg; onEvents(step(world, input));
  }
  const p = world.player.pos, th = (camYaw * Math.PI) / 180;
  camPos.set(p.x - Math.sin(th) * 9, p.y + 5.5, p.z - Math.cos(th) * 9);
}
let acc = 0, last = performance.now(), startT = last;
const fps = { frames: 0, t: last, value: 0, samples: [] };
let lowFps = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const time = (now - startT) / 1000;
  if (G.mode === 'playing') {
    readInput(dt);
    if (bot) { Object.assign(input, bot(world)); camYaw = input.cam_yaw_deg; }
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 6 && G.mode === 'playing') { onEvents(step(world, input)); acc -= DT; n++; }
    if (n === 6) acc = 0;
  }
  sync(time, dt);
  if (!params.has('nohud')) updateHud(dt);
  if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
  fps.frames++;
  if (now - fps.t > 1000) {
    fps.value = Math.round((fps.frames * 1000) / (now - fps.t)); fps.samples.push(fps.value); fps.frames = 0; fps.t = now;
    if (params.has('fps')) { $('fps').classList.remove('hidden'); $('fps').textContent = `${fps.value} FPS`; }
    // adaptive quality: keep >= 30 FPS on weak GPUs
    lowFps = fps.value < 30 ? lowFps + 1 : 0;
    if (lowFps >= 3 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); bloom.enabled = pixelRatio > 1; resize(); lowFps = 0; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = { get world() { return world; }, fps, G, loadNight, play };
