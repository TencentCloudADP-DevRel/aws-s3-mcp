import type { S3Resource } from "../resources/s3.js";
import type { IMCPTool } from "../types.js";
import { GetObjectTool } from "./getObject.js";
import { ListBucketsTool } from "./listBuckets.js";
import { ListObjectsTool } from "./listObjects.js";
import { PutObjectTool } from "./putObject.js";

/**
 * Create all tool instances
 * @param s3Resource S3Resource instance to be used by all tools
 * @returns Array of all tools
 */
export function createTools(s3Resource: S3Resource): IMCPTool[] {
  return [
    new ListBucketsTool(s3Resource),
    new ListObjectsTool(s3Resource),
    new GetObjectTool(s3Resource),
    new PutObjectTool(s3Resource),
  ];
}

// Export all tool classes
export { ListBucketsTool, ListObjectsTool, GetObjectTool, PutObjectTool };
