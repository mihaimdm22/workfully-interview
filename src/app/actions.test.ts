import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Server Actions in `actions.ts`. These are the only mutation
 * surface in the app, so the validation logic (max length, file size, MIME
 * check, PDF emptiness) deserves direct coverage on top of E2E.
 *
 * Strategy: mock the orchestrator, cookies, and PDF extractor so the action
 * code runs end-to-end against fakes. We exercise both error returns
 * (`{ ok: false, error: "..." }`) and the happy path (intent → event mapping).
 */

const orchestrator = {
  dispatch: vi.fn(),
  loadConversation: vi.fn(),
  startConversation: vi.fn(),
};
vi.mock("@/lib/fsm/orchestrator", () => orchestrator);

const cookies = {
  getConversationCookie: vi.fn(),
  clearConversationCookie: vi.fn(),
};
vi.mock("@/lib/cookies", () => cookies);

const extractor = {
  extractPdfText: vi.fn(),
};
vi.mock("@/lib/ai/extract-pdf", () => extractor);

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  cookies.getConversationCookie.mockResolvedValue("convo-1");
  orchestrator.loadConversation.mockResolvedValue({
    state: "idle",
    context: { conversationId: "convo-1" },
  });
  orchestrator.dispatch.mockResolvedValue({
    conversationId: "convo-1",
    state: "idle",
    context: { conversationId: "convo-1" },
    reply: "ok",
  });
});

describe("startNewScreening", () => {
  it("clears the conversation cookie and redirects to /screening/new", async () => {
    const { redirect } = await import("next/navigation");
    const { startNewScreening } = await import("./actions");
    await startNewScreening();
    expect(cookies.clearConversationCookie).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/screening/new");
  });
});

describe("sendTextMessage", () => {
  it("rejects empty text", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "");
    const res = await sendTextMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/empty/i);
    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only text", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "   \n\t  ");
    const res = await sendTextMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });

  it("rejects text over 30,000 chars", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "x".repeat(30_001));
    const res = await sendTextMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/too long/i);
    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches START_SCREENING when text is /screen", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "/screen");
    const res = await sendTextMessage(fd);
    expect(res.ok).toBe(true);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ event: { type: "START_SCREENING" } }),
    );
  });

  it("dispatches START_JOB_BUILDER when text is /newjob", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "/newjob");
    await sendTextMessage(fd);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ event: { type: "START_JOB_BUILDER" } }),
    );
  });

  it("dispatches CANCEL when text is /cancel", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "/cancel");
    await sendTextMessage(fd);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ event: { type: "CANCEL" } }),
    );
  });

  it("dispatches RESET when text is /reset", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "/reset");
    await sendTextMessage(fd);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ event: { type: "RESET" } }),
    );
  });

  it("dispatches PROVIDE_TEXT for free-form content", async () => {
    const { sendTextMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("message", "Senior backend engineer at Acme Inc");
    await sendTextMessage(fd);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          type: "PROVIDE_TEXT",
          text: "Senior backend engineer at Acme Inc",
        },
      }),
    );
  });
});

describe("sendPdfMessage", () => {
  it("rejects when no file is attached", async () => {
    const { sendPdfMessage } = await import("./actions");
    const fd = new FormData();
    const res = await sendPdfMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no file/i);
  });

  it("rejects empty files", async () => {
    const { sendPdfMessage } = await import("./actions");
    const fd = new FormData();
    fd.set("file", new File([], "blank.pdf", { type: "application/pdf" }));
    const res = await sendPdfMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });

  it("rejects files larger than 5 MB", async () => {
    const { sendPdfMessage } = await import("./actions");
    const fd = new FormData();
    // 5 MB + 1 byte; the actual content is irrelevant — just the size check.
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    fd.set("file", new File([big], "huge.pdf", { type: "application/pdf" }));
    const res = await sendPdfMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/too large/i);
  });

  it("rejects files that aren't PDFs", async () => {
    const { sendPdfMessage } = await import("./actions");
    const fd = new FormData();
    fd.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "image.png", {
        type: "image/png",
      }),
    );
    const res = await sendPdfMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/pdf/i);
  });

  it("rejects PDFs that produce empty text (scanned)", async () => {
    extractor.extractPdfText.mockResolvedValueOnce("   ");
    const { sendPdfMessage } = await import("./actions");
    const fd = new FormData();
    fd.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "scan.pdf", {
        type: "application/pdf",
      }),
    );
    const res = await sendPdfMessage(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/empty|scanned/i);
  });

  describe("filename-based JD/CV inference", () => {
    it("dispatches PROVIDE_CV when filename suggests a CV", async () => {
      extractor.extractPdfText.mockResolvedValueOnce("Senior engineer, 6y TS");
      const { sendPdfMessage } = await import("./actions");
      const fd = new FormData();
      fd.set(
        "file",
        new File([new Uint8Array([1, 2, 3])], "cv-strong-match.pdf", {
          type: "application/pdf",
        }),
      );
      await sendPdfMessage(fd);
      expect(orchestrator.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ type: "PROVIDE_CV" }),
        }),
      );
    });

    it("dispatches PROVIDE_JD when filename suggests a JD", async () => {
      extractor.extractPdfText.mockResolvedValueOnce(
        "Backend engineer role at Acme",
      );
      const { sendPdfMessage } = await import("./actions");
      const fd = new FormData();
      fd.set(
        "file",
        new File([new Uint8Array([1, 2, 3])], "senior-backend-jd.pdf", {
          type: "application/pdf",
        }),
      );
      await sendPdfMessage(fd);
      expect(orchestrator.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ type: "PROVIDE_JD" }),
        }),
      );
    });

    it("falls back to PROVIDE_TEXT when filename is ambiguous", async () => {
      extractor.extractPdfText.mockResolvedValueOnce("Some content");
      const { sendPdfMessage } = await import("./actions");
      const fd = new FormData();
      fd.set(
        "file",
        new File([new Uint8Array([1, 2, 3])], "document.pdf", {
          type: "application/pdf",
        }),
      );
      await sendPdfMessage(fd);
      expect(orchestrator.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ type: "PROVIDE_TEXT" }),
        }),
      );
    });
  });
});
