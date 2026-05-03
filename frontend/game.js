(function () {
    'use strict';

    // Difficulty → UCI Skill Level + engine think time (ms)
    const DIFFICULTY = {
        beginner:     { level: 2,  movetime: 300  },
        intermediate: { level: 8,  movetime: 800  },
        hard:         { level: 15, movetime: 1500 },
        max:          { level: 20, movetime: 3000 }
    };

    let board          = null;
    let chess          = new Chess();
    let ws             = null;
    let waitingForMove = false;
    let currentDiff    = 'intermediate';
    let lastMove       = null;       // { from, to } of most recent move
    let pendingPromotion = null;     // { from, to } awaiting picker choice

    // ── Status display ────────────────────────────────────────────────────────

    function setStatus(text, cls) {
        const el = document.getElementById('status');
        el.textContent = text;
        el.className = 'status-text' + (cls ? ' ' + cls : '');
    }

    // ── Square highlighting helpers ───────────────────────────────────────────
    // chessboard.js renders each square as `<div class="square-e4 ...">`.
    // We add our own classes on top via jQuery; the library's redraws preserve
    // them as long as we re-apply after each position() call.

    function $sq(square) {
        return $('#board .square-' + square);
    }

    function clearLegalHints() {
        $('#board .square-55d63').removeClass('move-dot move-capture');
    }

    function showLegalHints(source) {
        clearLegalHints();
        const moves = chess.moves({ square: source, verbose: true });
        for (const m of moves) {
            if (m.captured || m.flags.indexOf('e') !== -1) {
                $sq(m.to).addClass('move-capture');
            } else {
                $sq(m.to).addClass('move-dot');
            }
        }
    }

    function clearLastMoveHighlight() {
        $('#board .square-55d63').removeClass('last-move');
    }

    function showLastMoveHighlight() {
        clearLastMoveHighlight();
        if (lastMove) {
            $sq(lastMove.from).addClass('last-move');
            $sq(lastMove.to).addClass('last-move');
        }
    }

    function clearCheckHighlight() {
        $('#board .square-55d63').removeClass('in-check');
    }

    function showCheckHighlight() {
        clearCheckHighlight();
        if (!chess.in_check() && !chess.in_checkmate()) return;
        const sideInCheck = chess.turn(); // the player to move is the one in check
        const grid = chess.board();       // 8×8, [0] = rank 8
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const piece = grid[r][f];
                if (piece && piece.type === 'k' && piece.color === sideInCheck) {
                    const file = 'abcdefgh'[f];
                    const rank = 8 - r;
                    $sq(file + rank).addClass('in-check');
                    return;
                }
            }
        }
    }

    // Re-apply all persistent highlights. chessboard.js's position() rebuilds
    // square DOM, so any classes we added are wiped — call this after every redraw.
    function refreshHighlights() {
        showLastMoveHighlight();
        showCheckHighlight();
    }

    // ── Game state check ──────────────────────────────────────────────────────

    function evaluatePosition() {
        if (chess.in_checkmate()) {
            const youWon = chess.turn() === 'b';
            setStatus(youWon ? 'Checkmate — You win!' : 'Checkmate — Stockfish wins!',
                      youWon ? 'win' : 'checkmate');
            showGameOver(
                youWon ? '1-0' : '0-1',
                youWon ? 'Checkmate — You win!' : 'Checkmate — Stockfish wins!'
            );
            return true;
        }
        if (chess.in_stalemate()) {
            setStatus('Stalemate — Draw', 'draw');
            showGameOver('½-½', 'Stalemate');
            return true;
        }
        if (chess.insufficient_material()) {
            setStatus('Insufficient material — Draw', 'draw');
            showGameOver('½-½', 'Draw by insufficient material');
            return true;
        }
        if (chess.in_threefold_repetition()) {
            setStatus('Threefold repetition — Draw', 'draw');
            showGameOver('½-½', 'Draw by threefold repetition');
            return true;
        }
        if (chess.in_draw()) {
            setStatus('Draw', 'draw');
            showGameOver('½-½', 'Draw (50-move rule)');
            return true;
        }
        if (chess.in_check()) {
            setStatus(
                chess.turn() === 'w' ? 'Check — your move' : 'Check — engine thinking…',
                'check'
            );
            return false;
        }
        return false;
    }

    // ── Game-over modal ───────────────────────────────────────────────────────

    function showGameOver(result, reason) {
        document.getElementById('gameOverResult').textContent = result;
        document.getElementById('gameOverReason').textContent = reason;
        document.getElementById('gameOverModal').classList.add('show');
    }

    function hideGameOver() {
        document.getElementById('gameOverModal').classList.remove('show');
    }

    // ── Promotion picker ──────────────────────────────────────────────────────

    function isPromotionMove(source, target, piece) {
        if (piece[1] !== 'P') return false;
        const targetRank = target[1];
        return (piece[0] === 'w' && targetRank === '8') ||
               (piece[0] === 'b' && targetRank === '1');
    }

    function showPromotionPicker(source, target, color) {
        pendingPromotion = { from: source, to: target };
        const picker = document.getElementById('promotionPicker');
        // Anchor picker over the destination square
        const sq = $sq(target);
        const sqOffset = sq.offset();
        const boardOffset = $('#board').offset();
        picker.style.top  = (sqOffset.top  - boardOffset.top) + 'px';
        picker.style.left = (sqOffset.left - boardOffset.left) + 'px';
        picker.style.width  = sq.width()  + 'px';
        // Render piece options
        picker.innerHTML = '';
        for (const p of ['q', 'r', 'b', 'n']) {
            const img = document.createElement('img');
            img.src = 'img/chesspieces/' + color + p.toUpperCase() + '.png';
            img.dataset.piece = p;
            img.title = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p];
            img.addEventListener('click', function () {
                completePromotion(p);
            });
            picker.appendChild(img);
        }
        picker.classList.add('show');
    }

    function hidePromotionPicker() {
        document.getElementById('promotionPicker').classList.remove('show');
    }

    function cancelPromotion() {
        if (!pendingPromotion) return;
        pendingPromotion = null;
        hidePromotionPicker();
        board.position(chess.fen());
        refreshHighlights();
    }

    function completePromotion(piece) {
        if (!pendingPromotion) return;
        const move = chess.move({
            from: pendingPromotion.from,
            to: pendingPromotion.to,
            promotion: piece
        });
        pendingPromotion = null;
        hidePromotionPicker();
        if (move === null) {
            // Shouldn't happen — picker only opens for legal pawn-to-back-rank moves
            board.position(chess.fen());
            refreshHighlights();
            return;
        }
        lastMove = { from: move.from, to: move.to };
        board.position(chess.fen());
        refreshHighlights();
        if (!evaluatePosition() && !chess.game_over()) {
            askEngine();
        }
    }

    // ── Engine request ────────────────────────────────────────────────────────

    function askEngine() {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setStatus('Not connected to server');
            return;
        }
        waitingForMove = true;
        setStatus('Stockfish thinking…');
        const d = DIFFICULTY[currentDiff];
        ws.send(JSON.stringify({
            type: 'getMove',
            fen: chess.fen(),
            movetime: d.movetime
        }));
    }

    // ── WebSocket ─────────────────────────────────────────────────────────────

    function connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + location.host + '/ws');

        ws.onopen = function () {
            const d = DIFFICULTY[currentDiff];
            ws.send(JSON.stringify({ type: 'setDifficulty', level: d.level }));
            setStatus('Your turn');
        };

        ws.onmessage = function (event) {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }

            if (msg.type !== 'move') return;
            waitingForMove = false;

            if (!msg.move) {
                evaluatePosition();
                return;
            }

            const from      = msg.move.substring(0, 2);
            const to        = msg.move.substring(2, 4);
            const promotion = msg.move.length > 4 ? msg.move[4] : undefined;

            const moveObj = { from: from, to: to };
            if (promotion) moveObj.promotion = promotion;

            const result = chess.move(moveObj);
            if (result) lastMove = { from: result.from, to: result.to };
            board.position(chess.fen());
            refreshHighlights();

            if (!evaluatePosition()) {
                setStatus('Your turn');
            }
        };

        ws.onerror = function () {
            setStatus('Connection error — reload to reconnect');
        };

        ws.onclose = function () {
            setStatus('Disconnected from server');
        };
    }

    // ── Board event handlers ──────────────────────────────────────────────────

    function onDragStart(source, piece) {
        if (waitingForMove)        return false;
        if (chess.game_over())     return false;
        if (piece.startsWith('b')) return false;
        if (chess.turn() !== 'w')  return false;
        showLegalHints(source);
        return true;
    }

    function onDrop(source, target) {
        clearLegalHints();

        // Promotion: defer the move until the user picks a piece
        const piece = board.position()[source];
        if (piece && isPromotionMove(source, target, piece)) {
            // Validate the target is reachable before opening the picker
            const candidates = chess.moves({ square: source, verbose: true });
            const reaches = candidates.some(m => m.to === target);
            if (!reaches) return 'snapback';
            showPromotionPicker(source, target, piece[0]);
            return; // leaves the piece visually on target until picker resolves
        }

        const move = chess.move({ from: source, to: target, promotion: 'q' });
        if (move === null) return 'snapback';
        lastMove = { from: move.from, to: move.to };

        if (!evaluatePosition() && !chess.game_over()) {
            askEngine();
        }
    }

    function onSnapEnd() {
        board.position(chess.fen());
        refreshHighlights();
    }

    function onMouseoverSquare(square, piece) {
        // Hover hints only when it would be the player's legal pickup
        if (waitingForMove || chess.game_over()) return;
        if (chess.turn() !== 'w') return;
        if (!piece || piece[0] !== 'w') return;
        showLegalHints(square);
    }

    function onMouseoutSquare() {
        // Don't clear if currently dragging — onDragStart re-applies anyway,
        // but during a drag the user expects the dots to persist.
        // chessboard.js calls onMouseoutSquare even during drag, so we use a
        // simple guard: don't clear if any square is currently classed move-dot
        // AND a piece is being held. Easiest: always recompute on mouseover,
        // and clear here only when not in a drag.
        // For now, clearing is safe: onDragStart re-shows the hints.
        clearLegalHints();
    }

    // ── Board initialisation ──────────────────────────────────────────────────

    function initBoard() {
        board = Chessboard('board', {
            draggable:    true,
            position:     'start',
            onDragStart:  onDragStart,
            onDrop:       onDrop,
            onSnapEnd:    onSnapEnd,
            onMouseoverSquare: onMouseoverSquare,
            onMouseoutSquare:  onMouseoutSquare,
            pieceTheme:   'img/chesspieces/{piece}.png',
            snapbackSpeed: 200,
            snapSpeed:     80
        });

        window.addEventListener('resize', function () { board.resize(); refreshHighlights(); });
    }

    // ── Controls ──────────────────────────────────────────────────────────────

    function startNewGame() {
        chess.reset();
        board.position('start');
        waitingForMove = false;
        lastMove = null;
        pendingPromotion = null;
        clearLegalHints();
        clearLastMoveHighlight();
        clearCheckHighlight();
        hideGameOver();
        hidePromotionPicker();

        const d = DIFFICULTY[currentDiff];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'newGame', level: d.level }));
        }
        setStatus('Your turn');
    }

    document.getElementById('newGameBtn').addEventListener('click', startNewGame);

    document.getElementById('rotateBoardBtn').addEventListener('click', function () {
        if (pendingPromotion) cancelPromotion();
        board.flip();
        refreshHighlights();
    });

    document.getElementById('difficultySelect').addEventListener('change', function (e) {
        currentDiff = e.target.value;
        const d = DIFFICULTY[currentDiff];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'setDifficulty', level: d.level }));
        }
    });

    // Game-over modal buttons
    document.getElementById('gameOverNewGame').addEventListener('click', startNewGame);
    document.getElementById('gameOverClose').addEventListener('click', hideGameOver);

    // Esc cancels promotion
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && pendingPromotion) cancelPromotion();
    });

    // Click outside the picker cancels promotion
    document.addEventListener('mousedown', function (e) {
        if (!pendingPromotion) return;
        const picker = document.getElementById('promotionPicker');
        if (!picker.contains(e.target)) cancelPromotion();
    });

    // ── Boot ──────────────────────────────────────────────────────────────────

    setStatus('Connecting…');
    initBoard();
    connect();

}());
