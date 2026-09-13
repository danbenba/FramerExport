export const APP_JS = `(function () {
  var state = { provider:'auto', siteUrl:'', outDir:'', prettyPrint:true, includeSubpages:false, concurrency:12, step:0, reached:0, viewMode:'cards', page:0, running:false, runId:null, serveCommand:'', startedAt:0 };
  var providers = [], preferences = {}, es = null, elapsedTimer = null, draftTimer = null, deriveTimer = null, deriveSequence = 0, outEdited = false, ready = false, resetting = false, persistenceQueue = Promise.resolve(), tooltipTimer = null, tooltipTarget = null, logCounter = 0, visibleLogCount = 0;
  var screens = ['gallery','url','options','review'], headings = ['providerHeading','detailsHeading','optionsHeading','reviewHeading'];
  function $(id) { return document.getElementById(id); }
  function request(url, options) {
    return fetch(url, options).then(function(r) { return r.json().then(function(data) { if(!r.ok) throw new Error(data.error || 'Request failed'); return data; }); });
  }
  function post(url, value) {
    var options = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};
    if(['/api/preferences','/api/draft','/api/reset'].includes(url)) {
      var next = persistenceQueue.catch(function() {}).then(function() { return request(url,options); });
      persistenceQueue = next; return next;
    }
    return request(url,options);
  }
  function hideTooltip() {
    clearTimeout(tooltipTimer); $('appTooltip').hidden = true;
    if(tooltipTarget) tooltipTarget.removeAttribute('aria-describedby'); tooltipTarget = null;
  }
  function showTooltip(target) {
    hideTooltip(); if(!target || target.disabled) return; tooltipTarget = target;
    tooltipTimer = setTimeout(function() {
      if(tooltipTarget !== target || !target.isConnected) return;
      var tooltip = $('appTooltip'), dialog = target.closest('dialog'), box = target.getBoundingClientRect();
      (dialog || document.body).appendChild(tooltip); tooltip.textContent = target.dataset.tooltip; tooltip.hidden = false;
      tooltip.style.left = '8px'; tooltip.style.top = '8px';
      var width = tooltip.offsetWidth, height = tooltip.offsetHeight;
      tooltip.style.left = Math.max(8,Math.min(window.innerWidth-width-8,box.left+box.width/2-width/2))+'px';
      tooltip.style.top = (box.bottom+height+16 <= window.innerHeight ? box.bottom+8 : Math.max(8,box.top-height-8))+'px';
      target.setAttribute('aria-describedby','appTooltip');
    },250);
  }
  document.addEventListener('pointerover',function(event) { var target = event.target.closest('[data-tooltip]'); if(target && !target.contains(event.relatedTarget)) showTooltip(target); });
  document.addEventListener('pointerout',function(event) { if(tooltipTarget && tooltipTarget.contains(event.target) && !tooltipTarget.contains(event.relatedTarget)) hideTooltip(); });
  document.addEventListener('focusin',function(event) { showTooltip(event.target.closest('[data-tooltip]')); });
  document.addEventListener('focusout',hideTooltip);
  document.addEventListener('pointerdown',hideTooltip);
  document.addEventListener('scroll',hideTooltip,true);
  window.addEventListener('resize',hideTooltip);
  function selected() { return providers.find(function(p) { return p.name === state.provider; }) || providers[0]; }
  function validUrl(value) { try { var url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password; } catch (_) { return false; } }
  function validOptions() { return Number.isInteger(state.concurrency) && state.concurrency >= 1 && state.concurrency <= 32; }
  function validDetails() { return validUrl(state.siteUrl) && !!state.outDir.trim(); }
  function reachable(step) {
    return ready && (step === 0 || (state.reached >= step && !!selected() && (step < 2 || validDetails()) && (step < 3 || validOptions())));
  }
  function renderStepper() {
    updateDetailsAction();
    document.querySelectorAll('[data-step]').forEach(function(button) {
      var step = Number(button.dataset.step);
      button.disabled = state.running || !reachable(step);
      var complete = step < state.reached && (step === 0 ? !!selected() : step === 1 ? validDetails() : validOptions());
      button.classList.toggle('complete',complete);
      var number = button.querySelector('.step-number');
      number.textContent = complete && state.step !== step ? '✓' : String(step+1); number.setAttribute('aria-hidden','true');
      button.setAttribute('aria-label',button.querySelector('.step-label').textContent + (complete ? ', completed' : ''));
      if(state.step === step && !$('screen-export').classList.contains('active')) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
  }
  function updateDetailsAction() {
    var reason = !state.siteUrl.trim() ? 'Enter a website URL to continue' : !validUrl(state.siteUrl) ? 'Enter a valid HTTP or HTTPS website URL without credentials' : '';
    $('urlNext').setAttribute('aria-disabled',String(!!reason));
    if(reason) $('urlNext').dataset.tooltip = reason; else { $('urlNext').removeAttribute('data-tooltip'); if(tooltipTarget === $('urlNext')) hideTooltip(); }
  }
  function show(name, focus) {
    $('toast').classList.remove('show');
    document.querySelectorAll('.screen').forEach(function(screen) { screen.classList.toggle('active',screen.id === 'screen-' + name); });
    renderStepper();
    window.scrollTo(0,0);
    if(focus !== false) { var heading = name === 'export' ? $('exportHeading') : $(headings[state.step]); if(heading) heading.focus({preventScroll:true}); }
  }
  function draft() { return {provider:state.provider,siteUrl:state.siteUrl,outDir:state.outDir,prettyPrint:state.prettyPrint,includeSubpages:state.includeSubpages,concurrency:state.concurrency,step:state.step}; }
  function saveDraft() {
    clearTimeout(draftTimer);
    if(!ready || state.running || resetting) return;
    draftTimer = setTimeout(function() { post('/api/draft',draft()).catch(function() { toast('Draft could not be saved'); }); },350);
  }
  function syncFields() {
    state.siteUrl = $('urlInput').value.trim(); state.outDir = $('outInput').value;
    state.prettyPrint = $('optPretty').checked; state.includeSubpages = $('optSubpages').checked; state.concurrency = Number($('optConcurrency').value);
  }
  function renderContext() {
    var provider = selected(); if(!provider) return;
    $('selectedProvider').textContent = provider.displayName;
    $('urlTool').textContent = provider.displayName;
    $('urlIcon').src = provider.iconDataUri; $('urlIcon').style.background = provider.iconBackground || 'transparent';
    $('reviewIcon').src = provider.iconDataUri; $('reviewIcon').style.background = provider.iconBackground || 'transparent';
    $('reviewProvider').textContent = provider.displayName + (provider.beta ? ' · beta' : '');
    $('reviewUrl').textContent = state.siteUrl; $('reviewOut').textContent = state.outDir;
    $('reviewOptions').textContent = (state.prettyPrint ? 'Formatted JavaScript' : 'Original JavaScript formatting') + ' · ' + (state.includeSubpages ? 'Include sub-pages' : 'Single page') + ' · ' + state.concurrency + ' parallel downloads';
    $('reviewNote').textContent = provider.beta ? 'Beta support: public page appearance can be captured; features that depend on the original service may need separate integration.' : 'The export runs on this machine and downloads files from the source website.';
  }
  function go(step, advancing) {
    if(state.running) return;
    syncFields();
    if(step >= 2 && !validDetails()) { state.step = 1; renderContext(); show('url'); validateDetails(); return; }
    if(step === 3 && !validOptions()) return;
    if(!advancing && !reachable(step)) return;
    state.step = step; state.reached = Math.max(state.reached,step);
    renderContext(); show(screens[step]); saveDraft();
  }
  function validateDetails() {
    $('urlError').textContent = validUrl(state.siteUrl) ? '' : 'Enter a valid public HTTP or HTTPS URL without credentials.';
    $('outError').textContent = state.outDir.trim() ? '' : 'Enter an output directory.';
    $('urlInput').setAttribute('aria-invalid',String(!validUrl(state.siteUrl)));
    $('outInput').setAttribute('aria-invalid',String(!state.outDir.trim()));
    if(!validUrl(state.siteUrl)) $('urlInput').focus(); else if(!state.outDir.trim()) $('outInput').focus();
    return validDetails();
  }
  function deriveOutput() {
    clearTimeout(deriveTimer);
    var sequence = ++deriveSequence;
    if(outEdited || !validUrl(state.siteUrl)) return;
    deriveTimer = setTimeout(function() {
      var url = state.siteUrl, provider = state.provider;
      request('/api/derive?url=' + encodeURIComponent(url) + (provider === 'auto' ? '' : '&platform=' + encodeURIComponent(provider))).then(function(data) {
        if(sequence !== deriveSequence || outEdited || state.siteUrl !== url || state.provider !== provider) return;
        state.outDir = './' + data.name; $('outInput').value = state.outDir; renderStepper(); saveDraft();
      }).catch(function() { if(sequence === deriveSequence) $('outError').textContent = 'Choose an output directory below.'; });
    },200);
  }
  function setStatus(kind,text) { $('status').className = 'status ' + kind; $('status').hidden = kind === 'idle'; $('statusText').textContent = kind === 'idle' ? '' : text; }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(function() { $('toast').classList.remove('show'); },2200); }
  function copyText(text,message) {
    function fallback() { var area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); try { if(!document.execCommand('copy')) throw new Error(); toast(message); } catch (_) { toast('Copy failed'); } area.remove(); }
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function() { toast(message); },fallback); else fallback();
  }
  function renderGallery(resetScroll) {
    var query = $('searchInput').value.trim().toLowerCase(), size = state.viewMode === 'list' ? 8 : 6;
    var matches = providers.filter(function(p) { return (p.displayName + ' ' + p.description + ' ' + p.categoryLabel).toLowerCase().includes(query); });
    var pages = Math.max(1,Math.ceil(matches.length/size)); state.page = Math.min(state.page,pages-1);
    var gallery = $('gallery'), scrollTop = resetScroll ? 0 : gallery.scrollTop; gallery.className = 'gallery ' + state.viewMode; $('galleryWrap').classList.toggle('list',state.viewMode === 'list'); gallery.replaceChildren();
    matches.slice(state.page*size,(state.page+1)*size).forEach(function(provider) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'provider card'; button.dataset.provider = provider.name; button.setAttribute('aria-pressed',String(provider.name === state.provider));
      var icon = document.createElement('img'); icon.className = 'provider-icon'; icon.src = provider.iconDataUri; icon.style.background = provider.iconBackground || 'transparent'; icon.alt = ''; icon.width = 38; icon.height = 38; icon.decoding = 'async';
      var copy = document.createElement('span'); copy.className = 'provider-copy';
      var title = document.createElement('span'); title.className = 'provider-title'; title.textContent = provider.displayName;
      if(provider.beta) { var badge = document.createElement('span'); badge.className = 'badge-beta'; badge.textContent = 'beta'; title.appendChild(badge); }
      var description = document.createElement('span'); description.className = 'provider-description'; description.textContent = provider.description;
      var category = document.createElement('span'); category.className = 'provider-category'; category.textContent = provider.categoryLabel;
      copy.append(title,description,category);
      var check = document.createElement('span'); check.className = 'provider-check'; check.textContent = '✓'; check.setAttribute('aria-hidden','true');
      button.append(icon,copy,check);
      button.onclick = function() { state.provider = provider.name; renderContext(); renderGallery(); renderStepper(); deriveOutput(); saveDraft(); var chosen = gallery.querySelector('[data-provider="' + provider.name + '"]'); if(chosen) chosen.focus({preventScroll:true}); };
      gallery.appendChild(button);
    });
    if(!matches.length) { var empty = document.createElement('div'); empty.className = 'empty-state'; var title = document.createElement('b'); title.textContent = 'No providers found'; var hint = document.createElement('span'); hint.textContent = 'Try another name or category.'; empty.append(title,hint); gallery.appendChild(empty); }
    gallery.scrollTop = scrollTop;
    updateProviderScrollbar();
    $('resultCount').textContent = matches.length ? (state.page*size+1) + '–' + Math.min((state.page+1)*size,matches.length) + ' of ' + matches.length + ' providers' : '0 providers';
    $('pageLabel').textContent = 'Page ' + (state.page+1) + ' of ' + pages;
    $('pagePrev').disabled = !state.page; $('pageNext').disabled = state.page >= pages-1;
    document.querySelectorAll('[data-view]').forEach(function(button) { button.setAttribute('aria-pressed',String(button.dataset.view === state.viewMode)); });
  }
  function updateProviderScrollbar() {
    var gallery = $('gallery'), track = $('providerScroll'), overflow = gallery.scrollHeight-gallery.clientHeight;
    track.hidden = state.viewMode !== 'list' || overflow <= 0;
    if(track.hidden) return;
    var height = track.clientHeight, thumb = Math.min(height,Math.max(22,height*gallery.clientHeight/gallery.scrollHeight)), fraction = gallery.scrollTop/overflow;
    $('providerScrollThumb').style.height = thumb+'px'; $('providerScrollThumb').style.top = Math.max(0,Math.min(height-thumb,(height-thumb)*fraction))+'px';
    track.setAttribute('aria-valuenow',String(Math.round(fraction*100)));
  }
  $('gallery').addEventListener('scroll',updateProviderScrollbar);
  new ResizeObserver(updateProviderScrollbar).observe($('gallery'));
  var providerDrag = null;
  $('providerScroll').onpointerdown = function(event) {
    event.preventDefault(); this.focus(); this.setPointerCapture(event.pointerId);
    var thumb = $('providerScrollThumb').getBoundingClientRect();
    providerDrag = {id:event.pointerId,offset:event.target === $('providerScrollThumb') ? event.clientY-thumb.top : thumb.height/2};
    dragProviders(event);
  };
  function dragProviders(event) {
    if(!providerDrag || providerDrag.id !== event.pointerId) return;
    var track = $('providerScroll').getBoundingClientRect(), thumb = $('providerScrollThumb').clientHeight, gallery = $('gallery');
    var fraction = Math.max(0,Math.min(1,(event.clientY-track.top-providerDrag.offset)/Math.max(1,track.height-thumb)));
    gallery.scrollTop = fraction*(gallery.scrollHeight-gallery.clientHeight); updateProviderScrollbar();
  }
  $('providerScroll').onpointermove = dragProviders;
  $('providerScroll').onpointerup = $('providerScroll').onpointercancel = function() { providerDrag = null; };
  $('providerScroll').onkeydown = function(event) {
    var gallery = $('gallery'), delta = 0;
    if(event.key === 'ArrowDown') delta = 50; else if(event.key === 'ArrowUp') delta = -50; else if(event.key === 'PageDown') delta = gallery.clientHeight; else if(event.key === 'PageUp') delta = -gallery.clientHeight; else if(event.key === 'Home') delta = -gallery.scrollHeight; else if(event.key === 'End') delta = gallery.scrollHeight; else return;
    event.preventDefault(); gallery.scrollTop += delta; updateProviderScrollbar();
  };
  function applyPreferences() { document.documentElement.dataset.reduceMotion = String(!!preferences.reduceMotion); }
  function loadGallery() {
    Promise.all([request('/api/platforms'),request('/api/preferences'),request('/api/draft')]).then(function(values) {
      var catalog = values[0]; preferences = values[1]; providers = [catalog.auto];
      catalog.categories.forEach(function(category) { category.platforms.forEach(function(provider) { provider.categoryLabel = category.label; providers.push(provider); }); });
      var saved = values[2].draft;
      state.provider = saved ? saved.provider : preferences.defaultProvider;
      if(!providers.some(function(p) { return p.name === state.provider; })) state.provider = 'auto';
      state.siteUrl = saved ? saved.siteUrl : ''; state.outDir = saved ? saved.outDir : '';
      state.prettyPrint = saved ? saved.prettyPrint : preferences.prettyPrint; state.includeSubpages = saved ? saved.includeSubpages : preferences.includeSubpages; state.concurrency = saved ? saved.concurrency : preferences.concurrency;
      state.viewMode = preferences.viewMode; state.step = saved ? saved.step : 0; state.reached = state.step;
      if(!validDetails() && state.step > 1) state.step = 1;
      outEdited = !!state.outDir;
      $('urlInput').value = state.siteUrl; $('outInput').value = state.outDir; $('optPretty').checked = state.prettyPrint; $('optSubpages').checked = state.includeSubpages;
      if(!Array.from($('optConcurrency').options).some(function(option) { return Number(option.value) === state.concurrency; })) $('optConcurrency').add(new Option(String(state.concurrency),String(state.concurrency)));
      $('optConcurrency').value = String(state.concurrency);
      providers.forEach(function(provider) { $('settingProvider').add(new Option(provider.displayName,provider.name)); });
      ready = true; $('providerNext').disabled = false; $('settingsBtn').disabled = false; applyPreferences(); renderContext(); renderGallery(); show(screens[state.step],false);
    }).catch(function(error) { $('loadError').hidden = false; $('loadError').textContent = 'The workspace could not load. ' + error.message + '. Refresh to retry.'; $('resultCount').textContent = 'Providers unavailable'; });
  }
  $('searchInput').oninput = function() { state.page = 0; renderGallery(true); };
  $('pagePrev').onclick = function() { state.page--; renderGallery(true); };
  $('pageNext').onclick = function() { state.page++; renderGallery(true); };
  document.querySelectorAll('[data-view]').forEach(function(button) { button.onclick = function() { state.viewMode = button.dataset.view; state.page = 0; renderGallery(true); post('/api/preferences',{viewMode:state.viewMode}).then(function(value) { preferences = value; }).catch(function() { toast('View preference could not be saved'); }); }; });
  document.querySelectorAll('[data-step]').forEach(function(button) { button.onclick = function() { go(Number(button.dataset.step)); }; });
  document.querySelectorAll('[data-edit]').forEach(function(button) { button.onclick = function() { go(Number(button.dataset.edit)); }; });
  $('providerNext').onclick = function() { go(1,true); $('urlInput').focus(); };
  $('urlBack').onclick = function() { go(0); };
  $('urlNext').onclick = function() {
    syncFields();
    if(!validUrl(state.siteUrl)) return;
    if(validUrl(state.siteUrl) && !outEdited) {
      clearTimeout(deriveTimer);
      var sequence = ++deriveSequence, url = state.siteUrl, provider = state.provider;
      $('urlNext').disabled = true;
      request('/api/derive?url=' + encodeURIComponent(url) + (provider === 'auto' ? '' : '&platform=' + encodeURIComponent(provider))).then(function(data) {
        if(sequence !== deriveSequence || state.siteUrl !== url || state.provider !== provider || outEdited) return;
        state.outDir = './' + data.name; $('outInput').value = state.outDir;
        if(validateDetails()) go(2,true);
      }).catch(function() { $('outError').textContent = 'Choose an output folder to continue.'; }).finally(function() { $('urlNext').disabled = false; });
    } else if(validateDetails()) go(2,true);
  };
  $('optBack').onclick = function() { go(1); }; $('optionsNext').onclick = function() { go(3,true); }; $('reviewBack').onclick = function() { go(2); };
  $('urlInput').oninput = function() { syncFields(); $('urlError').textContent = ''; renderStepper(); deriveOutput(); saveDraft(); };
  $('outInput').oninput = function() { outEdited = !!this.value; syncFields(); $('outError').textContent = ''; renderStepper(); saveDraft(); };
  ['urlInput','outInput'].forEach(function(id) { $(id).onkeydown = function(event) { if(event.key === 'Enter') { event.preventDefault(); $('urlNext').click(); } }; });
  ['optPretty','optSubpages','optConcurrency'].forEach(function(id) { $(id).onchange = function() { syncFields(); renderStepper(); saveDraft(); }; });
  $('settingsBtn').onclick = function() {
    $('settingProvider').value = preferences.defaultProvider; $('settingView').value = preferences.viewMode;
    [['Launch','launchUi'],['Check','checkUpdates'],['Install','autoInstallUpdates'],['Beta','betaUpdates'],['Motion','reduceMotion'],['Pretty','prettyPrint'],['Subpages','includeSubpages']].forEach(function(pair) { $('setting'+pair[0]).checked = !!preferences[pair[1]]; });
    $('settingsError').textContent = ''; $('settingsReset').disabled = state.running; hideTooltip(); $('settingsDialog').showModal();
  };
  ['settingsClose','settingsCancel'].forEach(function(id) { $(id).onclick = function() { $('settingsDialog').close(); }; });
  $('helpBtn').onclick = function() { hideTooltip(); $('helpDialog').showModal(); };
  $('helpClose').onclick = function() { $('helpDialog').close(); };
  document.querySelectorAll('dialog').forEach(function(dialog) { dialog.addEventListener('close',hideTooltip); });
  document.addEventListener('keydown',function(event) {
    if(event.key === 'Escape') hideTooltip();
    if(event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    event.preventDefault(); $('helpBtn').click();
  });
  $('settingsReset').onclick = function() { if(state.running) return; hideTooltip(); $('resetError').textContent = ''; $('resetDialog').showModal(); };
  $('resetCancel').onclick = function() { if(!resetting) $('resetDialog').close(); };
  $('resetDialog').addEventListener('cancel',function(event) { if(resetting) event.preventDefault(); });
  $('resetConfirm').onclick = function() {
    if(resetting || state.running) return;
    resetting = true; clearTimeout(draftTimer); clearTimeout(deriveTimer); deriveSequence++;
    $('resetConfirm').disabled = true; $('resetCancel').disabled = true; $('resetError').textContent = '';
    post('/api/reset',{confirmed:true}).then(function(value) {
      preferences = value; state.provider = value.defaultProvider; state.siteUrl = ''; state.outDir = ''; state.prettyPrint = value.prettyPrint; state.includeSubpages = value.includeSubpages; state.concurrency = value.concurrency; state.step = 0; state.reached = 0; state.viewMode = value.viewMode; state.page = 0; state.runId = null; state.serveCommand = ''; outEdited = false;
      $('urlInput').value = ''; $('outInput').value = ''; $('searchInput').value = ''; $('optPretty').checked = state.prettyPrint; $('optSubpages').checked = state.includeSubpages; $('optConcurrency').value = String(state.concurrency);
      $('urlError').textContent = ''; $('outError').textContent = ''; $('urlInput').removeAttribute('aria-invalid'); $('outInput').removeAttribute('aria-invalid'); $('term').replaceChildren(); $('exportOutput').textContent = ''; logCounter = 0; renderLogFilter();
      applyPreferences(); renderContext(); renderGallery(true); setStatus('idle','idle'); $('resetDialog').close(); $('settingsDialog').close(); show('gallery'); toast('Program reset. Exported files kept.');
    }).catch(function(error) { $('resetError').textContent = error.message; }).finally(function() { resetting = false; $('resetConfirm').disabled = false; $('resetCancel').disabled = false; });
  };
  $('settingsForm').onsubmit = function(event) {
    event.preventDefault();
    var patch = {defaultProvider:$('settingProvider').value,viewMode:$('settingView').value};
    [['Launch','launchUi'],['Check','checkUpdates'],['Install','autoInstallUpdates'],['Beta','betaUpdates'],['Motion','reduceMotion'],['Pretty','prettyPrint'],['Subpages','includeSubpages']].forEach(function(pair) { patch[pair[1]] = $('setting'+pair[0]).checked; });
    post('/api/preferences',patch).then(function(value) { preferences = value; state.viewMode = value.viewMode; state.page = 0; applyPreferences(); renderGallery(); $('settingsDialog').close(); toast('Settings saved'); }).catch(function(error) { $('settingsError').textContent = error.message; });
  };
  function startElapsed() {
    stopElapsed(); elapsedTimer = setInterval(function() { var seconds = Math.floor((Date.now()-state.startedAt)/1000); $('sideElapsed').textContent = Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0') + ' elapsed'; },1000);
  }
  function stopElapsed() { clearInterval(elapsedTimer); elapsedTimer = null; }
  function renderLogFilter() {
    visibleLogCount = 0;
    $('term').querySelectorAll('.ln').forEach(function(line) { line.hidden = !matchesLogFilter(line); if(!line.hidden) visibleLogCount++; });
    updateLogCounts();
  }
  function matchesLogFilter(line) {
    var query = $('logSearch').value.trim().toLowerCase(), level = $('logLevel').value;
    return (level === 'all' || line.dataset.level === level) && (!query || line.textContent.toLowerCase().includes(query));
  }
  function updateLogCounts() {
    $('logResultCount').textContent = visibleLogCount + ' of ' + logCounter + ' lines';
    $('exportLogCount').textContent = logCounter ? logCounter + ' log entries available' : 'Waiting for export activity';
  }
  $('viewLogs').onclick = function() { hideTooltip(); renderLogFilter(); $('logsDialog').showModal(); if($('logFollow').checked) $('term').scrollTop = $('term').scrollHeight; };
  $('logsClose').onclick = function() { $('logsDialog').close(); };
  $('logSearch').oninput = renderLogFilter; $('logLevel').onchange = renderLogFilter;
  $('logFollow').onchange = function() { if(this.checked) $('term').scrollTop = $('term').scrollHeight; };
  function appendLog(record) {
    var term = $('term'), bottom = term.scrollTop + term.clientHeight >= term.scrollHeight-60, line = document.createElement('div'), levelName = record.level === 'ok' ? 'success' : record.level; line.className = 'ln'; line.dataset.line = String(++logCounter); line.dataset.level = levelName;
    var time = document.createElement('span'); time.className = 't'; time.textContent = record.time ? '['+record.time+'] ' : '';
    var level = document.createElement('span'); level.className = 'level lv-'+levelName; level.textContent = '['+record.level+'] ';
    var message = document.createElement('span'); message.className = 'message'; message.textContent = record.message; line.append(time,level,message); term.appendChild(line);
    line.hidden = !matchesLogFilter(line); if(!line.hidden) visibleLogCount++; updateLogCounts(); if(bottom && $('logFollow').checked) term.scrollTop = term.scrollHeight;
  }
  function renderProgress(progress) {
    $('sidePhase').textContent = progress.phase || 'starting'; $('sideAssets').textContent = progress.downloaded + (progress.totalAssets ? '/'+progress.totalAssets : '') + ' downloaded';
    $('sideFailed').style.display = progress.failed > 0 ? 'block' : 'none'; $('sideFailed').textContent = progress.failed+' failed';
    $('sideWritten').textContent = progress.written+' files written'+(progress.subpages > 0 ? ' · '+progress.subpages+' sub-pages' : '');
    $('sideFiles').replaceChildren(); (progress.recentFiles || []).forEach(function(file) { var row = document.createElement('div'); row.className = 'file'; row.textContent = file; $('sideFiles').appendChild(row); });
  }
  function renderSummary(entries) {
    $('sideSummary').replaceChildren(); entries.forEach(function(entry) { if(!entry.count) return; var row = document.createElement('div'); row.className = 'sumrow'; var label = document.createElement('span'), count = document.createElement('b'); label.textContent = entry.dir; count.textContent = entry.count+' '+entry.kind; row.append(label,count); $('sideSummary').appendChild(row); }); $('sideSummarySec').style.display = 'block';
  }
  function applyRun(run) {
    if(!state.runId || run.runId !== state.runId) return;
    if(run.state === 'running') { setStatus('running','exporting'); return; }
    if(run.state !== 'done' && run.state !== 'error') return;
    state.running = false; stopElapsed(); setStatus(run.state,run.state);
    if(run.state === 'done') { state.serveCommand = run.serveCommand || ''; if(run.summary) renderSummary(run.summary); $('exportOutput').textContent = run.outDir || ''; }
    else appendLog({time:'',level:'error',message:run.error || 'Export failed'});
    $('donebar').classList.add('visible'); $('copyServe').disabled = !state.serveCommand; renderStepper();
  }
  function connectEvents() {
    if(es) return; es = new EventSource('/api/events');
    es.addEventListener('log',function(event) { if(state.running) appendLog(JSON.parse(event.data)); });
    es.addEventListener('progress',function(event) { if(state.running) renderProgress(JSON.parse(event.data)); });
    es.addEventListener('status',function(event) { applyRun(JSON.parse(event.data)); });
    es.onerror = function() { if(state.running) request('/api/status').then(function(data) { renderProgress(data.progress); applyRun(data.run); }).catch(function() { $('sidePhase').textContent = 'Connection interrupted. Reconnecting…'; }); };
  }
  $('startBtn').onclick = function() {
    if(state.running) return; syncFields(); if(!validDetails()) { go(1,true); validateDetails(); return; }
    clearTimeout(draftTimer); post('/api/draft',draft()).catch(function() {});
    state.running = true; state.runId = null; state.serveCommand = ''; state.startedAt = Date.now();
    $('runTool').textContent = selected().displayName; $('runUrl').textContent = state.siteUrl; $('term').replaceChildren(); logCounter = 0; $('logSearch').value = ''; $('logLevel').value = 'all'; renderLogFilter(); $('donebar').classList.remove('visible'); $('sideSummarySec').style.display = 'none'; $('sideElapsed').textContent = '0:00 elapsed'; $('exportOutput').textContent = state.outDir;
    setStatus('running','exporting'); show('export'); startElapsed(); connectEvents();
    post('/api/export',{url:state.siteUrl,platform:state.provider === 'auto' ? null : state.provider,outDir:state.outDir,subpages:state.includeSubpages,prettyPrint:state.prettyPrint,concurrency:state.concurrency}).then(function(data) {
      state.runId = data.runId; return request('/api/status');
    }).then(function(data) { renderProgress(data.progress); applyRun(data.run); }).catch(function(error) { appendLog({time:'',level:'error',message:error.message}); state.running = false; stopElapsed(); setStatus('error','error'); $('donebar').classList.add('visible'); $('copyServe').disabled = true; renderStepper(); });
  };
  $('copyLogs').onclick = function() { fetch('/api/log').then(function(response) { if(!response.ok) throw new Error(); return response.text(); }).then(function(text) { copyText(text,'logs copied'); }).catch(function() { toast('Logs could not be copied'); }); };
  $('copyServe').onclick = function() { if(state.serveCommand) copyText(state.serveCommand,'serve command copied'); };
  $('newExport').onclick = function() { state.runId = null; setStatus('idle','idle'); go(0); };
  try { if(window.PixelBlast) window.PixelBlast.mount($('pixelBackground'),{color:'#8d7768',variant:'circle',pixelSize:4,speed:.16,patternDensity:.7,pixelSizeJitter:.2,enableRipples:true,rippleIntensityScale:.5,edgeFade:.3}); } catch (_) { $('pixelBackground').dataset.renderer = 'unavailable'; }
  loadGallery();
})();`;
