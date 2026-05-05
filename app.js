// --- Global Constants & State ---
const $ = id => document.getElementById(id);

const state = {
    view: 'landing', // 'landing', 'workspace'
    activeTab: 'tab-image',
    img: null, imgW: 0, imgH: 0, imgB64: null,
    
    // Canvas interaction
    activeTool: 'pan',
    zoom: 1, panX: 0, panY: 0,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Annotations
    lines: [],         // { cx, cy, w, angle }
    marks: [],         // { x, y }
    lanes: [],         // { id, cx, cy, w, h, angle, profile, peaks }
    
    // History
    history: [],
    
    // Settings
    settings: {
        peakProminence: 60,
        peakDistance: 5,
        peakThreshold: 30
    }
};

let isInit = false;
function initApp() {
    if (isInit) return;
    isInit = true;
    dbg('App Initialized');

    attachEventListeners();
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const canvas = $('canvas-main');
    if (canvas) {
        state.ctx = canvas.getContext('2d');
    }
    
    // Resize Observer for canvas
    if (window.ResizeObserver) {
        new ResizeObserver(() => {
            if (state.img) handleResize();
        }).observe($('canvas-container'));
    }
}

function dbg(msg) {
    const el = $('debug-overlay');
    if (!el) return;
    el.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
    console.log('[DEBUG]', msg);
}

// --- View Management ---
function switchView(viewId) {
    state.view = viewId;
    if (viewId === 'workspace') {
        $('view-landing').classList.remove('active');
        // Default to Image Tab
        switchTab('tab-image');
    } else {
        $('view-landing').classList.add('active');
    }
}

function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.view').forEach(v => {
        if (v.id === 'view-landing') return;
        v.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    
    $(tabId).classList.add('active');
    document.querySelector(`.nav-tab[data-target="${tabId}"]`).classList.add('active');
    
    if (tabId === 'tab-image') {
        setTimeout(handleResize, 50); // Ensure layout is stable
    }
    
    // Update Header Title
    const titles = { 'tab-image': 'IMAGE WORKSPACE', 'tab-profile': 'DENSITOGRAMS', 'tab-table': 'QUANTIFICATION' };
    $('header-title').innerHTML = titles[tabId] || 'TLC ANALYZER';
}

// --- Event Listeners ---
function attachEventListeners() {
    $('btn-camera').onclick = () => $('camera-input').click();
    $('btn-upload-trigger').onclick = () => $('file-input').click();
    
    $('file-input').onchange = (e) => {
        if (e.target.files && e.target.files[0]) handleImageUpload(e.target.files[0]);
        e.target.value = '';
    };
    $('camera-input').onchange = (e) => {
        if (e.target.files && e.target.files[0]) handleImageUpload(e.target.files[0]);
        e.target.value = '';
    };

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.onclick = () => switchTab(tab.dataset.target);
    });

    document.querySelectorAll('.toolbar .tool-btn[data-tool]').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.toolbar .tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTool = btn.dataset.tool;
        };
    });

    $('btn-analyze').onclick = runAnalysis;
    $('btn-undo').onclick = undo;
    $('btn-settings').onclick = toggleSettings;
    $('overlay').onclick = toggleSettings;

    const cv = $('canvas-main');
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointerleave', onPointerUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    
    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
}

function handleResize() {
    const canvas = $('canvas-main');
    const container = $('canvas-container');
    if (!canvas || !container || container.clientWidth === 0) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    state.ctx = canvas.getContext('2d');
    
    if (state.img) render();
}

