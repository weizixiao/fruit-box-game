const {
  BOARD_COLUMNS,
  BOARD_ROWS,
  ROUND_SECONDS,
  clearSelection,
  createSolvableBoard,
  dailyBoardSeed,
  findAvailableMove,
  findCertifiedMove,
  formatTime,
  inspectSelection,
  normalizeSelection
} = window.FruitBoxEngine;

const TOTAL_APPLES = BOARD_COLUMNS * BOARD_ROWS;
const boardElement = document.querySelector("#board");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const overlayAction = document.querySelector("#overlay-action");
const scoreElement = document.querySelector("#score");
const timerElement = document.querySelector("#timer");
const timerBar = document.querySelector("#timer-bar");
const bestElement = document.querySelector("#best");
const feedback = document.querySelector("#feedback");
const gameShell = document.querySelector(".game-shell");
const hintButton = document.querySelector("#hint");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const paleButton = document.querySelector("#pale");
const soundButton = document.querySelector("#sound");

let currentSeed = dailyBoardSeed();
let game = createSolvableBoard(currentSeed);
let status = "intro";
let score = 0;
let remainingMs = ROUND_SECONDS * 1000;
let deadline = 0;
let drag = null;
let keyboardRange = null;
let hint = null;
let hintTimer = null;
let soundOn = true;

const savedBest = Number(localStorage.getItem("fruitbox-best-score") || 0);
let bestScore = Number.isFinite(savedBest) ? savedBest : 0;
bestElement.textContent = String(bestScore);

function setFeedback(message) { feedback.textContent = message; }

function tone(kind) {
  if (!soundOn || !(window.AudioContext || window.webkitAudioContext)) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = kind === "clear" ? 620 : kind === "complete" ? 820 : 180;
  gain.gain.setValueAtTime(.055, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + .13);
  oscillator.addEventListener("ended", () => context.close());
}

function renderBoard() {
  boardElement.replaceChildren();
  for (const apple of game.board) {
    const cell = document.createElement("span");
    cell.className = `cell${apple.active ? "" : " cleared"}`;
    cell.dataset.row = apple.row;
    cell.dataset.column = apple.column;
    cell.dataset.value = apple.value;
    cell.dataset.active = String(apple.active);
    if (apple.active) {
      const value = document.createElement("b");
      value.textContent = String(apple.value);
      cell.append(value);
    }
    boardElement.append(cell);
  }
  renderSelection();
  scoreElement.innerHTML = `${score}<small>/${TOTAL_APPLES}</small>`;
  bestElement.textContent = String(Math.max(bestScore, score));
}

function activeSelection() {
  if (drag) return normalizeSelection(drag.start, drag.end);
  if (keyboardRange) {
    return {
      top: Math.min(keyboardRange.anchor.y, keyboardRange.focus.y),
      right: Math.max(keyboardRange.anchor.x, keyboardRange.focus.x) + 1,
      bottom: Math.max(keyboardRange.anchor.y, keyboardRange.focus.y) + 1,
      left: Math.min(keyboardRange.anchor.x, keyboardRange.focus.x)
    };
  }
  return hint;
}

function renderSelection() {
  const previous = boardElement.querySelector(".selection");
  if (previous) previous.remove();
  const selection = activeSelection();
  const selected = new Set();
  let inspected = { apples: [], sum: 0, count: 0 };
  if (selection) {
    inspected = inspectSelection(game.board, selection);
    inspected.apples.forEach((apple) => selected.add(apple.id));
    const box = document.createElement("div");
    box.className = `selection${inspected.sum === 10 ? " valid" : ""}${hint ? " hint" : ""}`;
    box.style.left = `${selection.left / BOARD_COLUMNS * 100}%`;
    box.style.top = `${selection.top / BOARD_ROWS * 100}%`;
    box.style.width = `${(selection.right - selection.left) / BOARD_COLUMNS * 100}%`;
    box.style.height = `${(selection.bottom - selection.top) / BOARD_ROWS * 100}%`;
    const sum = document.createElement("span");
    sum.textContent = String(inspected.sum);
    box.append(sum);
    boardElement.append(box);
  }
  boardElement.querySelectorAll(".cell").forEach((cell, id) => cell.classList.toggle("selected", selected.has(id)));
  return inspected;
}

