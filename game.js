'use strict';

// ─── Canvas Setup ────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const livesDisplay = document.getElementById('lives-display');
const levelDisplay = document.getElementById('level-display');
const timerDisplay = document.getElementById('timer-display');
const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnRestart = document.getElementById('btn-restart');

const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;

// ─── Pitch Layout ────────────────────────────────────────────────────────────

const PITCH = {
  x: 50,
  y: 40,
  width: CANVAS_W - 100,
  height: CANVAS_H - 80,
};

const GOAL_WIDTH = 120;
const GOAL_DEPTH = 18;
const CENTER_X = PITCH.x + PITCH.width / 2;
const CENTER_Y = PITCH.y + PITCH.height / 2;
const HALFWAY_Y = CENTER_Y;

const OPPONENT_GOAL = {
  x: PITCH.x + (PITCH.width - GOAL_WIDTH) / 2,
  y: PITCH.y,
  width: GOAL_WIDTH,
  height: GOAL_DEPTH,
};

// ─── Player Definitions ──────────────────────────────────────────────────────

const PLAYER_RADIUS = 22;
const BALL_RADIUS = 8;

/** Base Viking charge speed (pixels/sec) – scales per level in Step 4 */
const VIKING_BASE_SPEED = 95;

const MAX_LIVES = 3;
const HIT_MESSAGE_DURATION = 1.2;
const GOAL_MESSAGE_DURATION = 1.5;

/** Shot success % by player role when enemy defenders are on the pitch */
const SHOT_PROBABILITY = {
  1: 8,
  2: 18,
  3: 38,
  4: 58,
  5: 88,
};

/** Higher shot success when the pitch has no enemy defenders */
const SHOT_PROBABILITY_OPEN = {
  1: 28,
  2: 45,
  3: 65,
  4: 82,
  5: 96,
};

/** Team colours – each player gets a distinct hue */
const PLAYER_COLORS = [
  '#3498db', // 1 – Defender (blue)
  '#2ecc71', // 2 – Mid-defender (green)
  '#f1c40f', // 3 – Center (yellow)
  '#e67e22', // 4 – Mid-attacker (orange)
  '#9b59b6', // 5 – Striker (purple)
];

/**
 * Fixed positions along the pitch (y increases downward = own goal at bottom).
 * x is fraction of pitch width (0 = left touchline, 1 = right).
 */
const PLAYER_LAYOUT = [
  { num: 1, xFrac: 0.50, yFrac: 0.88 }, // Defender – own goal
  { num: 2, xFrac: 0.30, yFrac: 0.72 },
  { num: 3, xFrac: 0.70, yFrac: 0.58 }, // Center
  { num: 4, xFrac: 0.35, yFrac: 0.42 },
  { num: 5, xFrac: 0.65, yFrac: 0.18 }, // Striker – opponent goal
];

function layoutToWorld(layout) {
  return {
    num: layout.num,
    x: PITCH.x + layout.xFrac * PITCH.width,
    y: PITCH.y + layout.yFrac * PITCH.height,
  };
}

/** Longest possible pass distance on this pitch layout */
const MAX_PASS_DISTANCE = (() => {
  const positions = PLAYER_LAYOUT.map(layoutToWorld);
  let max = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      max = Math.max(max, Math.hypot(positions[j].x - positions[i].x, positions[j].y - positions[i].y));
    }
  }
  return max;
})();

// ─── Game State ──────────────────────────────────────────────────────────────

const gameState = {
  status: 'ready', // 'ready' | 'playing' | 'paused' | 'hitFlash' | 'goalFlash' | 'gameOver'
  level: 1,
  lives: MAX_LIVES,
  levelTime: 0,
  totalTime: 0,
  hitFlashTimer: 0,
  goalFlashTimer: 0,
  players: PLAYER_LAYOUT.map(layoutToWorld),
  enemyDefenders: [], // populated in Step 4 on alternate levels
  viking: {
    x: CENTER_X,
    y: HALFWAY_Y,
    radius: 28,
    color: '#c0392b',
    speed: VIKING_BASE_SPEED,
  },
  ball: {
    x: 0,
    y: 0,
    radius: BALL_RADIUS,
    carrierId: 1,
  },
};

let lastTimestamp = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPlayer(num) {
  return gameState.players.find(p => p.num === num);
}

