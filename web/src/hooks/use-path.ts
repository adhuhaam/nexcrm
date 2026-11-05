import { useEffect, useState } from "react";
import { NAV_EVENT, currentPath } from "@/lib/spa-nav";

/** Reactive pathname for SPA soft navigations. */
export function usePath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const sync = () => setPath(currentPath());
    window.addEventListener(NAV_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(NAV_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  return path;
}
