"""
TeravidsPlay — High-Speed TeraBox Resolution Engine
Zero Login / Zero Cookie Required.
Features:
- Primary Engine: Cloudflare Edge Worker resolver with HLS + MP4 direct CDN stream links.
- Secondary Engine: Direct iTeraPlay edge resolver with short-circuit protection.
- Tertiary Engine: Direct terabox.app sharing/link + share/list scraper (supports folders & thumbnails).
- Personal NDUS override (optional).
"""

import os
import re
import time
import logging
import urllib.parse
import ipaddress
import concurrent.futures
from typing import Dict, Any, Optional, Tuple
import requests

logger = logging.getLogger("TeravidsPlayBot")

# Strictly allowed TeraBox domain suffixes (Strict Hostname Allowlist)
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
    "tibibox.com",
    "momerybox.com",
    "memorybox.com",
    "tribox.com",
    "dubox.com",
    "bdydns.com",
    "baidu.com",
    "baidupcs.com",
    "teraboxcdn.com",
    "iteraplay.in",
    "iteraplay.com",
    "playterabox.com",
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
    and matches the explicit allowlist of TeraBox domains or trusted shorteners.
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
    """Strictly checks if URL hostname belongs to recognized TeraBox domain or shortener."""
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


def extract_url(text: str) -> Optional[str]:
    """Finds and cleanly extracts the first verified TeraBox/shortener HTTP(S) URL from text."""
    if not text:
        return None
    for match in re.finditer(r"https?://[^\s<>\"']+", text):
        url = match.group(0).rstrip(").,;:!?'\"")
        if is_terabox_url(url):
            return url
    return None


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


def shorten_url(long_url: str) -> str:
    """Shortens a long video URL using TinyURL API with fast fallback."""
    if not long_url or len(long_url) < 60:
        return long_url
    try:
        encoded = urllib.parse.quote(long_url, safe="")
        resp = requests.get(f"https://tinyurl.com/api-create.php?url={encoded}", timeout=4)
        if resp.status_code == 200 and resp.text.startswith("http"):
            return resp.text.strip()
    except Exception as e:
        logger.debug(f"[TeraBoxExtractor] Shortener notice: {e}")
    return long_url


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
    title = video.get("title", "TeraBox Video")
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
    quality = video.get("quality", "HD")

    has_real_name = bool(title and title not in ["TeraBox Video", "TeraBox Video Stream"])
    if stream_url or hls_url or has_real_name or thumb:
        return {
            "success": True,
            "title": title,
            "size_bytes": size,
            "size_formatted": format_bytes(size) if size > 0 else "HD Stream",
            "thumbnail": thumb,
            "stream_url": stream_url or hls_url or "",
            "hls_url": hls_url,
            "download_url": stream_url or "",
            "quality": quality,
            "source": source_name,
        }
    return None


def _pick_best_list_item(items: list) -> Optional[Dict[str, Any]]:
    """Selects the primary video item from a TeraBox file list, skipping folders/non-videos when possible."""
    if not items:
        return None
    videos = [
        it for it in items
        if str(it.get("isdir", "0")) != "1"
        and (
            str(it.get("category", "")) == "1"
            or (it.get("server_filename", "").lower().endswith(VIDEO_EXTENSIONS))
        )
    ]
    if videos:
        return max(videos, key=lambda x: int(x.get("size") or 0))
    files = [it for it in items if str(it.get("isdir", "0")) != "1"]
    return files[0] if files else items[0]