function syncBallToCarrier() {
  const carrier = getPlayer(gameState.ball.carrierId);
  if (carrier) {
    gameState.ball.x = carrier.x;
    gameState.ball.y = carrier.y - PLAYER_RADIUS - BALL_RADIUS - 2;
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function updateHud() {
  livesDisplay.textContent = '♥ '.repeat(gameState.lives).trim() || '—';
  levelDisplay.textContent = String(gameState.level);
  timerDisplay.textContent = formatTime(gameState.totalTime);
}

function showMessage(text, color) {
  messageText.textContent = text;
  messageText.style.borderColor = color || '#f85149';
  messageText.style.color = color || '#f85149';
  messageOverlay.classList.remove('hidden');
}

function hideMessage() {
  messageOverlay.classList.add('hidden');
}

function resetVikingPosition() {
  gameState.viking.x = CENTER_X;
  gameState.viking.y = HALFWAY_Y;
}

function resetLevelState() {
  gameState.players = PLAYER_LAYOUT.map(layoutToWorld);
  gameState.ball.carrierId = 1;
  gameState.levelTime = 0;
  resetVikingPosition();
  syncBallToCarrier();
}

function getVikingSpeedForLevel(level) {
  return VIKING_BASE_SPEED + (level - 1) * 18;
}

function applyLevelSettings() {
  gameState.viking.speed = getVikingSpeedForLevel(gameState.level);
}

function updateControlButtons() {
  const { status } = gameState;

  btnStart.disabled = status !== 'ready' && status !== 'gameOver';
  btnPause.disabled = status !== 'playing' && status !== 'paused';
  btnPause.innerHTML = status === 'paused'
    ? 'Resume <span class="btn-key">P</span>'
    : 'Pause <span class="btn-key">P</span>';
}

function startGame() {
  if (gameState.status === 'ready') {
    gameState.status = 'playing';
    hideMessage();
    updateControlButtons();
    lastTimestamp = 0;
    return;
  }

  if (gameState.status === 'gameOver') {
    restartGame();
  }
}

function togglePause() {
  if (gameState.status === 'playing') {
    gameState.status = 'paused';
    showMessage('Paused — Press P to resume', '#8b949e');
    updateControlButtons();
    return;
  }

  if (gameState.status === 'paused') {
    gameState.status = 'playing';
    hideMessage();
    updateControlButtons();
    lastTimestamp = 0;
  }
}

function restartGame() {
  gameState.status = 'playing';
  gameState.level = 1;
  gameState.lives = MAX_LIVES;
  gameState.levelTime = 0;
  gameState.totalTime = 0;
  gameState.hitFlashTimer = 0;
  gameState.goalFlashTimer = 0;
  gameState.enemyDefenders = [];
  applyLevelSettings();
  resetLevelState();
  updateHud();
  hideMessage();
  updateControlButtons();
  lastTimestamp = 0;
}

function isInputLocked() {
  return gameState.status !== 'playing';
}

function rollSuccess(probability) {
  return Math.random() * 100 < probability;
}

function playerDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Penalty applied by enemy defenders – expanded in Step 4 */
function getPassBlockerPenalty(targetNum) {
  let penalty = 0;
  for (const defender of gameState.enemyDefenders) {
    if (defender.coversPlayer === targetNum) {
      penalty += defender.blockPenalty ?? 35;
    }
  }
  return penalty;
}

function calcPassProbability(fromNum, toNum) {
  if (fromNum === toNum) return 0;

  const from = getPlayer(fromNum);
  const to = getPlayer(toNum);
  if (!from || !to) return 0;

  const dist = playerDistance(from, to);
  const distRatio = dist / MAX_PASS_DISTANCE;

  // Short passes ~99%, long bombs (e.g. 1→5) ~68%
  const baseProb = 99 - distRatio * 31;
  const blocked = getPassBlockerPenalty(toNum);

  return Math.round(Math.max(12, Math.min(99, baseProb - blocked)));
}

function calcShotProbability(carrierNum) {
  const table = gameState.enemyDefenders.length === 0
    ? SHOT_PROBABILITY_OPEN
    : SHOT_PROBABILITY;
  return table[carrierNum] ?? 10;
}

function probColor(prob) {
  if (prob >= 70) return '#3fb950';
  if (prob >= 40) return '#d29922';
  return '#f85149';
}

// ─── Life Loss & Resets ──────────────────────────────────────────────────────

function loseLife(reason) {
  gameState.lives -= 1;
  updateHud();

  if (gameState.lives <= 0) {
    gameState.status = 'gameOver';
    showMessage('Game Over — The Viking claims victory!');
    updateControlButtons();
    return;
  }

  gameState.status = 'hitFlash';
  gameState.hitFlashTimer = HIT_MESSAGE_DURATION;
  showMessage(`${reason} ${gameState.lives} ${gameState.lives === 1 ? 'life' : 'lives'} remaining`);
  resetLevelState();
}

function onVikingHit() {
  loseLife('Tackled!');
}

function onPassFailed() {
  loseLife('Pass intercepted!');
}

function onShotMissed() {
  loseLife('Shot missed!');
}

function onGoalScored() {
  gameState.status = 'goalFlash';
  gameState.goalFlashTimer = GOAL_MESSAGE_DURATION;
  showMessage('GOAL!', '#3fb950');
  // Step 4 will advance to the next level here
}

// ─── Passing & Shooting ──────────────────────────────────────────────────────

function attemptPass(targetNum) {
  if (isInputLocked()) return;

  const carrierId = gameState.ball.carrierId;
  if (targetNum === carrierId) return;

  const target = getPlayer(targetNum);
  if (!target) return;

  const probability = calcPassProbability(carrierId, targetNum);

  if (rollSuccess(probability)) {
    gameState.ball.carrierId = targetNum;
    syncBallToCarrier();
  } else {
    onPassFailed();
  }
}

function attemptShoot() {
  if (isInputLocked()) return;

  const carrierId = gameState.ball.carrierId;
  const probability = calcShotProbability(carrierId);

  if (rollSuccess(probability)) {
    onGoalScored();
  } else {
    onShotMissed();
  }
}

function getPlayerAtPoint(x, y) {
  for (const player of gameState.players) {
    if (Math.hypot(x - player.x, y - player.y) <= PLAYER_RADIUS + 10) {
      return player;
    }
  }
  return null;
}

function isClickOnOpponentGoal(x, y) {
  const zone = {
    x: OPPONENT_GOAL.x - 20,
    y: PITCH.y,
    width: OPPONENT_GOAL.width + 40,
    height: PITCH.height * 0.22,
  };
  return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
}

function handleCanvasClick(event) {
  if (isInputLocked()) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const clickedPlayer = getPlayerAtPoint(x, y);
  if (clickedPlayer) {
    attemptPass(clickedPlayer.num);
    return;
  }

  if (isClickOnOpponentGoal(x, y)) {
    attemptShoot();
  }
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();

  if (key === 'p') {
    togglePause();
    event.preventDefault();
    return;
  }

  if (key === 's') {
    startGame();
    event.preventDefault();
    return;
  }

  if (key === 'r') {
    restartGame();
    event.preventDefault();
    return;
  }

  if (isInputLocked()) return;

  if (key >= '1' && key <= '5') {
    attemptPass(Number(key));
    event.preventDefault();
    return;
  }

  if (key === ' ' || key === 'spacebar') {
    attemptShoot();
    event.preventDefault();
  }
}

// ─── Game Logic ──────────────────────────────────────────────────────────────

function updateViking(dt) {
  const carrier = getPlayer(gameState.ball.carrierId);
  if (!carrier) return;

  const dx = carrier.x - gameState.viking.x;
  const dy = carrier.y - gameState.viking.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1) return;

  const step = gameState.viking.speed * dt;
  gameState.viking.x += (dx / dist) * step;
  gameState.viking.y += (dy / dist) * step;
}

function checkVikingCollision() {
  const carrier = getPlayer(gameState.ball.carrierId);
  if (!carrier) return;

  const { viking } = gameState;
  const dist = Math.hypot(carrier.x - viking.x, carrier.y - viking.y);
  const hitRadius = viking.radius + PLAYER_RADIUS - 4;

  if (dist <= hitRadius) {
    onVikingHit();
  }
}

function updateFlashStates(dt) {
  if (gameState.status === 'hitFlash') {
    gameState.hitFlashTimer -= dt;
    if (gameState.hitFlashTimer <= 0) {
      gameState.status = 'playing';
      hideMessage();
    }
    return true;
  }

  if (gameState.status === 'goalFlash') {
    gameState.goalFlashTimer -= dt;
    if (gameState.goalFlashTimer <= 0) {
      gameState.status = 'playing';
      hideMessage();
      resetLevelState();
    }
    return true;
  }

  return false;
}

function update(dt) {
  if (updateFlashStates(dt)) return;

  gameState.levelTime += dt;
  gameState.totalTime += dt;
  updateHud();

  updateViking(dt);
  checkVikingCollision();
}

// ─── Drawing: Pitch ──────────────────────────────────────────────────────────

function drawPitch() {
  const { x, y, width, height } = PITCH;

  ctx.fillStyle = '#2d6a3f';
  ctx.fillRect(x, y, width, height);

  const stripeCount = 10;
  const stripeW = width / stripeCount;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let i = 0; i < stripeCount; i += 2) {
    ctx.fillRect(x + i * stripeW, y, stripeW, height);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  ctx.beginPath();
  ctx.moveTo(x, HALFWAY_Y);
  ctx.lineTo(x + width, HALFWAY_Y);
  ctx.stroke();

  const centerCircleR = 60;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, centerCircleR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 4, 0, Math.PI * 2);
  ctx.fill();

  const penW = width * 0.55;
  const penH = height * 0.18;
  const penX = x + (width - penW) / 2;

  ctx.strokeRect(penX, y, penW, penH);
  ctx.strokeRect(penX, y + height - penH, penW, penH);

  drawGoal(OPPONENT_GOAL.x, OPPONENT_GOAL.y, GOAL_WIDTH, GOAL_DEPTH);
  drawGoal(x + (width - GOAL_WIDTH) / 2, y + height - GOAL_DEPTH, GOAL_WIDTH, GOAL_DEPTH);
}

