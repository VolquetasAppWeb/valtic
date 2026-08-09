"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumericKeypadProps {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "backspace"];

export function NumericKeypad({ value, maxLength, onChange, disabled }: NumericKeypadProps): JSX.Element {
  function handlePress(key: string): void {
    if (disabled) return;
    if (key === "backspace") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "") return;
    if (value.length < maxLength) {
      onChange(value + key);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3">
      {KEYS.map((key, index) => {
        if (key === "") {
          return <div key={`spacer-${index}`} />;
        }
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => handlePress(key)}
            className={cn(
              "flex h-16 items-center justify-center rounded-xl border border-border bg-card text-xl font-semibold text-foreground shadow-subtle transition-colors active:bg-secondary disabled:opacity-50",
            )}
            aria-label={key === "backspace" ? "Borrar" : key}
          >
            {key === "backspace" ? <Delete className="h-6 w-6" /> : key}
          </button>
        );
      })}
    </div>
  );
}

export function PinDots({ value, length }: { value: string; length: number }): JSX.Element {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-4 w-4 rounded-full border-2 border-primary transition-colors",
            index < value.length ? "bg-primary" : "bg-transparent",
          )}
        />
      ))}
    </div>
  );
}
