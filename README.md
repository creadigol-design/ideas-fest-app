# Ideas Fest 2026 · vedrí companion

A small installable web app (PWA) for vedrí at **Ideas Fest 2026, Champneys Tring, 9–10 September**.

It shows what's on now and next from your plan, flags clashes, scores every session for relevance to vedrí, and reminds you before each planned session. No build step, no backend: it is plain HTML, CSS and JavaScript served from GitHub Pages.

## Use it

1. Open the app on your phone: `https://creadigol-design.github.io/ideas-fest-app/`
2. **Add to Home Screen** (iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Install app).
3. Open it from the Home Screen, go to **Alerts** and tap **Turn on reminders**.
4. On the **Plan** tab tap **Add all to Calendar (.ics)** as a belt-and-braces backup. Every session gets a native calendar alarm, which fires even if the app is closed.

## Tabs

- **Now** – countdown to gates before the event; during the event: what's on now, what's up next from your plan, and nearby vedrí-relevant sessions worth a detour.
- **Plan** – your starred sessions per day, with free gaps and clashes flagged, plus calendar export.
- **Agenda** – every loaded session, searchable, filtered by stage or by "Suggested for vedrí".
- **Info** – venue, hours, travel from DocShed, stages, why we're there, and the 15-second intro.
- **Alerts** – reminders, install help, agenda import, reset.

## Data

| File | What it holds |
|---|---|
| `data/event.json` | Dates, venue, hours, travel, stages, links |
| `data/sessions.json` | The agenda. Each session: `id`, `title`, `speakers[]`, `day` (YYYY-MM-DD), `start`/`end` (HH:MM, Europe/London), `stage`, `description`, `tags[]`, `url` |
| `data/plan.json` | `favourites[]` (session IDs, including the 28 from the ideasfest.uk `?plan=` link), `curation{}` (per-session fit + reason), and the vedrí `profile` used for scoring |

Session IDs in `favourites` are matched against `sessions.json`. The 28 UUIDs from the Ideas Fest plan link are already there, so once the matching sessions are added to `sessions.json` (same UUID as `id`) they light up in the plan automatically.

### Loading the full agenda

The official agenda lives at <https://ideasfest.uk/agenda-2026>. Either:

- **In the app**: Alerts → paste the copied agenda text or a JSON array of sessions → Import. Imported sessions are stored on that device only.
- **In the repo** (shared with everyone who opens the app): edit `data/sessions.json` and push. The app fetches data files network-first, so phones pick the change up on next open.

### vedrí fit scoring

`app.js` scores each session from keywords in its title, speakers, description and tags (video, content, brand, marketing, AI, funding, and so on). Levels: **core**, **good**, **maybe**, **skip**. Hand-written verdicts in `plan.json → curation` override the score, and a per-device override is available in each session's detail sheet.

## Reminders: what to expect

- In-app reminders use the Notification API through the service worker. They fire while the app is open or was recently used. On iPhone they require the app to be installed to the Home Screen (iOS 16.4+).
- The **.ics export** sets a proper calendar alarm on every planned session, which is the most reliable alert on any phone. Use both.

## Local development

Any static server works, for example:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080/?now=2026-09-09T10:00` to preview the "during the event" state at any time.

## Deployment

`.github/workflows/pages.yml` publishes the repo root to GitHub Pages on every push to `main` or a `claude/**` branch.
