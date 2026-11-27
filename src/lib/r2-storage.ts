import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "./permissions";
import { r2Origin } from "./r2-origin";

function configuration() {
  const endpoint = r2Origin(process.env.R2_ACCOUNT_ID);
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
    throw new AppError("R2 storage is not configured.", 503);
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}
export function r2Bucket() {
  const { endpoint, bucket } = configuration();
  return `${endpoint}/${bucket}`;
}
function connection() {
  const { bucket, endpoint, accessKeyId, secretAccessKey } = configuration();
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 2,
    }),
  };
}
export function r2Missing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 404
  );
}
export const R2_UPLOAD_SECONDS = 300;
export async function r2UploadPermission(item: {
  storagePath: string;
  size: number;
  contentType: string;
  createdAt: Date;
}) {
  const untilExpiry = Math.floor(
    (+item.createdAt + 3600000 - Date.now()) / 1000,
  );
  if (untilExpiry < 1) throw new AppError("Upload permission expired.", 410);
  const { client, bucket } = connection();
  const headers = { "Content-Type": item.contentType, "If-None-Match": "*" };
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: item.storagePath,
      ContentLength: item.size,
      ContentType: item.contentType,
      IfNoneMatch: "*",
    }),
    {
      expiresIn: Math.min(R2_UPLOAD_SECONDS, untilExpiry),
      signableHeaders: new Set([
        "content-type",
        "content-length",
        "if-none-match",
      ]),
    },
  );
  const signed =
    new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
  if (
    !["content-type", "content-length", "if-none-match"].every((name) =>
      signed.includes(name),
    )
  )
    throw new AppError("R2 upload protection is unavailable.", 503);
  return { url, headers };
}
export async function r2Head(key: string) {
  const { client, bucket } = connection();
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
    abortSignal: AbortSignal.timeout(15000),
  });
}
export async function r2Read(key: string, range?: string) {
  const { client, bucket } = connection();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }),
    { abortSignal: AbortSignal.timeout(30000) },
  );
  if (!result.Body) throw new AppError("File tidak tersedia.", 404);
  return result.Body.transformToWebStream();
}
export async function r2PutImmutable(
  key: string,
  bytes: Uint8Array,
  type: string,
) {
  const { client, bucket } = connection();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: type,
        ContentLength: bytes.length,
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  } catch (error) {
    if (
      (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode !== 412
    )
      throw error;
    // A retry after a lost response can reuse the object after hash verification.
  }
}
export async function r2Delete(key: string) {
  const { client, bucket } = connection();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
    abortSignal: AbortSignal.timeout(12000),
  });
}
export async function* listR2Objects() {
  const signal = AbortSignal.timeout(25000);
  const { client, bucket } = connection();
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
      { abortSignal: signal },
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key || object.Size === undefined)
        throw new Error("R2 did not return a complete object listing.");
      yield { key: object.Key, size: object.Size };
    }
    token = page.NextContinuationToken;
    if (page.IsTruncated && !token) throw new Error("R2 listing ended early.");
  } while (token);
}
