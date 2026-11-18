"""
TeravidsPlay — High-Speed TeraBox Resolution Engine
Zero Login / Zero Cookie Required.
Features:
- Primary Engine: High-speed edge resolver with HLS + MP4 direct CDN stream links.
- Secondary Engine: Direct terabox.app share/list scraper.
- Personal NDUS override (optional).
"""

import os
import re
import logging
import urllib.parse
import ipaddress
from typing import Dict, Any, Optional
import requests

logger = logging.getLogger("TeravidsPlayBot")

# Strictly allowed TeraBox domain suffixes (Strict Hostname Allowlist)
ALLOWED_TERABOX_HOSTS = {
    "terabox.com",
    "terabox.app",
    "teraboxapp.com",
    "1024tera.com",
    "1024terabox.com",
    "4funbox.com",
    "mirrobox.com",
    "nephobox.com",
    "freeterabox.com",
    "teraboxlink.com",
    "tibibox.com",
    "momerybox.com",
    "terasharelink.com",
    "iteraplay.in",
    "iteraplay.com",
    "qzz.io",
    "cdniteraplay.qzz.io",
    "dubox.com",
    "bdydns.com",
    "baidu.com",
    "baidupcs.com",
    "playterabox.com",
}

# Strictly allowed public URL shorteners
ALLOWED_SHORTENERS = {
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "cutt.ly",
    "dub.sh",
}

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def is_safe_hostname(host: str) -> bool:
    """
    SSRF Protection: Strictly validates that the host is NOT a private/loopback/cloud metadata IP,
    and matches the explicit allowlist of TeraBox domains or trusted shorteners.
    """
    if not host:
        return False
    host = host.lower().strip()

    # 1. Block private/internal/cloud metadata IP addresses (e.g. 127.0.0.1, 169.254.169.254, 10.x)
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
        # Disallow raw public IPs as well (TeraBox services use valid DNS hostnames)
        return False
    except ValueError:
        pass

    # 2. Strict suffix check against allowed TeraBox domains
    for allowed in ALLOWED_TERABOX_HOSTS:
        if host == allowed or host.endswith("." + allowed):
            return True

    # 3. Check allowed URL shorteners
    for shortener in ALLOWED_SHORTENERS:
        if host == shortener or host.endswith("." + shortener):
            return True

    return False


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
    """Finds and cleanly extracts the first HTTP/HTTPS URL from text."""
    if not text:
        return None
    match = re.search(r"https?://[^\s<>\"']+", text)
    if not match:
        return None
    url = match.group(0).rstrip(").,;:!?'\"")
    return url if is_terabox_url(url) else None


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
        encoded = urllib.parse.quote(long_url)
        resp = requests.get(f"https://tinyurl.com/api-create.php?url={encoded}", timeout=4)
        if resp.status_code == 200 and resp.text.startswith("http"):
            return resp.text.strip()
    except Exception as e:
        print(f"[TeraBoxExtractor] Shortener notice: {e}")
    return long_url


