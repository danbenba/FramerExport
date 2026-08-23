export const UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Framer Export</title>
<style>
  :root {
    --bg: #0a0a0a;
    --bg-panel: #141414;
    --bg-element: #1e1e1e;
    --bg-hover: #232323;
    --text: #eeeeee;
    --muted: #808080;
    --primary: #fab283;
    --secondary: #5c9cf5;
    --accent: #9d7cd8;
    --success: #7fd88f;
    --warning: #f5a742;
    --error: #e06c75;
    --info: #56b6c2;
    --border: rgba(255, 255, 255, 0.10);
    --border-strong: rgba(255, 255, 255, 0.20);
    --radius: 5px;
    --font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.55;
    overflow-x: hidden;
  }
  ::selection { background: #f2f7c8; color: #131010; }
  #bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    opacity: 0.5;
    pointer-events: none;
  }
  .shell { position: relative; z-index: 1; min-height: 100%; display: flex; flex-direction: column; }
  header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    padding: 0 2.5rem;
    background: rgba(10, 10, 10, 0.82);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }
  .brand { font-size: 15px; }
  .brand .dim { color: var(--muted); }
  .brand .strong { color: var(--text); font-weight: 700; }
  .status { color: var(--muted); font-size: 12px; display: flex; align-items: center; gap: 8px; }
  .status .dot { color: var(--muted); }
  .status.running .dot { color: var(--warning); }
  .status.done .dot { color: var(--success); }
  .status.error .dot { color: var(--error); }
  main { flex: 1; padding: 2.5rem; max-width: 1180px; width: 100%; margin: 0 auto; }
  .screen { display: none; }
  .screen.active { display: block; }
  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; }
  .sub { color: var(--muted); margin-top: 0.4rem; margin-bottom: 2rem; }
  .sub .star { color: var(--primary); }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 1rem;
    padding-bottom: 3rem;
  }
  .card {
    position: relative;
    background: rgba(20, 20, 20, 0.86);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.1rem 1.2rem 1rem;
    cursor: pointer;
    transition: border-color .15s ease, background .15s ease, transform .1s ease;
  }
  .card:hover { border-color: var(--border-strong); background: rgba(30, 30, 30, 0.92); }
  .card:active { transform: scale(0.98); }
  .card .cat { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .card .cat .dot { font-size: 12px; }
  .card .name { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .badge-beta {
    font-size: 10px;
    font-weight: 700;
    color: var(--warning);
    border: 1px solid var(--warning);
    border-radius: 3px;
    padding: 1px 5px;
    letter-spacing: 0.04em;
  }
  .search-wrap { max-width: 420px; margin-bottom: 1.6rem; }
  .card .hint { font-size: 12px; color: var(--muted); margin-top: 8px; opacity: 0; transition: opacity .15s ease; }
  .card:hover .hint { opacity: 1; }
  .card.auto { border-style: dashed; }
  .cat-heading {
    grid-column: 1 / -1;
    margin-top: 1.2rem;
    color: var(--accent);
    font-weight: 700;
    font-size: 13px;
  }
  .cat-heading:first-child { margin-top: 0; }
  .panel {
    background: rgba(20, 20, 20, 0.9);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2rem;
    max-width: 640px;
  }
  .field-label { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
  input[type="text"] {
    width: 100%;
    background: var(--bg-element);
    color: var(--text);
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: 3px;
    font-family: var(--font);
    font-size: 14px;
    padding: 12px 14px;
    outline: none;
  }
  input[type="text"]:focus { border-color: var(--border-strong); border-left-color: var(--primary); }
  .error-line { color: var(--error); font-size: 12px; min-height: 18px; margin-top: 8px; }
  .row { display: flex; align-items: center; gap: 12px; margin-top: 1.6rem; }
  .btn {
    font-family: var(--font);
    font-size: 13px;
    padding: 9px 18px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    background: var(--bg-element);
    color: var(--text);
    box-shadow: 0 0 0 1px rgba(255,255,255,.10);
    transition: all .2s ease;
  }
  .btn:hover { box-shadow: 0 0 0 1px rgba(255,255,255,.22); }
  .btn:active { transform: scale(0.98); }
  .btn.primary { background: #f0efef; color: #131010; font-weight: 700; box-shadow: none; }
  .btn.primary:hover { background: #ffffff; }
  .btn.ghost { background: transparent; color: var(--muted); box-shadow: none; }
  .btn.ghost:hover { color: var(--text); }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-element);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 1.4rem;
  }
  .chip b { color: var(--primary); font-weight: 700; }
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 4px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
  }
  .opt:last-of-type { border-bottom: none; }
  .opt .box {
    width: 18px;
    height: 18px;
    flex: none;
    border: 1.5px solid var(--border-strong);
    border-radius: 3px;
    display: grid;
    place-items: center;
    color: transparent;
    font-size: 13px;
    font-weight: 700;
    transition: all .15s ease;
  }
  .opt.on .box { background: var(--primary); border-color: var(--primary); color: #131010; }
  .opt .label b { display: block; font-size: 14px; font-weight: 600; }
  .opt .label span { font-size: 12px; color: var(--muted); }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
  .seg button {
    font-family: var(--font);
    font-size: 12px;
    background: transparent;
    color: var(--muted);
    border: none;
    padding: 7px 16px;
    cursor: pointer;
  }
  .seg button.on { background: var(--primary); color: #131010; font-weight: 700; }
  .export-layout { display: flex; gap: 1.25rem; align-items: stretch; min-height: 62vh; }
  .term {
    flex: 1;
    min-width: 0;
    background: rgba(20, 20, 20, 0.94);
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: var(--radius);
    padding: 1rem 1.2rem;
    overflow-y: auto;
    max-height: 72vh;
    font-size: 12.5px;
    line-height: 1.7;
  }
  .term .ln { white-space: pre-wrap; word-break: break-all; }
  .term .t { color: var(--muted); }
  .term .lv-log { color: var(--primary); }
  .term .lv-info { color: var(--info); font-weight: 700; }
  .term .lv-warn { color: var(--warning); font-weight: 700; }
  .term .lv-ok { color: var(--success); }
  .term .lv-error { color: var(--error); font-weight: 700; }
  .term .msg { color: var(--text); }
  .side {
    width: 300px;
    flex: none;
    background: rgba(20, 20, 20, 0.94);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.2rem 1.3rem;
    align-self: flex-start;
    position: sticky;
    top: 84px;
  }
  .side h3 { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .side .sec { margin-bottom: 1.3rem; }
  .side .m { color: var(--muted); font-size: 12px; }
  .side .m.err { color: var(--error); }
  .side .file { color: var(--muted); font-size: 11.5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; direction: rtl; text-align: left; }
  .side .sumrow { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
  .side .sumrow b { color: var(--text); font-weight: 600; }
  .donebar { display: none; margin-top: 1.1rem; gap: 10px; flex-wrap: wrap; }
  .donebar.visible { display: flex; }
  .toast {
    position: fixed;
    top: 76px;
    right: 20px;
    z-index: 20;
    background: var(--bg-panel);
    border-left: 3px solid var(--success);
    border-right: 3px solid var(--success);
    padding: 10px 16px;
    font-size: 13px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity .2s ease;
    pointer-events: none;
  }
  .toast.show { opacity: 1; }
  footer {
    padding: 1.2rem 2.5rem;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    background: rgba(10, 10, 10, 0.82);
  }
  @media (max-width: 860px) {
    main { padding: 1.4rem; }
    .export-layout { flex-direction: column; }
    .side { width: 100%; position: static; }
  }
</style>
</head>
<body>
<canvas id="bg"></canvas>
<div class="shell">
  <header>
    <div class="brand"><span class="dim">framer</span><span class="strong">export</span></div>
    <div class="status" id="status"><span class="dot">●</span><span id="statusText">idle</span></div>
  </header>
  <main>
    <section class="screen active" id="screen-gallery">
      <h1>Select a tool</h1>
      <div class="sub"><span class="star">[*]</span> 25+ platforms supported. Click one, paste the URL, export.</div>
      <div class="search-wrap">
        <input type="text" id="searchInput" placeholder="search a platform..." spellcheck="false" autocomplete="off" />
      </div>
      <div class="grid" id="gallery"></div>
    </section>

    <section class="screen" id="screen-url">
      <div class="chip">tool <b id="urlTool"></b></div>
      <div class="panel">
        <h1>Site URL</h1>
        <div class="sub">The public URL of the site to export.</div>
        <div class="field-label">URL</div>
        <input type="text" id="urlInput" placeholder="https://mysite.framer.app" spellcheck="false" autocomplete="off" />
        <div class="error-line" id="urlError"></div>
        <div class="row">
          <button class="btn primary" id="urlNext">Continue</button>
          <button class="btn ghost" id="urlBack">Back</button>
        </div>
      </div>
    </section>

    <section class="screen" id="screen-options">
      <div class="chip">tool <b id="optTool"></b>&nbsp;&nbsp;url <b id="optUrl"></b></div>
      <div class="panel">
        <h1>Options</h1>
        <div class="sub">Everything has a sensible default.</div>
        <div class="opt on" id="optPretty">
          <div class="box">✓</div>
          <div class="label"><b>Pretty-print JS files</b><span>Reformat downloaded scripts for readability</span></div>
        </div>
        <div class="opt" id="optSubpages">
          <div class="box">✓</div>
          <div class="label"><b>Export sub-pages</b><span>Crawl internal links and mirror every page</span></div>
        </div>
        <div class="opt" style="cursor: default;">
          <div class="label" style="flex:1;"><b>Download concurrency</b><span>Parallel downloads</span></div>
          <div class="seg" id="optConcurrency">
            <button data-v="6">6</button>
            <button data-v="12" class="on">12</button>
            <button data-v="20">20</button>
          </div>
        </div>
        <div style="margin-top: 1.4rem;">
          <div class="field-label">Output directory</div>
          <input type="text" id="outInput" spellcheck="false" autocomplete="off" />
        </div>
        <div class="row">
          <button class="btn primary" id="startBtn">Start export</button>
          <button class="btn ghost" id="optBack">Back</button>
        </div>
      </div>
    </section>

    <section class="screen" id="screen-export">
      <div class="chip">tool <b id="runTool"></b>&nbsp;&nbsp;url <b id="runUrl"></b></div>
      <div class="export-layout">
        <div class="term" id="term"></div>
        <aside class="side">
          <div class="sec">
            <h3>Export</h3>
            <div class="m" id="sidePhase">starting</div>
            <div class="m" id="sideElapsed">0:00 elapsed</div>
          </div>
          <div class="sec">
            <h3>Assets</h3>
            <div class="m" id="sideAssets">0 downloaded</div>
            <div class="m err" id="sideFailed" style="display:none;"></div>
            <div class="m" id="sideWritten">0 files written</div>
          </div>
          <div class="sec">
            <h3>Files</h3>
            <div id="sideFiles"><div class="m">waiting for output...</div></div>
          </div>
          <div class="sec" id="sideSummarySec" style="display:none;">
            <h3>Summary</h3>
            <div id="sideSummary"></div>
          </div>
          <div class="donebar" id="donebar">
            <button class="btn" id="copyLogs">Copy logs</button>
            <button class="btn" id="copyServe">Copy serve command</button>
            <button class="btn ghost" id="newExport">New export</button>
          </div>
        </aside>
      </div>
    </section>
  </main>
  <footer>
    <span id="footLeft">framer-export</span>
    <span>[*] served locally · nothing leaves your machine</span>
  </footer>
</div>
<div class="toast" id="toast"></div>
<script src="/pixel-blast.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
