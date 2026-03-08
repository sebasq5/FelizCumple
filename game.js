/**
 * Retro Platformer Engine
 * Implements architectural feedback: GameState, TILE_SIZE, Animations, Parallax, Checkpoints.
 */

// --- CONSTANTS & CONFIG ---
const CanvasW = 960;
const CanvasH = 540;
const TILE_SIZE = 48;
const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 1200; // 25 tiles high
const GRAVITY = 1200; // px/s^2

const GameState = {
    MENU: 0,
    PLAYING: 1,
    DIALOG: 2,
    GAMEOVER: 3,
    FINISHED: 4
};

// --- GLOBALS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let currentState = GameState.MENU;
let lastTime = 0;

// UI Elements
const uiMenu = document.getElementById('ui-menu');
const uiDialog = document.getElementById('ui-dialog');
const uiGameover = document.getElementById('ui-gameover');
const uiFinished = document.getElementById('ui-finished');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const dialogText = document.getElementById('dialog-text');
const livesContainer = document.getElementById('lives-container');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');

// Input
const keys = { w: false, a: false, d: false, space: false, enter: false };
let spacePressedLast = false;
let enterPressedLast = false;

window.addEventListener('keydown', (e) => {
    let k = e.key.toLowerCase();
    if (k === ' ') k = 'space';
    if (k === 'enter') k = 'enter';
    // Arrow key aliases
    if (k === 'arrowleft') k = 'a';
    if (k === 'arrowright') k = 'd';
    if (k === 'arrowup') k = 'w';
    if (keys.hasOwnProperty(k)) keys[k] = true;
    // Prevent page scroll with arrows
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
    let k = e.key.toLowerCase();
    if (k === ' ') k = 'space';
    if (k === 'enter') k = 'enter';
    // Arrow key aliases
    if (k === 'arrowleft') k = 'a';
    if (k === 'arrowright') k = 'd';
    if (k === 'arrowup') k = 'w';
    if (keys.hasOwnProperty(k)) keys[k] = false;
});

// --- ASSETS ---
const assetsDir = 'assets/';
const imageNames = [
    'arbol.png', 'bloque_multiplessprites.png', 'bloque_suelo.png', 'carta.png',
    'character_jumping.png', 'character_walking.png', 'chracter_golpe.png',
    'corazon_lleno.png', 'corazon_perdido.png', 'corazon_roto.png',
    'enemigosprite.png', 'fantasmasprites.png', 'fondoatardecer.png',
    'fondodenoche.png', 'meta.png', 'nube.png', 'pastel.png', 'roca.png',
    'spritemuerte.png', 'standing_character.png'
];
const removeWhiteBgList = [
    'bloque_suelo.png', 'bloque_multiplessprites.png',
    'character_jumping.png', 'character_walking.png', 'chracter_golpe.png',
    'spritemuerte.png', 'standing_character.png',
    'enemigosprite.png', 'fantasmasprites.png', 'roca.png'
];

const images = {};
let bgMusic = null;
let sfxLoseLife = null;
let sfxLoseGame = null;
let sfxWin = null;

function processImageWhiteToTransparent(img, onReady) {
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || img.width;
        tempCanvas.height = img.naturalHeight || img.height;
        if (tempCanvas.width === 0) return onReady(img);

        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(img, 0, 0);
        const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Remove pure or near-pure white backgrounds
            if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
                data[i + 3] = 0;
            }
        }
        tCtx.putImageData(imgData, 0, 0);
        const newImg = new Image();
        newImg.onload = () => onReady(newImg);
        newImg.onerror = () => onReady(img);
        newImg.src = tempCanvas.toDataURL();
    } catch (e) {
        console.warn('Canvas processing error', e);
        onReady(img);
    }
}

