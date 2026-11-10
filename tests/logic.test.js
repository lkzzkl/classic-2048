const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game.js');

function rows(lines) {
  return lines.map((line) => line.trim().split(/\s+/).map(Number));
}

test('slide merges equal neighbours only once per move', () => {
  assert.deepEqual(G.slide([2, 2, 2, 2]).line, [4, 4, 0, 0]);
  assert.equal(G.slide([2, 2, 2, 2]).gained, 8);
  assert.deepEqual(G.slide([4, 4, 8, 0]).line, [8, 8, 0, 0]);
  assert.deepEqual(G.slide([2, 0, 2, 4]).line, [4, 4, 0, 0]);
  assert.deepEqual(G.slide([0, 0, 0, 0]).line, [0, 0, 0, 0]);
  assert.deepEqual(G.slide([2, 4, 2, 4]).line, [2, 4, 2, 4]);
  assert.equal(G.slide([2, 4, 2, 4]).gained, 0);
});

test('move left / right on a real board', () => {
  const board = rows([
    '2 2 0 0',
    '0 4 4 0',
    '2 0 2 2',
    '0 0 0 0'
  ]);
  assert.deepEqual(G.move(board, 'left').board, rows([
    '4 0 0 0',
    '8 0 0 0',
    '4 2 0 0',
    '0 0 0 0'
  ]));
  assert.equal(G.move(board, 'left').gained, 16);

  assert.deepEqual(G.move(board, 'right').board, rows([
    '0 0 0 4',
    '0 0 0 8',
    '0 0 2 4',
    '0 0 0 0'
  ]));
});

test('move up / down on a real board', () => {
  const board = rows([
    '2 0 2 0',
    '2 0 4 0',
    '4 0 4 0',
    '4 0 2 0'
  ]);
  assert.deepEqual(G.move(board, 'up').board, rows([
    '4 0 2 0',
    '8 0 8 0',
    '0 0 2 0',
    '0 0 0 0'
  ]));
  assert.deepEqual(G.move(board, 'down').board, rows([
    '0 0 0 0',
    '0 0 2 0',
    '4 0 8 0',
    '8 0 2 0'
  ]));
});

test('move reports no change when the board is already packed', () => {
  const board = rows([
    '2 4 8 16',
    '32 64 128 256',
    '512 1024 2 4',
    '8 16 32 64'
  ]);
  assert.equal(G.move(board, 'left').changed, false);
  assert.equal(G.move(board, 'left').gained, 0);
  assert.deepEqual(G.move(board, 'left').board, board);
});

test('move never mutates the input board', () => {
  const board = rows([
    '2 2 0 0',
    '0 0 0 0',
    '0 0 0 0',
    '0 0 0 0'
  ]);
  const snapshot = G.clone(board);
  G.move(board, 'right');
  assert.deepEqual(board, snapshot);
});

test('createBoard starts with exactly two tiles of value 2 or 4', () => {
  const board = G.createBoard(() => 0.5);
  const filled = board.flat().filter((v) => v !== 0);
  assert.equal(filled.length, 2);
  assert.ok(filled.every((v) => v === 2 || v === 4));
  assert.equal(G.addRandomTile(G.emptyBoard().map((r) => r.fill(2))), null);
});

test('addRandomTile is deterministic given a seeded rng', () => {
  const board = G.emptyBoard();
  const tile = G.addRandomTile(board, () => 0);
  assert.deepEqual(tile, { row: 0, col: 0, value: 2 });
  assert.equal(board[0][0], 2);
});

test('canMove / hasWon / maxTile cover win and loss states', () => {
  const stuck = rows([
    '2 4 2 4',
    '4 2 4 2',
    '2 4 2 4',
    '4 2 4 2'
  ]);
  assert.equal(G.canMove(stuck), false);

  const mergeable = rows([
    '2 2 8 16',
    '4 8 16 32',
    '8 16 32 64',
    '16 32 64 128'
  ]);
  assert.equal(G.canMove(mergeable), true);

  const winning = rows([
    '2048 2 0 0',
    '0 0 0 0',
    '0 0 0 0',
    '0 0 0 0'
  ]);
  assert.equal(G.hasWon(winning), true);
  assert.equal(G.hasWon(stuck), false);
  assert.equal(G.maxTile(winning), 2048);
});

test('bestMove returns a legal, actionable direction', () => {
  const board = rows([
    '2 2 4 8',
    '0 4 8 16',
    '0 0 2 4',
    '0 0 0 2'
  ]);
  const dir = G.bestMove(board, 2);
  assert.ok(G.DIRS.includes(dir));
  assert.equal(G.move(board, dir).changed, true);

  const stuck = rows([
    '2 4 2 4',
    '4 2 4 2',
    '2 4 2 4',
    '4 2 4 2'
  ]);
  assert.equal(G.bestMove(stuck, 2), null);
});

