import { useCallback, useRef } from "react";

/*
 * Layout registry — the real-component layout map.
 *
 * A component opts in by attaching `ref={useLayoutNode("Name")}` to its root
 * element. That records the component's NAME + live DOM element here (a plain,
 * non-reactive module store — layout changes on every scroll/resize and must
 * never trigger React re-renders). At report time `captureLayoutTree()` reads
 * each registered element's `getBoundingClientRect()` and nests them by real DOM
 * containment, so the debug map shows the app's actual components (with sizes +
 * coordinates) instead of an anonymous DOM/div dump. Only what you register
 * appears — no heuristics, no leaves, no divs.
 */

let seq = 0;
const entries = new Map<number, Entry>();

export function registerLayoutNode(name: string, el: HTMLElement): number {
  seq += 1;
  entries.set(seq, { id: seq, name, el });
  return seq;
}

export function unregisterLayoutNode(id: number): void {
  entries.delete(id);
}

export function useLayoutNode(name: string): (el: HTMLElement | null) => void {
  const idRef = useRef<number | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      if (idRef.current !== null) {
        unregisterLayoutNode(idRef.current);
        idRef.current = null;
      }
      if (el) idRef.current = registerLayoutNode(name, el);
    },
    [name]
  );
}

export function captureLayoutTree(): LayoutNode | null {
  if (typeof document === "undefined") return null;
  const live: { id: number; name: string; el: HTMLElement; rect: DOMRect }[] = [];
  const idByEl = new Map<HTMLElement, number>();
  for (const entry of entries.values()) {
    if (!entry.el.isConnected) continue;
    const rect = entry.el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    live.push({ id: entry.id, name: entry.name, el: entry.el, rect });
    idByEl.set(entry.el, entry.id);
  }
  if (live.length === 0) return null;

  const nodes = new Map<number, LayoutNode>();
  for (const item of live) {
    nodes.set(item.id, {
      name: item.name,
      x: Math.round(item.rect.left),
      y: Math.round(item.rect.top),
      w: Math.round(item.rect.width),
      h: Math.round(item.rect.height),
      children: [],
    });
  }

  const roots: LayoutNode[] = [];
  for (const item of live) {
    const parentId = nearestAncestorId(item.el, idByEl);
    if (parentId === null) {
      roots.push(nodes.get(item.id)!);
      continue;
    }
    nodes.get(parentId)!.children.push(nodes.get(item.id)!);
  }
  for (const node of nodes.values()) node.children.sort(byPosition);
  roots.sort(byPosition);
  if (roots.length === 1) return roots[0];
  return { name: "(app)", x: 0, y: 0, w: 0, h: 0, children: roots };
}

function nearestAncestorId(el: HTMLElement, idByEl: Map<HTMLElement, number>): number | null {
  let parent = el.parentElement;
  while (parent) {
    const id = idByEl.get(parent);
    if (id !== undefined) return id;
    parent = parent.parentElement;
  }
  return null;
}

function byPosition(a: LayoutNode, b: LayoutNode): number {
  return a.y - b.y || a.x - b.x;
}

interface Entry {
  id: number;
  name: string;
  el: HTMLElement;
}

export interface LayoutNode {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children: LayoutNode[];
}
