/**
 * POST /api/v1/crm/test-workflow
 *
 * Automated integration test for the workflow engine:
 * 1. Creates a test contact with known gallabox_bot_flow_id + gallabox_ad_id
 * 2. Calls executeContactWorkflows()
 * 3. Waits 2 seconds then checks DB state
 * 4. Returns full test result
 * 5. Cleans up test data
 *
 * ADMIN only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { createContact } from '@/lib/contacts/service';

const TEST_PHONE   = '919999999999';
const TEST_BOT_FLOW = '69330f9e5556c68b11525907';
const TEST_AD_ID    = '120239160890140669';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(user, UserRole.ADMIN)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result: Record<string, unknown> = {
    contactCreated:    false,
    workflowFired:     false,
    conditionMatched:  false,
    assignedTo:        null,
    expectedAssignee:  'Subhash',
    pipelineDeal:      false,
    workflowRunLog:    false,
    workflowRunDetail: null,
    errors:            [] as string[],
  };

  let contactId: string | null = null;
  let leadId:    string | null = null;

  try {
    // ── 0. Clean any leftover test data ──────────────────────────────────────
    await cleanupTestData();

    // ── 1. Find admin to use as owner ─────────────────────────────────────────
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN', status: true },
      select: { id: true },
    });
    if (!admin) throw new Error('No admin user found');

    // ── 2. Create test contact with Gallabox fields ───────────────────────────
    console.log('=== WORKFLOW TEST: Creating test contact ===');
    const contact = await createContact(
      {
        phone:       TEST_PHONE,
        name:        'Workflow Test Contact',
        lead_source: 'whatsapp_ad',
        platform:    'META',
        custom_fields: {
          gallabox_bot_flow_id: TEST_BOT_FLOW,
          gallabox_ad_id:       TEST_AD_ID,
          gallabox_source:      'whatsapp_ad',
        },
        owner_id: admin.id,
      },
      null, // no actor (system)
    );

    contactId = contact.id;
    result.contactCreated = true;
    console.log('=== WORKFLOW TEST: Contact created, id:', contactId, '===');

    // createContact() already awaited executeContactWorkflows() internally.
    // Give DB writes 1 extra second to settle.
    await new Promise(r => setTimeout(r, 1000));

    // ── 3. Check WorkflowRun log ──────────────────────────────────────────────
    const workflowRun = await prisma.workflowRun.findFirst({
      where: { contact_id: contactId },
      orderBy: { created_at: 'desc' },
    });

    if (workflowRun) {
      result.workflowFired     = true;
      result.conditionMatched  = workflowRun.conditions_matched;
      result.workflowRunLog    = true;
      result.workflowRunDetail = {
        result:     workflowRun.result,
        actionType: workflowRun.action_type,
        assignedTo: workflowRun.assigned_to,
        error:      workflowRun.error,
      };
    }

    // ── 4. Check assigned_to on contact ───────────────────────────────────────
    const updatedContact = await prisma.crmContact.findUnique({
      where:   { id: contactId },
      select:  { assigned_to_id: true, assigned_to: { select: { name: true } } },
    });
    result.assignedTo = updatedContact?.assigned_to?.name ?? updatedContact?.assigned_to_id ?? null;

    // ── 5. Check pipeline lead ────────────────────────────────────────────────
    const lead = await prisma.lead.findFirst({
      where: { crm_contact_id: contactId },
    });
    if (lead) {
      leadId = lead.id;
      result.pipelineDeal = true;
    }

  } catch (e) {
    (result.errors as string[]).push(String(e));
    console.error('=== WORKFLOW TEST ERROR ===', e);
  } finally {
    // ── 6. Cleanup ────────────────────────────────────────────────────────────
    if (leadId)    await prisma.lead.deleteMany({ where: { crm_contact_id: contactId! } }).catch(() => {});
    if (contactId) await prisma.workflowRun.deleteMany({ where: { contact_id: contactId } }).catch(() => {});
    if (contactId) await prisma.contactActivity.deleteMany({ where: { contact_id: contactId } }).catch(() => {});
    if (contactId) await prisma.crmContact.delete({ where: { id: contactId } }).catch(() => {});
    console.log('=== WORKFLOW TEST: Cleanup complete ===');
  }

  const pass = (v: boolean) => v ? '✅' : '❌';
  const summary = [
    '=== WORKFLOW TEST RESULT ===',
    `Contact created:       ${pass(result.contactCreated as boolean)}`,
    `Workflow fired:        ${pass(result.workflowFired as boolean)}`,
    `Condition matched:     ${pass(result.conditionMatched as boolean)}`,
    `Contact assigned to:   ${result.assignedTo ?? 'nobody'} (expected: Subhash)`,
    `Pipeline deal created: ${pass(result.pipelineDeal as boolean)}`,
    `WorkflowRun log:       ${pass(result.workflowRunLog as boolean)}`,
    '===========================',
  ].join('\n');

  console.log(summary);

  return NextResponse.json({
    summary,
    detail: result,
    allPassed: (result.contactCreated && result.workflowFired && result.conditionMatched &&
                result.pipelineDeal   && result.workflowRunLog) as boolean,
  });
}

async function cleanupTestData() {
  const existing = await prisma.crmContact.findUnique({ where: { phone: TEST_PHONE } });
  if (existing) {
    await prisma.lead.deleteMany({ where: { crm_contact_id: existing.id } }).catch(() => {});
    await prisma.workflowRun.deleteMany({ where: { contact_id: existing.id } }).catch(() => {});
    await prisma.contactActivity.deleteMany({ where: { contact_id: existing.id } }).catch(() => {});
    await prisma.crmContact.delete({ where: { id: existing.id } }).catch(() => {});
  }
}
