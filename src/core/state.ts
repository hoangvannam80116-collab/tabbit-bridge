import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newId, nowIso, stateDirectory } from "./config.js";
import type { DownloadRecord, TaskRecord, TaskStatus } from "./types.js";

interface StateFile {
  tasks: TaskRecord[];
  downloads: DownloadRecord[];
}

export class StateStore {
  private readonly path = join(stateDirectory(), "state.json");

  read(): StateFile {
    if (!existsSync(this.path)) return { tasks: [], downloads: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StateFile>;
      return {
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
      };
    } catch {
      return { tasks: [], downloads: [] };
    }
  }

  write(state: StateFile): void {
    writeFileSync(this.path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  createTask(name: string, input: Partial<TaskRecord> = {}): TaskRecord {
    const state = this.read();
    const now = nowIso();
    const task: TaskRecord = {
      id: input.id ?? newId("task"),
      name,
      status: input.status ?? "pending",
      tabId: input.tabId,
      url: input.url,
      chatContext: input.chatContext,
      currentStep: input.currentStep,
      progress: input.progress,
      steps: input.steps ?? [],
      lastPrompt: input.lastPrompt,
      lastResult: input.lastResult,
      blockedReason: input.blockedReason ?? null,
      downloads: input.downloads ?? [],
      createdAt: now,
      updatedAt: now,
    };
    state.tasks.unshift(task);
    this.write(state);
    return task;
  }

  listTasks(): TaskRecord[] {
    return this.read().tasks;
  }

  getTask(id: string): TaskRecord {
    const task = this.read().tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  updateTask(id: string, patch: Partial<TaskRecord>): TaskRecord {
    const state = this.read();
    const index = state.tasks.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new Error(`Task not found: ${id}`);
    const updated: TaskRecord = {
      ...state.tasks[index],
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    state.tasks[index] = updated;
    this.write(state);
    return updated;
  }

  setTaskStatus(id: string, status: TaskStatus, note?: string): TaskRecord {
    return this.updateTask(id, {
      status,
      blockedReason: status === "blocked" ? note ?? null : null,
      currentStep: note,
    });
  }

  addDownload(download: DownloadRecord, taskId?: string): DownloadRecord {
    const state = this.read();
    const existingIndex = state.downloads.findIndex((candidate) => candidate.path === download.path);
    if (existingIndex >= 0) {
      state.downloads[existingIndex] = download;
    } else {
      state.downloads.unshift(download);
    }

    if (taskId) {
      const taskIndex = state.tasks.findIndex((task) => task.id === taskId);
      if (taskIndex >= 0) {
        const task = state.tasks[taskIndex];
        const downloads = task.downloads.filter((item) => item.path !== download.path);
        downloads.unshift(download);
        state.tasks[taskIndex] = { ...task, downloads, updatedAt: nowIso() };
      }
    }

    this.write(state);
    return download;
  }

  listDownloads(): DownloadRecord[] {
    return this.read().downloads;
  }
}
