// Records the three.js canvas to a downloadable .webm via MediaRecorder.
// Because the webcam is rendered inside the scene (single canvas), capturing
// the renderer's canvas captures video + skeleton + plants together.

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private onComplete: (url: string) => void
  ) {}

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  start(): void {
    if (this.isRecording) return;
    const stream = this.canvas.captureStream(30);
    const mimeType = pickMimeType();
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: "video/webm" });
      this.onComplete(URL.createObjectURL(blob));
    };
    this.recorder.start();
  }

  stop(): void {
    this.recorder?.stop();
    this.recorder = null;
  }
}