// --- Image Handling ---
async function handleImageUpload(file) {
    if (!file) return;
    dbg(`Uploading: ${file.name}`);
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => processImage(img);
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function processImage(img) {
    pushHistory();
    const MAX_DIM = 1200;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const ratio = Math.min(1, MAX_DIM / Math.max(w, h));
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    off.getContext('2d').drawImage(img, 0, 0, w, h);
    
    state.img = off;
    state.imgW = w;
    state.imgH = h;
    state.imgB64 = off.toDataURL('image/jpeg', 0.85);
    
    switchView('workspace');
    
    requestAnimationFrame(() => {
        handleResize();
        const cv = $('canvas-main');
        const scale = Math.min(cv.width / w, cv.height / h) * 0.9;
        state.zoom = scale || 1;
        state.panX = (cv.width - w * state.zoom) / 2;
        state.panY = (cv.height - h * state.zoom) / 2;
        render();
    });
}

// --- Interaction Logic ---
function getCanvasPoint(e) {
    const rect = $('canvas-main').getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return {
        x: (x - state.panX) / state.zoom,
        y: (y - state.panY) / state.zoom,
        rawX: x, rawY: y
    };
}

function onPointerDown(e) {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    const p = getCanvasPoint(e);
    
    if (state.activeTool === 'line') {
        pushHistory();
        const nl = { cx: p.x, cy: p.y, w: 100, angle: 0 };
        state.lines.push(nl);
        state.activeLine = nl;
    } else if (state.activeTool === 'spotting') {
        pushHistory();
        let ty = p.y;
        if (state.lines.length > 0) {
            const nearest = state.lines.reduce((a, b) => Math.abs(b.cy - p.y) < Math.abs(a.cy - p.y) ? b : a);
            if (Math.abs(nearest.cy - p.y) < 60) ty = nearest.cy;
        }
        state.marks.push({ x: p.x, y: ty });
    } else if (state.activeTool === 'roi') {
        state.roiStart = p;
        state.roiRect = { x: p.x, y: p.y, w: 0, h: 0 };
    }
    render();
}

function onPointerMove(e) {
    if (!state.isDragging || (e.pointerType === 'touch' && !e.isPrimary)) return;
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    
    const p = getCanvasPoint(e);
    if (state.activeTool === 'pan') {
        state.panX += dx; state.panY += dy;
    } else if (state.activeTool === 'line' && state.activeLine) {
        state.activeLine.w = Math.abs(p.x - state.activeLine.cx) * 2;
    } else if (state.activeTool === 'roi' && state.roiRect) {
        state.roiRect.w = p.x - state.roiStart.x;
        state.roiRect.h = p.y - state.roiStart.y;
    }
    render();
}

function onPointerUp() {
    state.isDragging = false;
    if (state.activeTool === 'roi' && state.roiRect) {
        if (Math.abs(state.roiRect.w) > 20) cropImage(state.roiRect);
        state.roiRect = null;
    }
    state.activeLine = null;
    render();
}

function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const p = getCanvasPoint(e);
    const nz = state.zoom * delta;
    if (nz > 0.1 && nz < 20) {
        state.panX = p.rawX - p.x * nz;
        state.panY = p.rawY - p.y * nz;
        state.zoom = nz;
        render();
    }
}

let lastPinchDist = 0;
function onTouchStart(e) {
    if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
}
function onTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        const delta = dist / lastPinchDist;
        const p = { rawX: (e.touches[0].pageX + e.touches[1].pageX)/2, rawY: (e.touches[0].pageY + e.touches[1].pageY)/2 };
        const rect = $('canvas-main').getBoundingClientRect();
        p.rawX -= rect.left; p.rawY -= rect.top;
        const cp = { x: (p.rawX - state.panX) / state.zoom, y: (p.rawY - state.panY) / state.zoom };
        const nz = state.zoom * delta;
        if (nz > 0.1 && nz < 20) {
            state.panX = p.rawX - cp.x * nz;
            state.panY = p.rawY - cp.y * nz;
            state.zoom = nz;
            render();
        }
        lastPinchDist = dist;
    }
}

