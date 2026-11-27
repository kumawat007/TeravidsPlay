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
import hashlib
import base64
import json
import time
import html
import shutil
import logging
import subprocess
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
PLAYER_URL = (os.getenv("PLAYER_URL") or "https://teravidsplayer.vercel.app").rstrip("/")
TARGET_CHANNEL_ID = os.getenv("TARGET_CHANNEL_ID", "").strip()
MINI_APP_NAME = os.getenv("MINI_APP_NAME", "").strip()
BOT_USERNAME_ENV = os.getenv("BOT_USERNAME", "").strip().lstrip("@")
BOT_USERNAME = BOT_USERNAME_ENV
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


def _normalize_photo_bytes(raw_bytes: bytes, content_type: str = "") -> Optional[io.BytesIO]:
    """Validates raster bytes and converts WebP/non-standard images to JPEG so Telegram sendPhoto never fails."""
    if not raw_bytes or len(raw_bytes) <= 500 or len(raw_bytes) > 8 * 1024 * 1024:
        return None
    ctype = (content_type or "").lower()
    if "text/html" in ctype or "svg" in ctype or "application/json" in ctype:
        return None

    img_name = _detect_image_filename(raw_bytes)
    if img_name in ("preview.jpg", "preview.png", "preview.gif"):
        bio = io.BytesIO(raw_bytes)
        bio.name = img_name
        return bio

    if img_name == "preview.webp" or ctype.startswith("image/"):
        try:
            from PIL import Image
            with Image.open(io.BytesIO(raw_bytes)) as im:
                rgb = im.convert("RGB")
                out = io.BytesIO()
                rgb.save(out, format="JPEG", quality=88)
                out.seek(0)
                out.name = "preview.jpg"
                return out
        except Exception as e:
            logger.debug(f"Pillow image conversion notice: {e}")
    return None


def _build_proxy_first_attempts(target_url: str, timeout: int, accept: str) -> List[Tuple[str, Dict[str, str], int]]:
    lower = (target_url or "").lower()
    proxy_first_hosts = (
        "replit.dev", "replit.app", "repl.co", "iteraplay", "qzz.io",
        "1024terabox", "1024tera", "terabox", "dm-data", "diskwala", "bdydns", "baidupcs",
        "catbox", "archive.org", "r2.dev", "b-cdn.net", "cloudflarestorage",
    )
    use_worker_first = any(h in lower for h in proxy_first_hosts)
    attempts: List[Tuple[str, Dict[str, str], int]] = []
    if extractor.worker_url and not target_url.startswith(extractor.worker_url):
        proxied = f"{extractor.worker_url}/?url={urllib.parse.quote(target_url, safe='')}"
        direct_hdrs = {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(target_url), "Accept": accept}
        proxy_hdrs = {"User-Agent": DEFAULT_UA, "Accept": accept}
        if use_worker_first:
            attempts.append((proxied, proxy_hdrs, timeout))
            attempts.append((target_url, direct_hdrs, min(timeout, 6)))
        else:
            attempts.append((target_url, direct_hdrs, min(timeout, 6)))
            attempts.append((proxied, proxy_hdrs, timeout))
    else:
        attempts.append((target_url, {"User-Agent": DEFAULT_UA, "Referer": _referer_for_url(target_url), "Accept": accept}, timeout))
    return attempts


def download_image_bytes(thumb_url: str, timeout: int = 10, fallback_url: str = "") -> Optional[io.BytesIO]:
    """
    Downloads real thumbnail bytes with proxy-first routing and backup URL support,
    converting WebP/unusual formats cleanly to JPEG for reliable Telegram binary upload.
    """
    img_accept = "image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8"
    candidate_urls = [u for u in (thumb_url, fallback_url) if u and u.startswith("http")]
    if not candidate_urls:
        return None

    for candidate in candidate_urls:
        for fetch_url, hdrs, req_timeout in _build_proxy_first_attempts(candidate, timeout, img_accept):
            try:
                resp = requests.get(fetch_url, headers=hdrs, timeout=req_timeout)
                if resp.status_code == 200:
                    bio = _normalize_photo_bytes(resp.content, resp.headers.get("Content-Type", ""))
                    if bio:
                        return bio
            except Exception as e:
                logger.debug(f"Thumbnail fetch notice for {fetch_url[:80]}: {e}")
    return None


