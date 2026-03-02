# 🤖 bicoBot

Otomasi bypass safelink Bicolink dan ekstraksi kode file menggunakan Puppeteer dengan web UI real-time.

## Fitur

- ✅ Bypass multi-step safelink Bicolink secara otomatis
- 🌐 Web UI dengan log real-time (SSE streaming)
- 📋 Ekstraksi kode `v_FilesPanXBot_` dengan tombol copy
- 🛡️ Menggunakan `puppeteer-extra-plugin-stealth` untuk bypass Cloudflare Turnstile
- 🚀 Headless mode (tidak perlu GUI browser)

## Instalasi

```bash
npm install
```

## Penggunaan

### Web UI (Rekomendasi)

```bash
node server.js
```

Buka browser ke **http://localhost:3000**, masukkan link Bicolink, klik **▶ Jalankan**.

### CLI

```bash
node bicolink_bot.js
# atau
node bicolink_bot.js https://bicolink.com/
```

## Alur Bypass

1. **Step 1** — Buka URL bicolink, klik "Generate Text"
2. **Step 2** — Bypass pop-up via `a#image3` hingga berpindah ke halaman artikel
3. **Step 3** — Tunggu timer selesai, navigasi via `#wpsafe-link`
4. **Step 4** — Bypass fake captcha + Cloudflare Turnstile → klik "Get Link"
5. **Step 5** — Masukkan password `***` di Snote, ekstrak kode

## Dependencies

- [puppeteer-extra](https://github.com/berstend/puppeteer-extra)
- [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [express](https://expressjs.com/)