function loadAssets(onComplete) {
    let loaded = 0;
    const total = imageNames.length + 1; // +1 for audio

    function checkDone() {
        loaded++;
        loadingBar.style.width = Math.floor((loaded / total) * 100) + '%';
        if (loaded === total) onComplete();
    }

    imageNames.forEach(name => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            if (removeWhiteBgList.includes(name)) {
                processImageWhiteToTransparent(img, (processedImg) => {
                    images[name] = processedImg;
                    checkDone();
                });
            } else {
                images[name] = img;
                checkDone();
            }
        };
        img.onerror = () => { console.error("Missing/Error asset: " + name); checkDone(); };
        img.src = assetsDir + name;
    });

    try {
        bgMusic = new Audio(assetsDir + 'music.mp3');
        bgMusic.loop = true;
        bgMusic.addEventListener('canplaythrough', checkDone, { once: true });
        bgMusic.addEventListener('error', () => { console.error("Missing audio"); checkDone(); }, { once: true });
    } catch (e) { checkDone(); }

    // Load SFX (use cloneNode when playing so bgMusic is never interrupted)
    sfxLoseLife = new Audio(assetsDir + 'perder_vida.mp3');
    sfxLoseGame = new Audio(assetsDir + 'perder_juego.mp3');
    sfxWin = new Audio(assetsDir + 'ganaste.mp3');
}

/** Play a sound effect without stopping background music.
 *  Pass resumeMusic=true to automatically resume bgMusic after the SFX ends. */
function playSfx(audio, resumeMusic = false) {
    if (!audio) return;
    try {
        const clone = audio.cloneNode(true);
        clone.volume = audio.volume || 1;
        if (resumeMusic) {
            clone.addEventListener('ended', () => {
                if (bgMusic && bgMusic.paused) bgMusic.play().catch(() => { });
            }, { once: true });
        }
        clone.play().catch(() => { });
        // Also ensure bgMusic didn't get suspended by the browser
        if (resumeMusic && bgMusic && bgMusic.paused) {
            bgMusic.play().catch(() => { });
        }
    } catch (e) { console.warn('SFX play error', e); }
}

function isImageSafe(img) {
    return img && img.complete && img.naturalWidth > 0;
}

// --- UTILS & CLASSES ---

class Animation {
    /**
     * @param {Image} img The sprite sheet
     * @param {number} frameWidth Width of a single frame
     * @param {number} frameHeight Height of a single frame
     * @param {number} frameCount Total frames
     * @param {number} speed Frames per second
     */
    constructor(img, frameWidth, frameHeight, frameCount, speed) {
        this.img = img;
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        this.frameCount = frameCount;
        this.speed = speed;
        this.index = 0;
    }

    update(dt) {
        this.index += this.speed * dt;
        if (this.index >= this.frameCount) {
            this.index = 0; // Loop
        }
    }

    draw(ctx, x, y, w, h, flip = false) {
        if (!isImageSafe(this.img)) {
            ctx.fillStyle = '#ff66ff';
            ctx.fillRect(x, y, w, h);
            return;
        }

        const currentFrame = Math.floor(this.index) % this.frameCount;
        const sx = currentFrame * this.frameWidth;
        // Use a SQUARE crop from the sprite's own height on both axes,
        // so all animations render at the same visual proportion regardless
        // of the image's actual pixel dimensions.
        const cropSize = this.frameHeight;

        ctx.save();
        if (flip) {
            ctx.translate(x + w, y);
            ctx.scale(-1, 1);
            ctx.drawImage(this.img, sx, 0, cropSize, cropSize, 0, 0, w, h);
        } else {
            ctx.drawImage(this.img, sx, 0, cropSize, cropSize, x, y, w, h);
        }
        ctx.restore();
    }

    reset() {
        this.index = 0;
    }
}

class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
    }
    update(targetX, targetY) {
        // Center the camera on the target
        let destX = targetX - CanvasW / 2;
        let destY = targetY - CanvasH / 2 + 100; // look slightly ahead/down

        // Clamp to world boundaries
        this.x = Math.max(0, Math.min(destX, WORLD_WIDTH - CanvasW));
        this.y = Math.max(0, Math.min(destY, WORLD_HEIGHT - CanvasH));
    }
}

// --- GAME OBJECTS ---
let platforms = [];
let enemies = [];
let items = [];
let projectiles = [];
let messagesQueue = [];
let deathMessages = [];
let gameTimeElapsed = 0; // for enemy speed scaling

let player = {
    x: 100,
    y: WORLD_HEIGHT - 200,
    w: TILE_SIZE,
    h: TILE_SIZE,
    vx: 0,
    vy: 0,
    speed: 300,
    jumpForce: -600,
    lives: 3,
    maxLives: 3,
    grounded: false,
    facingLeft: false,
    state: 'idle', // idle, walk, jump, attack, dead
    hitbox: { ox: 12, oy: 10, w: 24, h: 38 }, // offset and sizes
    checkpoint: { x: 100, y: WORLD_HEIGHT - 200 },
    invulnerableTime: 0,
    anims: {}
};

