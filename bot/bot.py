"""
TeravidsPlay — Production Telegram Channel Bot
Optimized for Telegram Channels & Direct Messaging:
- Multi-Engine Stream & Thumbnail Extraction with Cloudflare Worker Proxy-first thumbnails.
- Multi-Video Folder Playlist Support (Playlist summary + all individual video cards with real thumbnails/sizes).
- Multi-URL Channel Post Extraction (never drops URLs #2..N when deleting raw posts).
- Strict Channel Admin Guard for DM auto-publishing + Mandatory FSub for private DMs.
- Honest DiskWala detection (metadata + auth requirement clarity, zero external site redirects).
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
import concurrent.futures
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, List, Optional, Tuple
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
ADMIN_USER_IDS = {
    x.strip() for x in os.getenv("ADMIN_USER_IDS", "").split(",") if x.strip()
}
MAX_FOLDER_CARDS = max(1, int(os.getenv("MAX_FOLDER_CARDS", "25") or "25"))

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("TeravidsPlayBot")

if not BOT_TOKEN:
    print(f"\n[CRITICAL ERROR] BOT_TOKEN is missing in {dotenv_path}!\n")
    sys.exit(1)

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML", num_threads=6)


def _reply_or_send(message: types.Message, text: str, **kwargs):
    """Replies to a message cleanly, falling back to send_message if the original message was deleted."""
    try:
        return bot.reply_to(message, text, **kwargs)
    except telebot.apihelper.ApiTelegramException as e:
        err_l = str(e).lower()
        if "message to reply not found" in err_l or "reply message not found" in err_l or "message to be replied not found" in err_l:
            return bot.send_message(message.chat.id, text, **kwargs)
        raise

from terabox_extractor import (
    TeraBoxExtractor,
    is_terabox_url,
    extract_all_urls,
    is_direct_video_url,
    extract_all_direct_video_urls,
    format_bytes,
)

extractor = TeraBoxExtractor()

DEFAULT_POSTER = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80"
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _collect_message_urls(message: types.Message, text_extractor, validator) -> List[str]:
    """Shared helper to extract deduplicated verified URLs from text, caption, and Telegram entities."""
    text = message.text or message.caption or ""
    urls: List[str] = []
    seen = set()

    for u in text_extractor(text):
        if u not in seen:
            seen.add(u)
            urls.append(u)

    entities = (message.entities or []) + (message.caption_entities or [])
    for ent in entities:
        ent_url = (getattr(ent, "url", None) or "").strip()
        if ent_url and ent_url not in seen and validator(ent_url):
            seen.add(ent_url)
            urls.append(ent_url)

    return urls


def extract_urls_from_message(message: types.Message) -> List[str]:
    """Extracts ALL verified TeraBox/DiskWala/shortener URLs cleanly in order without duplicates."""
    return _collect_message_urls(message, extract_all_urls, is_terabox_url)


def extract_direct_video_urls_from_message(message: types.Message) -> List[str]:
    """Extracts ALL verified public HTTPS direct video/HLS URLs (.mp4, .m3u8, etc.) from a message."""
    return _collect_message_urls(message, extract_all_direct_video_urls, is_direct_video_url)


def _build_direct_stream_bundle(direct_url: str, title_hint: str = "") -> Dict[str, Any]:
    """Builds a stream-only playlist payload for a direct public HTTPS .mp4/.m3u8 URL (zero server upload)."""
    parsed_u = urllib.parse.urlparse(direct_url)
    raw_fn = os.path.basename(urllib.parse.unquote(parsed_u.path or ""))
    clean_name = re.sub(r"\.[a-z0-9]{2,5}$", "", raw_fn, flags=re.I) if raw_fn else ""
    fallback_title = clean_name.replace("_", " ").replace("-", " ").strip() or "Full HD Cloud Stream"
    final_title = title_hint or fallback_title
    is_hls = ".m3u8" in (parsed_u.path or "").lower()
    return {
        "success": True,
        "surl": "",
        "dir_path": "",
        "videos": [
            {
                "title": final_title,
                "size_bytes": 0,
                "size_formatted": "Full HD Stream",
                "thumbnail": "",
                "stream_url": direct_url,
                "hls_url": direct_url if is_hls else None,
                "quality": "HD",
            }
        ],
    }


def extract_url_from_message(message: types.Message) -> str:
    """Backward-compatible single URL extractor returning the first verified URL."""
    urls = extract_urls_from_message(message)
    return urls[0] if urls else ""


def extract_title_hint_from_message(message: types.Message, urls: List[str]) -> str:
    """Extracts custom video title or caption written by the user alongside the link(s)."""
    text = (message.text or message.caption or "").strip()
    if not text:
        return ""
    cleaned = text
    for u in urls:
        cleaned = cleaned.replace(u, "")
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    cleaned = re.sub(r"[\r\n]+", " ", cleaned).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) >= 3 and not cleaned.startswith("http"):
        return cleaned[:120]
    return ""


def _referer_for_url(target_url: str) -> str:
    lower = (target_url or "").lower()
    if any(h in lower for h in ("replit.dev", "replit.app", "repl.co", "iteraplay", "qzz.io")):
        return "https://iteraplay.in/"
    if "1024terabox.com" in lower:
        return "https://1024terabox.com/"
    if "1024tera.com" in lower:
        return "https://www.1024tera.com/"
    if "terabox.app" in lower:
        return "https://www.terabox.app/"
    if "diskwala.com" in lower:
        return "https://www.diskwala.com/"
    return "https://www.terabox.com/"


def _detect_image_filename(content: bytes) -> Optional[str]:
    """Detects real image extension from binary magic bytes; returns None if payload isn't a safe raster image."""
    if not content or len(content) < 12:
        return None
    if content[:3] == b"\xff\xd8\xff":
        return "preview.jpg"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "preview.png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "preview.webp"
    if content[:4] == b"GIF8":
        return "preview.gif"
    return None


