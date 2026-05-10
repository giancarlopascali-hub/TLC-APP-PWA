// ── Configuration & State (Original Logic Preserved) ────────────────────────
const state = {
  imgEl: null, imgB64: null, originalB64: null, imgW: 0, imgH: 0,
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
  roiRect: null,
  isDraggingPeak: null, isDraggingBound: null, isPanningChart: null, isZoomingChart: null,
  deferredPrompt: null,
  activePointers: new Map(), lastPinchDist: 0, lastMidpoint: null,
  profileTool: 'nav-pan'
};

const $ = id => document.getElementById(id);

// ── Lifecycle & Navigation ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTabs(); initTools(); initSidebar();
    
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredPrompt = e; $('btn-install').classList.remove('hidden'); });
    $('btn-install').onclick = async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); const { outcome } = await state.deferredPrompt.userChoice; if (outcome === 'accepted') { $('btn-install').classList.add('hidden'); state.deferredPrompt = null; } };

    $('btn-upload').onclick = () => $('file-input').click();
    $('btn-camera').onclick = () => $('camera-input').click();
    $('file-input').onchange = e => handleFile(e.target.files[0]);
    $('camera-input').onchange = e => handleFile(e.target.files[0]);
    $('btn-new').onclick = () => { if(confirm("Discard current analysis and start new?")) { localStorage.removeItem('tlc_project'); window.location.reload(); } };
    $('btn-reset').onclick = resetWorkspace;
    $('btn-undo').onclick = undo;
    
    const cv = $('canvas-main');
    cv.onpointerdown = handlePointerDown; cv.ondblclick = handleDblClick; cv.onwheel = handleWheel;
    window.onpointermove = handlePointerMove; window.onpointerup = handlePointerUp;
    cv.oncontextmenu = e => e.preventDefault();
    
    $('btn-edit-peaks').onclick = () => { $('menu-view').classList.add('hidden'); $('menu-edit').classList.toggle('hidden'); };
    $('btn-reset-view').onclick = () => { $('menu-edit').classList.add('hidden'); $('menu-view').classList.toggle('hidden'); };
    
    document.querySelectorAll('.sub-item').forEach(btn => {
        btn.onclick = (e) => {
            const mode = btn.dataset.pmode;
            if (mode === 'nav-1to1') { state.chartView = { zoom: 1, offset: 0 }; renderProfiles(); }
            else { state.profileTool = mode; }
            document.querySelectorAll('.sub-item').forEach(b => b.classList.toggle('active', b.dataset.pmode === state.profileTool));
            btn.parentElement.classList.add('hidden');
            e.stopPropagation();
        };
    });

    $('btn-clear-peaks').onclick = () => { if(state.activeLane) { saveState(); state.activeLane.peaks = []; renderProfiles(); renderTable(); render(); autoSave(); } };
    $('btn-reset-integ').onclick = () => updateDensitograms(true);
    $('btn-export-lane').onclick = () => exportReport();
    $('btn-full-report').onclick = () => exportReport('all');
    
    document.querySelectorAll('.mode-item').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mode-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.integrationMethod = btn.dataset.imode;
            renderTable(); autoSave();
        };
    });

    loadFromLocal();
});

function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const s = Math.min(1, 1000/Math.max(img.naturalWidth, img.naturalHeight));
            state.imgW = Math.round(img.naturalWidth*s); state.imgH = Math.round(img.naturalHeight*s);
            const c = document.createElement('canvas'); c.width = state.imgW; c.height = state.imgH;
            c.getContext('2d').drawImage(img, 0, 0, state.imgW, state.imgH);
            state.imgB64 = c.toDataURL('image/jpeg', 0.9); state.originalB64 = state.imgB64;
            state.imgEl = new Image();
            state.imgEl.onload = () => { $('view-landing').classList.add('hidden'); $('view-workspace').classList.remove('hidden'); render(); autoSave(); };
            state.imgEl.src = state.imgB64;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            $(`tab-${tab}`).classList.remove('hidden');
            document.querySelectorAll('.toolbar-content').forEach(t => t.classList.add('hidden'));
            $(`toolbar-${tab}`).classList.remove('hidden');
            if (tab === 'profile') renderProfiles();
            if (tab === 'table') renderTable();
            render();
        };
    });
}

function initTools() {
    document.querySelectorAll('.tool-item[data-tool]').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tool-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTool = btn.dataset.tool;
        };
    });
}

function initSidebar() {
    $('btn-find-lanes').onclick = findLanes;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.polarityMode = btn.dataset.mode;
            if (state.activeLane) updateDensitograms(true);
        };
    });
    const reCalc = () => { if(state.activeLane) updateDensitograms(true); };
    $('peak-sens').oninput = reCalc; $('peak-res').oninput = reCalc; $('peak-width').oninput = reCalc;
    $('btn-restore-defaults').onclick = () => {
        $('peak-sens').value = 40; $('peak-res').value = 8; $('peak-width').value = 50;
        if (state.activeLane) updateDensitograms(true);
    };
}

