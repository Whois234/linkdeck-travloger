/**
 * POST /api/v1/crm/fix-workflow-conditions
 *
 * One-time fix: find all active contact workflows that use gallabox_bot_flow_id
 * or gallabox_ad_id conditions and add a third OR condition:
 *   lead_source IS whatsapp_ad
 *
 * This ensures any WhatsApp-ad contact gets assigned even if Gallabox doesn't
 * send bot_flow_id or ad_id in the webhook payload.
 *
 * Also ensures match mode is 'OR' so any single condition triggers the workflow.
 *
 * Safe to run multiple times — skips workflows that already have the lead_source condition.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const workflows = await prisma.crmWorkflow.findMany({
    where: { module: 'contacts', is_active: true },
  });

  const results: { id: string; name: string; action: string }[] = [];

  for (const wf of workflows) {
    const cond = wf.conditions as {
      match?: string;
      rules?: Array<{ field: string; operator: string; value: string }>;
      rr_index?: number;
    } | null;

    if (!cond || !Array.isArray(cond.rules) || cond.rules.length === 0) {
      results.push({ id: wf.id, name: wf.name, action: 'skipped — no rules array' });
      continue;
    }

    const hasGallaboxCondition = cond.rules.some(r =>
      r.field === 'gallabox_bot_flow_id' || r.field === 'gallabox_ad_id',
    );
    if (!hasGallaboxCondition) {
      results.push({ id: wf.id, name: wf.name, action: 'skipped — no gallabox conditions' });
      continue;
    }

    const alreadyHasLeadSource = cond.rules.some(r =>
      r.field === 'lead_source' && r.value === 'whatsapp_ad',
    );
    if (alreadyHasLeadSource) {
      results.push({ id: wf.id, name: wf.name, action: 'skipped — already has lead_source condition' });
      continue;
    }

    const updatedRules = [
      ...cond.rules,
      { field: 'lead_source', operator: 'is', value: 'whatsapp_ad' },
    ];

    await prisma.crmWorkflow.update({
      where: { id: wf.id },
      data: {
        conditions: {
          ...cond,
          match: 'OR',   // ensure OR — any single condition triggers the workflow
          rules: updatedRules,
        },
      },
    });

    results.push({
      id: wf.id,
      name: wf.name,
      action: `updated — added lead_source IS whatsapp_ad (OR), total rules: ${updatedRules.length}`,
    });
  }

  return ok({ processed: results.length, results });
}
