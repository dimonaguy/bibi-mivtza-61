    const ASSET_DIR = 'assets/';
    const EXT_CANDIDATES = ['.png', '.jpg', '.jpeg', '.webp', '.mp3'];
    const knownAssets = new Set();
    let gameData = null;
    let currentState = {};
    let bgMusicStarted = false;
    let currentHoverAudio = null;
    let endAudio = null;
    const resolveCache = new Map();

    const titleEl = document.getElementById('node-title');
    const descEl = document.getElementById('node-desc');
    const stageBgEl = document.getElementById('stage-bg');
    const overlayContainer = document.getElementById('overlay-container');
    const protagonistEl = document.getElementById('protagonist');
    const creatorEl = document.getElementById('creator-credit');
    const bgMusicEl = document.getElementById('bg-music');
    const mobileChoicesEl = document.getElementById('mobile-choices');

    function assetUrl(name) {
      return ASSET_DIR + encodeURI(name);
    }

    function stripExt(name) {
      const i = name.lastIndexOf('.');
      return i >= 0 ? name.slice(0, i) : name;
    }

    function getExt(name) {
      const i = name.lastIndexOf('.');
      return i >= 0 ? name.slice(i) : '';
    }

    function isAudioName(name) {
      return /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(name);
    }

    /** Resolve a JSON asset name via embedded data URLs, then assets/ with ext swap. */
    function resolveAsset(name) {
      if (!name) return null;
      if (resolveCache.has(name)) return resolveCache.get(name);

      const data = window.ASSET_DATA || {};
      const aliases = window.ASSET_ALIASES || {};

      function fromData(key) {
        if (data[key]) return data[key];
        if (aliases[key] && data[aliases[key]]) return data[aliases[key]];
        return null;
      }

      // Prefer embedded ASSET_DATA for audio (GitHub Pages may lack binary assets/).
      if (isAudioName(name)) {
        const base = stripExt(name);
        const candidates = [name];
        if (aliases[name]) candidates.push(aliases[name]);
        for (const ext of ['.mp3', '.wav', '.ogg', '.m4a']) {
          const cand = base + ext;
          if (!candidates.includes(cand)) candidates.push(cand);
        }
        for (const cand of candidates) {
          const embedded = fromData(cand);
          if (embedded) {
            resolveCache.set(name, embedded);
            return embedded;
          }
        }
        for (const cand of candidates) {
          if (knownAssets.size === 0 || knownAssets.has(cand) || aliases[cand]) {
            const url = assetUrl(cand);
            resolveCache.set(name, url);
            return url;
          }
        }
      }

      let url = fromData(name);
      if (url) {
        resolveCache.set(name, url);
        return url;
      }

      const base = stripExt(name);
      const tried = new Set([getExt(name).toLowerCase()]);
      for (const ext of EXT_CANDIDATES) {
        if (tried.has(ext)) continue;
        const cand = base + ext;
        url = fromData(cand);
        if (url) {
          resolveCache.set(name, url);
          return url;
        }
        if (knownAssets.has(cand)) {
          url = assetUrl(cand);
          resolveCache.set(name, url);
          return url;
        }
      }

      if (knownAssets.size === 0 || knownAssets.has(name)) {
        url = assetUrl(name);
      } else {
        url = assetUrl(name);
      }
      resolveCache.set(name, url);
      return url;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function getColorForValue(val, isMandates = false) {
      if (isMandates) return val >= 61 ? '#4ade80' : (val < 55 ? '#ef4444' : '#facc15');
      return val >= 70 ? '#4ade80' : (val <= 30 ? '#ef4444' : '#fff');
    }

    function animateStatUpdate(elementId, newValue, isMandates = false) {
      const el = document.getElementById(elementId);
      const currentText = el.innerText.replace('%', '');
      if (String(currentText) !== String(newValue)) {
        el.classList.remove('stat-pop');
        void el.offsetWidth;
        el.innerText = isMandates ? String(newValue) : newValue + '%';
        el.style.color = getColorForValue(newValue, isMandates);
        el.classList.add('stat-pop');
      }
    }

    function updateStatusBar() {
      animateStatUpdate('stat-mandates', currentState.mandates, true);
      animateStatUpdate('stat-us', currentState.us_relations);
      animateStatUpdate('stat-likud', currentState.likud_stability);
      animateStatUpdate('stat-coalition', currentState.coalition_stability);
    }

    function prepareBgMusic() {
      if (!gameData || !bgMusicEl) return;
      const bgName = gameData.gameSettings.background_audio;
      if (!bgName) return;
      const file = bgName.endsWith('.mp3') ? bgName : (stripExt(bgName) + '.mp3');
      const data = window.ASSET_DATA || {};
      const dataUrl = data[file] || null;
      const fileUrl = assetUrl(file);
      const primary = dataUrl || fileUrl;
      const fallback = dataUrl ? fileUrl : (dataUrl || '');
      bgMusicEl.loop = true;
      bgMusicEl.volume = 0.9;
      bgMusicEl.dataset.fallback = (fallback && fallback !== primary) ? fallback : '';
      if (bgMusicEl.getAttribute('data-src-ready') !== primary) {
        bgMusicEl.src = primary;
        bgMusicEl.setAttribute('data-src-ready', primary);
        try { bgMusicEl.load(); } catch (_) {}
      }
    }

    function initAudio() {
      if (!gameData) return;
      prepareBgMusic();
      if (bgMusicStarted) {
        if (bgMusicEl.paused) {
          bgMusicEl.play().catch(() => {});
        }
        return;
      }
      const markStarted = () => { bgMusicStarted = true; hideMusicHint(); };
      const attempt = () => {
        const p = bgMusicEl.play();
        if (p && typeof p.then === 'function') {
          p.then(markStarted).catch(() => {
            const fb = bgMusicEl.dataset.fallback;
            if (fb && bgMusicEl.src !== fb) {
              bgMusicEl.src = fb;
              try { bgMusicEl.load(); } catch (_) {}
              bgMusicEl.play().then(markStarted).catch(() => {});
            }
          });
        }
      };
      attempt();
    }

    function hideMusicHint() {
      const hint = document.getElementById('music-hint');
      if (hint) hint.style.display = 'none';
    }

    function stopHoverAudio() {
      if (currentHoverAudio) {
        currentHoverAudio.pause();
        currentHoverAudio.currentTime = 0;
        currentHoverAudio = null;
      }
    }

    function playOnce(url) {
      if (!url) return;
      stopHoverAudio();
      currentHoverAudio = new Audio(url);
      currentHoverAudio.play().catch(() => {});
    }

    function playHoverAudio(audioName) {
      if (!audioName) return;
      playOnce(resolveAsset(audioName));
    }

    function applyModifiers(mods) {
      if (!mods) return;
      if (mods.mandates !== undefined) {
        currentState.mandates += mods.mandates;
      }
      if (mods.us_relations !== undefined) {
        currentState.us_relations = clamp(currentState.us_relations + mods.us_relations, 0, 100);
      }
      if (mods.likud_stability !== undefined) {
        currentState.likud_stability = clamp(currentState.likud_stability + mods.likud_stability, 0, 100);
      }
      if (mods.coalition_stability !== undefined) {
        currentState.coalition_stability = clamp(currentState.coalition_stability + mods.coalition_stability, 0, 100);
      }
    }

    function makeChoice(option) {
      initAudio();
      stopHoverAudio();
      if (endAudio) {
        endAudio.pause();
        endAudio = null;
      }
      applyModifiers(option.stateModifiers);
      updateStatusBar();
      loadNode(option.targetNode);
    }

    function loadNode(nodeId) {
      const node = gameData.nodes[nodeId];
      if (!node) {
        descEl.textContent = 'שגיאה: צומת לא נמצא — ' + nodeId;
        return;
      }

      titleEl.textContent = node.title;
      descEl.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = node.description;
      descEl.appendChild(p);

      overlayContainer.innerHTML = '';
      if (mobileChoicesEl) mobileChoicesEl.innerHTML = '';
      stageBgEl.className = '';
      stageBgEl.style.backgroundImage = '';

      if (endAudio) {
        endAudio.pause();
        endAudio = null;
      }

      const options = node.options || [];
      const optionsCount = options.length;
      const isEnding = optionsCount === 0;

      if (isEnding) {
        stageBgEl.style.backgroundImage = 'none';
        stageBgEl.classList.add('ending-bg-fallback');
        protagonistEl.style.display = 'none';

        const isWin = currentState.mandates >= 61;
        const badge = document.createElement('div');
        badge.className = 'ending-badge ' + (isWin ? 'badge-win' : 'badge-fail');
        badge.textContent = isWin
          ? `ניצחון! הושגו ${currentState.mandates} מנדטים`
          : `כישלון. רק ${currentState.mandates} מנדטים`;
        descEl.appendChild(badge);

        if (node.overlay_image) {
          const endImg = document.createElement('img');
          endImg.src = resolveAsset(node.overlay_image);
          endImg.className = 'pos-ending';
          endImg.alt = node.title;
          endImg.onerror = () => { endImg.style.display = 'none'; };
          overlayContainer.appendChild(endImg);
        }

        if (node.end_audio) {
          endAudio = new Audio(resolveAsset(node.end_audio));
          endAudio.play().catch(() => {});
        }

        const restartBtn = document.createElement('button');
        restartBtn.className = 'restart-btn';
        restartBtn.type = 'button';
        restartBtn.textContent = '🔄 התחל מחדש';
        restartBtn.onclick = () => { initAudio(); startGame(); };
        overlayContainer.appendChild(restartBtn);
        if (mobileChoicesEl) {
          const mobileRestart = document.createElement('button');
          mobileRestart.type = 'button';
          mobileRestart.className = 'mobile-choice-btn';
          mobileRestart.textContent = '🔄 התחל מחדש';
          mobileRestart.onclick = () => { initAudio(); startGame(); };
          mobileChoicesEl.appendChild(mobileRestart);
        }
      } else {
        protagonistEl.style.display = 'block';
        stageBgEl.style.backgroundImage = `url('${resolveAsset('bg_' + optionsCount + '.jpg')}')`;

        options.forEach((option, index) => {
          const wrapper = document.createElement('div');
          wrapper.className = `choice-wrapper pos-${optionsCount}-${index}`;
          wrapper.setAttribute('role', 'button');
          wrapper.tabIndex = 0;
          wrapper.onclick = () => makeChoice(option);
          wrapper.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              makeChoice(option);
            }
          };
          wrapper.onmouseenter = () => playHoverAudio(option.hover_audio);
          const playHoverOnce = () => playHoverAudio(option.hover_audio);
          wrapper.addEventListener('touchstart', playHoverOnce, { passive: true });
          wrapper.addEventListener('pointerdown', playHoverOnce);

          const textBubble = document.createElement('div');
          textBubble.className = 'choice-text';
          textBubble.textContent = option.label;

          const img = document.createElement('img');
          img.className = 'choice-sprite';
          img.alt = 'אפשרות ' + (index + 1);
          if (option.overlay_image) {
            img.src = resolveAsset(option.overlay_image);
            img.onerror = () => { img.style.display = 'none'; };
          } else {
            img.style.display = 'none';
          }

          wrapper.appendChild(textBubble);
          wrapper.appendChild(img);
          overlayContainer.appendChild(wrapper);

          if (mobileChoicesEl) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mobile-choice-btn';
            btn.textContent = option.label;
            const playHoverOnce = () => playHoverAudio(option.hover_audio);
            btn.addEventListener('touchstart', playHoverOnce, { passive: true });
            btn.addEventListener('pointerdown', playHoverOnce);
            btn.onclick = () => makeChoice(option);
            mobileChoicesEl.appendChild(btn);
          }
        });
      }
    }

    function startGame() {
      stopHoverAudio();
      if (endAudio) {
        endAudio.pause();
        endAudio = null;
      }
      currentState = JSON.parse(JSON.stringify(gameData.gameSettings.initialState));
      updateStatusBar();
      loadNode('node_001_start');
    }

    function setupProtagonist() {
      const settings = gameData.gameSettings;
      protagonistEl.src = resolveAsset(settings.protagonist_image);
      const playProtagonist = () => {
        initAudio();
        playHoverAudio(settings.protagonist_audio);
      };
      protagonistEl.onmouseenter = playProtagonist;
      protagonistEl.onclick = playProtagonist;
      protagonistEl.addEventListener('touchstart', playProtagonist, { passive: true });
      protagonistEl.addEventListener('pointerdown', playProtagonist);
    }

    async function discoverAssets() {
      try {
        const res = await fetch(ASSET_DIR + 'manifest.json');
        if (res.ok) {
          const list = await res.json();
          list.forEach((n) => knownAssets.add(n));
          return;
        }
      } catch (_) {}
    }

    async function boot() {
      try {
        await discoverAssets();
        const res = await fetch('game.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        gameData = await res.json();
        document.title = gameData.gameSettings.title || document.title;
        creatorEl.textContent = gameData.gameSettings.creator || '';
        setupProtagonist();
        prepareBgMusic();
        const unlockAudio = () => initAudio();
        document.addEventListener('pointerdown', unlockAudio, { capture: true });
        document.addEventListener('keydown', unlockAudio);
        const musicHint = document.getElementById('music-hint');
        if (musicHint) musicHint.addEventListener('click', unlockAudio);
        startGame();
      } catch (err) {
        document.getElementById('load-error').style.display = 'block';
        document.getElementById('load-error').textContent =
          'לא ניתן לטעון את המשחק: ' + err.message;
        titleEl.textContent = 'שגיאה';
      }
    }

    boot();
