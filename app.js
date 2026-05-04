// Service Worker Registration — NO auto-reload to avoid file dialog race condition
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => { console.log('SW registered'); reg.update(); })
      .catch(e => console.log('SW fail:', e));
  });
}

const $ = id => document.getElementById(id);

// Debug overlay — defined OUTSIDE initApp so it survives any crash
function dbg(msg) {
  let el = document.getElementById('debug-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'debug-overlay';
    el.style.cssText = 'position:fixed;bottom:70px;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;font-size:11px;font-family:monospace;padding:6px 8px;z-index:9999;max-height:180px;overflow-y:auto;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.innerHTML += '<div>[' + new Date().toISOString().slice(11,19) + '] ' + msg + '</div>';
  el.scrollTop = el.scrollHeight;
  console.log('[DBG]', msg);
}

// ── App Scope ────────────────────────────────────────────────────────────────
function initApp() {
  dbg('initApp() started');
// ── UI State Management ───────────────────────────────────────────────────────
const UI = {
  activeTab: 'tab-image',
  menuOpen: false,
  btnMenu: $('btn-menu'),
  btnCloseMenu: $('btn-close-menu'),
  drawer: $('drawer'),
  drawerOverlay: $('drawer-overlay'),
  drawerContent: $('drawer-content'),
  navTabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  btnUpload: $('btn-upload'),
  fileInput: $('file-input')
};

// ResizeObserver moved below state declaration to avoid Temporal Dead Zone crash

// ── TLC Core State ────────────────────────────────────────────────────────────
const state = {
  imgEl: null, imgB64: null, imgW: 0, imgH: 0,
  imageRotation: 0,
  lines: [], spottingMarks: [], lanes: [],
  activeTool: 'pan', view: { zoom: 1, dx: 0, dy: 0 },
  dragStart: null, mStart: { x: 0, y: 0 }, viewStart: { dx: 0, dy: 0 },
  activeLine: null, activeLane: null, activeMark: null,
  isPanning: false, isRotating: false, rotateStart: 0,
  editingField: null,
  polarityMode: 'default'
};

// ResizeObserver: re-render when canvas container is resized/shown
const canvasWrap = $('canvas-container');
if (canvasWrap && window.ResizeObserver) {
    new ResizeObserver(() => {
        if (state.imgEl && canvasWrap.clientWidth > 0) render();
    }).observe(canvasWrap);
}

// ── Hamburger Menu Logic ──────────────────────────────────────────────────────
const DrawerTemplates = {
  'tab-image': `
    <div>
      <div class="drawer-section-title">Actions</div>
      <button class="btn-primary" id="btn-find-lanes" style="margin-bottom:8px;">📡 Find Lanes</button>
      <button class="btn-secondary" id="btn-reset">🔄 Reset Image</button>
    </div>
    <div>
      <div class="drawer-section-title">Tools</div>
      <div class="tool-grid">
        <div class="tool-card active" data-tool="roi"><span>📦</span><span>Crop</span></div>
        <div class="tool-card" data-tool="pan"><span>🖐️</span><span>Pan</span></div>
        <div class="tool-card" data-tool="rotate_img"><span>🔄</span><span>Rotate</span></div>
        <div class="tool-card" data-tool="select"><span>🖱️</span><span>Select</span></div>
        <div class="tool-card" data-tool="line"><span>📏</span><span>Lines</span></div>
        <div class="tool-card" data-tool="spotting"><span>📍</span><span>Marks</span></div>
      </div>
    </div>
    <div>
      <div class="drawer-section-title">Polarity Mode</div>
      <div style="display:flex; gap:8px;">
        <button class="btn-secondary mode-btn" data-mode="dark" style="flex:1; padding:8px; font-size:0.8rem;">Dark</button>
        <button class="btn-primary mode-btn" data-mode="bright" style="flex:1; padding:8px; font-size:0.8rem;">Bright</button>
      </div>
    </div>
  `,
  'tab-profile': `
    <div>
      <div class="drawer-section-title">Peak Integration</div>
      <div class="slider-group" style="margin-bottom: 16px;">
        <div class="slider-header"><label>Sensitivity</label><span id="val-sens">40</span></div>
        <input type="range" id="peak-prominence" min="1" max="80" value="40" oninput="document.getElementById('val-sens').innerText=this.value; if(window.generateProfiles) window.generateProfiles();">
      </div>
      <div class="slider-group" style="margin-bottom: 16px;">
        <div class="slider-header"><label>Resolution</label><span id="val-res">8</span></div>
        <input type="range" id="peak-distance" min="1" max="100" value="8" oninput="document.getElementById('val-res').innerText=this.value; if(window.generateProfiles) window.generateProfiles();">
      </div>
      <div class="slider-group">
        <div class="slider-header"><label>Width %</label><span id="val-width">50</span></div>
        <input type="range" id="peak-threshold" min="5" max="95" value="50" oninput="document.getElementById('val-width').innerText=this.value; if(window.generateProfiles) window.generateProfiles();">
      </div>
      <button class="btn-secondary" id="btn-restore" style="margin-top: 16px;">Restore Defaults</button>
    </div>
  `,
  'tab-table': `
    <div>
      <div class="drawer-section-title">Data Actions</div>
      <button class="btn-primary" style="margin-bottom: 8px;">📥 Export to CSV</button>
      <button class="btn-secondary">📋 Copy to Clipboard</button>
    </div>
  `
};

function bindDrawerEvents() {
    document.querySelectorAll('.tool-card').forEach(card => {
        if (card.dataset.tool === state.activeTool) {
            document.querySelectorAll('.tool-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        }
        card.onclick = () => {
            state.activeTool = card.dataset.tool;
            toggleMenu();
        };
    });

    if ($('btn-find-lanes')) {
        $('btn-find-lanes').onclick = () => {
            findLanes();
            toggleMenu();
        };
    }
}

function toggleMenu() {
  UI.menuOpen = !UI.menuOpen;
  if (UI.menuOpen) {
    UI.drawerContent.innerHTML = DrawerTemplates[UI.activeTab];
    bindDrawerEvents();
    UI.drawer.classList.add('open');
    UI.drawerOverlay.classList.add('active');
  } else {
    UI.drawer.classList.remove('open');
    UI.drawerOverlay.classList.remove('active');
  }
}

UI.btnMenu.addEventListener('click', toggleMenu);
UI.btnCloseMenu.addEventListener('click', toggleMenu);
UI.drawerOverlay.addEventListener('click', toggleMenu);

// ── Tab Switching Logic ───────────────────────────────────────────────────────
function switchTab(targetId) {
  UI.navTabs.forEach(tab => {
    if (tab.dataset.target === targetId) tab.classList.add('active');
    else tab.classList.remove('active');
  });
  UI.tabContents.forEach(section => {
    if (section.id === targetId) section.classList.add('active');
    else section.classList.remove('active');
  });
  UI.activeTab = targetId;
}

UI.navTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.target));
});

