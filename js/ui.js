const nav = document.getElementById('top-nav');
const menuBtn = document.getElementById('menu-btn');
const actions = document.getElementById('menu-actions');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// open/close the dock
menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('menu-open');
  menuBtn.setAttribute('aria-expanded', open);
  actions.setAttribute('aria-hidden', !open);
});

// fullscreen
if (!document.documentElement.requestFullscreen) {
  fullscreenBtn.hidden = true;
} else {
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.classList.toggle('is-open', !!document.fullscreenElement);
  });
}