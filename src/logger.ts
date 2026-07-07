import { App, Modal } from "obsidian";

export interface LogEntry {
  time: string;
  level: "info" | "error";
  message: string;
}

/**
 * Кольцевой лог активности. Основной канал обратной связи в режиме призрака,
 * где Notice-уведомления отключены.
 */
export class ActivityLog {
  private entries: LogEntry[] = [];
  private readonly limit = 100;

  info(message: string): void {
    this.push("info", message);
  }

  error(message: string): void {
    this.push("error", message);
    console.error(`[voice-command-notes] ${message}`);
  }

  private push(level: LogEntry["level"], message: string): void {
    this.entries.push({ time: new Date().toLocaleTimeString(), level, message });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  show(app: App): void {
    new LogModal(app, [...this.entries].reverse()).open();
  }
}

class LogModal extends Modal {
  constructor(app: App, private entries: LogEntry[]) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Voice Command Notes — лог активности");
    if (this.entries.length === 0) {
      this.contentEl.createEl("p", { text: "Пока пусто." });
      return;
    }
    for (const e of this.entries) {
      const row = this.contentEl.createDiv();
      row.setText(`${e.time}  ${e.level === "error" ? "⛔" : "•"}  ${e.message}`);
      if (e.level === "error") row.style.color = "var(--text-error)";
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
