"""
TeravidsPlay — High-Speed TeraBox & Cloud Media Resolution Engine
Zero Login / Zero Cookie Required for public TeraBox shares & folders.
Features:
- Primary Engine: Cloudflare Edge Worker resolver with Edge cache, HLS + MP4 CDN links, and folder paths.
- Secondary Engine: Resilient direct iTeraPlay resolver (strictly rate-limit aware, never bursts).
- Tertiary Engine: Direct 1024terabox / teraboxapp / terabox.app /share/list scraper (supports 20+ file folders, paths & thumbs).
- DiskWala metadata integration via official udapi.diskwala.com (+ optional authenticated DISKWALA_API_URL).
"""

import os
import re
import time
import logging
import urllib.parse
import ipaddress
from typing import Dict, Any, Optional, Tuple, List
import requests

logger = logging.getLogger("TeravidsPlayBot")

# Strictly allowed TeraBox / DiskWala & CDN domain suffixes (Strict Hostname Allowlist)
ALLOWED_TERABOX_HOSTS = {
    "terabox.com",
    "terabox.app",
    "teraboxapp.com",
    "1024tera.com",
    "1024terabox.com",
    "1024tera.co",
    "1024terabox.co",
    "tera1024.com",
    "4funbox.com",
    "mirrobox.com",
    "mirrorbox.com",
    "nephobox.com",
    "freeterabox.com",
    "teraboxlink.com",
    "terasharelink.com",
    "terasharefile.com",
    "terafileshare.com",
    "teraboxurl.com",
    "teraboxshare.com",
    "teraboxsharefile.com",
    "terabox.fun",
    "terabox.link",
    "terabox.me",
    "terabox.club",
    "teraboxdl.com",
    "terabox1.com",
    "teraboxpage.com",
    "1024terabox.app",
    "teraboxfileshare.com",
    "terashareus.com",
    "1024tenbox.com",
    "1024teradl.com",
    "teraboxlinks.com",
    "teraboxfast.com",
    "tibibox.com",
    "momerybox.com",
    "memorybox.com",
    "tribox.com",
    "dubox.com",
    "diskwala.com",
    "diskwala.net",
    "diskwala-secure-dl.com",
    "udapi.diskwala.com",
    "tn1.diskwala.com",
    "bdydns.com",
    "baidu.com",
    "baidupcs.com",
    "teraboxcdn.com",
    "iteraplay.in",
    "iteraplay.com",
    "playterabox.com",
    "cloudflarestorage.com",
    "replit.dev",
    "replit.app",
    "repl.co",
    "qzz.io",
    "cdniteraplay.qzz.io",
    "teravidsplayer.vercel.app",
    "vercel.app",
    "proxyking.workers.dev",
    "workers.dev",
    "teravidsplay.onrender.com",
    "onrender.com",
}

# Strictly allowed public URL shorteners
ALLOWED_SHORTENERS = {
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "cutt.ly",
    "dub.sh",
    "t.ly",
    "rb.gy",
    "is.gd",
    "v.gd",
    "shorturl.at",
    "tiny.cc",
    "ow.ly",
    "rebrand.ly",
    "s.id",
}

