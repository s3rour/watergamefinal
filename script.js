// Game configuration and state variables
const ROWS = 6;                  // Number of grid rows
const COLS = 3;                  // Number of grid columns (matches CSS)
let gameActive = false;
let playerCol = Math.floor(COLS / 2); // Player's column (always on bottom row)
let obstacles = [];              // Array of {row, col} falling obstacles
let spawnInterval = null;
let moveInterval = null;
let score = 0;
let difficultyInterval = null;
let checkpointInterval = null;
let checkpointTimeout = null;

// Difficulty parameters (ms)
let spawnMs = 1000;
let moveMs = 500;
const minSpawnMs = 200;
const minMoveMs = 120;
const difficultyStepMs = 15000; // every 15s increase difficulty
let elapsedSeconds = 0;
let checkpoints = 0;
const checkpointSeconds = 100; // configurable checkpoint interval in seconds

function createGrid() {
  const grid = document.querySelector('.game-grid');
  grid.innerHTML = '';
  const total = ROWS * COLS;
  for (let i = 0; i < total; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset.index = i;
    grid.appendChild(cell);
  }
}

function renderGrid() {
  const cells = document.querySelectorAll('.grid-cell');
  cells.forEach(cell => (cell.innerHTML = ''));

  // Draw obstacles
  obstacles.forEach(({ row, col }) => {
    if (row < 0 || row >= ROWS) return;
    const idx = row * COLS + col;
    const cell = cells[idx];
    if (!cell) return;
    cell.innerHTML = `<div class="obstacle"></div>`;
  });

  // Draw player on the bottom row
  const playerRow = ROWS - 1;
  const playerIdx = playerRow * COLS + playerCol;
  const playerCell = cells[playerIdx];
  if (playerCell) {
    // If obstacle is also here, player is rendered on top
    playerCell.innerHTML = playerCell.innerHTML + `<div class="player"></div>`;
  }
}

function spawnObstacle() {
  if (!gameActive) return;
  const col = Math.floor(Math.random() * COLS);
  obstacles.push({ row: 0, col });
  renderGrid();
}

function moveObstaclesDown() {
  if (!gameActive) return;
  obstacles = obstacles.map(o => ({ row: o.row + 1, col: o.col }));
  // Check for collisions: any obstacle that moved into the player's cell
  for (const o of obstacles) {
    if (o.row === ROWS - 1 && o.col === playerCol) {
      const el = document.getElementById('achievements');
      if (el) el.textContent = 'You hit an obstacle! Game Over.';
      renderGrid();
      endGame();
      // leave the final state displayed
      return;
    }
  }

  // Remove any obstacles that moved past the bottom row
  obstacles = obstacles.filter(o => o.row < ROWS);
  score += 1;
  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = score;
  renderGrid();
}

function handleKey(e) {
  if (!gameActive) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    if (playerCol > 0) playerCol -= 1;
    renderGrid();
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    if (playerCol < COLS - 1) playerCol += 1;
    renderGrid();
  }
}

function startGame() {
  if (gameActive) return;
  const el = document.getElementById('achievements');
  if (el) el.textContent = 'Game started!';
  gameActive = true;
  obstacles = [];
  playerCol = Math.floor(COLS / 2);
  createGrid();
  renderGrid();
  score = 0;
  document.getElementById('score').textContent = score;
  // Spawn/move intervals based on difficulty variables
  spawnInterval = setInterval(spawnObstacle, spawnMs);
  moveInterval = setInterval(moveObstaclesDown, moveMs);

  // Difficulty increases over time
  difficultyInterval = setInterval(() => {
    // increase elapsed time
    elapsedSeconds += difficultyStepMs / 1000;
    // tighten spawn and move intervals
    spawnMs = Math.max(minSpawnMs, spawnMs - 50);
    moveMs = Math.max(minMoveMs, moveMs - 25);
    // reset intervals with new speeds
    clearInterval(spawnInterval);
    spawnInterval = setInterval(spawnObstacle, spawnMs);
    clearInterval(moveInterval);
    moveInterval = setInterval(moveObstaclesDown, moveMs);
    // optionally show minor feedback
    const el = document.getElementById('achievements');
    if (el) {
      el.textContent = `Difficulty increased to spawn ${spawnMs}ms, move ${moveMs}ms`;
      setTimeout(() => { el.textContent = ''; }, 2000);
    }
  }, difficultyStepMs);

  // Schedule first checkpoint using timeout (more reliable and configurable)
  function scheduleCheckpoint() {
    clearTimeout(checkpointTimeout);
    checkpointTimeout = setTimeout(() => {
      checkpoints += 1;
      const el = document.getElementById('achievements');
      const msg = `Checkpoint reached! (${checkpoints})`;
      console.log(msg);
      if (el) {
        el.textContent = msg;
        setTimeout(() => { el.textContent = ''; }, 4000);
      }
      // schedule next
      scheduleCheckpoint();
    }, checkpointSeconds * 1000);
  }
  scheduleCheckpoint();
}

function endGame() {
  gameActive = false;
  clearInterval(spawnInterval);
  clearInterval(moveInterval);
  clearInterval(difficultyInterval);
  clearInterval(checkpointInterval);
  clearTimeout(checkpointTimeout);
  document.getElementById('score').textContent = score;
}

// Controls
window.addEventListener('keydown', handleKey);
document.getElementById('start-game').addEventListener('click', startGame);
