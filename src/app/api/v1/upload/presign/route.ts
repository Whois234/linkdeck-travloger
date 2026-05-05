import { NextRequest } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm',
];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function getS3Client() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in .env.local');
  }
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const { filename, contentType, fileSize, folder = 'uploads' } = body ?? {};

  if (!filename || !contentType) return err('filename and contentType are required', 400);
  if (!ALLOWED_TYPES.includes(contentType)) return err(`File type not allowed: ${contentType}`, 400);
  if (fileSize && fileSize > MAX_SIZE_BYTES) return err('File too large (max 50 MB)', 400);

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return err('AWS_S3_BUCKET not configured', 500);

  const ext = filename.split('.').pop() ?? 'bin';
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const s3 = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ...(fileSize ? { ContentLength: fileSize } : {}),
    });
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = process.env.AWS_CDN_URL
      ? `${process.env.AWS_CDN_URL.replace(/\/$/, '')}/${key}`
      : `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return ok({ presignedUrl, publicUrl, key });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to generate upload URL';
    return err(msg, 500);
  }
}