def download_image_bytes(thumb_url: str, timeout: int = 10) -> Optional[io.BytesIO]:
    """
    Downloads real thumbnail bytes with proxy-first routing for blocked/rate-limited hosts
    (Replit/iTeraPlay/1024tera/TeraBox CDNs/DiskWala) so Telegram gets direct binary photo upload.
    """
    if not thumb_url or not thumb_url.startswith("http"):
        return None

    lower = thumb_url.lower()
    proxy_first_hosts = (
        "replit.dev", "replit.app", "repl.co", "iteraplay", "qzz.io",
        "1024terabox", "1024tera", "terabox", "dm-data", "diskwala", "bdydns", "baidupcs",
    )
    use_worker_first = any(h in lower for h in proxy_first_hosts)

    attempts: List[Tuple[str, Dict[str, str], int]] = []
    img_accept = "image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8"

    if extractor.worker_url and not thumb_url.startswith(extractor.worker_url):
        proxied = f"{extractor.worker_url}/?url={urllib.parse.quote(thumb_url, safe='')}"
        if use_worker_first:
            attempts.append((proxied, {"User-Agent": DEFAULT_UA, "Accept": img_accept}, timeout))
            attempts.append((thumb_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(thumb_url), "Accept": img_accept}, 5))
        else:
            attempts.append((thumb_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(thumb_url), "Accept": img_accept}, 5))
            attempts.append((proxied, {"User-Agent": DEFAULT_UA, "Accept": img_accept}, timeout))
    else:
        attempts.append((thumb_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(thumb_url), "Accept": img_accept}, timeout))

    for fetch_url, hdrs, req_timeout in attempts:
        try:
            resp = requests.get(fetch_url, headers=hdrs, timeout=req_timeout)
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if resp.status_code == 200 and 500 < len(resp.content) <= 8 * 1024 * 1024:
                if "text/html" in ctype or "svg" in ctype or "application/json" in ctype:
                    continue
                img_name = _detect_image_filename(resp.content)
                if not img_name and not ctype.startswith("image/"):
                    continue
                bio = io.BytesIO(resp.content)
                bio.name = img_name or "preview.jpg"
                return bio
        except Exception as e:
            logger.debug(f"Thumbnail fetch notice for {fetch_url[:80]}: {e}")
    return None


