/**
 * 2048 - core game logic and browser UI.
 *
 * The pure-logic part (Game2048) has no DOM dependency, so it can be required
 * directly by Node for unit tests. The UI part is guarded by `typeof document`.
 */
var Game2048 = (function () {
  'use strict';

  var SIZE = 4;
  var DIRS = ['up', 'down', 'left', 'right'];

  function random(rng) {
    return typeof rng === 'function' ? rng : Math.random;
  }

  function emptyBoard() {
    return Array.from({ length: SIZE }, function () {
      return Array(SIZE).fill(0);
    });
  }

  function clone(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function emptyCells(board) {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) cells.push([r, c]);
      }
    }
    return cells;
  }

  /** Put a 2 (90%) or 4 (10%) on a random empty cell. Returns its position. */
  function addRandomTile(board, rng) {
    var rand = random(rng);
    var cells = emptyCells(board);
    if (cells.length === 0) return null;
    var pick = cells[Math.floor(rand() * cells.length)];
    var value = rand() < 0.9 ? 2 : 4;
    board[pick[0]][pick[1]] = value;
    return { row: pick[0], col: pick[1], value: value };
  }

  function createBoard(rng) {
    var board = emptyBoard();
    addRandomTile(board, rng);
    addRandomTile(board, rng);
    return board;
  }

  /** Coordinates of one row/column, ordered along the direction of movement. */
  function lineCoords(dir, index) {
    var coords = [];
    for (var j = 0; j < SIZE; j++) {
      coords.push(dir === 'left' || dir === 'right' ? [index, j] : [j, index]);
    }
    return coords;
  }

  /**
   * Collapse one line to the left. Equal neighbours merge at most once per move:
   * [2,2,2,2] -> [4,4,0,0], never [8,0,0,0].
   */
  function slide(line) {
    var values = line.filter(function (v) { return v !== 0; });
    var out = [];
    var merges = [];
    var gained = 0;

    for (var i = 0; i < values.length; i++) {
      if (i + 1 < values.length && values[i] === values[i + 1]) {
        var merged = values[i] * 2;
        out.push(merged);
        merges.push(out.length - 1);
        gained += merged;
        i++;
      } else {
        out.push(values[i]);
      }
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gained: gained, merges: merges };
  }

  /** Pure move: returns the resulting board without spawning a new tile. */
  function move(board, dir) {
    var next = clone(board);
    var gained = 0;
    var changed = false;
    var mergedCells = [];

    for (var i = 0; i < SIZE; i++) {
      var coords = lineCoords(dir, i);
      var reversed = dir === 'right' || dir === 'down';
      var line = coords.map(function (p) { return board[p[0]][p[1]]; });
      if (reversed) line = line.slice().reverse();

      var result = slide(line);
      if (reversed) {
        result.line = result.line.slice().reverse();
        result.merges = result.merges.map(function (idx) { return SIZE - 1 - idx; });
      }

      coords.forEach(function (p, idx) {
        var before = board[p[0]][p[1]];
        next[p[0]][p[1]] = result.line[idx];
        if (result.line[idx] !== before) changed = true;
        if (result.merges.indexOf(idx) !== -1) mergedCells.push([p[0], p[1]]);
      });
      gained += result.gained;
    }

    return {
      board: next,
      gained: gained,
      changed: changed,
      mergedCells: mergedCells
    };
  }

  function canMove(board) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = board[r][c];
        if (v === 0) return true;
        if (c + 1 < SIZE && v === board[r][c + 1]) return true;
        if (r + 1 < SIZE && v === board[r + 1][c]) return true;
      }
    }
    return false;
  }

  function hasWon(board, target) {
    var goal = target || 2048;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] >= goal) return true;
      }
    }
    return false;
  }

  function maxTile(board) {
    var max = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) max = Math.max(max, board[r][c]);
    }
    return max;
  }

  /* ------------------------- AI hint (expectimax) ------------------------- */

  // Rewards keeping large tiles clustered in the top-left, in a snake pattern.
  var SNAKE_WEIGHTS = [
    [3, 2, 1, 0],
    [2, 1, 0, -1],
    [1, 0, -1, -2],
    [0, -1, -2, -3]
  ];

  function log2(v) {
    return v > 0 ? Math.log(v) / Math.LN2 : 0;
  }

  function evaluate(board) {
    var positional = 0;
    var smoothness = 0;
    var max = 0;

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = board[r][c];
        positional += log2(v) * SNAKE_WEIGHTS[r][c];
        if (v > max) max = v;
        if (v === 0) continue;
        if (c + 1 < SIZE && board[r][c + 1] !== 0) {
          smoothness -= Math.abs(log2(v) - log2(board[r][c + 1]));
        }
        if (r + 1 < SIZE && board[r + 1][c] !== 0) {
          smoothness -= Math.abs(log2(v) - log2(board[r + 1][c]));
        }
      }
    }

    var empty = emptyCells(board).length;
    return positional * 4 + empty * 12 + log2(max || 1) * 8 + smoothness * 1.2;
  }

  /** Chance nodes sample at most 6 empty cells to keep the search instant. */
  function expectimax(board, depth) {
    if (depth === 0 || !canMove(board)) return evaluate(board);

    var best = -Infinity;
    for (var d = 0; d < DIRS.length; d++) {
      var result = move(board, DIRS[d]);
      if (!result.changed) continue;
      var cells = emptyCells(result.board);
      if (cells.length === 0) {
        best = Math.max(best, expectimax(result.board, depth - 1));
        continue;
      }

      var sample = cells.slice(0, Math.min(cells.length, 6));
      var expected = 0;
      for (var s = 0; s < sample.length; s++) {
        var p = sample[s];
        result.board[p[0]][p[1]] = 2;
        expected += 0.9 * expectimax(result.board, depth - 1) / sample.length;
        result.board[p[0]][p[1]] = 4;
        expected += 0.1 * expectimax(result.board, depth - 1) / sample.length;
        result.board[p[0]][p[1]] = 0;
      }
      best = Math.max(best, expected);
    }
    return best === -Infinity ? evaluate(board) : best;
  }

  /** Returns the recommended direction, or null when the board is stuck. */
  function bestMove(board, depth) {
    var searchDepth = typeof depth === 'number' ? depth : 2;
    var best = null;
    var bestScore = -Infinity;

    for (var d = 0; d < DIRS.length; d++) {
      var dir = DIRS[d];
      var result = move(board, dir);
      if (!result.changed) continue;
      var score = expectimax(result.board, searchDepth - 1) + result.gained * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best;
  }

  return {
    SIZE: SIZE,
    DIRS: DIRS,
    emptyBoard: emptyBoard,
    clone: clone,
    emptyCells: emptyCells,
    addRandomTile: addRandomTile,
    createBoard: createBoard,
    slide: slide,
    move: move,
    canMove: canMove,
    hasWon: hasWon,
    maxTile: maxTile,
    evaluate: evaluate,
    expectimax: expectimax,
    bestMove: bestMove
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game2048;
}

/* ------------------------------ Browser UI ------------------------------ */
if (typeof document !== 'undefined') {
  (function () {
    'use strict';

    var BEST_KEY = '2048-ai-hint-best';
    var boardEl = document.getElementById('board');
    var scoreEl = document.getElementById('score');
    var bestEl = document.getElementById('best');
    var hintEl = document.getElementById('hint-bar');
    var overlayEl = document.getElementById('overlay');
    var overlayTitle = document.getElementById('overlay-title');
    var overlayText = document.getElementById('overlay-text');
    var keepBtn = document.getElementById('keep-playing');
    var retryBtn = document.getElementById('retry');

    var LABEL = { up: '上', down: '下', left: '左', right: '右' };
    var ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
    var KEYMAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };

    function loadBest() {
      try { return Number(localStorage.getItem(BEST_KEY)) || 0; }
      catch (e) { return 0; }
    }

    function saveBest(value) {
      try { localStorage.setItem(BEST_KEY, String(value)); }
      catch (e) { /* storage disabled, keep score in memory only */ }
    }

    var state = {
      board: Game2048.createBoard(),
      score: 0,
      best: loadBest(),
      history: [],
      won: false,
      over: false,
      keepPlaying: false,
      newCell: null,
      mergedCells: []
    };

    var cellEls = [];
    for (var i = 0; i < Game2048.SIZE * Game2048.SIZE; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      boardEl.appendChild(cell);
      cellEls.push(cell);
    }

    function isAt(list, r, c) {
      return list.some(function (p) { return p[0] === r && p[1] === c; });
    }

    function render() {
      for (var r = 0; r < Game2048.SIZE; r++) {
        for (var c = 0; c < Game2048.SIZE; c++) {
          var value = state.board[r][c];
          var cell = cellEls[r * Game2048.SIZE + c];
          cell.textContent = '';
          cell.className = 'cell';
          if (!value) continue;

          var tile = document.createElement('div');
          tile.className = 'tile tile-' + (value > 2048 ? 'super' : value);
          if (value >= 1024) tile.classList.add('tile-long');
          if (state.newCell && state.newCell.row === r && state.newCell.col === c) {
            tile.classList.add('tile-new');
          }
          if (isAt(state.mergedCells, r, c)) tile.classList.add('tile-merged');
          tile.textContent = String(value);
          cell.appendChild(tile);
        }
      }

      scoreEl.textContent = String(state.score);
      bestEl.textContent = String(state.best);

      var showOverlay = state.over || (state.won && !state.keepPlaying);
      overlayEl.hidden = !showOverlay;
      if (showOverlay) {
        var win = state.won && !state.over;
        overlayTitle.textContent = win ? '达成 2048！' : '游戏结束';
        overlayText.textContent = win
          ? '本局得分 ' + state.score + '。可以继续挑战更大的数字。'
          : '没有可移动的方向了，本局得分 ' + state.score + '。';
        keepBtn.hidden = !win;
      }
    }

    function clearHint() {
      hintEl.classList.remove('visible');
      hintEl.textContent = '';
    }

    function doMove(dir) {
      if (state.over) return;
      var result = Game2048.move(state.board, dir);
      if (!result.changed) return;

      state.history.push({ board: Game2048.clone(state.board), score: state.score });
      if (state.history.length > 30) state.history.shift();

      state.board = result.board;
      state.score += result.gained;
      if (state.score > state.best) {
        state.best = state.score;
        saveBest(state.best);
      }
      state.mergedCells = result.mergedCells;
      state.newCell = Game2048.addRandomTile(state.board);
      if (Game2048.hasWon(state.board)) state.won = true;
      if (!Game2048.canMove(state.board)) state.over = true;
      clearHint();
      render();
    }

    function newGame() {
      state.board = Game2048.createBoard();
      state.score = 0;
      state.history = [];
      state.won = false;
      state.over = false;
      state.keepPlaying = false;
      state.newCell = null;
      state.mergedCells = [];
      clearHint();
      render();
    }

    function undo() {
      if (state.history.length === 0) return;
      var previous = state.history.pop();
      state.board = previous.board;
      state.score = previous.score;
      state.won = false;
      state.over = false;
      state.keepPlaying = false;
      state.newCell = null;
      state.mergedCells = [];
      clearHint();
      render();
    }

    var hintTimer = null;
    function showHint() {
      if (state.over) return;
      var dir = Game2048.bestMove(state.board, 2);
      if (!dir) return;
      hintEl.textContent = 'AI 建议：向' + LABEL[dir] + ' ' + ARROW[dir] + '（启发式搜索，仅供参考）';
      hintEl.classList.add('visible');
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(clearHint, 3500);
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'u' || event.key === 'U' || (event.ctrlKey && event.key === 'z')) {
        event.preventDefault();
        undo();
        return;
      }
      var dir = KEYMAP[event.key];
      if (dir) {
        event.preventDefault();
        doMove(dir);
      }
    });

    var touchStart = null;
    boardEl.addEventListener('touchstart', function (event) {
      var t = event.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    boardEl.addEventListener('touchend', function (event) {
      if (!touchStart) return;
      var t = event.changedTouches[0];
      var dx = t.clientX - touchStart.x;
      var dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      var dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      doMove(dir);
    }, { passive: true });

    document.getElementById('new-game').addEventListener('click', newGame);
    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('hint').addEventListener('click', showHint);
    retryBtn.addEventListener('click', newGame);
    keepBtn.addEventListener('click', function () {
      state.keepPlaying = true;
      render();
    });

    render();
  })();
}
