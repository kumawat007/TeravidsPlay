<div align="center">

# 🎬 TeravidsPlay
### Ultra-Fast, Ad-Free Cinema Cloud Video Player & 24/7 Telegram Channel Bot

[![Live Web Player](https://img.shields.io/badge/Live%20Player-teravidsplayer.vercel.app-0088cc?style=for-the-badge&logo=vercel&logoColor=white)](https://teravidsplayer.vercel.app)
[![Telegram Channel](https://img.shields.io/badge/Official%20Channel-@teravidsplayer-229ED9?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/teravidsplayer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

<br/>

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=kumawat007&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/kumawat007)

<br/>

**TeravidsPlay** is a production-grade, zero-ad cloud video streaming system and automated Telegram channel bot. It decodes TeraBox share links into direct, high-speed Full HD 1080p video streams with YouTube-style playback controls, 4X ultra turbo speed, 300% Web Audio amplification, and smart Telegram channel growth automation.

</div>

---

## 📑 Table of Contents
1. [Key Features](#-key-features)
2. [System Architecture](#-system-architecture)
3. [Component Breakdown](#-component-breakdown)
4. [Live Demo & Endpoints](#-live-demo--endpoints)
5. [Step-by-Step Deployment Guide](#-step-by-step-deployment-guide)
   - [A. Frontend Web Player (Vercel)](#a-frontend-web-player-vercel)
   - [B. Cloudflare Edge Worker (Proxy & API)](#b-cloudflare-edge-worker-proxy--api)
   - [C. Telegram Bot (Render.com 24/7 Free Web Service)](#c-telegram-bot-rendercom-247-free-web-service)
6. [Environment Variables Reference](#-environment-variables-reference)
7. [Security & SSRF Architecture](#-security--ssrf-architecture)
8. [Touch Gestures & Keyboard Shortcuts](#-touch-gestures--keyboard-shortcuts)
9. [Developer & Support](#-developer--support)
10. [License](#-license)

---

## ✨ Key Features

### 🍿 Pro YouTube-Style Cinema Player
- **Full-Width Theater Mode:** Viewport adapts dynamically to screen bounds (`height: min(84vh, calc(100vw * 9 / 16))`), eliminating empty black margins on desktop and mobile.
- **YouTube In-Viewport Controls:** YouTube red progress scrubber, buffer bar, time counter, volume slider, and responsive auto-hiding overlays.
- **Interactive Settings Popover Menu:** In-player gear menu (`⚙️`) with subviews for:
  - **Speed:** `0.5x`, `0.75x`, `1.0x (Normal)`, `1.25x`, `1.5x`, `2.0x`, and `4.0x Ultra Turbo`.
  - **Resolution:** `1080p Full HD`, `720p HD`, `480p SD`, and `Auto (Adaptive HLS)`.
  - **Audio Boost:** `100% (Standard)`, `150%`, `200%`, and `300% Ultra Boost`.
  - **Screen Fit:** `Fit (16:9)`, `Fill (Zoom & Crop)`, and `Stretch (Full Screen)`.
- **⚡ 4X Ultra Turbo Speed:** Long-press 350ms triggers 2X speed; holding past 1400ms unleashes 4X Ultra Turbo speed with animated on-screen HUD.
- **🔊 300% Web Audio Booster:** Web Audio API `AudioContext` & `GainNode` amplification allows up to 3× volume on quiet movie tracks.
- **📱 Smart Mobile Gestures:** Double-tap sides to skip 10s backward/forward with animated ripple arrows; vertical swipe on left side adjusts brightness, right side adjusts volume.
- **💾 Automatic Resume:** Automatically bookmarks current timestamp in `localStorage` and restores playback position upon returning.
- **🎨 Ambient Cinema Glow:** HTML5 Canvas projects dynamic color glow matching active video scenes onto the ambient background.

### 🤖 24/7 Telegram Channel Automation
- **Silent & Clean Link Replacement:** Channel bot instantly intercepts raw TeraBox URLs, resolves stream metadata silently, posts high-aesthetic media cards, and deletes the raw link to keep channels pristine.
- **Real Video Metadata Extraction:** Extracts genuine `server_filename`, exact file size (e.g., `1.85 GB`), and high-res thumbnail preview image.
- **Branded Dual Action Buttons:**
  - `🟢 ▶️ WATCH ONLINE (FULL HD) 🍿` (Direct link to Web Player with auto-unlock)
  - `⚡ 📥 FAST DIRECT DOWNLOAD 🚀` (Instant high-speed download link)
- **Telegram Channel Lock & Auto-Unlock (`&tg=1`):** Links posted to Telegram include the `&tg=1` auto-unlock token, allowing channel subscribers immediate access without friction, while casual web visitors are guided to join `@teravidsplayer`.

### 🛡️ Enterprise-Grade Security
- **Strict SSRF Domain Allowlist:** Only verified TeraBox CDN hosts (`*.terabox.com`, `*.1024terabox.com`, `*.baidupcs.com`, `*.bdydns.com`, etc.) are processed; private IPs, loopbacks, and cloud metadata hostnames are blocked.
- **Authenticated Diagnostics:** Internal `/diag` endpoints require a secret `ADMIN_SECRET` bearer token or query key.
- **No-Cookie Operation:** Operates 100% freely without requiring personal user cookies or logins.

---

## 🏛️ System Architecture

```text
               +-------------------------------------------------------+
               |                  USER / TELEGRAM                     |
               +---------------------------+---------------------------+
                                           |
                    Posts TeraBox Link     | Clicks Watch Link
                                           v
+-------------------------------+      +--------------------------------+
|       TELEGRAM BOT            |      |      FRONTEND WEB PLAYER       |
|    (Render.com / Python)      |      |   (Vercel / HTML5 + JS ES6)   |
+---------------+---------------+      +---------------+----------------+
                |                                      |
                | Resolves metadata & streams          | Client-side fallback /
                v                                      | HLS adaptive decode
+---------------+--------------------------------------+----------------+
|                   CLOUDFLARE EDGE WORKER                              |
|           (teravidsplay.proxyking.workers.dev)                        |
|                                                                       |
|  * /api/resolve?surl=...    -> Extracts title, size, thumbnail & CDN   |
|  * /?url=...                -> High-speed HTTP 206 byte-range proxy   |
|  * Scheduled Cron           -> Pings Render bot to stay active 24/7   |
+-------------------------------+---------------------------------------+
                                |
                                v
+-------------------------------+---------------------------------------+
|                    TERABOX CDN SERVERS                                |
|        (terabox.com / 1024terabox.com / bdydns.com / baidupcs.com)    |
+-----------------------------------------------------------------------+
```

---

## 📦 Component Breakdown

| Directory | Component | Runtime / Tech | Hosting Platform |
| :--- | :--- | :--- | :--- |
| [`player/`](player/) | Web Player Frontend | HTML5, CSS3, Vanilla JS, HLS.js, Web Audio API | [Vercel](https://vercel.com) |
| [`worker/`](worker/) | Edge Streaming Proxy & Webhook | Cloudflare Workers (JavaScript ES Modules) | [Cloudflare Workers](https://workers.cloudflare.com) |
| [`bot/`](bot/) | Channel Automation Bot | Python 3.11+, pyTelegramBotAPI, Requests | [Render.com](https://render.com) Web Service |

---

## 🌐 Live Demo & Endpoints

- **Live Web Player:** [https://teravidsplayer.vercel.app](https://teravidsplayer.vercel.app)
- **Official Telegram Channel:** [@teravidsplayer](https://t.me/teravidsplayer)
- **Cloudflare Edge Worker:** [https://teravidsplay.proxyking.workers.dev](https://teravidsplay.proxyking.workers.dev)
- **Render Bot Health:** [https://teravidsplay.onrender.com](https://teravidsplay.onrender.com)
- **Buy Me a Coffee:** [https://buymeacoffee.com/kumawat007](https://buymeacoffee.com/kumawat007)

---

## 🚀 Step-by-Step Deployment Guide

### A. Frontend Web Player (Vercel)

The repository includes a root [`vercel.json`](vercel.json) that automatically handles routing to the [`player/`](player/) directory.

1. Fork or clone this repository to your GitHub account:
   ```bash
   git clone https://github.com/kumawat007/TeravidsPlay.git
   cd TeravidsPlay
   ```
2. Log into [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your **TeravidsPlay** GitHub repository.
4. Keep the default settings (Root Directory `./` or `player`), and click **Deploy**.
5. Once deployed, note your domain (e.g. `https://teravidsplayer.vercel.app`).

---

### B. Cloudflare Edge Worker (Proxy & API)

Deploy [`worker/worker.js`](worker/worker.js) directly on Cloudflare:

#### Option 1: Via Cloudflare Dashboard (Quickest)
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Workers & Pages** -> **Create application** -> **Create Worker**.
2. Name the worker `teravidsplay-proxy` and click **Deploy**.
3. Click **Quick Edit**, paste the entire contents of [`worker/worker.js`](worker/worker.js), and click **Save and Deploy**.
4. In the worker's **Settings** -> **Variables**, add:
   - `PLAYER_URL`: `https://teravidsplayer.vercel.app`
   - `RENDER_URL`: `https://teravidsplay.onrender.com`
   - `BOT_TOKEN`: Your Telegram Bot token (optional, only needed if using worker webhook mode).

#### Option 2: Via Wrangler CLI
```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

---

### C. Telegram Bot (Render.com 24/7 Free Web Service)

Deploy the Python channel bot to [Render.com](https://render.com) on the **Free Web Service** tier:

1. In your Render Dashboard, click **New +** -> **Web Service**.
2. Connect your **TeravidsPlay** GitHub repository.
3. Configure the service settings:
   - **Name:** `teravidsplay-bot`
   - **Region:** Any (e.g., Oregon / Frankfurt)
   - **Branch:** `server`
   - **Root Directory:** `bot`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python bot.py`
   - **Instance Type:** `Free`
4. Add the following **Environment Variables**:
   - `BOT_TOKEN`: `YOUR_TELEGRAM_BOT_TOKEN`
   - `TARGET_CHANNEL_ID`: `@teravidsplayer`
   - `PLAYER_URL`: `https://teravidsplayer.vercel.app`
   - `WORKER_URL`: `https://teravidsplay.proxyking.workers.dev`
   - `ADMIN_SECRET`: Any secure random password (e.g. `SecretAdmin2027`)
   - `RENDER_EXTERNAL_URL`: `https://teravidsplay.onrender.com`
5. Click **Create Web Service**.

> [!TIP]
> **24/7 Keep-Alive Guarantee:**
> Render Free instances hibernate after 15 minutes of inactivity. TeravidsPlay includes a built-in internal heartbeat in `bot.py` that pings itself every 8 minutes, and the Cloudflare Worker runs a cron ping every 10 minutes. For absolute 100% continuous uptime, also add a free 5-minute HTTP monitor at [cron-job.org](https://cron-job.org) targeting `https://teravidsplay.onrender.com`.

---

## ⚙️ Environment Variables Reference

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `BOT_TOKEN` | **Yes** | `7845129630:AAH...` | Telegram Bot API token from [@BotFather](https://t.me/BotFather) |
| `TARGET_CHANNEL_ID` | **Yes** | `@teravidsplayer` | Target channel username or numeric ID where links are handled |
| `PLAYER_URL` | **Yes** | `https://teravidsplayer.vercel.app` | Base URL of your deployed frontend web player |
| `WORKER_URL` | Recommended | `https://teravidsplay.proxyking.workers.dev` | Cloudflare Edge Worker URL for metadata resolution & streaming proxy |
| `ADMIN_SECRET` | Recommended | `StrongSecretKey2027` | Secret password required to access diagnostic endpoints (`/diag`) |
| `RENDER_EXTERNAL_URL` | Optional | `https://teravidsplay.onrender.com` | Public URL used by the keep-alive monitor |
| `ENABLE_WORKER_BOT` | Optional | `false` | Set to `true` only if running serverless webhook on Cloudflare instead of Render |

---

## 🔒 Security & SSRF Architecture

The system has undergone thorough security audits to ensure safe operation within public GitHub repositories:

1. **SSRF Guard (`is_safe_hostname`):** Every URL submitted for parsing or proxying is validated against strict domain suffixes:
   - Allowed: `terabox.com`, `terabox.app`, `1024terabox.com`, `baidupcs.com`, `bdydns.com`, `dubox.com`, `teraboxcdn.com`, `iteraplay.in`.
   - Blocked: All private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.1`), link-local (`169.254.169.254`), and non-whitelisted domains.
2. **Redirect Validation:** Upstream HTTP 30x redirect locations are inspected on every hop before following.
3. **Protected Health Server:** Port-bound diagnostic endpoints (`/diag`) require HTTP Bearer token or `?token=` parameter matching `ADMIN_SECRET`.
4. **Git Token Protection:** `.gitignore` excludes `.env`, `*.log`, credentials, and media files from git tracking.

---

## 🎮 Touch Gestures & Keyboard Shortcuts

### Desktop Keyboard Shortcuts
| Key | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Toggle Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek Backward / Forward 10 Seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume Up / Down (10% increments) |
| <kbd>F</kbd> | Toggle Fullscreen Mode |
| <kbd>M</kbd> | Mute / Unmute Audio |
| <kbd>B</kbd> | Cycle Web Audio Boost (`100%` -> `150%` -> `200%` -> `300%`) |

### Mobile Touch Gestures
| Gesture | Action |
| :--- | :--- |
| **Double Tap Right / Left** | Skip 10 seconds forward / backward with ripple animations |
| **Long Press (Hold > 350ms)** | Accelerate to **2X Speed** |
| **Ultra Long Press (Hold > 1400ms)** | Accelerate to **4X Ultra Turbo Speed** |
| **Vertical Swipe (Left Half)** | Adjust Display Brightness (`20%` – `150%`) |
| **Vertical Swipe (Right Half)** | Adjust Audio Volume (`0%` – `100%`) |

---

## 👨‍💻 Developer & Support

Developed with ❤️ and precision by **[KUMAWAT⁰⁰⁷ PRINTs](https://github.com/kumawat007)**.

If you find this project helpful, consider supporting future development:

<div align="center">

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=kumawat007&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/kumawat007)

**Official Channel:** [@teravidsplayer](https://t.me/teravidsplayer) • **GitHub:** [@kumawat007](https://github.com/kumawat007)

</div>

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
