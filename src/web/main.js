// Browser renderer for Đảo Đèn Lồng. All rules live in /sim/world.js (same code as headless);
// this file only turns sim state into pictures/sound and keyboard/mouse into contract inputs.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, step, timeLeft, DT, WORLD, distXZ } from '/sim/world.js';
import { createRng } from '/sim/rng.js';
import { createAudio } from './audio.js';
import { autopilot } from './autopilot.js';

const params = new URLSearchParams(location.search);
const T = (await (await fetch('/game.contract.json')).json()).tuning;
const $ = (id) => document.getElementById(id);
const audio = createAudio();

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b22);
scene.fog = new THREE.FogExp2(0x1a1236, 0.018);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
scene.add(new THREE.HemisphereLight(0x5a4a9a, 0x1a1020, 0.9));
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.6);
moon.position.set(-30, 50, -20);
scene.add(moon);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const mat = (color, emissive = 0x000000, ei = 0, rough = 0.85) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: rough });

// ---------- static island (decor uses its own seeded rng, never the sim's) ----------
const deco = createRng(7);
const island = new THREE.Mesh(new THREE.CylinderGeometry(WORLD.island_radius, WORLD.island_radius * 0.55, 6, 64), mat(0x2c3a4a));
island.position.y = -3;
scene.add(island);
const top = new THREE.Mesh(new THREE.CircleGeometry(WORLD.island_radius, 64), mat(0x24453d));
top.rotation.x = -Math.PI / 2; top.position.y = 0.01;
scene.add(top);
// cloud sea
const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0x2a2150, fog: true }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -5;
scene.add(sea);
const puffGeo = new THREE.SphereGeometry(1, 12, 8);
const puffMat = mat(0x4a3d7a, 0x1d1540, 0.4, 1);
for (let i = 0; i < 70; i++) {
  const a = deco.range(0, Math.PI * 2), r = deco.range(33, 90), s = deco.range(2, 6);
  const p = new THREE.Mesh(puffGeo, puffMat);
  p.position.set(Math.sin(a) * r, -4.5 + deco.range(0, 1.5), Math.cos(a) * r);
  p.scale.set(s * 1.6, s * 0.6, s);
  scene.add(p);
}
// rocks + grass tufts
const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
const grassGeo = new THREE.ConeGeometry(0.12, 0.6, 4);
const rockMat = mat(0x4b4f63), grassMat = mat(0x3f6b4a);
for (let i = 0; i < 160; i++) {
  const a = deco.range(0, Math.PI * 2), r = Math.sqrt(deco.range(16, 29 * 29));
  const rock = i % 5 === 0;
  const m = new THREE.Mesh(rock ? rockGeo : grassGeo, rock ? rockMat : grassMat);
  m.position.set(Math.sin(a) * r, rock ? 0.15 : 0.3, Math.cos(a) * r);
  m.rotation.y = a; if (rock) m.scale.setScalar(deco.range(0.5, 1.4));
  scene.add(m);
}
// stars
{
  const pts = [];
  for (let i = 0; i < 900; i++) {
    const a = deco.range(0, Math.PI * 2), e = deco.range(0.05, 1.4), r = 250;
    pts.push(Math.cos(e) * Math.sin(a) * r, Math.sin(e) * r, Math.cos(e) * Math.cos(a) * r);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.9, fog: false })));
}

// ---------- dynamic objects ----------
let world, lanternViews = [], shadeViews = new Map(), playerView, moteMesh, pulseRing, input, ended = false, paused = false;

function buildLantern(l) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3, 8), mat(0x5b3a24));
  post.position.y = 1.5; g.add(post);
  const lampMat = mat(0x6b5a4a, 0xffa040, 0.05);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), lampMat);
  lamp.position.y = 3.4; lamp.scale.y = 1.3; g.add(lamp);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.5, 6), mat(0x3b2618));
  roof.position.y = 4.25; g.add(roof);
  const light = new THREE.PointLight(0xff9a3c, 0, 16, 1.6);
  light.position.y = 3.4; g.add(light);
  const pips = [];
  for (let i = 0; i < T.lantern_cost; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0x333344, 0xfff27a, 0));
    g.add(p); pips.push(p);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.position.set(l.pos.x, 0, l.pos.z);
  scene.add(g);
  return { g, lamp, lampMat, light, pips, ring, wasLit: false };
}

function buildPlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10), mat(0x2f4d8a));
  body.position.y = 0.55; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mat(0xf2d2b0));
  head.position.y = 1.28; g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 16), mat(0xd9b46a));
  hat.position.y = 1.62; g.add(hat);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), mat(0x5b3a24));
  stick.position.set(0.32, 1.05, 0.3); stick.rotation.x = 0.9; g.add(stick);
  const lampMat = mat(0xffd27a, 0xffa040, 2.2);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), lampMat);
  lamp.position.set(0.32, 1.2, 0.7); g.add(lamp);
  const light = new THREE.PointLight(0xffa040, 6, 9, 1.8);
  light.position.copy(lamp.position); g.add(light);
  const orbit = [];
  for (let i = 0; i < T.carry_capacity; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xeaff9a, 0xd8ff6a, 3));
    g.add(m); orbit.push(m);
  }
  scene.add(g);
  return { g, body, lampMat, light, orbit, yaw: 0 };
}

function buildShade() {
  const g = new THREE.Group();
  const bodyMat = mat(0x150a24, 0x4b1f7a, 0.35, 0.6);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), bodyMat);
  body.scale.y = 1.15; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 12), bodyMat);
  tail.position.y = -0.85; tail.rotation.x = Math.PI; g.add(tail);
  const eyeMat = mat(0xffffff, 0xd9c2ff, 2);
  for (const x of [-0.25, 0.25]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat);
    e.position.set(x, 0.18, 0.62); g.add(e);
  }
  scene.add(g);
  return { g, bodyMat, eyeMat, phase: Math.random() * 6 };
}

function clearDynamic() {
  for (const v of lanternViews) scene.remove(v.g);
  for (const v of shadeViews.values()) scene.remove(v.g);
  if (playerView) scene.remove(playerView.g);
  if (moteMesh) scene.remove(moteMesh);
  if (pulseRing) scene.remove(pulseRing);
  shadeViews = new Map();
}

function newGame() {
  clearDynamic();
  const seed = params.has('seed') ? Number(params.get('seed')) : (Date.now() % 1e9);
  world = createWorld(T, seed, null);
  lanternViews = world.lanterns.map(buildLantern);
  playerView = buildPlayer();
  moteMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xeaff9a, 0xd8ff6a, 3.5), 64);
  scene.add(moteMesh);
  pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  pulseRing.rotation.x = -Math.PI / 2; scene.add(pulseRing);
  input = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false };
  camYaw = 0; ended = false;
  $('end').classList.remove('show');
  $('cap').textContent = T.carry_capacity; $('lcount').textContent = T.lantern_count_night1;
}

// ---------- input ----------
const keys = new Set();
let camYaw = 0, dragging = false, lastX = 0;
addEventListener('keydown', (e) => {
  keys.add(e.code); audio.unlock();
  if (e.code === 'KeyR') newGame();
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'KeyP') paused = !paused;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; audio.unlock(); });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => { if (dragging) { camYaw -= (e.clientX - lastX) * 0.3; lastX = e.clientX; } });
$('again').addEventListener('click', newGame);

function readInput(dt) {
  if (keys.has('ArrowLeft')) camYaw += 110 * dt;
  if (keys.has('ArrowRight')) camYaw -= 110 * dt;
  // Contract: input [1,0] is the camera's LEFT for a camera behind the player, so A -> +x, D -> -x.
  const x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.move = [x, z];
  input.cam_yaw_deg = camYaw;
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE');
  input.pulse = keys.has('KeyF') || keys.has('KeyQ');
}

// ---------- events -> feedback ----------
function onEvents(events) {
  for (const e of events) {
    if (e.name === 'mote_picked') audio.pickup(e.data.carried);
    else if (e.name === 'deposit') audio.deposit();
    else if (e.name === 'lantern_lit') audio.lit();
    else if (e.name === 'pulse') audio.pulse();
    else if (e.name === 'player_hit') audio.hit();
    else if (e.name === 'game_over') showEnd(e.data);
  }
}

