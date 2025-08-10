const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Resize canvas to device pixel ratio for crisp rendering
const DPR = Math.min(window.devicePixelRatio || 1, 2);
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * DPR);
  canvas.height = Math.floor(rect.height * DPR);
}

window.addEventListener('resize', () => {
  resizeCanvas();
});
resizeCanvas();

// UI elements
const el = (id) => document.getElementById(id);
const boidCount = el('boidCount');
const boidCountVal = el('boidCountVal');
const perception = el('perception');
const perceptionVal = el('perceptionVal');
const separationDist = el('separationDist');
const separationDistVal = el('separationDistVal');
const alignW = el('alignW');
const alignWVal = el('alignWVal');
const cohesionW = el('cohesionW');
const cohesionWVal = el('cohesionWVal');
const separationW = el('separationW');
const separationWVal = el('separationWVal');
const maxSpeed = el('maxSpeed');
const maxSpeedVal = el('maxSpeedVal');
const maxForce = el('maxForce');
const maxForceVal = el('maxForceVal');
const toggleBtn = el('toggleBtn');
const resetBtn = el('resetBtn');
// new controls
const avoidanceW = el('avoidanceW');
const avoidanceWVal = el('avoidanceWVal');
const bounceW = el('bounceW');
const bounceWVal = el('bounceWVal');
const followW = el('followW');
const followWVal = el('followWVal');
const enableBounce = el('enableBounce');
const enableMouseFollow = el('enableMouseFollow');
const clearObstacles = el('clearObstacles');
const helpBtn = el('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelp = document.getElementById('closeHelp');
const helpContent = document.getElementById('helpContent');

// Replace minimal markdown parser with marked + highlight.js
function renderMarkdown(md) {
  if (window.marked) {
    // configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (window.hljs) {
          try {
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, {language: lang}).value;
            }
          } catch {}
          return hljs.highlightAuto(code).value;
        }
        return code;
      }
    });
    return marked.parse(md);
  }
  // fallback: escape only
  return md.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

function highlightBlocks(container) {
  if (!window.hljs) return;
  container.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
  });
}

// Add copy buttons to code blocks
function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    // Skip if copy button already exists
    if (pre.querySelector('.copy-btn')) return;
    
    const codeElement = pre.querySelector('code');
    if (!codeElement) return;
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.setAttribute('aria-label', '复制代码');
    
    copyBtn.addEventListener('click', async () => {
      try {
        const codeText = codeElement.textContent || codeElement.innerText;
        await navigator.clipboard.writeText(codeText);
        
        // Visual feedback
        copyBtn.textContent = '已复制!';
        copyBtn.classList.add('copied');
        
        setTimeout(() => {
          copyBtn.textContent = '复制';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.warn('Copy failed:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = codeElement.textContent || codeElement.innerText;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          copyBtn.textContent = '已复制!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = '复制';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (fallbackErr) {
          copyBtn.textContent = '复制失败';
          setTimeout(() => {
            copyBtn.textContent = '复制';
          }, 2000);
        }
        document.body.removeChild(textArea);
      }
    });
    
    pre.appendChild(copyBtn);
  });
}

async function openHelp() {
  if (!helpContent.dataset.loaded) {
    try {
      const res = await fetch('README.md');
      const md = await res.text();
      helpContent.innerHTML = renderMarkdown(md);
      helpContent.dataset.loaded = '1';
      highlightBlocks(helpContent);
      addCopyButtons(helpContent); // Add copy buttons after rendering
    } catch (e) {
      helpContent.innerHTML = '<p>无法加载使用说明。</p>';
    }
  }
  if (helpModal && typeof helpModal.showModal === 'function') helpModal.showModal();
}

if (helpBtn) helpBtn.addEventListener('click', openHelp);
if (closeHelp) closeHelp.addEventListener('click', () => helpModal.close());

const uiState = {
  paused: false,
  attractor: null, // {x, y, strength}
  repel: false,
  mouse: { x: 0, y: 0 },
  mouseDown: false,
};

function syncLabels() {
  boidCountVal.textContent = boidCount.value;
  perceptionVal.textContent = perception.value;
  separationDistVal.textContent = separationDist.value;
  alignWVal.textContent = Number(alignW.value).toFixed(1);
  cohesionWVal.textContent = Number(cohesionW.value).toFixed(1);
  separationWVal.textContent = Number(separationW.value).toFixed(1);
  maxSpeedVal.textContent = Number(maxSpeed.value).toFixed(1);
  maxForceVal.textContent = Number(maxForce.value).toFixed(2);
  // new labels
  if (avoidanceWVal) avoidanceWVal.textContent = Number(avoidanceW.value).toFixed(1);
  if (bounceWVal) bounceWVal.textContent = Number(bounceW.value).toFixed(1);
  if (followWVal) followWVal.textContent = Number(followW.value).toFixed(1);
}