// ── Rendering & Drawing Logic ──────────────────────────────────────────────
function render() {
  const canvas = $('canvas-main'); if (!state.imgEl || !canvas) return;
  const wrap = canvas.parentElement; canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight;
  const ctx = canvas.getContext('2d');
  if ($('lane-count-badge')) $('lane-count-badge').textContent = `${state.lanes.length} Lanes`;
  ctx.save(); ctx.translate(state.view.dx, state.view.dy); ctx.scale(state.view.zoom, state.view.zoom);
  const drawW = canvas.width; const sx = drawW / state.imgW; const sy = sx;
  const drawH = state.imgH * sy;
  ctx.save(); ctx.translate((state.imgW*sx)/2, (state.imgH*sx)/2); ctx.rotate(state.imageRotation);
  ctx.drawImage(state.imgEl, -(state.imgW*sx)/2, -(state.imgH*sx)/2, drawW, drawH);
  ctx.translate(-(state.imgW*sx)/2, -(state.imgH*sx)/2);
  state.spottingMarks.forEach(m => {
    const isS = state.activeMark === m; ctx.fillStyle = isS ? '#ffc107' : '#58a6ff'; ctx.beginPath(); ctx.arc(m.x*sx, m.y*sy, 6/state.view.zoom, 0, 2*Math.PI); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1/state.view.zoom; ctx.stroke();
  });
  state.lines.forEach(l => {
    const isS = state.activeLine === l; const pos = getImageCanvasPos(l.cx, l.cy, sx, sy); const isOrigin = pos.cy > (state.imgH*sy)/2;
    ctx.save(); ctx.translate(l.cx*sx, l.cy*sy); ctx.rotate((l.angle || 0) - state.imageRotation);
    ctx.strokeStyle = isS ? '#ffc107' : (isOrigin ? '#f0883e' : '#238636');
    ctx.lineWidth = 4/state.view.zoom; ctx.beginPath(); ctx.moveTo(-l.w*sx/2, 0); ctx.lineTo(l.w*sx/2, 0); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${12/state.view.zoom}px Inter`; ctx.fillText(isOrigin ? "ORIGIN" : "FRONT", -l.w*sx/2, -8/state.view.zoom); ctx.restore();
  });
  state.lanes.forEach(l => {
    ctx.save(); ctx.translate(l.cx*sx, l.cy*sy); ctx.rotate(l.angle || 0);
    const isA = state.activeLane === l; ctx.strokeStyle = isA ? '#ffc107' : 'rgba(88,166,255,0.4)'; ctx.lineWidth = isA ? 4/state.view.zoom : 2/state.view.zoom; ctx.strokeRect(-(l.w*sx)/2, -(l.h*sy)/2, l.w*sx, l.h*sy);
    const n = (l.profile || []).length;
    if (n > 1) {
        (l.peaks || []).forEach(pk => {
            const lb = pk.lb !== undefined ? pk.lb : Math.max(0, pk.idx - 5); const rb = pk.rb !== undefined ? pk.rb : Math.min(n-1, pk.idx + 5);
            const y_top = (0.5 - rb/(n-1)) * l.h * sy; const y_bot = (0.5 - lb/(n-1)) * l.h * sy;
            const color = pk.manual ? '227, 76, 38' : '255, 215, 0'; ctx.fillStyle = isA ? `rgba(${color}, 0.25)` : `rgba(${color}, 0.12)`; ctx.fillRect(-(l.w*sx)/2, y_top, l.w*sx, y_bot - y_top);
        });
    }
    ctx.restore();
  });
  if (state.roiRect) {
    ctx.strokeStyle = '#f0883e'; ctx.lineWidth = 2/state.view.zoom; ctx.setLineDash([5/state.view.zoom, 5/state.view.zoom]); ctx.strokeRect(state.roiRect.x*sx, state.roiRect.y*sy, state.roiRect.w*sx, state.roiRect.h*sy);
    ctx.fillStyle = 'rgba(240,136,62,0.1)'; ctx.fillRect(state.roiRect.x*sx, state.roiRect.y*sy, state.roiRect.w*sx, state.roiRect.h*sy); ctx.setLineDash([]);
  }
  ctx.restore(); ctx.restore();
}

// ── Analytical Functions ────────────────────────────────────────────────────
function findLanes() {
    saveState(); state.lanes = []; const pool = [...state.lines]; const pairs = []; const sx = $('canvas-main').width / state.imgW;
    while (pool.length >= 2) {
        const l1 = pool.shift(); const l1_pos = getImageCanvasPos(l1.cx, l1.cy, sx, sx);
        let bestIdx = -1, minDist = Infinity;
        for (let i=0; i<pool.length; i++) {
            const pi_pos = getImageCanvasPos(pool[i].cx, pool[i].cy, sx, sx);
            const d = Math.sqrt((l1_pos.cx-pi_pos.cx)**2 + (l1_pos.cy-pi_pos.cy)**2);
            if (d < minDist && Math.abs(l1_pos.cy - pi_pos.cy) > 50 * sx) { minDist = d; bestIdx = i; }
        }
        if (bestIdx !== -1) {
            const l2 = pool.splice(bestIdx, 1)[0]; const l2_pos = getImageCanvasPos(l2.cx, l2.cy, sx, sx);
            const [f, o] = l1_pos.cy < l2_pos.cy ? [l1, l2] : [l2, l1]; pairs.push({ o, f, id: pairs.length + 1 });
        }
    }
    state.spottingMarks.forEach((m, mi) => {
        const m_pos = getImageCanvasPos(m.x, m.y, sx, sx);
        const bestPair = pairs.reduce((best, curr) => {
            const curr_o_pos = getImageCanvasPos(curr.o.cx, curr.o.cy, sx, sx); const d_curr = Math.sqrt((m_pos.cx - curr_o_pos.cx)**2 + (m_pos.cy - curr_o_pos.cy)**2);
            if (!best) return curr;
            const best_o_pos = getImageCanvasPos(best.o.cx, best.o.cy, sx, sx); return d_curr < Math.sqrt((m_pos.cx - best_o_pos.cx)**2 + (m_pos.cy - best_o_pos.cy)**2) ? curr : best;
        }, null);
        if (!bestPair) return;
        const {o, f} = bestPair; const o_pos = getImageCanvasPos(o.cx, o.cy, sx, sx); const f_pos = getImageCanvasPos(f.cx, f.cy, sx, sx);
        const buddies = state.spottingMarks.filter(bm => {
            const bm_pos = getImageCanvasPos(bm.x, bm.y, sx, sx);
            const bBest = pairs.reduce((b, c) => { 
                const b_o = getImageCanvasPos(b.o.cx, b.o.cy, sx, sx); 
                const c_o = getImageCanvasPos(c.o.cx, c.o.cy, sx, sx); 
                return Math.abs(bm_pos.cx - c_o.cx) < Math.abs(bm_pos.cx - b_o.cx) ? c : b; 
            }, pairs[0]);
            return bBest === bestPair;
        }).sort((a,b) => getImageCanvasPos(a.x, a.y, sx, sx).cx - getImageCanvasPos(b.x, b.y, sx, sx).cx);

        const lineWCanvas = Math.max(bestPair.o.w, bestPair.f.w) * sx;
        let laneWCanvas;
        if (buddies.length === 1) {
            laneWCanvas = lineWCanvas * 0.75;
        } else {
            const m_idx = buddies.indexOf(m);
            const m_cx = getImageCanvasPos(m.x, m.y, sx, sx).cx;
            let d1 = Infinity, d2 = Infinity;
            if (m_idx > 0) d1 = m_cx - getImageCanvasPos(buddies[m_idx-1].x, buddies[m_idx-1].y, sx, sx).cx;
            if (m_idx < buddies.length - 1) d2 = getImageCanvasPos(buddies[m_idx+1].x, buddies[m_idx+1].y, sx, sx).cx - m_cx;
            laneWCanvas = Math.min(d1, d2);
            if (laneWCanvas === Infinity) laneWCanvas = lineWCanvas / buddies.length; // Fallback
            laneWCanvas *= 0.95; // Small gap to prevent overlap
        }

        const hImg = Math.abs(o_pos.cy - f_pos.cy) * 1.10 / sx; const icx = (state.imgW*sx)/2; const icy = (state.imgH*sx)/2;
        const ca = Math.cos(-state.imageRotation); const sa = Math.sin(-state.imageRotation);
        const rx = (m_pos.cx - icx) * ca - ((o_pos.cy+f_pos.cy)/2 - icy) * sa; const ry = (m_pos.cx - icx) * sa + ((o_pos.cy+f_pos.cy)/2 - icy) * ca;
        state.lanes.push({ id: bestPair.id + "." + (buddies.indexOf(m) + 1), cx: (rx + icx) / sx, cy: (ry + icy) / sx, w: laneWCanvas / sx, h: hImg, angle: -state.imageRotation, profile: [], peaks: [] });
    });
    if (state.lanes.length > 0) { state.activeLane = state.lanes[0]; updateDensitograms(true); }
    render(); autoSave();
}

async function updateDensitograms(detectPeaks = false) {
  if (state.lanes.length === 0 || !state.imgB64) return;
  try {
    const res = await fetch('/generate_profiles', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ 
        image: state.imgB64, lanes: state.lanes, peak_detection: detectPeaks, 
        peak_prominence: parseFloat($('peak-sens').value), peak_distance: parseInt($('peak-res').value), 
        peak_threshold: parseFloat($('peak-width').value), smooth_sigma: 1.5, polarity_mode: state.polarityMode
      })
    });
    const data = await res.json();
    if (data.results) {
      data.results.forEach(r => { const l = state.lanes.find(ln => ln.id === r.id); if (l) { l.profile = r.profile; if (detectPeaks || !l.peaks || l.peaks.length === 0) l.peaks = r.peaks || []; } });
      renderProfiles(); renderTable(); render(); autoSave();
    }
  } catch(e) { console.error(e); }
}

function findBoundaries(profile, apexIdx) {
    const threshold = parseFloat($('peak-width').value || 10) / 100.0;
    const baseline = Math.min(...profile);
    const peakSignal = profile[apexIdx] - baseline;
    let lb = apexIdx, rb = apexIdx;
    while (lb > 0) {
        if (profile[lb-1] > profile[lb]) break;
        if ((profile[lb-1] - baseline) < peakSignal * threshold) break;
        lb--;
    }
    while (rb < profile.length - 1) {
        if (profile[rb+1] > profile[rb]) break;
        if ((profile[rb+1] - baseline) < peakSignal * threshold) break;
        rb++;
    }
    return {lb, rb};
}

function renderProfiles() {
    const list = $('densitogram-list'); if (!list) return;
    list.innerHTML = ''; if (!state.activeLane) { list.innerHTML = `<div class="empty-state">Select a lane to view analysis</div>`; return; }
    const l = state.activeLane; const item = document.createElement('div');
    item.innerHTML = `
        <div style="padding:10px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:10px;">
            <input type="text" value="${l.name || 'Lane '+l.id}" style="background:transparent; border:none; color:white; font-family:Outfit; font-size:1.1rem; font-weight:700; flex:1;" onchange="state.activeLane.name=this.value; render(); autoSave();">
            <span style="font-size:0.7rem; color:var(--text-dim)">#${l.id}</span>
        </div>
        <canvas id="chart-active" style="width:100%; height:250px; background:#000; cursor:crosshair; touch-action:none;"></canvas>
    `;
    list.appendChild(item);
    const cv = $('chart-active'); cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    const ctx = cv.getContext('2d'); const p_orig = l.profile; if (!p_orig || p_orig.length === 0) return;
    const p = p_orig.slice().reverse(); const minV = Math.min(...p), maxV = Math.max(...p), range = (maxV - minV) || 1;
    const PAD_L = 50, PAD_R = 50, PAD_T = 30, PAD_B = 40; const plotW = cv.width - PAD_L - PAD_R, plotH = cv.height - PAD_T - PAD_B;
    const z = state.chartView.zoom, off = state.chartView.offset;
    ctx.save(); ctx.beginPath(); ctx.rect(PAD_L, PAD_T, plotW, plotH); ctx.clip();
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.beginPath();
    p.forEach((val, i) => { const x = PAD_L + ((i/(p.length-1)) * z + off) * plotW; const y = PAD_T + (1 - (val-minV)/range) * plotH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    (l.peaks || []).forEach(pk => {
        const px = PAD_L + ((pk.idx/(p.length-1)) * z + off) * plotW; const py = PAD_T + (1-(pk.height-minV)/range)*plotH;
        const lb_x = PAD_L + ((pk.lb/(p.length-1)) * z + off) * plotW; const rb_x = PAD_L + ((pk.rb/(p.length-1)) * z + off) * plotW;
        const color = pk.manual ? '#e34c26' : '#ffd700'; ctx.fillStyle = pk.manual ? 'rgba(227, 76, 38, 0.2)' : 'rgba(255, 215, 0, 0.2)'; ctx.fillRect(lb_x, PAD_T, rb_x - lb_x, plotH);
        ctx.strokeStyle = color; ctx.setLineDash([5,3]); ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,PAD_T+plotH); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2); ctx.fill();
        ctx.font='bold 10px Inter'; ctx.textAlign='center'; ctx.fillText((pk.manual?'*':'')+pk.rf.toFixed(2), px, py-12);
    });
    ctx.restore(); ctx.font = 'bold 11px Inter'; ctx.textAlign = 'center'; ctx.fillStyle = '#8b949e'; ctx.fillText('ORIGIN (0.0)', PAD_L, cv.height - 15); ctx.fillText('FRONT (1.0)', cv.width - PAD_R, cv.height - 15);
    
    cv.onpointerdown = (me) => {
        const mrect = cv.getBoundingClientRect(); const mx = me.clientX - mrect.left;
        cv.setPointerCapture(me.pointerId);
        let idx = Math.round((((mx - PAD_L) / plotW) - off) / z * (p.length - 1)); idx = Math.max(0, Math.min(p.length-1, idx));
        let hitBound = null, hitApex = null;
        for(let pk of (l.peaks||[])) {
            const px = PAD_L + ((pk.idx/(p.length-1)) * z + off) * plotW; const lb_x = PAD_L + ((pk.lb/(p.length-1)) * z + off) * plotW; const rb_x = PAD_L + ((pk.rb/(p.length-1)) * z + off) * plotW;
            if (Math.abs(mx - px) < 20) hitApex = pk; else if (Math.abs(mx - lb_x) < 15) hitBound = {pk, type: 'lb'}; else if (Math.abs(mx - rb_x) < 15) hitBound = {pk, type: 'rb'};
        }

        if (state.profileTool === 'edit-add') { 
            saveState(); const rf = calculateRf(idx, p.length); 
            const {lb, rb} = findBoundaries(p, idx);
            l.peaks.push({ idx, rf, height: p[idx], area: 10, lb, rb, manual: true, type: 'N' }); 
            renderProfiles(); renderTable(); render(); autoSave(); 
        }
        else if (state.profileTool === 'edit-move') { if (hitApex) { saveState(); state.isDraggingPeak = hitApex; } else if (hitBound) { saveState(); state.isDraggingBound = hitBound; } }
        else if (state.profileTool === 'edit-delete') { if (hitApex) { saveState(); l.peaks = l.peaks.filter(pk => pk !== hitApex); renderProfiles(); renderTable(); render(); autoSave(); } }
        else if (state.profileTool === 'nav-zoom') { state.isZoomingChart = { startX: mx, startZ: z, startIdx: idx }; }
        else if (state.profileTool === 'nav-pan') { if (z > 1) { state.isPanningChart = { startX: mx, startOff: off }; } }
    };
    cv.onpointermove = (me) => {
        const mrect = cv.getBoundingClientRect(); const mx = me.clientX - mrect.left;
        let idx = Math.round((((mx - PAD_L) / plotW) - off) / z * (p.length - 1)); idx = Math.max(0, Math.min(p.length-1, idx));
        if (state.isDraggingBound) { const {pk, type} = state.isDraggingBound; if (type === 'lb') pk.lb = Math.min(pk.rb - 1, Math.max(0, idx)); else if (type === 'rb') pk.rb = Math.max(pk.lb + 1, Math.min(p.length-1, idx)); pk.manual = true; renderProfiles(); renderTable(); render(); }
        else if (state.isDraggingPeak) { 
            state.isDraggingPeak.idx = idx; state.isDraggingPeak.height = p[idx]; state.isDraggingPeak.rf = calculateRf(idx, p.length); 
            const {lb, rb} = findBoundaries(p, idx); state.isDraggingPeak.lb = lb; state.isDraggingPeak.rb = rb;
            state.isDraggingPeak.manual = true;
            renderProfiles(); renderTable(); render(); 
        }
        else if (state.isPanningChart) { const dx = (mx - state.isPanningChart.startX) / plotW; state.chartView.offset = Math.min(0, Math.max(1 - z, state.isPanningChart.startOff + dx)); renderProfiles(); }
        else if (state.isZoomingChart) { 
            const dx = (mx - state.isZoomingChart.startX) / 50; 
            const newZ = Math.max(1, state.isZoomingChart.startZ + dx);
            state.chartView.zoom = newZ;
            state.chartView.offset = (state.isZoomingChart.startX - PAD_L)/plotW - (state.isZoomingChart.startIdx/(p.length-1)) * newZ;
            if (state.chartView.zoom === 1) state.chartView.offset = 0; 
            renderProfiles(); 
        }
    };
    cv.onpointerup = () => { if(state.isDraggingPeak || state.isDraggingBound || state.isPanningChart || state.isZoomingChart) autoSave(); state.isDraggingPeak = null; state.isDraggingBound = null; state.isPanningChart = null; state.isZoomingChart = null; };
    cv.onwheel = e => { e.preventDefault(); state.chartView.zoom = Math.max(1, state.chartView.zoom * (e.deltaY > 0 ? 0.9 : 1.1)); if (state.chartView.zoom === 1) state.chartView.offset = 0; renderProfiles(); };
}

function renderTable() {
    const head = $('table-head'); const body = $('table-body'); if (!state.activeLane) return;
    const l = state.activeLane; const totalArea = l.peaks.reduce((s, pk) => s + pk.area, 0); const totalCorrArea = l.peaks.reduce((s, pk) => s + (pk.area / (pk.absRatio || 1)), 0);
    const calCurve = state.integrationMethod === 'calibration' ? calculateCalibrationCurve() : null; const mwCurve = state.integrationMethod === 'mw_calibration' ? calculateMWCalibrationCurve() : null;
    if (state.integrationMethod === 'relative') head.innerHTML = `<tr><th>Peak</th><th>Rf</th><th>Area</th><th>%</th><th>AbsR</th><th>% Corr</th></tr>`;
    else if (state.integrationMethod === 'calibration') head.innerHTML = `<tr><th>Peak</th><th>Rf</th><th>Area</th><th>Type</th><th>Value</th></tr>`;
    else head.innerHTML = `<tr><th>Peak</th><th>Rf</th><th>Type</th><th>MW (kDa)</th></tr>`;
    body.innerHTML = '';
    l.peaks.forEach((pk, i) => {
        const tr = document.createElement('tr'); if (pk.manual) tr.style.color = '#e34c26';
        let cells = `<td><input type="text" value="${pk.name || '#'+(i+1)}" style="background:transparent; border:none; color:inherit; width:45px;" onchange="state.activeLane.peaks[${i}].name=this.value; autoSave();"></td><td>${pk.rf.toFixed(3)}</td>`;
        if (state.integrationMethod === 'relative') { const corr = pk.area / (pk.absRatio || 1); cells += `<td>${pk.area.toFixed(1)}</td><td>${totalArea>0?((pk.area/totalArea)*100).toFixed(1):0}%</td><td><input type="number" step="0.1" value="${pk.absRatio||1}" style="background:transparent; border:1px solid #30363d; color:white; width:45px;" onchange="state.activeLane.peaks[${i}].absRatio=parseFloat(this.value)||1; renderTable(); autoSave();"></td><td>${totalCorrArea>0?((corr/totalCorrArea)*100).toFixed(1):0}%</td>`; }
        else if (state.integrationMethod === 'calibration') { let val = '-'; if(pk.type==='S') val = `<input type="number" value="${pk.calibrationValue||''}" style="background:transparent; border:1px solid #30363d; color:white; width:60px;" onchange="state.activeLane.peaks[${i}].calibrationValue=parseFloat(this.value); renderTable(); autoSave();">`; else if(pk.type==='A') val = calCurve ? calCurve(pk.area).toFixed(2) : '-'; cells += `<td>${pk.area.toFixed(1)}</td><td>${getTypeSelect(i, pk.type)}</td><td>${val}</td>`; }
        else { let mw = '-'; if(pk.type==='S') mw = `<input type="number" value="${pk.mwValue||''}" style="background:transparent; border:1px solid #30363d; color:white; width:60px;" onchange="state.activeLane.peaks[${i}].mwValue=parseFloat(this.value); renderTable(); autoSave();">`; else if(pk.type==='A') mw = mwCurve ? mwCurve(pk.rf).toFixed(1) : '-'; cells += `<td>${getTypeSelect(i, pk.type)}</td><td>${mw}</td>`; }
        tr.innerHTML = cells; body.appendChild(tr);
    });
}

function getTypeSelect(i, type) { return `<select onchange="state.activeLane.peaks[${i}].type=this.value; renderTable(); autoSave();" style="background:#21262d; color:white; border:none; font-size:0.7rem;"><option value="N" ${type==='N'?'selected':''}>N</option><option value="S" ${type==='S'?'selected':''}>S</option><option value="A" ${type==='A'?'selected':''}>A</option></select>`; }
function calculateCalibrationCurve() { const stds = []; state.lanes.forEach(l => (l.peaks||[]).forEach(pk => { if(pk.type==='S' && pk.calibrationValue) stds.push({area: pk.area, val: pk.calibrationValue}); })); if (stds.length < 1) return null; if (stds.length === 1) { const m = stds[0].val/stds[0].area; return a => a*m; } let sX=0, sY=0, sXY=0, sXX=0, n=stds.length; stds.forEach(s => { sX+=s.area; sY+=s.val; sXY+=s.area*s.val; sXX+=s.area*s.area; }); const m = (n*sXY - sX*sY)/(n*sXX - sX*sX), b = (sY - m*sX)/n; return a => Math.max(0, m*a + b); }
function calculateMWCalibrationCurve() { const stds = []; state.lanes.forEach(l => (l.peaks||[]).forEach(pk => { if(pk.type==='S' && pk.mwValue) stds.push({rf: pk.rf, log: Math.log10(pk.mwValue)}); })); if (stds.length < 2) return null; stds.sort((a,b)=>a.rf-b.rf); return rf => { let i=0; if(rf <= stds[0].rf) i=0; else if(rf >= stds[stds.length-1].rf) i=stds.length-2; else for(let j=0; j<stds.length-1; j++) if(rf>=stds[j].rf && rf<=stds[j+1].rf) { i=j; break; } const s0=stds[i], s1=stds[i+1], m=(s1.log-s0.log)/(s1.rf-s0.rf); return Math.pow(10, s0.log + m*(rf-s0.rf)); }; }
function calculateRf(idx, n) { return ( (1.05/1.10) - (1.0 - (idx/(n-1))) ) / ( (1.05/1.10) - (0.05/1.10) ); }
function getImageCanvasPos(x, y, sx, sy) { const icx = (state.imgW*sx)/2; const icy = (state.imgH*sy)/2; const dx = x*sx - icx; const dy = y*sy - icy; const ca = Math.cos(state.imageRotation); const sa = Math.sin(state.imageRotation); return { cx: dx * ca - dy * sa + icx, cy: dx * sa + dy * ca + icy }; }
function getPos(e, canvas) { const rect = canvas.getBoundingClientRect(); const scX = (e.clientX - rect.left) * (canvas.width / rect.width); const scY = (e.clientY - rect.top) * (canvas.height / rect.height); const z = state.view.zoom; let x = (scX - state.view.dx) / z, y = (scY - state.view.dy) / z; const sx = canvas.width / state.imgW; const icx = (state.imgW*sx)/2, icy = (state.imgH*sx)/2; let dx = x - icx, dy = y - icy; const sa = Math.sin(-state.imageRotation), ca = Math.cos(-state.imageRotation); return { x: ((dx * ca - dy * sa) + icx) / sx, y: ((dx * sa + dy * ca) + icy) / sx, scX, scY, cx: x, cy: y }; }
function getDist(pts) { return Math.sqrt((pts[0].x-pts[1].x)**2 + (pts[0].y-pts[1].y)**2); }
function getMid(pts) { return { x: (pts[0].x+pts[1].x)/2, y: (pts[0].y+pts[1].y)/2 }; }

function handlePointerDown(e) {
  const cv = $('canvas-main'); cv.setPointerCapture(e.pointerId);
  state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (state.activePointers.size === 2) {
    const pts = [...state.activePointers.values()];
    state.lastPinchDist = getDist(pts); state.lastMidpoint = getMid(pts);
    return;
  }
  const p = getPos(e, cv); state.dragStart = p; state.mStart = { x: e.clientX, y: e.clientY }; const sx = cv.width / state.imgW;
  if (state.activeTool === 'select' || state.activeTool === 'pan') {
    const mHit = state.spottingMarks.find(m => Math.sqrt((p.x-m.x)**2 + (p.y-m.y)**2) < 12);
    const lHit = state.lines.find(l => { const pos = getImageCanvasPos(l.cx, l.cy, sx, sx); return Math.abs(p.cy - pos.cy) < 20 && Math.abs(p.cx - pos.cx) < (l.w * sx) / 2; });
    const lnHit = state.lanes.find(ln => { const pos = getImageCanvasPos(ln.cx, ln.cy, sx, sx); return Math.abs(p.cx - pos.cx) < (ln.w * sx) / 2 && Math.abs(p.cy - pos.cy) < (ln.h * sx) / 2; });
    if (mHit) { saveState(); state.activeMark = mHit; state.activeLine = null; state.activeLane = null; state.editingField = 'move-mark'; }
    else if (lHit) { saveState(); state.activeLine = lHit; state.activeMark = null; state.activeLane = null; state.editingField = 'move-line'; }
    else if (lnHit) { saveState(); state.activeLane = lnHit; state.activeLine = null; state.activeMark = null; state.editingField = (state.activeTool==='select') ? 'select-lane' : 'move-lane'; renderProfiles(); renderTable(); }
    else { state.activeMark = null; state.activeLine = null; state.activeLane = null; if (state.activeTool === 'pan') state.isPanning = true; state.viewStart = { ...state.view }; }
  } else if (state.activeTool === 'roi') { state.roiRect = { x: p.x, y: p.y, w: 1, h: 1 }; }
  else if (state.activeTool === 'line') { saveState(); const nl = { cx: p.x, cy: p.y, w: 1, angle: 0 }; state.lines.push(nl); state.activeLine = nl; state.editingField = 'resize-line'; }
  else if (state.activeTool === 'spotting') {
    saveState(); const origins = state.lines.filter(l => getImageCanvasPos(l.cx, l.cy, sx, sx).cy > (state.imgH*sx)/2);
    let ty = p.y; if(origins.length>0) { const o = origins.reduce((b,c)=> Math.sqrt((p.x-c.cx)**2+(p.y-c.cy)**2) < Math.sqrt((p.x-b.cx)**2+(p.y-b.cy)**2) ? c : b); if(Math.abs(p.y-o.cy)<50) ty=o.cy; }
    state.spottingMarks.push({ x: p.x, y: ty }); autoSave();
  } else if (state.activeTool === 'rotate_img') { saveState(); state.isRotating = true; state.rotateStart = state.imageRotation; }
  render();
}

function handlePointerMove(e) {
  if (!state.activePointers.has(e.pointerId)) return;
  state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (state.activePointers.size === 2) {
    const pts = [...state.activePointers.values()]; const d = getDist(pts); const mid = getMid(pts);
    const zoomFactor = d / state.lastPinchDist;
    const oldZoom = state.view.zoom; state.view.zoom = Math.min(20, Math.max(0.1, state.view.zoom * zoomFactor));
    state.view.dx += (mid.x - state.lastMidpoint.x) - (mid.x - state.view.dx) * (state.view.zoom/oldZoom - 1);
    state.view.dy += (mid.y - state.lastMidpoint.y) - (mid.y - state.view.dy) * (state.view.zoom/oldZoom - 1);
    state.lastPinchDist = d; state.lastMidpoint = mid; render(); return;
  }
  if (!state.dragStart) return; const p = getPos(e, $('canvas-main'));
  if (state.isPanning) { state.view.dx = state.viewStart.dx+(e.clientX-state.mStart.x); state.view.dy = state.viewStart.dy+(e.clientY-state.mStart.y); }
  else if (state.isRotating) { state.imageRotation = state.rotateStart + (e.clientX-state.mStart.x)*0.002; }
  else if (state.editingField === 'move-mark') { state.activeMark.x = p.x; state.activeMark.y = p.y; }
  else if (state.editingField === 'move-line') { state.activeLine.cx = p.x; state.activeLine.cy = p.y; }
  else if (state.editingField === 'move-lane') { state.activeLane.cx = p.x; state.activeLane.cy = p.y; }
  else if (state.editingField === 'select-lane') { if(Math.abs(e.clientX - state.mStart.x)>10 || Math.abs(e.clientY - state.mStart.y)>10) { state.editingField = 'move-lane'; state.activeLane.cx = p.x; state.activeLane.cy = p.y; } }
  else if (state.editingField === 'resize-line') { const sx = $('canvas-main').width / state.imgW; state.activeLine.w = Math.abs(p.cx - getImageCanvasPos(state.activeLine.cx, state.activeLine.cy, sx, sx).cx) * 2 / sx; }
  else if (state.roiRect && state.activeTool === 'roi') { state.roiRect.w = p.x-state.roiRect.x; state.roiRect.h = p.y-state.roiRect.y; }
  render();
}

function handlePointerUp(e) { 
    state.activePointers.delete(e.pointerId); if (state.activePointers.size < 2) { state.lastPinchDist = 0; state.lastMidpoint = null; }
    if (state.activeTool === 'roi' && state.roiRect && Math.abs(state.roiRect.w) > 5) applyCrop(); 
    if(state.editingField) autoSave(); state.dragStart = null; state.isPanning = false; state.isRotating = false; state.editingField = null; 
}
function handleDblClick() { if (state.activeTool === 'rotate_img') { saveState(); state.imageRotation += Math.PI / 2; render(); autoSave(); } }
function handleWheel(e) { e.preventDefault(); const p = getPos(e, $('canvas-main')); const d = e.deltaY > 0 ? 0.9 : 1.1; const old = state.view.zoom; state.view.zoom = Math.min(20, Math.max(0.1, state.view.zoom * d)); state.view.dx -= (p.scX - state.view.dx) * (state.view.zoom/old - 1); state.view.dy -= (p.scY - state.view.dy) * (state.view.zoom/old - 1); render(); }

async function applyCrop() {
    saveState(); const r = state.roiRect;
    const res = await fetch('/detect/crop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ image: state.imgB64, x: r.x, y: r.y, w: r.w, h: r.h, angle: state.imageRotation }) });
    const data = await res.json();
    if (data.image) {
        const img = new Image(); img.onload = () => { state.imgEl = img; state.imgB64 = data.image; state.imgW = img.naturalWidth; state.imgH = img.naturalHeight; state.roiRect = null; state.imageRotation = 0; state.view = { zoom: 1, dx: 0, dy: 0 }; render(); autoSave(); }; img.src = data.image;
    }
}

function saveState() { state.undoStack.push(JSON.stringify({ lines: state.lines, spottingMarks: state.spottingMarks, lanes: state.lanes, rotation: state.imageRotation, img: state.imgB64, w: state.imgW, h: state.imgH })); if (state.undoStack.length > 50) state.undoStack.shift(); }
function undo() { 
    if (state.undoStack.length === 0) return; 
    const activeLaneId = state.activeLane ? state.activeLane.id : null;
    const activeMarkIdx = state.activeMark ? state.spottingMarks.indexOf(state.activeMark) : -1;
    const activeLineIdx = state.activeLine ? state.lines.indexOf(state.activeLine) : -1;

    const s = JSON.parse(state.undoStack.pop()); 
    state.lines = s.lines; state.spottingMarks = s.spottingMarks; state.lanes = s.lanes; state.imageRotation = s.rotation; 
    
    if (activeLaneId) state.activeLane = state.lanes.find(l => l.id === activeLaneId) || state.lanes[0] || null;
    if (activeMarkIdx !== -1) state.activeMark = state.spottingMarks[activeMarkIdx];
    if (activeLineIdx !== -1) state.activeLine = state.lines[activeLineIdx];

    if (state.imgB64 !== s.img) { 
        state.imgB64 = s.img; state.imgW = s.w; state.imgH = s.h; 
        const img = new Image(); img.onload = () => { state.imgEl = img; render(); }; img.src = s.img; 
    } 
    renderProfiles(); renderTable(); render(); autoSave(); 
}
function resetWorkspace() { saveState(); state.lines = []; state.spottingMarks = []; state.lanes = []; state.imageRotation = 0; state.view = { zoom: 1, dx: 0, dy: 0 }; if (state.originalB64) { state.imgB64 = state.originalB64; const img = new Image(); img.onload = () => { state.imgEl = img; state.imgW = img.naturalWidth; state.imgH = img.naturalHeight; render(); }; img.src = state.imgB64; } renderProfiles(); renderTable(); render(); autoSave(); }

function autoSave() { localStorage.setItem('tlc_project', JSON.stringify({ lines: state.lines, spottingMarks: state.spottingMarks, lanes: state.lanes, rotation: state.imageRotation, img: state.imgB64, w: state.imgW, h: state.imgH })); }
function loadFromLocal() {
    const saved = localStorage.getItem('tlc_project'); if (!saved) return;
    const s = JSON.parse(saved); state.lines = s.lines; state.spottingMarks = s.spottingMarks; state.lanes = s.lanes; state.imageRotation = s.rotation; state.imgB64 = s.img; state.originalB64 = s.img; state.imgW = s.w; state.imgH = s.h;
    const img = new Image(); img.onload = () => { state.imgEl = img; $('view-landing').classList.add('hidden'); $('view-workspace').classList.remove('hidden'); render(); renderProfiles(); renderTable(); }; img.src = s.img;
}

// PDF Export (EXACT ORIGINAL LOGIC)
async function exportReport(type = null) {
    let lanesToExport = type === 'all' ? state.lanes : [state.activeLane]; if (!lanesToExport[0]) return alert("No lanes to export.");
    const img = new Image(); img.src = state.imgB64; await new Promise(r => img.onload = r);
    let reportHtml = `<html><head><title>AQ-TLC Analytical Report</title><style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; max-width: 1000px; margin: auto; }
        .page-break { page-break-after: always; margin-bottom: 60px; }
        .header { display: flex; justify-content: space-between; border-bottom: 3px solid #0366d6; padding-bottom: 15px; margin-bottom: 30px; }
        .stack-wrap { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); background: #000; padding-bottom: 10px; }
        .lane-strip-area { position: relative; height: 100px; background: #000; overflow: hidden; margin-bottom: -1px; }
        .lane-strip-img { position: absolute; left: 5%; width: 90%; height: 100%; object-fit: fill; }
        .chart-img { width: 100%; display: block; border-top: 2px solid #eee; }
        table { width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 0.85rem; break-inside: avoid; }
        th, td { border: 1px solid #eee; padding: 10px; text-align: left; }
        th { background: #f8f9fa; font-weight: 700; color: #555; text-transform: uppercase; font-size: 0.7rem; }
        .badge { background: #0366d6; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; color:#fff; }
    </style></head><body>`;
    for (let l of lanesToExport) {
        const laneStrip = document.createElement('canvas'); laneStrip.width = l.h; laneStrip.height = l.w; 
        const sctx = laneStrip.getContext('2d'); sctx.save(); sctx.translate(l.h/2, l.w/2); sctx.rotate(Math.PI/2 - l.angle); sctx.drawImage(img, -l.cx, -l.cy); sctx.restore();
        
        // Add colored banding to lane strip
        const n = (l.profile || []).length;
        if (n > 1) {
            l.peaks.forEach(pk => {
                const x_start = (pk.lb / (n - 1)) * l.h;
                const x_end = (pk.rb / (n - 1)) * l.h;
                sctx.fillStyle = pk.manual ? 'rgba(227, 76, 38, 0.4)' : 'rgba(255, 215, 0, 0.4)';
                sctx.fillRect(x_start, 0, x_end - x_start, l.w);
            });
        }

        const hiResChart = document.createElement('canvas'); hiResChart.width = 1600; hiResChart.height = 800;
        const hctx = hiResChart.getContext('2d'); hctx.fillStyle = '#fff'; hctx.fillRect(0,0,1600,800);
        const padL = 80, padR = 80, padT = 100, padB = 100; const pw = 1600-padL-padR, ph = 800-padT-padB;
        const p = [...l.profile].reverse(); const maxVal = Math.max(...p, 1);
        hctx.strokeStyle = '#0366d6'; hctx.lineWidth = 3; hctx.beginPath();
        p.forEach((v, i) => { const x = padL + (i/(p.length-1))*pw; const y = padT+ph - (v/maxVal)*ph; if(i===0) hctx.moveTo(x,y); else hctx.lineTo(x,y); }); hctx.stroke();
        hctx.fillStyle = '#000'; hctx.font = 'bold 24px Inter'; hctx.textAlign = 'center'; hctx.fillText('Retention Factor (Rf)', 800, 785);
        for(let i=0; i<=10; i++) { const rf = i/10; const rel_pos = (0.05 / 1.1) + rf * (1.0 / 1.1); const x = padL + rel_pos * pw; hctx.font = '18px Inter'; hctx.fillText(rf.toFixed(1), x, 730); hctx.beginPath(); hctx.moveTo(x, 700); hctx.lineTo(x, 693); hctx.stroke(); }
        const totalArea = l.peaks.reduce((s, pk) => s + pk.area, 0); const totalCorrArea = l.peaks.reduce((s, pk) => s + (pk.area / (pk.absRatio || 1)), 0);
        const mwCurve = state.integrationMethod === 'mw_calibration' ? calculateMWCalibrationCurve() : null;
        const calCurve = state.integrationMethod === 'calibration' ? calculateCalibrationCurve() : null;
        const rows = l.peaks.map((pk, i) => {
            const corrArea = pk.area / (pk.absRatio || 1);
            if (state.integrationMethod === 'mw_calibration') {
                const mwVal = mwCurve ? mwCurve(pk.rf) : null; let mwStr = pk.type === 'S' ? (pk.mwValue || 'N/A') : (pk.type === 'A' ? (mwVal ? mwVal.toFixed(1) : 'Need 2+ Standards') : 'N/A');
                return `<tr style="${pk.manual ? 'background: rgba(227, 76, 38, 0.05);' : ''}"><td>${pk.name || '#'+(i+1)}</td><td style="text-align:center">${pk.rf.toFixed(3)}</td><td style="text-align:center">${pk.type||'N'}</td><td style="text-align:right">${mwStr}</td></tr>`;
            } else if (state.integrationMethod === 'relative') {
                return `<tr style="${pk.manual ? 'background: rgba(227, 76, 38, 0.05);' : ''}"><td>${pk.name || '#'+(i+1)}</td><td style="text-align:center">${pk.rf.toFixed(3)}</td><td style="text-align:right">${pk.area.toFixed(1)}</td><td style="text-align:right">${totalArea > 0 ? ((pk.area/totalArea)*100).toFixed(1) : 0}%</td><td style="text-align:center">${pk.absRatio || 1}</td><td style="text-align:right">${totalCorrArea > 0 ? ((corrArea/totalCorrArea)*100).toFixed(1) : 0}%</td></tr>`;
            } else {
                let valStr = pk.type === 'S' ? (pk.calibrationValue || 'N/A') : (pk.type === 'A' ? (calCurve ? calCurve(pk.area).toFixed(2) : '-') : 'N/A');
                return `<tr style="${pk.manual ? 'background: rgba(227, 76, 38, 0.05);' : ''}"><td>${pk.name || '#'+(i+1)}</td><td style="text-align:center">${pk.rf.toFixed(3)}</td><td style="text-align:right">${pk.area.toFixed(1)}</td><td style="text-align:center">${pk.type||'N'}</td><td style="text-align:right">${valStr}</td></tr>`;
            }
        }).join('');
        const tableHeaders = state.integrationMethod === 'mw_calibration' ? `<tr><th>PEAK NAME</th><th style="text-align:center">Rf</th><th style="text-align:center">TYPE</th><th style="text-align:right">MW (kDa)</th></tr>` : state.integrationMethod === 'relative' ? `<tr><th>PEAK NAME</th><th style="text-align:center">Rf</th><th style="text-align:right">AREA (AU)</th><th style="text-align:right">% AREA</th><th style="text-align:center">ABS RATIO</th><th style="text-align:right">% CORR. AREA</th></tr>` : `<tr><th>PEAK NAME</th><th style="text-align:center">Rf</th><th style="text-align:right">AREA (AU)</th><th style="text-align:center">TYPE</th><th style="text-align:right">VALUE</th></tr>`;
        reportHtml += `<div class="page-break"><div class="header"><div><h1 style="color:#0366d6; margin:0">AQ-TLC Analytical Report <span class="badge">PRO</span></h1><p style="color:#666; margin:5px 0 0 0">Sample: <strong>${l.name || l.id}</strong></p></div><div style="text-align:right; color:#888; font-size:0.9rem">${new Date().toLocaleString()}</div></div>
            <div class="stack-wrap"><div class="lane-strip-area"><img src="${laneStrip.toDataURL()}" class="lane-strip-img"></div><img src="${hiResChart.toDataURL()}" class="chart-img"></div>
            <h3 style="margin-top:40px; border-bottom:2px solid #eee; padding-bottom:10px; font-size:0.9rem">QUANTITATIVE INTEGRATION (${state.integrationMethod.toUpperCase()})</h3>
            <table><thead>${tableHeaders}</thead><tbody>${rows}</tbody></table></div>`;
    }
    reportHtml += `<script>window.onload = () => { setTimeout(() => window.print(), 1000); }</script></body></html>`;
    try { const win = window.open('', '_blank'); win.document.write(reportHtml); win.document.close(); } 
    catch (e) { const blob = new Blob([reportHtml], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "AQ-TLC_Report.html"; document.body.appendChild(a); a.click(); }
}
