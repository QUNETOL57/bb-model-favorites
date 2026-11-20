import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  catalogSchema,
  favoriteSchema,
  type Catalog,
  type Favorite,
  type PickerModel,
  type PickerProvider,
} from "./contract";

const KV_KEY = "favorites";
const MAX_FAVORITES = 200;
const MODEL_CACHE_TTL_MS = 30_000;

export const rpcContract = defineRpcContract({
  catalog: {
    input: z.null(),
    output: catalogSchema,
  },
  toggle: {
    input: z.object({
      providerId: z.string().trim().min(1).max(100),
      model: z.string().trim().min(1).max(300),
      reasoningLevel: z.string().trim().max(100).default(""),
      serviceTier: z.string().trim().max(100).optional(),
    }),
    output: z.object({ favorites: z.array(favoriteSchema) }),
  },
  remove: {
    input: z.object({
      providerId: z.string().trim().min(1).max(100),
      model: z.string().trim().min(1).max(300),
    }),
    output: z.object({ favorites: z.array(favoriteSchema) }),
  },
});

function trim(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Parse stored JSON at the boundary; drop anything malformed or duplicated. */
export function sanitizeFavorites(value: unknown): Favorite[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: Favorite[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const providerId = trim(record.providerId, 100);
    const model = trim(record.model, 300);
    if (!providerId || !model) continue;
    const key = `${providerId}\u0000${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reasoningLevel = trim(record.reasoningLevel, 100);
    const serviceTier = trim(record.serviceTier, 100);
    const addedAt = typeof record.addedAt === "number" && Number.isFinite(record.addedAt)
      ? Math.max(0, Math.trunc(record.addedAt))
      : Date.now();
    out.push({
      providerId,
      model,
      reasoningLevel,
      ...(serviceTier ? { serviceTier } : {}),
      addedAt,
    });
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export function toPickerModel(model: {
  id: string;
  displayName: string;
  model?: string;
  routeProviderId?: string;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: readonly { reasoningEffort: string; label?: string }[];
}): PickerModel {
  const reasoning = (model.supportedReasoningEfforts ?? []).map((effort) => ({
    id: effort.reasoningEffort,
    label: effort.label?.trim() || effort.reasoningEffort,
  }));
  const unique = [...new Map(reasoning.map((item) => [item.id, item])).values()];
  return {
    id: model.model ?? model.id,
    displayName: model.displayName || model.model || model.id,
    ...(model.routeProviderId ? { routeProviderId: model.routeProviderId } : {}),
    ...(model.defaultReasoningEffort ? { defaultReasoning: model.defaultReasoningEffort } : {}),
    reasoning: unique,
  };
}

function mergeModels(
  models: readonly Parameters<typeof toPickerModel>[0][],
  more: readonly Parameters<typeof toPickerModel>[0][],
): { models: PickerModel[]; more: PickerModel[] } {
  const main = models.map(toPickerModel);
  const mainIds = new Set(main.map((model) => model.id));
  const extra = more
    .map(toPickerModel)
    .filter((model) => !mainIds.has(model.id));
  return { models: main, more: extra };
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    autoOpen: {
      type: "boolean",
      label: "Open Favorites when no model is selected",
      description:
        "When the model picker opens and the composer has no model yet, switch to the Favorites tab.",
      default: true,
    },
  });

  async function readFavorites(): Promise<Favorite[]> {
    return sanitizeFavorites(await bb.storage.kv.get<unknown>(KV_KEY));
  }

  async function writeFavorites(favorites: Favorite[]): Promise<Favorite[]> {
    const clean = sanitizeFavorites(favorites);
    await bb.storage.kv.set(KV_KEY, clean);
    return clean;
  }

  const modelCache = new Map<string, { at: number; value: Pick<PickerProvider, "models" | "more"> }>();

  async function modelsFor(providerId: string): Promise<Pick<PickerProvider, "models" | "more">> {
    const cached = modelCache.get(providerId);
    if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) return cached.value;
    let value: Pick<PickerProvider, "models" | "more"> = { models: [], more: [] };
    try {
      const options = await bb.sdk.providers.models({ providerId });
      value = mergeModels(options.models, options.selectedOnlyModels);
    } catch (error) {
      bb.log.debug(`model catalog failed for ${providerId}: ${String(error)}`);
    }
    modelCache.set(providerId, { at: Date.now(), value });
    return value;
  }

  async function providerCatalog(): Promise<PickerProvider[]> {
    // Enabling a provider changes the roster, so the roster itself is never cached.
    const catalog = await bb.sdk.providers.catalog();
    const enabled = catalog.filter((provider) => provider.enabled && provider.pluginEnabled);
    return Promise.all(
      enabled.map(async (provider): Promise<PickerProvider> => ({
        id: provider.id,
        displayName: provider.info?.displayName ?? provider.displayName,
        ...(provider.info?.strings?.brandPrefix
          ? { brandPrefix: provider.info.strings.brandPrefix }
          : {}),
        ...(await modelsFor(provider.id)),
      })),
    );
  }

  async function toggle(input: {
    providerId: string;
    model: string;
    reasoningLevel: string;
    serviceTier?: string;
  }): Promise<Favorite[]> {
    const favorites = await readFavorites();
    const index = favorites.findIndex(
      (favorite) => favorite.providerId === input.providerId && favorite.model === input.model,
    );
    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      favorites.push({
        providerId: input.providerId,
        model: input.model,
        reasoningLevel: input.reasoningLevel,
        ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
        addedAt: Date.now(),
      });
    }
    return writeFavorites(favorites);
  }

  async function remove(input: { providerId: string; model: string }): Promise<Favorite[]> {
    const favorites = await readFavorites();
    return writeFavorites(
      favorites.filter(
        (favorite) => favorite.providerId !== input.providerId || favorite.model !== input.model,
      ),
    );
  }

  bb.rpc.register(rpcContract, {
    async catalog(): Promise<Catalog> {
      const [providers, favorites, values] = await Promise.all([
        providerCatalog(),
        readFavorites(),
        settings.get(),
      ]);
      modelCache.clear();
      return { providers, favorites, autoOpen: values.autoOpen !== false };
    },
    async toggle(input) {
      return { favorites: await toggle(input) };
    },
    async remove(input) {
      return { favorites: await remove(input) };
    },
  });
}