const camera = new Camera();

// --- MAP DESIGN ---
// Zone 1: Tutorial (0 to 1200)
// Zone 2: Enemies (1200 to 2500)
// Zone 3: Vertical Climb (2500 to 3500, reaching Y: 200)
// Zone 4: Final Stretch (3500 to 5000)

function buildMap() {
    platforms = [];
    enemies = [];
    items = [];

    const floorY = WORLD_HEIGHT - TILE_SIZE;

    // Helper to add floor
    function addFloor(startX, endX, y = floorY) {
        platforms.push({ x: startX, y: y, w: endX - startX, h: WORLD_HEIGHT - y, type: 'floor' });
    }
    // Helper to add platform
    function addPlat(x, y, w, type = 'plat') {
        platforms.push({ x: x, y: y, w: w, h: TILE_SIZE, type: type });
    }

    // Zone 1: Floor with some gaps
    addFloor(0, 800);
    addFloor(950, 1500);

    // Some tutorial floaters
    addPlat(400, floorY - TILE_SIZE * 3, TILE_SIZE * 3, 'float');
    items.push({ x: 450, y: floorY - TILE_SIZE * 4.5, type: 'letter', msg: 'Gelou usa lo básico de juegos retros para moverse xd (perdon los graficos xd) ' });

    // Zone 2: Enemies area
    addFloor(1650, 2600);
    addPlat(1800, floorY - TILE_SIZE * 2, TILE_SIZE * 2);
    items.push({ x: 2000, y: floorY - TILE_SIZE * 2, type: 'letter', msg: 'Con espacio atacas y sha' });

    enemies.push({ x: 2100, y: floorY - TILE_SIZE, origX: 2100, type: 'walker', patrolDist: 200, dir: 1, vx: 100, active: true });
    enemies.push({ x: 2400, y: floorY - TILE_SIZE * 4, origX: 2400, type: 'ghost', patrolDist: 150, dir: 1, vx: 80, active: true });

    // Zone 3: Vertical Climb
    // Player must use clouds to reach the top
    let curX = 2650;
    let curY = floorY - TILE_SIZE * 2;
    for (let i = 0; i < 10; i++) {
        addPlat(curX, curY, TILE_SIZE * 2, 'cloud');
        curX += (i % 2 === 0 ? 150 : -100);
        curY -= 90; // go up

        // Add flying enemies to make it hard
        if (i === 4 || i === 8) {
            enemies.push({ x: curX + 150, y: curY - 20, origX: curX + 150, type: 'ghost', patrolDist: 100, dir: -1, vx: 70, active: true });
        }
    }

    // Checkpoint letter at the top of the climb
    items.push({ x: curX, y: curY - TILE_SIZE, type: 'letter', msg: 'Ya mismo acabas siuuu' });

    // Zone 4: Final Stretch in the sky
    const skyY = curY + 50;
    addPlat(curX + 200, skyY, TILE_SIZE * 4, 'cloud');
    addPlat(curX + 600, skyY, TILE_SIZE * 5, 'cloud');
    addPlat(curX + 1100, skyY, TILE_SIZE * 8, 'cloud');

    // Hardest enemies
    enemies.push({ x: curX + 700, y: skyY - TILE_SIZE, origX: curX + 700, type: 'walker', patrolDist: 100, dir: 1, vx: 120, active: true });
    enemies.push({ x: curX + 1200, y: skyY - TILE_SIZE * 3, origX: curX + 1200, type: 'ghost', patrolDist: 200, dir: -1, vx: 100, active: true });

    // Cake hidden
    items.push({ x: curX + 800, y: skyY - TILE_SIZE * 4, type: 'cake' });

    // Meta (Goal)
    const endX = curX + 1400;
    platforms.push({ x: endX, y: skyY, w: 500, h: TILE_SIZE, type: 'cloud' });
    items.push({ x: endX + 100, y: skyY - TILE_SIZE * 2, type: 'meta', w: 96, h: 96 });

}

