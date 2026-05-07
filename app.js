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
  activeTab: 'tab-image',
  
  // Multi-touch tracking
  pointers: new Map(),
  initialPinchDist: 0,
  initialPinchZoom: 1,

  // Profile tool state
  profileTool: 'zoom',
  profileView: { zoom: 1, offset: 0 },
  activePeakPart: null // 'apex', 'lb', 'rb'
};

const $ = id => document.getElementById(id);

// --- Core Rendering ---
function render() {
  const canvas = $('canvas-main'); if (!state.imgEl || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (canvas.width === 0 || canvas.height === 0) handleResize();
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(state.view.dx, state.view.dy);
  ctx.scale(state.view.zoom, state.view.zoom);

  const drawW = canvas.width; const sx = drawW / state.imgW; const sy = sx;
  const drawH = state.imgH * sy;

  ctx.save();
  ctx.translate((state.imgW*sx)/2, (state.imgH*sy)/2); 
  ctx.rotate(state.imageRotation);
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
    ctx.lineWidth = 4/state.view.zoom; ctx.beginPath(); ctx.moveTo(-l.w*sx/2, 0); ctx.lineTo(l.w*sx/2, 0); ctx.stroke();
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
            
            const isManual = pk.manual || pk.modified;
            ctx.fillStyle = isManual ? 'rgba(255, 82, 82, 0.2)' : (isA ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 215, 0, 0.1)');
            ctx.fillRect(-(l.w*sx)/2, y_top, l.w*sx, y_bot - y_top);
            
            ctx.strokeStyle = isManual ? 'rgba(255, 82, 82, 0.6)' : (isA ? 'rgba(255, 215, 0, 0.6)' : 'rgba(255, 215, 0, 0.3)');
            ctx.beginPath(); ctx.moveTo(-l.w*sx/2, y_top); ctx.lineTo(l.w*sx/2, y_top); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-l.w*sx/2, y_bot); ctx.lineTo(l.w*sx/2, y_bot); ctx.stroke();
        });
    }
    ctx.restore();
  });


  ctx.restore(); ctx.restore();
}

// --- Interaction Logic ---
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
  return { x: (rx+icx)/sx, y: (ry+icy)/sx, cx: x, cy: y, rawX: scX, rawY: scY };
}

function getImageCanvasPos(x, y, sx, sy) {
  const icx = (state.imgW*sx)/2, icy = (state.imgH*sy)/2;
  const ca = Math.cos(state.imageRotation), sa = Math.sin(state.imageRotation);
  return { cx: (x*sx-icx)*ca - (y*sy-icy)*sa + icx, cy: (x*sx-icx)*sa + (y*sy-icy)*ca + icy };
}

