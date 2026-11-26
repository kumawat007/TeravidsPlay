"""
TeravidsPlay — Production Telegram Channel Bot
Optimized for Telegram Channels & Direct Messaging:
- Multi-Engine Stream & Thumbnail Extraction with Cloudflare Worker Proxy fallback.
- Explicit allowed_updates for Channel Posts, Edited Channel Posts, Messages & Callbacks.
- Extracts verified TeraBox links even in multi-URL promo/captioned messages.
- Mandatory Channel Force-Subscription (FSub) for private DMs.
"""

import os
import re
import io
import sys
import hmac
import json
import time
import html
import logging
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests
from dotenv import load_dotenv
import telebot
from telebot import types

# Always load .env and module paths from the bot folder regardless of execution cwd
bot_dir = os.path.dirname(__file__)
if bot_dir not in sys.path:
    sys.path.insert(0, bot_dir)

dotenv_path = os.path.join(bot_dir, ".env")
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

from terabox_extractor import TeraBoxExtractor, is_terabox_url

extractor = TeraBoxExtractor()

DEFAULT_POSTER = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80"
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def extract_url_from_message(message: types.Message) -> str:
    """
    Extracts the first verified TeraBox or shortener URL from raw text, captions,
    or Telegram formatted hyperlink entities (handles multi-URL messages cleanly).
    """
    text = message.text or message.caption or ""
    candidates = [m.group(0).rstrip(").,;:!?'\"") for m in re.finditer(r"https?://[^\s<>\"']+", text)]

    entities = (message.entities or []) + (message.caption_entities or [])
    for ent in entities:
        ent_url = getattr(ent, "url", None)
        if ent_url:
            candidates.append(ent_url.strip())

    for cand in candidates:
        if is_terabox_url(cand):
            return cand

    return candidates[0] if candidates else ""


def extract_title_hint_from_message(message: types.Message, raw_url: str) -> str:
    """Extracts custom video title or caption written by the user alongside the link."""
    text = (message.text or message.caption or "").strip()
    if not text:
        return ""
    cleaned = text.replace(raw_url, "").strip()
    cleaned = re.sub(r"[\r\n]+", " ", cleaned).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) >= 3 and not cleaned.startswith("http"):
        return cleaned[:120]
    return ""


def _referer_for_url(target_url: str) -> str:
    lower = (target_url or "").lower()
    if any(h in lower for h in ("replit.dev", "replit.app", "repl.co", "iteraplay")):
        return "https://iteraplay.in/"
    if "terabox.app" in lower:
        return "https://www.terabox.app/"
    return "https://www.terabox.com/"


