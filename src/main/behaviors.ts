import { BrowserWindow, screen } from 'electron';
import { DuckState } from '../shared/types';
import { Behavior } from './behaviorParse';

interface Deps {
  getAvatar: () => BrowserWindow | null;
  setState: (s: DuckState) => void;
  hidePanel: () => void;
}

/** Plays the duck's tricks by moving the avatar window while the renderer animates the sprite. */
export function createBehaviors(deps: Deps) {
  let current = 0; // bumped to cancel whatever is playing
  let napping = false;

  function move(win: BrowserWindow, to: { x: number; y: number }, ms: number, arc: number, id: number): Promise<void> {
    const from = win.getBounds();
    const t0 = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (win.isDestroyed() || id !== current) {
          clearInterval(timer);
          return resolve();
        }
        const k = Math.min(1, (Date.now() - t0) / ms);
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k - 4 * arc * k * (1 - k);
        // setBounds with a fixed size avoids Windows DPI drift that setPosition can cause
        win.setBounds({ x: Math.round(x), y: Math.round(y), width: from.width, height: from.height });
        if (k >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, 16);
    });
  }

  const ms = (dx: number, pxPerSec: number) => Math.max(200, (Math.abs(dx) / pxPerSec) * 1000);

  async function perform(b: Behavior) {
    const win = deps.getAvatar();
    if (!win) return;
    const id = ++current;
    napping = false;

    if (b === 'wake') return deps.setState('idle');
    if (b === 'nap') {
      napping = true;
      return deps.setState('napping');
    }

    deps.hidePanel();
    const home = win.getBounds();
    const wa = screen.getDisplayMatching(home).workArea;
    const minX = wa.x;
    const maxX = wa.x + wa.width - home.width;

    if (b === 'run') {
      deps.setState('running left');
      await move(win, { x: minX, y: home.y }, ms(home.x - minX, 900), 0, id);
      if (id !== current) return;
      deps.setState('running');
      await move(win, { x: maxX, y: home.y }, ms(maxX - minX, 900), 0, id);
      if (id !== current) return;
      deps.setState('running left');
      await move(win, { x: home.x, y: home.y }, ms(maxX - home.x, 900), 0, id);
    } else if (b === 'hop') {
      const arc = Math.min(80, Math.max(0, home.y - wa.y));
      deps.setState('hopping left');
      for (let x = home.x; x > minX && id === current; ) {
        const nx = Math.max(minX, x - 260);
        await move(win, { x: nx, y: home.y }, 450, arc, id);
        x = nx;
      }
      if (id !== current) return;
      deps.setState('hopping');
      for (let x = minX; x < home.x && id === current; ) {
        const nx = Math.min(home.x, x + 260);
        await move(win, { x: nx, y: home.y }, 450, arc, id);
        x = nx;
      }
    } else if (b === 'somersault') {
      deps.setState('flip');
      await move(win, { x: home.x, y: home.y }, 1000, Math.min(70, Math.max(0, home.y - wa.y)), id);
    }
    if (id === current) deps.setState('idle');
  }

  return {
    perform,
    /** Stop whatever is playing (the caller sets the next state). */
    cancel() {
      current++;
      napping = false;
    },
    isNapping: () => napping
  };
}
