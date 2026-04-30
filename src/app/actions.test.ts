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

const repos = {
  ConcurrentModificationError: class extends Error {
    readonly conversationId: string;
    readonly expectedVersion: number;
    constructor(conversationId: string, expectedVersion: number) {
      super(
        `Conversation ${conversationId} was modified concurrently (expected version ${expectedVersion})`,
      );
      this.name = "ConcurrentModificationError";
      this.conversationId = conversationId;
      this.expectedVersion = expectedVersion;
    }
  },
  getOrCreateShareLink: vi.fn(),
  getScreeningById: vi.fn(),
  saveAppSettings: vi.fn(),
  deleteMessagesForConversation: vi.fn(),
};
vi.mock("@/lib/db/repositories", () => repos);

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

beforeEach(() => {
  // resetAllMocks clears call history AND mock implementations / queued
  // mockRejectedValueOnce values. Earlier tests in this file enqueue
  // multiple rejections via mockRejectedValueOnce; if we only used
  // clearAllMocks() those queued values would leak into later tests and
  // make sendTextMessage etc see synthetic CMEs they never set up.
  vi.resetAllMocks();
  cookies.getConversationCookie.mockResolvedValue("convo-1");
  orchestrator.loadConversation.mockResolvedValue({
    state: "idle",
    context: { conversationId: "convo-1" },
  });
  orchestrator.startConversation.mockResolvedValue({
    conversationId: "convo-1",
    state: "idle",
    context: { conversationId: "convo-1" },
    reply: "ok",
  });
  orchestrator.dispatch.mockResolvedValue({
    conversationId: "convo-1",
    state: "idle",
    context: { conversationId: "convo-1" },
    reply: "ok",
  });
  repos.deleteMessagesForConversation.mockResolvedValue(undefined);
});

describe("startNewScreening", () => {
  it("deletes messages BEFORE dispatching RESET, keeps the cookie, and redirects with ?reset=1", async () => {
    const { redirect } = await import("next/navigation");
    const { startNewScreening } = await import("./actions");

    // Capture call order — delete must run before dispatch (otherwise the
    // bot greeting from dispatch gets wiped).
    const callOrder: string[] = [];
    repos.deleteMessagesForConversation.mockImplementation(async () => {
      callOrder.push("delete");
    });
    orchestrator.dispatch.mockImplementation(async () => {
      callOrder.push("dispatch");
      return {
        conversationId: "convo-1",
        state: "idle",
        context: { conversationId: "convo-1" },
        reply: "ok",
      };
    });

    await startNewScreening();

    expect(cookies.clearConversationCookie).not.toHaveBeenCalled();
    expect(repos.deleteMessagesForConversation).toHaveBeenCalledWith("convo-1");
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "convo-1",
        event: { type: "RESET" },
      }),
    );
    expect(callOrder).toEqual(["delete", "dispatch"]);
    expect(redirect).toHaveBeenCalledWith("/screening/new?reset=1");
  });

  it("retries once on ConcurrentModificationError (RESET is idempotent)", async () => {
    const { startNewScreening } = await import("./actions");
    const cme = new repos.ConcurrentModificationError("convo-1", 0);
    orchestrator.dispatch.mockRejectedValueOnce(cme).mockResolvedValueOnce({
      conversationId: "convo-1",
      state: "idle",
      context: { conversationId: "convo-1" },
      reply: "ok",
    });

    await startNewScreening();

    expect(orchestrator.dispatch).toHaveBeenCalledTimes(2);
  });

  it("re-throws non-CME errors after the first attempt", async () => {
    const { startNewScreening } = await import("./actions");
    orchestrator.dispatch.mockRejectedValueOnce(new Error("DB down"));

    await expect(startNewScreening()).rejects.toThrow("DB down");
    expect(orchestrator.dispatch).toHaveBeenCalledTimes(1);
  });

  it("re-throws if the second CME retry also fails", async () => {
    const { startNewScreening } = await import("./actions");
    const cme = new repos.ConcurrentModificationError("convo-1", 0);
    orchestrator.dispatch.mockRejectedValueOnce(cme).mockRejectedValueOnce(cme);

    await expect(startNewScreening()).rejects.toBeInstanceOf(
      repos.ConcurrentModificationError,
    );
    expect(orchestrator.dispatch).toHaveBeenCalledTimes(2);
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
