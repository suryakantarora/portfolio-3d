(async () => {
  'use strict';

  /* =====================================================================
     CONFIG — add your email address here to show the “Say hello” button
     ===================================================================== */
  const CONTACT = { email: '' };   // e.g. 'hello@yourdomain.com' — LinkedIn / GitHub / resume links live in index.html
  const THREE_CDN = 'https://unpkg.com/three@0.160.0/build/three.module.js';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ---------- hero name: extruded 3D letters (runs before Three loads) ---------- */
  const h1 = $('#hero h1');
  if (h1) {
    let k = 0; h1.setAttribute('aria-label', 'Surya Kant');
    const DEPTH = 16;
    const letter = ch => {
      const layers = Array.from({ length: DEPTH }, (_, z) => `<span class="l${z === DEPTH - 1 ? ' end' : ''}" style="--z:${z + 1}">${ch}</span>`).join('');
      return `<span class="ch" aria-hidden="true" style="--i:${k};--h:${195 + 9 * k++}">${layers}<span class="f">${ch}</span></span>`;
    };
    h1.innerHTML = '<span class="nm">' + h1.innerHTML.split('<br>').map(w => [...w].map(letter).join('')).join('<br>') + '</span>';
    addEventListener('pointermove', e => {   // gentle tilt toward the cursor
      h1.style.setProperty('--ry', ((e.clientX / innerWidth - .5) * 14 - 7).toFixed(1) + 'deg');
      h1.style.setProperty('--rx', ((.5 - e.clientY / innerHeight) * 9 + 5).toFixed(1) + 'deg');
    });
  }
  setTimeout(() => $('#loader')?.classList.add('done'), 9000);   // never get stuck on the loader

  /* Three.js: local copy first (js/vendor), CDN fallback (e.g. when opened from file://) */
  let THREE;
  try { THREE = await import('./vendor/three.module.js'); }
  catch (e) { THREE = await import(THREE_CDN); }

  $('#yr').textContent = new Date().getFullYear();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- quality tiers: full → low-power → mobile → minimal (reduced motion) ---------- */
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const TIERS = {
    full:    { pr: 2,    farStars: 5000, nearStars: 700, coreDetail: 24, orbs: 14, shooters: 2, octaves: 4, aa: true },
    low:     { pr: 1.25, farStars: 2500, nearStars: 350, coreDetail: 12, orbs: 6,  shooters: 0, octaves: 3, aa: false },
    mobile:  { pr: 1.25, farStars: 1800, nearStars: 250, coreDetail: 10, orbs: 4,  shooters: 0, octaves: 3, aa: false },
    minimal: { pr: 1,    farStars: 1500, nearStars: 200, coreDetail: 8,  orbs: 0,  shooters: 0, octaves: 2, aa: false }
  };
  const tierName = reduce ? 'minimal' : (innerWidth < 860 || coarse) ? 'mobile' : lowPower ? 'low' : 'full';
  const Q = TIERS[tierName];
  document.documentElement.dataset.tier = tierName;

  /* ---------- helpers ---------- */
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = c => '#' + new THREE.Color(c).getHexString();

  /* ---------- DOM behaviour (works even without WebGL) ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: .15 });
  $$('.rv').forEach(el => io.observe(el));

  // email button is shown only once CONTACT.email is set
  const mailBtn = $('#mailBtn');
  if (mailBtn && CONTACT.email) { mailBtn.href = 'mailto:' + CONTACT.email; mailBtn.hidden = false; }

  // count-up for the experience stat
  const statEl = $('.stat b');
  if (statEl) {
    const target = +statEl.dataset.count || 0;
    new IntersectionObserver((es, ob) => es.forEach(e => {
      if (!e.isIntersecting) return; ob.disconnect();
      if (reduce) return;
      const t0 = performance.now();
      const tick = now => { const p = clamp01((now - t0) / 1400); statEl.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), { threshold: .5 }).observe(statEl);
  }

  let cardHover = -1;
  const cards = $$('.card');
  cards.forEach((c, i) => {
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
      c.style.transform = `rotateY(${(x - .5) * 12}deg) rotateX(${(.5 - y) * 12}deg) translateY(-4px)`;
    });
    c.addEventListener('pointerenter', () => cardHover = i);
    c.addEventListener('pointerleave', () => { c.style.transform = ''; if (cardHover === i) cardHover = -1; });
  });

  const sections = $$('main section');
  const navLinks = $$('#nav a'), dotLinks = $$('#dots a');
  function smoothTo(id) { const el = $(id); if (el) window.scrollTo({ top: el.offsetTop, behavior: reduce ? 'auto' : 'smooth' }); }
  [...navLinks, ...dotLinks, ...$$('a[href^="#"]')].forEach(a => a.addEventListener('click', e => { e.preventDefault(); smoothTo(a.getAttribute('href')); }));

  let starts = [];
  const refreshStarts = () => { starts = sections.map(s => s.offsetTop); };
  new ResizeObserver(refreshStarts).observe(document.body); refreshStarts();

  const cursor = $('#cursor');
  let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, pointerSeen = false;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; pointerSeen = true; });

  /* ---------- WebGL ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('#bg'), antialias: Q.aa, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    $('#nogl').classList.add('on'); $('#loader').classList.add('done'); throw err;
  }
  let pr = Math.min(devicePixelRatio, Q.pr);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x04060b, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 600);
  scene.add(camera);

  const C = { cyan: 0x7dd3fc, violet: 0xa78bfa, pink: 0xf472b6, blue: 0x3b82f6, green: 0x6ee7b7, amber: 0xfbbf24, orange: 0xfb923c };
  const STEP = 42;                     // world distance between scenes
  const Z = i => -i * STEP;            // scene i sits at z = -i*STEP

  /* ---------- shared textures / sprites ---------- */
  function dotTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const DOT = dotTexture();
  const glowSprite = (col, size, op = .5) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.setScalar(size); return s;
  };

  function label(text, { color = '#7dd3fc', h = 1, font = 700, pad = 28, bg = true } = {}) {
    const fs = 44, c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = `${font} ${fs}px ui-sans-serif, system-ui, sans-serif`;
    const tw = Math.ceil(g.measureText(text).width), w = tw + pad * 2 + (bg ? 36 : 0), hh = fs + pad;
    c.width = w * 2; c.height = hh * 2; g.scale(2, 2);
    if (bg) {
      g.fillStyle = 'rgba(9,13,22,.82)'; g.strokeStyle = color; g.lineWidth = 2;
      g.beginPath(); g.roundRect(2, 2, w - 4, hh - 4, (hh - 4) / 2); g.fill(); g.stroke();
      g.fillStyle = color; g.beginPath(); g.arc(pad + 6, hh / 2, 6, 0, 7); g.fill();
    }
    g.font = `${font} ${fs}px ui-sans-serif, system-ui, sans-serif`;
    g.fillStyle = bg ? '#eef6ff' : color; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(text, bg ? pad + 24 : pad, hh / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(h * w / hh, h, 1); s.userData.base = s.scale.clone();
    return s;
  }

  /* info panel shown next to a focused project */
  function panel(title, l1, l2, color) {
    const W = 760, H = 300, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,12,20,.9)'; g.strokeStyle = color; g.lineWidth = 3;
    g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 30); g.fill(); g.stroke();
    g.fillStyle = color; g.fillRect(34, 46, 8, 60);
    g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.font = '800 50px ui-sans-serif, system-ui, sans-serif'; g.fillText(title, 62, 92);
    g.fillStyle = color; g.font = '700 31px ui-sans-serif, system-ui, sans-serif'; g.fillText(l1, 62, 158);
    g.fillStyle = '#9fb0c6'; g.font = '500 30px ui-sans-serif, system-ui, sans-serif'; g.fillText(l2, 62, 212);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    s.scale.set(7.2, 7.2 * H / W, 1); return s;
  }

  /* ===================== Backdrop: nebula / aurora shader ===================== */
  const bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2() }, uScroll: { value: 0 },
      uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() }
    },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
    precision highp float;
    uniform float uTime,uScroll; uniform vec2 uRes,uMouse; uniform vec3 uA,uB,uC; varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<${Q.octaves};i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
    void main(){
      vec2 p=(vUv-.5)*vec2(uRes.x/uRes.y,1.)*2.4+uMouse*.18;
      p.y+=uScroll*.2;
      float t=uTime*.045;
      vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));
      vec2 r=vec2(fbm(p+3.*q+vec2(1.7,9.2)+t*1.5),fbm(p+3.*q+vec2(8.3,2.8)-t));
      float f=fbm(p+3.*r);
      vec3 col=mix(uA,uB,clamp(f*f*3.2,0.,1.));
      col=mix(col,uC,clamp(length(q)*.55*smoothstep(.35,.9,f),0.,1.));
      col*=.18+f*1.15;
      float w=sin(p.x*1.3+fbm(p*1.2+t*4.)*4.+uTime*.15)*.35;
      float rib=exp(-pow((p.y*.9-w-.35)*2.2,2.));
      col+=uC*rib*.28*(.4+f);
      col+=uA*.18*exp(-length(vUv-.5-uMouse*vec2(.25,-.25))*4.);
      col*=1.-.55*smoothstep(.35,.95,length(vUv-.5)*1.25);
      gl_FragColor=vec4(col,1.);
    }`,
    depthTest: false, depthWrite: false
  });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));
  renderer.autoClear = false;
  // [A, B, C] per section: hero, about, stack, architecture, work, contact
  const bgPalette = [
    [0x0a1a4a, 0x5b21b6, 0x0ea5e9], [0x0b1f55, 0x4c1d95, 0x38bdf8], [0x053b4a, 0x1d4ed8, 0x22d3ee],
    [0x3b0a45, 0x1e1b6b, 0xf472b6], [0x1a0b52, 0x0e5a78, 0xa78bfa], [0x4a0a3a, 0x3b1a8a, 0xfb923c]
  ].map(r => r.map(h => new THREE.Color(h)));
  function paintBackdrop(s) {
    const i = Math.min(Math.floor(s), bgPalette.length - 2), f = s - i;
    ['uA', 'uB', 'uC'].forEach((u, k) => bgMat.uniforms[u].value.copy(bgPalette[i][k]).lerp(bgPalette[i + 1][k], f));
  }

  /* drifting glow orbs + shooting stars */
  const orbs = [];
  for (let i = 0; i < Q.orbs; i++) {
    const sp = glowSprite([0x38bdf8, 0xa78bfa, 0xf472b6, 0x22d3ee][i % 4], 14 + Math.random() * 26, .06 + Math.random() * .08);
    sp.position.set((Math.random() - .5) * 90, (Math.random() - .5) * 50, 30 - Math.random() * 230);
    sp.userData = { ph: Math.random() * 9, sp: .08 + Math.random() * .15, y: sp.position.y, x: sp.position.x };
    scene.add(sp); orbs.push(sp);
  }
  const shooters = [];
  for (let i = 0; i < Q.shooters; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(-1, 0, 0)]);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    l.visible = false; camera.add(l); shooters.push({ l, life: 0, wait: 6 + Math.random() * 10 });
  }

  /* starfield */
  function stars(n, spread, depth, size) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tmp = new THREE.Color();
    const pal = [C.cyan, C.violet, 0xffffff, C.pink];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * spread;
      pos[i * 3 + 1] = (Math.random() - .5) * spread * .7;
      pos[i * 3 + 2] = 40 - Math.random() * depth;
      tmp.set(pal[(Math.random() * pal.length) | 0]).multiplyScalar(.5 + Math.random() * .5);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  }
  const starsFar = stars(Q.farStars, 260, 330, 1.1); scene.add(starsFar);
  const starsNear = stars(Q.nearStars, 70, 330, .55); scene.add(starsNear);

  const floor = new THREE.GridHelper(700, 140, C.cyan, C.cyan);
  floor.material.transparent = true; floor.material.opacity = .08; floor.position.set(0, -14, -170);
  scene.add(floor);

  /* =====================================================================
     SCENE 0 — HERO "SYSTEM" CORE  (+ About telemetry)
     ===================================================================== */
  const hero = new THREE.Group(); hero.position.z = Z(0); scene.add(hero);
  const heroFade = [];            // [material, baseOpacity] — faded out as the camera moves on
  const fadeReg = (m, o = m.opacity) => { heroFade.push([m, o]); return m; };

  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uA: { value: new THREE.Color(C.cyan) }, uB: { value: new THREE.Color(C.violet) }, uC: { value: new THREE.Color(C.pink) } },
    vertexShader: `
    uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vD;
    float f(vec3 p){return sin(p.x*1.7+uTime*.9)*sin(p.y*1.9+uTime*1.1)*sin(p.z*1.6+uTime*.7);}
    void main(){
      float d=f(position*1.2)*.32+f(position*2.6)*.1; vD=d;
      vec3 p=position+normal*d;
      vec4 mv=modelViewMatrix*vec4(p,1.);
      vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);
      gl_Position=projectionMatrix*mv;
    }`,
    fragmentShader: `
    uniform vec3 uA,uB,uC; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying float vD;
    void main(){
      float fr=pow(1.-max(dot(normalize(vN),normalize(vV)),0.),2.2);
      vec3 base=mix(uB,uA,smoothstep(-.35,.35,vD));
      base=mix(base,uC,smoothstep(.2,.45,vD)*.8);
      vec3 col=base*(.25+fr*1.6)+fr*uA*.6;
      gl_FragColor=vec4(col,(.55+fr*.45)*uAlpha);
    }`,
    transparent: true
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, Q.coreDetail), coreMat);
  hero.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5, 2), fadeReg(new THREE.MeshBasicMaterial({ color: C.cyan, wireframe: true, transparent: true, opacity: .22 })));
  hero.add(shell);
  const rings = [];
  [[4.8, C.cyan, .6], [6.1, C.violet, .45], [7.4, C.pink, .3]].forEach(([r, c, o], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, .012 + i * .004, 8, 200), fadeReg(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o })));
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0); m.userData = { s: (.12 + i * .07) * (i % 2 ? -1 : 1), z0: m.rotation.z, x0: m.rotation.x };
    hero.add(m); rings.push(m);
  });

  // V2 opening: Java / Kafka / Spring Boot feeding the SYSTEM
  const heroTags = new THREE.Group(); hero.add(heroTags);
  const tagMats = [];
  [['Java', '#fb923c', [-6.6, 2.7, 0]], ['Kafka', '#f472b6', [6.6, 2.7, 0]], ['Spring Boot', '#6ee7b7', [0, 5.6, 0]]].forEach(([t, c, p]) => {
    const s = label(t, { color: c, h: 1 }); s.position.set(...p); heroTags.add(s); tagMats.push([s.material, 1]);
    const lm = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .28 });
    heroTags.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...p)]), lm)); tagMats.push([lm, .28]);
  });
  const sysLabel = label('S Y S T E M', { color: '#bfe7ff', h: .8, bg: false, pad: 6 }); sysLabel.position.set(0, -4.3, 0);
  heroTags.add(sysLabel); tagMats.push([sysLabel.material, 1]);

  // About: floating telemetry orbiting the core
  const telem = new THREE.Group(); hero.add(telem);
  const telemMats = [];
  [['8+ YEARS EXPERIENCE', '#fbbf24'], ['TECHNICAL LEADERSHIP', '#7dd3fc'], ['BANKING · PAYMENTS', '#f472b6'], ['ARCHITECTURE · MENTORING', '#a78bfa'], ['ENTERPRISE SYSTEMS', '#6ee7b7'], ['CODE REVIEWS · DELIVERY', '#7dd3fc']].forEach(([t, c], i, a) => {
    const ang = i / a.length * Math.PI * 2, s = label(t, { color: c, h: .5 });
    s.position.set(Math.cos(ang) * 6.2 + 1.5, Math.sin(ang) * 3.8, Math.sin(ang) * 1.5 - 2.2);
    s.material.opacity = 0; telem.add(s); telemMats.push(s.material);
  });

  /* =====================================================================
     SCENE 1 — TECH NODES appear around the core
     ===================================================================== */
  const tech = new THREE.Group(); tech.position.z = Z(1); scene.add(tech);
  const techCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), new THREE.MeshBasicMaterial({ color: C.cyan, wireframe: true }));
  tech.add(techCore);
  const techGlow = glowSprite(C.cyan, 9, .7); tech.add(techGlow);
  const orbit = new THREE.Group(); tech.add(orbit);
  const techNodes = [];
  [['Java', '#fb923c'], ['Spring Boot', '#6ee7b7'], ['Quarkus', '#60a5fa'], ['Kafka', '#f472b6'], ['PostgreSQL', '#93c5fd'], ['Angular', '#f87171'], ['Flutter', '#7dd3fc']].forEach(([t, c], i, a) => {
    const k = i + .5, phi = Math.acos(1 - 2 * k / a.length), th = Math.PI * (1 + Math.sqrt(5)) * k, R = 6.2;
    const s = label(t, { color: c, h: 1.05 });
    const base = new THREE.Vector3(R * Math.cos(th) * Math.sin(phi), R * Math.cos(phi) * .85, R * Math.sin(th) * Math.sin(phi));
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), base.clone()]), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .2 }));
    orbit.add(s, ln); techNodes.push({ s, ln, base });
  });
  const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(6.2, .01, 6, 200), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .25 }));
  orbitRing.rotation.x = Math.PI / 2; tech.add(orbitRing);

  /* =====================================================================
     SCENE 2 — ARCHITECTURE: nodes connect, a transaction travels through
     ===================================================================== */
  const arch = new THREE.Group(); arch.position.z = Z(2); scene.add(arch);
  const nodes = {};
  function node(key, text, x, y, w, color) {
    const g = new THREE.Group(), base = new THREE.Vector3(x, y, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, .7), new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: .9 }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color }));
    const glow = glowSprite(color, 1, .3); glow.scale.set(w * 1.8, 4, 1);
    const l = label(text, { color: hex(color), h: .8, bg: false, pad: 4 }); l.position.z = .5;
    g.add(glow, box, edge, l); arch.add(g);
    const dir = new THREE.Vector3(x, y, 0); if (dir.lengthSq() < .01) dir.set(0, 1, 0); dir.normalize();
    return nodes[key] = { g, base, glow, dir, e: 0, glowBase: .3 };
  }
  node('gw', 'API Gateway', 0, 6, 6, C.cyan);
  node('pay', 'Payment', -8, 2.2, 4.2, C.blue);
  node('usr', 'User', 0, 2.2, 4.2, C.blue);
  node('not', 'Notification', 8, 2.2, 4.8, C.blue);
  node('kfk', 'Kafka Event Stream', 0, -1.8, 20, C.pink);
  node('db', 'PostgreSQL', 0, -5.8, 6, C.violet);

  const edgeLines = [], ambient = [];
  [['gw', 'pay', C.cyan], ['gw', 'usr', C.cyan], ['gw', 'not', C.cyan], ['pay', 'kfk', C.pink], ['usr', 'kfk', C.pink], ['not', 'kfk', C.pink], ['kfk', 'db', C.violet]].forEach(([a, b, col]) => {
    const A = nodes[a].base.clone(), B = nodes[b].base.clone();
    if (b === 'kfk') B.x = A.x;
    const lm = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .45 });
    arch.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), lm)); edgeLines.push(lm);
    for (let k = 0; k < 2; k++) {
      const p = glowSprite(col, 1, 0); p.scale.setScalar(.9); arch.add(p); ambient.push({ p, A, B, o: k / 2 + Math.random() * .1, s: .15 + Math.random() * .1 });
    }
  });

  // live transaction: request → event → Kafka buffer → consumers → persist
  const mkDot = (col, sc) => { const p = glowSprite(col, sc, 0); p.position.z = .7; p.visible = false; arch.add(p); return p; };
  const trail = Array.from({ length: 6 }, (_, j) => mkDot(C.cyan, 2.1 - j * .28));
  const acc = Array.from({ length: 6 }, () => mkDot(C.pink, 1.3));
  const dbRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({ color: C.violet, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  dbRing.position.set(0, -5.8, .5); arch.add(dbRing);
  let ringT = -9;

  const CYCLE = 10;
  const TX = [
    [0, 1.7, 'POST /payments → API Gateway → Payment Service', '#7dd3fc'],
    [1.7, 3.1, 'Payment Service publishes  payment.created', '#f472b6'],
    [3.1, 4.9, 'Kafka buffers events from producers…', '#f472b6'],
    [4.9, 6.5, 'Consumers react — User · Notification', '#f472b6'],
    [6.5, 8.1, 'Settlement persisted → PostgreSQL', '#a78bfa'],
    [8.1, 10, 'Committed ✓  awaiting next request', '#6ee7b7']
  ];
  const txLine = $('#txLine'), txDot = $('#txDot');
  let txPhase = -1, txShown = false;
  const flash = k => { nodes[k].e = 1; };
  function onPhase(ph, t) {
    if (txLine) { txLine.textContent = TX[ph][2]; txDot.style.background = txDot.style.color = TX[ph][3]; }
    if (ph === 0) flash('gw');
    if (ph === 1) flash('pay');
    if (ph === 2) flash('kfk');
    if (ph === 4) { flash('usr'); flash('not'); }
    if (ph === 5) { flash('db'); ringT = t; }
  }
  const setTrail = (A, B, k, col) => {
    trail.forEach((p, j) => {
      const kk = Math.max(0, k - j * .045);
      p.visible = true; p.position.lerpVectors(A, B, kk); p.position.z = .7;
      p.material.color.setHex(col); p.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * (1 - j / 6);
    });
  };
  const hideTrail = () => trail.forEach(p => p.visible = false);
  const hideAcc = () => acc.forEach(p => p.visible = false);
  const V = (x, y) => new THREE.Vector3(x, y, .7);
  const P_REQ = [V(0, 5.1), V(-8, 3.1)], P_EVT = [V(-8, 1.3), V(-8, -1.1)], P_DB = [V(0, -2.6), V(0, -4.9)];

  function runTx(t, live) {
    if (!live) { if (txShown) { hideTrail(); hideAcc(); txShown = false; } return; }
    txShown = true;
    const c = t % CYCLE; let ph = TX.findIndex(p => c >= p[0] && c < p[1]); if (ph < 0) ph = 5;
    if (ph !== txPhase) { txPhase = ph; onPhase(ph, t); }
    const k = (c - TX[ph][0]) / (TX[ph][1] - TX[ph][0]);
    if (ph === 0) { setTrail(P_REQ[0], P_REQ[1], k, C.cyan); hideAcc(); }
    else if (ph === 1) { setTrail(P_EVT[0], P_EVT[1], k, C.pink); hideAcc(); }
    else if (ph === 2) {          // events accumulate in Kafka
      hideTrail(); const n = 1 + Math.floor(k * 6);
      acc.forEach((p, i) => {
        p.visible = i < n; p.position.set(-8 + (i + 1) * 1.35 + Math.sin(t * 4 + i) * .25, -1.8 + Math.sin(t * 5 + i * 2) * .25, .7);
        p.material.opacity = .85; p.scale.setScalar(1.3 + Math.sin(t * 6 + i) * .15);
      });
    } else if (ph === 3) {        // released to consumers
      const e = k * k * (3 - 2 * k);
      acc.forEach((p, i) => {
        const sx = -8 + (i + 1) * 1.35, tx = i < 3 ? 0 : 8;
        p.visible = true; p.position.set(lerp(sx, tx, e), lerp(-1.8, 1.3, e), .7);
        p.material.opacity = .85 * (1 - sm(.85, 1, k));
      });
    } else if (ph === 4) { hideAcc(); setTrail(P_DB[0], P_DB[1], k, C.violet); }
    else { hideTrail(); hideAcc(); }
  }

  /* =====================================================================
     SCENE 3 — WORK: recognisable project objects
     ===================================================================== */
  const work = new THREE.Group(); work.position.z = Z(3); scene.add(work);

  const flat = (col, o) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, depthWrite: false });
  const edgesOf = (geo, col, o = .85) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: o }));
  const boxPart = (w, h, d, col, o = .12) => { const geo = new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.add(new THREE.Mesh(geo, flat(col, o)), edgesOf(geo, col)); return g; };
  const plane = (w, h, col, o, x, y, z, add = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.set(x, y, z); return m;
  };

  function buildPhone(col) {
    const g = new THREE.Group(), tiles = [];
    g.add(boxPart(1.8, 3.5, .3, col));
    g.add(plane(1.52, 3.05, col, .14, 0, 0, .16, true));
    g.add(plane(.5, .09, 0x050810, .9, 0, 1.58, .17));
    g.add(plane(1.25, .22, col, .75, 0, 1.2, .17));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const m = plane(.34, .34, col, .5, (c - 1) * .46, .55 - r * .5, .17); g.add(m); tiles.push(m); }
    g.add(plane(.7, .07, 0xffffff, .35, 0, -1.55, .17));
    return { g, update: t => { g.rotation.y = Math.sin(t * .6) * .6; g.rotation.x = Math.sin(t * .4) * .12; tiles.forEach((m, i) => m.material.opacity = .3 + .3 * Math.sin(t * 2 + i * .7)); } };
  }
  function buildCard(col) {
    const g = new THREE.Group();
    g.add(boxPart(3.7, 2.35, .12, col, .16));
    g.add(plane(3.7, .45, 0x050810, .95, 0, .7, .07));
    const chip = boxPart(.62, .46, .03, C.amber, .45); chip.position.set(-1.25, .1, .08); g.add(chip);
    for (let gi = 0; gi < 4; gi++) for (let d = 0; d < 4; d++) g.add(plane(.13, .13, 0xffffff, .55, -1.4 + gi * .95 + d * .2, -.5, .07));
    const a = new THREE.Mesh(new THREE.CircleGeometry(.24, 24), flat(C.pink, .8)), b = new THREE.Mesh(new THREE.CircleGeometry(.24, 24), flat(C.amber, .8));
    a.position.set(1.15, -.88, .075); b.position.set(1.4, -.88, .075); g.add(a, b);
    const shine = plane(.5, 3, 0xffffff, .12, 0, 0, .09, true); shine.rotation.z = .5; g.add(shine);
    return { g, update: t => { g.rotation.y = Math.sin(t * .5) * .75; g.rotation.x = .18 + Math.sin(t * .7) * .1; shine.position.x = ((t * .5) % 1) * 5 - 2.5; } };
  }
  function gearGeo(R, teeth, th) {
    const sh = new THREE.Shape(), n = teeth * 4, tooth = R * .22;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = (i % 4 < 2) ? R : R - tooth; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    sh.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, R * .32, 0, Math.PI * 2, true); sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }); geo.translate(0, 0, -th / 2); return geo;
  }
  function buildEngine(col) {
    const g = new THREE.Group(), gears = [];
    [[1.45, 10, -1, -.2, 1, C.pink], [.95, 7, 1.4, .8, -10 / 7, C.cyan], [.7, 6, .55, -1.65, -10 / 6, C.violet]].forEach(([R, n, x, y, spin, c]) => {
      const geo = gearGeo(R, n, .4), gg = new THREE.Group();
      gg.add(new THREE.Mesh(geo, flat(c, .16)), edgesOf(geo, c, .9)); gg.position.set(x, y, 0); g.add(gg); gears.push([gg, spin]);
    });
    g.add(glowSprite(col, 6, .35));
    return { g, update: t => { g.rotation.y = Math.sin(t * .45) * .4; g.rotation.x = Math.sin(t * .35) * .15; gears.forEach(([gg, s]) => gg.rotation.z = t * .5 * s); } };
  }
  function buildEnterprise(col) {
    const g = new THREE.Group(), wins = [];
    [[-1.25, 2.2, 1.1], [0, 3.4, 1.2], [1.3, 1.7, 1.1]].forEach(([x, h, w]) => {
      const t = boxPart(w, h, w, col, .13); t.position.set(x, -1.9 + h / 2, 0); g.add(t);
      for (let r = 0; r < Math.floor(h / .6); r++) for (let c = 0; c < 2; c++) { const m = plane(.22, .22, 0xfef3c7, .5, x + (c - .5) * .42, -1.9 + .45 + r * .6, w / 2 + .01, true); g.add(m); wins.push(m); }
    });
    const cloud = new THREE.Group(); cloud.position.y = 2.3;
    [[-.7, 0, .6], [.1, .4, .85], [1, 0, .6], [.3, -.15, .65]].forEach(([x, y, r]) => {
      const geo = new THREE.IcosahedronGeometry(r, 1); const m = new THREE.Mesh(geo, flat(0xe0f2fe, .1)); m.position.set(x, y, 0);
      const w = edgesOf(geo, 0xe0f2fe, .75); w.position.copy(m.position); cloud.add(m, w);
    });
    g.add(cloud);
    const ups = [0, 1, 2].map(i => { const p = glowSprite(col, .5, .9); p.userData.o = i / 3; g.add(p); return p; });
    g.scale.setScalar(.85);
    return { g, update: t => {
      g.rotation.y = Math.sin(t * .4) * .55; cloud.position.y = 2.3 + Math.sin(t * 1.2) * .12;
      wins.forEach((m, i) => m.material.opacity = .25 + .45 * (Math.sin(t * 1.5 + i * 1.9) > .2 ? 1 : .2));
      ups.forEach(p => { const k = (t * .35 + p.userData.o) % 1; p.position.set(0, -.5 + k * 2.8, .7); p.material.opacity = Math.sin(k * Math.PI); });
    } };
  }

  const PROJECTS = [
    { name: 'Mobile Banking App', stack: 'Flutter · Cross-platform · Java', desc: 'Secure mobile banking on scalable services', col: C.cyan, build: buildPhone },
    { name: 'Settlement System', stack: 'Quarkus · PostgreSQL · Hazelcast', desc: 'Event-driven settlement processing', col: C.pink, build: buildEngine },
    { name: 'Debit Card Management', stack: 'Java · Spring Boot · Kafka', desc: 'Card & payment platform microservices', col: C.violet, build: buildCard },
    { name: 'Enterprise Application', stack: 'Multi-tenant · ERP · Architecture', desc: 'Enterprise cloud ERP architecture', col: C.green, build: buildEnterprise }
  ];
  const shapes = [], pickables = [];
  const WORK_R = [6, 4.4];
  PROJECTS.forEach((p, i) => {
    const grp = new THREE.Group(), a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const base = new THREE.Vector3(Math.cos(a) * WORK_R[0], Math.sin(a) * WORK_R[1], Math.sin(a * 2) * 1.5);
    const obj = p.build(p.col);
    const glow = glowSprite(p.col, 7, .35);
    const lab = label(p.name, { color: hex(p.col), h: .75 }); lab.position.y = -3.1;
    const info = panel(p.name, p.stack, p.desc, hex(p.col)); info.position.set(0, -5.3, .5);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.userData.i = i; pickables.push(hit);
    grp.add(glow, obj.g, lab, info, hit); work.add(grp);
    shapes.push({ grp, obj, glow, lab, info, base, f: 0, ph: i * 1.7 });
  });
  const workHub = new THREE.Mesh(new THREE.TorusGeometry(7.4, .012, 6, 200), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .25 }));
  workHub.scale.y = .75; work.add(workHub);

  /* =====================================================================
     SCENE 4 — FINALE: everything converges into one object
     ===================================================================== */
  const fin = new THREE.Group(); fin.position.z = Z(4); scene.add(fin);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(3.2, .7, 220, 20, 2, 3), new THREE.MeshBasicMaterial({ color: C.violet, wireframe: true, transparent: true, opacity: .5 }));
  const knotCore = new THREE.Mesh(new THREE.TorusKnotGeometry(3.2, .25, 220, 12, 2, 3), new THREE.MeshBasicMaterial({ color: C.cyan }));
  fin.add(knot, knotCore);
  const portal = [];
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(6 + i * 1.6, .02, 6, 140), new THREE.MeshBasicMaterial({ color: i % 2 ? C.pink : C.cyan, transparent: true, opacity: .4 - i * .03 }));
    r.position.z = -i * 2.2; fin.add(r); portal.push(r);
  }
  const finGlow = glowSprite(C.violet, 26, .6); fin.add(finGlow);

  /* ---------- camera path (one stop per section) ---------- */
  const mobile = () => innerWidth < 860;
  const keys = [
    { sc: 0, x: 0,    y: 0,   d: 17 },   // hero
    { sc: 0, x: -5,   y: .5,  d: 12 },   // about  — fly in towards the core
    { sc: 1, x: -4.5, y: 1.5, d: 17 },   // stack
    { sc: 2, x: 7,    y: 1,   d: 25 },   // architecture
    { sc: 3, x: -8.5, y: 0,   d: 20 },   // work   — objects sit right of the text
    { sc: 4, x: 0,    y: 0,   d: 27 }    // contact
  ];
  const ease = t => t * t * (3 - 2 * t);
  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  function path(s, out, outLook) {
    const i = Math.min(Math.floor(s), keys.length - 2), f = ease(Math.min(1, s - i));
    const a = keys[i], b = keys[i + 1], m = mobile() ? 0 : 1, L = (p, q) => p + (q - p) * f;
    const z = L(Z(a.sc), Z(b.sc)), d = L(a.d, b.d) * (mobile() ? 1.25 : 1);
    out.set(L(a.x, b.x) * m, L(a.y, b.y), z + d);
    outLook.set(L(a.x, b.x) * m, 0, z);
  }

  /* ---------- sizing ---------- */
  let dirty = true;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false); bgMat.uniforms.uRes.value.set(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  addEventListener('resize', resize); resize();

  /* ---------- pointer picking for project objects ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let rayHover = -1;

  /* ---------- loop ---------- */
  let scrollCur = 0, active = -1, lastT = 0, P = 0, focusIdx = -1, lastCard = -2, lastSig = '';
  let slow = 0, slowN = 0;                       // adaptive resolution
  const progressEl = $('#progress'), clock = new THREE.Clock();
  const mouse = new THREE.Vector2();
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const WSTART = new THREE.Vector3(0, 0, STEP), WEND = new THREE.Vector3(0, 0, -STEP);   // arch → work → finale (work-local)

  function frame() {
    requestAnimationFrame(frame);
    if (reduce) {                                // minimal tier: render only when something changed
      const sig = Math.round(scrollY) + '|' + innerWidth + '|' + cardHover;
      if (sig === lastSig && !dirty) return; lastSig = sig; dirty = false;
    }
    const now = clock.getElapsedTime(), t = reduce ? 3 : now, dtRaw = now - lastT, dt0 = Math.min(dtRaw, .05); lastT = now;

    // adaptive resolution: step the pixel ratio down if frames are consistently slow
    if (!reduce && pr > 1) {
      slow += dt0 > .034 ? 1 : 0; slowN++;
      if (slowN >= 90) { if (slow > 55) { pr = Math.max(1, pr - .25); resize(); } slow = 0; slowN = 0; }
    }

    // smooth scroll → section coordinate (0 … n-1)
    scrollCur += (scrollY - scrollCur) * (reduce ? 1 : 1 - Math.exp(-Math.min(dtRaw, .3) * 4.5));
    const n = starts.length;
    let s = 0;
    for (let i = 0; i < n - 1; i++) { if (scrollCur >= starts[i]) s = i + (scrollCur - starts[i]) / Math.max(1, starts[i + 1] - starts[i]); }
    s = Math.max(0, Math.min(n - 1, s));
    progressEl.style.transform = `scaleX(${Math.min(1, scrollY / maxScroll())})`;

    let idx = 0; for (let i = 0; i < n; i++) if (scrollY + innerHeight * .5 >= starts[i]) idx = i;
    if (idx !== active) { active = idx; navLinks.forEach((a, i) => a.classList.toggle('on', i === idx)); dotLinks.forEach((a, i) => a.classList.toggle('on', i === idx)); }

    // pointer parallax (off for touch / reduced motion)
    const par = (reduce || coarse || !pointerSeen) ? 0 : 1;
    mouse.x += ((mx / innerWidth - .5) * 2 * par - mouse.x) * .05;
    mouse.y += ((my / innerHeight - .5) * 2 * par - mouse.y) * .05;
    if (!coarse) { cx += (mx - cx) * .12; cy += (my - cy) * .12; cursor.style.transform = `translate(${cx}px,${cy}px)`; }

    // camera
    path(s, camPos, camTarget);
    camera.position.copy(camPos);
    camera.position.x += mouse.x * .9; camera.position.y += -mouse.y * .6 + (reduce ? 0 : Math.sin(t * .4) * .12);
    camera.lookAt(camTarget);
    camera.rotation.z += mouse.x * -.012;

    /* ---- story factors (s: 0 hero · 1 about · 2 stack · 3 arch · 4 work · 5 contact) ---- */
    const spd = reduce ? 0 : (.5 + .5 * Math.exp(-Math.max(0, t - 2) / 3.5));   // hero calms down after the entrance
    P = reduce ? 3 : P + dt0 * spd;

    const heroOut = sm(1.55, 2.1, s);
    const tagVis = 1 - sm(.55, 1.05, s), telVis = sm(.75, 1.25, s) * (1 - sm(1.55, 1.95, s));
    const techIn = sm(1.35, 2.05, s), techOut = sm(2.5, 3.05, s), techK = techIn * (1 - techOut);
    const archIn = sm(2.35, 2.9, s), archOut = sm(3.5, 4.0, s);
    const workIn = sm(3.3, 3.9, s), workOut = sm(4.55, 4.95, s);
    const finIn = sm(4.55, 5, s);

    hero.visible = s < 2.4; tech.visible = s > 1.2 && s < 3.3; arch.visible = s > 2.2 && s < 4.4; work.visible = s > 3.2 && s < 5.2; fin.visible = s > 4.4;

    /* hero */
    if (hero.visible) {
      coreMat.uniforms.uTime.value = P; coreMat.uniforms.uAlpha.value = 1 - heroOut;
      core.rotation.y = P * .12; core.rotation.x = Math.sin(P * .2) * .2;
      core.scale.setScalar((1 + Math.sin(P * 1.6) * .03) * (1 + heroOut * .5));
      shell.rotation.y = -P * .09; shell.rotation.z = P * .05;
      rings.forEach(r => { r.rotation.z = r.userData.z0 + P * r.userData.s; r.rotation.x = r.userData.x0 + P * .03; });
      heroFade.forEach(([m, o]) => m.opacity = o * (1 - heroOut));
      heroTags.visible = tagVis > .01; tagMats.forEach(([m, o]) => m.opacity = o * tagVis);
      telem.visible = telVis > .01; telem.rotation.y = P * .18; telemMats.forEach(m => m.opacity = telVis);
      hero.position.y = Math.sin(P * .6) * .2;
    }

    /* tech: nodes appear around the core, then contract into the architecture */
    if (tech.visible) {
      const rr = Math.max(.001, techK);
      orbit.rotation.y = t * .12; orbit.rotation.z = Math.sin(t * .2) * .12;
      techNodes.forEach(({ s: sp, ln, base }) => {
        sp.position.copy(base).multiplyScalar(rr); ln.scale.setScalar(rr);
        sp.scale.copy(sp.userData.base).multiplyScalar(rr); sp.material.opacity = clamp01(techK * 1.6);
      });
      techCore.scale.setScalar(Math.max(.001, techIn * (1 - techOut * .6))); techCore.rotation.x = t * .3; techCore.rotation.y = t * .4;
      techGlow.material.opacity = (.55 + Math.sin(t * 2) * .12) * (1 - techOut);
      orbitRing.material.opacity = .25 * techK; orbitRing.scale.setScalar(Math.max(.001, techK));
    }

    /* architecture: nodes fly in & connect → transaction runs → breaks apart */
    if (arch.visible) {
      const vis = archIn * (1 - archOut), conn = sm(.7, 1, archIn) * (1 - sm(0, .5, archOut));
      Object.values(nodes).forEach((nd, i) => {
        nd.e = Math.max(0, nd.e - dt0 * 1.6);
        nd.g.position.copy(nd.base).multiplyScalar(archIn).addScaledVector(nd.dir, archOut * 18);
        nd.g.position.z += Math.sin(t * .8 + i) * .25;
        nd.g.scale.setScalar(Math.max(.001, vis * (1 + nd.e * .14)));
        nd.glow.material.opacity = nd.glowBase * vis + nd.e * .75;
      });
      edgeLines.forEach(m => m.opacity = .45 * conn);
      ambient.forEach(o => { const k = (t * o.s + o.o) % 1; o.p.position.lerpVectors(o.A, o.B, k); o.p.material.opacity = Math.sin(k * Math.PI) * .45 * conn; });
      const live = conn > .6;
      runTx(t, live);
      dbRing.visible = live; const ru = (t - ringT) / 1;
      if (ru >= 0 && ru < 1) { dbRing.scale.setScalar(1.4 + ru * 5); dbRing.material.opacity = (1 - ru) * .8; } else dbRing.material.opacity = 0;
    } else runTx(t, false);

    /* work: arch breaks apart into project objects → they fly toward the finale */
    if (work.visible) {
      // focus: hovered card > hovered 3D object > auto-tour while the section is on screen
      const workActive = s > 3.75 && s < 4.6;
      if (!coarse && pointerSeen && workActive && cardHover < 0) {
        ndc.set(mx / innerWidth * 2 - 1, -(my / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(pickables, false)[0]; rayHover = hit ? hit.object.userData.i : -1;
      } else rayHover = -1;
      focusIdx = cardHover >= 0 ? cardHover : rayHover >= 0 ? rayHover : (workActive && !reduce ? Math.floor(t / 3.6) % PROJECTS.length : (workActive ? 0 : -1));
      if (focusIdx !== lastCard) { lastCard = focusIdx; cards.forEach((c, i) => c.classList.toggle('hot', i === focusIdx && workActive)); }

      shapes.forEach((o, i) => {
        o.f += ((focusIdx === i ? 1 : 0) - o.f) * Math.min(1, dt0 * 6 + (reduce ? 1 : 0));
                const wi = ease(workIn);
        o.grp.position.copy(WSTART).lerp(o.base, wi).lerp(WEND, workOut);
        o.grp.position.y += Math.sin(t * .8 + o.ph) * .4; o.grp.position.z += o.f * 2.2;
        o.grp.scale.setScalar(Math.max(.001, wi * (1 - workOut) * (1 + o.f * .22)));
        o.obj.update(t * (.6 + o.f * .8) + o.ph);
        o.glow.material.opacity = .3 + o.f * .4;
        o.info.material.opacity = o.f * workIn; o.info.scale.setScalar(.9 + o.f * .1);
        o.lab.material.opacity = .55 + o.f * .45;
      });
      workHub.scale.set(wi0(workIn), wi0(workIn) * .75, 1); workHub.material.opacity = .25 * workIn * (1 - workOut); workHub.rotation.z = t * .05;
      work.rotation.z = Math.sin(t * .15) * .05;
    }

    /* finale: the system collapses into one object */
    if (fin.visible) {
      const k = Math.max(.001, ease(finIn));
      knot.scale.setScalar(k); knotCore.scale.setScalar(k);
      knot.rotation.x = t * .2; knot.rotation.y = t * .3; knotCore.rotation.copy(knot.rotation);
      portal.forEach((r, i) => { r.rotation.z = t * (.05 + i * .02) * (i % 2 ? -1 : 1); r.scale.setScalar(Math.max(.001, k * (1 + Math.sin(t * 1.2 - i * .5) * .04))); });
      finGlow.material.opacity = (.45 + Math.sin(t * 1.5) * .12) * k;
    }

    starsFar.rotation.z = P * .004; starsNear.rotation.z = -P * .008;
    starsNear.position.x = -mouse.x * 2; starsNear.position.y = mouse.y * 1.4;

    paintBackdrop(s);
    bgMat.uniforms.uTime.value = P; bgMat.uniforms.uScroll.value = s; bgMat.uniforms.uMouse.value.set(mouse.x, -mouse.y);
    orbs.forEach(o => { const u = o.userData; o.position.y = u.y + Math.sin(t * u.sp + u.ph) * 4; o.position.x = u.x + Math.cos(t * u.sp * .7 + u.ph) * 5; });
    shooters.forEach(sh => {
      sh.wait -= dt0;
      if (sh.wait <= 0 && !sh.l.visible) {
        sh.l.visible = true; sh.life = 0; sh.l.scale.setScalar(6 + Math.random() * 6);
        sh.l.position.set((Math.random() - .2) * 40, 8 + Math.random() * 14, -30 - Math.random() * 20); sh.l.rotation.z = -.35 + (Math.random() - .5) * .3;
      }
      if (sh.l.visible) {
        sh.life += dt0 * 1.3; sh.l.position.x += dt0 * 55; sh.l.position.y -= dt0 * 18;
        sh.l.material.opacity = Math.sin(Math.min(1, sh.life) * Math.PI);
        if (sh.life >= 1) { sh.l.visible = false; sh.wait = 8 + Math.random() * 12; }
      }
    });

    renderer.clear(); renderer.render(bgScene, bgCam); renderer.clearDepth();
    renderer.render(scene, camera);
  }
  function wi0(w) { return Math.max(.001, ease(w)); }
  frame();
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => $('#loader').classList.add('done'), 500)));
})();
