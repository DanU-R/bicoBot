const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const readline = require('readline');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeUrl = (page) => { try { return page.url(); } catch (e) { return ''; } };
const safeEval = async (page, fn, ...args) => {
    try { return await page.evaluate(fn, ...args); } catch (e) { return null; }
};

// ===================================================================
// FUNGSI UTAMA BOT
// ===================================================================
async function runBot(targetUrl, onLog) {
    const log = (type, msg) => {
        const message = String(msg);
        if (onLog) onLog(type, message);
        else console.log(message);
    };

    if (!targetUrl || !targetUrl.startsWith('http')) {
        throw new Error('URL tidak valid.');
    }

    const extractedCodes = [];

    // Gunakan system Chromium di Railway (via nixpacks), atau bundled Chromium di lokal
    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--single-process'
        ]
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);


    // Domain VALID safelink
    const VALID_DOMAINS = ['go.bicolink.net', 'bicolink.com', 'bewbin.com', 'newsbico.com',
        'lajangspot.web.id', 'snote.vip', 'snote.app', 'zireemilsoude.net', 'coinershop.com'];

    let mainPage;
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (!newPage || !mainPage) return;
                if (newPage.target()._targetId === mainPage.target()._targetId) return;
                await sleep(1500);
                let newUrl = '';
                try { newUrl = newPage.url(); } catch (e) { }
                const isValid = VALID_DOMAINS.some(d => newUrl.includes(d));
                if (isValid) {
                    log('info', `--> [TAB PINDAH] Berpindah ke: ${newUrl.substring(0, 60)}`);
                    mainPage = newPage;
                    try { await newPage.bringToFront(); } catch (e) { }
                } else if (newUrl && newUrl !== 'about:blank') {
                    log('info', `--> [POPUP DITUTUP] Tab iklan: ${newUrl.substring(0, 50)}`);
                    newPage.close().catch(() => { });
                } else {
                    setTimeout(async () => {
                        try {
                            const u = newPage.url();
                            if (!VALID_DOMAINS.some(d => u.includes(d))) newPage.close().catch(() => { });
                        } catch (e) { }
                    }, 2500);
                }
            } catch (e) { }
        }
    });

    try {
        mainPage = await browser.newPage();
        await mainPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await mainPage.setViewport({ width: 1280, height: 800 });

        // ======================================================================
        // STEP 1: INITIAL ACCESS
        // ======================================================================
        log('step', '\n--- STEP 1: INITIAL ACCESS ---');
        log('info', `Membuka URL: ${targetUrl}`);
        await mainPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        log('info', 'Menunggu 20 detik untuk inisialisasi...');
        await sleep(20000);

        log('info', 'Mencari tombol Generate Text...');
        const generateClicked = await safeEval(mainPage, () => {
            const candidates = [
                document.querySelector('a[href="#wpsafegenerate"]'),
                document.querySelector('#wpsafegenerate'),
                ...Array.from(document.querySelectorAll('a, button, img')).filter(el => {
                    const t = (el.innerText || el.alt || el.src || '').toLowerCase();
                    return t.includes('generate') || t.includes('mulai') || t.includes('start');
                })
            ].filter(Boolean);
            const el = candidates[0];
            if (el) { el.click(); return true; }
            return false;
        });
        if (generateClicked) log('success', 'Tombol Generate Text berhasil diklik.');
        else log('warn', 'Tombol Generate Text tidak ditemukan, melanjutkan...');

        // ======================================================================
        // STEP 2: BYPASS POP-UPS (IMAGE3 / OPEN BUTTON)
        // ======================================================================
        log('step', '\n--- STEP 2: BYPASSING POP-UPS (IMAGE3 LOGIC) ---');
        const bicolinkHost = new URL(targetUrl).hostname;

        for (let i = 0; i < 30; i++) {
            const currentUrl = safeUrl(mainPage);
            if (!currentUrl.includes(bicolinkHost)) {
                log('success', `[+] Sudah berpindah ke: ${currentUrl}`);
                break;
            }
            await safeEval(mainPage, () => {
                const el = document.querySelector('a#image3, img#image3, #image3');
                if (el) { el.click(); return true; }
                return false;
            });
            await sleep(3000);
        }

        // ======================================================================
        // STEP 3: NEXT PAGE TRANSITION (cari #wpsafe-link)
        // ======================================================================
        log('step', '\n--- STEP 3: NEXT PAGE TRANSITION ---');
        log('info', `URL saat ini: ${safeUrl(mainPage)}. Menunggu 20 detik...`);
        await sleep(20000);
        log('info', 'Mencari tombol GO TO LINK / wpsafe-btn...');

        for (let i = 0; i < 30; i++) {
            try {
                const url = safeUrl(mainPage);
                if (url.includes('go.bicolink.net')) {
                    log('success', `[+] Sudah mencapai halaman captcha Bicolink: ${url}`);
                    break;
                }

                const result = await mainPage.evaluate(() => {
                    const isVisible = (el) => {
                        if (!el) return false;
                        const style = window.getComputedStyle(el);
                        if (style.display === 'none' || style.visibility === 'hidden') return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    };

                    // PRIORITAS 1: #wpsafe-link visible
                    const wpLink = document.querySelector('#wpsafe-link');
                    if (wpLink && isVisible(wpLink)) {
                        const anchor = wpLink.querySelector('a[href]');
                        if (anchor && anchor.href) {
                            const btnText = (anchor.innerText || anchor.textContent || '').trim().substring(0, 30);
                            window.location.href = anchor.href;
                            return `navigated: ${btnText || anchor.href.substring(0, 30)}`;
                        }
                        const btn = wpLink.querySelector('button, a');
                        if (btn) { btn.click(); return 'wpsafe clicked'; }
                    }

                    // PRIORITAS 2: Tutup popup overlay
                    for (const sel of ['button.close', '[aria-label="Close"]', '[aria-label="close"]', '.modal-close', '.popup-close']) {
                        const el = document.querySelector(sel);
                        if (el && isVisible(el)) { el.click(); return 'popup_closed'; }
                    }
                    const closeEl = Array.from(document.querySelectorAll('button, div, span')).find(el => {
                        const txt = (el.innerText || el.textContent || '').trim();
                        return isVisible(el) && (txt === '×' || txt === '✕' || txt === '✖');
                    });
                    if (closeEl) { closeEl.click(); return 'popup_closed'; }

                    // PRIORITAS 3: Scroll dan cek timer
                    window.scrollBy(0, 150);
                    const timer = document.querySelector('#timer, .timer, #countdown');
                    const timerVal = timer ? timer.innerText.trim() : null;
                    return timerVal ? `waiting_timer: ${timerVal}s` : null;
                });

                if (result && result.startsWith('navigated')) {
                    log('info', `[+] ${result} (Percobaan ${i + 1}). Menunggu loading...`);
                    await sleep(8000);
                } else if (result && result.startsWith('wpsafe')) {
                    log('info', `[+] ${result} (Percobaan ${i + 1}). Menunggu...`);
                    await sleep(7000);
                } else if (result && result.startsWith('popup_closed')) {
                    log('info', `[!] Popup iklan ditutup (Percobaan ${i + 1}).`);
                    await sleep(1500);
                } else if (result && result.startsWith('waiting_timer')) {
                    log('info', `  [${i + 1}] ${result} - URL: ${safeUrl(mainPage).substring(0, 50)}`);
                    await sleep(3000);
                } else {
                    if (i % 3 === 0) log('info', `  [${i + 1}] Mencari #wpsafe-link di: ${safeUrl(mainPage).substring(0, 60)}`);
                    await sleep(2000);
                }
            } catch (frameErr) {
                log('warn', `[!] Frame berpindah: ${frameErr.message.substring(0, 50)}`);
                await sleep(3000);
            }
        }

        await sleep(5000);

        // ======================================================================
        // STEP 4: FAKE CAPTCHA & CLOUDFLARE TURNSTILE
        // ======================================================================
        log('step', '\n--- STEP 4: CAPTCHA & TURNSTILE BYPASS ---');
        log('info', `URL saat ini: ${safeUrl(mainPage)}`);

        log('info', 'Menangani Fake Captcha (I\'m not a robots)...');
        for (let i = 0; i < 10; i++) {
            const captchaResult = await safeEval(mainPage, () => {
                const el = document.querySelector('#fake-captcha, #boxToToggle #fake-captcha, #fake-captcha-container #fake-captcha');
                if (!el) return 'not_found';
                const isPassed = el.classList.contains('pass') || (el.innerHTML || '').includes('checked');
                if (isPassed) return 'already_passed';
                el.scrollIntoView({ block: 'center' });
                el.click();
                return 'clicked';
            });

            if (captchaResult === 'not_found') {
                log('info', 'Fake captcha tidak ditemukan, dilanjutkan.');
                break;
            } else if (captchaResult === 'already_passed') {
                log('success', 'Fake captcha sudah tercentang (Pass).');
                await safeEval(mainPage, () => window.scrollBy(0, 250));
                await sleep(1500);
                break;
            } else if (captchaResult === 'clicked') {
                log('info', `Fake captcha diklik (percobaan ke-${i + 1})...`);
                await sleep(3000);
                const currentUrl = safeUrl(mainPage);
                if (currentUrl.includes('shopee') || currentUrl.includes('lazada') || currentUrl.includes('tokopedia') || currentUrl.includes('telegram')) {
                    log('warn', `-> Fake redirect ke ${currentUrl}. Kembali...`);
                    try { await mainPage.goBack({ waitUntil: 'domcontentloaded' }); } catch (e) { }
                    await sleep(3000);
                    continue;
                }
                const nowPassed = await safeEval(mainPage, () => {
                    const el = document.querySelector('#fake-captcha, #fake-captcha-container #fake-captcha');
                    return el && (el.classList.contains('pass') || el.querySelector('input[type="checkbox"]:checked'));
                });
                if (nowPassed) {
                    log('success', '[+] Fake captcha berhasil tercentang!');
                    await sleep(1000);
                    await safeEval(mainPage, () => window.scrollBy(0, 250));
                    await sleep(1500);
                    break;
                }
            }
        }

        // Turnstile
        log('info', '\nMencari Cloudflare Turnstile...');
        try {
            await mainPage.waitForSelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]', { timeout: 30000 });
            log('success', '[+] Widget Turnstile ditemukan. Menunggu 3 detik...');
            await sleep(3000);

            await safeEval(mainPage, () => window.scrollBy(0, 200));
            await sleep(1000);

            const turnstileIframe = await mainPage.$('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');
            if (turnstileIframe) {
                const box = await turnstileIframe.boundingBox();
                if (box) {
                    const clickX = box.x + 25;
                    const clickY = box.y + (box.height / 2);
                    log('info', `[+] Klik Turnstile checkbox di (${Math.round(clickX)}, ${Math.round(clickY)})...`);
                    await mainPage.mouse.move(clickX - 60, clickY - 30, { steps: 10 });
                    await sleep(300 + Math.floor(Math.random() * 200));
                    await mainPage.mouse.move(clickX, clickY, { steps: 10 });
                    await sleep(150 + Math.floor(Math.random() * 100));
                    await mainPage.mouse.click(clickX, clickY, { delay: 120 + Math.floor(Math.random() * 80) });
                    log('info', '[+] Klik Turnstile selesai. Menunggu verifikasi...');
                }
            }

            for (let t = 0; t < 10; t++) {
                const status = await safeEval(mainPage, () => {
                    const cfInput = document.querySelector('input[name="cf-turnstile-response"]');
                    if (cfInput && cfInput.value && cfInput.value.length > 10) return 'verified';
                    const getLink = document.querySelector('#getwpsafelink, a[id="getwpsafelink"]');
                    if (getLink) {
                        const s = window.getComputedStyle(getLink);
                        if (s.display !== 'none' && s.visibility !== 'hidden') return 'getlink_ready';
                    }
                    return 'waiting';
                });
                if (status !== 'waiting') {
                    log('success', `[+] Turnstile terverifikasi! (${status})`);
                    break;
                }
                log('info', `  Menunggu verifikasi Turnstile... (${t + 1}/10)`);
                await sleep(3000);
            }
        } catch (e) {
            log('warn', 'Turnstile: ' + e.message.substring(0, 80));
        }

        await sleep(2000);

        // Get Link
        log('info', '\nMencari tombol Get Link...');
        for (let i = 0; i < 5; i++) {
            const getLinkResult = await safeEval(mainPage, () => {
                const selectors = ['a.btn-primary', '#getwpsafelink', 'button#getwpsafelink', 'a[href*="snote"]', '#wpsafe-generate-link', 'a.btn.btn-primary'];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                            el.scrollIntoView({ block: 'center' });
                            el.click();
                            return el.href || el.innerText || 'clicked';
                        }
                    }
                }
                return null;
            });

            if (getLinkResult) {
                log('success', `[+] Tombol Get Link diklik: ${getLinkResult}`);
                await sleep(5000);
                break;
            }
            await sleep(3000);
        }

        // ======================================================================
        // STEP 5: SNOTE - PASSWORD & EXTRACTION
        // ======================================================================
        log('step', '\n--- STEP 5: SNOTE PASSWORD & EXTRACTION ---');
        try {
            await mainPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) { }

        log('info', `URL saat ini: ${safeUrl(mainPage)}`);

        if (!safeUrl(mainPage).includes('snote')) {
            log('warn', 'Tidak mencapai halaman snote. URL terakhir: ' + safeUrl(mainPage));
        } else {
            try {
                const pwSelectors = ['input[name="password"]', 'input[type="password"]', 'input[placeholder*="assword" i]'];
                let pwInput = null;
                for (const sel of pwSelectors) {
                    try {
                        await mainPage.waitForSelector(sel, { timeout: 8000 });
                        pwInput = sel;
                        break;
                    } catch (e) { }
                }

                if (!pwInput) throw new Error('Input password tidak ditemukan');

                await mainPage.click(pwInput);
                await mainPage.type(pwInput, 'yuri', { delay: 80 });
                log('info', '[+] Password "yuri" dimasukkan.');

                const submitted = await safeEval(mainPage, () => {
                    const pwEl = document.querySelector('input[name="password"], input[type="password"]');
                    if (!pwEl) return false;
                    const form = pwEl.closest('form');
                    if (form) {
                        const btn = form.querySelector('button[type="submit"], input[type="submit"], button');
                        if (btn) { btn.click(); return true; }
                        form.submit();
                        return true;
                    }
                    const parent = pwEl.parentElement;
                    if (parent) {
                        const btn = parent.querySelector('button, input[type="submit"]') || parent.nextElementSibling;
                        if (btn && btn.click) { btn.click(); return true; }
                    }
                    return false;
                });

                if (submitted) {
                    log('success', '[+] Tombol submit diklik.');
                } else {
                    log('warn', '[!] Menekan Enter sebagai fallback...');
                    await mainPage.keyboard.press('Enter');
                }

                await sleep(5000);

                const bodyText = await safeEval(mainPage, () => document.body.innerText || '');
                // Regex generik: v_FilesPan + satu digit + Bot_ + karakter alfanumerik
                const codes = bodyText ? bodyText.match(/v_FilesPan\dBot_[A-Za-z0-9_\-]+/g) : null;

                if (codes && codes.length > 0) {
                    log('success', `\n========================================`);
                    log('success', 'KODE BERHASIL DIEKSTRAK:');
                    codes.forEach((code, idx) => {
                        log('code', `  [${idx + 1}] ${code}`);
                        extractedCodes.push(code);
                    });
                    log('success', '========================================');
                } else {
                    log('warn', 'Kode v_FilesPanXBot_ tidak ditemukan di halaman ini.');
                    log('info', '--- Konten halaman Snote (800 char) ---');
                    log('info', bodyText ? bodyText.substring(0, 800) : '(kosong)');
                    log('info', '---------------------------------------');
                }
            } catch (e) {
                log('error', 'Gagal pada step Snote: ' + e.message.substring(0, 100));
            }
        }

    } catch (err) {
        log('error', `Terjadi kesalahan: ${err.message}`);
        throw err;
    } finally {
        log('done', 'Browser ditutup.');
        await browser.close();
    }

    return extractedCodes;
}

module.exports = { runBot };

// ===================================================================
// MODE CLI (node bicolink_bot.js)
// ===================================================================
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        let url = args[0];
        if (!url) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            url = await new Promise(resolve => rl.question('Masukkan link Bicolink: ', a => { rl.close(); resolve(a.trim()); }));
        }
        try {
            const codes = await runBot(url);
            if (codes && codes.length > 0) {
                console.log('\n========================================');
                console.log('KODE BERHASIL DIEKSTRAK:');
                codes.forEach((c, i) => console.log(`  [${i + 1}] ${c}`));
                console.log('========================================');
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
        console.log('\nSelesai.');
    })();
}
