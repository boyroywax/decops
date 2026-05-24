import type { ToolkitConfigField } from "@/services/toolkits";

type ConfigPrimitive = string | number | boolean;

interface ConfigurationItemProps {
  field: ToolkitConfigField;
  value: ConfigPrimitive | undefined;
  onChange: (value: ConfigPrimitive) => void;
  onReset?: () => void;
}

export function ConfigurationItem({ field, value, onChange, onReset }: ConfigurationItemProps) {
  const effectiveValue = value ?? field.defaultValue;
  const isCustomValue = value !== undefined && value !== field.defaultValue;

  return (
    <div className="toolkit-config-item">
      <div className="toolkit-config-item__meta">
        <div className="toolkit-config-item__heading">
          <code className="toolkit-config-item__key">{field.key}</code>
          <span className="toolkit-config-item__type">{field.type}</span>
          {field.required && <span className="toolkit-config-item__required">required</span>}
        </div>
        <div className="toolkit-config-item__label">{field.label}</div>
        {field.description && (
          <div className="toolkit-config-item__description">{field.description}</div>
        )}
      </div>

      <div className="toolkit-config-item__control-wrap">
        {field.type === "boolean" && (
          <label className="toolkit-config-item__checkbox-wrap">
            <input
              className="toolkit-config-item__checkbox"
              type="checkbox"
              checked={Boolean(effectiveValue)}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>{Boolean(effectiveValue) ? "Enabled" : "Disabled"}</span>
          </label>
        )}

        {field.type === "number" && (
          <input
            className="toolkit-config-item__input"
            type="number"
            value={typeof effectiveValue === "number" ? effectiveValue : Number(field.defaultValue ?? 0)}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) onChange(next);
            }}
          />
        )}

        {field.type === "string" && (
          <input
            className="toolkit-config-item__input"
            type="text"
            value={String(effectiveValue ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.type === "select" && (
          <select
            className="toolkit-config-item__input"
            value={String(effectiveValue ?? "")}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        <div className="toolkit-config-item__footer">
          {field.defaultValue !== undefined && (
            <span className="toolkit-config-item__default">
              default: {String(field.defaultValue)}
            </span>
          )}
          {onReset && (
            <button
              type="button"
              className="toolkit-config-item__reset"
              disabled={!isCustomValue}
              onClick={onReset}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
