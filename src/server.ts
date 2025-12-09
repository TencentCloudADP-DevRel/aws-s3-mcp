import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { S3Resource, type S3Config } from "./resources/s3.js";
import { createTools } from "./tools/index.js";

export interface ServerDependencies {
  s3Resource?: S3Resource;
  s3Config?: S3Config;
  serverName?: string;
  serverVersion?: string;
}

/**
 * Create and configure the MCP server with S3 tools
 * Following Dependency Injection principle for better testability
 */
export function createServer(dependencies: ServerDependencies = {}): McpServer {
  const {
    s3Resource,
    s3Config,
    serverName = "s3-mcp-server",
    serverVersion = "0.4.0",
  } = dependencies;

  // Create S3Resource: prioritize s3Resource > s3Config > default
  const resource = s3Resource || new S3Resource(s3Config);

  const server = new McpServer({
    name: serverName,
    version: serverVersion,
  });

  // Create and register all tools
  const tools = createTools(resource);
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.parameters, tool.execute.bind(tool));
  }

  return server;
}
