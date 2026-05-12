/**
 * Contacts service — single source of truth for CrmContact automation rules.
 *
 * Every API route that mutates a contact MUST go through these functions
 * instead of touching prisma.crmContact directly. That guarantees:
 *   • lead_stage → CONVERTED auto-sets is_converted + closed_date
 *   • lead_stage off CONVERTED auto-clears those
 *   • New contacts log LEAD_CREATED
 *   • Stage changes log STAGE_CHANGE
 *   • Assignment changes log ASSIGNMENT_CHANGE
 *   • Soft-deletes set deleted_at (we never hard-delete)
 *
 * The service is transactional per call so partial states are impossible.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type {
  CrmContact,
  ContactActivityType,
  LeadStage,
  DevicePlatform,
} from '@prisma/client';

// Prisma needs an explicit JsonNull sentinel to clear a Json column.
const jsonOrNull = (v: Record<string, unknown> | null | undefined) =>
  v === null ? Prisma.JsonNull : ((v ?? undefined) as Prisma.InputJsonValue | undefined);

// ─── Input shapes ────────────────────────────────────────────────────────────

export type ContactCreateInput = {
  name: string;
  phone: string;                          // normalized at the API boundary
  email?: string | null;
  city?: string | null;

  // Travel interest
  interested_destination?: string | null;
  number_of_travellers?: number | null;
  trip_type?: string | null;
  special_requirements?: string | null;
  budget_per_person?: number | string | null;   // accept number or string from JSON

  // Lead source & ad attribution
  lead_source?: string | null;
  platform?: string | null;
  campaign_name?: string | null;
  ad_set_name?: string | null;
  ad_name?: string | null;
  other_ad_details?: Record<string, unknown> | null;
  device_platform?: DevicePlatform | null;
  facebook_click_id?: string | null;
  facebook_browser_id?: string | null;
  google_click_id?: string | null;
  platform_lead_id?: string | null;
  gallabox_contact_id?: string | null;

  // CRM workflow
  lead_stage?: LeadStage;                 // defaults to NEW at DB level
  assigned_to_id?: string | null;
  follow_up_date?: Date | string | null;
  booking_value?: number | string | null;

  // Internal
  tags?: string[];
  do_not_contact?: boolean;
  notes?: string | null;
  source?: string | null;                 // legacy free-text source
  custom_fields?: Record<string, unknown> | null;

  // Required: who owns this record (creator)
  owner_id: string;
};

export type ContactUpdateInput = Partial<Omit<ContactCreateInput, 'owner_id' | 'phone'>> & {
  phone?: string;                         // allowed but must remain unique
};

// ─── Public errors ───────────────────────────────────────────────────────────

export class DuplicatePhoneError extends Error {
  code = 'DUPLICATE_PHONE' as const;
  constructor(public phone: string) { super(`A contact with phone ${phone} already exists.`); }
}

export class ContactNotFoundError extends Error {
  code = 'NOT_FOUND' as const;
  constructor(public id: string) { super(`Contact ${id} not found.`); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert numeric/string/null to Prisma.Decimal | undefined (skip the field on undefined, write null on null). */
function toDecimal(v: number | string | null | undefined): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  // Prisma.Decimal accepts string or number; we pass through and let Prisma validate.
  return v as unknown as Prisma.Decimal;
}

function toDate(v: Date | string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return v instanceof Date ? v : new Date(v);
}

/** Pretty user name for activity descriptions; falls back to id. */
async function userLabel(tx: Prisma.TransactionClient, userId: string | null | undefined): Promise<string> {
  if (!userId) return 'system';
  const u = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name ?? userId;
}

