// --- AQ-TLC v1.0 Mobile Adaptation ---
const state = {
  imgEl: null, imgB64: null, imgW: 0, imgH: 0,
  imageRotation: 0,
  lines: [], spottingMarks: [], lanes: [],
  activeTool: 'pan', view: { zoom: 1, dx: 0, dy: 0 },
  dragStart: null, mStart: { x: 0, y: 0 }, viewStart: { dx: 0, dy: 0 },
  activeLine: null, activeLane: null, activeMark: null,
  isPanning: false, isRotating: false, rotateStart: 0,
  editingField: null,
  integrationMethod: 'relative', // 'relative', 'calibration', 'mw_calibration'
  undoStack: [],
  chartView: { zoom: 1, offset: 0 },
  polarityMode: 'default',
  activeTab: 'tab-image'
};

const $ = id => document.getElementById(id);

// --- Core Rendering ---
function render() {
  const canvas = $('canvas-main'); if (!state.imgEl || !canvas) return;
  const wrap = canvas.parentElement; canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight;
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

  // Lines (Origin/Front)
  state.lines.forEach(l => {
    const isS = state.activeLine === l;
    const pos = getImageCanvasPos(l.cx, l.cy, sx, sy);
    const isOrigin = pos.cy > (state.imgH*sy)/2;
    ctx.save(); ctx.translate(l.cx*sx, l.cy*sy); ctx.rotate((l.angle || 0) - state.imageRotation);
    ctx.strokeStyle = isS ? '#ffc107' : (isOrigin ? '#f0883e' : '#238636');
    ctx.lineWidth = 4/state.view.zoom; ctx.beginPath(); moveTo(-l.w*sx/2, 0); ctx.lineTo(l.w*sx/2, 0); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${12/state.view.zoom}px Inter`;
    ctx.fillText(isOrigin ? "ORIGIN" : "FRONT", -l.w*sx/2, -8/state.view.zoom);
    ctx.restore();
  });

  // Unique Pairs (Plate Boxes) visualization
  const pool = [...state.lines];
  while (pool.length >= 2) {
    const l1 = pool.shift(); const l1_pos = getImageCanvasPos(l1.cx, l1.cy, sx, sx);
    let bestIdx = -1; let minDist = Infinity;
    for (let i=0; i<pool.length; i++) {
        const p_pos = getImageCanvasPos(pool[i].cx, pool[i].cy, sx, sx);
        const d = Math.sqrt((l1_pos.cx-p_pos.cx)**2 + (l1_pos.cy-p_pos.cy)**2);
        if (d < minDist && Math.abs(l1_pos.cy - p_pos.cy) > 50 * sx) { minDist = d; bestIdx = i; }
    }
    if (bestIdx !== -1) {
        const l2 = pool.splice(bestIdx, 1)[0];
        const l2_pos = getImageCanvasPos(l2.cx, l2.cy, sx, sx);
        const [f, o] = l1_pos.cy < l2_pos.cy ? [l1, l2] : [l2, l1];
        const f_pos = getImageCanvasPos(f.cx, f.cy, sx, sx);
        const o_pos = getImageCanvasPos(o.cx, o.cy, sx, sx);
        
        ctx.save();
        ctx.translate((f_pos.cx+o_pos.cx)/2, (f_pos.cy+o_pos.cy)/2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.setLineDash([5, 5]);
        ctx.strokeRect(-Math.max(f.w, o.w)*sx/2, -Math.abs(f_pos.cy-o_pos.cy)*1.1/2, Math.max(f.w, o.w)*sx, Math.abs(f_pos.cy-o_pos.cy)*1.1);
        ctx.restore();
    }
  }

  // Lanes & Bands
  state.lanes.forEach(l => {
    ctx.save(); ctx.translate(l.cx*sx, l.cy*sy); ctx.rotate(l.angle || 0);
    const isA = state.activeLane === l;
    ctx.strokeStyle = isA ? '#ffc107' : 'rgba(88,166,255,0.4)';
    ctx.lineWidth = isA ? 4/state.view.zoom : 2/state.view.zoom;
    ctx.strokeRect(-(l.w*sx)/2, -(l.h*sy)/2, l.w*sx, l.h*sy);
    
    const n = (l.profile || []).length;
    if (n > 1) {
        (l.peaks || []).forEach(pk => {
            const lb = pk.lb || 0, rb = pk.rb || 0;
            const y_top = (0.5 - rb/(n-1)) * l.h * sy;
            const y_bot = (0.5 - lb/(n-1)) * l.h * sy;
            ctx.fillStyle = isA ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 215, 0, 0.1)';
            ctx.fillRect(-(l.w*sx)/2, y_top, l.w*sx, y_bot - y_top);
            ctx.strokeStyle = isA ? 'rgba(255, 215, 0, 0.6)' : 'rgba(255, 215, 0, 0.3)';
            ctx.beginPath(); ctx.moveTo(-l.w*sx/2, y_top); ctx.lineTo(l.w*sx/2, y_top); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-l.w*sx/2, y_bot); ctx.lineTo(l.w*sx/2, y_bot); ctx.stroke();
        });
    }
    ctx.restore();
  });

  if (state.roiRect) {
    ctx.strokeStyle = '#f0883e'; ctx.lineWidth = 2/state.view.zoom; ctx.setLineDash([5, 5]);
    ctx.strokeRect(state.roiRect.x*sx, state.roiRect.y*sy, state.roiRect.w*sx, state.roiRect.h*sy);
  }

  ctx.restore(); ctx.restore();
}

// --- Analytical & API ---
async function updateDensitograms(detectPeaks = false) {
  if (!state.lanes.length || !state.imgB64) return;
  try {
    const res = await fetch('/api/generate_profiles', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ 
        image: state.imgB64, lanes: state.lanes, 
        peak_detection: detectPeaks, 
        peak_prominence: parseFloat($('peak-prominence').value), 
        peak_distance: parseInt($('peak-distance').value), 
        peak_threshold: parseFloat($('peak-threshold')?.value || 50),
        smooth_sigma: 1.5, polarity_mode: state.polarityMode
      })
    });
    const data = await res.json();
    if (data.results) {
      data.results.forEach(r => { 
        const l = state.lanes.find(ln => ln.id === r.id); 
        if (l) { l.profile = r.profile; if (detectPeaks || !l.peaks.length) l.peaks = r.peaks || []; }
      });
      renderProfiles(); renderTable(); render();
    }
  } catch(e) { console.error(e); }
}

function findLanes() {
    if (state.lines.length < 2) return alert('Need 2+ lines');
    const pool = [...state.lines]; const pairs = [];
    while (pool.length >= 2) {
        const l1 = pool.shift(); let bestIdx = -1, minDist = Infinity;
        for (let i=0; i<pool.length; i++) {
            const d = Math.abs(l1.cy - pool[i].cy);
            if (d < minDist && d > 100) { minDist = d; bestIdx = i; }
        }
        if (bestIdx !== -1) {
            const l2 = pool.splice(bestIdx, 1)[0];
            pairs.push(l1.cy < l2.cy ? {f:l1, o:l2} : {f:l2, o:l1});
        }
    }
    state.lanes = [];
    state.spottingMarks.forEach((m, i) => {
        const p = pairs.reduce((a,b) => Math.min(Math.abs(m.y-a.f.cy), Math.abs(m.y-a.o.cy)) < Math.min(Math.abs(m.y-b.f.cy), Math.abs(m.y-b.o.cy)) ? a : b);
        state.lanes.push({ id: i+1, cx: m.x, cy: (p.f.cy+p.o.cy)/2, w: 40, h: Math.abs(p.o.cy-p.f.cy)*1.1, peaks: [] });
    });
    updateDensitograms(true);
}

// --- Interaction (Canvas) ---
function getPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const scY = (e.clientY - rect.top) * (canvas.height / rect.height);
  const z = state.view.zoom;
  let x = (scX - state.view.dx) / z; let y = (scY - state.view.dy) / z;
  const sx = canvas.width / state.imgW;
  const icx = (state.imgW*sx)/2, icy = (state.imgH*sx)/2;
  const sa = Math.sin(-state.imageRotation), ca = Math.cos(-state.imageRotation);
  const rx = (x-icx)*ca - (y-icy)*sa, ry = (x-icx)*sa + (y-icy)*ca;
  return { x: (rx+icx)/sx, y: (ry+icy)/sx, cx: x, cy: y };
}

function getImageCanvasPos(x, y, sx, sy) {
  const icx = (state.imgW*sx)/2, icy = (state.imgH*sy)/2;
  const ca = Math.cos(state.imageRotation), sa = Math.sin(state.imageRotation);
  return { cx: (x*sx-icx)*ca - (y*sy-icy)*sa + icx, cy: (x*sx-icx)*sa + (y*sy-icy)*ca + icy };
}

function attachListeners() {
    const cv = $('canvas-main');
    cv.onmousedown = e => {
        const p = getPos(e, cv); state.dragStart = p; state.mStart = {x:e.clientX, y:e.clientY};
        if (state.activeTool === 'pan') { state.isPanning = true; state.viewStart = {...state.view}; }
        else if (state.activeTool === 'line') { saveState(); const nl = {cx:p.x, cy:p.y, w:100, angle:0}; state.lines.push(nl); state.activeLine = nl; state.editingField = 'resize-line'; }
        else if (state.activeTool === 'spot') { saveState(); state.spottingMarks.push({x:p.x, y:p.y}); }
        else if (state.activeTool === 'roi') { state.roiRect = {x:p.x, y:p.y, w:1, h:1}; }
        else if (state.activeTool === 'rotate') { saveState(); state.isRotating = true; state.rotateStart = state.imageRotation; }
        render();
    };

    window.onmousemove = e => {
        if (!state.dragStart) return; const p = getPos(e, cv);
        if (state.isPanning) { state.view.dx = state.viewStart.dx+(e.clientX-state.mStart.x); state.view.dy = state.viewStart.dy+(e.clientY-state.mStart.y); }
        else if (state.isRotating) { state.imageRotation = state.rotateStart + (e.clientX-state.mStart.x)*0.005; }
        else if (state.editingField === 'resize-line') { state.activeLine.w = Math.abs(p.x - state.activeLine.cx) * 2; }
        else if (state.roiRect) { state.roiRect.w = p.x-state.roiRect.x; state.roiRect.h = p.y-state.roiRect.y; }
        render();
    };

    window.onmouseup = () => {
        if (state.roiRect && Math.abs(state.roiRect.w) > 5) applyCrop();
        state.dragStart = null; state.isPanning = false; state.isRotating = false; state.editingField = null; state.roiRect = null; render();
    };

    cv.onwheel = e => { e.preventDefault(); const d = e.deltaY > 0 ? 0.9 : 1.1; state.view.zoom *= d; render(); };

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
    
    // Tools
    document.querySelectorAll('.tool-item').forEach(b => b.onclick = () => {
        document.querySelectorAll('.tool-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); state.activeTool = b.dataset.tool;
    });

    // Upload
    $('landing-upload').onclick = () => $('file-input').click();
    $('file-input').onchange = e => { if (e.target.files[0]) handleUpload(e.target.files[0]); };
    $('btn-new').onclick = () => switchView('landing');
    $('btn-undo').onclick = undo;
}

// --- Image Handling ---
function handleUpload(file) {
  const r = new FileReader(); r.onload = e => {
    const img = new Image(); img.onload = () => {
      const c = document.createElement('canvas'); const MAX = 1200;
      let w = img.width, h = img.height; const sc = Math.min(1, MAX/Math.max(w,h));
      c.width = w*sc; c.height = h*sc; c.getContext('2d').drawImage(img, 0,0,c.width,c.height);
      state.imgEl = c; state.imgW = c.width; state.imgH = c.height; state.imgB64 = c.toDataURL('image/jpeg', 0.85);
      
      switchView('workspace');
      setTimeout(() => {
        handleResize();
        const cv = $('canvas-main');
        const sc2 = Math.min(cv.width/state.imgW, cv.height/state.imgH) * 0.9;
        state.view = { zoom: sc2, dx: (cv.width - state.imgW*sc2)/2, dy: (cv.height - state.imgH*sc2)/2 };
        render();
      }, 100);
    }; img.src = e.target.result;
  }; r.readAsDataURL(file);
}

function handleResize() {
  const cv = $('canvas-main');
  const wrap = cv ? cv.parentElement : null;
  if (!cv || !wrap || wrap.clientWidth === 0) return;
  cv.width = wrap.clientWidth;
  cv.height = wrap.clientHeight;
}

function switchView(v) {
    state.view_mode = v;
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    if (v === 'landing') $('view-landing').classList.add('active');
    else switchTab('tab-image');
}

function switchTab(t) {
    state.activeTab = t;
    document.querySelectorAll('.view').forEach(x => { if (x.id !== 'view-landing') x.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    $(t).classList.add('active'); document.querySelector(`[data-tab="${t}"]`).classList.add('active');
    if (t === 'tab-image') render();
}

// --- Densitogram Rendering & Interaction ---
function renderProfiles() {
    const list = $('profile-display'); list.innerHTML = '';
    state.lanes.forEach(l => {
        const div = document.createElement('div'); div.className = 'profile-card';
        div.style.background = '#161616'; div.style.padding = '10px'; div.style.borderRadius = '10px'; div.style.marginBottom = '10px';
        div.innerHTML = `<h4 style="margin:0 0 5px 0">Lane ${l.id}</h4><canvas id="chart-${l.id}" style="width:100%; height:180px; background:#000"></canvas>`;
        list.appendChild(div);
        setTimeout(() => drawChart($(`chart-${l.id}`), l), 0);
    });
}
function drawChart(cv, l) {
    if (!cv || !l.profile) return;
    cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    const ctx = cv.getContext('2d'), p = l.profile.slice().reverse(), n = p.length;
    const max = Math.max(...p, 1), w = cv.width, h = cv.height;
    
    const PAD = 20;
    const drawW = w - PAD * 2;
    const drawH = h - PAD * 2;

    // Line
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.beginPath();
    p.forEach((v, i) => {
        const x = PAD + (i/(n-1))*drawW;
        const y = h - PAD - (v/max)*drawH;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // Peaks
    (l.peaks || []).forEach((pk, i) => {
        const x = PAD + (pk.idx/(n-1))*drawW;
        const y = h - PAD - (pk.height/max)*drawH;
        ctx.fillStyle = pk.manual ? '#e34c26' : '#f0883e';
        ctx.beginPath(); ctx.arc(x,y,5,0,7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
        ctx.fillText(pk.rf.toFixed(2), x, y-10);
    });

    // Interaction
    cv.onmousedown = e => {
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left;
        let idx = Math.round(((mx - PAD) / drawW) * (n-1));
        idx = Math.max(0, Math.min(n-1, idx));
        
        // Right click or long press to delete (simplified)
        const hit = (l.peaks || []).find(pk => Math.abs(mx - (PAD + (pk.idx/(n-1))*drawW)) < 15);
        if (e.button === 2 || state.peakMode === 'delete') {
            if (hit) { l.peaks = l.peaks.filter(x => x !== hit); renderProfiles(); renderTable(); render(); }
            return;
        }

        if (hit) {
            state.isDraggingPeak = hit;
            state.activeLane = l;
        } else {
            // Add Peak
            const val = p[idx];
            const rf = (1.05/1.10 - (1 - idx/(n-1))) / (1.05/1.10 - 0.05/1.10);
            l.peaks.push({ idx, rf, height: val, area: val * 10, manual: true });
            l.peaks.sort((a,b) => a.idx - b.idx);
            renderProfiles(); renderTable(); render();
        }
    };

    cv.onmousemove = e => {
        if (!state.isDraggingPeak) return;
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left;
        let idx = Math.round(((mx - PAD) / drawW) * (n-1));
        idx = Math.max(0, Math.min(n-1, idx));
        state.isDraggingPeak.idx = idx;
        state.isDraggingPeak.height = p[idx];
        state.isDraggingPeak.rf = (1.05/1.10 - (1 - idx/(n-1))) / (1.05/1.10 - 0.05/1.10);
        renderProfiles(); renderTable(); render();
    };

    cv.onmouseup = () => { state.isDraggingPeak = null; };
    cv.oncontextmenu = e => e.preventDefault();
}

function renderTable() {
    const body = $('table-body'); body.innerHTML = '';
    const calCurve = state.tableMode === 'area-cal' ? calculateCalibrationCurve() : null;
    const mwCurve = state.tableMode === 'mw-cal' ? calculateMWCalibrationCurve() : null;

    state.lanes.forEach(l => {
        (l.peaks || []).forEach((pk, i) => {
            const tr = document.createElement('tr');
            let val = '-';
            if (state.tableMode === 'area-cal' && calCurve) val = calCurve(pk.area).toFixed(2);
            else if (state.tableMode === 'mw-cal' && mwCurve) val = mwCurve(pk.rf).toFixed(1);
            
            tr.innerHTML = `
                <td>${l.id}.${i+1}</td>
                <td>${pk.rf.toFixed(3)}</td>
                <td>${pk.area.toFixed(0)}</td>
                <td>${val}</td>
            `;
            body.appendChild(tr);
        });
    });
}

function calculateCalibrationCurve() {
    const stds = [];
    state.lanes.forEach(l => l.peaks.forEach(p => { if (p.calibrationValue) stds.push({x: p.area, y: p.calibrationValue}); }));
    if (stds.length < 1) return null;
    if (stds.length === 1) return x => x * (stds[0].y / stds[0].x);
    // Linear regression
    const n = stds.length;
    let sx=0, sy=0, sxy=0, sxx=0;
    stds.forEach(s => { sx+=s.x; sy+=s.y; sxy+=s.x*s.y; sxx+=s.x*s.x; });
    const m = (n*sxy - sx*sy) / (n*sxx - sx*sx);
    const b = (sy - m*sx) / n;
    return x => Math.max(0, m*x + b);
}

function calculateMWCalibrationCurve() {
    const stds = [];
    state.lanes.forEach(l => l.peaks.forEach(p => { if (p.mwValue) stds.push({x: p.rf, y: Math.log10(p.mwValue)}); }));
    if (stds.length < 2) return null;
    stds.sort((a,b) => a.x - b.x);
    return rf => {
        for (let i=0; i<stds.length-1; i++) {
            if (rf >= stds[i].x && rf <= stds[i+1].x) {
                const m = (stds[i+1].y - stds[i].y) / (stds[i+1].x - stds[i].x);
                return Math.pow(10, stds[i].y + m*(rf - stds[i].x));
            }
        }
        return null;
    };
}

function saveState() {
    state.undoStack.push({ lines: JSON.parse(JSON.stringify(state.lines)), marks: JSON.parse(JSON.stringify(state.spottingMarks)) });
    if (state.undoStack.length > 20) state.undoStack.shift();
}
function undo() { if (state.undoStack.length) { const s = state.undoStack.pop(); state.lines = s.lines; state.spottingMarks = s.marks; render(); } }

function applyCrop() {
    const r = state.roiRect; const x = r.w>0?r.x:r.x+r.w, y = r.h>0?r.y:r.y+r.h, w = Math.abs(r.w), h = Math.abs(r.h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(state.imgEl, x,y,w,h, 0,0,w,h);
    handleUpload({ name: 'cropped.jpg' }); // Fake file object to reuse logic
}

function dbg(m) { console.log(m); }

document.addEventListener('DOMContentLoaded', () => {
    attachListeners();
    window.addEventListener('resize', handleResize);
    switchView('landing');
});
