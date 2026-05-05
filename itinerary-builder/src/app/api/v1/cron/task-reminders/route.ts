import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api-response';

// Called by Vercel cron or external scheduler every minute
// GET /api/v1/cron/task-reminders (protected by CRON_SECRET header)
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return new Response('Forbidden', { status: 403 });
  }

  const now = new Date();
  const fiveMinLater = new Date(now.getTime() + 5 * 60 * 1000);

  // Find tasks due in <= 5 minutes and not yet notified
  const dueTasks = await prisma.leadTask.findMany({
    where: {
      status: 'pending',
      notified: false,
      due_time: { lte: fiveMinLater },
    },
    include: { lead: { select: { name: true, id: true } } },
  });

  if (dueTasks.length === 0) return ok({ fired: 0 });

  // For each task, find the creator's user record and create notification
  const results = await Promise.allSettled(
    dueTasks.map(async (task) => {
      const isOverdue = task.due_time < now;
      const label = isOverdue ? 'OVERDUE' : 'due in 5 min';
      const message = `Task [${task.type.replace('_', ' ')}] for ${task.lead.name} is ${label}`;

      // Create notification for the task creator
      await prisma.notification.create({
        data: {
          user_id: task.created_by,
          message,
          event_type: 'task_reminder',
        },
      });

      // Mark task as notified (and overdue if past)
      await prisma.leadTask.update({
        where: { id: task.id },
        data: {
          notified: true,
          status: isOverdue ? 'overdue' : 'pending',
        },
      });
    })
  );

  const fired = results.filter(r => r.status === 'fulfilled').length;
  return ok({ fired, total: dueTasks.length });
}
