# Personal Dashboard — Action Plan

Local-only Streamlit dashboard. More modules will be added beyond the ones below;
each new module follows the same `modules/<name>/` pattern.

## Architecture

```
dashboard/
  app.py                 # Streamlit entrypoint, page router
  pages/
    1_Goals.py
    2_Wade_Grades.py
    3_Budget.py
    4_Card_Hunting.py
    5_Rip_Hunters.py
  data/
    dashboard.db          # SQLite (local file, gitignored)
  modules/
    goals/
      models.py            # Goal, CheckIn tables
      service.py           # CRUD + streak/completion logic
    grades/
      scraper.py            # Playwright login + scrape of TeacherEase
      models.py              # Course, Assignment, GradeSnapshot tables
      service.py              # diff logic: new grades, missing work, days-past-due
    budget/
      era_client.py           # Era Context REST API client (transactions, balances)
      models.py                 # Budget, Category, CategoryMap tables (local cache/overrides)
      service.py                 # spend-vs-budget calc, categorization, alerts
    card_hunting/
      market_value.py          # derives current market value per card from eBay sold listings
      ebay_client.py             # active-listing source for card_hunting — TBD, see Module 4
      models.py                    # TrackedCard, MarketValueSnapshot, DealListing tables
      service.py                    # >=$30 filter, >=$15-under-market deal detection
    rip_hunters/
      # inventory/value module — references the existing local Rip Hunters Streamlit
      # page already on this machine; local Claude session locates and integrates it
    email/
      sender.py                # Gmail SMTP wrapper (app password, from .env)
      templates/
        goals_report.html.j2
        grades_report.html.j2
        budget_report.html.j2
  scheduler/
    run_daily.py            # cron/Task Scheduler entrypoint: scrape + check-ins + send emails
  config/
    settings.py              # env vars, secrets loader
  .env.example
  requirements.txt
```

