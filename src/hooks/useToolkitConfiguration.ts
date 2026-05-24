import { useCallback, useEffect, useMemo } from "react";
import type { ToolkitId } from "@/types";
import { toolkitRegistry } from "@/services/toolkits";
import type { ToolkitConfigField } from "@/services/toolkits";
import { useLocalStorage } from "@/hooks/useLocalStorage";

type ConfigPrimitive = string | number | boolean;
type ToolkitConfigMap = Record<string, Record<string, ConfigPrimitive>>;

const TOOLKIT_CONFIG_STORAGE_KEY = "decops:toolkit-config:v1";

function resolveFieldValue(
  toolkitId: ToolkitId,
  field: ToolkitConfigField,
  stored: ToolkitConfigMap,
): ConfigPrimitive | undefined {
  const storedValue = stored[toolkitId]?.[field.key];
  if (storedValue !== undefined) return storedValue;

  const module = toolkitRegistry.get(toolkitId);
  const runtimeValue = module?.configuration?.values?.[field.key];
  if (runtimeValue !== undefined) return runtimeValue as ConfigPrimitive;

  return field.defaultValue;
}

export function useToolkitConfiguration(toolkitId?: ToolkitId) {
  const [storedConfig, setStoredConfig] = useLocalStorage<ToolkitConfigMap>(
    TOOLKIT_CONFIG_STORAGE_KEY,
    {},
  );

  useEffect(() => {
    Object.entries(storedConfig).forEach(([id, values]) => {
      const module = toolkitRegistry.get(id);
      if (!module?.configuration) return;
      module.configuration.values = {
        ...(module.configuration.values || {}),
        ...values,
      };
    });
  }, [storedConfig]);

  const getFieldValue = useCallback(
    (id: ToolkitId, field: ToolkitConfigField): ConfigPrimitive | undefined => {
      return resolveFieldValue(id, field, storedConfig);
    },
    [storedConfig],
  );

  const setFieldValue = useCallback(
    (id: ToolkitId, key: string, value: ConfigPrimitive) => {
      setStoredConfig((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          [key]: value,
        },
      }));

      const module = toolkitRegistry.get(id);
      if (module?.configuration) {
        module.configuration.values = {
          ...(module.configuration.values || {}),
          [key]: value,
        };
      }
    },
    [setStoredConfig],
  );

  const resetFieldValue = useCallback(
    (id: ToolkitId, field: ToolkitConfigField) => {
      setStoredConfig((prev) => {
        const nextToolkitConfig = { ...(prev[id] || {}) };
        delete nextToolkitConfig[field.key];

        if (Object.keys(nextToolkitConfig).length === 0) {
          const next = { ...prev };
          delete next[id];
          return next;
        }

        return {
          ...prev,
          [id]: nextToolkitConfig,
        };
      });

      const module = toolkitRegistry.get(id);
      if (module?.configuration?.values) {
        const nextValues = { ...module.configuration.values };
        delete nextValues[field.key];
        module.configuration.values = nextValues;
      }
    },
    [setStoredConfig],
  );

  const scopedValues = useMemo(() => {
    if (!toolkitId) return {};
    return storedConfig[toolkitId] || {};
  }, [storedConfig, toolkitId]);

  const setScopedField = useCallback(
    (key: string, value: ConfigPrimitive) => {
      if (!toolkitId) return;
      setFieldValue(toolkitId, key, value);
    },
    [setFieldValue, toolkitId],
  );

  const resetScopedField = useCallback(
    (field: ToolkitConfigField) => {
      if (!toolkitId) return;
      resetFieldValue(toolkitId, field);
    },
    [resetFieldValue, toolkitId],
  );

  return {
    storedConfig,
    scopedValues,
    getFieldValue,
    setFieldValue,
    resetFieldValue,
    setScopedField,
    resetScopedField,
  };
}
