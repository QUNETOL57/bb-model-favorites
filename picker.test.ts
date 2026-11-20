// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalog, Favorite, PickerModel, PickerProvider } from "./contract";
import {
  STAR_ATTR,
  TAB_ATTR,
  LIST_ATTR,
  MODE_CLASS,
  ORDER_ATTR,
  SELECTED_ROW_ATTR,
  ModelFavoritesMenu,
  type ComposerBridge,
} from "./picker";

interface ToggleInput {
  providerId: string;
  model: string;
  reasoningLevel: string;
  serviceTier?: string;
}

function model(id: string, extra: Partial<PickerModel> = {}): PickerModel {
  return {
    id,
    displayName: id,
    reasoning: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
    defaultReasoning: "high",
    ...extra,
  };
}

function provider(overrides: Partial<PickerProvider> = {}): PickerProvider {
  return {
    id: "provider-a",
    displayName: "Provider A",
    models: [model("alpha"), model("beta")],
    more: [],
    ...overrides,
  };
}

function favorite(overrides: Partial<Favorite> = {}): Favorite {
  return {
    providerId: "provider-a",
    model: "alpha",
    reasoningLevel: "high",
    addedAt: 1,
    ...overrides,
  };
}

function row(index: number, title: string): string {
  return `<button type="button" id=":r1:-opt-${index}" role="option"><span class="truncate" title="${title}"><span>${title}</span></span><span class="flex shrink-0 items-center gap-1.5"></span></button>`;
}

function menuMarkup(): string {
  return `<div class="flex min-h-0 flex-col p-0">
    <div class="flex shrink-0 items-center gap-0.5 border-b border-border bg-background px-2.5 pt-1">
      <button type="button" title="Provider A" class="flex items-center justify-center border-b-2 border-foreground text-foreground"><span>A</span></button>
      <button type="button" title="Provider B" class="flex items-center justify-center border-b-2 border-transparent text-muted-foreground"><span>B</span></button>
    </div>
    <input placeholder="Search models" aria-label="Search models" />
    <div role="listbox" aria-label="Models">
      <div>Model</div>
      ${row(0, "alpha")}
      ${row(1, "beta")}
    </div>
  </div>`;
}

function rowFor(title: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button[id*="-opt-"]')).find(
    (button) => button.querySelector<HTMLElement>("[title]")?.getAttribute("title") === title,
  );
  if (!found) throw new Error(`No row ${title}`);
  return found;
}