function drawGoal(gx, gy, gw, gd) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(gx, gy, gw, gd);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gd);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  const netLines = 5;
  for (let i = 1; i < netLines; i++) {
    const nx = gx + (gw / netLines) * i;
    ctx.beginPath();
    ctx.moveTo(nx, gy);
    ctx.lineTo(nx, gy + gd);
    ctx.stroke();
  }
}

function drawShootZone() {
  if (isInputLocked()) return;

  const carrierId = gameState.ball.carrierId;
  const shotProb = calcShotProbability(carrierId);
  const zone = {
    x: OPPONENT_GOAL.x - 20,
    y: PITCH.y,
    width: OPPONENT_GOAL.width + 40,
    height: PITCH.height * 0.22,
  };

  ctx.fillStyle = 'rgba(63, 185, 80, 0.08)';
  ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
  ctx.strokeStyle = 'rgba(63, 185, 80, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
  ctx.setLineDash([]);

  const label = `SHOOT ${shotProb}%`;
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  const textW = ctx.measureText(label).width;
  const labelX = OPPONENT_GOAL.x + OPPONENT_GOAL.width / 2;
  const labelY = PITCH.y + 28;

  ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
  ctx.beginPath();
  ctx.roundRect(labelX - textW / 2 - 8, labelY - 10, textW + 16, 20, 4);
  ctx.fill();

  ctx.fillStyle = probColor(shotProb);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, labelX, labelY);
}

