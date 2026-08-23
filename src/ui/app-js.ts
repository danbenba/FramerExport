export const APP_JS = `(function () {
  var CAT_COLORS = {
    builder: 'var(--primary)',
    landing: 'var(--warning)',
    cms: 'var(--info)',
    course: 'var(--accent)',
    ecommerce: 'var(--success)',
    ai: 'var(--secondary)'
  };
  var state = {
    tool: null,
    toolLabel: 'Auto-detect',
    url: '',
    pretty: true,
    subpages: false,
    concurrency: 12,
    outDir: '',
    running: false,
    serveCommand: '',
    startedAt: 0
  };
  var es = null;
  var elapsedTimer = null;

  function $(id) { return document.getElementById(id); }
  function show(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    $('screen-' + name).classList.add('active');
    window.scrollTo(0, 0);
  }
  function setStatus(kind, text) {
    var el = $('status');
    el.className = 'status ' + kind;
    $('statusText').textContent = text;
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (e) { toast('copy failed'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  if (window.PixelBlast) {
    window.PixelBlast.mount($('bg'), {
      variant: 'circle',
      pixelSize: 5,
      color: '#FAB283',
      patternScale: 3,
      patternDensity: 1.1,
      pixelSizeJitter: 0.4,
      rippleIntensityScale: 1.4,
      rippleSpeed: 0.4,
      rippleThickness: 0.12,
      speed: 0.5,
      edgeFade: 0.18
    });
  }

  var galleryData = null;

  function renderGallery(filter) {
    if (!galleryData) return;
    var q = (filter || '').trim().toLowerCase();
    var grid = $('gallery');
    grid.innerHTML = '';
    if (!q) {
      var auto = document.createElement('div');
      auto.className = 'card auto';
      auto.innerHTML = '<div class="cat"><span class="dot" style="color: var(--muted)">●</span>smart</div>' +
        '<div class="name">Auto-detect</div>' +
        '<div class="hint">figure out the platform from the URL</div>';
      auto.onclick = function () { pickTool(null, 'Auto-detect'); };
      grid.appendChild(auto);
    }
    var any = false;
    galleryData.categories.forEach(function (cat) {
      var matches = cat.platforms.filter(function (p) {
        return !q || p.displayName.toLowerCase().indexOf(q) !== -1 || cat.label.toLowerCase().indexOf(q) !== -1;
      });
      if (!matches.length) return;
      any = true;
      var heading = document.createElement('div');
      heading.className = 'cat-heading';
      heading.textContent = cat.label;
      grid.appendChild(heading);
      matches.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'card';
        var color = CAT_COLORS[cat.id] || 'var(--muted)';
        var badge = p.beta ? '<span class="badge-beta">beta</span>' : '';
        card.innerHTML = '<div class="cat"><span class="dot" style="color: ' + color + '">●</span>' + cat.label + '</div>' +
          '<div class="name">' + p.displayName + badge + '</div>' +
          '<div class="hint">export a ' + p.displayName + ' site</div>';
        card.onclick = function () { pickTool(p.name, p.displayName); };
        grid.appendChild(card);
      });
    });
    if (!any && q) {
      var empty = document.createElement('div');
      empty.className = 'cat-heading';
      empty.style.color = 'var(--muted)';
      empty.textContent = 'No results found';
      grid.appendChild(empty);
    }
  }

  function loadGallery() {
    fetch('/api/platforms').then(function (r) { return r.json(); }).then(function (data) {
      galleryData = data;
      renderGallery('');
    });
  }

  $('searchInput').addEventListener('input', function () {
    renderGallery(this.value);
  });

  function pickTool(name, label) {
    state.tool = name;
    state.toolLabel = label;
    $('urlTool').textContent = label;
    $('urlError').textContent = '';
    show('url');
    $('urlInput').focus();
  }

  function validUrl(value) {
    try { new URL(value); return true; } catch (e) { return false; }
  }

  $('urlBack').onclick = function () { show('gallery'); };
  $('urlNext').onclick = function () {
    var value = $('urlInput').value.trim();
    if (!validUrl(value)) {
      $('urlError').textContent = 'Invalid URL. Enter a valid URL (https://...)';
      return;
    }
    state.url = value;
    $('optTool').textContent = state.toolLabel;
    $('optUrl').textContent = value;
    var q = '/api/derive?url=' + encodeURIComponent(value) + (state.tool ? '&platform=' + encodeURIComponent(state.tool) : '');
    fetch(q).then(function (r) { return r.json(); }).then(function (d) {
      $('outInput').value = './' + d.name;
      state.outDir = './' + d.name;
    });
    show('options');
  };
  $('urlInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('urlNext').click();
  });

  $('optPretty').onclick = function () {
    state.pretty = !state.pretty;
    this.classList.toggle('on', state.pretty);
  };
  $('optSubpages').onclick = function () {
    state.subpages = !state.subpages;
    this.classList.toggle('on', state.subpages);
  };
  var segButtons = $('optConcurrency').querySelectorAll('button');
  for (var i = 0; i < segButtons.length; i++) {
    segButtons[i].onclick = function () {
      for (var j = 0; j < segButtons.length; j++) segButtons[j].classList.remove('on');
      this.classList.add('on');
      state.concurrency = parseInt(this.getAttribute('data-v'), 10);
    };
  }
  $('optBack').onclick = function () { show('url'); };

  $('startBtn').onclick = function () {
    if (state.running) return;
    state.outDir = $('outInput').value.trim() || state.outDir;
    state.running = true;
    state.startedAt = Date.now();
    $('runTool').textContent = state.toolLabel;
    $('runUrl').textContent = state.url;
    $('term').innerHTML = '';
    $('donebar').classList.remove('visible');
    $('sideSummarySec').style.display = 'none';
    setStatus('running', 'exporting');
    show('export');
    startElapsed();
    connectEvents();
    fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: state.url,
        platform: state.tool,
        outDir: state.outDir,
        subpages: state.subpages,
        prettyPrint: state.pretty,
        concurrency: state.concurrency
      })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'export failed'); });
    }).catch(function (e) {
      appendLog({ time: '', level: 'error', message: e.message });
      setStatus('error', 'error');
      state.running = false;
      stopElapsed();
    });
  };

  function startElapsed() {
    stopElapsed();
    elapsedTimer = setInterval(function () {
      var s = Math.floor((Date.now() - state.startedAt) / 1000);
      var m = Math.floor(s / 60);
      var r = s % 60;
      $('sideElapsed').textContent = m + ':' + (r < 10 ? '0' : '') + r + ' elapsed';
    }, 1000);
  }
  function stopElapsed() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function appendLog(rec) {
    var term = $('term');
    var nearBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 60;
    var line = document.createElement('div');
    line.className = 'ln';
    var t = rec.time ? '[' + rec.time + '] ' : '';
    line.innerHTML = '<span class="t">' + t + '</span>' +
      '<span class="lv-' + rec.level + '">[' + rec.level + ']</span> ' +
      '<span class="msg"></span>';
    line.querySelector('.msg').textContent = rec.message;
    term.appendChild(line);
    while (term.childNodes.length > 3000) term.removeChild(term.firstChild);
    if (nearBottom) term.scrollTop = term.scrollHeight;
  }

  function renderProgress(p) {
    $('sidePhase').textContent = p.phase || 'starting';
    $('sideAssets').textContent = p.downloaded + (p.totalAssets ? '/' + p.totalAssets : '') + ' downloaded';
    if (p.failed > 0) {
      $('sideFailed').style.display = 'block';
      $('sideFailed').textContent = p.failed + ' failed';
    } else {
      $('sideFailed').style.display = 'none';
    }
    var written = p.written + ' files written';
    if (p.subpages > 0) written += ' · ' + p.subpages + ' sub-pages';
    $('sideWritten').textContent = written;
    var files = $('sideFiles');
    files.innerHTML = '';
    if (!p.recentFiles || p.recentFiles.length === 0) {
      files.innerHTML = '<div class="m">waiting for output...</div>';
    } else {
      p.recentFiles.forEach(function (f) {
        var d = document.createElement('div');
        d.className = 'file';
        d.textContent = f;
        files.appendChild(d);
      });
    }
  }

  function renderSummary(entries) {
    var el = $('sideSummary');
    el.innerHTML = '';
    entries.forEach(function (e) {
      if (!e.count) return;
      var row = document.createElement('div');
      row.className = 'sumrow';
      row.innerHTML = '<span>' + e.dir + '</span><b>' + e.count + ' ' + e.kind + '</b>';
      el.appendChild(row);
    });
    $('sideSummarySec').style.display = 'block';
  }

  function connectEvents() {
    if (es) return;
    es = new EventSource('/api/events');
    es.addEventListener('log', function (e) { appendLog(JSON.parse(e.data)); });
    es.addEventListener('progress', function (e) { renderProgress(JSON.parse(e.data)); });
    es.addEventListener('status', function (e) {
      var d = JSON.parse(e.data);
      if (d.state === 'done') {
        state.running = false;
        state.serveCommand = d.serveCommand || '';
        setStatus('done', 'done');
        stopElapsed();
        if (d.summary) renderSummary(d.summary);
        $('donebar').classList.add('visible');
        $('footLeft').textContent = d.outDir || 'framer-export';
      } else if (d.state === 'error') {
        state.running = false;
        setStatus('error', 'error');
        stopElapsed();
        appendLog({ time: '', level: 'error', message: d.error || 'export failed' });
        $('donebar').classList.add('visible');
      } else if (d.state === 'running') {
        setStatus('running', 'exporting');
      }
    });
  }

  $('copyLogs').onclick = function () {
    fetch('/api/log').then(function (r) { return r.text(); }).then(function (text) {
      copyText(text, 'logs copied');
    });
  };
  $('copyServe').onclick = function () {
    copyText(state.serveCommand || 'node serve.js', 'serve command copied');
  };
  $('newExport').onclick = function () {
    setStatus('idle', 'idle');
    show('gallery');
  };

  loadGallery();
})();
`;
