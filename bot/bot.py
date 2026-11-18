"""
TeravidsPlay — Production Telegram Channel Bot
Optimized for Telegram Channels & Direct Messaging:
- Direct High-Speed CDN Streaming (bypasses broken/unconfigured proxies).
- Explicit allowed_updates for Channel Posts & Edited Channel Posts.
- Extracts links from raw text, photo captions, and Telegram formatted entities.
- Direct posting to @teravidsplayer with comprehensive error reporting.
"""

import os
import sys
import time
import html
import logging
import threading
import urllib.parse
import requests
from dotenv import load_dotenv
import telebot
from telebot import types

# Always load .env and module paths from the bot folder regardless of execution cwd
bot_dir = os.path.dirname(__file__)
if bot_dir not in sys.path:
    sys.path.insert(0, bot_dir)

dotenv_path = os.path.join(bot_dir, '.env')
load_dotenv(dotenv_path)

BOT_TOKEN = os.getenv("BOT_TOKEN")
PLAYER_URL = os.getenv("PLAYER_URL", "").rstrip("/")
TARGET_CHANNEL_ID = os.getenv("TARGET_CHANNEL_ID", "").strip()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("TeravidsPlayBot")

if not BOT_TOKEN:
    print(f"\n[CRITICAL ERROR] BOT_TOKEN is missing in {dotenv_path}!\n")
    sys.exit(1)

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

from terabox_extractor import TeraBoxExtractor, is_terabox_url, shorten_url
extractor = TeraBoxExtractor()


def extract_url_from_message(message: types.Message) -> str:
    """Extracts URL from raw text, captions, or formatted entities."""
    import re
    text = message.text or message.caption or ""

    # 1. Check raw text
    match = re.search(r"https?://[^\s<>\"']+", text)
    if match:
        return match.group(0).rstrip(").,;:!?'\"")

    # 2. Check entities (for formatted hyperlinks like [Movie](https://...))
    entities = (message.entities or []) + (message.caption_entities or [])
    for ent in entities:
        if getattr(ent, 'url', None):
            return ent.url

    return ""


def extract_title_hint_from_message(message: types.Message, raw_url: str) -> str:
    """Extracts custom video title or caption written by the user alongside the link."""
    import re
    text = (message.text or message.caption or "").strip()
    if not text:
        return ""
    # Remove the raw URL
    cleaned = text.replace(raw_url, "").strip()
    # Strip multiple line breaks or markdown links
    cleaned = re.sub(r'[\r\n]+', ' ', cleaned).strip()
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if len(cleaned) >= 3 and not cleaned.startswith("http"):
        return cleaned[:120]
    return ""


DEFAULT_POSTER = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80"


def build_channel_markup(stream_url: str, title: str, size: str, surl: str = "", thumb: str = "") -> tuple[types.InlineKeyboardMarkup, str]:
    """Builds direct-to-player inline buttons with vibrant, colorful TOP BEST Design."""
    markup = types.InlineKeyboardMarkup(row_width=1)

    encoded_title = urllib.parse.quote(title) if title else ""
    encoded_size = urllib.parse.quote(size) if size else ""
    encoded_thumb = urllib.parse.quote(thumb) if (thumb and thumb.startswith("http")) else ""

    if PLAYER_URL and surl:
        # Clean own domain web player URL with auto-unlock flag & metadata
        params = [f"v={surl}", "tg=1"]
        if encoded_title:
            params.append(f"title={encoded_title}")
        if encoded_size:
            params.append(f"size={encoded_size}")
        if encoded_thumb:
            params.append(f"thumb={encoded_thumb}")
        player_link = f"{PLAYER_URL}/?{'&'.join(params)}"
    elif PLAYER_URL:
        encoded_stream = urllib.parse.quote(stream_url)
        params = [f"stream={encoded_stream}", "tg=1"]
        if encoded_title:
            params.append(f"title={encoded_title}")
        if encoded_size:
            params.append(f"size={encoded_size}")
        if encoded_thumb:
            params.append(f"thumb={encoded_thumb}")
        player_link = f"{PLAYER_URL}/?{'&'.join(params)}"
    else:
        player_link = stream_url

    # Button 1: Watch Online Full HD
    markup.add(types.InlineKeyboardButton(
        text="🟢 ▶️ WATCH ONLINE (FULL HD) 🍿",
        url=player_link,
    ))

    # Button 2: Fast Direct Download (Guaranteed to ALWAYS be present)
    download_url = stream_url if stream_url else (f"{player_link}&dl=1" if "?" in player_link else f"{player_link}?dl=1")
    markup.add(types.InlineKeyboardButton(
        text="⚡ 📥 FAST DIRECT DOWNLOAD 🚀",
        url=download_url,
    ))

    return markup, player_link


