import { writable } from "svelte/store";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
  exiting?: boolean;
}

export const toasts = writable<Toast[]>([]);

let nextId = 0;

export function toast(
  message: string,
  type: Toast["type"] = "info",
  duration = 4000,
) {
  const id = nextId++;
  toasts.update((t) => [...t, { id, message, type }]);

  setTimeout(() => {
    toasts.update((t) =>
      t.map((x) => (x.id === id ? { ...x, exiting: true } : x)),
    );
    setTimeout(() => {
      toasts.update((t) => t.filter((x) => x.id !== id));
    }, 300);
  }, duration);
}
