/* VibeKeeper — fetch, merge, filter, render */
(() => {
  'use strict';

  const YAML_PATH = 'projects.yml';
  const CACHE_KEY = 'vibekeeper.repos.v1';
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const DEFAULT_RECENT_MONTHS = 6;
  const PLATFORMS = ['web', 'ios', 'android', 'mobile', 'cli', 'library', 'api', 'desktop', 'game', 'data', 'other'];
  const STATUSES = ['idea', 'wip', 'shipped', 'paused', 'archived', 'unclassified'];

  const state = {
    rawYaml: '',
    config: null,
    projects: [],
    filters: { status: 'all', platform: 'all', search: '' },
    repoSlug: null, // e.g. "mikepitts25/VibeKeeper"
  };

  // ---- Utilities ----

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const sanitizeUrl = (u) => {
    if (!u) return null;
    try {
      const parsed = new URL(u, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch (_) { /* ignore */ }
    return null;
  };

  const relativeTime = (iso) => {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const diffSec = Math.round((then - Date.now()) / 1000);
    const units = [
      ['year', 60 * 60 * 24 * 365],
      ['month', 60 * 60 * 24 * 30],
      ['week', 60 * 60 * 24 * 7],
      ['day', 60 * 60 * 24],
      ['hour', 60 * 60],
      ['minute', 60],
    ];
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    for (const [unit, sec] of units) {
      if (Math.abs(diffSec) >= sec || unit === 'minute') {
        return rtf.format(Math.round(diffSec / sec), unit);
      }
    }
    return 'just now';
  };

  const monthsAgo = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.getTime();
  };

  // ---- Config & repo slug ----

  const deriveRepoSlug = (config) => {
    if (config && typeof config.github_repo === 'string' && config.github_repo.includes('/')) {
      return config.github_repo;
    }
    const host = window.location.hostname;
    const ghPages = host.match(/^([^.]+)\.github\.io$/i);
    if (ghPages) {
      const user = ghPages[1];
      const firstSeg = window.location.pathname.split('/').filter(Boolean)[0];
      if (firstSeg) return `${user}/${firstSeg}`;
    }
    if (config && config.username) return `${config.username}/VibeKeeper`;
    return 'mikepitts25/VibeKeeper';
  };

  const editYamlUrl = (repoSlug, lineNumber) => {
    const base = `https://github.com/${repoSlug}/edit/main/projects.yml`;
    return lineNumber ? `${base}#L${lineNumber}` : base;
  };

  const repoUrl = (repoSlug) => `https://github.com/${repoSlug}`;

  // ---- YAML loading ----

  const loadYaml = async () => {
    const res = await fetch(`${YAML_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${YAML_PATH}: HTTP ${res.status}`);
    const text = await res.text();
    state.rawYaml = text;
    const parsed = (typeof jsyaml !== 'undefined' && jsyaml.load(text)) || {};
    state.config = parsed;
    return parsed;
  };

  const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const lineForProject = (repoName) => {
    if (!state.rawYaml) return null;
    const lines = state.rawYaml.split('\n');
    // Match "  RepoName:" (2-space indent under `projects:`), case-insensitive.
    const re = new RegExp('^\\s{2}' + escapeRegex(repoName) + ':\\s*$', 'i');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) return i + 1;
    }
    // Fall back to the projects: key line so the editor at least scrolls near the list.
    for (let i = 0; i < lines.length; i++) {
      if (/^projects:\s*$/.test(lines[i])) return i + 1;
    }
    return null;
  };

  // ---- GitHub API ----

  const fetchRepos = async (username) => {
    const cached = readCache();
    if (cached && cached.username === username) return { repos: cached.repos, cachedAt: cached.cachedAt };

    const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`;
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('GitHub API rate limit hit. Try again in a few minutes.');
      if (res.status === 404) throw new Error(`GitHub user "${username}" not found.`);
      throw new Error(`GitHub API error: HTTP ${res.status}`);
    }
    const repos = await res.json();
    writeCache({ username, repos, cachedAt: Date.now() });
    return { repos, cachedAt: Date.now() };
  };

  const readCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.cachedAt) return null;
      if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
      return parsed;
    } catch (_) { return null; }
  };

  const writeCache = (obj) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (_) { /* storage full, ignore */ }
  };

  // ---- Merge ----

  const normalizeStatus = (s) => {
    if (!s) return null;
    const v = String(s).toLowerCase().trim();
    return STATUSES.includes(v) ? v : null;
  };
  const normalizePlatform = (p) => {
    if (!p) return null;
    const v = String(p).toLowerCase().trim();
    return PLATFORMS.includes(v) ? v : 'other';
  };

  // Returns an array of valid platform strings, or ['unknown'] if none.
  // Accepts meta.platforms (array or comma/space-separated string) and legacy
  // meta.platform (also scalar or comma-separated).
  const splitPlatformString = (s) => String(s).split(/[,\s/|]+/).map((x) => x.trim()).filter(Boolean);
  const normalizePlatforms = (meta) => {
    const raw = [];
    if (Array.isArray(meta?.platforms)) raw.push(...meta.platforms);
    else if (meta?.platforms) raw.push(...splitPlatformString(meta.platforms));
    if (meta?.platform) raw.push(...splitPlatformString(meta.platform));
    const cleaned = [];
    const seen = new Set();
    for (const p of raw) {
      const v = normalizePlatform(p);
      if (v && !seen.has(v)) { seen.add(v); cleaned.push(v); }
    }
    return cleaned.length ? cleaned : ['unknown'];
  };

  const mergeProjects = (repos, config) => {
    const metaMap = new Map();
    const rawProjects = (config && config.projects) || {};
    for (const [key, meta] of Object.entries(rawProjects)) {
      metaMap.set(String(key).toLowerCase(), meta || {});
    }
    const recentMonths = Number(config?.recent_months) || DEFAULT_RECENT_MONTHS;
    const recentCutoff = monthsAgo(recentMonths);

    const merged = [];
    for (const repo of repos) {
      const meta = metaMap.get(repo.name.toLowerCase()) || {};
      if (meta.hidden === true) continue;

      const pushedMs = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
      const isRecent = pushedMs >= recentCutoff;
      const pinned = meta.pin === true;

      if (!isRecent && !pinned) continue;

      let status;
      if (repo.archived) status = 'archived';
      else status = normalizeStatus(meta.status) || 'unclassified';

      merged.push({
        name: repo.name,
        description: repo.description || '',
        html_url: repo.html_url,
        homepage: sanitizeUrl(repo.homepage),
        language: repo.language || null,
        stars: repo.stargazers_count || 0,
        pushed_at: repo.pushed_at,
        archived: !!repo.archived,
        fork: !!repo.fork,
        status,
        platforms: normalizePlatforms(meta),
        vibe: meta.vibe || '',
        live_url: sanitizeUrl(meta.live_url) || sanitizeUrl(repo.homepage),
        featured: meta.featured === true,
        pin: pinned,
        hasMeta: metaMap.has(repo.name.toLowerCase()),
      });
    }
    return merged;
  };

  const sortProjects = (projects) => {
    return projects.slice().sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const statusOrder = { wip: 0, idea: 1, shipped: 2, paused: 3, unclassified: 4, archived: 5 };
      const sa = statusOrder[a.status] ?? 99;
      const sb = statusOrder[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      const pa = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
      const pb = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
      return pb - pa;
    });
  };

  // ---- Rendering ----

  const renderSummary = (projects) => {
    const counts = { total: projects.length };
    STATUSES.forEach((s) => { counts[s] = 0; });
    for (const p of projects) counts[p.status] = (counts[p.status] || 0) + 1;
    $$('.tile [data-count]').forEach((el) => {
      const key = el.getAttribute('data-count');
      el.textContent = counts[key] ?? 0;
    });
    $$('.tile').forEach((tile) => {
      const status = tile.dataset.status;
      tile.classList.toggle('is-active', status === state.filters.status);
    });
  };

  const renderPlatformBars = (projects) => {
    const counts = new Map();
    for (const p of projects) {
      for (const plat of p.platforms) counts.set(plat, (counts.get(plat) || 0) + 1);
    }
    const entries = PLATFORMS
      .map((name) => [name, counts.get(name) || 0])
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map(([, c]) => c));
    const list = $('#platform-bars');
    list.innerHTML = entries.map(([name, c]) => {
      const pct = Math.round((c / max) * 100);
      return `<li class="platform-bar">
        <span class="name">${escapeHTML(name)}</span>
        <span class="track"><span class="fill" style="width: ${pct}%"></span></span>
        <span class="count">${c}</span>
      </li>`;
    }).join('') || '<li class="platform-bar"><span class="name">—</span></li>';
  };

  const populatePlatformFilter = (projects) => {
    const used = new Set();
    for (const p of projects) for (const plat of p.platforms) used.add(plat);
    const sel = $('#platform-filter');
    const current = sel.value || 'all';
    const options = ['<option value="all">All platforms</option>'];
    PLATFORMS.forEach((name) => {
      if (used.has(name)) {
        options.push(`<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`);
      }
    });
    sel.innerHTML = options.join('');
    sel.value = used.has(current) || current === 'all' ? current : 'all';
  };

  const applyFilters = (projects) => {
    const { status, platform, search } = state.filters;
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (platform !== 'all' && !p.platforms.includes(platform)) return false;
      if (q) {
        const hay = `${p.name} ${p.description} ${p.vibe}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  const renderCards = (projects) => {
    const grid = $('#grid');
    const empty = $('#empty-state');

    if (!projects.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    grid.innerHTML = projects.map(cardHTML).join('');
  };

  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  const cardHTML = (p) => {
    const classes = ['card'];
    if (p.featured) classes.push('is-featured');
    if (p.status === 'unclassified') classes.push('is-unclassified');
    if (p.status === 'archived') classes.push('is-archived');

    const line = lineForProject(p.name);
    const editHref = editYamlUrl(state.repoSlug, line);
    const statusLabel = cap(p.status);

    const platformBadges = p.platforms
      .map((plat) => `<span class="badge badge-platform platform-${escapeHTML(plat)}">${escapeHTML(cap(plat))}</span>`)
      .join('');

    const links = [];
    if (p.html_url) links.push(`<a href="${escapeHTML(p.html_url)}" target="_blank" rel="noopener">GitHub ↗</a>`);
    if (p.live_url) links.push(`<a href="${escapeHTML(p.live_url)}" target="_blank" rel="noopener">Live ↗</a>`);

    const unclassifiedCta = p.status === 'unclassified'
      ? `<div class="unclass-actions">
           <button class="btn btn-ghost btn-sm suggest-btn" type="button" data-repo="${escapeHTML(p.name)}">✨ Suggest</button>
           <a class="tag-cta" href="${escapeHTML(editHref)}" target="_blank" rel="noopener">＋ Tag manually</a>
         </div>
         <div class="suggest-panel" data-panel="${escapeHTML(p.name)}" hidden></div>`
      : '';

    const vibe = p.vibe ? `<p class="card-vibe">${escapeHTML(p.vibe)}</p>` : '';
    const desc = p.description ? `<p class="card-desc">${escapeHTML(p.description)}</p>` : '';
    const meta = [];
    if (p.language) meta.push(`<span class="lang"><span class="lang-dot" style="background:${escapeHTML(colorForLang(p.language))}"></span>${escapeHTML(p.language)}</span>`);
    if (p.stars > 0) meta.push(`<span>★ ${p.stars}</span>`);
    if (p.pushed_at) meta.push(`<span title="${escapeHTML(new Date(p.pushed_at).toISOString())}">updated ${escapeHTML(relativeTime(p.pushed_at))}</span>`);
    if (p.fork) meta.push('<span>fork</span>');

    return `
      <article class="${classes.join(' ')}" data-name="${escapeHTML(p.name)}">
        <div class="card-head">
          <h3 class="card-title"><a href="${escapeHTML(p.html_url)}" target="_blank" rel="noopener">${escapeHTML(p.name)}</a></h3>
          <a class="card-edit" href="${escapeHTML(editHref)}" target="_blank" rel="noopener" title="Edit metadata on GitHub" aria-label="Edit ${escapeHTML(p.name)} on GitHub">✎</a>
        </div>
        <div class="badges">
          <span class="badge badge-status status-${escapeHTML(p.status)}">${escapeHTML(statusLabel)}</span>
          ${platformBadges}
        </div>
        ${desc}
        ${vibe}
        ${unclassifiedCta}
        <div class="card-meta">${meta.join('')}</div>
        ${links.length ? `<div class="card-links">${links.join(' · ')}</div>` : ''}
      </article>`;
  };

  // Small curated palette for common languages; falls back to gray.
  const colorForLang = (lang) => {
    const map = {
      JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8',
      Rust: '#dea584', Java: '#b07219', Kotlin: '#A97BFF', Swift: '#F05138',
      C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', Ruby: '#701516',
      PHP: '#4F5D95', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051',
      Dart: '#00B4AB', Elixir: '#6e4a7e', Haskell: '#5e5086', Lua: '#000080',
      'Jupyter Notebook': '#DA5B0B', Vue: '#41b883', Svelte: '#ff3e00',
    };
    return map[lang] || '#626a80';
  };

  const renderActiveFilterNote = () => {
    const note = $('#active-filter-note');
    const bits = [];
    if (state.filters.status !== 'all') bits.push(`status: ${state.filters.status}`);
    if (state.filters.platform !== 'all') bits.push(`platform: ${state.filters.platform}`);
    if (state.filters.search) bits.push(`search: “${state.filters.search}”`);
    if (!bits.length) { note.hidden = true; note.textContent = ''; return; }
    note.hidden = false;
    note.textContent = `Filtering by ${bits.join(' · ')}`;
  };

  const applyAndRender = () => {
    const visible = applyFilters(state.projects);
    renderCards(visible);
    renderActiveFilterNote();
    // Summary always reflects all merged projects, not filtered
    renderSummary(state.projects);
    // Clear any stale error banner from a previous render
    $('#error-state').hidden = true;
  };

  // ---- Platform detection (client-side, on demand) ----

  const detectPlatforms = async (owner, repo) => {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/`;
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Rate limited by GitHub. Try again in a few minutes.');
      if (res.status === 404) throw new Error('Repo is empty or not accessible.');
      throw new Error(`GitHub API error: HTTP ${res.status}`);
    }
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('Unexpected response from GitHub.');

    const files = new Set();
    const dirs = new Set();
    for (const it of items) {
      if (it.type === 'file') files.add(it.name.toLowerCase());
      else if (it.type === 'dir') dirs.add(it.name.toLowerCase());
    }
    const hasFile = (...names) => names.some((n) => files.has(n.toLowerCase()));
    const hasDir = (...names) => names.some((n) => dirs.has(n.toLowerCase()));
    const matchesFile = (re) => [...files].some((n) => re.test(n));
    const matchesDir = (re) => [...dirs].some((n) => re.test(n));

    const platforms = new Set();
    const signals = [];

    // iOS
    if (matchesDir(/\.xcodeproj$/)) { platforms.add('ios'); signals.push('.xcodeproj'); }
    if (matchesDir(/\.xcworkspace$/)) { platforms.add('ios'); signals.push('.xcworkspace'); }
    if (hasFile('podfile')) { platforms.add('ios'); signals.push('Podfile'); }

    // Android
    if (hasFile('androidmanifest.xml')) { platforms.add('android'); signals.push('AndroidManifest.xml'); }
    if (hasFile('build.gradle', 'build.gradle.kts') && (hasFile('gradlew') || hasDir('app'))) {
      platforms.add('android'); signals.push('build.gradle + gradlew/app/');
    }

    // Flutter → both
    if (hasFile('pubspec.yaml')) {
      platforms.add('ios'); platforms.add('android'); signals.push('pubspec.yaml (Flutter)');
    }

    // Game engines
    if (hasFile('project.godot')) { platforms.add('game'); signals.push('project.godot'); }
    if (hasDir('assets') && hasDir('projectsettings')) { platforms.add('game'); signals.push('Unity layout'); }
    if (hasFile('main.lua') && hasFile('conf.lua')) { platforms.add('game'); signals.push('LÖVE2D'); }

    // Rust
    if (hasFile('cargo.toml')) {
      if (hasDir('src-tauri')) { platforms.add('desktop'); signals.push('Tauri'); }
      else { platforms.add('library'); signals.push('Cargo.toml'); }
    }

    // Go
    if (hasFile('go.mod')) { platforms.add('cli'); signals.push('go.mod'); }

    // Node / Web
    if (hasFile('package.json')) {
      if (matchesFile(/^(next|vite|nuxt|astro|svelte|vue|remix|gatsby-config)\.config\.(js|ts|mjs|cjs)$/)) {
        platforms.add('web'); signals.push('JS web framework config');
      } else if (hasFile('electron.js') || hasDir('electron')) {
        platforms.add('desktop'); signals.push('Electron');
      } else {
        platforms.add('web'); signals.push('package.json');
      }
    }

    // Jekyll / plain web
    if (hasFile('_config.yml')) { platforms.add('web'); signals.push('_config.yml (Jekyll)'); }
    if (hasFile('index.html') && !platforms.has('web')) { platforms.add('web'); signals.push('index.html'); }

    // Python
    if (hasFile('setup.py') || hasFile('pyproject.toml')) {
      platforms.add('library'); signals.push('Python packaging');
    }

    // Data / notebooks
    if (matchesFile(/\.ipynb$/)) { platforms.add('data'); signals.push('Jupyter notebook'); }

    // Dockerfile → API (only if nothing else caught)
    if (hasFile('dockerfile') && platforms.size === 0) {
      platforms.add('api'); signals.push('Dockerfile');
    }

    return { platforms: [...platforms], signals };
  };

  const yamlQuote = (s) => {
    const str = String(s);
    if (/^[\w\-./: ]+$/.test(str) && !/^\d/.test(str) && str.trim() === str) return str;
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  };

  const yamlSnippetFor = (repoName, platforms) => {
    const indent = '  ';
    const lines = [`${indent}${repoName}:`];
    lines.push(`${indent}${indent}status: wip              # idea | wip | shipped | paused | archived`);
    if (platforms.length === 1) {
      lines.push(`${indent}${indent}platform: ${platforms[0]}`);
    } else if (platforms.length > 1) {
      lines.push(`${indent}${indent}platforms:`);
      for (const p of platforms) lines.push(`${indent}${indent}  - ${p}`);
    } else {
      lines.push(`${indent}${indent}# platform: other   # couldn't auto-detect — fill in manually`);
    }
    return lines.join('\n') + '\n';
  };

  const handleSuggestClick = async (btn) => {
    const repoName = btn.getAttribute('data-repo');
    const panel = document.querySelector(`.suggest-panel[data-panel="${CSS.escape(repoName)}"]`);
    if (!panel) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '…detecting';
    panel.hidden = false;
    panel.innerHTML = `<p class="suggest-status">Looking at files in <code>${escapeHTML(repoName)}</code>…</p>`;

    try {
      const [owner] = state.repoSlug.split('/');
      const { platforms, signals } = await detectPlatforms(owner, repoName);
      const yamlText = yamlSnippetFor(repoName, platforms);
      const line = lineForProject(repoName) || null;
      const editHref = editYamlUrl(state.repoSlug, line);

      const detectedBadges = platforms.length
        ? platforms.map((pl) => `<span class="badge badge-platform">${escapeHTML(cap(pl))}</span>`).join('')
        : '<span class="badge">No platform match — tag manually</span>';

      const signalList = signals.length
        ? `<p class="suggest-signals">Signals: ${signals.map(escapeHTML).join(', ')}</p>`
        : '';

      panel.innerHTML = `
        <div class="suggest-result">
          <div class="badges">${detectedBadges}</div>
          ${signalList}
          <pre class="suggest-yaml">${escapeHTML(yamlText)}</pre>
          <div class="suggest-actions">
            <button class="btn btn-primary btn-sm suggest-copy" type="button">Copy YAML</button>
            <a class="btn btn-ghost btn-sm" href="${escapeHTML(editHref)}" target="_blank" rel="noopener">Open editor ↗</a>
            <button class="btn btn-ghost btn-sm suggest-dismiss" type="button">Dismiss</button>
          </div>
        </div>`;

      const copyBtn = panel.querySelector('.suggest-copy');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(yamlText);
          copyBtn.textContent = 'Copied ✓';
          setTimeout(() => { copyBtn.textContent = 'Copy YAML'; }, 1500);
        } catch (_) {
          copyBtn.textContent = 'Copy failed';
        }
      });
      panel.querySelector('.suggest-dismiss').addEventListener('click', () => {
        panel.hidden = true;
        panel.innerHTML = '';
      });
    } catch (err) {
      panel.innerHTML = `<p class="suggest-error">${escapeHTML(err.message || 'Detection failed.')}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  // ---- Wiring ----

  const attachHandlers = () => {
    $$('.tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const s = tile.dataset.status;
        state.filters.status = state.filters.status === s ? 'all' : s;
        applyAndRender();
      });
    });
    $('#platform-filter').addEventListener('change', (e) => {
      state.filters.platform = e.target.value;
      applyAndRender();
    });
    $('#search').addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      applyAndRender();
    });
    $('#clear-filters').addEventListener('click', () => {
      state.filters = { status: 'all', platform: 'all', search: '' };
      $('#search').value = '';
      $('#platform-filter').value = 'all';
      applyAndRender();
    });
    // Event delegation for Suggest buttons (cards re-render so we can't bind per-card).
    $('#grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.suggest-btn');
      if (btn) handleSuggestClick(btn);
    });
  };

  const setHeaderLinks = () => {
    $('#edit-yaml').href = editYamlUrl(state.repoSlug);
    $('#repo-link').href = repoUrl(state.repoSlug);
  };

  const setCacheNote = (cachedAt) => {
    if (!cachedAt) return;
    const ageMin = Math.round((Date.now() - cachedAt) / 60000);
    $('#cache-note').textContent = ageMin <= 0
      ? 'fresh data'
      : `cached ${ageMin} min ago`;
  };

  const showError = (msg) => {
    $('#loading-state').hidden = true;
    const el = $('#error-state');
    el.hidden = false;
    el.textContent = msg;
  };

  // ---- Boot ----

  const boot = async () => {
    try {
      if (typeof jsyaml === 'undefined') {
        throw new Error('YAML parser failed to load. Check your network / CDN.');
      }

      const config = await loadYaml();
      state.repoSlug = deriveRepoSlug(config);
      setHeaderLinks();

      const username = config?.username;
      if (!username) throw new Error('Set `username:` in projects.yml.');

      const { repos, cachedAt } = await fetchRepos(username);
      setCacheNote(cachedAt);

      state.projects = sortProjects(mergeProjects(repos, config));

      populatePlatformFilter(state.projects);
      renderPlatformBars(state.projects);
      attachHandlers();

      $('#loading-state').hidden = true;
      applyAndRender();
    } catch (err) {
      console.error(err);
      showError(err.message || 'Something went wrong. Check the console.');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
