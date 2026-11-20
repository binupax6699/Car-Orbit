const screen = document.getElementById('loading-screen');

export function hideLoading() {
  setTimeout(() => screen.classList.add('fade-out'), 300);
  
}

export function showLoading() {
  screen.classList.remove('fade-out');
}
