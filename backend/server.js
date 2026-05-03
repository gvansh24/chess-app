const { WebSocketServer, WebSocket } = require('ws');
const { spawn } = require('child_process');

const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws) => {
    console.log('Client connected');

    const stockfish = spawn('stockfish');
    let lineBuffer = '';

    stockfish.on('error', (err) => {
        console.error('Failed to start Stockfish:', err.message);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'engineError', message: err.message }));
            ws.close(1011, 'engine unavailable');
        }
    });

    // Initialise UCI and set a safe default skill level
    stockfish.stdin.write('uci\n');
    stockfish.stdin.write('setoption name Skill Level value 8\n');
    stockfish.stdin.write('isready\n');

    stockfish.stdout.on('data', (data) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        // Keep any incomplete trailing line in the buffer
        lineBuffer = lines.pop();

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('bestmove')) {
                const parts = trimmed.split(' ');
                const move = parts[1];
                if (ws.readyState === WebSocket.OPEN) {
                    if (move && move !== '(none)') {
                        ws.send(JSON.stringify({ type: 'move', move }));
                    } else {
                        ws.send(JSON.stringify({ type: 'move', move: null }));
                    }
                }
            }
        }
    });

    stockfish.stderr.on('data', (data) => {
        console.error('Stockfish stderr:', data.toString().trim());
    });

    stockfish.on('exit', (code) => {
        console.log(`Stockfish exited with code ${code}`);
    });

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());

            if (msg.type === 'setDifficulty') {
                // msg.level: 0-20 UCI Skill Level
                stockfish.stdin.write(`setoption name Skill Level value ${msg.level}\n`);
            } else if (msg.type === 'newGame') {
                stockfish.stdin.write('ucinewgame\n');
                if (msg.level !== undefined) {
                    stockfish.stdin.write(`setoption name Skill Level value ${msg.level}\n`);
                }
                stockfish.stdin.write('isready\n');
            } else if (msg.type === 'getMove') {
                // msg.fen: current position FEN
                // msg.movetime: milliseconds to think
                stockfish.stdin.write(`position fen ${msg.fen}\n`);
                stockfish.stdin.write(`go movetime ${msg.movetime || 1000}\n`);
            }
        } catch (e) {
            console.error('Error handling client message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected — killing Stockfish');
        try { stockfish.kill(); } catch (_) {}
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

console.log('Chess WebSocket server listening on port 3000');
