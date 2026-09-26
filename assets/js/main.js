document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('nav-toggle');
  const body = document.body;

  if (toggle) {
    toggle.addEventListener('click', () => {
      const isOpen = body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.querySelectorAll('#nav-wrapper a').forEach((link) => {
      link.addEventListener('click', () => {
        body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
