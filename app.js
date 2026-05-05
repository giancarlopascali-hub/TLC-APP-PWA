// --- Global Constants & State ---
const $ = id => document.getElementById(id);

const state = {
    view: 'landing',
    img: null,
    imgW: 0,
    imgH: 0,
    imgB64: null,
    
    // Canvas interaction
    activeTool: 'pan',
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Annotations
    lines: [],         // { cx, cy, w, angle }
    marks: [],         // { x, y }
    lanes: [],         // { id, cx, cy, w, h, angle, profile, peaks }
    
    // Selection
    activeLine: null,
    activeMark: null,
    activeLane: null,
    
    // History
    history: [],
    
    // Settings
    settings: {
        peakProminence: 60,
        peakDistance: 5,
        peakThreshold: 30
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

let isInit = false;
function initApp() {
    if (isInit) return;
    isInit = true;
    dbg('App Initialized');

    // Register Service Worker disabled for debugging
    /*
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => dbg('SW Registered'))
            .catch(err => dbg('SW Register Fail: ' + err.message));
    }
    */

    attachEventListeners();
    handleResize();
    window.addEventListener('resize', handleResize);
    
    // Ensure canvas is ready
    const canvas = $('canvas-main');
    if (canvas) {
        state.ctx = canvas.getContext('2d');
        // PC fix: force initial layout
        canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
        canvas.height = canvas.parentElement.clientHeight || 400;
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
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(`view-${viewId}`).classList.add('active');
    dbg(`Switched to view: ${viewId}`);
    
    if (viewId === 'workspace') {
        render();
    }
}

// --- Event Listeners ---
function attachEventListeners() {
    $('btn-camera').onclick = () => $('camera-input').click();
    $('btn-upload-trigger').onclick = () => $('file-input').click();
    
    $('file-input').onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageUpload(e.target.files[0]);
        }
        e.target.value = '';
    };
    $('camera-input').onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageUpload(e.target.files[0]);
        }
        e.target.value = '';
    };
    
    $('btn-back-to-canvas').onclick = () => switchView('workspace');

    // Tool switching
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

    // Tab Logic
    document.querySelectorAll('.res-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.res-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            $(tab.dataset.resTarget).classList.add('active');
        };
    });

    // Canvas Events
    const cv = $('canvas-main');
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointerleave', onPointerUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    
    // Pinch to Zoom
    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
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
        const p = { 
            rawX: (e.touches[0].pageX + e.touches[1].pageX) / 2,
            rawY: (e.touches[0].pageY + e.touches[1].pageY) / 2
        };
        const rect = $('canvas-main').getBoundingClientRect();
        p.rawX -= rect.left; p.rawY -= rect.top;
        
        const canvasP = {
            x: (p.rawX - state.panX) / state.zoom,
            y: (p.rawY - state.panY) / state.zoom
        };

        const newZoom = state.zoom * delta;
        if (newZoom > 0.1 && newZoom < 20) {
            state.panX = p.rawX - canvasP.x * newZoom;
            state.panY = p.rawY - canvasP.y * newZoom;
            state.zoom = newZoom;
            render();
        }
        lastPinchDist = dist;
    }
}

function handleResize() {
    const canvas = $('canvas-main');
    const container = $('canvas-container');
    if (!canvas || !container) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    state.ctx = canvas.getContext('2d');
    
    if (state.img) render();
}

// --- Image Handling ---
async function handleImageUpload(file) {
    if (!file) return;
    dbg(`Processing file: ${file.name}`);
    
    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                dbg(`Image Loaded: ${img.width}x${img.height}`);
                processImage(img);
            };
            img.onerror = () => {
                dbg('Image load error');
                alert('Could not load image. Try another format.');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } catch (err) {
        dbg(`Upload error: ${err.message}`);
    }
}

