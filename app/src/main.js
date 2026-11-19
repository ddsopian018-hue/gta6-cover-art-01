// Neon Coast Cover Studio — editor wiring: photos, panels, layout, grade, caption, export.
// The cover itself is drawn by ./cover.js; this file only moves state around.
import { renderCover, defaultState, LAYOUTS, GRADES, SIZES, panelRects } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');

/** The cover state: photos, per-panel crops, layout, grade, caption, size. */
export const state = defaultState();
let selectedPanel = 0;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Adds an image to the photo library and returns its index. */
export function addPhoto(img, name) {
  state.photos.push(img);
  const index = state.photos.length - 1;
  const thumb = document.createElement('img');
  thumb.src = img.src;
  thumb.alt = name;
  thumb.title = name;
  thumb.addEventListener('click', () => assignPhoto(index));
  $('library').appendChild(thumb);
  return index;
}

/** Loads a bundled sample photo into the library. */
export async function loadSample(name) {
  const img = await loadImage(`samples/${name}.jpg`);
  return addPhoto(img, name);
}

/** Redraws the live preview at the current size. */
export function render() {
  renderCover(ctx, canvas.width, canvas.height, state);
}

/** Switches the preview (and export) size. */
export function setSize(key) {
  state.size = key;
  const s = SIZES[key];
  canvas.width = s.w;
  canvas.height = s.h;
  document.querySelectorAll('#sizes button').forEach((b) => b.classList.toggle('active', b.dataset.size === key));
  render();
}

/** Assigns a library photo to the selected panel. */
function assignPhoto(index) {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  if (selectedPanel >= rects.length) selectedPanel = 0;
  state.panels[selectedPanel].photo = index;
  state.panels[selectedPanel].zoom = 1;
  state.panels[selectedPanel].ox = 0;
  state.panels[selectedPanel].oy = 0;
  refreshSlots();
  render();
}

/** Rebuilds the panel slot buttons for the current layout. */
function refreshSlots() {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  const box = $('slots');
  box.innerHTML = '';
  rects.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = selectedPanel === i ? 'active' : '';
    const photo = state.panels[i]?.photo;
    b.innerHTML = `Panel ${i + 1}<small>${photo === null || photo === undefined ? 'empty' : 'photo ' + (photo + 1)}</small>`;
    b.addEventListener('click', () => {
      selectedPanel = i;
      syncCropInputs();
      refreshSlots();
    });
    box.appendChild(b);
  });
  syncCropInputs();
}

/** Shows the selected panel's crop values in the sliders. */
function syncCropInputs() {
  const p = state.panels[selectedPanel] ?? { zoom: 1, ox: 0, oy: 0 };
  $('zoom').value = p.zoom;
  $('offx').value = p.ox;
  $('offy').value = p.oy;
}

/** Renders the cover at `sizeKey` offscreen and downloads it as a PNG. */
export function exportCover(sizeKey) {
  const s = SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = s.w;
  off.height = s.h;
  renderCover(off.getContext('2d'), s.w, s.h, state);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `neon-coast-${sizeKey}-${s.w}x${s.h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve(blob);
    }, 'image/png');
  });
}

/** Exports all three post sizes, one after another. */
export async function exportAll() {
  for (const key of Object.keys(SIZES)) {
    await exportCover(key);
    $('status').textContent = `Saved ${key} (${SIZES[key].w} x ${SIZES[key].h})…`;
  }
  $('status').textContent = 'Saved all 3 sizes — portrait, square and landscape.';
}

/** Builds the layout, grade and size pickers. */
function buildPickers() {
  const layouts = $('layouts');
  for (const [key, def] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = def.label;
    b.dataset.layout = key;
    b.className = state.layout === key ? 'active' : '';
    b.addEventListener('click', () => {
      state.layout = key;
      document.querySelectorAll('#layouts button').forEach((x) => x.classList.toggle('active', x === b));
      if (selectedPanel >= panelRects(key, canvas.width, canvas.height).length) selectedPanel = 0;
      refreshSlots();
      render();
    });
    layouts.appendChild(b);
  }
  const grades = $('grades');
  for (const [key, def] of Object.entries(GRADES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `swatch ${key}${state.grade === key ? ' active' : ''}`;
    b.textContent = def.label;
    b.addEventListener('click', () => {
      state.grade = key;
      document.querySelectorAll('#grades .swatch').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
    grades.appendChild(b);
  }
  const sizes = $('sizes');
  for (const [key, s] of Object.entries(SIZES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.label;
    b.dataset.size = key;
    b.className = state.size === key ? 'active' : '';
    b.addEventListener('click', () => setSize(key));
    sizes.appendChild(b);
  }
}

/** Wires the remaining controls: uploads, sliders, caption, export, drag-and-drop. */
function wireControls() {
  $('upload').addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      const img = await loadImage(URL.createObjectURL(file));
      const index = addPhoto(img, file.name);
      if (state.panels[selectedPanel].photo === null) assignPhoto(index);
    }
    render();
    e.target.value = '';
  });
  for (const [id, key] of [['zoom', 'zoom'], ['offx', 'ox'], ['offy', 'oy']]) {
    $(id).addEventListener('input', (e) => {
      state.panels[selectedPanel][key] = Number(e.target.value);
      render();
    });
  }
  $('title').addEventListener('input', (e) => { state.title = e.target.value; render(); });
  $('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; render(); });
  $('exportOne').addEventListener('click', async () => {
    await exportCover(state.size);
    $('status').textContent = `Saved ${state.size} (${SIZES[state.size].w} x ${SIZES[state.size].h}).`;
  });
  $('exportAll').addEventListener('click', exportAll);
  $('shuffle').addEventListener('click', () => {
    const n = state.photos.length;
    if (!n) return;
    state.panels.forEach((p) => { p.photo = Math.floor(Math.random() * n); });
    refreshSlots();
    render();
  });
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    const rects = panelRects(state.layout, canvas.width, canvas.height);
    const hit = rects.findIndex((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
    if (hit >= 0) {
      selectedPanel = hit;
      refreshSlots();
    }
  });
  const zone = $('dropzone');
  zone.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => canvas.classList.remove('dragging'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    canvas.classList.remove('dragging');
    for (const file of e.dataTransfer.files) {
      if (!file.type.startsWith('image/')) continue;
      const img = await loadImage(URL.createObjectURL(file));
      assignPhoto(addPhoto(img, file.name));
    }
    render();
  });
}

/** Starts the editor: pickers, controls, sample photos, first render. */
export async function boot() {
  buildPickers();
  wireControls();
  refreshSlots();
  try {
    await document.fonts.load('100px Anton');
    await document.fonts.load('40px Pacifico');
  } catch { /* system fonts stand in */ }
  const boulevard = await loadSample('boulevard');
  const pier = await loadSample('pier');
  // Default cover: the two samples across the five panels. The hero panel sits
  // a touch low so a portrait photo keeps its subject's head in frame.
  state.panels[0].photo = boulevard;
  state.panels[0].oy = 0.12;
  state.panels[1].photo = pier;
  state.panels[2].photo = boulevard;
  state.panels[3].photo = pier;
  state.panels[4].photo = boulevard;
  refreshSlots();
  render();
  await document.fonts.ready;
  render();
  return { state, render, setSize, exportCover, loadSample };
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  boot().then((api) => runShot(shot, params, api));
} else {
  boot();
}