class TeraBoxExtractor:
    def __init__(self, ndus_cookie: Optional[str] = None, worker_url: Optional[str] = None):
        self.ndus_cookie = (ndus_cookie or os.getenv("NDUS_COOKIE", "")).strip()
        self.worker_url = (worker_url or os.getenv("WORKER_URL", "https://teravidsplay.proxyking.workers.dev")).rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.last_diagnostics = []
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
        Returns (raw_token, share_token_with_1, short_token_for_surl_param) without stripping
        legitimate leading '1' characters from hyphenated or query-based shorturl IDs.
        """
        raw = self.parse_surl(share_url)
        if not raw:
            return None, "", ""

        from_query = bool(re.search(r"[?&](?:surl|v|s)=", share_url)) and not re.search(r"/(?:s|v)/", share_url)
        is_legacy = bool(re.match(r"^1[a-zA-Z0-9]{22,}$", raw) and "-" not in raw and "_" not in raw)
        share_tok = raw if raw.startswith("1") else "1" + raw
        short_tok = raw if from_query else (raw[1:] if is_legacy else raw)
        return raw, share_tok, short_tok

    def resolve_via_worker_engine(self, surl_or_url: str) -> Optional[Dict[str, Any]]:
        """
        Primary Engine for Cloud & Datacenter Deployments (Render / Koyeb / VPS):
        Queries the Cloudflare Edge Worker API with a generous timeout for cold imports.
        """
        if not self.worker_url:
            self.last_diagnostics.append("Worker Engine skipped: worker_url is empty")
            return None

        raw_token, share_token, _ = self.parse_surl_pair(surl_or_url)
        # Prioritize 1024terabox mirror first so even un-updated workers resolve fast, with original URL fallback
        targets = []
        if share_token:
            targets.append(f"https://1024terabox.com/s/{share_token}")
        if surl_or_url.startswith("http") and surl_or_url not in targets:
            targets.append(surl_or_url)
        elif not targets:
            targets.append(surl_or_url)

        for idx, target in enumerate(targets):
            t0 = time.time()
            try:
                endpoint = f"{self.worker_url}/api/resolve?surl={urllib.parse.quote(target, safe='')}"
                logger.info(f"[TeraBoxExtractor] Resolving via Edge Worker (attempt {idx+1}): {endpoint}")
                resp = requests.get(endpoint, headers={"User-Agent": DEFAULT_HEADERS["User-Agent"]}, timeout=20)
                elapsed = time.time() - t0
                self.last_diagnostics.append(f"Worker attempt {idx+1} -> status {resp.status_code} ({elapsed:.1f}s)")
                logger.info(f"[TeraBoxExtractor] Edge Worker HTTP status: {resp.status_code} ({elapsed:.2f}s)")

                data = {}
                if resp.text:
                    try:
                        data = resp.json()
                    except Exception:
                        data = {}

                if resp.status_code == 200 and data.get("success") and data.get("videos"):
                    parsed = _parse_edge_video_payload(data["videos"][0], "Cloudflare Edge Engine")
                    if parsed:
                        logger.info(f"[TeraBoxExtractor] Resolved via Worker: '{parsed['title']}' ({parsed['size_formatted']})")
                        return parsed

                partial = data.get("partial_metadata")
                if partial and (partial.get("title") or partial.get("thumbnailUrl")):
                    title = partial.get("title", "TeraBox Video")
                    size = _safe_int(partial.get("size"))
                    thumb = partial.get("thumbnailUrl")
                    logger.info(f"[TeraBoxExtractor] Resolved partial metadata via Worker: '{title}'")
                    return {
                        "success": True,
                        "title": title,
                        "size_bytes": size,
                        "size_formatted": format_bytes(size) if size > 0 else "1080p HD",
                        "thumbnail": thumb,
                        "stream_url": "",
                        "hls_url": None,
                        "download_url": "",
                        "quality": "HD 1080p",
                        "source": "Cloudflare Edge Engine (Metadata)",
                    }

                debug_summary = data.get("debug") or data.get("message") or resp.text[:180]
                if debug_summary:
                    logger.info(f"[TeraBoxExtractor] Worker non-200 detail (attempt {idx+1}): {str(debug_summary)[:240]}")

                # Only retry a second Worker target if the first failed fast (<6s)
                if elapsed >= 6.0:
                    break

            except Exception as e:
                err_msg = f"Worker notice (attempt {idx+1}): {type(e).__name__}: {e}"
                self.last_diagnostics.append(err_msg)
                logger.info(f"[TeraBoxExtractor] {err_msg} -> Falling back to HighSpeed Engine")
                break

        return None

    def resolve_via_highspeed_engine(self, share_url: str) -> Tuple[Optional[Dict[str, Any]], bool]:
        """
        Secondary Engine: Queries iTeraPlay edge resolver directly.
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
                timeout=12,
            )
            if resp.status_code in (403, 429):
                self.last_diagnostics.append(f"iTeraPlay HTTP {resp.status_code} ({share_url})")
                logger.info(f"[TeraBoxExtractor] HighSpeed Engine HTTP {resp.status_code} for {share_url}")
                return None, True
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("videos"):
                    parsed = _parse_edge_video_payload(data["videos"][0], "HighSpeed Edge Engine")
                    if parsed:
                        return parsed, False
                status = data.get("status", "")
                if status in ("captcha_required", "rate_limited"):
                    self.last_diagnostics.append(f"iTeraPlay status: {status}")
                    logger.info(f"[TeraBoxExtractor] HighSpeed Engine status: {status}")
                    return None, True
            else:
                self.last_diagnostics.append(f"iTeraPlay HTTP {resp.status_code} ({share_url})")
                logger.info(f"[TeraBoxExtractor] HighSpeed Engine HTTP {resp.status_code} for {share_url}: {resp.text[:120]}")
        except Exception as e:
            self.last_diagnostics.append(f"iTeraPlay err ({share_url}): {type(e).__name__}")
            logger.warning(f"[TeraBoxExtractor] HighSpeed Engine notice: {e}")
        return None, False

    def resolve_via_direct_scraper(self, short_token: str) -> Optional[Dict[str, Any]]:
        """
        Tertiary Fallback: Scrapes terabox.app directly for real metadata, thumbnails, and optional dlink.
        Handles nested folders (1 level) and filters for playable video items.
        """
        if not short_token:
            return None
        try:
            page_url = f"https://www.terabox.app/sharing/link?surl={urllib.parse.quote(short_token, safe='')}"
            resp = self.session.get(page_url, timeout=6)
            if resp.status_code != 200:
                self.last_diagnostics.append(f"Direct scraper HTTP {resp.status_code}")
                logger.info(f"[TeraBoxExtractor] Direct scraper HTTP {resp.status_code} on sharing/link")
                return None
            html_body = resp.text

            js_token = None
            m_enc = re.search(r'fn%28%22([^%"]+)%22%29', html_body)
            m_plain = re.search(r'fn\("([^"]+)"\)', html_body)
            if m_enc:
                js_token = m_enc.group(1)
            elif m_plain:
                js_token = m_plain.group(1)

            log_id = None
            m_log = re.search(r"dp-logid=([^&\"'\s]+)", html_body + resp.url)
            if m_log:
                log_id = m_log.group(1)

            def fetch_list(dir_path: str = "") -> Optional[Dict[str, Any]]:
                params = {
                    "app_id": "250528",
                    "web": "1",
                    "channel": "dubox",
                    "clienttype": "0",
                    "page": "1",
                    "num": "50",
                    "order": "time",
                    "desc": "1",
                    "site_referer": resp.url,
                    "shorturl": short_token,
                    "root": "0" if dir_path else "1",
                }
                if dir_path:
                    params["dir"] = dir_path
                if js_token:
                    params["jsToken"] = js_token
                if log_id:
                    params["dplogid"] = log_id

                list_resp = self.session.get(
                    "https://www.terabox.app/share/list",
                    params=params,
                    headers={"Referer": resp.url},
                    timeout=10,
                )
                if list_resp.status_code == 200:
                    return list_resp.json()
                return None

            data = fetch_list()
            if not data or not data.get("list"):
                errno = (data or {}).get("errno")
                self.last_diagnostics.append(f"Direct scraper share/list empty (errno={errno})")
                logger.info(f"[TeraBoxExtractor] Direct scraper share/list empty (errno={errno})")
                return None

            item = _pick_best_list_item(data["list"])
            if item and str(item.get("isdir", "0")) == "1" and item.get("path"):
                sub_data = fetch_list(item["path"])
                if sub_data and sub_data.get("list"):
                    sub_item = _pick_best_list_item(sub_data["list"])
                    if sub_item and str(sub_item.get("isdir", "0")) != "1":
                        item = sub_item

            if not item:
                return None

            filename = item.get("server_filename", "TeraBox Video")
            size = int(item.get("size") or 0)
            thumbs = item.get("thumbs") or {}
            thumb = thumbs.get("url3") or thumbs.get("url2") or thumbs.get("url1") or thumbs.get("icon")
            dlink = item.get("dlink") or ""

            return {
                "success": True,
                "title": filename,
                "size_bytes": size,
                "size_formatted": format_bytes(size),
                "thumbnail": thumb,
                "stream_url": dlink,
                "hls_url": None,
                "download_url": dlink,
                "quality": "HD 1080p",
                "source": "TeraBox Direct Scraper" if dlink else "TeraBox Metadata Scraper",
            }
        except Exception as e:
            logger.warning(f"[TeraBoxExtractor] Direct scraper exception: {e}")
        return None

    def get_video_stream(self, share_url: str) -> Dict[str, Any]:
        """
        Main orchestrator: Resolves any TeraBox share URL into metadata & streamable direct links.
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

        # Step 1: Resolve shortened URLs safely across redirects
        clean_url = self._expand_short_url(share_url)
        raw_token, share_token, short_token = self.parse_surl_pair(clean_url)
        if not raw_token:
            raw_token, share_token, short_token = self.parse_surl_pair(share_url)

        surl_masked = f"{raw_token[:3]}***{raw_token[-3:]}" if raw_token and len(raw_token) > 6 else "***"
        logger.info(f"[TeraBoxExtractor] Processing safe surl token: {surl_masked}")

        # Build deduplicated candidate list prioritizing fastest working mirrors + canonical URL
        candidates = []
        if share_token:
            candidates.append(f"https://1024terabox.com/s/{share_token}")
            candidates.append(f"https://terabox.com/s/{share_token}")
        if is_terabox_url(clean_url) and clean_url not in candidates and not _host_matches(
            (urllib.parse.urlparse(clean_url).hostname or "").lower(), ALLOWED_SHORTENERS
        ):
            candidates.append(clean_url)

        if share_token:
            for c in (
                f"https://www.terabox.app/sharing/link?surl={short_token}",
                f"https://teraboxapp.com/s/{share_token}",
            ):
                if c not in candidates:
                    candidates.append(c)
        if share_url not in candidates:
            candidates.append(share_url)

        partial_meta = None

        def _finalize_result(res_dict: Dict[str, Any]) -> Dict[str, Any]:
            res_dict["surl"] = share_token or raw_token
            if not res_dict.get("thumbnail") and short_token:
                direct_meta = self.resolve_via_direct_scraper(short_token)
                if direct_meta and direct_meta.get("thumbnail"):
                    res_dict["thumbnail"] = direct_meta["thumbnail"]
            return res_dict

        # Step 2: Primary Cloudflare Edge Worker Engine
        if share_token or clean_url:
            worker_res = self.resolve_via_worker_engine(clean_url if clean_url.startswith("http") else share_token)
            if worker_res and worker_res.get("success"):
                return _finalize_result(worker_res)
            if worker_res and worker_res.get("partial_metadata"):
                partial_meta = worker_res["partial_metadata"]

        # Step 3: Direct High-Speed Engine (parallel race on top 3 mirrors without waiting for losers)
        primary_batch = candidates[:3]
        short_circuit = False
        if primary_batch:
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=len(primary_batch))
            try:
                future_map = {executor.submit(self.resolve_via_highspeed_engine, cand): cand for cand in primary_batch}
                for fut in concurrent.futures.as_completed(future_map):
                    res, stop_loop = fut.result()
                    if res and res.get("success"):
                        return _finalize_result(res)
                    if stop_loop:
                        short_circuit = True
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

        if not short_circuit:
            for cand in candidates[3:]:
                res, stop_loop = self.resolve_via_highspeed_engine(cand)
                if res and res.get("success"):
                    return _finalize_result(res)
                if stop_loop:
                    break

        # Step 4: Direct terabox.app Metadata/dlink Scraper
        if short_token:
            direct_res = self.resolve_via_direct_scraper(short_token)
            if direct_res and direct_res.get("success"):
                direct_res["surl"] = share_token or raw_token
                return direct_res

        # Step 5: Web Player Client Fallback (uses any partial metadata harvested from worker)
        if share_token or raw_token:
            logger.warning(
                f"[TeraBoxExtractor] Instant resolution via Web Player Client Engine for surl: {surl_masked}. "
                f"Diagnostics: {self.last_diagnostics}"
            )
            title = (partial_meta or {}).get("title") or "TeraBox Video Stream"
            size_bytes = _safe_int((partial_meta or {}).get("size"))
            thumb = (partial_meta or {}).get("thumbnailUrl")
            return {
                "success": True,
                "surl": share_token or raw_token,
                "title": title,
                "size_bytes": size_bytes,
                "size_formatted": format_bytes(size_bytes) if size_bytes > 0 else "HD Stream",
                "thumbnail": thumb,
                "stream_url": "",
                "hls_url": None,
                "download_url": "",
                "quality": "HD 1080p",
                "source": "Web Player Client Engine",
            }

        logger.error(f"[TeraBoxExtractor] All resolution engines failed for URL: {share_url}. Diag: {self.last_diagnostics}")
        return {
            "success": False,
            "error": "Resolution Failed",
            "message": "Unable to extract streamable link. Please verify that the link is valid and public.",
            "diagnostics": self.last_diagnostics,
        }
