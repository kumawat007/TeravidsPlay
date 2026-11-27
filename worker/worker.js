/**
 * TeravidsPlay — Production Cloudflare Worker: Streaming Proxy + Resolver + 24/7 Webhook Engine
 *
 * Capabilities:
 * 1. Multi-Engine TeraBox Resolver (/api/resolve): Iteraplay Edge + direct terabox.app/share/list + shorturlinfo fallback.
 * 2. High-Speed Byte-Range Streaming Proxy (/?url=...): Full 206 Partial Content, CORS *,
 *    dynamic HLS M3U8 rewriting, ISP-block bypass (including Replit/TeraBox CDNs), and attachment download mode (&dl=1).
 * 3. Permanent Non-Expiring Direct Download Endpoint (/dl/:surl).
 * 4. 24/7 Serverless Telegram Bot Webhook (/webhook) guarded by ENABLE_WORKER_BOT.
 */

const DEFAULT_PLAYER_URL = "https://teravidsplayer.vercel.app";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_POSTER =
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80";

// Strictly allowed TeraBox domains & CDN hosts (SSRF & Open-Proxy Prevention)
const ALLOWED_TERABOX_HOSTS = [
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
  "qzz.io",
  "cdniteraplay.qzz.io",
  "replit.dev",
  "replit.app",
  "repl.co",
  "teravidsplayer.vercel.app",
  "vercel.app",
  "workers.dev",
  "proxyking.workers.dev",
];

// Public URL shorteners allowed for single-chain safe expansion
const ALLOWED_SHORTENERS = [
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
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Authorization, User-Agent, Accept",
  "X-Content-Type-Options": "nosniff",
};

function hostMatchesList(hostname, list) {
  const host = (hostname || "").toLowerCase().trim();
  if (!host) return false;
  if (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host === "localhost" ||
    host.includes("[") ||
    host.includes(":")
  ) {
    return false;
  }
  return list.some((allowed) => host === allowed || host.endsWith("." + allowed));
}

function isAllowedProxyUrl(urlString) {
  if (!urlString) return false;
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return hostMatchesList(u.hostname, ALLOWED_TERABOX_HOSTS);
  } catch (e) {
    return false;
  }
}

function isTeraBoxOrShortenerUrl(urlString) {
  if (!urlString) return false;
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return (
      hostMatchesList(u.hostname, ALLOWED_TERABOX_HOSTS) ||
      hostMatchesList(u.hostname, ALLOWED_SHORTENERS)
    );
  } catch (e) {
    return false;
  }
}

function isShortenerUrl(urlString) {
  try {
    const u = new URL(urlString);
    return hostMatchesList(u.hostname, ALLOWED_SHORTENERS);
  } catch (e) {
    return false;
  }
}

/**
 * Extracts the first TeraBox, DiskWala, or shortener URL from text AND Telegram entities.
 * Also normalizes scheme-less recognized domains (e.g. terabox.com/s/...).
 */