// --- SETUP ---
function initGame() {
    // Normalize ALL player anims to the same rendered size so switching states
    // (e.g. idle->walk) never causes the sprite to pop to a different scale.
    // We calculate frame width from the spritesheet but always render at a fixed size.
    function getAnim(imgName, frames, speed) {
        const img = images[imgName];
        let fw = 64; // default fallback
        let fh = 64;
        if (isImageSafe(img)) {
            fw = img.width / frames;
            fh = img.height;
        }
        return new Animation(img, fw, fh, frames, speed);
    }

    player.anims['idle'] = getAnim('standing_character.png', 1, 0);
    player.anims['walk'] = getAnim('character_walking.png', 4, 8);
    player.anims['jump'] = getAnim('character_jumping.png', 1, 0);
    player.anims['attack'] = getAnim('chracter_golpe.png', 1, 0); // note: file has typo
    player.anims['dead'] = getAnim('spritemuerte.png', 1, 0);

    buildMap();
    gameTimeElapsed = 0;
    deathMessages = [];
    resetPlayerToStart();
    updateHUD();
}

function resetPlayerToStart() {
    player.lives = player.maxLives;
    player.checkpoint = { x: 100, y: WORLD_HEIGHT - 200 };
    respawnPlayer();
    updateHUD();
}

function respawnPlayer() {
    player.x = player.checkpoint.x;
    player.y = player.checkpoint.y;
    player.vx = 0;
    player.vy = 0;
    player.state = 'idle';
    player.invulnerableTime = 2; // 2 seconds i-frames
    projectiles = [];
}

// --- PHYSICS AND LOGIC ---
function checkAABB(a, b) {
    return (a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y);
}

function updatePlaying(dt) {
    // Track game time (for enemy speed scaling)
    gameTimeElapsed += dt;
    const speedMult = 1 + Math.min(gameTimeElapsed / 60, 2); // max 3x speed after 2 mins

    // Input handling
    let isMoving = false;

    if (player.state !== 'dead') {
        if (keys.a) {
            player.vx = -player.speed;
            player.facingLeft = true;
            isMoving = true;
        } else if (keys.d) {
            player.vx = player.speed;
            player.facingLeft = false;
            isMoving = true;
        } else {
            player.vx = 0;
        }

        if (keys.space && !spacePressedLast) {
            // Throw rock
            player.state = 'attack';
            setTimeout(() => { if (player.state !== 'dead') player.state = 'idle'; }, 200);
            projectiles.push({
                x: player.x + (player.facingLeft ? -10 : TILE_SIZE),
                y: player.y + 10,
                w: 16, h: 16,
                vx: player.facingLeft ? -400 : 400,
                active: true
            });
        }

        if (keys.w && player.grounded) {
            player.vy = player.jumpForce;
            player.grounded = false;
            player.state = 'jump';
        }
    }

    spacePressedLast = keys.space;

    // Apply Gravity
    player.vy += GRAVITY * dt;

    // Y limit safety
    if (player.y > WORLD_HEIGHT) {
        takeDamage();
        return;
    }

    // Determine State based on motion
    if (player.state !== 'attack' && player.state !== 'dead') {
        if (!player.grounded) player.state = 'jump';
        else if (isMoving) player.state = 'walk';
        else player.state = 'idle';
    }

    // Hitbox abstract
    const phb = {
        x: player.x + player.hitbox.ox,
        y: player.y + player.hitbox.oy,
        w: player.hitbox.w,
        h: player.hitbox.h
    };

    // Horizontal movement & collision
    player.x += player.vx * dt;
    phb.x = player.x + player.hitbox.ox;

    // Clamp to world
    if (player.x < 0) player.x = 0;
    if (player.x > WORLD_WIDTH - player.w) player.x = WORLD_WIDTH - player.w;

    platforms.forEach(plat => {
        if (checkAABB(phb, plat)) {
            // resolve horiz
            if (player.vx > 0) player.x = plat.x - player.hitbox.w - player.hitbox.ox;
            else if (player.vx < 0) player.x = plat.x + plat.w - player.hitbox.ox;
            player.vx = 0;
            phb.x = player.x + player.hitbox.ox;
        }
    });

    // Vertical movement & collision
    player.y += player.vy * dt;
    phb.y = player.y + player.hitbox.oy;
    player.grounded = false;

    platforms.forEach(plat => {
        if (checkAABB(phb, plat)) {
            if (player.vy > 0) {
                // Landing
                player.y = plat.y - player.hitbox.h - player.hitbox.oy;
                player.vy = 0;
                player.grounded = true;
            } else if (player.vy < 0) {
                // Hit head
                player.y = plat.y + plat.h - player.hitbox.oy;
                player.vy = 0;
            }
            phb.y = player.y + player.hitbox.oy;
        }
    });

    // Projectiles update
    let activeProjectiles = [];
    projectiles.forEach(p => {
        if (!p.active) return;
        p.x += p.vx * dt;
        // Map bounds
        if (p.x < 0 || p.x > WORLD_WIDTH) p.active = false;
        // Platform collisions
        platforms.forEach(plat => {
            if (checkAABB(p, plat)) p.active = false;
        });
        if (p.active) activeProjectiles.push(p);
    });
    projectiles = activeProjectiles;

    // Enemies update & collision
    enemies.forEach(e => {
        if (!e.active) return;

        // Patrol - get faster over time
        const eSpeed = e.vx * speedMult;
        e.x += eSpeed * e.dir * dt;
        if (Math.abs(e.x - e.origX) > e.patrolDist) {
            e.dir *= -1;
        }

        const ehb = { x: e.x + 4, y: e.y + 4, w: TILE_SIZE - 8, h: TILE_SIZE - 8 };

        // Hit by projectile?
        projectiles.forEach(p => {
            if (p.active && checkAABB(p, ehb)) {
                e.active = false;
                p.active = false;
                // Add a visual flash effect here (will be handled in drawing, just flag it)
                e.justDied = true;
            }
        });

        // Hit player?
        if (player.invulnerableTime <= 0 && checkAABB(phb, ehb)) {
            takeDamage();
        }
    });

    // Items
    items.forEach(i => {
        if (i.collected) return;

        let iw = i.w || TILE_SIZE;
        let ih = i.h || TILE_SIZE;
        const ihb = { x: i.x, y: i.y, w: iw, h: ih };

        if (checkAABB(phb, ihb)) {
            if (i.type === 'letter') {
                i.collected = true;
                player.checkpoint = { x: player.x, y: player.y - 10 }; // Save checkpoint
                showDialog(i.msg);
            } else if (i.type === 'cake') {
                i.collected = true;
                if (player.lives < player.maxLives) player.lives++;
                updateHUD();
            } else if (i.type === 'meta') {
                i.collected = true;
                triggerFinish();
            }
        }
    });

    if (player.invulnerableTime > 0) {
        player.invulnerableTime -= dt;
    }

    // Update animations
    if (player.anims[player.state]) {
        player.anims[player.state].update(dt);
    }

    camera.update(player.x, player.y);
}

