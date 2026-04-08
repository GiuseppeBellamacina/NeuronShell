import { writable } from "svelte/store";

export const authUser = writable<string | null>(null);
