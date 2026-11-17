# 🎬 TeravidsPlay — Production In-Telegram TeraBox Streaming Platform

An enterprise-grade, zero-cost, open-source streaming platform that converts **TeraBox** video links into instant **In-Telegram Web Player** streams with **Zero Advertisements**, **Zero Cookies required**, and **Zero Server Bills**.

Designed specifically for **Telegram Channels & Communities**, featuring an ultra-clean **Light Aesthetic UI** and an automated Cloudflare Worker byte-range streaming proxy with 24/7 Serverless Webhook support.

---

## 📑 Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Key Features (2026 Edition)](#-key-features-2026-edition)
3. [Repository Structure](#-repository-structure)
4. [24/7 Forever FREE Deployment Options](#-247-forever-free-deployment-options)
   - [Method A: 100% Serverless Cloudflare Worker (Zero Local PC, Zero Server)](#method-a-100-serverless-cloudflare-worker-zero-local-pc)
   - [Method B: Render.com Cloud Worker (Python 24/7)](#method-b-rendercom-cloud-worker-python-247)
   - [Method C: Local Development / Self-Hosted VPS](#method-c-local-development--self-hosted-vps)
5. [Step-by-Step Setup Guide](#-step-by-step-setup-guide)
   - [Step 1: Deploy Web Player Frontend (Vercel / Cloudflare Pages)](#step-1-deploy-web-player-frontend)
   - [Step 2: Deploy Cloudflare Streaming Worker](#step-2-deploy-cloudflare-streaming-worker)
   - [Step 3: Setup Telegram Bot & Public Channel](#step-3-setup-telegram-bot--public-channel)
6. [Environment Variables Reference](#-environment-variables-reference)
7. [Technical Deep-Dive & FAQ](#-technical-deep-dive--faq)

---

## 🏛️ Architecture Overview

The platform operates across three decoupled, serverless components to maintain zero operational costs while supporting high concurrency:

```
[ Telegram Channel Post ] 
         │
         ▼
[ Telegram Bot Engine ] ────(Auto-Scrapes Token / Calls Gateway)────► [ TeraBox API ]
(Serverless Worker or Python)                                                │
         │                                                                   ▼
         ▼                                                          [ Direct Stream dlink ]
[ Broadcast Media Card ]
         │
         ▼
[ "▶️ Watch in Telegram" ] ──(Shortened URL)──► [ In-Telegram Light Player ]
                                                            │
                                                            ▼ (HTTP 206 Byte Ranges / M3U8)
                                                [ Cloudflare Worker Proxy ]
                                                            │
                                                            ▼
                                                  [ TeraBox Global CDN ]
```

1. **Telegram Channel Listener:** Automatically detects any TeraBox URL posted in your channel, deletes the raw link, and publishes a clean video card with title, size, thumbnail, and the `[ ▶️ Watch in Telegram ]` button.
2. **Streaming & CORS Proxy (Cloudflare Worker):** Rewrites headers, handles HTTP `Range` requests (`206 Partial Content`), spoofs upstream verification, and dynamically rewrites HLS (`.m3u8`) playlists.
3. **Web Player (Telegram Mini App / In-App Browser):** Minimalist Apple/Notion-inspired light theme built on **Plyr.js** and **HLS.js**. Streams natively inside Telegram without external browser redirects.

---

## ✨ Key Features (2026 Edition)

* 🚀 **Native In-Telegram Playback:** Opens directly inside Telegram’s embedded browser. Users never have to download external apps or switch to Chrome/Safari.
* ☀️ **Modern Light Aesthetic (No Dark Mode):** Crisp slate typography, soft borders, glassmorphism cards, and Telegram-blue accents.
* ⚡ **Long-Press Speed Controls:** Long-press anywhere on the video for instant **2X Speed**; ultra long-press (>1200ms) elevates to **4X Turbo**, restoring previous speed on release.
* 📱 **Mobile Touch Gestures:**
  * **Double Tap Left/Right:** Smooth `10s` rewind and fast-forward with animated ripple feedback.
  * **Vertical Swipe Controls:** Swipe up/down on the left half to adjust **Brightness**; swipe up/down on the right half to adjust **Volume** with live floating HUD bars.
* 🔒 **Screen Touch Lock (Child Lock):** Lock touch interactions so accidental touches in bed or on the go don't pause or seek playback.
* 🔊 **Audio Boost & Unmute Guard:** Web Audio API volume booster (up to 300% gain) with automatic un-mute detection for browser autoplay policies.
* 📐 **Aspect Ratio Switcher:** Seamlessly switch between **Fit** (Letterbox), **Fill** (Zoom to Fill), and **Stretch** (Full Viewport).
* ⏱️ **Sleep Timer:** Automatically pause playback after 15, 30, 45, or 60 minutes.
* 💾 **Auto-Resume via LocalStorage:** Remembers playback position across sessions and displays a helpful "Resumed from MM:SS" toast notification.
* 🔗 **Integrated URL Shortener:** Automatically shortens long stream URLs into compact shareable links (e.g., `https://tinyurl.com/...`).
* 🏷️ **Developer Watermark:** Embedded developer badge crediting `Developed by KUMAWAT⁰⁰⁷ PRINTs` ([kumawat007](https://github.com/kumawat007)).
* 🛡️ **100% Zero-Cookie Auto-Pilot:** Built-in dynamic token scraper and multi-gateway failover pool. You **do not** need to provide personal cookies or account credentials.
* 💸 **100% Free Forever:**
  * **Frontend:** Vercel / Cloudflare Pages (Unlimited Bandwidth, $0).
  * **Stream Proxy & 24/7 Bot:** Cloudflare Workers (100,000 requests/day free tier, $0).
  * **Bot API:** Telegram Bot API (Unlimited free usage, $0).

---

## 📁 Repository Structure

```
TeravidsPlay/
├── player/                   # Frontend Web Player (Deploy to Vercel / Cloudflare Pages)
│   ├── index.html            # Responsive HTML5 Player with Mobile Gestures & Telegram SDK
│   ├── style.css             # Light-theme design system, gesture HUDs & sheet drawer
│   └── app.js                # Player controller (Web Audio 300%, Gestures, HLS.js, Auto-Resume)
│
├── worker/                   # Serverless Streaming Proxy & 24/7 Webhook Bot (Cloudflare Workers)
│   ├── worker.js             # HTTP 206 Range proxy, M3U8 rewriter & Telegram Webhook engine
│   └── wrangler.toml         # Cloudflare Wrangler deployment configuration
│
├── bot/                      # Python Telegram Bot & Link Extractor (Local / Render.com)
│   ├── bot.py                # Channel post handler, DM controller & TinyURL shortener
│   ├── terabox_extractor.py  # Auto-Pilot resolver & token extraction engine
│   ├── requirements.txt      # Python runtime dependencies
│   ├── .env.example          # Sample environment configuration
│   └── .env                  # Private runtime configuration
│
└── README.md                 # Complete documentation
```

---

## 🌐 24/7 Forever FREE Deployment Options

You do **NOT** need to keep your personal computer running 24/7 to use the Telegram bot. Choose the method that best fits your workflow:

### Method A: 100% Serverless Cloudflare Worker (Zero Local PC) — **RECOMMENDED**

Cloudflare Workers can host both the **Video Streaming Proxy** and the **Telegram Bot Webhook** on the same worker, running 24/7/365 at the edge with 0ms cold starts and zero hosting bills.

1. Deploy [`worker/worker.js`](worker/worker.js) to your Cloudflare Worker (e.g., `https://teravidsplay.proxyking.workers.dev`).
2. Add your environment variables in Cloudflare Worker settings (or use the built-in defaults):
   * `BOT_TOKEN`: Your Telegram Bot token.
   * `PLAYER_URL`: Your deployed frontend URL (e.g., `https://teravidsplayer.vercel.app`).
3. Set your Telegram Bot Webhook by opening this URL in any browser:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/webhook&allowed_updates=["message","channel_post","edited_channel_post"]
   ```
4. **Done!** Whenever anyone posts a TeraBox link in your channel or sends a DM to your bot, Cloudflare Worker instantly handles it in the cloud. Your PC can stay completely off!

---

### Method B: Render.com Cloud Worker (Python 24/7)

If you prefer running the Python bot (`bot.py`) in the cloud:

1. Push this repository to your GitHub account.
2. Sign in to [Render.com](https://render.com) and click **New +** ➔ **Background Worker**.
3. Connect your GitHub repository.
4. Set configurations:
   * **Runtime:** `Python 3`
   * **Build Command:** `pip install -r bot/requirements.txt`
   * **Start Command:** `python bot/bot.py`
5. In the **Environment Variables** section, add:
   * `BOT_TOKEN`
   * `TARGET_CHANNEL_ID`
   * `PLAYER_URL`
6. Click **Create Background Worker**. The bot stays permanently online in the cloud for free!

---

### Method C: Local Development / Self-Hosted VPS

To run the bot locally on your computer or on a Linux VPS:

```bash
cd bot
pip install -r requirements.txt
python bot.py
```

---

## 🛠️ Step-by-Step Setup Guide

### Step 1: Deploy Web Player Frontend

Deploy the [`player`](player/) directory to **Vercel** or **Cloudflare Pages**:

#### Option 1: Vercel CLI (1-Click)
```bash
cd player
vercel --prod
```

#### Option 2: Cloudflare Pages
1. Go to **Cloudflare Dashboard** ➔ **Workers & Pages** ➔ **Create Application** ➔ **Pages**.
2. Upload the `player/` folder directly.
3. Your web player is live at `https://teravidsplay.pages.dev`!

---

### Step 2: Deploy Cloudflare Streaming Worker

1. Open [Cloudflare Workers Dashboard](https://dash.cloudflare.com).
2. Create a new Worker (e.g., `teravidsplay-proxy`).
3. Paste the contents of [`worker/worker.js`](worker/worker.js).
4. Click **Save and Deploy**.

---

### Step 3: Setup Telegram Bot & Public Channel

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose a name and username, and copy your `BOT_TOKEN`.
3. Open your Telegram Channel settings:
   * Go to **Administrators** ➔ **Add Administrator**.
   * Add your bot and grant **Post Messages** and **Delete Messages** permissions.
4. Post any TeraBox link directly into the channel:
   * The bot immediately displays an `⚡ Analyzing...` waiting message.
   * It extracts the video stream and shortens the player link.
   * It deletes the original link post and waiting message.
   * It publishes the clean media card with thumbnail, title, size, and the `[ ▶️ Watch in Telegram ]` button!

---

## ⚙️ Environment Variables Reference

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `BOT_TOKEN` | **Yes** | Telegram Bot API token obtained from `@BotFather`. | `7123456789:ABC...` |
| `TARGET_CHANNEL_ID` | **Yes** | The channel where the bot broadcasts and listens. | `@teravidsplayer` or `-1004424072751` |
| `PLAYER_URL` | **Yes** | Deployed frontend web player URL. | `https://teravidsplayer.vercel.app` |
| `NDUS_COOKIE` | *Optional* | Personal account session cookie. Leave empty for 100% Auto-Pilot mode. | `M01...` |

---

## 🔬 Technical Deep-Dive & FAQ

### 1. Why was there no sound initially during playback?
In HTML5, when a media element is connected to the Web Audio API (`AudioContext`), if the `<video>` element lacks `crossorigin="anonymous"`, the browser considers the media cross-origin tainted and silences the audio output according to CORS security specifications. Furthermore, mobile browsers enforce strict autoplay policies that mute initial playback until explicit user interaction occurs.  
**Solution:** TeravidsPlay sets `crossorigin="anonymous"`, provides an interactive **Tap to Unmute** banner for autoplay fallback, and routes Web Audio amplification only upon user action.

### 2. Why do channel links need to be shortened?
Direct stream URLs from CDN resolvers contain authentication tokens and query parameters exceeding 600+ characters. Sharing long URLs clutters social media and Telegram previews. TeravidsPlay integrates automatic **TinyURL** shortening so every video gets a neat, shareable link.

### 3. How does the 24/7 Cloudflare Worker Bot work without a PC?
Traditional bots use long polling (`getUpdates`), requiring a continuous running process. Cloudflare Workers use **Telegram Webhooks**: whenever a user posts in your channel, Telegram pushes an HTTP request directly to the worker at Cloudflare's global edge. The worker processes the link, publishes the card via the Telegram HTTP API, and terminates within milliseconds—costing $0 and running 24/7 without requiring any server.

---

## 📄 License
This project is open-source under the **MIT License**. Created with ❤️ by **[KUMAWAT⁰⁰⁷ PRINTs](https://github.com/kumawat007)**.