const DEATH_MSGS = [
    '¡JAJA te moriste xdd',
    'Alguien de aqui no sabe jugar xd',
    'Te vas a rendir? uuuu',
    'No puede, no puede',
    'Pero ya vas a ganar o no',
    'Fallaste... shuu que pena',
    'Muaja ja ja, no puedesss',
    'Tan tan tan, mi gato lo hacía mejor jsjs',
];

const GAMEOVER_PHRASES = [
    'como que ya perdiste uuuu chamadre',
    'ni modo otra vez',
    'Chamadre si pudiera poner stickers ya sabría cual',
    'uuuuu no puede la cumpleañera',
    'como que no puede ve',
];

function takeDamage() {
    player.lives--;
    updateHUD();
    // Death message
    const msg = DEATH_MSGS[Math.floor(Math.random() * DEATH_MSGS.length)];
    deathMessages.push({ text: msg, alpha: 1.0, timer: 2.5 });

    if (player.lives <= 0) {
        if (bgMusic) bgMusic.pause();
        playSfx(sfxLoseGame);
        // Show a kind phrase on game over screen
        const govPhrase = GAMEOVER_PHRASES[Math.floor(Math.random() * GAMEOVER_PHRASES.length)];
        const govEl = document.getElementById('gameover-phrase');
        if (govEl) govEl.innerText = govPhrase;
        currentState = GameState.GAMEOVER;
        uiGameover.classList.remove('hidden');
        uiGameover.classList.add('active');
        hud.classList.add('hidden');
    } else {
        playSfx(sfxLoseLife, true); // true = resume music after SFX
        respawnPlayer();
    }
}

function showDialog(msg) {
    currentState = GameState.DIALOG;
    dialogText.innerText = msg;
    uiDialog.classList.remove('hidden');
    uiDialog.classList.add('active');
}

