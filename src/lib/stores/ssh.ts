import { writable, derived } from "svelte/store";
import type {
  JobInfo,
  ActiveJobInfo,
  ResultInfo,
  RewardBreakdown,
  LastCompletion,
  MonitorData,
} from "$lib/server/monitor-parser";

export type {
  JobInfo,
  ActiveJobInfo,
  ResultInfo,
  RewardBreakdown,
  LastCompletion,
  MonitorData,
};

export interface SshStatus {
  connected: boolean;
  host?: string;
  username?: string;
  connectedAt?: number;
}

export const sshStatus = writable<SshStatus>({ connected: false });
export const monitorData = writable<MonitorData | null>(null);
export const commandOutput = writable<
  { command: string; output: string; error?: string; timestamp: number }[]
>([]);

export const isConnected = derived(sshStatus, ($s) => $s.connected);

export function addCommandOutput(
  command: string,
  output: string,
  error?: string,
) {
  commandOutput.update((arr) => [
    ...arr.slice(-49),
    { command, output, error, timestamp: Date.now() },
  ]);
}