def publish_card(chat_id, title: str, size: str, quality: str, thumb_url: str, markup: types.InlineKeyboardMarkup, short_link: str = ""):
    """Sends the formatted video card with photo or text fallback."""
    safe_title = html.escape(title[:120])
    size_label = size if (size and size not in ["0 B", "Unknown Size", "HD Stream"]) else "1080p HD"

    # Strictly user format:
    # 🎬 <video real name>
    # 📦 Size: <size>
    caption = f"🎬 <b>{safe_title}</b>\n\n📦 <b>Size:</b> {size_label}"

    photo_target = thumb_url if (thumb_url and thumb_url.startswith("http")) else DEFAULT_POSTER

    try:
        return bot.send_photo(
            chat_id=chat_id,
            photo=photo_target,
            caption=caption,
            reply_markup=markup,
        )
    except Exception as e:
        logger.warning(f"Could not deliver photo to {chat_id} with {photo_target}: {e}")
        # If custom thumbnail failed, attempt with DEFAULT_POSTER fallback
        if photo_target != DEFAULT_POSTER:
            try:
                return bot.send_photo(
                    chat_id=chat_id,
                    photo=DEFAULT_POSTER,
                    caption=caption,
                    reply_markup=markup,
                )
            except Exception as e2:
                logger.warning(f"Default poster photo delivery also failed to {chat_id}: {e2}")

    return bot.send_message(
        chat_id=chat_id,
        text=caption,
        reply_markup=markup,
    )


# ==============================================================
# 1. CHANNEL POST HANDLERS (Automatic Channel Processing)
# ==============================================================
@bot.channel_post_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
@bot.edited_channel_post_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
def handle_channel_post(message: types.Message):
    """Catches TeraBox links posted directly in the channel and replaces them smoothly with the video card."""
    logger.info(f"Incoming channel post in chat ID {message.chat.id}: {message.text or message.caption}")
    raw_url = extract_url_from_message(message)
    if not raw_url or not is_terabox_url(raw_url):
        return

    surl_preview = extractor.parse_surl(raw_url) or ""
    masked_token = f"{surl_preview[:3]}***{surl_preview[-3:]}" if len(surl_preview) > 6 else "***"
    logger.info(f"Processing verified TeraBox link in channel: surl={masked_token}")
    title_hint = extract_title_hint_from_message(message, raw_url)

    data = extractor.get_video_stream(raw_url)
    surl = data.get("surl") or extractor.parse_surl(raw_url) or ""

    if data.get("success"):
        extracted_title = data.get("title") or ""
        if extracted_title and extracted_title not in ["TeraBox Video", "TeraBox Video Stream"]:
            title = extracted_title
        else:
            title = title_hint or extracted_title or "TeraBox Video"
        size = data.get("size_formatted", "")
        quality = data.get("quality", "HD 1080p")
        stream_url = data.get("stream_url")
        thumb_url = data.get("thumbnail")
    elif surl:
        logger.info(f"Using instant Web Player fallback for channel post: {surl}")
        title = title_hint or "TeraBox Video"
        size = "1080p HD"
        quality = "HD 1080p"
        stream_url = ""
        thumb_url = None
    else:
        logger.warning(f"Resolution failed for channel post: {data.get('message')}")
        try:
            bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
        except Exception:
            pass
        return

    markup, short_link = build_channel_markup(
        stream_url=stream_url,
        title=title,
        size=size,
        surl=surl,
        thumb=thumb_url or "",
    )

    # 1. Publish sleek media card directly to channel
    sent_msg = publish_card(
        chat_id=message.chat.id,
        title=title,
        size=size,
        quality=quality,
        thumb_url=thumb_url,
        markup=markup,
        short_link=short_link,
    )
    logger.info(f"Successfully published video card to channel! Message ID: {getattr(sent_msg, 'message_id', 'unknown')}")

    # 2. Delete original raw link post to keep the channel 100% clean
    try:
        bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
        logger.info(f"Deleted raw post {message.message_id} in channel.")
    except Exception as e:
        logger.info(f"Could not delete original post: {e}")


