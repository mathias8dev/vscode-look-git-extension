export const GRAPH_CSS_CONTENT = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }

.graph-container { display: grid; grid-template-columns: 200px 4px 1fr 4px 300px; grid-template-rows: auto 1fr; height: 100vh; }

.toolbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--vscode-titleBar-activeBackground); border-bottom: 1px solid var(--vscode-panel-border); }
.toolbar input[type="text"] { flex: 1; max-width: 300px; padding: 3px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: var(--vscode-font-size); outline: none; }
.toolbar input[type="text"]:focus { border-color: var(--vscode-focusBorder); }
.toolbar button { padding: 3px 10px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 3px; cursor: pointer; font-size: var(--vscode-font-size); }
.toolbar button:hover { background: var(--vscode-button-hoverBackground); }
.toggle-graph-btn { opacity: 0.5; background: transparent !important; border-color: var(--vscode-input-border) !important; color: var(--vscode-foreground) !important; }
.toggle-graph-btn:hover { opacity: 0.8; background: var(--vscode-list-hoverBackground) !important; }
.toggle-graph-btn.active { opacity: 1; background: var(--vscode-badge-background) !important; color: var(--vscode-badge-foreground) !important; border-color: var(--vscode-badge-background) !important; }

.filter-bar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.filter-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--vscode-input-border); border-radius: 12px; font: inherit; font-size: 0.85em; cursor: pointer; white-space: nowrap; color: var(--vscode-descriptionForeground); background: transparent; }
.filter-chip:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
.filter-chip:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.filter-chip.active { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-color: var(--vscode-badge-background); }
.filter-chip-clear { margin-left: 2px; font-size: 1.18em; line-height: 1; cursor: pointer; opacity: 0.7; }
.filter-chip-clear:hover { opacity: 1; }

.filter-dropdown { position: fixed; z-index: 100; min-width: 160px; max-height: 240px; overflow-y: auto; background: var(--vscode-menu-background); color: var(--vscode-menu-foreground); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); border-radius: 4px; padding: 4px 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.filter-dropdown-item { padding: 4px 12px; cursor: pointer; white-space: nowrap; font-size: inherit; }
.filter-dropdown-item:hover { background: var(--vscode-menu-selectionBackground); color: var(--vscode-menu-selectionForeground); }

.user-dropdown { min-width: 200px; padding: 4px 0; }
.filter-dropdown-check { display: flex; align-items: center; gap: 6px; padding: 4px 12px; cursor: pointer; white-space: nowrap; font-size: inherit; }
.filter-dropdown-check:hover { background: var(--vscode-list-hoverBackground); }
.filter-dropdown-check input[type="checkbox"] { margin: 0; cursor: pointer; accent-color: var(--vscode-focusBorder); }
.filter-dropdown-check .me-name { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
.me-option { font-weight: 500; }
.user-dropdown-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }

