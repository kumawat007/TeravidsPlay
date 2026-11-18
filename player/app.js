// TeravidsPlay — 2026 TOP-MOST Mobile & Desktop Video Player Engine
// Features: Long-press 2x/4x, Double-tap seek, Swipe Brightness & Volume HUDs,
// Screen Lock, Web Audio API 300% Boost, Audio Unmute Guard, Auto-Resume,
// Aspect Ratio Switcher, Sleep Timer, and Settings Bottom Sheet.

document.addEventListener('DOMContentLoaded', () => {
  // 1. Telegram WebApp Integration & Viewport
  const tg = window.Telegram?.WebApp;
  function updateViewport() {
    if (tg) {
      tg.ready();
      tg.expand();
      const height = tg.viewportHeight ? `${tg.viewportHeight}px` : '100vh';
      document.documentElement.style.setProperty('--app-height', height);
      try {
        tg.setHeaderColor('#ffffff');
        tg.setBackgroundColor('#f8fafc');
      } catch (e) {}
    } else {
      document.documentElement.style.setProperty('--app-height', '100vh');
    }
  }

  updateViewport();
  if (tg) {
    tg.onEvent('viewportChanged', updateViewport);
  }

  // 2. DOM Elements
  const playerApp = document.getElementById('playerApp');
  const playerContainer = document.getElementById('playerContainer');
  const videoElement = document.getElementById('player');
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loaderText');
  const unmuteOverlay = document.getElementById('unmuteOverlay');
  const unmuteBtn = document.getElementById('unmuteBtn');
  const screenLockBtn = document.getElementById('screenLockBtn');
  const screenUnlockBtn = document.getElementById('screenUnlockBtn');
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
  const videoTitleElem = document.getElementById('videoTitle');
  const fileSizeElem = document.getElementById('fileSize');
  const formatBadgeElem = document.getElementById('formatBadge');
  const audioBoostBtn = document.getElementById('audioBoostBtn');
  const audioBoostLabel = document.getElementById('audioBoostLabel');
  const aspectRatioBtn = document.getElementById('aspectRatioBtn');
  const aspectRatioLabel = document.getElementById('aspectRatioLabel');
  const settingsSheetBtn = document.getElementById('settingsSheetBtn');
  const speedDisplayLabel = document.getElementById('speedDisplayLabel');
  const settingsSheet = document.getElementById('settingsSheet');
  const settingsBackdrop = document.getElementById('settingsBackdrop');
  const closeSheetBtn = document.getElementById('closeSheetBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const pipBtn = document.getElementById('pipBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');

  // Disable right-click globally on video viewport
  playerContainer.addEventListener('contextmenu', (e) => e.preventDefault());
  videoElement.addEventListener('contextmenu', (e) => e.preventDefault());

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
    videoTitleElem.textContent = 'Playing Stream...';
    document.title = 'TeravidsPlay — Streaming';
  } else {
    videoTitleElem.textContent = 'Ready to Stream';
    document.title = 'TeravidsPlay — Ad-Free Cinema Cloud Video Player';
  }

  if (cleanSize) {
    fileSizeElem.textContent = cleanSize;
    fileSizeElem.style.display = 'inline-flex';
  } else {
    fileSizeElem.style.display = 'none';
  }

  // Welcome portal elements
  const welcomeOverlay = document.getElementById('welcomeOverlay');
  const portalForm = document.getElementById('portalForm');
  const portalUrlInput = document.getElementById('portalUrlInput');

  function showWelcomePortal() {
    loader.classList.add('hidden');
    errorOverlay.style.display = 'none';
    if (welcomeOverlay) welcomeOverlay.style.display = 'flex';
  }

  function hideWelcomePortal() {
    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
  }

  if (portalForm && portalUrlInput) {
    portalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = portalUrlInput.value.trim();
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
        hideWelcomePortal();
        try { history.replaceState(null, '', `/?v=${encodeURIComponent(token)}`); } catch (err) {}
        resolveAndPlay(token);
      } else {
        hideWelcomePortal();
        try { history.replaceState(null, '', `/?stream=${encodeURIComponent(val)}`); } catch (err) {}
        loadStream(val);
      }
    });
  }

  let plyrInstance = null;
  let hlsInstance = null;
  let baseSpeed = 1.0;
  let isScreenLocked = false;

  // 4. Audio Engine & Unmute Guard
  videoElement.muted = false;
  videoElement.volume = 1.0;

  function ensureUnmuted() {
    videoElement.muted = false;
    unmuteOverlay.style.display = 'none';
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  unmuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureUnmuted();
  });

  // 5. Web Audio API Booster (100% -> 150% -> 200% -> 300%)
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
      console.warn('AudioContext init notice:', e);
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
    audioBoostLabel.textContent = `Boost: ${Math.round(audioBoostLevel * 100)}%`;
    if (audioBoostLevel > 1.0) {
      audioBoostBtn.classList.add('active-boost');
    } else {
      audioBoostBtn.classList.remove('active-boost');
    }
    // Update pill in settings sheet
    document.querySelectorAll('#boostPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.boost) === level);
    });
  }

  audioBoostBtn.addEventListener('click', () => {
    boostIndex = (boostIndex + 1) % boostLevels.length;
    setBoostLevel(boostLevels[boostIndex]);
  });

  // 6. Granular Speed Selector & Long Press
  function setPlaybackSpeed(speed) {
    baseSpeed = speed;
    videoElement.playbackRate = baseSpeed;
    speedDisplayLabel.textContent = `${baseSpeed}x`;
    document.querySelectorAll('#speedPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });
  }

  let pressTimer = null;
  let isFastForwarding = false;
  let turboInterval = null;

  function startLongPress(e) {
    if (isScreenLocked) return;
    if (e.target.closest('.plyr__controls') || e.target.closest('button') || e.target.closest('.settings-sheet')) return;

    pressTimer = setTimeout(() => {
      isFastForwarding = true;
      videoElement.playbackRate = 2.0;
      speedOverlayIcon.textContent = '⚡';
      speedOverlayText.textContent = '2X Speed';
      speedOverlay.style.display = 'block';

      // Ultra-long press (>1200ms) elevates to 4X Turbo
      turboInterval = setTimeout(() => {
        if (isFastForwarding) {
          videoElement.playbackRate = 4.0;
          speedOverlayIcon.textContent = '🚀';
          speedOverlayText.textContent = '4X Turbo';
        }
      }, 1000);
    }, 220);
  }

  function endLongPress() {
    clearTimeout(pressTimer);
    clearTimeout(turboInterval);
    if (isFastForwarding) {
      isFastForwarding = false;
      videoElement.playbackRate = baseSpeed;
      speedOverlay.style.display = 'none';
    }
  }

  playerContainer.addEventListener('mousedown', startLongPress);
  window.addEventListener('mouseup', endLongPress);
  playerContainer.addEventListener('touchstart', startLongPress, { passive: true });
  window.addEventListener('touchend', endLongPress);
  window.addEventListener('touchcancel', endLongPress);

  // 7. Double-Tap 10s Seek & Vertical Swipe Gestures (Brightness / Volume)
  let lastTapTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let isVerticalSwiping = false;
  let swipeType = null; // 'brightness' or 'volume'
  let currentBrightness = 1.0;

  playerContainer.addEventListener('touchstart', (e) => {
    if (isScreenLocked || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isVerticalSwiping = false;
    const rect = playerContainer.getBoundingClientRect();
    swipeType = (touchStartX - rect.left < rect.width * 0.5) ? 'brightness' : 'volume';
  }, { passive: true });

  playerContainer.addEventListener('touchmove', (e) => {
    if (isScreenLocked || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touchStartY - touch.clientY;
    const deltaX = Math.abs(touch.clientX - touchStartX);

    if (Math.abs(deltaY) > 20 && deltaX < 35) {
      isVerticalSwiping = true;
      clearTimeout(pressTimer); // Cancel long-press if swiping vertically

      if (swipeType === 'brightness') {
        currentBrightness = Math.min(1.5, Math.max(0.3, currentBrightness + (deltaY > 0 ? 0.02 : -0.02)));
        videoElement.style.filter = `brightness(${currentBrightness})`;
        const pct = Math.round((currentBrightness / 1.5) * 100);
        brightnessBar.style.height = `${pct}%`;
        brightnessText.textContent = `${pct}%`;
        brightnessHud.style.display = 'flex';
      } else if (swipeType === 'volume') {
        const newVol = Math.min(1.0, Math.max(0.0, videoElement.volume + (deltaY > 0 ? 0.03 : -0.03)));
        videoElement.volume = newVol;
        if (newVol > 0) videoElement.muted = false;
        const pct = Math.round(newVol * 100);
        volumeBar.style.height = `${pct}%`;
        volumeText.textContent = `${pct}%`;
        volumeHudIcon.textContent = newVol === 0 ? '🔇' : (newVol < 0.5 ? '🔉' : '🔊');
        volumeHud.style.display = 'flex';
      }
      touchStartY = touch.clientY; // Reset baseline
    }
  }, { passive: true });

  playerContainer.addEventListener('touchend', (e) => {
    if (isScreenLocked) return;

    if (isVerticalSwiping) {
      setTimeout(() => {
        brightnessHud.style.display = 'none';
        volumeHud.style.display = 'none';
      }, 500);
      isVerticalSwiping = false;
      return;
    }

    // Double-tap seek
    const currentTime = Date.now();
    const tapLength = currentTime - lastTapTime;
    if (tapLength < 280 && tapLength > 50 && e.changedTouches && e.changedTouches[0]) {
      const touch = e.changedTouches[0];
      const rect = playerContainer.getBoundingClientRect();
      const clickX = touch.clientX - rect.left;

      if (clickX < rect.width * 0.4) {
        // Left side: -10s
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        rippleLeft.style.display = 'flex';
        setTimeout(() => { rippleLeft.style.display = 'none'; }, 600);
      } else if (clickX > rect.width * 0.6) {
        // Right side: +10s
        videoElement.currentTime = Math.min(videoElement.duration || 99999, videoElement.currentTime + 10);
        rippleRight.style.display = 'flex';
        setTimeout(() => { rippleRight.style.display = 'none'; }, 600);
      }
    }
    lastTapTime = currentTime;
  });

  // 8. Screen Touch Lock
  function toggleScreenLock() {
    isScreenLocked = !isScreenLocked;
    if (isScreenLocked) {
      screenLockBtn.classList.add('active-lock');
      screenUnlockBtn.style.display = 'flex';
      playerApp.classList.add('ui-hidden');
    } else {
      screenLockBtn.classList.remove('active-lock');
      screenUnlockBtn.style.display = 'none';
      playerApp.classList.remove('ui-hidden');
    }
  }

  screenLockBtn.addEventListener('click', toggleScreenLock);
  screenUnlockBtn.addEventListener('click', toggleScreenLock);

  // 9. Aspect Ratio Switcher (contain -> cinemascope -> cover -> fill)
  const aspectModes = ['contain', 'cinemascope', 'cover', 'fill'];
  const aspectLabels = { contain: 'Fit', cinemascope: '21:9 Cinema', cover: 'Zoom', fill: 'Stretch' };
  let currentAspectIdx = 0;

  function setAspectRatio(mode) {
    if (mode === 'cinemascope') {
      videoElement.style.objectFit = 'cover';
      videoElement.style.transform = 'scaleY(1.18)';
    } else {
      videoElement.style.transform = 'none';
      videoElement.style.objectFit = mode;
    }
    aspectRatioLabel.textContent = aspectLabels[mode] || 'Fit';
    document.querySelectorAll('#aspectPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aspect === mode);
    });
  }

  aspectRatioBtn.addEventListener('click', () => {
    currentAspectIdx = (currentAspectIdx + 1) % aspectModes.length;
    setAspectRatio(aspectModes[currentAspectIdx]);
  });

  // 9.1 Dynamic 2027 Ambient Lighting Engine
  const ambientCanvas = document.getElementById('ambientCanvas');
  const ambientCtx = ambientCanvas ? ambientCanvas.getContext('2d', { willReadFrequently: false }) : null;
  let isAmbientOn = true;
  let ambientRafId = null;

  function renderAmbientLoop() {
    if (!isAmbientOn || !ambientCtx || videoElement.paused || videoElement.ended) {
      return;
    }
    try {
      if (videoElement.readyState >= 2) {
        ambientCtx.drawImage(videoElement, 0, 0, ambientCanvas.width, ambientCanvas.height);
      }
    } catch (e) {
      return;
    }
    ambientRafId = requestAnimationFrame(renderAmbientLoop);
  }

  function setAmbientMode(enabled) {
    isAmbientOn = enabled;
    if (ambientCanvas) {
      ambientCanvas.style.opacity = enabled ? '0.5' : '0';
    }
    document.querySelectorAll('#ambientPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.ambient === 'on') === enabled);
    });
    if (isAmbientOn && !videoElement.paused) {
      cancelAnimationFrame(ambientRafId);
      ambientRafId = requestAnimationFrame(renderAmbientLoop);
    }
  }

  videoElement.addEventListener('play', () => {
    if (isAmbientOn) {
      cancelAnimationFrame(ambientRafId);
      ambientRafId = requestAnimationFrame(renderAmbientLoop);
    }
  });

  videoElement.addEventListener('pause', () => {
    cancelAnimationFrame(ambientRafId);
  });

  // 10. Sleep Timer
  let sleepTimerId = null;
  function setSleepTimer(minutes) {
    clearTimeout(sleepTimerId);
    if (minutes > 0) {
      resumeToastText.textContent = `Sleep timer set for ${minutes} min`;
      resumeToast.style.display = 'block';
      setTimeout(() => { resumeToast.style.display = 'none'; }, 2400);

      sleepTimerId = setTimeout(() => {
        videoElement.pause();
        resumeToastText.textContent = 'Sleep timer elapsed. Playback paused.';
        resumeToast.style.display = 'block';
        setTimeout(() => { resumeToast.style.display = 'none'; }, 3000);
      }, minutes * 60 * 1000);
    }
    document.querySelectorAll('#sleepPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.sleep, 10) === minutes);
    });
  }

  // 11. Mobile Settings Bottom Sheet
  function openSettingsSheet() {
    settingsBackdrop.style.display = 'block';
    settingsSheet.style.display = 'block';
  }

  function closeSettingsSheet() {
    settingsBackdrop.style.display = 'none';
    settingsSheet.style.display = 'none';
  }

  settingsSheetBtn.addEventListener('click', openSettingsSheet);
  settingsBackdrop.addEventListener('click', closeSettingsSheet);
  closeSheetBtn.addEventListener('click', closeSettingsSheet);

  // Settings sheet pill event handlers
  document.getElementById('speedPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (btn) setPlaybackSpeed(parseFloat(btn.dataset.speed));
  });

  document.getElementById('boostPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (btn) setBoostLevel(parseFloat(btn.dataset.boost));
  });

  document.getElementById('aspectPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (btn) setAspectRatio(btn.dataset.aspect);
  });

  document.getElementById('sleepPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (btn) setSleepTimer(parseInt(btn.dataset.sleep, 10));
  });

  const ambientPills = document.getElementById('ambientPills');
  if (ambientPills) {
    ambientPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (btn) setAmbientMode(btn.dataset.ambient === 'on');
    });
  }

  // 12. Auto-Resume Position via localStorage
  const storageKey = 'tb_resume_' + btoa(cleanTitle).slice(0, 24);

  function savePosition() {
    if (videoElement.currentTime > 5 && !videoElement.ended) {
      localStorage.setItem(storageKey, Math.floor(videoElement.currentTime));
    }
  }

  function checkResume() {
    const saved = localStorage.getItem(storageKey);
    if (saved && Number(saved) > 5) {
      const pos = Number(saved);
      videoElement.currentTime = pos;
      resumeToastText.textContent = `Resumed from ${formatTime(pos)}`;
      resumeToast.style.display = 'block';
      setTimeout(() => { resumeToast.style.display = 'none'; }, 2600);
    }
  }

  videoElement.addEventListener('timeupdate', () => {
    if (Math.floor(videoElement.currentTime) % 3 === 0) {
      savePosition();
    }
  });

  // 13. Invisible UI Mode (Auto-hides header & footer during playback)
  let uiTimeout = null;
  function showUI() {
    if (isScreenLocked) return;
    playerApp.classList.remove('ui-hidden');
    clearTimeout(uiTimeout);
    if (!videoElement.paused) {
      uiTimeout = setTimeout(() => {
        playerApp.classList.add('ui-hidden');
      }, 2600);
    }
  }

  ['mousemove', 'touchstart', 'click'].forEach(evt => {
    playerContainer.addEventListener(evt, showUI, { passive: true });
  });

  videoElement.addEventListener('pause', () => {
    playerApp.classList.remove('ui-hidden');
    clearTimeout(uiTimeout);
  });

  videoElement.addEventListener('playing', () => {
    showUI();
    // Check if video is playing muted due to browser policy
    if (videoElement.muted) {
      unmuteOverlay.style.display = 'block';
    } else {
      unmuteOverlay.style.display = 'none';
    }
  });

  // 14. Initialize Plyr
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
      storage: { enabled: false }, // Prevent remembering muted state from errors
      keyboard: { focused: true, global: true },
      seekTime: 10,
    });

    videoElement.addEventListener('canplay', () => {
      loader.classList.add('hidden');
    });

    videoElement.addEventListener('playing', () => {
      loader.classList.add('hidden');
    });

    videoElement.addEventListener('waiting', () => {
      loaderText.textContent = 'Buffering stream...';
      loader.classList.remove('hidden');
    });

    videoElement.addEventListener('error', (e) => {
      console.error('HTML5 video error:', e);
      // Automatic Edge Proxy Fallback: If direct CDN stream hit CORS or Byte-Range blocking,
      // route smoothly through the Cloudflare Streaming Proxy
      const currentSrc = videoElement.currentSrc || videoElement.src;
      if (currentSrc && !currentSrc.includes('workers.dev') && !currentSrc.startsWith('blob:') && !currentSrc.startsWith('data:')) {
        const proxiedUrl = `https://teravidsplay.proxyking.workers.dev/?url=${encodeURIComponent(currentSrc)}`;
        console.info('[TeravidsPlay] Direct stream blocked. Activating Cloudflare Edge Streaming Proxy fallback...');
        loaderText.textContent = 'Activating edge proxy...';
        loader.classList.remove('hidden');
        videoElement.src = proxiedUrl;
        videoElement.load();
        videoElement.play().catch(() => {});
        return;
      }
      showError('Playback Interrupted', 'Unable to decode video stream. The link may have expired or is blocked.');
    });

    return plyrInstance;
  }

  const rawPoster = urlParams.get('poster') || urlParams.get('thumb') || '';
  if (rawPoster) {
    videoElement.poster = safeDecode(rawPoster);
  }

  // 15. Stream Loader
  function loadStream(url, poster = '') {
    if (!url) {
      showError('Missing Stream URL', 'No valid stream URL was provided.');
      return;
    }

    hideWelcomePortal();

    if (poster) {
      videoElement.poster = poster;
    }

    // Direct download trigger if ?dl=1 requested
    if ((urlParams.get('dl') === '1' || urlParams.get('download') === '1') && url) {
      try {
        const dlLink = document.createElement('a');
        dlLink.href = url;
        dlLink.download = cleanTitle || 'video.mp4';
        dlLink.target = '_blank';
        document.body.appendChild(dlLink);
        dlLink.click();
        document.body.removeChild(dlLink);
      } catch (e) {}
    }

    loader.classList.remove('hidden');
    loaderText.textContent = 'Connecting high-speed stream...';
    errorOverlay.style.display = 'none';
    externalDownloadBtn.href = url;

    const isM3U8 = url.includes('.m3u8');
    formatBadgeElem.textContent = isM3U8 ? 'HLS ADAPTIVE' : 'FULL HD';
    formatBadgeElem.style.display = 'inline-flex';

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
        videoElement.play().catch(() => {
          // If browser policy blocks unmuted autoplay, play muted and prompt unmute
          videoElement.muted = true;
          videoElement.play().catch(() => {});
          unmuteOverlay.style.display = 'block';
        });
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
      // Direct Byte-Range MP4
      videoElement.src = url;
      initPlyr();
      videoElement.addEventListener('loadedmetadata', checkResume, { once: true });
      videoElement.play().catch(() => {
        // If unmuted play is rejected by browser policy, fallback to muted + unmute banner
        videoElement.muted = true;
        videoElement.play().catch(() => {});
        unmuteOverlay.style.display = 'block';
      });
    }
  }

  function showError(heading, message) {
    hideWelcomePortal();
    loader.classList.add('hidden');
    errorHeading.textContent = heading;
    errorMsg.textContent = message;
    errorOverlay.style.display = 'flex';
  }

  // 16. Dynamic Stream Resolver for Own Short URLs (?v=ID or ?s=ID)
  async function resolveAndPlay(surl) {
    hideWelcomePortal();
    loader.classList.remove('hidden');
    loaderText.textContent = 'Connecting high-speed stream...';
    try {
      // 1. Try Cloudflare Worker endpoint
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
          fileSizeElem.textContent = sizeFormatted;
          fileSizeElem.style.display = 'inline-flex';
        }
        if (vid.thumbnailUrl) {
          videoElement.poster = vid.thumbnailUrl;
        }
        loadStream(vid.stream_url, vid.thumbnailUrl || '');
        return;
      }
      showError('Video Unavailable', 'Could not resolve stream for this link. It may have expired or is private.');
    } catch (err) {
      showError('Connection Error', 'Failed to connect to streaming engine. Please try again.');
    }
  }

  // Action listeners
  retryBtn.addEventListener('click', () => {
    if (vId) {
      resolveAndPlay(vId);
    } else {
      loadStream(streamUrl);
    }
  });

  fullscreenBtn.addEventListener('click', () => {
    if (plyrInstance) plyrInstance.fullscreen.toggle();
  });

  pipBtn.addEventListener('click', () => {
    if (plyrInstance) plyrInstance.pip = !plyrInstance.pip;
  });

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
      resumeToastText.textContent = 'Own short link copied to clipboard!';
      resumeToast.style.display = 'block';
      setTimeout(() => { resumeToast.style.display = 'none'; }, 2200);
    }
  });

  // Start Stream: check if Own Short ID (?v=...) or direct stream (?stream=...)
  if (vId) {
    resolveAndPlay(vId);
  } else if (streamUrl) {
    loadStream(streamUrl);
  } else {
    showWelcomePortal();
  }
});