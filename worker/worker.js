/**
 * TeravidsPlay — Production Cloudflare Worker: Streaming Proxy + 24/7 Serverless Telegram Bot
 * 
 * Capabilities:
 * 1. 24/7 Serverless Telegram Webhook Bot (/webhook): Runs 100% free on Cloudflare edge.
 *    No local PC or server required! Automatically processes TeraBox links in channels & DMs.
 * 2. High-Speed Byte-Range Streaming Proxy (/?url=...): Full 206 Partial Content, CORS *,
 *    and dynamic HLS M3U8 rewriting for seamless video playback.
 * 3. Built-in URL Shortener proxy & health diagnostics (/health).
 */

const DEFAULT_PLAYER_URL = "https://teravidsplayer.vercel.app";

// Strictly allowed TeraBox domains & CDN hosts (SSRF & Open-Proxy Prevention)
const ALLOWED_TERABOX_HOSTS = [
  "terabox.com", "terabox.app", "teraboxapp.com",
  "1024tera.com", "1024terabox.com", "4funbox.com",
  "mirrobox.com", "nephobox.com", "freeterabox.com",
  "teraboxlink.com", "tibibox.com", "momerybox.com",
  "terasharelink.com", "baidupcs.com", "tribox.com",
  "dubox.com", "bdydns.com", "baidu.com", "teraboxcdn.com",
  "iteraplay.in", "iteraplay.com", "playterabox.com", "cloudflarestorage.com",
  "qzz.io", "cdniteraplay.qzz.io"
];

function isAllowedProxyUrl(urlString) {
  if (!urlString) return false;
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const hostname = u.hostname.toLowerCase();
    
    // Disallow IP addresses & localhost / internal metadata to prevent SSRF
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === "localhost" || hostname.includes("[")) {
      return false;
    }
    
    return ALLOWED_TERABOX_HOSTS.some(allowed => hostname === allowed || hostname.endsWith("." + allowed));
  } catch (e) {
    return false;
  }
}

function isTeraBoxUrl(text) {
  return isAllowedProxyUrl(text);
}

