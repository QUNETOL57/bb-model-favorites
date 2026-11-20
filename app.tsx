import { definePluginApp, useComposer } from "@get-bb/plugin-sdk/app";
import { useEffect, useRef } from "react";
import "./app.css";
import { mountModelFavorites } from "./content";
import type { ComposerBridge } from "./picker";
import { FavoritesSettings } from "./settings";

interface BridgeNode extends HTMLSpanElement {
  __bbModelFavorites?: ComposerBridge;
}

/**
 * Invisible span in every composer. The content script reads it to ask the
 * composer for its current picker values and to apply a favorite exactly the
 * way a hand-picked selection is applied.
 */
function ComposerBridgeAction() {
  const composer = useComposer();
  const node = useRef<HTMLSpanElement>(null);
  const latest = useRef(composer);
  latest.current = composer;

  useEffect(() => {
    const span = node.current as BridgeNode | null;
    if (!span) return;
    span.__bbModelFavorites = {
      getSelection: () => latest.current.selection,
      setSelection: (selection) => latest.current.setSelection(selection),
    };
    return () => {
      delete span.__bbModelFavorites;
    };
  }, []);

  return <span ref={node} data-bb-mf-bridge="" hidden aria-hidden="true" />;
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "favorites",
    title: "Favorite models",
    description:
      "Star a model in the composer's model picker to keep it here. A favorite keeps its provider, model, and reasoning level.",
    component: FavoritesSettings,
  });

  app.composer.customize({
    id: "favorites-bridge",
    actions: [{ id: "bridge", component: ComposerBridgeAction }],
  });

  app.contentScripts.register({
    id: "favorites-picker",
    mount({ pluginId, signal }) {
      return mountModelFavorites({ pluginId, signal });
    },
  });
});