[boidCount, perception, separationDist, alignW, cohesionW, separationW, maxSpeed, maxForce, avoidanceW, bounceW, followW].filter(Boolean).forEach(i => i.addEventListener('input', syncLabels));
syncLabels();

// Vector utilities
class Vec2 {
  constructor(x=0, y=0) { this.x = x; this.y = y; }
  clone() { return new Vec2(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mul(n) { this.x *= n; this.y *= n; return this; }
  div(n) { this.x /= n; this.y /= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag() || 1; this.x = this.x / m * n; this.y = this.y / m * n; return this; }
  limit(max) { const m2 = this.x*this.x + this.y*this.y; if (m2 > max*max) { const m = Math.sqrt(m2); this.x = this.x / m * max; this.y = this.y / m * max; } return this; }
  heading() { return Math.atan2(this.y, this.x); }
  static add(a,b) { return new Vec2(a.x+b.x, a.y+b.y); }
  static sub(a,b) { return new Vec2(a.x-b.x, a.y-b.y); }
}

// Boid class
class Boid {
  constructor(x, y) {
    const angle = Math.random() * Math.PI * 2;
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(Math.cos(angle), Math.sin(angle)).mul(2);
    this.acc = new Vec2(0, 0);
    this.radius = 6 * DPR;
  }
  edges(width, height, params) {
    if (enableBounce && enableBounce.checked) {
      const margin = 10 * DPR;
      const steer = new Vec2();
      if (this.pos.x < margin) steer.add(new Vec2(1, 0));
      if (this.pos.x > width - margin) steer.add(new Vec2(-1, 0));
      if (this.pos.y < margin) steer.add(new Vec2(0, 1));
      if (this.pos.y > height - margin) steer.add(new Vec2(0, -1));
      if (steer.mag() > 0) {
        steer.setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce).mul(params.bounceW);
        this.applyForce(steer);
      }
    } else {
      // screen wrapping
      if (this.pos.x < -10) this.pos.x = width + 10;
      if (this.pos.y < -10) this.pos.y = height + 10;
      if (this.pos.x > width + 10) this.pos.x = -10;
      if (this.pos.y > height + 10) this.pos.y = -10;
    }
  }
  applyForce(force) { this.acc.add(force); }
  update(maxSpeedVal, maxForceVal) {
    this.vel.add(this.acc);
    this.vel.limit(maxSpeedVal);
    this.pos.add(this.vel);
    this.acc.mul(0);
  }
  // Flocking behaviors
  flock(boids, params, obstacles) {
    const perception = params.perception;
    const separationDist = params.separationDist;
    const alignSteer = new Vec2();
    const cohesionSteer = new Vec2();
    const separationSteer = new Vec2();

    let total = 0;
    let totalSep = 0;

    for (let other of boids) {
      if (other === this) continue;
      const dist = Math.hypot(other.pos.x - this.pos.x, other.pos.y - this.pos.y);
      if (dist < perception) {
        alignSteer.add(other.vel);
        cohesionSteer.add(other.pos);
        total++;
      }
      if (dist < separationDist) {
        const diff = Vec2.sub(this.pos, other.pos);
        diff.div(dist || 0.0001);
        separationSteer.add(diff);
        totalSep++;
      }
    }

    if (total > 0) {
      alignSteer.div(total).setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce).mul(params.alignW);
      cohesionSteer.div(total).sub(this.pos).setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce).mul(params.cohesionW);
    }

