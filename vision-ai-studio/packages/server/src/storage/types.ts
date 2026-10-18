export type UploadTarget =
  | { mode: "single"; method: "PUT"; url: string; headers: Record<string, string> }
  | {
      mode: "multipart";
      uploadId: string;
      partSize: number;
      parts: Array<{ partNumber: number; url: string }>;
    };

export interface DownloadOptions {
  expiresSec?: number;
  /** Nome sugerido para download (Content-Disposition: attachment). */
  downloadName?: string;
}

export interface StorageDriver {
  readonly kind: "local" | "s3";
  createUpload(key: string, contentType: string, sizeBytes: number): Promise<UploadTarget>;
  completeUpload(key: string, target: { uploadId?: string; parts?: Array<{ partNumber: number; etag: string }> }): Promise<void>;
  abortUpload(key: string, uploadId?: string): Promise<void>;
  getDownloadUrl(key: string, opts?: DownloadOptions): Promise<string>;
  stat(key: string): Promise<{ size: number } | null>;
  /** Disponibiliza o objeto como arquivo local (download no S3; caminho direto no local). */
  materialize(key: string, tmpDir: string): Promise<{ path: string; cleanup: () => Promise<void> }>;
  uploadFile(localPath: string, key: string, contentType: string): Promise<number>;
  putBuffer(key: string, data: Buffer, contentType: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Recebe um upload que passa pela aplicação (stream), respeitando o tamanho máximo. */
  writeStream(key: string, body: AsyncIterable<Uint8Array>, maxBytes: number, contentType: string): Promise<number>;
}
