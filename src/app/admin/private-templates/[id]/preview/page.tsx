import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ItineraryClient } from '@/app/itinerary/[token]/ItineraryClient';

export const dynamic = 'force-dynamic';

export default async function PrivateTemplatePreviewPage({ params }: { params: { id: string } }) {
  const tpl = await prisma.privateTemplate.findUnique({
    where: { id: params.id },
    include: {
      state: true,
      template_days: { orderBy: { sort_order: 'asc' } },
      template_hotel_tiers: { orderBy: [{ tier_name: 'asc' }, { sort_order: 'asc' }] },
    },
  });

  if (!tpl) return notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cms = (tpl.cms_data ?? {}) as Record<string, any>;

  /* ── Resolve destinations ── */
  const rawCards = (cms.destination_cards ?? []) as Array<{
    destination_id: string; custom_name?: string | null;
    description?: string; image_url?: string; hidden?: boolean;
  }>;
  const destIds = rawCards
    .filter(dc => dc.destination_id && !dc.destination_id.startsWith('custom_'))
    .map(dc => dc.destination_id);
  const dbDests = destIds.length
    ? await prisma.destination.findMany({ where: { id: { in: destIds } }, select: { id: true, name: true, hero_image: true } })
    : [];
  const destsMap = Object.fromEntries(dbDests.map(d => [d.id, d]));

  /* ── Day snapshots ── */
  const daySnapshots = tpl.template_days.map((d, i) => ({
    day_number: i + 1,
    date: '',
    destination_id: d.destination_id ?? '',
    destination_name: destsMap[d.destination_id ?? '']?.name ?? null,
    destination_hero_image: null,
    title: d.title,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    description: (d as any).description_override ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    image_url: (d as any).image_override ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gallery_images: (d as any).gallery_images ?? null,
    tags: null,
    transfers: null,
  }));

  /* ── Destination cards ── */
  const destinationCards = rawCards
    .filter(dc => dc.destination_id && !dc.hidden)
    .map(dc => ({
      destination_id: dc.destination_id,
      name: dc.custom_name?.trim() || destsMap[dc.destination_id]?.name || dc.destination_id,
      description: dc.description?.trim() ?? '',
      image_url: dc.image_url?.trim() || destsMap[dc.destination_id]?.hero_image || '',
    }))
    .filter(dc => dc.name);

  /* ── Why Choose ── */
  const rawWhy = (cms.why_choose ?? []) as Array<string | { title?: string; description?: string; icon?: string }>;
  const whyChoose = rawWhy
    .map(w => typeof w === 'string'
      ? { title: w, description: '', icon: 'star' }
      : { title: w.title ?? '', description: w.description ?? '', icon: w.icon ?? 'star' })
    .filter(w => w.title.trim());

  /* ── Inclusions / Exclusions ── */
  const inclusions = ((cms.inclusions ?? []) as string[]).filter(Boolean).map((text, i) => ({ id: String(i), text }));
  const exclusions = ((cms.exclusions ?? []) as string[]).filter(Boolean).map((text, i) => ({ id: String(i), text }));

  /* ── Hero image ── */
  const heroImages = (cms.hero_images ?? []) as string[];
  const stateHero = cms.state_gallery_hidden === true
    ? null
    : ((cms.state_gallery_image as string | undefined) ||
       tpl.hero_image ||
       heroImages[0] ||
       tpl.state.hero_image ||
       null);

  /* ── Build mock ItineraryData ── */
  const data = {
    selected_option_id: null,
    quote: {
      quote_number:     'PREVIEW',
      quote_name:       tpl.template_name,
      quote_type:       'PRIVATE',
      group_template_id: null,
      adults:           2,
      children_5_12:    0,
      children_below_5: 0,
      infants:          0,
      start_date:       '',
      end_date:         '',
      duration_days:    tpl.duration_days,
      duration_nights:  tpl.duration_nights,
      pickup_point:     tpl.start_city ?? null,
      drop_point:       tpl.end_city ?? null,
      expiry_date:      null,
      discount_amount:  null,
      discount_expires_at: null,
    },
    customer: { name: 'Preview Customer' },
    agent: null,
    state: {
      name:        tpl.state.name,
      custom_name: (cms.state_gallery_custom_name as string | undefined) ?? null,
      description: tpl.state.description ?? null,
      hero_image:  stateHero,
      hero_images: heroImages.length > 1 ? heroImages : null,
    },
    // Private templates use quote_options — show one mock option per hotel tier with pricing hidden
    quote_options: tpl.template_hotel_tiers.length > 0
      ? [{
          id: 'preview-option',
          label: tpl.template_hotel_tiers[0]?.tier_name ?? 'Standard',
          total_amount: 0,
          gst_amount: 0,
          hotels: [],
          vehicle_type_name: null,
          vehicle_cost: 0,
          option_hotels: [],
          customer_visible_notes: null,
        }]
      : [],
    group_package_options: undefined,
    group_pricing_mode: undefined,
    group_trip_dates: undefined,
    day_snapshots: daySnapshots,
    destination_cards: destinationCards.length > 0 ? destinationCards : null,
    why_choose: whyChoose.length > 0 ? whyChoose : null,
    inclusions,
    exclusions,
    policies: [],
  };

  return (
    <div className="relative">
      {/* Preview banner */}
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between px-5 py-2.5 text-sm font-semibold text-white"
        style={{ background: '#134956' }}>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-white/20">PREVIEW</span>
          <span>{tpl.template_name}</span>
          <span className="opacity-60 font-normal">· Pricing is hidden in preview mode</span>
        </div>
        <a href={`/admin/private-templates/${tpl.id}/edit`}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 transition-colors">
          ← Back to Editor
        </a>
      </div>
      <div style={{ paddingTop: 44 }}>
        <ItineraryClient
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={data as any}
          token="preview"
        />
      </div>
    </div>
  );
}
