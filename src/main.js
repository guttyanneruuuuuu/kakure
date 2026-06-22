import * as THREE from 'three';
import { Controls } from './controls.js';
import { World } from './world.js';
import { Player } from './player.js';

// ===================== Globals =====================
let renderer, scene, camera;
let world, player, controls;
let clock;
let raycaster = new THREE.Raycaster();

const state = {
  phase: 'title',     // title | playing | result
  time: 90,           // seconds remaining
  camYaw: 0,
  camPitch: 0.35,
  camDist: 7,
  camo: 0,            // 0..1 camouflage quality
  eyedropMode: false,
  detection: 0,       // 0..1 how much oni has spotted you
  best: Number(localStorage.getItem('mc_best') || 0),
};

// kid-friendly bright palette
const PALETTE = [
  '#7ed957', '#e74c3c', '#f1c40f', '#3498db', '#9b59b6',
  '#e67e22', '#1abc9c', '#ff6fb5', '#ffffff', '#34495e',
  '#2ecc71', '#16a085',
];

// ===================== Init =====================
init();

function init() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

  world = new World(scene);
  player = new Player(scene);
  controls = new Controls();
  clock = new THREE.Clock();

  buildPalette();
  wireUI();
  handleOrientation();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(() => { onResize(); handleOrientation(); }, 200));

  // show title after a short "loading"
  setTimeout(() => {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  }, 700);

  renderer.setAnimationLoop(loop);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  const warn = document.getElementById('rotate-warning');
  // Only nag on actual touch devices in portrait
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (portrait && touch) warn.classList.remove('hidden');
  else warn.classList.add('hidden');
}

// ===================== UI =====================
function buildPalette() {
  const row = document.getElementById('palette-row');
  row.innerHTML = '';
  PALETTE.forEach((c) => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c;
    sw.addEventListener('click', () => {
      player.setPaintColor(c);
      [...row.children].forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    row.appendChild(sw);
  });
}

function wireUI() {
  document.getElementById('start-btn').onclick = startGame;
  document.getElementById('retry-btn').onclick = startGame;
  document.getElementById('howto-btn').onclick = () => {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('howto-screen').classList.remove('hidden');
  };
  document.getElementById('howto-back-btn').onclick = () => {
    document.getElementById('howto-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  };
  document.getElementById('result-title-btn').onclick = () => {
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    state.phase = 'title';
  };

  // Paint button -> toggle palette
  const paintBtn = document.getElementById('btn-paint');
  const palette = document.getElementById('palette');
  paintBtn.onclick = () => {
    palette.classList.toggle('hidden');
    paintBtn.classList.toggle('active', !palette.classList.contains('hidden'));
  };
  document.getElementById('palette-close').onclick = () => {
    palette.classList.add('hidden');
    paintBtn.classList.remove('active');
  };

  // Pose button -> hold to pose (also tap toggles)
  const poseBtn = document.getElementById('btn-pose');
  const setPose = (v) => { player.setPosing(v); poseBtn.classList.toggle('active', v); };
  poseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setPose(true); }, { passive: false });
  poseBtn.addEventListener('touchend', (e) => { e.preventDefault(); setPose(false); }, { passive: false });
  poseBtn.addEventListener('mousedown', () => setPose(true));
  poseBtn.addEventListener('mouseup', () => setPose(false));
  poseBtn.addEventListener('mouseleave', () => setPose(false));

  // Eyedropper -> next tap on world samples a color
  const eyeBtn = document.getElementById('btn-eyedrop');
  eyeBtn.onclick = () => {
    state.eyedropMode = !state.eyedropMode;
    eyeBtn.classList.toggle('active', state.eyedropMode);
    showHint(state.eyedropMode ? '吸い取りたい物をタップ！' : '');
  };

  // Tap to sample color when in eyedrop mode
  document.getElementById('game-root').addEventListener('pointerdown', (e) => {
    if (!state.eyedropMode || state.phase !== 'playing') return;
    if (e.target.closest('button') || e.target.closest('#palette')) return;
    sampleColorAt(e.clientX, e.clientY);
  });
}

let hintEl = null;
function showHint(text) {
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.id = 'eyedrop-hint';
    document.getElementById('game-root').appendChild(hintEl);
  }
  if (!text) { hintEl.style.display = 'none'; return; }
  hintEl.textContent = text;
  hintEl.style.display = 'block';
}