// ── Geometry & Rendering ──────────────────────────────────────────────────────
function getImageCanvasPos(x, y, sx, sy) {
  const icx = (state.imgW*sx)/2; const icy = (state.imgH*sy)/2;
  const dx = x*sx - icx; const dy = y*sy - icy;
  const ca = Math.cos(state.imageRotation); const sa = Math.sin(state.imageRotation);
  return { cx: dx * ca - dy * sa + icx, cy: dx * sa + dy * ca + icy };
}

function getPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
  const scX = (clientX - rect.left) * (canvas.width / rect.width);
  const scY = (clientY - rect.top) * (canvas.height / rect.height);
  const z = state.view.zoom;
  let x = (scX - state.view.dx) / z; let y = (scY - state.view.dy) / z;
  const sx = canvas.width / state.imgW;
  const icx = (state.imgW*sx)/2; const icy = (state.imgH*sx)/2;
  let dx = x - icx; let dy = y - icy;
  const sa = Math.sin(-state.imageRotation); const ca = Math.cos(-state.imageRotation);
  const rx = dx * ca - dy * sa; const ry = dx * sa + dy * ca;
  return { x: (rx + icx) / sx, y: (ry + icy) / sx, scX, scY, cx: x, cy: y };
}

function render() {
  const canvas = $('canvas-main'); if (!state.imgEl || !canvas) return;
  const wrap = canvas.parentElement;
  
  // Compute size explicitly: fill viewport minus top-bar and bottom-nav
  const topBar = document.querySelector('.top-bar');
  const bottomNav = document.querySelector('.bottom-nav');
  const topH = topBar ? topBar.offsetHeight : 56;
  const botH = bottomNav ? bottomNav.offsetHeight : 60;
  const targetW = window.innerWidth;
  const targetH = window.innerHeight - topH - botH;
  
  if (targetW === 0 || targetH === 0) return;
  
  if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.save(); ctx.translate(state.view.dx, state.view.dy); ctx.scale(state.view.zoom, state.view.zoom);

  const drawW = canvas.width; const sx = drawW / state.imgW; const sy = sx;
  const drawH = state.imgH * sy;

  ctx.save();
  ctx.translate((state.imgW*sx)/2, (state.imgH*sy)/2); ctx.rotate(state.imageRotation);
  ctx.drawImage(state.imgEl, -(state.imgW*sx)/2, -(state.imgH*sy)/2, drawW, drawH);
  ctx.translate(-(state.imgW*sx)/2, -(state.imgH*sy)/2);

  // Spotting Marks
  state.spottingMarks.forEach(m => {
    const isS = state.activeMark === m;
    ctx.fillStyle = isS ? '#ffc107' : '#58a6ff'; ctx.beginPath(); ctx.arc(m.x*sx, m.y*sy, 6/state.view.zoom, 0, 2*Math.PI); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1/state.view.zoom; ctx.stroke();
  });

  // Lines
  state.lines.forEach(l => {
    const isS = state.activeLine === l;
    const pos = getImageCanvasPos(l.cx, l.cy, sx, sy);
    const isOrigin = pos.cy > (state.imgH*sy)/2;
    ctx.save(); ctx.translate(l.cx*sx, l.cy*sy); ctx.rotate((l.angle || 0) - state.imageRotation);
    ctx.strokeStyle = isS ? '#ffc107' : (isOrigin ? '#f0883e' : '#238636');
    ctx.lineWidth = 4/state.view.zoom; ctx.beginPath(); ctx.moveTo(-l.w*sx/2, 0); ctx.lineTo(l.w*sx/2, 0); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${12/state.view.zoom}px Inter`;
    ctx.fillText(isOrigin ? "ORIGIN" : "FRONT", -l.w*sx/2, -8/state.view.zoom);
    ctx.restore();
  });

  // Lanes
  state.lanes.forEach(l => {
    ctx.save(); ctx.translate(l.cx*sx, l.cy*sy); ctx.rotate(l.angle || 0);
    const isA = state.activeLane === l;
    ctx.strokeStyle = isA ? '#ffc107' : 'rgba(88,166,255,0.4)';
    ctx.lineWidth = isA ? 4/state.view.zoom : 2/state.view.zoom;
    ctx.strokeRect(-(l.w*sx)/2, -(l.h*sy)/2, l.w*sx, l.h*sy);
    ctx.restore();
  });

  // ROI Rect
  if (state.roiRect) {
    ctx.strokeStyle = '#f0883e'; ctx.lineWidth = 2/state.view.zoom;
    ctx.setLineDash([5/state.view.zoom, 5/state.view.zoom]);
    ctx.strokeRect(state.roiRect.x*sx, state.roiRect.y*sy, state.roiRect.w*sx, state.roiRect.h*sy);
    ctx.fillStyle = 'rgba(240,136,62,0.1)';
    ctx.fillRect(state.roiRect.x*sx, state.roiRect.y*sy, state.roiRect.w*sx, state.roiRect.h*sy);
    ctx.setLineDash([]);
  }

  ctx.restore(); ctx.restore();
}

// ── Debug Overlay ─────────────────────────────────────────────────────────────
function dbg(msg) {
  let el = document.getElementById('debug-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'debug-overlay';
    el.style.cssText = 'position:fixed;bottom:80px;left:0;right:0;background:rgba(0,0,0,0.85);color:#0f0;font-size:11px;font-family:monospace;padding:8px;z-index:9999;max-height:200px;overflow-y:auto;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.innerHTML += '<div>[' + new Date().toISOString().slice(11,19) + '] ' + msg + '</div>';
  el.scrollTop = el.scrollHeight;
  console.log('[DBG]', msg);
}

// ── Upload Logic ──────────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) { dbg('handleFile: no file'); return; }
  dbg('handleFile: ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB, ' + file.type + ')');
  try {
    const reader = new FileReader();
    reader.onload = function(e) {
      dbg('FileReader.onload fired');
      try {
        const img = new Image();
        img.onload = function() {
          dbg('img.onload: ' + img.naturalWidth + 'x' + img.naturalHeight);
          try {
            const s = Math.min(1, 1000/Math.max(img.naturalWidth, img.naturalHeight, 1));
            state.imgEl = img;
            state.imgW = Math.round(img.naturalWidth * s);
            state.imgH = Math.round(img.naturalHeight * s);
            dbg('scaled to ' + state.imgW + 'x' + state.imgH);
            const c = document.createElement('canvas');
            c.width = state.imgW; c.height = state.imgH;
            c.getContext('2d').drawImage(img, 0, 0, state.imgW, state.imgH);
            state.imgB64 = c.toDataURL('image/jpeg', 0.9);
            dbg('imgB64 ready, len=' + state.imgB64.length);
            var prompt = document.getElementById('upload-prompt');
            var container = document.getElementById('canvas-container');
            dbg('prompt=' + !!prompt + ' container=' + !!container);
            if (prompt) prompt.style.display = 'none';
            if (container) container.style.display = 'flex';
            dbg('window: ' + window.innerWidth + 'x' + window.innerHeight);
            try { render(); dbg('render() OK'); }
            catch(re) { dbg('render() ERROR: ' + re.message); }
          } catch(err) { dbg('ERROR img.onload body: ' + err.message); alert(err.message); }
        };
        img.onerror = function() { dbg('img.onerror fired'); alert('Browser could not decode this image type. Try JPG or PNG.'); };
        dbg('setting img.src');
        img.src = e.target.result;
      } catch(err) { dbg('ERROR after onload: ' + err.message); }
    };
    reader.onerror = function(err) { dbg('FileReader.onerror: ' + err); alert('File read error'); };
    reader.readAsDataURL(file);
    dbg('readAsDataURL called');
  } catch(err) { dbg('FATAL: ' + err.message); alert('Fatal: ' + err.message); }
}

// Native HTML <label> elements handle opening the file picker now.
dbg('Attaching file input listeners');

UI.fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) {
    handleFile(e.target.files[0]);
  }
  setTimeout(() => { e.target.value = ''; }, 1000);
});

// Camera capture input
const cameraInput = $('camera-input');
if (cameraInput) {
  cameraInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) {
      handleFile(e.target.files[0]);
    }
    setTimeout(() => { e.target.value = ''; }, 1000);
  });
}

// ── Tools & Interaction Logic ─────────────────────────────────────────────────
const cv = $('canvas-main');

function handlePointerDown(e) {
    state.isPanning = false; // reset
    const p = getPos(e, cv); state.dragStart = p;
    state.mStart = { x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY };

    if (state.activeTool === 'select' || state.activeTool === 'pan') {
        const mHit = state.spottingMarks.find(m => Math.sqrt((p.x-m.x)**2 + (p.y-m.y)**2) < 12);
        if (mHit) { state.activeMark = mHit; state.editingField = 'move-mark'; }
        else {
            state.activeMark = null; state.activeLine = null; state.activeLane = null;
            if (state.activeTool === 'pan') state.isPanning = true;
            state.viewStart = { ...state.view };
        }
    } else if (state.activeTool === 'roi') { 
        state.roiRect = { x: p.x, y: p.y, w: 1, h: 1 }; 
    } else if (state.activeTool === 'line') {
        const nl = { cx: p.x, cy: p.y, w: 1, angle: 0 }; 
        state.lines.push(nl); state.activeLine = nl; state.editingField = 'resize-line';
    } else if (state.activeTool === 'spotting') {
        state.spottingMarks.push({ x: p.x, y: p.y });
    } else if (state.activeTool === 'rotate_img') { 
        state.isRotating = true; state.rotateStart = state.imageRotation; 
    }
    render();
}

function handlePointerMove(e) {
    if (!state.dragStart) return;
    const p = getPos(e, cv);
    const cx = e.clientX || e.touches[0].clientX;
    const cy = e.clientY || e.touches[0].clientY;
    
    if (state.isPanning) {
        e.preventDefault();
        state.view.dx = state.viewStart.dx + (cx - state.mStart.x);
        state.view.dy = state.viewStart.dy + (cy - state.mStart.y);
    } else if (state.isRotating) { 
        state.imageRotation = state.rotateStart + (cx - state.mStart.x)*0.002; 
    } else if (state.editingField === 'move-mark') {
        state.activeMark.x = p.x; state.activeMark.y = p.y;
    } else if (state.editingField === 'resize-line') { 
        const sx = cv.width / state.imgW;
        const pos = getImageCanvasPos(state.activeLine.cx, state.activeLine.cy, sx, sx);
        state.activeLine.w = Math.abs(p.cx - pos.cx) * 2 / sx; 
    } else if (state.roiRect && state.activeTool === 'roi') { 
        state.roiRect.w = p.x-state.roiRect.x; state.roiRect.h = p.y-state.roiRect.y; 
    }
    render();
}

function handlePointerUp() {
    state.dragStart = null; state.isPanning = false; state.isRotating = false; state.editingField = null; 
}

cv.addEventListener('pointerdown', handlePointerDown);
cv.addEventListener('pointermove', handlePointerMove);
cv.addEventListener('pointerup', handlePointerUp);
cv.addEventListener('pointerleave', handlePointerUp);

// Also keep touch listeners for fallback on older mobile browsers
cv.addEventListener('touchstart', handlePointerDown, {passive: false});
cv.addEventListener('touchmove', handlePointerMove, {passive: false});
cv.addEventListener('touchend', handlePointerUp);

function findLanes() {
    if (state.lines.length < 2) {
        alert("Please draw at least 2 lines (Origin and Front) using the 'Lines' tool before finding lanes.");
        return;
    }
    if (state.spottingMarks.length < 1) {
        alert("Please place at least 1 spotting mark using the 'Marks' tool to define lane positions.");
        return;
    }
    state.lanes = [];
    const pool = [...state.lines];
    const pairs = [];
    const sx = cv.width / state.imgW;
    
    while (pool.length >= 2) {
        const l1 = pool.shift();
        const l1_pos = getImageCanvasPos(l1.cx, l1.cy, sx, sx);
        let bestIdx = -1; let minDist = Infinity;
        for (let i=0; i<pool.length; i++) {
            const pi_pos = getImageCanvasPos(pool[i].cx, pool[i].cy, sx, sx);
            const d = Math.sqrt((l1_pos.cx-pi_pos.cx)**2 + (l1_pos.cy-pi_pos.cy)**2);
            if (d < minDist && Math.abs(l1_pos.cy - pi_pos.cy) > 50 * sx) { minDist = d; bestIdx = i; }
        }
        if (bestIdx !== -1) {
            const l2 = pool.splice(bestIdx, 1)[0];
            const l2_pos = getImageCanvasPos(l2.cx, l2.cy, sx, sx);
            const [f, o] = l1_pos.cy < l2_pos.cy ? [l1, l2] : [l2, l1];
            pairs.push({ o, f, id: pairs.length + 1, w: Math.max(o.w, f.w) });
        }
    }

    state.spottingMarks.forEach((m, mi) => {
        const m_pos = getImageCanvasPos(m.x, m.y, sx, sx);
        const bestPair = pairs[0]; // Simplified for mobile initial port
        if (!bestPair) return;
        
        const {o, f} = bestPair;
        const o_pos = getImageCanvasPos(o.cx, o.cy, sx, sx);
        const f_pos = getImageCanvasPos(f.cx, f.cy, sx, sx);
        
        const midCanvasX = m_pos.cx;
        const midCanvasY = (o_pos.cy + f_pos.cy) / 2;
        const hImg = Math.abs(o_pos.cy - f_pos.cy) * 1.10 / sx;
        const laneWCanvas = 35 * sx;

        const icx = (state.imgW*sx)/2; const icy = (state.imgH*sx)/2;
        const ca = Math.cos(-state.imageRotation); const sa = Math.sin(-state.imageRotation);
        const rx = (midCanvasX - icx) * ca - (midCanvasY - icy) * sa;
        const ry = (midCanvasX - icx) * sa + (midCanvasY - icy) * ca;
        
        state.lanes.push({ 
            id: bestPair.id + "." + (mi + 1), 
            cx: (rx + icx) / sx, cy: (ry + icy) / sx, 
            w: laneWCanvas / sx, h: hImg, 
            angle: -state.imageRotation, profile: [], peaks: [] 
        });
    });

    if (state.lanes.length > 0) { 
        state.activeLane = state.lanes[0]; 
        switchTab('tab-profile');
        generateProfiles();
    }
    render();
}

async function generateProfiles() {
    if (state.lanes.length === 0 || !state.imgB64) return;
    
    const sens = $('peak-prominence') ? parseInt($('peak-prominence').value) : 40;
    const dist = $('peak-distance') ? parseInt($('peak-distance').value) : 8;
    const thres = $('peak-threshold') ? parseInt($('peak-threshold').value) : 50;
    
    try {
        const res = await fetch('/generate_profiles', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                image: state.imgB64, lanes: state.lanes, 
                peak_detection: true, 
                peak_prominence: sens, peak_distance: dist, peak_threshold: thres,
                smooth_sigma: 1.5, polarity_mode: state.polarityMode
            })
        });
        const data = await res.json();
        if (data.results) {
            data.results.forEach(r => { 
                const l = state.lanes.find(ln => ln.id === r.id); 
                if (l) { l.profile = r.profile; l.peaks = r.peaks || []; }
            });
            renderDensitograms();
            render();
        }
    } catch(e) { console.error("Error fetching profiles:", e); }
}
window.generateProfiles = generateProfiles;

function renderDensitograms() {
    const list = $('densitogram-list');
    if (!list) return;
    list.style.display = 'block';
    
    list.innerHTML = state.lanes.map(l => {
        return \`<div style="padding:16px; border-bottom:1px solid rgba(255,255,255,0.1)">
            <h4>Lane \${l.id} - \${l.peaks.length} Peaks</h4>
            <div style="font-size:0.8rem; color:#888;">Profiles ready. Table populated.</div>
        </div>\`;
    }).join('');

    renderTable();
}

function renderTable() {
    const tbody = $('table-body');
    const container = document.querySelector('.data-table-container');
    if (!tbody || !container) return;
    
    container.style.display = 'block';
    tbody.innerHTML = '';
    
    state.lanes.forEach(l => {
        (l.peaks || []).forEach((pk, i) => {
            tbody.innerHTML += \`
                <tr>
                    <td>\${l.id}.\${i+1}</td>
                    <td>\${pk.rf.toFixed(2)}</td>
                    <td>\${pk.height.toFixed(1)}</td>
                    <td>\${pk.area.toFixed(1)}</td>
                </tr>
            \`;
        });
    });
}

} // End of initApp

// Expose generateProfiles for the dynamically created sliders
window.generateProfiles = null; 

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { initApp(); } catch(e) { dbg('CRASH in initApp: ' + e.message); }
  });
} else {
  try { initApp(); } catch(e) { dbg('CRASH in initApp: ' + e.message); }
}
