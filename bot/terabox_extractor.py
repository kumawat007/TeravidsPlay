"""
TeravidsPlay — High-Speed TeraBox Resolution Engine
Zero Login / Zero Cookie Required.
Features:
- Primary Engine: High-speed edge resolver with HLS + MP4 direct CDN stream links.
- Secondary Engine: Direct terabox.app share/list scraper.
- Personal NDUS override (optional).
"""

import re
import urllib.parse
from typing import Dict, Any, Optional
import requests

TERABOX_DOMAINS = [
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
]

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def is_terabox_url(text: str) -> bool:
    """Checks if text contains any recognized TeraBox domain."""
    if not text:
        return False
    lower_text = text.lower()
    return any(domain in lower_text for domain in TERABOX_DOMAINS)


def extract_url(text: str) -> Optional[str]:
    """Finds and cleanly extracts the first HTTP/HTTPS URL from text."""
    if not text:
        return None
    match = re.search(r"https?://[^\s<>\"']+", text)
    if not match:
        return None
    url = match.group(0)
    return url.rstrip(").,;:!?'\"")


def format_bytes(size_bytes: int) -> str:
    """Formats raw bytes into clean human-readable size string."""
    try:
        size = float(size_bytes)
        if size <= 0:
            return "Unknown Size"
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size < 1024.0:
                return f"{size:.1f} {unit}" if unit in ["MB", "GB"] else f"{int(size)} {unit}"
            size /= 1024.0
        return f"{size:.1f} PB"
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
    def __init__(self, ndus_cookie: Optional[str] = None):
        self.ndus_cookie = (ndus_cookie or "").strip()
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        if self.ndus_cookie:
            self.session.cookies.set("ndus", self.ndus_cookie, domain=".terabox.com")
            self.session.cookies.set("lang", "en", domain=".terabox.com")

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
                timeout=35
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
            print(f"[TeraBoxExtractor] HighSpeed Engine exception: {e}")
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
        except Exception as e:
            print(f"[TeraBoxExtractor] Direct scraper exception: {e}")
        return None

    def get_video_stream(self, share_url: str) -> Dict[str, Any]:
        """
        Main orchestrator: Resolves any TeraBox share URL into a streamable direct link.
        """
        # Step 1: Normalize & resolve shortened URLs if needed
        clean_url = share_url
        try:
            head_resp = requests.head(share_url, headers=DEFAULT_HEADERS, allow_redirects=True, timeout=5)
            clean_url = head_resp.url
        except Exception:
            pass

        surl = self.parse_surl(clean_url) or self.parse_surl(share_url)

        # Step 2: Try High-Speed Edge Engine (Fastest, zero-cookie, HD stream)
        res = self.resolve_via_highspeed_engine(clean_url)
        if res and res.get("success"):
            res["surl"] = surl
            return res

        # Step 3: Try Direct terabox.app Scraper
        if surl:
            fallback_res = self.resolve_via_direct_scraper(surl)
            if fallback_res and fallback_res.get("success"):
                fallback_res["surl"] = surl
                return fallback_res

        return {
            "success": False,
            "error": "Resolution Failed",
            "message": "Unable to extract streamable link. Please verify that the link is valid and public.",
        }
