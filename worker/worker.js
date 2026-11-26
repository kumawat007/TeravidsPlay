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
 * Extracts the first TeraBox or shortener URL from text AND Telegram entities.
 */
function extractTeraBoxUrl(msg) {
  const candidates = [];
  const rawText = msg.text || msg.caption || "";
  const rawMatches = rawText.match(/https?:\/\/[^\s<>"']+/g) || [];
  for (const m of rawMatches) {
    candidates.push(m.replace(/[).,;:!?'"]+$/, ""));
  }

  const entities = [...(msg.entities || []), ...(msg.caption_entities || [])];
  for (const ent of entities) {
    if (ent && ent.url) {
      candidates.push(ent.url.trim());
    }
  }

  for (const cand of candidates) {
    if (isTeraBoxOrShortenerUrl(cand)) {
      return cand;
    }
  }
  return null;
}

/**
 * Expands allowed URL shorteners safely (up to 5 hops, validating every target host).
 */
async function expandShortUrl(rawUrl) {
  let current = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    if (!isShortenerUrl(current)) break;
    try {
      const resp = await fetch(current, {
        method: "HEAD",
        headers: { "User-Agent": DEFAULT_UA },
        redirect: "manual",
      });
      let loc = resp.headers.get("Location");
      if (!loc && (resp.status === 405 || resp.status >= 400)) {
        const getResp = await fetch(current, {
          method: "GET",
          headers: { "User-Agent": DEFAULT_UA },
          redirect: "manual",
        });
        loc = getResp.headers.get("Location");
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

/**
 * Extracts raw token and normalized TeraBox share (/s/1...) + shorturl (?surl=...) forms.
 * Preserves legitimate leading '1's in 22-char shorturl tokens.
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

  let shareToken;
  let shortToken;
  if (cameFromQuery) {
    shortToken = rawToken;
    shareToken = rawToken.length >= 23 && rawToken.startsWith("1") ? rawToken : "1" + rawToken;
  } else if (cameFromPath) {
    shareToken = rawToken.startsWith("1") ? rawToken : "1" + rawToken;
    shortToken = rawToken.startsWith("1") && rawToken.length > 21 ? rawToken.slice(1) : rawToken;
  } else {
    // Bare token passed in ?v= or ?surl=
    if (rawToken.startsWith("1") && rawToken.length >= 23) {
      shareToken = rawToken;
      shortToken = rawToken.slice(1);
    } else if (!rawToken.startsWith("1")) {
      shareToken = "1" + rawToken;
      shortToken = rawToken;
    } else {
      shareToken = rawToken;
      shortToken = rawToken.slice(1);
    }
  }

  return { rawToken, shareToken, shortToken };
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
      host.includes("iteraplay")
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
  const base = (name || "video.mp4").replace(/[\r\n"\\/:*?<>|]+/g, "_").trim();
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
  const playable = videos.filter((v) => v && (v.stream_url || v.original_quality_url || v.fast_stream_url || v.hls_url));
  if (playable.length === 0) return videos[0];
  if (playable.length === 1) return playable[0];
  return playable.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0];
}

/**
 * Queries www.terabox.app directly using sharing/link + share/list (no login required for metadata & thumbnails).
 */
async function resolveViaTeraBoxApp(shortToken) {
  if (!shortToken) return null;
  try {
    const pageUrl = `https://www.terabox.app/sharing/link?surl=${encodeURIComponent(shortToken)}`;
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent": DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!pageResp.ok) return null;

    const setCookie = pageResp.headers.get("set-cookie") || "";
    const html = await pageResp.text();

    let jsToken = "";
    const fnEncodedMatch = html.match(/fn%28%22([^%"]+)%22%29/);
    const fnPlainMatch = html.match(/fn\("([^"]+)"\)/);
    if (fnEncodedMatch) jsToken = fnEncodedMatch[1];
    else if (fnPlainMatch) jsToken = fnPlainMatch[1];

    let logId = "";
    const logMatch = (html + pageResp.url).match(/dp-logid=([^&"'\s]+)/);
    if (logMatch) logId = logMatch[1];

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
      if (setCookie) {
        const cookiePairs = setCookie
          .split(/,(?=\s*[^;,\s]+=)/)
          .map((c) => c.split(";")[0].trim())
          .filter(Boolean);
        if (cookiePairs.length) listHeaders["Cookie"] = cookiePairs.join("; ");
      }

      const listResp = await fetch(`https://www.terabox.app/share/list?${qs.toString()}`, {
        headers: listHeaders,
      });
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

/**
 * Shared stream & metadata resolver used by /api/resolve, /dl/:surl, and /webhook.
 */
async function resolveTeraBoxStream(surlOrUrl) {
  const expanded = isShortenerUrl(surlOrUrl) ? await expandShortUrl(surlOrUrl) : surlOrUrl;
  const tokens = parseSurlTokens(expanded) || parseSurlTokens(surlOrUrl);
  if (!tokens) {
    return { success: false, message: "Invalid TeraBox link or token", debug: [] };
  }

  const { shareToken, shortToken } = tokens;
  const candidates = [];
  if (/^https?:\/\//i.test(expanded) && isAllowedProxyUrl(expanded)) {
    candidates.push(expanded);
  }
  const defaults = [
    `https://terabox.com/s/${shareToken}`,
    `https://1024terabox.com/s/${shareToken}`,
    `https://teraboxapp.com/s/${shareToken}`,
    `https://www.terabox.app/sharing/link?surl=${shortToken}`,
  ];
  for (const d of defaults) {
    if (!candidates.includes(d)) candidates.push(d);
  }

  const debugLogs = [];
  let iteraplayBlocked = false;

  // 1. Primary Engine: iTeraPlay Import API
  for (const candidate of candidates) {
    if (iteraplayBlocked) break;
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
      });

      const respText = await resolveResp.text();
      debugLogs.push({ candidate, status: resolveResp.status, body: respText.slice(0, 200) });

      if (resolveResp.ok) {
        try {
          const data = JSON.parse(respText);
          if (data && data.success && Array.isArray(data.videos) && data.videos.length > 0) {
            const best = pickFirstPlayableVideo(data.videos);
            // Enrich thumbnail from terabox.app if iteraplay returned none
            if (best && !best.thumbnailUrl) {
              const meta = await resolveViaTeraBoxApp(shortToken);
              if (meta && meta.thumbnailUrl) best.thumbnailUrl = meta.thumbnailUrl;
            }
            if (best && best !== data.videos[0]) {
              data.videos = [best, ...data.videos.filter((v) => v !== best)];
            }
            return { ...data, surl: shareToken };
          }
          if (data && (data.status === "captcha_required" || data.status === "rate_limited")) {
            iteraplayBlocked = true;
          }
        } catch (e) {}
      } else if (resolveResp.status === 429 || resolveResp.status === 403) {
        iteraplayBlocked = true;
      }
    } catch (err) {
      debugLogs.push({ candidate, error: err.message });
    }
  }

  // 2. Secondary Fallback: terabox.app sharing/link + share/list
  const tbAppMeta = await resolveViaTeraBoxApp(shortToken);
  if (tbAppMeta && tbAppMeta.stream_url) {
    return {
      success: true,
      surl: shareToken,
      videos: [tbAppMeta],
    };
  }

  // 3. Tertiary Fallback: 1024terabox shorturlinfo
  try {
    const infoResp = await fetch(
      `https://1024terabox.com/api/shorturlinfo?shorturl=${encodeURIComponent(shortToken)}&root=1`,
      {
        headers: {
          "User-Agent": DEFAULT_UA,
          "Referer": "https://1024terabox.com/",
          "Accept": "application/json",
        },
      }
    );
    if (infoResp.ok) {
      const infoData = await infoResp.json();
      if (Array.isArray(infoData.list) && infoData.list.length > 0) {
        const item = pickBestMediaItem(infoData.list);
        if (item && item.dlink) {
          return {
            success: true,
            surl: shareToken,
            videos: [
              {
                title: item.server_filename || "TeraBox Video",
                size: Number(item.size || 0),
                thumbnailUrl:
                  item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || tbAppMeta?.thumbnailUrl || "",
                stream_url: item.dlink,
              },
            ],
          };
        }
      }
    }
  } catch (e) {}

  return {
    success: false,
    surl: shareToken,
    message: "Stream extraction failed",
    partial_metadata: tbAppMeta
      ? {
          title: tbAppMeta.title,
          size: tbAppMeta.size,
          thumbnailUrl: tbAppMeta.thumbnailUrl,
        }
      : null,
    debug: debugLogs,
  };
}

/**
 * Fetches upstream response while enforcing SSRF allowlist on all redirect hops.
 */
async function fetchAllowedUpstream(targetUrl, method = "GET", rangeHeader = null) {
  const upstreamHeaders = new Headers();
  if (rangeHeader) upstreamHeaders.set("Range", rangeHeader);

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
    upstreamResponse = await fetch(currentUrl, {
      method: method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "manual",
    });

    if ([301, 302, 303, 307, 308].includes(upstreamResponse.status)) {
      const location = upstreamResponse.headers.get("Location");
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

  const contentType = (upstreamResponse.headers.get("Content-Type") || "").toLowerCase();
  const isM3U8 =
    finalUrl.includes(".m3u8") ||
    finalUrl.includes("/hls?") ||
    contentType.includes("application/vnd.apple.mpegurl") ||
    contentType.includes("application/x-mpegurl");

  // HLS Playlist Rewriter
  if (isM3U8 && upstreamResponse.status === 200) {
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
          return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
            try {
              const absolute = new URL(uri, finalUrl).toString();
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
    responseHeaders.set("Content-Disposition", `attachment; filename="${safeName}"`);
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

    // 2.2 Permanent Direct Download Endpoint (/dl/:id)
    if (url.pathname.startsWith("/dl/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const surl = parts[1] || url.searchParams.get("surl") || url.searchParams.get("v") || "";
      if (!surl) {
        return new Response(JSON.stringify({ error: "Missing video token" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const resolved = await resolveTeraBoxStream(surl);
      if (resolved && resolved.success && Array.isArray(resolved.videos) && resolved.videos.length > 0) {
        const vid = resolved.videos[0];
        const dlTarget = vid.original_quality_url || vid.stream_url;
        const fn = url.searchParams.get("fn") || vid.title || `TeravidsPlay_${surl}.mp4`;
        if (dlTarget && isAllowedProxyUrl(dlTarget)) {
          try {
            return await serveProxiedMedia(request, url.origin, dlTarget, true, fn);
          } catch (e) {}
        }
      }
      return Response.redirect(`${playerBase}/?v=${encodeURIComponent(surl)}&tg=1&dl=1`, 302);
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

      const result = await resolveTeraBoxStream(surl);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 404,
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

        if (!msg) {
          return new Response("OK", { status: 200 });
        }

        const chatId = msg.chat?.id;
        const extracted = extractTeraBoxUrl(msg);
        if (!extracted) {
          return new Response("OK", { status: 200 });
        }

        const resolved = await resolveTeraBoxStream(extracted);
        const tokens = parseSurlTokens(extracted);
        const surl = resolved?.surl || tokens?.shareToken || "";

        let videoData = null;
        if (resolved?.success && Array.isArray(resolved.videos) && resolved.videos.length > 0) {
          videoData = resolved.videos[0];
        } else if (surl) {
          videoData = {
            title: resolved?.partial_metadata?.title || "TeraBox Video Stream",
            size: resolved?.partial_metadata?.size || 0,
            stream_url: "",
            thumbnailUrl: resolved?.partial_metadata?.thumbnailUrl || "",
          };
        } else {
          return new Response("OK", { status: 200 });
        }

        const title = videoData.title || "TeraBox Video Stream";
        const sizeFormatted = videoData.size ? formatBytes(videoData.size) : "";
        const streamUrl = videoData.stream_url || "";
        const thumbUrl = videoData.thumbnailUrl || "";

        const shortPlayerUrl = surl
          ? `${playerBase}/?v=${encodeURIComponent(surl)}&tg=1`
          : `${playerBase}/?stream=${encodeURIComponent(streamUrl)}&tg=1&title=${encodeURIComponent(title)}`;

        const cleanTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 120);
        const sizeLabel =
          sizeFormatted && sizeFormatted !== "HD Stream" && sizeFormatted !== "0 B" && sizeFormatted !== "Unknown Size"
            ? sizeFormatted
            : "1080p HD";
        const caption = `🎬 <b>${cleanTitle}</b>\n\n📦 <b>Size:</b> ${sizeLabel}`;

        const downloadTarget = surl
          ? `${url.origin}/dl/${encodeURIComponent(surl)}`
          : `${url.origin}/?url=${encodeURIComponent(streamUrl)}&dl=1&filename=${encodeURIComponent(title)}`;

        const replyMarkup = {
          inline_keyboard: [
            [{ text: "🟢 ▶️ WATCH ONLINE (FULL HD) 🍿", url: shortPlayerUrl }],
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
        if (thumbUrl && thumbUrl.startsWith("http")) {
          try {
            const { referer } = getContextualHeaders(thumbUrl);
            const imgResp = await fetch(thumbUrl, {
              headers: {
                "User-Agent": DEFAULT_UA,
                "Referer": referer,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              },
            });
            if (imgResp.ok) {
              const imgBlob = await imgResp.blob();
              if (imgBlob.size > 500) {
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