function setStatus(nextStatus) {
  status = nextStatus;
  const playing = status === "playing";
  hintButton.disabled = !playing;
  pauseButton.disabled = status !== "playing" && status !== "paused";
  pauseButton.innerHTML = status === "paused" ? "<span aria-hidden=\"true\">▶</span> Resume" : "<span aria-hidden=\"true\">Ⅱ</span> Pause";
  if (status === "intro") {
    overlay.classList.remove("is-hidden");
    overlayTitle.textContent = "Ready?";
    overlayCopy.textContent = "Drag a rectangle around apples whose numbers add up to 10.";
    overlayAction.innerHTML = "<span aria-hidden=\"true\">▶</span> Start 120-second round";
  } else if (status === "paused") {
    overlay.classList.remove("is-hidden");
    overlayTitle.textContent = "Game paused";
    overlayCopy.textContent = "The clock is stopped. Continue when you are ready.";
    overlayAction.innerHTML = "<span aria-hidden=\"true\">▶</span> Resume game";
  } else if (status === "complete" || status === "timeup") {
    overlay.classList.remove("is-hidden");
    overlayTitle.textContent = status === "complete" ? "All clear!" : "Time's up";
    overlayCopy.textContent = status === "complete" ? `You cleared all 170 apples in ${formatTime(ROUND_SECONDS * 1000 - remainingMs)}.` : `You cleared ${score} / ${TOTAL_APPLES} apples.`;
    overlayAction.innerHTML = "<span aria-hidden=\"true\">↻</span> Play again";
  } else {
    overlay.classList.add("is-hidden");
  }
  boardElement.tabIndex = playing ? 0 : -1;
  if (playing) requestAnimationFrame(() => boardElement.focus());
}

function beginRound() {
  currentSeed = dailyBoardSeed();
  game = createSolvableBoard(currentSeed);
  score = 0;
  remainingMs = ROUND_SECONDS * 1000;
  deadline = Date.now() + remainingMs;
  drag = null;
  keyboardRange = null;
  hint = null;
  renderBoard();
  setFeedback("Go! Select numbers that add up to exactly 10.");
  setStatus("playing");
}

function pointFromEvent(event) {
  const rect = boardElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(BOARD_COLUMNS, (event.clientX - rect.left) / rect.width * BOARD_COLUMNS)),
    y: Math.max(0, Math.min(BOARD_ROWS, (event.clientY - rect.top) / rect.height * BOARD_ROWS))
  };
}

function applySelection(selection) {
  const inspected = inspectSelection(game.board, selection);
  const result = clearSelection(game.board, selection);
  drag = null;
  keyboardRange = null;
  hint = null;
  if (!result.cleared) {
    setFeedback(`Not cleared: this selection totals ${inspected.sum}. It must equal 10.`);
    tone("miss");
    renderSelection();
    return;
  }
  game = { ...game, board: result.board };
  score += result.cleared;
  setFeedback(`Cleared ${result.cleared} apples. Score: ${score} / ${TOTAL_APPLES}.`);
  renderBoard();
  if (score === TOTAL_APPLES) {
    remainingMs = Math.max(0, deadline - Date.now());
    setStatus("complete");
    tone("complete");
    saveBest();
  } else tone("clear");
}

function saveBest() {
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("fruitbox-best-score", String(bestScore));
  }
}