function attachListeners() {
    const cv = $('canvas-main');
    
    cv.onpointerdown = e => {
        state.pointers.set(e.pointerId, e);
        if (state.pointers.size === 1) {
            const p = getPos(e, cv); state.dragStart = p; state.mStart = {x:e.clientX, y:e.clientY};
            if (state.activeTool === 'pan') { state.isPanning = true; state.viewStart = {...state.view}; }
            else if (state.activeTool === 'line') { saveState(); const nl = {cx:p.x, cy:p.y, w:100, angle:0}; state.lines.push(nl); state.activeLine = nl; state.editingField = 'resize-line'; }
            else if (state.activeTool === 'spot') { 
                saveState();
                const sx = cv.width / state.imgW;
                const origins = state.lines.filter(l => getImageCanvasPos(l.cx, l.cy, sx, sx).cy > (state.imgH*sx)/2);
                let tx = p.x, ty = p.y;
                if (origins.length) {
                    const o = origins.reduce((a,b) => Math.sqrt((p.x-a.cx)**2+(p.y-a.cy)**2) < Math.sqrt((p.x-b.cx)**2+(p.y-b.cy)**2) ? a : b);
                    const oP = getImageCanvasPos(o.cx, o.cy, sx, sx);
                    if (Math.abs(p.cy - oP.cy) < 100 * sx) {
                        const icx = (state.imgW*sx)/2, icy = (state.imgH*sx)/2;
                        const ca = Math.cos(-state.imageRotation), sa = Math.sin(-state.imageRotation);
                        const rx = (p.cx - icx) * ca - (oP.cy - icy) * sa;
                        const ry = (p.cx - icx) * sa + (oP.cy - icy) * ca;
                        tx = (rx + icx) / sx; ty = (ry + icy) / sx;
                    }
                }
                state.spottingMarks.push({x:tx, y:ty}); 
            }
            else if (state.activeTool === 'select') {
                // Hit-test lanes (image-space rectangle check)
                const hit = state.lanes.find(l => 
                    Math.abs(p.x - l.cx) <= l.w / 2 && Math.abs(p.y - l.cy) <= l.h / 2
                );
                if (hit) {
                    state.activeLane = (state.activeLane === hit) ? null : hit;
                } else {
                    // Tapped empty space — deselect
                    state.activeLane = null;
                }
                renderProfiles();
                renderTable();
            }
            else if (state.activeTool === 'rotate') { saveState(); state.isRotating = true; state.rotateStart = state.imageRotation; }
        } else if (state.pointers.size === 2) {
            const pts = Array.from(state.pointers.values());
            state.initialPinchDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
            state.initialPinchZoom = state.view.zoom;
            state.isPanning = false; // Disable single-finger pan during pinch
        }
        render();
    };

    window.onpointermove = e => {
        if (!state.pointers.has(e.pointerId)) return;
        state.pointers.set(e.pointerId, e);
        
        if (state.pointers.size === 1) {
            if (!state.dragStart) return;
            const p = getPos(e, cv);
            if (state.isPanning) { 
                state.view.dx = state.viewStart.dx+(e.clientX-state.mStart.x); 
                state.view.dy = state.viewStart.dy+(e.clientY-state.mStart.y); 
            }
            else if (state.isRotating) { state.imageRotation = state.rotateStart + (e.clientX-state.mStart.x)*0.005; }
            else if (state.editingField === 'resize-line') { state.activeLine.w = Math.abs(p.x - state.activeLine.cx) * 2; }
            // roiRect removed
        } else if (state.pointers.size === 2) {
            const pts = Array.from(state.pointers.values());
            const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
            const ratio = dist / state.initialPinchDist;
            
            const midX = (pts[0].clientX + pts[1].clientX) / 2;
            const midY = (pts[0].clientY + pts[1].clientY) / 2;
            const rect = cv.getBoundingClientRect();
            const rawX = (midX - rect.left) * (cv.width / rect.width);
            const rawY = (midY - rect.top) * (cv.height / rect.height);
            
            const oldZ = state.view.zoom;
            const newZ = state.initialPinchZoom * ratio;
            
            const imgX = (rawX - state.view.dx) / oldZ;
            const imgY = (rawY - state.view.dy) / oldZ;
            
            state.view.zoom = newZ;
            state.view.dx = rawX - imgX * newZ;
            state.view.dy = rawY - imgY * newZ;
        }
        render();
    };

    window.onpointerup = e => {
        state.pointers.delete(e.pointerId);
        if (state.pointers.size === 0) {
            state.dragStart = null; state.isPanning = false; state.isRotating = false; state.editingField = null; state.roiRect = null; 
        } else if (state.pointers.size === 1) {
            // Reset drag start for the remaining pointer to prevent jumps
            const remaining = state.pointers.values().next().value;
            state.dragStart = getPos(remaining, cv);
            state.mStart = {x:remaining.clientX, y:remaining.clientY};
            state.viewStart = {...state.view};
        }
        render();
    };

    cv.onwheel = e => { 
        e.preventDefault(); 
        const d = e.deltaY > 0 ? 0.9 : 1.1;
        const p = getPos(e, cv);
        const oldZ = state.view.zoom;
        const newZ = oldZ * d;
        state.view.zoom = newZ;
        state.view.dx = p.rawX - p.cx * newZ;
        state.view.dy = p.rawY - p.cy * newZ;
        render(); 
    };

    // UI Listeners
    document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
    document.querySelectorAll('.tool-item').forEach(b => b.onclick = () => {
        document.querySelectorAll('.tool-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); state.activeTool = b.dataset.tool;
    });
    $('landing-upload').onclick = () => $('file-input').click();
    $('landing-camera').onclick = () => $('camera-input').click();
    $('file-input').onchange = e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value = ''; } };
    $('camera-input').onchange = e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value = ''; } };
    $('btn-new').onclick = () => {
        if(confirm('Start a new analysis? Current data will be lost.')) {
            // Reset all state
            state.imgEl = null; state.imgB64 = null; state.imgW = 0; state.imgH = 0;
            state.lines = []; state.spottingMarks = []; state.lanes = [];
            state.imageRotation = 0;
            state.view = { zoom: 1, dx: 0, dy: 0 };
            state.undoStack = [];
            // Reset file inputs so onchange fires again
            $('file-input').value = '';
            $('camera-input').value = '';
            switchView('landing');
        }
    };
    $('btn-reset-img').onclick = () => { 
        if(confirm('Reset annotations and image orientation?')) { 
            saveState();
            state.lines=[]; state.spottingMarks=[]; state.lanes=[]; 
            state.activeLane = null;
            state.imageRotation = 0;
            const cv = $('canvas-main');
            if (state.imgEl) {
                const sc2 = Math.min(cv.width/state.imgW, cv.height/state.imgH) * 0.9;
                state.view = { zoom: sc2, dx: (cv.width - state.imgW*sc2)/2, dy: (cv.height - state.imgH*sc2)/2 };
            }
            renderProfiles(); renderTable(); render(); 
        } 
    };
    $('btn-undo').onclick = undo;
    $('btn-find-lanes').onclick = findLanes;

    // Profile Tab Tools
    document.querySelectorAll('.profile-tool').forEach(b => b.onclick = () => {
        document.querySelectorAll('.profile-tool').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); state.profileTool = b.dataset.ptool;
    });
    $('btn-auto-detect').onclick = () => updateDensitograms(true);
    $('btn-clear-peaks').onclick = () => {
        if (state.activeLane) { state.activeLane.peaks = []; renderProfiles(); renderTable(); render(); }
    };

    // Sliders live update
    if($('peak-sens')) $('peak-sens').oninput = e => $('val-sens').textContent = e.target.value;
    if($('peak-res')) $('peak-res').oninput = e => $('val-res').textContent = e.target.value;
}