.date-dropdown { padding: 8px 12px; min-width: 200px; }
.date-field { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.date-field label { font-size: 0.85em; min-width: 32px; color: var(--vscode-descriptionForeground); }
.date-field input[type="date"] { flex: 1; padding: 2px 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: inherit; }
.date-actions { display: flex; gap: 6px; margin-top: 4px; }
.date-actions button { flex: 1; padding: 3px 8px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; font-size: 0.85em; }
.date-actions button:first-child { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.date-actions button:first-child:hover { background: var(--vscode-button-hoverBackground); }
.date-actions button:last-child { background: transparent; color: var(--vscode-descriptionForeground); border-color: var(--vscode-input-border); }
.date-actions button:last-child:hover { background: var(--vscode-list-hoverBackground); }

.path-dropdown { padding: 8px 12px; min-width: 220px; }
.path-field input[type="text"] { width: 100%; padding: 3px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: inherit; margin-bottom: 6px; outline: none; }
.path-field input[type="text"]:focus { border-color: var(--vscode-focusBorder); }

.branch-pane { overflow-y: auto; border-right: 1px solid var(--vscode-panel-border); padding: 8px 0; }
.branch-section-header { padding: 4px 12px; font-size: 0.85em; font-weight: 600; text-transform: uppercase; color: var(--vscode-descriptionForeground); letter-spacing: 0.5px; }
.branch-item { --branch-row-gap: 6px; display: flex; align-items: center; gap: var(--branch-row-gap); min-height: 24px; padding: 2px 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 3px; margin: 0 4px; }
.branch-item:hover { background: var(--vscode-list-hoverBackground); }
.branch-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.branch-item.current .branch-name { font-weight: 600; color: var(--vscode-foreground); }
.branch-item .branch-name { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
.current-branch-indicator { width: 14px; height: 14px; border-radius: 50%; background: var(--vscode-gitDecoration-addedResourceForeground, #3fb950); color: var(--vscode-editor-background); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.current-branch-indicator::before { content: ''; width: 6px; height: 3px; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg) translate(1px, -1px); }
.branch-item.active .current-branch-indicator { outline: 1px solid currentColor; outline-offset: 1px; }
.branch-remote-pending-indicator { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: calc(16px - var(--branch-row-gap, 6px)); color: var(--vscode-icon-foreground, var(--vscode-foreground)); font-size: 0.85em; line-height: 1; font-variant-numeric: tabular-nums; }
.branch-item.active .branch-remote-pending-indicator { color: var(--vscode-list-activeSelectionForeground); }
.branch-incoming-icon { width: 14px; height: 14px; display: block; }
.branch-behind-count { color: inherit; min-width: 1ch; }

.branch-pane-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 4px 0; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 4px; }
.branch-pane-toolbar .branch-item { flex: 1; }

.view-switcher { display: flex; gap: 2px; flex-shrink: 0; }
.view-switch-btn { width: 24px; height: 22px; border: 1px solid transparent; background: transparent; color: var(--vscode-descriptionForeground); border-radius: 3px; cursor: pointer; font-size: inherit; display: flex; align-items: center; justify-content: center; padding: 0; }
.view-switch-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); }
.view-switch-btn.active { color: var(--vscode-foreground); background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 103, 0.31)); border-color: var(--vscode-focusBorder); }

.branch-tree-folder { display: flex; align-items: center; gap: 4px; min-height: 24px; padding: 2px 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: inherit; border-radius: 3px; margin: 0 4px; position: relative; }
.branch-tree-folder:hover { background: var(--vscode-list-hoverBackground); }
.branch-tree-folder::before, .branch-item.tree-leaf::before { content: ''; position: absolute; left: calc(var(--tree-indent, 0px) + 10px); top: 0; bottom: 0; width: 1px; background: var(--vscode-tree-indentGuidesStroke, var(--vscode-panel-border)); opacity: 0.45; pointer-events: none; }
.branch-item.tree-leaf { --branch-row-gap: 4px; position: relative; }
.tree-arrow { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--vscode-descriptionForeground); }
.tree-chevron-icon { display: block; }
.tree-folder-icon { flex-shrink: 0; color: var(--vscode-symbolIcon-folderForeground, var(--vscode-descriptionForeground)); }
.tree-folder-name { overflow: hidden; text-overflow: ellipsis; }
.tree-branch-icon { flex-shrink: 0; color: var(--vscode-descriptionForeground); vertical-align: middle; }

.graph-pane { overflow: auto; position: relative; }
.graph-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.graph-table th { position: sticky; top: 0; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding: 4px 8px; text-align: left; font-weight: 600; font-size: 0.85em; text-transform: uppercase; color: var(--vscode-descriptionForeground); z-index: 1; }
.graph-row { cursor: pointer; content-visibility: auto; contain-intrinsic-size: auto 28px; }
.graph-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); box-shadow: inset 2px 0 0 var(--vscode-focusBorder); }
.graph-row.primary-line .graph-cell { background: color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent); }
.graph-row.filter-dimmed { opacity: 0.42; }
.graph-row.filter-matched { box-shadow: inset 2px 0 0 var(--vscode-list-highlightForeground, var(--vscode-focusBorder)); }
.graph-row td { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; line-height: 28px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 42%, transparent); }
.commit-row-button { width: 100%; max-width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; display: inline-flex; align-items: center; vertical-align: middle; }
.commit-row-button:focus { outline: none; }
.commit-row-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; border-radius: 2px; }
.commit-row-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.graph-cell { padding: 0 !important; overflow: visible !important; }
.graph-cell svg { display: block; }
.commit-graph-svg { overflow: visible; shape-rendering: geometricPrecision; }
.graph-line { stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.82; }
.graph-line-first-parent { stroke-width: 2.6; opacity: 0.92; }
.graph-line-merge-parent { stroke-width: 2; opacity: 0.72; stroke-dasharray: 0; }
.graph-line-pass-through { opacity: 0.58; }
.graph-row.primary-line .graph-line-first-parent { stroke-width: 3; }
.commit-dot-halo { opacity: 0.22; }
.commit-dot { filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.45)); }
.filter-bullet { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 auto; vertical-align: middle; }
.graph-cell { text-align: center; }
.graph-scroll-sentinel { height: 28px; width: 100%; }
.graph-loading-more { min-height: 32px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-descriptionForeground); font-size: inherit; border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 42%, transparent); }
.graph-loading-spinner { width: 14px; height: 14px; border: 2px solid color-mix(in srgb, var(--vscode-descriptionForeground) 35%, transparent); border-top-color: var(--vscode-progressBar-background, var(--vscode-focusBorder)); border-radius: 50%; animation: graph-loading-spin 0.8s linear infinite; }
@keyframes graph-loading-spin { to { transform: rotate(360deg); } }