def build_channel_markup(
    stream_url: str,
    title: str,
    size: str,
    surl: str = "",
    thumb: str = "",
    dir_path: str = "",
    idx: Optional[int] = None,
    file_id: str = "",
    playlist_count: int = 1,
    is_summary: bool = False,
) -> tuple[types.InlineKeyboardMarkup, str]:
    """Builds direct-to-player inline buttons strictly keeping users on TeravidsPlay & Telegram."""
    markup = types.InlineKeyboardMarkup(row_width=1)

    if PLAYER_URL and surl:
        params: List[str] = [f"v={urllib.parse.quote(surl, safe='')}"]
        if dir_path:
            params.append(f"path={urllib.parse.quote(dir_path, safe='')}")
        if playlist_count > 1:
            params.append("list=1")
        if idx is not None and idx >= 0 and not is_summary:
            params.append(f"idx={idx}")
        params.append("tg=1")
        player_link = f"{PLAYER_URL}/?{'&'.join(params)}"
    elif PLAYER_URL and stream_url:
        encoded_stream = urllib.parse.quote(stream_url, safe="")
        params = [f"stream={encoded_stream}", "tg=1"]
        if title:
            params.append(f"title={urllib.parse.quote(title)}")
        if size:
            params.append(f"size={urllib.parse.quote(size)}")
        if thumb and thumb.startswith("http"):
            params.append(f"thumb={urllib.parse.quote(thumb)}")
        player_link = f"{PLAYER_URL}/?{'&'.join(params)}"
    else:
        player_link = stream_url or get_channel_invite_link()

    if is_summary and playlist_count > 1:
        watch_label = f"🟢 ▶️ WATCH ALL ({playlist_count} VIDEOS) 🍿"
    elif idx is not None and playlist_count > 1:
        watch_label = f"🟢 ▶️ WATCH PART {idx + 1}/{playlist_count} (HD) 🍿"
    else:
        watch_label = "🟢 ▶️ WATCH ONLINE (FULL HD) 🍿"

    markup.add(types.InlineKeyboardButton(text=watch_label, url=player_link))
    return markup, player_link


def _send_telegram_with_retry(fn, *args, **kwargs):
    """Calls a Telegram Bot API method with automatic RetryAfter flood-wait handling."""
    for attempt in range(3):
        try:
            return fn(*args, **kwargs)
        except telebot.apihelper.ApiTelegramException as e:
            if e.error_code == 429 and attempt < 2:
                retry_after = 5
                try:
                    retry_after = int(e.result_json.get("parameters", {}).get("retry_after", 5))
                except Exception:
                    pass
                time.sleep(min(max(retry_after, 1), 15) + 0.5)
                continue
            raise


def publish_card(
    chat_id,
    title: str,
    size: str,
    quality: str,
    thumb_url: str,
    markup: types.InlineKeyboardMarkup,
    prefetched_bio: Optional[io.BytesIO] = None,
):
    """Sends the formatted video card with guaranteed binary photo upload or clean fallback."""
    safe_title = html.escape(title[:120])
    fallback_q = quality if (quality and quality not in ("Unknown", "")) else "HD Stream"
    size_label = size if (size and size not in ("0 B", "Unknown Size", "HD Stream")) else fallback_q
    safe_size = html.escape(str(size_label))
    caption = f"🎬 <b>{safe_title}</b>\n\n📦 <b>Size:</b> {safe_size}"

    # 1. Binary photo stream (either pre-fetched concurrently or downloaded now)
    img_bio = prefetched_bio
    if img_bio is not None:
        img_bio.seek(0)
    elif thumb_url and thumb_url.startswith("http"):
        img_bio = download_image_bytes(thumb_url)

    if img_bio:
        try:
            return _send_telegram_with_retry(
                bot.send_photo,
                chat_id=chat_id,
                photo=img_bio,
                caption=caption,
                reply_markup=markup,
            )
        except Exception as e:
            logger.warning(f"Direct photo stream upload failed for {chat_id}: {e}")

    # 2. Try URL delivery if short enough
    if thumb_url and thumb_url.startswith("http") and len(thumb_url) < 900:
        try:
            return _send_telegram_with_retry(
                bot.send_photo,
                chat_id=chat_id,
                photo=thumb_url,
                caption=caption,
                reply_markup=markup,
            )
        except Exception as e:
            logger.warning(f"Direct URL photo delivery failed for {chat_id}: {e}")

    # 3. High-res fallback poster
    try:
        return _send_telegram_with_retry(
            bot.send_photo,
            chat_id=chat_id,
            photo=DEFAULT_POSTER,
            caption=caption,
            reply_markup=markup,
        )
    except Exception as e:
        logger.warning(f"Default poster photo delivery failed for {chat_id}: {e}")

    # 4. Text fallback
    return _send_telegram_with_retry(
        bot.send_message,
        chat_id=chat_id,
        text=caption,
        reply_markup=markup,
    )


