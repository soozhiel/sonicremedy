const about = document.querySelector('#about');
const triggers = document.querySelectorAll('[data-about-trigger]');
const close = document.querySelector('[data-about-close]');

function setAbout(open, scroll = true) {
  about.hidden = !open;
  triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', String(open)));
  if (open && scroll) about.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

triggers.forEach((trigger) => {
  trigger.addEventListener('click', () => setAbout(about.hidden));
});

close.addEventListener('click', () => {
  setAbout(false, false);
  document.querySelector('.footer-about').focus();
});

document.querySelectorAll('.enter').forEach((link) => {
  link.addEventListener('click', () => link.classList.add('pressed'));
});
