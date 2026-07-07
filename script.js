// Game configuration and state variables
const ROWS = 6;                  // Number of grid rows
const COLS = 3;                  // Number of grid columns (matches CSS)
const WIN_SCORE = 1000;          // Score needed to beat the game
let gameActive = false;
let playerCol = Math.floor(COLS / 2); // Player's column (always on bottom row)
let obstacles = [];              // Array of {id, element, row, col, fading}
let spawnInterval = null;
let gameMode = 'easy';
let animationRafId = null;
let score = 0;
let checkpointTimeout = null;
let motivationInterval = null;
let motivationTimeout = null;
let obstacleIdCounter = 0;

// Difficulty parameters (ms) — constant for the whole game, no ramp.
const startSpawnMs = 1300;
const startMoveMs = 520;
let spawnMs = startSpawnMs;
let moveMs = startMoveMs;
const checkpointSeconds = 100; // configurable checkpoint interval in seconds

// Rows-from-top that count as a hit for the row-based collision check.
const collisionRow = ROWS - 2;

const MIDDLE_COL = Math.floor(COLS / 2);

// --- DOM / rendering helpers ---
function createGrid() {
  const grid = document.querySelector('.game-grid');
  if (!grid) return;
  grid.querySelectorAll('.grid-cell, #player-element').forEach(el => el.remove());

  const total = ROWS * COLS;
  for (let i = 0; i < total; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset.index = i;
    grid.appendChild(cell);
  }

  const playerElement = document.createElement('div');
  playerElement.id = 'player-element';
  playerElement.className = 'player-animated';
  grid.appendChild(playerElement);
}

function getGridDimensions() {
  const grid = document.querySelector('.game-grid');
  const gridRect = grid.getBoundingClientRect();
  const cellWidth = gridRect.width / COLS;
  const cellHeight = gridRect.height / ROWS;
  return { cellWidth, cellHeight, gridWidth: gridRect.width, gridHeight: gridRect.height };
}

function positionObstacleElement(element, col, row) {
  const { cellWidth, cellHeight, gridWidth, gridHeight } = getGridDimensions();
  const left = (col * cellWidth + cellWidth / 2) / gridWidth * 100;
  const top = (row * cellHeight + cellHeight / 2) / gridHeight * 100;
  element.style.left = left + '%';
  element.style.top = top + '%';
}

function positionPlayerElement(col) {
  const playerElement = document.getElementById('player-element');
  if (!playerElement) return;
  const { cellWidth, cellHeight, gridWidth, gridHeight } = getGridDimensions();
  const left = (col * cellWidth + cellWidth / 2) / gridWidth * 100;
  const top = ((ROWS - 1) * cellHeight) / gridHeight * 100;
  playerElement.style.left = left + '%';
  playerElement.style.top = top + '%';
}

function createObstacle(col) {
  const obstacle = document.createElement('div');
  obstacle.className = 'obstacle-animated';
  const grid = document.querySelector('.game-grid');
  grid.appendChild(obstacle);

  const id = obstacleIdCounter++;

  const { cellHeight, gridHeight, gridWidth } = getGridDimensions();
  const gridRect = document.querySelector('.game-grid').getBoundingClientRect();

  const startCenterY = gridRect.top + (-0.5) * cellHeight;
  const endCenterY = gridRect.top + (ROWS + 0.5) * cellHeight;
  const distancePx = endCenterY - startCenterY;

  const speedPxPerMs = cellHeight / moveMs; 
  const durationMs = Math.max(100, Math.round(distancePx / speedPxPerMs));

  positionObstacleElement(obstacle, col, -1);
  obstacle.style.transitionDuration = `${durationMs}ms, 150ms`;
  void obstacle.offsetHeight;
  
  requestAnimationFrame(() => {
    const left = (col * (gridWidth / COLS) + (gridWidth / COLS) / 2) / gridWidth * 100;
    const top = ((ROWS + 0.5) * cellHeight) / gridHeight * 100;
    obstacle.style.left = left + '%';
    obstacle.style.top = top + '%';
  });

  return { id, element: obstacle, row: -1, col, fading: false };
}

