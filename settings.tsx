import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Catalog, Favorite, PickerModel } from "./contract";
import { announceFavoritesChanged } from "./content";
import { reasoningLabel } from "./picker";

function modelFor(catalog: Catalog, favorite: Favorite): PickerModel | undefined {
  const provider = catalog.providers.find((entry) => entry.id === favorite.providerId);
  return (
    provider?.models.find((model) => model.id === favorite.model) ??
    provider?.more.find((model) => model.id === favorite.model)
  );
}

export function FavoritesSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc.call("catalog", null).then(
      (next) => {
        setCatalog(next);
        setError(null);
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (favorite: Favorite) => {
    const key = `${favorite.providerId}/${favorite.model}`;
    setPending(key);
    try {
      const result = await rpc.call("remove", {
        providerId: favorite.providerId,
        model: favorite.model,
      });
      setCatalog((current) => (current ? { ...current, favorites: result.favorites } : current));
      announceFavoritesChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {catalog === null ? (
        <p className="text-sm text-muted-foreground">Loading favorites…</p>
      ) : catalog.favorites.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No favorites yet. Open the model picker in a composer and star a model.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
          {catalog.favorites.map((favorite) => {
            const provider = catalog.providers.find((entry) => entry.id === favorite.providerId);
            const model = modelFor(catalog, favorite);
            const key = `${favorite.providerId}/${favorite.model}`;
            return (
              <li key={key} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{model?.displayName ?? favorite.model}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[provider?.displayName ?? favorite.providerId, reasoningLabel(favorite.reasoningLevel, model)]
                      .filter((part) => part.length > 0)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground disabled:opacity-50"
                  disabled={pending === key}
                  onClick={() => void remove(favorite)}
                  aria-label={`Remove ${model?.displayName ?? favorite.model} from favorites`}
                >
                  {pending === key ? "Removing…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {catalog?.autoOpen ? (
        <p className="text-xs text-muted-foreground">
          The Favorites tab opens by itself when a composer has no model yet.
        </p>
      ) : null}
    </div>
  );
}
