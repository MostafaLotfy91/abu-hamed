// The storefront header floats transparent over the home page's full-screen hero and turns solid once the page
// scrolls. Decided from the route (server and client agree, so nothing shifts when the page hydrates).
import { useEffect, useState } from "react";

/** True while the window is scrolled less than `px` from the top (always true on the server). */
export function useAtTop(enabled: boolean, px = 24) {
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    if (!enabled) return setAtTop(true);
    const onScroll = () => setAtTop(window.scrollY < px);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, px]);
  return atTop;
}
