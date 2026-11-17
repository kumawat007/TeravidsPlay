# 🎬 TeravidsPlay

> **Instant TeraBox Video Player & 24/7 Automated Telegram Channel Bot**  
> Zero Ads • Zero Cookies Required • 100% Free Hosting Forever

---

### ✨ Features
* 🚀 **In-Telegram Web Player:** Instant streaming inside Telegram's embedded browser.
* 🚫 **Zero Ads:** Clean, modern light aesthetic UI with zero popups or redirects.
* 📱 **Mobile Touch Gestures:** Double-tap seek (10s), long-press 2X/4X speed, swipe brightness & volume HUDs, and screen child lock.
* 🔊 **Audio Booster:** Web Audio API 300% volume amplification with autoplay un-mute guard.
* 🤖 **24/7 Channel Bot:** Auto-deletes raw TeraBox links and posts clean media cards with own-brand short URLs (`?v=TOKEN`).

---

### 🚀 Quick Deploy

#### 1. Frontend Web Player (Vercel / Cloudflare Pages)
Deploy [`player/`](player/) folder directly:
```bash
cd player && vercel --prod
```

#### 2. Edge Proxy & Stream Resolver (Cloudflare Worker)
Deploy [`worker/worker.js`](worker/worker.js) into [Cloudflare Workers](https://dash.cloudflare.com):
* Handles HTTP 206 byte-ranges, dynamic HLS playlists, and bypasses datacenter IP blocking.

#### 3. Telegram Bot (Render.com Web Service)
Deploy [`bot/`](bot/) to [Render.com](https://render.com) (Free Web Service):
* **Root Directory:** `bot`
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `python bot.py`

---

### ⚙️ Environment Variables (`bot/.env`)

| Variable | Description |
| :--- | :--- |
| `BOT_TOKEN` | Telegram Bot token from [@BotFather](https://t.me/BotFather) |
| `TARGET_CHANNEL_ID` | Telegram Channel username or numeric ID (`@teravidsplayer`) |
| `PLAYER_URL` | Deployed Web Player URL (`https://teravidsplayer.vercel.app`) |
| `WORKER_URL` | Cloudflare Worker URL (`https://teravidsplay.proxyking.workers.dev`) |

---

### 📄 License
MIT License • Developed with ❤️ by **[KUMAWAT⁰⁰⁷ PRINTs](https://github.com/kumawat007)**
