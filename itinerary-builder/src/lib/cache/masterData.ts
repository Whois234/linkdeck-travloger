import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';

// 10-minute TTL for all master data — these change rarely (manual admin edits)
const TTL = 600;

export const getCachedStates = unstable_cache(
  async (activeOnly = true) =>
    prisma.state.findMany({
      where: activeOnly ? { status: true } : undefined,
      orderBy: { name: 'asc' },
    }),
  ['master-states'],
  { revalidate: TTL, tags: ['master-states'] },
);

export const getCachedDestinations = unstable_cache(
  async (stateId?: string) =>
    prisma.destination.findMany({
      where: { status: true, ...(stateId ? { state_id: stateId } : {}) },
      include: { state: { select: { name: true, code: true } } },
      orderBy: { name: 'asc' },
    }),
  ['master-destinations'],
  { revalidate: TTL, tags: ['master-destinations'] },
);

export const getCachedMealPlans = unstable_cache(
  async () =>
    prisma.mealPlan.findMany({ where: { status: true }, orderBy: { code: 'asc' } }),
  ['master-meal-plans'],
  { revalidate: TTL, tags: ['master-meal-plans'] },
);

export const getCachedVehicleTypes = unstable_cache(
  async () =>
    prisma.vehicleType.findMany({ where: { status: true }, orderBy: { capacity: 'asc' } }),
  ['master-vehicle-types'],
  { revalidate: TTL, tags: ['master-vehicle-types'] },
);

export const getCachedPolicies = unstable_cache(
  async (stateId?: string) =>
    prisma.policy.findMany({
      where: {
        status: true,
        ...(stateId ? { OR: [{ state_id: stateId }, { state_id: null }] } : {}),
      },
      orderBy: [{ policy_type: 'asc' }],
    }),
  ['master-policies'],
  { revalidate: TTL, tags: ['master-policies'] },
);
