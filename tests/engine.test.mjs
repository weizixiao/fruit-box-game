import assert from "node:assert/strict";

globalThis.window = globalThis;
await import("../engine.js");

const {
  BOARD_COLUMNS,
  BOARD_ROWS,
  TARGET_SUM,
  clearSelection,
  createSolvableBoard,
  inspectSelection,
  isInside
} = globalThis.FruitBoxEngine;

for (let seed = 1; seed <= 50; seed++) {
  const first = createSolvableBoard(seed);
  const second = createSolvableBoard(seed);
  assert.deepEqual(first, second, `seed ${seed} must be deterministic`);
  assert.equal(first.board.length, BOARD_COLUMNS * BOARD_ROWS);
  assert.ok(first.board.every((apple) => apple.value >= 1 && apple.value <= 9));

  let board = first.board;
  let cleared = 0;
  for (const step of first.solution) {
    const inspected = inspectSelection(board, step.selection);
    assert.equal(inspected.sum, TARGET_SUM, `seed ${seed} contains an invalid solution step`);
    const result = clearSelection(board, step.selection);
    assert.ok(result.cleared > 0);
    board = result.board;
    cleared += result.cleared;
  }
  assert.equal(cleared, BOARD_COLUMNS * BOARD_ROWS);
  assert.ok(board.every((apple) => !apple.active));
}

assert.equal(isInside({ row: 0, column: 0 }, { top: 0, right: .5, bottom: 1, left: 0 }), false);
assert.equal(isInside({ row: 0, column: 0 }, { top: 0, right: .51, bottom: 1, left: 0 }), true);

console.log("Fruit Box engine: 50 deterministic boards verified.");
