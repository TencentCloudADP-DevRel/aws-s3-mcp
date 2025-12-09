import { Readable } from "node:stream";
import type { Bucket, S3ClientConfig, _Object } from "@aws-sdk/client-s3";
import {
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import pdfParse from "pdf-parse";
import { P, match } from "ts-pattern";
import type { S3ObjectData } from "../types";

export interface S3Config {
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  buckets?: string[];
  maxBuckets?: number;
  forcePathStyle?: boolean;
}

export class S3Resource {
  private client: S3Client;
  private maxBuckets: number;
  private configuredBuckets: string[];

  constructor(config: S3Config = {}) {
    // S3 client configuration options
    const clientOptions: S3ClientConfig = {
      region: config.region || process.env.AWS_REGION || "us-east-1",
    };

    // Set credentials - prioritize config over environment variables
    const accessKeyId = config.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      clientOptions.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    // Custom endpoint configuration (for MinIO, CloudFlare R2, etc.)
    const endpoint = config.endpoint || process.env.AWS_ENDPOINT;
    if (endpoint) {
      clientOptions.endpoint = endpoint;
    }

    // Path style URL setting (required for MinIO and some S3-compatible services)
    const forcePathStyle = config.forcePathStyle ?? (process.env.AWS_S3_FORCE_PATH_STYLE === "true");
    if (forcePathStyle) {
      clientOptions.forcePathStyle = true;
    }

    this.client = new S3Client(clientOptions);

    // Get maxBuckets - prioritize config over environment variable
    this.maxBuckets = config.maxBuckets ?? 
      (process.env.S3_MAX_BUCKETS ? Number.parseInt(process.env.S3_MAX_BUCKETS, 10) : 5);

    // Get configured buckets - prioritize config over environment variable
    this.configuredBuckets = config.buckets || this.getConfiguredBucketsFromEnv();
  }

  private getConfiguredBucketsFromEnv(): string[] {
    // Get bucket information from environment variables
    const bucketsEnv = process.env.S3_BUCKETS || "";
    return bucketsEnv.split(",").filter((bucket) => bucket.trim() !== "");
  }

  private logError(message: string, error: unknown): void {
    // Skip logging in test environments or when NODE_ENV is test
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return;
    }
    console.error(message, error);
  }

  // List all buckets or filtered buckets based on configuration
  async listBuckets(): Promise<Bucket[]> {
    try {
      const command = new ListBucketsCommand({});
      const response = await this.client.send(command);

      const buckets = response.Buckets || [];

      // Use pattern matching to filter buckets
      return match({ buckets, hasConfiguredBuckets: this.configuredBuckets.length > 0 })
        .with({ hasConfiguredBuckets: true }, ({ buckets }) =>
          buckets
            .filter((bucket) => bucket.Name && this.configuredBuckets.includes(bucket.Name))
            .slice(0, this.maxBuckets),
        )
        .otherwise(({ buckets }) => buckets.slice(0, this.maxBuckets));
    } catch (error) {
      this.logError("Error listing buckets:", error);
      throw error;
    }
  }

  // List objects in a bucket
  async listObjects(bucketName: string, prefix = "", maxKeys = 1000): Promise<_Object[]> {
    try {
      // Use pattern matching to check bucket accessibility
      await match({
        hasConfiguredBuckets: this.configuredBuckets.length > 0,
        isAllowed: this.configuredBuckets.includes(bucketName),
      })
        .with({ hasConfiguredBuckets: true, isAllowed: false }, () => {
          throw new Error(`Bucket ${bucketName} is not in the allowed buckets list`);
        })
        .otherwise(() => Promise.resolve());

      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.client.send(command);
      return response.Contents || [];
    } catch (error) {
      this.logError(`Error listing objects in bucket ${bucketName}:`, error);
      throw error;
    }
  }

  // Get a specific object from a bucket
  async getObject(bucketName: string, key: string): Promise<S3ObjectData> {
    try {
      // Use pattern matching to check bucket accessibility
      await match({
        hasConfiguredBuckets: this.configuredBuckets.length > 0,
        isAllowed: this.configuredBuckets.includes(bucketName),
      })
        .with({ hasConfiguredBuckets: true, isAllowed: false }, () => {
          throw new Error(`Bucket ${bucketName} is not in the allowed buckets list`);
        })
        .otherwise(() => Promise.resolve());

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await this.client.send(command);
      const contentType = response.ContentType || "application/octet-stream";

      // Check if response body is a readable stream
      if (!(response.Body instanceof Readable)) {
        throw new Error("Unexpected response body type");
      }

      // Handle the response body as a stream
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);

      // Use pattern matching to determine file type and return appropriate data
      return match({
        isText: this.isTextFile(key, contentType),
        isPdf: this.isPdfFile(key, contentType),
      })
        .with({ isText: true }, async () => ({
          data: data.toString("utf-8"),
          contentType,
        }))
        .with({ isPdf: true }, async () => ({
          data: await this.convertPdfToText(data),
          contentType,
        }))
        .otherwise(() => ({
          data,
          contentType,
        }));
    } catch (error) {
      this.logError(`Error getting object ${key} from bucket ${bucketName}:`, error);
      throw error;
    }
  }

  // Check if a file is a text file based on extension and content type
  isTextFile(key: string, contentType?: string): boolean {
    // Use pattern matching to determine if file is text
    return match({ key: key.toLowerCase(), contentType: contentType || "" })
      .with(
        {
          contentType: P.when(
            (type) =>
              type.startsWith("text/") ||
              type === "application/json" ||
              type === "application/xml" ||
              type === "application/javascript",
          ),
        },
        () => true,
      )
      .with(
        {
          key: P.when((k) =>
            [
              ".txt",
              ".json",
              ".xml",
              ".html",
              ".htm",
              ".css",
              ".js",
              ".ts",
              ".md",
              ".csv",
              ".yml",
              ".yaml",
              ".log",
              ".sh",
              ".bash",
              ".py",
              ".rb",
              ".java",
              ".c",
              ".cpp",
              ".h",
              ".cs",
              ".php",
            ].some((ext) => k.endsWith(ext)),
          ),
        },
        () => true,
      )
      .otherwise(() => false);
  }

  // Check if a file is a PDF file
  isPdfFile(key: string, contentType?: string): boolean {
    // Use pattern matching to determine if file is PDF
    return match({ key: key.toLowerCase(), contentType: contentType || "" })
      .with({ contentType: "application/pdf" }, () => true)
      .with({ key: P.when((k) => k.endsWith(".pdf")) }, () => true)
      .otherwise(() => false);
  }

  // Convert PDF buffer to text
  async convertPdfToText(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      this.logError("Error converting PDF to text:", error);
      return "Error: Could not extract text from PDF file.";
    }
  }

  // Upload an object to a bucket
  async putObject(
    bucketName: string,
    key: string,
    content: string | Buffer,
    contentType?: string,
  ): Promise<void> {
    try {
      // Use pattern matching to check bucket accessibility
      await match({
        hasConfiguredBuckets: this.configuredBuckets.length > 0,
        isAllowed: this.configuredBuckets.includes(bucketName),
      })
        .with({ hasConfiguredBuckets: true, isAllowed: false }, () => {
          throw new Error(`Bucket ${bucketName} is not in the allowed buckets list`);
        })
        .otherwise(() => Promise.resolve());

      // Convert string to Buffer if needed
      const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

      // Auto-detect content type if not provided
      const detectedContentType = contentType || this.detectContentType(key);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: detectedContentType,
      });

      await this.client.send(command);
    } catch (error) {
      this.logError(`Error putting object ${key} to bucket ${bucketName}:`, error);
      throw error;
    }
  }

  // Detect content type based on file extension
  private detectContentType(key: string): string {
    const extension = key.toLowerCase().split(".").pop() || "";

    return match(extension)
      .with("txt", () => "text/plain")
      .with("json", () => "application/json")
      .with("xml", () => "application/xml")
      .with("html", "htm", () => "text/html")
      .with("css", () => "text/css")
      .with("js", "mjs", () => "application/javascript")
      .with("ts", () => "application/typescript")
      .with("md", () => "text/markdown")
      .with("csv", () => "text/csv")
      .with("yml", "yaml", () => "application/x-yaml")
      .with("pdf", () => "application/pdf")
      .with("jpg", "jpeg", () => "image/jpeg")
      .with("png", () => "image/png")
      .with("gif", () => "image/gif")
      .with("svg", () => "image/svg+xml")
      .with("webp", () => "image/webp")
      .with("mp4", () => "video/mp4")
      .with("webm", () => "video/webm")
      .with("mp3", () => "audio/mpeg")
      .with("wav", () => "audio/wav")
      .with("zip", () => "application/zip")
      .with("tar", () => "application/x-tar")
      .with("gz", () => "application/gzip")
      .otherwise(() => "application/octet-stream");
  }
}
