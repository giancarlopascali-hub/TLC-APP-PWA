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
    activeLane: null
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

    // Canvas Events
    const cv = $('canvas-main');
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
}

function handleResize() {
    const canvas = $('canvas-main');
    const container = $('canvas-container');
    if (!canvas || !container) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
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
        handleResize(); 
        
        const cv = $('canvas-main');
        if (!cv) throw new Error('Canvas not found');

        if (cv.width === 0 || cv.height === 0) {
            cv.width = window.innerWidth;
            cv.height = window.innerHeight - 130; 
        }

        const scale = Math.min(cv.width / w, cv.height / h) * 0.9;
        state.zoom = scale || 1;
        state.panX = (cv.width - w * state.zoom) / 2;
        state.panY = (cv.height - h * state.zoom) / 2;
        
        dbg('Image Ready. Rendering...');
        render();
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
    
    ctx.restore();
}

function renderLines(ctx) {
    state.lines.forEach(l => {
        ctx.save();
        ctx.translate(l.cx, l.cy);
        ctx.rotate(l.angle || 0);
        ctx.strokeStyle = state.activeLine === l ? '#ffc107' : '#58a6ff';
        ctx.lineWidth = 4 / state.zoom;
        ctx.beginPath();
        ctx.moveTo(-l.w / 2, 0);
        ctx.lineTo(l.w / 2, 0);
        ctx.stroke();
        ctx.restore();
    });
}

function renderMarks(ctx) {
    state.marks.forEach(m => {
        ctx.fillStyle = state.activeMark === m ? '#ffc107' : '#f0883e';
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
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    const p = getCanvasPoint(e);
    
    if (state.activeTool === 'line') {
        const newLine = { cx: p.x, cy: p.y, w: 100, angle: 0 };
        state.lines.push(newLine);
        state.activeLine = newLine;
    } else if (state.activeTool === 'spotting') {
        state.marks.push({ x: p.x, y: p.y });
    }
    
    render();
}

function onPointerMove(e) {
    if (!state.isDragging) return;
    
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    
    if (state.activeTool === 'pan') {
        state.panX += dx;
        state.panY += dy;
    } else if (state.activeTool === 'line' && state.activeLine) {
        const p = getCanvasPoint(e);
        state.activeLine.w = Math.abs(p.x - state.activeLine.cx) * 2;
    }
    
    render();
}

function onPointerUp() {
    state.isDragging = false;
    state.activeLine = null;
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
                peak_prominence: 40,
                peak_distance: 10
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

function showResults() {
    const container = $('results-content');
    container.innerHTML = `<h2 class="hero-title" style="text-align:left">Analysis Results</h2>`;
    
    state.results.forEach(res => {
        const card = document.createElement('div');
        card.className = 'hero-card';
        card.style.maxWidth = 'none';
        card.style.marginBottom = '20px';
        card.style.textAlign = 'left';
        
        let peaksHtml = res.peaks.map(p => `
            <tr>
                <td>${p.rf.toFixed(3)}</td>
                <td>${p.height.toFixed(1)}</td>
                <td>${p.area.toFixed(0)}</td>
            </tr>
        `).join('');
        
        card.innerHTML = `
            <h3>Lane ${res.id}</h3>
            <div style="overflow-x:auto">
                <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--glass-border)">
                            <th style="padding:8px">Rf</th>
                            <th style="padding:8px">Height</th>
                            <th style="padding:8px">Area</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${peaksHtml || '<tr><td colspan="3">No peaks detected</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(card);
    });
    
    switchView('results');
}
