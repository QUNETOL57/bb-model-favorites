import { catalogSchema, type Catalog, type Favorite } from "./contract";
import { ModelFavoritesMenu } from "./picker";

export const FAVORITES_CHANGED_EVENT = "bb-model-favorites:changed";
const REFRESH_MS = 15_000;

async function callRpc<T>(pluginId: string, method: string, input: unknown): Promise<T> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${encodeURIComponent(method)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const payload = (await response.json()) as { ok?: boolean; result?: unknown; error?: unknown };
  if (!response.ok || payload.ok !== true || !("result" in payload)) {
    const detail = payload.error === undefined ? `${response.status}` : JSON.stringify(payload.error);
    throw new Error(`Favorites RPC failed: ${detail}`);
  }
  return payload.result as T;
}

/** Tell the settings page and other windows that favorites changed. */
export function announceFavoritesChanged(): void {
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
}

export function mountModelFavorites({
  pluginId,
  signal,
}: {
  pluginId: string;
  signal?: AbortSignal;
}): () => void {
  let catalog: Catalog | null = null;
  let disposed = false;
  let inflight: AbortController | null = null;

  const controller = new ModelFavoritesMenu({
    getCatalog: () => catalog,
    toggleFavorite: async (input) => {
      const result = await callRpc<{ favorites: Favorite[] }>(pluginId, "toggle", input);
      applyFavorites(result.favorites);
      return result.favorites;
    },
    removeFavorite: async (input) => {
      const result = await callRpc<{ favorites: Favorite[] }>(pluginId, "remove", input);
      applyFavorites(result.favorites);
      return result.favorites;
    },
    onFavoritesChange: (favorites) => {
      applyFavorites(favorites);
      announceFavoritesChanged();
    },
  });

  function applyFavorites(favorites: Favorite[]): void {
    if (catalog) catalog = { ...catalog, favorites };
    controller.refresh();
  }

  controller.start();

  const load = async () => {
    if (disposed || inflight) return;
    const request = new AbortController();
    inflight = request;
    try {
      const next = await callRpc<unknown>(pluginId, "catalog", null);
      catalog = catalogSchema.parse(next);
      controller.refresh();
    } catch {
      // Keep the last good catalog; the next tick or mutation retries.
    } finally {
      if (inflight === request) inflight = null;
    }
  };

  const changed = () => {
    void load();
  };
  window.addEventListener(FAVORITES_CHANGED_EVENT, changed);
  const timer = window.setInterval(() => {
    void load();
  }, REFRESH_MS);
  void load();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    inflight?.abort();
    window.clearInterval(timer);
    window.removeEventListener(FAVORITES_CHANGED_EVENT, changed);
    controller.dispose();
  };
  signal?.addEventListener("abort", dispose, { once: true });
  return dispose;
}
