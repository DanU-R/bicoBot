const express = require('express');
const path = require('path');
const { runBot } = require('./bicolink_bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

app.get('/stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(`data: ${JSON.stringify({ type: 'info', message: 'Terhubung ke server. Menunggu bot...', ts: Date.now() })}\n\n`);

    const ping = setInterval(() => res.write(': ping\n\n'), 10000);
    sessions.set(sessionId, res);

    req.on('close', () => {
        clearInterval(ping);
        sessions.delete(sessionId);
    });
});

app.post('/run', async (req, res) => {
    const { url, sessionId } = req.body;

    if (!url || !url.startsWith('http')) {
        return res.status(400).json({ error: 'URL tidak valid' });
    }
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID diperlukan' });
    }

    res.json({ status: 'started' });

    const sendLog = (type, message) => {
        const client = sessions.get(sessionId);
        if (client) {
            client.write(`data: ${JSON.stringify({ type, message, ts: Date.now() })}\n\n`);
        }
    };

    try {
        sendLog('info', `Memulai bot untuk: ${url}`);
        const codes = await runBot(url, sendLog);

        if (codes && codes.length > 0) {
            sendLog('success', `Selesai! Ditemukan ${codes.length} kode.`);
        } else {
            sendLog('warn', 'Bot selesai tapi tidak ada kode yang ditemukan.');
        }
        sendLog('done', 'Otomasi selesai.');
    } catch (err) {
        sendLog('error', `Error: ${err.message}`);
        sendLog('done', 'Otomasi selesai dengan error.');
    } finally {
        const client = sessions.get(sessionId);
        if (client) {
            client.write(`data: ${JSON.stringify({ type: 'close' })}\n\n`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Bicolink Bot Web UI running at http://localhost:${PORT}`);
});