function processImage(img) {
    dbg(`Processing image... ${img.width}x${img.height}`);
    try {
        pushHistory(); // Save landing state
        
        // Scaling for performance
        const MAX_DIM = 1200;
        let w = img.width;
        let h = img.height;
        
        if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w *= ratio;
            h *= ratio;
        }
        
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const ctx = offCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        
        state.img = offCanvas;
        state.imgW = w;
        state.imgH = h;
        state.imgB64 = offCanvas.toDataURL('image/jpeg', 0.85);
        
        // Switch view FIRST
        switchView('workspace');
        
        // Wait a frame for the layout to settle (Crucial for PC browsers)
        requestAnimationFrame(() => {
            handleResize(); 
            
            const cv = $('canvas-main');
            // Force context check
            state.ctx = cv.getContext('2d');
            
            const targetW = cv.width || cv.parentElement.clientWidth || window.innerWidth;
            const targetH = cv.height || cv.parentElement.clientHeight || 400;

            cv.width = targetW;
            cv.height = targetH;

            const scale = Math.min(targetW / w, targetH / h) * 0.9;
            state.zoom = scale || 1;
            state.panX = (targetW - w * state.zoom) / 2;
            state.panY = (targetH - h * state.zoom) / 2;
            
            dbg('Image Ready. Rendering...');
            render();
        });
    } catch (err) {
        dbg(`Process Error: ${err.message}`);
        alert(`Error processing image: ${err.message}`);
    }
}

// --- Rendering ---
function render() {
    const ctx = state.ctx;
    if (!ctx || !state.img) return;
    
    const canvas = $('canvas-main');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    
    // Draw Image
    ctx.drawImage(state.img, 0, 0);
    
    // Draw Annotations
    renderLines(ctx);
    renderMarks(ctx);
    renderLanes(ctx);
    
    // Draw ROI
    if (state.roiRect) {
        ctx.strokeStyle = '#f0883e';
        ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
        ctx.lineWidth = 2 / state.zoom;
        ctx.strokeRect(state.roiRect.x, state.roiRect.y, state.roiRect.w, state.roiRect.h);
        ctx.fillStyle = 'rgba(240, 136, 62, 0.1)';
        ctx.fillRect(state.roiRect.x, state.roiRect.y, state.roiRect.w, state.roiRect.h);
        ctx.setLineDash([]);
    }
    
    ctx.restore();
}

function renderLines(ctx) {
    const lines = [...state.lines].sort((a,b) => a.cy - b.cy);
    lines.forEach((l, idx) => {
        const isS = state.activeLine === l;
        const isOrigin = lines.length > 1 && idx === lines.length - 1;
        const isFront = lines.length > 1 && idx === 0;
        
        ctx.save();
        ctx.translate(l.cx, l.cy);
        ctx.rotate(l.angle || 0);
        
        ctx.strokeStyle = isS ? '#ffc107' : (isOrigin ? '#f0883e' : (isFront ? '#238636' : '#58a6ff'));
        ctx.lineWidth = 4 / state.zoom;
        ctx.beginPath();
        ctx.moveTo(-l.w / 2, 0);
        ctx.lineTo(l.w / 2, 0);
        ctx.stroke();
        
        // Label
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = `bold ${14/state.zoom}px Inter`;
        ctx.textAlign = 'center';
        let label = lines.length > 1 ? (isOrigin ? "ORIGIN" : (isFront ? "FRONT" : `LINE ${idx+1}`)) : "LINE";
        ctx.fillText(label, 0, -10/state.zoom);
        
        ctx.restore();
    });
}

function renderMarks(ctx) {
    state.marks.forEach(m => {
        ctx.fillStyle = state.activeMark === m ? '#ffc107' : '#58a6ff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 6 / state.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / state.zoom;
        ctx.stroke();
    });
}

function renderLanes(ctx) {
    state.lanes.forEach(l => {
        ctx.save();
        ctx.translate(l.cx, l.cy);
        ctx.rotate(l.angle || 0);
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.4)';
        ctx.lineWidth = 2 / state.zoom;
        ctx.strokeRect(-l.w / 2, -l.h / 2, l.w, l.h);
        ctx.restore();
    });
}

// --- Interactions ---
function getCanvasPoint(e) {
    const canvas = $('canvas-main');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    
    return {
        x: (x - state.panX) / state.zoom,
        y: (y - state.panY) / state.zoom,
        rawX: x,
        rawY: y
    };
}

