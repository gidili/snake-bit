const SFX = (() => {
  let ac = null, masterGain = null;
  let splashNodes = [], splashArpTimer = null, splashArpIdx = 0, splashReady = false;
  let musicTimer = null, musicStep = 0, nextNoteTime = 0;
  let deathMusicTimer = null, deathStep = 0, deathNextNote = 0;
  let organTimer = null, organStep = 0, organNextTime = 0;
  let currentTickMs = 264;
  let audioEnabled = false;
  let gameDroneNodes = [];

  function initAC() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ac.createGain();
      masterGain.gain.value = 0.45;
      masterGain.connect(ac.destination);
    }
    return ac;
  }
  function getAC() { initAC(); if (ac.state === 'suspended') ac.resume(); return ac; }
  function unlock() {
    initAC();
    if (ac.state === 'suspended') {
      ac.resume().then(() => {
        if (splashReady) { splashReady = false; doStartSplash(); }
      }).catch(() => {});
    }
  }
  function out() { initAC(); return masterGain; }

  // Splash: eerie drone + slow haunting arpeggio
  const SPLASH_ARP = [110, 130.81, 164.81, 174.61, 130.81, 98];
  function doStartSplash() {
    [[55,'sine',0.06],[55.7,'sine',0.04],[27.5,'sawtooth',0.03]].forEach(([freq,type,vol]) => {
      const osc = ac.createOscillator(), g = ac.createGain();
      const lfo = ac.createOscillator(), lg = ac.createGain();
      osc.type = type; osc.frequency.value = freq; g.gain.value = vol;
      lfo.frequency.value = 0.25; lg.gain.value = 0.025;
      lfo.connect(lg); lg.connect(g.gain); osc.connect(g); g.connect(masterGain);
      osc.start(); lfo.start();
      splashNodes.push(osc, lfo, lg, g);
    });
    (function arp() {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = SPLASH_ARP[splashArpIdx++ % SPLASH_ARP.length];
      g.gain.setValueAtTime(0.09, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.8);
      osc.connect(g); g.connect(masterGain); osc.start(); osc.stop(ac.currentTime + 1.9);
      splashArpTimer = setTimeout(arp, 1500);
    })();
  }
  function startSplash() {
    stopSplash(); splashArpIdx = 0;
    initAC();
    if (ac.state === 'running') { doStartSplash(); }
    else { splashReady = true; }
  }
  function stopSplash() {
    splashReady = false;
    splashNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect(); } catch(e){} });
    splashNodes = []; clearTimeout(splashArpTimer); splashArpTimer = null;
  }

  // Modem connecting sound
  function playModem(onDone) {
    const a = getAC(); let t = a.currentTime + 0.05;
    [2100,1300,2100].forEach(freq => {
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.08,t); g.gain.setValueAtTime(0,t+0.11);
      osc.connect(g); g.connect(out()); osc.start(t); osc.stop(t+0.12); t += 0.13;
    });
    for (let i = 0; i < 8; i++) {
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = i%2===0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(600+Math.random()*2400, t);
      osc.frequency.linearRampToValueAtTime(400+Math.random()*2600, t+0.065);
      g.gain.setValueAtTime(0.05,t); g.gain.setValueAtTime(0,t+0.065);
      osc.connect(g); g.connect(out()); osc.start(t); osc.stop(t+0.07); t += 0.07;
    }
    t += 0.06;
    [880,1100,1320].forEach((freq,i) => {
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.1, t+i*0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.12+0.18);
      osc.connect(g); g.connect(out()); osc.start(t+i*0.12); osc.stop(t+i*0.12+0.2);
    });
    t += 0.45;
    setTimeout(onDone, Math.max(0, (t - a.currentTime) * 1000));
  }

  // Game music: Bowser's Castle — dark minor, rhythmic, tempo tracks game speed
  const BASS = [55,0,55,0,82.41,0,55,0,49,0,55,0,65.41,0,58.27,0];
  const LEAD = [220,0,0,0,261.63,0,0,0,329.63,0,0,0,392,0,329.63,0];
  function sixteenthDur() {
    const bpm = 80 + ((264 - Math.max(55, Math.min(264, currentTickMs))) / 209) * 90;
    return 60 / bpm / 4;
  }
  function scheduleMusicTick() {
    const a = getAC();
    while (nextNoteTime < a.currentTime + 0.12) {
      const step = musicStep % 16, dur = sixteenthDur();
      if (BASS[step]) {
        const osc = a.createOscillator(), g = a.createGain();
        osc.type = 'square'; osc.frequency.value = BASS[step];
        g.gain.setValueAtTime(0.15, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + dur*0.75);
        osc.connect(g); g.connect(out()); osc.start(nextNoteTime); osc.stop(nextNoteTime + dur*0.8);
      }
      if (LEAD[step]) {
        const osc = a.createOscillator(), g = a.createGain();
        osc.type = 'triangle'; osc.frequency.value = LEAD[step];
        g.gain.setValueAtTime(0.08, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + dur*0.9);
        osc.connect(g); g.connect(out()); osc.start(nextNoteTime); osc.stop(nextNoteTime + dur*0.95);
      }
      if (step === 0 || step === 8) {
        const osc = a.createOscillator(), g = a.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, nextNoteTime);
        osc.frequency.exponentialRampToValueAtTime(40, nextNoteTime + 0.08);
        g.gain.setValueAtTime(0.3, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.12);
        osc.connect(g); g.connect(out()); osc.start(nextNoteTime); osc.stop(nextNoteTime + 0.13);
      }
      nextNoteTime += dur;
      musicStep++;
    }
    musicTimer = setTimeout(scheduleMusicTick, 25);
  }
  // Eerie atmospheric drone under the game beat
  function startGameDrone() {
    stopGameDrone();
    const a = getAC();
    [[55,'sine',0.055],[55.7,'sine',0.038],[27.5,'sawtooth',0.028]].forEach(([freq,type,vol]) => {
      const osc = a.createOscillator(), g = a.createGain();
      const lfo = a.createOscillator(), lg = a.createGain();
      osc.type = type; osc.frequency.value = freq; g.gain.value = vol;
      lfo.frequency.value = 0.25; lg.gain.value = 0.025;
      lfo.connect(lg); lg.connect(g.gain); osc.connect(g); g.connect(out());
      osc.start(); lfo.start();
      gameDroneNodes.push(osc, lfo, g);
    });
  }
  function stopGameDrone() {
    gameDroneNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect(); } catch(e){} });
    gameDroneNodes = [];
  }
  function startMusic(tickMs) {
    stopMusic(); currentTickMs = tickMs;
    const a = getAC(); nextNoteTime = a.currentTime + 0.05; musicStep = 0;
    scheduleMusicTick();
    startGameDrone();
  }
  function updateTempo(tickMs) { currentTickMs = tickMs; }
  function stopMusic() {
    clearTimeout(musicTimer); musicTimer = null;
    clearTimeout(deathMusicTimer); deathMusicTimer = null;
    stopGameDrone();
    stopOrgan();
  }

  // Eat: ascending happy chime
  function playEat() {
    const a = getAC(), t = a.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = 'square'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.1, t+i*0.045);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.045+0.07);
      osc.connect(g); g.connect(out()); osc.start(t+i*0.045); osc.stop(t+i*0.045+0.08);
    });
  }

  // Fire tier unlock: rising woosh + shimmer
  function playWoosh() {
    const a = getAC(), t = a.currentTime;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(g); g.connect(out()); osc.start(t); osc.stop(t + 0.56);
    [0.18, 0.28, 0.38].forEach((dt, i) => {
      const s = a.createOscillator(), sg = a.createGain();
      s.type = 'triangle'; s.frequency.value = 880 + i * 440;
      sg.gain.setValueAtTime(0.07, t + dt);
      sg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.12);
      s.connect(sg); sg.connect(out()); s.start(t + dt); s.stop(t + dt + 0.13);
    });
  }

  // Coin: SMB-style square wave with hard pitch step B5→E6
  function playCoin(delayMs) {
    const a = getAC(), t = a.currentTime + (delayMs || 0) / 1000;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(988, t);
    osc.frequency.setValueAtTime(1319, t + 0.065);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g); g.connect(out()); osc.start(t); osc.stop(t + 0.19);
  }

  // Pineapple explosion: noise burst + pitch drop
  function playExplosion() {
    const a = getAC(), t = a.currentTime, sr = a.sampleRate;
    const buf = a.createBuffer(1, sr*0.3, sr), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random()*2-1;
    const noise = a.createBufferSource(), ng = a.createGain();
    noise.buffer = buf;
    ng.gain.setValueAtTime(0.35,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    noise.connect(ng); ng.connect(out()); noise.start(t);
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300,t); osc.frequency.exponentialRampToValueAtTime(40,t+0.25);
    g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25);
    osc.connect(g); g.connect(out()); osc.start(t); osc.stop(t+0.26);
  }

  // Death: descending chromatic (Mario-style), music stops, then funeral organ begins
  // Organ: Am→Dm→E→Am chord cycle, triangle + octave stops, high whistle on top
  const DEATH_MELODY = [
    1318.51, 1174.66, 1046.5, 987.77, 880, 830.61, 880, 659.25,
    659.25, 830.61, 880, 1046.5, 1318.51, 1174.66, 1046.5, 880
  ];
  const ORGAN_CHORDS = [
    [110, 130.81, 164.81],     // Am:  A2, C3, E3
    [146.83, 174.61, 220],     // Dm:  D3, F3, A3
    [103.83, 164.81, 246.94],  // E:   G#2, E3, B3  (harmonic minor tension)
    [110, 164.81, 261.63]      // Am:  A2, E3, C4
  ];
  function scheduleDeathTick() {
    const a = getAC();
    while (deathNextNote < a.currentTime + 0.2) {
      const freq = DEATH_MELODY[deathStep % DEATH_MELODY.length];
      const noteDur = 0.92, gap = 0.13;
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = 4.8; lg.gain.value = 4;
      lfo.connect(lg); lg.connect(osc.frequency);
      g.gain.setValueAtTime(0, deathNextNote);
      g.gain.linearRampToValueAtTime(0.042, deathNextNote + 0.06);
      g.gain.setValueAtTime(0.042, deathNextNote + noteDur * 0.65);
      g.gain.linearRampToValueAtTime(0, deathNextNote + noteDur);
      osc.connect(g); g.connect(out());
      osc.start(deathNextNote); osc.stop(deathNextNote + noteDur + 0.01);
      lfo.start(deathNextNote); lfo.stop(deathNextNote + noteDur + 0.01);
      deathNextNote += noteDur + gap;
      deathStep++;
    }
    deathMusicTimer = setTimeout(scheduleDeathTick, 25);
  }
  function scheduleOrganTick() {
    const a = getAC();
    const chordDur = 3.5, release = 0.8;
    while (organNextTime < a.currentTime + 0.4) {
      const chord = ORGAN_CHORDS[organStep % ORGAN_CHORDS.length];
      chord.forEach((freq, i) => {
        [freq, freq * 2].forEach((f, h) => {
          const osc = a.createOscillator(), g = a.createGain();
          osc.type = 'triangle'; osc.frequency.value = f;
          const vol = h === 0 ? 0.07 : 0.032, t = organNextTime + i * 0.06;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(vol, t + 0.45);
          g.gain.setValueAtTime(vol, t + chordDur - release);
          g.gain.linearRampToValueAtTime(0, t + chordDur + 0.1);
          osc.connect(g); g.connect(out());
          osc.start(t); osc.stop(t + chordDur + 0.2);
        });
      });
      organNextTime += chordDur;
      organStep++;
    }
    organTimer = setTimeout(scheduleOrganTick, 50);
  }
  function startOrgan() {
    stopOrgan(); organStep = 0;
    const a = getAC(); organNextTime = a.currentTime + 0.15;
    scheduleOrganTick();
  }
  function stopOrgan() { clearTimeout(organTimer); organTimer = null; }
  function startDeathMusic() {
    clearTimeout(deathMusicTimer);
    deathStep = 0;
    const a = getAC();
    deathNextNote = a.currentTime + 0.05;
    scheduleDeathTick();
    startOrgan();
  }
  function playDeath() {
    stopMusic();
    const a = getAC(), t = a.currentTime;
    [494,466.16,440,415.3,392,369.99,349.23,329.63,311.13,293.66,261.63].forEach((freq,i) => {
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = 'square'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.14, t+i*0.065);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.065+0.09);
      osc.connect(g); g.connect(out()); osc.start(t+i*0.065); osc.stop(t+i*0.065+0.1);
    });
    setTimeout(startDeathMusic, 900);
  }

  let muted = false;
  function mute()   { muted = true;  if (masterGain) masterGain.gain.value = 0; }
  function unmute() { muted = false; if (masterGain) masterGain.gain.value = 0.45; }
  function isMuted() { return muted; }
  function enable() { audioEnabled = true; }
  function isEnabled() { return audioEnabled; }

  return { startSplash, stopSplash, playModem, startMusic, updateTempo, stopMusic, playEat, playCoin, playExplosion, playWoosh, playDeath, startDeathMusic, unlock, mute, unmute, isMuted, enable, isEnabled };
})();

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');

  const isNarrowViewport = window.innerWidth / window.innerHeight < 0.85;
  const GRID_W = isNarrowViewport ? 18 : 24;
  const GRID_H = isNarrowViewport ? 22 : 24;
  const CELL = 26;
  canvas.width = GRID_W * CELL;
  canvas.height = GRID_H * CELL;

  const fireCanvas = document.getElementById('game-fire');
  const fireCtx = fireCanvas.getContext('2d');
  const FIRE_GRID_W = GRID_W + 2;
  const FIRE_GRID_H = GRID_H + 2;
  fireCanvas.width = FIRE_GRID_W * CELL;
  fireCanvas.height = FIRE_GRID_H * CELL;
  fireCanvas.style.width = (FIRE_GRID_W / GRID_W * 100) + '%';
  fireCanvas.style.height = (FIRE_GRID_H / GRID_H * 100) + '%';
  fireCanvas.style.left = (-1 / GRID_W * 100) + '%';
  fireCanvas.style.top = (-1 / GRID_H * 100) + '%';
  const gameWrapperEl = document.getElementById('game-wrapper');
  const FIRE_TIERS = [
    { score:  500, name: 'fire' },
    { score:  700, name: 'green' },
    { score:  900, name: 'blue' },
    { score: 1100, name: 'purple' },
    { score: 1300, name: 'white' },
    { score: 1600, name: 'rainbow' },
  ];
  const FIRE_FRAME_MS = 120;
  const tierIndex = (name) => FIRE_TIERS.findIndex(t => t.name === name);
  let fireTier = null;
  const START_TICK_MS = 264;
  const MIN_TICK_MS = 55;
  const TICK_STEP_MS = 8;
  const FOOD_PER_LEVEL = 3;
  const SECONDS_PER_LEVEL = 12;
  const RAMP_LEVEL = 20;
  const LATE_TICK_STEP_MS = 2;
  const MAX_FOOD = 3;
  const EGG_CHANCE = 0.25;
  const PINEAPPLE_CHANCE = 0.25;
  const LEVEL_UP_BONUS = 2;
  const RESCUE_DELAY_MIN = 3;
  const RESCUE_DELAY_MAX = 8;
  const FOOD_TYPES = {
    rat: { value: 1 },
    egg: { value: 3 },
    goldegg: { value: 10 },
    pineapple: { value: 0, deadly: true },
  };
  const GOLD_EGG_CHANCE = 0.4;

  const levelEl = document.getElementById('level');

  let snake, dir, nextDir, foods, score, foodScore, best, alive, paused, lastTick;
  let level, startTime, pausedAt, pausedTotal, rats, eggs, pineapples;
  let particles, lastFrame;
  let unlockFlash = null;
  let apocalypseHintStart = null;
  let gameOverShown = false;
  let lastSubmittedId = null;
  let hintFadeStart = null;
  let hintDismissed = false;
  const HINT_FADE_MS = 400;
  let beatHintStart = null;
  const BEAT_HINT_SHOW_MS = 5000;
  const BEAT_HINT_FADE_MS = 600;

  function juiceFromPeel(peel) {
    try {
      const pulp = atob(peel);
      let nectar = '';
      for (let i = 0; i < pulp.length; i++) {
        nectar += String.fromCharCode((pulp.charCodeAt(i) - 13 + 256) % 256);
      }
      return nectar;
    } catch (_) {
      return null;
    }
  }
  const fruitCrate = document.getElementById('pineappl');
  const freshJuice = fruitCrate ? juiceFromPeel(fruitCrate.textContent.trim()) : null;
  const [zest, pulp] = (freshJuice || '|').split('|');
  const blenderLib = window.supabase;
  const juicer = (blenderLib && zest && pulp)
    ? blenderLib.createClient(zest, pulp)
    : null;

  const overlayEl = document.getElementById('gameover-overlay');
  const finalScoreEl = document.getElementById('final-score-val');
  const initialsInputEl = document.getElementById('initials-input');
  const submitBtnEl = document.getElementById('submit-score-btn');
  const skipBtnEl = document.getElementById('skip-btn');
  const submitFormEl = document.getElementById('submit-form');
  const submitStatusEl = document.getElementById('submit-status');
  const leaderboardBlockEl = document.getElementById('leaderboard-block');
  const leaderboardListEl = document.getElementById('leaderboard-list');
  const overlayRestartBtnEl = document.getElementById('overlay-restart-btn');
  const overlayCloseBtnEl = document.getElementById('overlay-close-btn');
  const restartHintEl = document.getElementById('restart-hint');
  const leaderboardBtnEl = document.getElementById('btn-leaderboard');
  let leaderboardViewMode = false;
  let autoPausedByLeaderboard = false;
  let leaderboardCache = null;
  let leaderboardStatus = juicer ? 'loading' : 'offline';
  const LEADERBOARD_POLL_MS = 60000;
  const GAMEOVER_REVEAL_DELAY_MS = 1200;
  let gameOverRevealTimeoutId = null;

  function dismissHint() {
    if (!isNarrowViewport) return;
    if (hintFadeStart === null) hintFadeStart = performance.now();
    hintDismissed = true;
  }
  let pineappleOnlyStart;
  let rescueDelay;

  best = parseInt(localStorage.getItem('snake_best') || '0', 10);
  bestEl.textContent = best;

  function reset() {
    randomizeSnakePalette();
    snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
    dir = {x: 1, y: 0};
    nextDir = {x: 1, y: 0};
    score = 0;
    foodScore = 0;
    level = 1;
    rats = 0;
    eggs = 0;
    pineapples = 0;
    alive = true;
    paused = false;
    startTime = performance.now();
    pausedAt = 0;
    pausedTotal = 0;
    foods = [];
    while (foods.length < MAX_FOOD) spawnFood();
    scoreEl.textContent = score;
    levelEl.textContent = level;
    lastTick = performance.now();
    lastFrame = performance.now();
    particles = [];
    pineappleOnlyStart = null;
    apocalypseHintStart = null;
    beatHintStart = isNarrowViewport ? null : performance.now();
    fireTier = null;
    gameWrapperEl.classList.remove('fire-on');
    fireCtx.clearRect(0, 0, fireCanvas.width, fireCanvas.height);
    if (SFX.isEnabled()) SFX.startMusic(currentTickMs());
  }

  function survivalSeconds() {
    return (performance.now() - startTime - pausedTotal) / 1000;
  }

  function computeLevel() {
    const byFood = Math.floor(foodScore / FOOD_PER_LEVEL);
    const byTime = Math.floor(survivalSeconds() / SECONDS_PER_LEVEL);
    return 1 + Math.min(byFood, byTime);
  }

  function currentTickMs() {
    const earlyLevels = Math.min(level - 1, RAMP_LEVEL - 1);
    const lateLevels = Math.max(0, level - RAMP_LEVEL);
    const tick = START_TICK_MS - earlyLevels * TICK_STEP_MS - lateLevels * LATE_TICK_STEP_MS;
    return Math.max(MIN_TICK_MS, tick);
  }

  function isCellFree(x, y) {
    if (snake.some(s => s.x === x && s.y === y)) return false;
    if (foods.some(f => f.x === x && f.y === y)) return false;
    return true;
  }

  function spawnFood() {
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(Math.random() * GRID_W);
      const y = Math.floor(Math.random() * GRID_H);
      if (isCellFree(x, y)) {
        const r = Math.random();
        let type;
        if (r < PINEAPPLE_CHANCE) {
          type = 'pineapple';
        } else if (r < PINEAPPLE_CHANCE + EGG_CHANCE) {
          type = (fireTier === 'rainbow' && Math.random() < GOLD_EGG_CHANCE) ? 'goldegg' : 'egg';
        } else {
          type = 'rat';
        }
        foods.push({ x, y, type });
        return;
      }
    }
  }

  function neighborsSafe(x, y) {
    let n = 0;
    if (x > 0          && !foods.some(f => f.type === 'pineapple' && f.x === x - 1 && f.y === y)) n++;
    if (x < GRID_W - 1 && !foods.some(f => f.type === 'pineapple' && f.x === x + 1 && f.y === y)) n++;
    if (y > 0          && !foods.some(f => f.type === 'pineapple' && f.x === x && f.y === y - 1)) n++;
    if (y < GRID_H - 1 && !foods.some(f => f.type === 'pineapple' && f.x === x && f.y === y + 1)) n++;
    return n;
  }

  function noReachableFood() {
    return foods.length > 0 && foods.every(f => f.type === 'pineapple' || neighborsSafe(f.x, f.y) < 2);
  }

  function spawnRatNearPineapple() {
    const pineapples = foods.filter(f => f.type === 'pineapple');
    if (pineapples.length === 0) return false;
    const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const shuffledP = [...pineapples].sort(() => Math.random() - 0.5);
    for (const p of shuffledP) {
      const shuffledO = [...offsets].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of shuffledO) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        if (!isCellFree(x, y)) continue;
        foods.push({ x, y, type: 'rat' });
        return true;
      }
    }
    for (let tries = 0; tries < 100; tries++) {
      const x = Math.floor(Math.random() * GRID_W);
      const y = Math.floor(Math.random() * GRID_H);
      if (isCellFree(x, y)) {
        foods.push({ x, y, type: 'rat' });
        return true;
      }
    }
    return false;
  }

  function rollRescueDelay() {
    return RESCUE_DELAY_MIN + Math.random() * (RESCUE_DELAY_MAX - RESCUE_DELAY_MIN);
  }

  function maybeRescueSpawn() {
    if (noReachableFood()) {
      const now = survivalSeconds();
      if (pineappleOnlyStart === null) {
        pineappleOnlyStart = now;
        rescueDelay = rollRescueDelay();
        return;
      }
      if (now - pineappleOnlyStart >= rescueDelay) {
        const count = Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) spawnRatNearPineapple();
        pineappleOnlyStart = now;
        rescueDelay = rollRescueDelay();
      }
    } else {
      pineappleOnlyStart = null;
    }
  }

  function rollSpawnCount() {
    const r = Math.random();
    if (r < 0.4) return 0;
    if (r < 0.8) return 1;
    return 2;
  }

  function detectEnclosedFoods() {
    if (snake.length < 8 || foods.length === 0) return [];
    let hasInterior = false;
    for (const f of foods) {
      if (f.x > 0 && f.x < GRID_W - 1 && f.y > 0 && f.y < GRID_H - 1) {
        hasInterior = true;
        break;
      }
    }
    if (!hasInterior) return [];

    const blocked = new Uint8Array(GRID_W * GRID_H);
    for (const s of snake) blocked[s.y * GRID_W + s.x] = 1;
    const visited = new Uint8Array(GRID_W * GRID_H);
    const queue = [];

    for (let x = 0; x < GRID_W; x++) {
      const top = x;
      const bot = (GRID_H - 1) * GRID_W + x;
      if (!blocked[top]) { visited[top] = 1; queue.push(top); }
      if (!blocked[bot]) { visited[bot] = 1; queue.push(bot); }
    }
    for (let y = 1; y < GRID_H - 1; y++) {
      const left = y * GRID_W;
      const right = y * GRID_W + GRID_W - 1;
      if (!blocked[left]) { visited[left] = 1; queue.push(left); }
      if (!blocked[right]) { visited[right] = 1; queue.push(right); }
    }

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const x = idx % GRID_W;
      const y = (idx - x) / GRID_W;
      if (x > 0) {
        const ni = idx - 1;
        if (!visited[ni] && !blocked[ni]) { visited[ni] = 1; queue.push(ni); }
      }
      if (x < GRID_W - 1) {
        const ni = idx + 1;
        if (!visited[ni] && !blocked[ni]) { visited[ni] = 1; queue.push(ni); }
      }
      if (y > 0) {
        const ni = idx - GRID_W;
        if (!visited[ni] && !blocked[ni]) { visited[ni] = 1; queue.push(ni); }
      }
      if (y < GRID_H - 1) {
        const ni = idx + GRID_W;
        if (!visited[ni] && !blocked[ni]) { visited[ni] = 1; queue.push(ni); }
      }
    }

    const enclosed = [];
    for (const f of foods) {
      if (!visited[f.y * GRID_W + f.x]) enclosed.push(f);
    }
    return enclosed;
  }

  function explodeEnclosedFoods() {
    const enclosed = detectEnclosedFoods();
    if (enclosed.length === 0) return;
    for (const f of enclosed) {
      if (f.type === 'pineapple') {
        spawnExplosion(f.x, f.y); SFX.playExplosion();
        score += 10; foodScore += 10;
        pineapples++;
      } else if (f.type === 'rat') {
        score += FOOD_TYPES.rat.value; foodScore += FOOD_TYPES.rat.value;
        rats++; SFX.playCoin();
      } else {
        score += FOOD_TYPES[f.type].value; foodScore += FOOD_TYPES[f.type].value;
        eggs++; SFX.playCoin();
      }
      const idx = foods.indexOf(f);
      if (idx !== -1) foods.splice(idx, 1);
    }
    let toSpawn = 0;
    for (let i = 0; i < enclosed.length; i++) toSpawn += rollSpawnCount();
    if (foods.length === 0 && toSpawn === 0) toSpawn = 1;
    for (let i = 0; i < toSpawn; i++) spawnFood();
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem('snake_best', best);
    }
  }

  function step() {
    if (!alive || paused) return;

    if (nextDir.x !== -dir.x || nextDir.y !== -dir.y) {
      dir = nextDir;
    }

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= GRID_W || head.y < 0 || head.y >= GRID_H) {
      alive = false; SFX.playDeath();
      return;
    }
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      alive = false; SFX.playDeath();
      return;
    }

    snake.unshift(head);

    const eatenIdx = foods.findIndex(f => f.x === head.x && f.y === head.y);
    if (eatenIdx !== -1) {
      const eaten = foods[eatenIdx];
      if (FOOD_TYPES[eaten.type].deadly) {
        if (fireTier === 'rainbow') {
          spawnExplosion(eaten.x, eaten.y); SFX.playExplosion();
          score += 10; foodScore += 10;
          pineapples++;
        } else {
          spawnExplosion(head.x, head.y);
          alive = false; SFX.playDeath();
          return;
        }
      } else {
        score += FOOD_TYPES[eaten.type].value; foodScore += FOOD_TYPES[eaten.type].value;
        if (eaten.type === 'rat') rats++;
        else if (eaten.type === 'egg' || eaten.type === 'goldegg') eggs++;
        SFX.playCoin();
      }
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('snake_best', best);
      }
      foods.splice(eatenIdx, 1);
      let toSpawn = rollSpawnCount();
      if (foods.length === 0 && toSpawn === 0) toSpawn = 1;
      for (let i = 0; i < toSpawn; i++) spawnFood();
    } else {
      snake.pop();
    }

    explodeEnclosedFoods();

    const newLevel = computeLevel();
    if (newLevel > level) {
      let bonus = 0;
      for (let lv = level + 1; lv <= newLevel; lv++) bonus += lv * LEVEL_UP_BONUS;
      score += bonus;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('snake_best', best);
      }
      level = newLevel;
      levelEl.textContent = level;
      SFX.updateTempo(currentTickMs());
    }
    let highestMet = null;
    for (const t of FIRE_TIERS) if (score >= t.score) highestMet = t.name;
    if (highestMet && tierIndex(highestMet) > tierIndex(fireTier)) setFireTier(highestMet);
  }

  // --- Sprite system -----------------------------------------------------
  // Each cell is drawn as a 10x10 grid of "sprite pixels" (2 screen px each).
  // Sprites are arrays of strings where each character maps to a palette color.
  // '.' means transparent.

  const SP_GRID = 8;
  const SP_PX = CELL / SP_GRID;

  // All colors drawn from the NES master palette (authentic 8-bit hardware set).
  const palette = {
    // snake (randomized between fixed NES color schemes on reset)
    d: '#005800',   // outline
    g: '#00A800',   // body
    h: '#58F898',   // highlight
    // eyes
    W: '#FCFCFC',
    K: '#000000',
    // rat
    A: '#7C7C7C',   // outline (mid grey)
    a: '#BCBCBC',   // body (light grey)
    p: '#F878F8',   // nose / tail / eyes
    // egg
    O: '#AC7C00',   // outline (brown)
    E: '#FCE0A8',   // body (cream)
    e: '#F8B800',   // speckle (gold)
    // pineapple
    B: '#503000',   // outline (dark brown)
    Y: '#F8B800',   // body (gold)
    L: '#00B800',   // leaves (mid green)
    // tail (always brown, independent of snake body scheme)
    T: '#3A2412',   // outline (very dark brown)
    t: '#6B4422',   // body (saddle brown)
    i: '#A0704A',   // highlight (tan)
    // dead tongue (bright red) — also reused for fire
    R: '#F83800',
    // fire
    F: '#FC9838',   // orange
    f: '#A82800',   // deep red
    '.': null,
  };

  const FIRE_TIER_PALETTES = {
    fire:   { Y: '#F8B800', F: '#FC9838', R: '#F83800', f: '#A82800' },
    green:  { Y: '#C8FCE8', F: '#58F898', R: '#00A800', f: '#005800' },
    blue:   { Y: '#A0E8FF', F: '#58D8FC', R: '#0078F8', f: '#0000A8' },
    purple: { Y: '#E8B8FF', F: '#C040FF', R: '#8000C0', f: '#400060' },
    white:  { Y: '#FFFFFF', F: '#F0F0FF', R: '#C8C8FF', f: '#9090C0' },
    rainbow: {},
  };

  const SPR_BTN_UP = [
    '........',
    '...YY...',
    '..YYYY..',
    '.YYYYYY.',
    '...YY...',
    '...YY...',
    '...YY...',
    '........',
  ];
  const SPR_BTN_DOWN = [
    '........',
    '...YY...',
    '...YY...',
    '...YY...',
    '.YYYYYY.',
    '..YYYY..',
    '...YY...',
    '........',
  ];
  const SPR_BTN_LEFT = [
    '........',
    '...Y....',
    '..YY....',
    '.YYYYYY.',
    '.YYYYYY.',
    '..YY....',
    '...Y....',
    '........',
  ];
  const SPR_BTN_RIGHT = [
    '........',
    '....Y...',
    '....YY..',
    '.YYYYYY.',
    '.YYYYYY.',
    '....YY..',
    '....Y...',
    '........',
  ];
  const SPR_BTN_PAUSE = [
    '........',
    '.YY..YY.',
    '.YY..YY.',
    '.YY..YY.',
    '.YY..YY.',
    '.YY..YY.',
    '.YY..YY.',
    '........',
  ];
  const SPR_BTN_PLAY = [
    '........',
    '..Y.....',
    '..YYY...',
    '..YYYYY.',
    '..YYYYY.',
    '..YYY...',
    '..Y.....',
    '........',
  ];
  const SPR_BTN_RESTART = [
    '........',
    '.YYYY...',
    '.Y..Y...',
    '.Y..Y...',
    '.YYYY...',
    '.Y.Y....',
    '.Y..Y...',
    '........',
  ];
  const SPR_BTN_CROWN = [
    '........',
    '.Y.YY.Y.',
    '.Y.YY.Y.',
    '.YYYYYY.',
    '.Y.YY.Y.',
    '.YYYYYY.',
    '.YYYYYY.',
    '........',
  ];

  const SPR_FIRE = [
    [
      '........',
      '....Y...',
      '...YF...',
      '..YFR...',
      '..FRRf..',
      '.FRRRR..',
      'fRRRRRR.',
      'RRRRRRR.',
    ],
    [
      '....W...',
      '....Y...',
      '...YF...',
      '..YFR...',
      '..FRRf..',
      '.FRRRRf.',
      'fRRRRRR.',
      'RRRRRRR.',
    ],
    [
      '........',
      '....Y...',
      '...FY...',
      '...FF...',
      '..FRRf..',
      '..FRRRf.',
      '.fRRRRR.',
      'RRRRRRR.',
    ],
    [
      '........',
      '...Y....',
      '...YF...',
      '..YFF...',
      '..FRRf..',
      '.FRRRR..',
      'fRRRRRf.',
      'RRRRRRR.',
    ],
  ];

  const SPR_HEAD = [
    '.dggggd.',
    'dggggggd',
    'dgWWgWWd',
    'dgWWgWWd',
    'dggggggd',
    'dggggggd',
    '.dggggd.',
    '..dggd..',
  ];

  const SPR_HEAD_DEAD = [
    '.dggggd.',
    'W.WggW.W',
    '.W.gg.W.',
    'W.WggW.W',
    'dggggggd',
    'dggggggd',
    '.dggggd.',
    '..dggd..',
  ];

  // Y-shaped tongue: 2-pixel-thick stem, 1-pixel-thick fork tips.
  // Each sprite spans the head cell + one adjacent cell in the tongue's direction.
  const SPR_TONGUE_RIGHT = [
    '................',
    '................',
    '................',
    '...........R....',
    '........RRR.....',
    '........RRR.....',
    '...........R....',
    '................',
  ];
  const SPR_TONGUE_LEFT = [
    '................',
    '................',
    '................',
    '....R...........',
    '.....RRR........',
    '.....RRR........',
    '....R...........',
    '................',
  ];
  const SPR_TONGUE_DOWN = [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '...RR...',
    '...RR...',
    '...RR...',
    '..R..R..',
    '........',
    '........',
    '........',
    '........',
  ];

  const SPR_BODY = [
    '........',
    '.dggggd.',
    'dghhhhgd',
    'dghhhhgd',
    'dghhhhgd',
    'dghhhhgd',
    '.dggggd.',
    '........',
  ];

  const SPR_RAT = [
    '........',
    '..AAA...',
    '.AaaaA..',
    'AaaaaApp',
    'Aa.aaA.p',
    'AaaaaA..',
    '.AAAAA..',
    '..A.A...',
  ];

  const SPR_EGG = [
    '..OOOO..',
    '.OEEEEO.',
    'OEEeEEEO',
    'OEEEEEEO',
    'OEEeEEEO',
    'OEEEEEEO',
    '.OEEEEO.',
    '..OOOO..',
  ];

  const SPR_PINEAPPLE = [
    '..L.L...',
    '.LLLLL..',
    '..LLL...',
    '.BYYYB..',
    'BYYYYYB.',
    'BYYYYYB.',
    '.BYYYB..',
    '..BBB...',
  ];

  // Tail base — faces right: body end on the left, thin tip on the right.
  // Uses dedicated brown letters so the tail stays brown regardless of snake body color.
  const SPR_TAIL_BASE = [
    '........',
    '.TT.....',
    'TttT....',
    'TtiitT..',
    'TtiitT..',
    'TttT....',
    '.TT.....',
    '........',
  ];

  function rotate90cw(sprite) {
    const n = sprite.length;
    const out = [];
    for (let y = 0; y < n; y++) {
      let row = '';
      for (let x = 0; x < n; x++) row += sprite[n - 1 - x][y];
      out.push(row);
    }
    return out;
  }

  const SPR_TAIL_RIGHT = SPR_TAIL_BASE;
  const SPR_TAIL_DOWN  = rotate90cw(SPR_TAIL_RIGHT);
  const SPR_TAIL_LEFT  = rotate90cw(SPR_TAIL_DOWN);
  const SPR_TAIL_UP    = rotate90cw(SPR_TAIL_LEFT);

  const TAIL_SPRITES = {
    '1,0':  SPR_TAIL_RIGHT,
    '0,1':  SPR_TAIL_DOWN,
    '-1,0': SPR_TAIL_LEFT,
    '0,-1': SPR_TAIL_UP,
  };

  // Pupil position within each 2x2 eye-white at rows 2-3, cols 2-3 (left) and 5-6 (right).
  // Pupils are drawn as 1x1 sprite pixels.
  const PUPIL_OFFSETS = {
    '1,0':  [[3, 2], [6, 2]],   // looking right
    '-1,0': [[2, 3], [5, 3]],   // looking left
    '0,-1': [[2, 2], [5, 2]],   // looking up
    '0,1':  [[3, 3], [6, 3]],   // looking down
  };

  // Compute integer rect for a block of sprite pixels, tiling cleanly
  // even when SP_PX is fractional (e.g. CELL=26 → SP_PX=2.6).
  function spriteRect(baseX, baseY, x, y, w = 1, h = 1) {
    const x0 = Math.floor(baseX + x * SP_PX);
    const y0 = Math.floor(baseY + y * SP_PX);
    const x1 = Math.floor(baseX + (x + w) * SP_PX);
    const y1 = Math.floor(baseY + (y + h) * SP_PX);
    return [x0, y0, x1 - x0, y1 - y0];
  }

  function drawFireSprite(sprite, cellX, cellY, rotation, f) {
    const isRainbow = fireTier === 'rainbow';
    const tierPalette = FIRE_TIER_PALETTES[fireTier] || {};
    fireCtx.save();
    fireCtx.translate(cellX * CELL + CELL / 2, cellY * CELL + CELL / 2);
    if (rotation) fireCtx.rotate(rotation);
    fireCtx.translate(-CELL / 2, -CELL / 2);
    for (let y = 0; y < SP_GRID; y++) {
      const row = sprite[y];
      for (let x = 0; x < SP_GRID; x++) {
        const ch = row[x];
        let color;
        if (isRainbow) {
          const lightness = ch === 'Y' ? 90 : ch === 'F' ? 70 : ch === 'R' ? 50 : ch === 'f' ? 30 : null;
          if (lightness != null) {
            const hue = (f * 25 + cellX * 40 + cellY * 30) % 360;
            color = `hsl(${hue}, 100%, ${lightness}%)`;
          }
        } else {
          color = tierPalette[ch] || palette[ch];
        }
        if (color) {
          fireCtx.fillStyle = color;
          fireCtx.fillRect(x * SP_PX, y * SP_PX, SP_PX, SP_PX);
        }
      }
    }
    fireCtx.restore();
  }

  function drawFire() {
    if (!fireTier) return;
    fireCtx.clearRect(0, 0, fireCanvas.width, fireCanvas.height);
    const f = Math.floor(performance.now() / FIRE_FRAME_MS);
    const n = SPR_FIRE.length;
    const HALF_PI = Math.PI / 2;
    for (let x = 1; x < FIRE_GRID_W - 1; x++) {
      drawFireSprite(SPR_FIRE[(x + f) % n], x, 0, 0, f);
      drawFireSprite(SPR_FIRE[(x * 3 + f + 1) % n], x, FIRE_GRID_H - 1, Math.PI, f);
    }
    for (let y = 1; y < FIRE_GRID_H - 1; y++) {
      drawFireSprite(SPR_FIRE[(y * 5 + f + 2) % n], 0, y, -HALF_PI, f);
      drawFireSprite(SPR_FIRE[(y * 7 + f) % n], FIRE_GRID_W - 1, y, HALF_PI, f);
    }
  }

  function setFireTier(name) {
    if (name) {
      SFX.playWoosh();
      const snapshot = [...foods];
      snapshot.forEach((f, i) => {
        if (f.type === 'rat')        { score += FOOD_TYPES.rat.value; foodScore += FOOD_TYPES.rat.value; rats++; }
        else if (f.type === 'egg')   { score += FOOD_TYPES.egg.value; foodScore += FOOD_TYPES.egg.value; eggs++; }
        else if (f.type === 'goldegg') { score += FOOD_TYPES.goldegg.value; foodScore += FOOD_TYPES.goldegg.value; eggs++; }
        else if (f.type === 'pineapple') { score += 10; foodScore += 10; pineapples++; }
        SFX.playCoin(300 + i * 90);
      });
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('snake_best', best);
      }
      foods = [];
      unlockFlash = { items: snapshot, startMs: performance.now(), SOLID_MS: 2000, FLASH_MS: 2500, FLASH_INTERVAL_MS: 150, BLANK_MS: 1200 };
      if (name === 'rainbow') apocalypseHintStart = performance.now();
      gameWrapperEl.classList.add('fire-on');
    } else {
      gameWrapperEl.classList.remove('fire-on');
    }
    fireTier = name;
  }

  function drawUnlockFlash() {
    if (!unlockFlash) return;
    const elapsed = performance.now() - unlockFlash.startMs;
    const { items, SOLID_MS, FLASH_MS, FLASH_INTERVAL_MS, BLANK_MS } = unlockFlash;
    if (elapsed >= SOLID_MS + FLASH_MS + BLANK_MS) {
      unlockFlash = null;
      spawnFood();
      return;
    }
    if (elapsed >= SOLID_MS + FLASH_MS) return;
    const visible = elapsed < SOLID_MS
      ? true
      : Math.floor((elapsed - SOLID_MS) / FLASH_INTERVAL_MS) % 2 === 0;
    if (!visible || items.length === 0) return;
    const tierPalette = FIRE_TIER_PALETTES[fireTier] || FIRE_TIER_PALETTES.fire;
    const f = Math.floor(performance.now() / FIRE_FRAME_MS);
    const sprite = SPR_FIRE[f % SPR_FIRE.length];
    for (const item of items) {
      const baseX = item.x * CELL;
      const baseY = item.y * CELL;
      for (let y = 0; y < SP_GRID; y++) {
        const row = sprite[y];
        for (let x = 0; x < SP_GRID; x++) {
          const color = tierPalette[row[x]] || palette[row[x]];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(baseX + x * SP_PX, baseY + y * SP_PX, SP_PX, SP_PX);
          }
        }
      }
    }
  }

  function unlockFire() {
    const currentIndex = fireTier ? tierIndex(fireTier) : -1;
    const next = FIRE_TIERS[currentIndex + 1];
    setFireTier(next ? next.name : null);
  }

  function drawSprite(sprite, cellX, cellY) {
    const baseX = cellX * CELL;
    const baseY = cellY * CELL;
    for (let y = 0; y < SP_GRID; y++) {
      const row = sprite[y];
      for (let x = 0; x < SP_GRID; x++) {
        const color = palette[row[x]];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(...spriteRect(baseX, baseY, x, y));
        }
      }
    }
  }

  function drawSpriteRainbow(sprite, cellX, cellY, hue) {
    const baseX = cellX * CELL;
    const baseY = cellY * CELL;
    for (let y = 0; y < SP_GRID; y++) {
      const row = sprite[y];
      for (let x = 0; x < SP_GRID; x++) {
        const ch = row[x];
        let color;
        if      (ch === 'd' || ch === 'T') color = `hsl(${hue},100%,22%)`;
        else if (ch === 'g' || ch === 't') color = `hsl(${hue},100%,50%)`;
        else if (ch === 'h' || ch === 'i') color = `hsl(${hue},100%,78%)`;
        else color = palette[ch];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(...spriteRect(baseX, baseY, x, y));
        }
      }
    }
  }

  function drawSnakeHead(cellX, cellY, direction) {
    drawSprite(SPR_HEAD, cellX, cellY);
    const offsets = PUPIL_OFFSETS[`${direction.x},${direction.y}`] || PUPIL_OFFSETS['1,0'];
    const baseX = cellX * CELL;
    const baseY = cellY * CELL;
    ctx.fillStyle = palette.K;
    for (const [px, py] of offsets) {
      ctx.fillRect(...spriteRect(baseX, baseY, px, py, 1, 1));
    }
  }

  const drawSnakeHeadDead = (cellX, cellY) => drawSprite(SPR_HEAD_DEAD, cellX, cellY);

  function drawTongue(headX, headY) {
    const distLeft = headX;
    const distRight = GRID_W - 1 - headX;
    const distTop = headY;
    const distBottom = GRID_H - 1 - headY;
    const nearestVertWall = Math.min(distLeft, distRight);
    const nearestHorizWall = Math.min(distTop, distBottom);
    let dir;
    if (nearestVertWall <= nearestHorizWall) {
      // Nearest wall is vertical (left/right) → tongue goes down (never up,
      // so it doesn't emerge next to the eyes).
      dir = 'down';
    } else {
      // Nearest wall is horizontal (top/bottom) → tongue goes horizontal.
      dir = distRight >= distLeft ? 'right' : 'left';
    }
    // Fallback: if 'down' has no room (head on bottom row), go horizontal.
    if (dir === 'down' && distBottom === 0) {
      dir = distRight >= distLeft ? 'right' : 'left';
    }
    let sprite, cellX = headX, cellY = headY;
    switch (dir) {
      case 'right': sprite = SPR_TONGUE_RIGHT; break;
      case 'left':  sprite = SPR_TONGUE_LEFT;  cellX = headX - 1; break;
      case 'down':  sprite = SPR_TONGUE_DOWN;  break;
    }
    const baseX = cellX * CELL;
    const baseY = cellY * CELL;
    for (let y = 0; y < sprite.length; y++) {
      const row = sprite[y];
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(...spriteRect(baseX, baseY, x, y));
        }
      }
    }
  }
  const drawSnakeBody = (cellX, cellY) => drawSprite(SPR_BODY, cellX, cellY);
  const drawRat       = (cellX, cellY) => drawSprite(SPR_RAT,  cellX, cellY);
  const drawEgg       = (cellX, cellY) => drawSprite(SPR_EGG,  cellX, cellY);
  const drawPineapple = (cellX, cellY) => drawSprite(SPR_PINEAPPLE, cellX, cellY);

  function drawGoldEgg(cellX, cellY) {
    const sweep = (Math.sin(performance.now() / 900) + 1) / 2;
    const baseX = cellX * CELL;
    const baseY = cellY * CELL;
    for (let y = 0; y < SP_GRID; y++) {
      const row = SPR_EGG[y];
      for (let x = 0; x < SP_GRID; x++) {
        const ch = row[x];
        const shine = Math.max(0, 1 - Math.abs(x / (SP_GRID - 1) - sweep) * 3.5);
        let color;
        if      (ch === 'O') color = `hsl(${38 + shine*10},90%,${Math.round(22 + shine*28)}%)`;
        else if (ch === 'E') color = `hsl(${42 + shine*12},${Math.round(85 + shine*15)}%,${Math.round(50 + shine*45)}%)`;
        else if (ch === 'e') color = `hsl(${50 + shine*10},100%,${Math.round(68 + shine*30)}%)`;
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(...spriteRect(baseX, baseY, x, y));
        }
      }
    }
  }

  function drawSnakeTail(cellX, cellY, tailDir) {
    const sprite = TAIL_SPRITES[`${tailDir.x},${tailDir.y}`] || SPR_TAIL_RIGHT;
    drawSprite(sprite, cellX, cellY);
  }

  const FOOD_SPRITES = { rat: drawRat, egg: drawEgg, goldegg: drawGoldEgg, pineapple: drawPineapple };

  function renderSpriteToCanvas(sprite, targetCanvas) {
    const tctx = targetCanvas.getContext('2d');
    const size = targetCanvas.width;
    tctx.clearRect(0, 0, size, size);
    for (let y = 0; y < SP_GRID; y++) {
      const row = sprite[y];
      const py = Math.floor(y * size / SP_GRID);
      const pyNext = Math.floor((y + 1) * size / SP_GRID);
      for (let x = 0; x < SP_GRID; x++) {
        const color = palette[row[x]];
        if (color) {
          const px = Math.floor(x * size / SP_GRID);
          const pxNext = Math.floor((x + 1) * size / SP_GRID);
          tctx.fillStyle = color;
          tctx.fillRect(px, py, pxNext - px, pyNext - py);
        }
      }
    }
  }

  function initLegend() {
    renderSpriteToCanvas(SPR_RAT, document.getElementById('legend-rat'));
    renderSpriteToCanvas(SPR_EGG, document.getElementById('legend-egg'));
    renderSpriteToCanvas(SPR_PINEAPPLE, document.getElementById('legend-pineapple'));
    renderSpriteToCanvas(SPR_PINEAPPLE, document.getElementById('title-pineapple'));
    renderSpriteToCanvas(SPR_PINEAPPLE, document.getElementById('gameover-pineapple'));
    document.getElementById('rat-pts').textContent = FOOD_TYPES.rat.value;
    document.getElementById('egg-pts').textContent = FOOD_TYPES.egg.value;
  }

  const DIR_SPRITES = {
    up: SPR_BTN_UP, down: SPR_BTN_DOWN, left: SPR_BTN_LEFT, right: SPR_BTN_RIGHT,
  };
  function initButtonIcons() {
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      renderSpriteToCanvas(DIR_SPRITES[btn.dataset.dir], btn.querySelector('.btn-icon'));
    });
    renderSpriteToCanvas(SPR_BTN_PAUSE, document.querySelector('#btn-pause .btn-icon'));
    renderSpriteToCanvas(SPR_BTN_RESTART, document.querySelector('#btn-restart .btn-icon'));
    renderSpriteToCanvas(SPR_BTN_CROWN, document.querySelector('#btn-leaderboard .btn-icon'));
  }

  // Pick from fixed NES-master-palette schemes. No interpolation — authentic hardware colors only.
  const SNAKE_SCHEMES = [
    { d: '#005800', g: '#00A800', h: '#58F898' }, // classic green
    { d: '#881400', g: '#F83800', h: '#F87858' }, // red
    { d: '#0000BC', g: '#0078F8', h: '#3CBCFC' }, // blue
    { d: '#680098', g: '#B800B8', h: '#F878F8' }, // purple/pink
    { d: '#503000', g: '#AC7C00', h: '#F8B800' }, // gold/brown
  ];

  function randomizeSnakePalette() {
    const scheme = SNAKE_SCHEMES[Math.floor(Math.random() * SNAKE_SCHEMES.length)];
    palette.d = scheme.d;
    palette.g = scheme.g;
    palette.h = scheme.h;
    console.log('[snake] new palette', scheme);
  }

  // --- Particles (pineapple explosion) -----------------------------------

  const PARTICLE_COLORS = ['Y', 'L', 'B'];

  function spawnExplosion(cellX, cellY) {
    const cx = (cellX + 0.5) * CELL;
    const cy = (cellY + 0.5) * CELL;
    const count = 28;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 180 + Math.random() * 380;
      const key = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 180,
        size: 3 + Math.random() * 5,
        color: palette[key],
        life: 1.1 + Math.random() * 0.6,
        age: 0,
      });
    }
  }

  function updateParticles(dt) {
    const gravity = 700;
    for (const p of particles) {
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
    }
    particles = particles.filter(p => p.age < p.life);
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // --- Main render -------------------------------------------------------

  function draw() {
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#20202e';
    for (let i = 0; i < GRID_W; i++) {
      for (let j = 0; j < GRID_H; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(i * CELL, j * CELL, CELL, CELL);
      }
    }

    foods.forEach(f => FOOD_SPRITES[f.type](f.x, f.y));

    const lastIdx = snake.length - 1;
    const tail = snake[lastIdx];
    const prev = snake[lastIdx - 1];
    const tailDir = prev ? { x: tail.x - prev.x, y: tail.y - prev.y } : dir;

    snake.forEach((s, i) => {
      if (fireTier === 'rainbow') {
        const hue = (performance.now() * 0.05 + i * 20) % 360;
        if (i === 0) {
          if (alive) {
            drawSpriteRainbow(SPR_HEAD, s.x, s.y, hue);
            const offsets = PUPIL_OFFSETS[`${dir.x},${dir.y}`] || PUPIL_OFFSETS['1,0'];
            const baseX = s.x * CELL;
            const baseY = s.y * CELL;
            ctx.fillStyle = palette.K;
            for (const [px, py] of offsets) ctx.fillRect(...spriteRect(baseX, baseY, px, py, 1, 1));
          } else drawSnakeHeadDead(s.x, s.y);
        } else if (i === lastIdx) {
          const sprite = TAIL_SPRITES[`${tailDir.x},${tailDir.y}`] || SPR_TAIL_RIGHT;
          drawSpriteRainbow(sprite, s.x, s.y, hue);
        } else {
          drawSpriteRainbow(SPR_BODY, s.x, s.y, hue);
        }
      } else {
        if (i === 0) {
          if (alive) drawSnakeHead(s.x, s.y, dir);
          else drawSnakeHeadDead(s.x, s.y);
        }
        else if (i === lastIdx) drawSnakeTail(s.x, s.y, tailDir);
        else drawSnakeBody(s.x, s.y);
      }
    });

    if (!alive) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawTongue(snake[0].x, snake[0].y);
      ctx.fillStyle = '#f76363';
      ctx.font = "24px 'Press Start 2P', 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = "10px 'Press Start 2P', 'Courier New', monospace";
      ctx.fillText(isNarrowViewport ? 'TAP TO RESTART' : 'PRESS R TO RESTART', canvas.width / 2, canvas.height / 2 + 28);
    } else if (paused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const tickMs = currentTickMs();
      const pausePhase = (performance.now() % tickMs) / tickMs;
      const pausePulse = 0.3 + 0.7 * (1 + Math.cos(pausePhase * Math.PI * 2)) / 2;
      ctx.save();
      ctx.globalAlpha = pausePulse;
      ctx.fillStyle = '#f7d358';
      ctx.font = "22px 'Press Start 2P', 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }

    drawParticles();
    drawUnlockFlash();
    drawSwipeHint();
    drawBeatHint();
    drawApocalypseHint();
  }

  function drawSwipeHint() {
    if (!isNarrowViewport || !alive || paused) return;
    if (hintDismissed && hintFadeStart === null) return;
    let alpha = 1;
    if (hintFadeStart !== null) {
      const elapsed = performance.now() - hintFadeStart;
      if (elapsed >= HINT_FADE_MS) {
        if (beatHintStart === null) beatHintStart = performance.now();
        return;
      }
      alpha = 1 - elapsed / HINT_FADE_MS;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#8bd17c';
    ctx.font = `${Math.floor(CELL * 1.1)}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2190  SWIPE  \u2192', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  function drawBeatHint() {
    if (!alive || paused || beatHintStart === null || beatHintStart === -1) return;
    const now = performance.now();
    const elapsed = now - beatHintStart;
    if (elapsed >= BEAT_HINT_SHOW_MS + BEAT_HINT_FADE_MS) { beatHintStart = -1; return; }
    const fadeAlpha = elapsed < BEAT_HINT_SHOW_MS
      ? 1
      : 1 - (elapsed - BEAT_HINT_SHOW_MS) / BEAT_HINT_FADE_MS;
    const phase = (now - lastTick) / currentTickMs();
    const pulse = 0.3 + 0.7 * (1 + Math.cos(phase * Math.PI * 2)) / 2;
    ctx.save();
    ctx.globalAlpha = fadeAlpha * 0.65;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, canvas.height / 2 - 20, canvas.width, 40);
    ctx.globalAlpha = fadeAlpha * pulse;
    ctx.fillStyle = '#f7d358';
    ctx.font = "22px 'Press Start 2P', 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOVE ON THE BEAT', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  function drawApocalypseHint() {
    if (!alive || apocalypseHintStart === null) return;
    const now = performance.now();
    const elapsed = now - apocalypseHintStart;
    if (elapsed >= 15500) { apocalypseHintStart = null; return; }
    const phase = (now - lastTick) / currentTickMs();
    const pulse = 0.4 + 0.6 * (1 + Math.cos(phase * Math.PI * 2)) / 2;
    const hue = (now * 0.3) % 360;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.save();
    ctx.fillStyle = `hsl(${hue}, 100%, 62%)`;
    ctx.font = "22px 'Press Start 2P', 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bandH = (n) => 30 + n * 36;
    const drawBand = (alpha, n) => {
      ctx.globalAlpha = alpha * 0.65;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, cy - bandH(n) / 2, canvas.width, bandH(n));
    };
    const drawLines = (lines, alpha) => {
      ctx.fillStyle = `hsl(${hue}, 100%, 62%)`;
      lines.forEach((text, i) => {
        const offset = (i - (lines.length - 1) / 2) * 36;
        ctx.globalAlpha = alpha * pulse;
        ctx.fillText(text, cx, cy + offset);
      });
    };

    // Phase 1 (0–3.5s): title
    if (elapsed < 3500) {
      const alpha = elapsed < 300 ? elapsed / 300 : elapsed > 3000 ? 1 - (elapsed - 3000) / 500 : 1;
      drawBand(alpha, 2);
      drawLines(['!!! RAINBOW SNAKE !!!', 'OF THE APOCALYPSE'], alpha);
    }

    // Phase 2 (3.8s–11s): slides, each replacing the previous
    if (elapsed >= 3800) {
      const FADE = 300;
      const slides = [
        { lines: ['YOU ARE THE CHOSEN ONE...'],              appear: 3800,  end: 7300  },
        { lines: ['DESTROY ALL EVIL', 'PINEAPPLES...'],      appear: 7600,  end: 11100 },
        { lines: ['AVENGE YOUR BROTHERS', 'AND SISTERS!!!'], appear: 11400, end: 14900 },
      ];
      slides.forEach(({ lines, appear, end }) => {
        if (elapsed < appear || elapsed >= end + FADE) return;
        const alpha = elapsed < appear + FADE ? (elapsed - appear) / FADE
                    : elapsed < end           ? 1
                    : 1 - (elapsed - end) / FADE;
        drawBand(alpha, lines.length);
        drawLines(lines, alpha);
      });
    }

    ctx.restore();
  }

  let prevGamepadButtons = [];
  function pollGamepad() {
    const pads = (typeof navigator.getGamepads === 'function') ? navigator.getGamepads() : [];
    let pad = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) { pad = pads[i]; break; }
    }
    if (!pad) { prevGamepadButtons = []; return; }
    const pressed = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const justPressed = (i) => pressed(i) && !prevGamepadButtons[i];
    let gpDir = null;
    if (pressed(12)) gpDir = { x: 0, y: -1 };
    else if (pressed(13)) gpDir = { x: 0, y: 1 };
    else if (pressed(14)) gpDir = { x: -1, y: 0 };
    else if (pressed(15)) gpDir = { x: 1, y: 0 };
    else {
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const dz = 0.5;
      if (Math.abs(ax) > Math.abs(ay)) {
        if (ax > dz) gpDir = { x: 1, y: 0 };
        else if (ax < -dz) gpDir = { x: -1, y: 0 };
      } else {
        if (ay > dz) gpDir = { x: 0, y: 1 };
        else if (ay < -dz) gpDir = { x: 0, y: -1 };
      }
    }
    const inputFocused = document.activeElement === initialsInputEl;
    if (gpDir && !inputFocused) {
      nextDir = gpDir;
      dismissHint();
    }
    if (inputFocused) {
      if (justPressed(0)) submitScore();
      if (justPressed(1)) dismissOverlay();
    } else {
      if (justPressed(9)) togglePause();
      if (justPressed(0)) restart();
      if (justPressed(1)) dismissOverlay();
    }
    prevGamepadButtons = pad.buttons.map(b => !!b.pressed);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    pollGamepad();
    if (alive && !paused && now - lastTick >= currentTickMs()) {
      step();
      lastTick = now;
    }
    if (alive && !paused) maybeRescueSpawn();
    if (!paused) updateParticles(dt);
    draw();
    drawFire();
    if (!alive && !gameOverShown) {
      gameOverShown = true;
      onGameOver();
    }
    requestAnimationFrame(loop);
  }

  const keyMap = {
    ArrowUp: {x: 0, y: -1}, w: {x: 0, y: -1}, W: {x: 0, y: -1},
    ArrowDown: {x: 0, y: 1}, s: {x: 0, y: 1}, S: {x: 0, y: 1},
    ArrowLeft: {x: -1, y: 0}, a: {x: -1, y: 0}, A: {x: -1, y: 0},
    ArrowRight: {x: 1, y: 0}, d: {x: 1, y: 0}, D: {x: 1, y: 0},
  };

  const pauseBtn = document.getElementById('btn-pause');
  const pauseIcon = pauseBtn.querySelector('.btn-icon');

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    if (paused) {
      pausedAt = performance.now();
    } else {
      pausedTotal += performance.now() - pausedAt;
      lastTick = performance.now();
    }
    renderSpriteToCanvas(paused ? SPR_BTN_PLAY : SPR_BTN_PAUSE, pauseIcon);
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  }

  const KONAMI_SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
  let konamiBuf = [];
  function recordKonami(key) {
    konamiBuf.push(key);
    if (konamiBuf.length > KONAMI_SEQ.length) konamiBuf.shift();
    if (konamiBuf.length === KONAMI_SEQ.length && KONAMI_SEQ.every((k, i) => konamiBuf[i] === k)) {
      unlockFire();
      konamiBuf = [];
    }
  }

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === initialsInputEl) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitScore();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dismissOverlay();
      }
      return;
    }
    if (e.key && e.key.startsWith('Arrow')) recordKonami(e.key);
    if (keyMap[e.key]) {
      nextDir = keyMap[e.key];
      dismissHint();
      e.preventDefault();
    } else if (e.key === ' ') {
      togglePause();
      e.preventDefault();
    } else if (e.key === 'r' || e.key === 'R') {
      restart();
    } else if (e.key === 'm' || e.key === 'M') {
      if (SFX.isEnabled()) {
        if (SFX.isMuted()) { SFX.unmute(); } else { SFX.mute(); }
      }
    } else if (e.key === 'Escape') {
      dismissOverlay();
    }
  });

  submitBtnEl.addEventListener('click', () => submitScore());
  skipBtnEl.addEventListener('click', () => showLeaderboard());
  overlayRestartBtnEl.addEventListener('click', () => restart());
  initialsInputEl.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  });

  function restart() {
    if (gameOverRevealTimeoutId !== null) {
      clearTimeout(gameOverRevealTimeoutId);
      gameOverRevealTimeoutId = null;
    }
    reset();
    renderSpriteToCanvas(SPR_BTN_PAUSE, pauseIcon);
    pauseBtn.setAttribute('aria-label', 'Pause');
    hideGameOverOverlay();
    gameOverShown = false;
  }

  function hideGameOverOverlay() {
    overlayEl.classList.remove('visible');
    overlayEl.hidden = true;
    submitFormEl.hidden = false;
    leaderboardBlockEl.hidden = true;
    submitStatusEl.textContent = '';
    submitStatusEl.classList.remove('error');
    overlayRestartBtnEl.hidden = false;
    overlayCloseBtnEl.hidden = true;
    restartHintEl.hidden = false;
    leaderboardViewMode = false;
    autoPausedByLeaderboard = false;
    lastSubmittedId = null;
  }

  function scoreMakesTop10(s) {
    if (!leaderboardCache || leaderboardCache.length < 10) return true;
    return s > leaderboardCache[9].score;
  }

  function onGameOver() {
    leaderboardViewMode = false;
    autoPausedByLeaderboard = false;
    overlayRestartBtnEl.hidden = false;
    overlayCloseBtnEl.hidden = false;
    restartHintEl.hidden = false;
    finalScoreEl.textContent = score;
    submitStatusEl.textContent = '';
    submitStatusEl.classList.remove('error');
    const makesTop = scoreMakesTop10(score);
    submitFormEl.hidden = !makesTop;
    leaderboardBlockEl.hidden = makesTop;
    if (makesTop) {
      const savedInitials = localStorage.getItem('snake_initials') || '';
      initialsInputEl.value = savedInitials;
      submitBtnEl.disabled = false;
      if (!juicer) {
        submitStatusEl.textContent = 'LEADERBOARD OFFLINE';
        submitStatusEl.classList.add('error');
        submitBtnEl.disabled = true;
      }
    } else {
      lastSubmittedId = null;
      renderLeaderboard();
    }
    if (gameOverRevealTimeoutId !== null) clearTimeout(gameOverRevealTimeoutId);
    gameOverRevealTimeoutId = setTimeout(() => {
      gameOverRevealTimeoutId = null;
      if (alive) return;
      overlayEl.hidden = false;
      requestAnimationFrame(() => overlayEl.classList.add('visible'));
      if (makesTop) setTimeout(() => initialsInputEl.focus(), 450);
    }, GAMEOVER_REVEAL_DELAY_MS);
  }

  async function submitScore() {
    const raw = (initialsInputEl.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    const padded = raw.padEnd(3, '_');
    if (!juicer) {
      showLeaderboard();
      return;
    }
    submitStatusEl.classList.remove('error');
    submitStatusEl.textContent = 'SUBMITTING...';
    submitBtnEl.disabled = true;
    skipBtnEl.disabled = true;
    localStorage.setItem('snake_initials', raw);
    const { data, error } = await juicer.rpc('submit_score', {
      p_payload: {
        initials: padded,
        score: Math.floor(score),
        level: Math.floor(level),
        rats: rats,
        eggs: eggs,
        pineapples: pineapples,
        time_played: Math.floor(survivalSeconds()),
      },
    });
    submitBtnEl.disabled = false;
    skipBtnEl.disabled = false;
    if (error) {
      submitStatusEl.textContent = 'FAILED: ' + (error.message || 'ERROR');
      submitStatusEl.classList.add('error');
      return;
    }
    lastSubmittedId = data || null;
    await fetchLeaderboard();
    showLeaderboard();
  }

  function showLeaderboardView() {
    if (overlayEl.hidden === false) return;
    leaderboardViewMode = true;
    if (alive && !paused) {
      autoPausedByLeaderboard = true;
      togglePause();
    }
    overlayEl.hidden = false;
    requestAnimationFrame(() => overlayEl.classList.add('visible'));
    submitFormEl.hidden = true;
    leaderboardBlockEl.hidden = false;
    overlayRestartBtnEl.hidden = true;
    overlayCloseBtnEl.hidden = false;
    restartHintEl.hidden = true;
    showLeaderboard();
  }

  function closeLeaderboardView() {
    leaderboardViewMode = false;
    overlayEl.classList.remove('visible');
    overlayEl.hidden = true;
    overlayRestartBtnEl.hidden = false;
    overlayCloseBtnEl.hidden = true;
    restartHintEl.hidden = false;
    lastSubmittedId = null;
    if (autoPausedByLeaderboard) {
      autoPausedByLeaderboard = false;
      if (paused) togglePause();
    }
  }

  function dismissOverlay() {
    if (gameOverRevealTimeoutId !== null) {
      clearTimeout(gameOverRevealTimeoutId);
      gameOverRevealTimeoutId = null;
    }
    if (overlayEl.hidden) return;
    if (leaderboardViewMode) {
      closeLeaderboardView();
      return;
    }
    if (document.activeElement === initialsInputEl) initialsInputEl.blur();
    overlayEl.classList.remove('visible');
    overlayEl.hidden = true;
    lastSubmittedId = null;
  }

  function showLeaderboard() {
    submitFormEl.hidden = true;
    leaderboardBlockEl.hidden = false;
    renderLeaderboard();
  }

  function renderLeaderboard() {
    const placeholder = (text) => `<li><span class="rank"></span><span class="ini">${text}</span><span class="sc"></span></li>`;
    if (leaderboardStatus === 'offline') { leaderboardListEl.innerHTML = placeholder('OFFLINE'); return; }
    if (leaderboardStatus === 'error' && !leaderboardCache) { leaderboardListEl.innerHTML = placeholder('ERROR'); return; }
    if (leaderboardStatus === 'loading' && !leaderboardCache) { leaderboardListEl.innerHTML = placeholder('LOADING...'); return; }
    if (!leaderboardCache || leaderboardCache.length === 0) { leaderboardListEl.innerHTML = placeholder('NO SCORES YET'); return; }
    const width = String(leaderboardCache[0].score).length;
    leaderboardListEl.innerHTML = leaderboardCache.map((row, i) => {
      const mine = row.id === lastSubmittedId ? ' class="mine"' : '';
      const padded = String(row.score).padStart(width, '0');
      return `<li${mine}><span class="rank">${i + 1}.</span><span class="ini">${row.initials}</span><span class="sc">${padded}</span></li>`;
    }).join('');
  }

  async function fetchLeaderboard() {
    if (!juicer) { leaderboardStatus = 'offline'; return; }
    const { data, error } = await juicer
      .from('scores')
      .select('id, initials, score')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);
    if (error) {
      leaderboardStatus = 'error';
    } else {
      leaderboardCache = data || [];
      leaderboardStatus = 'ready';
    }
    if (!leaderboardBlockEl.hidden) renderLeaderboard();
  }

  pauseBtn.addEventListener('click', (e) => {
    togglePause();
    e.currentTarget.blur();
  });
  document.getElementById('btn-restart').addEventListener('click', (e) => {
    restart();
    e.currentTarget.blur();
  });
  leaderboardBtnEl.addEventListener('click', (e) => {
    showLeaderboardView();
    e.currentTarget.blur();
  });
  overlayCloseBtnEl.addEventListener('click', () => dismissOverlay());
  canvas.addEventListener('click', () => {
    if (!alive) restart();
  });

  const DIR_MAP = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const DPAD_TO_ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      nextDir = DIR_MAP[btn.dataset.dir];
      recordKonami(DPAD_TO_ARROW[btn.dataset.dir]);
      dismissHint();
      e.preventDefault();
    });
  });

  let swipeStart = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    swipeStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    swipeStart = null;
    const threshold = 24;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      nextDir = dx > 0 ? DIR_MAP.right : DIR_MAP.left;
    } else {
      nextDir = dy > 0 ? DIR_MAP.down : DIR_MAP.up;
    }
    dismissHint();
  }, { passive: true });

  const kbdInfoEl = document.getElementById('kbd-info');
  kbdInfoEl.open = !window.matchMedia('(pointer: coarse)').matches;

  initLegend();
  initButtonIcons();
  reset();
  document.addEventListener('gamestart', () => {
    SFX.enable();
    SFX.playModem(() => SFX.startMusic(currentTickMs()));
    requestAnimationFrame(loop);
  }, { once: true });
  fetchLeaderboard();
  if (juicer) setInterval(fetchLeaderboard, LEADERBOARD_POLL_MS);
})();
