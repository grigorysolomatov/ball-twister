# Level editor plugin

Lets one author levels inside the app. Everything lives in this folder;
the app only has one small loader (`loadPlugins` in `src/ui/app.js`).

Features: paint a 7x7 board, name and chapter, play-test with a random
scramble, save (localStorage key `bt-editor-levels`), duplicate, delete,
load a built-in level, export/import JSON.

Export format: a list of `{ "title", "chapter", "rows": [7 strings] }`
where rows use `X` for a ball and `.` for empty, exactly like `RAW` in
`src/core/levels.js`. `chapter` is a number or `null` (unsorted).

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