function triggerFinish() {
    currentState = GameState.FINISHED;
    hud.classList.add('hidden');
    if (bgMusic) bgMusic.pause();
    playSfx(sfxWin);
    uiFinished.classList.remove('hidden');
    uiFinished.classList.add('active');

    // Inject real age from the game age counter
    const ageEl = document.getElementById('years-display');
    if (ageEl) ageEl.innerText = Math.floor(gameTimeElapsed / 5 + 10) + ''; // symbolic

    // Play sequence
    setTimeout(() => { const el = document.getElementById('msg-0'); if (el) { el.classList.remove('hidden'); el.classList.add('show'); } }, 500);
    setTimeout(() => { const el = document.getElementById('msg-1'); if (el) { el.classList.remove('hidden'); el.classList.add('show'); } }, 3000);
    setTimeout(() => { const el = document.getElementById('msg-2'); if (el) { el.classList.remove('hidden'); el.classList.add('show'); } }, 5500);
}

function updateHUD() {
    livesContainer.innerHTML = '';
    for (let i = 0; i < player.maxLives; i++) {
        let img = document.createElement('img');
        if (i < player.lives) {
            img.src = assetsDir + 'corazon_lleno.png';
        } else {
            img.src = assetsDir + 'corazon_roto.png'; // or corazon_perdido.png
        }
        livesContainer.appendChild(img);
    }
}

