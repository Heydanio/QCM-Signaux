// Veille Électrique - main game logic
// Architecture overview:
// - GameState machine (MENU, PLAY, PAUSE, GAMEOVER, WIN, TRANSITION)
// - Entities: three adversaries with distinct AI behaviors
// - Systems: energy management, camera panel, input (mouse + keyboard), rendering loop on canvas
// - Debug mode (toggle with D) showing positions/states

const STATES = {
  MENU: 'MENU',
  PLAY: 'PLAY',
  GAMEOVER: 'GAMEOVER',
  WIN: 'WIN',
  TRANSITION: 'TRANSITION',
};

class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
  }
  next() {
    // xorshift32
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0xffffffff;
  }
  range(min, max) {
    return min + (max - min) * this.next();
  }
}

class Enemy {
  constructor(name, color, path) {
    this.name = name;
    this.color = color;
    this.path = path;
    this.position = 0;
    this.cooldown = 0;
    this.visible = false;
    this.jumpscareFrame = 0;
  }
  reset() {
    this.position = 0;
    this.cooldown = 0;
    this.visible = false;
    this.jumpscareFrame = 0;
  }
  currentZone() {
    return this.path[this.position];
  }
}

class Patroller extends Enemy {
  constructor(path) {
    super('Errant-8', '#60a5fa', path);
  }
  update(game, dt) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const base = 0.08 + game.night * 0.04;
    if (game.rng.next() < base * dt) {
      this.position = Math.min(this.position + 1, this.path.length - 1);
      this.cooldown = 2 - Math.min(1.5, game.night * 0.2);
    }
  }
}

class Opportunist extends Enemy {
  constructor(path) {
    super('Guette-scan', '#fbbf24', path);
    this.cameraExposure = 0;
  }
  reset() {
    super.reset();
    this.cameraExposure = 0;
  }
  update(game, dt) {
    if (game.cameraOpen) {
      this.cameraExposure += dt;
    } else {
      this.cameraExposure = Math.max(0, this.cameraExposure - dt);
    }
    const p = Math.min(0.5, (0.05 + game.night * 0.04) * (1 + this.cameraExposure * 0.5));
    if (game.rng.next() < p * dt) {
      this.position = Math.min(this.position + 1, this.path.length - 1);
    }
  }
}