def _get_ffmpeg_exe() -> Optional[str]:
    sys_ffmpeg = shutil.which("ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def extract_video_frame_bytes(stream_url: str, hls_url: str = "") -> Optional[io.BytesIO]:
    """
    Extracts a real JPEG preview frame directly from the video stream via HTTP Range seeking.
    Never generates fake/random stock photos; returns None if extraction is unsupported or times out.
    """
    media_url = stream_url or hls_url
    if not media_url or not media_url.startswith("http"):
        return None
    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        return None

    lower = media_url.lower()
    use_proxy = bool(extractor.worker_url) and any(
        h in lower for h in ("catbox", "replit.dev", "replit.app", "iteraplay", "qzz.io", "1024tera", "terabox", "archive.org")
    ) and not media_url.startswith(extractor.worker_url)
    target_urls = []
    if use_proxy:
        target_urls.append(f"{extractor.worker_url}/?url={urllib.parse.quote(media_url, safe='')}")
    target_urls.append(media_url)

    for cand_url in target_urls:
        ref_header = f"Referer: {_referer_for_url(cand_url)}\r\n"
        for seek_sec in ("3", "0"):
            try:
                cmd = [
                    ffmpeg_exe,
                    "-hide_banner",
                    "-loglevel", "error",
                    "-user_agent", DEFAULT_UA,
                    "-headers", ref_header,
                    "-ss", seek_sec,
                    "-i", cand_url,
                    "-frames:v", "1",
                    "-vf", "scale='min(1280,iw)':-2",
                    "-f", "image2pipe",
                    "-vcodec", "mjpeg",
                    "-q:v", "3",
                    "pipe:1",
                ]
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=12)
                if proc.returncode == 0 and proc.stdout and len(proc.stdout) > 500:
                    bio = _normalize_photo_bytes(proc.stdout, "image/jpeg")
                    if bio:
                        return bio
            except Exception as e:
                logger.debug(f"FFmpeg frame capture notice ({seek_sec}s): {e}")
    return None


def _b64url_encode(raw_str: str) -> str:
    return base64.urlsafe_b64encode((raw_str or "").encode("utf-8")).decode("ascii").rstrip("=")


def _b64url_decode(b64_str: str) -> str:
    s = (b64_str or "").strip()
    pad = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + pad).decode("utf-8")


def encode_compact_start_token(
    surl: str = "",
    dir_path: str = "",
    idx: Optional[int] = None,
    stream_url: str = "",
) -> str:
    """Encodes video parameters into a <=64-char [A-Za-z0-9_-] Telegram start/startapp payload."""
    idx_num = idx if (idx is not None and idx > 0) else 0
    if surl and re.fullmatch(r"[A-Za-z0-9_-]{6,50}", surl):
        clean_dir = (dir_path or "").strip().lstrip("/")
        if clean_dir:
            b64_dir = _b64url_encode(clean_dir)
            tok = f"f{len(surl):02d}{idx_num}_{surl}{b64_dir}"
            if len(tok) <= 64:
                return tok
        if idx_num > 0:
            tok = f"i_{idx_num}_{surl}"
            if len(tok) <= 64:
                return tok
        tok = f"w_{surl}"
        if len(tok) <= 64:
            return tok

    if stream_url:
        try:
            u = urllib.parse.urlparse(stream_url)
            fname = (u.path or "").lstrip("/")
            if u.hostname == "files.catbox.moe" and fname:
                tok = f"c_{_b64url_encode(fname)}"
                if len(tok) <= 64:
                    return tok
            if u.hostname == "litter.catbox.moe" and fname:
                tok = f"l_{_b64url_encode(fname)}"
                if len(tok) <= 64:
                    return tok
            tok = f"u_{_b64url_encode(stream_url)}"
            if len(tok) <= 64:
                return tok
        except Exception:
            pass
    return "open"


