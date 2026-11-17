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

# Always load .env from the bot folder regardless of execution cwd
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
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


def build_channel_markup(stream_url: str, title: str, size: str, surl: str = "") -> tuple[types.InlineKeyboardMarkup, str]:
    """Builds direct-to-player inline buttons with 100% OWN BRAND short player URL."""
    markup = types.InlineKeyboardMarkup(row_width=1)

    if PLAYER_URL and surl:
        # 100% Own Domain Short URL (e.g. https://teravidsplayer.vercel.app/?v=18XBu...)
        player_link = f"{PLAYER_URL}/?v={surl}"
    elif PLAYER_URL:
        encoded_stream = urllib.parse.quote(stream_url)
        encoded_title = urllib.parse.quote(title)
        encoded_size = urllib.parse.quote(size)
        player_link = f"{PLAYER_URL}/?stream={encoded_stream}&title={encoded_title}&size={encoded_size}"
    else:
        player_link = stream_url

    # In-Telegram Web Player Button
    watch_btn = types.InlineKeyboardButton(
        text="▶️ Watch in Telegram",
        url=player_link,
    )
    markup.add(watch_btn)

    # Direct Download link (only added if direct stream URL is available)
    if stream_url:
        download_btn = types.InlineKeyboardButton(
            text="📥 Direct Download",
            url=stream_url,
        )
        markup.add(download_btn)

    return markup, player_link


def publish_card(chat_id, title: str, size: str, quality: str, thumb_url: str, markup: types.InlineKeyboardMarkup, short_link: str = ""):
    """Sends the formatted video card with photo or text fallback."""
    safe_title = html.escape(title)
    short_link_section = f"\n🔗 <b>Watch Link:</b> {short_link}\n" if short_link else "\n"
    caption = (
        f"🎬 <b>{safe_title}</b>\n\n"
        f"📦 <b>Size:</b> {size} | <b>Quality:</b> {quality}\n"
        f"⚡ <b>Playback:</b> Instant Stream (Zero Ads)"
        f"{short_link_section}\n"
        f"👇 <i>Tap below to watch online inside Telegram:</i>"
    )

    if thumb_url and thumb_url.startswith("http"):
        try:
            return bot.send_photo(
                chat_id=chat_id,
                photo=thumb_url,
                caption=caption,
                reply_markup=markup,
            )
        except Exception as e:
            logger.warning(f"Could not deliver thumbnail photo to {chat_id}: {e}")

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
    """Catches TeraBox links posted directly in the channel."""
    logger.info(f"Incoming channel post in chat ID {message.chat.id}: {message.text or message.caption}")
    raw_url = extract_url_from_message(message)
    if not raw_url or not is_terabox_url(raw_url):
        return

    logger.info(f"Found TeraBox link in channel: {raw_url}")

    waiting_msg = None
    try:
        waiting_msg = bot.send_message(
            chat_id=message.chat.id,
            text="⚡ <b>Analyzing TeraBox video...</b>\n<i>Generating high-speed stream & web player...</i>",
        )
    except Exception as e:
        logger.warning(f"Could not post waiting message in channel: {e}")

    data = extractor.get_video_stream(raw_url)
    surl = data.get("surl") or extractor.parse_surl(raw_url) or ""

    if data.get("success"):
        title = data.get("title", "TeraBox Video")
        size = data.get("size_formatted", "")
        quality = data.get("quality", "HD")
        stream_url = data.get("stream_url")
        thumb_url = data.get("thumbnail")
    elif surl:
        # Datacenter cloud IP was blocked from extracting metadata ahead of time,
        # but the Web Player client-side resolver will stream the video 100% smoothly!
        logger.info(f"Using instant Web Player fallback for channel post: {surl}")
        title = "TeraBox Video Stream"
        size = "HD Stream"
        quality = "HD 1080p"
        stream_url = ""
        thumb_url = None
    else:
        logger.warning(f"Resolution failed for channel post: {data.get('message')}")
        try:
            bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
        except Exception:
            pass
        if waiting_msg:
            try:
                bot.edit_message_text(
                    chat_id=message.chat.id,
                    message_id=waiting_msg.message_id,
                    text=f"❌ <b>Stream Extraction Failed:</b>\n{data.get('message', 'Link expired or invalid.')}\n\n<i>This notice will auto-delete in 15 seconds.</i>",
                )
                def auto_delete_notice(chat_id, msg_id):
                    import time
                    time.sleep(15)
                    try:
                        bot.delete_message(chat_id=chat_id, message_id=msg_id)
                    except Exception:
                        pass
                threading.Thread(target=auto_delete_notice, args=(message.chat.id, waiting_msg.message_id), daemon=True).start()
            except Exception:
                pass
        return

    markup, short_link = build_channel_markup(
        stream_url=stream_url,
        title=title,
        size=size,
        surl=surl,
    )

    # 1. Delete original raw link post to keep the channel clean
    try:
        bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
        logger.info(f"Deleted raw post {message.message_id} in channel.")
    except Exception as e:
        logger.info(f"Could not delete original post: {e}")

    # 2. Delete temporary waiting message
    if waiting_msg:
        try:
            bot.delete_message(chat_id=message.chat.id, message_id=waiting_msg.message_id)
        except Exception:
            pass

    # 3. Publish clean media card in channel
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

    status_msg = bot.reply_to(message, "⚡ <b>Resolving video stream...</b>\n<i>Please wait 1-2 seconds.</i>")

    data = extractor.get_video_stream(raw_url)
    surl = data.get("surl") or extractor.parse_surl(raw_url) or ""

    if data.get("success"):
        title = data.get("title", "TeraBox Video")
        size = data.get("size_formatted", "")
        quality = data.get("quality", "HD")
        stream_url = data.get("stream_url")
        thumb_url = data.get("thumbnail")
    elif surl:
        title = "TeraBox Video Stream"
        size = "HD Stream"
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
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ["/diag", "/resolve", "/test"]:
            import json, traceback
            query = urllib.parse.parse_qs(parsed.query)
            target = query.get("url", ["https://1024terabox.com/s/18XBuJRPYrMNmrqzYZNqLbA"])[0]
            diag = {
                "target_url": target,
                "worker_url": extractor.worker_url,
                "step1_worker_direct": None,
                "step2_extractor": None,
            }

            # 1. Direct Edge Worker Test
            try:
                surl_clean = extractor.parse_surl(target) or target
                w_endpoint = f"{extractor.worker_url}/api/resolve?surl={urllib.parse.quote(surl_clean)}"
                r = requests.get(w_endpoint, timeout=12)
                diag["step1_worker_direct"] = {
                    "endpoint": w_endpoint,
                    "status_code": r.status_code,
                    "body": r.text[:350]
                }
            except Exception as e:
                diag["step1_worker_direct"] = {"error": str(e), "trace": traceback.format_exc()}

            # 2. Full Extractor Test
            try:
                diag["step2_extractor"] = extractor.get_video_stream(target)
            except Exception as e:
                diag["step2_extractor"] = {"error": str(e), "trace": traceback.format_exc()}

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(diag, indent=2).encode("utf-8"))
            return

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


if __name__ == "__main__":
    logger.info("TeravidsPlay Production Channel Bot is starting...")
    print("\n" + "=" * 60)
    print(" 📢 TeravidsPlay Production Channel Bot is Active!")
    print("=" * 60 + "\n")

    # Start health server for Render / Koyeb cloud hosting (if PORT is set)
    start_health_server()

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