// Animation loop: handles real-time position updates, scoring, and collisions
function animationLoop() {
  if (!gameActive) return;
  const grid = document.querySelector('.game-grid');
  if (!grid) return;
  const gridRect = grid.getBoundingClientRect();
  const { cellHeight, gridHeight } = getGridDimensions();

  const playerEl = document.getElementById('player-element');
  const playerRect = playerEl && playerEl.getBoundingClientRect();

  for (const o of obstacles) {
    if (o.fading) continue;
    const el = o.element;
    const rect = el.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const relativeY = centerY - gridRect.top;
    
    o.row = Math.floor(relativeY / cellHeight);

    // 1. Grid/Row Collision check
    if (o.col === playerCol && (o.row === collisionRow || o.row === collisionRow + 1)) {
      endGame('You hit a rock! Game over.');
      return;
    }

    // 2. Bounding-box overlap fallback check
    if (playerRect && rectsOverlap(playerRect, rect)) {
      endGame('You hit a rock! Game over.');
      return;
    }

    // 3. Reliable Scoring & Fade-out point when rock leaves the screen
    if (o.row >= ROWS && !o.fading) {
      o.fading = true;
      el.classList.add('fade-out');
      setTimeout(() => { el.remove(); }, 500);
      addScore(10);
    }
  }

  obstacles = obstacles.filter(o => !o.fading);
  positionPlayerElement(playerCol);
  animationRafId = requestAnimationFrame(animationLoop);
}

function renderGrid() {
  positionPlayerElement(playerCol);
}

// --- Scoring ---
function addScore(amount) {
  score += amount;
  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = score;
  updateTank();
  if (score >= WIN_SCORE) winGame();
}

function updateTank() {
  const fill = document.getElementById('tank-fill');
  if (!fill) return;
  const pct = Math.min(100, (score / WIN_SCORE) * 100);
  fill.style.width = pct + '%';
}

function rectsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function movePlayer(direction) {
  if (!gameActive) return;
  if (direction === 'left' && playerCol > 0) playerCol -= 1;
  if (direction === 'right' && playerCol < COLS - 1) playerCol += 1;
  renderGrid();
}

const minSpawnRowGap = 2;

function columnIsClear(col) {
  return !obstacles.some(o => !o.fading && o.col === col && o.row < minSpawnRowGap);
}

// FIXED: Perfectly balanced spawning logic.
// Instead of penalizing adjacent columns, we check if there's any active rock mid-screen (rows 1 to 3).
// If there is, we force the new rock to spawn in that EXACT same column.
// Why? This stacks rocks sequentially in one lane, leaving the other two lanes 100% wide open for escaping corners!
function wouldTrapPlayer(col) {
  const midScreenRock = obstacles.find(o => !o.fading && o.row >= 1 && o.row <= 3);
  
  if (midScreenRock) {
    return col !== midScreenRock.col;
  }
  
  return false;
}

function spawnObstacle() {
  if (!gameActive) return;
  const availableCols = [];
  for (let c = 0; c < COLS; c++) {
    if (columnIsClear(c) && !wouldTrapPlayer(c)) availableCols.push(c);
  }
  if (availableCols.length === 0) return;

  const firstCol = availableCols[Math.floor(Math.random() * availableCols.length)];
  const colsToSpawn = [firstCol];

  if (gameMode === 'hard') {
    const secondCol = availableCols[Math.floor(Math.random() * availableCols.length)];
    if (secondCol !== firstCol) colsToSpawn.push(secondCol);
  }

  colsToSpawn.forEach((col) => {
    obstacles.push(createObstacle(col));
  });
}

function setGameMode(mode) {
  gameMode = mode;
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

function setupModeSelector() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setGameMode(btn.dataset.mode || 'easy'));
  });
  setGameMode(gameMode);
}