    if (totalSep > 0) {
      separationSteer.div(totalSep).setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce).mul(params.separationW);
    }

    // Obstacle avoidance (circles)
    if (obstacles && obstacles.length) {
      for (const ob of obstacles) {
        const toOb = Vec2.sub(this.pos, ob.pos); // push away from obstacle center
        const dist = toOb.mag();
        const safeDist = ob.radius + this.radius + 12 * DPR;
        if (dist < safeDist) {
          const steer = toOb.setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce * 1.5).mul(params.avoidanceW);
          this.applyForce(steer);
        } else if (dist < safeDist * 2.2) {
          // anticipatory slight turn
          const steer = toOb.setMag(params.maxSpeed * 0.6).sub(this.vel).limit(params.maxForce).mul(params.avoidanceW * 0.3);
          this.applyForce(steer);
        }
      }
    }

    // Mouse follow (seek mouse)
    if (enableMouseFollow && enableMouseFollow.checked) {
      const toMouse = Vec2.sub(uiState.mouse, this.pos);
      const dist = toMouse.mag();
      const range = Math.max(60 * DPR, params.perception * 1.5);
      if (dist < range) {
        const desired = toMouse.setMag(params.maxSpeed);
        const steer = desired.sub(this.vel).limit(params.maxForce).mul(params.followW);
        this.applyForce(steer);
      }
    }

    // Attractor/repulsor interaction
    if (uiState.attractor) {
      const d = Vec2.sub(uiState.attractor, this.pos);
      const dist = d.mag();
      const range = Math.max(40, params.perception * 1.2);
      if (dist < range) {
        const dir = d.setMag(params.maxSpeed);
        const steer = dir.sub(this.vel).limit(params.maxForce * 1.5);
        steer.mul(uiState.repel ? -uiState.attractor.strength : uiState.attractor.strength);
        this.applyForce(steer);
      }
    }

    this.applyForce(alignSteer);
    this.applyForce(cohesionSteer);
    this.applyForce(separationSteer);
  }

  draw(ctx) {
    const angle = this.vel.heading();
    const size = 5 * DPR;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(size * 1.8, 0);
    ctx.lineTo(-size, size * 0.9);
    ctx.lineTo(-size, -size * 0.9);
    ctx.closePath();

    const grad = ctx.createLinearGradient(-size, -size, size * 2, size);
    grad.addColorStop(0, 'rgba(121,255,225,0.8)');
    grad.addColorStop(1, 'rgba(106,167,255,0.9)');

    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.9;
    ctx.fill();

    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1 * DPR;
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(106,167,255,0.15)';
    ctx.lineWidth = 1 * DPR;
    ctx.beginPath();
    ctx.moveTo(this.pos.x, this.pos.y);
    ctx.lineTo(this.pos.x - this.vel.x * 3, this.pos.y - this.vel.y * 3);
    ctx.stroke();
    ctx.restore();
  }
}

// Obstacles state
const obstacles = [];
function addObstacle(x, y, r) {
  obstacles.push({ pos: new Vec2(x, y), radius: r });
}

// draw obstacles
function drawObstacles() {
  for (const ob of obstacles) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ob.pos.x, ob.pos.y, ob.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = 1 * DPR;
    ctx.strokeStyle = 'rgba(121,255,225,0.45)';
    ctx.stroke();
    ctx.restore();
  }
}

let boids = [];
function initBoids(n) {
  boids = [];
  for (let i = 0; i < n; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    boids.push(new Boid(x, y));
  }
}

initBoids(Number(boidCount.value));

// Interaction enhancements
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * DPR;
  const y = (e.clientY - rect.top) * DPR;
  uiState.mouse.x = x; uiState.mouse.y = y; uiState.mouseDown = true;
  if (e.shiftKey) {
    // add obstacle with Shift + click
    const radius = 24 * DPR;
    addObstacle(x, y, radius);
    return;
  }
  const strength = 0.8;
  uiState.attractor = new Vec2(x, y);
  uiState.attractor.strength = strength;
  uiState.repel = e.button === 2 || e.altKey;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * DPR;
  const y = (e.clientY - rect.top) * DPR;
  uiState.mouse.x = x; uiState.mouse.y = y;
  if (uiState.attractor && e.buttons !== 0) {
    uiState.attractor.x = x;
    uiState.attractor.y = y;
  }
});
canvas.addEventListener('pointerup', () => {
  uiState.attractor = null;
  uiState.mouseDown = false;
});

// Buttons
if (clearObstacles) {
  clearObstacles.addEventListener('click', () => {
    obstacles.length = 0;
  });
}

// Buttons remain
toggleBtn.addEventListener('click', () => {
  uiState.paused = !uiState.paused;
  toggleBtn.textContent = uiState.paused ? '继续' : '暂停';
});

resetBtn.addEventListener('click', () => {
  initBoids(Number(boidCount.value));
});

boidCount.addEventListener('change', () => {
  initBoids(Number(boidCount.value));
});

function step() {
  if (!uiState.paused) {
    ctx.fillStyle = 'rgba(7,11,26,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawObstacles();

    const params = {
      perception: Number(perception.value) * DPR,
      separationDist: Number(separationDist.value) * DPR,
      alignW: Number(alignW.value),
      cohesionW: Number(cohesionW.value),
      separationW: Number(separationW.value),
      maxSpeed: Number(maxSpeed.value) * DPR,
      maxForce: Number(maxForce.value) * DPR,
      avoidanceW: avoidanceW ? Number(avoidanceW.value) : 0,
      bounceW: bounceW ? Number(bounceW.value) : 0,
      followW: followW ? Number(followW.value) : 0,
    };

    for (let b of boids) {
      b.flock(boids, params, obstacles);
      b.update(params.maxSpeed, params.maxForce);
      b.edges(canvas.width, canvas.height, params);
      b.draw(ctx);
    }
  }
  requestAnimationFrame(step);
}

step();