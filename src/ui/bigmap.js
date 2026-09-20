/* ============================================================
   bigmap.js — full-screen map
   ============================================================ */
import { el, escapeHtml, clamp } from '../core/util.js';
import { openPanel, closePanel, panel, btn, refreshTop } from './menus.js';
import { WORLD, DISTRICTS } from '../world/layout.js';
import { RIDER_COLORS } from '../game/player.js';

export function openBigMap(game) {
  openPanel(() => {
    const body = el('div');
    const size = Math.min(660, Math.max(280, Math.min(window.innerWidth - 90, window.innerHeight - 250)));
    const wrap = el('div');
    wrap.style.cssText = `position:relative;width:${size}px;height:${size}px;margin:0 auto;border-radius:16px;overflow:hidden;border:1px solid #1e2740;background:#0a0f16`;

    const cv = el('canvas');
    cv.width = size; cv.height = size;
    cv.style.cssText = 'width:100%;height:100%;display:block';
    wrap.appendChild(cv);
    const g = cv.getContext('2d');
    g.drawImage(game.world.minimapCanvas, 0, 0, size, size);

    const toPx = (x, z) => [((x + WORLD.half) / WORLD.size) * size, ((z + WORLD.half) / WORLD.size) * size];

    // district labels
    g.textAlign = 'center';
    for (const d of DISTRICTS) {
      const [x, y] = toPx(d.x, d.z);
      g.font = '700 11px Inter, system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillText(d.name.toUpperCase(), x, y);
    }

    // POIs
    for (const p of game.world.pois) {
      const [x, y] = toPx(p.x, p.z);
      g.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
      g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 2; g.stroke();
      g.font = '800 10px Inter, system-ui, sans-serif';
      g.fillStyle = '#e7ecf7';
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 3;
      g.strokeText(p.name, x, y - 9);
      g.fillText(p.name, x, y - 9);
    }

    // quest markers
    for (const m of game.quests.markers()) {
      const [x, y] = toPx(m.x, m.z);
      g.fillStyle = m.color || '#ffd34d';
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 7, y + 5); g.lineTo(x - 7, y + 5); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2; g.stroke();
    }

    // other riders
    for (const r of game.remote.values()) {
      const [x, y] = toPx(r.cur.x, r.cur.z);
      g.fillStyle = '#' + RIDER_COLORS[r.colorIdx % RIDER_COLORS.length].toString(16).padStart(6, '0');
      g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
      g.strokeStyle = '#0a0f16'; g.lineWidth = 1.6; g.stroke();
    }

    // you
    const b = game.player.body;
    const [px, py] = toPx(b.pos.x, b.pos.z);
    g.save();
    g.translate(px, py); g.rotate(-b.yaw + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 6); g.lineTo(0, 3); g.lineTo(-6.5, 6); g.closePath(); g.fill();
    g.strokeStyle = '#0a0f16'; g.lineWidth = 1.6; g.stroke();
    g.restore();

    body.appendChild(wrap);

    const d = game.world.districtAt(b.pos.x, b.pos.z);
    const surf = game.world.surfaceProps(b.pos.x, b.pos.z);
    body.appendChild(el('div', '', `<div style="text-align:center;margin-top:12px;font-size:12px;color:#8592ad">
      You are in <b style="color:#e7ecf7">${escapeHtml(d ? d.name : 'the outskirts')}</b> ·
      ${escapeHtml(surf.name)} · ${Math.round(b.pos.y)} m elevation</div>`));

    const foot = el('div');
    foot.appendChild(el('div', '', `<span style="font-size:11.5px;color:#5c6883">Volta Bay — 2.4 km across</span>`));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({ title: 'Volta Bay', sub: 'map', body, foot });
  });
}
