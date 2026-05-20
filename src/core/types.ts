export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface TabInfo {
  id: string;
  type?: string;
  title: string;
  url: string;
  active?: boolean;
  webSocketDebuggerUrl?: string;
}

export type TaskStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled";

export interface TaskStep {
  name: string;
  status: TaskStatus;
  note?: string;
  updatedAt: string;
}

export interface DownloadRecord {
  path: string;
  name: string;
  type: string;
  size: number;
  status: "pending" | "complete" | "parsed" | "failed";
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  name: string;
  status: TaskStatus;
  tabId?: string;
  url?: string;
  chatContext?: string;
  currentStep?: string;
  progress?: string;
  steps: TaskStep[];
  lastPrompt?: string;
  lastResult?: string;
  blockedReason?: string | null;
  downloads: DownloadRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PageInspection {
  title: string;
  url: string;
  textPreview: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  inputs: Array<{ type: string; name: string; placeholder: string }>;
}

export interface BridgeStatus {
  tabbitRunning: boolean;
  cdpReachable: boolean;
  cdpPort: number;
  downloadDirectory: string;
  tabs: number;
  stateDirectory: string;
}