// --- Logic Operations ---
function cropImage(r) {
    const x = r.w > 0 ? r.x : r.x + r.w;
    const y = r.h > 0 ? r.y : r.y + r.h;
    const w = Math.abs(r.w);
    const h = Math.abs(r.h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(state.img, x, y, w, h, 0, 0, w, h);
    state.img = c; state.imgW = w; state.imgH = h;
    state.imgB64 = c.toDataURL('image/jpeg', 0.85);
    state.lines = []; state.marks = []; state.lanes = [];
    processImage(c); // Re-center and reset
}

async function runAnalysis() {
    if (state.lines.length < 2) { alert('Draw at least 2 lines (Origin/Front)'); return; }
    if (state.marks.length < 1) { alert('Place at least one mark'); return; }
    
    dbg('Coupling Lines...');
    const pool = [...state.lines].sort((a,b) => a.cy - b.cy);
    const pairs = [];
    while (pool.length >= 2) {
        const front = pool.shift();
        const origin = pool.pop(); // Take furthest
        pairs.push({ front, origin });
    }
    
    state.lanes = [];
    state.marks.forEach((m, idx) => {
        const pair = pairs.reduce((a, b) => {
            const distA = Math.min(Math.abs(m.y - a.front.cy), Math.abs(m.y - a.origin.cy));
            const distB = Math.min(Math.abs(m.y - b.front.cy), Math.abs(m.y - b.origin.cy));
            return distA < distB ? a : b;
        });
        const h = Math.abs(pair.origin.cy - pair.front.cy) * 1.1;
        state.lanes.push({ id: idx+1, cx: m.x, cy: (pair.front.cy + pair.origin.cy)/2, w: 40, h, angle: 0 });
    });
    
    render();
    dbg('Fetching Analysis...');
    try {
        const res = await fetch('/api/generate_profiles', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                image: state.imgB64, lanes: state.lanes,
                peak_detection: true, 
                peak_prominence: state.settings.peakProminence,
                peak_distance: state.settings.peakDistance,
                peak_threshold: state.settings.peakThreshold
            })
        });
        const data = await res.json();
        if (data.results) {
            state.lanes.forEach(l => {
                const r = data.results.find(res => res.id === l.id);
                if (r) { l.profile = r.profile; l.peaks = r.peaks; }
            });
            showResults();
        }
    } catch(e) { dbg('Analysis Error: ' + e.message); }
}

function showResults() {
    renderProfiles();
    renderTable();
    switchTab('tab-profile');
    render(); // Draw bands on image
}

function renderProfiles() {
    const container = $('res-profiles');
    container.innerHTML = '';
    state.lanes.forEach(l => {
        const card = document.createElement('div');
        card.className = 'hero-card';
        card.style.maxWidth = 'none'; card.style.marginBottom = '15px'; card.style.padding = '15px';
        const canvas = document.createElement('canvas');
        canvas.width = container.clientWidth - 50; canvas.height = 120;
        card.innerHTML = `<h3>Lane ${l.id} - Densitogram</h3>`;
        card.appendChild(canvas);
        drawProfile(canvas, l.profile, l.peaks);
        container.appendChild(card);
    });
}

