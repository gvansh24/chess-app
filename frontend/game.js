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

    // ── Status display ────────────────────────────────────────────────────────

    function setStatus(text, cls) {
        const el = document.getElementById('status');
        el.textContent = text;
        el.className = 'status-text' + (cls ? ' ' + cls : '');
    }

    // ── Game state check ──────────────────────────────────────────────────────

    function evaluatePosition() {
        if (chess.in_checkmate()) {
            if (chess.turn() === 'b') {
                setStatus('Checkmate — You win!', 'win');
            } else {
                setStatus('Checkmate — Stockfish wins!', 'checkmate');
            }
            return true; // game over
        }
        if (chess.in_stalemate()) {
            setStatus('Stalemate — Draw', 'draw');
            return true;
        }
        if (chess.insufficient_material()) {
            setStatus('Insufficient material — Draw', 'draw');
            return true;
        }
        if (chess.in_threefold_repetition()) {
            setStatus('Threefold repetition — Draw', 'draw');
            return true;
        }
        if (chess.in_draw()) {
            setStatus('Draw', 'draw');
            return true;
        }
        if (chess.in_check()) {
            if (chess.turn() === 'w') {
                setStatus('Check — your move', 'check');
            } else {
                setStatus('Check — engine thinking…', 'check');
            }
            return false;
        }
        return false;
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
                // Engine has no legal move — shouldn't normally happen
                evaluatePosition();
                return;
            }

            // Parse the UCI move string (e.g. "e2e4" or "e7e8q")
            const from      = msg.move.substring(0, 2);
            const to        = msg.move.substring(2, 4);
            const promotion = msg.move.length > 4 ? msg.move[4] : undefined;

            const moveObj = { from: from, to: to };
            if (promotion) moveObj.promotion = promotion;

            chess.move(moveObj);
            board.position(chess.fen());

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
        // Prevent any move while waiting for engine or game is over
        if (waitingForMove)    return false;
        if (chess.game_over()) return false;
        // Player is always White
        if (piece.startsWith('b')) return false;
        // Only move on White's turn
        if (chess.turn() !== 'w') return false;
        return true;
    }

    function onDrop(source, target) {
        // Auto-promote to queen for simplicity
        const move = chess.move({
            from:      source,
            to:        target,
            promotion: 'q'
        });

        if (move === null) return 'snapback';

        // After player's move, check for game over before asking engine
        if (!evaluatePosition() && !chess.game_over()) {
            askEngine();
        }
    }

    function onSnapEnd() {
        board.position(chess.fen());
    }

    // ── Board initialisation ──────────────────────────────────────────────────

    function initBoard() {
        board = Chessboard('board', {
            draggable:    true,
            position:     'start',
            onDragStart:  onDragStart,
            onDrop:       onDrop,
            onSnapEnd:    onSnapEnd,
            pieceTheme:   'https://unpkg.com/chessboardjs@1.0.0/www/img/chesspieces/wikipedia/{piece}.png',
            snapbackSpeed: 200,
            snapSpeed:     80
        });

        window.addEventListener('resize', function () { board.resize(); });
    }

    // ── Controls ──────────────────────────────────────────────────────────────

    document.getElementById('newGameBtn').addEventListener('click', function () {
        chess.reset();
        board.position('start');
        waitingForMove = false;

        const d = DIFFICULTY[currentDiff];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'newGame', level: d.level }));
        }
        setStatus('Your turn');
    });

    document.getElementById('flipBoardBtn').addEventListener('click', function () {
        board.flip();
    });

    document.getElementById('difficultySelect').addEventListener('change', function (e) {
        currentDiff = e.target.value;
        const d = DIFFICULTY[currentDiff];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'setDifficulty', level: d.level }));
        }
    });

    // ── Boot ──────────────────────────────────────────────────────────────────

    setStatus('Connecting…');
    initBoard();
    connect();

}());
