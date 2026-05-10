import { NextRequest } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';

export const runtime = 'nodejs';
// Allow up to 10 MB through the proxy (Vercel limit is 4.5 MB on hobby, 50 MB on pro)
export const maxDuration = 30;

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm',
];

function getS3Client() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
  }
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return err('AWS_S3_BUCKET not configured', 500);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) return err('No file provided', 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err(`File type not allowed: ${file.type}`, 400);
    if (file.size > 50 * 1024 * 1024) return err('File too large (max 50 MB)', 400);

    const ext = file.name.split('.').pop() ?? 'bin';
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ContentLength: buffer.length,
    }));

    const publicUrl = process.env.AWS_CDN_URL
      ? `${process.env.AWS_CDN_URL.replace(/\/$/, '')}/${key}`
      : `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return ok({ publicUrl, key });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return err(msg, 500);
  }
}
