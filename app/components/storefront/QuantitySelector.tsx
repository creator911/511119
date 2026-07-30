"use client";

import styles from "./Storefront.module.css";
import { clampQuantity, classNames } from "./utils";

export function QuantitySelector({
  value,
  onChange,
  minimum = 1,
  maximum = 99,
  label = "수량",
  compact = false,
  disableAtBounds = true,
}: {
  value: number;
  onChange: (quantity: number) => void;
  minimum?: number;
  maximum?: number;
  label?: string;
  compact?: boolean;
  disableAtBounds?: boolean;
}) {
  function update(next: number) {
    onChange(clampQuantity(next, minimum, maximum));
  }

  return (
    <div
      className={classNames(
        styles.quantitySelector,
        compact && styles.quantitySelectorCompact,
      )}
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => update(value - 1)}
        disabled={disableAtBounds && value <= minimum}
        aria-label={`${label} 감소`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={minimum}
        max={maximum}
        value={value}
        onChange={(event) => update(Number(event.target.value))}
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => update(value + 1)}
        disabled={disableAtBounds && value >= maximum}
        aria-label={`${label} 증가`}
      >
        +
      </button>
    </div>
  );
}
