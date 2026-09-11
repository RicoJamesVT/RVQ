/**
 * Connect 45s — standalone vanilla JS game module
 * No dependencies, no build step. Drop this file into any project.
 *
 * USAGE
 * -----
 *   <div id="game-slot"></div>
 *   <script src="connect-four.js"></script>
 *   <script>
 *     const game = initConnectFourGame(document.getElementById('game-slot'), {
 *       themeColor: '#8b5cf6',   // optional accent color
 *       onBack: () => {          // optional, called when the player hits "Back"
 *         game.destroy();
 *         showLevelSelect();
 *       }
 *     });
 *
 *     // later, if you need to tear the game down yourself:
 *     // game.destroy();
 *   </script>
 *
 * The game paints itself entirely inside the container element you pass in,
 * so you can mount it into a level, a modal, a panel — whatever "area" of
 * your game.js needs it. All CSS is scoped under the "c4-" prefix and is
 * injected once per page, so it won't collide with other games or styles.
 */

function initConnectFourGame(container, options = {}) {
  const themeColor = options.themeColor || "#8b5cf6";
  const onBack = typeof options.onBack === "function" ? options.onBack : null;

  const ROWS = 6;
  const COLS = 7;

  // Vinyl record colors per player: a colored "vinyl" body + a paper label color
  const PLAYER_VINYL = {
    1: { vinyl: "#ef4444", label: "#fdf6e3" },
    2: { vinyl: "#f59e0b", label: "#fdf6e3" },
  };

  // Embedded logo (base64) so the game works fully offline with zero external assets
  const LOGO_DATA_URI = "data:image/png;base64,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";

  // ---------------------------------------------------------------------
  // Styles (injected once, shared by every instance on the page)
  // ---------------------------------------------------------------------
  if (!document.getElementById("c4-styles")) {
    const style = document.createElement("style");
    style.id = "c4-styles";
    style.textContent = `
      .c4-root {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        box-sizing: border-box;
      }
      .c4-root * { box-sizing: border-box; }
      .c4-card {
        width: 100%;
        max-width: 420px;
        background: #fff;
        border-radius: 16px;
        padding: 32px;
        text-align: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      }
      .c4-card h2 { margin: 0 0 8px; font-size: 24px; font-weight: 700; }
      .c4-card p { margin: 0 0 28px; color: #6b7280; }
      .c4-btn {
        display: flex; align-items: center; justify-content: center;
        width: 100%; height: 56px; font-size: 16px; font-weight: 600;
        border-radius: 10px; border: none; cursor: pointer;
        margin-bottom: 14px; color: #fff; transition: transform .15s ease, opacity .15s ease;
      }
      .c4-btn:hover { transform: translateY(-1px); opacity: .92; }
      .c4-btn-outline {
        background: #fff; border: 2px solid var(--c4-theme, #8b5cf6);
        color: var(--c4-theme, #8b5cf6);
      }
      .c4-btn-icon { margin-right: 10px; font-size: 18px; line-height: 1; }
      .c4-small-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db;
        background: #fff; font-size: 14px; font-weight: 500; cursor: pointer;
      }
      .c4-small-btn:hover { background: #f9fafb; }
      .c4-wrap { width: 100%; max-width: 560px; }
      .c4-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 20px; gap: 8px;
      }
      .c4-title { text-align: center; }
      .c4-title h2 { margin: 0; font-size: 22px; font-weight: 700; }
      .c4-title p { margin: 2px 0 0; font-size: 13px; color: #6b7280; }
      .c4-logo { max-width: 100%; height: auto; }
      .c4-logo-card { width: 100%; max-width: 260px; margin: 0 auto 12px; display: block; }
      .c4-logo-header { width: 100%; max-width: 170px; margin: 0 auto; display: block; }
      .c4-players {
        display: flex; align-items: center; justify-content: center;
        gap: 24px; margin-bottom: 20px; flex-wrap: wrap;
      }
      .c4-player {
        display: flex; align-items: center; gap: 10px; padding: 12px 16px;
        border-radius: 10px; background: #f3f4f6; opacity: .6;
        transition: all .25s ease; border: 2px solid transparent;
      }
      .c4-player.active {
        opacity: 1; transform: scale(1.05);
      }
      .c4-player.active.p1 { background: #fee2e2; border-color: #f87171; }
      .c4-player.active.p2 { background: #fef9c3; border-color: #facc15; }
      .c4-dot {
        width: 28px; height: 28px; border-radius: 50%; border: 2px solid #000; flex-shrink: 0;
        background-repeat: no-repeat;
      }
      .c4-dot.p1, .c4-dot.p2 {
        background-image:
          radial-gradient(circle at 30% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 24%),
          radial-gradient(circle at center, #000 0 8%, transparent 8.6%),
          radial-gradient(circle at center, #fdf6e3 0 30%, rgba(0,0,0,0.35) 30% 32%, transparent 32%),
          repeating-radial-gradient(circle at center, rgba(0,0,0,0.32) 0 1.2px, transparent 1.2px 3.5px);
      }
      .c4-dot.p1 { background-color: #ef4444; }
      .c4-dot.p2 { background-color: #f59e0b; }
      .c4-player-label { font-weight: 600; font-size: 14px; white-space: nowrap; }
      .c4-vs { font-size: 20px; font-weight: 700; color: #9ca3af; }
      .c4-pulse { width: 8px; height: 8px; border-radius: 50%; animation: c4-pulse 1.2s infinite; }
      .c4-pulse.p1 { background: #ef4444; }
      .c4-pulse.p2 { background: #f59e0b; }
      @keyframes c4-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
      .c4-thinking { display: flex; gap: 3px; margin-left: 4px; }
      .c4-thinking span {
        width: 5px; height: 5px; border-radius: 50%; background: #f59e0b;
        animation: c4-bounce 1s infinite;
      }
      .c4-thinking span:nth-child(2) { animation-delay: .12s; }
      .c4-thinking span:nth-child(3) { animation-delay: .24s; }
      @keyframes c4-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      .c4-status { text-align: center; margin-bottom: 20px; min-height: 0; }
      .c4-status-box { padding: 14px; border-radius: 10px; font-size: 18px; font-weight: 700; }
      .c4-status-win { background: #dcfce7; border: 2px solid #4ade80; }
      .c4-status-draw { background: #f3f4f6; border: 2px solid #9ca3af; color: #6b7280; }
      .c4-status-win.p1 { color: #dc2626; }
      .c4-status-win.p2 { color: #ca8a04; }
      .c4-board {
        background: #fff; border-radius: 18px; padding: 20px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15); border: 4px solid #000;
      }
      .c4-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
      .c4-col { display: flex; flex-direction: column; gap: 8px; }
      .c4-cell {
        width: 44px; height: 44px; border-radius: 50%; border: 4px solid #000;
        cursor: pointer; transition: transform .15s ease, background-color .15s ease, opacity .15s ease;
        padding: 0; background-repeat: no-repeat;
      }
      .c4-cell:hover:not(:disabled) { transform: scale(1.06); }
      .c4-cell:disabled { cursor: not-allowed; }
      .c4-cell.c4-empty { box-shadow: inset 0 3px 8px rgba(0,0,0,0.35); }
      .c4-cell.c4-vinyl {
        background-color: var(--vinyl-color);
        background-image:
          radial-gradient(circle at 30% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 24%),
          radial-gradient(circle at center, #000 0 5%, transparent 5.4%),
          radial-gradient(circle at center, var(--label-color, #fdf6e3) 0 26%, rgba(0,0,0,0.35) 26% 27%, transparent 27%),
          repeating-radial-gradient(circle at center, rgba(0,0,0,0.32) 0 1.4px, transparent 1.4px 4px);
      }
      .c4-cell.c4-vinyl.c4-preview { opacity: .45; }
      .c4-cell.c4-last-move { animation: c4-blink .5s ease-in-out 4; box-shadow: 0 0 20px #f59e0b; }
      @keyframes c4-blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
      .c4-play-again { text-align: center; margin-top: 20px; }
      .c4-play-again button {
        padding: 12px 32px; border-radius: 10px; border: none; color: #fff;
        font-size: 16px; font-weight: 600; cursor: pointer;
      }
      @media (min-width: 480px) {
        .c4-cell { width: 52px; height: 52px; }
      }
    `;
    document.head.appendChild(style);
  }

  container.innerHTML = "";
  const root = document.createElement("div");
  root.className = "c4-root";
  root.style.setProperty("--c4-theme", themeColor);
  root.style.backgroundColor = themeColor + "20";
  container.appendChild(root);

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let board = makeEmptyBoard();
  let currentPlayer = 1;
  let gameState = "playing"; // 'playing' | 'won' | 'draw'
  let winner = null;
  let gameMode = null; // 'pvp' | 'cpu'
  let isThinking = false;
  let cpuLastMove = null;
  let cpuTimer = null;
  let destroyed = false;

  function makeEmptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  function resetGame() {
    board = makeEmptyBoard();
    currentPlayer = 1;
    gameState = "playing";
    winner = null;
    isThinking = false;
    cpuLastMove = null;
    if (cpuTimer) clearTimeout(cpuTimer);
    render();
  }

  function checkWinner(b, row, col, player) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dx, dy] of directions) {
      let count = 1;
      for (let i = 1; i < 4; i++) {
        const r = row + dx * i, c = col + dy * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r][c] === player) count++;
        else break;
      }
      for (let i = 1; i < 4; i++) {
        const r = row - dx * i, c = col - dy * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r][c] === player) count++;
        else break;
      }
      if (count >= 4) return true;
    }
    return false;
  }

  function isBoardFull(b) {
    return b[0].every((cell) => cell !== 0);
  }

  function dropPiece(col, player) {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === 0) {
        board[row][col] = player;

        if (player === 2 && gameMode === "cpu") {
          cpuLastMove = { row, col };
          setTimeout(() => {
            if (destroyed) return;
            cpuLastMove = null;
            render();
          }, 2000);
        }

        if (checkWinner(board, row, col, player)) {
          gameState = "won";
          winner = player;
        } else if (isBoardFull(board)) {
          gameState = "draw";
        }
        return true;
      }
    }
    return false;
  }

  function getCPUMove(b) {
    // 1) Can CPU win?
    for (let col = 0; col < COLS; col++) {
      if (b[0][col] !== 0) continue;
      const test = b.map((r) => [...r]);
      for (let row = ROWS - 1; row >= 0; row--) {
        if (test[row][col] === 0) {
          test[row][col] = 2;
          if (checkWinner(test, row, col, 2)) return col;
          break;
        }
      }
    }
    // 2) Must block player?
    for (let col = 0; col < COLS; col++) {
      if (b[0][col] !== 0) continue;
      const test = b.map((r) => [...r]);
      for (let row = ROWS - 1; row >= 0; row--) {
        if (test[row][col] === 0) {
          test[row][col] = 1;
          if (checkWinner(test, row, col, 1)) return col;
          break;
        }
      }
    }
    // 3) Prefer center columns
    const centerCols = [3, 2, 4, 1, 5, 0, 6];
    for (const col of centerCols) {
      if (b[0][col] === 0) return col;
    }
    return 0;
  }

  function handleColumnClick(col) {
    if (gameState !== "playing" || board[0][col] !== 0 || isThinking) return;
    dropPiece(col, currentPlayer);
    if (gameState === "playing") {
      currentPlayer = currentPlayer === 1 ? 2 : 1;
    }
    render();
    maybeRunCPU();
  }

  function maybeRunCPU() {
    if (gameMode === "cpu" && currentPlayer === 2 && gameState === "playing") {
      isThinking = true;
      render();
      cpuTimer = setTimeout(() => {
        if (destroyed) return;
        const col = getCPUMove(board);
        dropPiece(col, 2);
        currentPlayer = 1;
        isThinking = false;
        render();
      }, 1000);
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function render() {
    root.innerHTML = "";

    if (!gameMode) {
      root.appendChild(renderModeSelect());
      return;
    }
    root.appendChild(renderGame());
  }

  function renderModeSelect() {
    const card = document.createElement("div");
    card.className = "c4-card";
    card.innerHTML = `
      <img class="c4-logo c4-logo-card" src="${LOGO_DATA_URI}" alt="Connect 45s" />
      <p>Choose your game mode</p>
    `;

    const pvpBtn = document.createElement("button");
    pvpBtn.className = "c4-btn";
    pvpBtn.style.backgroundColor = themeColor;
    pvpBtn.innerHTML = `<span class="c4-btn-icon">🧑</span> Player vs Player`;
    pvpBtn.onclick = () => {
      gameMode = "pvp";
      render();
    };

    const cpuBtn = document.createElement("button");
    cpuBtn.className = "c4-btn c4-btn-outline";
    cpuBtn.innerHTML = `<span class="c4-btn-icon">🤖</span> Player vs CPU`;
    cpuBtn.onclick = () => {
      gameMode = "cpu";
      render();
    };

    card.appendChild(pvpBtn);
    card.appendChild(cpuBtn);
    return card;
  }

  function renderGame() {
    const wrap = document.createElement("div");
    wrap.className = "c4-wrap";

    // Header
    const header = document.createElement("div");
    header.className = "c4-header";

    const backBtn = document.createElement("button");
    backBtn.className = "c4-small-btn";
    backBtn.innerHTML = `← Back`;
    backBtn.onclick = () => {
      if (onBack) onBack();
    };

    const title = document.createElement("div");
    title.className = "c4-title";
    title.innerHTML = `<img class="c4-logo c4-logo-header" src="${LOGO_DATA_URI}" alt="Connect 45s" /><p>${gameMode === "pvp" ? "Player vs Player" : "Player vs CPU"}</p>`;

    const resetBtn = document.createElement("button");
    resetBtn.className = "c4-small-btn";
    resetBtn.innerHTML = `⟲ Reset`;
    resetBtn.onclick = resetGame;

    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(resetBtn);
    wrap.appendChild(header);

    // Players
    const players = document.createElement("div");
    players.className = "c4-players";

    const p1 = document.createElement("div");
    p1.className = "c4-player p1" + (currentPlayer === 1 && gameState === "playing" ? " active" : "");
    p1.innerHTML = `
      <div class="c4-dot p1"></div>
      <span class="c4-player-label">🧑 Player 1</span>
      ${currentPlayer === 1 && gameState === "playing" ? '<div class="c4-pulse p1"></div>' : ""}
    `;

    const vs = document.createElement("div");
    vs.className = "c4-vs";
    vs.textContent = "VS";

    const p2 = document.createElement("div");
    p2.className = "c4-player p2" + (currentPlayer === 2 && gameState === "playing" ? " active" : "");
    p2.innerHTML = `
      <div class="c4-dot p2"></div>
      <span class="c4-player-label">${gameMode === "cpu" ? "🤖 CPU" : "🧑 Player 2"}</span>
      ${currentPlayer === 2 && gameState === "playing" ? '<div class="c4-pulse p2"></div>' : ""}
      ${isThinking ? '<div class="c4-thinking"><span></span><span></span><span></span></div>' : ""}
    `;

    players.appendChild(p1);
    players.appendChild(vs);
    players.appendChild(p2);
    wrap.appendChild(players);

    // Status
    const status = document.createElement("div");
    status.className = "c4-status";
    if (gameState === "won" && winner) {
      status.innerHTML = `
        <div class="c4-status-box c4-status-win ${winner === 1 ? "p1" : "p2"}">
          🎉 ${winner === 1 ? "Player 1 Wins!" : gameMode === "cpu" ? "CPU Wins!" : "Player 2 Wins!"} 🎉
        </div>
      `;
    } else if (gameState === "draw") {
      status.innerHTML = `<div class="c4-status-box c4-status-draw">🤝 It's a Draw! 🤝</div>`;
    }
    wrap.appendChild(status);

    // Board
    const boardEl = document.createElement("div");
    boardEl.className = "c4-board";
    const grid = document.createElement("div");
    grid.className = "c4-grid";

    for (let col = 0; col < COLS; col++) {
      const colEl = document.createElement("div");
      colEl.className = "c4-col";
      for (let row = 0; row < ROWS; row++) {
        const cell = board[row][col];
        const btn = document.createElement("button");
        const isCpuLastMove = cpuLastMove && cpuLastMove.row === row && cpuLastMove.col === col;
        btn.className = "c4-cell" + (isCpuLastMove ? " c4-last-move" : "");
        btn.disabled = gameState !== "playing" || board[0][col] !== 0 || isThinking;

        if (cell === 1 || cell === 2) {
          const p = PLAYER_VINYL[cell];
          btn.classList.add("c4-vinyl");
          btn.style.setProperty("--vinyl-color", p.vinyl);
          btn.style.setProperty("--label-color", p.label);
        } else {
          btn.classList.add("c4-empty");
          btn.style.backgroundColor = themeColor + "26";
        }

        btn.onclick = () => handleColumnClick(col);
        btn.onmouseenter = () => {
          if (cell === 0 && gameState === "playing" && board[0][col] === 0 && !isThinking) {
            const p = PLAYER_VINYL[currentPlayer];
            btn.classList.add("c4-vinyl", "c4-preview");
            btn.style.setProperty("--vinyl-color", p.vinyl);
            btn.style.setProperty("--label-color", p.label);
          }
        };
        btn.onmouseleave = () => {
          if (cell === 0) {
            btn.classList.remove("c4-vinyl", "c4-preview");
            btn.style.backgroundColor = themeColor + "26";
          }
        };

        colEl.appendChild(btn);
      }
      grid.appendChild(colEl);
    }
    boardEl.appendChild(grid);
    wrap.appendChild(boardEl);

    // Play again
    if (gameState !== "playing") {
      const again = document.createElement("div");
      again.className = "c4-play-again";
      const btn = document.createElement("button");
      btn.style.backgroundColor = themeColor;
      btn.textContent = "Play Again";
      btn.onclick = resetGame;
      again.appendChild(btn);
      wrap.appendChild(again);
    }

    return wrap;
  }

  render();

  // ---------------------------------------------------------------------
  // Public controller
  // ---------------------------------------------------------------------
  return {
    destroy() {
      destroyed = true;
      if (cpuTimer) clearTimeout(cpuTimer);
      container.innerHTML = "";
    },
    reset: resetGame,
  };
}

// Support both plain <script> usage and module bundlers.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { initConnectFourGame };
}