function extractTeraBoxUrl(msg) {
  const hits = [];
  const rawText = (msg.text || msg.caption || "").replace(/[\u200B-\u200D\uFEFF]+/g, "");
  const cleanTrim = (s) => (s || "").replace(/[).,;:!?'\]}]+$/, "").trim();

  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  let m;
  while ((m = urlRegex.exec(rawText)) !== null) {
    hits.push({ pos: m.index, url: cleanTrim(m[0]) });
  }

  const schemeLessRegex = /(?:^|[\s(])((?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s<>"']+)/g;
  while ((m = schemeLessRegex.exec(rawText)) !== null) {
    const cleaned = cleanTrim(m[1]);
    if (!/^https?:\/\//i.test(cleaned)) {
      hits.push({ pos: m.index, url: "https://" + cleaned });
    }
  }

  const entities = [...(msg.entities || []), ...(msg.caption_entities || [])];
  for (const ent of entities) {
    if (ent && ent.url) {
      hits.push({ pos: Number(ent.offset || 0), url: cleanTrim(ent.url) });
    }
  }

  hits.sort((a, b) => a.pos - b.pos);
  for (const h of hits) {
    if (isTeraBoxOrShortenerUrl(h.url)) {
      return h.url;
    }
  }
  return null;
}

/**
 * Expands allowed URL shorteners safely (up to 5 hops with 4s per-hop timeout).
 */
async function expandShortUrl(rawUrl) {
  let current = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    if (!isShortenerUrl(current)) break;
    try {
      const resp = await fetchWithTimeout(
        current,
        {
          method: "HEAD",
          headers: { "User-Agent": DEFAULT_UA },
          redirect: "manual",
        },
        4000
      );
      let loc = resp.headers.get("Location");
      try { await resp.body?.cancel(); } catch (e) {}
      if (!loc && (resp.status === 405 || resp.status >= 400)) {
        const getResp = await fetchWithTimeout(
          current,
          {
            method: "GET",
            headers: { "User-Agent": DEFAULT_UA },
            redirect: "manual",
          },
          4000
        );
        loc = getResp.headers.get("Location");
        try { await getResp.body?.cancel(); } catch (e) {}
      }
      if (!loc) break;
      const nextUrl = new URL(loc, current).toString();
      if (!isTeraBoxOrShortenerUrl(nextUrl)) break;
      current = nextUrl;
    } catch (e) {
      break;
    }
  }
  return current;
}

function isDiskWalaUrl(urlString) {
  try {
    const u = new URL(urlString);
    return hostMatchesList(u.hostname, ["diskwala.com"]);
  } catch (e) {
    return false;
  }
}

function parseDiskWalaId(input) {
  const str = (input || "").trim();
  const pathMatch = str.match(/\/(?:app|share|v|d|f)\/([a-fA-F0-9]{24})/i);
  if (pathMatch) return pathMatch[1];
  const hexMatch = str.match(/\b([a-fA-F0-9]{24})\b/);
  return hexMatch ? hexMatch[1] : null;
}

function extractSharePath(input) {
  const str = (input || "").trim();
  if (!str) return "";
  try {
    const u = new URL(str);
    return (u.searchParams.get("path") || u.searchParams.get("dir") || "").trim();
  } catch (e) {
    const m = str.match(/[?&](?:path|dir)=([^&#]+)/i);
    if (m) {
      try {
        return decodeURIComponent(m[1]).trim();
      } catch (err) {
        return m[1].trim();
      }
    }
    return "";
  }
}

/**
 * Extracts raw token, normalized TeraBox share (/s/1...) + shorturl (?surl=...), and folder path.
 * Properly strips the leading '1' from 23+ char share IDs (even with '-' or '_'),
 * while preserving genuine 22-char query tokens that happen to begin with '1'.
 */
function parseSurlTokens(input) {
  const str = (input || "").trim();
  let rawToken = "";

  const pathMatch = str.match(/\/(?:s|v)\/([a-zA-Z0-9_-]+)/);
  const queryMatch = str.match(/[?&](?:surl|v|s)=([a-zA-Z0-9_-]+)/);

  const cameFromPath = Boolean(pathMatch);
  const cameFromQuery = !cameFromPath && Boolean(queryMatch);

  if (pathMatch) {
    rawToken = pathMatch[1];
  } else if (queryMatch) {
    rawToken = queryMatch[1];
  } else if (/^[a-zA-Z0-9_-]{6,}$/.test(str)) {
    rawToken = str;
  } else {
    rawToken = str
      .replace(/^.*\/(?:s|v)\//, "")
      .replace(/.*[?&](?:surl|v|s)=/, "")
      .split(/[?&#]/)[0]
      .trim();
  }

  if (!rawToken) return null;

  const hasAddedOnePrefix = rawToken.startsWith("1") && rawToken.length >= 23;
  const shareToken = hasAddedOnePrefix
    ? rawToken
    : (cameFromQuery || !rawToken.startsWith("1") ? "1" + rawToken : rawToken);
  const shortToken = hasAddedOnePrefix ? rawToken.slice(1) : rawToken;
  const dirPath = extractSharePath(str);

  return { rawToken, shareToken, shortToken, dirPath };
}

function formatBytes(bytes) {
  try {
    let size = Number(bytes);
    if (!size || size <= 0) return "Unknown Size";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  } catch (e) {
    return "Unknown Size";
  }
}

function getContextualHeaders(targetUrl) {
  let referer = "https://www.terabox.com/";
  let origin = "https://www.terabox.com";
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (
      host.includes("replit.dev") ||
      host.includes("replit.app") ||
      host.includes("repl.co") ||
      host.includes("iteraplay") ||
      host.includes("qzz.io") ||
      host.includes("pterabox.")
    ) {
      referer = "https://iteraplay.in/";
      origin = "https://iteraplay.in";
    } else if (host.includes("terabox.app")) {
      referer = "https://www.terabox.app/";
      origin = "https://www.terabox.app";
    }
  } catch (e) {}
  return { referer, origin };
}

function sanitizeFilename(name) {
  const base = (name || "video.mp4").replace(/[\x00-\x1f\x7f"\\/:*?<>|;]+/g, "_").trim();
  return base || "video.mp4";
}

function pickBestMediaItem(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const videoRegex = /\.(mp4|mkv|webm|mov|m4v|avi|flv|ts)$/i;
  const videos = list.filter(
    (item) =>
      String(item.isdir) !== "1" &&
      (String(item.category) === "1" || videoRegex.test(item.server_filename || ""))
  );
  if (videos.length > 0) {
    return videos.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0];
  }
  const files = list.filter((item) => String(item.isdir) !== "1");
  return files[0] || list[0];
}

function pickFirstPlayableVideo(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return null;
  const playable = videos.filter(
    (v) => v && (v.stream_url || v.original_quality_url || v.mp4_url_fast || v.mp4_url_slow || v.fast_stream_url || v.hls_url)
  );
  if (playable.length === 0) return videos[0];
  if (playable.length === 1) return playable[0];
  return playable.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0];
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries www.terabox.app directly using sharing/link (with sharing/embed fallback) + share/list.
 */
async function resolveViaTeraBoxApp(shortToken, env = {}) {
  if (!shortToken) return null;
  const ndus = (env.NDUS_COOKIE || "").trim();
  const buildCookieHeader = (setCookie) => {
    const pairs = [];
    if (setCookie) {
      for (const c of setCookie.split(/,(?=\s*[^;,\s]+=)/)) {
        const kv = c.split(";")[0].trim();
        if (kv) pairs.push(kv);
      }
    }
    if (ndus && !pairs.some((p) => p.startsWith("ndus="))) {
      pairs.push(`ndus=${ndus}`);
      pairs.push("lang=en");
    }
    return pairs.join("; ");
  };

  try {
    let pageResp = await fetchWithTimeout(
      `https://www.terabox.app/sharing/link?surl=${encodeURIComponent(shortToken)}`,
      {
        headers: {
          "User-Agent": DEFAULT_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...(ndus ? { Cookie: `ndus=${ndus}; lang=en` } : {}),
        },
      },
      5000
    );
    let setCookie = pageResp.ok ? (pageResp.headers.get("set-cookie") || "") : "";
    let html = pageResp.ok ? await pageResp.text() : "";

    // If sharing/link returned short JSON verification challenge, try sharing/embed for jsToken + session cookies
    if (!pageResp.ok || html.length < 1000) {
      const embedResp = await fetchWithTimeout(
        `https://www.terabox.app/sharing/embed?surl=${encodeURIComponent(shortToken)}`,
        {
          headers: {
            "User-Agent": DEFAULT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            ...(ndus ? { Cookie: `ndus=${ndus}; lang=en` } : {}),
          },
        },
        5000
      );
      if (embedResp.ok) {
        pageResp = embedResp;
        setCookie = embedResp.headers.get("set-cookie") || setCookie;
        html = await embedResp.text();
      }
    }
    if (!pageResp.ok || !html) return null;

    let jsToken = "";
    const fnEncodedMatch = html.match(/fn%28%22([^%"]+)%22%29/);
    const fnPlainMatch = html.match(/fn\("([^"]+)"\)/);
    if (fnEncodedMatch) jsToken = fnEncodedMatch[1];
    else if (fnPlainMatch) jsToken = fnPlainMatch[1];

    let logId = pageResp.headers.get("Logid") || "";
    const logMatch = (html + pageResp.url).match(/dp-logid=([^&"'\s]+)/);
    if (!logId && logMatch) logId = logMatch[1];

    const fetchList = async (dirPath = "") => {
      const qs = new URLSearchParams({
        app_id: "250528",
        web: "1",
        channel: "dubox",
        clienttype: "0",
        page: "1",
        num: "50",
        order: "time",
        desc: "1",
        site_referer: pageResp.url,
        shorturl: shortToken,
        root: dirPath ? "0" : "1",
      });
      if (dirPath) qs.set("dir", dirPath);
      if (jsToken) qs.set("jsToken", jsToken);
      if (logId) qs.set("dplogid", logId);

      const listHeaders = {
        "User-Agent": DEFAULT_UA,
        "Referer": pageResp.url,
        "Accept": "application/json, text/plain, */*",
      };
      const cookieHeader = buildCookieHeader(setCookie);
      if (cookieHeader) listHeaders["Cookie"] = cookieHeader;

      const listResp = await fetchWithTimeout(
        `https://www.terabox.app/share/list?${qs.toString()}`,
        { headers: listHeaders },
        5000
      );
      if (!listResp.ok) return null;
      return await listResp.json();
    };

    const data = await fetchList();
    if (!data || !Array.isArray(data.list) || data.list.length === 0) return null;

    let item = pickBestMediaItem(data.list);
    // Traverse 1 folder level if the share root contains a folder
    if (item && String(item.isdir) === "1" && item.path) {
      const subData = await fetchList(item.path);
      if (subData && Array.isArray(subData.list) && subData.list.length > 0) {
        const subItem = pickBestMediaItem(subData.list);
        if (subItem && String(subItem.isdir) !== "1") item = subItem;
      }
    }

    if (!item) return null;
    const thumbs = item.thumbs || {};
    const thumb = thumbs.url3 || thumbs.url2 || thumbs.url1 || thumbs.icon || "";
    return {
      title: item.server_filename || "TeraBox Video",
      size: Number(item.size || 0),
      thumbnailUrl: thumb,
      stream_url: item.dlink || "",
      source: "terabox.app",
    };
  } catch (e) {
    return null;
  }
}

function mapShareListVideos(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const videoRegex = /\.(mp4|mkv|webm|mov|m4v|avi|flv|ts)$/i;
  let items = list.filter(
    (item) =>
      String(item.isdir) !== "1" &&
      (String(item.category) === "1" || videoRegex.test(item.server_filename || ""))
  );
  if (items.length === 0) {
    items = list.filter((item) => String(item.isdir) !== "1");
  }
  return items.map((item) => {
    const thumbs = item.thumbs || {};
    const thumb = thumbs.url3 || thumbs.url2 || thumbs.url1 || thumbs.icon || "";
    return {
      fileId: item.fs_id ? String(item.fs_id) : "",
      md5: item.md5 || "",
      title: item.server_filename || "TeraBox Video",
      size: Number(item.size || 0),
      quality: "HD",
      thumbnailUrl: thumb,
      stream_url: item.dlink || "",
      source: "1024terabox",
    };
  });
}

/**
 * Fetches full file/folder metadata via direct 1024terabox-family /share/list mirrors (works cleanly for folders & paths).
 */
async function fetchShareListVideos(shortToken, dirPath = "", env = {}) {
  if (!shortToken) return [];
  const ndus = (env.NDUS_COOKIE || "").trim();
  const hosts = ["1024terabox.com", "teraboxapp.com", "teraboxlink.com"];

  const queryHostList = async (host, pathArg = "") => {
    const qs = new URLSearchParams({
      app_id: "250528",
      web: "1",
      channel: "dubox",
      clienttype: "0",
      page: "1",
      num: "100",
      order: "time",
      desc: "1",
      shorturl: shortToken,
      root: pathArg ? "0" : "1",
    });
    if (pathArg) qs.set("dir", pathArg);

    const headers = {
      "User-Agent": DEFAULT_UA,
      "Referer": `https://${host}/`,
      "Accept": "application/json, text/plain, */*",
    };
    if (ndus) headers["Cookie"] = `ndus=${ndus}; lang=en`;

    const resp = await fetchWithTimeout(`https://${host}/share/list?${qs.toString()}`, { headers }, 4500);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || Number(data.errno) !== 0 || !Array.isArray(data.list) || data.list.length === 0) {
      return null;
    }
    return data.list;
  };

  for (const host of hosts) {
    try {
      const list = await queryHostList(host, dirPath);
      if (!list) continue;
      let videos = mapShareListVideos(list);
      if (videos.length > 0) return videos;

      const folderItem = list.find((it) => String(it.isdir) === "1" && it.path);
      if (folderItem) {
        const subList = await queryHostList(host, folderItem.path);
        if (subList) {
          videos = mapShareListVideos(subList);
          if (videos.length > 0) return videos;
        }
      }
    } catch (e) {}
  }
  return [];
}

async function fetchShortUrlInfoMeta(shareToken, shortToken, fallbackThumb = "") {
  const tokenCandidates = [shareToken, shortToken].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
  for (const tok of tokenCandidates) {
    try {
      const infoResp = await fetchWithTimeout(
        `https://1024terabox.com/api/shorturlinfo?shorturl=${encodeURIComponent(tok)}&root=1`,
        {
          headers: {
            "User-Agent": DEFAULT_UA,
            "Referer": "https://1024terabox.com/",
            "Accept": "application/json",
          },
        },
        4500
      );
      if (!infoResp.ok) continue;
      const infoData = await infoResp.json();
      if (Number(infoData.errno) !== 0 || !Array.isArray(infoData.list) || infoData.list.length === 0) continue;
      const videos = mapShareListVideos(infoData.list);
      if (videos.length > 0) {
        if (!videos[0].thumbnailUrl && fallbackThumb) videos[0].thumbnailUrl = fallbackThumb;
        return videos;
      }
    } catch (e) {}
  }
  return [];
}

/**
 * Resolves DiskWala /app/:id metadata safely via official public endpoint (or configured API).
 */
async function resolveDiskWalaLink(diskwalaUrl, env = {}) {
  const fileId = parseDiskWalaId(diskwalaUrl);
  if (!fileId) {
    return { success: false, platform: "diskwala", message: "Invalid DiskWala file ID." };
  }

  // Optional configured authenticated API if operator supplies DISKWALA_API_URL
  const customApi = (env.DISKWALA_API_URL || "").trim();
  const customKey = (env.DISKWALA_API_KEY || "").trim();
  if (customApi && /^https:\/\//i.test(customApi)) {
    try {
      const apiEndpoint = customApi.includes("?")
        ? `${customApi}&url=${encodeURIComponent(diskwalaUrl)}`
        : `${customApi}?url=${encodeURIComponent(diskwalaUrl)}`;
      const headers = { "User-Agent": DEFAULT_UA, "Accept": "application/json" };
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
        headers["x-api-key"] = customKey;
      }
      const apiResp = await fetchWithTimeout(apiEndpoint, { headers }, 8000);
      if (apiResp.ok) {
        const apiData = await apiResp.json();
        const items = Array.isArray(apiData) ? apiData : (apiData.videos || (apiData.fileInfo ? [apiData.fileInfo] : []));
        const mapped = items
          .filter((it) => it && (it.stream_url || it.download_url || it.url))
          .map((it) => ({
            fileId,
            title: it.file_name || it.name || it.title || "DiskWala Video",
            size: Number(it.size || 0),
            quality: it.quality || "HD",
            thumbnailUrl: it.thumbnailUrl || it.thumbnail || "",
            stream_url: it.download_url || it.url || it.stream_url || "",
            hls_url: it.stream_url && String(it.stream_url).includes(".m3u8") ? it.stream_url : "",
            source: "diskwala-api",
          }));
        if (mapped.length > 0) {
          return { success: true, platform: "diskwala", diskwala_id: fileId, surl: fileId, videos: mapped };
        }
      }
    } catch (e) {}
  }

  // Official public metadata endpoint (temp_info provides size/type/uploader avatar without stream auth)
  try {
    const infoResp = await fetchWithTimeout(
      "https://udapi.diskwala.com/api/v1/file/temp_info",
      {
        method: "POST",
        headers: {
          "User-Agent": DEFAULT_UA,
          "Content-Type": "application/json",
          "Origin": "https://www.diskwala.com",
          "Referer": "https://www.diskwala.com/",
        },
        body: JSON.stringify({ id: fileId }),
      },
      5000
    );
    if (infoResp.ok) {
      const data = await infoResp.json();
      const fi = data?.fileInfo || {};
      const up = data?.uploader || {};
      const ext = (fi.extension || "mp4").toUpperCase();
      return {
        success: false,
        platform: "diskwala",
        diskwala_id: fileId,
        surl: fileId,
        requires_auth_api: true,
        message: "DiskWala video streaming requires authenticated DiskWala API credentials (public playback is restricted to the DiskWala app).",
        partial_metadata: {
          title: `DiskWala ${ext} Video`,
          masked_name: fi.name || "",
          size: Number(fi.size || 0),
          thumbnailUrl: up.p_p || "",
          type: fi.type || "video/mp4",
          uploader: up.name || "",
        },
      };
    }
  } catch (e) {}

  return {
    success: false,
    platform: "diskwala",
    diskwala_id: fileId,
    surl: fileId,
    requires_auth_api: true,
    message: "DiskWala video could not be resolved.",
  };
}

function mergeVideoMetadataFallbacks(videos, fallbackList) {
  if (!Array.isArray(videos) || !Array.isArray(fallbackList) || fallbackList.length === 0) return videos;
  const byTitle = new Map();
  for (const fb of fallbackList) {
    if (fb && fb.title) byTitle.set(fb.title.trim().toLowerCase(), fb);
  }
  return videos.map((v, idx) => {
    if (!v || v.thumbnailUrl) return v;
    const match = (v.title && byTitle.get(v.title.trim().toLowerCase())) || (idx < fallbackList.length ? fallbackList[idx] : null);
    if (match && match.thumbnailUrl) {
      return { ...v, thumbnailUrl: match.thumbnailUrl };
    }
    return v;
  });
}

/**
 * Shared stream & metadata resolver used by /api/resolve, /dl/:surl, and /webhook.
 * Eliminates the 4x Iteraplay burst (1 candidate first + 1 backup on non-429 failure)
 * and leverages parallel 1024terabox /share/list + Cloudflare Cache API.
 */
async function resolveTeraBoxStream(surlOrUrl, env = {}, ctx = null, bypassCache = false) {
  const rawInput = (surlOrUrl || "").trim();
  const looksLikeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawInput) || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\//.test(rawInput);
  const normalizedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
  if (looksLikeUrl && !isTeraBoxOrShortenerUrl(normalizedUrl)) {
    return {
      success: false,
      rejected: true,
      message: "Unsupported or unauthorized domain.",
      debug: [],
    };
  }

  const candidateInput = looksLikeUrl ? normalizedUrl : rawInput;
  const expanded = isShortenerUrl(candidateInput) ? await expandShortUrl(candidateInput) : candidateInput;

  if (/^https?:\/\//i.test(expanded) && !isTeraBoxOrShortenerUrl(expanded)) {
    return {
      success: false,
      rejected: true,
      message: "Redirect target domain is not permitted.",
      debug: [],
    };
  }

  if (isDiskWalaUrl(expanded) || isDiskWalaUrl(candidateInput)) {
    return await resolveDiskWalaLink(isDiskWalaUrl(expanded) ? expanded : candidateInput, env);
  }

  const tokens = parseSurlTokens(expanded) || parseSurlTokens(candidateInput);
  if (!tokens) {
    return { success: false, rejected: true, message: "Invalid TeraBox link or token", debug: [] };
  }

  const { shareToken, shortToken, dirPath } = tokens;
  const cacheKeyUrl = `https://teravidsplay-cache.internal/v2/resolve?surl=${encodeURIComponent(shareToken)}&dir=${encodeURIComponent(dirPath || "")}`;

  if (!bypassCache && typeof caches !== "undefined" && caches.default) {
    try {
      const cached = await caches.default.match(cacheKeyUrl);
      if (cached) {
        const cachedData = await cached.json();
        if (cachedData && cachedData.success && Array.isArray(cachedData.videos) && cachedData.videos.length > 0) {
          return cachedData;
        }
      }
    } catch (e) {}
  }

  const candidates = [];
  const pushUnique = (u) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  if (dirPath && /^https?:\/\//i.test(expanded) && isAllowedProxyUrl(expanded)) {
    pushUnique(expanded);
  }
  pushUnique(`https://1024terabox.com/s/${shareToken}`);
  pushUnique(`https://terabox.com/s/${shareToken}`);
  if (/^https?:\/\//i.test(expanded) && isAllowedProxyUrl(expanded)) {
    pushUnique(expanded);
  }

  const debugLogs = [];
  const shareListPromise = fetchShareListVideos(shortToken, dirPath, env);
  const shortInfoPromise = fetchShortUrlInfoMeta(shareToken, shortToken);
  const tbAppPromise = resolveViaTeraBoxApp(shortToken, env);

  const queryIteraplaySingle = async (candidate, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resolveResp = await fetch("https://iteraplay.in/api/videos/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": DEFAULT_UA,
          "Referer": "https://iteraplay.in/",
          "Origin": "https://iteraplay.in",
        },
        body: JSON.stringify({ url: candidate }),
        signal: controller.signal,
      });

      const respText = await resolveResp.text();
      debugLogs.push({ candidate, status: resolveResp.status, body: respText.slice(0, 200) });

      if (resolveResp.status === 429 || resolveResp.status === 403 || /rate limit/i.test(respText)) {
        return { rateLimited: true, result: null };
      }

      if (resolveResp.ok) {
        const data = JSON.parse(respText);
        if (data && data.success && Array.isArray(data.videos) && data.videos.length > 0) {
          const best = pickFirstPlayableVideo(data.videos);
          if (best && best !== data.videos[0]) {
            data.videos = [best, ...data.videos.filter((v) => v !== best)];
          }
          if (data.videos.some((v) => v && !v.thumbnailUrl)) {
            const [slList, siList, tbMeta] = await Promise.all([shareListPromise, shortInfoPromise, tbAppPromise]);
            const fbList = slList.length > 0 ? slList : (siList.length > 0 ? siList : (tbMeta ? [tbMeta] : []));
            data.videos = mergeVideoMetadataFallbacks(data.videos, fbList);
          }
          return { rateLimited: false, result: { ...data, surl: shareToken, dirPath } };
        }
      }
      return { rateLimited: false, result: null };
    } catch (err) {
      debugLogs.push({ candidate, error: err.message });
      return { rateLimited: false, result: null };
    } finally {
      clearTimeout(timer);
    }
  };

  // 1. Primary Engine: Query 1 primary candidate first, and at most 1 fallback ONLY on non-429 failure
  let resolvedPayload = null;
  for (const cand of candidates.slice(0, 2)) {
    const attempt = await queryIteraplaySingle(cand, 7500);
    if (attempt.result) {
      resolvedPayload = attempt.result;
      break;
    }
    if (attempt.rateLimited) break;
  }

  if (resolvedPayload) {
    if (typeof caches !== "undefined" && caches.default) {
      const cacheResp = new Response(JSON.stringify(resolvedPayload), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(caches.default.put(cacheKeyUrl, cacheResp));
      } else {
        caches.default.put(cacheKeyUrl, cacheResp).catch(() => {});
      }
    }
    return resolvedPayload;
  }

  // 2. Metadata & Folder Fallbacks (1024terabox /share/list -> /api/shorturlinfo -> terabox.app)
  const [shareListVideos, shortInfoVideos, tbAppMeta] = await Promise.all([
    shareListPromise,
    shortInfoPromise,
    tbAppPromise,
  ]);

  const combinedVideos =
    shareListVideos.length > 0
      ? shareListVideos
      : shortInfoVideos.length > 0
      ? shortInfoVideos
      : tbAppMeta
      ? [tbAppMeta]
      : [];

  if (combinedVideos.length > 0) {
    const hasPlayableStream = combinedVideos.some((v) => v && v.stream_url);
    return {
      success: true,
      surl: shareToken,
      dirPath,
      videos: combinedVideos,
      metadata_only: !hasPlayableStream,
    };
  }

  return {
    success: false,
    surl: shareToken,
    dirPath,
    message: "Stream extraction failed",
    partial_metadata: null,
    debug: debugLogs,
  };
}

/**
 * Fetches upstream response while enforcing SSRF allowlist on all redirect hops.
 */
async function fetchAllowedUpstream(targetUrl, method = "GET", rangeHeader = null) {
  const upstreamHeaders = new Headers();
  const isPlaylistRequest = targetUrl.toLowerCase().includes(".m3u8") || targetUrl.includes("/hls");
  if (rangeHeader && !isPlaylistRequest) upstreamHeaders.set("Range", rangeHeader);

  const { referer, origin } = getContextualHeaders(targetUrl);
  upstreamHeaders.set("User-Agent", DEFAULT_UA);
  upstreamHeaders.set("Referer", referer);
  upstreamHeaders.set("Origin", origin);
  upstreamHeaders.set("Accept", "*/*");

  let currentUrl = targetUrl;
  let redirectCount = 0;
  const maxRedirects = 6;
  let upstreamResponse = null;

  while (redirectCount < maxRedirects) {
    upstreamResponse = await fetchWithTimeout(
      currentUrl,
      {
        method: method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "manual",
      },
      15000
    );

    if ([301, 302, 303, 307, 308].includes(upstreamResponse.status)) {
      const location = upstreamResponse.headers.get("Location");
      try { await upstreamResponse.body?.cancel(); } catch (e) {}
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).toString();
      if (!isAllowedProxyUrl(nextUrl)) {
        return { errorStatus: 403, errorBody: "Access Denied: Redirected domain is not permitted." };
      }
      const nextCtx = getContextualHeaders(nextUrl);
      upstreamHeaders.set("Referer", nextCtx.referer);
      upstreamHeaders.set("Origin", nextCtx.origin);
      currentUrl = nextUrl;
      redirectCount++;
      continue;
    }
    break;
  }

  return { upstreamResponse, finalUrl: currentUrl };
}

/**
 * Builds proxied streaming / download Response (handling HLS M3U8 rewrites, Range 206, images, and attachments).
 */
async function serveProxiedMedia(request, workerOrigin, targetUrl, forceDownload = false, customFilename = "") {
  const range = request.headers.get("Range");
  const { upstreamResponse, finalUrl, errorStatus, errorBody } = await fetchAllowedUpstream(
    targetUrl,
    request.method === "HEAD" ? "HEAD" : "GET",
    range
  );

  if (errorStatus) {
    return new Response(JSON.stringify({ error: errorBody }), {
      status: errorStatus,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const rawCt = upstreamResponse.headers.get("Content-Type") || "";
  const cleanCt = rawCt.split(",")[0].trim();
  const contentType = cleanCt.toLowerCase();
  const isM3U8 =
    finalUrl.toLowerCase().includes(".m3u8") ||
    finalUrl.includes("/hls") ||
    contentType.includes("application/vnd.apple.mpegurl") ||
    contentType.includes("application/x-mpegurl");

  // Block executable web document/script proxying to prevent Stored/Reflected XSS on Worker origin
  if (
    !isM3U8 &&
    /(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript|application\/ecmascript)/i.test(
      contentType
    )
  ) {
    try { await upstreamResponse.body?.cancel(); } catch (e) {}
    return new Response(
      JSON.stringify({ error: "Unsupported Media Type: Active HTML/SVG/JS documents cannot be proxied." }),
      {
        status: 415,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // HLS Playlist Rewriter (handles 200 and 206 GET responses cleanly)
  if (request.method !== "HEAD" && isM3U8 && (upstreamResponse.status === 200 || upstreamResponse.status === 206)) {
    const originalText = await upstreamResponse.text();
    const lines = originalText.split(/\r?\n/);
    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        if (
          trimmed.startsWith("#EXT-X-KEY") ||
          trimmed.startsWith("#EXT-X-MAP") ||
          trimmed.startsWith("#EXT-X-MEDIA") ||
          trimmed.startsWith("#EXT-X-I-FRAME-STREAM-INF")
        ) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            try {
              const absolute = new URL(uri, finalUrl).toString();
              if (!isAllowedProxyUrl(absolute)) return match;
              return `URI="${workerOrigin}/?url=${encodeURIComponent(absolute)}"`;
            } catch (e) {
              return match;
            }
          });
        }
        return line;
      }

      try {
        const absoluteSegment = new URL(trimmed, finalUrl).toString();
        if (!isAllowedProxyUrl(absoluteSegment)) return line;
        return `${workerOrigin}/?url=${encodeURIComponent(absoluteSegment)}`;
      } catch (e) {
        return line;
      }
    });

    return new Response(rewritten.join("\n"), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("Set-Cookie");
  responseHeaders.delete("Set-Cookie2");
  if (cleanCt) {
    responseHeaders.set("Content-Type", cleanCt);
  }
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Content-Security-Policy", "sandbox; default-src 'none'");
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type, User-Agent, Accept");
  responseHeaders.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition"
  );

  const isThumbOrImage =
    finalUrl.includes("/thumbnail") ||
    /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(finalUrl) ||
    contentType.startsWith("image/");

  const isSegment = finalUrl.includes("/segment") || /\.ts(\?|$)/i.test(finalUrl);

  if (!responseHeaders.get("Content-Type") || contentType === "application/octet-stream") {
    if (isThumbOrImage) {
      responseHeaders.set("Content-Type", "image/jpeg");
    } else if (isSegment) {
      responseHeaders.set("Content-Type", "video/mp2t");
    } else {
      responseHeaders.set("Content-Type", "video/mp4");
    }
  }

  if (isThumbOrImage) {
    responseHeaders.set("Cache-Control", "public, max-age=3600");
  } else {
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }

  if (forceDownload) {
    const safeName = sanitizeFilename(customFilename || "TeravidsPlay_Video.mp4");
    const asciiName = safeName.replace(/[^\x20-\x7e]+/g, "_") || "TeravidsPlay_Video.mp4";
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const botToken = env.BOT_TOKEN || "";
    const playerBase = (env.PLAYER_URL || DEFAULT_PLAYER_URL).replace(/\/+$/, "");

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. Health Check
    if (
      url.pathname === "/" &&
      !url.searchParams.has("url") &&
      !url.searchParams.has("b64") &&
      request.method === "GET"
    ) {
      return new Response(
        JSON.stringify(
          {
            status: "online",
            service: "TeravidsPlay Edge Streaming & 24/7 Webhook Engine",
            timestamp: new Date().toISOString(),
            webhook_endpoint: `${url.origin}/webhook`,
            resolve_endpoint: `${url.origin}/api/resolve?surl=<token>`,
            download_endpoint: `${url.origin}/dl/<token>`,
          },
          null,
          2
        ),
        {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 2.1 Own Short URL Redirect Endpoint (/v/:id or /s/:id)
    if (url.pathname.startsWith("/v/") || url.pathname.startsWith("/s/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const surl = parts[1] || "";
      if (!surl) {
        return Response.redirect(`${playerBase}/`, 302);
      }
      const params = new URLSearchParams(url.search);
      params.set("v", surl);
      if (!params.has("tg")) params.set("tg", "1");
      return Response.redirect(`${playerBase}/?${params.toString()}`, 302);
    }

    // 2.2 Permanent Direct Download Endpoint (/dl/:id?idx=0&fid=...)
    if (url.pathname.startsWith("/dl/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const rawTail = parts.length > 2 ? parts.slice(1).join("/") : (parts[1] || "");
      const surl = url.searchParams.get("url") || url.searchParams.get("surl") || url.searchParams.get("v") || rawTail;
      if (!surl) {
        return new Response(JSON.stringify({ error: "Missing video token" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const pathParam = url.searchParams.get("path") || "";
      const resolveInput = pathParam
        ? `https://1024tera.com/wap/share/filelist?surl=${encodeURIComponent(surl)}&path=${encodeURIComponent(pathParam)}`
        : surl;
      const resolved = await resolveTeraBoxStream(resolveInput, env, ctx, false);
      let dlTarget = "";
      let fn = url.searchParams.get("fn") || `TeravidsPlay_${surl}.mp4`;
      const idxRaw = parseInt(url.searchParams.get("idx") || "0", 10);
      const fidParam = (url.searchParams.get("fid") || "").trim();
      let idx = Number.isFinite(idxRaw) && idxRaw >= 0 ? idxRaw : 0;

      if (resolved && resolved.success && Array.isArray(resolved.videos) && resolved.videos.length > 0) {
        let vid = null;
        if (fidParam) {
          const foundIdx = resolved.videos.findIndex(
            (v) => v && (String(v.fileId || "") === fidParam || String(v._id || "") === fidParam)
          );
          if (foundIdx >= 0) {
            idx = foundIdx;
            vid = resolved.videos[foundIdx];
          }
        }
        if (!vid) {
          vid = resolved.videos[Math.min(idx, resolved.videos.length - 1)] || resolved.videos[0];
        }
        dlTarget = vid.original_quality_url || vid.stream_url || vid.mp4_url_fast || vid.mp4_url_slow || "";
        fn = url.searchParams.get("fn") || vid.title || fn;
      }
      if (dlTarget && isAllowedProxyUrl(dlTarget)) {
        try {
          return await serveProxiedMedia(request, url.origin, dlTarget, true, fn);
        } catch (e) {}
      }
      const redirectParams = new URLSearchParams({ v: surl, tg: "1", nodl: "1" });
      if (idx > 0) redirectParams.set("idx", String(idx));
      if (pathParam) redirectParams.set("path", pathParam);
      return Response.redirect(`${playerBase}/?${redirectParams.toString()}`, 302);
    }

    // 2.3 High-Speed Metadata & Stream Resolution API (/api/resolve?surl=...)
    if (url.pathname === "/api/resolve") {
      const surl =
        url.searchParams.get("surl") ||
        url.searchParams.get("s") ||
        url.searchParams.get("v") ||
        url.searchParams.get("url") ||
        "";
      if (!surl) {
        return new Response(JSON.stringify({ success: false, message: "Missing surl parameter" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const pathParam = url.searchParams.get("path") || "";
      const fullInput = pathParam && !/path=/i.test(surl)
        ? `https://1024tera.com/wap/share/filelist?surl=${encodeURIComponent(surl)}&path=${encodeURIComponent(pathParam)}`
        : surl;
      const bypassCache = url.searchParams.get("fresh") === "1";

      const result = await resolveTeraBoxStream(fullInput, env, ctx, bypassCache);
      const hasMeta = result.partial_metadata && (result.partial_metadata.title || result.partial_metadata.thumbnailUrl);
      if (!result.success && !result.requires_auth_api && hasMeta) {
        result.success = true;
        result.videos = [
          {
            title: result.partial_metadata.title || "TeraBox Video",
            size: Number(result.partial_metadata.size || 0),
            thumbnailUrl: result.partial_metadata.thumbnailUrl || "",
            stream_url: "",
            source: "terabox.app",
          },
        ];
      }
      return new Response(JSON.stringify(result), {
        status: result.rejected ? 400 : ((result.success || hasMeta) ? (result.requires_auth_api ? 422 : 200) : 404),
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3. 24/7 Serverless Telegram Bot Webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const webhookSecret = env.WEBHOOK_SECRET;
        if (webhookSecret) {
          const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
          if (secretHeader !== webhookSecret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        const isWorkerBotActive = env.ENABLE_WORKER_BOT === "true" || !!webhookSecret;
        if (!isWorkerBotActive) {
          return new Response(
            JSON.stringify({
              status: "inactive",
              message:
                "Worker webhook is inactive. Polling mode is running on Render. Set ENABLE_WORKER_BOT=true to enable.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const update = await request.json();
        const msg =
          update.message || update.channel_post || update.edited_message || update.edited_channel_post;

        if (!msg || !msg.chat?.id) {
          return new Response("OK", { status: 200 });
        }
        if (!botToken) {
          return new Response(JSON.stringify({ error: "BOT_TOKEN is not configured on Worker" }), {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const chatId = msg.chat.id;
        const extracted = extractTeraBoxUrl(msg);
        if (!extracted) {
          return new Response("OK", { status: 200 });
        }

        const resolved = await resolveTeraBoxStream(extracted, env, ctx, false);
        if (resolved?.requires_auth_api) {
          return new Response("OK", { status: 200 });
        }

        const tokens = parseSurlTokens(extracted);
        const surl = resolved?.surl || tokens?.shareToken || "";
        const dirPath = resolved?.dirPath || tokens?.dirPath || "";

        let videoData = null;
        if (resolved?.success && Array.isArray(resolved.videos) && resolved.videos.length > 0) {
          videoData = resolved.videos[0];
        } else if (surl && resolved?.partial_metadata?.title) {
          videoData = {
            title: resolved.partial_metadata.title,
            size: resolved.partial_metadata.size || 0,
            stream_url: "",
            thumbnailUrl: resolved.partial_metadata.thumbnailUrl || "",
          };
        } else {
          return new Response("OK", { status: 200 });
        }

        const title = videoData.title || "TeraBox Video";
        const sizeFormatted = videoData.size ? formatBytes(videoData.size) : "";
        const streamUrl = videoData.stream_url || "";
        const thumbUrl = videoData.thumbnailUrl || "";

        const playerParams = new URLSearchParams();
        if (surl) {
          playerParams.set("v", surl);
        } else {
          playerParams.set("stream", streamUrl);
          playerParams.set("title", title);
        }
        if (dirPath) playerParams.set("path", dirPath);
        if (Array.isArray(resolved?.videos) && resolved.videos.length > 1) {
          playerParams.set("list", "1");
        }
        playerParams.set("tg", "1");
        const shortPlayerUrl = `${playerBase}/?${playerParams.toString()}`;

        const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const totalCount = Array.isArray(resolved?.videos) ? resolved.videos.length : 1;
        const cleanTitle = escapeHtml((totalCount > 1 ? `[${totalCount} Videos] ${title}` : title).slice(0, 120));
        const sizeLabel = escapeHtml(
          sizeFormatted && sizeFormatted !== "HD Stream" && sizeFormatted !== "0 B" && sizeFormatted !== "Unknown Size"
            ? sizeFormatted
            : (videoData.quality || "HD Stream")
        );
        const caption = `🎬 <b>${cleanTitle}</b>\n\n📦 <b>Size:</b> ${sizeLabel}`;

        const dlParams = new URLSearchParams();
        if (dirPath) dlParams.set("path", dirPath);
        const dlQuery = dlParams.toString();
        const downloadTarget = surl
          ? `${url.origin}/dl/${encodeURIComponent(surl)}${dlQuery ? "?" + dlQuery : ""}`
          : `${url.origin}/?url=${encodeURIComponent(streamUrl)}&dl=1&filename=${encodeURIComponent(title)}`;

        const replyMarkup = {
          inline_keyboard: [
            [{ text: totalCount > 1 ? `🟢 ▶️ WATCH PLAYLIST (${totalCount} VIDEOS) 🍿` : "🟢 ▶️ WATCH ONLINE (FULL HD) 🍿", url: shortPlayerUrl }],
            [{ text: "⚡ 📥 FAST DIRECT DOWNLOAD 🚀", url: downloadTarget }],
          ],
        };

        try {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, message_id: msg.message_id }),
          });
        } catch (e) {}

        let published = false;
        // Upload real thumbnail binary via FormData (bypasses Telegram >1KB URL & host block issues)
        if (thumbUrl && thumbUrl.startsWith("http") && isAllowedProxyUrl(thumbUrl)) {
          try {
            const { referer } = getContextualHeaders(thumbUrl);
            const imgResp = await fetchWithTimeout(
              thumbUrl,
              {
                headers: {
                  "User-Agent": DEFAULT_UA,
                  "Referer": referer,
                  "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                },
              },
              8000
            );
            if (imgResp.ok) {
              const imgBlob = await imgResp.blob();
              if (imgBlob.size > 500 && imgBlob.size <= 8 * 1024 * 1024) {
                const form = new FormData();
                form.append("chat_id", String(chatId));
                form.append("caption", caption);
                form.append("parse_mode", "HTML");
                form.append("reply_markup", JSON.stringify(replyMarkup));
                form.append("photo", imgBlob, "preview.jpg");
                const upResp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                  method: "POST",
                  body: form,
                });
                const upData = await upResp.json();
                if (upData.ok) published = true;
              }
            }
          } catch (e) {}
        }

        if (!published) {
          try {
            const fbResp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                photo: DEFAULT_POSTER,
                caption: caption,
                parse_mode: "HTML",
                reply_markup: replyMarkup,
              }),
            });
            const fbData = await fbResp.json();
            if (fbData.ok) published = true;
          } catch (e) {}
        }

        if (!published) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: caption,
              parse_mode: "HTML",
              reply_markup: replyMarkup,
            }),
          });
        }

        return new Response("OK", { status: 200 });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 4. Video Stream, Thumbnail & HLS Proxy (/?url=...)
    let targetUrl = url.searchParams.get("url");
    const b64Url = url.searchParams.get("b64");

    if (!targetUrl && b64Url) {
      try {
        const normalizedB64 = b64Url.replace(/-/g, "+").replace(/_/g, "/");
        targetUrl = atob(normalizedB64);
      } catch (e) {
        return new Response("Invalid base64 URL parameter", { status: 400 });
      }
    }

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' query parameter. Usage: /?url=<stream_url>" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (!isAllowedProxyUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ error: "Access Denied: Requested domain is not permitted by proxy allowlist." }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    try {
      const forceDl = url.searchParams.get("dl") === "1";
      const customFn = url.searchParams.get("filename") || "";
      return await serveProxiedMedia(request, url.origin, targetUrl, forceDl, customFn);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Gateway Stream Error", message: err.message }),
        {
          status: 502,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
          },
        }
      );
    }
  },

  async scheduled(event, env, ctx) {
    const renderUrl = env.RENDER_URL || "https://teravidsplay.onrender.com";
    try {
      await fetch(renderUrl, { headers: { "User-Agent": "TeravidsPlay-KeepAlive/2027" } });
    } catch (e) {}
  },
};
