export const MIN_COLUMN_PX = 48;

export function startColumnDrag(
  start: number[],
  index: number,
  clientX: number,
  apply: (next: number[]) => void
): void {
  if (index < 0 || index + 1 >= start.length) return;
  const onMove = (event: PointerEvent) => {
    const delta = event.clientX - clientX;
    const left = start[index] + delta;
    const right = start[index + 1] - delta;
    if (left < MIN_COLUMN_PX || right < MIN_COLUMN_PX) return;
    const next = [...start];
    next[index] = left;
    next[index + 1] = right;
    apply(next);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