function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/);
  return match ? match[0].replace(/[).,;:!?'"]+$/, "") : null;
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

async function shortenUrl(longUrl) {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, {
      cf: { cacheTtl: 86400 }
    });
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith("http")) return text.trim();
    }
  } catch (e) {}
  return longUrl;
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
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type, Authorization, User-Agent, Accept",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. Health Check
    if (url.pathname === "/" && !url.searchParams.has("url") && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "TeravidsPlay Edge Streaming & 24/7 Webhook Engine",
          timestamp: new Date().toISOString(),
          webhook_endpoint: `${url.origin}/webhook`,
          resolve_endpoint: `${url.origin}/api/resolve?surl=<token>`,
        }, null, 2),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2.1 Own Short URL Redirect Endpoint (/v/:id or /s/:id)
    if (url.pathname.startsWith("/v/") || url.pathname.startsWith("/s/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const surl = parts[1] || "";
      const search = url.search ? (url.search.includes("tg=") ? url.search : url.search + "&tg=1") : "?tg=1";
      return Response.redirect(`${playerBase}/?v=${surl}${search.replace('?', '&')}`, 302);
    }

    // 2.2 High-Speed Metadata & Stream Resolution API (/api/resolve?surl=...)
    if (url.pathname === "/api/resolve") {
      const surl = url.searchParams.get("surl") || url.searchParams.get("s") || url.searchParams.get("url") || "";
      if (!surl) {
        return new Response(JSON.stringify({ success: false, message: "Missing surl parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      let cleanToken = surl.replace(/^.*\/s\//, "").replace("surl=", "").trim();
      if (cleanToken.includes("?")) cleanToken = cleanToken.split("?")[0];
      if (cleanToken.includes("&")) cleanToken = cleanToken.split("&")[0];
      const formattedToken = cleanToken.startsWith("1") ? cleanToken : "1" + cleanToken;

      const candidates = [
        `https://terabox.com/s/${formattedToken}`,
        `https://1024terabox.com/s/${formattedToken}`,
        `https://teraboxapp.com/s/${formattedToken}`
      ];
      if (surl.startsWith("http") && !candidates.includes(surl)) {
        candidates.push(surl);
      }

      const debugLogs = [];
      for (const candidate of candidates) {
        try {
          const resolveResp = await fetch("https://iteraplay.in/api/videos/import", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Referer": "https://iteraplay.in/",
              "Origin": "https://iteraplay.in"
            },
            body: JSON.stringify({ url: candidate })
          });

          const respText = await resolveResp.text();
          debugLogs.push({ candidate, status: resolveResp.status, body: respText.slice(0, 200) });

          if (resolveResp.ok) {
            try {
              const data = JSON.parse(respText);
              if (data && data.success && data.videos && data.videos.length > 0) {
                return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
              }
            } catch (e) {}
          }
        } catch (err) {
          debugLogs.push({ candidate, error: err.message });
        }
      }

      // Secondary Fallback: Query TeraBox shorturlinfo directly
      const cleanToken = surl.replace(/^.*\/s\//, "").replace("surl=", "").replace(/^1/, "");
      try {
        const infoResp = await fetch(`https://1024terabox.com/api/shorturlinfo?shorturl=${cleanToken}&root=1`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://1024terabox.com/",
            "Accept": "application/json"
          }
        });
        if (infoResp.ok) {
          const infoData = await infoResp.json();
          if (infoData.list && infoData.list.length > 0) {
            const item = infoData.list[0];
            return new Response(JSON.stringify({
              success: true,
              videos: [{
                title: item.server_filename || "TeraBox Video",
                size: item.size || 0,
                thumbnailUrl: item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || "",
                stream_url: item.dlink || ""
              }]
            }), {
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
          }
        }
      } catch (e) {}

      return new Response(JSON.stringify({ success: false, message: "Stream extraction failed", debug: debugLogs }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 3. 24/7 Serverless Telegram Bot Webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        // Security Check: Verify Telegram Secret Token if WEBHOOK_SECRET is set
        const webhookSecret = env.WEBHOOK_SECRET;
        if (webhookSecret) {
          const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
          if (secretHeader !== webhookSecret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        // Deployment Conflict Guard: Only process updates if Worker Bot is explicitly active
        // Prevents 409 conflict when Render polling bot is the primary runner
        const isWorkerBotActive = env.ENABLE_WORKER_BOT === "true" || !!webhookSecret;
        if (!isWorkerBotActive) {
          return new Response(JSON.stringify({
            status: "inactive",
            message: "Worker webhook is inactive. Polling mode is running on Render. Set ENABLE_WORKER_BOT=true to enable."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        const update = await request.json();
        const msg = update.message || update.channel_post || update.edited_message || update.edited_channel_post;

        if (!msg) {
          return new Response("OK", { status: 200 });
        }

        const chatId = msg.chat?.id;
        const rawText = msg.text || msg.caption || "";
        const extracted = extractFirstUrl(rawText);

        if (!extracted || !isTeraBoxUrl(extracted)) {
          return new Response("OK", { status: 200 });
        }

        // Silent direct resolution: No waiting message in channel or chat
        let waitingMsgId = null;

        // Resolve stream via High-Speed Edge Engine with candidate fallbacks
        let videoData = null;
        const surlExtract = extracted.match(/\/s\/([a-zA-Z0-9_-]+)/);
        const rawToken = surlExtract ? surlExtract[1] : "";
        const formattedWebhookToken = rawToken ? (rawToken.startsWith("1") ? rawToken : "1" + rawToken) : "";
        
        const webhookCandidates = [extracted];
        if (formattedWebhookToken) {
          webhookCandidates.push(`https://1024terabox.com/s/${formattedWebhookToken}`);
          webhookCandidates.push(`https://terabox.com/s/${formattedWebhookToken}`);
        }

        for (const candidate of webhookCandidates) {
          try {
            const resolveResp = await fetch("https://iteraplay.in/api/videos/import", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://iteraplay.in/",
                "Origin": "https://iteraplay.in"
              },
              body: JSON.stringify({ url: candidate })
            });

            if (resolveResp.ok) {
              const data = await resolveResp.json();
              if (data && data.success && data.videos && data.videos.length > 0) {
                videoData = data.videos[0];
                break;
              }
            }
          } catch (e) {}
        }

        const surl = rawToken || "";
        if (!videoData || !videoData.stream_url) {
          if (surl) {
            // Client-Side Web Player Fallback: Browser resolves stream directly via mobile/residential network
            videoData = {
              title: "TeraBox Video Stream",
              size: 0,
              quality: "HD 1080p",
              stream_url: "",
              thumbnailUrl: null,
            };
          } else {
            // Resolution failed and no surl token
            if (waitingMsgId) {
              await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: waitingMsgId,
                  text: "❌ <b>Stream Extraction Failed:</b>\nThe link may have expired or is private.",
                  parse_mode: "HTML"
                })
              });
            }
            return new Response("OK", { status: 200 });
          }
        }

        const title = videoData.title || "TeraBox Video Stream";
        const sizeFormatted = videoData.size ? formatBytes(videoData.size) : "";
        const quality = videoData.quality || "HD 1080p";
        const streamUrl = videoData.stream_url || "";
        const thumbUrl = videoData.thumbnailUrl;

        // Build 100% OWN BRAND Short Web Player URL with auto-unlock & metadata
        const encodedTitle = encodeURIComponent(title || "");
        const encodedSize = encodeURIComponent(sizeFormatted || "");
        const encodedThumb = thumbUrl && thumbUrl.startsWith("http") ? encodeURIComponent(thumbUrl) : "";
        
        let playerParams = surl ? [`v=${surl}`, "tg=1"] : [`stream=${encodeURIComponent(streamUrl)}`, "tg=1"];
        if (encodedTitle) playerParams.push(`title=${encodedTitle}`);
        if (encodedSize) playerParams.push(`size=${encodedSize}`);
        if (encodedThumb) playerParams.push(`thumb=${encodedThumb}`);
        const otherParams = playerParams.filter(p => !p.startsWith('v='));
        const shortPlayerUrl = surl 
          ? `${playerBase}/v/${surl}?${otherParams.join("&")}` 
          : `${playerBase}/?${playerParams.join("&")}`;

        const cleanTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 120);
        const sizeLabel = (sizeFormatted && sizeFormatted !== "HD Stream" && sizeFormatted !== "0 B" && sizeFormatted !== "Unknown Size") 
          ? sizeFormatted 
          : "1080p HD";
        const caption = `🎬 <b>${cleanTitle}</b>\n\n📦 <b>Size:</b> ${sizeLabel}`;

        const downloadTarget = streamUrl || (shortPlayerUrl.includes("?") ? `${shortPlayerUrl}&dl=1` : `${shortPlayerUrl}?dl=1`);
        const replyMarkup = {
          inline_keyboard: [
            [{ text: "🟢 ▶️ WATCH ONLINE (FULL HD) 🍿", url: shortPlayerUrl }],
            [{ text: "⚡ 📥 FAST DIRECT DOWNLOAD 🚀", url: downloadTarget }]
          ]
        };

        // 1. Delete original raw link post
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, message_id: msg.message_id })
          });
        } catch (e) {}

        // 2. Delete temporary waiting message
        if (waitingMsgId) {
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, message_id: waitingMsgId })
            });
          } catch (e) {}
        }

        // 3. Publish card with guaranteed photo preview
        const defaultPoster = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80";
        const photoTarget = (thumbUrl && thumbUrl.startsWith("http")) ? thumbUrl : defaultPoster;
        let published = false;

        try {
          const photoResp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              photo: photoTarget,
              caption: caption,
              parse_mode: "HTML",
              reply_markup: replyMarkup
            })
          });
          const photoData = await photoResp.json();
          if (photoData.ok) published = true;
        } catch (e) {}

        if (!published && photoTarget !== defaultPoster) {
          try {
            const fbResp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                photo: defaultPoster,
                caption: caption,
                parse_mode: "HTML",
                reply_markup: replyMarkup
              })
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
              reply_markup: replyMarkup
            })
          });
        }

        return new Response("OK", { status: 200 });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // 4. Video Stream & HLS Proxy (/?url=...)
    let targetUrl = url.searchParams.get("url");
    const b64Url = url.searchParams.get("b64");

    if (!targetUrl && b64Url) {
      try {
        targetUrl = atob(b64Url);
      } catch (e) {
        return new Response("Invalid base64 URL parameter", { status: 400 });
      }
    }

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' query parameter. Usage: /?url=<stream_url>" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // SSRF & Open-Proxy Guard: Strictly restrict proxying to verified TeraBox CDN domains
    if (!isAllowedProxyUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ error: "Access Denied: Requested domain is not permitted by proxy allowlist." }),
        { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    try {
      const upstreamHeaders = new Headers();
      const range = request.headers.get("Range");
      if (range) upstreamHeaders.set("Range", range);

      upstreamHeaders.set(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      );
      upstreamHeaders.set("Referer", "https://www.terabox.com/");
      upstreamHeaders.set("Origin", "https://www.terabox.com");
      upstreamHeaders.set("Accept", "*/*");
      upstreamHeaders.set("Connection", "keep-alive");

      let currentUrl = targetUrl;
      let redirectCount = 0;
      const maxRedirects = 5;
      let upstreamResponse = null;

      while (redirectCount < maxRedirects) {
        upstreamResponse = await fetch(currentUrl, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: upstreamHeaders,
          redirect: "manual",
        });

        if ([301, 302, 303, 307, 308].includes(upstreamResponse.status)) {
          const location = upstreamResponse.headers.get("Location");
          if (!location) break;
          const nextUrl = new URL(location, currentUrl).toString();

          // Security Guard: Verify destination domain on every redirect hop
          if (!isAllowedProxyUrl(nextUrl)) {
            const nextHost = new URL(nextUrl).hostname.toLowerCase();
            const isSubCdn = ALLOWED_TERABOX_HOSTS.some(allowed => nextHost.endsWith(allowed)) || nextHost.includes("terabox") || nextHost.includes("baidu");
            if (!isSubCdn) {
              return new Response(
                JSON.stringify({ error: "Access Denied: Redirected domain is not permitted." }),
                { status: 403, headers: { "Content-Type": "application/json" } }
              );
            }
          }

          currentUrl = nextUrl;
          redirectCount++;
          continue;
        }
        break;
      }

      const contentType = upstreamResponse.headers.get("Content-Type") || "";
      const isM3U8 =
        currentUrl.includes(".m3u8") ||
        contentType.includes("application/vnd.apple.mpegurl") ||
        contentType.includes("application/x-mpegurl");

      // HLS Playlist Rewriter
      if (isM3U8 && upstreamResponse.status === 200) {
        const originalText = await upstreamResponse.text();
        const lines = originalText.split("\n");
        const rewritten = lines.map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            if (trimmed.startsWith("#EXT-X-KEY") || trimmed.startsWith("#EXT-X-MAP")) {
              return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
                const absolute = new URL(uri, currentUrl).toString();
                return `URI="${url.origin}/?url=${encodeURIComponent(absolute)}"`;
              });
            }
            return line;
          }

          try {
            const absoluteSegment = new URL(trimmed, currentUrl).toString();
            return `${url.origin}/?url=${encodeURIComponent(absoluteSegment)}`;
          } catch (e) {
            return line;
          }
        });

        return new Response(rewritten.join("\n"), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      // Direct MP4 / Binary Chunk Stream
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type, User-Agent, Accept");
      responseHeaders.set(
        "Access-Control-Expose-Headers",
        "Content-Range, Content-Length, Accept-Ranges, Content-Type"
      );
      responseHeaders.set("Accept-Ranges", "bytes");

      if (!responseHeaders.get("Content-Type") || responseHeaders.get("Content-Type") === "application/octet-stream") {
        responseHeaders.set("Content-Type", "video/mp4");
      }

      responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Gateway Stream Error", message: err.message }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },

  async scheduled(event, env, ctx) {
    // 24/7 Free Keep-Alive ping to Render web service every 10 minutes
    const renderUrl = env.RENDER_URL || "https://teravidsplay.onrender.com";
    try {
      await fetch(renderUrl, { headers: { "User-Agent": "TeravidsPlay-KeepAlive/2027" } });
    } catch (e) {}
  },
};