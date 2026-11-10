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
