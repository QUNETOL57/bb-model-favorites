import type { Catalog, Favorite, PickerModel, PickerProvider } from "./contract";

/* -------------------------------------------------------------------------- */
/* Markers and selectors                                                      */
/* -------------------------------------------------------------------------- */

export const TAB_ATTR = "data-mf-tab";
export const TAB_BAR_ATTR = "data-mf-tabbar";
export const LIST_ATTR = "data-mf-favorites";
export const ROW_ATTR = "data-mf-fav-row";
export const STAR_ATTR = "data-mf-star";
export const MORE_ATTR = "data-mf-more";
export const BRIDGE_ATTR = "data-bb-mf-bridge";
export const ORDER_ATTR = "data-mf-provider-order";
export const SELECTED_ROW_ATTR = "data-mf-selected-row";
export const MODE_CLASS = "bb-mf-favorites-mode";

const COMPACT_QUERY = "(max-width: 767px)";
const ROW_SELECTOR = 'button[id*="-opt-"]';
const SEARCH_SELECTOR = 'input[placeholder="Search models"]';
const TAB_SELECTOR = 'button[title][class*="border-b-2"]';
const NATIVE_ROW_CLASS =
  "relative flex w-full cursor-default select-none items-center justify-between gap-3 rounded-sm px-2 text-xs outline-none hover:bg-state-hover hover:text-foreground transition-none data-[last-hovered]:bg-state-hover data-[last-hovered]:text-foreground py-[0.3125rem] max-md:pointer-coarse:py-2";
const TAB_BAR_CLASS =
  "flex shrink-0 items-center gap-0.5 border-b border-border bg-background px-2.5 pt-1";
const TAB_CLASS = "flex items-center justify-center border-b-2 focus-visible:outline-none";

const STAR_PATH =
  "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z";