function renderTable() {
    const container = $('res-table');
    let html = `<table class="data-table"><thead><tr><th>Peak</th><th>Rf</th><th>Height</th><th>Area</th></tr></thead><tbody>`;
    state.lanes.forEach(l => {
        (l.peaks || []).forEach((p, idx) => {
            html += `<tr><td>${l.id}.${idx+1}</td><td>${p.rf.toFixed(3)}</td><td>${p.height.toFixed(1)}</td><td>${p.area.toFixed(0)}</td></tr>`;
        });
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function drawProfile(cv, prof, peaks) {
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const max = Math.max(...prof, 1);
    const step = w / prof.length;
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.beginPath();
    prof.forEach((v, i) => {
        const y = h - (v/max)*(h-20) - 10;
        if (i===0) ctx.moveTo(0, y); else ctx.lineTo(i*step, y);
    });
    ctx.stroke();
    peaks.forEach(p => {
        const x = p.idx * step;
        const y = h - (prof[p.idx]/max)*(h-20) - 10;
        ctx.fillStyle = '#f0883e'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '10px Inter'; ctx.fillText(p.rf.toFixed(2), x-10, y-10);
    });
}

// --- Main Rendering ---
function render() {
    const ctx = state.ctx; if (!ctx || !state.img) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.drawImage(state.img, 0, 0);
    
    // Lines
    const lines = [...state.lines].sort((a,b) => a.cy - b.cy);
    lines.forEach((l, i) => {
        const isS = state.activeLine === l;
        const isOrigin = lines.length > 1 && i === lines.length-1;
        const isFront = lines.length > 1 && i === 0;
        ctx.strokeStyle = isS ? '#ffc107' : (isOrigin ? '#f0883e' : (isFront ? '#238636' : '#58a6ff'));
        ctx.lineWidth = 4/state.zoom; ctx.beginPath();
        ctx.moveTo(l.cx - l.w/2, l.cy); ctx.lineTo(l.cx + l.w/2, l.cy); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${12/state.zoom}px Inter`;
        ctx.fillText(isOrigin ? "ORIGIN" : (isFront ? "FRONT" : "LINE"), l.cx - l.w/2, l.cy - 5/state.zoom);
    });

    // Marks
    state.marks.forEach(m => {
        ctx.fillStyle = '#58a6ff'; ctx.beginPath(); ctx.arc(m.x, m.y, 5/state.zoom, 0, 7); ctx.fill();
    });

    // Lanes & Bands (Bands on image!)
    state.lanes.forEach(l => {
        ctx.strokeStyle = 'rgba(88,166,255,0.3)'; ctx.lineWidth = 1/state.zoom;
        ctx.strokeRect(l.cx - l.w/2, l.cy - l.h/2, l.w, l.h);
        // Draw Bands
        if (l.peaks) {
            l.peaks.forEach(p => {
                const fy = l.cy - l.h/2; // Top of lane
                const oy = l.cy + l.h/2; // Bottom of lane
                // Rf = (OriginY - PeakY) / (OriginY - FrontY)
                // PeakY = OriginY - Rf * (OriginY - FrontY)
                const py = oy - p.rf * (oy - fy);
                ctx.strokeStyle = 'rgba(240, 136, 62, 0.8)';
                ctx.lineWidth = 2/state.zoom; ctx.beginPath();
                ctx.moveTo(l.cx - l.w/2.5, py); ctx.lineTo(l.cx + l.w/2.5, py); ctx.stroke();
            });
        }
    });

    if (state.roiRect) {
        ctx.strokeStyle = '#f0883e'; ctx.setLineDash([5/state.zoom]);
        ctx.strokeRect(state.roiRect.x, state.roiRect.y, state.roiRect.w, state.roiRect.h);
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function pushHistory() {
    state.history.push({ lines: JSON.parse(JSON.stringify(state.lines)), marks: JSON.parse(JSON.stringify(state.marks)), imgB64: state.imgB64 });
    if (state.history.length > 20) state.history.shift();
}
function undo() {
    if (state.history.length === 0) return;
    const s = state.history.pop();
    state.lines = s.lines; state.marks = s.marks;
    if (s.imgB64 !== state.imgB64) {
        const img = new Image();
        img.onload = () => {
            const off = document.createElement('canvas');
            off.width = img.width; off.height = img.height;
            off.getContext('2d').drawImage(img, 0, 0);
            state.img = off; state.imgB64 = s.imgB64; render();
        };
        img.src = s.imgB64;
    } else render();
}

function toggleSettings() {
    const d = $('drawer'), o = $('overlay');
    if (d.classList.contains('open')) { d.classList.remove('open'); o.classList.remove('active'); }
    else { renderSettings(); d.classList.add('open'); o.classList.add('active'); }
}
function renderSettings() {
    $('drawer-content').innerHTML = `
        <h3>Quantification Settings</h3>
        <div class="setting-group"><label>Sensitivity <span>${state.settings.peakProminence}</span></label><input type="range" min="1" max="80" value="${state.settings.peakProminence}" oninput="state.settings.peakProminence=this.value;this.previousElementSibling.querySelector('span').innerText=this.value"></div>
        <div class="setting-group"><label>Resolution <span>${state.settings.peakDistance}</span></label><input type="range" min="1" max="50" value="${state.settings.peakDistance}" oninput="state.settings.peakDistance=this.value;this.previousElementSibling.querySelector('span').innerText=this.value"></div>
        <button class="btn btn-primary" style="width:100%" onclick="toggleSettings(); runAnalysis();">Apply & Re-Run</button>
    `;
}

document.addEventListener('DOMContentLoaded', initApp);