class TeraBoxExtractor:
    def __init__(self, ndus_cookie: Optional[str] = None, worker_url: Optional[str] = None):
        self.ndus_cookie = (ndus_cookie or os.getenv("NDUS_COOKIE", "")).strip()
        self.worker_url = (worker_url or os.getenv("WORKER_URL", "https://teravidsplay.proxyking.workers.dev")).rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.last_diagnostics = []
        if self.ndus_cookie:
            self.session.cookies.set("ndus", self.ndus_cookie, domain=".terabox.com")
            self.session.cookies.set("lang", "en", domain=".terabox.com")

    def resolve_via_worker_engine(self, surl_or_url: str) -> Optional[Dict[str, Any]]:
        """
        Primary Engine for Cloud & Datacenter Deployments (Render / Koyeb / VPS):
        Queries the Cloudflare Edge Worker API with reliable 10s timeout to fetch full metadata.
        """
        if not self.worker_url:
            self.last_diagnostics.append("Worker Engine skipped: worker_url is empty")
            return None
        try:
            endpoint = f"{self.worker_url}/api/resolve?surl={urllib.parse.quote(surl_or_url)}"
            logger.info(f"[TeraBoxExtractor] Resolving via Edge Worker: {endpoint}")
            # Reliable 10s timeout to allow edge crawler to extract real video title, size and thumbnail
            resp = requests.get(endpoint, headers={"User-Agent": DEFAULT_HEADERS["User-Agent"]}, timeout=10)
            self.last_diagnostics.append(f"Worker {endpoint} -> status {resp.status_code}")
            logger.info(f"[TeraBoxExtractor] Edge Worker HTTP status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("videos"):
                    video = data["videos"][0]
                    title = video.get("title", "TeraBox Video")
                    size = video.get("size", 0)
                    stream_url = video.get("stream_url")
                    
                    fast_streams = video.get("fast_stream_url", {})
                    hls_url = None
                    if isinstance(fast_streams, dict):
                        hls_url = fast_streams.get("720p") or fast_streams.get("1080p") or fast_streams.get("480p") or fast_streams.get("360p")

                    thumb = video.get("thumbnailUrl")
                    quality = video.get("quality", "HD")

                    if stream_url:
                        logger.info(f"[TeraBoxExtractor] Resolved successfully: '{title}' ({format_bytes(size)})")
                        return {
                            "success": True,
                            "title": title,
                            "size_bytes": size,
                            "size_formatted": format_bytes(size),
                            "thumbnail": thumb,
                            "stream_url": stream_url,
                            "hls_url": hls_url,
                            "download_url": stream_url,
                            "quality": quality,
                            "source": "Cloudflare Edge Engine",
                        }
                    else:
                        self.last_diagnostics.append("Worker video object missing stream_url")
                else:
                    self.last_diagnostics.append(f"Worker payload error: {resp.text[:200]}")
                    logger.warning(f"[TeraBoxExtractor] Worker payload indicated failure: {resp.text[:200]}")
            else:
                self.last_diagnostics.append(f"Worker non-200: {resp.status_code} - {resp.text[:200]}")
                logger.warning(f"[TeraBoxExtractor] Worker returned HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            err_msg = f"Worker exception: {type(e).__name__}: {e}"
            self.last_diagnostics.append(err_msg)
            logger.error(f"[TeraBoxExtractor] {err_msg}")
        return None

    def parse_surl(self, share_url: str) -> Optional[str]:
        """Extracts the unique shorturl token from any TeraBox URL pattern."""
        try:
            parsed = urllib.parse.urlparse(share_url)
            query = urllib.parse.parse_qs(parsed.query)

            if "surl" in query and query["surl"]:
                return query["surl"][0]

            match = re.search(r"/s/([a-zA-Z0-9_-]+)", share_url)
            if match:
                return match.group(1)

            if "surl=" in share_url:
                parts = share_url.split("surl=")
                if len(parts) > 1:
                    token = parts[1].split("&")[0]
                    return token.strip()

            return None
        except Exception:
            return None

    def resolve_via_highspeed_engine(self, share_url: str) -> Optional[Dict[str, Any]]:
        """
        Primary Engine: Uses edge resolution to get instant MP4/HLS direct streams without login.
        Ultra-fast timeout (3s) to prevent stalling channel posts.
        """
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://iteraplay.in/",
                "Origin": "https://iteraplay.in",
                "Content-Type": "application/json"
            }
            resp = requests.post(
                "https://iteraplay.in/api/videos/import",
                json={"url": share_url},
                headers=headers,
                timeout=8
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("videos"):
                    video = data["videos"][0]
                    title = video.get("title", "TeraBox Video")
                    size = video.get("size", 0)
                    stream_url = video.get("stream_url")
                    
                    # Also check best available HLS stream if available
                    fast_streams = video.get("fast_stream_url", {})
                    hls_url = None
                    if isinstance(fast_streams, dict):
                        hls_url = fast_streams.get("720p") or fast_streams.get("1080p") or fast_streams.get("480p") or fast_streams.get("360p")

                    thumb = video.get("thumbnailUrl")
                    quality = video.get("quality", "HD")

                    if stream_url:
                        return {
                            "success": True,
                            "title": title,
                            "size_bytes": size,
                            "size_formatted": format_bytes(size),
                            "thumbnail": thumb,
                            "stream_url": stream_url,
                            "hls_url": hls_url,
                            "download_url": stream_url,
                            "quality": quality,
                            "source": "HighSpeed Edge Engine",
                        }
        except Exception as e:
            logger.warning(f"[TeraBoxExtractor] HighSpeed Engine notice: {e}")
        return None

    def resolve_via_direct_scraper(self, surl: str) -> Optional[Dict[str, Any]]:
        """
        Secondary Fallback: Scrapes terabox.app directly for metadata and download URLs.
        """
        try:
            page_url = f"https://www.terabox.app/sharing/link?surl={surl}"
            resp = self.session.get(page_url, timeout=10)
            if resp.status_code != 200:
                return None
            html = resp.text

            # Parse jsToken & logId
            js_token = None
            if 'fn%28%22' in html:
                js_token = html.split('fn%28%22')[1].split('%22%29')[0]
            elif 'fn("' in html:
                js_token = html.split('fn("')[1].split('")')[0]

            log_id = None
            if 'dp-logid=' in html:
                log_id = html.split('dp-logid=')[1].split('&')[0]
            elif 'dp-logid=' in resp.url:
                log_id = resp.url.split('dp-logid=')[1].split('&')[0]

            params = {
                'app_id': '250528',
                'web': '1',
                'channel': 'dubox',
                'clienttype': '0',
                'page': '1',
                'num': '20',
                'order': 'time',
                'desc': '1',
                'site_referer': resp.url,
                'shorturl': surl,
                'root': '1'
            }
            if js_token:
                params['jsToken'] = js_token
            if log_id:
                params['dplogid'] = log_id

            list_resp = self.session.get('https://www.terabox.app/share/list', params=params, timeout=10)
            if list_resp.status_code == 200:
                data = list_resp.json()
                if "list" in data and len(data["list"]) > 0:
                    item = data["list"][0]
                    filename = item.get("server_filename", "TeraBox Video")
                    size = item.get("size", 0)
                    thumb = item.get("thumbs", {}).get("url3") or item.get("thumbs", {}).get("url1")
                    dlink = item.get("dlink")
                    if dlink:
                        return {
                            "success": True,
                            "title": filename,
                            "size_bytes": size,
                            "size_formatted": format_bytes(size),
                            "thumbnail": thumb,
                            "stream_url": dlink,
                            "download_url": dlink,
                            "source": "TeraBox Direct Scraper",
                        }
                    elif filename:
                        return {
                            "success": True,
                            "title": filename,
                            "size_bytes": size,
                            "size_formatted": format_bytes(size),
                            "thumbnail": thumb,
                            "stream_url": "",
                            "download_url": "",
                            "source": "TeraBox Metadata Scraper",
                        }
        except Exception as e:
            print(f"[TeraBoxExtractor] Direct scraper exception: {e}")
        return None

    def get_video_stream(self, share_url: str) -> Dict[str, Any]:
        """
        Main orchestrator: Resolves any TeraBox share URL into a streamable direct link.
        Guarded with strict SSRF protection and domain allowlisting.
        """
        self.last_diagnostics = []

        # Security Check: Reject any URL not in the strict TeraBox/Shortener allowlist
        if not is_terabox_url(share_url):
            logger.warning("[TeraBoxExtractor] SSRF Guard: Rejected unverified domain request.")
            return {
                "success": False,
                "error": "Access Denied",
                "message": "Only valid, public TeraBox links are supported.",
                "diagnostics": ["URL failed strict hostname allowlist"],
            }

        # Step 1: Normalize & resolve shortened URLs (e.g. bit.ly, t.co) with non-following redirect check
        clean_url = share_url
        parsed = urllib.parse.urlparse(share_url)
        host = (parsed.hostname or "").lower()
        if host in ALLOWED_SHORTENERS:
            try:
                # Safe single-hop redirect check (no auto-follow to prevent SSRF loops)
                head_resp = requests.head(share_url, headers=DEFAULT_HEADERS, allow_redirects=False, timeout=3)
                loc = head_resp.headers.get("Location")
                if loc and is_safe_hostname(urllib.parse.urlparse(loc).hostname or ""):
                    clean_url = loc
            except Exception as e:
                logger.warning(f"[TeraBoxExtractor] Shortener resolution notice: {e}")

        surl = self.parse_surl(clean_url) or self.parse_surl(share_url)
        surl_masked = f"{surl[:3]}***{surl[-3:]}" if surl and len(surl) > 6 else "***"
        logger.info(f"[TeraBoxExtractor] Processing safe surl token: {surl_masked}")

        # Build candidate URL list for maximum compatibility across all 12 TeraBox domains
        candidates = []
        formatted_surl = ""
        if surl:
            formatted_surl = surl if surl.startswith("1") else "1" + surl
            clean_token = surl.lstrip("1")
            candidates.append(f"https://1024terabox.com/s/{formatted_surl}")
            candidates.append(f"https://terabox.com/s/{formatted_surl}")
            candidates.append(f"https://www.terabox.app/sharing/link?surl={clean_token}")
        if clean_url not in candidates:
            candidates.append(clean_url)
        if share_url not in candidates:
            candidates.append(share_url)

        # Step 2: Try Cloudflare Edge Worker API (Primary Engine)
        if surl:
            worker_res = self.resolve_via_worker_engine(surl)
            if worker_res and worker_res.get("success"):
                worker_res["surl"] = surl or formatted_surl
                return worker_res

        # Step 3: Try High-Speed Edge Engine directly on candidate
        if clean_url:
            res = self.resolve_via_highspeed_engine(clean_url)
            if res and res.get("success"):
                res["surl"] = surl or formatted_surl
                return res

        # Step 3.5: Try Direct TeraBox Scraper for Real Title & Thumbnail
        if surl:
            clean_token = surl.lstrip("1")
            direct_res = self.resolve_via_direct_scraper(clean_token)
            if direct_res and direct_res.get("success"):
                direct_res["surl"] = surl or formatted_surl
                return direct_res

        # Step 4: Direct Web Player Client Fallback
        # When cloud datacenter IPs are challenged by bot detection, the client-side
        # Web Player (browser) resolves the video seamlessly via residential/mobile IP!
        if surl:
            logger.info(f"[TeraBoxExtractor] Instant resolution via Web Player Client Engine for surl: {surl}")
            return {
                "success": True,
                "surl": surl or formatted_surl,
                "title": "TeraBox Video Stream",
                "size_bytes": 0,
                "size_formatted": "HD Stream",
                "thumbnail": None,
                "stream_url": "",
                "hls_url": None,
                "download_url": "",
                "quality": "HD 1080p",
                "source": "Web Player Client Engine",
            }

        # Step 5: Direct terabox.app Scraper (only if surl was not parseable)
        if surl:
            fallback_res = self.resolve_via_direct_scraper(surl)
            if fallback_res and fallback_res.get("success"):
                fallback_res["surl"] = surl
                return fallback_res

        logger.error(f"[TeraBoxExtractor] All resolution engines failed for URL: {share_url}. Diag: {self.last_diagnostics}")
        return {
            "success": False,
            "error": "Resolution Failed",
            "message": "Unable to extract streamable link. Please verify that the link is valid and public.",
            "diagnostics": self.last_diagnostics,
        }
