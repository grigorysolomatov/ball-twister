# Level editor plugin

Lets one author levels inside the app. Everything lives in this folder;
the app only has one small loader (`loadPlugins` in `src/ui/app.js`).

Features: paint a 7x7 board, name, play-test (with Back to editor),
save into theme tabs (rename, delete, drag to reorder, Move between
tabs), read-only "Old levels" tab (the built-in 24), export/import.
Storage: `bt-editor-levels` = `{version:2, tabs:[{id,name,levels}],
selected}`; the round-8 flat list is migrated into a "Medieval" tab and
its raw value kept in `bt-editor-levels-backup-v1`. Pure logic lives in
`store.js` (tested in `test/editor-store.test.js`).

Export: `{version:2, tabs:[{name, levels:[{title, rows}]}]}` with rows
of `X` (ball) and `.`. Import also accepts the old flat list.

## Turn it off for release

Set `EDITOR_ENABLED = false` in `src/plugins/config.js`.

## Remove it completely

1. Delete the folder `src/plugins/` (this one and `config.js`).
2. In `src/ui/app.js` delete the function `loadPlugins` and its call
   `loadPlugins();` in `init()`.
3. Optional: remove the `bt:page` event line in `showPage`, and the
   `game.mode.onSolved` and `game.level.hint` lines (unused afterwards).

The plugin never edits core files at runtime. It uses only the small
`api` object passed to `install(api)`, registers one mode
(`editor-test`), and adds an "Editor" button to the start screen.
