// Vice Bay — drawing only: the city, cars, people, HUD, minimap and screens.
// The camera follows the player; the HUD and minimap are drawn in screen space.
import {
  BEACH_Y, CAR_H, CAR_W, COLORS, MAX_WANTED, PLACES, PLAYER_RADIUS, ROAD_FIRST,
  ROAD_GAP, ROAD_W, WATER_Y, WORLD_H, WORLD_W,
} from './config.js';
import { roadLines } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_STORY = 'story';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = 190;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };
  const fonts = new Map();

  function resize() {
    view.dpr = window.devicePixelRatio || 1;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
  }

  function text(value, x, y, size, color, align, bold) {
    const key = `${size}:${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function drawCar(x, y, angle, color, isPolice, dead) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2 + 4, CAR_W, CAR_H);
    ctx.fillStyle = dead ? '#3a3a3a' : color;
    ctx.beginPath();
    ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 6);
    ctx.fill();
    ctx.fillStyle = dead ? '#222' : '#bfe3f2';
    ctx.fillRect(-6, -CAR_H / 2 + 3, 14, CAR_H - 6);
    ctx.fillStyle = dead ? '#222' : '#20242a';
    ctx.fillRect(CAR_W / 2 - 10, -CAR_H / 2 + 2, 4, 5);
    ctx.fillRect(CAR_W / 2 - 10, CAR_H / 2 - 7, 4, 5);
    if (isPolice && !dead) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-CAR_W / 2 + 4, -CAR_H / 2 + 3, 10, 5);
      ctx.fillStyle = '#d23b2e';
      ctx.fillRect(-CAR_W / 2 + 4, CAR_H / 2 - 8, 10, 5);
    }
    ctx.restore();
  }

  function drawPed(x, y, angle, color, down, kind) {
    ctx.save();
    ctx.translate(x, y);
    if (down > 0) {
      ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = 0.8;
    }
    ctx.fillStyle = kind === 'boss' ? '#3a2a2a' : '#2a2f3a';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 4, Math.sin(angle) * 4, 7, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'rival' || kind === 'boss') {
      ctx.fillStyle = '#c23b2e';
      ctx.fillRect(-8, -14, 16, 4);
    }
    ctx.restore();
  }

  function drawWorld(world) {
    const state = world.state;
    const cam = state.camera;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const scale = Math.max(view.w / 1280, view.h / 720);
    const ox = view.w / 2 - cam.x * scale + shakeX;
    const oy = view.h / 2 - cam.y * scale + shakeY;
    ctx.setTransform(view.dpr * scale, 0, 0, view.dpr * scale, view.dpr * ox, view.dpr * oy);

    const vx0 = cam.x - view.w / scale / 2 - 60;
    const vy0 = cam.y - view.h / scale / 2 - 60;
    const vx1 = cam.x + view.w / scale / 2 + 60;
    const vy1 = cam.y + view.h / scale / 2 + 60;

    // Ground.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // Parks.
    for (const park of world.parks) {
      if (park.x > vx1 || park.y > vy1 || park.x + park.w < vx0 || park.y + park.h < vy0) continue;
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Beach and water.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(vx0, BEACH_Y, vx1 - vx0, WATER_Y - BEACH_Y);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(vx0, WATER_Y, vx1 - vx0, WORLD_H - WATER_Y);
    ctx.fillStyle = COLORS.waterDeep;
    for (let x = Math.floor(vx0 / 120) * 120; x < vx1; x += 120) {
      ctx.fillRect(x, WATER_Y + 40 + ((x / 120) % 3) * 60, 60, 6);
    }
    // Roads.
    ctx.fillStyle = COLORS.road;
    for (const line of roadLines()) {
      ctx.fillRect(line - ROAD_W / 2, 0, ROAD_W, WORLD_H);
      ctx.fillRect(0, line - ROAD_W / 2, WORLD_W, ROAD_W);
    }
    ctx.fillStyle = COLORS.sidewalk;
    for (const line of roadLines()) {
      ctx.fillRect(line - ROAD_W / 2 - 10, 0, 10, WORLD_H);
      ctx.fillRect(line + ROAD_W / 2, 0, 10, WORLD_H);
      ctx.fillRect(0, line - ROAD_W / 2 - 10, WORLD_W, 10);
      ctx.fillRect(0, line + ROAD_W / 2, WORLD_W, 10);
    }
    ctx.fillStyle = COLORS.lane;
    for (const line of roadLines()) {
      for (let d = 0; d < WORLD_H; d += 80) {
        if (d % 160 < 80) ctx.fillRect(line - 2, d, 4, 40);
        if (d % 160 < 80) ctx.fillRect(d, line - 2, 40, 4);
      }
    }
    // Trees.
    for (const tree of world.trees) {
      if (tree.x < vx0 || tree.x > vx1 || tree.y < vy0 || tree.y > vy1) continue;
      ctx.fillStyle = '#2f5c26';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f7a33';
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Buildings.
    for (const b of world.buildings) {
      if (b.x > vx1 || b.y > vy1 || b.x + b.w < vx0 || b.y + b.h < vy0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 5);
      if (b.label) {
        ctx.fillStyle = '#20242a';
        ctx.font = `700 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
      }
    }
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.5)';
    ctx.lineWidth = 5;
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(0.6, s.life / 5);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 10, s.y - Math.sin(s.angle) * 10);
      ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Pickups.
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 3;
      ctx.fillStyle = pk.kind === 'health' ? '#2fbf5a' : '#e0b13c';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + bob + 5);
    }
    // Cars.
    for (const car of state.cars) {
      if (car.x < vx0 || car.x > vx1 || car.y < vy0 || car.y > vy1) continue;
      drawCar(car.x, car.y, car.angle, car.color, false, car.dead);
    }
    for (const cop of state.police) {
      if (cop.onFoot) continue;
      if (cop.x < vx0 || cop.x > vx1 || cop.y < vy0 || cop.y > vy1) continue;
      drawCar(cop.x, cop.y, cop.angle, cop.color, true, cop.dead);
    }
    // Pedestrians and mission NPCs.
    for (const ped of state.peds) {
      if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPed(ped.x, ped.y, ped.angle, ped.color, ped.down, ped.kind);
    }
    for (const cop of state.police) {
      if (!cop.onFoot) continue;
      drawPed(cop.x, cop.y, cop.angle, '#1c2f6e', 0, 'cop');
      ctx.fillStyle = '#1c2f6e';
      ctx.fillRect(cop.x - 8, cop.y - 16, 16, 4);
    }
    // Bullets.
    ctx.fillStyle = '#ffe27a';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Player.
    const p = state.player;
    if (!p.inCar) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b13c';
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0d0b0';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 5, Math.sin(p.angle) * 5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2f3a';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 13, Math.sin(p.angle) * 13, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      drawCar(p.inCar.x, p.inCar.y, p.inCar.angle, p.inCar.color, p.inCar.kind === 'police', p.inCar.dead);
    }
    // Mission marker: pulsing beacon + floating diamond.
    const marker = state.mission ? state.mission.marker : null;
    if (marker) {
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
      ctx.strokeStyle = '#ffd94a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd94a';
      ctx.save();
      ctx.translate(marker.x, marker.y - 44);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    }
    // Marta's corner marker when no mission is active.
    if (state.mission && !state.mission.active && state.mission.index >= 0) {
      const g = state.mission.giver();
      ctx.fillStyle = '#7dff8a';
      ctx.save();
      ctx.translate(g.x, g.y - 40 + Math.sin(state.elapsed * 3) * 4);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
      ctx.fillStyle = '#20242a';
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('MARTA', g.x, g.y - 52);
    }
    // Floating score text.
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    return { scale, ox, oy };
  }

  function drawMinimap(world) {
    const state = world.state;
    const x0 = view.w - MINIMAP - 16;
    const y0 = view.h - MINIMAP - 16;
    const s = MINIMAP / WORLD_W;
    ctx.fillStyle = 'rgba(12,16,20,0.82)';
    ctx.beginPath();
    ctx.roundRect(x0 - 6, y0 - 6, MINIMAP + 12, MINIMAP + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, MINIMAP, MINIMAP);
    ctx.clip();
    ctx.fillStyle = '#4c7a3d';
    ctx.fillRect(x0, y0, MINIMAP, MINIMAP);
    ctx.fillStyle = '#2f6fb2';
    ctx.fillRect(x0, y0 + WATER_Y * s, MINIMAP, (WORLD_H - WATER_Y) * s);
    ctx.fillStyle = '#3a3d42';
    for (const line of roadLines()) {
      ctx.fillRect(x0 + (line - ROAD_W / 2) * s, y0, ROAD_W * s, MINIMAP);
      ctx.fillRect(x0, y0 + (line - ROAD_W / 2) * s, MINIMAP, ROAD_W * s);
    }
    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * s, y0 + y * s, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of state.cars) if (!car.dead) dot(car.x, car.y, '#cfd6de', 2);
    for (const cop of state.police) if (!cop.dead) dot(cop.x, cop.y, '#4f8cff', 3);
    const marker = state.mission ? state.mission.marker : null;
    if (marker) dot(marker.x, marker.y, '#ffd94a', 5);
    dot(state.player.x, state.player.y, '#e8b13c', 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + state.player.x * s, y0 + state.player.y * s, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text('VICE BAY', x0 + 2, y0 - 10, 12, '#ffffff', 'left', true);
  }

  function drawHud(world, saveFlash) {
    const state = world.state;
    const p = state.player;
    ctx.fillStyle = 'rgba(12,16,20,0.75)';
    ctx.beginPath();
    ctx.roundRect(14, 14, 300, 96, 10);
    ctx.fill();
    text(`$${p.money}`, 28, 46, 26, '#7dff8a', 'left', true);
    // Health bar.
    ctx.fillStyle = '#3a0d0d';
    ctx.fillRect(28, 56, 180, 14);
    ctx.fillStyle = p.hp > 40 ? '#2fbf5a' : '#d23b2e';
    ctx.fillRect(28, 56, 180 * Math.max(0, p.hp / 100), 14);
    text(`HP ${Math.ceil(p.hp)}`, 216, 68, 14, '#ffffff', 'left', true);
    text(`AMMO ${p.ammo}`, 28, 96, 16, '#ffd94a', 'left', true);
    if (p.inCar) text(`${Math.round(Math.abs(p.inCar.speed) * 0.12)} km/h`, 216, 96, 16, '#ffffff', 'left');

    // Wanted stars, top right.
    ctx.fillStyle = 'rgba(12,16,20,0.75)';
    ctx.beginPath();
    ctx.roundRect(view.w - 210, 14, 196, 46, 10);
    ctx.fill();
    for (let i = 0; i < MAX_WANTED; i += 1) {
      text('★', view.w - 196 + i * 34, 46, 26, i < state.wanted ? '#ffd94a' : '#555c66', 'left', true);
    }
    // Clock.
    const hh = Math.floor(state.clockMinutes / 60) % 24;
    const mm = Math.floor(state.clockMinutes % 60);
    text(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, view.w - 196, 88, 18, '#ffffff', 'left', true);

    // Mission objective, top centre.
    if (state.mission) {
      const label = state.mission.label();
      ctx.fillStyle = 'rgba(12,16,20,0.75)';
      const w = Math.min(view.w - 40, 28 + label.length * 8.4);
      ctx.beginPath();
      ctx.roundRect((view.w - w) / 2, 14, w, 40, 10);
      ctx.fill();
      text(label, view.w / 2, 41, 17, '#ffd94a', 'center', true);
    }
    // Dialogue box.
    if (state.dialogue) {
      const d = state.dialogue;
      ctx.fillStyle = 'rgba(12,16,20,0.85)';
      ctx.beginPath();
      ctx.roundRect(14, view.h - 108, Math.min(view.w - 28, 760), 78, 10);
      ctx.fill();
      text(d.title, 30, view.h - 76, 17, '#7dff8a', 'left', true);
      text(d.text, 30, view.h - 50, 15, '#ffffff', 'left');
    }
    // Context hint: near a car or Marta.
    if (!p.inCar && state.mission && !state.mission.active && state.mission.index >= 0) {
      const g = state.mission.giver();
      if (Math.hypot(p.x - g.x, p.y - g.y) < 90) text('Press E — talk to Marta', view.w / 2, view.h - 130, 18, '#7dff8a', 'center', true);
    }
    if (!p.inCar) {
      let near = null;
      for (const car of state.cars) {
        if (!car.dead && Math.hypot(p.x - car.x, p.y - car.y) < 56) { near = car; break; }
      }
      if (near) text('Press E — get in the car', view.w / 2, view.h - 160, 18, '#ffffff', 'center', true);
    } else {
      text('E — get out   •   P — pause   •   M — mute', view.w / 2, view.h - 130, 15, '#cfd6de', 'center');
    }
    if (saveFlash > 0) text('✓ Progress saved', view.w - 30, view.h - MINIMAP - 40, 14, '#7dff8a', 'right', true);
    drawMinimap(world);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = Math.min(view.w - 40, 640);
    const h = 150 + lines.length * 30;
    const x = (view.w - w) / 2;
    const y = (view.h - h) / 2;
    ctx.fillStyle = 'rgba(10,14,18,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || '#ffd94a';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(title, view.w / 2, y + 64, 40, accent || '#ffd94a', 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], view.w / 2, y + 108 + i * 30, 18, '#dfe6ee', 'center');
    }
    text(prompt, view.w / 2, y + h - 26, 17, '#7dff8a', 'center', true);
  }

  function drawTitle(world, hasSave) {
    drawWorld(world);
    ctx.fillStyle = 'rgba(8,12,20,0.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    text('VICE BAY', view.w / 2, view.h / 2 - 236, 84, '#ffd94a', 'center', true);
    text('A top-down open-world crime story — an original game, no affiliation with any other series.', view.w / 2, view.h / 2 - 198, 16, '#dfe6ee', 'center');
    const lines = [
      'Rio the courier lost his van. Marta\'s crew needs a driver.',
      'Steal cars, outrun the patrols, run five missions — and take the bay.',
      '',
      'WASD / arrows — move & drive      Mouse — aim      Click — shoot',
      'Space — punch      E — enter / exit car, talk      Shift — run      P — pause      M — mute',
    ];
    if (hasSave) lines.push('A saved game is waiting — press C to continue it.');
    drawPanel('HOW TO PLAY', lines, hasSave ? 'Click or press Enter to start — C to continue' : 'Click or press Enter to start', '#ffd94a');
  }

  function draw(world, screen, opts) {
    opts = opts || {};
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, view.w, view.h);
    if (screen === SCREEN_TITLE) {
      drawTitle(world, !!opts.hasSave);
      return;
    }
    drawWorld(world);
    drawHud(world, opts.saveFlash || 0);
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(8,12,20,0.6)';
      ctx.fillRect(0, 0, view.w, view.h);
      drawPanel('PAUSED', ['The city waits for you.', `Money $${world.state.player.money}  •  Missions done: ${world.state.stats.missionsDone}`], 'Press P or Enter to resume');
    } else if (screen === SCREEN_BUSTED) {
      ctx.fillStyle = 'rgba(8,12,20,0.65)';
      ctx.fillRect(0, 0, view.w, view.h);
      drawPanel('BUSTED', ['The patrols caught up with you.', 'You wake up at St. Marina Hospital — lighter in the pocket.'], 'Press Enter to get back out there', '#4f8cff');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
