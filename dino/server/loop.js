// 固定ステップのゲームループ（setInterval のブレを吸収）
import { performance } from 'node:perf_hooks';

export function startLoop(step, dt) {
  let last = performance.now();
  let acc = 0;
  const handle = setInterval(() => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= dt) {
      step();
      acc -= dt;
    }
  }, 1000 * dt);
  return () => clearInterval(handle);
}
