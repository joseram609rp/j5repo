import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

const firstYear = 1970;
const columns = 3;

export function YearPicker({ year, disabled, onSelect }: {
  year: number | null | undefined;
  disabled: boolean;
  onSelect: (year: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear + 5;
  const selectedYear = year != null && year >= firstYear && year <= lastYear && Number.isInteger(year)
    ? year
    : currentYear;

  function focusYear(value: number) {
    popup.current?.querySelector<HTMLButtonElement>(`[data-year="${value}"]`)?.focus();
  }

  useEffect(() => {
    if (!open) return;
    if (disabled) {
      setOpen(false);
      return;
    }
    focusYear(selectedYear);
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, disabled, selectedYear]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, value: number) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns,
      Home: firstYear - value, End: lastYear - value,
    };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    focusYear(Math.min(lastYear, Math.max(firstYear, value + offset)));
  }

  return (
    <div
      className="year-picker"
      ref={picker}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <button
        type="button"
        className="year-picker-trigger"
        ref={trigger}
        aria-label="Elegir año del vehículo"
        aria-expanded={open && !disabled}
        aria-controls={popupId}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2" />
        </svg>
      </button>
      <div className="year-picker-popup" id={popupId} ref={popup} role="group" aria-label="Años del vehículo" hidden={!open || disabled}>
        {open && !disabled && Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
          const value = firstYear + index;
          return (
            <button
              key={value}
              type="button"
              tabIndex={-1}
              data-year={value}
              aria-pressed={value === year}
              onKeyDown={(event) => navigate(event, value)}
              onClick={() => {
                onSelect(value);
                close();
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