const STAR_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${STAR_PATH}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FILLED_STAR_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>`;

export interface ComposerSelectionSnapshot {
  providerId?: string;
  model?: string;
  reasoningLevel?: string;
  serviceTier?: string;
}

/** Installed by the composer bridge in app.tsx on a hidden span. */
export interface ComposerBridge {
  getSelection(): ComposerSelectionSnapshot | null;
  setSelection(selection: ComposerSelectionSnapshot): Promise<unknown>;
}

interface BridgeNode extends HTMLElement {
  __bbModelFavorites?: ComposerBridge;
}

/* -------------------------------------------------------------------------- */
/* Read-only helpers (exported for tests)                                     */
/* -------------------------------------------------------------------------- */

export function stripBrandPrefix(label: string, brandPrefix: string | undefined): string {
  if (!brandPrefix) return label;
  return label.toLowerCase().startsWith(brandPrefix.toLowerCase())
    ? label.slice(brandPrefix.length).trimStart()
    : label;
}

/** The title the host puts on a model row for this catalog entry. */
export function modelLabel(model: PickerModel, brandPrefix?: string): string {
  const base = stripBrandPrefix(model.displayName || model.id, brandPrefix);
  return model.routeProviderId ? `${base} · ${model.routeProviderId}` : base;
}

export function normalizeTabTitle(title: string): string {
  return title.replace(/\s*\(current thread\)$/u, "").trim();
}

/** True when an element is, or contains, a rendered provider logo/glyph. */
export function holdsProviderIcon(element: Element | null | undefined): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    (element.matches("svg, img, [data-provider-logo]") ||
      element.querySelector("svg, img, [data-provider-logo]") !== null)
  );
}

export function findOpenMenu(doc: Document = document): HTMLElement | null {
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>(SEARCH_SELECTOR));
  for (const input of inputs) {
    const root = input.closest<HTMLElement>('[class*="min-h-0"][class*="flex-col"]');
    if (root) return root;
  }
  const roots = Array.from(
    doc.querySelectorAll<HTMLElement>('[class*="min-h-0"][class*="flex-col"][class*="p-0"]'),
  );
  return roots.find((root) => root.querySelector(ROW_SELECTOR)) ?? null;
}

export function rowTitle(row: Element): string {
  return (
    row.querySelector<HTMLElement>("[title]")?.getAttribute("title") ??
    row.getAttribute("title") ??
    ""
  );
}

export function searchInput(root: HTMLElement): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
}

export function providerTabs(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(TAB_SELECTOR)).filter(
    (tab) => !tab.hasAttribute(TAB_ATTR),
  );
}

export function mainRows(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(ROW_SELECTOR)).filter(
    (row) => !row.closest(`[${LIST_ATTR}]`) && rowTitle(row).length > 0,
  );
}

/**
 * Resolve the provider from the active tab. Duplicate or unreadable labels are
 * ambiguous, so this returns null instead of guessing by provider index.
 */
export function resolveActiveProvider(
  root: HTMLElement,
  providers: readonly PickerProvider[],
): PickerProvider | null {
  const tabs = providerTabs(root);
  if (tabs.length > 0) {
    const active = tabs.find((tab) => tab.classList.contains("border-foreground"));
    if (!active) return null;
    const title = normalizeTabTitle(active.title);
    const matches = providers.filter((provider) => provider.displayName === title);
    return matches.length === 1 ? matches[0]! : null;
  }
  return providers.length === 1 ? providers[0]! : null;
}

function labelKey(label: string): string {
  return label.replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * Map each observed row to one exact model, or null when anything is ambiguous.
 * The host sometimes adjusts letter case in a display name, so labels compare
 * case-insensitively; a label shared by two models still fails open.
 */
export function mapRows(
  provider: PickerProvider,
  rows: readonly HTMLButtonElement[],
): Map<HTMLButtonElement, PickerModel> | null {
  const byLabel = new Map<string, Set<string>>();
  const models = new Map<string, PickerModel>();
  for (const model of [...provider.models, ...provider.more]) {
    const label = labelKey(modelLabel(model, provider.brandPrefix));
    const ids = byLabel.get(label) ?? new Set<string>();
    ids.add(model.id);
    byLabel.set(label, ids);
    models.set(model.id, model);
  }
  const mapped = new Map<HTMLButtonElement, PickerModel>();
  const used = new Set<string>();
  for (const row of rows) {
    const ids = byLabel.get(labelKey(rowTitle(row)));
    if (!ids || ids.size !== 1) return null;
    const id = [...ids][0]!;
    if (used.has(id)) return null;
    used.add(id);
    const model = models.get(id);
    if (!model) return null;
    mapped.set(row, model);
  }
  return mapped;
}

export function favoriteKey(favorite: { providerId: string; model: string }): string {
  return `${favorite.providerId}\u0000${favorite.model}`;
}

export function isCompactViewport(win: Window = window): boolean {
  return typeof win.matchMedia === "function" && win.matchMedia(COMPACT_QUERY).matches;
}

export function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** The label for a stored reasoning id, looked up on the model, then the provider. */
export function reasoningLabel(
  reasoningId: string,
  model?: PickerModel,
): string {
  if (!reasoningId) return "";
  const fromModel = model?.reasoning.find((level) => level.id === reasoningId);
  return fromModel?.label ?? capitalize(reasoningId);
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export interface ModelFavoritesOptions {
  getCatalog: () => Catalog | null;
  toggleFavorite: (input: {
    providerId: string;
    model: string;
    reasoningLevel: string;
    serviceTier?: string;
  }) => Promise<Favorite[]>;
  removeFavorite: (input: { providerId: string; model: string }) => Promise<Favorite[]>;
  onFavoritesChange?: (favorites: Favorite[]) => void;
  onApply?: (favorite: Favorite) => void;
  win?: Window;
  doc?: Document;
}

/**
 * DOM adapter around bb's composer model picker. It only reads the host menu's
 * markup, adds stars and a Favorites tab, and applies a favorite through the
 * composer API when the bridge is present.
 */
export class ModelFavoritesMenu {
  private readonly win: Window;
  private readonly doc: Document;
  private readonly options: ModelFavoritesOptions;

  private root: HTMLElement | null = null;
  private provider: PickerProvider | null = null;
  private rows = new Map<HTMLButtonElement, PickerModel>();
  private stars = new Map<HTMLButtonElement, HTMLElement>();
  private orderedRow: HTMLButtonElement | null = null;
  private orderedContainer: HTMLElement | null = null;
  private tab: HTMLButtonElement | null = null;
  private tabBar: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private favoritesMode = false;
  private lastTrigger: HTMLElement | null = null;
  private openSessionDone = false;
  private panelSignature = "";
  private observer: MutationObserver | null = null;
  private frame = 0;
  private started = false;
  private disposed = false;
  private pending = false;
  private searchTerm = "";

  constructor(options: ModelFavoritesOptions) {
    this.options = options;
    this.win = options.win ?? window;
    this.doc = options.doc ?? document;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    this.doc.addEventListener("pointerdown", this.handlePointerDown, true);
    this.doc.addEventListener("keydown", this.handleKeyDown, true);
    this.doc.addEventListener("input", this.handleInput, true);
    this.doc.addEventListener("click", this.handleClick, true);
    this.sync();
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = null;
    this.doc.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.doc.removeEventListener("keydown", this.handleKeyDown, true);
    this.doc.removeEventListener("input", this.handleInput, true);
    this.doc.removeEventListener("click", this.handleClick, true);
    if (this.frame) {
      if (typeof this.win.cancelAnimationFrame === "function") this.win.cancelAnimationFrame(this.frame);
      else this.win.clearTimeout(this.frame);
      this.frame = 0;
    }
    this.restore();
  }

  /** Re-render after the content script fetched a fresh catalog. */
  refresh(): void {
    this.sync();
  }

  private schedule(): void {
    if (this.frame || this.disposed) return;
    const run = () => {
      this.frame = 0;
      this.sync();
    };
    this.frame =
      typeof this.win.requestAnimationFrame === "function"
        ? this.win.requestAnimationFrame(run)
        : this.win.setTimeout(run, 0);
  }

  /* ------------------------------- sync ---------------------------------- */

  private sync(): void {
    if (this.disposed) return;
    const catalog = this.options.getCatalog();
    const root = findOpenMenu(this.doc);
    if (!catalog || !root || isCompactViewport(this.win)) {
      this.restore();
      return;
    }
    if (root !== this.root) {
      this.restore();
      this.root = root;
    }

    const provider =
      this.favoritesMode && this.provider
        ? catalog.providers.find((entry) => entry.id === this.provider?.id) ?? null
        : resolveActiveProvider(root, catalog.providers);
    const rows = mainRows(root);
    const mapped = provider ? mapRows(provider, rows) : null;
    if (!provider || !mapped) {
      this.clearStars();
      this.clearProviderOrder();
      this.deactivateFavorites();
      this.removeTab();
      this.provider = null;
      this.rows = new Map();
      return;
    }

    this.provider = provider;
    this.rows = mapped;
    this.ensureTab(root);
    if (this.favoritesMode) this.setTabActive(true);
    this.renderStars(catalog);
    this.renderProviderOrder();

    if (!this.openSessionDone) {
      this.openSessionDone = true;
      if (catalog.autoOpen && catalog.favorites.length > 0 && this.composerHasNoModel()) {
        this.activateFavorites();
      }
    }

    if (this.favoritesMode) {
      this.list = this.ensureList(root);
      this.renderList(catalog);
    }
  }

  private restore(): void {
    this.clearStars();
    this.clearProviderOrder();
    this.removeTab();
    this.deactivateFavorites();
    this.rows = new Map();
    this.provider = null;
    this.root = null;
    this.openSessionDone = false;
    this.lastTrigger = null;
    this.searchTerm = "";
  }

  /* ----------------------------- triggers -------------------------------- */

  private handlePointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.root?.contains(target)) return;
    const trigger = target.closest<HTMLElement>('button,[role="button"]');
    if (trigger) this.lastTrigger = trigger;
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const active = this.doc.activeElement;
    if (active instanceof HTMLElement && !this.root?.contains(active)) {
      const trigger = active.closest<HTMLElement>('button,[role="button"]');
      if (trigger) this.lastTrigger = trigger;
    }
  };

  private handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !this.root) return;
    const tab = target.closest<HTMLButtonElement>(TAB_SELECTOR);
    if (tab && tab !== this.tab) this.deactivateFavorites();
  };

  private handleInput = (event: Event): void => {
    if (!this.favoritesMode || !this.root) return;
    const input = searchInput(this.root);
    if (!input || event.target !== input) return;
    if (input.value.trim() === this.searchTerm) return;
    this.searchTerm = input.value.trim();
    const catalog = this.options.getCatalog();
    if (catalog) this.renderList(catalog);
  };

  private resolveTrigger(): HTMLElement | null {
    if (this.lastTrigger?.isConnected) return this.lastTrigger;
    const active = this.doc.activeElement;
    if (active instanceof HTMLElement && !this.root?.contains(active)) {
      const trigger = active.closest<HTMLElement>('button,[role="button"]');
      if (trigger) return trigger;
    }
    const expanded = Array.from(
      this.doc.querySelectorAll<HTMLElement>('button[aria-expanded="true"]'),
    ).find((button) => !this.root?.contains(button) && !button.hasAttribute(TAB_ATTR));
    return expanded ?? null;
  }

  private bridge(): ComposerBridge | null {
    const candidates: HTMLElement[] = [];
    if (this.lastTrigger?.isConnected) candidates.push(this.lastTrigger);
    if (this.doc.activeElement instanceof HTMLElement) candidates.push(this.doc.activeElement);
    for (const trigger of this.doc.querySelectorAll<HTMLElement>(
      'button[aria-expanded="true"][aria-haspopup="dialog"]',
    )) {
      if (!this.root?.contains(trigger)) candidates.push(trigger);
    }
    for (const candidate of candidates) {
      const bridge = this.bridgeFrom(candidate);
      if (bridge) return bridge;
    }
    return null;
  }

  private bridgeFrom(node: HTMLElement | null): ComposerBridge | null {
    let current: HTMLElement | null = node;
    let depth = 0;
    while (current && depth < 12) {
      const host = current.querySelector<BridgeNode>(`[${BRIDGE_ATTR}]`);
      if (host?.__bbModelFavorites) return host.__bbModelFavorites;
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  private composerHasNoModel(): boolean {
    const bridge = this.bridge();
    if (!bridge) return false;
    try {
      const selection = bridge.getSelection();
      return selection !== null && !selection.model;
    } catch {
      return false;
    }
  }

  /* ------------------------------- stars --------------------------------- */

  private renderStars(catalog: Catalog): void {
    const provider = this.provider;
    if (!provider) return;
    const favoriteKeys = new Set(catalog.favorites.map(favoriteKey));
    const seen = new Set<HTMLButtonElement>();
    for (const [row, model] of this.rows) {
      seen.add(row);
      let star = this.stars.get(row);
      if (!star || !star.isConnected) {
        star = this.createStar(provider, model);
        const gutter = Array.from(row.querySelectorAll<HTMLElement>("span")).find(
          (span) => span !== row && span.className.includes("shrink-0"),
        );
        (gutter ?? row).append(star);
        this.stars.set(row, star);
      }
      const active = favoriteKeys.has(favoriteKey({ providerId: provider.id, model: model.id }));
      star.dataset.mfActive = String(active);
      // Swap the glyph only when it changes: innerHTML would otherwise fire the
      // childList observer and re-enter sync on every pass.
      if (star.dataset.mfFilled !== String(active)) {
        star.innerHTML = active ? FILLED_STAR_SVG : STAR_SVG;
        star.dataset.mfFilled = String(active);
      }
      star.setAttribute(
        "aria-label",
        active ? `Remove ${model.displayName} from favorites` : `Add ${model.displayName} to favorites`,
      );
      star.title = star.getAttribute("aria-label") ?? "";
    }
    for (const [row, star] of this.stars) {
      if (!seen.has(row) || !row.isConnected) {
        star.remove();
        this.stars.delete(row);
      }
    }
  }

  /**
   * Move the composer's current model to the top of the provider list with CSS
   * order instead of touching DOM nodes React owns.
   */
  private renderProviderOrder(): void {
    const provider = this.provider;
    const selection = this.favoritesMode ? null : this.selection();
    let target: HTMLButtonElement | null = null;
    if (provider && selection?.model) {
      const sameProvider = !selection.providerId || selection.providerId === provider.id;
      if (sameProvider) {
        for (const [row, model] of this.rows) {
          if (model.id === selection.model) {
            target = row;
            break;
          }
        }
      }
    }
    const container = target?.parentElement ?? null;
    if (this.orderedRow && this.orderedRow !== target) {
      this.orderedRow.removeAttribute(SELECTED_ROW_ATTR);
    }
    if (this.orderedContainer && this.orderedContainer !== container) {
      this.orderedContainer.removeAttribute(ORDER_ATTR);
    }
    this.orderedRow = target;
    this.orderedContainer = container;
    if (!target || !container) return;
    container.setAttribute(ORDER_ATTR, "");
    target.setAttribute(SELECTED_ROW_ATTR, "");
  }

  private clearProviderOrder(): void {
    this.orderedRow?.removeAttribute(SELECTED_ROW_ATTR);
    this.orderedContainer?.removeAttribute(ORDER_ATTR);
    this.orderedRow = null;
    this.orderedContainer = null;
  }

  private createStar(provider: PickerProvider, model: PickerModel): HTMLElement {
    const star = this.doc.createElement("span");
    star.className = "bb-mf-star";
    star.setAttribute(STAR_ATTR, "");
    star.setAttribute("role", "button");
    star.setAttribute("tabindex", "-1");
    star.innerHTML = STAR_SVG;
    star.dataset.mfFilled = "false";
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    star.addEventListener("mousedown", stop);
    star.addEventListener("pointerdown", stop);
    star.addEventListener("click", (event) => {
      stop(event);
      void this.toggle(provider, model);
    });
    return star;
  }

  private clearStars(): void {
    for (const star of this.stars.values()) star.remove();
    this.stars.clear();
  }

  private async toggle(provider: PickerProvider, model: PickerModel): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    try {
      const catalog = this.options.getCatalog();
      if (!catalog) return;
      const key = favoriteKey({ providerId: provider.id, model: model.id });
      const exists = catalog.favorites.some((favorite) => favoriteKey(favorite) === key);
      let favorites: Favorite[];
      if (exists) {
        favorites = await this.options.removeFavorite({ providerId: provider.id, model: model.id });
      } else {
        const selection = this.selection();
        const reasoningLevel = this.pickReasoning(model, selection?.reasoningLevel);
        favorites = await this.options.toggleFavorite({
          providerId: provider.id,
          model: model.id,
          reasoningLevel,
          ...(selection?.serviceTier ? { serviceTier: selection.serviceTier } : {}),
        });
      }
      this.options.onFavoritesChange?.(favorites);
      const next = this.options.getCatalog();
      if (next) {
        this.renderStars(next);
        if (this.favoritesMode) this.renderList(next);
      }
    } catch {
      // The picker is best-effort UI; a failed write leaves the star unchanged.
    } finally {
      this.pending = false;
    }
  }

  private selection(): ComposerSelectionSnapshot | null {
    try {
      return this.bridge()?.getSelection() ?? null;
    } catch {
      return null;
    }
  }

  /** Keep the stored level only when this model supports it. */
  private pickReasoning(model: PickerModel, preferred: string | undefined): string {
    const supported = model.reasoning;
    if (supported.length === 0) return preferred?.trim() ?? "";
    if (preferred && supported.some((level) => level.id === preferred)) return preferred;
    const pressed = this.pressedReasoning();
    if (pressed && supported.some((level) => level.id === pressed)) return pressed;
    if (model.defaultReasoning && supported.some((level) => level.id === model.defaultReasoning)) {
      return model.defaultReasoning;
    }
    return supported[0]!.id;
  }

  private pressedReasoning(): string | null {
    if (!this.root || !this.provider) return null;
    const levels = [...this.provider.models, ...this.provider.more].flatMap((model) => model.reasoning);
    const buttons = Array.from(this.root.querySelectorAll<HTMLElement>('button[aria-pressed="true"]'));
    for (const button of buttons) {
      const text = button.textContent?.trim() ?? "";
      const match = levels.find((level) => level.label === text || capitalize(level.id) === text);
      if (match) return match.id;
    }
    return null;
  }

  /* -------------------------------- tab ---------------------------------- */

  private ensureTab(root: HTMLElement): void {
    if (this.tab?.isConnected) return;
    const tabs = providerTabs(root);
    const template = tabs[0];
    const bar = template?.parentElement ?? this.createTabBar(root);
    const tab = this.doc.createElement("button");
    tab.type = "button";
    tab.setAttribute(TAB_ATTR, "");
    tab.title = "Favorites";
    tab.setAttribute("aria-label", "Favorites");
    // Use the provider tab's icon box so both kinds of tabs line up exactly.
    const iconTemplate = tabs
      .map((candidate) => candidate.firstElementChild)
      .find(holdsProviderIcon);
    const glyph =
      iconTemplate && !iconTemplate.matches("svg, img, [data-provider-logo]")
        ? (iconTemplate.cloneNode(false) as HTMLElement)
        : this.doc.createElement("span");
    glyph.classList.add("bb-mf-fav-tab-icon");
    glyph.removeAttribute("style");
    glyph.innerHTML = FILLED_STAR_SVG;
    tab.append(glyph);
    const templateClass = template?.className ?? TAB_CLASS;
    tab.className = `${templateClass
      .replace(/\bborder-foreground\b/g, "")
      .replace(/\btext-foreground\b/g, "")
      .replace(/\s+/g, " ")
      .trim()} border-transparent text-muted-foreground bb-mf-fav-tab`;
    tab.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.favoritesMode) this.deactivateFavorites();
      else this.activateFavorites();
    });
    bar.prepend(tab);
    this.tab = tab;
    this.tabBar = bar;
  }

  private createTabBar(root: HTMLElement): HTMLElement {
    const existing = root.querySelector<HTMLElement>(`[${TAB_BAR_ATTR}]`);
    if (existing) return existing;
    const bar = this.doc.createElement("div");
    bar.className = TAB_BAR_CLASS;
    bar.setAttribute(TAB_BAR_ATTR, "");
    const search = searchInput(root);
    root.insertBefore(bar, (search && this.rootChild(root, search)) ?? root.firstChild);
    return bar;
  }

  private removeTab(): void {
    this.tab?.remove();
    this.tab = null;
    const bar = this.tabBar;
    this.tabBar = null;
    if (!bar) return;
    bar.querySelector(`[${TAB_ATTR}]`)?.remove();
    if (bar.hasAttribute(TAB_BAR_ATTR) && bar.querySelectorAll("button").length === 0) bar.remove();
  }

  private activateFavorites(): void {
    if (!this.root || this.favoritesMode) return;
    const root = this.root;
    this.favoritesMode = true;
    this.searchTerm = searchInput(root)?.value.trim() ?? "";
    root.classList.add(MODE_CLASS);
    this.markMoreTrigger(root);
    this.list = this.ensureList(root);
    const catalog = this.options.getCatalog();
    if (catalog) this.renderList(catalog);
    this.setTabActive(true);
  }

  private deactivateFavorites(): void {
    this.favoritesMode = false;
    this.searchTerm = "";
    this.root?.classList.remove(MODE_CLASS);
    this.list?.remove();
    this.list = null;
    this.panelSignature = "";
    this.unmarkMoreTrigger();
    this.setTabActive(false);
  }

  private setTabActive(active: boolean): void {
    if (!this.tab) return;
    if (active) {
      this.tab.classList.remove("border-transparent", "text-muted-foreground");
      this.tab.classList.add("border-foreground", "text-foreground");
      this.tab.dataset.mfActive = "true";
      for (const tab of this.root ? providerTabs(this.root) : []) {
        tab.classList.remove("border-foreground", "text-foreground");
        tab.classList.add("border-transparent", "text-muted-foreground");
      }
      return;
    }
    this.tab.classList.remove("border-foreground", "text-foreground");
    this.tab.classList.add("border-transparent", "text-muted-foreground");
    delete this.tab.dataset.mfActive;
    if (!this.root || !this.provider) return;
    for (const tab of providerTabs(this.root)) {
      const isActive = normalizeTabTitle(tab.title) === this.provider.displayName;
      tab.classList.toggle("border-foreground", isActive);
      tab.classList.toggle("text-foreground", isActive);
      tab.classList.toggle("border-transparent", !isActive);
      tab.classList.toggle("text-muted-foreground", !isActive);
    }
  }

  private markMoreTrigger(root: HTMLElement): void {
    const trigger = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')).find(
      (button) => !button.hasAttribute(STAR_ATTR) && button.textContent?.trim() === "More models",
    );
    trigger?.setAttribute(MORE_ATTR, "");
  }

  private unmarkMoreTrigger(): void {
    this.root?.querySelector(`[${MORE_ATTR}]`)?.removeAttribute(MORE_ATTR);
  }

  /* ----------------------------- favorites ------------------------------- */

  private ensureList(root: HTMLElement): HTMLElement {
    const current = this.list;
    const list =
      current?.isConnected && root.contains(current)
        ? current
        : root.querySelector<HTMLElement>(`[${LIST_ATTR}]`) ?? this.createList();
    if (!current || list !== current) this.panelSignature = "";
    this.placeList(root, list);
    return list;
  }

  private createList(): HTMLElement {
    const list = this.doc.createElement("div");
    list.className = "bb-mf-fav-list";
    list.setAttribute(LIST_ATTR, "");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Favorite models");
    return list;
  }

  /**
   * Keep the list where the native model list lives, directly above it, so the
   * reasoning section stays pinned below. When the host has not rendered the
   * list yet, fall back to the model column or just under the tabs/search.
   */
  private placeList(root: HTMLElement, list: HTMLElement): void {
    const listbox = root.querySelector<HTMLElement>('[role="listbox"]:not([data-mf-favorites])');
    if (listbox?.parentElement) {
      if (listbox.previousElementSibling !== list) {
        listbox.parentElement.insertBefore(list, listbox);
      }
      return;
    }
    const column = this.modelColumn(root);
    if (column) {
      if (column.firstElementChild !== list) column.insertBefore(list, column.firstElementChild);
      return;
    }
    const anchor = this.headerAnchor(root);
    if (anchor?.parentElement && anchor.nextElementSibling !== list) {
      anchor.parentElement.insertBefore(list, anchor.nextSibling);
      return;
    }
    if (list.parentElement !== root) root.append(list);
  }

  private modelColumn(root: HTMLElement): HTMLElement | null {
    for (const child of Array.from(root.children)) {
      if (!(child instanceof HTMLElement) || child.hasAttribute(LIST_ATTR)) continue;
      const className = typeof child.className === "string" ? child.className : "";
      if (!className.includes("flex-col")) continue;
      if (className.includes("flex-1") || className.includes("min-h-0")) return child;
    }
    return null;
  }

  /** The last top-level strip above the model area: the search box or tabs. */
  private headerAnchor(root: HTMLElement): HTMLElement | null {
    let anchor: HTMLElement | null = null;
    const order = Array.from(root.children);
    const input = searchInput(root);
    const tabs = providerTabs(root)[0];
    for (const node of [input, tabs]) {
      const child = this.rootChild(root, node ?? null);
      if (!child) continue;
      if (!anchor || order.indexOf(child) > order.indexOf(anchor)) anchor = child;
    }
    return anchor;
  }

  private rootChild(root: HTMLElement, node: Element | null): HTMLElement | null {
    let current: HTMLElement | null = node instanceof HTMLElement ? node : null;
    while (current && current.parentElement && current.parentElement !== root) {
      current = current.parentElement;
    }
    return current?.parentElement === root ? current : null;
  }

  private renderList(catalog: Catalog): void {
    if (!this.list || !this.root) return;
    const filter = this.searchTerm.toLowerCase();
    const selection = this.selection();
    const selectedKey = selection?.model
      ? favoriteKey({ providerId: selection.providerId ?? "", model: selection.model })
      : "";
    const visible = catalog.favorites.filter((favorite) => {
      if (!filter) return true;
      const provider = catalog.providers.find((entry) => entry.id === favorite.providerId);
      const model = this.modelFor(provider, favorite.model);
      return [
        provider?.displayName ?? favorite.providerId,
        model?.displayName ?? favorite.model,
        favorite.model,
        reasoningLabel(favorite.reasoningLevel, model),
      ].some((value) => value.toLowerCase().includes(filter));
    });
    // Keep the model the composer already uses at the top of the tab.
    const ordered = selectedKey
      ? visible.filter((favorite) => favoriteKey(favorite) === selectedKey)
          .concat(visible.filter((favorite) => favoriteKey(favorite) !== selectedKey))
      : visible;
    const signature = [
      catalog.favorites.map((favorite) => `${favoriteKey(favorite)}:${favorite.reasoningLevel}`).join("|"),
      filter,
      selectedKey,
      visible.length,
    ].join("#");
    if (signature === this.panelSignature) return;
    this.panelSignature = signature;

    const children: HTMLElement[] = [];
    if (ordered.length === 0) {
      const empty = this.doc.createElement("div");
      empty.className = "bb-mf-fav-empty";
      empty.textContent = catalog.favorites.length === 0
        ? "No favorites yet. Star a model in a provider tab."
        : "No favorites match this search.";
      children.push(empty);
    }
    for (const favorite of ordered) {
      const provider = catalog.providers.find((entry) => entry.id === favorite.providerId);
      const model = this.modelFor(provider, favorite.model);
      const row = this.favoriteRow(favorite, provider, model);
      if (favoriteKey(favorite) === selectedKey) row.dataset.mfSelected = "true";
      children.push(row);
    }
    this.list.replaceChildren(...children);
  }

  private modelFor(provider: PickerProvider | undefined, modelId: string): PickerModel | undefined {
    return provider?.models.find((model) => model.id === modelId)
      ?? provider?.more.find((model) => model.id === modelId);
  }

  private favoriteRow(
    favorite: Favorite,
    provider: PickerProvider | undefined,
    model: PickerModel | undefined,
  ): HTMLElement {
    const row = this.doc.createElement("button");
    row.type = "button";
    row.className = `${NATIVE_ROW_CLASS} bb-mf-fav-row`;
    row.setAttribute(ROW_ATTR, "");
    row.dataset.providerId = favorite.providerId;
    row.dataset.model = favorite.model;
    row.title = [
      provider?.displayName ?? favorite.providerId,
      model?.displayName ?? favorite.model,
      reasoningLabel(favorite.reasoningLevel, model),
    ]
      .filter((part) => part.length > 0)
      .join(" · ");

    row.append(this.providerIcon(provider));
    const name = this.doc.createElement("span");
    const fullName = model?.displayName ?? favorite.model;
    name.className = "bb-mf-fav-name";
    name.textContent = fullName;
    name.title = fullName;
    row.append(name);

    const meta = reasoningLabel(favorite.reasoningLevel, model);
    if (meta) {
      const detail = this.doc.createElement("span");
      detail.className = "bb-mf-fav-meta";
      detail.textContent = meta;
      row.append(detail);
    }

    const star = this.doc.createElement("span");
    star.className = "bb-mf-star";
    star.setAttribute(STAR_ATTR, "");
    star.dataset.mfActive = "true";
    star.setAttribute("role", "button");
    star.setAttribute("tabindex", "-1");
    star.setAttribute("aria-label", `Remove ${model?.displayName ?? favorite.model} from favorites`);
    star.title = star.getAttribute("aria-label") ?? "";
    star.innerHTML = FILLED_STAR_SVG;
    star.dataset.mfFilled = "true";
    star.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    star.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.remove(favorite);
    });
    row.append(star);

    row.addEventListener("click", () => {
      void this.apply(favorite);
    });
    return row;
  }

  private providerIcon(provider: PickerProvider | undefined): HTMLElement {
    const icon = this.doc.createElement("span");
    icon.className = "bb-mf-fav-icon";
    icon.setAttribute("aria-hidden", "true");
    const tab = this.root && provider
      ? providerTabs(this.root).find(
          (candidate) => normalizeTabTitle(candidate.title) === provider.displayName,
        )
      : undefined;
    const source = tab?.firstElementChild;
    // Clone the whole icon element: brand logos are often a mask span, not an
    // <svg>, so looking for an svg alone fell back to a bare letter.
    if (holdsProviderIcon(source)) {
      const clone = source.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      clone.removeAttribute("aria-label");
      clone.removeAttribute("title");
      icon.append(clone);
    }
    return icon;
  }

  private async remove(favorite: Favorite): Promise<void> {
    try {
      const favorites = await this.options.removeFavorite({
        providerId: favorite.providerId,
        model: favorite.model,
      });
      this.options.onFavoritesChange?.(favorites);
      const catalog = this.options.getCatalog();
      if (catalog) {
        this.renderStars(catalog);
        this.renderList(catalog);
      }
    } catch {
      // Leave the list untouched on failure.
    }
  }

  private async apply(favorite: Favorite): Promise<void> {
    const bridge = this.bridge();
    if (bridge) {
      try {
        await bridge.setSelection({
          providerId: favorite.providerId,
          model: favorite.model,
          ...(favorite.reasoningLevel ? { reasoningLevel: favorite.reasoningLevel } : {}),
          ...(favorite.serviceTier ? { serviceTier: favorite.serviceTier } : {}),
        });
        this.options.onApply?.(favorite);
        this.closeMenu();
        return;
      } catch {
        // Fall through to the DOM path when the composer rejects the value.
      }
    }
    if (await this.applyViaDom(favorite)) this.closeMenu();
  }

  /** Close the picker the same way Escape does, after the selection landed. */
  private closeMenu(): void {
    this.doc.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  /** Best-effort fallback: drive the host's own tabs and rows. */
  private async applyViaDom(favorite: Favorite): Promise<boolean> {
    const root = this.root;
    const catalog = this.options.getCatalog();
    if (!root || !catalog) return false;
    const provider = catalog.providers.find((entry) => entry.id === favorite.providerId);
    if (!provider) return false;
    const tab = providerTabs(root).find(
      (candidate) => normalizeTabTitle(candidate.title) === provider.displayName,
    );
    if (tab && !tab.classList.contains("border-foreground")) {
      tab.click();
      await this.waitFor(
        () => this.root !== null && this.rowsHas(favorite.model),
      );
    }
    const model = this.modelFor(provider, favorite.model);
    if (model && favorite.reasoningLevel) {
      const label = reasoningLabel(favorite.reasoningLevel, model);
      const button = Array.from(root.querySelectorAll<HTMLElement>('button[aria-pressed]')).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      if (button && button.getAttribute("aria-pressed") !== "true") button.click();
    }
    const target = this.root
      ? Array.from(this.rows.entries()).find(([, mapped]) => mapped.id === favorite.model)?.[0]
      : undefined;
    target?.click();
    return target !== undefined;
  }

  private rowsHas(modelId: string): boolean {
    return Array.from(this.rows.values()).some((model) => model.id === modelId);
  }

  private waitFor(check: () => boolean, timeoutMs = 800): Promise<void> {
    const started = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (this.disposed || check() || Date.now() - started > timeoutMs) {
          resolve();
          return;
        }
        this.win.setTimeout(tick, 16);
      };
      tick();
    });
  }
}
