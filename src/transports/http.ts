import { serve } from "@hono/node-server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { S3Config } from "../resources/s3.js";
import { createServer } from "../server.js";
import {
  createMockNodeRequest,
  createMockNodeResponse,
  createStreamingResponse,
} from "../utils/httpMock.js";
import type { HttpTransportConfig, ITransport, ITransportFactory } from "./types.js";

export class HttpTransport implements ITransport {
  private app: Hono;
  private config: Required<HttpTransportConfig>;
  private activeSessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: McpServer }
  >();

  constructor(config: HttpTransportConfig = {}) {
    this.config = {
      port: config.port || 3000,
      cors: {
        origin: config.cors?.origin || "*",
        allowMethods: config.cors?.allowMethods || ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: config.cors?.allowHeaders || [
          "Content-Type",
          "Authorization",
          "Accept",
          "x-mcp-session-id",
          "mcp-session-id",
          "S3-Region",
          "S3-Endpoint",
          "S3-Access-Key-Id",
          "S3-Secret-Access-Key",
          "S3-Buckets",
          "S3-Force-Path-Style",
        ],
      },
    };
    this.app = new Hono();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use("*", logger());
    this.app.use(
      "*",
      cors({
        origin: this.config.cors.origin || "*",
        allowMethods: this.config.cors.allowMethods || ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: this.config.cors.allowHeaders || ["Content-Type", "Authorization", "Accept"],
      }),
    );
  }

  private setupRoutes(server: McpServer): void {
    // Health check endpoint
    this.app.get("/health", (c) => {
      return c.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // MCP POST endpoint
    this.app.post("/mcp", async (c) => {
      try {
        const parsedBody = await c.req.json();
        const req = createMockNodeRequest(c, parsedBody);

        // Always set Accept header to support both JSON and SSE
        req.headers.accept = "application/json, text/event-stream";
        req.headers.Accept = "application/json, text/event-stream";

        // Handle session ID
        const sessionId = c.req.query("sessionId");
        if (sessionId) {
          req.headers["mcp-session-id"] = sessionId;
        }

        const effectiveSessionId =
          sessionId || req.headers["mcp-session-id"] || req.headers["x-mcp-session-id"];
        
        // Extract S3 configuration from headers
        const s3Config: S3Config = {
          region: c.req.header("S3-Region"),
          endpoint: c.req.header("S3-Endpoint"),
          accessKeyId: c.req.header("S3-Access-Key-Id"),
          secretAccessKey: c.req.header("S3-Secret-Access-Key"),
          buckets: c.req.header("S3-Buckets")?.split(",").map(b => b.trim()),
          forcePathStyle: c.req.header("S3-Force-Path-Style") === "true",
        };

        const session = await this.getOrCreateSession(effectiveSessionId as string, server, s3Config);
        const { response: res, getResponse } = createMockNodeResponse();

        await session.transport.handleRequest(req, res, parsedBody);
        const response = await getResponse();
        const responseText = await response.text();
        const responseHeaders = Object.fromEntries(response.headers.entries());

        return new Response(responseText, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      } catch {
        return c.json({ error: "Internal server error" }, 500);
      }
    });

    // SSE endpoint
    this.app.get("/sse", async (c) => {
      try {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        const streamingRes = createStreamingResponse(writer);
        const sessionId = crypto.randomUUID();
        const transport = new SSEServerTransport(`/mcp?sessionId=${sessionId}`, streamingRes);
        await server.connect(transport);

        return new Response(readable, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Last-Event-ID, Mcp-Session-Id",
          },
        });
      } catch {
        return c.json({ error: "Internal server error" }, 500);
      }
    });

    this.app.get("/mcp", async (c) => {
      return c.redirect("/sse");
    });
  }

  private async getOrCreateSession(sessionId?: string, server?: McpServer, s3Config?: S3Config) {
    const id = sessionId || crypto.randomUUID();

    const existing = this.activeSessions.get(id);
    if (existing) {
      return existing;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      enableJsonResponse: true,
    });

    if (!server) {
      throw new Error("Server instance is required");
    }

    // Create a new server instance with custom S3 config for this session
    const sessionServer = s3Config ? createServer({ s3Config }) : server;

    const session = { transport, server: sessionServer };
    this.activeSessions.set(id, session);

    try {
      await sessionServer.connect(transport);
    } catch (error) {
      this.activeSessions.delete(id);
      throw error;
    }

    return session;
  }

  async connect(server: McpServer): Promise<void> {
    this.setupRoutes(server);

    serve({
      fetch: this.app.fetch,
      port: this.config.port,
    });

    console.log(`HTTP server running on port ${this.config.port}`);
  }

  async disconnect(): Promise<void> {
    this.activeSessions.clear();
  }
}

export class HttpTransportFactory implements ITransportFactory {
  createTransport(config?: HttpTransportConfig): ITransport {
    return new HttpTransport(config);
  }
}