function drawPassProbabilities() {
  if (isInputLocked()) return;

  const carrierId = gameState.ball.carrierId;

  for (const player of gameState.players) {
    if (player.num === carrierId) continue;

    const prob = calcPassProbability(carrierId, player.num);
    const label = `${prob}%`;
    const color = probColor(prob);
    const labelY = player.y - PLAYER_RADIUS - 18;

    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    const textW = ctx.measureText(label).width;
    const padX = 7;
    const padY = 4;
    const boxW = textW + padX * 2;
    const boxH = 18;
    const boxX = player.x - boxW / 2;
    const boxY = labelY - boxH / 2;

    ctx.fillStyle = 'rgba(13, 17, 23, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, player.x, labelY);
  }
}

// ─── Drawing: Entities ───────────────────────────────────────────────────────

function drawPlayer(player) {
  const color = PLAYER_COLORS[player.num - 1];
  const isCarrier = player.num === gameState.ball.carrierId;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + PLAYER_RADIUS * 0.6, PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isCarrier) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = isCarrier ? 3 : 2.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(player.num), player.x, player.y);
}

function drawViking() {
  const { x, y, radius, color } = gameState.viking;

  const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.8);
  gradient.addColorStop(0, 'rgba(192, 57, 43, 0.5)');
  gradient.addColorStop(1, 'rgba(192, 57, 43, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.6, radius * 0.95, radius * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(x, y - 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(x, y - 4, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffcccc';
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('VIKING', x, y + radius + 4);
}

function drawBall() {
  const { x, y, radius } = gameState.ball;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + radius, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - radius * 0.5);
  ctx.lineTo(x + radius * 0.4, y + radius * 0.3);
  ctx.lineTo(x - radius * 0.35, y + radius * 0.35);
  ctx.closePath();
  ctx.stroke();
}

function drawFlashOverlay() {
  if (gameState.status === 'hitFlash') {
    const alpha = Math.min(1, gameState.hitFlashTimer / 0.3) * 0.35;
    ctx.fillStyle = `rgba(248, 81, 73, ${alpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  if (gameState.status === 'goalFlash') {
    const alpha = Math.min(1, gameState.goalFlashTimer / 0.4) * 0.3;
    ctx.fillStyle = `rgba(63, 185, 80, ${alpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

// ─── Main Loop ─────────────────────────────────────────────────────────────────

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawPitch();
  drawShootZone();

  for (const player of gameState.players) {
    drawPlayer(player);
  }

  drawPassProbabilities();
  drawViking();
  drawBall();
  drawFlashOverlay();
}

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  if (gameState.status === 'playing' || gameState.status === 'hitFlash' || gameState.status === 'goalFlash') {
    update(dt);
  }

  render();
  requestAnimationFrame(gameLoop);
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  applyLevelSettings();
  resetLevelState();
  updateHud();
  showMessage('Press S to Start', '#58a6ff');
  updateControlButtons();

  canvas.addEventListener('click', handleCanvasClick);
  window.addEventListener('keydown', handleKeyDown);
  btnStart.addEventListener('click', startGame);
  btnPause.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', restartGame);

  requestAnimationFrame(gameLoop);
}

init();
