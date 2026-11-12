/** Soft in-app navigation — skip full document reloads for same-origin links. */

export const NAV_EVENT = "jacms:navigate";

export function currentPath(): string {
  return window.location.pathname;
}

function isSoftAppUrl(url: URL): boolean {
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return false;
  return true;
}

function emitNav(): void {
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function navigate(to: string, mode: "push" | "replace" = "push"): void {
  const url = new URL(to, window.location.origin);
  if (!isSoftAppUrl(url)) {
    if (mode === "replace") window.location.replace(url.href);
    else window.location.assign(url.href);
    return;
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) {
    if (mode === "replace") window.history.replaceState({}, "", next);
    else window.history.pushState({}, "", next);
  }
  emitNav();
}

function shouldHijack(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.dataset.spa === "off") return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.origin);
  } catch {
    return false;
  }
  return isSoftAppUrl(url);
}

function trySoftNavigation(url: string | URL, mode: "push" | "replace"): boolean {
  let parsed: URL;
  try {
    parsed = new URL(String(url), window.location.href);
  } catch {
    return false;
  }
  if (!isSoftAppUrl(parsed)) return false;
  navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`, mode);
  return true;
}

export function installSpaNavigation(): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (!shouldHijack(anchor, event)) return;
    event.preventDefault();
    navigate(`${anchor.pathname}${anchor.search}${anchor.hash}`);
  };

  const onPop = () => emitNav();

  const assign = Location.prototype.assign;
  const replace = Location.prototype.replace;
  Location.prototype.assign = function patchedAssign(this: Location, url: string | URL) {
    if (trySoftNavigation(url, "push")) return;
    return assign.call(this, url);
  };
  Location.prototype.replace = function patchedReplace(this: Location, url: string | URL) {
    if (trySoftNavigation(url, "replace")) return;
    return replace.call(this, url);
  };

  document.addEventListener("click", onClick);
  window.addEventListener("popstate", onPop);
  return () => {
    document.removeEventListener("click", onClick);
    window.removeEventListener("popstate", onPop);
    Location.prototype.assign = assign;
    Location.prototype.replace = replace;
  };
}
