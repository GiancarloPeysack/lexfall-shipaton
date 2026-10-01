// Thin compatibility shim - field state now lives in AppProvider (app-state.tsx).
// Existing screens import { useField } from here; keep that working.
import { useApp } from './app-state';

export const useField = () => {
  const { field, setField } = useApp();
  return { field, setField };
};
