'use strict';

// ─── Canvas Setup ────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const livesDisplay = document.getElementById('lives-display');
const levelDisplay = document.getElementById('level-display');
const nationDisplay = document.getElementById('nation-display');
const timerDisplay = document.getElementById('timer-display');
const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');
const btnStart = document.getElementById('btn-start');
const btnRules = document.getElementById('btn-rules');
const btnLeaderboard = document.getElementById('btn-leaderboard');
const rulesModal = document.getElementById('rules-modal');
const btnCloseRules = document.getElementById('btn-close-rules');
const btnPause = document.getElementById('btn-pause');
const btnRestart = document.getElementById('btn-restart');
const leaderboardModal = document.getElementById('leaderboard-modal');
const modalTitle = document.getElementById('modal-title');
const btnSubmitScore = document.getElementById('btn-submit-score');
const btnCloseModal = document.getElementById('btn-close-modal');
const usernameInput = document.getElementById('username-input');
const countrySelect = document.getElementById('country-select');
const submitSection = document.getElementById('submit-section');
const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardList = document.getElementById('leaderboard-list');
const globalTriesCount = document.getElementById('global-tries-count');

if (typeof COUNTRIES !== 'undefined') {
  countrySelect.innerHTML = '';
  COUNTRIES.forEach(c => {
    const emoji = String.fromCodePoint(...[...c.code.toUpperCase()].map(char => char.charCodeAt(0) + 127397));
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${emoji} ${c.name}`;
    countrySelect.appendChild(opt);
  });
  const otherOpt = document.createElement('option');
  otherOpt.value = 'other';
  otherOpt.textContent = '🏳️ Other';
  countrySelect.appendChild(otherOpt);
}

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
const BALL_RADIUS = 14;

/** Ball flight animation speed (pixels per second) */
const BALL_FLIGHT_SPEED = 600;

/** Base Viking charge speed (pixels/sec) – scales per level in Step 4 */
const VIKING_BASE_SPEED = 75;

const MAX_LIVES = 5;
const MAX_LEVEL = 10;
const HIT_MESSAGE_DURATION = 1.2;
const GOAL_MESSAGE_DURATION = 1.5;
const LEVEL_SPLASH_DURATION = 2.0;

/** World Cup opponent nations – one per level */
const NATIONS = [
  { name: 'Cabo Verde', code: 'cv' },
  { name: 'India', code: 'in' },
  { name: 'USA', code: 'us' },
  { name: 'Brazil', code: 'br' },
  { name: 'England', code: 'gb-eng' },
  { name: 'Spain', code: 'es' },
  { name: 'Portugal', code: 'pt' },
  { name: 'France', code: 'fr' },
  { name: 'Argentina', code: 'ar' },
  { name: 'Norway', code: 'no' },
];

/** Preload flag images */
const flagImages = {};
NATIONS.forEach(nation => {
  const img = new Image();
  img.src = `https://flagcdn.com/w40/${nation.code}.png`;
  flagImages[nation.code] = img;
});

/** Preload Viking image */
const vikingImage = new Image();
vikingImage.src = 'resources/images/viking_run.webp';
let vikingImageLoaded = false;
vikingImage.onload = () => { vikingImageLoaded = true; };

/** Preload Football image */
const ballImage = new Image();
ballImage.src = 'resources/images/football.webp';
let ballImageLoaded = false;
ballImage.onload = () => { ballImageLoaded = true; };

/** Preload Goal Audio */
const goalAudio = new Audio('resources/music/goal_scored_roar.mp3');

/** Preload Whistle Audio */
const whistleAudio = new Audio('resources/music/Whistle.m4a');

/** Preload Viking Wins Audio */
const vikingWinsAudio = new Audio('resources/music/Viking_Wins.m4a');
vikingWinsAudio.loop = true;

/** Preload Game Over Video */
const gameOverVideo = document.createElement('video');
gameOverVideo.src = 'resources/videos/Viking_Row.mp4';
gameOverVideo.loop = true;
gameOverVideo.muted = true;

/** Preload Winning Music */
const winningMusicAudio = new Audio('resources/music/Winning_Music.m4a');
winningMusicAudio.loop = true;

/** Preload Background Music */
const bgMusic = new Audio('resources/music/Background_Music.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.5; // lower volume so SFX can be heard clearly

/** Player drift movement */
const PLAYER_DRIFT_RADIUS = 28;
const PLAYER_DRIFT_SPEED = 1.2; // radians per second
const TEAMMATE_EVASION_SPEED = 120; // px/sec
const TEAMMATE_RETURN_SPEED = 60; // px/sec
const EVASION_RADIUS = 150; // px

/** Enemy defender patrol radius (pixels) */
const DEFENDER_PATROL_RADIUS = 30;
const DEFENDER_RADIUS = 18;
const DEFENDER_PATROL_SPEED = 1.2; // radians per second

/** Shot success % by player role when enemy defenders are on the pitch */
const SHOT_PROBABILITY = {
  1: 20,
  2: 35,
  3: 55,
  4: 72,
  5: 92,
};

/** Higher shot success when the pitch has no enemy defenders */
const SHOT_PROBABILITY_OPEN = {
  1: 40,
  2: 58,
  3: 78,
  4: 90,
  5: 98,
};

/** Team colours – each player gets a distinct hue */
const PLAYER_COLORS = [
  '#2ecc71', // 1 – Defender (green)
  '#2ecc71', // 2 – Midfielder (green)
  '#2ecc71', // 3 – Center (green)
  '#2ecc71', // 4 – Attacker (green)
  '#2ecc71', // 5 – Striker (green)
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
  const x = PITCH.x + layout.xFrac * PITCH.width;
  const y = PITCH.y + layout.yFrac * PITCH.height;
  return {
    num: layout.num,
    x,
    y,
    baseX: x,
    baseY: y,
    originalX: x,
    originalY: y,
    driftAngle: Math.random() * Math.PI * 2,
    driftPhase: Math.random() * Math.PI * 2, // offset for figure-8 y-axis
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
  status: 'ready', // 'ready' | 'playing' | 'paused' | 'hitFlash' | 'goalFlash' | 'levelSplash' | 'gameOver' | 'victory'
  level: 1,
  lives: MAX_LIVES,
  levelTime: 0,
  totalTime: 0,
  hitFlashTimer: 0,
  goalFlashTimer: 0,
  levelSplashTimer: 0,
  players: PLAYER_LAYOUT.map(layoutToWorld),
  enemyDefenders: [],
  viking: {
    x: CENTER_X,
    y: PITCH.y + GOAL_DEPTH,
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
  finalScore: 0,
  scoreBreakdown: null,
  /** Ball flight animation state */
  ballFlight: null, // { fromX, fromY, toX, toY, progress, onArrive, duration }
  refereeIntervened: false,
  onFirePlayerId: null,
  onFireTimer: 6.0,
  vikingStunTimer: 0,
  carrierHoldTime: 0,
  consecutivePasses: 0,
};

let lastTimestamp = 0;

/** Confetti particles for victory screen */
const confetti = [];
const CONFETTI_COLORS = ['#f85149', '#3fb950', '#58a6ff', '#d29922', '#f0f6fc', '#bc8cff', '#ff7eb3', '#ffeb3b'];

function spawnConfetti() {
  confetti.length = 0;
  for (let i = 0; i < 150; i++) {
    confetti.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * -CANVAS_H,
      w: 4 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 80,
      vy: 60 + Math.random() * 120,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    });
  }
}

function updateConfetti(dt) {
  for (const c of confetti) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.rotSpeed * dt;
    if (c.y > CANVAS_H + 20) {
      c.y = -20;
      c.x = Math.random() * CANVAS_W;
    }
  }
}

function drawConfetti() {
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPlayer(num) {
  return gameState.players.find(p => p.num === num);
}

function syncBallToCarrier() {
  if (gameState.ballFlight) return; // don't snap while ball is in flight
  const carrier = getPlayer(gameState.ball.carrierId);
  if (carrier) {
    gameState.ball.x = carrier.x;
    gameState.ball.y = carrier.y - PLAYER_RADIUS - BALL_RADIUS - 4;
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
  const nation = NATIONS[gameState.level - 1];
  nationDisplay.innerHTML = `<img src="https://flagcdn.com/w40/${nation.code}.png" style="vertical-align: middle; height: 16px; margin-top: -3px; margin-right: 4px;"> ${nation.name}`;
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
  gameState.viking.y = PITCH.y + GOAL_DEPTH;
}

function resetLevelState() {
  gameState.players = PLAYER_LAYOUT.map(layoutToWorld);
  gameState.ball.carrierId = 1;
  gameState.levelTime = 0;
  gameState.ballFlight = null;
  gameState.onFirePlayerId = null;
  gameState.onFireTimer = 2.0; // Starts at 2 seconds
  gameState.vikingStunTimer = 0;
  gameState.carrierHoldTime = 0;
  gameState.consecutivePasses = 0;
  resetVikingPosition();
  syncBallToCarrier();
}

function getVikingSpeedForLevel(level) {
  return VIKING_BASE_SPEED + (level - 1) * 18;
}

function spawnEnemyDefenders(level) {
  gameState.enemyDefenders = [];

  const count = Math.floor(level / 3);
  if (count === 0) return;

  const coverOrder = [5, 4, 3];

  for (let i = 0; i < count; i++) {
    const targetNum = coverOrder[i];
    const target = getPlayer(targetNum) || layoutToWorld(PLAYER_LAYOUT[targetNum - 1]);
    // Position defender between the target and the goal
    const offsetY = -35; // slightly above (toward opponent goal)
    const offsetX = (i % 2 === 0 ? 25 : -25);
    gameState.enemyDefenders.push({
      baseX: target.x + offsetX,
      baseY: target.y + offsetY,
      x: target.x + offsetX,
      y: target.y + offsetY,
      radius: DEFENDER_RADIUS,
      coversPlayer: targetNum,
      blockPenalty: 20,
      effectivePenalty: 20,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolRadius: level >= 10 ? DEFENDER_PATROL_RADIUS * 0.7 : DEFENDER_PATROL_RADIUS,
      coveragePhase: Math.random() * Math.PI * 2,
    });
  }
}

function updateEnemyDefenders(dt) {
  for (const def of gameState.enemyDefenders) {
    def.patrolAngle += DEFENDER_PATROL_SPEED * dt;
    def.coveragePhase += 0.8 * dt; // completes cycle every ~7.8 seconds

    // Coverage window: sine wave drops below 0.3 -> defender wanders off.
    const isOut = Math.sin(def.coveragePhase) > 0.3;
    const targetRadius = isOut ? def.patrolRadius * 4 : def.patrolRadius;

    // smooth lerp
    def.currentRadius = def.currentRadius || def.patrolRadius;
    def.currentRadius += (targetRadius - def.currentRadius) * dt * 2.5;

    // effective block penalty drops when wandering off
    const penaltyMultiplier = Math.max(0, 1 - (def.currentRadius - def.patrolRadius) / (def.patrolRadius * 2));
    def.effectivePenalty = Math.round(def.blockPenalty * penaltyMultiplier);

    def.x = def.baseX + Math.cos(def.patrolAngle) * def.currentRadius;
    def.y = def.baseY + Math.sin(def.patrolAngle) * def.currentRadius;
  }
}

function applyLevelSettings() {
  gameState.viking.speed = getVikingSpeedForLevel(gameState.level);
  spawnEnemyDefenders(gameState.level);
}

function updateControlButtons() {
  const { status } = gameState;

  btnStart.disabled = status !== 'ready' && status !== 'gameOver' && status !== 'victory';
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
    bgMusic.play().catch(e => console.warn('Audio playback prevented:', e));
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
  vikingWinsAudio.pause();
  winningMusicAudio.pause();
  gameOverVideo.pause();
  bgMusic.currentTime = 0;
  bgMusic.play().catch(e => console.warn('Audio playback prevented:', e));
  gameState.status = 'playing';
  gameState.level = 1;
  gameState.lives = MAX_LIVES;
  gameState.levelTime = 0;
  gameState.totalTime = 0;
  gameState.hitFlashTimer = 0;
  gameState.goalFlashTimer = 0;
  gameState.levelSplashTimer = 0;
  gameState.enemyDefenders = [];
  gameState.finalScore = 0;
  gameState.scoreBreakdown = null;
  gameState.ballFlight = null;
  gameState.refereeIntervened = false;
  confetti.length = 0;
  leaderboardModal.classList.add('hidden');
  applyLevelSettings();
  resetLevelState();
  updateHud();
  hideMessage();
  updateControlButtons();
  lastTimestamp = 0;
}

function isInputLocked() {
  return gameState.status !== 'playing' || gameState.ballFlight !== null;
}

function calculateFinalScore() {
  const base = 10000;
  const timeBonus = Math.max(0, Math.round(5000 - gameState.totalTime * 10));
  const livesBonus = gameState.lives * 2000;
  const total = base + timeBonus + livesBonus;
  gameState.scoreBreakdown = { base, timeBonus, livesBonus, total };
  gameState.finalScore = total;
  return total;
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
      penalty += defender.effectivePenalty ?? defender.blockPenalty ?? 20;
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

  // Short passes ~99%, long bombs ~68%
  const baseProb = 99 - distRatio * 31;
  const blocked = getPassBlockerPenalty(toNum);

  // Viking Pressure mechanic on the receiver
  const vikingDistToReceiver = Math.hypot(to.x - gameState.viking.x, to.y - gameState.viking.y);

  // Penalty if Viking is within 250 pixels of the receiver (up to -25% drop)
  const vikingPressure = Math.max(0, 250 - vikingDistToReceiver) / 250 * 25;

  // Boost if Viking is far away from the receiver (up to +30% boost)
  const vikingSafetyBoost = Math.max(0, vikingDistToReceiver - 350) / 400 * 30;

  // Chain pass bonus: successful passes increase probability
  const chainBonus = Math.min(30, gameState.consecutivePasses * 10);

  // Patience bonus: up to +25% if held for 5 seconds
  const patienceBonus = Math.min(25, gameState.carrierHoldTime * 5);

  return Math.round(Math.max(12, Math.min(99, baseProb - blocked - vikingPressure + vikingSafetyBoost + chainBonus + patienceBonus)));
}

function calcShotProbability(carrierNum) {
  const table = gameState.enemyDefenders.length === 0
    ? SHOT_PROBABILITY_OPEN
    : SHOT_PROBABILITY;

  const baseShot = table[carrierNum] ?? 10;
  const patienceBonus = Math.min(25, gameState.carrierHoldTime * 5);
  const chainBonus = Math.min(30, gameState.consecutivePasses * 10);

  return Math.round(Math.min(99, baseShot + patienceBonus + chainBonus));
}

function probColor(prob) {
  if (prob >= 70) return '#3fb950';
  if (prob >= 40) return '#d29922';
  return '#f85149';
}

// ─── Life Loss & Resets ──────────────────────────────────────────────────────

function loseLife(reason) {
  // Play the whistle sound
  whistleAudio.currentTime = 0;
  whistleAudio.play().catch(e => console.warn('Audio playback prevented:', e));

  gameState.lives -= 1;
  updateHud();

  if (gameState.lives <= 0) {
    if (window.incrementGlobalTries) {
      window.incrementGlobalTries();
    }
    bgMusic.pause();
    vikingWinsAudio.currentTime = 0;
    vikingWinsAudio.play().catch(e => console.warn('Audio playback prevented:', e));
    gameOverVideo.currentTime = 0;
    gameOverVideo.play().catch(e => console.warn('Video playback prevented:', e));
    gameState.status = 'gameOver';
    hideMessage();
    updateControlButtons();



    return;
  }

  gameState.status = 'hitFlash';
  gameState.hitFlashTimer = HIT_MESSAGE_DURATION;
  showMessage(`${reason} ${gameState.lives} ${gameState.lives === 1 ? 'life' : 'lives'} remaining`);
  resetLevelState();
}

function onVikingHit() {
  loseLife('Viking got the ball!');
}

function onPassFailed(reason = 'Defender got the ball!') {
  loseLife(reason);
}

function onShotMissed() {
  loseLife('Shot out of bounds!');
}

function onGoalScored() {
  if (gameState.level === 9 && !gameState.refereeIntervened) {
    gameState.refereeIntervened = true;
    gameState.status = 'hitFlash';
    gameState.hitFlashTimer = 3.0;
    showMessage("Goal disallowed! Yellow card for scoring against Argentina!", '#d29922');

    // Play whistle sound for referee stoppage
    whistleAudio.currentTime = 0;
    whistleAudio.play().catch(e => console.warn('Audio playback prevented:', e));

    resetLevelState();
    return;
  }

  gameState.status = 'goalFlash';
  gameState.goalFlashTimer = GOAL_MESSAGE_DURATION;
  showMessage('GOAL!', '#3fb950');

  // Play audio for 2 seconds
  goalAudio.currentTime = 0;
  goalAudio.play().catch(e => console.warn('Audio playback prevented:', e));
  setTimeout(() => {
    goalAudio.pause();
  }, 2000);
}

function advanceLevel() {
  if (gameState.level >= MAX_LEVEL) {
    // Victory!
    bgMusic.pause();
    winningMusicAudio.currentTime = 0;
    winningMusicAudio.play().catch(e => console.warn('Audio playback prevented:', e));
    calculateFinalScore();
    gameState.status = 'victory';
    hideMessage();
    spawnConfetti();
    updateControlButtons();

    // Show Leaderboard Modal after a short delay so the user sees the victory screen first
    setTimeout(() => {
      modalTitle.textContent = 'World Champion!';
      modalTitle.style.color = '#ffd700';
      leaderboardModal.classList.remove('hidden');
      submitSection.classList.remove('hidden');
      leaderboardSection.classList.add('hidden');
    }, 2000);

    return;
  }

  gameState.level += 1;
  applyLevelSettings();
  resetLevelState();
  updateHud();

  // Show level splash
  gameState.status = 'levelSplash';
  gameState.levelSplashTimer = LEVEL_SPLASH_DURATION;
  hideMessage();
  updateControlButtons();
}

// ─── Passing & Shooting ──────────────────────────────────────────────────────

function attemptPass(targetNum) {
  if (isInputLocked()) return;

  const carrierId = gameState.ball.carrierId;
  if (targetNum === carrierId) return;

  const target = getPlayer(targetNum);
  if (!target) return;

  const isOnFire = (targetNum === gameState.onFirePlayerId);
  const probability = isOnFire ? 100 : calcPassProbability(carrierId, targetNum);
  const success = rollSuccess(probability);

  const fromX = gameState.ball.x;
  const fromY = gameState.ball.y;
  const toX = target.x;
  const toY = target.y - PLAYER_RADIUS - BALL_RADIUS - 4;
  const dist = Math.hypot(toX - fromX, toY - fromY);

  if (success) {
    gameState.ballFlight = {
      fromX, fromY, toX, toY,
      progress: 0,
      duration: dist / BALL_FLIGHT_SPEED,
      type: 'pass',
      onArrive() {
        gameState.ball.carrierId = targetNum;
        gameState.carrierHoldTime = 0;
        gameState.consecutivePasses++;
        syncBallToCarrier();
        if (targetNum === gameState.onFirePlayerId) {
          gameState.vikingStunTimer = 1.5;
        }
      },
    };
  } else {
    // Failed pass: determine if it was intercepted or just went wide
    const blocked = getPassBlockerPenalty(targetNum);
    const failReason = blocked > 0 && Math.random() < 0.6 ? 'Defender got the ball!' : 'Pass out of bounds!';

    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.hypot(dx, dy);
    // Deflect slightly to the side for visual variety
    const deflectAngle = (Math.random() - 0.5) * 0.6;
    const cos = Math.cos(deflectAngle);
    const sin = Math.sin(deflectAngle);
    const ndx = (dx / len) * cos - (dy / len) * sin;
    const ndy = (dx / len) * sin + (dy / len) * cos;
    const overshoot = 250;
    const missToX = toX + ndx * overshoot;
    const missToY = toY + ndy * overshoot;
    const missDist = Math.hypot(missToX - fromX, missToY - fromY);

    gameState.ballFlight = {
      fromX, fromY, toX: missToX, toY: missToY,
      progress: 0,
      duration: missDist / BALL_FLIGHT_SPEED,
      type: 'intercept',
      interceptPoint: dist / missDist, // when ball passes the target
      onArrive() {
        onPassFailed(failReason);
      },
    };
  }
}

function attemptShoot() {
  if (isInputLocked()) return;

  const carrierId = gameState.ball.carrierId;
  const isOnFire = (carrierId === gameState.onFirePlayerId);
  const probability = isOnFire ? 100 : calcShotProbability(carrierId);
  const success = rollSuccess(probability);

  const fromX = gameState.ball.x;
  const fromY = gameState.ball.y;

  if (success) {
    const toX = OPPONENT_GOAL.x + OPPONENT_GOAL.width / 2;
    const toY = OPPONENT_GOAL.y;
    const dist = Math.hypot(toX - fromX, toY - fromY);
    gameState.ballFlight = {
      fromX, fromY, toX, toY,
      progress: 0,
      duration: dist / BALL_FLIGHT_SPEED,
      type: 'shot',
      onArrive() { onGoalScored(); },
    };
  } else {
    // Missed shot: ball veers wide of the goal
    const side = Math.random() < 0.5 ? -1 : 1;
    const toX = OPPONENT_GOAL.x + (side < 0 ? -60 : OPPONENT_GOAL.width + 60);
    const toY = PITCH.y - 40;
    const dist = Math.hypot(toX - fromX, toY - fromY);
    gameState.ballFlight = {
      fromX, fromY, toX, toY,
      progress: 0,
      duration: dist / BALL_FLIGHT_SPEED,
      type: 'miss',
      onArrive() { onShotMissed(); },
    };
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
  if (gameState.status === 'levelSplash') {
    gameState.status = 'playing';
    return;
  }

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
  // Prevent hotkeys from firing when typing in an input or select
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === 'enter') {
    if (gameState.status === 'levelSplash') {
      gameState.status = 'playing';
      event.preventDefault();
      return;
    }
  }

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
    if (gameState.status === 'gameOver' || gameState.status === 'victory' || gameState.status === 'ready') {
      restartGame();
    }
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

function updateBallFlight(dt) {
  const flight = gameState.ballFlight;
  if (!flight) return;

  flight.progress += dt / flight.duration;

  if (flight.progress >= 1) {
    // Ball arrived
    gameState.ball.x = flight.toX;
    gameState.ball.y = flight.toY;
    const cb = flight.onArrive;
    gameState.ballFlight = null;
    cb();
    return;
  }

  const t = flight.progress;

  if (flight.type === 'intercept') {
    // Straight flight (no arc) — ball cut off by defender
    gameState.ball.x = flight.fromX + (flight.toX - flight.fromX) * t;
    gameState.ball.y = flight.fromY + (flight.toY - flight.fromY) * t;
    // Fade opacity stored on flight for drawBall to use
    if (t > flight.interceptPoint) {
      flight.opacity = Math.max(0.15, 1 - (t - flight.interceptPoint) / (1 - flight.interceptPoint));
    } else {
      flight.opacity = 1;
    }
  } else if (flight.type === 'miss') {
    // Shot going wide — slight curve outward
    gameState.ball.x = flight.fromX + (flight.toX - flight.fromX) * t;
    gameState.ball.y = flight.fromY + (flight.toY - flight.fromY) * t;
    // Spin/fade effect
    flight.opacity = Math.max(0.2, 1 - t * 0.6);
    flight.spin = (flight.spin || 0) + dt * 12;
  } else {
    // Normal arc for successful passes and shots
    const arcHeight = -60 * t * (1 - t);
    gameState.ball.x = flight.fromX + (flight.toX - flight.fromX) * t;
    gameState.ball.y = flight.fromY + (flight.toY - flight.fromY) * t + arcHeight;
    flight.opacity = 1;
  }
}

function updatePlayers(dt) {
  // On Fire timer logic
  if (gameState.status === 'playing' && !gameState.ballFlight) {
    gameState.onFireTimer -= dt;
    if (gameState.onFireTimer <= 0) {
      // Pick a random teammate to catch fire
      const availableIds = [1, 2, 3, 4, 5].filter(id => id !== gameState.ball.carrierId);
      gameState.onFirePlayerId = availableIds[Math.floor(Math.random() * availableIds.length)];
      gameState.onFireTimer = 5.0; // Next fire in exactly 5 seconds
    }
  }

  for (const player of gameState.players) {
    // The ball carrier stays still
    if (player.num === gameState.ball.carrierId) {
      player.x = player.baseX;
      player.y = player.baseY;
      continue;
    }

    // Evasion AI: calculate evasion vector
    let evadeX = 0;
    let evadeY = 0;

    // Viking evasion
    const vx = player.baseX - gameState.viking.x;
    const vy = player.baseY - gameState.viking.y;
    const vDist = Math.hypot(vx, vy);
    if (vDist < EVASION_RADIUS && vDist > 0) {
      evadeX += (vx / vDist) * (EVASION_RADIUS - vDist);
      evadeY += (vy / vDist) * (EVASION_RADIUS - vDist);
    }

    // Defender evasion
    for (const def of gameState.enemyDefenders) {
      const dx = player.baseX - def.x;
      const dy = player.baseY - def.y;
      const dDist = Math.hypot(dx, dy);
      if (dDist < EVASION_RADIUS && dDist > 0) {
        evadeX += (dx / dDist) * (EVASION_RADIUS - dDist);
        evadeY += (dy / dDist) * (EVASION_RADIUS - dDist);
      }
    }

    if (evadeX !== 0 || evadeY !== 0) {
      // Normalize and apply evasion speed
      const eLen = Math.hypot(evadeX, evadeY);
      player.baseX += (evadeX / eLen) * TEAMMATE_EVASION_SPEED * dt;
      player.baseY += (evadeY / eLen) * TEAMMATE_EVASION_SPEED * dt;

      // Clamp baseX and baseY to pitch so they don't run off the field
      player.baseX = Math.max(PITCH.x + PLAYER_RADIUS, Math.min(PITCH.x + PITCH.width - PLAYER_RADIUS, player.baseX));
      player.baseY = Math.max(PITCH.y + PLAYER_RADIUS, Math.min(PITCH.y + PITCH.height - PLAYER_RADIUS, player.baseY));
    } else {
      // No threats, spring back to original position
      const rx = player.originalX - player.baseX;
      const ry = player.originalY - player.baseY;
      const rDist = Math.hypot(rx, ry);
      if (rDist > 1) {
        const moveDist = Math.min(rDist, TEAMMATE_RETURN_SPEED * dt);
        player.baseX += (rx / rDist) * moveDist;
        player.baseY += (ry / rDist) * moveDist;
      }
    }

    // Figure-8 drift: different frequencies on X and Y for organic feel
    player.driftAngle += PLAYER_DRIFT_SPEED * dt;
    player.driftPhase += PLAYER_DRIFT_SPEED * 0.7 * dt;

    player.x = player.baseX + Math.cos(player.driftAngle) * PLAYER_DRIFT_RADIUS;
    player.y = player.baseY + Math.sin(player.driftPhase) * PLAYER_DRIFT_RADIUS * 0.6;

    // Clamp to pitch bounds
    player.x = Math.max(PITCH.x + PLAYER_RADIUS, Math.min(PITCH.x + PITCH.width - PLAYER_RADIUS, player.x));
    player.y = Math.max(PITCH.y + PLAYER_RADIUS, Math.min(PITCH.y + PITCH.height - PLAYER_RADIUS, player.y));
  }
}

function updateViking(dt) {
  if (gameState.vikingStunTimer > 0) {
    gameState.vikingStunTimer -= dt;
    return;
  }

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
      hideMessage();
      advanceLevel();
    }
    return true;
  }

  if (gameState.status === 'levelSplash') {
    // Wait for user to press ENTER
    return true;
  }

  return false;
}

function update(dt) {
  if (gameState.status === 'victory') {
    updateConfetti(dt);
    return;
  }

  if (updateFlashStates(dt)) return;

  gameState.levelTime += dt;
  gameState.totalTime += dt;
  if (!gameState.ballFlight) {
    gameState.carrierHoldTime += dt;
  }
  updateHud();

  updateBallFlight(dt);
  updatePlayers(dt);
  syncBallToCarrier();
  updateViking(dt);
  updateEnemyDefenders(dt);
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

// ─── Drawing: Enemy Defenders ────────────────────────────────────────────────

function drawEnemyDefenders() {
  for (const def of gameState.enemyDefenders) {
    // Draw link line to covered player
    const target = getPlayer(def.coversPlayer);
    if (target) {
      const opacity = 0.2 * ((def.effectivePenalty ?? def.blockPenalty) / def.blockPenalty);
      ctx.strokeStyle = `rgba(248, 81, 73, ${opacity})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(def.x, def.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(def.x, def.y + def.radius * 0.5, def.radius * 0.8, def.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body base / Flag Jersey
    const flagImg = flagImages[NATIONS[gameState.level - 1].code];
    if (flagImg && flagImg.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(def.x, def.y, def.radius, 0, Math.PI * 2);
      ctx.clip();

      const w = def.radius * 3;
      const h = def.radius * 2;
      ctx.drawImage(flagImg, def.x - w / 2, def.y - h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(def.x, def.y, def.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${def.radius}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', def.x, def.y);
    }

    // Border on top
    ctx.beginPath();
    ctx.arc(def.x, def.y, def.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ff8888';
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('DEF', def.x, def.y + def.radius + 3);
  }
}

// ─── Drawing: Entities ───────────────────────────────────────────────────────

function drawPlayer(player) {
  const color = PLAYER_COLORS[player.num - 1];
  const isCarrier = player.num === gameState.ball.carrierId;
  const isOnFire = player.num === gameState.onFirePlayerId;

  if (isOnFire) {
    // Pulse animation based on totalTime
    const pulse = 1.0 + Math.sin(gameState.totalTime * 8) * 0.15;
    const fireAura = ctx.createRadialGradient(player.x, player.y, PLAYER_RADIUS * 0.5, player.x, player.y, PLAYER_RADIUS * 2.2 * pulse);
    fireAura.addColorStop(0, 'rgba(255, 200, 0, 0.8)');
    fireAura.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
    fireAura.addColorStop(1, 'rgba(255, 69, 0, 0)');
    ctx.fillStyle = fireAura;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

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

  if (vikingImageLoaded) {
    const size = radius * 2.8;
    ctx.drawImage(vikingImage, x - size / 2, y - size * 0.6, size, size);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Flag Jersey
    const flagImg = flagImages[NATIONS[gameState.level - 1].code];
    if (flagImg && flagImg.complete) {
      const w = radius * 1.4;
      const h = radius * 1.0;
      ctx.drawImage(flagImg, x - w / 2, y - h / 2, w, h);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${radius}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x, y);
    }
  }

  ctx.fillStyle = '#ffcccc';
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('VIKING', x, y + radius + 4);
}

function drawBall() {
  const { x, y, radius } = gameState.ball;
  const flight = gameState.ballFlight;
  const opacity = flight ? (flight.opacity ?? 1) : 1;
  const spin = flight ? (flight.spin ?? 0) : 0;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.8, radius * 0.7, radius * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soccer ball image (or fallback emoji)
  const size = radius * 2.2;
  if (ballImageLoaded) {
    ctx.translate(x, y);
    if (spin) ctx.rotate(spin);
    ctx.drawImage(ballImage, -size / 2, -size / 2, size, size);
  } else {
    ctx.font = `${radius * 2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (spin) {
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.fillText('\u26BD', 0, 0);
    } else {
      ctx.fillText('\u26BD', x, y);
    }
  }

  ctx.restore();
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

// ─── Drawing: Level Splash ───────────────────────────────────────────────────

function drawLevelSplash() {
  // Dark backdrop
  ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const nation = NATIONS[gameState.level - 1];
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // Level number
  ctx.fillStyle = '#8b949e';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`ROUND ${gameState.level} OF ${MAX_LEVEL}`, cx, cy - 70);

  // Nation flag (large)
  const flagImg = flagImages[nation.code];
  if (flagImg && flagImg.complete) {
    ctx.drawImage(flagImg, cx - 45, cy - 40, 90, 60);
  }

  // Nation name
  ctx.fillStyle = '#f0f6fc';
  ctx.font = 'bold 32px "Segoe UI", sans-serif';
  ctx.fillText(`vs. ${nation.name}`, cx, cy + 50);

  // Viking speed warning
  const speed = getVikingSpeedForLevel(gameState.level);
  const speedPct = Math.round((speed / VIKING_BASE_SPEED) * 100);
  ctx.fillStyle = '#f85149';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.fillText(`Viking Speed: ${speedPct}%`, cx, cy + 85);

  // Defenders count
  const defCount = Math.floor(gameState.level / 3);
  if (defCount > 0) {
    ctx.fillStyle = '#d29922';
    ctx.fillText(`Enemy Defenders: ${defCount}`, cx, cy + 105);
  }

  // Press Enter prompt
  ctx.fillStyle = '#58a6ff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText('Press ENTER or Click to Continue', cx, cy + 155);
}

// ─── Drawing: Game Over Screen ───────────────────────────────────────────────

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(13, 17, 23, 0.92)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cx = CANVAS_W / 2;

  if (gameOverVideo.readyState >= 2) {
    const vWidth = PITCH.width;
    const vHeight = (gameOverVideo.videoHeight / gameOverVideo.videoWidth) * vWidth || 450;
    // Center it vertically and slightly lower
    const videoY = CANVAS_H / 2 - vHeight / 2 + 40;
    
    ctx.save();
    ctx.globalAlpha = 0.6; // Slightly dim so text remains readable
    ctx.drawImage(gameOverVideo, cx - vWidth / 2, videoY, vWidth, vHeight);
    ctx.restore();
  }

  let y = CANVAS_H / 2 - 120;

  // Skull art
  ctx.font = '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💀', cx, y);
  y += 60;

  // GAME OVER title
  ctx.fillStyle = '#f85149';
  ctx.font = 'bold 48px "Segoe UI", sans-serif';
  ctx.fillText('GAME OVER', cx, y);
  y += 40;

  // Subtitle
  ctx.fillStyle = '#8b949e';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.fillText('The Viking claims victory!', cx, y);
  y += 50;

  // Stats
  ctx.fillStyle = '#c9d1d9';
  ctx.font = '16px "Segoe UI", sans-serif';
  const nation = NATIONS[gameState.level - 1];
  const text = `Reached: Round ${gameState.level} — ${nation.name}`;
  ctx.fillText(text, cx, y);

  const flagImg = flagImages[nation.code];
  if (flagImg && flagImg.complete) {
    const textW = ctx.measureText(text).width;
    ctx.drawImage(flagImg, cx + textW / 2 + 8, y - 8, 20, 15);
  }
  y += 28;
  ctx.fillText(`Time Elapsed: ${formatTime(gameState.totalTime)}`, cx, y);
  y += 50;

  // Restart prompt
  ctx.fillStyle = '#58a6ff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText('Press R to Restart', cx, y);
}

// ─── Drawing: Victory Screen ─────────────────────────────────────────────────

function drawTrophy(cx, cy, scale) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Cup body
  const cupGrad = ctx.createLinearGradient(-35, -50, 35, 30);
  cupGrad.addColorStop(0, '#ffd700');
  cupGrad.addColorStop(0.5, '#ffec80');
  cupGrad.addColorStop(1, '#daa520');
  ctx.fillStyle = cupGrad;

  ctx.beginPath();
  ctx.moveTo(-35, -50);
  ctx.quadraticCurveTo(-40, 0, -20, 30);
  ctx.lineTo(20, 30);
  ctx.quadraticCurveTo(40, 0, 35, -50);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Left handle
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(-45, -20, 18, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();

  // Right handle
  ctx.beginPath();
  ctx.arc(45, -20, 18, Math.PI * 0.5, -Math.PI * 0.5);
  ctx.stroke();

  // Stem
  ctx.fillStyle = '#daa520';
  ctx.fillRect(-8, 30, 16, 25);

  // Base
  const baseGrad = ctx.createLinearGradient(-30, 55, 30, 70);
  baseGrad.addColorStop(0, '#daa520');
  baseGrad.addColorStop(1, '#b8860b');
  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.roundRect(-30, 55, 60, 15, 3);
  ctx.fill();
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Star on cup
  drawStar(0, -15, 12, 5, '#ffffff');

  // Shine highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.ellipse(-12, -25, 6, 20, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawStar(cx, cy, r, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawVictoryScreen() {
  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Radial glow
  const cx = CANVAS_W / 2;
  const glow = ctx.createRadialGradient(cx, 200, 30, cx, 250, 300);
  glow.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
  glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Trophy
  drawTrophy(cx, 180, 1.8);

  let y = 340;

  // Title
  const titleGrad = ctx.createLinearGradient(cx - 150, y, cx + 150, y);
  titleGrad.addColorStop(0, '#ffd700');
  titleGrad.addColorStop(0.5, '#ffec80');
  titleGrad.addColorStop(1, '#daa520');
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 40px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WORLD CHAMPION!', cx, y);
  y += 45;

  // Score breakdown
  const br = gameState.scoreBreakdown;
  if (br) {
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(`Base Score: ${br.base.toLocaleString()}`, cx, y);
    y += 24;
    ctx.fillStyle = br.timeBonus > 0 ? '#3fb950' : '#8b949e';
    ctx.fillText(`Time Bonus: +${br.timeBonus.toLocaleString()}  (${formatTime(gameState.totalTime)} elapsed)`, cx, y);
    y += 24;
    ctx.fillStyle = '#f85149';
    ctx.fillText(`Lives Bonus: +${br.livesBonus.toLocaleString()}  (${gameState.lives} ♥ remaining)`, cx, y);
    y += 36;

    // Final score
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.fillText(`FINAL SCORE: ${br.total.toLocaleString()}`, cx, y);
    y += 50;
  }

  // Confetti
  drawConfetti();

  // Restart prompt
  ctx.fillStyle = '#58a6ff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Press R to Play Again', cx, y + 10);
}

// ─── Main Loop ─────────────────────────────────────────────────────────────────

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Full-screen overlays take over rendering
  if (gameState.status === 'gameOver') {
    drawPitch();
    drawGameOverScreen();
    return;
  }

  if (gameState.status === 'victory') {
    drawVictoryScreen();
    return;
  }

  drawPitch();
  drawShootZone();
  drawEnemyDefenders();

  for (const player of gameState.players) {
    drawPlayer(player);
  }

  drawPassProbabilities();
  drawViking();
  drawBall();
  drawFlashOverlay();

  if (gameState.status === 'levelSplash') {
    drawLevelSplash();
  }
}

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  const activeStates = ['playing', 'hitFlash', 'goalFlash', 'levelSplash', 'victory'];
  if (activeStates.includes(gameState.status)) {
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
  btnRules.addEventListener('click', () => {
    rulesModal.classList.remove('hidden');
  });
  btnLeaderboard.addEventListener('click', () => {
    modalTitle.textContent = 'Global Leaderboard';
    modalTitle.style.color = '#58a6ff';
    leaderboardModal.classList.remove('hidden');
    submitSection.classList.add('hidden');
    leaderboardSection.classList.remove('hidden');
    showLeaderboard();
  });
  btnCloseRules.addEventListener('click', () => {
    rulesModal.classList.add('hidden');
  });
  btnPause.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', restartGame);

  btnSubmitScore.addEventListener('click', async () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    btnSubmitScore.disabled = true;
    btnSubmitScore.textContent = 'Submitting...';

    if (window.submitScore) {
      await window.submitScore(name, countrySelect.value, gameState.finalScore, gameState.scoreBreakdown);
    }

    // Hide form, show leaderboard
    submitSection.classList.add('hidden');
    leaderboardSection.classList.remove('hidden');

    await showLeaderboard();

    btnSubmitScore.disabled = false;
    btnSubmitScore.textContent = 'Submit Score';
  });

  btnCloseModal.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
  });

  requestAnimationFrame(gameLoop);
}

async function showLeaderboard() {
  if (!window.fetchLeaderboard) return;

  leaderboardList.innerHTML = '<li>Loading...</li>';
  const scores = await window.fetchLeaderboard();
  leaderboardList.innerHTML = '';

  if (scores.length === 0) {
    leaderboardList.innerHTML = '<li>No scores yet!</li>';
  } else {
    scores.forEach((s, index) => {
      let flagStr = s.country ? `(${s.country.toUpperCase()})` : '';
      const opt = Array.from(countrySelect.options).find(o => o.value === s.country);
      if (opt) {
        flagStr = opt.textContent.split(' ')[0];
      }

      leaderboardList.innerHTML += `
        <li>
          <span class="lb-rank">#${index + 1}</span>
          <span class="lb-name">${flagStr} ${s.username}</span>
          <span class="lb-score">${s.score.toLocaleString()}</span>
        </li>
      `;
    });
  }
}

init();

// Initialize global tries subscription
if (window.subscribeToGlobalTries && globalTriesCount) {
  window.subscribeToGlobalTries((tries) => {
    globalTriesCount.textContent = tries.toLocaleString();
  });
}
