// Service Worker Registration & Auto-Update Logic
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered');
      reg.update();
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New update available! Reloading...');
          }
        });
      });
    }).catch(e => console.log('SW fail: ', e));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload(true);
      }
    });
  });
}

const $ = id => document.getElementById(id);

// ── App Scope ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

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
        <input type="range" id="peak-prominence" min="1" max="80" value="40">
      </div>
      <div class="slider-group" style="margin-bottom: 16px;">
        <div class="slider-header"><label>Resolution</label><span id="val-res">8</span></div>
        <input type="range" id="peak-distance" min="1" max="100" value="8">
      </div>
      <div class="slider-group">
        <div class="slider-header"><label>Width %</label><span id="val-width">50</span></div>
        <input type="range" id="peak-threshold" min="5" max="95" value="50">
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
  if (canvas.width !== wrap.clientWidth || canvas.height !== wrap.clientHeight) {
      canvas.width = wrap.clientWidth; 
      canvas.height = wrap.clientHeight;
  }
  const ctx = canvas.getContext('2d');
  
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

// ── Upload Logic ──────────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return; 
  const reader = new FileReader(); 
  reader.onload = e => {
    const img = new Image(); img.onload = () => {
      state.imgEl = img; const s = Math.min(1, 1000/Math.max(img.naturalWidth, img.naturalHeight));
      state.imgW = Math.round(img.naturalWidth*s); state.imgH = Math.round(img.naturalHeight*s);
      const c = document.createElement('canvas'); c.width=state.imgW; c.height=state.imgH;
      c.getContext('2d').drawImage(img,0,0,state.imgW,state.imgH); 
      state.imgB64 = c.toDataURL('image/jpeg', 0.9);
      
      $('upload-prompt').style.display='none'; 
      $('canvas-container').style.display='flex';
      render();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

UI.btnUpload.addEventListener('click', () => UI.fileInput.click());
const uploadPromptEl = $('upload-prompt');
if (uploadPromptEl) {
  uploadPromptEl.addEventListener('click', () => UI.fileInput.click());
  uploadPromptEl.style.cursor = 'pointer';
}

UI.fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
});

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
    try {
        const res = await fetch('/generate_profiles', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                image: state.imgB64, lanes: state.lanes, 
                peak_detection: true, 
                peak_prominence: 40, peak_distance: 8, peak_threshold: 50,
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

}); // End of DOMContentLoaded
