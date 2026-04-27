import { prisma } from '@/lib/prisma';

export async function generateQuoteNumber(state_id: string): Promise<string> {
  const year = new Date().getFullYear();

  const state = await prisma.state.findUnique({ where: { id: state_id }, select: { code: true } });
  if (!state) throw new Error(`State ${state_id} not found`);

  // Use a transaction + update to avoid race conditions
  const seq = await prisma.$transaction(async (tx) => {
    const existing = await tx.quoteSequence.findUnique({
      where: { state_id_year: { state_id, year } },
    });

    if (existing) {
      return tx.quoteSequence.update({
        where: { state_id_year: { state_id, year } },
        data: { last_number: { increment: 1 } },
      });
    } else {
      return tx.quoteSequence.create({
        data: { state_id, year, last_number: 1 },
      });
    }
  });

  const paddedNumber = String(seq.last_number).padStart(4, '0');
  return `TRV-${year}-${state.code}-${paddedNumber}`;
}