// --- UI / controls / lifecycle ---
const motivationalMessages = [
  'charity: water helps bring clean water to communities around the world.',
  'Every drop matters — safe water changes lives every day.',
  'Local partners make lasting water projects possible.',
  'Clean water means healthier homes, schools, and futures.'
];

function setAchievement(text) {
  const el = document.getElementById('achievements');
  if (el) el.textContent = text;
}

function showMotivationalMessage() {
  if (!gameActive) return;
  const message = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
  setAchievement(message);
  clearTimeout(motivationTimeout);
  motivationTimeout = setTimeout(() => {
    if (gameActive) {
      const el = document.getElementById('achievements');
      if (el && el.textContent === message) {
        setAchievement('');
      }
    }
  }, 4000);
}

function scheduleMotivationalMessages() {
  clearInterval(motivationInterval);
  motivationInterval = setInterval(() => {
    showMotivationalMessage();
  }, 10000);
}

function clearAllObstacles() {
  obstacles.forEach(o => o.element.remove());
  obstacles = [];
}

function hideOverlays() {
  ['start-overlay', 'game-over-overlay', 'win-overlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function startGame() {
  clearInterval(spawnInterval);
  clearTimeout(checkpointTimeout);

  hideOverlays();
  clearAllObstacles();
  obstacleIdCounter = 0;
  playerCol = Math.floor(COLS / 2);
  score = 0;
  spawnMs = startSpawnMs;
  moveMs = startMoveMs;

  createGrid();
  renderGrid();
  document.getElementById('score').textContent = score;
  updateTank();
  setAchievement(gameMode === 'hard' ? 'Hard mode: dodge the rocks.' : 'Easy mode: dodge the rocks.');

  gameActive = true;
  spawnInterval = setInterval(spawnObstacle, spawnMs);
  animationRafId = requestAnimationFrame(animationLoop);
  scheduleMotivationalMessages();

  function scheduleCheckpoint() {
    clearTimeout(checkpointTimeout);
    checkpointTimeout = setTimeout(() => {
      setAchievement('Checkpoint reached!');
      setTimeout(() => { if (gameActive) setAchievement(''); }, 4000);
      scheduleCheckpoint();
    }, checkpointSeconds * 1000);
  }
  scheduleCheckpoint();
}

function stopTimers() {
  gameActive = false;
  clearInterval(spawnInterval);
  clearTimeout(checkpointTimeout);
  clearInterval(motivationInterval);
  clearTimeout(motivationTimeout);
  if (animationRafId) cancelAnimationFrame(animationRafId);
}

function endGame(message) {
  stopTimers();
  setAchievement(message || 'Game over.');
  const overlay = document.getElementById('game-over-overlay');
  const finalScoreEl = document.getElementById('final-score');
  if (finalScoreEl) finalScoreEl.textContent = score;
  if (overlay) overlay.classList.remove('hidden');
}

function winGame() {
  stopTimers();
  setAchievement('You reached the goal! Clean water delivered.');
  const overlay = document.getElementById('win-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function setupTouchControls() {
  const controls = document.querySelector('.touch-controls');
  if (!controls) return;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) controls.classList.add('visible');
  document.getElementById('move-left')?.addEventListener('click', () => movePlayer('left'));
  document.getElementById('move-right')?.addEventListener('click', () => movePlayer('right'));
  const grid = document.querySelector('.game-grid');
  let touchStartX = null;
  grid?.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  grid?.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 30) movePlayer(dx > 0 ? 'right' : 'left');
    touchStartX = null;
  }, { passive: true });
}

// Controls
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') movePlayer('left');
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') movePlayer('right');
  else if (e.key === 'Enter' && !gameActive) startGame();
});
document.getElementById('start-game')?.addEventListener('click', startGame);
document.getElementById('retry-game')?.addEventListener('click', startGame);
document.getElementById('play-again')?.addEventListener('click', startGame);
window.addEventListener('resize', renderGrid);
setupModeSelector();
setupTouchControls();