// Fixed scenes for screenshots: ?shot=cover shows one exported cover full frame,
// ?shot=editor shows the editor with a sample photo loaded. The query picks the
// layout, grade, size, photo and caption, so every screenshot is the app's own
// drawing — never edited or composited. window.__shotReady fires once painted.
import { SIZES } from './cover.js';

/**
 * Sets up a screenshot scene.
 * `api` is the editor boot result { state, render, setSize, exportCover, loadSample }.
 */
export async function runShot(shot, query, api) {
  const { state, render } = api;
  const canvas = document.getElementById('preview');
  if (query.get('layout')) state.layout = query.get('layout');
  if (query.get('grade')) state.grade = query.get('grade');
  if (query.get('title')) {
    state.title = query.get('title');
    document.getElementById('title').value = state.title;
  }
  if (query.get('subtitle') !== null) {
    state.subtitle = query.get('subtitle') ?? '';
    document.getElementById('subtitle').value = state.subtitle;
  }
  const photo = query.get('photo') ?? 'pier';
  const sizeKey = query.get('size') ?? 'portrait';
  const size = SIZES[sizeKey] ?? SIZES.portrait;

  if (shot === 'cover') {
    // The cover alone, full frame, at the viewport's own pixels. A `photo`
    // query of pier / boulevard fills every panel with that sample; with no
    // photo query the panels keep the editor's alternating defaults.
    if (query.has('photo') && photo === 'pier') state.panels.forEach((p) => { p.photo = 1; });
    if (query.has('photo') && photo === 'boulevard') state.panels.forEach((p) => { p.photo = 0; });
    document.body.classList.add('shot-cover');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Match the requested export aspect by letterboxing the draw area.
    const targetAspect = size.w / size.h;
    const viewAspect = canvas.width / canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#12081d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let dw = canvas.width;
    let dh = canvas.height;
    let dx = 0;
    let dy = 0;
    if (viewAspect > targetAspect) {
      dw = Math.round(canvas.height * targetAspect);
      dx = Math.round((canvas.width - dw) / 2);
    } else {
      dh = Math.round(canvas.width / targetAspect);
      dy = Math.round((canvas.height - dh) / 2);
    }
    const { renderCover } = await import('./cover.js');
    // Draw the cover at the requested export aspect, then place it centred
    // in the viewport (already the right aspect, so no distortion).
    const off = document.createElement('canvas');
    off.width = dw;
    off.height = dh;
    renderCover(off.getContext('2d'), dw, dh, state);
    ctx.drawImage(off, dx, dy);
  } else {
    // The editor as the user sees it, with a sample photo loaded.
    api.setSize(sizeKey);
    if (photo === 'both') {
      state.panels.forEach((p, i) => { p.photo = i % 2; });
    }
    render();
  }
  await document.fonts.ready;
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