# ==============================================================
# 2. PRIVATE CHAT COMMANDS & ADMIN HANDLERS
# ==============================================================
@bot.message_handler(commands=["start", "help"])
def handle_start(message: types.Message):
    welcome_text = (
        "📢 <b>Welcome to TeravidsPlay Channel Bot!</b>\n\n"
        "Send me any TeraBox video link here, or post it directly in your channel <b>@teravidsplayer</b>.\n\n"
        "<b>Features:</b>\n"
        "• Automatic 720p/1080p stream resolution.\n"
        "• Long-press 2X & 4X speed controls.\n"
        "• Web Audio API 300% volume booster.\n"
        "• Double-tap 10s seek & Auto-resume.\n"
        "• Zero Ads & Zero Popups.\n\n"
        f"• <b>Target Channel:</b> <code>{TARGET_CHANNEL_ID or 'Not Set'}</code>\n"
        f"• <b>Status Check:</b> /status"
    )
    bot.reply_to(message, welcome_text)


@bot.message_handler(commands=["status"])
def handle_status(message: types.Message):
    status_text = (
        "⚙️ <b>TeravidsPlay System Diagnostics</b>\n\n"
        f"• <b>Engine:</b> 🚀 High-Speed Direct Edge Engine (Active)\n"
        f"• <b>Web Player:</b> {'✅ ' + PLAYER_URL if PLAYER_URL else '⚠️ Not Set'}\n"
        f"• <b>Target Channel:</b> <code>{TARGET_CHANNEL_ID or 'Not Set'}</code>\n"
        f"• <b>Bot Username:</b> @{bot.get_me().username}\n"
    )
    bot.reply_to(message, status_text)


