import { taskRealtimeService } from "@/services/tasks/task-realtime.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function encodeEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function encodeComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

export async function GET(request: Request) {
  let closeStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const cleanupHandlers = new Set<() => void>();

      const cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;

        for (const dispose of cleanupHandlers) {
          dispose();
        }

        cleanupHandlers.clear();
        controller.close();
      };

      closeStream = cleanup;

      const send = (chunk: Uint8Array) => {
        if (closed) {
          return;
        }

        controller.enqueue(chunk);
      };

      send(encoder.encode("retry: 3000\n\n"));
      send(
        encodeEvent("connected", {
          timestamp: new Date().toISOString()
        })
      );

      const unsubscribe = taskRealtimeService.subscribe((event) => {
        send(encodeEvent("tasks-updated", event));
      });

      cleanupHandlers.add(unsubscribe);

      const heartbeat = setInterval(() => {
        send(encodeComment("keep-alive"));
      }, 15_000);

      cleanupHandlers.add(() => clearInterval(heartbeat));

      const abortHandler = () => {
        cleanup();
      };

      request.signal.addEventListener("abort", abortHandler);
      cleanupHandlers.add(() => request.signal.removeEventListener("abort", abortHandler));
    },
    cancel() {
      closeStream();
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no"
    }
  });
}
