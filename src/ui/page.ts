import pkg from '../../package.json';

export const UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Framer Export</title>
<style>
  :root { --bg:#0a0a0a;--bg-panel:#141414;--bg-element:#1e1e1e;--text:#eee;--muted:#969696;--primary:#fab283;--accent:#9d7cd8;--success:#89c79a;--warning:#dfbc83;--error:#ed969e;--info:#86bac6;--border:#2b2b2b;--border-strong:#555;--radius:8px;color-scheme:dark }
  * { box-sizing:border-box }
  h1,h2,h3,p { margin-top:0 }
  h1 { margin-bottom:0 }
  body { margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.5 }
  button,input,select { font:inherit }
  button { cursor:pointer }
  button:disabled { cursor:default;opacity:.4 }
  .shell { min-height:100vh;display:flex;flex-direction:column }
  header { display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--border) }
  .status { display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted) }
  .status-dot { width:6px;height:6px;border-radius:50%;background:var(--muted) }
  .status.running .status-dot { background:var(--primary) }
  .status.done .status-dot { background:var(--success) }
  .status.error .status-dot { background:var(--error) }
  main { flex:1;width:100%;margin:0 auto }
  .screen { display:none }
  .screen.active { display:block }
  .sub { color:var(--muted) }
  .field-label { display:block;margin-bottom:9px;font-weight:500 }
  .error-line { min-height:20px;margin-top:7px;font-size:12px;color:var(--error) }
  .btn { border:1px solid var(--border);border-radius:7px;background:var(--bg-element);color:var(--text);padding:10px 18px;transition:background .15s,border-color .15s }
  .btn:hover { border-color:var(--border-strong) }
  .btn.primary { background:var(--primary);border-color:var(--primary);color:#23160e;font-weight:600 }
  .btn.primary:hover { background:#ffc399 }
  .btn.ghost { background:transparent }
  .btn.sm { padding:7px 12px;font-size:12px }
  .panel { border:1px solid var(--border);border-radius:var(--radius) }
  .opt { display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--border);cursor:pointer }
  .opt:last-child { border-bottom:0 }
  .term { border:1px solid var(--border);border-radius:var(--radius);padding:17px;overflow:auto;min-width:0;background:#101010;font-family:ui-monospace,SFMono-Regular,Consolas,monospace }
  .ln { white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:12px }
  .ln.success { color:var(--success) }.ln.warn { color:var(--warning) }.ln.error { color:var(--error) }.ln.info { color:var(--info) }.ln.muted { color:var(--muted) }
  .ln .t { color:#777 }.ln .lv-error,.err { color:var(--error) }.ln .lv-warn { color:var(--warning) }.ln .lv-success { color:var(--success) }.ln .lv-info { color:var(--info) }
  .side { border:1px solid var(--border);border-radius:var(--radius);padding:22px;min-width:0 }
  .side .sec+.sec { margin-top:22px }.side .lab { font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px }
  .side .val { font-size:13px;overflow-wrap:anywhere }.side .m { color:var(--muted) }.file { font-size:11px;color:var(--muted);padding:4px 0;overflow-wrap:anywhere }
  .sumrow { display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:4px 0 }
  .donebar { display:none;gap:8px;margin-top:20px;flex-wrap:wrap }.donebar.visible { display:flex }
  .toast { position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 16px;border:1px solid var(--border);border-radius:8px;background:#242424;color:var(--text);font-size:13px;opacity:0;pointer-events:none;transition:opacity .15s;z-index:20 }.toast.show { opacity:1 }
  footer { display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--border);font-size:11px;color:var(--muted) }
  :root { --font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --muted:#969696; --border:#2b2b2b; --radius:8px; }
  button, input, select { font:inherit; } button:disabled { opacity:.4; cursor:not-allowed; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid var(--primary); outline-offset:4px; }
  .step-button:focus-visible { outline-offset:-3px }
  .step-button:disabled { opacity:1;color:#777 }
  [hidden] { display:none!important; } input::placeholder { color:#696969; }
  header { height:76px; position:static; padding:0 max(28px,calc((100vw - 1044px)/2)); background:var(--bg); backdrop-filter:none; }
  .brand { display:flex; align-items:center; gap:12px; font-size:17px; font-weight:650; letter-spacing:-.3px; }
  .brand-mark { display:grid; place-items:center; width:31px; height:31px; background:var(--primary); color:#21140d; font:700 15px ui-monospace,monospace; border-radius:7px; }
  .top-actions { display:flex; align-items:center; gap:18px; } main { max-width:1100px; padding:38px 28px 54px; }
  .workspace-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:30px; }
  .eyebrow { font:11px ui-monospace,monospace; letter-spacing:1px; text-transform:uppercase; color:var(--primary); margin:0 0 9px; }
  .workspace-heading h1 { font-size:29px; font-weight:580; letter-spacing:-1px; } .workspace-note { color:var(--muted); font:11px ui-monospace,monospace; }
  h2 { font-size:21px; font-weight:570; letter-spacing:-.4px; margin-bottom:6px; } .screen-heading { margin-bottom:25px; } .screen-heading .sub { font-size:13px; margin:0; }
  .stepper { display:grid; grid-template-columns:repeat(4,1fr); list-style:none; margin:0 0 34px; padding:0; border:1px solid var(--border); border-radius:9px; overflow:hidden; background:var(--bg-panel); }
  .stepper li+li { border-left:1px solid var(--border); } .step-button { width:100%; border:0; background:transparent; color:var(--muted); display:flex; align-items:center; gap:11px; padding:17px 20px; text-align:left; min-height:67px; cursor:pointer; }
  .step-number { font:12px ui-monospace,monospace; width:24px; height:24px; display:grid; place-items:center; border:1px solid #3b3b3b; border-radius:50%; flex:none; }
  .step-button[aria-current="step"] { color:var(--text); background:#211a16; box-shadow:inset 0 -2px var(--primary); } .step-button[aria-current="step"] .step-number { background:var(--primary); border-color:var(--primary); color:#21150e; } .step-button.complete:not([aria-current="step"]) .step-number { color:var(--primary); border-color:#766250; } .step-label { font-size:12px; font-weight:550; }
  .toolbar { display:flex; gap:16px; align-items:flex-end; margin-bottom:20px; } .search-wrap { flex:1; max-width:420px; margin:0; }
  input[type="text"], input[type="url"], select { width:100%; background:var(--bg-panel); border:1px solid var(--border); border-radius:6px; padding:11px 13px; min-height:44px; color:var(--text); outline:none; font-size:14px; } input[type="text"]:focus { border-color:#555; }
  .field-label { display:block; } .view-toggle { display:flex; gap:3px; padding:3px; background:var(--bg-panel); border:1px solid var(--border); border-radius:7px; margin-left:auto; }
  .view-toggle button { border:0; border-radius:4px; color:var(--muted); background:transparent; padding:9px 13px; cursor:pointer; font-size:12px; } .view-toggle button[aria-pressed="true"] { color:var(--text); background:#303030; }
  .gallery { display:grid; gap:12px; } .gallery.cards { grid-template-columns:repeat(3,minmax(0,1fr)); } .provider { color:var(--text); border:1px solid var(--border); background:var(--bg-panel); border-radius:8px; text-align:left; position:relative; display:flex; gap:15px; align-items:flex-start; padding:20px; min-width:0; cursor:pointer; }
  .provider:hover { border-color:#505050; background:#191919; } .provider[aria-pressed="true"] { border-color:var(--primary); background:#201a16; } .provider-icon { width:38px; height:38px; padding:3px; border-radius:6px; object-fit:contain; flex:none; } .provider-copy { min-width:0; flex:1; }
  .provider-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:15px; font-weight:600; margin-bottom:5px; } .provider-description { color:var(--muted); font-size:12px; display:block; line-height:1.6; } .provider-category { display:block; color:#aaa; font:10px ui-monospace,monospace; margin-top:13px; text-transform:uppercase; letter-spacing:.5px; }
  .provider-check { position:absolute; right:15px; top:15px; color:var(--primary); font-size:13px; visibility:hidden; } .provider[aria-pressed="true"] .provider-check { visibility:visible; } .cards .provider { min-height:164px; padding-right:31px; }
  .gallery.list { grid-template-columns:1fr; } .list .provider { align-items:center; padding:14px 19px; min-height:82px; } .list .provider-icon { width:31px; height:31px; } .list .provider-title { margin-bottom:2px; } .list .provider-copy { display:grid; grid-template-columns:170px 1fr; align-items:center; gap:10px; } .list .provider-category { display:none; } .list .provider-check { position:static; width:16px; }
  .badge-beta { font:10px ui-monospace,monospace; font-weight:400; color:#d6bd97; padding:2px 5px; background:transparent; border:1px solid #5c4f3b; border-radius:3px; box-shadow:none; text-transform:none; letter-spacing:0; }
  .empty-state { grid-column:1/-1; min-height:180px; display:grid; place-content:center; text-align:center; color:var(--muted); border:1px dashed var(--border); border-radius:8px; } .empty-state b { color:var(--text); margin-bottom:6px; }
  .pagination { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-top:20px; color:var(--muted); font-size:12px; } .page-controls { display:flex; align-items:center; gap:12px; } .page-button { background:transparent; color:var(--text); border:1px solid var(--border); border-radius:5px; width:32px; height:32px; cursor:pointer; }
  .wizard-actions { border-top:1px solid var(--border); margin-top:28px; padding-top:22px; display:flex; align-items:center; justify-content:space-between; gap:18px; } .selection-note { font-size:12px; color:var(--muted); } .selection-note b { color:var(--text); font-weight:500; }
  .btn { border:1px solid var(--border); border-radius:6px; padding:10px 17px; min-height:40px; box-shadow:none; font-size:12px; font-weight:550; transition:background .15s; } .btn:active { transform:none; } .btn.primary { background:var(--primary); border-color:var(--primary); color:#23170f; } .btn.primary:hover { background:#ffc59f; } .btn.ghost { border-color:transparent; } .btn.small { padding:7px 11px; min-height:32px; }
  .panel { background:var(--bg-panel); max-width:720px; padding:27px; } .field+.field { margin-top:23px; } .field-hint { font-size:12px; color:var(--muted); margin-top:7px; } .provider-context { display:flex; align-items:center; gap:11px; margin-bottom:24px; font-size:12px; color:var(--muted); } .provider-context img { width:28px; height:28px; object-fit:contain; border-radius:4px; padding:2px; } .provider-context b { color:var(--text); font-weight:550; }
  .opt { justify-content:space-between; gap:25px; padding:18px 0; } .opt:first-child { padding-top:0; } .opt .label b { font-weight:550; } .opt .label span { display:block; margin-top:5px; } .opt input[type="checkbox"] { appearance:none; width:35px; height:20px; border-radius:12px; background:#353535; position:relative; border:1px solid #4a4a4a; flex:none; cursor:pointer; }
  .opt input[type="checkbox"]:before { content:''; display:block; position:absolute; left:3px; top:3px; width:12px; height:12px; background:#b2b2b2; border-radius:50%; } .opt input:checked { background:var(--primary); border-color:var(--primary); } .opt input:checked:before { transform:translateX(15px); background:#24180f; } .concurrency-field { margin-top:22px; max-width:240px; }
  .review { margin:0; } .review-row { display:grid; grid-template-columns:140px minmax(0,1fr) auto; gap:18px; align-items:start; padding:18px 0; border-bottom:1px solid var(--border); font-size:13px; } .review-row:first-child { padding-top:0; } .review-row:last-child { border-bottom:0; padding-bottom:0; } .review dt { color:var(--muted); } .review dd { margin:0; overflow-wrap:anywhere; } .review .mono { font:12px ui-monospace,monospace; } .review-note { font-size:12px; color:var(--muted); margin-top:21px; max-width:650px; }
  .export-layout { display:grid; grid-template-columns:minmax(0,1fr) 270px; gap:18px; min-height:0; } .term { background:var(--bg-panel); border-left:1px solid var(--border); min-height:430px; max-height:65vh; font:12px/1.75 ui-monospace,monospace; } .side { width:auto; position:static; background:var(--bg-panel); } .side .sec+.sec { border-top:1px solid var(--border); padding-top:18px; } .side h3 { font-size:12px; } .sumrow { gap:10px; } footer { font:10px ui-monospace,monospace; padding:18px max(28px,calc((100vw - 1044px)/2)); background:var(--bg); } #footLeft { overflow-wrap:anywhere; }
  .toast { top:auto; right:auto; bottom:26px; left:50%; transform:translateX(-50%); background:#27221e; border:1px solid #66503e; border-radius:7px; max-width:90vw; }
  dialog { background:var(--bg-panel); color:var(--text); border:1px solid #393939; border-radius:10px; padding:27px; width:min(520px,calc(100vw - 32px)); max-height:85vh; overflow:auto; margin:auto; } dialog::backdrop { background:#000b; } .dialog-heading { display:flex; justify-content:space-between; gap:18px; margin-bottom:24px; } .settings-grid { display:grid; gap:18px; } .settings-check { display:flex; justify-content:space-between; gap:15px; font-size:13px; } .settings-check input { accent-color:var(--primary); width:16px; height:16px; } .dialog-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:24px; } .settings-note { font-size:12px; color:var(--muted); } .load-error { border:1px solid #684046; padding:16px; border-radius:7px; color:var(--error); margin-bottom:20px; font-size:13px; }
  @media(max-width:800px) { .gallery.cards { grid-template-columns:repeat(2,minmax(0,1fr)); } .step-button { padding:15px 12px; gap:8px; } .step-label { font-size:11px; } .export-layout { grid-template-columns:1fr; } .workspace-note { display:none; } }
  @media(max-width:520px) { header { height:65px; padding:0 18px; } .brand { font-size:15px; } .top-actions { gap:8px; } .status { font-size:10px; } .settings-label { display:none; } main { padding:28px 18px 35px; } .workspace-heading h1 { font-size:25px; } .step-button { padding:12px 4px; flex-direction:column; gap:7px; min-height:79px; text-align:center; } .step-label { font-size:10px; } .step-number { width:21px; height:21px; font-size:10px; } .toolbar { flex-wrap:wrap; gap:12px; } .search-wrap { max-width:none; flex-basis:100%; } .view-toggle { margin-left:0; } .gallery.cards { grid-template-columns:1fr; } .cards .provider { min-height:118px; padding:18px 34px 18px 17px; } .provider-category { margin-top:8px; } .list .provider { padding:14px; } .list .provider-copy { display:block; } .list .provider-description { font-size:11px; } .pagination { gap:8px; font-size:11px; } .page-controls { gap:7px; } .panel { padding:20px; } .selection-note { max-width:45%; } .review-row { display:block; position:relative; padding-right:48px; } .review dt { margin-bottom:7px; } .review-row .btn { position:absolute; right:0; top:12px; } .review-row:first-child .btn { top:-5px; } footer { padding:17px 18px; flex-direction:column; gap:8px; } .term { font-size:11px; padding:13px; min-height:350px; } }
  .btn:not(:disabled):hover { border-color:#626262;background:#303030; }
  .btn.primary:not(:disabled):hover { border-color:#ffd1b1;background:#ffc59f; }
  .btn.ghost:not(:disabled):hover { border-color:#444;background:#242424; }
  .btn.danger { color:#ffc1c7;border-color:#74444a;background:#291b1d; }
  .btn.danger:not(:disabled):hover { border-color:#d08a93;background:#44262c; }
  .page-button:not(:disabled):hover,.view-toggle button:not(:disabled):hover { background:#303030;border-color:#626262;color:var(--text); }
  .view-toggle button[aria-pressed="true"]:hover { background:#434343; }
  .step-button:not(:disabled):hover { background:#252525;color:var(--text); }
  .step-button[aria-current="step"]:hover { background:#30231b; }
  .provider:not(:disabled):hover { border-color:#696969;background:#232323; }
  .provider[aria-pressed="true"]:hover { border-color:#ffd1b1;background:#33251c; }
  .gallery.list { max-height:min(560px,55vh);overflow-y:auto;overflow-x:hidden;padding:4px 10px 4px 4px;margin:-4px;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#686868 #202020;scroll-behavior:auto; }
  .gallery.list::-webkit-scrollbar { width:9px; }.gallery.list::-webkit-scrollbar-track { background:#202020;border-radius:5px; }.gallery.list::-webkit-scrollbar-thumb { background:#686868;border:2px solid #202020;border-radius:5px; }.gallery.list::-webkit-scrollbar-thumb:hover { background:#aaa; }
  .provider-icon,.provider-context img { image-rendering:auto; }
  .gallery-wrap { position:relative; }.gallery-wrap.list { padding-right:16px; }.gallery-wrap .gallery.list { scrollbar-width:none;padding-right:4px;margin-right:0; }.gallery-wrap .gallery.list::-webkit-scrollbar { display:none; }
  .provider-scroll { position:absolute;right:1px;top:0;bottom:0;width:7px;border-radius:5px;background:#252525;cursor:pointer;touch-action:none; }.provider-scroll:hover { background:#353535; }.provider-scroll-thumb { position:absolute;top:0;left:0;width:7px;min-height:22px;border-radius:5px;background:#727272; }.provider-scroll:hover .provider-scroll-thumb { background:#b5b5b5; }.provider-scroll:focus-visible { outline:2px solid var(--primary);outline-offset:3px; }
  .opt:hover { background:#1b1b1b; }.opt:hover input[type="checkbox"],.settings-check:hover input { outline:1px solid #aaa;outline-offset:3px; }
  input:not(:disabled):hover,select:not(:disabled):hover { border-color:#626262; }
  .dialog-heading { align-items:flex-start; }.dialog-heading .btn { flex:none; }.dialog-heading p { margin-bottom:0; }
  .settings-reset { border-top:1px solid var(--border);margin-top:22px;padding-top:20px;display:flex;align-items:center;justify-content:space-between;gap:16px; }.settings-reset p { margin:0;max-width:290px; }
  .help-sections { display:grid;gap:20px; }.help-sections h3 { font-size:14px;margin-bottom:6px; }.help-sections p { color:var(--muted);font-size:13px;margin-bottom:0; }.help-shortcuts { display:grid;grid-template-columns:100px 1fr;gap:8px;font-size:12px; }.help-shortcuts dt { color:var(--text); }.help-shortcuts dd { margin:0;color:var(--muted); } kbd { border:1px solid #555;border-radius:4px;padding:1px 5px;background:#242424;font:11px ui-monospace,monospace; }
  .tooltip { position:fixed;z-index:100;max-width:min(280px,calc(100vw - 16px));padding:7px 10px;border:1px solid #626262;border-radius:6px;background:#303030;color:#f5f5f5;box-shadow:0 3px 12px #0005;font-size:12px;line-height:1.4;pointer-events:none; }
  #pixelBackground { position:fixed;inset:0;width:100%;height:100%;opacity:.12;pointer-events:none;z-index:0;mask-image:linear-gradient(to bottom,#000,transparent 90%); }.shell { position:relative;z-index:1; } header { background:#0a0a0ae8; }
  .brand { display:flex;gap:0;font-size:29px;line-height:1;letter-spacing:-1.5px;cursor:default;user-select:none; }.brand span { color:#858585;font-weight:530; }.brand strong { color:#f5f5f5;font-weight:600; }
  main { padding-top:34px; }.screen.active { animation:screen-enter .2s ease-out; }dialog[open] { animation:dialog-enter .18s ease-out; }@keyframes screen-enter { from { opacity:.4;transform:translateY(4px); } to { opacity:1;transform:translateY(0); } }@keyframes dialog-enter { from { opacity:.4;transform:translateY(5px); } to { opacity:1;transform:translateY(0); } }
  button,.provider { transition:background .15s,border-color .15s,color .15s; } .step-number { font-variant-numeric:tabular-nums;font-weight:600;line-height:1; }.step-button[aria-current="step"] .step-number { color:#21150e!important;background:#fab283!important; }
  .btn.primary[aria-disabled="true"],.btn.primary[aria-disabled="true"]:hover { background:#292929;border-color:#404040;color:#aaa;cursor:not-allowed; }
  .review-layout { display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:18px; }.review-panel { max-width:none; }.review-provider { display:flex;align-items:center;gap:14px;padding-bottom:23px;margin-bottom:6px;border-bottom:1px solid var(--border); }.review-provider img { width:42px;height:42px;padding:3px;object-fit:contain;border-radius:6px; }.review-provider p { margin:0; }.review-provider .btn { margin-left:auto; }.review-provider-name { font-size:18px;font-weight:570; }.review-provider-label { color:var(--muted);font-size:11px; }.review .review-row { grid-template-columns:90px minmax(0,1fr) auto;gap:14px; }.review-aside { align-self:start; }.review-aside h3 { font-size:14px;margin-bottom:12px; }.review-aside p { font-size:12px;color:var(--muted);margin:0; }.review-aside .ready-mark { color:var(--success);font-size:24px;margin-bottom:10px; }
  .export-layout { display:block; }.side { padding:26px; }.side-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px; }.side-grid .sec+.sec { margin-top:0;border-top:0;padding-top:0; }.export-output { margin-top:24px;padding-top:20px;border-top:1px solid var(--border);font:12px ui-monospace,monospace;overflow-wrap:anywhere;color:var(--muted); }.export-toolbar { display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid var(--border); }.export-toolbar p { margin:0;color:var(--muted);font-size:12px; }
  #logsDialog { width:min(1100px,calc(100vw - 32px));max-height:90vh;padding:0;overflow:hidden; } .logs-heading { padding:17px 22px;margin:0;border-bottom:1px solid var(--border);align-items:center; }.logs-heading h2 { margin:0;font-size:16px; }.log-filename { color:var(--muted);font:11px ui-monospace,monospace; }.logs-toolbar { display:flex;gap:10px;padding:14px 18px;background:#101010;border-bottom:1px solid var(--border);align-items:center; }.logs-toolbar input[type="text"] { flex:1;min-width:0;padding:8px 10px;min-height:36px; }.logs-toolbar select { width:135px;min-height:36px;padding:7px 10px; }.logs-follow { display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:11px;color:var(--muted); }.logs-follow input { accent-color:var(--primary); } .term { border:0;border-radius:0;min-height:250px;height:56vh;max-height:56vh;background:#0d0d0d;padding:12px 0;counter-reset:log-line; }.ln { display:flex;gap:9px;padding:2px 18px 2px 0; }.ln:before { content:attr(data-line);flex:none;width:48px;padding-right:11px;border-right:1px solid #292929;text-align:right;color:#666;font-variant-numeric:tabular-nums; }.ln .t { flex:none; }.ln .message { min-width:0;overflow-wrap:anywhere; }.ln .level { flex:none;min-width:58px; }.logs-footer { padding:10px 18px;border-top:1px solid var(--border);display:flex;justify-content:space-between;color:var(--muted);font:11px ui-monospace,monospace; }.logs-empty { color:var(--muted);font-size:12px;padding:18px;margin:0; }
  @media(max-width:800px) { .review-layout { grid-template-columns:1fr; }.review-aside { display:none; } }
  @media(max-width:520px) { .brand { font-size:25px;gap:0; }.top-actions { gap:2px; }.top-actions .btn { padding:6px; }.status { font-size:10px; }.side-grid { grid-template-columns:1fr;gap:20px; }.side-grid .sec+.sec { border-top:1px solid var(--border);padding-top:17px; }.review .review-row { display:block; }.review-provider-name { font-size:16px; }.review-provider { gap:10px; }.logs-toolbar { flex-wrap:wrap;padding:10px; }.logs-toolbar input[type="text"] { flex-basis:100%; }.logs-toolbar select { flex:1; }.logs-heading { padding:14px; }.logs-heading .btn { padding:7px 10px; }.ln { gap:6px;font-size:10px;padding-right:10px; }.ln:before { width:30px;padding-right:5px; }.ln .t { display:none; }.ln .level { min-width:50px; }.export-toolbar { flex-wrap:wrap; } }
  @media(max-width:520px) { .settings-reset { align-items:flex-start;flex-direction:column; } }
  .brand-group { display:flex;align-items:center;gap:12px;min-width:0; }.release-badge { display:inline-flex;align-items:center;padding:3px 7px;border:1px solid #986846;border-radius:4px;background:#302116;color:#ffd0ad;font-size:10px;line-height:1.3;font-weight:600;letter-spacing:.2px; }.release-version { color:#969696;font:11px ui-monospace,monospace;white-space:nowrap; }
  header { min-height:84px;height:auto;padding-top:22px;padding-bottom:22px; }.stepper { gap:16px;border:0;border-radius:0;overflow:visible;background:transparent;margin-bottom:48px; }.stepper li { border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);min-width:0; }.stepper li+li { border-left:1px solid var(--border); }.step-button { border-radius:7px;min-height:76px;padding:19px 21px;gap:13px; }.step-button[aria-current="step"] { box-shadow:inset 0 -2px var(--primary); }.screen-heading { margin-bottom:34px; }.screen-heading h2 { margin-bottom:10px; }.toolbar { margin-bottom:28px;gap:22px; }.field-label { margin-bottom:12px; }.gallery { gap:20px; }.gallery.list { gap:16px; }.cards .provider { min-height:176px;padding:24px 36px 24px 24px;gap:18px; }.list .provider { padding:18px 22px;min-height:90px;gap:18px; }.provider-title { margin-bottom:8px; }.provider-description { line-height:1.7; }.pagination { margin-top:26px; }.wizard-actions { margin-top:36px;padding-top:27px; }.review-provider { padding-bottom:28px;margin-bottom:10px;gap:17px; }.review-provider-name { font-size:17px; }.review-provider-prefix { color:var(--muted);font-weight:400; }.review-provider .btn { white-space:nowrap; }.review-row { padding:22px 0; }
  #logsDialog { border-color:#454545; }.logs-heading { padding:22px 26px; }.logs-heading h2 { font-size:18px;margin-bottom:5px; }.logs-toolbar { padding:18px 22px;gap:14px; }.logs-toolbar input[type="text"] { min-height:40px; }.logs-toolbar select { min-height:40px; }.logs-follow { font-size:12px;gap:8px; }.logs-footer { padding:13px 22px; }.term { line-height:1.85;padding:18px 0;overscroll-behavior:contain;scroll-behavior:auto; }.ln { gap:13px;padding:4px 22px 4px 0;line-height:1.85; }.ln:before { width:58px;padding-right:16px;border-color:#333; }.ln .level { min-width:65px;font-weight:600; }.ln .message { color:#c8c8c8; }.ln[data-level="info"] .level,.ln[data-level="info"] .message { color:#8bc9ed; }.ln[data-level="warn"] .level,.ln[data-level="warn"] .message { color:#f1c16d; }.ln[data-level="error"] .level,.ln[data-level="error"] .message { color:#ff979f; }.ln[data-level="success"] .level,.ln[data-level="success"] .message { color:#9ddca8; }.ln[data-level="error"] { background:#3a19192b; }.ln[data-level="warn"] { background:#382b1526; }.ln:hover { background:#ffffff06; }
  #logsDialog[open] { display:flex;flex-direction:column; }.logs-heading,.logs-toolbar,.logs-footer { flex:none; }#logsDialog .term { flex:1 1 auto;min-height:0;overflow-anchor:none;scrollbar-gutter:stable;scrollbar-color:#686868 #202020; }#logsDialog .term::-webkit-scrollbar { width:9px; }#logsDialog .term::-webkit-scrollbar-track { background:#202020; }#logsDialog .term::-webkit-scrollbar-thumb { background:#686868;border:2px solid #202020;border-radius:5px; }#logsDialog .term::-webkit-scrollbar-thumb:hover { background:#aaa; }
  .shiny-text { background-image:linear-gradient(120deg,currentColor 0%,currentColor 35%,#fff 50%,currentColor 65%,currentColor 100%);background-size:200% 100%;background-position:150% center;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:text-shine 2s linear infinite; }.shiny-text:hover,.ln:hover .shiny-text,.status:hover .shiny-text { animation-play-state:paused; }@keyframes text-shine { from { background-position:150% center; } to { background-position:-50% center; } }html[data-page-hidden="true"] .shiny-text { animation-play-state:paused; }html[data-reduce-motion="true"] .shiny-text { background-image:none;-webkit-text-fill-color:currentColor; }
  #logsDialog .term:focus-visible { outline:1px solid var(--primary);outline-offset:-1px; }
  @supports selector(::-webkit-scrollbar) { #logsDialog .term { scrollbar-color:auto; } }
  @media(max-width:1000px) { .stepper { gap:12px; }.step-button { padding:18px 13px;gap:10px; }.logs-toolbar { flex-wrap:wrap; }.logs-toolbar input[type="text"] { flex-basis:100%; }.logs-toolbar select { flex:1; }.logs-toolbar .btn { min-height:36px; } }
  @media(max-width:650px) { header { flex-wrap:wrap;row-gap:16px; }.brand-group { gap:9px; }.top-actions { margin-left:auto; }.stepper { gap:10px;margin-bottom:36px; }.step-button { flex-direction:column;gap:10px;padding:15px 5px;min-height:86px;text-align:center; }.step-label { font-size:10px; }.screen-heading { margin-bottom:28px; }.toolbar { gap:16px;margin-bottom:25px; }.gallery { gap:17px; }.gallery.list { gap:15px; }.cards .provider { min-height:135px;padding:22px 34px 22px 20px; }.list .provider { padding:17px 16px;gap:16px; }.review-provider { flex-wrap:wrap;gap:12px; }.review-provider .btn { margin-left:auto; }.review-provider-name { font-size:16px; }.logs-heading { padding:18px; }.logs-toolbar { gap:10px;padding:14px; }.logs-follow { font-size:11px; }.ln { font-size:11px;gap:9px;padding:5px 13px 5px 0; }.ln:before { width:34px;padding-right:8px; }.ln .level { min-width:56px; }.logs-footer { padding:12px 14px; }.term { height:49vh;max-height:49vh; }.logs-toolbar #logResume { order:5; }.release-version { font-size:10px; } }
  @media(prefers-reduced-motion:reduce) { .shiny-text { background-image:none;-webkit-text-fill-color:currentColor; } }
  @media(prefers-reduced-motion:reduce) { *,*:before { transition:none!important;animation:none!important;scroll-behavior:auto!important; } } html[data-reduce-motion="true"] *,html[data-reduce-motion="true"] *:before { transition:none!important;animation:none!important;scroll-behavior:auto!important; }
</style>
</head>
<body>
<canvas id="pixelBackground" aria-hidden="true"></canvas>
<div class="shell">
  <header>
    <div class="brand-group"><h1 class="brand" aria-label="Framer Export"><span>framer</span><strong>export</strong></h1>${pkg.version.includes('-') ? '<span class="release-badge">Beta</span>' : ''}<span class="release-version">v${pkg.version}</span></div>
    <div class="top-actions"><div class="status" id="status" role="status" hidden><span class="status-dot" aria-hidden="true"></span><span id="statusText"></span></div><button class="btn ghost small" id="helpBtn" aria-label="Open help" data-tooltip="Help with providers, exports and shortcuts">?</button><button class="btn ghost small" id="settingsBtn" aria-label="Open settings" data-tooltip="Manage shared preferences" disabled>Settings</button></div>
  </header>
  <main>
    <nav aria-label="Export steps"><ol class="stepper" id="stepper"><li><button class="step-button" data-step="0" aria-current="step"><span class="step-number">1</span><span class="step-label">Select provider</span></button></li><li><button class="step-button" data-step="1" disabled><span class="step-number">2</span><span class="step-label">Site details</span></button></li><li><button class="step-button" data-step="2" disabled><span class="step-number">3</span><span class="step-label">Options</span></button></li><li><button class="step-button" data-step="3" disabled><span class="step-number">4</span><span class="step-label">Review</span></button></li></ol></nav>
    <div id="loadError" class="load-error" role="alert" hidden></div>
    <section class="screen active" id="screen-gallery">
      <div class="screen-heading"><h2 id="providerHeading" tabindex="-1">Select provider</h2><p class="sub">Choose the platform your site was built with.</p></div>
      <div class="toolbar"><div class="search-wrap"><label class="field-label" for="searchInput">Search providers</label><input type="text" id="searchInput" placeholder="Find by name or category" spellcheck="false" autocomplete="off" /></div><div class="view-toggle" role="group" aria-label="Provider view"><button id="viewCards" data-view="cards" aria-pressed="true">Cards</button><button id="viewList" data-view="list" aria-pressed="false">List</button></div></div>
      <div class="gallery-wrap" id="galleryWrap"><div class="gallery cards" id="gallery" aria-label="Providers"></div><div id="providerScroll" class="provider-scroll" role="scrollbar" aria-label="Scroll providers" aria-controls="gallery" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0" hidden><span id="providerScrollThumb" class="provider-scroll-thumb"></span></div></div>
      <div class="pagination"><span id="resultCount" role="status" aria-live="polite">Loading providers…</span><div class="page-controls"><button class="page-button" id="pagePrev" aria-label="Previous provider page" disabled>‹</button><span id="pageLabel">Page 1</span><button class="page-button" id="pageNext" aria-label="Next provider page" disabled>›</button></div></div>
      <div class="wizard-actions"><div class="selection-note">Selected: <b id="selectedProvider">Auto-detect</b></div><button class="btn primary" id="providerNext" disabled>Continue →</button></div>
    </section>

    <section class="screen" id="screen-url">
      <div class="screen-heading"><h2 id="detailsHeading" tabindex="-1">Site details</h2><p class="sub">Set the public URL and the folder for your export.</p></div>
      <div class="panel">
        <div class="provider-context"><img id="urlIcon" alt=""/><span>Provider <b id="urlTool"></b></span></div>
        <div class="field"><label class="field-label" for="urlInput">Website URL</label><input type="url" id="urlInput" placeholder="https://example.com" spellcheck="false" autocomplete="url" aria-describedby="urlError"/><p class="error-line" id="urlError" role="alert"></p></div>
        <div class="field"><label class="field-label" for="outInput">Output directory</label><input type="text" id="outInput" placeholder="./my-export" spellcheck="false" autocomplete="off" aria-describedby="outHint outError"/><p class="field-hint" id="outHint">A folder inside your current working directory.</p><p class="error-line" id="outError" role="alert"></p></div>
      </div>
      <div class="wizard-actions"><button class="btn ghost" id="urlBack">← Back</button><button class="btn primary" id="urlNext" aria-disabled="true" data-tooltip="Enter a website URL to continue">Continue →</button></div>
    </section>

    <section class="screen" id="screen-options">
      <div class="screen-heading"><h2 id="optionsHeading" tabindex="-1">Options</h2><p class="sub">Adjust how the files are collected and saved.</p></div>
      <div class="panel">
        <label class="opt" for="optPretty"><span class="label"><b>Format JavaScript</b><span>Make downloaded scripts easier to read.</span></span><input type="checkbox" id="optPretty" checked/></label>
        <label class="opt" for="optSubpages"><span class="label"><b>Include sub-pages</b><span>Follow internal links and export the linked pages.</span></span><input type="checkbox" id="optSubpages"/></label>
        <div class="concurrency-field"><label class="field-label" for="optConcurrency">Parallel downloads</label><select id="optConcurrency"><option value="6">6 · lower bandwidth</option><option value="12" selected>12 · balanced</option><option value="20">20 · faster connection</option></select></div>
      </div>
      <div class="wizard-actions"><button class="btn ghost" id="optBack">← Back</button><button class="btn primary" id="optionsNext">Review export →</button></div>
    </section>

    <section class="screen" id="screen-review"><div class="screen-heading"><h2 id="reviewHeading" tabindex="-1">Ready to export</h2><p class="sub">Everything is in place. Review the details below.</p></div><div class="review-layout"><div class="panel review-panel"><div class="review-provider"><img id="reviewIcon" alt=""/><div><p class="review-provider-name"><span class="review-provider-prefix">Provider: </span><span id="reviewProvider"></span></p></div><button class="btn ghost small" data-edit="0" aria-label="Edit provider">Edit provider</button></div><dl class="review"><div class="review-row"><dt>Website</dt><dd id="reviewUrl" class="mono"></dd><button class="btn ghost small" data-edit="1" aria-label="Edit site details">Edit</button></div><div class="review-row"><dt>Save to</dt><dd id="reviewOut" class="mono"></dd></div><div class="review-row"><dt>Options</dt><dd id="reviewOptions"></dd><button class="btn ghost small" data-edit="2" aria-label="Edit options">Edit</button></div></dl></div><aside class="panel review-aside"><div class="ready-mark" aria-hidden="true">✓</div><h3>Your files, locally</h3><p id="reviewNote">The export runs on this machine and downloads files from the source website.</p></aside></div><div class="wizard-actions"><button class="btn ghost" id="reviewBack">← Back</button><button class="btn primary" id="startBtn">Start export →</button></div></section>

    <section class="screen" id="screen-export">
      <div class="screen-heading"><h2 id="exportHeading" tabindex="-1">Export progress</h2><p class="sub"><span id="runTool"></span> · <span id="runUrl"></span></p></div>
      <div class="export-layout">
        <aside class="side">
          <div class="side-grid">
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
          </div><div class="export-output" id="exportOutput"></div>
          <div class="sec" id="sideSummarySec" style="display:none;">
            <h3>Summary</h3>
            <div id="sideSummary"></div>
          </div>
          <div class="export-toolbar"><p id="exportLogCount">Waiting for export activity</p><button class="btn" id="viewLogs" data-tooltip="Inspect, search and copy the export log">View logs</button></div>
          <div class="donebar" id="donebar">
            <button class="btn" id="copyServe">Copy serve command</button>
            <button class="btn ghost" id="newExport">New export</button>
          </div>
        </aside>
      </div>
    </section>
  </main>
</div>
<dialog id="logsDialog" aria-labelledby="logsHeading"><div class="dialog-heading logs-heading"><div><h2 id="logsHeading">Export logs</h2><span class="log-filename">export.log</span></div><button class="btn ghost small" id="logsClose">Close</button></div><div class="logs-toolbar"><input id="logSearch" type="text" aria-label="Search logs" placeholder="Search logs" autocomplete="off"/><select id="logLevel" aria-label="Filter log level"><option value="all">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="success">Success</option><option value="info">Information</option></select><label class="logs-follow"><input type="checkbox" id="logFollow" checked/>Auto-scroll</label><button class="btn small" id="logResume" data-tooltip="Clear filters and resume auto-scroll" hidden>Latest logs</button><button class="btn small" id="copyLogs" data-tooltip="Copy the complete export log">Copy all</button></div><div class="term" id="term" role="log" aria-label="Export log" tabindex="0"></div><div class="logs-footer"><span id="logResultCount">0 lines</span><span>UTF-8</span></div></dialog>
<dialog id="settingsDialog" aria-labelledby="settingsHeading"><div class="dialog-heading"><div><h2 id="settingsHeading">Settings</h2><p class="settings-note">Shared defaults for the terminal and web interface.</p></div><button class="btn ghost small" id="settingsClose" aria-label="Close settings" data-tooltip="Close without saving changes">Close</button></div><form id="settingsForm"><div class="settings-grid"><div><label class="field-label" for="settingProvider">Default provider</label><select id="settingProvider"></select></div><div><label class="field-label" for="settingView">Provider view</label><select id="settingView"><option value="cards">Cards</option><option value="list">List</option></select></div><label class="settings-check">Open the web interface on launch<input type="checkbox" id="settingLaunch"/></label><label class="settings-check">Check for updates<input type="checkbox" id="settingCheck"/></label><label class="settings-check">Install updates automatically<input type="checkbox" id="settingInstall"/></label><label class="settings-check">Include beta updates<input type="checkbox" id="settingBeta"/></label><label class="settings-check">Reduce motion<input type="checkbox" id="settingMotion"/></label><label class="settings-check">Format JavaScript by default<input type="checkbox" id="settingPretty"/></label><label class="settings-check">Include sub-pages by default<input type="checkbox" id="settingSubpages"/></label></div><p id="settingsError" class="error-line" role="alert"></p><div class="dialog-actions"><button class="btn ghost" type="button" id="settingsCancel">Cancel</button><button class="btn primary" type="submit">Save settings</button></div></form><div class="settings-reset"><p class="settings-note">Restore defaults and clear the saved draft and update cache.</p><button class="btn danger small" id="settingsReset" data-tooltip="Reset preferences after confirmation">Reset program</button></div></dialog>
<dialog id="helpDialog" aria-labelledby="helpHeading"><div class="dialog-heading"><div><h2 id="helpHeading">Help</h2><p class="settings-note">Your export stays on this machine.</p></div><button class="btn ghost small" id="helpClose">Close</button></div><div class="help-sections"><section><h3>Choose a provider</h3><p>Use Auto-detect if you are unsure. Search by name or category, choose Cards or List, then use the page controls to browse all providers.</p></section><section><h3>Move between steps</h3><p>Completed steps show a checkmark. Select a completed step or use Back to edit your choices. Your draft is saved as you work and restored when you return.</p></section><section><h3>Export and preview</h3><p>Enter a public website URL and a folder inside the current workspace. After the export, copy the serve command to preview the downloaded site locally. Features that depend on the source service may need separate integration.</p></section><section><h3>Keyboard shortcuts</h3><dl class="help-shortcuts"><dt><kbd>Tab</kbd></dt><dd>Move to the next control</dd><dt><kbd>Shift</kbd> <kbd>Tab</kbd></dt><dd>Move to the previous control</dd><dt><kbd>Enter</kbd> / <kbd>Space</kbd></dt><dd>Activate a button or option</dd><dt><kbd>Esc</kbd></dt><dd>Close the current dialog</dd><dt><kbd>?</kbd></dt><dd>Open this help dialog</dd></dl></section></div></dialog>
<dialog id="resetDialog" aria-labelledby="resetHeading" aria-describedby="resetDescription"><div class="dialog-heading"><h2 id="resetHeading">Reset Framer Export?</h2></div><p id="resetDescription" class="settings-note">This restores the default settings, removes your saved draft and clears the update cache. Your exported files will stay in place. Onboarding will appear the next time you open the terminal.</p><p id="resetError" class="error-line" role="alert"></p><div class="dialog-actions"><button class="btn ghost" id="resetCancel" autofocus>Cancel</button><button class="btn danger" id="resetConfirm">Reset program</button></div></dialog>
<div id="appTooltip" class="tooltip" role="tooltip" hidden></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/pixel-blast.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