def _prefetch_thumbnails(videos: List[Dict[str, Any]]) -> Dict[int, Optional[io.BytesIO]]:
    """Concurrently fetches thumbnails for multi-video folders via Worker proxy."""
    results: Dict[int, Optional[io.BytesIO]] = {}
    targets = [(i, v.get("thumbnail")) for i, v in enumerate(videos) if v.get("thumbnail")]
    if not targets:
        return results
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(5, len(targets))) as ex:
        fut_map = {ex.submit(download_image_bytes, url): idx for idx, url in targets}
        for fut in concurrent.futures.as_completed(fut_map):
            idx = fut_map[fut]
            try:
                results[idx] = fut.result()
            except Exception:
                results[idx] = None
    return results


def publish_resolved_bundle(chat_id, data: Dict[str, Any], title_hint: str = "") -> int:
    """
    Publishes either a single video card OR a Playlist Summary + all individual folder cards
    (with thumbnails, titles, and sizes). Returns number of cards published.
    """
    surl = data.get("surl") or ""
    dir_path = data.get("dir_path") or ""
    videos = data.get("videos") or []

    if not videos and (data.get("title") or surl):
        videos = [data]

    total = len(videos)
    if total == 0:
        return 0

    if total == 1:
        vid = videos[0]
        raw_title = vid.get("title") or ""
        title = raw_title if raw_title not in ("TeraBox Video", "TeraBox Video Stream") else (title_hint or raw_title or "TeraBox Video")
        size = vid.get("size_formatted", "")
        quality = vid.get("quality", "HD")
        stream_url = vid.get("stream_url", "")
        thumb_url = vid.get("thumbnail") or ""
        fid = vid.get("file_id") or ""

        markup, _ = build_channel_markup(
            stream_url=stream_url,
            title=title,
            size=size,
            surl=surl,
            thumb=thumb_url,
            dir_path=dir_path,
            file_id=fid,
        )
        publish_card(chat_id, title, size, quality, thumb_url, markup)
        return 1

    # Multi-video folder collection!
    publish_subset = videos[:MAX_FOLDER_CARDS]
    thumbs_cache = _prefetch_thumbnails(publish_subset)

    try:
        total_bytes = sum(int(v.get("size_bytes") or 0) for v in videos)
        folder_label = dir_path.strip("/").split("/")[-1] if dir_path else ""
        summary_title = f"📁 {folder_label or 'Collection'} ({total} Videos)"
        summary_size = f"{format_bytes(total_bytes)} Total ({total} Files)" if total_bytes > 0 else f"{total} Videos (Playlist)"
        lead_thumb = next((v.get("thumbnail") for v in publish_subset if v.get("thumbnail")), "")

        summary_markup, _ = build_channel_markup(
            stream_url=publish_subset[0].get("stream_url", ""),
            title=summary_title,
            size=summary_size,
            surl=surl,
            thumb=lead_thumb,
            dir_path=dir_path,
            playlist_count=total,
            is_summary=True,
        )
        publish_card(
            chat_id,
            summary_title,
            summary_size,
            "Playlist",
            lead_thumb,
            summary_markup,
            prefetched_bio=thumbs_cache.get(0),
        )

        sent_count = 1
        for i, vid in enumerate(publish_subset):
            time.sleep(0.45)
            raw_title = vid.get("title") or f"Video {i + 1}"
            item_title = f"[{i + 1}/{total}] {raw_title}"
            item_size = vid.get("size_formatted", "")
            item_quality = vid.get("quality", "HD")
            item_stream = vid.get("stream_url", "")
            item_thumb = vid.get("thumbnail") or ""
            item_fid = vid.get("file_id") or ""

            item_markup, _ = build_channel_markup(
                stream_url=item_stream,
                title=raw_title,
                size=item_size,
                surl=surl,
                thumb=item_thumb,
                dir_path=dir_path,
                idx=i,
                file_id=item_fid,
                playlist_count=total,
                is_summary=False,
            )
            publish_card(
                chat_id,
                item_title,
                item_size,
                item_quality,
                item_thumb,
                item_markup,
                prefetched_bio=thumbs_cache.get(i),
            )
            sent_count += 1

        return sent_count
    finally:
        for bio in thumbs_cache.values():
            if bio is not None:
                try:
                    bio.close()
                except Exception:
                    pass