function showEnd({ result, reason }) {
  ended = true;
  const won = result === 'won';
  const why = { all_lit: 'Cả 5 Đèn Lồng Lớn đã sáng. Sương đen tan dần.', dawn: 'Bình minh đến trước khi các đèn kịp sáng.', no_flames: 'Ngọn lửa nhỏ của Mây đã tắt.' }[reason];
  $('endTitle').innerHTML = `<span class="${won ? 'won' : 'lost'}">${won ? 'Đảo Bến bừng sáng!' : 'Đêm đã khép lại…'}</span>`;
  $('endText').innerHTML = `${why}<br><br>Điểm: <b>${world.score}</b> · Đèn: ${world.lanterns.filter((l) => l.lit).length}/${world.lanterns.length} · Lửa còn: ${world.player.flames}`;
  setTimeout(() => $('end').classList.add('show'), 600);
  won ? audio.win() : audio.lose();
}

// ---------- HUD ----------
function updateHud() {
  const p = world.player;
  $('flames').innerHTML = Array.from({ length: T.flames }, (_, i) => `<span class="flame${i < p.flames ? '' : ' off'}"></span>`).join('');
  $('carried').textContent = p.carried;
  $('lit').textContent = world.lanterns.filter((l) => l.lit).length;
  const s = Math.ceil(timeLeft(world));
  $('time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('scoreVal').textContent = world.score;
  // contextual hint
  let hint = '';
  const near = world.lanterns.find((l) => !l.lit && distXZ(p.pos, l.pos) <= T.interact_radius);
  if (near && p.carried > 0) hint = `Nhấn E để nộp ${Math.min(p.carried, T.lantern_cost - near.deposited)} đom đóm vào ${near.id}`;
  else if (p.carried >= T.carry_capacity) hint = 'Túi đầy! Mang đom đóm tới một Đèn Lồng Lớn';
  else if (world.shades.some((s) => s.state !== 'stunned' && distXZ(s.pos, p.pos) < T.pulse_radius) && p.carried >= T.pulse_cost) hint = 'Bóng Mực tới gần — nhấn F phát xung sáng!';
  $('hint').style.display = hint && !ended ? 'block' : 'none';
  $('hint').textContent = hint;
}

// ---------- per-frame sync ----------
const dummy = new THREE.Object3D();
const camPos = new THREE.Vector3(0, 6, -9);
function sync(time) {
  const p = world.player;
  // player
  const pv = playerView;
  pv.g.position.set(p.pos.x, p.pos.y, p.pos.z);
  const moving = Math.hypot(...input.move) > 0.01;
  if (moving) {
    const th = (input.cam_yaw_deg * Math.PI) / 180, [mx, mz] = input.move;
    const target = Math.atan2(mx * Math.cos(th) + mz * Math.sin(th), -mx * Math.sin(th) + mz * Math.cos(th));
    let d = target - pv.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); pv.yaw += d * 0.25;
  }
  pv.g.rotation.y = pv.yaw;
  pv.body.position.y = 0.55 + (moving && p.pos.y === 0 ? Math.abs(Math.sin(time * 10)) * 0.06 : 0);
  const invuln = world.tick < p.invulnUntil;
  pv.g.visible = !invuln || Math.floor(time * 12) % 2 === 0;
  pv.light.intensity = 3 + p.carried * 1.4 + Math.sin(time * 9) * 0.3;
  pv.orbit.forEach((m, i) => {
    m.visible = i < p.carried;
    const a = time * 2.2 + (i * Math.PI * 2) / T.carry_capacity;
    m.position.set(Math.cos(a) * 0.75, 1.1 + Math.sin(time * 3 + i) * 0.15, Math.sin(a) * 0.75);
  });
  // motes (bob is visual only; sim keeps them on the ground)
  moteMesh.count = Math.min(world.motes.length, 64);
  world.motes.slice(0, 64).forEach((m, i) => {
    const h = (parseInt(m.id.slice(1), 10) * 1.7) % 6.28;
    dummy.position.set(m.pos.x + Math.sin(time * 1.3 + h) * 0.15, 0.45 + Math.sin(time * 2.1 + h) * 0.18, m.pos.z + Math.cos(time * 1.1 + h) * 0.15);
    dummy.scale.setScalar(0.8 + 0.35 * Math.sin(time * 6 + h * 3));
    dummy.updateMatrix(); moteMesh.setMatrixAt(i, dummy.matrix);
  });
  moteMesh.instanceMatrix.needsUpdate = true;
  // lanterns
  world.lanterns.forEach((l, i) => {
    const v = lanternViews[i];
    if (l.lit && !v.wasLit) v.flash = 1;
    v.wasLit = l.lit;
    v.flash = Math.max(0, (v.flash || 0) - 0.02);
    v.lampMat.emissiveIntensity = l.lit ? 2.5 + Math.sin(time * 3 + i) * 0.3 + v.flash * 6 : 0.05 + (l.deposited / T.lantern_cost) * 0.6;
    v.lampMat.color.set(l.lit ? 0xffd08a : 0x6b5a4a);
    v.light.intensity = l.lit ? 25 + v.flash * 60 : 0;
    v.ring.material.opacity = l.lit ? 0.35 + Math.sin(time * 2) * 0.1 : 0;
    v.lamp.rotation.y = time * 0.4;
    v.pips.forEach((pip, k) => {
      const a = time * 0.8 + (k * Math.PI * 2) / T.lantern_cost;
      pip.position.set(Math.cos(a) * 0.95, 3.4 + Math.sin(time * 2 + k) * 0.1, Math.sin(a) * 0.95);
      pip.material.emissiveIntensity = k < l.deposited ? 3 : 0;
      pip.visible = !l.lit;
    });
  });
  // shades
  const alive = new Set();
  for (const s of world.shades) {
    alive.add(s.id);
    let v = shadeViews.get(s.id);
    if (!v) { v = buildShade(); shadeViews.set(s.id, v); }
    const stunned = s.state === 'stunned';
    v.g.position.set(s.pos.x, s.pos.y + Math.sin(time * 2 + v.phase) * 0.15, s.pos.z);
    v.g.rotation.y = Math.atan2(p.pos.x - s.pos.x, p.pos.z - s.pos.z) + (stunned ? Math.sin(time * 20) * 0.3 : 0);
    v.g.scale.setScalar(stunned ? 0.75 : 1 + Math.sin(time * 4 + v.phase) * 0.05);
    v.bodyMat.emissive.set(stunned ? 0x9a86c8 : 0x4b1f7a);
    v.eyeMat.emissiveIntensity = stunned ? 0.2 : 2;
  }
  for (const [id, v] of shadeViews) if (!alive.has(id)) { scene.remove(v.g); shadeViews.delete(id); }
  // pulse ring
  const since = (world.tick - world.fx.lastPulseTick) / 60;
  if (since < 0.45) {
    const r = 0.5 + (since / 0.45) * T.pulse_radius;
    pulseRing.position.set(p.pos.x, 0.3, p.pos.z); pulseRing.scale.setScalar(r);
    pulseRing.material.opacity = 0.8 * (1 - since / 0.45);
  } else pulseRing.material.opacity = 0;
  // camera: behind the player along the camera yaw
  const th = (camYaw * Math.PI) / 180;
  const want = new THREE.Vector3(p.pos.x - Math.sin(th) * 9, p.pos.y + 5.5, p.pos.z - Math.cos(th) * 9);
  camPos.lerp(want, 0.12);
  camera.position.copy(camPos);
  camera.lookAt(p.pos.x + Math.sin(th) * 2, p.pos.y + 1.2, p.pos.z + Math.cos(th) * 2);
}

