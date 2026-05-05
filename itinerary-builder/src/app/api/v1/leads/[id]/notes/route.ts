import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const schema = z.object({ content: z.string().min(1) });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const notes = await prisma.leadNote.findMany({
    where: { lead_id: params.id },
    orderBy: { created_at: 'desc' },
  });
  return ok(notes);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Content required', 400);

  const note = await prisma.leadNote.create({
    data: { lead_id: params.id, content: parsed.data.content, created_by: user.sub },
  });
  await prisma.leadActivity.create({
    data: { lead_id: params.id, type: 'note_added', metadata: { preview: parsed.data.content.slice(0, 80) }, created_by: user.sub },
  });
  return ok(note, 201);
}