def decode_compact_start_token(payload: str) -> Dict[str, Any]:
    """Decodes a compact start/startapp payload cleanly into surl/dir_path/idx/stream_url."""
    tok = (payload or "").strip()
    if not tok or tok == "open":
        return {"open": True}
    try:
        if tok.startswith("w_"):
            return {"surl": tok[2:]}
        if tok.startswith("i_"):
            parts = tok.split("_", 2)
            if len(parts) == 3 and parts[1].isdigit():
                return {"surl": parts[2], "idx": int(parts[1])}
        if tok.startswith("f"):
            m_f = re.fullmatch(r"f(\d{2})(\d+)_(.+)", tok)
            if m_f:
                surl_len = int(m_f.group(1))
                idx_val = int(m_f.group(2))
                rest = m_f.group(3)
                surl_val = rest[:surl_len]
                dir_b64 = rest[surl_len:]
                dir_val = "/" + _b64url_decode(dir_b64).lstrip("/") if dir_b64 else ""
                return {"surl": surl_val, "dir_path": dir_val, "idx": idx_val}
        if tok.startswith("c_"):
            return {"stream_url": f"https://files.catbox.moe/{_b64url_decode(tok[2:]).lstrip('/')}"}
        if tok.startswith("l_"):
            return {"stream_url": f"https://litter.catbox.moe/{_b64url_decode(tok[2:]).lstrip('/')}"}
        if tok.startswith("u_"):
            u = _b64url_decode(tok[2:])
            if u.startswith("https://"):
                return {"stream_url": u}
        if re.fullmatch(r"[A-Za-z0-9_-]{12,50}", tok):
            return {"surl": tok}
    except Exception:
        pass
    return {"open": True}


def get_resolved_bot_username() -> str:
    global BOT_USERNAME
    if BOT_USERNAME:
        return BOT_USERNAME
    if BOT_USERNAME_ENV:
        BOT_USERNAME = BOT_USERNAME_ENV
        return BOT_USERNAME
    try:
        BOT_USERNAME = bot.get_me().username or "Teravidsplayerbot"
    except Exception:
        BOT_USERNAME = "Teravidsplayerbot"
    return BOT_USERNAME


def build_miniapp_deep_link(compact_token: str) -> str:
    bot_user = get_resolved_bot_username().lstrip("@")
    tok = (compact_token or "open")[:64]
    if MINI_APP_NAME:
        return f"https://t.me/{bot_user}/{MINI_APP_NAME}?startapp={urllib.parse.quote(tok, safe='')}"
    return f"https://t.me/{bot_user}?start={urllib.parse.quote(tok, safe='')}"


def build_player_url_from_compact_token(payload: str) -> str:
    info = decode_compact_start_token(payload)
    base = PLAYER_URL or "https://teravidsplayer.vercel.app"
    if info.get("surl"):
        params = [f"v={urllib.parse.quote(info['surl'], safe='')}"]
        if info.get("dir_path"):
            params.append(f"path={urllib.parse.quote(info['dir_path'], safe='')}")
        if info.get("idx", 0) > 0:
            params.append(f"idx={info['idx']}")
        return f"{base}/?{'&'.join(params)}"
    if info.get("stream_url"):
        return f"{base}/?stream={urllib.parse.quote(info['stream_url'], safe='')}"
    return f"{base}/"


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
    for_channel: bool = True,
) -> tuple[types.InlineKeyboardMarkup, str]:
    """Builds Mini App buttons (web_app in private DMs; Bot/MiniApp deep-link URL in channels)."""
    markup = types.InlineKeyboardMarkup(row_width=1)

    if PLAYER_URL and surl:
        params: List[str] = [f"v={urllib.parse.quote(surl, safe='')}"]
        if dir_path:
            params.append(f"path={urllib.parse.quote(dir_path, safe='')}")
        if playlist_count > 1:
            params.append("list=1")
        if idx is not None and idx >= 0 and not is_summary:
            params.append(f"idx={idx}")
        player_link = f"{PLAYER_URL}/?{'&'.join(params)}"
    elif PLAYER_URL and stream_url:
        encoded_stream = urllib.parse.quote(stream_url, safe="")
        params = [f"stream={encoded_stream}"]
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
        watch_label = "🟢 ▶️ WATCH IN MINI APP (HD) 🍿"

    if not for_channel and player_link.startswith("https://"):
        markup.add(types.InlineKeyboardButton(text=watch_label, web_app=types.WebAppInfo(url=player_link)))
    else:
        compact_tok = encode_compact_start_token(
            surl=surl,
            dir_path=dir_path,
            idx=0 if is_summary else idx,
            stream_url=stream_url,
        )
        deep_link = build_miniapp_deep_link(compact_tok)
        markup.add(types.InlineKeyboardButton(text=watch_label, url=deep_link))
        player_link = deep_link

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
    fallback_thumb: str = "",
    stream_url: str = "",
    allow_frame_capture: bool = True,
):
    """Sends formatted video card with REAL video thumbnail or captured frame (zero random stock photos)."""
    safe_title = html.escape(title[:120])
    fallback_q = quality if (quality and quality not in ("Unknown", "")) else "HD Stream"
    size_label = size if (size and size not in ("0 B", "Unknown Size", "HD Stream")) else fallback_q
    safe_size = html.escape(str(size_label))
    caption = f"🎬 <b>{safe_title}</b>\n\n📦 <b>Size:</b> {safe_size}"

    # 1. Real binary thumbnail (prefetched or downloaded via proxy/backup URL)
    img_bio = prefetched_bio
    owns_bio = False
    try:
        if img_bio is not None:
            img_bio.seek(0)
        elif thumb_url or fallback_thumb:
            img_bio = download_image_bytes(thumb_url, fallback_url=fallback_thumb)
            owns_bio = img_bio is not None

        # 2. Extract real video frame if CDN provided no thumbnail (e.g. Catbox / direct MP4 links)
        if img_bio is None and allow_frame_capture and stream_url:
            img_bio = extract_video_frame_bytes(stream_url)
            owns_bio = img_bio is not None

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
                logger.warning(f"Real photo upload failed for {chat_id}: {e}")

        # 3. Real direct URL photo delivery if short enough (no unrelated random stock images)
        for real_u in (thumb_url, fallback_thumb):
            if real_u and real_u.startswith("http") and len(real_u) < 900:
                try:
                    return _send_telegram_with_retry(
                        bot.send_photo,
                        chat_id=chat_id,
                        photo=real_u,
                        caption=caption,
                        reply_markup=markup,
                    )
                except Exception as e:
                    logger.warning(f"Direct URL photo delivery failed for {chat_id}: {e}")

        # 4. Clean watch-card message fallback (NEVER show fake/random stock photos)
        return _send_telegram_with_retry(
            bot.send_message,
            chat_id=chat_id,
            text=caption,
            reply_markup=markup,
        )
    finally:
        if owns_bio and img_bio is not None:
            try:
                img_bio.close()
            except Exception:
                pass


