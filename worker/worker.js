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

const TERABOX_DOMAINS = [
  "terabox.com", "terabox.app", "teraboxapp.com",
  "1024tera.com", "1024terabox.com", "4funbox.com",
  "mirrobox.com", "nephobox.com", "freeterabox.com",
  "teraboxlink.com", "tibibox.com", "momerybox.com"
];

function isTeraBoxUrl(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return TERABOX_DOMAINS.some(d => lower.includes(d));
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
      return Response.redirect(`${playerBase}/?v=${surl}`, 302);
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

      const formattedToken = surl.startsWith("http") ? "" : (surl.startsWith("1") ? surl : "1" + surl);
      const candidates = surl.startsWith("http")
        ? [surl]
        : [
            `https://1024terabox.com/s/${formattedToken}`,
            `https://terabox.com/s/${formattedToken}`,
            `https://teraboxapp.com/s/${formattedToken}`
          ];

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

          if (resolveResp.ok) {
            const data = await resolveResp.json();
            if (data && data.success && data.videos && data.videos.length > 0) {
              return new Response(JSON.stringify(data), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
              });
            }
          }
        } catch (err) {}
      }

      return new Response(JSON.stringify({ success: false, message: "Stream extraction failed across all candidate endpoints" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 3. 24/7 Serverless Telegram Bot Webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
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

        // Send temporary waiting message in channel or chat
        let waitingMsgId = null;
        try {
          const waitResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "⚡ <b>Analyzing TeraBox video...</b>\n<i>Generating high-speed stream & web player...</i>",
              parse_mode: "HTML"
            }),
          });
          const waitData = await waitResp.json();
          if (waitData.ok) waitingMsgId = waitData.result.message_id;
        } catch (e) {}

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

        if (!videoData || !videoData.stream_url) {
          // Resolution failed
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

        const title = videoData.title || "TeraBox Video";
        const sizeFormatted = formatBytes(videoData.size);
        const quality = videoData.quality || "HD";
        const streamUrl = videoData.stream_url;
        const thumbUrl = videoData.thumbnailUrl;

        // Build 100% OWN BRAND Short Web Player URL
        const surlMatch = extracted.match(/\/s\/([a-zA-Z0-9_-]+)/);
        const surl = surlMatch ? surlMatch[1] : "";
        const shortPlayerUrl = surl 
          ? `${playerBase}/?v=${surl}` 
          : `${playerBase}/?stream=${encodeURIComponent(streamUrl)}&title=${encodeURIComponent(title)}&size=${encodeURIComponent(sizeFormatted)}`;

        const caption = `🎬 <b>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b>\n\n` +
          `📦 <b>Size:</b> ${sizeFormatted} | <b>Quality:</b> ${quality}\n` +
          `⚡ <b>Playback:</b> Instant Stream (Zero Ads)\n` +
          `🔗 <b>Watch Link:</b> ${shortPlayerUrl}\n\n` +
          `👇 <i>Tap below to watch online inside Telegram:</i>`;

        const replyMarkup = {
          inline_keyboard: [
            [{ text: "▶️ Watch in Telegram", url: shortPlayerUrl }],
            [{ text: "📥 Direct Download", url: streamUrl }]
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

        // 3. Publish card with photo or text fallback
        let published = false;
        if (thumbUrl && thumbUrl.startsWith("http")) {
          try {
            const photoResp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                photo: thumbUrl,
                caption: caption,
                parse_mode: "HTML",
                reply_markup: replyMarkup
              })
            });
            const photoData = await photoResp.json();
            if (photoData.ok) published = true;
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
          currentUrl = new URL(location, currentUrl).toString();
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
};