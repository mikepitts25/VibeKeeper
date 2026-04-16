/* VibeKeeper — fetch, merge, filter, render */
(() => {
  'use strict';

  const YAML_PATH = 'projects.yml';
  const CACHE_KEY = 'vibekeeper.repos.v1';
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const DEFAULT_RECENT_MONTHS = 6;
  const PLATFORMS = ['web', 'mobile', 'cli', 'library', 'api', 'desktop', 'game', 'data', 'other'];
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
        platform: normalizePlatform(meta.platform),
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
    for (const p of projects) counts.set(p.platform, (counts.get(p.platform) || 0) + 1);
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
    const used = new Set(projects.map((p) => p.platform));
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
      if (platform !== 'all' && p.platform !== platform) return false;
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

  const cardHTML = (p) => {
    const classes = ['card'];
    if (p.featured) classes.push('is-featured');
    if (p.status === 'unclassified') classes.push('is-unclassified');
    if (p.status === 'archived') classes.push('is-archived');

    const line = lineForProject(p.name);
    const editHref = editYamlUrl(state.repoSlug, line);
    const statusLabel = p.status.charAt(0).toUpperCase() + p.status.slice(1);
    const platformLabel = p.platform.charAt(0).toUpperCase() + p.platform.slice(1);

    const links = [];
    if (p.html_url) links.push(`<a href="${escapeHTML(p.html_url)}" target="_blank" rel="noopener">GitHub ↗</a>`);
    if (p.live_url) links.push(`<a href="${escapeHTML(p.live_url)}" target="_blank" rel="noopener">Live ↗</a>`);

    const unclassifiedCta = p.status === 'unclassified'
      ? `<a class="tag-cta" href="${escapeHTML(editHref)}" target="_blank" rel="noopener">＋ Tag this project</a>`
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
          <span class="badge badge-platform">${escapeHTML(platformLabel)}</span>
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
    $$('.tile').forEach((tile) => {
      tile.classList.toggle('is-active', tile.dataset.status === state.filters.status);
    });
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
