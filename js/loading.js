/* ===== LOADING SCREEN ===== */

const screen = document.getElementById('loading-screen');

export function hideLoading() {
  setTimeout(() => screen.classList.add('fade-out'), 300);
}
