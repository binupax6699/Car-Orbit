import { cars } from './cars.js';
import { loadCar } from './car.js';

const nav = document.getElementById('top-nav');
const menuBtn = document.getElementById('menu-btn');
const actions = document.getElementById('menu-actions');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const carsBtn = document.getElementById('cars-btn');
const carPanel = document.getElementById('car-panel');
const carGrid = document.getElementById('car-grid');
const carSearch = document.getElementById('car-search');
const carClose = document.getElementById('car-close');

// open/close the car panel
function setCarPanel(open) {
  carPanel.classList.toggle('open', open);
  carPanel.setAttribute('aria-hidden', !open);
  carsBtn.classList.toggle('active', open);
}

// open/close the dock
menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('menu-open');
  menuBtn.setAttribute('aria-expanded', open);
  actions.setAttribute('aria-hidden', !open);
  if (!open) setCarPanel(false);
});

// cars button the car panel
carsBtn.addEventListener('click', () => {
  setCarPanel(!carPanel.classList.contains('open'));
});

document.addEventListener('pointerdown', (e) => {
  if (!carPanel.classList.contains('open')) return;
  if (carPanel.contains(e.target) || carsBtn.contains(e.target)) return;
  setCarPanel(false);
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

// car list
let currentId = cars[0].id;
let busy = false;

function renderCars(filter = '') {
  carGrid.innerHTML = '';
  cars
    .filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach((c) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'car-card' + (c.id === currentId ? ' active' : '');
      card.innerHTML = `<span>${c.name}</span><img src="${c.thumb}" alt="${c.name}">`;
      card.addEventListener('click', () => selectCar(c.id));
      carGrid.appendChild(card);
    });
}

async function selectCar(id) {
  if (busy || id === currentId) return;
  busy = true;
  const ok = await loadCar(id, true);
  if (ok) currentId = id;
  busy = false;
  renderCars(carSearch.value);
}

carSearch.addEventListener('input', () => renderCars(carSearch.value));
carClose.addEventListener('click', () => setCarPanel(false));

renderCars();