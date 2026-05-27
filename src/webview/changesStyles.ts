export const CHANGES_CSS_CONTENT = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }

.changes-container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Commit Section ── */
.commit-section { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; position: relative; }
.commit-section textarea { width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); resize: vertical; min-height: 54px; outline: none; }
.commit-section textarea:focus { border-color: var(--vscode-focusBorder); }
.commit-section textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
.commit-actions { margin-top: 6px; }
.commit-hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 5px; min-height: 15px; text-align: center; }

/* Split button */
.split-btn { display: flex; width: 100%; }
.split-main { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 12px; border: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 3px 0 0 3px; cursor: pointer; font-size: var(--vscode-font-size); font-weight: 500; }
.split-main:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.split-main:disabled { opacity: 0.5; cursor: default; }
.split-main svg { width: 14px; height: 14px; flex-shrink: 0; }
.split-dropdown { width: 26px; display: flex; align-items: center; justify-content: center; padding: 0; border: none; border-left: 1px solid rgba(255,255,255,0.2); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 0 3px 3px 0; cursor: pointer; }
.split-dropdown:hover { background: var(--vscode-button-hoverBackground); }
.split-dropdown svg { width: 14px; height: 14px; }

/* Dropdown menu */
.dropdown-menu { position: absolute; left: 8px; right: 8px; background: var(--vscode-menu-background, var(--vscode-dropdown-background)); border: 1px solid var(--vscode-menu-border, var(--vscode-dropdown-border)); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 100; overflow: hidden; }
.dropdown-item { display: block; width: 100%; padding: 6px 12px; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: var(--vscode-font-size); color: var(--vscode-menu-foreground, var(--vscode-dropdown-foreground)); text-align: left; }
.dropdown-item:hover { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-menu-selectionForeground, var(--vscode-foreground)); }
.dropdown-item:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.dropdown-item.active { font-weight: 600; }

/* ── Files Section ── */
.files-section { flex: 1; overflow-y: auto; }
.empty-state { padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); }

/* Section headers */
.section-header { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 4px; height: 22px; background: var(--vscode-sideBarSectionHeader-background, transparent); border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; z-index: 1; }
.section-title-row { display: flex; align-items: center; gap: 2px; cursor: pointer; flex: 1; min-width: 0; user-select: none; border: 0; background: transparent; color: inherit; font: inherit; height: 100%; text-align: left; }
.section-title-row:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.section-chevron { display: flex; align-items: center; flex-shrink: 0; }
.section-chevron svg { width: 14px; height: 14px; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); letter-spacing: 0.3px; }
.section-count { font-size: 10px; min-width: 16px; height: 16px; line-height: 16px; text-align: center; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 0 4px; margin-left: 4px; flex-shrink: 0; }
.section-actions { display: flex; gap: 1px; opacity: 1; }

/* Icon buttons */
.icon-btn { width: 22px; height: 22px; border: none; background: transparent; color: var(--vscode-icon-foreground, var(--vscode-foreground)); border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0.7; }
.icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); opacity: 1; }
.icon-btn svg { width: 16px; height: 16px; }

/* File rows */
.file-row { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 22px; cursor: pointer; font-size: 12px; height: 22px; }
.file-row:hover { background: var(--vscode-list-hoverBackground); }
.file-actions { visibility: visible; display: flex; gap: 1px; margin-left: auto; flex-shrink: 0; }
.conflict-file-row .file-actions { visibility: visible; }

.file-status-indicator { width: 16px; text-align: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-left: 4px; }
.file-status-indicator.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status-indicator.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status-indicator.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status-indicator.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }
.file-status-indicator.untracked { color: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991); }
.file-status-indicator.conflict { color: var(--vscode-gitDecoration-conflictingResourceForeground, #e37400); font-weight: 900; }

/* Conflict banner */
.conflict-banner { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--vscode-inputValidation-warningBackground, rgba(227, 116, 0, 0.15)); border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #e37400); gap: 8px; }
.conflict-banner-text { font-size: 12px; font-weight: 600; color: var(--vscode-foreground); white-space: nowrap; }
.conflict-banner-actions { display: flex; gap: 4px; flex-shrink: 0; }
.banner-btn { padding: 2px 10px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.banner-btn:hover { background: var(--vscode-button-hoverBackground); }
.banner-btn.secondary { background: var(--vscode-button-secondaryBackground, rgba(90, 93, 94, 0.4)); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); }
.banner-btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(90, 93, 94, 0.6)); }

/* Conflict section header */
.conflict-section .section-title { color: var(--vscode-gitDecoration-conflictingResourceForeground, #e37400); }
.conflict-count { background: var(--vscode-gitDecoration-conflictingResourceForeground, #e37400) !important; color: #fff !important; }

.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }
.file-dir { color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 2; margin-left: 4px; }

/* Tree view */
.tree-folder-row { display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 12px; height: 22px; padding-right: 8px; width: 100%; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
.tree-folder-row:hover { background: var(--vscode-list-hoverBackground); }
.tree-folder-row:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.tree-folder-chevron { display: flex; align-items: center; flex-shrink: 0; }
.tree-folder-chevron svg { width: 14px; height: 14px; }
.tree-folder-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-icon { flex-shrink: 0; font-size: 16px; line-height: 1; }
.folder-icon { color: var(--vscode-symbolIcon-folderForeground, var(--vscode-descriptionForeground)); flex-shrink: 0; }
.file-icon { color: var(--vscode-symbolIcon-fileForeground, var(--vscode-descriptionForeground)); flex-shrink: 0; }
.tree-file-row { padding-right: 8px; gap: 3px; }

/* Stash rows */
.stash-row { cursor: pointer; }
.stash-expand-btn { display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1; height: 100%; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.stash-expand-btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.stash-chevron { display: flex; align-items: center; flex-shrink: 0; }
.stash-chevron svg { width: 14px; height: 14px; }
.stash-label { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; flex-shrink: 0; margin-right: 4px; }
.stash-file-row { padding-left: 38px !important; cursor: pointer; }
.stash-loading { padding: 4px 8px 4px 38px; font-size: 11px; color: var(--vscode-descriptionForeground); }
`;
