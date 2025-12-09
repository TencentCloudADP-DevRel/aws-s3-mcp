import { z } from "zod";
import { createErrorResponse } from "../helpers/createErrorResponse.js";
import type { S3Resource } from "../resources/s3.js";
import type { IMCPTool, InferZodParams } from "../types.js";

/**
 * Upload an object to an S3 bucket
 */
export class PutObjectTool implements IMCPTool {
  /**
   * Tool name
   */
  readonly name = "put-object";

  /**
   * Tool description
   */
  readonly description =
    "Upload an object to an S3 bucket. Supports text and binary content with automatic content type detection.";

  /**
   * Parameter definition
   */
  readonly parameters = {
    bucket: z.string().describe("Name of the S3 bucket"),
    key: z.string().describe("Key (path) of the object to upload"),
    content: z.string().describe("Content of the object to upload (text or base64-encoded binary)"),
    contentType: z
      .string()
      .optional()
      .describe(
        "MIME type of the content (optional, will be auto-detected from file extension if not provided)",
      ),
    encoding: z
      .enum(["text", "base64"])
      .optional()
      .default("text")
      .describe("Encoding of the content: 'text' for plain text, 'base64' for binary data"),
  } as const;

  /**
   * S3Resource instance
   */
  private s3Resource: S3Resource;

  /**
   * Constructor
   */
  constructor(s3Resource: S3Resource) {
    this.s3Resource = s3Resource;
  }

  /**
   * Execute function
   */
  async execute(args: InferZodParams<typeof this.parameters>) {
    const { bucket, key, content, contentType, encoding = "text" } = args;

    try {
      // Convert content based on encoding
      const body = encoding === "base64" ? Buffer.from(content, "base64") : content;

      // Upload the object
      await this.s3Resource.putObject(bucket, key, body, contentType);

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully uploaded ${key} to bucket ${bucket}`,
          },
        ],
      };
    } catch (error) {
      return createErrorResponse(
        error,
        `Error uploading object ${key} to bucket ${bucket}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
