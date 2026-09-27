"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

type SelectOption = { value: string; label: ReactNode; disabled: boolean };
type StyledSelectProps = {
  children: ReactNode;
  value?: string | number;
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function StyledSelect({ children, value, onChange, disabled = false, required = false, className, "aria-label": ariaLabel }: StyledSelectProps) {
  const options = Children.toArray(children).flatMap((child): SelectOption[] => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child) || child.type !== "option") return [];
    return [{ value: String(child.props.value ?? ""), label: child.props.children, disabled: Boolean(child.props.disabled) }];
  });
  const selectedValue = String(value ?? "");
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const selected = options[selectedIndex];
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex < 0 ? 0 : selectedIndex);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 240 });

  function show() {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const above = spaceBelow < 180 && spaceAbove > spaceBelow;
    setPosition({
      top: above ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(240, Math.max(100, above ? spaceAbove : spaceBelow)),
    });
    setActiveIndex(selectedIndex < 0 ? 0 : selectedIndex);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function choose(option: SelectOption) {
    if (option.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    // Existing form handlers only read target.value.
    onChange({ target: { value: option.value } });
  }

  function move(direction: number) {
    if (!options.length) return;
    let index = activeIndex;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) { setActiveIndex(index); break; }
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" && open) { event.preventDefault(); setActiveIndex(options.findIndex((option) => !option.disabled)); return; }
    if (event.key === "End" && open) { event.preventDefault(); setActiveIndex(options.findLastIndex((option) => !option.disabled)); return; }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex]);
    }
  }

  return <>
    <span className={"styled-select" + (className ? " " + className : "")}>
      <button
        ref={triggerRef}
        type="button"
        className="styled-select-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        role="combobox"
        aria-activedescendant={open ? id + "-option-" + activeIndex : undefined}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-required={required || undefined}
        onClick={() => open ? setOpen(false) : show()}
        onKeyDown={onKeyDown}
      >
        <span className="styled-select-value">{selected?.label ?? ""}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
    </span>
    {open && createPortal(
      <div
        ref={menuRef}
        id={id}
        className="styled-select-menu"
        role="listbox"
        aria-label={ariaLabel}
        style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, transform: position.top === triggerRef.current?.getBoundingClientRect().top ? "translateY(-100%)" : undefined }}
      >
        {options.map((option, index) => <button
          key={option.value}
          id={id + "-option-" + index}
          type="button"
          role="option"
          aria-selected={option.value === selectedValue}
          disabled={option.disabled}
          className={"styled-select-option" + (index === activeIndex ? " active" : "")}
          onPointerEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
        >{option.label}</button>)}
      </div>,
      document.body,
    )}
  </>;
}
