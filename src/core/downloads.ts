import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { defaultDownloadDirectory, nowIso } from "./config.js";
import { StateStore } from "./state.js";
import type { DownloadRecord } from "./types.js";

export interface ParsedFile {
  path: string;
  type: string;
  text?: string;
  preview?: unknown;
  summary: string;
}

const TEMP_EXTENSIONS = new Set([".crdownload", ".download", ".tmp", ".part"]);

export class DownloadsManager {
  constructor(
    private readonly directory = defaultDownloadDirectory(),
    private readonly store = new StateStore(),
  ) {}

  getDirectory(): string {
    return this.directory;
  }

  list(limit = 50): DownloadRecord[] {
    if (!existsSync(this.directory)) return [];
    const records: Array<DownloadRecord | null> = readdirSync(this.directory)
      .map((name): DownloadRecord | null => {
        const path = join(this.directory, name);
        try {
          const stat = statSync(path);
          if (!stat.isFile()) return null;
          const ext = extname(name).toLowerCase();
          const now = stat.mtime.toISOString();
          const record: DownloadRecord = {
            path,
            name,
            type: ext.replace(/^\./, "") || "file",
            size: stat.size,
            status: TEMP_EXTENSIONS.has(ext) ? "pending" : "complete",
            createdAt: stat.birthtime.toISOString(),
            updatedAt: now,
          };
          return record;
        } catch {
          return null;
        }
      });

    return records
      .filter((item): item is DownloadRecord => item !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async waitForNew(options: { since?: number; timeoutMs?: number; taskId?: string } = {}): Promise<DownloadRecord | null> {
    const since = options.since ?? Date.now();
    const timeoutMs = options.timeoutMs ?? 120000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const latest = this.list(100).find((file) => {
        const updated = new Date(file.updatedAt).getTime();
        return updated >= since - 1000 && file.status === "complete";
      });
      if (latest && this.isStable(latest.path)) {
        this.store.addDownload(latest, options.taskId);
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return null;
  }

  async parse(path: string): Promise<ParsedFile> {
    const ext = extname(path).toLowerCase();
    if ([".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"].includes(ext)) {
      const { readFileSync } = await import("node:fs");
      const text = readFileSync(path, "utf8");
      return {
        path,
        type: ext.slice(1),
        text,
        preview: text.slice(0, 4000),
        summary: `${text.length} characters`,
      };
    }

    if (ext === ".xlsx" || ext === ".xls") {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path);
      const preview: Record<string, unknown[]> = {};
      const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
      for (const sheet of workbook.worksheets.slice(0, 5)) {
        const rows: unknown[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 25) {
            rows.push((row.values as unknown[]).slice(1));
          }
        });
        preview[sheet.name] = rows;
      }
      return {
        path,
        type: ext.slice(1),
        preview,
        summary: `${sheetNames.length} sheet(s): ${sheetNames.join(", ")}`,
      };
    }

    if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path });
      return {
        path,
        type: "docx",
        text: result.value,
        preview: result.value.slice(0, 4000),
        summary: `${result.value.length} characters`,
      };
    }

    if (ext === ".pdf") {
      const { readFileSync } = await import("node:fs");
      const pdfParseModule = await import("pdf-parse");
      const parse = (pdfParseModule as unknown as { default?: unknown; PDFParse?: unknown }).default;
      if (typeof parse !== "function") {
        throw new Error("pdf-parse did not expose a default parser function");
      }
      const result = await parse(readFileSync(path));
      return {
        path,
        type: "pdf",
        text: result.text,
        preview: result.text.slice(0, 4000),
        summary: `${result.numpages ?? "unknown"} page(s), ${result.text.length} characters`,
      };
    }

    const stat = statSync(path);
    return {
      path,
      type: ext.replace(/^\./, "") || "file",
      summary: `${stat.size} bytes. Parsing is not implemented for this file type yet.`,
    };
  }

  async parseAndRecord(path: string, taskId?: string): Promise<ParsedFile> {
    const parsed = await this.parse(path);
    const stat = statSync(path);
    const record: DownloadRecord = {
      path,
      name: path.split("/").pop() ?? path,
      type: parsed.type,
      size: stat.size,
      status: "parsed",
      summary: parsed.summary,
      createdAt: stat.birthtime.toISOString(),
      updatedAt: nowIso(),
    };
    this.store.addDownload(record, taskId);
    return parsed;
  }

  private isStable(path: string): boolean {
    try {
      const first = statSync(path).size;
      const start = Date.now();
      while (Date.now() - start < 250) {
        // Small synchronous pause avoids marking a file complete during final rename.
      }
      const second = statSync(path).size;
      return first === second;
    } catch {
      return false;
    }
  }
}