function onPointerDown(e) {
    if (e.pointerType === 'touch' && e.isPrimary === false) return; // Ignore secondary touches
    
    pushHistory();
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    const p = getCanvasPoint(e);
    
    if (state.activeTool === 'line') {
        const newLine = { cx: p.x, cy: p.y, w: 100, angle: 0 };
        state.lines.push(newLine);
        state.activeLine = newLine;
    } else if (state.activeTool === 'spotting') {
        // Snap to nearest line
        let targetY = p.y;
        if (state.lines.length > 0) {
            const nearestLine = state.lines.reduce((prev, curr) => 
                Math.abs(curr.cy - p.y) < Math.abs(prev.cy - p.y) ? curr : prev
            );
            if (Math.abs(nearestLine.cy - p.y) < 50) targetY = nearestLine.cy;
        }
        state.marks.push({ x: p.x, y: targetY });
    } else if (state.activeTool === 'roi') {
        state.roiStart = p;
        state.roiRect = { x: p.x, y: p.y, w: 0, h: 0 };
    }
    
    render();
}

function onPointerMove(e) {
    if (!state.isDragging) return;
    if (e.pointerType === 'touch' && e.isPrimary === false) return;

    const dx = (e.clientX - state.lastMouse.x);
    const dy = (e.clientY - state.lastMouse.y);
    state.lastMouse = { x: e.clientX, y: e.clientY };
    
    const p = getCanvasPoint(e);

    if (state.activeTool === 'pan') {
        state.panX += dx;
        state.panY += dy;
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
        // Perform Crop
        if (Math.abs(state.roiRect.w) > 10 && Math.abs(state.roiRect.h) > 10) {
            cropImage(state.roiRect);
        }
        state.roiRect = null;
    }
    state.activeLine = null;
    render();
}

function cropImage(rect) {
    dbg('Cropping Image...');
    const x = rect.w > 0 ? rect.x : rect.x + rect.w;
    const y = rect.h > 0 ? rect.y : rect.y + rect.h;
    const w = Math.abs(rect.w);
    const h = Math.abs(rect.h);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(state.img, x, y, w, h, 0, 0, w, h);
    
    state.img = canvas;
    state.imgW = w;
    state.imgH = h;
    state.imgB64 = canvas.toDataURL('image/jpeg', 0.85);
    state.lines = [];
    state.marks = [];
    state.lanes = [];
    
    handleResize();
    const scale = Math.min($('canvas-main').width / w, $('canvas-main').height / h) * 0.9;
    state.zoom = scale || 1;
    state.panX = ($('canvas-main').width - w * state.zoom) / 2;
    state.panY = ($('canvas-main').height - h * state.zoom) / 2;
    
    render();
}

function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const p = getCanvasPoint(e);
    
    const newZoom = state.zoom * delta;
    if (newZoom < 0.1 || newZoom > 20) return;
    
    state.panX = p.rawX - p.x * newZoom;
    state.panY = p.rawY - p.y * newZoom;
    state.zoom = newZoom;
    
    render();
}

// --- Analysis Logic ---
async function runAnalysis() {
    if (state.lines.length < 2) {
        alert('Please draw at least 2 lines (Origin and Front)');
        return;
    }
    if (state.marks.length < 1) {
        alert('Please place at least one spotting mark');
        return;
    }
    
    dbg('Starting Lane Detection...');
    
    // Auto-generate lanes from marks and lines
    state.lanes = [];
    const lines = [...state.lines].sort((a,b) => a.cy - b.cy);
    const top = lines[0];
    const bot = lines[lines.length-1];
    
    const h = (bot.cy - top.cy) * 1.1;
    const cy = (top.cy + bot.cy) / 2;
    
    state.marks.forEach((m, idx) => {
        state.lanes.push({
            id: idx + 1,
            cx: m.x,
            cy: cy,
            w: 40,
            h: h,
            angle: 0
        });
    });
    
    render();
    
    dbg('Fetching Profiles...');
    try {
        const res = await fetch('/api/generate_profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: state.imgB64,
                lanes: state.lanes,
                peak_detection: true,
                peak_prominence: state.settings.peakProminence,
                peak_distance: state.settings.peakDistance,
                peak_threshold: state.settings.peakThreshold
            })
        });
        
        const data = await res.json();
        if (data.results) {
            state.results = data.results;
            showResults();
        }
    } catch (err) {
        dbg(`Analysis Error: ${err.message}`);
    }
}

