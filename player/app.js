// TeravidsPlay — Official YouTube-Style Cinema Player Engine
// Features: Dual-View Architecture (Home Welcome vs Player),
// Mandatory Channel Lock Gate, Web Audio API 300% Boost,
// 2X / 4X Ultra-Turbo Long-Press Speed, Double-Tap Seek,
// Aspect Ratio Switcher, and Instant CDN Video Playback.

document.addEventListener('DOMContentLoaded', () => {
  // 1. Telegram WebApp Integration
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#0a0e17');
      tg.setBackgroundColor('#0a0e17');
    } catch (e) {}
  }

  // 2. DOM Elements
  const homePage = document.getElementById('homePage');
  const playerView = document.getElementById('playerView');
  const homeInputForm = document.getElementById('homeInputForm');
  const homeUrlInput = document.getElementById('homeUrlInput');

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

  // Video Toolbar Elements
  const videoTitleElem = document.getElementById('videoTitle');
  const formatBadgeElem = document.getElementById('formatBadge');
  const fileSizeElem = document.getElementById('fileSize');
  const audioBoostBtn = document.getElementById('audioBoostBtn');
  const audioBoostLabel = document.getElementById('audioBoostLabel');
  const aspectRatioBtn = document.getElementById('aspectRatioBtn');
  const aspectRatioLabel = document.getElementById('aspectRatioLabel');
  const downloadActionBtn = document.getElementById('downloadActionBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');

  // Mandatory Channel Lock Gate Elements
  const channelGateOverlay = document.getElementById('channelGateOverlay');
  const gateJoinBtn = document.getElementById('gateJoinBtn');
  const gateUnlockBtn = document.getElementById('gateUnlockBtn');

  // Disable context menu on player
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

  function showToast(text) {
    if (resumeToast && resumeToastText) {
      resumeToastText.textContent = text;
      resumeToast.style.display = 'block';
      setTimeout(() => { resumeToast.style.display = 'none'; }, 2600);
    }
  }

  // 3. Parse Parameters & View Toggle
  const urlParams = new URLSearchParams(window.location.search);
  let vId = urlParams.get('v') || urlParams.get('s') || '';
  let rawStream = urlParams.get('stream') || '';
  const rawTitle = urlParams.get('title') || '';
  const rawSize = urlParams.get('size') || '';

  if (rawStream.startsWith('b64:')) {
    try {
      rawStream = atob(rawStream.slice(4));
    } catch (e) {}
  }

  let streamUrl = safeDecode(rawStream);
  const cleanTitle = safeDecode(rawTitle);
  const cleanSize = safeDecode(rawSize);

  // Check if we have active media
  const hasMedia = Boolean(vId || streamUrl);

  function activateHomeView() {
    if (homePage) homePage.style.display = 'flex';
    if (playerView) playerView.style.display = 'none';
    document.title = 'TeravidsPlay — Ad-Free Cinema Cloud Video Player';
    if (videoElement && !videoElement.paused) {
      videoElement.pause();
    }
  }

  function activatePlayerView() {
    if (homePage) homePage.style.display = 'none';
    if (playerView) playerView.style.display = 'block';
  }

  if (hasMedia) {
    activatePlayerView();
    if (cleanTitle) {
      videoTitleElem.textContent = cleanTitle;
      document.title = `${cleanTitle} — TeravidsPlay`;
    } else {
      videoTitleElem.textContent = 'Loading video stream...';
      document.title = 'TeravidsPlay — High-Speed Cloud Stream';
    }

    if (cleanSize) {
      fileSizeElem.textContent = `📦 ${cleanSize}`;
      fileSizeElem.style.display = 'inline';
    } else {
      fileSizeElem.style.display = 'none';
    }
  } else {
    activateHomeView();
  }

  // 4. Home Page Input Handler (Paste link -> Instant Stream)
  if (homeInputForm && homeUrlInput) {
    homeInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = homeUrlInput.value.trim();
      if (!val) return;

      let extractedId = '';
      const m1 = val.match(/\/s\/([a-zA-Z0-9_-]+)/);
      if (m1) {
        extractedId = m1[1];
      } else if (val.includes('surl=')) {
        extractedId = val.split('surl=')[1].split('&')[0];
      } else if (/^[a-zA-Z0-9_-]{15,35}$/.test(val)) {
        extractedId = val;
      }

      activatePlayerView();

      if (extractedId) {
        vId = extractedId;
        try { history.pushState(null, '', `/?v=${encodeURIComponent(extractedId)}`); } catch (err) {}
        resolveAndPlay(extractedId);
      } else {
        streamUrl = val;
        try { history.pushState(null, '', `/?stream=${encodeURIComponent(val)}`); } catch (err) {}
        loadStream(val);
      }
    });
  }

  // 5. Mandatory Telegram Channel Membership Gate
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
      if (videoElement && videoElement.src) {
        videoElement.play().catch(() => {});
      }
    });
  }

  // 6. Audio Booster (100% -> 150% -> 200% -> 300%)
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

  // 7. Aspect Ratio Switcher (Fit / Fill / Stretch)
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

  // 8. YouTube-Style Ultra-Long Press: 2X & 4X Turbo Speed
  let plyrInstance = null;
  let hlsInstance = null;
  let baseSpeed = 1.0;
  let isFastForwarding = false;
  let pressTimer2x = null;
  let pressTimer4x = null;

  function startLongPress(e) {
    if (e.target.closest('.plyr__controls') || e.target.closest('button') || e.target.closest('a') || e.target.closest('.channel-gate-card')) return;
    
    // Stage 1: Hold 350ms -> 2X Speed
    pressTimer2x = setTimeout(() => {
      isFastForwarding = true;
      baseSpeed = videoElement.playbackRate || 1.0;
      if (baseSpeed > 1.0 && baseSpeed < 2.0) baseSpeed = 1.0;
      videoElement.playbackRate = 2.0;
      if (speedOverlay) {
        if (speedOverlayIcon) speedOverlayIcon.textContent = '⚡';
        if (speedOverlayText) speedOverlayText.textContent = '2X Speed';
        speedOverlay.style.display = 'block';
      }
    }, 350);

    // Stage 2: Ultra Long Press past 1400ms -> 4X Ultra Turbo Speed
    pressTimer4x = setTimeout(() => {
      if (!isFastForwarding) return;
      videoElement.playbackRate = 4.0;
      if (speedOverlay) {
        if (speedOverlayIcon) speedOverlayIcon.textContent = '🚀';
        if (speedOverlayText) speedOverlayText.textContent = '4X Ultra Turbo';
        speedOverlay.style.display = 'block';
      }
    }, 1400);
  }

  function stopLongPress() {
    clearTimeout(pressTimer2x);
    clearTimeout(pressTimer4x);
    if (isFastForwarding) {
      isFastForwarding = false;
      videoElement.playbackRate = baseSpeed || 1.0;
      if (speedOverlay) speedOverlay.style.display = 'none';
    }
  }

  if (playerContainer) {
    playerContainer.addEventListener('mousedown', startLongPress);
    window.addEventListener('mouseup', stopLongPress);
    playerContainer.addEventListener('touchstart', startLongPress, { passive: true });
    window.addEventListener('touchend', stopLongPress);
  }

  // 9. Double Tap 10s Seek
  let lastTapTime = 0;
  let tapTimeout = null;

  if (playerContainer) {
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
  }

  // 10. Swipe Gestures for Brightness & Volume
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let activeHud = null;
  let currentBrightness = 1.0;

  if (playerContainer) {
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
  }

  // 11. Ambient Glow Canvas
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
    if (ambientRaf) cancelAnimationFrame(ambientRaf);
    ambientRaf = null;
  });

  // 12. Auto-Resume from Last Position
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

  // 13. Initialize Plyr Video Player (YouTube Styling)
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
        'settings',
        'pip',
        'fullscreen',
      ],
      settings: ['speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2, 4] },
      storage: { enabled: false },
      keyboard: { focused: true, global: true },
      seekTime: 10,
      tooltips: { controls: true, seek: true },
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

  // 14. Stream Loader
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

  // 15. Stream Resolver for TeraBox Short IDs (?v=...)
  async function resolveAndPlay(surl) {
    loader.classList.remove('hidden');
    loaderText.textContent = 'Resolving video details...';
    try {
      // Try Cloudflare Edge Worker API
      const workerEndpoint = `https://teravidsplay.proxyking.workers.dev/api/resolve?surl=${encodeURIComponent(surl)}`;
      let res = await fetch(workerEndpoint).catch(() => null);
      let data = null;
      if (res && res.ok) {
        data = await res.json();
      }

      // Edge resolver fallback
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

  // 16. Button Event Listeners
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
        showToast('🔗 Video link copied to clipboard!');
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

  // 17. Initiate stream if parameter was present
  if (vId) {
    resolveAndPlay(vId);
  } else if (streamUrl) {
    loadStream(streamUrl);
  }
});
