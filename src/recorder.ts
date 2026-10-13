/** Desktop MediaRecorder wrapper. Pending permission requests are cancellable. */
export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private generation = 0;
  private pending: Promise<boolean> | null = null;
  private rejectStop: ((error: Error) => void) | null = null;

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  get isStarting(): boolean {
    return this.pending !== null;
  }

  start(): Promise<boolean> {
    if (this.isRecording) return Promise.resolve(true);
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const pending = this.acquire(generation);
    this.pending = pending;
    const clearPending = () => {
      if (this.pending === pending) this.pending = null;
    };
    void pending.then(clearPending, clearPending);
    return pending;
  }

  private async acquire(generation: number): Promise<boolean> {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start();
      this.stream = stream;
      this.recorder = recorder;
      this.chunks = chunks;
      return true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (generation !== this.generation) return false;
      throw error;
    }
  }

  /** Останавливает запись и возвращает готовый аудио-блоб. */
  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    const chunks = this.chunks;
    if (!recorder || recorder.state !== "recording") {
      throw new Error("Запись не была запущена");
    }
    try {
      return await new Promise<Blob>((resolve, reject) => {
        this.rejectStop = reject;
        recorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
        recorder.stop();
      });
    } finally {
      if (this.recorder === recorder) this.cleanup();
    }
  }

  /** Прерывает запись без результата (например, по Esc). */
  cancel(): void {
    ++this.generation;
    this.pending = null;
    this.rejectStop?.(new Error("Запись отменена"));
    this.rejectStop = null;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.rejectStop = null;
    this.chunks = [];
  }
}