function sampleColorAt(clientX, clientY) {
  const ndc = new THREE.Vector2(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const meshes = world.props.map(p => p.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) {
    const hit = hits[0].object;
    const prop = world.props.find(p => p.mesh === hit);
    if (prop) {
      player.setPaintColor('#' + prop.color.getHexString());
      showHint('色をコピーした！');
      // mark matching swatch
      flashSwatch('#' + prop.color.getHexString());
      setTimeout(() => showHint(''), 800);
    }
  }
  state.eyedropMode = false;
  document.getElementById('btn-eyedrop').classList.remove('active');
}

function flashSwatch(hex) {
  const row = document.getElementById('palette-row');
  [...row.children].forEach(s => s.classList.remove('selected'));
}

// ===================== Game flow =====================
function startGame() {
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('howto-screen').classList.add('hidden');
  document.getElementById('result-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  // reset
  state.phase = 'playing';
  state.time = 90;
  state.detection = 0;
  player.pos.set(0, 0, 12);
  player.heading = Math.PI;
  player.setPaintColor('#7ed957');
  player.setPosing(false);
  state.camYaw = Math.PI;
  world.oni.position.set(0, 0, -18);
  oniState.mode = 'patrol';
  oniState.target = randomPatrolPoint();
}

function endGame(win) {
  state.phase = 'result';
  document.getElementById('hud').classList.add('hidden');
  const screen = document.getElementById('result-screen');
  const title = document.getElementById('result-title');
  const msg = document.getElementById('result-msg');
  const scoreEl = document.getElementById('result-score');

  const survived = Math.round(90 - state.time);
  if (win) {
    title.textContent = '逃げ切った！🎉';
    title.style.color = '#7ed957';
    msg.textContent = 'オニから見事に隠れ切った！';
  } else {
    title.textContent = '見つかった…👹';
    title.style.color = '#ff6b6b';
    msg.textContent = `${survived}秒 逃げのびた`;
  }
  const best = Math.max(state.best, win ? 90 : survived);
  if (best > state.best) { state.best = best; localStorage.setItem('mc_best', String(best)); }
  scoreEl.textContent = `最高記録: ${state.best}秒`;
  screen.classList.remove('hidden');
}

// ===================== Oni AI =====================
const oniState = { mode: 'patrol', target: new THREE.Vector3(), speed: 4.2, t: 0 };
function randomPatrolPoint() {
  return new THREE.Vector3((Math.random()*2-1)*20, 0, (Math.random()*2-1)*20);
}

function updateOni(dt) {
  const oni = world.oni;
  const toPlayer = new THREE.Vector3().subVectors(player.pos, oni.position);
  const dist = toPlayer.length();

  // face movement / player
  oniState.t += dt;

  // Detection: based on camouflage quality, distance, movement, posing.
  const moving = Math.hypot(controls.getMove().x, controls.getMove().y) > 0.1;
  // line of sight: is player in oni's view cone?
  const oniForward = new THREE.Vector3(Math.sin(oni.rotation.y), 0, Math.cos(oni.rotation.y));
  const dirToPlayer = toPlayer.clone().normalize();
  const facing = oniForward.dot(dirToPlayer); // 1 = directly ahead

  // visibility factor
  let visible = 0;
  if (dist < 18 && facing > 0.3) {
    const closeness = THREE.MathUtils.clamp(1 - dist / 18, 0, 1);
    const camoHide = 1 - state.camo;          // good camo lowers visibility
    const moveBoost = moving ? 1.0 : (player.posing ? 0.15 : 0.4);
    visible = closeness * camoHide * moveBoost * (facing);
  }

  // accumulate / decay detection
  if (visible > 0.05) {
    oniState.mode = 'chase';
    state.detection = Math.min(1, state.detection + visible * dt * 1.4);
  } else {
    state.detection = Math.max(0, state.detection - dt * 0.5);
    if (state.detection < 0.1 && oniState.mode === 'chase') oniState.mode = 'patrol';
  }

  // eyes glow with detection
  const g = state.detection;
  world.oniEyeMat.emissive.setRGB(g, g * 0.2, 0);

  // movement
  let targetPos;
  if (oniState.mode === 'chase' || state.detection > 0.4) {
    targetPos = player.pos;
    oniState.speed = 5.4;
  } else {
    if (oni.position.distanceTo(oniState.target) < 1.5) oniState.target = randomPatrolPoint();
    targetPos = oniState.target;
    oniState.speed = 3.2;
  }
  const dir = new THREE.Vector3().subVectors(targetPos, oni.position);
  dir.y = 0;
  if (dir.length() > 0.1) {
    dir.normalize();
    const nextPos = oni.position.clone().addScaledVector(dir, oniState.speed * dt);
    const resolved = world.resolveCollision(nextPos, 0.7);
    oni.position.copy(resolved);
    oni.rotation.y = Math.atan2(dir.x, dir.z);
  }

  // caught?
  if (dist < 1.6 && state.detection > 0.5) {
    endGame(false);
  }
  // fully detected
  if (state.detection >= 1.0) {
    endGame(false);
  }
}

// ===================== Camouflage scoring =====================
const _tmpColor = new THREE.Color();
function computeCamouflage() {
  // Find nearest prop; compare its color to player's paint color.
  let best = 0;
  let nearest = Infinity;
  for (const p of world.props) {
    const d = p.mesh.position.distanceTo(player.pos);
    if (d < nearest) nearest = d;
    if (d < 4.5) {
      // color similarity (0..1)
      const dr = p.color.r - player.mat.color.r;
      const dg = p.color.g - player.mat.color.g;
      const db = p.color.b - player.mat.color.b;
      const colorDist = Math.sqrt(dr*dr + dg*dg + db*db) / Math.sqrt(3);
      const colorMatch = 1 - colorDist;
      // proximity bonus
      const prox = THREE.MathUtils.clamp(1 - d / 4.5, 0, 1);
      let score = colorMatch * (0.5 + 0.5 * prox);
      if (player.posing) score *= 1.25;       // posing improves camo
      best = Math.max(best, Math.min(1, score));
    }
  }
  // if out in the open, camo is low
  if (nearest > 6) best *= 0.4;
  state.camo += (best - state.camo) * 0.15; // smooth
}

// ===================== Main loop =====================
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.phase === 'playing') {
    updatePlayer(dt);
    computeCamouflage();
    updateOni(dt);

    // timer
    state.time -= dt;
    if (state.time <= 0) { state.time = 0; endGame(true); }

    updateHUD();
  } else {
    // idle camera spin on menus
    state.camYaw += dt * 0.15;
    updateCamera(0);
  }

  renderer.render(scene, camera);
}

