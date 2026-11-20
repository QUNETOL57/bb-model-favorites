---
name: model-favorites
description: Explain how Model Favorites works and how to change its setting. Use when the user asks about starred models, the Favorites tab in the model picker, or the plugin's auto-open behavior.
---

# Model Favorites

Model Favorites is installed as the `model-favorites` plugin. It adds stars to
BB's model picker and a Favorites tab beside the provider tabs.

## What is stored

Each favorite is `{ providerId, model, reasoningLevel, serviceTier?, addedAt }`.
The reasoning level is captured when the star is clicked and reapplied when the
favorite is picked. Favorites live in the plugin's server-side key-value store,
not in a thread or draft.

## What the user sees

- A star in each model row of the desktop model picker.
- A **Favorites** tab beside the provider tabs, showing the provider icon, model
  name, and reasoning level. The model already selected in the composer comes
  first.
- The tab auto-opens when the picker opens for a composer without a model.
- Settings → Plugins → Model Favorites lists and removes favorites.

## Settings

- `autoOpen` (boolean, default `true`) — open the Favorites tab when no model is
  selected.

```
bb plugin config model-favorites
bb plugin config model-favorites set autoOpen false
bb plugin reload model-favorites
```

There is no CLI command; favorites are managed from the picker and the settings
page.

## Limits

The picker adapter is experimental and desktop-only. It fails open when labels
are ambiguous or the picker layout changes. It does not add stars inside the
nested "More models" submenu.
