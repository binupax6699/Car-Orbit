import { orbyMain } from './orby.js';

const screen = document.getElementById('loading-screen');

orbyMain.show();

export function hideLoading() {
  setTimeout(() => {
    screen.classList.add('fade-out');
    orbyMain.hide();
  }, 300);
}

export function showLoading() {
  screen.classList.remove('fade-out');
  orbyMain.show();
}