VIDEO_EXTENSIONS = (".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".flv", ".ts")

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _host_matches(host: str, domain_set: set) -> bool:
    return any(host == allowed or host.endswith("." + allowed) for allowed in domain_set)


def is_safe_hostname(host: str) -> bool:
    """
    SSRF Protection: Strictly validates that the host is NOT a private/loopback/cloud metadata IP,
    and matches the explicit allowlist of supported media domains or trusted shorteners.
    """
    if not host:
        return False
    host = host.lower().strip()

    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass

    return _host_matches(host, ALLOWED_TERABOX_HOSTS) or _host_matches(host, ALLOWED_SHORTENERS)


def is_terabox_url(text: str) -> bool:
    """Strictly checks if URL hostname belongs to recognized TeraBox/DiskWala domain or shortener."""
    if not text:
        return False
    try:
        parsed = urllib.parse.urlparse(text)
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower()
        return is_safe_hostname(host)
    except Exception:
        return False


def is_diskwala_url(url_str: str) -> bool:
    if not url_str:
        return False
    try:
        host = (urllib.parse.urlparse(url_str).hostname or "").lower()
        return _host_matches(host, {"diskwala.com"})
    except Exception:
        return False


def parse_diskwala_id(url_str: str) -> Optional[str]:
    if not url_str:
        return None
    m = re.search(r"/(?:app|share|v|d|f)/([a-fA-F0-9]{24})", url_str, re.I)
    if m:
        return m.group(1)
    m2 = re.search(r"\b([a-fA-F0-9]{24})\b", url_str)
    return m2.group(1) if m2 else None


def extract_share_path(share_url: str) -> str:
    """Extracts and decodes TeraBox folder path parameter (?path=... or ?dir=...)."""
    if not share_url:
        return ""
    try:
        parsed = urllib.parse.urlparse(share_url)
        qs = urllib.parse.parse_qs(parsed.query)
        for key in ("path", "dir"):
            if key in qs and qs[key]:
                return qs[key][0].strip()
    except Exception:
        pass
    return ""


def extract_all_urls(text: str) -> List[str]:
    """Finds and deduplicates all verified TeraBox/DiskWala/shortener HTTP(S) URLs in exact text order."""
    if not text:
        return []
    normalized = re.sub(r"[\u200b-\u200d\ufeff]+", "", text)
    hits: List[Tuple[int, str]] = []
    seen = set()

    def _add(pos: int, raw: str):
        cleaned = raw.strip().rstrip(").,;:!?'\"]}")
        if not cleaned:
            return
        if not re.match(r"^https?://", cleaned, re.I):
            cleaned = "https://" + cleaned
        if cleaned not in seen and is_terabox_url(cleaned):
            seen.add(cleaned)
            hits.append((pos, cleaned))

    for match in re.finditer(r"https?://[^\s<>\"']+", normalized):
        _add(match.start(), match.group(0))

    for match in re.finditer(r"(?:^|[\s(])((?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/[^\s<>\"']+)", normalized):
        token = match.group(1)
        if not token.lower().startswith(("http://", "https://")):
            _add(match.start(1), token)

    hits.sort(key=lambda item: item[0])
    return [u for _, u in hits]


DIRECT_STREAM_EXTENSIONS = (".mp4", ".m3u8", ".webm", ".mov", ".m4v", ".mkv")


def is_direct_video_url(url_str: str) -> bool:
    """Validates a public HTTPS direct MP4/HLS video URL while blocking loopback/private/local hosts."""
    if not url_str:
        return False
    try:
        parsed = urllib.parse.urlparse(url_str.strip())
        if parsed.scheme != "https":
            return False
        host = (parsed.hostname or "").lower().strip()
        if not host or "." not in host or host in ("localhost", "localhost.localdomain") or host.endswith((".local", ".internal")):
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            pass
        path_lower = urllib.parse.unquote(parsed.path or "").lower()
        return any(path_lower.endswith(ext) for ext in DIRECT_STREAM_EXTENSIONS)
    except Exception:
        return False


def extract_all_direct_video_urls(text: str) -> List[str]:
    """Extracts and deduplicates public HTTPS direct video/HLS URLs from message text."""
    if not text:
        return []
    normalized = re.sub(r"[\u200b-\u200d\ufeff]+", "", text)
    found: List[str] = []
    seen = set()
    for match in re.finditer(r"https://[^\s<>\"']+", normalized, re.I):
        cleaned = match.group(0).strip().rstrip(").,;:!?'\"]}")
        if cleaned not in seen and is_direct_video_url(cleaned):
            seen.add(cleaned)
            found.append(cleaned)
    return found


def extract_url(text: str) -> Optional[str]:
    """Finds and cleanly extracts the first verified TeraBox/DiskWala/shortener HTTP(S) URL from text."""
    urls = extract_all_urls(text)
    return urls[0] if urls else None


def format_bytes(size_bytes: int) -> str:
    """Formats raw bytes into clean human-readable size string (e.g. 1.85 GB, 5.6 MB)."""
    try:
        size = float(size_bytes)
        if size <= 0:
            return "Unknown Size"
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size < 1024.0:
                if unit in ["MB", "GB"]:
                    val = f"{size:.2f}".rstrip("0").rstrip(".")
                    return f"{val} {unit}"
                return f"{int(size)} {unit}"
            size /= 1024.0
        return f"{size:.2f} PB"
    except (ValueError, TypeError):
        return "Unknown Size"


def _pick_first_hls_url(streams: Any) -> Optional[str]:
    """Extracts the highest-priority HLS stream URL from either a dict or string."""
    if isinstance(streams, str) and streams.startswith("http"):
        return streams
    if isinstance(streams, dict):
        for q in ("1080p", "720p", "480p", "360p", "auto"):
            val = streams.get(q)
            if isinstance(val, str) and val.startswith("http"):
                return val
        for val in streams.values():
            if isinstance(val, str) and val.startswith("http"):
                return val
    return None


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely converts numeric/string payloads into integers without throwing."""
    try:
        return max(0, int(float(value or 0)))
    except (ValueError, TypeError):
        return default


def _parse_edge_video_payload(video: Dict[str, Any], source_name: str) -> Optional[Dict[str, Any]]:
    """Normalizes the JSON schema returned by Worker/iTeraPlay engines into TeravidsPlay format."""
    if not isinstance(video, dict):
        return None
    title = video.get("title") or "TeraBox Video"
    size = _safe_int(video.get("size"))
    stream_url = (
        video.get("original_quality_url")
        or video.get("stream_url")
        or video.get("mp4_url_fast")
        or video.get("mp4_url_slow")
        or ""
    )

    hls_url = _pick_first_hls_url(video.get("fast_stream_url")) or _pick_first_hls_url(video.get("hls_url"))
    thumb = video.get("thumbnailUrl") or video.get("thumbnail") or video.get("thumb")
    quality = video.get("quality") or "HD"
    file_id = str(video.get("fileId") or video.get("_id") or "")
    duration = str(video.get("duration") or "")

    has_real_name = bool(title and title not in ["TeraBox Video", "TeraBox Video Stream"])
    if stream_url or hls_url or has_real_name or thumb:
        return {
            "success": True,
            "file_id": file_id,
            "title": title,
            "size_bytes": size,
            "size_formatted": format_bytes(size) if size > 0 else "HD Stream",
            "thumbnail": thumb,
            "stream_url": stream_url or hls_url or "",
            "hls_url": hls_url,
            "download_url": stream_url or "",
            "quality": quality,
            "duration": duration,
            "source": source_name,
        }
    return None


def _map_share_list_videos(items: list, source_name: str = "TeraBox Metadata") -> List[Dict[str, Any]]:
    """Maps all non-folder video items from a TeraBox share/list payload into normalized dicts."""
    if not items:
        return []
    videos = [
        it for it in items
        if str(it.get("isdir", "0")) != "1"
        and (
            str(it.get("category", "")) == "1"
            or (it.get("server_filename", "").lower().endswith(VIDEO_EXTENSIONS))
        )
    ]
    if not videos:
        videos = [it for it in items if str(it.get("isdir", "0")) != "1"]

    mapped = []
    for item in videos:
        filename = item.get("server_filename") or "TeraBox Video"
        size = _safe_int(item.get("size"))
        thumbs = item.get("thumbs") or {}
        thumb = thumbs.get("url3") or thumbs.get("url2") or thumbs.get("url1") or thumbs.get("icon")
        dlink = item.get("dlink") or ""
        mapped.append({
            "success": True,
            "file_id": str(item.get("fs_id") or ""),
            "title": filename,
            "size_bytes": size,
            "size_formatted": format_bytes(size) if size > 0 else "HD Stream",
            "thumbnail": thumb,
            "stream_url": dlink,
            "hls_url": None,
            "download_url": dlink,
            "quality": "HD",
            "duration": "",
            "source": "TeraBox Direct Scraper" if dlink else source_name,
        })
    return mapped


class TeraBoxExtractor:
    def __init__(self, ndus_cookie: Optional[str] = None, worker_url: Optional[str] = None):
        self.ndus_cookie = (ndus_cookie or os.getenv("NDUS_COOKIE", "")).strip()
        self.worker_url = (worker_url or os.getenv("WORKER_URL", "https://teravidsplay.proxyking.workers.dev")).rstrip("/")
        self.diskwala_api_url = os.getenv("DISKWALA_API_URL", "").strip()
        self.diskwala_api_key = os.getenv("DISKWALA_API_KEY", "").strip()
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.last_diagnostics: List[str] = []
        if self.ndus_cookie:
            for cookie_domain in (".terabox.com", ".terabox.app", ".1024terabox.com", ".1024tera.com", ".teraboxapp.com"):
                self.session.cookies.set("ndus", self.ndus_cookie, domain=cookie_domain)
                self.session.cookies.set("lang", "en", domain=cookie_domain)

    def _expand_short_url(self, raw_url: str) -> str:
        """Expands allowed shorteners safely (max 5 hops, strict SSRF host validation on every hop)."""
        current = raw_url
        for _ in range(5):
            parsed = urllib.parse.urlparse(current)
            host = (parsed.hostname or "").lower()
            if not _host_matches(host, ALLOWED_SHORTENERS):
                break
            try:
                resp = requests.head(current, headers=DEFAULT_HEADERS, allow_redirects=False, timeout=4)
                loc = resp.headers.get("Location")
                if not loc and (resp.status_code == 405 or resp.status_code >= 400):
                    with requests.get(current, headers=DEFAULT_HEADERS, allow_redirects=False, stream=True, timeout=4) as g:
                        loc = g.headers.get("Location")
                if not loc:
                    break
                next_url = urllib.parse.urljoin(current, loc)
                next_parsed = urllib.parse.urlparse(next_url)
                if next_parsed.scheme in ("http", "https") and is_safe_hostname(next_parsed.hostname or ""):
                    current = next_url
                else:
                    break
            except Exception as e:
                logger.warning(f"[TeraBoxExtractor] Shortener resolution notice: {e}")
                break
        return current

    def parse_surl(self, share_url: str) -> Optional[str]:
        """Extracts the shorturl token from any TeraBox or TeravidsPlay URL pattern."""
        try:
            parsed = urllib.parse.urlparse(share_url)
            query = urllib.parse.parse_qs(parsed.query)

            for key in ("surl", "v", "s"):
                if key in query and query[key]:
                    return query[key][0].strip()

            match = re.search(r"/(?:s|v)/([a-zA-Z0-9_-]+)", share_url)
            if match:
                return match.group(1)

            if "surl=" in share_url:
                parts = share_url.split("surl=")
                if len(parts) > 1:
                    return parts[1].split("&")[0].split("#")[0].strip()

            return None
        except Exception:
            return None

    def parse_surl_pair(self, share_url: str) -> Tuple[Optional[str], str, str]:
        """
        Returns (raw_token, share_token_with_1, short_token_for_surl_param).
        Properly strips leading '1' on 23+ char share IDs even when containing '-' or '_',
        while preserving genuine 22-char query tokens starting with '1'.
        """
        raw = self.parse_surl(share_url)
        if not raw:
            return None, "", ""

        from_query = bool(re.search(r"[?&](?:surl|v|s)=", share_url)) and not re.search(r"/(?:s|v)/", share_url)
        has_added_one = raw.startswith("1") and len(raw) >= 23
        share_tok = raw if has_added_one else ("1" + raw if (from_query or not raw.startswith("1")) else raw)
        short_tok = raw[1:] if has_added_one else raw
        return raw, share_tok, short_tok

    def resolve_diskwala(self, url_str: str) -> Dict[str, Any]:
        """Resolves DiskWala /app/<id> metadata via official udapi.diskwala.com (and optional configured API)."""
        file_id = parse_diskwala_id(url_str)
        if not file_id:
            return {"success": False, "platform": "diskwala", "message": "Invalid DiskWala link ID."}

        if self.diskwala_api_url and self.diskwala_api_url.startswith("https://"):
            try:
                sep = "&" if "?" in self.diskwala_api_url else "?"
                ep = f"{self.diskwala_api_url}{sep}url={urllib.parse.quote(url_str, safe='')}"
                hdrs = dict(DEFAULT_HEADERS)
                if self.diskwala_api_key:
                    hdrs["Authorization"] = f"Bearer {self.diskwala_api_key}"
                    hdrs["x-api-key"] = self.diskwala_api_key
                r = requests.get(ep, headers=hdrs, timeout=10)
                if r.status_code == 200:
                    payload = r.json()
                    items = payload if isinstance(payload, list) else (payload.get("videos") or ([payload["fileInfo"]] if payload.get("fileInfo") else []))
                    vids = []
                    for it in items:
                        if isinstance(it, dict) and (it.get("stream_url") or it.get("download_url") or it.get("url")):
                            stream_u = it.get("download_url") or it.get("url") or it.get("stream_url") or ""
                            hls_u = it.get("stream_url") if str(it.get("stream_url", "")).endswith(".m3u8") else None
                            sz = _safe_int(it.get("size"))
                            vids.append({
                                "success": True,
                                "file_id": file_id,
                                "title": it.get("file_name") or it.get("name") or it.get("title") or "DiskWala Video",
                                "size_bytes": sz,
                                "size_formatted": format_bytes(sz) if sz > 0 else "HD Stream",
                                "thumbnail": it.get("thumbnailUrl") or it.get("thumbnail") or "",
                                "stream_url": stream_u,
                                "hls_url": hls_u,
                                "download_url": stream_u,
                                "quality": it.get("quality") or "HD",
                                "duration": "",
                                "source": "DiskWala API",
                            })
                    if vids:
                        return {**vids[0], "platform": "diskwala", "surl": file_id, "videos": vids}
            except Exception as e:
                logger.warning(f"[TeraBoxExtractor] Configured DiskWala API notice: {e}")

        try:
            r = requests.post(
                "https://udapi.diskwala.com/api/v1/file/temp_info",
                json={"id": file_id},
                headers={**DEFAULT_HEADERS, "Origin": "https://www.diskwala.com", "Referer": "https://www.diskwala.com/"},
                timeout=6,
            )
            if r.status_code == 200:
                data = r.json()
                fi = data.get("fileInfo") or {}
                up = data.get("uploader") or {}
                ext = str(fi.get("extension") or "mp4").upper()
                sz = _safe_int(fi.get("size"))
                return {
                    "success": False,
                    "platform": "diskwala",
                    "surl": file_id,
                    "requires_auth_api": True,
                    "title": f"DiskWala {ext} Video",
                    "size_bytes": sz,
                    "size_formatted": format_bytes(sz) if sz > 0 else "Unknown Size",
                    "thumbnail": up.get("p_p") or "",
                    "uploader": up.get("name") or "",
                    "message": "DiskWala playback requires DiskWala App authentication or DISKWALA_API_URL credentials.",
                }
        except Exception as e:
            self.last_diagnostics.append(f"DiskWala temp_info error: {e}")

        return {
            "success": False,
            "platform": "diskwala",
            "surl": file_id,
            "requires_auth_api": True,
            "message": "DiskWala video could not be extracted without authenticated API access.",
        }

    def resolve_via_worker_engine(self, surl_or_url: str) -> Optional[Dict[str, Any]]:
        """
        Primary Engine for Cloud & Datacenter Deployments (Render / Koyeb / VPS):
        Queries the Cloudflare Edge Worker API (preserving full folder URL/path) and parses ALL returned videos.
        """
        if not self.worker_url:
            self.last_diagnostics.append("Worker Engine skipped: worker_url is empty")
            return None

        _, share_token, _ = self.parse_surl_pair(surl_or_url)
        dir_path = extract_share_path(surl_or_url)

        if surl_or_url.startswith("http") and (dir_path or is_diskwala_url(surl_or_url)):
            target = surl_or_url
        elif share_token:
            target = f"https://1024terabox.com/s/{share_token}"
        else:
            target = surl_or_url

        t0 = time.time()
        try:
            endpoint = f"{self.worker_url}/api/resolve?surl={urllib.parse.quote(target, safe='')}"
            logger.info(f"[TeraBoxExtractor] Resolving via Edge Worker: {endpoint}")
            resp = requests.get(endpoint, headers={"User-Agent": DEFAULT_HEADERS["User-Agent"]}, timeout=18)
            elapsed = time.time() - t0
            self.last_diagnostics.append(f"Worker -> status {resp.status_code} ({elapsed:.1f}s)")
            logger.info(f"[TeraBoxExtractor] Edge Worker HTTP status: {resp.status_code} ({elapsed:.2f}s)")

            data: Dict[str, Any] = {}
            if resp.text:
                try:
                    data = resp.json()
                except Exception:
                    data = {}

            if data.get("requires_auth_api"):
                pm = data.get("partial_metadata") or {}
                sz = _safe_int(pm.get("size"))
                return {
                    "success": False,
                    "platform": data.get("platform", "diskwala"),
                    "surl": data.get("diskwala_id") or data.get("surl") or "",
                    "requires_auth_api": True,
                    "title": pm.get("title") or "DiskWala Video",
                    "size_bytes": sz,
                    "size_formatted": format_bytes(sz) if sz > 0 else "Unknown Size",
                    "thumbnail": pm.get("thumbnailUrl") or "",
                    "message": data.get("message") or "Authenticated API required for DiskWala.",
                }

            if resp.status_code == 200 and data.get("success") and data.get("videos"):
                parsed_videos = [
                    pv for pv in (_parse_edge_video_payload(v, "Cloudflare Edge Engine") for v in data["videos"])
                    if pv
                ]
                if parsed_videos:
                    lead = parsed_videos[0]
                    logger.info(
                        f"[TeraBoxExtractor] Resolved via Worker: {len(parsed_videos)} item(s), "
                        f"lead='{lead['title']}' ({lead['size_formatted']})"
                    )
                    return {
                        **lead,
                        "surl": data.get("surl") or share_token,
                        "dir_path": data.get("dirPath") or dir_path,
                        "videos": parsed_videos,
                    }

            partial = data.get("partial_metadata")
            if partial and (partial.get("title") or partial.get("thumbnailUrl")):
                title = partial.get("title", "TeraBox Video")
                size = _safe_int(partial.get("size"))
                thumb = partial.get("thumbnailUrl")
                logger.info(f"[TeraBoxExtractor] Resolved partial metadata via Worker: '{title}'")
                item = {
                    "success": True,
                    "file_id": "",
                    "title": title,
                    "size_bytes": size,
                    "size_formatted": format_bytes(size) if size > 0 else "HD Stream",
                    "thumbnail": thumb,
                    "stream_url": "",
                    "hls_url": None,
                    "download_url": "",
                    "quality": "HD",
                    "duration": "",
                    "source": "Cloudflare Edge Engine (Metadata)",
                }
                return {**item, "surl": share_token, "dir_path": dir_path, "videos": [item]}

        except Exception as e:
            err_msg = f"Worker notice: {type(e).__name__}: {e}"
            self.last_diagnostics.append(err_msg)
            logger.info(f"[TeraBoxExtractor] {err_msg} -> Falling back cleanly")

        return None

    def resolve_via_highspeed_engine(self, share_url: str) -> Tuple[Optional[Dict[str, Any]], bool]:
        """
        Secondary Engine: Queries iTeraPlay edge resolver safely (single-shot, returns all folder videos).
        Returns (result_dict_or_None, should_short_circuit_remaining_candidates).
        """
        try:
            headers = {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": "https://iteraplay.in/",
                "Origin": "https://iteraplay.in",
                "Content-Type": "application/json",
            }
            resp = requests.post(
                "https://iteraplay.in/api/videos/import",
                json={"url": share_url},
                headers=headers,
                timeout=10,
            )
            if resp.status_code in (403, 429) or "rate limit" in (resp.text or "").lower():
                self.last_diagnostics.append(f"iTeraPlay HTTP {resp.status_code} ({share_url})")
                logger.info(f"[TeraBoxExtractor] HighSpeed Engine rate-limited ({resp.status_code}) for {share_url}")
                return None, True
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("videos"):
                    parsed_videos = [
                        pv for pv in (_parse_edge_video_payload(v, "HighSpeed Edge Engine") for v in data["videos"])
                        if pv
                    ]
                    if parsed_videos:
                        return {**parsed_videos[0], "videos": parsed_videos}, False
                status = data.get("status", "")
                if status in ("captcha_required", "rate_limited"):
                    self.last_diagnostics.append(f"iTeraPlay status: {status}")
                    return None, True
            else:
                self.last_diagnostics.append(f"iTeraPlay HTTP {resp.status_code} ({share_url})")
        except Exception as e:
            self.last_diagnostics.append(f"iTeraPlay err ({share_url}): {type(e).__name__}")
            logger.warning(f"[TeraBoxExtractor] HighSpeed Engine notice: {e}")
        return None, False

    def resolve_via_direct_scraper(self, short_token: str, dir_path: str = "") -> Optional[Dict[str, Any]]:
        """
        Tertiary Fallback: Queries verified working TeraBox mirrors (1024terabox.com first, then teraboxapp.com / terabox.app)
        via /share/list supporting folders, dir_path, and all 20+ video thumbnails & sizes.
        """
        if not short_token:
            return None

        hosts_to_try = ["1024terabox.com", "teraboxapp.com", "teraboxlink.com", "www.terabox.app"]
        for host in hosts_to_try:
            try:
                referer_url = f"https://{host}/"
                js_token = None
                log_id = None

                with requests.Session() as sess:
                    sess.headers.update(DEFAULT_HEADERS)
                    if self.ndus_cookie:
                        sess.cookies.set("ndus", self.ndus_cookie, domain=f".{host}")
                        sess.cookies.set("lang", "en", domain=f".{host}")

                    if host == "www.terabox.app":
                        page_url = f"https://{host}/sharing/link?surl={urllib.parse.quote(short_token, safe='')}"
                        target_page = (
                            f"{self.worker_url}/?url={urllib.parse.quote(page_url, safe='')}"
                            if self.worker_url
                            else page_url
                        )
                        resp = sess.get(target_page, timeout=6)
                        if resp.status_code != 200:
                            continue
                        referer_url = page_url
                        html_body = resp.text
                        m_enc = re.search(r'fn%28%22([^%"]+)%22%29', html_body)
                        m_plain = re.search(r'fn\("([^"]+)"\)', html_body)
                        js_token = m_enc.group(1) if m_enc else (m_plain.group(1) if m_plain else None)
                        m_log = re.search(r"dp-logid=([^&\"'\s]+)", html_body + resp.url)
                        log_id = m_log.group(1) if m_log else None

                    def fetch_list(path_arg: str = "") -> Optional[Dict[str, Any]]:
                        params = {
                            "app_id": "250528",
                            "web": "1",
                            "channel": "dubox",
                            "clienttype": "0",
                            "page": "1",
                            "num": "100",
                            "order": "time",
                            "desc": "1",
                            "shorturl": short_token,
                            "root": "0" if path_arg else "1",
                        }
                        if path_arg:
                            params["dir"] = path_arg
                        if js_token:
                            params["jsToken"] = js_token
                        if log_id:
                            params["dplogid"] = log_id

                        raw_list_url = f"https://{host}/share/list?{urllib.parse.urlencode(params)}"
                        urls_to_try = []
                        if self.worker_url:
                            urls_to_try.append((f"{self.worker_url}/?url={urllib.parse.quote(raw_list_url, safe='')}", {"User-Agent": DEFAULT_HEADERS["User-Agent"]}))
                        urls_to_try.append((raw_list_url, {"Referer": referer_url}))

                        for req_u, req_hdrs in urls_to_try:
                            try:
                                list_resp = sess.get(req_u, headers=req_hdrs, timeout=8)
                                if list_resp.status_code == 200:
                                    parsed_json = list_resp.json()
                                    errno_val = parsed_json.get("errno")
                                    if errno_val is not None and int(errno_val) == 0:
                                        return parsed_json
                            except Exception:
                                continue
                        return None

                    data = fetch_list(dir_path)
                    data_errno = data.get("errno") if isinstance(data, dict) else None
                    if not data or data_errno is None or int(data_errno) != 0 or not data.get("list"):
                        self.last_diagnostics.append(f"{host} share/list empty (errno={data_errno})")
                        continue

                    raw_list = data["list"]
                    videos = _map_share_list_videos(raw_list, "TeraBox Metadata")
                    if not videos:
                        folder_item = next((it for it in raw_list if str(it.get("isdir", "0")) == "1" and it.get("path")), None)
                        if folder_item:
                            sub_data = fetch_list(folder_item["path"])
                            sub_errno = sub_data.get("errno") if isinstance(sub_data, dict) else None
                            if sub_data and sub_errno is not None and int(sub_errno) == 0 and sub_data.get("list"):
                                videos = _map_share_list_videos(sub_data["list"], "TeraBox Metadata")

                    if videos:
                        return {**videos[0], "videos": videos, "dir_path": dir_path}
            except Exception as e:
                logger.warning(f"[TeraBoxExtractor] Direct scraper ({host}) notice: {e}")
        return None

    def get_video_stream(self, share_url: str) -> Dict[str, Any]:
        """
        Main orchestrator: Resolves any TeraBox/DiskWala link (or multi-video folder) into metadata & streamable links.
        Guarded with strict SSRF protection and domain allowlisting.
        """
        self.last_diagnostics = []

        if not is_terabox_url(share_url):
            logger.warning("[TeraBoxExtractor] SSRF Guard: Rejected unverified domain request.")
            return {
                "success": False,
                "error": "Access Denied",
                "message": "Only valid, public TeraBox links are supported.",
                "diagnostics": ["URL failed strict hostname allowlist"],
            }

        clean_url = self._expand_short_url(share_url)

        # Route DiskWala URLs cleanly through Worker or direct metadata check
        if is_diskwala_url(clean_url) or is_diskwala_url(share_url):
            dw_target = clean_url if is_diskwala_url(clean_url) else share_url
            worker_dw = self.resolve_via_worker_engine(dw_target)
            if worker_dw and (worker_dw.get("success") or worker_dw.get("requires_auth_api")):
                return worker_dw
            return self.resolve_diskwala(dw_target)

        raw_token, share_token, short_token = self.parse_surl_pair(clean_url)
        if not raw_token:
            raw_token, share_token, short_token = self.parse_surl_pair(share_url)
        dir_path = extract_share_path(clean_url) or extract_share_path(share_url)

        surl_masked = f"{raw_token[:3]}***{raw_token[-3:]}" if raw_token and len(raw_token) > 6 else "***"
        logger.info(f"[TeraBoxExtractor] Processing safe surl token: {surl_masked} (dir={bool(dir_path)})")

        worker_failed_hard = False
        # Step 1: Primary Cloudflare Edge Worker Engine
        if share_token or clean_url:
            worker_input = clean_url if (clean_url.startswith("http") and dir_path) else (clean_url if clean_url.startswith("http") else share_token)
            worker_res = self.resolve_via_worker_engine(worker_input)
            if worker_res and worker_res.get("success"):
                worker_res["surl"] = worker_res.get("surl") or share_token or raw_token
                worker_res["dir_path"] = worker_res.get("dir_path") or dir_path
                return worker_res
            worker_failed_hard = any("Worker notice:" in d or "status 5" in d for d in self.last_diagnostics)

        # Step 2: Direct High-Speed Engine (ONLY 1-2 sequential requests if Worker itself failed hard, avoids 429 bursts)
        if worker_failed_hard:
            candidates = []
            if dir_path and clean_url.startswith("http"):
                candidates.append(clean_url)
            if share_token:
                candidates.append(f"https://1024terabox.com/s/{share_token}")
            for cand in candidates[:2]:
                res, stop_loop = self.resolve_via_highspeed_engine(cand)
                if res and res.get("success"):
                    res["surl"] = share_token or raw_token
                    res["dir_path"] = dir_path
                    return res
                if stop_loop:
                    break

        # Step 3: Direct 1024terabox.com/share/list Scraper (returns full folder file list + thumbnails + sizes)
        if short_token:
            direct_res = self.resolve_via_direct_scraper(short_token, dir_path)
            if direct_res and direct_res.get("success"):
                direct_res["surl"] = share_token or raw_token
                direct_res["dir_path"] = dir_path
                return direct_res

        # Step 4: Honest failure result (no fake 1080p stream card when nothing resolved!)
        if share_token or raw_token:
            logger.warning(
                f"[TeraBoxExtractor] Stream extraction unavailable for {surl_masked}. Diag: {self.last_diagnostics}"
            )
            return {
                "success": True,
                "metadata_only": True,
                "surl": share_token or raw_token,
                "dir_path": dir_path,
                "title": "TeraBox Video",
                "size_bytes": 0,
                "size_formatted": "HD Stream",
                "thumbnail": None,
                "stream_url": "",
                "hls_url": None,
                "download_url": "",
                "quality": "HD",
                "videos": [],
                "source": "Web Player Client Engine",
            }

        logger.error(f"[TeraBoxExtractor] All resolution engines failed for URL: {share_url}. Diag: {self.last_diagnostics}")
        return {
            "success": False,
            "error": "Resolution Failed",
            "message": "Unable to extract streamable link. Please verify that the link is valid and public.",
            "diagnostics": self.last_diagnostics,
        }
