// TeravidsPlay — Official Integrated Cinema Player Engine
// Features: Full-Width Theater Mode, In-Viewport Transparent Controls,
// Interactive Settings Popover (Speed, Live Quality Switcher, Boost, Fit),
// Web Audio 300% Boost (with CORS-safe Worker Proxy), 4X Ultra Turbo Long-Press,
// Telegram Auto-Unlock, Guaranteed Poster Preview, and Multi-Tier Stream Fallback.

document.addEventListener('DOMContentLoaded', () => {
  const WORKER_BASE = 'https://teravidsplay.proxyking.workers.dev';
  const PROXY_REQUIRED_HOSTS = [
    'replit.dev',
    'replit.app',
    'repl.co',
    'terabox.com',
    'terabox.app',
    'teraboxapp.com',
    '1024tera.com',
    '1024terabox.com',
    '1024tera.co',
    '1024terabox.co',
    'tera1024.com',
    '4funbox.com',
    'mirrobox.com',
    'mirrorbox.com',
    'nephobox.com',
    'freeterabox.com',
    'teraboxlink.com',
    'terasharelink.com',
    'terasharefile.com',
    'terafileshare.com',
    'teraboxurl.com',
    'teraboxshare.com',
    'teraboxsharefile.com',
    'terabox.fun',
    'terabox.link',
    'terabox.me',
    'terabox.club',
    'teraboxdl.com',
    'terabox1.com',
    'teraboxpage.com',
    '1024terabox.app',
    'teraboxfileshare.com',
    'terashareus.com',
    '1024tenbox.com',
    '1024teradl.com',
    'teraboxlinks.com',
    'teraboxfast.com',
    'tibibox.com',
    'momerybox.com',
    'memorybox.com',
    'tribox.com',
    'dubox.com',
    'diskwala.com',
    'diskwala.net',
    'diskwala-secure-dl.com',
    'udapi.diskwala.com',
    'tn1.diskwala.com',
    'baidupcs.com',
    'bdydns.com',
    'baidu.com',
    'teraboxcdn.com',
    'iteraplay.in',
    'iteraplay.com',
    'playterabox.com',
    'qzz.io',
    'cdniteraplay.qzz.io',
    'cloudflarestorage.com',
  ];

  // 1. Telegram WebApp Integration & Auto-Unlock
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#06090e');
      tg.setBackgroundColor('#06090e');
    } catch (e) {}
  }

  // 2. DOM Elements
  const homePage = document.getElementById('homePage');
  const playerView = document.getElementById('playerView');

  const playerContainer = document.getElementById('playerContainer');
  const videoElement = document.getElementById('player');
  const videoPosterOverlay = document.getElementById('videoPosterOverlay');
  const centerPlayBtn = document.getElementById('centerPlayBtn');
  const centerPlayIcon = document.getElementById('centerPlayIcon');
  const centerActionRipple = document.getElementById('centerActionRipple');
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loaderText');

  // Top Bar Elements
  const topVideoTitle = document.getElementById('topVideoTitle');
  const topDownloadBtn = document.getElementById('topDownloadBtn');
  const topShareBtn = document.getElementById('topShareBtn');

  // Bottom Controls Elements
  const scrubberContainer = document.getElementById('scrubberContainer');
  const scrubberBuffer = document.getElementById('scrubberBuffer');
  const scrubberProgress = document.getElementById('scrubberProgress');
  const scrubberThumb = document.getElementById('scrubberThumb');
  const scrubberTooltip = document.getElementById('scrubberTooltip');

  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const rewind10Btn = document.getElementById('rewind10Btn');
  const forward10Btn = document.getElementById('forward10Btn');
  const muteBtn = document.getElementById('muteBtn');
  const volumeIcon = document.getElementById('volumeIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const currentTimeElem = document.getElementById('currentTime');
  const durationTimeElem = document.getElementById('durationTime');

  // Pill Controls
  const audioBoostBtn = document.getElementById('audioBoostBtn');
  const audioBoostLabel = document.getElementById('audioBoostLabel');
  const aspectRatioBtn = document.getElementById('aspectRatioBtn');
  const aspectRatioLabel = document.getElementById('aspectRatioLabel');
  const settingsBtn = document.getElementById('settingsBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const fullscreenIcon = document.getElementById('fullscreenIcon');
  const rotateBtn = document.getElementById('rotateBtn');
  const topRotateBtn = document.getElementById('topRotateBtn');

  // Settings Popover & Subviews
  const settingsMenu = document.getElementById('settingsMenu');
  const settingsTitle = document.getElementById('settingsTitle');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsMainView = document.getElementById('settingsMainView');
  const subviewSpeed = document.getElementById('subviewSpeed');
  const subviewQuality = document.getElementById('subviewQuality');
  const qualityOptionsList = document.getElementById('qualityOptionsList');
  const subviewBoost = document.getElementById('subviewBoost');
  const subviewFit = document.getElementById('subviewFit');

  const rowSpeed = document.getElementById('rowSpeed');
  const rowQuality = document.getElementById('rowQuality');
  const rowBoost = document.getElementById('rowBoost');
  const rowFit = document.getElementById('rowFit');

  const settingsCurrentSpeed = document.getElementById('settingsCurrentSpeed');
  const settingsCurrentQuality = document.getElementById('settingsCurrentQuality');
  const settingsCurrentBoost = document.getElementById('settingsCurrentBoost');
  const settingsCurrentFit = document.getElementById('settingsCurrentFit');

  // Overlays & Gestures
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
  const channelGateOverlay = document.getElementById('channelGateOverlay');
  const gateUnlockBtn = document.getElementById('gateUnlockBtn');
  const errorOverlay = document.getElementById('errorOverlay');
  const errorHeading = document.getElementById('errorHeading');
  const errorMsg = document.getElementById('errorMsg');
  const retryBtn = document.getElementById('retryBtn');
  const externalChannelBtn = document.getElementById('externalChannelBtn');

  // Below-player metadata, playlist & external actions
  const videoTitleElem = document.getElementById('videoTitle');
  const fileSizeElem = document.getElementById('fileSize');
  const btnDownloadExt = document.getElementById('btnDownloadExt');
  const btnShareExt = document.getElementById('btnShareExt');
  const ambientCanvas = document.getElementById('ambientCanvas');
  const playlistControlsRow = document.getElementById('playlistControlsRow');
  const prevVideoBtn = document.getElementById('prevVideoBtn');
  const nextVideoBtn = document.getElementById('nextVideoBtn');
  const playlistPositionLabel = document.getElementById('playlistPositionLabel');
  const playlistSection = document.getElementById('playlistSection');
  const playlistHeading = document.getElementById('playlistHeading');
  const playlistCountBadge = document.getElementById('playlistCountBadge');
  const playlistList = document.getElementById('playlistList');

  // Helper Functions
  function safeDecode(val, fallback = '') {
    if (!val) return fallback;
    try {
      return decodeURIComponent(val);
    } catch (e) {
      return val;
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!n || n <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let val = n;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(1)} ${units[i]}`;
  }

  let toastTimer = null;
  function showToast(text) {
    if (resumeToast && resumeToastText) {
      clearTimeout(toastTimer);
      resumeToastText.textContent = text;
      resumeToast.style.display = 'block';
      toastTimer = setTimeout(() => { resumeToast.style.display = 'none'; }, 2400);
    }
  }

  function isSafeHttpUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      const parsed = new URL(rawUrl, window.location.href);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function makeSvgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, String(v));
    }
    return node;
  }

  function setSvgChildren(svgEl, specs) {
    if (!svgEl) return;
    svgEl.replaceChildren(...specs.map(([tag, attrs]) => makeSvgEl(tag, attrs)));
  }

  function renderOptionCheck(el, labelText, isActive) {
    el.textContent = labelText;
    if (isActive) {
      el.classList.add('active-option');
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = '✓';
      el.append(' ', check);
    } else {
      el.classList.remove('active-option');
    }
  }

  function shouldProxyUrl(rawUrl) {
    if (!rawUrl || !rawUrl.startsWith('http')) return false;
    if (rawUrl.startsWith(WORKER_BASE)) return false;
    try {
      const host = new URL(rawUrl).hostname.toLowerCase();
      return PROXY_REQUIRED_HOSTS.some((d) => host === d || host.endsWith('.' + d));
    } catch (e) {
      return false;
    }
  }

  function toProxyUrl(rawUrl, options = {}) {
    if (!rawUrl || rawUrl.startsWith(WORKER_BASE)) return rawUrl;
    const params = new URLSearchParams({ url: rawUrl });
    if (options.dl) params.set('dl', '1');
    if (options.filename) params.set('filename', options.filename);
    return `${WORKER_BASE}/?${params.toString()}`;
  }

  function normalizeSurlToken(rawVal) {
    if (!rawVal) return '';
    const mPath = rawVal.match(/\/(?:s|v)\/([a-zA-Z0-9_-]+)/);
    if (mPath) return mPath[1];
    const mDw = rawVal.match(/\/(?:app|share|d|f)\/([a-fA-F0-9]{24})/i);
    if (mDw) return mDw[1];
    const mQuery = rawVal.match(/[?&](?:surl|v|s)=([a-zA-Z0-9_-]+)/);
    if (mQuery) return mQuery[1];
    const stripped = rawVal.split(/[?&#]/)[0].trim();
    return /^https?:\/\//i.test(stripped) ? '' : stripped;
  }

  // 3. Parse Parameters & Telegram Auto-Unlock
  const urlParams = new URLSearchParams(window.location.search);
  const rawInputUrl = urlParams.get('url') || '';
  const rawPathParam = urlParams.get('path') || '';
  const requestedIdxRaw = parseInt(urlParams.get('idx') || '0', 10);
  const requestedIdx = Number.isFinite(requestedIdxRaw) && requestedIdxRaw >= 0 ? requestedIdxRaw : 0;
  const requestedFid = (urlParams.get('fid') || '').trim();
  let rawVId = urlParams.get('v') || urlParams.get('s') || '';
  if (!rawVId) {
    const pathMatch = window.location.pathname.match(/\/(v|s)\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) rawVId = pathMatch[2];
  }
  if (!rawVId && rawInputUrl) {
    rawVId = rawInputUrl;
  }

  const resolveInput = rawInputUrl || rawVId;
  const vId = normalizeSurlToken(rawVId);
  let resolvedSurl = vId;
  let activeDirPath = rawPathParam || '';

  let rawStream = urlParams.get('stream') || '';
  const rawTitle = urlParams.get('title') || '';
  const rawSize = urlParams.get('size') || '';
  const rawThumb = urlParams.get('thumb') || '';
  const fromTg = urlParams.get('tg') === '1' || urlParams.get('from') === 'tg' || Boolean(tg?.initData);

  if (rawStream.startsWith('b64:')) {
    try { rawStream = atob(rawStream.slice(4)); } catch (e) {}
  }

  const rawDecodedStream = safeDecode(rawStream);
  const streamUrl = isSafeHttpUrl(rawDecodedStream) ? rawDecodedStream : '';
  const cleanTitle = safeDecode(rawTitle);
  const cleanSize = safeDecode(rawSize);
  const rawDecodedThumb = safeDecode(rawThumb);
  const cleanThumb = isSafeHttpUrl(rawDecodedThumb) ? rawDecodedThumb : '';

  // Guaranteed Poster Overlay Helpers (works even when <video poster> fails on mobile WebViews or blocked hosts)
  let hasRenderedVideoFrame = false;
  function setVideoPoster(rawThumbUrl) {
    if (!isSafeHttpUrl(rawThumbUrl)) return;
    const primarySrc = shouldProxyUrl(rawThumbUrl) ? toProxyUrl(rawThumbUrl) : rawThumbUrl;
    const fallbackSrc = primarySrc === rawThumbUrl ? toProxyUrl(rawThumbUrl) : rawThumbUrl;

    videoElement.poster = primarySrc;

    if (videoPosterOverlay) {
      videoPosterOverlay.dataset.fallbackAttempted = '0';
      videoPosterOverlay.onerror = () => {
        if (videoPosterOverlay.dataset.fallbackAttempted === '0' && fallbackSrc && fallbackSrc !== videoPosterOverlay.src) {
          videoPosterOverlay.dataset.fallbackAttempted = '1';
          videoPosterOverlay.src = fallbackSrc;
        } else {
          videoPosterOverlay.style.display = 'none';
        }
      };
      videoPosterOverlay.onload = () => {
        if (!hasRenderedVideoFrame) {
          videoPosterOverlay.style.display = 'block';
        }
      };
      videoPosterOverlay.style.objectFit = videoElement.style.objectFit || 'contain';
      videoPosterOverlay.src = primarySrc;
      if (!hasRenderedVideoFrame) {
        videoPosterOverlay.style.display = 'block';
      }
    }
  }

  function hideVideoPoster() {
    hasRenderedVideoFrame = true;
    if (videoPosterOverlay) {
      videoPosterOverlay.style.display = 'none';
    }
  }

  // Auto-Unlock Telegram Gate if user came from Telegram channel
  const UNLOCK_KEY = 'teravids_channel_unlocked';
  let isChannelUnlocked = Boolean(fromTg);
  try {
    if (fromTg) {
      localStorage.setItem(UNLOCK_KEY, 'true');
    } else if (localStorage.getItem(UNLOCK_KEY) === 'true') {
      isChannelUnlocked = true;
    }
  } catch (e) {
    console.warn('[TeravidsPlay] LocalStorage access restricted:', e);
  }

  const hasMedia = Boolean(vId || resolveInput || streamUrl);

  function setGateInert(locked) {
    const targets = [
      document.querySelector('.app-navbar'),
      videoElement,
      centerPlayBtn,
      document.getElementById('playerTopBar'),
      document.getElementById('playerBottomBar'),
      settingsMenu,
      errorOverlay,
      document.querySelector('.video-info-section'),
      playlistControlsRow,
      playlistSection,
    ];
    targets.forEach((el) => {
      if (!el) return;
      el.inert = Boolean(locked);
    });
  }

  function checkChannelGate() {
    if (isChannelUnlocked || !hasMedia) {
      if (channelGateOverlay) channelGateOverlay.style.display = 'none';
      setGateInert(false);
    } else {
      if (channelGateOverlay) channelGateOverlay.style.display = 'flex';
      setGateInert(true);
      const gateFocusTarget = document.getElementById('gateJoinBtn') || gateUnlockBtn;
      if (gateFocusTarget) {
        requestAnimationFrame(() => gateFocusTarget.focus({ preventScroll: true }));
      }
    }
  }

  checkChannelGate();

  if (gateUnlockBtn) {
    gateUnlockBtn.addEventListener('click', () => {
      isChannelUnlocked = true;
      try {
        localStorage.setItem(UNLOCK_KEY, 'true');
      } catch (e) {}
      if (channelGateOverlay) channelGateOverlay.style.display = 'none';
      setGateInert(false);
      showToast('🎉 Video Unlocked!');
      if (playBtn) playBtn.focus({ preventScroll: true });
      videoElement.play().catch(() => {
        updatePlayIcons();
      });
    });
  }

  // View Switching

  function activateHomeView() {
    if (homePage) homePage.style.display = 'flex';
    if (playerView) playerView.style.display = 'none';
    document.title = 'TeravidsPlay — Ad-Free Cinema Cloud Video Player';
    if (videoElement && !videoElement.paused) videoElement.pause();
  }

  function activatePlayerView() {
    if (homePage) homePage.style.display = 'none';
    if (playerView) playerView.style.display = 'block';
  }

  if (hasMedia) {
    activatePlayerView();
    if (cleanTitle) {
      topVideoTitle.textContent = cleanTitle;
      videoTitleElem.textContent = cleanTitle;
      document.title = `${cleanTitle} — TeravidsPlay`;
    } else {
      topVideoTitle.textContent = 'TeraBox Video';
      videoTitleElem.textContent = 'Loading video stream...';
      document.title = 'TeravidsPlay — Cinema Stream';
    }

    if (cleanSize) {
      fileSizeElem.textContent = `📦 ${cleanSize}`;
      fileSizeElem.style.display = 'inline';
    }

    if (cleanThumb) {
      setVideoPoster(cleanThumb);
    }
  } else {
    activateHomeView();
  }

  // 4. Auto-Hiding Controls Engine & Single/Double Tap System
  let controlsTimeout = null;
  let tapTimer = null;
  let tapCount = 0;
  let lastTapSide = null;
  let suppressNextClick = false;
  let suppressResetTimer = null;

  function markSuppressClick() {
    suppressNextClick = true;
    clearTimeout(suppressResetTimer);
    suppressResetTimer = setTimeout(() => { suppressNextClick = false; }, 350);
  }

  function isControlsVisible() {
    return !playerContainer.classList.contains('controls-hidden');
  }

  function showControls(delay = 3500) {
    playerContainer.classList.remove('controls-hidden');
    clearTimeout(controlsTimeout);
    if (!videoElement.paused && delay > 0) {
      controlsTimeout = setTimeout(() => {
        if (settingsMenu && settingsMenu.style.display !== 'none') return;
        playerContainer.classList.add('controls-hidden');
      }, delay);
    }
  }

  function hideControls() {
    closeSettingsMenu(false);
    if (!videoElement.paused) {
      playerContainer.classList.add('controls-hidden');
    }
    clearTimeout(controlsTimeout);
  }

  function toggleControls() {
    if (isControlsVisible()) {
      hideControls();
    } else {
      showControls(3500);
    }
  }

  playerContainer.addEventListener('mousemove', () => {
    showControls(3500);
  });

  playerContainer.addEventListener('mouseleave', () => {
    if (!videoElement.paused) {
      controlsTimeout = setTimeout(() => {
        if (settingsMenu && settingsMenu.style.display !== 'none') return;
        playerContainer.classList.add('controls-hidden');
      }, 1200);
    }
  });

  // Center Ripple Animation (YouTube-Style Play / Pause Feedback)
  let centerRippleTimer = null;
  function triggerCenterRipple(type) {
    if (!centerActionRipple) return;
    clearTimeout(centerRippleTimer);
    const svg = makeSvgEl('svg', {
      'aria-hidden': 'true',
      width: '42',
      height: '42',
      viewBox: '0 0 24 24',
      fill: 'currentColor',
    });
    if (type === 'play') {
      setSvgChildren(svg, [['polygon', { points: '6 4 20 12 6 20 6 4' }]]);
    } else {
      setSvgChildren(svg, [
        ['rect', { x: '6', y: '4', width: '4', height: '16' }],
        ['rect', { x: '14', y: '4', width: '4', height: '16' }],
      ]);
    }
    centerActionRipple.replaceChildren(svg);
    centerActionRipple.style.display = 'flex';
    centerActionRipple.classList.remove('animate');
    void centerActionRipple.offsetWidth;
    centerActionRipple.classList.add('animate');
    centerRippleTimer = setTimeout(() => {
      centerActionRipple.classList.remove('animate');
      setTimeout(() => {
        centerActionRipple.style.display = 'none';
      }, 200);
    }, 320);
  }

  function getTapRatio(e) {
    const rect = playerContainer.getBoundingClientRect();
    const clientX = (e.clientX !== undefined && e.clientX !== 0)
      ? e.clientX
      : ((e.changedTouches && e.changedTouches[0]?.clientX) || (e.touches && e.touches[0]?.clientX) || (rect.left + rect.width / 2));
    const clientY = (e.clientY !== undefined && e.clientY !== 0)
      ? e.clientY
      : ((e.changedTouches && e.changedTouches[0]?.clientY) || (e.touches && e.touches[0]?.clientY) || (rect.top + rect.height / 2));

    if (isMobileLandscapeRotated) {
      return Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1)));
    }
    return Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
  }

  // Unified Mobile/Desktop Tap & Gesture System:
  // - Tap in Center Zone (25% - 75% width): Toggles Play / Pause with instant animated ripple!
  // - Tap in Left (<25%): 1 Tap toggles controls, Double Tap rewinds 10s!
  // - Tap in Right (>75%): 1 Tap toggles controls, Double Tap fast-forwards 10s!
  playerContainer.addEventListener('click', (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    if (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('a') ||
      e.target.closest('.player-overlay-top') ||
      e.target.closest('.player-overlay-bottom') ||
      e.target.closest('.scrubber-container') ||
      e.target.closest('.settings-popover') ||
      e.target.closest('.channel-gate-card') ||
      e.target.closest('.error-card')
    ) {
      showControls(4000);
      return;
    }

    const ratio = getTapRatio(e);
    const isCenterZone = ratio >= 0.25 && ratio <= 0.75;
    const side = ratio < 0.25 ? 'left' : (ratio > 0.75 ? 'right' : 'center');

    if (isCenterZone) {
      tapCount = 0;
      lastTapSide = null;
      clearTimeout(tapTimer);
      togglePlay();
      showControls(3500);
      return;
    }

    if (lastTapSide && lastTapSide !== side) {
      tapCount = 0;
      clearTimeout(tapTimer);
    }
    lastTapSide = side;
    tapCount++;

    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
        lastTapSide = null;
        toggleControls();
      }, 260);
    } else if (tapCount >= 2) {
      clearTimeout(tapTimer);
      tapCount = 0;
      lastTapSide = null;
      if (side === 'right') {
        const dur = Number.isFinite(videoElement.duration) ? videoElement.duration : Infinity;
        videoElement.currentTime = Math.min(dur, videoElement.currentTime + 10);
        showRipple('right');
      } else {
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        showRipple('left');
      }
      showControls(3500);
    }
  });

  // 5. Play / Pause Control
  function updatePlayIcons() {
    const isPlaying = !videoElement.paused;
    const specs = isPlaying
      ? [
          ['rect', { x: '6', y: '4', width: '4', height: '16' }],
          ['rect', { x: '14', y: '4', width: '4', height: '16' }],
        ]
      : [['polygon', { points: '6 4 20 12 6 20 6 4' }]];

    setSvgChildren(playIcon, specs);
    setSvgChildren(centerPlayIcon, specs);

    if (isPlaying) {
      centerPlayBtn.setAttribute('aria-label', 'Pause Video');
      centerPlayBtn.title = 'Pause Video';
      centerPlayBtn.classList.remove('hidden');
    } else {
      centerPlayBtn.setAttribute('aria-label', 'Play Video');
      centerPlayBtn.title = 'Play Video';
      centerPlayBtn.classList.remove('hidden');
      showControls();
    }
  }

  function togglePlay() {
    if (videoElement.paused) {
      videoElement.play().then(() => {
        triggerCenterRipple('play');
      }).catch(() => {
        updatePlayIcons();
      });
    } else {
      videoElement.pause();
      triggerCenterRipple('pause');
    }
    updatePlayIcons();
  }

  let lastCenterTapTimestamp = 0;
  function handleCenterPlayTap(e) {
    const now = Date.now();
    if (now - lastCenterTapTimestamp < 350) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    lastCenterTapTimestamp = now;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    togglePlay();
    showControls(3500);
  }

  if (playBtn) playBtn.addEventListener('click', togglePlay);
  if (centerPlayBtn) {
    centerPlayBtn.addEventListener('click', handleCenterPlayTap);
  }
  videoElement.addEventListener('play', updatePlayIcons);
  videoElement.addEventListener('pause', updatePlayIcons);

  // 6. Rewind & Fast Forward (10s)
  if (rewind10Btn) {
    rewind10Btn.addEventListener('click', () => {
      videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
      showRipple('left');
    });
  }

  if (forward10Btn) {
    forward10Btn.addEventListener('click', () => {
      const dur = Number.isFinite(videoElement.duration) ? videoElement.duration : Infinity;
      videoElement.currentTime = Math.min(dur, videoElement.currentTime + 10);
      showRipple('right');
    });
  }

  let rippleTimerLeft = null;
  let rippleTimerRight = null;
  function showRipple(dir) {
    if (dir === 'left' && rippleLeft) {
      clearTimeout(rippleTimerLeft);
      rippleLeft.style.display = 'flex';
      rippleTimerLeft = setTimeout(() => { rippleLeft.style.display = 'none'; }, 380);
    } else if (dir === 'right' && rippleRight) {
      clearTimeout(rippleTimerRight);
      rippleRight.style.display = 'flex';
      rippleTimerRight = setTimeout(() => { rippleRight.style.display = 'none'; }, 380);
    }
  }

  // 7. Interactive Red Scrubber
  let isScrubbing = false;

  function updateScrubber() {
    if (!Number.isFinite(videoElement.duration) || videoElement.duration <= 0 || isScrubbing) return;
    const progress = (videoElement.currentTime / videoElement.duration) * 100;
    scrubberProgress.style.width = `${progress}%`;
    scrubberThumb.style.left = `${progress}%`;
    currentTimeElem.textContent = formatTime(videoElement.currentTime);
    durationTimeElem.textContent = formatTime(videoElement.duration);

    if (videoElement.buffered.length > 0) {
      for (let i = videoElement.buffered.length - 1; i >= 0; i--) {
        if (videoElement.buffered.start(i) <= videoElement.currentTime) {
          const bufferEnd = videoElement.buffered.end(i);
          const bufferPct = (bufferEnd / videoElement.duration) * 100;
          scrubberBuffer.style.width = `${Math.min(100, bufferPct)}%`;
          break;
        }
      }
    }
  }

  videoElement.addEventListener('timeupdate', updateScrubber);
  videoElement.addEventListener('loadedmetadata', () => {
    durationTimeElem.textContent = Number.isFinite(videoElement.duration) ? formatTime(videoElement.duration) : 'LIVE';
    checkResume();
  });

  function getScrubberPointer(e) {
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return {
      x: touch ? touch.clientX : (e.clientX || 0),
      y: touch ? touch.clientY : (e.clientY || 0),
    };
  }

  function getScrubberPct(e) {
    const rect = scrubberContainer.getBoundingClientRect();
    const pt = getScrubberPointer(e);
    if (isMobileLandscapeRotated) {
      const rel = Math.max(0, Math.min(pt.y - rect.top, rect.height));
      return rel / (rect.height || 1);
    }
    const rel = Math.max(0, Math.min(pt.x - rect.left, rect.width));
    return rel / (rect.width || 1);
  }

  function seekToPosition(e) {
    if (!Number.isFinite(videoElement.duration) || videoElement.duration <= 0) return;
    const pct = getScrubberPct(e);
    videoElement.currentTime = pct * videoElement.duration;
    scrubberProgress.style.width = `${pct * 100}%`;
    scrubberThumb.style.left = `${pct * 100}%`;
    currentTimeElem.textContent = formatTime(videoElement.currentTime);
  }

  scrubberContainer.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    seekToPosition(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) seekToPosition(e);
  });

  window.addEventListener('mouseup', () => {
    if (isScrubbing) isScrubbing = false;
  });

  scrubberContainer.addEventListener('touchstart', (e) => {
    isScrubbing = true;
    showControls(5000);
    seekToPosition(e);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isScrubbing) {
      seekToPosition(e);
      if (Number.isFinite(videoElement.duration) && videoElement.duration > 0) {
        const pct = getScrubberPct(e);
        scrubberTooltip.textContent = formatTime(pct * videoElement.duration);
        scrubberTooltip.style.left = `${pct * 100}%`;
        scrubberTooltip.style.display = 'block';
      }
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isScrubbing) {
      isScrubbing = false;
      scrubberTooltip.style.display = 'none';
      showControls(3500);
    }
  });

  scrubberContainer.addEventListener('mousemove', (e) => {
    if (Number.isFinite(videoElement.duration) && videoElement.duration > 0) {
      const pct = getScrubberPct(e);
      scrubberTooltip.textContent = formatTime(pct * videoElement.duration);
      scrubberTooltip.style.left = `${pct * 100}%`;
      scrubberTooltip.style.display = 'block';
    }
  });

  scrubberContainer.addEventListener('mouseleave', () => {
    scrubberTooltip.style.display = 'none';
  });

  // 8. Volume & Mute Controls
  function updateVolumeIcon() {
    const spk = ['polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }];
    if (videoElement.muted || videoElement.volume === 0) {
      setSvgChildren(volumeIcon, [
        spk,
        ['line', { x1: '23', y1: '9', x2: '17', y2: '15' }],
        ['line', { x1: '17', y1: '9', x2: '23', y2: '15' }],
      ]);
    } else if (videoElement.volume < 0.5) {
      setSvgChildren(volumeIcon, [
        spk,
        ['path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }],
      ]);
    } else {
      setSvgChildren(volumeIcon, [
        spk,
        ['path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07' }],
      ]);
    }
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      videoElement.muted = !videoElement.muted;
      updateVolumeIcon();
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      videoElement.volume = parseFloat(e.target.value);
      videoElement.muted = false;
      updateVolumeIcon();
    });
  }

  // 9. Web Audio API 300% Sound Booster (CORS-Safe via Worker Proxy)
  let audioCtx = null;
  let gainNode = null;
  let mediaSourceAttached = false;
  let audioBoostLevel = 1.0;
  const boostLevels = [1.0, 1.5, 2.0, 3.0];
  let boostIndex = 0;

  function ensureCorsForBoost() {
    // Web Audio API createMediaElementSource outputs silence if a cross-origin video has no CORS!
    const currentSrc = videoElement.currentSrc || videoElement.src || '';
    if (!videoElement.crossOrigin && currentSrc && !currentSrc.startsWith(WORKER_BASE) && !currentSrc.startsWith('blob:')) {
      const resumeAt = videoElement.currentTime || 0;
      const wasPlaying = !videoElement.paused;
      const proxied = toProxyUrl(currentSrc);
      videoElement.crossOrigin = 'anonymous';
      videoElement.src = proxied;
      videoElement.load();
      videoElement.addEventListener('loadedmetadata', function onMeta() {
        videoElement.removeEventListener('loadedmetadata', onMeta);
        if (resumeAt > 1) videoElement.currentTime = resumeAt;
        if (wasPlaying) videoElement.play().catch(() => {});
      });
    }
  }

  function initAudioBooster() {
    if (audioCtx) return true;
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return false;
      ensureCorsForBoost();
      if (!videoElement.crossOrigin && !(videoElement.currentSrc || '').startsWith('blob:')) {
        // Defer AudioContext hook if CORS cannot be enabled safely
        return false;
      }
      audioCtx = new AudioContextCtor();
      if (!mediaSourceAttached) {
        const source = audioCtx.createMediaElementSource(videoElement);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = audioBoostLevel;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        mediaSourceAttached = true;
      }
      return true;
    } catch (e) {
      console.warn('AudioContext notice:', e);
      return false;
    }
  }

  function setBoostLevel(level) {
    audioBoostLevel = level;
    if (level > 1.0) {
      initAudioBooster();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (gainNode) gainNode.gain.value = audioBoostLevel;
    const label = `${Math.round(audioBoostLevel * 100)}%`;
    if (audioBoostLabel) audioBoostLabel.textContent = `Boost: ${label}`;
    if (settingsCurrentBoost) settingsCurrentBoost.textContent = label;
    if (audioBoostBtn) audioBoostBtn.classList.toggle('active-pill', audioBoostLevel > 1.0);

    document.querySelectorAll('#subviewBoost .option-item').forEach(el => {
      const b = parseFloat(el.getAttribute('data-boost'));
      const cleanLabel = el.textContent.replace(' ✓', '').trim();
      renderOptionCheck(el, cleanLabel, b === audioBoostLevel);
    });

    showToast(`🔊 Audio Boost: ${label}`);
  }

  if (audioBoostBtn) {
    audioBoostBtn.addEventListener('click', () => {
      boostIndex = (boostIndex + 1) % boostLevels.length;
      setBoostLevel(boostLevels[boostIndex]);
    });
  }

  // 10. Aspect Ratio Switcher (Fit / Fill / Stretch)
  const aspectModes = ['contain', 'cover', 'fill'];
  const aspectLabels = ['Fit', 'Fill', 'Stretch'];
  let aspectIdx = 0;

  function setAspectMode(mode, label) {
    videoElement.style.objectFit = mode;
    if (videoPosterOverlay) videoPosterOverlay.style.objectFit = mode;
    if (aspectRatioLabel) aspectRatioLabel.textContent = label;
    if (settingsCurrentFit) settingsCurrentFit.textContent = label;

    document.querySelectorAll('#subviewFit .option-item').forEach(el => {
      const cleanLabel = el.textContent.replace(' ✓', '').trim();
      renderOptionCheck(el, cleanLabel, el.getAttribute('data-fit') === mode);
    });
    showToast(`Aspect Ratio: ${label}`);
  }

  if (aspectRatioBtn && aspectRatioLabel) {
    aspectRatioBtn.addEventListener('click', () => {
      aspectIdx = (aspectIdx + 1) % aspectModes.length;
      setAspectMode(aspectModes[aspectIdx], aspectLabels[aspectIdx]);
    });
  }

  // 11. Playback Speed Selector (0.5x -> 4.0x)
  function setSpeed(speedVal) {
    const val = parseFloat(speedVal);
    videoElement.playbackRate = val;
    const label = val === 1.0 ? '1.0x' : `${val}x`;
    if (settingsCurrentSpeed) settingsCurrentSpeed.textContent = label;

    document.querySelectorAll('#subviewSpeed .option-item').forEach(el => {
      const spd = parseFloat(el.getAttribute('data-speed'));
      const cleanLabel = el.textContent.replace(' ✓', '').trim();
      renderOptionCheck(el, cleanLabel, spd === val);
    });
    showToast(`⚡ Speed: ${label}`);
  }

  // 12. Settings Popover Submenu Navigation & Dynamic Quality Control
  let availableQualities = [];
  let activeQualityId = 'auto';

  function renderQualityOptions(items, selectedId) {
    if (!qualityOptionsList) return;
    qualityOptionsList.textContent = '';
    const list = items.length ? items : [{ id: 'auto', label: 'Auto' }];
    list.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-item' + (opt.id === selectedId ? ' active-option' : '');
      btn.setAttribute('data-quality', opt.id);
      renderOptionCheck(btn, opt.label, opt.id === selectedId);
      if (opt.id === selectedId && settingsCurrentQuality) {
        settingsCurrentQuality.textContent = opt.label;
      }
      btn.addEventListener('click', () => {
        switchQuality(opt);
        showSettingsMain(true);
      });
      qualityOptionsList.appendChild(btn);
    });
  }

  function closeSettingsMenu(restoreFocus = false) {
    if (!settingsMenu) return;
    settingsMenu.style.display = 'none';
    if (settingsBtn) {
      settingsBtn.setAttribute('aria-expanded', 'false');
      if (restoreFocus) settingsBtn.focus();
    }
  }

  function switchQuality(opt) {
    activeQualityId = opt.id;
    renderQualityOptions(availableQualities, activeQualityId);
    if (opt.hlsLevel !== undefined && hlsInstance) {
      hlsInstance.currentLevel = opt.hlsLevel;
      showToast(`Quality: ${opt.label}`);
      return;
    }
    if (opt.url) {
      const resumeAt = videoElement.currentTime || 0;
      const wasPlaying = !videoElement.paused;
      const candidates = buildCandidatesForSingleUrl(opt.url);
      startCandidateQueue(candidates, resumeAt, wasPlaying);
      showToast(`Quality: ${opt.label}`);
    }
  }

  let lastSettingsTrigger = null;

  function showSettingsMain(restoreFocus = false) {
    settingsTitle.textContent = 'Playback Settings';
    settingsMainView.style.display = 'block';
    subviewSpeed.style.display = 'none';
    subviewQuality.style.display = 'none';
    subviewBoost.style.display = 'none';
    subviewFit.style.display = 'none';
    if (restoreFocus) {
      const target = lastSettingsTrigger || rowSpeed;
      if (target) target.focus({ preventScroll: true });
    }
  }

  function openSettingsSubview(subviewEl, titleText, triggerEl) {
    if (!subviewEl) return;
    lastSettingsTrigger = triggerEl || rowSpeed;
    settingsTitle.textContent = titleText;
    settingsMainView.style.display = 'none';
    subviewSpeed.style.display = 'none';
    subviewQuality.style.display = 'none';
    subviewBoost.style.display = 'none';
    subviewFit.style.display = 'none';
    subviewEl.style.display = 'block';
    const focusEl = subviewEl.querySelector('.subview-back-btn') || subviewEl.querySelector('.option-item');
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = settingsMenu.style.display === 'block';
      if (isVisible) {
        closeSettingsMenu(false);
      } else {
        lastSettingsTrigger = null;
        showSettingsMain(true);
        settingsMenu.style.display = 'block';
        settingsBtn.setAttribute('aria-expanded', 'true');
        showControls();
        if (rowSpeed) rowSpeed.focus({ preventScroll: true });
      }
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSettingsMenu(true);
    });
  }

  document.addEventListener('click', (e) => {
    if (settingsMenu && settingsMenu.style.display === 'block') {
      if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
        closeSettingsMenu(false);
      }
    }
  });

  if (rowSpeed) rowSpeed.addEventListener('click', () => openSettingsSubview(subviewSpeed, 'Playback Speed', rowSpeed));
  if (rowQuality) rowQuality.addEventListener('click', () => openSettingsSubview(subviewQuality, 'Resolution & Quality', rowQuality));
  if (rowBoost) rowBoost.addEventListener('click', () => openSettingsSubview(subviewBoost, 'Audio Boost (Web Audio)', rowBoost));
  if (rowFit) rowFit.addEventListener('click', () => openSettingsSubview(subviewFit, 'Screen Fit Mode', rowFit));

  document.querySelectorAll('.subview-back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSettingsMain(true);
    });
  });

  document.querySelectorAll('#subviewSpeed .option-item').forEach(item => {
    item.addEventListener('click', () => {
      setSpeed(item.getAttribute('data-speed'));
      showSettingsMain(true);
    });
  });

  document.querySelectorAll('#subviewBoost .option-item').forEach(item => {
    item.addEventListener('click', () => {
      setBoostLevel(parseFloat(item.getAttribute('data-boost')));
      showSettingsMain(true);
    });
  });

  document.querySelectorAll('#subviewFit .option-item').forEach(item => {
    item.addEventListener('click', () => {
      const f = item.getAttribute('data-fit');
      const label = f === 'contain' ? 'Fit (16:9)' : (f === 'cover' ? 'Fill (Crop)' : 'Stretch');
      setAspectMode(f, label);
      showSettingsMain(true);
    });
  });

  // 13. Fullscreen Toggle & Mobile Screen Rotation
  let isMobileLandscapeRotated = false;

  function setCssRotation(active) {
    isMobileLandscapeRotated = active;
    if (active) {
      playerContainer.classList.add('mobile-force-landscape');
      document.body.classList.add('mobile-rotated-active');
    } else {
      playerContainer.classList.remove('mobile-force-landscape');
      document.body.classList.remove('mobile-rotated-active');
    }
  }

  function toggleFullscreen() {
    const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsElem) {
      if (isMobileLandscapeRotated) setCssRotation(false);
      if (playerContainer.requestFullscreen) {
        playerContainer.requestFullscreen().catch(() => {});
      } else if (playerContainer.webkitRequestFullscreen) {
        playerContainer.webkitRequestFullscreen();
      } else if (videoElement.webkitEnterFullscreen) {
        videoElement.webkitEnterFullscreen();
      }
      setSvgChildren(fullscreenIcon, [
        ['path', { d: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3' }],
      ]);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      setSvgChildren(fullscreenIcon, [
        ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' }],
      ]);
    }
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

  async function toggleVideoRotation() {
    const nextState = !isMobileLandscapeRotated;

    if (screen.orientation && screen.orientation.lock) {
      try {
        await screen.orientation.lock(nextState ? 'landscape' : 'portrait');
        isMobileLandscapeRotated = nextState;
        showToast(nextState ? '🔄 Rotated to Landscape' : '📱 Rotated to Portrait');
        return;
      } catch (err) {
        // Fallback to CSS virtual rotation
      }
    }

    setCssRotation(nextState);
    showToast(nextState ? '🔄 Landscape Mode Activated' : '📱 Portrait Mode Activated');
    showControls(3500);
  }

  if (rotateBtn) rotateBtn.addEventListener('click', toggleVideoRotation);
  if (topRotateBtn) topRotateBtn.addEventListener('click', toggleVideoRotation);

  // 14. Ultra Long-Press: 2X Speed & 4X Turbo Speed
  let pressTimer2x = null;
  let pressTimer4x = null;
  let isFastForwarding = false;
  let originalSpeed = 1.0;

  function startLongPress(e) {
    if (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('a') ||
      e.target.closest('.player-overlay-top') ||
      e.target.closest('.player-overlay-bottom') ||
      e.target.closest('.scrubber-container') ||
      e.target.closest('.settings-popover')
    ) return;

    pressTimer2x = setTimeout(() => {
      if (isSwiping) return;
      isFastForwarding = true;
      originalSpeed = videoElement.playbackRate || 1.0;
      videoElement.playbackRate = 2.0;
      if (speedOverlay) {
        if (speedOverlayIcon) speedOverlayIcon.textContent = '⚡';
        if (speedOverlayText) speedOverlayText.textContent = '2X Speed';
        speedOverlay.style.display = 'block';
      }
    }, 350);

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
      markSuppressClick();
      videoElement.playbackRate = originalSpeed || 1.0;
      if (speedOverlay) speedOverlay.style.display = 'none';
    }
  }

  playerContainer.addEventListener('mousedown', startLongPress);
  window.addEventListener('mouseup', stopLongPress);
  playerContainer.addEventListener('touchstart', startLongPress, { passive: true });
  window.addEventListener('touchend', stopLongPress);
  window.addEventListener('touchcancel', stopLongPress);

  // 15. Swipe Gestures for Brightness & Volume (Rotation-aware & scroll-safe)
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let activeHud = null;
  let currentBrightness = 1.0;

  playerContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('.scrubber-container') || e.target.closest('.settings-popover')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
    activeHud = null;
  }, { passive: true });

  playerContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || isScrubbing) return;
    if (e.target.closest('.scrubber-container') || e.target.closest('.settings-popover')) return;

    const curX = e.touches[0].clientX;
    const curY = e.touches[0].clientY;

    let deltaForward;
    let deltaUp;
    if (isMobileLandscapeRotated) {
      deltaForward = curY - touchStartY;
      deltaUp = curX - touchStartX; // in 90deg CW rotation, dragging left/right along screen X changes height axis
    } else {
      deltaForward = curX - touchStartX;
      deltaUp = touchStartY - curY;
    }

    if (!isSwiping && Math.abs(deltaUp) > 15 && Math.abs(deltaUp) > Math.abs(deltaForward) * 1.5) {
      isSwiping = true;
      clearTimeout(pressTimer2x);
      clearTimeout(pressTimer4x);
      const rect = playerContainer.getBoundingClientRect();
      const sidePct = isMobileLandscapeRotated
        ? (touchStartY - rect.top) / (rect.height || 1)
        : (touchStartX - rect.left) / (rect.width || 1);
      activeHud = sidePct < 0.5 ? 'brightness' : 'volume';
    }

    if (isSwiping) {
      e.preventDefault();
      const step = deltaUp / 200;
      touchStartX = curX;
      touchStartY = curY;

      if (activeHud === 'brightness') {
        currentBrightness = Math.max(0.2, Math.min(1.5, currentBrightness + step));
        videoElement.style.filter = `brightness(${currentBrightness})`;
        const pct = Math.round((currentBrightness / 1.5) * 100);
        if (brightnessBar) brightnessBar.style.height = `${pct}%`;
        if (brightnessText) brightnessText.textContent = `${pct}%`;
        if (brightnessHud) brightnessHud.style.display = 'flex';
      } else if (activeHud === 'volume') {
        const newVol = Math.max(0, Math.min(1, videoElement.volume + step));
        videoElement.volume = newVol;
        videoElement.muted = false;
        const pct = Math.round(newVol * 100);
        if (volumeBar) volumeBar.style.height = `${pct}%`;
        if (volumeText) volumeText.textContent = `${pct}%`;
        if (volumeHud) volumeHud.style.display = 'flex';
        updateVolumeIcon();
      }
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (isSwiping) {
      markSuppressClick();
      setTimeout(() => {
        if (brightnessHud) brightnessHud.style.display = 'none';
        if (volumeHud) volumeHud.style.display = 'none';
      }, 350);
      isSwiping = false;
    }
  });

  // 16. Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' && settingsMenu && settingsMenu.style.display === 'block') {
      e.preventDefault();
      closeSettingsMenu(true);
      return;
    }
    if (!isChannelUnlocked) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        showRipple('left');
        break;
      case 'ArrowRight': {
        e.preventDefault();
        const dur = Number.isFinite(videoElement.duration) ? videoElement.duration : Infinity;
        videoElement.currentTime = Math.min(dur, videoElement.currentTime + 10);
        showRipple('right');
        break;
      }
      case 'ArrowUp':
        e.preventDefault();
        videoElement.volume = Math.min(1, videoElement.volume + 0.1);
        showToast(`🔊 Volume: ${Math.round(videoElement.volume * 100)}%`);
        updateVolumeIcon();
        break;
      case 'ArrowDown':
        e.preventDefault();
        videoElement.volume = Math.max(0, videoElement.volume - 0.1);
        showToast(`🔊 Volume: ${Math.round(videoElement.volume * 100)}%`);
        updateVolumeIcon();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        videoElement.muted = !videoElement.muted;
        updateVolumeIcon();
        break;
      case 'b':
      case 'B':
        e.preventDefault();
        if (audioBoostBtn) audioBoostBtn.click();
        break;
    }
  });

  // 17. Ambient Glow Canvas (CORS-safe, halts automatically if tainted)
  let ambientCtx = null;
  let ambientRaf = null;
  let ambientBlocked = false;

  if (ambientCanvas) {
    try { ambientCtx = ambientCanvas.getContext('2d', { willReadFrequently: false }); } catch (e) {}
  }

  function drawAmbient() {
    if (ambientBlocked || !ambientCtx) {
      ambientRaf = null;
      return;
    }
    if (!videoElement.paused && !videoElement.ended && videoElement.readyState >= 2) {
      try {
        ambientCtx.drawImage(videoElement, 0, 0, ambientCanvas.width, ambientCanvas.height);
      } catch (e) {
        ambientBlocked = true;
        ambientRaf = null;
        return;
      }
    }
    ambientRaf = requestAnimationFrame(drawAmbient);
  }

  videoElement.addEventListener('play', () => {
    if (!ambientBlocked && !ambientRaf) ambientRaf = requestAnimationFrame(drawAmbient);
  });
  videoElement.addEventListener('pause', () => {
    if (ambientRaf) cancelAnimationFrame(ambientRaf);
    ambientRaf = null;
  });

  // 18. Per-Video Auto-Resume from Last Position (Dual-Seek Safe)
  let playlistVideos = [];
  let activeVideoIndex = 0;
  let activeFileId = '';
  let suppressAutoResume = false;

  function getStorageKey() {
    const subKey = activeFileId || (playlistVideos.length > 1 ? `idx${activeVideoIndex}` : '');
    const base = vId || streamUrl.slice(-25) || 'default';
    return `teravids_pos_${base}${subKey ? '_' + subKey : ''}`;
  }

  function checkResume() {
    if (suppressAutoResume) {
      suppressAutoResume = false;
      return;
    }
    let saved = null;
    try { saved = localStorage.getItem(getStorageKey()); } catch (e) {}
    if (saved && Number(saved) > 5) {
      const pos = Number(saved);
      videoElement.currentTime = pos;
      showToast(`Resumed from ${formatTime(pos)}`);
    }
  }

  videoElement.addEventListener('timeupdate', () => {
    if (videoElement.currentTime > 0 && !hasRenderedVideoFrame) {
      hideVideoPoster();
    }
    if (Math.floor(videoElement.currentTime) % 3 === 0 && videoElement.currentTime > 5) {
      try { localStorage.setItem(getStorageKey(), Math.floor(videoElement.currentTime)); } catch (e) {}
    }
  });

  // 19. Resilient Multi-Candidate Stream Loader (Proxy-First for Blocked Hosts + Full Fallback Queue)
  let hlsInstance = null;
  let playbackQueue = [];
  let candidateIdx = -1;
  let desiredResumeTime = 0;
  let desiredAutoPlay = true;
  let activeLoadGen = 0;

  function resetScrubberUi() {
    if (scrubberProgress) scrubberProgress.style.width = '0%';
    if (scrubberBuffer) scrubberBuffer.style.width = '0%';
    if (scrubberThumb) scrubberThumb.style.left = '0%';
    if (currentTimeElem) currentTimeElem.textContent = '00:00';
    if (durationTimeElem) durationTimeElem.textContent = '00:00';
  }

  function buildCandidatesForSingleUrl(rawUrl) {
    if (!isSafeHttpUrl(rawUrl)) return [];
    const list = [];
    const isHls = rawUrl.includes('.m3u8') || rawUrl.includes('/hls?');
    const proxied = toProxyUrl(rawUrl);
    const sameOriginOrWorker = rawUrl.startsWith(WORKER_BASE) || rawUrl.startsWith(window.location.origin);

    // If Web Audio API MediaElementAudioSource is attached, Chrome mutes non-CORS streams permanently
    if (mediaSourceAttached) {
      if (sameOriginOrWorker) {
        list.push({ url: rawUrl, isHls, isCors: true, raw: rawUrl });
      } else {
        list.push({ url: proxied, isHls, isCors: true, raw: rawUrl });
      }
      return list;
    }

    if (shouldProxyUrl(rawUrl)) {
      list.push({ url: proxied, isHls, isCors: true, raw: rawUrl });
      list.push({ url: rawUrl, isHls, isCors: false, raw: rawUrl });
    } else {
      list.push({ url: rawUrl, isHls, isCors: sameOriginOrWorker, raw: rawUrl });
      if (rawUrl.startsWith('http') && !sameOriginOrWorker) {
        list.push({ url: proxied, isHls, isCors: true, raw: rawUrl });
      }
    }
    return list;
  }

  function dedupeCandidates(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item || !item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  function advancePlaybackCandidate() {
    candidateIdx++;
    if (candidateIdx >= playbackQueue.length) {
      showError('Playback Interrupted', 'Unable to decode video stream right now. Tap Try Again or check @teravidsplayer.');
      return;
    }
    loadCandidate(playbackQueue[candidateIdx]);
  }

  function startCandidateQueue(candidates, resumeAt = 0, shouldPlay = isChannelUnlocked) {
    playbackQueue = dedupeCandidates(candidates);
    candidateIdx = -1;
    desiredResumeTime = resumeAt;
    suppressAutoResume = resumeAt > 0;
    desiredAutoPlay = shouldPlay;

    if (playbackQueue.length === 0) {
      showError('Missing Stream URL', 'No valid stream URL was available. Tap Try Again to refresh.');
      return;
    }
    advancePlaybackCandidate();
  }

  function loadCandidate(cand) {
    const gen = ++activeLoadGen;
    const { url, isHls, isCors } = cand;
    loader.classList.remove('hidden');
    loaderText.textContent = url.startsWith(WORKER_BASE)
      ? 'Streaming via edge accelerator...'
      : 'Connecting high-speed stream...';
    errorOverlay.style.display = 'none';

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (mediaSourceAttached || isCors || url.startsWith(WORKER_BASE)) {
      videoElement.crossOrigin = 'anonymous';
    } else {
      videoElement.removeAttribute('crossorigin');
    }

    if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (videoElement.hasAttribute('src')) {
        videoElement.removeAttribute('src');
        videoElement.load();
      }
      let netRetries = 0;
      let mediaRetries = 0;

      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1000 * 1000,
        startLevel: -1,
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (gen !== activeLoadGen) return;
        loader.classList.add('hidden');
        if (desiredResumeTime > 1) {
          videoElement.currentTime = desiredResumeTime;
          desiredResumeTime = 0;
        }
        if (hlsInstance.levels && hlsInstance.levels.length > 1) {
          const levelOpts = hlsInstance.levels.map((lvl, idx) => ({
            id: `hls-${idx}`,
            label: lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`,
            hlsLevel: idx,
          }));
          const nonHlsLevelOpts = availableQualities.filter((q) => q.url && q.hlsLevel === undefined);
          availableQualities = [{ id: 'auto', label: 'Auto', hlsLevel: -1 }, ...levelOpts, ...nonHlsLevelOpts];
          renderQualityOptions(availableQualities, activeQualityId);
        }
        if (desiredAutoPlay && isChannelUnlocked) {
          videoElement.play().catch(() => {
            updatePlayIcons();
          });
        }
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (gen !== activeLoadGen || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 1 && !data.details?.includes('manifestLoad')) {
          netRetries++;
          hlsInstance.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
          mediaRetries++;
          hlsInstance.recoverMediaError();
          return;
        }
        console.warn('[TeravidsPlay] HLS candidate failed, switching fallback...', data.details);
        hlsInstance.destroy();
        hlsInstance = null;
        advancePlaybackCandidate();
      });
    } else {
      videoElement.src = url;
      videoElement.load();
      if (desiredResumeTime > 1) {
        const resumeSnap = desiredResumeTime;
        desiredResumeTime = 0;
        videoElement.addEventListener('loadedmetadata', function onResumeMeta() {
          videoElement.removeEventListener('loadedmetadata', onResumeMeta);
          if (gen === activeLoadGen) videoElement.currentTime = resumeSnap;
        });
      }
      if (desiredAutoPlay && isChannelUnlocked) {
        videoElement.play().catch(() => {
          updatePlayIcons();
        });
      }
    }
  }

  function loadStream(url, poster = '') {
    hasRenderedVideoFrame = false;
    resetScrubberUi();
    if (poster) setVideoPoster(poster);
    if (!url) {
      showError('Missing Stream URL', 'No valid stream URL was provided.');
      return;
    }
    setDownloadTargets(url, topVideoTitle.textContent || 'TeravidsPlay_Video', true, activeVideoIndex, activeFileId);
    startCandidateQueue(buildCandidatesForSingleUrl(url));
  }

  videoElement.addEventListener('canplay', () => {
    loader.classList.add('hidden');
  });

  videoElement.addEventListener('playing', () => {
    loader.classList.add('hidden');
    hideVideoPoster();
  });

  videoElement.addEventListener('waiting', () => {
    loaderText.textContent = 'Buffering stream...';
    loader.classList.remove('hidden');
  });

  videoElement.addEventListener('error', (e) => {
    if (hlsInstance) return;
    console.warn('HTML5 video candidate error, trying next fallback...', e);
    advancePlaybackCandidate();
  });

  videoElement.addEventListener('ended', () => {
    if (playlistVideos.length > 1 && activeVideoIndex + 1 < playlistVideos.length) {
      showToast(`▶ Playing Next (${activeVideoIndex + 2}/${playlistVideos.length})...`);
      selectPlaylistVideo(activeVideoIndex + 1, true);
    }
  });

  function showError(heading, message) {
    loader.classList.add('hidden');
    errorHeading.textContent = heading;
    errorMsg.textContent = message;
    errorOverlay.style.display = 'flex';
  }

  function configureDownloadButton(btn, dlHref, available) {
    if (!btn) return;
    if (available && dlHref) {
      btn.href = dlHref;
      btn.setAttribute('target', '_blank');
      btn.setAttribute('rel', 'noopener noreferrer');
      btn.dataset.unavailable = '0';
    } else {
      btn.href = '#download';
      btn.removeAttribute('target');
      btn.dataset.unavailable = '1';
    }
  }

  [topDownloadBtn, btnDownloadExt].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      if (btn.dataset.unavailable === '1') {
        e.preventDefault();
        showToast('Direct download unavailable — streaming in HD on TeravidsPlay!');
      }
    });
  });

  // Strictly keeps all downloads & fallback targets within TeravidsPlay Worker/Telegram (never leaves to TeraBox/DiskWala)
  function setDownloadTargets(rawMediaUrl, title, allowWorkerDl = true, idx = 0, fileId = '') {
    const cleanName = title && title !== 'TeraBox Video' ? title : 'TeravidsPlay_Video.mp4';
    const hasSafeMedia = isSafeHttpUrl(rawMediaUrl);
    const activeToken = resolvedSurl || vId;
    let dlHref = '';
    if (hasSafeMedia) {
      if (activeToken && allowWorkerDl) {
        const dlParams = new URLSearchParams({ fn: cleanName });
        if (idx > 0) dlParams.set('idx', String(idx));
        if (fileId) dlParams.set('fid', fileId);
        if (activeDirPath) dlParams.set('path', activeDirPath);
        dlHref = `${WORKER_BASE}/dl/${encodeURIComponent(activeToken)}?${dlParams.toString()}`;
      } else {
        dlHref = toProxyUrl(rawMediaUrl, { dl: true, filename: cleanName });
      }
    }

    configureDownloadButton(topDownloadBtn, dlHref, hasSafeMedia);
    configureDownloadButton(btnDownloadExt, dlHref, hasSafeMedia);
    if (externalChannelBtn) externalChannelBtn.href = 'https://t.me/teravidsplayer';
  }

  // 20. Extract String URL from Stream Field & Multi-Video Playlist Engine
  function extractStreamMapEntries(val) {
    const entries = [];
    if (typeof val === 'string' && isSafeHttpUrl(val)) {
      entries.push({ label: 'HD Stream', url: val });
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        if (typeof v === 'string' && isSafeHttpUrl(v)) {
          entries.push({ label: k.toUpperCase() === 'AUTO' ? 'Auto' : String(k).slice(0, 24), url: v });
        }
      }
    }
    return entries;
  }

  function updatePlaylistActiveState() {
    if (!playlistList) return;
    const cards = playlistList.querySelectorAll('.playlist-card');
    cards.forEach((btn, i) => {
      const isCurr = i === activeVideoIndex;
      if (isCurr) {
        btn.setAttribute('aria-current', 'true');
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else {
        btn.removeAttribute('aria-current');
      }
      const badge = btn.querySelector('.playlist-now-pill');
      if (badge) badge.style.display = isCurr ? 'inline-block' : 'none';
    });

    if (playlistControlsRow && playlistVideos.length > 1) {
      playlistControlsRow.style.display = 'flex';
      if (playlistPositionLabel) {
        playlistPositionLabel.textContent = `${activeVideoIndex + 1} / ${playlistVideos.length}`;
      }
      if (prevVideoBtn) {
        prevVideoBtn.setAttribute('aria-disabled', activeVideoIndex <= 0 ? 'true' : 'false');
      }
      if (nextVideoBtn) {
        nextVideoBtn.setAttribute('aria-disabled', activeVideoIndex + 1 >= playlistVideos.length ? 'true' : 'false');
      }
    }
  }

  function renderPlaylistSection(videos) {
    if (!playlistSection || !playlistList) return;
    playlistList.textContent = '';

    if (!Array.isArray(videos) || videos.length <= 1) {
      playlistSection.style.display = 'none';
      if (playlistControlsRow) playlistControlsRow.style.display = 'none';
      return;
    }

    const folderName = activeDirPath ? activeDirPath.split('/').filter(Boolean).pop() : '';
    if (playlistHeading) {
      playlistHeading.textContent = folderName ? `Collection: ${folderName}` : 'Playlist Videos';
    }
    if (playlistCountBadge) {
      playlistCountBadge.textContent = `${videos.length} videos`;
    }

    videos.forEach((vid, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'playlist-card';
      if (i === activeVideoIndex) btn.setAttribute('aria-current', 'true');

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'playlist-thumb-wrap';

      if (vid.thumbnailUrl && isSafeHttpUrl(vid.thumbnailUrl)) {
        const img = document.createElement('img');
        img.width = 160;
        img.height = 90;
        img.loading = 'lazy';
        img.setAttribute('fetchpriority', 'low');
        img.alt = '';
        const primaryThumb = shouldProxyUrl(vid.thumbnailUrl) ? toProxyUrl(vid.thumbnailUrl) : vid.thumbnailUrl;
        const fallbackThumb = primaryThumb === vid.thumbnailUrl ? toProxyUrl(vid.thumbnailUrl) : vid.thumbnailUrl;
        img.dataset.fallbackAttempted = '0';
        img.onerror = () => {
          if (img.dataset.fallbackAttempted === '0' && fallbackThumb && fallbackThumb !== img.src) {
            img.dataset.fallbackAttempted = '1';
            img.src = fallbackThumb;
          } else {
            img.style.display = 'none';
          }
        };
        img.src = primaryThumb;
        thumbWrap.appendChild(img);
      }

      const idxTag = document.createElement('span');
      idxTag.className = 'playlist-index-tag';
      idxTag.textContent = `#${i + 1}`;
      thumbWrap.appendChild(idxTag);

      if (vid.duration) {
        const durTag = document.createElement('span');
        durTag.className = 'playlist-duration-tag';
        durTag.textContent = String(vid.duration);
        thumbWrap.appendChild(durTag);
      }

      const meta = document.createElement('div');
      meta.className = 'playlist-card-meta';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'playlist-card-title';
      titleDiv.textContent = vid.title || `Video ${i + 1}`;

      const badges = document.createElement('div');
      badges.className = 'playlist-card-badges';

      const nowPill = document.createElement('span');
      nowPill.className = 'playlist-now-pill';
      nowPill.textContent = '▶ Playing';
      nowPill.style.display = i === activeVideoIndex ? 'inline-block' : 'none';
      badges.appendChild(nowPill);

      const szText = vid.size ? formatBytes(vid.size) : '';
      if (szText) {
        const szSpan = document.createElement('span');
        szSpan.textContent = `📦 ${szText}`;
        badges.appendChild(szSpan);
      }
      if (vid.quality) {
        const qSpan = document.createElement('span');
        qSpan.textContent = String(vid.quality);
        badges.appendChild(qSpan);
      }

      meta.appendChild(titleDiv);
      meta.appendChild(badges);
      btn.appendChild(thumbWrap);
      btn.appendChild(meta);
      btn.addEventListener('click', () => {
        if (i !== activeVideoIndex) {
          selectPlaylistVideo(i, true);
        }
      });

      li.appendChild(btn);
      playlistList.appendChild(li);
    });

    playlistSection.style.display = 'block';
    updatePlaylistActiveState();
  }

  function selectPlaylistVideo(index, autoPlayNow = isChannelUnlocked, triggerDlCheck = false) {
    if (!Array.isArray(playlistVideos) || playlistVideos.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(index, playlistVideos.length - 1));
    activeVideoIndex = clampedIdx;
    const vid = playlistVideos[clampedIdx];
    activeFileId = String(vid.fileId || vid._id || '');

    hasRenderedVideoFrame = false;
    resetScrubberUi();
    errorOverlay.style.display = 'none';
    if (videoPosterOverlay) videoPosterOverlay.style.display = 'none';

    const title = vid.title || cleanTitle || 'TeraBox Video';
    const sizeFormatted = vid.size ? formatBytes(vid.size) : (playlistVideos.length === 1 ? cleanSize : '');

    topVideoTitle.textContent = playlistVideos.length > 1 ? `[${clampedIdx + 1}/${playlistVideos.length}] ${title}` : title;
    videoTitleElem.textContent = title;
    document.title = `${title} — TeravidsPlay`;

    if (sizeFormatted) {
      fileSizeElem.textContent = `📦 ${sizeFormatted}`;
      fileSizeElem.style.display = 'inline';
    } else {
      fileSizeElem.style.display = 'none';
    }

    const thumb = vid.thumbnailUrl || (clampedIdx === 0 ? cleanThumb : '');
    if (thumb) setVideoPoster(thumb);

    try {
      const nextUrl = new URL(window.location.href);
      if (playlistVideos.length > 1) {
        nextUrl.searchParams.set('idx', String(clampedIdx));
      }
      window.history.replaceState(null, '', nextUrl.toString());
    } catch (e) {}

    updatePlaylistActiveState();

    const hlsEntries = [
      ...extractStreamMapEntries(vid.fast_stream_url),
      ...extractStreamMapEntries(vid.hls_url),
    ];
    const priorityOrder = ['1080p', '720p', '480p', '360p', 'Auto'];
    hlsEntries.sort((a, b) => {
      const ia = priorityOrder.indexOf(a.label);
      const ib = priorityOrder.indexOf(b.label);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const rawMp4 = vid.original_quality_url || vid.stream_url || vid.mp4_url_fast || vid.mp4_url_slow || '';
    const mp4Url = isSafeHttpUrl(rawMp4) ? rawMp4 : '';
    const qualityList = [];
    const seenQ = new Set();
    for (const e of hlsEntries) {
      if (!seenQ.has(e.label)) {
        seenQ.add(e.label);
        qualityList.push({ id: `q-${e.label}`, label: e.label, url: e.url });
      }
    }
    if (mp4Url) {
      qualityList.push({ id: 'q-mp4', label: 'Original MP4', url: mp4Url });
    }

    availableQualities = qualityList;
    const primaryOpt = qualityList[0];
    activeQualityId = primaryOpt ? primaryOpt.id : 'auto';
    renderQualityOptions(availableQualities, activeQualityId);

    setDownloadTargets(mp4Url, title, Boolean(mp4Url), clampedIdx, activeFileId);

    const hasPlayableHls = hlsEntries.length > 0;
    if (triggerDlCheck) {
      if (urlParams.get('nodl') === '1' && !mp4Url && hasPlayableHls) {
        showToast('Direct MP4 unavailable — streaming in HD!');
      } else if (urlParams.get('dl') === '1' && mp4Url) {
        const dlTarget = toProxyUrl(mp4Url, { dl: true, filename: title });
        const a = document.createElement('a');
        a.href = dlTarget;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('🚀 Fast Download Started!');
      }
    }

    // Build ordered multi-tier playback queue: HLS (proxied if blocked) -> MP4 (proxied + direct)
    const allCandidates = [];
    for (const e of hlsEntries.slice(0, 2)) {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        allCandidates.push(...buildCandidatesForSingleUrl(e.url));
      }
    }
    if (mp4Url) {
      allCandidates.push(...buildCandidatesForSingleUrl(mp4Url));
    }
    // Native HLS Safari fallback if Hls.js isn't supported
    if (allCandidates.length === 0 && hlsEntries[0]?.url) {
      allCandidates.push(...buildCandidatesForSingleUrl(hlsEntries[0].url));
    }

    if (allCandidates.length === 0) {
      showError(
        'Stream Temporarily Unavailable',
        'Streaming servers are busy right now. Tap Try Again below or explore @teravidsplayer.'
      );
      return;
    }

    startCandidateQueue(allCandidates, 0, autoPlayNow);
  }

  if (prevVideoBtn) {
    prevVideoBtn.addEventListener('click', () => {
      if (prevVideoBtn.getAttribute('aria-disabled') === 'true') return;
      if (activeVideoIndex > 0) selectPlaylistVideo(activeVideoIndex - 1, true);
    });
  }

  if (nextVideoBtn) {
    nextVideoBtn.addEventListener('click', () => {
      if (nextVideoBtn.getAttribute('aria-disabled') === 'true') return;
      if (activeVideoIndex + 1 < playlistVideos.length) selectPlaylistVideo(activeVideoIndex + 1, true);
    });
  }

  // 21. Video Resolver for TeraBox Short IDs, Folders & Supported Links (?v=... or ?url=...)
  async function resolveAndPlay(targetIdOrUrl, bypassCache = false) {
    hasRenderedVideoFrame = false;
    loader.classList.remove('hidden');
    loaderText.textContent = 'Resolving video details...';
    errorOverlay.style.display = 'none';

    try {
      const resolveParams = new URLSearchParams({ surl: targetIdOrUrl });
      if (rawPathParam && !/path=/i.test(targetIdOrUrl)) {
        resolveParams.set('path', rawPathParam);
      }
      if (bypassCache) {
        resolveParams.set('fresh', '1');
      }

      const workerEndpoint = `${WORKER_BASE}/api/resolve?${resolveParams.toString()}`;
      const res = await fetch(workerEndpoint).catch(() => null);
      let data = null;
      if (res) {
        try {
          data = await res.json();
        } catch (e) {}
      }

      if (data && data.surl) {
        const canonical = normalizeSurlToken(String(data.surl));
        if (canonical) resolvedSurl = canonical;
      }

      if (data?.requires_auth_api) {
        const pm = data.partial_metadata || {};
        if (pm.title) {
          topVideoTitle.textContent = pm.title;
          videoTitleElem.textContent = pm.title;
          document.title = `${pm.title} — TeravidsPlay`;
        }
        if (pm.size) {
          fileSizeElem.textContent = `📦 ${formatBytes(pm.size)}`;
          fileSizeElem.style.display = 'inline';
        }
        if (pm.thumbnailUrl) {
          setVideoPoster(pm.thumbnailUrl);
        }
        setDownloadTargets('', pm.title || 'TeravidsPlay_Video', false);
        showError(
          'DiskWala Auth Required',
          'DiskWala restricts web streaming unless authenticated DiskWala API credentials are configured on the server.'
        );
        return;
      }

      if (data && data.success && Array.isArray(data.videos) && data.videos.length > 0) {
        playlistVideos = data.videos;
        if (data.dirPath) activeDirPath = data.dirPath;

        let initialIdx = requestedIdx;
        if (requestedFid) {
          const matched = playlistVideos.findIndex(
            (v) => v && (String(v.fileId || '') === requestedFid || String(v._id || '') === requestedFid)
          );
          if (matched >= 0) initialIdx = matched;
        }
        initialIdx = Math.max(0, Math.min(initialIdx, playlistVideos.length - 1));
        activeVideoIndex = initialIdx;

        renderPlaylistSection(playlistVideos);
        selectPlaylistVideo(initialIdx, isChannelUnlocked, true);
        return;
      }

      // Even if stream extraction failed, display any partial metadata & preview thumbnail
      const partial = data?.partial_metadata;
      if (partial) {
        if (partial.title) {
          topVideoTitle.textContent = partial.title;
          videoTitleElem.textContent = partial.title;
          document.title = `${partial.title} — TeravidsPlay`;
        }
        if (partial.size) {
          fileSizeElem.textContent = `📦 ${formatBytes(partial.size)}`;
          fileSizeElem.style.display = 'inline';
        }
        if (partial.thumbnailUrl) {
          setVideoPoster(partial.thumbnailUrl);
        }
      }
      setDownloadTargets('', partial?.title || cleanTitle || 'TeravidsPlay_Video', false);
      showError('Video Unavailable', 'Could not resolve stream right now. Tap Try Again or check @teravidsplayer.');
    } catch (err) {
      showError('Connection Error', 'Failed to connect to streaming engine. Please try again.');
    }
  }

  // 22. Share Listeners with Clipboard + ExecCommand Fallback
  function legacyCopy(text) {
    const previousFocus = document.activeElement;
    const field = Object.assign(document.createElement('textarea'), { value: text });
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
    document.body.append(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch (e) {
      return false;
    } finally {
      field.remove();
      previousFocus?.focus({ preventScroll: true });
    }
  }

  async function triggerShare() {
    let shareUrl = window.location.href;
    const shareToken = resolvedSurl || vId;
    if (shareToken) {
      const shareParams = new URLSearchParams({ v: shareToken, tg: '1' });
      if (activeDirPath) shareParams.set('path', activeDirPath);
      if (playlistVideos.length > 1) shareParams.set('idx', String(activeVideoIndex));
      shareUrl = `${window.location.origin}/?${shareParams.toString()}`;
    } else if (resolveInput) {
      const shareParams = new URLSearchParams({ url: resolveInput, tg: '1' });
      if (activeDirPath) shareParams.set('path', activeDirPath);
      if (playlistVideos.length > 1) shareParams.set('idx', String(activeVideoIndex));
      shareUrl = `${window.location.origin}/?${shareParams.toString()}`;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: topVideoTitle.textContent || cleanTitle, url: shareUrl });
        return;
      } catch (err) {}
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('🔗 Video link copied!');
        return;
      }
    } catch (e) {}
    if (legacyCopy(shareUrl)) {
      showToast('🔗 Video link copied!');
    } else {
      showToast('Unable to copy link');
    }
  }

  if (topShareBtn) topShareBtn.addEventListener('click', triggerShare);
  if (btnShareExt) btnShareExt.addEventListener('click', triggerShare);

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (resolveInput) resolveAndPlay(resolveInput, true);
      else if (streamUrl) loadStream(streamUrl, cleanThumb);
    });
  }

  // 23. Initiate Playback
  if (resolveInput) {
    resolveAndPlay(resolveInput);
  } else if (streamUrl) {
    setDownloadTargets(streamUrl, cleanTitle || 'TeravidsPlay_Video');
    if (urlParams.get('dl') === '1') {
      const a = document.createElement('a');
      a.href = shouldProxyUrl(streamUrl) ? toProxyUrl(streamUrl, { dl: true, filename: cleanTitle }) : streamUrl;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('🚀 Fast Download Started!');
    }
    loadStream(streamUrl, cleanThumb);
  }
});