// --- History & Undo ---
function pushHistory() {
    const snap = {
        lines: JSON.parse(JSON.stringify(state.lines)),
        marks: JSON.parse(JSON.stringify(state.marks)),
        img: state.img,
        imgW: state.imgW,
        imgH: state.imgH,
        imgB64: state.imgB64,
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY
    };
    state.history.push(snap);
    if (state.history.length > 20) state.history.shift();
}

function undo() {
    if (state.history.length === 0) return;
    const snap = state.history.pop();
    state.lines = snap.lines;
    state.marks = snap.marks;
    state.img = snap.img;
    state.imgW = snap.imgW;
    state.imgH = snap.imgH;
    state.imgB64 = snap.imgB64;
    state.zoom = snap.zoom;
    state.panX = snap.panX;
    state.panY = snap.panY;
    render();
    dbg('Undo performed');
}

// --- Settings ---
function toggleSettings() {
    const drawer = $('drawer');
    const overlay = $('overlay');
    if (drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        overlay.classList.remove('active');
    } else {
        renderSettings();
        drawer.classList.add('open');
        overlay.classList.add('active');
    }
}

function renderSettings() {
    const content = $('drawer-content');
    content.innerHTML = `
        <h2 class="hero-title" style="font-size:1.4rem; margin-bottom:20px;">Analysis Settings</h2>
        
        <div class="setting-group">
            <label>Sensitivity <span>${state.settings.peakProminence}</span></label>
            <input type="range" min="1" max="80" value="${state.settings.peakProminence}" 
                oninput="state.settings.peakProminence = parseInt(this.value); this.previousElementSibling.querySelector('span').innerText = this.value">
        </div>
        
        <div class="setting-group">
            <label>Resolution <span>${state.settings.peakDistance}</span></label>
            <input type="range" min="1" max="100" value="${state.settings.peakDistance}" 
                oninput="state.settings.peakDistance = parseInt(this.value); this.previousElementSibling.querySelector('span').innerText = this.value">
        </div>

        <div class="setting-group">
            <label>Peak Width % <span>${state.settings.peakThreshold}</span></label>
            <input type="range" min="5" max="95" value="${state.settings.peakThreshold}" 
                oninput="state.settings.peakThreshold = parseInt(this.value); this.previousElementSibling.querySelector('span').innerText = this.value">
        </div>

        <button class="btn btn-primary" onclick="toggleSettings(); runAnalysis();" style="width:100%">Apply & Re-Run</button>
    `;
}

function showResults() {
    switchView('results');
    
    const profilesContainer = $('res-profiles');
    const tableContainer = $('res-table');
    
    profilesContainer.innerHTML = '';
    tableContainer.innerHTML = '';

    // Create Table
    let tableHtml = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Lane.Peak</th>
                    <th>Rf</th>
                    <th>Height</th>
                    <th>Area</th>
                </tr>
            </thead>
            <tbody>
    `;

    state.results.forEach(res => {
        // Render Profile Mini-Chart
        const card = document.createElement('div');
        card.className = 'hero-card';
        card.style.maxWidth = 'none';
        card.style.marginBottom = '20px';
        card.style.padding = '15px';
        
        const canvas = document.createElement('canvas');
        canvas.width = profilesContainer.clientWidth - 60;
        canvas.height = 120;
        card.innerHTML = `<h3>Lane ${res.id} - Densitogram</h3>`;
        card.appendChild(canvas);
        drawProfile(canvas, res.profile, res.peaks);
        profilesContainer.appendChild(card);

        // Add to Table
        res.peaks.forEach((p, idx) => {
            tableHtml += `
                <tr>
                    <td>${res.id}.${idx + 1}</td>
                    <td>${p.rf.toFixed(3)}</td>
                    <td>${p.height.toFixed(1)}</td>
                    <td>${p.area.toFixed(0)}</td>
                </tr>
            `;
        });
    });

    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;
}

function drawProfile(canvas, profile, peaks) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const max = Math.max(...profile, 1);
    const step = w / profile.length;
    
    profile.forEach((v, i) => {
        const x = i * step;
        const y = h - (v / max) * (h - 20) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Peaks
    peaks.forEach(p => {
        const x = p.idx * step;
        const y = h - (profile[p.idx] / max) * (h - 20) - 10;
        ctx.fillStyle = '#f0883e';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = '10px Inter';
        ctx.fillText(`Rf ${p.rf.toFixed(2)}`, x - 15, y - 10);
    });
}
