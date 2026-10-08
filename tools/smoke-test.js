// Dev smoke test — paste into the console (or load with ?smoke) on the dev server.
// Opens every toy, fuzzes it with random multi-touch, keys, toolbar buttons and every style,
// and reports errors and per-frame cost. The save data is restored afterwards.
window.runSmokeTest = async function runSmokeTest({ frames = 120 } = {}) {
  const app = window.__app;
  const { TOYS } = await import('../src/toys/index.js');
  const backup = JSON.stringify(app.data);
  const errors = [];
  const origError = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); origError(...a); };
  const ev = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0 });
  const rnd = (a, b) => a + Math.random() * (b - a);
  const report = {};
  for (const T of TOYS) {
    const id = T.id;
    app.data.unlocked[id] = T.variants.map((_, i) => i);
    const t0 = app._errors;
    app.openToy(id, true);
    let worst = 0, total = 0, n = 0;
    const step = () => {
      const s = performance.now();
      app.update(1 / 60);
      app.render();
      const d = performance.now() - s;
      worst = Math.max(worst, d);
      total += d;
      n++;
    };
    for (let v = 0; v < T.variants.length; v++) {
      app.pickVariant(v);
      const a = app.area;
      for (let f = 0; f < frames / T.variants.length; f++) {
        if (f % 20 === 0) {
          // two fingers down, wander, up
          const p = [[rnd(a.x, a.x + a.w), rnd(a.y, a.y + a.h)], [rnd(a.x, a.x + a.w), rnd(a.y, a.y + a.h)]];
          p.forEach(([x, y], k) => app.onDown(ev(50 + k, x, y)));
          for (let m = 0; m < 6; m++) {
            p.forEach((q, k) => {
              q[0] += rnd(-40, 40);
              q[1] += rnd(-40, 40);
              app.onMove(ev(50 + k, q[0], q[1]));
            });
            step();
          }
          p.forEach(([x, y], k) => app.onUp(ev(50 + k, x, y), false));
        }
        if (f % 37 === 0) app.onKey({ key: ' ', repeat: false, preventDefault() {} });
        step();
      }
      // toolbar buttons
      for (const b of app.toy.buttons) {
        b.onTap();
        for (let k = 0; k < 10; k++) step();
        b.onTap();
        step();
      }
    }
    // resize while open (state must survive)
    app.resize();
    for (let k = 0; k < 5; k++) step();
    app.goHome();
    for (let k = 0; k < 30; k++) step();
    report[id] = { errors: app._errors - t0, avgMs: +(total / n).toFixed(2), worstMs: +worst.toFixed(1) };
  }
  console.error = origError;
  app.data = JSON.parse(backup);
  app.applySave(backup);
  app.saveNow();
  return { report, errors: errors.slice(0, 10), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
};
