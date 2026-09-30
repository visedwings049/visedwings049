# Personal Dashboard — CLAUDE.md

This file orients a local Claude Code session (or any contributor) working on this repo.
This project must be run **locally**, not in a cloud/remote session — it logs into
TeacherEase with real credentials, sends real email, and is meant to run on a daily
schedule on the owner's own machine.

## What this is

A Streamlit dashboard, growing module by module:

1. **Goals tracker** — log personal goals, check them off daily, see streaks, get a
   daily email summary.
2. **Wade's grades (TeacherEase)** — scrape TeacherEase for Wade's current grades and
   assignment list, flag missing/late work with days-past-due, get a daily email summary.
3. **Budget & spending** — pull transactions/balances from Era Context's REST API,
   set budgets per category, track spend vs. budget, get a report email.
4. **Card Hunting (TCG deal finder)** — across Star Wars Unlimited, Cyberpunk CCG,
   Lorcana, One Piece, Pokemon, and Magic: The Gathering: track cards worth $30+
   (market value imported from a Collectr collection export, filtered to $30+ before
   export) and surface active eBay listings priced $15+ under that value.
   Active-listing data source (eBay Browse API vs. scraping) is still undecided —
   see `docs/ACTION_PLAN.md` Module 4.
5. **Rip Hunters inventory & value** — not yet scoped here; there's already a local
   Streamlit page for this on the owner's machine that a local session should locate
   before deciding whether to keep it standalone or fold it into this dashboard.

See the full architecture and build order in `docs/ACTION_PLAN.md`.

## Stack

- Streamlit (UI)
- SQLite + SQLAlchemy (local storage, `data/dashboard.db`, gitignored)
- Playwright (TeacherEase login + scrape — no public API exists)
- `smtplib` via Gmail app password (email delivery)
- OS-level scheduler (cron on Linux/Mac, Task Scheduler on Windows) to trigger the
  daily scrape + email job — Streamlit itself does not run background jobs

## Secrets — never commit these

All credentials go in a local `.env` file (already gitignored). Copy `.env.example` to
`.env` and fill in:

- `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` — Gmail SMTP app password, not your real
  Google password (generate one at https://myaccount.google.com/apppasswords)
- `TEACHEREASE_USERNAME`, `TEACHEREASE_PASSWORD`
- `ERA_CONTEXT_API_KEY` — for the budget module's transaction/balance pulls
  (requires REST API access on your Era Context plan)
- `REPORT_TO_EMAIL` — where daily reports get sent

Never print these, log them, or put them in commit messages.

## Running locally

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env               # then fill in real values
streamlit run app.py
```

To run the daily scrape + email job manually:

```bash
python scheduler/run_daily.py
```

To schedule it daily (Linux/Mac example, 7am):

```
0 7 * * * cd /path/to/repo && .venv/bin/python scheduler/run_daily.py
```

## Conventions

- Each tracked domain lives in its own `modules/<name>/` folder with `models.py`
  (SQLAlchemy tables) and `service.py` (business logic) — keeps future modules
  (beyond goals/grades) isolated from each other.
- The TeacherEase scraper is the most fragile piece (no public API, subject to UI
  changes) — keep all page-specific selectors contained in
  `modules/grades/scraper.py` so breakage is easy to localize and fix.
- Email templates live in `modules/email/templates/` as Jinja2 `.html.j2` files.
- Don't add authentication/multi-user support, cloud deployment config, or other
  infrastructure not on the current build-order list — this is a single-user local
  app until explicitly asked to become more.
