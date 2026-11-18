// TeravidsPlay — Official Integrated Cinema Player Engine
// Features: Full-Width Theater Mode, In-Viewport YouTube Controls,
// Interactive Settings Popover (Speed, Quality, Boost, Fit),
// Web Audio 300% Boost, 4X Ultra Turbo Long-Press, Telegram Auto-Unlock,
// Triple-Tier Stream Decoder with Cloudflare Edge Proxy Fallback.

document.addEventListener('DOMContentLoaded', () => {
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
  const playerTopBar = document.getElementById('playerTopBar');
  const playerBottomBar = document.getElementById('playerBottomBar');
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
  const externalDownloadBtn = document.getElementById('externalDownloadBtn');

  // Below-player metadata & external actions
  const videoTitleElem = document.getElementById('videoTitle');
  const fileSizeElem = document.getElementById('fileSize');
  const btnDownloadExt = document.getElementById('btnDownloadExt');
  const btnShareExt = document.getElementById('btnShareExt');
  const ambientCanvas = document.getElementById('ambientCanvas');

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

  function showToast(text) {
    if (resumeToast && resumeToastText) {
      resumeToastText.textContent = text;
      resumeToast.style.display = 'block';
      setTimeout(() => { resumeToast.style.display = 'none'; }, 2400);
    }
  }

  // 3. Parse Parameters & Telegram Auto-Unlock
  const urlParams = new URLSearchParams(window.location.search);
  let vId = urlParams.get('v') || urlParams.get('s') || '';
  if (!vId) {
    const pathMatch = window.location.pathname.match(/\/(v|s)\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) {
      vId = pathMatch[2];
    }
  }
  let rawStream = urlParams.get('stream') || '';
  const rawTitle = urlParams.get('title') || '';
  const rawSize = urlParams.get('size') || '';
  const rawThumb = urlParams.get('thumb') || '';
  const fromTg = urlParams.get('tg') === '1' || urlParams.get('from') === 'tg' || Boolean(tg?.initData);

  if (rawStream.startsWith('b64:')) {
    try { rawStream = atob(rawStream.slice(4)); } catch (e) {}
  }

  let streamUrl = safeDecode(rawStream);
  const cleanTitle = safeDecode(rawTitle);
  const cleanSize = safeDecode(rawSize);
  const cleanThumb = safeDecode(rawThumb);

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

  function checkChannelGate() {
    if (isChannelUnlocked) {
      if (channelGateOverlay) channelGateOverlay.style.display = 'none';
    } else {
      if (channelGateOverlay) channelGateOverlay.style.display = 'flex';
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
      showToast('🎉 Video Unlocked!');
      videoElement.play().catch(() => {
        updatePlayIcons();
      });
    });
  }

  // View Switching
  const hasMedia = Boolean(vId || streamUrl);

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
      videoElement.poster = cleanThumb;
    }
  } else {
    activateHomeView();
  }

  // 4. Auto-Hiding Controls Engine & Single/Double Tap System
  let controlsTimeout = null;
  let tapTimer = null;
  let tapCount = 0;

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
    if (settingsMenu) settingsMenu.style.display = 'none';
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
  function triggerCenterRipple(type) {
    if (!centerActionRipple) return;
    centerActionRipple.innerHTML = type === 'play'
      ? '<svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>'
      : '<svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    centerActionRipple.style.display = 'flex';
    centerActionRipple.classList.remove('animate');
    void centerActionRipple.offsetWidth;
    centerActionRipple.classList.add('animate');
    setTimeout(() => {
      centerActionRipple.classList.remove('animate');
      setTimeout(() => {
        centerActionRipple.style.display = 'none';
      }, 200);
    }, 320);
  }

  // Unified Mobile/Desktop Tap & Gesture System:
  // - Tap in Center Zone (25% - 75% width): Toggles Play / Pause with instant animated ripple!
  // - Tap in Left (<25%): 1 Tap toggles controls, Double Tap rewinds 10s!
  // - Tap in Right (>75%): 1 Tap toggles controls, Double Tap fast-forwards 10s!
  playerContainer.addEventListener('click', (e) => {
    // If clicking a button, input, link, or popovers, allow direct event and keep controls alive
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('.scrubber-container') || e.target.closest('.settings-popover') || e.target.closest('.channel-gate-card') || e.target.closest('.error-card')) {
      showControls(4000);
      return;
    }

    const rect = playerContainer.getBoundingClientRect();
    const touchX = (e.clientX !== undefined && e.clientX !== 0)
      ? e.clientX
      : ((e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || (e.touches && e.touches[0] && e.touches[0].clientX) || (rect.left + rect.width / 2));
    const clickX = touchX - rect.left;
    const ratio = clickX / rect.width;

    const isCenterZone = ratio >= 0.25 && ratio <= 0.75;
    const isLeftSide = ratio < 0.25;
    const isRightSide = ratio > 0.75;

    // Center zone tap immediately toggles Play / Pause!
    if (isCenterZone) {
      togglePlay();
      showControls(3500);
      return;
    }

    tapCount++;
    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
        toggleControls();
      }, 260);
    } else if (tapCount === 2) {
      clearTimeout(tapTimer);
      tapCount = 0;
      if (isRightSide) {
        videoElement.currentTime = Math.min(videoElement.duration || 0, videoElement.currentTime + 10);
        showRipple('right');
      } else if (isLeftSide) {
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        showRipple('left');
      }
      showControls(3500);
    }
  });

  // 5. Play / Pause Control
  function updatePlayIcons() {
    const isPlaying = !videoElement.paused;
    if (isPlaying) {
      playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
      centerPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
      centerPlayBtn.setAttribute('aria-label', 'Pause Video');
      centerPlayBtn.title = 'Pause Video';
      centerPlayBtn.classList.remove('hidden');
    } else {
      playIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
      centerPlayIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
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
        triggerCenterRipple('play');
      });
    } else {
      videoElement.pause();
      triggerCenterRipple('pause');
    }
    updatePlayIcons();
  }

  function handleCenterPlayTap(e) {
    e.preventDefault();
    e.stopPropagation();
    togglePlay();
    showControls(3500);
  }

  if (playBtn) playBtn.addEventListener('click', togglePlay);
  if (centerPlayBtn) {
    centerPlayBtn.addEventListener('click', handleCenterPlayTap);
    centerPlayBtn.addEventListener('touchend', handleCenterPlayTap);
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
      videoElement.currentTime = Math.min(videoElement.duration || 0, videoElement.currentTime + 10);
      showRipple('right');
    });
  }

  function showRipple(dir) {
    if (dir === 'left' && rippleLeft) {
      rippleLeft.style.display = 'flex';
      setTimeout(() => { rippleLeft.style.display = 'none'; }, 380);
    } else if (dir === 'right' && rippleRight) {
      rippleRight.style.display = 'flex';
      setTimeout(() => { rippleRight.style.display = 'none'; }, 380);
    }
  }

  // 7. Interactive Red Scrubber
  let isScrubbing = false;

  function updateScrubber() {
    if (!videoElement.duration || isScrubbing) return;
    const progress = (videoElement.currentTime / videoElement.duration) * 100;
    scrubberProgress.style.width = `${progress}%`;
    scrubberThumb.style.left = `${progress}%`;
    currentTimeElem.textContent = formatTime(videoElement.currentTime);
    durationTimeElem.textContent = formatTime(videoElement.duration);

    // Update Buffer
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
    durationTimeElem.textContent = formatTime(videoElement.duration);
    checkResume();
  });

  function getScrubberX(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
    return e.clientX || 0;
  }

  function seekToPosition(e) {
    const rect = scrubberContainer.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(getScrubberX(e) - rect.left, rect.width));
    const pct = clickX / rect.width;
    videoElement.currentTime = pct * videoElement.duration;
    scrubberProgress.style.width = `${pct * 100}%`;
    scrubberThumb.style.left = `${pct * 100}%`;
    currentTimeElem.textContent = formatTime(videoElement.currentTime);
  }

  // Mouse seek
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

  // Touch seek for Mobile
  scrubberContainer.addEventListener('touchstart', (e) => {
    isScrubbing = true;
    showControls(5000);
    seekToPosition(e);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isScrubbing) {
      seekToPosition(e);
      const rect = scrubberContainer.getBoundingClientRect();
      const hoverX = Math.max(0, Math.min(getScrubberX(e) - rect.left, rect.width));
      const pct = hoverX / rect.width;
      if (videoElement.duration) {
        scrubberTooltip.textContent = formatTime(pct * videoElement.duration);
        scrubberTooltip.style.left = `${hoverX}px`;
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
    const rect = scrubberContainer.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = hoverX / rect.width;
    if (videoElement.duration) {
      scrubberTooltip.textContent = formatTime(pct * videoElement.duration);
      scrubberTooltip.style.left = `${hoverX}px`;
      scrubberTooltip.style.display = 'block';
    }
  });

  scrubberContainer.addEventListener('mouseleave', () => {
    scrubberTooltip.style.display = 'none';
  });

  // 8. Volume & Mute Controls
  function updateVolumeIcon() {
    if (videoElement.muted || videoElement.volume === 0) {
      volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
    } else if (videoElement.volume < 0.5) {
      volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
    } else {
      volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
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

  // 9. Web Audio API 300% Sound Booster (Integrated)
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
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (gainNode) gainNode.gain.value = audioBoostLevel;
    const label = `${Math.round(audioBoostLevel * 100)}%`;
    if (audioBoostLabel) audioBoostLabel.textContent = `Boost: ${label}`;
    if (settingsCurrentBoost) settingsCurrentBoost.textContent = label;
    if (audioBoostBtn) audioBoostBtn.classList.toggle('active-pill', audioBoostLevel > 1.0);

    // Update active check in boost subview
    document.querySelectorAll('#subviewBoost .option-item').forEach(el => {
      const b = parseFloat(el.getAttribute('data-boost'));
      if (b === audioBoostLevel) {
        el.classList.add('active-option');
        el.innerHTML = `${el.textContent.replace(' ✓', '')} <span class="check">✓</span>`;
      } else {
        el.classList.remove('active-option');
        el.innerHTML = el.textContent.replace(' ✓', '');
      }
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
    if (aspectRatioLabel) aspectRatioLabel.textContent = label;
    if (settingsCurrentFit) settingsCurrentFit.textContent = label;

    document.querySelectorAll('#subviewFit .option-item').forEach(el => {
      if (el.getAttribute('data-fit') === mode) {
        el.classList.add('active-option');
        el.innerHTML = `${el.textContent.replace(' ✓', '')} <span class="check">✓</span>`;
      } else {
        el.classList.remove('active-option');
        el.innerHTML = el.textContent.replace(' ✓', '');
      }
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
      if (spd === val) {
        el.classList.add('active-option');
        el.innerHTML = `${el.textContent.replace(' ✓', '')} <span class="check">✓</span>`;
      } else {
        el.classList.remove('active-option');
        el.innerHTML = el.textContent.replace(' ✓', '');
      }
    });
    showToast(`⚡ Speed: ${label}`);
  }

  // 12. Settings Popover Submenu Navigation
  function showSettingsMain() {
    settingsTitle.textContent = 'Playback Settings';
    settingsMainView.style.display = 'block';
    subviewSpeed.style.display = 'none';
    subviewQuality.style.display = 'none';
    subviewBoost.style.display = 'none';
    subviewFit.style.display = 'none';
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = settingsMenu.style.display === 'block';
      if (isVisible) {
        settingsMenu.style.display = 'none';
      } else {
        showSettingsMain();
        settingsMenu.style.display = 'block';
        showControls();
      }
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsMenu.style.display = 'none';
    });
  }

  // Light dismiss settings menu when tapping outside
  document.addEventListener('click', (e) => {
    if (settingsMenu && settingsMenu.style.display === 'block') {
      if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
        settingsMenu.style.display = 'none';
      }
    }
  });

  // Row Clicks
  if (rowSpeed) {
    rowSpeed.addEventListener('click', () => {
      settingsTitle.textContent = 'Playback Speed';
      settingsMainView.style.display = 'none';
      subviewSpeed.style.display = 'block';
    });
  }

  if (rowQuality) {
    rowQuality.addEventListener('click', () => {
      settingsTitle.textContent = 'Resolution & Quality';
      settingsMainView.style.display = 'none';
      subviewQuality.style.display = 'block';
    });
  }

  if (rowBoost) {
    rowBoost.addEventListener('click', () => {
      settingsTitle.textContent = 'Audio Boost (Web Audio)';
      settingsMainView.style.display = 'none';
      subviewBoost.style.display = 'block';
    });
  }

  if (rowFit) {
    rowFit.addEventListener('click', () => {
      settingsTitle.textContent = 'Screen Fit Mode';
      settingsMainView.style.display = 'none';
      subviewFit.style.display = 'block';
    });
  }

  // Back Buttons
  document.querySelectorAll('.subview-back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSettingsMain();
    });
  });

  // Speed Option Select
  document.querySelectorAll('#subviewSpeed .option-item').forEach(item => {
    item.addEventListener('click', () => {
      const spd = item.getAttribute('data-speed');
      setSpeed(spd);
      showSettingsMain();
    });
  });

  // Quality Option Select
  document.querySelectorAll('#subviewQuality .option-item').forEach(item => {
    item.addEventListener('click', () => {
      const q = item.getAttribute('data-quality');
      if (settingsCurrentQuality) settingsCurrentQuality.textContent = item.textContent.replace(' ✓', '');
      document.querySelectorAll('#subviewQuality .option-item').forEach(el => {
        el.classList.toggle('active-option', el === item);
        el.innerHTML = el === item ? `${el.textContent.replace(' ✓', '')} <span class="check">✓</span>` : el.textContent.replace(' ✓', '');
      });
      showToast(`Quality: ${item.textContent.replace(' ✓', '')}`);
      showSettingsMain();
    });
  });

  // Boost Option Select
  document.querySelectorAll('#subviewBoost .option-item').forEach(item => {
    item.addEventListener('click', () => {
      const b = parseFloat(item.getAttribute('data-boost'));
      setBoostLevel(b);
      showSettingsMain();
    });
  });

  // Fit Option Select
  document.querySelectorAll('#subviewFit .option-item').forEach(item => {
    item.addEventListener('click', () => {
      const f = item.getAttribute('data-fit');
      const label = f === 'contain' ? 'Fit (16:9)' : (f === 'cover' ? 'Fill (Crop)' : 'Stretch');
      setAspectMode(f, label);
      showSettingsMain();
    });
  });

  // Close Settings on Click Outside
  window.addEventListener('click', (e) => {
    if (settingsMenu && settingsMenu.style.display === 'block' && !e.target.closest('.settings-popover') && !e.target.closest('#settingsBtn')) {
      settingsMenu.style.display = 'none';
    }
  });

  // 13. Fullscreen Toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (playerContainer.requestFullscreen) playerContainer.requestFullscreen();
      else if (videoElement.webkitEnterFullscreen) videoElement.webkitEnterFullscreen();
      fullscreenIcon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>';
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      fullscreenIcon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>';
    }
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

  // 13.1 Video Screen Rotation (Only for Mobile Screens)
  let isMobileLandscapeRotated = false;

  async function toggleVideoRotation() {
    isMobileLandscapeRotated = !isMobileLandscapeRotated;

    // 1. Try Screen Orientation API (Android Chrome, Edge)
    if (screen.orientation && screen.orientation.lock) {
      try {
        if (isMobileLandscapeRotated) {
          await screen.orientation.lock('landscape');
          showToast('🔄 Rotated to Landscape');
          return;
        } else {
          await screen.orientation.lock('portrait');
          showToast('📱 Rotated to Portrait');
          return;
        }
      } catch (err) {
        // Fallback to in-player virtual rotation if lock is rejected or not supported
      }
    }

    // 2. Hardware / CSS In-Player 90-Degree Virtual Rotation
    // Works 100% on iOS Safari, Android WebViews, Telegram in-app browser, even with Phone Auto-Rotate Lock ON!
    if (isMobileLandscapeRotated) {
      playerContainer.classList.add('mobile-force-landscape');
      document.body.classList.add('mobile-rotated-active');
      showToast('🔄 Landscape Mode Activated');
      showControls(3500);
    } else {
      playerContainer.classList.remove('mobile-force-landscape');
      document.body.classList.remove('mobile-rotated-active');
      showToast('📱 Portrait Mode Activated');
      showControls(3500);
    }
  }

  if (rotateBtn) rotateBtn.addEventListener('click', toggleVideoRotation);
  if (topRotateBtn) topRotateBtn.addEventListener('click', toggleVideoRotation);

  // 14. Ultra Long-Press: 2X Speed & 4X Turbo Speed
  let pressTimer2x = null;
  let pressTimer4x = null;
  let isFastForwarding = false;
  let originalSpeed = 1.0;

  function startLongPress(e) {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('.scrubber-container') || e.target.closest('.settings-popover')) return;

    // Stage 1: Hold 350ms -> 2X Speed
    pressTimer2x = setTimeout(() => {
      isFastForwarding = true;
      originalSpeed = videoElement.playbackRate || 1.0;
      videoElement.playbackRate = 2.0;
      if (speedOverlay) {
        if (speedOverlayIcon) speedOverlayIcon.textContent = '⚡';
        if (speedOverlayText) speedOverlayText.textContent = '2X Speed';
        speedOverlay.style.display = 'block';
      }
    }, 350);

    // Stage 2: Ultra Hold past 1400ms -> 4X Ultra Turbo Speed
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
      videoElement.playbackRate = originalSpeed || 1.0;
      if (speedOverlay) speedOverlay.style.display = 'none';
    }
  }

  playerContainer.addEventListener('mousedown', startLongPress);
  window.addEventListener('mouseup', stopLongPress);
  playerContainer.addEventListener('touchstart', startLongPress, { passive: true });
  window.addEventListener('touchend', stopLongPress);

  // 15. Double-Tap Seek handled in unified gesture listener (Section 4)

  // 16. Swipe Gestures for Brightness & Volume
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

    if (!isSwiping && Math.abs(deltaY) > 15 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      isSwiping = true;
      const rect = playerContainer.getBoundingClientRect();
      activeHud = (touchStartX - rect.left) < rect.width / 2 ? 'brightness' : 'volume';
    }

    if (isSwiping) {
      const step = deltaY / 200;
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
        updateVolumeIcon();
      }
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isSwiping) {
      setTimeout(() => {
        if (brightnessHud) brightnessHud.style.display = 'none';
        if (volumeHud) volumeHud.style.display = 'none';
      }, 350);
      isSwiping = false;
    }
  });

  // 17. Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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
      case 'ArrowRight':
        e.preventDefault();
        videoElement.currentTime = Math.min(videoElement.duration || 0, videoElement.currentTime + 10);
        showRipple('right');
        break;
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

  // 18. Ambient Glow Canvas
  let ambientCtx = null;
  let ambientRaf = null;

  if (ambientCanvas) {
    try { ambientCtx = ambientCanvas.getContext('2d', { willReadFrequently: false }); } catch (e) {}
  }

  function drawAmbient() {
    if (!videoElement.paused && !videoElement.ended && ambientCtx) {
      try { ambientCtx.drawImage(videoElement, 0, 0, ambientCanvas.width, ambientCanvas.height); } catch (e) {}
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

  // 19. Auto-Resume from Last Position
  const storageKey = `teravids_pos_${vId || streamUrl.slice(-25) || 'default'}`;

  function checkResume() {
    let saved = null;
    try { saved = localStorage.getItem(storageKey); } catch (e) {}
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

  // 20. Multi-Tier Stream Loader (Direct -> No-CORS -> Edge Proxy -> HLS)
  let hlsInstance = null;
  let retryCount = 0;

  function loadStream(url, poster = '') {
    if (!url) {
      showError('Missing Stream URL', 'No valid stream URL was provided.');
      return;
    }

    if (poster) videoElement.poster = poster;

    loader.classList.remove('hidden');
    loaderText.textContent = 'Connecting high-speed stream...';
    errorOverlay.style.display = 'none';

    if (topDownloadBtn) topDownloadBtn.href = url;
    if (btnDownloadExt) btnDownloadExt.href = url;
    if (externalDownloadBtn) externalDownloadBtn.href = url;

    const isM3U8 = url.includes('.m3u8');

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (isM3U8 && Hls.isSupported()) {
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
        loader.classList.add('hidden');
        if (isChannelUnlocked) {
          videoElement.play().catch(() => {
            updatePlayIcons();
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
      // Direct MP4 playback
      videoElement.src = url;
      videoElement.load();
      if (isChannelUnlocked) {
        videoElement.play().catch(() => {
          updatePlayIcons();
        });
      }
    }
  }

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
    const currentSrc = videoElement.currentSrc || videoElement.src;

    // Retry via Cloudflare Edge Streaming Proxy
    if (currentSrc && !currentSrc.includes('workers.dev') && !currentSrc.startsWith('blob:') && !currentSrc.startsWith('data:') && retryCount === 0) {
      retryCount++;
      const proxiedUrl = `https://teravidsplay.proxyking.workers.dev/?url=${encodeURIComponent(currentSrc)}`;
      console.info('[TeravidsPlay] Retrying via Cloudflare Edge Streaming Proxy...');
      loaderText.textContent = 'Activating edge streaming proxy...';
      loader.classList.remove('hidden');
      videoElement.removeAttribute('crossorigin');
      videoElement.src = proxiedUrl;
      videoElement.load();
      if (isChannelUnlocked) {
        videoElement.play().catch(() => {
          updatePlayIcons();
        });
      }
      return;
    }

    showError('Playback Interrupted', 'Unable to decode video stream. The link may have expired or is blocked.');
  });

  function showError(heading, message) {
    loader.classList.add('hidden');
    errorHeading.textContent = heading;
    errorMsg.textContent = message;
    errorOverlay.style.display = 'flex';
  }

  // 21. Video Resolver for TeraBox Short IDs (?v=...)
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

      // 2. Direct edge resolver fallback with domain cycling
      if (!data || !data.success) {
        const cleanSurl = surl.startsWith('1') ? surl : '1' + surl;
        const candidates = [
          `https://terabox.com/s/${cleanSurl}`,
          `https://1024terabox.com/s/${cleanSurl}`,
          `https://teraboxapp.com/s/${cleanSurl}`
        ];
        for (const cand of candidates) {
          try {
            const directResp = await fetch('https://iteraplay.in/api/videos/import', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://iteraplay.in/',
                'Origin': 'https://iteraplay.in',
              },
              body: JSON.stringify({ url: cand }),
            });
            if (directResp.ok) {
              const candData = await directResp.json();
              if (candData && candData.success && candData.videos && candData.videos.length > 0) {
                data = candData;
                break;
              }
            }
          } catch (e) {}
        }
      }

      if (data && data.success && data.videos && data.videos.length > 0) {
        const vid = data.videos[0];
        const title = vid.title || cleanTitle || 'TeraBox Video';
        const sizeFormatted = vid.size ? `${(vid.size / (1024 * 1024)).toFixed(1)} MB` : cleanSize;

        topVideoTitle.textContent = title;
        videoTitleElem.textContent = title;
        document.title = `${title} — TeravidsPlay`;

        if (sizeFormatted) {
          fileSizeElem.textContent = `📦 ${sizeFormatted}`;
          fileSizeElem.style.display = 'inline';
        }

        const thumb = vid.thumbnailUrl || cleanThumb;
        if (thumb) videoElement.poster = thumb;

        const fastMap = vid.fast_stream_url || {};
        const hlsCandidate = fastMap['1080p'] || fastMap['720p'] || fastMap['480p'] || fastMap['360p'] || vid.hls_url;
        const playSource = (Hls.isSupported() && hlsCandidate) ? hlsCandidate : (vid.stream_url || hlsCandidate);

        const dlUrl = vid.stream_url || playSource;
        if (topDownloadBtn) topDownloadBtn.href = dlUrl;
        if (btnDownloadExt) btnDownloadExt.href = dlUrl;

        // Auto trigger download if ?dl=1 requested
        if (urlParams.get('dl') === '1' && dlUrl) {
          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = title || 'video.mp4';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast('🚀 Fast Download Started!');
        }

        loadStream(playSource, thumb);
        return;
      }
      showError('Video Unavailable', 'Could not resolve stream for this link. It may have expired or is private.');
    } catch (err) {
      showError('Connection Error', 'Failed to connect to streaming engine. Please try again.');
    }
  }

  // 22. Share Listeners
  async function triggerShare() {
    const shareUrl = vId ? `${window.location.origin}/v/${vId}` : window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: topVideoTitle.textContent || cleanTitle, url: shareUrl });
        return;
      } catch (err) {}
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      showToast('🔗 Video link copied!');
    }
  }

  if (topShareBtn) topShareBtn.addEventListener('click', triggerShare);
  if (btnShareExt) btnShareExt.addEventListener('click', triggerShare);

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      retryCount = 0;
      if (vId) resolveAndPlay(vId);
      else if (streamUrl) loadStream(streamUrl);
    });
  }

  // 23. Initiate Playback
  if (vId) {
    resolveAndPlay(vId);
  } else if (streamUrl) {
    if (urlParams.get('dl') === '1') {
      const a = document.createElement('a');
      a.href = streamUrl;
      a.download = cleanTitle || 'video.mp4';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('🚀 Fast Download Started!');
    }
    loadStream(streamUrl, cleanThumb);
  }
});