# ==============================================================
# 1. CHANNEL POST HANDLERS (Automatic Channel Processing)
# ==============================================================
@bot.channel_post_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
@bot.edited_channel_post_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
def handle_channel_post(message: types.Message):
    """Catches all supported links posted in the channel and replaces them with rich TeravidsPlay stream cards."""
    logger.info(f"Incoming channel post in chat ID {message.chat.id}")
    urls = extract_urls_from_message(message)
    direct_urls = extract_direct_video_urls_from_message(message)
    if not urls and not direct_urls:
        return

    title_hint = extract_title_hint_from_message(message, urls + direct_urls)
    any_published = False

    for raw_url in urls:
        surl_preview = extractor.parse_surl(raw_url) or ""
        masked_token = f"{surl_preview[:3]}***{surl_preview[-3:]}" if len(surl_preview) > 6 else "***"
        logger.info(f"Processing verified channel link: surl={masked_token}")

        data = extractor.get_video_stream(raw_url)
        if data.get("requires_auth_api"):
            logger.warning(f"Skipping DiskWala channel post (requires authenticated API): {data.get('message')}")
            continue

        videos = data.get("videos") or []
        has_playable_or_real = bool(
            data.get("success")
            and (
                any(v.get("stream_url") or v.get("hls_url") for v in videos)
                or (data.get("title") and data["title"] not in ("TeraBox Video", "TeraBox Video Stream"))
                or any(v.get("title") and v["title"] not in ("TeraBox Video", "TeraBox Video Stream") for v in videos)
            )
        )

        if not has_playable_or_real:
            logger.warning(f"Resolution unavailable for channel link {masked_token}; skipping empty card publish.")
            continue

        count = publish_resolved_bundle(message.chat.id, data, title_hint=title_hint)
        if count > 0:
            any_published = True
            logger.info(f"Successfully published {count} card(s) to channel {message.chat.id}!")

    for direct_url in direct_urls:
        bundle = _build_direct_stream_bundle(direct_url, title_hint=title_hint)
        count = publish_resolved_bundle(message.chat.id, bundle, title_hint=title_hint)
        if count > 0:
            any_published = True
            logger.info(f"Successfully published direct stream card to channel {message.chat.id}!")

    if any_published:
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


def is_channel_admin(user_id: Optional[int]) -> bool:
    """Checks whether a DM user is an authorized channel owner/admin allowed to publish to TARGET_CHANNEL_ID."""
    if user_id is None:
        return False
    if str(user_id) in ADMIN_USER_IDS:
        return True
    if not TARGET_CHANNEL_ID:
        return False
    try:
        member = bot.get_chat_member(TARGET_CHANNEL_ID, user_id)
        return member.status in ("creator", "administrator")
    except Exception:
        return False


def is_user_subscribed(user_id: int) -> bool:
    """
    Checks if a user is subscribed to the official target channel.
    Only locks users out on explicit non-member API responses; transient errors fail open.
    """
    if not TARGET_CHANNEL_ID:
        return True
    try:
        member = bot.get_chat_member(TARGET_CHANNEL_ID, user_id)
        return member.status in ["creator", "administrator", "member", "restricted"]
    except telebot.apihelper.ApiTelegramException as e:
        err_msg = str(e).lower()
        if any(tok in err_msg for tok in ("user_not_participant", "participant_id_invalid", "kicked", "left")):
            return False
        logger.warning(f"Transient FSub API error for user {user_id}: {e}")
        return True
    except Exception as e:
        logger.warning(f"Unexpected FSub error for user {user_id}: {e}")
        return True