@bot.message_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
def handle_private_post(message: types.Message):
    """Handles TeraBox links sent to the bot in private DM."""
    raw_url = extract_url_from_message(message)
    if not raw_url or not is_terabox_url(raw_url):
        return

    surl_preview = extractor.parse_surl(raw_url) or ""
    masked_token = f"{surl_preview[:3]}***{surl_preview[-3:]}" if len(surl_preview) > 6 else "***"
    logger.info(f"Processing verified TeraBox link in DM: surl={masked_token}")

    status_msg = bot.reply_to(message, "⚡ <b>Resolving video stream...</b>\n<i>Please wait 1-2 seconds.</i>")
    title_hint = extract_title_hint_from_message(message, raw_url)

    data = extractor.get_video_stream(raw_url)
    surl = data.get("surl") or extractor.parse_surl(raw_url) or ""

    if data.get("success"):
        extracted_title = data.get("title") or ""
        if extracted_title and extracted_title not in ["TeraBox Video", "TeraBox Video Stream"]:
            title = extracted_title
        else:
            title = title_hint or extracted_title or "TeraBox Video"
        size = data.get("size_formatted", "")
        quality = data.get("quality", "HD 1080p")
        stream_url = data.get("stream_url")
        thumb_url = data.get("thumbnail")
    elif surl:
        title = title_hint or "TeraBox Video"
        size = "1080p HD"
        quality = "HD 1080p"
        stream_url = ""
        thumb_url = None
    else:
        bot.edit_message_text(
            f"❌ <b>Resolution Failed:</b>\n{data.get('message', 'Link expired or unreachable.')}",
            chat_id=message.chat.id,
            message_id=status_msg.message_id,
        )
        return

    markup, short_link = build_channel_markup(
        stream_url=stream_url,
        title=title,
        size=size,
        surl=surl,
        thumb=thumb_url or "",
    )

    channel_posted = False
    channel_error = None

    # Broadcast to Target Channel if configured
    if TARGET_CHANNEL_ID:
        try:
            target = int(TARGET_CHANNEL_ID) if TARGET_CHANNEL_ID.lstrip("-").isdigit() else TARGET_CHANNEL_ID
            publish_card(
                chat_id=target,
                title=title,
                size=size,
                quality=quality,
                thumb_url=thumb_url,
                markup=markup,
                short_link=short_link,
            )
            channel_posted = True
            logger.info(f"Published to channel {TARGET_CHANNEL_ID}")
        except Exception as e:
            channel_error = str(e)
            logger.error(f"Failed to publish to channel {TARGET_CHANNEL_ID}: {e}")

    # Update DM status
    if channel_posted:
        status_text = f"✅ <b>Successfully published to {TARGET_CHANNEL_ID}!</b>\n\n👇 <i>Here is your playable card:</i>"
    elif channel_error:
        status_text = (
            f"⚠️ <b>Link resolved, but could not post to {TARGET_CHANNEL_ID}:</b>\n"
            f"<code>{html.escape(channel_error)}</code>\n\n"
            f"👇 <i>Playable card:</i>"
        )
    else:
        status_text = "✅ <b>Stream Ready!</b>"

    bot.edit_message_text(
        status_text,
        chat_id=message.chat.id,
        message_id=status_msg.message_id,
    )

    # Deliver card in DM so user can test and watch right here
    publish_card(
        chat_id=message.chat.id,
        title=title,
        size=size,
        quality=quality,
        thumb_url=thumb_url,
        markup=markup,
        short_link=short_link,
    )


import threading
from http.server import HTTPServer, BaseHTTPRequestHandler


class HealthCheckHandler(BaseHTTPRequestHandler):
    """
    Production-grade cloud health check server.
    Secured against SSRF and unauthorized public execution.
    """
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # 1. Protected Admin Diagnostic Endpoint
        if parsed.path in ["/diag", "/resolve", "/test"]:
            admin_secret = os.getenv("ADMIN_SECRET", "").strip()
            # If ADMIN_SECRET is not configured, diagnostic endpoints are completely disabled (404)
            if not admin_secret:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"Diagnostic endpoint disabled. Set ADMIN_SECRET to enable."}')
                return

            query = urllib.parse.parse_qs(parsed.query)
            token = query.get("token", [""])[0] or query.get("key", [""])[0]
            auth_header = self.headers.get("Authorization", "")
            bearer_token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""

            if token != admin_secret and bearer_token != admin_secret:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"Unauthorized: Valid ADMIN_SECRET token required."}')
                return

            # Strict SSRF URL validation
            raw_target = query.get("url", ["https://1024terabox.com/s/18XBuJRPYrMNmrqzYZNqLbA"])[0]
            if not is_terabox_url(raw_target):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"Invalid target: Domain must belong to authorized TeraBox services."}')
                return

            import json, traceback
            diag = {
                "status": "authenticated",
                "worker_url": extractor.worker_url,
                "step1_worker_direct": None,
                "step2_extractor": None,
            }

            # 1. Direct Edge Worker Test
            try:
                surl_clean = extractor.parse_surl(raw_target) or raw_target
                w_endpoint = f"{extractor.worker_url}/api/resolve?surl={urllib.parse.quote(surl_clean)}"
                r = requests.get(w_endpoint, timeout=8)
                diag["step1_worker_direct"] = {
                    "status_code": r.status_code,
                    "body": r.text[:250]
                }
            except Exception as e:
                diag["step1_worker_direct"] = {"error": str(e)}

            # 2. Full Extractor Test
            try:
                diag["step2_extractor"] = extractor.get_video_stream(raw_target)
            except Exception as e:
                diag["step2_extractor"] = {"error": str(e)}

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(diag, indent=2).encode("utf-8"))
            return

        # 2. Public Health Check Endpoint (Only used by Render/Koyeb uptime probes)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok","service":"TeravidsPlay Bot"}')

    def log_message(self, format, *args):
        pass


