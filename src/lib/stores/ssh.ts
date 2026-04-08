import { writable, derived } from "svelte/store";

export interface SshStatus {
  connected: boolean;
  host?: string;
  username?: string;
  connectedAt?: number;
}

export interface GpuInfo {
  index: number;
  name: string;
  utilization: number;
  memUsed: number;
  memTotal: number;
  temp: number;
  power: number;
}

export interface JobInfo {
  id: string;
  name: string;
  state: string;
  time: string;
  nodes: string;
  reason: string;
  gpu: string;
}

export interface MonitorData {
  gpus: GpuInfo[];
  jobs: JobInfo[];
  watcher: { active: boolean; pid: string | null };
  chainJobs: number;
  timestamp: number;
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