class Aggressor extends Enemy {
  constructor(path) {
    super('Choc-Sentinelle', '#f472b6', path);
    this.anger = 0;
  }
  reset() {
    super.reset();
    this.anger = 0;
  }
  update(game, dt) {
    if (game.leftDoor || game.rightDoor || game.leftLight || game.rightLight) {
      this.anger += dt * (0.6 + 0.1 * game.night);
    } else {
      this.anger = Math.max(0, this.anger - dt * 0.4);
    }
    if (game.energy <= 15) this.anger += dt * 1.5;
    const trigger = 0.07 + this.anger * 0.02 + game.night * 0.02;
    if (game.rng.next() < trigger * dt) {
      this.position = Math.min(this.position + 1, this.path.length - 1);
    }
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.state = STATES.MENU;
    this.night = 1;
    this.nightLength = 360; // seconds
    this.elapsed = 0;
    this.energy = 100;
    this.passiveDrain = 0.6; // per second
    this.cameraDrain = 4;
    this.lightDrain = 6;
    this.doorDrain = 5;
    this.leftDoor = false;
    this.rightDoor = false;
    this.leftLight = false;
    this.rightLight = false;
    this.cameraOpen = false;
    this.selectedCam = 0;
    this.cameras = ['Entrepôt', 'Couloir nord', 'Atelier', 'Salle des fusibles', 'Hall vitre', 'Stockage', 'Ascenseur'];
    this.cameraStates = new Array(this.cameras.length).fill('');
    this.camUsage = 0;
    this.reduceFlash = false;
    this.debug = false;
    this.rng = new RNG();
    this.accelerate = false;
    this.lastTime = 0;
    this.enemies = [
      new Patroller([0,1,3,5,6]),
      new Opportunist([2,3,4,6]),
      new Aggressor([1,2,4,6])
    ];
    this.bindUI();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindUI() {
    this.nightLabel = document.getElementById('nightLabel');
    this.timeLabel = document.getElementById('timeLabel');
    this.energyLabel = document.getElementById('energyLabel');
    this.camPanel = document.getElementById('cameraPanel');
    this.camInfo = document.getElementById('camInfo');
    this.camUsageLabel = document.getElementById('camUsage');
    this.stateOverlay = document.getElementById('stateOverlay');
    this.menuOverlay = document.getElementById('menuOverlay');
    this.debugPanel = document.getElementById('debugPanel');

    document.getElementById('playBtn').onclick = () => this.startNight();
    document.getElementById('optionsBtn').onclick = () => {
      document.getElementById('options').classList.toggle('hidden');
      document.getElementById('credits').classList.add('hidden');
    };
    document.getElementById('creditsBtn').onclick = () => {
      document.getElementById('credits').classList.toggle('hidden');
      document.getElementById('options').classList.add('hidden');
    };
    document.getElementById('nightLengthInput').onchange = (e)=>{
      this.nightLength = Math.max(60, Math.min(360, Number(e.target.value)));
    };
    document.getElementById('reduceFlash').onchange = (e)=>{
      this.reduceFlash = e.target.checked;
    };

    document.getElementById('leftDoor').onclick = ()=>this.toggleDoor('left');
    document.getElementById('rightDoor').onclick = ()=>this.toggleDoor('right');
    document.getElementById('leftLight').onclick = ()=>this.toggleLight('left');
    document.getElementById('rightLight').onclick = ()=>this.toggleLight('right');
    document.getElementById('cameraToggle').onclick = ()=>this.toggleCamera();

    this.buildCameraGrid();

    window.addEventListener('keydown', (e)=>this.handleKey(e));
  }

  buildCameraGrid() {
    const grid = document.getElementById('camGrid');
    grid.innerHTML = '';
    this.cameras.forEach((cam, idx)=>{
      const btn = document.createElement('button');
      btn.className = 'camBtn';
      btn.textContent = cam;
      btn.onclick = ()=>this.selectCamera(idx);
      grid.appendChild(btn);
    });
  }

  handleKey(e) {
    if (e.key === 'q' || e.key === 'Q') this.toggleDoor('left');
    if (e.key === 's' || e.key === 'S') this.toggleDoor('right');
    if (e.key === 'a' || e.key === 'A') this.toggleLight('left');
    if (e.key === 'd' || e.key === 'D') {
      if (e.target === document.body) { // avoid clash with text inputs
        this.toggleLight('right');
      }
    }
    if (e.key === 'e' || e.key === 'E') this.toggleCamera();
    if (e.key === ' ') {
      if (this.state === STATES.GAMEOVER || this.state === STATES.WIN) {
        this.nextNight();
      }
    }
    if (e.key === 'D' && e.shiftKey === false) {
      // toggling debug with lowercase d already used; offer ctrl+d? We'll use Alt+D
    }
    if (e.key === 'f' || e.key === 'F') {
      // accelerate only in debug
      this.accelerate = !this.accelerate;
    }
    if (e.key === 'x' || e.key === 'X') {
      this.reset();
    }
    if (e.key === 'd' && e.shiftKey) {
      // avoid interfering with light: shift+d toggles debug
      this.debug = !this.debug;
    }
  }

  toggleDoor(side) {
    if (this.state !== STATES.PLAY) return;
    const prop = side === 'left' ? 'leftDoor' : 'rightDoor';
    this[prop] = !this[prop];
    audioSystem.thud();
  }

  toggleLight(side) {
    if (this.state !== STATES.PLAY) return;
    const prop = side === 'left' ? 'leftLight' : 'rightLight';
    this[prop] = !this[prop];
    if (this[prop]) audioSystem.beep({ freq: 700, duration: 0.08 });
  }

  toggleCamera() {
    if (this.state !== STATES.PLAY) return;
    this.cameraOpen = !this.cameraOpen;
    this.camPanel.classList.toggle('active', this.cameraOpen);
    if (this.cameraOpen) audioSystem.confirm();
  }

  selectCamera(idx) {
    this.selectedCam = idx;
    this.camInfo.textContent = `${this.cameras[idx]} : ${this.cameraStates[idx] || 'Silencieux...'}`;
  }

  startNight() {
    this.menuOverlay.classList.add('hidden');
    this.stateOverlay.classList.add('hidden');
    this.reset();
    this.state = STATES.PLAY;
    this.lastTime = performance.now();
    audioSystem.confirm();
  }

  reset() {
    this.elapsed = 0;
    this.energy = 100;
    this.leftDoor = this.rightDoor = false;
    this.leftLight = this.rightLight = false;
    this.cameraOpen = false;
    this.camPanel.classList.remove('active');
    this.camUsage = 0;
    this.enemies.forEach(e=>e.reset());
    this.rng = new RNG(this.night * 1234 + Date.now());
  }

  update(dt) {
    if (this.state !== STATES.PLAY) return;
    const speed = this.accelerate ? 8 : 1;
    dt *= speed;
    this.elapsed += dt;
    this.camUsage = this.cameraOpen ? this.camUsage + dt : Math.max(0, this.camUsage - dt * 0.5);

    const actionDrain = (this.leftDoor + this.rightDoor) * this.doorDrain + (this.leftLight + this.rightLight) * this.lightDrain + (this.cameraOpen ? this.cameraDrain : 0);
    this.energy = Math.max(0, this.energy - (this.passiveDrain + actionDrain) * dt / 60);

    this.updateEnemies(dt);
    this.checkThreats();

    if (this.energy <= 0) {
      this.leftDoor = this.rightDoor = false;
      this.leftLight = this.rightLight = false;
      this.cameraOpen = false;
      this.camPanel.classList.remove('active');
    }

    if (this.elapsed >= this.nightLength) {
      this.winNight();
    }
  }

  updateEnemies(dt) {
    this.enemies.forEach(enemy=>enemy.update(this, dt));
    this.enemies.forEach(enemy=>{
      const zone = enemy.currentZone();
      if (this.cameraOpen && this.selectedCam === zone) {
        enemy.visible = true;
        this.cameraStates[zone] = `${enemy.name} en vue`;
      } else if (enemy.visible) {
        enemy.visible = false;
      }
    });
  }

  checkThreats() {
    // zone index 6 = bureau/porte
    this.enemies.forEach(enemy=>{
      if (enemy.position >= enemy.path.length -1) {
        // Approaching office, check defense
        const threatSide = enemy.path[enemy.path.length-1] % 2 === 0 ? 'left' : 'right';
        const doorClosed = threatSide === 'left' ? this.leftDoor : this.rightDoor;
        const lightOn = threatSide === 'left' ? this.leftLight : this.rightLight;
        const penalty = !doorClosed;
        if (penalty) {
          this.triggerJumpscare(enemy);
        } else if (lightOn) {
          enemy.position = Math.max(0, enemy.position - 1);
        }
      }
    });
  }

  triggerJumpscare(enemy) {
    this.state = STATES.GAMEOVER;
    this.stateOverlay.classList.remove('hidden');
    this.stateOverlay.innerHTML = `<div>Interruption par ${enemy.name}!</div><button onclick="game.restartNight()">Rejouer</button>`;
    audioSystem.danger();
  }

  winNight() {
    if (this.night >= 5) {
      this.state = STATES.WIN;
      this.stateOverlay.classList.remove('hidden');
      this.stateOverlay.innerHTML = '<div>Fin de la cinquième nuit! Vous avez tenu.</div><button onclick="game.restartNight(true)">Rejouer Nuit 5</button>';
    } else {
      this.state = STATES.WIN;
      this.stateOverlay.classList.remove('hidden');
      this.stateOverlay.innerHTML = `<div>Nuit ${this.night} terminée</div><button onclick="game.nextNight()">Continuer</button>`;
    }
    audioSystem.confirm();
  }

  restartNight(stay) {
    if (!stay) this.state = STATES.PLAY;
    this.stateOverlay.classList.add('hidden');
    this.reset();
    this.lastTime = performance.now();
  }

  nextNight() {
    if (this.night < 5) this.night++;
    this.nightLabel.textContent = `Nuit ${this.night}`;
    this.stateOverlay.classList.add('hidden');
    this.state = STATES.PLAY;
    this.reset();
    this.lastTime = performance.now();
  }

  formatTime() {
    const ratio = Math.min(1, this.elapsed / this.nightLength);
    const hours = Math.floor(ratio * 6);
    const minutes = Math.floor((ratio * 6 - hours) * 60);
    return `${('0'+hours).slice(-2)}:${('0'+minutes).slice(-2)}`;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

    // Office visualization
    ctx.strokeStyle = '#1f2937';
    ctx.strokeRect(40, 180, this.canvas.width-80, 180);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(40, 180, this.canvas.width-80, 180);

    // Doors
    ctx.fillStyle = this.leftDoor ? '#22c55e' : '#ef4444';
    ctx.fillRect(40, 200, 50, 140);
    ctx.fillStyle = this.rightDoor ? '#22c55e' : '#ef4444';
    ctx.fillRect(this.canvas.width-90, 200, 50, 140);

    // Lights cones
    if (this.leftLight) {
      const grad = ctx.createLinearGradient(90, 220, 200, 220);
      grad.addColorStop(0, this.reduceFlash ? 'rgba(255,255,200,0.15)' : 'rgba(255,255,200,0.35)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(90, 200, 180, 120);
    }
    if (this.rightLight) {
      const grad = ctx.createLinearGradient(this.canvas.width-90, 220, this.canvas.width-270, 220);
      grad.addColorStop(0, this.reduceFlash ? 'rgba(255,255,200,0.15)' : 'rgba(255,255,200,0.35)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(this.canvas.width-270, 200, 180, 120);
    }

    // Camera overlay
    if (this.cameraOpen) {
      ctx.fillStyle = 'rgba(10,15,25,0.7)';
      ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
      ctx.strokeStyle = '#0ea5e9';
      ctx.strokeRect(60, 60, this.canvas.width-120, this.canvas.height-120);
      ctx.fillStyle = '#bae6fd';
      ctx.font = '18px monospace';
      ctx.fillText(`CAM ${this.selectedCam+1} - ${this.cameras[this.selectedCam]}`, 80, 90);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Interférences visuelles...', 80, 110);
      this.drawCameraView();
    }

    // Enemy markers near doors
    this.enemies.forEach(enemy=>{
      const progress = enemy.position / (enemy.path.length-1);
      const x = 120 + progress * (this.canvas.width-240);
      const y = 330;
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(x,y,10,0,Math.PI*2);
      ctx.fill();
      ctx.font = '12px monospace';
      ctx.fillText(enemy.name, x-20, y+20);
    });

    // UI labels
    this.timeLabel.textContent = this.formatTime();
    this.energyLabel.textContent = `Énergie ${Math.round(this.energy)}%`;
    this.camUsageLabel.textContent = `Charge: ${this.camUsage.toFixed(1)}s`;

    if (this.debug) this.renderDebug();
    else this.debugPanel.classList.add('hidden');
  }

  drawCameraView() {
    const ctx = this.ctx;
    const w = this.canvas.width - 160;
    const h = this.canvas.height - 200;
    ctx.save();
    ctx.translate(80, 120);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#1f2937';
    for (let i=0;i<8;i++) {
      ctx.beginPath();
      ctx.moveTo(0, i*h/8);
      ctx.lineTo(w, i*h/8);
      ctx.stroke();
    }
    for (let i=0;i<12;i++) {
      ctx.beginPath();
      ctx.moveTo(i*w/12,0);
      ctx.lineTo(i*w/12,h);
      ctx.stroke();
    }
    // Stylized photo noise
    for (let i=0;i<80;i++) {
      const px = Math.random()*w;
      const py = Math.random()*h;
      const alpha = this.reduceFlash ? 0.1 : 0.2;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(px,py,2,2);
    }
    // Enemy silhouettes
    this.enemies.forEach(enemy=>{
      if (enemy.currentZone() === this.selectedCam) {
        ctx.fillStyle = enemy.color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(w/2 + (Math.random()-0.5)*40, h/2 + (Math.random()-0.5)*40, 30, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  renderDebug() {
    this.debugPanel.classList.remove('hidden');
    const lines = [
      `Debug ON`,
      `Énergie: ${this.energy.toFixed(1)}`,
      `Temps: ${this.elapsed.toFixed(1)} / ${this.nightLength}s`,
      `Cam ouvert: ${this.cameraOpen} (${this.camUsage.toFixed(1)}s)`,
      `Portes L/R: ${this.leftDoor}/${this.rightDoor}`,
      `Lumières L/R: ${this.leftLight}/${this.rightLight}`,
      `Seed: ${this.rng.seed}`
    ];
    this.enemies.forEach(e=>{
      lines.push(`${e.name} pos ${e.position}/${e.path.length-1} zone ${e.currentZone()}`);
    });
    this.debugPanel.textContent = lines.join('\n');
  }

  loop(timestamp) {
    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000 || 0);
    this.lastTime = timestamp;
    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop);
  }
}

const game = new Game();
window.game = game; // for console debugging
