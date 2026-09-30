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

## Notes

- TeacherEase has no public API — the scraper is the most fragile piece and the one
  most likely to need maintenance after a TeacherEase UI change.
- The budget module depends on Era Context's REST API being available on your plan —
  treat step 8 as a feasibility spike before committing to the rest of Module 3.
- This must run locally (not in a cloud session): it stores real login credentials,
  real bank API keys, and sends real email on a schedule.
