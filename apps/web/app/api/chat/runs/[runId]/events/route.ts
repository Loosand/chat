/**
 * [INPUT]: 认证 GET、runId path、after cursor 与 request subscription signal
 * [OUTPUT]: snapshot/heartbeat/reconnect 的有限 SSE long-poll stream
 * [POS]: `/api/chat/runs/:runId/events` Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. request.signal 只关闭订阅，不得传给 ChatRunExecutor。
 * 2. 每个 snapshot 含最新公开 run/message 和 after-cursor events；终态后立即关闭。
 */

import {
  chatRunPathSchema,
  type RunEventSnapshotResource,
  runEventCursorSchema,
} from "@repo/contracts";
import {
  getRunEventSnapshot,
  isTerminalRunResource,
  requireChatOwner,
  toChatErrorResponse,
} from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const runtime = "nodejs";

const encoder = new TextEncoder();
const pollIntervalMs = 250;
const heartbeatIntervalMs = 5000;
const streamDurationMs = 20_000;

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const [ownerId, params] = await Promise.all([
      requireChatOwner(request),
      context.params,
    ]);
    const { runId } = chatRunPathSchema.parse(params);
    const url = new URL(request.url);
    const afterSequence = runEventCursorSchema.parse(
      url.searchParams.get("after") ?? "0"
    );
    const chat = getChatRuntime().chat;
    const initial = await getRunEventSnapshot(
      chat,
      runId,
      ownerId,
      afterSequence
    );

    const body = createRunEventStream({
      initial,
      load: (cursor) => getRunEventSnapshot(chat, runId, ownerId, cursor),
      signal: request.signal,
    });
    return new Response(body, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return toChatErrorResponse(error);
  }
}

export function createRunEventStream(input: {
  initial: RunEventSnapshotResource;
  load(cursor: number): Promise<RunEventSnapshotResource>;
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start: (controller) => runEventStream(input, controller),
  });
}

async function runEventStream(
  input: {
    initial: RunEventSnapshotResource;
    load(cursor: number): Promise<RunEventSnapshotResource>;
    signal: AbortSignal;
  },
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  let snapshot = input.initial;
  let heartbeatAt = Date.now();
  const deadline = Date.now() + streamDurationMs;
  enqueueEvent(controller, "snapshot", snapshot);
  if (closeIfTerminal(controller, snapshot)) {
    return;
  }

  try {
    while (shouldContinue(input.signal, deadline)) {
      await waitForPoll(input.signal);
      if (input.signal.aborted) {
        break;
      }
      const next = await input.load(snapshot.cursor);
      if (isChangedSnapshot(snapshot, next)) {
        snapshot = next;
        enqueueEvent(controller, "snapshot", snapshot);
        heartbeatAt = Date.now();
        if (closeIfTerminal(controller, snapshot)) {
          return;
        }
      } else if (Date.now() - heartbeatAt >= heartbeatIntervalMs) {
        enqueueEvent(controller, "heartbeat", { cursor: snapshot.cursor });
        heartbeatAt = Date.now();
      }
    }
    if (!input.signal.aborted) {
      enqueueEvent(controller, "reconnect", { cursor: snapshot.cursor });
    }
    controller.close();
  } catch (error) {
    closeOrError(controller, input.signal, error);
  }
}

function isChangedSnapshot(
  current: RunEventSnapshotResource,
  next: RunEventSnapshotResource
): boolean {
  return (
    next.cursor !== current.cursor || next.run.version !== current.run.version
  );
}

function closeIfTerminal(
  controller: ReadableStreamDefaultController<Uint8Array>,
  snapshot: RunEventSnapshotResource
): boolean {
  if (!isTerminalRunResource(snapshot.run)) {
    return false;
  }
  controller.close();
  return true;
}

function shouldContinue(signal: AbortSignal, deadline: number): boolean {
  return !(signal.aborted || Date.now() >= deadline);
}

function closeOrError(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal,
  error: unknown
): void {
  if (signal.aborted || isAbortError(error)) {
    controller.close();
  } else {
    controller.error(error);
  }
}

function enqueueEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: "heartbeat" | "reconnect" | "snapshot",
  data: unknown
): void {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(finish, pollIntervalMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException("The subscription was aborted.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