// ---------- main loop (fixed 60 Hz sim, render every frame) ----------
newGame();
const bot = params.has('autoplay') ? autopilot(T) : null;
// ?autoplay&skip=N : let the demo bot play N seconds instantly (for screenshots / quick demo).
if (bot && params.has('skip')) {
  for (let i = 0; i < Number(params.get('skip')) * 60 && !ended; i++) {
    Object.assign(input, bot(world)); camYaw = input.cam_yaw_deg; onEvents(step(world, input));
  }
  camPos.set(world.player.pos.x - Math.sin(camYaw * Math.PI / 180) * 9, 5.5, world.player.pos.z - Math.cos(camYaw * Math.PI / 180) * 9);
}
let acc = 0, last = performance.now(), startT = last - (params.has('skip') ? 10000 : 0);
const fps = { frames: 0, t: last, value: 0 };
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const time = (now - startT) / 1000;
  $('title').style.opacity = time < 2.5 ? 1 : Math.max(0, 1 - (time - 2.5) / 1.5);
  if (!paused && !ended) {
    readInput(dt);
    if (bot) { Object.assign(input, bot(world)); camYaw = input.cam_yaw_deg; }
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 6) { onEvents(step(world, input)); acc -= DT; n++; }
    if (n === 6) acc = 0;
  }
  sync(time);
  updateHud();
  composer.render();
  fps.frames++;
  if (now - fps.t > 1000) { fps.value = fps.frames; fps.frames = 0; fps.t = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = { get world() { return world; }, fps, newGame };