describe("model favorites menu", () => {
  let catalog: Catalog;
  let controller: ModelFavoritesMenu;
  let toggleFavorite: ReturnType<typeof vi.fn>;
  let removeFavorite: ReturnType<typeof vi.fn>;
  let bridge: ComposerBridge;
  let selection: { providerId: string; model: string; reasoningLevel: string } | null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.innerHTML = `
      <div id="composer">
        <button id="trigger" aria-expanded="true" aria-haspopup="dialog">Model</button>
        <span data-bb-mf-bridge hidden></span>
      </div>
      ${menuMarkup()}`;
    selection = { providerId: "provider-a", model: "", reasoningLevel: "low" };
    bridge = {
      getSelection: () => selection,
      setSelection: vi.fn(async (next) => {
        selection = { ...selection!, ...next } as typeof selection;
      }),
    };
    (document.querySelector("[data-bb-mf-bridge]") as unknown as { __bbModelFavorites: ComposerBridge })
      .__bbModelFavorites = bridge;

    catalog = { providers: [provider()], favorites: [favorite()], autoOpen: false };
    toggleFavorite = vi.fn(async (input: ToggleInput) => {
      const exists = catalog.favorites.some(
        (entry) => entry.providerId === input.providerId && entry.model === input.model,
      );
      return exists
        ? catalog.favorites
        : [...catalog.favorites, { ...input, addedAt: 2 } as Favorite];
    });
    removeFavorite = vi.fn(async (input: { providerId: string; model: string }) =>
      catalog.favorites.filter(
        (entry) => entry.providerId !== input.providerId || entry.model !== input.model,
      ),
    );
    controller = new ModelFavoritesMenu({
      getCatalog: () => catalog,
      toggleFavorite,
      removeFavorite,
      onFavoritesChange: (favorites) => {
        catalog = { ...catalog, favorites };
      },
      win: window,
      doc: document,
    });
  });

  afterEach(() => {
    controller?.dispose();
    document.body.innerHTML = "";
  });

  it("adds a star to every model row and marks the favorited one", () => {
    controller.start();
    controller.refresh();

    expect(rowFor("alpha").querySelector(`[${STAR_ATTR}]`)?.getAttribute("data-mf-active")).toBe("true");
    expect(rowFor("beta").querySelector(`[${STAR_ATTR}]`)?.getAttribute("data-mf-active")).toBe("false");
    const gutter = rowFor("alpha").querySelector("span.shrink-0");
    expect(gutter?.lastElementChild?.hasAttribute(STAR_ATTR)).toBe(true);
  });

  it("stars a model with the current reasoning and provider", async () => {
    controller.start();
    controller.refresh();

    rowFor("beta").querySelector<HTMLElement>(`[${STAR_ATTR}]`)!.click();
    await vi.waitFor(() => expect(toggleFavorite).toHaveBeenCalledTimes(1));

    expect(toggleFavorite).toHaveBeenCalledWith({
      providerId: "provider-a",
      model: "beta",
      reasoningLevel: "low",
    });
  });

  it("removes an existing favorite from its row star", async () => {
    controller.start();
    controller.refresh();

    rowFor("alpha").querySelector<HTMLElement>(`[${STAR_ATTR}]`)!.click();
    await vi.waitFor(() => expect(removeFavorite).toHaveBeenCalledWith({
      providerId: "provider-a",
      model: "alpha",
    }));
  });

  it("inserts a Favorites tab next to provider tabs and lists provider, model, reasoning", () => {
    controller.start();
    controller.refresh();

    const tab = document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`);
    expect(tab?.title).toBe("Favorites");
    expect(tab?.parentElement?.querySelectorAll("button[title]").length).toBe(3);
    expect(tab?.parentElement?.firstElementChild).toBe(tab);

    tab!.click();

    expect(document.querySelector("[class*='min-h-0']")?.classList.contains(MODE_CLASS)).toBe(true);
    const list = document.querySelector<HTMLElement>(`[${LIST_ATTR}]`);
    expect(list).not.toBeNull();
    expect(list!.textContent).toContain("alpha");
    expect(list!.textContent).toContain("High");
    expect((list!.querySelector("[data-mf-fav-row]") as HTMLElement).title).toBe(
      "Provider A · alpha · High",
    );
  });

  it("applies a favorite through the composer bridge", async () => {
    catalog = { ...catalog, favorites: [favorite({ model: "beta", reasoningLevel: "low" })] };
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();

    document.querySelector<HTMLElement>("[data-mf-fav-row]")!.click();

    await vi.waitFor(() =>
      expect(bridge.setSelection).toHaveBeenCalledWith({
        providerId: "provider-a",
        model: "beta",
        reasoningLevel: "low",
      }),
    );
  });

  it("opens the Favorites tab by itself when the composer has no model", () => {
    catalog = { ...catalog, autoOpen: true };
    selection = { providerId: "provider-a", model: "", reasoningLevel: "low" };
    controller.start();
    controller.refresh();

    expect(document.querySelector("[class*='min-h-0']")?.classList.contains(MODE_CLASS)).toBe(true);
    expect(document.querySelector(`[${LIST_ATTR}]`)).not.toBeNull();
  });

  it("does not auto-open once the composer has a model", () => {
    catalog = { ...catalog, autoOpen: true };
    selection = { providerId: "provider-a", model: "alpha", reasoningLevel: "low" };
    controller.start();
    controller.refresh();

    expect(document.querySelector("[class*='min-h-0']")?.classList.contains(MODE_CLASS)).toBe(false);
  });

  it("returns to the native list when a provider tab is clicked", () => {
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();
    expect(document.querySelector("[class*='min-h-0']")?.classList.contains(MODE_CLASS)).toBe(true);

    (document.querySelector('button[title="Provider B"]') as HTMLElement).click();

    expect(document.querySelector("[class*='min-h-0']")?.classList.contains(MODE_CLASS)).toBe(false);
    expect(document.querySelector(`[${LIST_ATTR}]`)).toBeNull();
  });

  it("filters the favorites list from the host search box", () => {
    catalog = {
      ...catalog,
      favorites: [favorite(), favorite({ model: "beta", reasoningLevel: "low" })],
    };
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Search models"]')!;

    input.value = "beta";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.querySelectorAll("[data-mf-fav-row]").length).toBe(1);
    expect(document.querySelector("[data-mf-fav-row]")?.textContent).toContain("beta");
  });

  it("puts the model the composer already uses first", () => {
    catalog = {
      ...catalog,
      favorites: [favorite(), favorite({ model: "beta", reasoningLevel: "low" })],
    };
    selection = { providerId: "provider-a", model: "beta", reasoningLevel: "low" };
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();

    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-mf-fav-row]"));
    expect(rows.map((row) => row.dataset.model)).toEqual(["beta", "alpha"]);
    expect(rows[0]?.dataset.mfSelected).toBe("true");
  });

  it("keeps the favorites list at the top of the model column even before a listbox exists", () => {
    document.body.innerHTML = `
      <div id="composer">
        <button id="trigger" aria-expanded="true" aria-haspopup="dialog">Model</button>
        <span data-bb-mf-bridge hidden></span>
      </div>
      <div class="flex min-h-0 flex-col p-0" id="menu">
        <div class="flex shrink-0 items-center gap-0.5 border-b border-border bg-background px-2.5 pt-1">
          <button type="button" title="Provider A" class="flex items-center justify-center border-b-2 border-foreground text-foreground"><span>A</span></button>
          <button type="button" title="Provider B" class="flex items-center justify-center border-b-2 border-transparent text-muted-foreground"><span>B</span></button>
        </div>
        <input placeholder="Search models" aria-label="Search models" />
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden" id="column"></div>
      </div>`;
    (document.querySelector("[data-bb-mf-bridge]") as unknown as { __bbModelFavorites: ComposerBridge })
      .__bbModelFavorites = bridge;
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();

    const column = document.querySelector<HTMLElement>("#column")!;
    expect(column.firstElementChild?.hasAttribute(LIST_ATTR)).toBe(true);
    expect(document.querySelector<HTMLElement>("#menu")?.lastElementChild).toBe(column);
  });

  it("clones the host provider logo instead of falling back to a letter", () => {
    const tab = document.querySelector<HTMLElement>('button[title="Provider A"]')!;
    tab.innerHTML = '<span class="inline-flex size-4"><span data-provider-logo="logo.svg"></span></span>';
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();

    const icon = document.querySelector<HTMLElement>("[data-mf-fav-row] .bb-mf-fav-icon")!;
    expect(icon.querySelector("[data-provider-logo]")).not.toBeNull();
    expect(icon.textContent).toBe("");
  });

  it("marks the composer's model as the first native row via CSS order", () => {
    selection = { providerId: "provider-a", model: "beta", reasoningLevel: "low" };
    controller.start();
    controller.refresh();

    expect(rowFor("beta").hasAttribute(SELECTED_ROW_ATTR)).toBe(true);
    expect(rowFor("alpha").hasAttribute(SELECTED_ROW_ATTR)).toBe(false);
    expect(rowFor("beta").parentElement?.hasAttribute(ORDER_ATTR)).toBe(true);
  });

  it("moves the order marker when the selected model changes", () => {
    selection = { providerId: "provider-a", model: "beta", reasoningLevel: "low" };
    controller.start();
    controller.refresh();
    selection = { providerId: "provider-a", model: "alpha", reasoningLevel: "low" };
    controller.refresh();

    expect(rowFor("alpha").hasAttribute(SELECTED_ROW_ATTR)).toBe(true);
    expect(rowFor("beta").hasAttribute(SELECTED_ROW_ATTR)).toBe(false);
  });

  it("draws a filled star for favorites and an outline for the rest", () => {
    controller.start();
    controller.refresh();

    expect(rowFor("alpha").querySelector(`[${STAR_ATTR}] svg`)?.getAttribute("fill")).toBe("currentColor");
    expect(rowFor("beta").querySelector(`[${STAR_ATTR}] svg`)?.getAttribute("fill")).toBe("none");
    expect(document.querySelector(`[${TAB_ATTR}] svg`)?.getAttribute("fill")).toBe("currentColor");
  });

  it("keeps the full model name on the name element for the host tooltip", () => {
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();
    const name = document.querySelector<HTMLElement>("[data-mf-fav-row] .bb-mf-fav-name")!;

    expect(name.title).toBe("alpha");
  });

  it("closes the picker after applying a favorite", async () => {
    controller.start();
    controller.refresh();
    document.querySelector<HTMLButtonElement>(`[${TAB_ATTR}]`)!.click();

    const escape = vi.fn();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") escape();
    };
    document.addEventListener("keydown", listener);
    document.querySelector<HTMLElement>("[data-mf-fav-row]")!.click();

    await vi.waitFor(() => expect(escape).toHaveBeenCalled());
    document.removeEventListener("keydown", listener);
  });
});
