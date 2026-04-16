# VibeKeeper

A zero-backend dashboard for tracking vibe projects. Hosted on GitHub Pages.
Auto-discovers your public GitHub repos (last 6 months of activity), enriches
them with hand-curated metadata from `projects.yml`, and lets you update
statuses in seconds via GitHub's web editor.

**Live:** https://mikepitts25.github.io/VibeKeeper/ *(after enabling Pages — see below)*

## What it shows

- **Total count** and a breakdown by status: Idea · WIP · Shipped · Paused · Archived · Unclassified
- **Platform breakdown** as horizontal bars
- **Filterable project grid** — filter by status, platform, or free-text search (name / description / vibe note)
- **Per-card metadata**: status + platform badges, GitHub description, your vibe note, language, stars, last-push relative time, live URL

## Adding or updating a project

Edit [`projects.yml`](./projects.yml). From the dashboard you can click the
**✎ Edit projects.yml** button in the header, or the small **✎** on any card,
and you'll land in GitHub's web editor — works on mobile. Commit the change,
Pages rebuilds, you're done.

### Schema

```yaml
username: mikepitts25      # your GitHub username (required)
recent_months: 6           # auto-discovery window

projects:
  VibeKeeper:              # case-insensitive match against the repo name
    status: wip            # idea | wip | shipped | paused | archived
    platform: web          # web | mobile | cli | library | api | desktop | game | data | other
    vibe: The tracker itself.
    live_url: https://mikepitts25.github.io/VibeKeeper/
    featured: true         # pin to top of the grid
    pin: true              # keep showing even if last push > recent_months
    # hidden: true         # drop from the dashboard (forks, noise)
```

### Rules

- **Archived repos on GitHub** are always shown as *Archived* regardless of YAML.
- **New repos with no YAML entry** show as *Unclassified* with a "Tag this project" CTA.
- **Forks and old repos** (>6 months since last push) are hidden by default. Add `pin: true` to keep specific ones visible.
- **`hidden: true`** drops a repo entirely (e.g. noisy forks).

## Enabling GitHub Pages (one-time)

1. Push to the `main` branch.
2. Go to **Settings → Pages**.
3. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
4. Wait ~30s for the first deploy. Site URL appears at the top of that page.

## Running locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Because the page fetches `projects.yml` over HTTP and hits the GitHub API, you
do need an HTTP server — opening `index.html` via `file://` won't work.

## How it works

- `index.html` is a plain static page. No build step, no framework.
- `assets/js/app.js` fetches `projects.yml` (via `js-yaml` from CDN), then hits
  `https://api.github.com/users/<username>/repos` (unauthenticated, 60 req/hr).
- Responses are cached in `localStorage` for 10 minutes to avoid burning the
  rate limit on refreshes.
- The GitHub archive flag always wins over `projects.yml` for the Archived
  status so it "just works" when you archive a repo.

## File layout

```
index.html               Dashboard shell
assets/css/style.css     Theme
assets/js/app.js         Fetch / merge / filter / render
projects.yml             Your metadata (edit this to update statuses)
.nojekyll                Tell Pages to skip Jekyll processing
```

## Limitations

- Public repos only (unauthenticated API).
- GitHub's unauthenticated rate limit is 60 req/hr per IP. The 10-min
  `localStorage` cache keeps you well under it for personal use.
- Edit-link line anchors are best-effort (they locate the repo key in
  `projects.yml` by regex; GitHub's editor lands near the right line).