FORCE_SUB_TEXT = (
    "🔒 <b>Access Restricted — Channel Members Only!</b>\n\n"
    "To use <b>TeravidsPlay Bot</b> and stream videos with:\n"
    "• ⚡ Instant Full HD Streaming\n"
    "• 🚫 Zero Ads &amp; Zero Popups\n"
    "• 📱 Smooth Mobile &amp; Theater Playback\n\n"
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
                    "• Send any TeraBox video or folder link here in DM.\n"
                    "• Enjoy fast Full HD streaming with Zero Ads!\n\n"
                    "📢 Browse trending videos on <b>@teravidsplayer</b>"
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
    uid = message.from_user.id if message.from_user else None
    if message.chat.type == "private" and uid is not None and not is_user_subscribed(uid):
        _reply_or_send(
            message,
            FORCE_SUB_TEXT,
            reply_markup=get_force_sub_markup(),
            parse_mode="HTML",
        )
        return

    welcome_text = (
        "📢 <b>Welcome to TeravidsPlay Bot!</b>\n\n"
        "Send me any TeraBox video or multi-video folder link here, or post it in <b>@teravidsplayer</b>.\n\n"
        "<b>Features:</b>\n"
        "• Supports single videos AND multi-video folder playlists.\n"
        "• Long-press 2X & 4X speed controls.\n"
        "• Web Audio API 300% volume booster.\n"
        "• Double-tap 10s seek & Auto-resume.\n"
        "• Zero Ads & Zero Popups — everything plays inside TeravidsPlay!\n\n"
        f"• <b>Target Channel:</b> <code>{html.escape(TARGET_CHANNEL_ID or 'Not Set')}</code>\n"
        "• <b>Status Check:</b> /status"
    )
    _reply_or_send(message, welcome_text)


BOT_USERNAME = ""
try:
    BOT_USERNAME = bot.get_me().username or ""
except Exception:
    BOT_USERNAME = ""


@bot.message_handler(commands=["status"])
def handle_status(message: types.Message):
    uid = message.from_user.id if message.from_user else None
    if message.chat.type == "private" and uid is not None and not is_user_subscribed(uid):
        _reply_or_send(
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
        "• <b>Engine:</b> 🚀 Multi-Video Edge + Folder Resolver (Active)\n"
        f"• <b>Web Player:</b> {'✅ ' + safe_player if safe_player else '⚠️ Not Set'}\n"
        f"• <b>Target Channel:</b> <code>{safe_channel}</code>\n"
        f"• <b>Bot Username:</b> @{html.escape(BOT_USERNAME)}\n"
    )
    _reply_or_send(message, status_text)


@bot.message_handler(func=lambda msg: True, content_types=telebot.util.content_type_media)
def handle_private_post(message: types.Message):
    """Handles video & folder links sent to the bot in private DM (admin-only channel sync)."""
    uid = message.from_user.id if message.from_user else None
    if message.chat.type == "private" and uid is not None and not is_user_subscribed(uid):
        _reply_or_send(
            message,
            FORCE_SUB_TEXT,
            reply_markup=get_force_sub_markup(),
            parse_mode="HTML",
        )
        return

    urls = extract_urls_from_message(message)
    direct_urls = extract_direct_video_urls_from_message(message)
    can_post_channel = bool(TARGET_CHANNEL_ID and is_channel_admin(uid))

    if not urls and not direct_urls:
        if message.chat.type == "private":
            hint_text = (
                "👋 <b>Welcome to TeravidsPlay!</b>\n\n"
                "Please send a valid <b>TeraBox link</b> or direct <code>.mp4 / .m3u8</code> link (e.g. <code>files.catbox.moe</code>, Cloudflare R2) to stream in Full HD.\n\n"
                "📢 Explore trending releases on <b>@teravidsplayer</b>!"
            )
            _reply_or_send(message, hint_text, parse_mode="HTML")
        return

    waiting_msg = None
    try:
        waiting_msg = bot.send_message(
            chat_id=message.chat.id,
            text="⏳ <b>Resolving video stream &amp; preview...</b>",
            parse_mode="HTML",
        )
    except Exception:
        pass

    title_hint = extract_title_hint_from_message(message, urls + direct_urls)

    try:
        for direct_url in direct_urls:
            bundle = _build_direct_stream_bundle(direct_url, title_hint=title_hint)
            if can_post_channel:
                try:
                    target = int(TARGET_CHANNEL_ID) if TARGET_CHANNEL_ID.lstrip("-").isdigit() else TARGET_CHANNEL_ID
                    publish_resolved_bundle(target, bundle, title_hint=title_hint)
                    logger.info(f"Admin {uid} published direct stream link to channel {TARGET_CHANNEL_ID}")
                except Exception as e:
                    logger.error(f"Failed to publish direct link to channel {TARGET_CHANNEL_ID}: {e}")
            publish_resolved_bundle(message.chat.id, bundle, title_hint=title_hint)

        for raw_url in urls:
            surl_preview = extractor.parse_surl(raw_url) or ""
            masked_token = f"{surl_preview[:3]}***{surl_preview[-3:]}" if len(surl_preview) > 6 else "***"
            logger.info(f"Processing verified DM link: surl={masked_token}")

            data = extractor.get_video_stream(raw_url)

            # Handle DiskWala cleanly without redirecting externally
            if data.get("requires_auth_api"):
                dw_size = html.escape(str(data.get("size_formatted") or "Unknown"))
                dw_title = html.escape(str(data.get("title") or "DiskWala Video"))
                _reply_or_send(
                    message,
                    f"⚠️ <b>{dw_title} ({dw_size})</b>\n\n"
                    "DiskWala links are locked to the DiskWala mobile app and require paid/authenticated "
                    "DiskWala API credentials (<code>DISKWALA_API_URL</code>).\n\n"
                    "💡 Send any TeraBox link instead to watch directly inside <b>TeravidsPlay</b>!",
                    parse_mode="HTML",
                )
                continue

            if not data.get("success") or (not data.get("videos") and data.get("metadata_only")):
                safe_err = html.escape(str(data.get("message", "Could not resolve this link right now. Please try again.")))
                _reply_or_send(
                    message,
                    f"⚠️ <b>Stream Temporarily Unavailable:</b>\n{safe_err}",
                    parse_mode="HTML",
                )
                continue

            # Auto-publish to TARGET_CHANNEL_ID ONLY if sender is an Admin/Creator
            if can_post_channel:
                try:
                    target = int(TARGET_CHANNEL_ID) if TARGET_CHANNEL_ID.lstrip("-").isdigit() else TARGET_CHANNEL_ID
                    publish_resolved_bundle(target, data, title_hint=title_hint)
                    logger.info(f"Admin {uid} published link to channel {TARGET_CHANNEL_ID}")
                except Exception as e:
                    logger.error(f"Failed to publish to channel {TARGET_CHANNEL_ID}: {e}")

            publish_resolved_bundle(message.chat.id, data, title_hint=title_hint)
    finally:
        if waiting_msg:
            try:
                bot.delete_message(chat_id=message.chat.id, message_id=waiting_msg.message_id)
            except Exception:
                pass


class HealthCheckHandler(BaseHTTPRequestHandler):
    """
    Production-grade cloud health check server.
    Secured against SSRF and unauthorized public execution.
    """

    def _send_json_bytes(self, status_code: int, payload: bytes):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # 1. Protected Admin Diagnostic Endpoint
        if parsed.path in ["/diag", "/resolve", "/test"]:
            admin_secret = os.getenv("ADMIN_SECRET", "").strip()
            if not admin_secret:
                self._send_json_bytes(404, b'{"error":"Diagnostic endpoint disabled. Set ADMIN_SECRET to enable."}')
                return

            query = urllib.parse.parse_qs(parsed.query)
            token = query.get("token", [""])[0] or query.get("key", [""])[0]
            auth_header = self.headers.get("Authorization", "")
            bearer_token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""

            token_ok = bool(token) and hmac.compare_digest(token, admin_secret)
            bearer_ok = bool(bearer_token) and hmac.compare_digest(bearer_token, admin_secret)
            if not token_ok and not bearer_ok:
                self._send_json_bytes(401, b'{"error":"Unauthorized: Valid ADMIN_SECRET token required."}')
                return

            raw_target = query.get("url", ["https://terabox.com/s/12-bl47-KEpRsDf840jID3A"])[0]
            if not is_terabox_url(raw_target):
                self._send_json_bytes(400, b'{"error":"Invalid target: Domain must belong to authorized media services."}')
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

            self._send_json_bytes(200, json.dumps(diag, indent=2, default=str).encode("utf-8"))
            return

        # 2. Public Health Check Endpoint (Only used by Render/Koyeb uptime probes)
        self._send_json_bytes(200, b'{"status":"ok","service":"TeravidsPlay Bot"}')

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