.ref-badge { display: inline-block; padding: 2px 6px; margin-right: 4px; border-radius: 3px; font-size: 0.85em; line-height: 1; font-weight: 500; vertical-align: middle; }
.ref-badge.branch-local { background: var(--vscode-gitDecoration-addedResourceForeground, #28a745); color: #fff; }
.ref-badge.branch-remote { background: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); color: #fff; }
.ref-badge.tag { background: var(--vscode-gitDecoration-ignoredResourceForeground, #6a737d); color: #fff; }
.ref-badge.head { background: var(--vscode-gitDecoration-untrackedResourceForeground, #f97583); color: #fff; }

.hash-col { font-family: var(--vscode-editor-font-family, monospace); color: var(--vscode-textLink-foreground); width: 70px; }
.author-col { width: 120px; color: var(--vscode-descriptionForeground); }
.date-col { width: 130px; color: var(--vscode-descriptionForeground); }

.details-pane { overflow-y: auto; border-left: 1px solid var(--vscode-panel-border); padding: 12px; }
.details-pane.empty { display: flex; align-items: center; justify-content: center; color: var(--vscode-descriptionForeground); }
.details-header { margin-bottom: 12px; }
.details-header h3 { font-size: 1.08em; margin-bottom: 8px; }
.details-field { display: flex; gap: 8px; margin-bottom: 4px; font-size: inherit; }
.details-field .label { color: var(--vscode-descriptionForeground); min-width: 60px; flex-shrink: 0; }
.details-field .value { word-break: break-all; }
.details-field .value.mono { font-family: var(--vscode-editor-font-family, monospace); }
.details-message { margin: 12px 0; padding: 8px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); white-space: pre-wrap; font-size: inherit; }
.details-files-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.details-files-header { font-size: inherit; font-weight: 600; color: var(--vscode-descriptionForeground); }
.file-item { display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; border-radius: 3px; font-size: inherit; }
.file-item:hover { background: var(--vscode-list-hoverBackground); }
.file-status { width: 16px; text-align: center; font-weight: 700; font-size: 0.85em; flex-shrink: 0; }
.file-status.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }
.file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-icon { flex-shrink: 0; }
.folder-icon { flex-shrink: 0; color: var(--vscode-symbolIcon-folderForeground, var(--vscode-descriptionForeground)); }
.file-tree-folder { display: flex; align-items: center; gap: 4px; padding: 2px 4px; cursor: pointer; border-radius: 3px; font-size: inherit; white-space: nowrap; }
.file-tree-folder:hover { background: var(--vscode-list-hoverBackground); }
.file-tree-folder-name { overflow: hidden; text-overflow: ellipsis; }
.file-tree-item { gap: 4px; }
.file-status-badge { margin-left: auto; font-size: 0.77em; font-weight: 700; flex-shrink: 0; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.file-status-badge.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status-badge.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status-badge.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status-badge.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }

.context-menu { position: fixed; z-index: 100; min-width: 180px; max-height: calc(100vh - 8px); overflow-y: auto; overscroll-behavior: contain; background: var(--vscode-menu-background); color: var(--vscode-menu-foreground); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); border-radius: 4px; padding: 4px 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.context-menu-item { padding: 4px 24px; cursor: pointer; white-space: nowrap; }
.context-menu-item:hover { background: var(--vscode-menu-selectionBackground); color: var(--vscode-menu-selectionForeground); }
.context-menu-item.disabled { opacity: 0.4; cursor: default; }
.context-menu-item.disabled:hover { background: transparent; color: inherit; }
.context-menu-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }

.resize-handle { cursor: col-resize; background: transparent; position: relative; z-index: 2; }
.resize-handle:hover, .resize-handle.active { background: var(--vscode-focusBorder); }
`;