// --- RENDER ---
function draw() {
    ctx.clearRect(0, 0, CanvasW, CanvasH);

    // Parallax Backgrounds
    const bg1 = images['fondoatardecer.png'];
    const bg2 = images['nube.png'];

    if (isImageSafe(bg1)) {
        const bgX1 = -(camera.x * 0.1) % CanvasW;
        ctx.drawImage(bg1, bgX1, 0, CanvasW, CanvasH);
        ctx.drawImage(bg1, bgX1 + CanvasW, 0, CanvasW, CanvasH);
    }
    if (isImageSafe(bg2)) {
        const bgX2 = -(camera.x * 0.3) % CanvasW;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(bg2, bgX2 + 100, 100, 200, 100);
        ctx.drawImage(bg2, bgX2 + CanvasW + 100, 100, 200, 100);
        ctx.drawImage(bg2, bgX2 + 500, 50, 150, 75);
        ctx.drawImage(bg2, bgX2 + CanvasW + 500, 50, 150, 75);
        ctx.globalAlpha = 1.0;
    }

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw Platforms/Map
    platforms.forEach(plat => {
        if (plat.type === 'floor' || plat.type === 'plat') {
            const tex = images['bloque_suelo.png'];
            if (isImageSafe(tex)) {
                let drawW = Math.min(plat.w, 8000);
                let drawH = Math.min(plat.h, 2000);
                for (let px = 0; px < drawW; px += TILE_SIZE) {
                    for (let py = 0; py < drawH; py += TILE_SIZE) {
                        ctx.drawImage(tex, plat.x + px, plat.y + py, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        } else if (plat.type === 'cloud' || plat.type === 'float') {
            const texName = plat.type === 'cloud' ? 'bloque_suelo.png' : 'bloque_suelo.png';
            if (isImageSafe(images[texName])) {
                let drawW = Math.min(plat.w, 8000);
                for (let px = 0; px < drawW; px += TILE_SIZE) {
                    ctx.drawImage(images[texName], plat.x + px, plat.y, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    });

    // Draw Items
    items.forEach(i => {
        if (i.collected) return;
        if (i.type === 'letter') {
            if (isImageSafe(images['carta.png'])) {
                const drawSize = TILE_SIZE * 1.5;
                ctx.drawImage(images['carta.png'], i.x - (drawSize - TILE_SIZE) / 2, i.y - (drawSize - TILE_SIZE) / 2, drawSize, drawSize);
            } else {
                ctx.fillStyle = 'gold';
                ctx.fillRect(i.x, i.y, TILE_SIZE, TILE_SIZE);
            }
        }
        if (i.type === 'cake' && isImageSafe(images['pastel.png'])) ctx.drawImage(images['pastel.png'], i.x, i.y, TILE_SIZE, TILE_SIZE);
        if (i.type === 'meta' && isImageSafe(images['meta.png'])) ctx.drawImage(images['meta.png'], i.x, i.y, 96, 96);
    });

    // Draw Enemies
    enemies.forEach(e => {
        if (!e.active) {
            if (e.justDied) {
                // Draw death flash (red overlay or just death sprite)
                ctx.fillStyle = 'rgba(255,0,0,0.5)';
                ctx.fillRect(e.x, e.y, TILE_SIZE, TILE_SIZE);
                e.justDied = false; // Show for one frame
            }
            return;
        }

        const tex = images[e.type === 'walker' ? 'enemigosprite.png' : 'fantasmasprites.png'];
        // Generic flip based on dir
        if (isImageSafe(tex)) {
            ctx.save();
            if (e.dir < 0) {
                ctx.translate(e.x + TILE_SIZE, e.y);
                ctx.scale(-1, 1);
                ctx.drawImage(tex, 0, 0, tex.width / 2 || TILE_SIZE, tex.height || TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE); // hacky frame guess
            } else {
                ctx.drawImage(tex, 0, 0, tex.width / 2 || TILE_SIZE, tex.height || TILE_SIZE, e.x, e.y, TILE_SIZE, TILE_SIZE);
            }
            ctx.restore();
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(e.x, e.y, TILE_SIZE, TILE_SIZE);
        }
    });

    // Draw Projectiles
    projectiles.forEach(p => {
        if (!p.active) return;
        if (isImageSafe(images['roca.png'])) {
            ctx.drawImage(images['roca.png'], p.x, p.y, p.w, p.h);
        } else {
            ctx.fillStyle = 'gray';
            ctx.fillRect(p.x, p.y, p.w, p.h);
        }
    });

    // Draw Player (fix: always use fixed TILE_SIZE * 1.5 render size, flip pivots correctly)
    const renderW = TILE_SIZE * 1.5;
    const renderH = TILE_SIZE * 1.5;
    const renderX = player.x + (player.w - renderW) / 2;
    const renderY = player.y + player.h - renderH;
    if (player.invulnerableTime > 0 && Math.floor(performance.now() / 100) % 2 === 0) {
        // blink - skip draw this frame
    } else {
        const anim = player.anims[player.state];
        if (anim) {
            anim.draw(ctx, renderX, renderY, renderW, renderH, player.facingLeft);
        } else {
            ctx.fillStyle = 'white';
            ctx.fillRect(player.x, player.y, player.w, player.h);
        }
    }

    ctx.restore();

    // Draw death messages (canvas-space, so drawn after restore)
    deathMessages.forEach((dm, idx) => {
        dm.timer -= 0.016; // approximate per-frame subtract (gameLoop handles precise)
        dm.alpha = Math.max(0, dm.timer / 2.5);
        ctx.globalAlpha = dm.alpha;
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#ff4444';
        ctx.textAlign = 'center';
        ctx.fillText(dm.text, CanvasW / 2, CanvasH / 2 - 80 - idx * 30);
        ctx.globalAlpha = 1;
    });
    // Remove expired messages
    deathMessages = deathMessages.filter(dm => dm.timer > 0);
    ctx.textAlign = 'left'; // reset
}

// --- MAIN LOOP ---
function gameLoop(time) {
    if (lastTime === 0) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.1); // cap dt
    lastTime = time;

    switch (currentState) {
        case GameState.MENU:
            // Handled by UI overlay
            break;
        case GameState.PLAYING:
            updatePlaying(dt);
            draw();
            break;
        case GameState.DIALOG:
            // Handle dialog input
            if (keys.enter && !enterPressedLast) {
                uiDialog.classList.remove('active');
                setTimeout(() => uiDialog.classList.add('hidden'), 300);
                currentState = GameState.PLAYING;
            }
            draw(); // keep drawing background
            break;
        case GameState.GAMEOVER:
            draw();
            break;
        case GameState.FINISHED:
            draw();
            break;
    }

    enterPressedLast = keys.enter;
    requestAnimationFrame(gameLoop);
}

// --- START ---

startBtn.addEventListener('click', () => {
    uiMenu.classList.remove('active');
    setTimeout(() => {
        uiMenu.classList.add('hidden');
        hud.classList.remove('hidden');
        if (bgMusic) bgMusic.play();
        initGame();
        currentState = GameState.PLAYING;
    }, 300);
});

restartBtn.addEventListener('click', () => {
    uiGameover.classList.remove('active');
    setTimeout(() => {
        uiGameover.classList.add('hidden');
        hud.classList.remove('hidden');
        resetPlayerToStart();
        currentState = GameState.PLAYING;
    }, 300);
});

// Setup Initial state
loadAssets(() => {
    loadingBar.parentElement.classList.add('hidden');
    loadingText.classList.add('hidden');
    startBtn.classList.remove('hidden');
});

// Kickoff loop
requestAnimationFrame(gameLoop);
