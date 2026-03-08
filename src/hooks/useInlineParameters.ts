import { useState, useCallback } from "react";

const INLINE_PARAMS_KEY = "node-banana-inline-parameters";

export function useInlineParameters() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(INLINE_PARAMS_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setInlineParameters = useCallback((value: boolean) => {
    try {
      localStorage.setItem(INLINE_PARAMS_KEY, String(value));
    } catch {
      // localStorage not available
    }
    setEnabled(value);
  }, []);

  return { inlineParametersEnabled: enabled, setInlineParameters };
}
