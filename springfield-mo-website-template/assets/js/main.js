// Loads data/business.json and populates every [data-bind] element on the page.
// To re-skin this template for a new client, edit data/business.json — you
// should not need to touch this file or index.html for a basic site.

async function loadBusinessData() {
  const res = await fetch('data/business.json');
  return res.json();
}

function bindText(root, data) {
  root.querySelectorAll('[data-bind]').forEach((el) => {
    const key = el.getAttribute('data-bind');
    const value = data[key];
    if (typeof value === 'string') el.textContent = value;
  });
}

function bindHrefs(root, data) {
  root.querySelectorAll('[data-bind-href]').forEach((el) => {
    const key = el.getAttribute('data-bind-href');
    const prefix = el.getAttribute('data-bind-href-prefix') || '';
    const value = data[key];
    if (typeof value === 'string') el.setAttribute('href', prefix + value);
  });
}

function renderServices(data) {
  const grid = document.getElementById('services-grid');
  grid.innerHTML = '';
  (data.services || []).forEach((service) => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `<h3></h3><p></p>`;
    card.querySelector('h3').textContent = service.title;
    card.querySelector('p').textContent = service.description;
    grid.appendChild(card);
  });
}

function renderTestimonials(data) {
  const grid = document.getElementById('testimonials-grid');
  grid.innerHTML = '';
  (data.testimonials || []).forEach((t) => {
    const card = document.createElement('div');
    card.className = 'testimonial-card';
    card.innerHTML = `<p class="quote"></p><p class="author"></p>`;
    card.querySelector('.quote').textContent = `“${t.quote}”`;
    card.querySelector('.author').textContent = t.author;
    grid.appendChild(card);
  });
}

function renderHours(data) {
  const list = document.getElementById('hours-list');
  list.innerHTML = '';
  (data.hours || []).forEach((h) => {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><span></span>`;
    const [dayEl, timeEl] = li.querySelectorAll('span');
    dayEl.textContent = h.days;
    timeEl.textContent = h.time;
    list.appendChild(li);
  });
}

function renderSocial(data) {
  const wrap = document.getElementById('social-links');
  wrap.innerHTML = '';
  const social = data.social || {};
  Object.keys(social).forEach((platform) => {
    const a = document.createElement('a');
    a.href = social[platform];
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);
    wrap.appendChild(a);
  });
}

function renderAddress(data) {
  const el = document.getElementById('address-line');
  if (!el || !data.address) return;
  const { street, city, state, zip } = data.address;
  el.textContent = `${street}, ${city}, ${state} ${zip}`;
}

function renderMap(data) {
  const frame = document.getElementById('map-frame');
  if (frame && data.mapEmbedSrc) frame.src = data.mapEmbedSrc;
}

function setupNav() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('nav-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function setupForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('This demo form isn\'t connected yet. See README.md for how to wire it up (Formspree, Netlify Forms, etc).');
  });
}

document.getElementById('year').textContent = new Date().getFullYear();
setupNav();
setupForm();

loadBusinessData().then((data) => {
  document.title = `${data.businessName} — Springfield, MO`;
  bindText(document, data);
  bindHrefs(document, data);
  renderServices(data);
  renderTestimonials(data);
  renderHours(data);
  renderSocial(data);
  renderAddress(data);
  renderMap(data);
}).catch((err) => {
  console.error('Could not load data/business.json', err);
});
