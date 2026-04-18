(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');

  const GRID = 24;
  const CELL = canvas.width / GRID;
  const START_TICK_MS = 264;
  const MIN_TICK_MS = 55;
  const TICK_STEP_MS = 12;
  const FOOD_PER_LEVEL = 3;
  const SECONDS_PER_LEVEL = 12;
  const MAX_LEVEL = 15;
  const MAX_FOOD = 3;
  const EGG_CHANCE = 0.3;
  const PINEAPPLE_CHANCE = 0.15;
  const LEVEL_UP_BONUS = 2;
  const RESCUE_DELAY_MIN = 3;
  const RESCUE_DELAY_MAX = 8;
  const FOOD_TYPES = {
    rat: { value: 1 },
    egg: { value: 3 },
    pineapple: { value: 0, deadly: true },
  };

  const levelEl = document.getElementById('level');

  let snake, dir, nextDir, foods, score, best, alive, paused, lastTick;
  let level, startTime, pausedAt, pausedTotal;
  let particles, lastFrame;
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
    level = 1;
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
  }

  function survivalSeconds() {
    return (performance.now() - startTime - pausedTotal) / 1000;
  }

  function computeLevel() {
    const byFood = Math.floor(score / FOOD_PER_LEVEL);
    const byTime = Math.floor(survivalSeconds() / SECONDS_PER_LEVEL);
    return Math.min(MAX_LEVEL, 1 + Math.min(byFood, byTime));
  }

  function currentTickMs() {
    return Math.max(MIN_TICK_MS, START_TICK_MS - (level - 1) * TICK_STEP_MS);
  }

  function isCellFree(x, y) {
    if (snake.some(s => s.x === x && s.y === y)) return false;
    if (foods.some(f => f.x === x && f.y === y)) return false;
    return true;
  }

  function spawnFood() {
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(Math.random() * GRID);
      const y = Math.floor(Math.random() * GRID);
      if (isCellFree(x, y)) {
        const r = Math.random();
        const type = r < PINEAPPLE_CHANCE
          ? 'pineapple'
          : (r < PINEAPPLE_CHANCE + EGG_CHANCE ? 'egg' : 'rat');
        foods.push({ x, y, type });
        return;
      }
    }
  }

  function allPineapples() {
    return foods.length > 0 && foods.every(f => f.type === 'pineapple');
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
        if (x < 0 || x >= GRID || y < 0 || y >= GRID) continue;
        if (!isCellFree(x, y)) continue;
        foods.push({ x, y, type: 'rat' });
        return true;
      }
    }
    for (let tries = 0; tries < 100; tries++) {
      const x = Math.floor(Math.random() * GRID);
      const y = Math.floor(Math.random() * GRID);
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
    if (allPineapples()) {
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

  function step() {
    if (!alive || paused) return;

    if (nextDir.x !== -dir.x || nextDir.y !== -dir.y) {
      dir = nextDir;
    }

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      alive = false;
      return;
    }
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      alive = false;
      return;
    }

    snake.unshift(head);

    const eatenIdx = foods.findIndex(f => f.x === head.x && f.y === head.y);
    if (eatenIdx !== -1) {
      const eaten = foods[eatenIdx];
      if (FOOD_TYPES[eaten.type].deadly) {
        spawnExplosion(head.x, head.y);
        alive = false;
        return;
      }
      score += FOOD_TYPES[eaten.type].value;
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
    }
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
    // dead tongue (bright red)
    R: '#F83800',
    '.': null,
  };

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
    const distRight = GRID - 1 - headX;
    const distTop = headY;
    const distBottom = GRID - 1 - headY;
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

  function drawSnakeTail(cellX, cellY, tailDir) {
    const sprite = TAIL_SPRITES[`${tailDir.x},${tailDir.y}`] || SPR_TAIL_RIGHT;
    drawSprite(sprite, cellX, cellY);
  }

  const FOOD_SPRITES = { rat: drawRat, egg: drawEgg, pineapple: drawPineapple };

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
    document.getElementById('rat-pts').textContent = FOOD_TYPES.rat.value;
    document.getElementById('egg-pts').textContent = FOOD_TYPES.egg.value;
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
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(i * CELL, j * CELL, CELL, CELL);
      }
    }

    foods.forEach(f => FOOD_SPRITES[f.type](f.x, f.y));

    const lastIdx = snake.length - 1;
    const tail = snake[lastIdx];
    const prev = snake[lastIdx - 1];
    const tailDir = prev ? { x: tail.x - prev.x, y: tail.y - prev.y } : dir;

    snake.forEach((s, i) => {
      if (i === 0) {
        if (alive) drawSnakeHead(s.x, s.y, dir);
        else drawSnakeHeadDead(s.x, s.y);
      }
      else if (i === lastIdx) drawSnakeTail(s.x, s.y, tailDir);
      else drawSnakeBody(s.x, s.y);
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
      ctx.fillText('PRESS R TO RESTART', canvas.width / 2, canvas.height / 2 + 28);
    } else if (paused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f7d358';
      ctx.font = "22px 'Press Start 2P', 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    }

    drawParticles();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (alive && !paused && now - lastTick >= currentTickMs()) {
      step();
      lastTick = now;
    }
    if (alive && !paused) maybeRescueSpawn();
    if (!paused) updateParticles(dt);
    draw();
    requestAnimationFrame(loop);
  }

  const keyMap = {
    ArrowUp: {x: 0, y: -1}, w: {x: 0, y: -1}, W: {x: 0, y: -1},
    ArrowDown: {x: 0, y: 1}, s: {x: 0, y: 1}, S: {x: 0, y: 1},
    ArrowLeft: {x: -1, y: 0}, a: {x: -1, y: 0}, A: {x: -1, y: 0},
    ArrowRight: {x: 1, y: 0}, d: {x: 1, y: 0}, D: {x: 1, y: 0},
  };

  const pauseBtn = document.getElementById('btn-pause');

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    if (paused) {
      pausedAt = performance.now();
    } else {
      pausedTotal += performance.now() - pausedAt;
      lastTick = performance.now();
    }
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  }

  window.addEventListener('keydown', (e) => {
    if (keyMap[e.key]) {
      nextDir = keyMap[e.key];
      e.preventDefault();
    } else if (e.key === ' ') {
      togglePause();
      e.preventDefault();
    } else if (e.key === 'r' || e.key === 'R') {
      reset();
    }
  });

  pauseBtn.addEventListener('click', (e) => {
    togglePause();
    e.currentTarget.blur();
  });
  document.getElementById('btn-restart').addEventListener('click', (e) => {
    reset();
    pauseBtn.textContent = '⏸';
    pauseBtn.setAttribute('aria-label', 'Pause');
    e.currentTarget.blur();
  });

  const DIR_MAP = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      nextDir = DIR_MAP[btn.dataset.dir];
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
  }, { passive: true });

  const kbdInfoEl = document.getElementById('kbd-info');
  kbdInfoEl.open = !window.matchMedia('(pointer: coarse)').matches;

  initLegend();
  reset();
  requestAnimationFrame(loop);
})();
