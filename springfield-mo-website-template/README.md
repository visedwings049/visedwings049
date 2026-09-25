# Springfield MO Small-Business Website Template

A single-page, mobile-responsive website template built for pitching and
delivering fast, affordable sites to Springfield, MO businesses that don't
have one yet (contractors, salons, repair shops, restaurants, etc).

No build tools, no framework, no dependencies beyond one Google Fonts link.
Open `index.html` in a browser (or serve the folder) and it works.

## How it's structured

```
index.html               Page markup (sections: hero, about, services,
                          testimonials, contact, footer)
assets/css/styles.css    All styling — theme colors are CSS variables at
                          the top of the file
assets/js/main.js        Loads data/business.json and fills in the page
data/business.json       All of the client's actual content (name, phone,
                          hours, services, testimonials, etc)
assets/img/              Images — swap the placeholder hero image here
```

## Re-skinning for a new client (10–15 minutes)

1. **Edit `data/business.json`** — business name, phone, email, address,
   hours, services, testimonials, social links, and the Google Maps
   embed URL (grab it from Google Maps → Share → Embed a map).
2. **Edit theme colors** — open `assets/css/styles.css` and change the
   values under `:root` at the top (`--color-primary`, `--color-accent`,
   etc) to match the client's brand.
3. **Swap the hero image** — replace `assets/img/hero-placeholder.svg`
   with a real photo of the business/work (keep the filename, or update
   the `<img src>` in `index.html`).
4. **Update the footer** — in `index.html`, replace "Your Web Design
   Business" in the footer with your own business name/link.
5. **Update `<title>` fallback and meta description** at the top of
   `index.html` (the JS also sets the tab title dynamically from the
   business name, but these are useful before JS loads and for SEO).

You should rarely need to touch the HTML or CSS structure itself — the
content lives in `business.json` and colors live in the `:root` block.

## Wiring up the contact form

The form currently just shows an alert on submit — it doesn't send
anywhere. Pick one:

- **Formspree** (easiest, free tier): create a form at formspree.io, then
  set `<form action="https://formspree.io/f/yourFormId" method="POST">`
  on `#contact-form` in `index.html` and remove the JS `preventDefault`
  handler in `assets/js/main.js` (`setupForm`).
- **Netlify Forms**: if hosting on Netlify, add `data-netlify="true"` and
  a hidden `form-name` input to the form; Netlify handles the rest.
- **Your own backend**: point the form at any endpoint that accepts a
  POST and forward the fields to email/SMS/CRM.

## Deploying a client site

Cheapest/fastest options for a static site like this:

- **Netlify** or **Vercel** — drag-and-drop the folder or connect a git
  repo; free tier is plenty for a small business site.
- **GitHub Pages** — push to a repo, enable Pages in repo settings.
- Point the client's existing domain (or a new one you register for
  them) at whichever host you use.

## Suggested workflow for finding clients

1. Drive/search Springfield, MO business categories on Google Maps —
   contractors, salons, auto shops, restaurants, tutors, cleaners — and
   note any with no "Website" button on their Maps listing.
2. Re-skin this template with a *mockup* using their real name, hours,
   and photos (found via their Google/Facebook listing) so you can show
   up with something finished, not a pitch deck.
3. Reach out (in person, phone, or via their Facebook page) and offer to
   publish the mockup for a flat fee or small monthly hosting fee.

## License

Use freely for your own client work — no attribution required.