def start_health_server():
    port_str = os.getenv("PORT")
    if not port_str:
        return
    try:
        port = int(port_str)
        server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        logger.info(f"Render cloud health server listening on port {port}")
    except Exception as e:
        logger.warning(f"Could not start cloud health server: {e}")


def keep_alive_loop():
    """
    24/7 Keep-Alive Monitor for Render Free Web Services.
    Render automatically spins down free instances after 15 minutes of no inbound HTTP traffic.
    This internal heartbeat loop sends an HTTP ping to the health endpoint every 8 minutes.
    """
    time.sleep(30)
    health_url = os.getenv("RENDER_EXTERNAL_URL") or "https://teravidsplay.onrender.com"
    health_url = health_url.rstrip("/")
    logger.info(f"[KeepAlive] 24/7 Keep-alive monitor active for: {health_url}")
    while True:
        try:
            time.sleep(480)  # Every 8 minutes
            resp = requests.get(f"{health_url}/", timeout=12)
            logger.info(f"[KeepAlive] Heartbeat ping delivered: HTTP {resp.status_code}")
        except Exception as e:
            logger.debug(f"[KeepAlive] Heartbeat ping notice: {e}")


if __name__ == "__main__":
    logger.info("TeravidsPlay Production Channel Bot is starting...")
    print("\n" + "=" * 60)
    print(" 📢 TeravidsPlay Production Channel Bot is Active!")
    print("=" * 60 + "\n")

    # Start health server for Render / Koyeb cloud hosting (if PORT is set)
    start_health_server()

    # Start 24/7 Keep-Alive self-pinger to prevent Render container hibernation
    t_keepalive = threading.Thread(target=keep_alive_loop, daemon=True)
    t_keepalive.start()

    # Resilient polling engine: Handles Render rolling deployments & dual-instance 409 conflicts
    while True:
        try:
            # Clear any stale webhooks or dangling polling sessions
            try:
                bot.delete_webhook(drop_pending_updates=True)
                time.sleep(1)
            except Exception as e:
                logger.warning(f"Webhook reset notice: {e}")

            logger.info("Telegram polling loop started successfully...")
            bot.infinity_polling(
                skip_pending=True,
                timeout=20,
                long_polling_timeout=20,
                allowed_updates=["message", "edited_message", "channel_post", "edited_channel_post"],
                restart_on_change=False
            )
        except telebot.apihelper.ApiTelegramException as e:
            if e.error_code == 409:
                logger.warning(
                    "Telegram 409 Conflict: Another bot instance or Render rolling deployment is active. "
                    "Waiting 5 seconds for previous instance to release connection before reconnecting..."
                )
                time.sleep(5)
            else:
                logger.error(f"Telegram API Exception: {e}. Reconnecting in 5 seconds...")
                time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Bot manually terminated by user.")
            break
        except Exception as e:
            logger.error(f"Unexpected bot polling exception: {e}. Reconnecting in 5 seconds...")
            time.sleep(5)
