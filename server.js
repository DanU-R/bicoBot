const express = require('express');
const path = require('path');
const { runBot } = require('./bicolink_bot');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Track active sessions
const sessions = new Map();

// SSE endpoint - stream bot logs secara real-time
app.get('/stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Kirim ping agar koneksi tetap hidup
    const ping = setInterval(() => res.write(': ping\n\n'), 10000);

    // Simpan SSE response untuk session ini
    sessions.set(sessionId, res);

    req.on('close', () => {
        clearInterval(ping);
        sessions.delete(sessionId);
    });
});

// POST endpoint - mulai bot dengan URL yang diberikan
app.post('/run', async (req, res) => {
    const { url, sessionId } = req.body;

    if (!url || !url.startsWith('http')) {
        return res.status(400).json({ error: 'URL tidak valid' });
    }
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID diperlukan' });
    }

    res.json({ status: 'started' });

    // Fungsi log yang akan mengirim event ke SSE client
    const sendLog = (type, message) => {
        const client = sessions.get(sessionId);
        if (client) {
            const data = JSON.stringify({ type, message, ts: Date.now() });
            client.write(`data: ${data}\n\n`);
        }
    };

    try {
        sendLog('info', `🚀 Memulai bot untuk: ${url}`);
        const codes = await runBot(url, sendLog);

        if (codes && codes.length > 0) {
            sendLog('success', `✅ Berhasil! Ditemukan ${codes.length} kode:`);
            codes.forEach((code, i) => sendLog('code', `[${i + 1}] ${code}`));
        } else {
            sendLog('warn', '⚠️ Bot selesai tapi tidak ada kode yang ditemukan.');
        }
        sendLog('done', 'Otomasi selesai.');
    } catch (err) {
        sendLog('error', `❌ Error: ${err.message}`);
        sendLog('done', 'Otomasi selesai dengan error.');
    } finally {
        // Tutup SSE setelah selesai
        const client = sessions.get(sessionId);
        if (client) {
            client.write(`data: ${JSON.stringify({ type: 'close' })}\n\n`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`\n🌐 Bicolink Bot Web UI running at http://localhost:${PORT}\n`);
});
