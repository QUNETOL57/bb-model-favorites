# bb-plugin-model-favorites

Star a model in BB's composer model picker, then pick it again from a
**Favorites** tab next to the provider tabs. A favorite keeps its provider,
model, and reasoning level.

## What it does

- Adds a star to every model row in the native picker (desktop layout).
- Adds a **Favorites** tab beside the provider tabs. Rows show the provider
  icon, the model name, and the saved reasoning level. The model currently in
  the composer is listed first.
- The tab opens by itself when the picker opens and the composer has no model
  yet (configurable).
- Picking a favorite applies provider + model + reasoning through
  `useComposer().setSelection()`, so the composer keeps BB's normal display:
  provider icon and model name. The picker closes once the value lands.
- The search box filters the Favorites list too.
- Settings → Plugins → Model Favorites lists saved favorites and can remove
  them.

## How it works

- `server.ts` — stores favorites in `bb.storage.kv`, reads provider catalogs
  with `bb.sdk.providers.catalog()` and `bb.sdk.providers.models()`, and exposes
  `catalog`, `toggle`, and `remove` RPC methods.
- `content.ts` — a trusted content script (no React slot) that mounts the DOM
  adapter and fetches the catalog over RPC.
- `picker.ts` — the adapter around the host picker: label matching, stars, the
  Favorites tab and list, and applying a selection.
- `app.tsx` — registers the settings section, an invisible composer action that
  exposes the composer handle to the content script (`data-bb-mf-bridge`), and
  the content script itself.
- `settings.tsx` — the plugin settings page.

This is a DOM adapter over BB's picker markup, like the Hide Models plugin. It
fails open: ambiguous labels, compact/mobile layouts, or a picker whose layout
changed leave the native menu untouched.

## Install and develop

```
npm install
bb plugin install .
bb plugin dev          # rebuild + reload on every save
```

`bb plugin build .` writes `dist/`. Reload after source edits:

```
bb plugin reload model-favorites
```

## Configure

```
bb plugin config model-favorites
bb plugin config model-favorites set autoOpen false
bb plugin reload model-favorites
```

`autoOpen` (default `true`) opens the Favorites tab when the composer has no
model selected.

## Tests

```
npx vitest run     # picker adapter in jsdom
npx tsc --noEmit
```

## Limits

- Desktop picker only; the compact/mobile picker is left alone.
- Stars appear on the main model list, not inside the nested "More models"
  submenu (native rows there still work).
- A BB picker layout change can disable the adapter until it is updated; it
  never guesses when labels or markers are ambiguous.

## License

MIT