function showHint() {
  if (status !== "playing") return;
  hint = findCertifiedMove(game.board, game.solution) || findAvailableMove(game.board);
  keyboardRange = null;
  clearTimeout(hintTimer);
  if (hint) {
    setFeedback("Hint shown. It will fade after 1.4 seconds.");
    renderSelection();
    hintTimer = setTimeout(() => { hint = null; renderSelection(); }, 1400);
  } else setFeedback("There is no available move.");
}

function togglePause() {
  if (status === "playing") {
    remainingMs = Math.max(0, deadline - Date.now());
    setStatus("paused");
    setFeedback("Paused. The clock is stopped.");
  } else if (status === "paused") {
    deadline = Date.now() + remainingMs;
    setStatus("playing");
    setFeedback("Round resumed.");
  }
}

boardElement.addEventListener("pointerdown", (event) => {
  if (status !== "playing") return;
  const point = pointFromEvent(event);
  if (!point) return;
  boardElement.setPointerCapture(event.pointerId);
  hint = null;
  keyboardRange = null;
  drag = { pointerId: event.pointerId, start: point, end: point };
  renderSelection();
});
boardElement.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = pointFromEvent(event);
  if (point) { drag.end = point; renderSelection(); }
});
boardElement.addEventListener("pointerup", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  applySelection(normalizeSelection(drag.start, drag.end));
});
boardElement.addEventListener("pointercancel", () => { drag = null; renderSelection(); });
boardElement.addEventListener("keydown", (event) => {
  if (status !== "playing") return;
  const directions = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
  const direction = directions[event.key];
  if (direction) {
    event.preventDefault();
    const first = game.board.find((apple) => apple.active) || game.board[0];
    const current = keyboardRange?.focus || { x: first.column, y: first.row };
    const focus = { x: Math.max(0, Math.min(BOARD_COLUMNS - 1, current.x + direction.x)), y: Math.max(0, Math.min(BOARD_ROWS - 1, current.y + direction.y)) };
    keyboardRange = { anchor: event.shiftKey ? keyboardRange?.anchor || current : focus, focus };
    hint = null;
    const inspected = renderSelection();
    setFeedback(`${inspected.count} selected, total ${inspected.sum}. Press Enter to clear.`);
  } else if (event.key === "Enter" && keyboardRange) {
    event.preventDefault();
    applySelection(activeSelection());
  } else if (event.key === "Escape") {
    keyboardRange = null; hint = null; renderSelection(); setFeedback("Selection cancelled.");
  }
});

overlayAction.addEventListener("click", () => status === "paused" ? togglePause() : beginRound());
hintButton.addEventListener("click", showHint);
pauseButton.addEventListener("click", togglePause);
resetButton.addEventListener("click", beginRound);
paleButton.addEventListener("click", () => { const active = paleButton.getAttribute("aria-pressed") === "true"; paleButton.setAttribute("aria-pressed", String(!active)); gameShell.classList.toggle("pale", !active); });
soundButton.addEventListener("click", () => { soundOn = !soundOn; soundButton.setAttribute("aria-pressed", String(soundOn)); soundButton.innerHTML = soundOn ? "<span aria-hidden=\"true\">◖</span> Sound" : "<span aria-hidden=\"true\">◌</span> Muted"; });

setInterval(() => {
  if (status === "playing") {
    remainingMs = Math.max(0, deadline - Date.now());
    timerElement.textContent = formatTime(remainingMs);
    timerBar.style.width = `${remainingMs / (ROUND_SECONDS * 1000) * 100}%`;
    if (remainingMs <= 0) { saveBest(); setStatus("timeup"); setFeedback(`Time's up. You cleared ${score} apples.`); }
  }
  const nextSeed = dailyBoardSeed();
  if (nextSeed !== currentSeed) {
    currentSeed = nextSeed;
    game = createSolvableBoard(currentSeed);
    score = 0; remainingMs = ROUND_SECONDS * 1000; drag = null; keyboardRange = null; hint = null;
    renderBoard(); setStatus("intro"); setFeedback("A new day, a new board.");
  }
}, 100);

renderBoard();
setStatus("intro");