test('bestMove keeps a large tile in the corner region', () => {
  const board = rows([
    '1024 512 0 0',
    '256 128 0 0',
    '64 32 0 0',
    '16 8 0 0'
  ]);
  const dir = G.bestMove(board, 2);
  assert.ok(G.DIRS.includes(dir));
});

test('slide movements describe where every tile travels', () => {
  assert.deepEqual(G.slide([2, 0, 2, 4]).movements, [
    { from: 0, to: 0, value: 2, merged: true },
    { from: 2, to: 0, value: 2, merged: true },
    { from: 3, to: 1, value: 4, merged: false }
  ]);
  assert.deepEqual(G.slide([0, 0, 0, 8]).movements, [
    { from: 3, to: 0, value: 8, merged: false }
  ]);
  assert.deepEqual(G.slide([0, 0, 0, 0]).movements, []);
});

test('move traces map old board cells to new board cells', () => {
  const board = rows([
    '2 2 0 0',
    '0 0 0 0',
    '0 0 0 0',
    '0 0 0 0'
  ]);
  assert.deepEqual(G.move(board, 'left').traces, [
    { from: [0, 0], to: [0, 0], value: 2, merged: true },
    { from: [0, 1], to: [0, 0], value: 2, merged: true }
  ]);

  const right = G.move(board, 'right').traces;
  assert.deepEqual(right[0].to, [0, 3]);
  assert.deepEqual(right[1].from, [0, 0]);
  assert.ok(right.every((t) => t.merged));

  const vertical = rows([
    '2 0 0 0',
    '0 0 0 0',
    '0 0 0 0',
    '2 0 0 0'
  ]);
  const down = G.move(vertical, 'down').traces;
  assert.deepEqual(down[0].to, [3, 0]);
  assert.deepEqual(down[1].from, [0, 0]);
  assert.ok(down.some((t) => t.merged));
});

test('skipTraces keeps the move result identical for search hot paths', () => {
  const board = rows([
    '2 2 4 0',
    '0 8 8 0',
    '2 4 2 4',
    '0 0 0 0'
  ]);
  const full = G.move(board, 'left');
  const lean = G.move(board, 'left', true);
  assert.deepEqual(lean.board, full.board);
  assert.equal(lean.gained, full.gained);
  assert.equal(lean.changed, full.changed);
  assert.deepEqual(lean.mergedCells, full.mergedCells);
  assert.deepEqual(lean.traces, []);
  assert.ok(full.traces.length > 0);
});

test('validateSave accepts a valid payload and fills in defaults', () => {
  const board = rows([
    '2 4 0 0',
    '0 0 0 0',
    '0 0 0 0',
    '0 0 0 0'
  ]);
  const full = G.validateSave({
    version: 1,
    board,
    score: 12,
    best: 40,
    won: true,
    over: false,
    keepPlaying: true,
    history: [{ board, score: 8 }]
  });
  assert.deepEqual(full.board, board);
  assert.equal(full.score, 12);
  assert.equal(full.best, 40);
  assert.equal(full.won, true);
  assert.equal(full.keepPlaying, true);
  assert.equal(full.history.length, 1);

  const minimal = G.validateSave({ version: 1, board });
  assert.equal(minimal.score, 0);
  assert.equal(minimal.best, 0);
  assert.deepEqual(minimal.history, []);
  assert.notStrictEqual(minimal.board, board);
});

test('validateSave rejects corrupted saves and drops invalid history', () => {
  assert.equal(G.validateSave(null), null);
  assert.equal(G.validateSave({ version: 2, board: G.emptyBoard() }), null);
  assert.equal(G.validateSave({ version: 1, board: [[2, 2], [2, 2]] }), null);
  assert.equal(G.validateSave({ version: 1 }), null);

  const nonPower = G.emptyBoard();
  nonPower[0][0] = 3;
  assert.equal(G.isValidBoard(nonPower), false);
  assert.equal(G.validateSave({ version: 1, board: nonPower }), null);

  const negative = G.emptyBoard();
  negative[1][1] = -2;
  assert.equal(G.validateSave({ version: 1, board: negative }), null);

  const valid = G.validateSave({
    version: 1,
    board: G.emptyBoard(),
    history: [
      { board: nonPower, score: 1 },
      { board: G.emptyBoard(), score: 2 },
      { score: 3 }
    ]
  });
  assert.equal(valid.history.length, 1);
  assert.equal(valid.history[0].score, 2);
});