// --- Rest of the app (same as before) ---
async function updateDensitograms(detectPeaks = false) {
  if (!state.lanes.length || !state.imgB64) return;
  try {
    const res = await fetch('/generate_profiles', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ 
        image: state.imgB64, lanes: state.lanes, 
        peak_detection: detectPeaks, 
        peak_prominence: parseFloat($('peak-sens')?.value || 40), 
        peak_distance: parseInt($('peak-res')?.value || 10), 
        peak_threshold: 50,
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
    if (state.lines.length < 2) return alert('Need 2+ lines (Origin + Front)');
    if (state.spottingMarks.length < 1) return alert('Mark at least one spotting position first');
    
    const cv = $('canvas-main');
    const sx = cv.width / state.imgW;
    
    // Convert all lines to canvas-space Y for reliable pairing
    const linesWithCanvasY = state.lines.map(l => {
        const cp = getImageCanvasPos(l.cx, l.cy, sx, sx);
        return { line: l, canvasY: cp.cy };
    });
    
    // Pair lines: find closest pair with sufficient Y separation
    const pool = [...linesWithCanvasY]; const pairs = [];
    while (pool.length >= 2) {
        const l1 = pool.shift(); let bestIdx = -1, minDist = Infinity;
        for (let i=0; i<pool.length; i++) {
            const d = Math.abs(l1.canvasY - pool[i].canvasY);
            if (d < minDist && d > 20) { minDist = d; bestIdx = i; }
        }
        if (bestIdx !== -1) {
            const l2 = pool.splice(bestIdx, 1)[0];
            // front = smaller canvasY (top), origin = larger canvasY (bottom)
            const pair = l1.canvasY < l2.canvasY ? 
                { f: l1.line, o: l2.line, fY: l1.canvasY, oY: l2.canvasY } :
                { f: l2.line, o: l1.line, fY: l2.canvasY, oY: l1.canvasY };
            pairs.push(pair);
        }
    }
    if (pairs.length === 0) return alert('Could not pair lines. Make sure Origin and Front lines are separated.');
    
    // --- Lane width from inter-spot spacing (no overlap) ---
    // Group marks by their assigned pair, then sort each group by X (image-space)
    // so widths are derived from neighbour distances.

    // First pass: assign each mark its best pair and compute laneCY / laneH
    const assigned = state.spottingMarks.map((m, i) => {
        const markCanvasPos = getImageCanvasPos(m.x, m.y, sx, sx);
        const p = pairs.reduce((a, b) => {
            const midA = (a.fY + a.oY) / 2;
            const midB = (b.fY + b.oY) / 2;
            return Math.abs(markCanvasPos.cy - midA) < Math.abs(markCanvasPos.cy - midB) ? a : b;
        });
        const laneH = Math.abs(p.o.cy - p.f.cy) * 1.1;
        const laneCY = (p.f.cy + p.o.cy) / 2;
        // pairKey: use Y positions to uniquely identify each Origin/Front pair
        // (cx would be identical for lines spanning the same plate width)
        const pairKey = `${p.f.cy.toFixed(1)}_${p.o.cy.toFixed(1)}`;
        // Store pair ref so we can use line widths for single-mark fallback
        return { idx: i, m, laneCY, laneH, pairKey, pair: p };
    });

    // Second pass: for each pair-group, sort by X and compute widths from gaps
    const groups = {};
    assigned.forEach(a => {
        if (!groups[a.pairKey]) groups[a.pairKey] = [];
        groups[a.pairKey].push(a);
    });

    // Build a lookup: original mark index → computed lane width
    const laneWidths = {};
    Object.values(groups).forEach(grp => {
        // Sort by mark X position in image space
        grp.sort((a, b) => a.m.x - b.m.x);
        const n = grp.length;
        grp.forEach((a, k) => {
            let halfLeft, halfRight;
            if (n === 1) {
                // Single mark: use half the max width of the Origin/Front pair lines
                // so the lane is centred on the spot and doesn't fill the whole plate
                const pairLineW = Math.max(a.pair.f.w, a.pair.o.w);
                halfLeft = halfRight = pairLineW / 4; // half of half = quarter of full line width
            } else {
                // Gap to left neighbour
                halfLeft  = k > 0     ? (a.m.x - grp[k-1].m.x) / 2 : (grp[1].m.x - grp[0].m.x) / 2;
                // Gap to right neighbour
                halfRight = k < n - 1 ? (grp[k+1].m.x - a.m.x) / 2 : (grp[n-1].m.x - grp[n-2].m.x) / 2;
            }
            // Lane width = twice the smaller half-gap → guarantees no overlap
            const w = Math.max(Math.min(halfLeft, halfRight) * 2, 10);
            laneWidths[a.idx] = w;
        });
    });

    state.lanes = [];
    assigned.forEach((a, i) => {
        state.lanes.push({
            id: i + 1,
            cx: a.m.x,
            cy: a.laneCY,
            w: laneWidths[a.idx],
            h: a.laneH,
            angle: 0,
            peaks: []
        });
    });
    render();
    updateDensitograms(true);
}

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
  const cv = $('canvas-main'); const wrap = cv ? cv.parentElement : null;
  if (!cv || !wrap || wrap.clientWidth === 0) return;
  cv.width = wrap.clientWidth; cv.height = wrap.clientHeight;
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
    else if (t === 'tab-profile') renderProfiles();
    else if (t === 'tab-table') renderTable();
}

function renderProfiles() {
    const list = $('profile-display'); list.innerHTML = '';
    const toShow = state.activeLane ? [state.activeLane] : [];
    if (toShow.length === 0) {
        list.innerHTML = '<div class="empty-msg">Select a lane in the Image tab to see its profile.</div>';
        return;
    }
    toShow.forEach(l => {
        const div = document.createElement('div'); div.className = 'profile-card';
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
    const PAD = 20, drawW = w-PAD*2, drawH = h-PAD*2;

    // Chart scale/pan
    const z = state.profileView.zoom;
    const off = state.profileView.offset;

    function getX(idx) { return PAD + ((idx/(n-1)) * drawW * z) + off; }
    function getIdx(x) { return Math.round(((x - off - PAD) / (drawW * z)) * (n - 1)); }

    // Background & Grid
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    for(let i=0; i<=10; i++) {
        const y = h-PAD - (i/10)*drawH; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(w-PAD, y); ctx.stroke();
    }

    // Line
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.beginPath();
    p.forEach((v, i) => {
        const x = getX(i), y = h-PAD-(v/max)*drawH;
        if (x >= PAD && x <= w-PAD) {
            if (ctx.prevX === undefined || ctx.prevX < PAD) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.prevX = x;
    });
    ctx.stroke();

    // Peaks
    (l.peaks || []).forEach(pk => {
        const x = getX(pk.idx), y = h-PAD-(pk.height/max)*drawH;
        const isManual = pk.manual || pk.modified;
        
        // Apex
        ctx.fillStyle = isManual ? '#ff5252' : '#f0883e'; ctx.beginPath(); ctx.arc(x,y,6,0,7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

        // Boundaries
        if (pk.lb !== undefined && pk.rb !== undefined) {
            const xL = getX(pk.lb), xR = getX(pk.rb);
            ctx.setLineDash([4, 4]); ctx.strokeStyle = isManual ? 'rgba(255, 82, 82, 0.5)' : 'rgba(255,255,255,0.3)';
            if (xL >= PAD && xL <= w-PAD) { ctx.beginPath(); ctx.moveTo(xL, PAD); ctx.lineTo(xL, h-PAD); ctx.stroke(); }
            if (xR >= PAD && xR <= w-PAD) { ctx.beginPath(); ctx.moveTo(xR, PAD); ctx.lineTo(xR, h-PAD); ctx.stroke(); }
            ctx.setLineDash([]);
        }
    });

    // Interaction
    let isDragging = false, dragStart = null, initialOff = 0;
    const chartPointers = new Map();
    let initialPinchDist = 0, initialPinchZoom = 1;

    cv.onpointerdown = e => {
        chartPointers.set(e.pointerId, e);
        cv.setPointerCapture(e.pointerId);
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left;

        if (chartPointers.size === 1) {
            const idx = getIdx(mx);
            if (state.profileTool === 'zoom') {
                isDragging = true; dragStart = mx; initialOff = off;
            } else if (state.profileTool === 'add') {
                const v = p[Math.max(0, Math.min(n-1, idx))];
                const lb = Math.max(0, idx - 5), rb = Math.min(n-1, idx + 5);
                const rf = (1.05/1.1- (1-idx/(n-1)))/(1.05/1.1-0.05/1.1);
                l.peaks.push({ idx, rf, height: v, lb, rb, area: v*10, manual: true });
                l.peaks.sort((a,b)=>a.idx-b.idx);
                renderProfiles(); renderTable(); render();
            } else if (state.profileTool === 'modify') {
                const hit = l.peaks.find(pk => {
                    const x = getX(pk.idx), xL = getX(pk.lb), xR = getX(pk.rb);
                    if (Math.abs(mx-x)<15) { state.activePeakPart = 'apex'; return true; }
                    if (Math.abs(mx-xL)<15) { state.activePeakPart = 'lb'; return true; }
                    if (Math.abs(mx-xR)<15) { state.activePeakPart = 'rb'; return true; }
                    return false;
                });
                if (hit) { state.isDraggingPeak = hit; isDragging = true; }
            }
        } else if (chartPointers.size === 2) {
            const pts = Array.from(chartPointers.values());
            initialPinchDist = Math.abs(pts[0].clientX - pts[1].clientX);
            initialPinchZoom = state.profileView.zoom;
            isDragging = false;
        }
    };

    cv.onpointermove = e => {
        chartPointers.set(e.pointerId, e);
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left;

        if (chartPointers.size === 1) {
            const idx = Math.max(0, Math.min(n-1, getIdx(mx)));
            if (state.profileTool === 'zoom' && isDragging) {
                state.profileView.offset = initialOff + (mx - dragStart);
                drawChart(cv, l);
            } else if (state.profileTool === 'modify' && state.isDraggingPeak) {
                const pk = state.isDraggingPeak; pk.modified = true;
                if (state.activePeakPart === 'apex') { pk.idx = idx; pk.height = p[idx]; pk.rf = (1.05/1.1-(1-idx/(n-1)))/(1.05/1.1-0.05/1.1); }
                else if (state.activePeakPart === 'lb') pk.lb = idx;
                else if (state.activePeakPart === 'rb') pk.rb = idx;
                drawChart(cv, l);
            }
        } else if (chartPointers.size === 2) {
            const pts = Array.from(chartPointers.values());
            const dist = Math.abs(pts[0].clientX - pts[1].clientX);
            if (initialPinchDist > 10) {
                state.profileView.zoom = initialPinchZoom * (dist / initialPinchDist);
                drawChart(cv, l);
            }
        }
    };

    cv.onpointerup = e => {
        chartPointers.delete(e.pointerId);
        isDragging = false;
        if (state.isDraggingPeak) {
            state.isDraggingPeak = null; renderTable(); render();
        }
    };
    cv.onpointercancel = cv.onpointerup;

    // Wheel zoom
    cv.onwheel = e => {
        e.preventDefault();
        const d = e.deltaY > 0 ? 0.9 : 1.1;
        state.profileView.zoom *= d;
        drawChart(cv, l);
    };
}

function renderTable() {
    const body = $('table-body'); body.innerHTML = '';
    const toShow = state.activeLane ? [state.activeLane] : [];
    toShow.forEach(l => {
        l.peaks.forEach((pk, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${l.id}.${i+1}</td><td>${pk.rf.toFixed(3)}</td><td>${pk.area.toFixed(0)}</td><td>-</td>`;
            body.appendChild(tr);
        });
    });
}

function saveState() {
    state.undoStack.push({ 
        lines: JSON.parse(JSON.stringify(state.lines)), 
        marks: JSON.parse(JSON.stringify(state.spottingMarks)),
        lanes: JSON.parse(JSON.stringify(state.lanes)),
        rotation: state.imageRotation
    });
    if (state.undoStack.length > 20) state.undoStack.shift();
}
function undo() { 
    if (state.undoStack.length) { 
        const s = state.undoStack.pop(); 
        state.lines = s.lines; 
        state.spottingMarks = s.marks; 
        state.lanes = s.lanes || [];
        state.imageRotation = s.rotation || 0;
        render(); 
        renderProfiles();
        renderTable();
    } 
}

// (crop functionality removed)

function dbg(msg) {
    const el = $('debug-overlay'); if (!el) return;
    el.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight; console.log('[DEBUG]', msg);
}

document.addEventListener('DOMContentLoaded', () => {
    const cv = $('canvas-main');
    if (cv) { handleResize(); state.ctx = cv.getContext('2d'); }
    attachListeners();
    window.addEventListener('resize', handleResize);
    switchView('landing');
});