**Stack:** Streamlit (UI) + SQLite via SQLAlchemy (storage) + Playwright
(TeacherEase login/scrape) + Era Context REST API (transactions/balances for the
budget module) + `smtplib` with a Gmail app password (email) + OS-level
cron/Task Scheduler (daily trigger — Streamlit doesn't run background jobs itself).

## Module 1 — Personal Goals Tracker

- **Data model:** `Goal(id, title, description, target_frequency, created_at, active)`,
  `CheckIn(id, goal_id, date, completed, note)`
- **Streamlit page:** add/edit goals, daily check-off grid, current streak per goal,
  weekly completion %
- **Daily email:** yesterday's completions/misses, current streaks, goals with no
  check-in in 3+ days flagged

## Module 2 — Wade's TeacherEase Grade Analysis

- **Scraper:** Playwright logs into TeacherEase with stored credentials, pulls current
  grades per class and the assignment list with due dates/status
- **Data model:** `Course(id, name, current_grade)`, `Assignment(id, course_id, name,
  due_date, status, points_possible, points_earned)`
- **Missing-work logic:** on each scrape, flag assignments with status =
  missing/not-submitted, compute `days_past_due = today - due_date`
- **Streamlit page:** grade summary per class, missing-work table sorted by days past
  due, trend view (grade over time from stored snapshots)
- **Daily email:** all current grades, missing assignments with days overdue, any
  grade that dropped since yesterday's snapshot

## Module 3 — Budget & Spending

- **Data source:** Era Context REST API (the account's connected bank data) —
  pulls transactions and balances. This is a *different* integration path than the
  MCP tools used inside this Claude session: the local app is a plain script/service,
  not a Claude session, so it authenticates to Era Context's REST API directly with
  its own API key. **Open item:** confirm your Era Context plan tier includes REST
  API access (per their docs, capabilities are gated by plan — See/Organize/
  Automate/Optimize), and generate an API key before building `era_client.py`.
- **Data model:** `Budget(id, category, monthly_limit, period_start)`,
  `CategoryOverride(transaction_id, category)` — local cache of Era Context
  transactions plus any manual category corrections, so budgets can be computed
  without re-hitting the API on every page load
- **Categorization:** use Era Context's own transaction categories as the default;
  allow manual override/recategorization in the Streamlit UI, stored locally so it
  survives re-syncs
- **Streamlit page:** set/edit monthly budgets per category, spending-vs-budget bars
  for the current period, transaction list filterable by category/date, trend view
  (spend per category over past months)
- **Daily or weekly email:** categories over/near budget, total spend vs. total
  budget for the period, biggest transactions since last report

## Module 4 — Card Hunting (TCG deal finder)

Games in scope: Star Wars Unlimited, Cyberpunk CCG, Lorcana, One Piece, Pokemon,
Magic: The Gathering.

- **Market value source:** derived in-house from **eBay sold/completed listings**
  (average of recent sold comps per card) rather than a third-party pricing API —
  decided so the module doesn't depend on TCGplayer/PriceCharting access.
  `market_value.py` computes and caches this per card.
- **Card universe filter:** only track cards whose computed market value is
  **$30 or greater**; anything below that threshold is ignored.
- **Active-listing source — OPEN ITEM, not yet decided:** the module needs a feed of
  *current, active* eBay listings to compare against market value (separate from the
  sold listings used for market value itself). Two paths considered, not chosen yet:
  - Official eBay Browse API (OAuth app credentials, ToS-compliant, rate-limited)
  - Scraping eBay search result pages (no signup, but against eBay's ToS, fragile to
    page-layout changes, and risky to run on a daily schedule)
  Decide this before building `ebay_client.py` — flagged as a feasibility spike in
  the build order below.
- **Deal detection:** `service.py` flags any active listing priced **$15 or more
  below** that card's current computed market value, per game.
- **Data model:** `TrackedCard(id, game, name, set, variant)`,
  `MarketValueSnapshot(card_id, value, computed_at, sample_size)`,
  `DealListing(card_id, ebay_item_id, price, discount_vs_market, found_at, url)`
- **Streamlit page:** browse tracked cards by game, current market value, list of
  live deal listings sorted by biggest discount, link out to each eBay listing
- **Report email:** new deals found since last run, sorted by discount size

## Module 5 — Rip Hunters Inventory & Value

- This module is **not being built fresh** — there's already a local Streamlit page
  for Rip Hunters card tracking on the owner's machine. A *local* Claude Code session
  (not this cloud one) can locate it directly and either read from it or fold it into
  this dashboard as its own page.
- **Open item:** once located locally, decide whether it stays a standalone page,
  gets moved into `modules/rip_hunters/`, or just gets linked/embedded from this
  dashboard.
- This entry exists so the module isn't forgotten while the rest of the plan is
  built out; no architecture decisions made here yet.

## Build order

1. Scaffold repo + SQLite models + empty Streamlit shell
2. Goals module end-to-end (CRUD, check-ins, page) — no external dependency, quick win
3. Goals daily email
4. TeacherEase scraper spike (log in, pull one course's grades — validate feasibility
   before building the full model)
5. Grades module: full scrape → store → Streamlit page
6. Grades daily email
7. Wire goals + grades into `run_daily.py` + cron
8. Confirm Era Context API access/tier, generate API key, spike `era_client.py`
   (pull one month of transactions — validate before building the full model)
9. Budget module: categories, budget-setting UI, spend-vs-budget page
10. Budget report email, wire into `run_daily.py`
11. Decide eBay active-listing access path (Browse API vs. scraping) — feasibility
    spike before writing `ebay_client.py`
12. Build `market_value.py` against eBay sold listings for a handful of test cards
    per game, validate the $30+ filter and averaging approach
13. Card Hunting module: full card universe per game, deal detection ($15+ under
    market), Streamlit page
14. Card Hunting report email, wire into `run_daily.py`
15. Locate the existing local Rip Hunters Streamlit page (local Claude session task)
    and decide standalone vs. integrated vs. linked

## Notes

- TeacherEase has no public API — the scraper is the most fragile piece and the one
  most likely to need maintenance after a TeacherEase UI change.
- The budget module depends on Era Context's REST API being available on your plan —
  treat step 8 as a feasibility spike before committing to the rest of Module 3.
- The Card Hunting module's active-listing source (Module 4) is still undecided —
  don't start `ebay_client.py` until step 11 resolves it.
- Rip Hunters (Module 5) requires a local session to locate the existing page; this
  cloud session has no access to the local filesystem where it lives.
- This must run locally (not in a cloud session): it stores real login credentials,
  real bank/marketplace API keys, and sends real email on a schedule.
