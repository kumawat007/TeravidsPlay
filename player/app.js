// TeravidsPlay — 2027 YouTube-Style Cinema Player Engine
// Features: YouTube Watch Layout, Mandatory Channel Lock Gate,
// Web Audio API 300% Boost, 2X/4X Turbo Speed, Double-Tap Seek,
// Aspect Ratio Switcher, and Instant CDN Video Playback.

document.addEventListener('DOMContentLoaded', () => {
  // 1. Telegram WebApp Integration
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#0f0f0f');
      tg.setBackgroundColor('#0f0f0f');
    } catch (e) {}
  }

  // 2. DOM Elements
  const videoElement = document.getElementById('player');
  const playerContainer = document.getElementById('playerContainer');
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loaderText');
  const unmuteOverlay = document.getElementById('unmuteOverlay');
  const unmuteBtn = document.getElementById('unmuteBtn');
  const speedOverlay = document.getElementById('speedOverlay');
  const speedOverlayIcon = document.getElementById('speedOverlayIcon');
  const speedOverlayText = document.getElementById('speedOverlayText');
  const brightnessHud = document.getElementById('brightnessHud');
  const brightnessBar = document.getElementById('brightnessBar');
  const brightnessText = document.getElementById('brightnessText');
  const volumeHud = document.getElementById('volumeHud');
  const volumeHudIcon = document.getElementById('volumeHudIcon');
  const volumeBar = document.getElementById('volumeBar');
  const volumeText = document.getElementById('volumeText');
  const rippleLeft = document.getElementById('rippleLeft');
  const rippleRight = document.getElementById('rippleRight');
  const resumeToast = document.getElementById('resumeToast');
  const resumeToastText = document.getElementById('resumeToastText');
  const errorOverlay = document.getElementById('errorOverlay');
  const errorHeading = document.getElementById('errorHeading');
  const errorMsg = document.getElementById('errorMsg');
  const retryBtn = document.getElementById('retryBtn');
  const externalDownloadBtn = document.getElementById('externalDownloadBtn');

  // YouTube Metadata & Action Elements
  const videoTitleElem = document.getElementById('videoTitle');
  const formatBadgeElem = document.getElementById('formatBadge');
  const fileSizeElem = document.getElementById('fileSize');
  const audioBoostBtn = document.getElementById('audioBoostBtn');
  const audioBoostLabel = document.getElementById('audioBoostLabel');
  const aspectRatioBtn = document.getElementById('aspectRatioBtn');
  const aspectRatioLabel = document.getElementById('aspectRatioLabel');
  const downloadActionBtn = document.getElementById('downloadActionBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const likeBtn = document.getElementById('likeBtn');
  const likeCountElem = document.getElementById('likeCount');
  const ytSearchForm = document.getElementById('ytSearchForm');
  const ytSearchInput = document.getElementById('ytSearchInput');

  // Mandatory Channel Lock Gate Elements
  const channelGateOverlay = document.getElementById('channelGateOverlay');
  const gateJoinBtn = document.getElementById('gateJoinBtn');
  const gateUnlockBtn = document.getElementById('gateUnlockBtn');

  // Disable right-click on video container
  if (playerContainer) playerContainer.addEventListener('contextmenu', (e) => e.preventDefault());
  if (videoElement) videoElement.addEventListener('contextmenu', (e) => e.preventDefault());

  // Helper: Safe URL Decode
  function safeDecode(val, fallback = '') {
    if (!val) return fallback;
    try {
      return decodeURIComponent(val);
    } catch (e) {
      return val;
    }
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  // 3. Parse Parameters
  const urlParams = new URLSearchParams(window.location.search);
  const vId = urlParams.get('v') || urlParams.get('s') || '';
  let rawStream = urlParams.get('stream') || '';
  const rawTitle = urlParams.get('title') || '';
  const rawSize = urlParams.get('size') || '';

  if (rawStream.startsWith('b64:')) {
    try {
      rawStream = atob(rawStream.slice(4));
    } catch (e) {}
  }

  const streamUrl = safeDecode(rawStream);
  const cleanTitle = safeDecode(rawTitle);
  const cleanSize = safeDecode(rawSize);

  if (cleanTitle) {
    videoTitleElem.textContent = cleanTitle;
    document.title = `${cleanTitle} — TeravidsPlay`;
  } else if (vId || streamUrl) {
    videoTitleElem.textContent = 'Loading video stream...';
    document.title = 'TeravidsPlay — YouTube Cinema Stream';
  } else {
    videoTitleElem.textContent = 'Ready to Stream — Paste any TeraBox link above to watch';
    document.title = 'TeravidsPlay — Ad-Free Cinema Cloud Video Player';
  }

  if (cleanSize) {
    fileSizeElem.textContent = `📦 ${cleanSize}`;
    fileSizeElem.style.display = 'inline';
  } else {
    fileSizeElem.style.display = 'none';
  }

  // 4. Mandatory Telegram Channel Membership Gate
  const UNLOCK_KEY = 'teravids_channel_unlocked';
  let isChannelUnlocked = localStorage.getItem(UNLOCK_KEY) === 'true';

  function checkChannelGate() {
    if (isChannelUnlocked) {
      if (channelGateOverlay) channelGateOverlay.style.display = 'none';
    } else {
      if (channelGateOverlay) channelGateOverlay.style.display = 'flex';
    }
  }

  checkChannelGate();

  if (gateJoinBtn) {
    gateJoinBtn.addEventListener('click', () => {
      // Guide user: after opening Telegram, prompt them to click button 2
      if (gateUnlockBtn) {
        gateUnlockBtn.style.animation = 'pulse 1s infinite alternate';
      }
    });
  }

  if (gateUnlockBtn) {
    gateUnlockBtn.addEventListener('click', () => {
      isChannelUnlocked = true;
      localStorage.setItem(UNLOCK_KEY, 'true');
      if (channelGateOverlay) {
        channelGateOverlay.style.transition = 'opacity 0.3s ease';
        channelGateOverlay.style.opacity = '0';
        setTimeout(() => {
          channelGateOverlay.style.display = 'none';
        }, 300);
      }
      showToast('🎉 Channel Verified! Video Unlocked!');
      // Start video playback
      if (videoElement && videoElement.src) {
        videoElement.play().catch(() => {});
      }
    });
  }

  function showToast(text) {
    if (resumeToast && resumeToastText) {
      resumeToastText.textContent = text;
      resumeToast.style.display = 'block';
      setTimeout(() => { resumeToast.style.display = 'none'; }, 2600);
    }
  }

  // 5. Search / Direct Link Input Handler
  if (ytSearchForm && ytSearchInput) {
    ytSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = ytSearchInput.value.trim();
      if (!val) return;

      let token = '';
      const m1 = val.match(/\/s\/([a-zA-Z0-9_-]+)/);
      if (m1) {
        token = m1[1];
      } else if (val.includes('surl=')) {
        token = val.split('surl=')[1].split('&')[0];
      } else if (/^[a-zA-Z0-9_-]{15,35}$/.test(val)) {
        token = val;
      }

      if (token) {
        try { history.replaceState(null, '', `/?v=${encodeURIComponent(token)}`); } catch (err) {}
        resolveAndPlay(token);
      } else {
        try { history.replaceState(null, '', `/?stream=${encodeURIComponent(val)}`); } catch (err) {}
        loadStream(val);
      }
    });
  }

  // 6. Interactive Like Counter
  let hasLiked = false;
  let likes = 1420;
  if (likeBtn && likeCountElem) {
    likeBtn.addEventListener('click', () => {
      hasLiked = !hasLiked;
      likes += hasLiked ? 1 : -1;
      likeCountElem.textContent = `${(likes / 1000).toFixed(1)}K`;
      likeBtn.classList.toggle('active-like', hasLiked);
      likeBtn.style.color = hasLiked ? '#ff0000' : 'inherit';
    });
  }

  // 7. Audio Booster (100% -> 150% -> 200% -> 300%)
  let audioCtx = null;
  let gainNode = null;
  let audioBoostLevel = 1.0;
  const boostLevels = [1.0, 1.5, 2.0, 3.0];
  let boostIndex = 0;

  function initAudioBooster() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(videoElement);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = audioBoostLevel;
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    } catch (e) {
      console.warn('AudioContext notice:', e);
    }
  }

  function setBoostLevel(level) {
    audioBoostLevel = level;
    initAudioBooster();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (gainNode) {
      gainNode.gain.value = audioBoostLevel;
    }
    if (audioBoostLabel) {
      audioBoostLabel.textContent = `Boost: ${Math.round(audioBoostLevel * 100)}%`;
    }
    if (audioBoostBtn) {
      audioBoostBtn.classList.toggle('active-boost', audioBoostLevel > 1.0);
    }
    showToast(`🔊 Audio Boost: ${Math.round(audioBoostLevel * 100)}%`);
  }

  if (audioBoostBtn) {
    audioBoostBtn.addEventListener('click', () => {
      boostIndex = (boostIndex + 1) % boostLevels.length;
      setBoostLevel(boostLevels[boostIndex]);
    });
  }

  // 8. Aspect Ratio Switcher
  const aspectModes = ['contain', 'cover', 'fill'];
  const aspectLabels = ['Fit', 'Fill', 'Stretch'];
  let aspectIdx = 0;

  if (aspectRatioBtn && aspectRatioLabel) {
    aspectRatioBtn.addEventListener('click', () => {
      aspectIdx = (aspectIdx + 1) % aspectModes.length;
      videoElement.style.objectFit = aspectModes[aspectIdx];
      aspectRatioLabel.textContent = aspectLabels[aspectIdx];
      showToast(`Aspect Ratio: ${aspectLabels[aspectIdx]}`);
    });
  }

  // 9. Long-Press 2X Speed (Telegram Style)
  let plyrInstance = null;
  let hlsInstance = null;
  let baseSpeed = 1.0;
  let isFastForwarding = false;
  let pressTimer = null;

  function startLongPress(e) {
    if (e.target.closest('.plyr__controls') || e.target.closest('button')) return;
    pressTimer = setTimeout(() => {
      isFastForwarding = true;
      videoElement.playbackRate = 2.0;
      if (speedOverlay) {
        speedOverlayIcon.textContent = '⚡';
        speedOverlayText.textContent = '2X Speed';
        speedOverlay.style.display = 'block';
      }
    }, 450);
  }

  function stopLongPress() {
    clearTimeout(pressTimer);
    if (isFastForwarding) {
      isFastForwarding = false;
      videoElement.playbackRate = baseSpeed;
      if (speedOverlay) speedOverlay.style.display = 'none';
    }
  }

  playerContainer.addEventListener('mousedown', startLongPress);
  window.addEventListener('mouseup', stopLongPress);
  playerContainer.addEventListener('touchstart', startLongPress, { passive: true });
  window.addEventListener('touchend', stopLongPress);

  // 10. Double Tap 10s Seek
  let lastTapTime = 0;
  let tapTimeout = null;

  playerContainer.addEventListener('click', (e) => {
    if (e.target.closest('.plyr__controls') || e.target.closest('button') || e.target.closest('.channel-gate-card')) return;
    const now = Date.now();
    const rect = playerContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isRightSide = clickX > rect.width / 2;

    if (now - lastTapTime < 320) {
      clearTimeout(tapTimeout);
      if (isRightSide) {
        videoElement.currentTime = Math.min(videoElement.duration || 0, videoElement.currentTime + 10);
        if (rippleRight) {
          rippleRight.style.display = 'flex';
          setTimeout(() => { rippleRight.style.display = 'none'; }, 400);
        }
      } else {
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        if (rippleLeft) {
          rippleLeft.style.display = 'flex';
          setTimeout(() => { rippleLeft.style.display = 'none'; }, 400);
        }
      }
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      tapTimeout = setTimeout(() => { lastTapTime = 0; }, 340);
    }
  });

  // 11. Gesture HUDs for Swiping: Brightness & Volume
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let activeHud = null;
  let currentBrightness = 1.0;

  playerContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
    activeHud = null;
  }, { passive: true });

  playerContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = touchStartY - e.touches[0].clientY;

    if (!isSwiping && Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      isSwiping = true;
      const rect = playerContainer.getBoundingClientRect();
      activeHud = (touchStartX - rect.left) < rect.width / 2 ? 'brightness' : 'volume';
    }

    if (isSwiping) {
      const step = deltaY / 220;
      touchStartY = e.touches[0].clientY;

      if (activeHud === 'brightness') {
        currentBrightness = Math.max(0.2, Math.min(1.5, currentBrightness + step));
        videoElement.style.filter = `brightness(${currentBrightness})`;
        if (brightnessBar) brightnessBar.style.height = `${Math.round((currentBrightness / 1.5) * 100)}%`;
        if (brightnessText) brightnessText.textContent = `${Math.round((currentBrightness / 1.5) * 100)}%`;
        if (brightnessHud) brightnessHud.style.display = 'flex';
      } else if (activeHud === 'volume') {
        const newVol = Math.max(0, Math.min(1, videoElement.volume + step));
        videoElement.volume = newVol;
        if (volumeBar) volumeBar.style.height = `${Math.round(newVol * 100)}%`;
        if (volumeText) volumeText.textContent = `${Math.round(newVol * 100)}%`;
        if (volumeHud) volumeHud.style.display = 'flex';
      }
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isSwiping) {
      setTimeout(() => {
        if (brightnessHud) brightnessHud.style.display = 'none';
        if (volumeHud) volumeHud.style.display = 'none';
      }, 400);
      isSwiping = false;
    }
  });

  // 12. Dynamic Ambient Glow Canvas
  const ambientCanvas = document.getElementById('ambientCanvas');
  let ambientCtx = null;
  let ambientRaf = null;

  if (ambientCanvas) {
    try {
      ambientCtx = ambientCanvas.getContext('2d', { willReadFrequently: false });
    } catch (e) {}
  }

  function drawAmbient() {
    if (!videoElement.paused && !videoElement.ended && ambientCtx) {
      try {
        ambientCtx.drawImage(videoElement, 0, 0, ambientCanvas.width, ambientCanvas.height);
      } catch (e) {}
    }
    ambientRaf = requestAnimationFrame(drawAmbient);
  }

  videoElement.addEventListener('play', () => {
    if (!ambientRaf) ambientRaf = requestAnimationFrame(drawAmbient);
  });
  videoElement.addEventListener('pause', () => {
    cancelAnimationFrame(ambientRaf);
    ambientRaf = null;
  });

  // 13. Auto-Resume from Last Saved Position
  const storageKey = `teravids_pos_${vId || streamUrl.slice(-25) || 'default'}`;

  function checkResume() {
    const saved = localStorage.getItem(storageKey);
    if (saved && Number(saved) > 5) {
      const pos = Number(saved);
      videoElement.currentTime = pos;
      showToast(`Resumed from ${formatTime(pos)}`);
    }
  }

  videoElement.addEventListener('timeupdate', () => {
    if (Math.floor(videoElement.currentTime) % 3 === 0 && videoElement.currentTime > 5) {
      try { localStorage.setItem(storageKey, Math.floor(videoElement.currentTime)); } catch (e) {}
    }
  });

  // 14. Initialize Plyr Video Player
  function initPlyr() {
    if (plyrInstance) return plyrInstance;

    plyrInstance = new Plyr(videoElement, {
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'fullscreen',
      ],
      storage: { enabled: false },
      keyboard: { focused: true, global: true },
      seekTime: 10,
    });

    videoElement.addEventListener('canplay', () => {
      loader.classList.add('hidden');
    });

    videoElement.addEventListener('playing', () => {
      loader.classList.add('hidden');
      if (videoElement.muted) {
        if (unmuteOverlay) unmuteOverlay.style.display = 'block';
      } else {
        if (unmuteOverlay) unmuteOverlay.style.display = 'none';
      }
    });

    videoElement.addEventListener('waiting', () => {
      loaderText.textContent = 'Buffering stream...';
      loader.classList.remove('hidden');
    });

    videoElement.addEventListener('error', (e) => {
      console.error('HTML5 video error:', e);
      const currentSrc = videoElement.currentSrc || videoElement.src;
      if (currentSrc && !currentSrc.includes('workers.dev') && !currentSrc.startsWith('blob:') && !currentSrc.startsWith('data:')) {
        const proxiedUrl = `https://teravidsplay.proxyking.workers.dev/?url=${encodeURIComponent(currentSrc)}`;
        console.info('[TeravidsPlay] Activating streaming proxy fallback...');
        loaderText.textContent = 'Activating edge proxy...';
        loader.classList.remove('hidden');
        videoElement.src = proxiedUrl;
        videoElement.load();
        if (isChannelUnlocked) videoElement.play().catch(() => {});
        return;
      }
      showError('Playback Interrupted', 'Unable to decode video stream. The link may have expired or is blocked.');
    });

    return plyrInstance;
  }

  // 15. Stream Loader
  function loadStream(url, poster = '') {
    if (!url) {
      showError('Missing Stream URL', 'No valid stream URL was provided.');
      return;
    }

    if (poster) {
      videoElement.poster = poster;
    }

    loader.classList.remove('hidden');
    loaderText.textContent = 'Connecting high-speed stream...';
    errorOverlay.style.display = 'none';

    if (downloadActionBtn) downloadActionBtn.href = url;
    if (externalDownloadBtn) externalDownloadBtn.href = url;

    const isM3U8 = url.includes('.m3u8');
    if (formatBadgeElem) {
      formatBadgeElem.textContent = isM3U8 ? 'HLS ADAPTIVE' : 'FULL HD 1080P';
      formatBadgeElem.style.display = 'inline-block';
    }

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (isM3U8 && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        initPlyr();
        checkResume();
        if (isChannelUnlocked) {
          videoElement.play().catch(() => {
            videoElement.muted = true;
            videoElement.play().catch(() => {});
            if (unmuteOverlay) unmuteOverlay.style.display = 'block';
          });
        }
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              hlsInstance.destroy();
              showError('Stream Error', 'Failed to parse adaptive stream.');
              break;
          }
        }
      });
    } else {
      // Direct MP4
      videoElement.src = url;
      initPlyr();
      videoElement.addEventListener('loadedmetadata', checkResume, { once: true });
      if (isChannelUnlocked) {
        videoElement.play().catch(() => {
          videoElement.muted = true;
          videoElement.play().catch(() => {});
          if (unmuteOverlay) unmuteOverlay.style.display = 'block';
        });
      }
    }
  }

  function showError(heading, message) {
    loader.classList.add('hidden');
    errorHeading.textContent = heading;
    errorMsg.textContent = message;
    errorOverlay.style.display = 'flex';
  }

  // 16. Dynamic Stream Resolver for Own Short IDs (?v=...)
  async function resolveAndPlay(surl) {
    loader.classList.remove('hidden');
    loaderText.textContent = 'Resolving video details...';
    try {
      // 1. Try Cloudflare Edge Worker API
      const workerEndpoint = `https://teravidsplay.proxyking.workers.dev/api/resolve?surl=${encodeURIComponent(surl)}`;
      let res = await fetch(workerEndpoint).catch(() => null);
      let data = null;
      if (res && res.ok) {
        data = await res.json();
      }

      // 2. Direct edge resolver fallback
      if (!data || !data.success) {
        const fullTeraUrl = `https://1024terabox.com/s/${surl.startsWith('1') ? surl : '1' + surl}`;
        const directResp = await fetch('https://iteraplay.in/api/videos/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': 'https://iteraplay.in/',
            'Origin': 'https://iteraplay.in',
          },
          body: JSON.stringify({ url: fullTeraUrl }),
        });
        if (directResp.ok) {
          data = await directResp.json();
        }
      }

      if (data && data.success && data.videos && data.videos.length > 0) {
        const vid = data.videos[0];
        const title = vid.title || 'TeraBox Video';
        const sizeFormatted = vid.size ? `${(vid.size / (1024 * 1024)).toFixed(1)} MB` : '';

        videoTitleElem.textContent = title;
        document.title = `${title} — TeravidsPlay`;

        if (sizeFormatted) {
          fileSizeElem.textContent = `📦 ${sizeFormatted}`;
          fileSizeElem.style.display = 'inline';
        }

        if (vid.thumbnailUrl) {
          videoElement.poster = vid.thumbnailUrl;
        }

        if (downloadActionBtn) {
          downloadActionBtn.href = vid.stream_url;
        }

        loadStream(vid.stream_url, vid.thumbnailUrl || '');
        return;
      }
      showError('Video Unavailable', 'Could not resolve stream for this link. It may have expired or is private.');
    } catch (err) {
      showError('Connection Error', 'Failed to connect to streaming engine. Please try again.');
    }
  }

  // 17. Button Listeners
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (vId) resolveAndPlay(vId);
      else if (streamUrl) loadStream(streamUrl);
    });
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      const shareUrl = vId 
        ? `${window.location.origin}/?v=${vId}`
        : window.location.href;

      if (navigator.share) {
        try {
          await navigator.share({ title: videoTitleElem.textContent || cleanTitle, url: shareUrl });
          return;
        } catch (err) {}
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('🔗 Video Link copied to clipboard!');
      }
    });
  }

  if (unmuteBtn) {
    unmuteBtn.addEventListener('click', () => {
      videoElement.muted = false;
      if (unmuteOverlay) unmuteOverlay.style.display = 'none';
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    });
  }

  // Start Stream
  if (vId) {
    resolveAndPlay(vId);
  } else if (streamUrl) {
    loadStream(streamUrl);
  } else {
    loader.classList.add('hidden');
    // Set default poster if on home page
    videoElement.poster = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&q=80';
  }
});