/** Write a ContactActivity row inside an existing transaction. */
async function logActivity(
  tx: Prisma.TransactionClient,
  args: {
    contact_id: string;
    type: ContactActivityType;
    description: string;
    metadata?: Record<string, unknown> | null;
    performed_by_id?: string | null;
  },
) {
  await tx.contactActivity.create({
    data: {
      contact_id:      args.contact_id,
      type:            args.type,
      description:     args.description,
      metadata:        (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      performed_by_id: args.performed_by_id ?? null,
    },
  });
}

// ─── Workflow engine ─────────────────────────────────────────────────────────

/** Run all active on_create workflows for a newly-created contact (fire-and-forget). */
async function executeContactWorkflows(contactId: string): Promise<void> {
  try {
    const workflows = await prisma.crmWorkflow.findMany({
      where: { module: 'contacts', trigger: 'on_create', is_active: true },
    });

    for (const wf of workflows) {
      const actions = wf.actions as unknown as Array<{
        type: string;
        strategy: 'round_robin' | 'weighted' | 'team';
        team_name?: string;
        users: Array<{ user_id: string; name: string; weight?: number }>;
      }>;

      for (const action of actions) {
        if (action.type !== 'assign_user') continue;

        const users = action.users ?? [];
        if (users.length === 0) continue;

        let assignedUserId: string | null = null;

        if (action.strategy === 'round_robin' || action.strategy === 'team') {
          const conditions = (wf.conditions as { rr_index?: number; source_filter?: string } | null) ?? {};
          const idx = (conditions.rr_index ?? 0) % users.length;
          assignedUserId = users[idx].user_id;
          await prisma.crmWorkflow.update({
            where: { id: wf.id },
            data: { conditions: { ...conditions, rr_index: idx + 1 } as Prisma.InputJsonValue },
          });
        } else if (action.strategy === 'weighted') {
          const total = users.reduce((s, u) => s + (u.weight ?? 0), 0);
          if (total > 0) {
            let rand = Math.random() * total;
            for (const u of users) {
              rand -= (u.weight ?? 0);
              if (rand <= 0) { assignedUserId = u.user_id; break; }
            }
            assignedUserId = assignedUserId ?? users[0].user_id;
          }
        }

        if (assignedUserId) {
          await prisma.crmContact.update({
            where: { id: contactId },
            data: { assigned_to_id: assignedUserId },
          });
          await prisma.contactActivity.create({
            data: {
              contact_id:      contactId,
              type:            'ASSIGNMENT_CHANGE',
              description:     `Auto-assigned via workflow "${wf.name}"`,
              metadata:        { workflow_id: wf.id, user_id: assignedUserId } as Prisma.InputJsonValue,
              performed_by_id: null,
            },
          });
        }
      }
    }
  } catch (e) {
    console.error('[workflow] executeContactWorkflows failed:', e);
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createContact(
  input: ContactCreateInput,
  actorId: string | null,
): Promise<CrmContact> {
  // Phone-uniqueness pre-check so we can return a typed error instead of a P2002 explosion.
  const existing = await prisma.crmContact.findUnique({ where: { phone: input.phone }, select: { id: true } });
  if (existing) throw new DuplicatePhoneError(input.phone);

  const isConverted = input.lead_stage === 'CONVERTED';

  const createdContact = await prisma.$transaction(async (tx) => {
    const contact = await tx.crmContact.create({
      data: {
        name:                   input.name,
        phone:                  input.phone,
        email:                  input.email ?? null,
        city:                   input.city ?? null,

        interested_destination: input.interested_destination ?? null,
        number_of_travellers:   input.number_of_travellers ?? null,
        trip_type:              input.trip_type ?? null,
        special_requirements:   input.special_requirements ?? null,
        budget_per_person:      toDecimal(input.budget_per_person) ?? null,

        lead_source:            input.lead_source ?? null,
        platform:               input.platform ?? null,
        campaign_name:          input.campaign_name ?? null,
        ad_set_name:            input.ad_set_name ?? null,
        ad_name:                input.ad_name ?? null,
        other_ad_details:       (input.other_ad_details ?? undefined) as Prisma.InputJsonValue | undefined,
        device_platform:        input.device_platform ?? null,
        facebook_click_id:      input.facebook_click_id ?? null,
        facebook_browser_id:    input.facebook_browser_id ?? null,
        google_click_id:        input.google_click_id ?? null,
        platform_lead_id:       input.platform_lead_id ?? null,
        gallabox_contact_id:    input.gallabox_contact_id ?? null,

        lead_stage:             input.lead_stage ?? 'NEW',
        assigned_to_id:         input.assigned_to_id ?? null,
        follow_up_date:         toDate(input.follow_up_date) ?? null,

        // Conversion automation on create
        is_converted:           isConverted,
        converted_at:           isConverted ? new Date() : null,
        closed_date:            isConverted ? new Date() : null,
        booking_value:          toDecimal(input.booking_value) ?? null,

        tags:                   input.tags ?? [],
        do_not_contact:         input.do_not_contact ?? false,
        notes:                  input.notes ?? null,
        source:                 input.source ?? null,
        custom_fields:          (input.custom_fields ?? undefined) as Prisma.InputJsonValue | undefined,

        owner_id:               input.owner_id,
      },
    });

    // Activity: LEAD_CREATED — mention the lead_source if any so the timeline reads naturally.
    const srcLabel = input.lead_source
      ? input.lead_source.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'manual entry';
    await logActivity(tx, {
      contact_id:      contact.id,
      type:            'LEAD_CREATED',
      description:     `Lead created from ${srcLabel}`,
      metadata:        { lead_source: input.lead_source ?? null, lead_stage: contact.lead_stage },
      performed_by_id: actorId,
    });

    // Activity: ASSIGNMENT_CHANGE — only if the contact was created already assigned.
    if (contact.assigned_to_id) {
      const who = await userLabel(tx, contact.assigned_to_id);
      await logActivity(tx, {
        contact_id:      contact.id,
        type:            'ASSIGNMENT_CHANGE',
        description:     `Assigned to ${who}`,
        metadata:        { from: null, to: contact.assigned_to_id },
        performed_by_id: actorId,
      });
    }

    // Activity: STAGE_CHANGE — only if the contact was created already CONVERTED
    // (i.e. an unusual case worth surfacing on the timeline).
    if (isConverted) {
      await logActivity(tx, {
        contact_id:      contact.id,
        type:            'STAGE_CHANGE',
        description:     `Stage set to Converted on creation`,
        metadata:        { from: null, to: 'CONVERTED' },
        performed_by_id: actorId,
      });
    }

    return contact;
  });

  // Run active on_create workflows after the transaction commits (non-blocking).
  void executeContactWorkflows(createdContact.id);

  return createdContact;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateContact(
  id: string,
  patch: ContactUpdateInput,
  actorId: string | null,
): Promise<CrmContact> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.crmContact.findUnique({ where: { id } });
    if (!before || before.deleted_at) throw new ContactNotFoundError(id);

    // Phone-uniqueness check if changing.
    if (patch.phone && patch.phone !== before.phone) {
      const clash = await tx.crmContact.findUnique({ where: { phone: patch.phone }, select: { id: true } });
      if (clash && clash.id !== id) throw new DuplicatePhoneError(patch.phone);
    }

    // Conversion automation — derive transitions from the explicit patch only.
    // (If lead_stage isn't being touched, we leave is_converted / closed_date alone.)
    const stageChanging = patch.lead_stage !== undefined && patch.lead_stage !== before.lead_stage;
    const becomingConverted = stageChanging && patch.lead_stage === 'CONVERTED';
    const leavingConverted  = stageChanging && before.lead_stage === 'CONVERTED' && patch.lead_stage !== 'CONVERTED';

    // Assignment change detection.
    const assignmentChanging =
      patch.assigned_to_id !== undefined && patch.assigned_to_id !== before.assigned_to_id;

    // Build the Prisma update payload — only set fields that were actually in the patch
    // so we don't accidentally null-out untouched columns.
    const data: Prisma.CrmContactUpdateInput = {};

    if (patch.name                  !== undefined) data.name = patch.name;
    if (patch.phone                 !== undefined) data.phone = patch.phone;
    if (patch.email                 !== undefined) data.email = patch.email;
    if (patch.city                  !== undefined) data.city = patch.city;

    if (patch.interested_destination !== undefined) data.interested_destination = patch.interested_destination;
    if (patch.number_of_travellers   !== undefined) data.number_of_travellers   = patch.number_of_travellers;
    if (patch.trip_type              !== undefined) data.trip_type              = patch.trip_type;
    if (patch.special_requirements   !== undefined) data.special_requirements   = patch.special_requirements;
    if (patch.budget_per_person      !== undefined) data.budget_per_person      = toDecimal(patch.budget_per_person);

    if (patch.lead_source         !== undefined) data.lead_source         = patch.lead_source;
    if (patch.platform            !== undefined) data.platform            = patch.platform;
    if (patch.campaign_name       !== undefined) data.campaign_name       = patch.campaign_name;
    if (patch.ad_set_name         !== undefined) data.ad_set_name         = patch.ad_set_name;
    if (patch.ad_name             !== undefined) data.ad_name             = patch.ad_name;
    if (patch.other_ad_details    !== undefined) data.other_ad_details    = jsonOrNull(patch.other_ad_details);
    if (patch.device_platform     !== undefined) data.device_platform     = patch.device_platform;
    if (patch.facebook_click_id   !== undefined) data.facebook_click_id   = patch.facebook_click_id;
    if (patch.facebook_browser_id !== undefined) data.facebook_browser_id = patch.facebook_browser_id;
    if (patch.google_click_id     !== undefined) data.google_click_id     = patch.google_click_id;
    if (patch.platform_lead_id    !== undefined) data.platform_lead_id    = patch.platform_lead_id;
    if (patch.gallabox_contact_id !== undefined) data.gallabox_contact_id = patch.gallabox_contact_id;

    if (patch.lead_stage     !== undefined) data.lead_stage     = patch.lead_stage;
    if (patch.assigned_to_id !== undefined) {
      data.assigned_to = patch.assigned_to_id
        ? { connect: { id: patch.assigned_to_id } }
        : { disconnect: true };
    }
    if (patch.follow_up_date !== undefined) data.follow_up_date = toDate(patch.follow_up_date);
    if (patch.booking_value  !== undefined) data.booking_value  = toDecimal(patch.booking_value);

    if (patch.tags           !== undefined) data.tags           = patch.tags;
    if (patch.do_not_contact !== undefined) data.do_not_contact = patch.do_not_contact;
    if (patch.notes          !== undefined) data.notes          = patch.notes;
    if (patch.source         !== undefined) data.source         = patch.source;
    if (patch.custom_fields  !== undefined) data.custom_fields  = jsonOrNull(patch.custom_fields);

    // Conversion side-effects
    if (becomingConverted) {
      const now = new Date();
      data.is_converted = true;
      data.converted_at = before.converted_at ?? now;
      data.closed_date  = now;
    } else if (leavingConverted) {
      data.is_converted = false;
      data.closed_date  = null;
      // converted_at intentionally retained as a historical marker
    }

    const updated = await tx.crmContact.update({ where: { id }, data });

    // ── Activity log ─────────────────────────────────────────────────────────
    if (stageChanging) {
      await logActivity(tx, {
        contact_id:      id,
        type:            'STAGE_CHANGE',
        description:     `Stage changed from ${before.lead_stage} to ${updated.lead_stage}`,
        metadata:        { from: before.lead_stage, to: updated.lead_stage },
        performed_by_id: actorId,
      });
    }
    if (assignmentChanging) {
      const fromWho = await userLabel(tx, before.assigned_to_id);
      const toWho   = await userLabel(tx, updated.assigned_to_id);
      await logActivity(tx, {
        contact_id:      id,
        type:            'ASSIGNMENT_CHANGE',
        description:     updated.assigned_to_id
          ? (before.assigned_to_id ? `Reassigned from ${fromWho} to ${toWho}` : `Assigned to ${toWho}`)
          : `Unassigned from ${fromWho}`,
        metadata:        { from: before.assigned_to_id, to: updated.assigned_to_id },
        performed_by_id: actorId,
      });
    }

    return updated;
  });
}

// ─── Soft delete ─────────────────────────────────────────────────────────────

export async function softDeleteContact(id: string, actorId: string | null): Promise<CrmContact> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.crmContact.findUnique({ where: { id } });
    if (!before || before.deleted_at) throw new ContactNotFoundError(id);

    const updated = await tx.crmContact.update({
      where: { id },
      data:  { deleted_at: new Date() },
    });

    await logActivity(tx, {
      contact_id:      id,
      type:            'CONTACT_DELETED',
      description:     `Contact soft-deleted`,
      metadata:        { name: before.name, phone: before.phone },
      performed_by_id: actorId,
    });

    return updated;
  });
}

