// Dev helper: stages every toy in a lively state and saves real in-game screenshots to
// store/screenshots/ through the dev server's POST /__shot endpoint.
// Usage (dev server, browser console): await captureShots('portrait')
window.captureShots = async function captureShots(tag = 'shot') {
  const app = window.__app;
  const backup = JSON.stringify(app.data);
  const ev = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0 });
  const key = (k) => app.onKey({ key: k, repeat: false, preventDefault() {} });
  const step = (n = 1) => { for (let i = 0; i < n; i++) app.update(1 / 60); app.render(); };
  const drag = (pts, hold = 0) => {
    app.onDown(ev(70, pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) { app.onMove(ev(70, pts[i][0], pts[i][1])); step(1); }
    step(hold);
    app.onUp(ev(70, pts[pts.length - 1][0], pts[pts.length - 1][1]), false);
  };
  const line = (x0, y0, x1, y1, n = 24) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  const save = (name) => new Promise((resolve) => {
    app.render();
    app.canvas.toBlob(async (b) => { await fetch(`/__shot?name=${tag}_${name}.png`, { method: 'POST', body: b }); resolve(); }, 'image/png');
  });
  const open = (id, variant = 0) => {
    app.data.hints[id] = 99;
    app.data.unlocked[id] = [0, 1, 2, variant].filter((v, i, a) => a.indexOf(v) === i);
    app.data.sel[id] = variant;
    app.openToy(id, true);
    step(5);
    return app.toy;
  };
  app.data.stars = 128;
  app.data.progress = 0.62;
  for (const id in app.data.opened) app.data.opened[id] = 1;

  app.goHome();
  step(40);
  app.menu.t = 5;
  await save('00_menu');

  const A = () => app.area;
  let t = open('popit');
  t.bubbles.forEach((b, i) => { if ((i * 7) % 5 < 2) { b.up = false; } });
  t.remaining = t.bubbles.filter((b) => b.up).length;
  app.getStat('pops') || app.stat('pops', 248);
  step(20);
  await save('01_popit');

  t = open('spinner', 2);
  t.omega = 38;
  step(12);
  await save('02_spinner');

  t = open('bubblewrap');
  let a = A();
  for (let k = 0; k < 3; k++) drag(line(a.x + a.w * 0.08, a.y + a.h * (0.3 + k * 0.17), a.x + a.w * 0.92, a.y + a.h * (0.34 + k * 0.17)));
  step(15);
  await save('03_bubblewrap');

  t = open('slime', 5);
  a = A();
  step(30);
  app.onDown(ev(71, a.x + a.w * 0.62, a.y + a.h * 0.5));
  for (let i = 0; i < 12; i++) { app.onMove(ev(71, a.x + a.w * (0.62 + i * 0.02), a.y + a.h * (0.5 - i * 0.008))); step(1); }
  await save('04_slime');
  app.onUp(ev(71, a.x + a.w * 0.86, a.y + a.h * 0.4), false);

  t = open('switches', 2);
  for (const k of ['1', '3', '4', '6', '8']) { key(k); step(4); }
  step(20);
  await save('05_switches');

  t = open('xylophone');
  t.buttons[0]?.onTap();
  step(5);
  for (const k of ['1', '1', '5']) { key(k); step(8); }
  await save('06_xylophone');
  t.buttons[0]?.onTap();

  t = open('sand');
  step(10);
  t.autoCut?.();
  step(14);
  await save('07_sand');

  t = open('balloons');
  step(240);
  a = A();
  const hit = t.balloons?.find((b) => !b.popped);
  if (hit) { app.onDown(ev(72, hit.x, hit.y)); app.onUp(ev(72, hit.x, hit.y), false); }
  step(6);
  await save('08_balloons');

  t = open('drums', 4);
  for (const k of ['1', '5', '9']) { key(k); step(2); }
  await save('09_drums');

  t = open('spinart');
  a = A();
  for (const [fx, fy] of [[0.5, 0.42], [0.3, 0.32], [0.62, 0.3], [0.45, 0.58], [0.7, 0.55]]) {
    const pts = Array.from({ length: 40 }, (_, i) => [a.x + a.w * fx + Math.sin(i / 6) * 18, a.y + a.h * fy + Math.cos(i / 6) * 18]);
    drag(pts, 0);
    step(25);
  }
  await save('10_spinart');

  t = open('zen', 3);
  a = A();
  const wave = (y0) => Array.from({ length: 60 }, (_, i) => [a.x + a.w * (0.1 + 0.8 * i / 59), a.y + a.h * y0 + Math.sin(i / 6) * a.h * 0.04]);
  drag(wave(0.25));
  drag(wave(0.72));
  step(90);
  await save('11_zen');

  t = open('cradle', 1);
  key(' ');
  step(48);
  await save('12_cradle');

  app.goHome();
  step(40);
  app.applySave(backup);
  app.saveNow();
  return 'done';
};