def download_image_bytes(thumb_url: str, timeout: int = 8):
    """
    Downloads image bytes using contextual headers so Telegram receives direct binary upload.
    Routes blocked Replit/iTeraPlay CDN hosts through Cloudflare Worker proxy first for instant loading.
    """
    if not thumb_url or not thumb_url.startswith("http"):
        return None

    attempts = []
    is_blocked_host = any(h in thumb_url.lower() for h in ("replit.dev", "replit.app", "repl.co", "iteraplay", "qzz.io"))

    if extractor.worker_url and not thumb_url.startswith(extractor.worker_url):
        proxied = f"{extractor.worker_url}/?url={urllib.parse.quote(thumb_url, safe='')}"
        if is_blocked_host:
            attempts.append((proxied, {"User-Agent": DEFAULT_UA, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}))
            attempts.append((thumb_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(thumb_url), "Accept": "image/*,*/*;q=0.8"}))
        else:
            attempts.append((thumb_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(thumb_url), "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}))
            attempts.append((proxied, {"User-Agent": DEFAULT_UA, "Accept": "image/*,*/*;q=0.8"}))
    else:
        attempts.append((thumb_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(thumb_url), "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}))

    for fetch_url, hdrs in attempts:
        try:
            curr_timeout = 4 if (not is_blocked_host and fetch_url == thumb_url) else timeout
            resp = requests.get(fetch_url, headers=hdrs, timeout=curr_timeout)
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if (
                resp.status_code == 200
                and 500 < len(resp.content) <= 8 * 1024 * 1024
                and (not ctype or ("text/html" not in ctype and "svg" not in ctype))
            ):
                bio = io.BytesIO(resp.content)
                bio.name = "preview.jpg"
                return bio
        except Exception as e:
            logger.warning(f"Thumbnail fetch failed for {fetch_url[:80]}: {e}")
    return None


def build_channel_markup(stream_url: str, title: str, size: str, surl: str = "", thumb: str = "") -> tuple[types.InlineKeyboardMarkup, str]:
    """Builds direct-to-player inline buttons with permanent non-expiring URLs."""
    markup = types.InlineKeyboardMarkup(row_width=1)

    encoded_title = urllib.parse.quote(title) if title else ""
    encoded_size = urllib.parse.quote(size) if size else ""
    encoded_thumb = urllib.parse.quote(thumb) if (thumb and thumb.startswith("http")) else ""

    if PLAYER_URL and surl:
        player_link = f"{PLAYER_URL}/?v={urllib.parse.quote(surl, safe='')}&tg=1"
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

    # Button 2: Fast Direct Download (Permanent Worker /dl/ or player ?dl=1 so links never expire)
    if extractor.worker_url and surl:
        download_url = f"{extractor.worker_url}/dl/{urllib.parse.quote(surl, safe='')}"
    elif PLAYER_URL:
        download_url = f"{player_link}&dl=1" if "?" in player_link else f"{player_link}?dl=1"
    else:
        download_url = stream_url

    markup.add(types.InlineKeyboardButton(
        text="⚡ 📥 FAST DIRECT DOWNLOAD 🚀",
        url=download_url,
    ))

    return markup, player_link


def publish_card(chat_id, title: str, size: str, quality: str, thumb_url: str, markup: types.InlineKeyboardMarkup, short_link: str = ""):
    """Sends the formatted video card with guaranteed photo preview."""
    safe_title = html.escape(title[:120])
    size_label = size if (size and size not in ["0 B", "Unknown Size", "HD Stream"]) else "1080p HD"
    safe_size = html.escape(str(size_label))
    caption = f"🎬 <b>{safe_title}</b>\n\n📦 <b>Size:</b> {safe_size}"

    # 1. Download real image bytes and upload directly (Fixes missing thumbnail preview!)
    if thumb_url and thumb_url.startswith("http"):
        img_bio = download_image_bytes(thumb_url)
        if img_bio:
            try:
                return bot.send_photo(
                    chat_id=chat_id,
                    photo=img_bio,
                    caption=caption,
                    reply_markup=markup,
                )
            except Exception as e:
                logger.warning(f"Direct photo stream upload failed for {chat_id}: {e}")

    # 2. Try URL delivery if short enough and bytes download failed
    if thumb_url and thumb_url.startswith("http") and len(thumb_url) < 900:
        try:
            return bot.send_photo(
                chat_id=chat_id,
                photo=thumb_url,
                caption=caption,
                reply_markup=markup,
            )
        except Exception as e:
            logger.warning(f"Direct URL photo delivery failed for {chat_id}: {e}")

    # 3. Cinematic high-res fallback poster
    try:
        return bot.send_photo(
            chat_id=chat_id,
            photo=DEFAULT_POSTER,
            caption=caption,
            reply_markup=markup,
        )
    except Exception as e:
        logger.warning(f"Default poster photo delivery also failed for {chat_id}: {e}")

    # 4. Text fallback
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
    logger.info(f"Incoming channel post in chat ID {message.chat.id}")
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
        logger.info(f"Using instant Web Player fallback for channel post: {masked_token}")
        title = data.get("title") if (data.get("title") and data.get("title") not in ["TeraBox Video", "TeraBox Video Stream"]) else (title_hint or data.get("title") or "TeraBox Video")
        size = data.get("size_formatted") or "1080p HD"
        quality = data.get("quality") or "HD 1080p"
        stream_url = data.get("stream_url") or ""
        thumb_url = data.get("thumbnail")
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

    try:
        bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
        logger.info(f"Deleted raw post {message.message_id} in channel.")
    except Exception as e:
        logger.info(f"Could not delete original post: {e}")


# ==============================================================
# 2. FORCE SUBSCRIPTION (FSub) & CHANNEL ACCESS GUARD
# ==============================================================
def get_channel_invite_link() -> str:
    """Returns the clean public invite link for the official channel."""
    target = (TARGET_CHANNEL_ID or "").strip()
    if target.startswith("@"):
        return f"https://t.me/{target[1:]}"
    return "https://t.me/teravidsplayer"


def is_user_subscribed(user_id: int) -> bool:
    """
    Checks if a user is subscribed to the official target channel.
    Returns True if subscribed, creator, administrator, or if TARGET_CHANNEL_ID is not set.
    """
    if not TARGET_CHANNEL_ID:
        return True
    try:
        member = bot.get_chat_member(TARGET_CHANNEL_ID, user_id)
        return member.status in ["creator", "administrator", "member", "restricted"]
    except telebot.apihelper.ApiTelegramException as e:
        err_msg = str(e).lower()
        if "user_not_participant" in err_msg or "participant_id_invalid" in err_msg:
            return False
        logger.warning(f"FSub API check: user_id={user_id} - {e}")
        return False
    except Exception as e:
        logger.warning(f"Unexpected FSub error for user {user_id}: {e}")
        return True


FORCE_SUB_TEXT = (
    "🔒 <b>Access Restricted — Channel Members Only!</b>\n\n"
    "To use <b>TeravidsPlay Bot</b> and stream TeraBox videos with:\n"
    "• ⚡ Instant 1080p Full HD Streaming\n"
    "• 🚫 Zero Ads & Zero Popups\n"
    "• 🚀 High-Speed Direct Downloads\n\n"
    "👉 You must join our official channel <b>@teravidsplayer</b> first!\n\n"
    "👇 <b>Steps to Unlock:</b>\n"
    "1️⃣ Click <b>📢 Join Official Channel</b> below.\n"
    "2️⃣ Tap <b>Join</b> in the channel.\n"
    "3️⃣ Return here and tap <b>🔄 Verify Membership</b>!"
)


def get_force_sub_markup() -> types.InlineKeyboardMarkup:
    """Generates the modern 2-step inline keyboard for Force Subscription."""
    markup = types.InlineKeyboardMarkup(row_width=1)
    channel_url = get_channel_invite_link()
    btn_join = types.InlineKeyboardButton("📢 1. Join Official Channel ✨", url=channel_url)
    btn_verify = types.InlineKeyboardButton("🔄 2. Verify Membership 🚀", callback_data="verify_fsub")
    markup.add(btn_join, btn_verify)
    return markup


@bot.callback_query_handler(func=lambda call: call.data == "verify_fsub")
def handle_verify_fsub(call: types.CallbackQuery):
    """Handles the 1-tap verification button when a user claims they have joined."""
    user_id = call.from_user.id
    if is_user_subscribed(user_id):
        try:
            bot.answer_callback_query(call.id, "✅ Verified! Welcome to TeravidsPlay 🚀", show_alert=False)
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=(
                    "🎉 <b>Channel Membership Verified!</b>\n\n"
                    "Welcome to <b>TeravidsPlay</b> 🚀\n"
                    "Your access has been successfully unlocked.\n\n"
                    "🎬 <b>How to Watch:</b>\n"
                    "• Send any TeraBox link here in DM.\n"
                    "• Enjoy fast 1080p streaming with Zero Ads!\n\n"
                    "📢 Browse trending movies & series on <b>@teravidsplayer</b>"
                ),
                parse_mode="HTML",
            )
        except Exception as e:
            logger.warning(f"Error editing verify message: {e}")
    else:
        try:
            bot.answer_callback_query(
                call.id,
                "⚠️ You have NOT joined @teravidsplayer yet!\n\nPlease tap 'Join Official Channel' first, then tap Verify.",
                show_alert=True,
            )
        except Exception as e:
            logger.warning(f"Error answering callback query: {e}")


# ==============================================================
# 3. PRIVATE CHAT COMMANDS & ADMIN HANDLERS
# ==============================================================
@bot.message_handler(commands=["start", "help"])
def handle_start(message: types.Message):
    if message.chat.type == "private" and not is_user_subscribed(message.from_user.id):
        bot.reply_to(
            message,
            FORCE_SUB_TEXT,
            reply_markup=get_force_sub_markup(),
            parse_mode="HTML",
        )
        return

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
        "• <b>Status Check:</b> /status"
    )
    bot.reply_to(message, welcome_text)


BOT_USERNAME = ""
try:
    BOT_USERNAME = bot.get_me().username or ""
except Exception:
    BOT_USERNAME = ""


@bot.message_handler(commands=["status"])
def handle_status(message: types.Message):
    uid = message.from_user.id if message.from_user else None
    if message.chat.type == "private" and uid is not None and not is_user_subscribed(uid):
        bot.reply_to(
            message,
            FORCE_SUB_TEXT,
            reply_markup=get_force_sub_markup(),
            parse_mode="HTML",
        )
        return

    global BOT_USERNAME
    if not BOT_USERNAME:
        try:
            BOT_USERNAME = bot.get_me().username or "Teravidsplayerbot"
        except Exception:
            BOT_USERNAME = "Teravidsplayerbot"

    safe_player = html.escape(PLAYER_URL) if PLAYER_URL else ""
    safe_channel = html.escape(TARGET_CHANNEL_ID or "Not Set")
    status_text = (
        "⚙️ <b>TeravidsPlay System Diagnostics</b>\n\n"
        "• <b>Engine:</b> 🚀 High-Speed Direct Edge Engine (Active)\n"
        f"• <b>Web Player:</b> {'✅ ' + safe_player if safe_player else '⚠️ Not Set'}\n"
        f"• <b>Target Channel:</b> <code>{safe_channel}</code>\n"
        f"• <b>Bot Username:</b> @{html.escape(BOT_USERNAME)}\n"
    )
    bot.reply_to(message, status_text)


@bot.message_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
def handle_private_post(message: types.Message):
    """Handles TeraBox links sent to the bot in private DM."""
    uid = message.from_user.id if message.from_user else None
    if message.chat.type == "private" and uid is not None and not is_user_subscribed(uid):
        bot.reply_to(
            message,
            FORCE_SUB_TEXT,
            reply_markup=get_force_sub_markup(),
            parse_mode="HTML",
        )
        return

    raw_url = extract_url_from_message(message)
    if not raw_url or not is_terabox_url(raw_url):
        if message.chat.type == "private":
            hint_text = (
                "👋 <b>Welcome to TeravidsPlay!</b>\n\n"
                "Please send a valid <b>TeraBox link</b> to stream or download.\n\n"
                "💡 <i>Example:</i> <code>https://terabox.com/s/1abcXYZ...</code>\n\n"
                "📢 Or explore our latest collection on <b>@teravidsplayer</b>!"
            )
            bot.reply_to(message, hint_text, parse_mode="HTML")
        return

    surl_preview = extractor.parse_surl(raw_url) or ""
    masked_token = f"{surl_preview[:3]}***{surl_preview[-3:]}" if len(surl_preview) > 6 else "***"
    logger.info(f"Processing verified TeraBox link in DM: surl={masked_token}")

    waiting_msg = None
    try:
        waiting_msg = bot.send_message(
            chat_id=message.chat.id,
            text="⏳ <b>Resolving video stream...</b>",
            parse_mode="HTML",
        )
    except Exception:
        pass

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
        title = data.get("title") if (data.get("title") and data.get("title") not in ["TeraBox Video", "TeraBox Video Stream"]) else (title_hint or data.get("title") or "TeraBox Video")
        size = data.get("size_formatted") or "1080p HD"
        quality = data.get("quality") or "HD 1080p"
        stream_url = data.get("stream_url") or ""
        thumb_url = data.get("thumbnail")
    else:
        if waiting_msg:
            try:
                bot.delete_message(chat_id=message.chat.id, message_id=waiting_msg.message_id)
            except Exception:
                pass
        safe_err = html.escape(str(data.get("message", "Link expired or unreachable.")))
        bot.reply_to(
            message,
            f"❌ <b>Resolution Failed:</b>\n{safe_err}",
            parse_mode="HTML",
        )
        return

    markup, short_link = build_channel_markup(
        stream_url=stream_url,
        title=title,
        size=size,
        surl=surl,
        thumb=thumb_url or "",
    )

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
            logger.info(f"Published to channel {TARGET_CHANNEL_ID}")
        except Exception as e:
            logger.error(f"Failed to publish to channel {TARGET_CHANNEL_ID}: {e}")

    if waiting_msg:
        try:
            bot.delete_message(chat_id=message.chat.id, message_id=waiting_msg.message_id)
        except Exception:
            pass

    publish_card(
        chat_id=message.chat.id,
        title=title,
        size=size,
        quality=quality,
        thumb_url=thumb_url,
        markup=markup,
        short_link=short_link,
    )


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
            if not admin_secret:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(b'{"error":"Diagnostic endpoint disabled. Set ADMIN_SECRET to enable."}')
                return

            query = urllib.parse.parse_qs(parsed.query)
            token = query.get("token", [""])[0] or query.get("key", [""])[0]
            auth_header = self.headers.get("Authorization", "")
            bearer_token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""

            token_ok = bool(token) and hmac.compare_digest(token, admin_secret)
            bearer_ok = bool(bearer_token) and hmac.compare_digest(bearer_token, admin_secret)
            if not token_ok and not bearer_ok:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(b'{"error":"Unauthorized: Valid ADMIN_SECRET token required."}')
                return

            raw_target = query.get("url", ["https://terabox.com/s/12-bl47-KEpRsDf840jID3A"])[0]
            if not is_terabox_url(raw_target):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(b'{"error":"Invalid target: Domain must belong to authorized TeraBox services."}')
                return

            diag = {
                "status": "authenticated",
                "worker_url": extractor.worker_url,
                "step1_worker_direct": None,
                "step2_extractor": None,
            }

            try:
                w_endpoint = f"{extractor.worker_url}/api/resolve?surl={urllib.parse.quote(raw_target, safe='')}"
                r = requests.get(w_endpoint, timeout=16)
                diag["step1_worker_direct"] = {
                    "status_code": r.status_code,
                    "body": r.text[:250],
                }
            except Exception as e:
                diag["step1_worker_direct"] = {"error": str(e)}

            try:
                diag["step2_extractor"] = extractor.get_video_stream(raw_target)
            except Exception as e:
                diag["step2_extractor"] = {"error": str(e)}

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(json.dumps(diag, indent=2).encode("utf-8"))
            return

        # 2. Public Health Check Endpoint (Only used by Render/Koyeb uptime probes)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Content-Type-Options", "nosniff")
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
    Sends an internal heartbeat HTTP ping every 8 minutes.
    """
    time.sleep(30)
    health_url = os.getenv("RENDER_EXTERNAL_URL") or "https://teravidsplay.onrender.com"
    health_url = health_url.rstrip("/")
    logger.info(f"[KeepAlive] 24/7 Keep-alive monitor active for: {health_url}")
    while True:
        try:
            time.sleep(480)
            resp = requests.get(f"{health_url}/", timeout=12)
            logger.info(f"[KeepAlive] Heartbeat ping delivered: HTTP {resp.status_code}")
        except Exception as e:
            logger.debug(f"[KeepAlive] Heartbeat ping notice: {e}")


if __name__ == "__main__":
    logger.info("TeravidsPlay Production Channel Bot is starting...")
    print("\n" + "=" * 60)
    print(" 📢 TeravidsPlay Production Channel Bot is Active!")
    print("=" * 60 + "\n")

    start_health_server()

    t_keepalive = threading.Thread(target=keep_alive_loop, daemon=True)
    t_keepalive.start()

    while True:
        try:
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
                allowed_updates=["message", "edited_message", "channel_post", "edited_channel_post", "callback_query"],
                restart_on_change=False,
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
