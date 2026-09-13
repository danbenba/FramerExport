# Changelog

## 5.0.0-beta.4 (release candidate)

The terminal and web interfaces share provider identities, offline brand icons and a four-step export assistant. Cards/list views, search, pagination, mouse scrolling, a draggable terminal scrollbar, keyboard shortcuts and clickable completed steps preserve entered data while navigating. Settings, Help and Open UI use dialogs with hover states and contextual hints. The lowercase wordmark fits an 80×24 terminal and adapts to smaller windows.

Graphite surfaces and peach accents accompany a PixelBlast background adapted to terminal character cells. Motion is enabled by default; reduced-motion settings keep the terminal background still and reduce web animations. Native image modes keep the terminal background still to avoid image flicker. Provider logos use Kitty or iTerm image protocols, or Sixel when capability and cell-size probing succeed. Other terminals retain provider names and colored monograms; terminal fonts and graphics capabilities still determine physical rendering.

Wizard exports use a dedicated log viewer with line numbers, timestamps, level filters, search, pause/follow, horizontal panning and clipboard copying. The full session is retained while exporting. Esc or Ctrl+C returns to console output without falsely marking the operation as cancelled; completed and failed exports remain inspectable until closed. The web interface exposes logs in an editor-style dialog.

Both log viewers follow new entries automatically, pause when you scroll up and offer a Latest logs control to resume. More spacious rows retain their severity colors, with a gentle shine on active progress that respects reduced motion. Terminal rendering updates changed cells and keeps native icons in place; idle screens and mouse movement within the same control no longer trigger redraws. Header badges and versions sit to the right of the wordmark, provider controls have more space, and compact card layouts keep pagination visible.

First-run onboarding, preferences and resumable export drafts live in `~/.fexport`. Settings cover the default provider, view, export options, reduced motion, a companion browser UI and stable/beta update behavior. Confirmed reset clears preferences, the saved draft and the update cache while preserving exported folders and unrelated files. Automatic updates are opt-in, use semantic version ordering and preserve supported npm installation scope. `config`, `settings`, `doctor`, `--fresh` and `--no-update` provide direct access to these controls. Source code comments are removed; standalone licensing/provenance files remain.

Exports preserve dynamic CSS rules, constructed stylesheets, nested CSS imports, responsive resource variants and stylesheet redirects. Asset filenames no longer overwrite unrelated files with the same basename, and missing resources are listed in `export-report.json` instead of being rewritten to nonexistent files.

The capture respects explicit platform choices and final navigation URLs. Subpages receive the same hydration, scrolling and resource preparation as the entry page. Webflow keeps the opening HTML element and runtime attributes that earlier stripping rules removed. Dynamically requested captured stylesheets stay local.

The bundled browser is upgraded from Chrome 127 to Chrome 148 through Puppeteer 24.43.1. A current public Notion page rejected the old browser and loaded successfully with the updated one. Bubble and Notion snapshots also retain measured viewport-dependent inline styles, conditionally removed controls and JavaScript-selected image renditions.

Captured iframe HTML now retains local CSS, scripts and nested resources using each document's own URL base. Runtime image/script assignments and explicit worker resource declarations are localized when the exact resource was saved.

Framer CMS files remain binary even when their server labels them as JavaScript. Raw bytes are preserved, and exact captured public CMS GET requests load their local files, including captured range queries.

The UI rejects unsupported URL schemes, returns to the gallery after a rejected export request, and copies a preview command that points to the actual export directory. Failed captures preserve existing files and write diagnostics.

The new browser suite compares source and exported pages at desktop and mobile sizes, shuts down the source before replay, and tests navigation, form validation, CSSOM, stylesheet loaders and the full UI flow. Live checks still leave Wix mobile image variants, some Podia widgets and Framer animation states incompletely validated.

Bubble, Notion and Podia retain the beta label. Server-side accounts, payments, search and platform workflows are not recreated by a static export. Publication is gated by type checking, unit tests, browser tests and the production build; the default publication tag for this prerelease is `beta`.
