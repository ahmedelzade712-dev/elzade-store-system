"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function formatDisplay(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function EnglishDatePicker({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
}: Props) {
  const initialDate = value ? new Date(`${value}T00:00:00`) : new Date();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!value) return;

    const selected = new Date(`${value}T00:00:00`);
    setViewYear(selected.getFullYear());
    setViewMonth(selected.getMonth());
  }, [value]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const days: Array<Date | null> = [];

    for (let i = 0; i < firstDay.getDay(); i += 1) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      days.push(new Date(viewYear, viewMonth, day));
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [viewYear, viewMonth]);

  function previousMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((year) => year - 1);
      return;
    }

    setViewMonth((month) => month - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((year) => year + 1);
      return;
    }

    setViewMonth((month) => month + 1);
  }

  function chooseDate(date: Date) {
    onChange(toInputValue(date));
    setOpen(false);
  }

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    "en-GB",
    {
      month: "long",
      year: "numeric",
    }
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        dir="ltr"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between rounded-xl bg-neutral-800 px-4 py-3 text-left"
      >
        <span className={value ? "text-white" : "text-neutral-400"}>
          {value ? formatDisplay(value) : placeholder}
        </span>

        <span aria-hidden="true">📅</span>
      </button>

      {open && (
        <div
          dir="ltr"
          className="absolute left-0 z-[100] mt-2 w-80 rounded-2xl border border-neutral-700 bg-neutral-900 p-4 text-white shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={previousMonth}
              className="rounded-lg border border-neutral-700 px-3 py-2"
            >
              ‹
            </button>

            <div className="font-bold">{monthTitle}</div>

            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg border border-neutral-700 px-3 py-2"
            >
              ›
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
            {weekDays.map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="h-10" />;
              }

              const dateValue = toInputValue(date);
              const selected = dateValue === value;
              const today = dateValue === toInputValue(new Date());

              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => chooseDate(date)}
                  className={`h-10 rounded-lg text-sm ${
                    selected
                      ? "bg-white font-bold text-black"
                      : today
                      ? "border border-blue-500 text-blue-300"
                      : "hover:bg-neutral-800"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2 border-t border-neutral-700 pt-4">
            <button
              type="button"
              onClick={() => chooseDate(new Date())}
              className="flex-1 rounded-lg bg-white px-3 py-2 font-bold text-black"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex-1 rounded-lg border border-neutral-700 px-3 py-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
