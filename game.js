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

  /**
   * Coordinates of one row/column, ordered from the leading edge of the move.
   * For `right`, index 0 is the rightmost cell; for `down`, index 0 is the bottom.
   */
  function lineCoords(dir, index) {
    var coords = [];
    for (var j = 0; j < SIZE; j++) {
      var col = dir === 'right' ? SIZE - 1 - j : j;
      var row = dir === 'down' ? SIZE - 1 - j : j;
      coords.push(dir === 'left' || dir === 'right' ? [index, col] : [row, index]);
    }
    return coords;
  }

  /**
   * Collapse one line toward index 0. Equal neighbours merge at most once per
   * move: [2,2,2,2] -> [4,4,0,0], never [8,0,0,0].
   * `movements` records where each original tile travelled, so the UI can
   * animate real sliding instead of just repainting the board.
   */
  function slide(line) {
    var items = [];
    for (var i = 0; i < line.length; i++) {
      if (line[i] !== 0) items.push({ value: line[i], at: i });
    }

    var out = [];
    var merges = [];
    var movements = [];
    var gained = 0;

    for (var k = 0; k < items.length; k++) {
      if (k + 1 < items.length && items[k].value === items[k + 1].value) {
        var merged = items[k].value * 2;
        var to = out.length;
        out.push(merged);
        merges.push(to);
        gained += merged;
        movements.push({ from: items[k].at, to: to, value: items[k].value, merged: true });
        movements.push({ from: items[k + 1].at, to: to, value: items[k + 1].value, merged: true });
        k++;
      } else {
        var singleTo = out.length;
        out.push(items[k].value);
        movements.push({ from: items[k].at, to: singleTo, value: items[k].value, merged: false });
      }
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gained: gained, merges: merges, movements: movements };
  }

  /**
   * Pure move: returns the resulting board without spawning a new tile.
   * `traces` maps every moving tile from its old cell to its new cell.
   * Pass skipTraces=true in search hot paths to avoid allocating trace objects.
   */
  function move(board, dir, skipTraces) {
    var next = clone(board);
    var gained = 0;
    var changed = false;
    var mergedCells = [];
    var traces = [];

    for (var i = 0; i < SIZE; i++) {
      var coords = lineCoords(dir, i);
      var line = coords.map(function (p) { return board[p[0]][p[1]]; });
      var result = slide(line);

      coords.forEach(function (p, idx) {
        var before = board[p[0]][p[1]];
        next[p[0]][p[1]] = result.line[idx];
        if (result.line[idx] !== before) changed = true;
        if (result.merges.indexOf(idx) !== -1) mergedCells.push([p[0], p[1]]);
      });

      if (!skipTraces) {
        result.movements.forEach(function (m) {
          traces.push({
            from: coords[m.from].slice(),
            to: coords[m.to].slice(),
            value: m.value,
            merged: m.merged
          });
        });
      }
      gained += result.gained;
    }

    return {
      board: next,
      gained: gained,
      changed: changed,
      mergedCells: mergedCells,
      traces: traces
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

  /* ---------------------- Save data validation --------------------------- */

  function isValidBoard(board) {
    if (!Array.isArray(board) || board.length !== SIZE) return false;
    for (var r = 0; r < SIZE; r++) {
      if (!Array.isArray(board[r]) || board[r].length !== SIZE) return false;
      for (var c = 0; c < SIZE; c++) {
        var v = board[r][c];
        if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
          return false;
        }
        // Tiles are 0 or a power of two. Bit test is exact for 2048-sized boards.
        if (v !== 0 && (v < 2 || v > 1048576 || (v & (v - 1)) !== 0)) return false;
      }
    }
    return true;
  }

  /**
   * Validate a parsed save payload and return a normalised state, or null when
   * the data is missing, from an incompatible version, or corrupted.
   */
  function validateSave(data) {
    if (!data || typeof data !== 'object' || data.version !== 1) return null;
    if (!isValidBoard(data.board)) return null;

    function nonNegative(value, fallback) {
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value : fallback;
    }

    var history = [];
    if (Array.isArray(data.history)) {
      data.history.forEach(function (item) {
        if (item && isValidBoard(item.board) &&
            typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0) {
          history.push({ board: clone(item.board), score: item.score });
        }
      });
      if (history.length > 30) history = history.slice(-30);
    }

    return {
      board: clone(data.board),
      score: nonNegative(data.score, 0),
      best: nonNegative(data.best, 0),
      won: !!data.won,
      over: !!data.over,
      keepPlaying: !!data.keepPlaying,
      history: history
    };
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
      var result = move(board, DIRS[d], true);
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
      var result = move(board, dir, true);
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
    isValidBoard: isValidBoard,
    validateSave: validateSave,
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

    var SIZE = Game2048.SIZE;
    var BEST_KEY = '2048-ai-hint-best';
    var SAVE_KEY = 'classic-2048-save-v1';
    // Single source of truth: the CSS variable drives the transition itself,
    // so the repaint that reveals the merged number never lags behind it.
    var SLIDE_MS = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--slide-duration')
    ) || 110;
    var REDUCE_MOTION = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var boardEl = document.getElementById('board');
    var scoreEl = document.getElementById('score');
    var bestEl = document.getElementById('best');
    var gainEl = document.getElementById('score-gain');
    var hintEl = document.getElementById('hint-bar');
    var saveStatusEl = document.getElementById('save-status');
    var saveTextEl = document.getElementById('save-text');
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

    /* ----------------------------- Persistence ---------------------------- */

    function loadBest() {
      try { return Number(localStorage.getItem(BEST_KEY)) || 0; }
      catch (e) { return 0; }
    }

    function saveBest(value) {
      try { localStorage.setItem(BEST_KEY, String(value)); }
      catch (e) { /* storage disabled, keep the score in memory only */ }
    }

    function loadSaved() {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        return raw ? Game2048.validateSave(JSON.parse(raw)) : null;
      } catch (e) { return null; }
    }

    function snapshot() {
      return {
        version: 1,
        board: Game2048.clone(state.board),
        score: state.score,
        best: state.best,
        won: state.won,
        over: state.over,
        keepPlaying: state.keepPlaying,
        history: state.history.map(function (item) {
          return { board: Game2048.clone(item.board), score: item.score };
        }),
        savedAt: Date.now()
      };
    }

    function timeLabel() {
      var d = new Date();
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }

    var saveFlashTimer = null;
    function setSaveStatus(text, flash) {
      saveTextEl.textContent = text;
      if (!flash) return;
      saveStatusEl.classList.remove('flash');
      void saveStatusEl.offsetWidth;
      saveStatusEl.classList.add('flash');
      if (saveFlashTimer) clearTimeout(saveFlashTimer);
      saveFlashTimer = setTimeout(function () {
        saveStatusEl.classList.remove('flash');
      }, 1200);
    }

    function saveGame(manual) {
      var ok = true;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); }
      catch (e) { ok = false; }
      saveBest(state.best);
      if (!ok) {
        setSaveStatus('无法保存：浏览器禁用了本地存储（隐私模式？）', false);
        return;
      }
      setSaveStatus(
        (manual ? '已保存 · ' : '已自动保存 · ') + timeLabel(),
        !!manual
      );
    }

    /* -------------------------------- State -------------------------------- */

    var restored = loadSaved();
    var state = {
      board: restored ? restored.board : Game2048.createBoard(),
      score: restored ? restored.score : 0,
      best: Math.max(loadBest(), restored ? restored.best : 0),
      history: restored ? restored.history : [],
      won: restored ? restored.won : false,
      over: restored ? restored.over : false,
      keepPlaying: restored ? restored.keepPlaying : false,
      traces: [],
      newCell: null,
      mergedCells: []
    };

    var cellEls = [];
    for (var i = 0; i < SIZE * SIZE; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      boardEl.appendChild(cell);
      cellEls.push(cell);
    }

    /* ------------------------------- Render ------------------------------- */

    var animToken = 0;
    var animTimer = null;

    function isAt(list, r, c) {
      return list.some(function (p) { return p[0] === r && p[1] === c; });
    }

    function makeTile(value) {
      var tile = document.createElement('div');
      tile.className = 'tile tile-' + (value > 2048 ? 'super' : value);
      if (value >= 1024) tile.classList.add('tile-long');
      tile.textContent = String(value);
      return tile;
    }

    function cellStep() {
      var a = cellEls[0].getBoundingClientRect();
      var b = cellEls[1].getBoundingClientRect();
      var d = cellEls[SIZE].getBoundingClientRect();
      return {
        x: (b.left - a.left) || (a.width + 12),
        y: (d.top - a.top) || (a.height + 12)
      };
    }

    function render(animate) {
      var moving = !!animate && state.traces.length > 0;
      var step = moving ? cellStep() : null;
      var sliding = [];

      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          var container = cellEls[r * SIZE + c];
          container.textContent = '';
          container.className = 'cell';

          var value = state.board[r][c];
          var incoming = moving
            ? state.traces.filter(function (t) { return t.to[0] === r && t.to[1] === c; })
            : [];

          if (incoming.length > 0) {
            if (incoming.length > 1) container.classList.add('cell-merge');
            incoming.forEach(function (t) {
              var tile = makeTile(t.value);
              tile.classList.add('tile-sliding');
              if (t.merged) tile.classList.add('tile-merging');
              var dx = (t.from[1] - c) * step.x;
              var dy = (t.from[0] - r) * step.y;
              tile.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
              container.appendChild(tile);
              sliding.push(tile);
            });
          } else if (value) {
            var finalTile = makeTile(value);
            if (animate && state.newCell &&
                state.newCell.row === r && state.newCell.col === c) {
              finalTile.classList.add('tile-new');
            }
            if (!animate && isAt(state.mergedCells, r, c)) {
              finalTile.classList.add('tile-merged');
              container.classList.add('cell-merge-flash');
            }
            container.appendChild(finalTile);
          }
        }
      }

      scoreEl.textContent = String(state.score);
      bestEl.textContent = String(state.best);

      // Delay the end-of-game overlay until the slide animation has finished.
      var showOverlay = !animate && (state.over || (state.won && !state.keepPlaying));
      overlayEl.hidden = !showOverlay;
      if (showOverlay) {
        var win = state.won && !state.over;
        overlayTitle.textContent = win ? '达成 2048！' : '游戏结束';
        overlayText.textContent = win
          ? '本局得分 ' + state.score + '。可以继续挑战更大的数字。'
          : '没有可移动的方向了，本局得分 ' + state.score + '。';
        keepBtn.hidden = !win;
      }

      if (!moving) return;

      if (REDUCE_MOTION) {
        state.traces = [];
        render(false);
        return;
      }

      var token = ++animToken;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (token !== animToken) return;
          sliding.forEach(function (el) {
            el.style.transform = 'translate(0px, 0px)';
          });
        });
      });
      if (animTimer) clearTimeout(animTimer);
      animTimer = setTimeout(function () {
        if (token !== animToken) return;
        state.traces = [];
        render(false);
      }, SLIDE_MS + 12);
    }

    function showScoreGain(amount) {
      if (!amount) return;
      gainEl.textContent = '+' + amount;
      gainEl.classList.remove('show');
      void gainEl.offsetWidth;
      gainEl.classList.add('show');
    }

    function clearHint() {
      hintEl.classList.remove('visible');
      hintEl.textContent = '';
    }

    /* ------------------------------ Actions ------------------------------- */

    function doMove(dir) {
      if (state.over) return;
      var result = Game2048.move(state.board, dir);
      if (!result.changed) return;

      state.history.push({ board: Game2048.clone(state.board), score: state.score });
      if (state.history.length > 30) state.history.shift();

      state.board = result.board;
      state.score += result.gained;
      if (state.score > state.best) state.best = state.score;
      state.mergedCells = result.mergedCells;
      state.traces = result.traces;
      state.newCell = Game2048.addRandomTile(state.board);
      if (Game2048.hasWon(state.board)) state.won = true;
      if (!Game2048.canMove(state.board)) state.over = true;

      clearHint();
      render(true);
      showScoreGain(result.gained);
      saveGame(false);
    }

    function newGame() {
      state.board = Game2048.createBoard();
      state.score = 0;
      state.history = [];
      state.won = false;
      state.over = false;
      state.keepPlaying = false;
      state.traces = [];
      state.newCell = null;
      state.mergedCells = [];
      animToken++;
      if (animTimer) clearTimeout(animTimer);
      clearHint();
      render(false);
      saveGame(false);
    }

    function undo() {
      if (state.history.length === 0) return;
      var previous = state.history.pop();
      state.board = previous.board;
      state.score = previous.score;
      state.won = false;
      state.over = false;
      state.keepPlaying = false;
      state.traces = [];
      state.newCell = null;
      state.mergedCells = [];
      animToken++;
      if (animTimer) clearTimeout(animTimer);
      clearHint();
      render(false);
      saveGame(false);
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

    /* -------------------------------- Input ------------------------------- */

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        saveGame(true);
        return;
      }
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
    document.getElementById('save').addEventListener('click', function () { saveGame(true); });
    retryBtn.addEventListener('click', newGame);
    keepBtn.addEventListener('click', function () {
      state.keepPlaying = true;
      render(false);
      saveGame(false);
    });

    window.addEventListener('pagehide', function () { saveGame(false); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveGame(false);
    });

    render(false);
    setSaveStatus(
      restored ? '已恢复上次进度（分数 ' + state.score + '）' : '进度自动保存',
      !!restored
    );
  })();
}
