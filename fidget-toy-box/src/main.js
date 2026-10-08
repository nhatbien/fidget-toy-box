import { App } from './app.js';

const canvas = document.getElementById('game');
const app = new App(canvas);
app.boot();
// Handy for debugging in the console.
window.__app = app;