// ─── Gallabox CTWA upsert ────────────────────────────────────────────────────

/**
 * Upsert a contact from a Gallabox CTWA webhook payload. If a contact with the
 * incoming phone already exists, we update only fields the webhook actually
 * provides — never overwrite values an agent has manually entered with empty
 * webhook data.
 */
export async function upsertContactFromGallabox(payload: {
  name?: string | null;
  phone: string;
  email?: string | null;
  gallabox_contact_id?: string | null;
  campaign_name?: string | null;
  ad_set_name?: string | null;
  ad_name?: string | null;
  facebook_click_id?: string | null;
  facebook_browser_id?: string | null;
  other_ad_details?: Record<string, unknown> | null;
  created_at?: Date | string | null;
  // The Gallabox webhook is anonymous; we attribute creates to the system user
  // (passed in by the route handler).
  system_owner_id: string;
}): Promise<{ contact: CrmContact; created: boolean }> {
  const phone = payload.phone;
  const existing = await prisma.crmContact.findUnique({ where: { phone } });

  if (!existing) {
    const contact = await createContact(
      {
        name:                payload.name?.trim() || 'CTWA Lead',
        phone,
        email:               payload.email ?? null,
        lead_source:         'CTWA',
        platform:            'WHATSAPP',
        gallabox_contact_id: payload.gallabox_contact_id ?? null,
        campaign_name:       payload.campaign_name ?? null,
        ad_set_name:         payload.ad_set_name ?? null,
        ad_name:             payload.ad_name ?? null,
        facebook_click_id:   payload.facebook_click_id ?? null,
        facebook_browser_id: payload.facebook_browser_id ?? null,
        other_ad_details:    payload.other_ad_details ?? null,
        owner_id:            payload.system_owner_id,
      },
      null,
    );
    return { contact, created: true };
  }

  // Existing contact — only fill blank fields from the webhook (never clobber).
  const patch: ContactUpdateInput = {};
  if (!existing.gallabox_contact_id && payload.gallabox_contact_id) patch.gallabox_contact_id = payload.gallabox_contact_id;
  if (!existing.campaign_name        && payload.campaign_name)        patch.campaign_name        = payload.campaign_name;
  if (!existing.ad_set_name          && payload.ad_set_name)          patch.ad_set_name          = payload.ad_set_name;
  if (!existing.ad_name              && payload.ad_name)              patch.ad_name              = payload.ad_name;
  if (!existing.facebook_click_id    && payload.facebook_click_id)    patch.facebook_click_id    = payload.facebook_click_id;
  if (!existing.facebook_browser_id  && payload.facebook_browser_id)  patch.facebook_browser_id  = payload.facebook_browser_id;
  if (!existing.email                && payload.email)                patch.email                = payload.email;
  if (!existing.lead_source)                                          patch.lead_source          = 'CTWA';
  if (!existing.platform)                                             patch.platform             = 'WHATSAPP';

  const contact = Object.keys(patch).length > 0
    ? await updateContact(existing.id, patch, null)
    : existing;

  return { contact, created: false };
}
