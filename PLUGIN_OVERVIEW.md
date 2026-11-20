# Model Favorites

Star the models you actually use and reach them from one tab in BB's model
picker.

Open the model picker in any composer and star a model row. The star stores the
provider, the model, and the reasoning level that is currently selected. A new
**Favorites** tab appears beside the provider tabs and lists every starred
model with its provider icon and reasoning level. If a composer has no model
selected yet, the picker opens on the Favorites tab instead of a provider list.

Picking a favorite applies the whole saved combination through the composer's
own selection API. The composer keeps BB's normal display, the provider icon
and the model name, and its model, reasoning, and provider tabs stay in sync.

## Behavior

- **Star any model** in the active provider list. A starred row shows a filled
  star; click it again to remove the favorite.
- **Favorites tab** shows provider icon, model name, and reasoning level. The
  model already selected in the composer is listed first.
- **Pick and go**: choosing a favorite applies it and closes the picker.
- **Search** filters the Favorites list as well as the native model list.
- **Auto-open** when the composer has no model yet; disable it in the plugin
  settings if you prefer to start on the provider list.
- **Settings page** lists saved favorites and can remove them.

## Notes

The plugin is a display adapter over BB's picker. It reads the provider tabs,
model rows, and the search box, and it leaves the native menu untouched when it
cannot match a row unambiguously. It works in the desktop picker; the compact
and mobile pickers keep their native behavior.

Favorites are stored on the BB server, so every window and machine connected to
the same server sees the same list.