function updatePlayer(dt) {
  // camera look from swipe
  const look = controls.consumeLook();
  state.camYaw -= look.dx * 0.005;
  state.camPitch = THREE.MathUtils.clamp(state.camPitch - look.dy * 0.004, 0.05, 1.2);

  // movement relative to camera
  const mv = controls.getMove();
  const mag = Math.hypot(mv.x, mv.y);
  let walkAmt = 0;
  if (mag > 0.05 && !player.posing) {
    walkAmt = Math.min(1, mag);
    // forward is -Z rotated by camYaw
    const forward = new THREE.Vector3(Math.sin(state.camYaw), 0, Math.cos(state.camYaw));
    const right = new THREE.Vector3(Math.cos(state.camYaw), 0, -Math.sin(state.camYaw));
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -mv.y);
    moveDir.addScaledVector(right, mv.x);
    if (moveDir.length() > 0.01) {
      moveDir.normalize();
      const next = player.pos.clone().addScaledVector(moveDir, player.speed * mag * dt);
      player.pos.copy(world.resolveCollision(next, 0.5));
      player.heading = Math.atan2(moveDir.x, moveDir.z);
    }
  }

  player.update(dt, world, walkAmt);
  updateCamera(dt);
}

function updateCamera(dt) {
  // 3rd person follow
  const target = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
  const offset = new THREE.Vector3(
    Math.sin(state.camYaw) * Math.cos(state.camPitch),
    Math.sin(state.camPitch),
    Math.cos(state.camYaw) * Math.cos(state.camPitch)
  ).multiplyScalar(state.camDist);
  const desired = target.clone().add(offset);
  if (dt > 0) camera.position.lerp(desired, Math.min(1, dt * 10));
  else camera.position.copy(desired);
  camera.lookAt(target);
}

// ===================== HUD =====================
function updateHUD() {
  document.getElementById('timer').textContent = Math.ceil(state.time);
  document.getElementById('camo-meter').textContent = Math.round(state.camo * 100) + '%';

  const statusChip = document.getElementById('status-chip');
  if (state.detection > 0.6) {
    statusChip.textContent = '🔴 見つかる!';
    statusChip.style.color = '#ff8888';
  } else if (state.detection > 0.25) {
    statusChip.textContent = '🟡 あやしい';
    statusChip.style.color = '#ffe082';
  } else {
    statusChip.textContent = '🟢 安全';
    statusChip.style.color = '#b7ff9c';
  }

  // camo chip color feedback
  const camoChip = document.getElementById('camo-chip');
  const good = state.camo > 0.65;
  camoChip.style.color = good ? '#7ed957' : (state.camo > 0.4 ? '#ffe082' : '#ffffff');
}
