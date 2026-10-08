import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during server rendering and hydration, true once React has attached event handlers. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