def _prefetch_thumbnails(videos: List[Dict[str, Any]]) -> Dict[int, Optional[io.BytesIO]]:
    """Concurrently fetches real thumbnails (with backup URL & small-batch frame fallback) for folders."""
    results: Dict[int, Optional[io.BytesIO]] = {}
    targets = [
        (i, v.get("thumbnail") or "", v.get("fallback_thumbnail") or "", v.get("stream_url") or v.get("hls_url") or "")
        for i, v in enumerate(videos)
        if v.get("thumbnail") or v.get("fallback_thumbnail") or (len(videos) <= 3 and (v.get("stream_url") or v.get("hls_url")))
    ]
    if not targets:
        return results

    def _fetch_one(t_url: str, b_url: str, s_url: str) -> Optional[io.BytesIO]:
        bio = download_image_bytes(t_url, fallback_url=b_url)
        if bio is None and len(videos) <= 3 and s_url:
            bio = extract_video_frame_bytes(s_url)
        return bio

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(5, len(targets))) as ex:
        fut_map = {ex.submit(_fetch_one, t_u, b_u, s_u): idx for idx, t_u, b_u, s_u in targets}
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
    (with real thumbnails/frames, titles, and sizes). Returns number of cards published.
    """
    surl = data.get("surl") or ""
    dir_path = data.get("dir_path") or ""
    videos = data.get("videos") or []

    if not videos and (data.get("title") or surl):
        videos = [data]

    total = len(videos)
    if total == 0:
        return 0

    chat_str = str(chat_id).strip()
    is_channel_chat = chat_str.startswith("@") or chat_str.startswith("-")

    if total == 1:
        vid = videos[0]
        raw_title = vid.get("title") or ""
        title = raw_title if raw_title not in ("TeraBox Video", "TeraBox Video Stream") else (title_hint or raw_title or "TeraBox Video")
        size = vid.get("size_formatted", "")
        quality = vid.get("quality", "HD")
        stream_url = vid.get("stream_url") or vid.get("hls_url") or ""
        thumb_url = vid.get("thumbnail") or ""
        backup_thumb = vid.get("fallback_thumbnail") or ""
        fid = vid.get("file_id") or ""

        markup, _ = build_channel_markup(
            stream_url=stream_url,
            title=title,
            size=size,
            surl=surl,
            thumb=thumb_url or backup_thumb,
            dir_path=dir_path,
            file_id=fid,
            for_channel=is_channel_chat,
        )
        publish_card(
            chat_id,
            title,
            size,
            quality,
            thumb_url,
            markup,
            fallback_thumb=backup_thumb,
            stream_url=stream_url,
            allow_frame_capture=True,
        )
        return 1

    # Multi-video folder collection!
    publish_subset = videos[:MAX_FOLDER_CARDS]
    thumbs_cache = _prefetch_thumbnails(publish_subset)

    try:
        total_bytes = sum(int(v.get("size_bytes") or 0) for v in videos)
        folder_label = dir_path.strip("/").split("/")[-1] if dir_path else ""
        summary_title = f"📁 {folder_label or 'Collection'} ({total} Videos)"
        summary_size = f"{format_bytes(total_bytes)} Total ({total} Files)" if total_bytes > 0 else f"{total} Videos (Playlist)"
        lead_thumb = next((v.get("thumbnail") or v.get("fallback_thumbnail") for v in publish_subset if v.get("thumbnail") or v.get("fallback_thumbnail")), "")

        summary_markup, _ = build_channel_markup(
            stream_url=publish_subset[0].get("stream_url") or publish_subset[0].get("hls_url") or "",
            title=summary_title,
            size=summary_size,
            surl=surl,
            thumb=lead_thumb,
            dir_path=dir_path,
            playlist_count=total,
            is_summary=True,
            for_channel=is_channel_chat,
        )
        publish_card(
            chat_id,
            summary_title,
            summary_size,
            "Playlist",
            lead_thumb,
            summary_markup,
            prefetched_bio=thumbs_cache.get(0),
            fallback_thumb=publish_subset[0].get("fallback_thumbnail") or "",
            stream_url=publish_subset[0].get("stream_url") or publish_subset[0].get("hls_url") or "",
            allow_frame_capture=len(publish_subset) <= 3,
        )

        sent_count = 1
        for i, vid in enumerate(publish_subset):
            time.sleep(0.45)
            raw_title = vid.get("title") or f"Video {i + 1}"
            item_title = f"[{i + 1}/{total}] {raw_title}"
            item_size = vid.get("size_formatted", "")
            item_quality = vid.get("quality", "HD")
            item_stream = vid.get("stream_url") or vid.get("hls_url") or ""
            item_thumb = vid.get("thumbnail") or ""
            item_backup = vid.get("fallback_thumbnail") or ""
            item_fid = vid.get("file_id") or ""

            item_markup, _ = build_channel_markup(
                stream_url=item_stream,
                title=raw_title,
                size=item_size,
                surl=surl,
                thumb=item_thumb or item_backup,
                dir_path=dir_path,
                idx=i,
                file_id=item_fid,
                playlist_count=total,
                is_summary=False,
                for_channel=is_channel_chat,
            )
            publish_card(
                chat_id,
                item_title,
                item_size,
                item_quality,
                item_thumb,
                item_markup,
                prefetched_bio=thumbs_cache.get(i),
                fallback_thumb=item_backup,
                stream_url=item_stream,
                allow_frame_capture=len(publish_subset) <= 3,
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
    direct_urls = extract_direct_video_urls_from_message(message)
    urls = [u for u in extract_urls_from_message(message) if u not in direct_urls]
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


def get_force_sub_markup(pending_payload: str = "") -> types.InlineKeyboardMarkup:
    """Generates the modern 2-step inline keyboard for Force Subscription, preserving deep-link payload."""
    markup = types.InlineKeyboardMarkup(row_width=1)
    channel_url = get_channel_invite_link()
    btn_join = types.InlineKeyboardButton("📢 1. Join Official Channel ✨", url=channel_url)
    cb_data = f"vf:{pending_payload}" if (pending_payload and len(pending_payload) <= 60) else "verify_fsub"
    btn_verify = types.InlineKeyboardButton("🔄 2. Verify Membership 🚀", callback_data=cb_data)
    markup.add(btn_join, btn_verify)
    return markup


@bot.callback_query_handler(func=lambda call: (call.data or "") == "verify_fsub" or (call.data or "").startswith(("verify_fsub:", "vf:")))
def handle_verify_fsub(call: types.CallbackQuery):
    """Handles the 1-tap verification button and immediately opens the requested Mini App video."""
    user_id = call.from_user.id
    raw_cb = call.data or ""
    pending_payload = raw_cb.split(":", 1)[1].strip() if ":" in raw_cb else ""

    if is_user_subscribed(user_id):
        try:
            bot.answer_callback_query(call.id, "✅ Verified! Welcome to TeravidsPlay 🚀", show_alert=False)
            unlocked_markup = types.InlineKeyboardMarkup(row_width=1)
            if pending_payload and pending_payload != "open":
                mini_url = build_player_url_from_compact_token(pending_payload)
                unlocked_markup.add(
                    types.InlineKeyboardButton("🟢 ▶️ WATCH IN MINI APP (HD) 🍿", web_app=types.WebAppInfo(url=mini_url))
                )
                msg_text = (
                    "🎉 <b>Channel Membership Verified!</b>\n\n"
                    "Tap the button below to launch your <b>1080p Ad-Free Video</b> inside the Telegram Mini App! 🍿"
                )
            else:
                if PLAYER_URL.startswith("https://"):
                    unlocked_markup.add(
                        types.InlineKeyboardButton("📱 Launch TeravidsPlay Mini App", web_app=types.WebAppInfo(url=f"{PLAYER_URL}/"))
                    )
                msg_text = (
                    "🎉 <b>Channel Membership Verified!</b>\n\n"
                    "Welcome to <b>TeravidsPlay</b> 🚀\n"
                    "Your access has been successfully unlocked.\n\n"
                    "🎬 <b>How to Watch:</b>\n"
                    "• Tap videos in <b>@teravidsplayer</b> or launch the Mini App below.\n"
                    "• Enjoy fast Full HD streaming with Zero Ads!"
                )
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=msg_text,
                parse_mode="HTML",
                reply_markup=unlocked_markup if unlocked_markup.keyboard else None,
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
    cmd_parts = (message.text or "").strip().split(maxsplit=1)
    start_payload = cmd_parts[1].strip() if len(cmd_parts) > 1 else ""

    if message.chat.type == "private" and uid is not None and not is_user_subscribed(uid):
        _reply_or_send(
            message,
            FORCE_SUB_TEXT,
            reply_markup=get_force_sub_markup(start_payload),
            parse_mode="HTML",
        )
        return

    if start_payload and start_payload != "open":
        mini_url = build_player_url_from_compact_token(start_payload)
        play_markup = types.InlineKeyboardMarkup(row_width=1)
        play_markup.add(
            types.InlineKeyboardButton("🟢 ▶️ WATCH IN MINI APP (HD) 🍿", web_app=types.WebAppInfo(url=mini_url))
        )
        play_markup.add(
            types.InlineKeyboardButton("📢 Official Channel (@teravidsplayer)", url=get_channel_invite_link())
        )
        _reply_or_send(
            message,
            "🎬 <b>Ready to Stream!</b>\n\nMembership verified for <b>@teravidsplayer</b>. Tap below to open the ad-free <b>1080p Mini App Player</b>:",
            reply_markup=play_markup,
            parse_mode="HTML",
        )
        return

    welcome_markup = types.InlineKeyboardMarkup(row_width=1)
    if PLAYER_URL.startswith("https://"):
        welcome_markup.add(
            types.InlineKeyboardButton("📱 Launch TeravidsPlay Mini App", web_app=types.WebAppInfo(url=f"{PLAYER_URL}/"))
        )
    welcome_markup.add(
        types.InlineKeyboardButton("📢 Join Official Channel (@teravidsplayer)", url=get_channel_invite_link())
    )

    welcome_text = (
        "📢 <b>Welcome to TeravidsPlay Bot!</b>\n\n"
        "Watch exclusive Full HD 1080p streams inside our official <b>Telegram Mini App</b> or post links in <b>@teravidsplayer</b>.\n\n"
        "<b>Features:</b>\n"
        "• Supports single videos AND multi-video folder playlists.\n"
        "• Long-press 2X & 4X speed controls.\n"
        "• Web Audio API 300% volume booster.\n"
        "• Double-tap 10s seek & Auto-resume.\n"
        "• Zero Ads & Zero Popups — everything plays inside Telegram Mini App!\n\n"
        f"• <b>Target Channel:</b> <code>{html.escape(TARGET_CHANNEL_ID or 'Not Set')}</code>\n"
        "• <b>Status Check:</b> /status"
    )
    _reply_or_send(message, welcome_text, reply_markup=welcome_markup)


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

    bot_uname = get_resolved_bot_username()
    safe_player = html.escape(PLAYER_URL) if PLAYER_URL else ""
    safe_channel = html.escape(TARGET_CHANNEL_ID or "Not Set")
    status_text = (
        "⚙️ <b>TeravidsPlay System Diagnostics</b>\n\n"
        "• <b>Engine:</b> 🚀 Multi-Video Edge + Folder Resolver (Active)\n"
        f"• <b>Web Player:</b> {'✅ ' + safe_player if safe_player else '⚠️ Not Set'}\n"
        f"• <b>Target Channel:</b> <code>{safe_channel}</code>\n"
        f"• <b>Bot Username:</b> @{html.escape(bot_uname)}\n"
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

    direct_urls = extract_direct_video_urls_from_message(message)
    urls = [u for u in extract_urls_from_message(message) if u not in direct_urls]
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


def verify_telegram_init_data(init_data_str: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """Cryptographically verifies Telegram WebApp initData HMAC-SHA256 & 24h auth_date freshness."""
    if not init_data_str or not BOT_TOKEN:
        return False, None, "missing_credentials"
    try:
        pairs = urllib.parse.parse_qsl(init_data_str, keep_blank_values=True)
        incoming_hash = ""
        auth_date = 0
        user_raw = ""
        filtered: List[Tuple[str, str]] = []
        for k, v in pairs:
            if k == "hash":
                incoming_hash = v.lower()
            else:
                if k == "auth_date" and v.isdigit():
                    auth_date = int(v)
                elif k == "user":
                    user_raw = v
                filtered.append((k, v))

        if not incoming_hash or not auth_date:
            return False, None, "invalid_payload"

        now_sec = int(time.time())
        if now_sec - auth_date > 86400 or auth_date - now_sec > 300:
            return False, None, "expired_init_data"

        filtered.sort(key=lambda item: item[0])
        data_check_string = "\n".join(f"{k}={v}" for k, v in filtered)

        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode("utf-8"), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(calculated_hash, incoming_hash):
            return False, None, "invalid_signature"

        user_obj = json.loads(user_raw) if user_raw else None
        if not isinstance(user_obj, dict) or not user_obj.get("id"):
            return False, None, "missing_user"

        return True, {
            "id": user_obj["id"],
            "first_name": user_obj.get("first_name", ""),
            "username": user_obj.get("username", ""),
        }, ""
    except Exception:
        return False, None, "verification_error"


class HealthCheckHandler(BaseHTTPRequestHandler):
    """
    Production-grade cloud health check & Telegram Mini App verification fallback server.
    Secured against SSRF and unauthorized public execution.
    """

    def _send_json_bytes(self, status_code: int, payload: bytes):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/verify-member":
            self._send_json_bytes(404, b'{"error":"Not Found"}')
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0") or "0"), 65536)
            raw_body = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw_body.decode("utf-8"))
            init_data = body.get("initData", "") if isinstance(body, dict) else ""
            ok, user_data, reason = verify_telegram_init_data(init_data)
            target_chan = TARGET_CHANNEL_ID or "@teravidsplayer"
            if not ok or not user_data:
                self._send_json_bytes(403, json.dumps({
                    "verified": False,
                    "member": False,
                    "channel": target_chan,
                    "reason": reason,
                }).encode("utf-8"))
                return

            is_member = is_user_subscribed(int(user_data["id"]))
            self._send_json_bytes(200, json.dumps({
                "verified": True,
                "member": bool(is_member),
                "channel": target_chan,
                "user": user_data,
            }).encode("utf-8"))
        except Exception as e:
            self._send_json_bytes(500, json.dumps({
                "verified": False,
                "member": False,
                "reason": "server_error",
                "message": str(e),
            }).encode("utf-8"))

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

    if PLAYER_URL.startswith("https://"):
        try:
            bot.set_chat_menu_button(
                menu_button=types.MenuButtonWebApp(
                    type="web_app",
                    text="🎬 Open Player",
                    web_app=types.WebAppInfo(url=f"{PLAYER_URL}/"),
                )
            )
            logger.info("Configured Telegram Chat Menu Button -> Mini App")
        except Exception as e:
            logger.debug(f"Menu button notice: {e}")

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
