'use client';
import { useState, useEffect } from 'react';
import './itinerary.css';

/* ─────────────────────────── Types ─────────────────────────── */
interface OptionHotel {
  destination_id: string;
  destination: { name: string } | null;
  hotel: { hotel_name: string; category_label?: string | null; star_rating?: number | null } | null;
  room_category: { room_category_name: string } | null;
  meal_plan: { code: string; name: string } | null;
  check_in_date: string;
  check_out_date: string;
  nights: number;
}

interface QuoteOption {
  id: string;
  option_name: string;
  display_order: number;
  is_most_popular: boolean;
  final_price: number;
  price_per_adult_display: number;
  selling_before_gst: number;
  gst_percent: number;
  gst_amount: number;
  option_hotels: OptionHotel[];
  customer_visible_notes?: string | null;
}

interface DaySnapshot {
  day_number: number;
  date: string;
  destination_id: string;
  destination_name?: string | null;
  destination_hero_image?: string | null;
  title: string;
  description?: string | null;
  image_url?: string | null;
  gallery_images?: string[] | null;
  tags?: string[] | null;
  transfers?: { note?: string } | null;
}

interface PolicyRecord {
  id: string;
  policy_type: 'PAYMENT' | 'CANCELLATION' | 'FAQ' | 'TERMS' | 'IMPORTANT_NOTE';
  title: string;
  content: string;
}

interface GroupBatch {
  id: string;
  batch_name: string;
  start_date: string;
  end_date: string;
  total_seats: number;
  available_seats: number;
  adult_price: number;
  child_5_12_price: number;
  child_below_5_price: number;
  single_supplement: number | null;
  gst_percent: number;
  booking_status: 'OPEN' | 'FILLING_FAST' | 'SOLD_OUT' | 'CLOSED' | 'CANCELLED';
  badge_text: string | null;
  badge_color: string | null;
}

interface GroupPackageOption {
  tier_name: string;
  is_most_popular: boolean;
  inclusions: string[];
  adult_price: number;
  child_price: number;
}

interface ItineraryData {
  selected_option_id?: string | null;
  quote: {
    quote_number: string;
    quote_name?: string | null;
    quote_type?: string | null;
    group_template_id?: string | null;
    adults: number;
    children_5_12?: number;
    children_below_5?: number;
    infants?: number;
    start_date: string;
    end_date: string;
    duration_days: number;
    duration_nights: number;
    pickup_point?: string | null;
    drop_point?: string | null;
    expiry_date?: string | null;
  };
  customer: { name: string };
  agent?: {
    name: string;
    designation?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    photo?: string | null;
    rating?: number | null;
    years_experience?: number | null;
    speciality?: string | null;
    available_hours?: string | null;
  } | null;
  state: { name: string; description?: string | null; hero_image?: string | null; hero_images?: string[] | null };
  quote_options: QuoteOption[];
  group_package_options?: GroupPackageOption[];
  day_snapshots: DaySnapshot[];
  inclusions: Array<{ id: string; text: string }>;
  exclusions: Array<{ id: string; text: string }>;
  policies: PolicyRecord[];
}

interface Props { data: ItineraryData; token: string; }

/* ─────────────────────────── Helpers ─────────────────────────── */
const T = '#134956';

function fmtCurrency(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShortDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function buildWaUrl(agent: ItineraryData['agent'], quoteNum: string, customerName: string, stateName: string): string {
  const phone = (agent?.whatsapp ?? agent?.phone ?? '').replace(/\D/g, '');
  const waPhone = phone.startsWith('91') ? phone : `91${phone}`;
  const msg = encodeURIComponent(
    `Hi! I'm ${customerName}. I just reviewed the ${stateName} itinerary (Ref: ${quoteNum}) and I'm ready to discuss booking. Please help me proceed.`
  );
  return `https://wa.me/${waPhone || '918328046859'}?text=${msg}`;
}

/* ─────────────────────────── SVGs ─────────────────────────── */
function WASvg({ size = 20, color = 'white' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ChevronDown({ open, color = '#aaa' }: { open?: boolean; color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s', flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ─────────────────────────── Nav ─────────────────────────── */
function Nav({ quoteNum, pkgName }: { quoteNum: string; pkgName?: string }) {
  return (
    <nav className="tl-nav">
      <div className="tl-nav-logo-wrap">
        <a href="https://travloger.in/" target="_blank" rel="noopener noreferrer" className="tl-nav-logo-pill" style={{ textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/travloger-logo-white.png" alt="Travloger" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </a>
      </div>
      <div className="tl-nav-right">
        <span className="tl-nav-pill">#{quoteNum}</span>
        {pkgName && <span className="tl-nav-pill pkg">{pkgName}</span>}
      </div>
    </nav>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */
function Hero({ data }: { data: ItineraryData }) {
  const { quote, customer, state, day_snapshots } = data;

  // Build ordered list of unique destination names from day snapshots
  const destNames: string[] = [];
  day_snapshots.forEach((d) => {
    if (d.destination_name && !destNames.includes(d.destination_name)) {
      destNames.push(d.destination_name);
    }
  });

  const startFmt = fmtShortDate(quote.start_date);
  const endFmt = fmtShortDate(quote.end_date);
  const dateRange = `${startFmt} – ${endFmt}`;

  // Hero title priority: quote_name > state.name
  const heroTitle = quote.quote_name?.trim() || state.name;
  // Sub-line: destination list if available, else state description
  const heroSub = destNames.length > 1
    ? destNames.join(' · ')
    : (state.description ?? null);

  // Slideshow: use hero_images if multiple, else fall back to single hero_image
  const slides = (state.hero_images && state.hero_images.length > 1)
    ? state.hero_images
    : (state.hero_image ? [state.hero_image] : []);

  const [activeSlide, setActiveSlide] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setActiveSlide(i => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <div className="tl-hero" data-section="hero">
      {/* Slideshow layers */}
      {slides.map((src, idx) => (
        <img
          key={src}
          src={src}
          alt={heroTitle}
          className="tl-hero-bg-img tl-hero-slide"
          loading={idx === 0 ? 'eager' : 'lazy'}
          style={{ opacity: idx === activeSlide ? 0.40 : 0, transition: 'opacity 1.2s ease-in-out', zIndex: idx === activeSlide ? 1 : 0 }}
        />
      ))}
      {/* Slide dots */}
      {slides.length > 1 && (
        <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 5 }}>
          {slides.map((_, idx) => (
            <button key={idx} onClick={() => setActiveSlide(idx)} style={{
              width: idx === activeSlide ? 20 : 6, height: 6, borderRadius: 3,
              background: idx === activeSlide ? 'white' : 'rgba(255,255,255,0.4)',
              border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', padding: 0,
            }} />
          ))}
        </div>
      )}
      <div className="tl-hero-noise" />
      <div className="tl-hero-overlay" />

      {/* Palm silhouette */}
      <svg style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.06, pointerEvents: 'none', height: '70%', width: 'auto' }}
        viewBox="0 0 200 400" fill="white" preserveAspectRatio="xMaxYMax meet">
        <ellipse cx="100" cy="80" rx="20" ry="72" transform="rotate(-14 100 80)" />
        <ellipse cx="100" cy="80" rx="20" ry="72" transform="rotate(14 100 80)" />
        <ellipse cx="65" cy="110" rx="17" ry="60" transform="rotate(-38 65 110)" />
        <ellipse cx="135" cy="110" rx="17" ry="60" transform="rotate(38 135 110)" />
        <ellipse cx="45" cy="130" rx="14" ry="50" transform="rotate(-58 45 130)" />
        <rect x="96" y="140" width="9" height="250" rx="4.5" />
      </svg>

      <div className="tl-hero-body">
        <div className="tl-hero-eyebrow">Travloger Exclusive Itinerary</div>
        <div className="tl-hero-title">{heroTitle}</div>
        {heroSub && <div className="tl-hero-sub">{heroSub}</div>}
        {quote.pickup_point && (
          <div className="tl-hero-dest">Ex-{quote.pickup_point}</div>
        )}
        <div className="tl-hero-chips">
          <span className="tl-hero-chip">{customer.name}</span>
          {quote.adults > 0 && (
            <span className="tl-hero-chip">
              {quote.adults} Adult{quote.adults > 1 ? 's' : ''}
              {(quote.children_5_12 ?? 0) > 0 ? ` + ${quote.children_5_12} Child${(quote.children_5_12 ?? 0) > 1 ? 'ren' : ''}` : ''}
              {(quote.children_below_5 ?? 0) > 0 ? ` + ${quote.children_below_5} Infant${(quote.children_below_5 ?? 0) > 1 ? 's' : ''}` : ''}
            </span>
          )}
          <span className="tl-hero-chip">{dateRange}</span>
          <span className="tl-hero-chip">{quote.duration_days} Days · {quote.duration_nights} Nights</span>
          {quote.pickup_point && <span className="tl-hero-chip">✈ {quote.pickup_point}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Strip ─────────────────────────── */
function Strip({ quote }: { quote: ItineraryData['quote'] }) {
  const expiry = quote.expiry_date ? fmtDate(quote.expiry_date) : null;
  return (
    <div className="tl-strip">
      {expiry ? (
        <>Quote valid until <strong>{expiry}</strong> · #{quote.quote_number}</>
      ) : (
        <>Quote Reference: <strong>#{quote.quote_number}</strong></>
      )}
    </div>
  );
}

/* ─────────────────────────── Gallery ─────────────────────────── */
function Gallery({ state, day_snapshots }: { state: ItineraryData['state']; day_snapshots: DaySnapshot[] }) {
  // Build gallery from day snapshot images + state hero
  const imgs: Array<{ url: string; label: string }> = [];

  if (state.hero_image) {
    imgs.push({ url: state.hero_image, label: state.name });
  }

  day_snapshots.forEach((d) => {
    if (d.image_url && imgs.length < 8) {
      imgs.push({ url: d.image_url, label: `Day ${d.day_number}` });
    }
  });

  // Fallback images if none provided
  if (imgs.length === 0) {
    [
      { url: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=600&auto=format&fit=crop&q=80', label: 'Destination' },
      { url: 'https://images.unsplash.com/photo-1593693411515-c20261bcad6e?w=600&auto=format&fit=crop&q=80', label: 'Experience' },
      { url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&auto=format&fit=crop&q=80', label: 'Adventure' },
    ].forEach((i) => imgs.push(i));
  }

  return (
    <div style={{ paddingTop: 8, paddingBottom: 8 }}>
      <div className="tl-gal-scroll">
        {imgs.map((img, i) => (
          <div key={i} className="tl-gal-item">
            <img src={img.url} alt={img.label} loading="lazy" />
            <div className="tl-gal-label">{img.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Packages ─────────────────────────── */
function Packages({
  options, selectedId, onSelect
}: {
  options: QuoteOption[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="tl-pkg-wrap" data-section="packages">
      <div style={{ padding: '0 18px', maxWidth: 680, margin: '0 auto 20px' }}>
        <div className="tl-sec-eyebrow">Choose Your Experience</div>
        <div className="tl-sec-h">Package Options</div>
        <div className="tl-sec-sub" style={{ marginBottom: 0 }}>
          Same journey — your comfort level, your choice.
        </div>
      </div>
      <div className="tl-pkg-scroll" style={options.length === 1 ? { justifyContent: 'center' } : undefined}>
        {options.map((opt) => {
          const isSel = selectedId === opt.id;
          // Group hotels by destination
          const byDest: Record<string, OptionHotel[]> = {};
          opt.option_hotels.forEach((oh) => {
            const name = oh.destination?.name ?? 'Destination';
            if (!byDest[name]) byDest[name] = [];
            byDest[name].push(oh);
          });

          return (
            <div key={opt.id} className={`tl-pkg-card${isSel ? ' sel' : ''}`} onClick={() => onSelect(opt.id)}>
              {opt.is_most_popular && <div className="tl-pkg-badge">Most Popular</div>}
              <div className={`tl-pkg-head${opt.is_most_popular ? ' pop' : ''}`}>
                <div className="tl-pkg-tier">{opt.option_name}</div>
                <div className="tl-pkg-price">{fmtCurrency(opt.price_per_adult_display)}</div>
                <div className="tl-pkg-per">per adult · all-inclusive</div>
              </div>
              <div className="tl-pkg-body">
                {Object.entries(byDest).map(([destName, hotels]) => (
                  <div key={destName}>
                    <div className="tl-pkg-dest-label">{destName}</div>
                    {hotels.map((oh, j) => (
                      <div key={j} className="tl-pkg-hotel">
                        <span className="tl-pkg-dot" />
                        {oh.hotel?.hotel_name ?? 'Hotel'}
                        {oh.meal_plan ? ` · ${oh.meal_plan.code}` : ''}
                        {oh.nights > 0 ? ` · ${oh.nights}N` : ''}
                      </div>
                    ))}
                  </div>
                ))}
                {opt.customer_visible_notes && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#777', lineHeight: 1.5, fontFamily: 'var(--f-body)' }}>
                    {opt.customer_visible_notes}
                  </div>
                )}
                <div className="tl-pkg-perks">
                  {opt.option_hotels.length > 0 && (
                    <>
                      <div className="tl-pkg-perk">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" /></svg>
                        {opt.option_hotels[0]?.hotel?.category_label ?? 'Quality'} Accommodation
                      </div>
                      <div className="tl-pkg-perk">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" /></svg>
                        AC Private Transfers
                      </div>
                    </>
                  )}
                  <div className="tl-pkg-perk">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" /></svg>
                    5% GST Included
                  </div>
                </div>
              </div>
              <button className="tl-pkg-btn" onClick={(e) => { e.stopPropagation(); onSelect(opt.id); }}>
                {isSel ? '✓ Selected' : `Select ${opt.option_name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Logos Marquee ─────────────────────────── */
const BRAND_LOGOS = [
  { name: 'Microsoft',    src: '/brand-logos/microsoft.png' },
  { name: 'Amazon',       src: '/brand-logos/amazon.png' },
  { name: 'Deloitte',     src: '/brand-logos/deloitte.png' },
  { name: 'Ather Energy', src: '/brand-logos/ather.png' },
  { name: 'Mercedes-Benz',src: '/brand-logos/mercedes.png' },
  { name: 'Honda',        src: '/brand-logos/honda.png' },
  { name: 'Sandoz',       src: '/brand-logos/sandoz.png' },
  { name: 'DBS Bank',     src: '/brand-logos/dbs.png' },
];

function LogoMarquee() {
  const doubled = [...BRAND_LOGOS, ...BRAND_LOGOS];
  return (
    <div className="tl-logos-sec">
      <div className="tl-logos-label">Trusted by leading organizations</div>
      <div className="tl-marquee-wrap">
        <div className="tl-marquee-track">
          {doubled.map((c, i) => (
            <div key={i} className="tl-logo-i" title={c.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.src}
                alt={c.name}
                style={{ maxHeight: 28, maxWidth: 90, objectFit: 'contain' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Day Description Renderer ─────────────────────────── */
/**
 * Smart renderer: if description has lines starting with "- " or "• ", render as a
 * bulleted list. Otherwise render as a paragraph (preserving line breaks).
 */
function DayDescription({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const isBullet = lines.every(l => /^[-•*]\s/.test(l));

  if (isBullet) {
    return (
      <ul style={{ margin: '0 0 8px', paddingLeft: 18, listStyleType: 'disc' }}>
        {lines.map((l, i) => (
          <li key={i} className="tl-day-desc" style={{ marginBottom: 4, padding: 0 }}>
            {l.replace(/^[-•*]\s+/, '')}
          </li>
        ))}
      </ul>
    );
  }

  // Mixed: some lines are bullets, others are prose — render line-by-line
  const hasSomeBullets = lines.some(l => /^[-•*]\s/.test(l));
  if (hasSomeBullets) {
    return (
      <div>
        {lines.map((l, i) => {
          if (/^[-•*]\s/.test(l)) {
            return (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                <span style={{ color: T, flexShrink: 0, marginTop: 1 }}>•</span>
                <span className="tl-day-desc" style={{ margin: 0 }}>{l.replace(/^[-•*]\s+/, '')}</span>
              </div>
            );
          }
          return <p key={i} className="tl-day-desc">{l}</p>;
        })}
      </div>
    );
  }

  return <p className="tl-day-desc">{text}</p>;
}

/* ─────────────────────────── Day Gallery ─────────────────────────── */
function DayGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', transition: 'transform 0.4s ease', transform: `translateX(-${active * 100}%)` }}>
        {images.map((src, i) => (
          <img key={i} src={src} alt={`${title} — ${i + 1}`} className="tl-day-img"
            style={{ minWidth: '100%', flexShrink: 0 }} loading="lazy" />
        ))}
      </div>
      {/* Prev / Next */}
      {active > 0 && (
        <button onClick={() => setActive(a => a - 1)} style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      )}
      {active < images.length - 1 && (
        <button onClick={() => setActive(a => a + 1)} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      )}
      {/* Dots */}
      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
        {images.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} style={{
            width: i === active ? 16 : 5, height: 5, borderRadius: 2.5,
            background: i === active ? 'white' : 'rgba(255,255,255,0.45)',
            border: 'none', cursor: 'pointer', transition: 'all 0.25s', padding: 0,
          }} />
        ))}
      </div>
      {/* Counter */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(0,0,0,0.45)', color: 'white', borderRadius: 20,
        padding: '3px 10px', fontSize: 10, fontWeight: 600, fontFamily: 'var(--f-body)',
      }}>{active + 1} / {images.length}</div>
    </div>
  );
}

/* ─────────────────────────── Day Cards ─────────────────────────── */
function DayCard({ day, open, onToggle }: { day: DaySnapshot; open: boolean; onToggle: () => void }) {
  return (
    <div className="tl-day-row">
      <div className="tl-day-spine">
        <div className="tl-day-num">
          <small>DAY</small>
          <b>{String(day.day_number).padStart(2, '0')}</b>
        </div>
        <div className="tl-day-line" />
      </div>
      <div className="tl-day-card">
        <div className="tl-day-top" onClick={onToggle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tl-day-meta">{fmtDate(day.date)}</div>
            <div className="tl-day-name">{day.title}</div>
          </div>
          <button className={`tl-day-toggle${open ? ' open' : ''}`}>
            <ChevronDown open={open} color={open ? 'white' : '#aaa'} />
          </button>
        </div>
        {open && (
          <>
            {/* Day image / gallery slideshow */}
            {(() => {
              const allImgs = [day.image_url, ...(day.gallery_images ?? [])].filter(Boolean) as string[];
              if (allImgs.length === 0) return null;
              if (allImgs.length === 1) return <img src={allImgs[0]} alt={day.title} className="tl-day-img" loading="lazy" />;
              return <DayGallery images={allImgs} title={day.title} />;
            })()}
            <div className="tl-day-body">
              {day.description && <DayDescription text={day.description} />}
              {Array.isArray(day.tags) && day.tags.length > 0 && (
                <div className="tl-tag-row">
                  {day.tags.map((tag, j) => <span key={j} className="tl-tag">{tag}</span>)}
                </div>
              )}
              {day.transfers?.note && (
                <div className="tl-day-note">📍 {day.transfers.note}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ItinerarySection({ days }: { days: DaySnapshot[] }) {
  const [openDay, setOpenDay] = useState<number>(0); // first day open by default
  if (days.length === 0) return null;
  return (
    <div className="tl-sec" data-section="itinerary">
      <div className="tl-sec-eyebrow">Day by Day</div>
      <div className="tl-sec-h">Your Itinerary</div>
      <div className="tl-sec-sub">
        {days.length} days. Crafted just for you.
      </div>
      <div className="tl-day-list">
        {days.map((d, i) => (
          <DayCard
            key={d.day_number}
            day={d}
            open={openDay === i}
            onToggle={() => setOpenDay(openDay === i ? -1 : i)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Inclusions / Exclusions (Private) ─────────────────────────── */
function IncExc({ inclusions, exclusions }: { inclusions: ItineraryData['inclusions']; exclusions: ItineraryData['exclusions'] }) {
  if (inclusions.length === 0 && exclusions.length === 0) return null;
  return (
    <div style={{ background: 'white', borderTop: '1px solid var(--tl-border)' }} data-section="inclusions">
      <div className="tl-sec">
        <div className="tl-sec-eyebrow">Know Before You Go</div>
        <div className="tl-sec-h">What&apos;s Covered</div>
        {inclusions.length > 0 && (
          <div style={{ marginTop: 24, marginBottom: exclusions.length > 0 ? 20 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <span style={{ fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: 800, color: '#15803D' }}>
                Included in Your Package
              </span>
            </div>
            <IncExcList items={inclusions} isInclusion={true} />
          </div>
        )}
        {exclusions.length > 0 && (
          <div style={{ marginTop: inclusions.length > 0 ? 0 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </div>
              <span style={{ fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: 800, color: '#B91C1C' }}>
                Not Included
              </span>
            </div>
            <IncExcList items={exclusions} isInclusion={false} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Why Choose ─────────────────────────── */
const WHY_ITEMS = [
  { title: 'Expert Professionals', desc: 'Years of on-ground destination expertise — not call-centre agents.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { title: 'Best Prices', desc: 'High volume lets us negotiate deals individual travellers simply can\'t.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" /></svg> },
  { title: 'Quality Standards', desc: 'Every hotel & transfer vetted against strict quality benchmarks.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { title: '24×7 Monitoring', desc: 'Our team is on call around the clock — every step of the journey.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" strokeLinecap="round" /></svg> },
  { title: '95% Retention', desc: 'Once people travel with Travloger, they keep coming back.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" strokeLinecap="round" /></svg> },
  { title: 'On-ground Support', desc: 'A dedicated local coordinator at every destination — zero stress.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" /></svg> },
];

function WhyChoose() {
  return (
    <div className="tl-why-wrap">
      <div className="tl-sec">
        <div className="tl-sec-eyebrow">Why Us</div>
        <div className="tl-sec-h">Why Choose Travloger?</div>
        <div className="tl-sec-sub">Here&apos;s what makes us different from every other travel company.</div>
        <div className="tl-why-grid">
          {WHY_ITEMS.map((item, i) => (
            <div key={i} className="tl-why-card">
              <div className="tl-why-icon-wrap">{item.icon}</div>
              <div className="tl-why-title">{item.title}</div>
              <div className="tl-why-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Stats ─────────────────────────── */
function Stats() {
  const STATS = [
    { n: '15,000+', l: 'Happy Travellers' },
    { n: '4.8 ★',   l: 'Google Rating' },
    { n: '24 / 7',  l: 'Always On Support' },
  ];

  return (
    <div className="tl-stats-wrap">
      <svg className="tl-stats-leaf" style={{ right: -20, top: -10, width: 160, height: 200 }} viewBox="0 0 160 200" fill="white">
        <ellipse cx="80" cy="48" rx="16" ry="44" transform="rotate(-14 80 48)" />
        <ellipse cx="80" cy="48" rx="16" ry="44" transform="rotate(14 80 48)" />
        <ellipse cx="54" cy="65" rx="14" ry="38" transform="rotate(-36 54 65)" />
        <ellipse cx="106" cy="65" rx="14" ry="38" transform="rotate(36 106 65)" />
        <rect x="77" y="82" width="7" height="110" rx="3.5" />
      </svg>
      <svg className="tl-stats-leaf" style={{ left: -15, bottom: -10, width: 120, height: 160 }} viewBox="0 0 120 160" fill="white">
        <ellipse cx="60" cy="38" rx="12" ry="34" transform="rotate(10 60 38)" />
        <ellipse cx="60" cy="38" rx="12" ry="34" transform="rotate(-10 60 38)" />
        <ellipse cx="36" cy="52" rx="10" ry="28" transform="rotate(-30 36 52)" />
        <rect x="57" y="65" width="6" height="90" rx="3" />
      </svg>
      <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 32px' }}>
        <div style={{ fontFamily: 'var(--f-body)', fontSize: '9px', letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10, fontWeight: 600 }}>Our Track Record</div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>Numbers that speak for us</div>
      </div>
      <div className="tl-stats-grid">
        {STATS.map((s, i) => (
          <div key={i} className="tl-stat-card">
            <div className="tl-stat-n">{s.n}</div>
            <div className="tl-stat-l">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Fare Summary ─────────────────────────── */
function FareSummary({ option, adults }: { option: QuoteOption | undefined; adults: number }) {
  if (!option) return null;
  // Per-adult pre-GST so the math adds up: (perAdultPreGst × adults) = selling_before_gst
  const perAdultPreGst = adults > 0 ? option.selling_before_gst / adults : 0;
  const total = option.final_price;

  return (
    <div style={{ background: 'white', borderTop: '1px solid var(--tl-border)' }} data-section="hotels">
      <div className="tl-sec">
        <div className="tl-sec-eyebrow">Cost Breakdown</div>
        <div className="tl-sec-h">Fare Summary</div>
        <div className="tl-sec-sub">{adults} Adult{adults > 1 ? 's' : ''} · {option.option_name} Package</div>
        <div className="tl-fare-card">
          <div className="tl-fare-row">
            <span>Per Adult (before GST)</span>
            <span style={{ fontWeight: 700 }}>{fmtCurrency(perAdultPreGst)}</span>
          </div>
          <div className="tl-fare-row">
            <span>× {adults} Adult{adults > 1 ? 's' : ''}</span>
            <span style={{ fontWeight: 700 }}>{fmtCurrency(option.selling_before_gst)}</span>
          </div>
          <div className="tl-fare-row">
            <span>{option.gst_percent}% GST</span>
            <span>{fmtCurrency(option.gst_amount)}</span>
          </div>
          <div className="tl-fare-total">
            <div>
              <span className="tl-fare-total-label">Total Amount</span>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, fontFamily: 'var(--f-body)' }}>
                {fmtCurrency(option.price_per_adult_display)} per person · incl. GST
              </div>
            </div>
            <span className="tl-fare-total-val">{fmtCurrency(total)}</span>
          </div>
        </div>

        {/* Trust signals */}
        <div style={{ marginTop: 16, background: 'white', borderRadius: 16, border: '1px solid var(--tl-border)', padding: '4px 16px' }}>
          {[
            { icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" /></svg>, t: 'Secure Payments', d: '100% safe via Razorpay & direct bank transfer' },
            { icon: <WASvg size={17} color={T} />, t: '24/7 WhatsApp Support', d: 'Your agent reachable throughout the trip' },
            { icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2"><polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" strokeLinecap="round" strokeLinejoin="round" /></svg>, t: 'Free Cancellation', d: 'Full refund if cancelled 30+ days before departure' },
            { icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" /></svg>, t: '15,000+ Travellers', d: 'Verified happy travellers across India' },
          ].map((x, i) => (
            <div key={i} className="tl-trust-row">
              <div className="tl-trust-icon-wrap">{x.icon}</div>
              <div><strong>{x.t}</strong><span>{x.d}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Policies ─────────────────────────── */
/** Parse "Label: Value" lines into KV pairs; plain lines become label-only rows */
function PolicyKVTable({ content }: { content: string }) {
  const lines = content.split('\n').map(l => l.replace(/^[•\-]\s*/, '').trim()).filter(Boolean);
  return (
    <div className="tl-pol-kv-table">
      {lines.map((l, i) => {
        const sep = l.indexOf(':');
        if (sep > 0 && sep < l.length - 1) {
          const label = l.slice(0, sep).trim();
          const value = l.slice(sep + 1).trim();
          return (
            <div key={i} className="tl-pol-kv-row">
              <span className="tl-pol-kv-label">{label}</span>
              <span className="tl-pol-kv-value">{value}</span>
            </div>
          );
        }
        return (
          <div key={i} className="tl-pol-kv-row tl-pol-kv-full">
            <span className="tl-pol-kv-label">{l}</span>
          </div>
        );
      })}
    </div>
  );
}

function PolicyBullets({ content }: { content: string }) {
  const lines = content.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean);
  return (
    <ul className="tl-pol-bullets">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  );
}

/** Single FAQ accordion item — must be its own component so useState is called at top level */
function FaqItem({ faq }: { faq: PolicyRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-faq-item" style={{ marginBottom: 6 }}>
      <div className="tl-faq-head" onClick={() => setOpen(!open)}>
        <span>{faq.title}</span>
        <ChevronDown open={open} color={T} />
      </div>
      {open && <div className="tl-faq-body">{faq.content}</div>}
    </div>
  );
}

function Policies({ policies }: { policies: PolicyRecord[] }) {
  const [termsOpen, setTermsOpen] = useState(false);

  if (!policies || policies.length === 0) return null;

  const paymentPolicies  = policies.filter((p) => p.policy_type === 'PAYMENT');
  const cancelPolicies   = policies.filter((p) => p.policy_type === 'CANCELLATION');
  const importantNotes   = policies.filter((p) => p.policy_type === 'IMPORTANT_NOTE');
  const faqs             = policies.filter((p) => p.policy_type === 'FAQ');
  const terms            = policies.filter((p) => p.policy_type === 'TERMS');

  const cards = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
      ),
      label: 'Payment',
      color: T,
      policies: paymentPolicies,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
      label: 'Cancellation',
      color: '#c0392b',
      policies: cancelPolicies,
    },
  ].filter(c => c.policies.length > 0);

  return (
    <div className="tl-sec" style={{ paddingBottom: 0 }} data-section="policies">
      <div className="tl-sec-eyebrow">Good to Know</div>
      <div className="tl-sec-h" style={{ marginBottom: 6 }}>Policies</div>
      <div className="tl-sec-sub" style={{ marginBottom: 24 }}>Clear terms so there are no surprises</div>

      {/* Policy cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} className="tl-pol-block">
            <div className="tl-pol-block-head" style={{ color: c.color }}>
              <span style={{ color: c.color }}>{c.icon}</span>
              {c.label} Policy
            </div>
            {c.policies.map((p) => (
              <PolicyKVTable key={p.id} content={p.content} />
            ))}
          </div>
        ))}
      </div>

      {/* Important notes inline */}
      {importantNotes.length > 0 && (
        <div className="tl-pol-notes">
          <div className="tl-pol-notes-head">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Important Notes
          </div>
          {importantNotes.map((n) => (
            <PolicyBullets key={n.id} content={n.content} />
          ))}
        </div>
      )}

      {/* FAQs accordion */}
      {faqs.length > 0 && (
        <div style={{ marginBottom: 24 }} data-section="faqs">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 800, color: 'var(--tl-dark)', marginBottom: 14, marginTop: 8 }}>
            Frequently Asked Questions
          </div>
          {faqs.map((f) => <FaqItem key={f.id} faq={f} />)}
        </div>
      )}

      {/* Terms accordion */}
      {terms.length > 0 && (
        <div className="tl-terms-item" style={{ marginBottom: 40 }}>
          <div className="tl-terms-head" onClick={() => setTermsOpen(!termsOpen)}>
            <span>Terms &amp; Conditions</span>
            <ChevronDown open={termsOpen} color={T} />
          </div>
          {termsOpen && (
            <div className="tl-terms-body">
              {terms.map((t) =>
                t.content.split('\n')
                  .map(l => l.replace(/^[•\-*]\s*/, '').trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <div key={`${t.id}-${i}`} className="tl-terms-li">{line}</div>
                  ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Agent Section ─────────────────────────── */
function AgentSection({ agent, waUrl }: { agent: ItineraryData['agent']; waUrl: string }) {
  const name        = agent?.name        ?? 'Your Travel Expert';
  const designation = agent?.designation ?? 'Travel Consultant';
  const phone       = agent?.phone       ?? '';
  const email       = agent?.email       ?? '';
  const rating      = agent?.rating      ?? 4.9;

  const TRUST = [
    { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tl-warm)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: '24 / 7 Reachable', sub: 'Always available' },
    { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tl-warm)" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: 'Verified Expert', sub: 'Background checked' },
    { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tl-warm)" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>, label: 'Fast Replies', sub: 'Responds within 2 hrs' },
    { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tl-warm)" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>, label: 'Free Support', sub: 'End-to-end trip care' },
  ];

  return (
    <div className="tl-agent-wrap">
      {/* Decorative radial glow */}
      <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 300, height: 200, background: 'radial-gradient(ellipse at center, rgba(201,169,122,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Section header */}
      <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(201,169,122,0.12)', border: '1px solid rgba(201,169,122,0.3)', borderRadius: 20, padding: '6px 16px', marginBottom: 16, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--tl-warm)" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          <span style={{ fontFamily: 'var(--f-body)', fontSize: '9.5px', letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--tl-warm)', fontWeight: 700 }}>Your Dedicated Expert</span>
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(24px,6vw,32px)', fontWeight: 800, color: 'white', lineHeight: 1.1, marginBottom: 8, letterSpacing: '-0.5px' }}>
          Your trip, handled personally
        </div>
        <div style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'rgba(255,255,255,0.38)', maxWidth: 260, margin: '0 auto', lineHeight: 1.5 }}>
          One expert. One number. From booking to homecoming.
        </div>
      </div>

      <div className="tl-agent-card">
        {/* Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          {/* Avatar with ring */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
              border: '2px solid rgba(201,169,122,0.5)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
              boxShadow: '0 0 0 4px rgba(201,169,122,0.12), 0 8px 24px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {agent?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              )}
            </div>
            {/* Online indicator */}
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: '#22C55E', border: '2px solid rgba(13,51,64,0.9)', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.4px', marginBottom: 3 }}>{name}</div>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>{designation}</div>
            {/* Star rating */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(201,169,122,0.12)', border: '1px solid rgba(201,169,122,0.2)', borderRadius: 20, padding: '4px 10px' }}>
              {[1,2,3,4,5].map(s => (
                <svg key={s} width="10" height="10" viewBox="0 0 24 24" fill={s <= Math.round(rating) ? 'var(--tl-warm)' : 'rgba(255,255,255,0.15)'} stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              ))}
              <span style={{ fontFamily: 'var(--f-num)', fontSize: 11, fontWeight: 700, color: 'var(--tl-warm)', marginLeft: 2 }}>{rating.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Glass divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 18 }} />

        {/* Trust badges — premium glass pills */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {TRUST.map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 12, padding: '10px 12px',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(201,169,122,0.12)', border: '1px solid rgba(201,169,122,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {t.icon}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--f-body)', fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600, lineHeight: 1.2 }}>{t.label}</div>
                <div style={{ fontFamily: 'var(--f-body)', fontSize: 9.5, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Glass divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 18 }} />

        {/* Contacts */}
        {(phone || email) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tl-warm)" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.17a16 16 0 006.08 6.08l1.54-1.54a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--f-body)', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{phone}</div>
                  <div style={{ fontFamily: 'var(--f-body)', fontSize: 10.5, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Call or WhatsApp anytime</div>
                </div>
              </div>
            )}
            {email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tl-warm)" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--f-body)', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{email}</div>
                  <div style={{ fontFamily: 'var(--f-body)', fontSize: 10.5, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Replies within 2 hours</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WhatsApp CTA — premium glow button */}
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="tl-wa-cta" style={{ borderRadius: 16 }}>
          <WASvg size={20} color="white" />
          Chat with {name.split(' ')[0]} on WhatsApp
        </a>
      </div>
    </div>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */
function Footer({ quoteNum, expiryDate, waUrl }: { quoteNum: string; expiryDate?: string | null; waUrl: string }) {
  return (
    <footer className="tl-footer">
      {/* Logo */}
      <div style={{ marginBottom: 18 }}>
        <a href="https://travloger.in/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/travloger-logo-white.png" alt="Travloger" style={{ height: 40, width: 'auto', objectFit: 'contain', marginBottom: 8 }} />
        </a>
        <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', fontFamily: 'var(--f-body)' }}>
          Crafting memories, one trip at a time.
        </div>
      </div>

      {/* Social icons + Instagram social proof */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Facebook', href: 'https://www.facebook.com/people/travlogerin/100083471165858/', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" strokeLinecap="round" strokeLinejoin="round" /></svg> },
            { label: 'WhatsApp', href: waUrl, icon: <WASvg size={16} color="rgba(255,255,255,0.65)" /> },
          ].map((s, i) => (
            <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="tl-social-btn" title={s.label}>{s.icon}</a>
          ))}
        </div>
        {/* Instagram follower count badge */}
        <a href="https://www.instagram.com/travloger.in/" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,rgba(131,58,180,0.25),rgba(253,29,29,0.25),rgba(252,176,69,0.25))', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 11px', textDecoration: 'none' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="ig-f" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fcb045"/><stop offset="50%" stopColor="#fd1d1d"/><stop offset="100%" stopColor="#833ab4"/>
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-f)" strokeWidth="2"/>
            <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" stroke="url(#ig-f)" strokeWidth="2"/>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="url(#ig-f)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: 'var(--f-num)', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>50K+</span>
          <span style={{ fontFamily: 'var(--f-body)', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>followers</span>
        </a>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        {['Packages', 'Honeymoon Tours', 'Group Travel', 'About Us'].map((l) => (
          <a key={l} href="#" className="tl-footer-link">{l}</a>
        ))}
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0 0 16px' }} />
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.8, fontFamily: 'var(--f-body)' }}>
        <div>© {new Date().getFullYear()} Travloger India Pvt. Ltd. All rights reserved.</div>
        <div>Quote #{quoteNum}{expiryDate ? ` · Valid until ${fmtDate(expiryDate)}` : ''}</div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Success Modal ─────────────────────────── */
function SuccessModal({ option, adults, waUrl, agentName, onClose }: {
  option: QuoteOption; adults: number; waUrl: string; agentName: string; onClose: () => void;
}) {
  const total = fmtCurrency(option.final_price);
  const perAdult = fmtCurrency(option.price_per_adult_display);
  const firstName = agentName.split(' ')[0];

  return (
    <div className="tl-overlay" onClick={onClose}>
      <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tl-modal-tick">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4.5 4.5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="tl-modal-h">Quote Approved!</div>
        <div className="tl-modal-pkg">
          You&apos;ve selected the <strong>{option.option_name}</strong> package.
        </div>
        <div className="tl-modal-price-box">
          <div className="tl-modal-price-main">{perAdult} per adult · Total: {total} for {adults} adult{adults > 1 ? 's' : ''}</div>
          <div className="tl-modal-price-sub">(inclusive of {option.gst_percent}% GST)</div>
        </div>
        <div className="tl-modal-agent">
          <strong>{firstName}</strong> will call you within <strong>24 hours</strong> to confirm and collect the advance.
        </div>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="tl-modal-wa">
          <WASvg size={18} color="white" />
          WhatsApp {firstName} Now
        </a>
        <button className="tl-modal-wait" onClick={onClose}>I&apos;ll wait for the call</button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Review Modal ─────────────────────────── */
function ReviewModal({ onClose, token }: { onClose: () => void; token: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const FACE_LABELS = ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'];

  async function submit() {
    if (picked === null) return;
    setDone(true);
    // Fire rating_submitted event (non-blocking)
    fetch(`/api/v1/public/itinerary/${token}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'rating_submitted',
        metadata: {
          rating: picked,
          rating_label: FACE_LABELS[picked] ?? '',
          max_rating: 4,
        },
      }),
    }).catch(() => {});
    setTimeout(onClose, 2200);
  }

  return (
    <div className="tl-rev-overlay" onClick={onClose}>
      <div className="tl-rev-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18 }}>✕</button>
        </div>
        {done ? (
          <div style={{ padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🙏</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 800, color: T, marginBottom: 6 }}>Thank you!</div>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--tl-muted)' }}>Your feedback means a lot to us.</div>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 800, color: T, lineHeight: 1.3, marginTop: 4 }}>How was this quotation?</div>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 12, color: 'var(--tl-muted)', marginTop: 6 }}>Your honest rating helps us serve you better.</div>
            <div className="tl-rev-faces">
              {['😢', '😕', '😐', '🙂', '😍'].map((f, i) => (
                <div key={i} className={`tl-rev-face${picked === i ? ' on' : ''}`} onClick={() => setPicked(i)}>{f}</div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tl-muted)', padding: '0 4px', marginBottom: 22, fontFamily: 'var(--f-body)' }}>
              <span>Very Dissatisfied</span><span>Very Satisfied</span>
            </div>
            <button className="tl-rev-submit" disabled={picked === null} onClick={submit}>Submit Rating</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Sticky CTA ─────────────────────────── */
function StickyCTA({ options, selectedId, onSelect, onApprove, approving }: {
  options: QuoteOption[]; selectedId: string | null; onSelect: (id: string) => void;
  onApprove: () => void; approving: boolean;
}) {
  const selected = options.find((o) => o.id === selectedId);
  if (options.length === 0) return null;

  return (
    <div className="tl-cta-bar">
      <div className="tl-cta-top">
        <div>
          <div className="tl-cta-label">
            {selected ? `${selected.option_name} Package · incl. GST` : 'Select a package'}
          </div>
          <div className="tl-cta-val">
            {selected ? fmtCurrency(selected.final_price) : '—'}
          </div>
        </div>
      </div>
      <div className="tl-cta-bottom">
        <div className="tl-cta-pkg-btns">
          {options.map((opt) => (
            <button
              key={opt.id}
              className={`tl-cta-pkg-btn${selectedId === opt.id ? ' on' : ''}`}
              onClick={() => onSelect(opt.id)}
            >
              {opt.option_name}
            </button>
          ))}
        </div>
        <button
          className="tl-cta-book"
          onClick={onApprove}
          disabled={!selectedId || approving}
        >
          {approving ? 'Approving…' : 'Approve →'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── GROUP: Batch Date Picker ─────────────────────────── */
function statusLabel(status: GroupBatch['booking_status'], badgeText: string | null): string {
  if (badgeText) return badgeText;
  switch (status) {
    case 'OPEN':         return 'Available';
    case 'FILLING_FAST': return 'Filling Fast';
    case 'SOLD_OUT':     return 'Sold Out';
    case 'CLOSED':       return 'Closed';
    default:             return status;
  }
}

function statusColor(status: GroupBatch['booking_status'], badgeColor: string | null): string {
  if (badgeColor) return badgeColor;
  switch (status) {
    case 'OPEN':         return '#16A34A';
    case 'FILLING_FAST': return '#EA580C';
    case 'SOLD_OUT':     return '#DC2626';
    case 'CLOSED':       return '#64748B';
    default:             return '#64748B';
  }
}

function batchIsSoldOut(b: GroupBatch): boolean {
  return b.booking_status === 'SOLD_OUT' || b.booking_status === 'CLOSED' || b.available_seats === 0;
}

function groupBatchesByMonth(batches: GroupBatch[]): Array<{ monthKey: string; monthLabel: string; year: number; batches: GroupBatch[] }> {
  const map = new Map<string, GroupBatch[]>();
  batches.forEach((b) => {
    const d = new Date(b.start_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  });
  return Array.from(map.entries()).map(([key, batches]) => {
    const [year, month] = key.split('-').map(Number);
    const d = new Date(year, month, 1);
    return {
      monthKey: key,
      monthLabel: d.toLocaleDateString('en-IN', { month: 'long' }),
      year,
      batches,
    };
  });
}

function BatchDatePicker({
  batches, selectedBatchId, onSelect,
}: {
  batches: GroupBatch[]; selectedBatchId: string | null; onSelect: (b: GroupBatch) => void;
}) {
  if (batches.length === 0) return null;
  const months = groupBatchesByMonth(batches);

  return (
    <div style={{ background: '#F8FAFC', borderTop: '1px solid var(--tl-border)' }} data-section="dates">
      <div className="tl-sec" style={{ paddingBottom: 32 }}>
        <div className="tl-sec-eyebrow">Book Your Spot</div>
        <div className="tl-sec-h">Choose Your Travel Dates</div>
        <div className="tl-sec-sub" style={{ marginBottom: 28 }}>
          Every batch departs Friday night &amp; returns Monday morning
        </div>

        {months.map(({ monthKey, monthLabel, year, batches: mBatches }) => (
          <div key={monthKey} style={{ marginBottom: 32 }}>
            {/* Month header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: T }} />
                <span style={{
                  fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 800,
                  color: '#0F172A', letterSpacing: '-0.2px',
                }}>
                  {monthLabel} <span style={{ color: '#94A3B8', fontWeight: 500, fontSize: 14 }}>{year}</span>
                </span>
              </div>
              <span style={{
                fontFamily: 'var(--f-body)', fontSize: 11, fontWeight: 600,
                color: '#94A3B8', background: 'white', border: '1px solid #E2E8F0',
                borderRadius: 20, padding: '3px 10px',
              }}>
                {mBatches.length} departure{mBatches.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Grid: 4 tiles per row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {mBatches.map((batch) => {
                const isSelected = selectedBatchId === batch.id;
                const isSoldOut  = batchIsSoldOut(batch);
                const sColor     = statusColor(batch.booking_status, batch.badge_color);
                const sLabel     = statusLabel(batch.booking_status, batch.badge_text);
                const startD     = new Date(batch.start_date);
                const seatsLeft  = batch.available_seats;
                const showBadge  = batch.booking_status !== 'OPEN' || !!batch.badge_text;
                const showSeats  = !isSoldOut && seatsLeft > 0 && seatsLeft <= 10;
                const badgeLabel = showSeats ? `${seatsLeft} left` : sLabel;
                const badgeBg    = showSeats ? '#B45309' : sColor;

                return (
                  <div
                    key={batch.id}
                    onClick={() => !isSoldOut && onSelect(batch)}
                    style={{
                      position: 'relative',
                      borderRadius: 18,
                      paddingTop: (showBadge || showSeats) ? 24 : 16,
                      paddingBottom: 14,
                      paddingLeft: 6, paddingRight: 6,
                      background: isSelected
                        ? `linear-gradient(145deg, ${T} 0%, #1a6070 100%)`
                        : isSoldOut ? '#F8FAFC' : 'white',
                      border: isSelected ? `2px solid ${T}` : '1.5px solid #E2E8F0',
                      cursor: isSoldOut ? 'not-allowed' : 'pointer',
                      opacity: isSoldOut ? 0.4 : 1,
                      textAlign: 'center',
                      transition: 'all 0.18s ease',
                      boxShadow: isSelected
                        ? `0 8px 24px rgba(19,73,86,0.32)`
                        : '0 2px 8px rgba(0,0,0,0.05)',
                    }}
                  >
                    {/* Badge chip */}
                    {(showBadge || showSeats) && (
                      <div style={{
                        position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap', zIndex: 1,
                      }}>
                        <span style={{
                          display: 'inline-block',
                          background: isSelected ? 'rgba(255,255,255,0.25)' : badgeBg,
                          color: 'white',
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 9, fontWeight: 700, fontFamily: 'var(--f-body)',
                          boxShadow: `0 2px 6px ${badgeBg}55`,
                          backdropFilter: isSelected ? 'blur(4px)' : 'none',
                        }}>
                          {badgeLabel}
                        </span>
                      </div>
                    )}

                    {/* Day number */}
                    <div style={{
                      fontFamily: 'var(--f-num)', fontSize: 32, fontWeight: 900, lineHeight: 1,
                      color: isSelected ? 'white' : isSoldOut ? '#CBD5E1' : '#0F172A',
                      marginBottom: 2,
                    }}>
                      {startD.getDate()}
                    </div>

                    {/* Month abbreviation */}
                    <div style={{
                      fontFamily: 'var(--f-body)', fontSize: 10.5, fontWeight: 700,
                      color: isSelected ? 'rgba(255,255,255,0.65)' : '#64748B',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: 8,
                    }}>
                      {startD.toLocaleDateString('en-IN', { month: 'short' })}
                    </div>

                    {/* Divider */}
                    <div style={{
                      height: 1,
                      background: isSelected ? 'rgba(255,255,255,0.18)' : '#F1F5F9',
                      marginBottom: 8, marginLeft: 4, marginRight: 4,
                    }} />

                    {/* Price */}
                    <div style={{
                      fontFamily: 'var(--f-num)', fontSize: 11, fontWeight: 800,
                      color: isSelected ? 'rgba(255,255,255,0.95)' : isSoldOut ? '#CBD5E1' : T,
                      textDecoration: isSoldOut ? 'line-through' : 'none',
                    }}>
                      {fmtCurrency(batch.adult_price)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap',
          background: 'white', borderRadius: 12, padding: '10px 14px',
          border: '1px solid #E2E8F0',
        }}>
          {[
            { dot: T, label: 'Selected' },
            { dot: '#EA580C', label: 'Filling Fast' },
            { dot: '#B45309', label: 'Few Spots Left' },
            { dot: '#CBD5E1', label: 'Sold Out' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--f-body)', fontSize: 11, color: '#64748B' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.dot }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Shared: Inc/Exc List ─────────────────────────── */
function IncExcList({
  items, isInclusion,
}: {
  items: Array<{ id: string; text: string }>;
  isInclusion: boolean;
}) {
  const accentColor = isInclusion ? '#16A34A' : '#DC2626';
  const bgStripe    = isInclusion ? '#F0FDF4' : '#FFF8F8';
  const borderColor = isInclusion ? '#D1FAE5' : '#FECACA';
  const textColor   = isInclusion ? '#15493A' : '#7F1D1D';
  const iconStroke  = isInclusion ? '#16A34A' : '#DC2626';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      {items.map((item, idx) => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '13px 16px',
          background: idx % 2 === 0 ? bgStripe : 'white',
          borderTop: idx > 0 ? `1px solid ${borderColor}` : 'none',
          borderLeft: `3px solid ${accentColor}`,
        }}>
          <div style={{ flexShrink: 0, marginTop: 2, width: 16, height: 16,
            borderRadius: '50%', background: `${accentColor}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isInclusion ? (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="3.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="3.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            )}
          </div>
          <span style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: textColor, lineHeight: 1.55, fontWeight: 450 }}>
            {item.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── GROUP: What's Covered ─────────────────────────── */
function GroupWhatsCovered({
  inclusions, exclusions,
}: {
  inclusions: ItineraryData['inclusions'];
  exclusions: ItineraryData['exclusions'];
}) {
  if (inclusions.length === 0 && exclusions.length === 0) return null;

  return (
    <div style={{ background: 'white', borderTop: '1px solid var(--tl-border)' }} data-section="inclusions">
      <div className="tl-sec">
        <div className="tl-sec-eyebrow">Know Before You Go</div>
        <div className="tl-sec-h">What&apos;s Covered</div>
        <div className="tl-sec-sub">Everything included in your group package — and what&apos;s not.</div>

        {inclusions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <span style={{ fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: 800, color: '#15803D' }}>
                Included in Your Package
              </span>
            </div>
            <IncExcList items={inclusions} isInclusion={true} />
          </div>
        )}

        {exclusions.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </div>
              <span style={{ fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: 800, color: '#B91C1C' }}>
                Not Included
              </span>
            </div>
            <IncExcList items={exclusions} isInclusion={false} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── GROUP: Package Options ─────────────────────────── */
function GroupPackageOptions({
  options, selectedTier, onSelect,
}: {
  options: GroupPackageOption[]; selectedTier: string | null; onSelect: (tier: string) => void;
}) {
  if (!options || options.length === 0) return null;

  return (
    <div style={{ background: 'white', borderTop: '1px solid var(--tl-border)' }} data-section="packages">
      <div className="tl-sec">
        <div className="tl-sec-eyebrow">Pick Your Experience</div>
        <div className="tl-sec-h">Package Options</div>
        <div className="tl-sec-sub" style={{ marginBottom: 28 }}>
          Same departure, different comfort levels — choose what suits you best.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {options.map((opt) => {
            const isSel = selectedTier === opt.tier_name;
            return (
              <div
                key={opt.tier_name}
                onClick={() => onSelect(opt.tier_name)}
                style={{
                  borderRadius: 20,
                  border: isSel ? `2px solid ${T}` : '1.5px solid #E2E8F0',
                  background: isSel ? '#F0F7F9' : 'white',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: isSel ? `0 6px 24px rgba(19,73,86,0.14)` : '0 1px 6px rgba(0,0,0,0.05)',
                  position: 'relative',
                  marginTop: opt.is_most_popular ? 12 : 0,
                }}
              >
                {/* Most Popular banner */}
                {opt.is_most_popular && (
                  <div style={{
                    position: 'absolute', top: -1, left: 0, right: 0,
                    background: 'var(--tl-warm)',
                    textAlign: 'center',
                    padding: '5px 0',
                    fontSize: 10, fontWeight: 800, fontFamily: 'var(--f-body)',
                    color: 'white', letterSpacing: '1.5px', textTransform: 'uppercase',
                  }}>
                    ★ Most Popular
                  </div>
                )}

                {/* Top header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: opt.is_most_popular ? '42px 20px 16px' : '20px 20px 16px',
                  borderBottom: opt.inclusions.length > 0 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Radio indicator */}
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      border: isSel ? `7px solid ${T}` : '2px solid #CBD5E1',
                      background: 'white',
                      transition: 'all 0.15s ease',
                      boxShadow: isSel ? `0 0 0 3px ${T}18` : 'none',
                    }} />
                    <div>
                      <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 800, color: isSel ? T : '#0F172A', lineHeight: 1.1 }}>
                        {opt.tier_name}
                      </div>
                      {opt.child_price > 0 && (
                        <div style={{ fontFamily: 'var(--f-body)', fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>
                          Child: {fmtCurrency(opt.child_price)}
                        </div>
                      )}
                    </div>
                  </div>
                  {opt.adult_price > 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontFamily: 'var(--f-num)', fontSize: 22, fontWeight: 900,
                        color: isSel ? T : '#0F172A', lineHeight: 1,
                      }}>
                        {fmtCurrency(opt.adult_price)}
                      </div>
                      <div style={{ fontFamily: 'var(--f-body)', fontSize: 10.5, color: '#94A3B8', marginTop: 3 }}>per adult</div>
                    </div>
                  )}
                </div>

                {/* Inclusions chips */}
                {opt.inclusions.length > 0 && (
                  <div style={{ padding: '12px 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {opt.inclusions.map((inc, i) => (
                      <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontFamily: 'var(--f-body)', fontSize: 12, color: isSel ? '#134956' : '#475569',
                        background: isSel ? '#D1FAE5' : '#F8FAFC',
                        border: isSel ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                        borderRadius: 20, padding: '4px 11px', lineHeight: 1.4,
                        fontWeight: 500,
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isSel ? '#16A34A' : '#94A3B8'} strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        {inc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── GROUP: Fare Summary ─────────────────────────── */
function GroupFareSummary({
  batch, adults, onAdultsChange, onBookNow, booking,
}: {
  batch: GroupBatch | null;
  adults: number;
  onAdultsChange: (n: number) => void;
  token: string;
  customerName: string;
  quoteNumber: string;
  onBookNow: () => void;
  booking: boolean;
}) {
  if (!batch) {
    return (
      <div style={{ background: '#F8FAFC', borderTop: '1px solid var(--tl-border)' }} data-section="fare">
        <div className="tl-sec" style={{ textAlign: 'center', paddingTop: 40, paddingBottom: 40 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${T}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Pick Your Departure Date</div>
          <div style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>Select a batch above to see the fare breakdown and complete your booking.</div>
        </div>
      </div>
    );
  }

  const pricePerAdult = batch.adult_price;
  const subtotal = pricePerAdult * adults;
  const gstAmount = Math.round(subtotal * batch.gst_percent / 100);
  const total = subtotal + gstAmount;
  const pricePerAdultInclGst = Math.round(total / adults);

  const startD = new Date(batch.start_date);
  const endD   = new Date(batch.end_date);
  const nights = Math.round((endD.getTime() - startD.getTime()) / 86400000);
  const startFmt = startD.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const endFmt   = endD.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div style={{ background: '#F8FAFC', borderTop: '1px solid var(--tl-border)' }} data-section="fare">
      <div className="tl-sec">
        <div className="tl-sec-eyebrow">Your Booking</div>
        <div className="tl-sec-h">Fare Summary</div>
        <div className="tl-sec-sub" style={{ marginBottom: 24 }}>Adjust traveller count to see live pricing.</div>

        {/* Selected date banner */}
        <div style={{
          background: `linear-gradient(135deg, ${T} 0%, #1a6070 100%)`,
          borderRadius: 18, padding: '18px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              Selected Departure
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 2 }}>
              {startFmt} — {endFmt}
            </div>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {batch.batch_name} · {nights} nights
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--f-num)', fontSize: 22, fontWeight: 900, color: 'white', lineHeight: 1 }}>
              {fmtCurrency(pricePerAdultInclGst)}
            </div>
            <div style={{ fontFamily: 'var(--f-body)', fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              per adult incl. GST
            </div>
          </div>
        </div>

        {/* Main fare card — single clean surface */}
        <div style={{
          background: 'white', borderRadius: 18, border: '1.5px solid #E2E8F0',
          overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
        }}>
          {/* Adult counter */}
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Travellers</div>
              <div style={{ fontFamily: 'var(--f-body)', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Number of adults</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T}` }}>
              <button
                onClick={() => onAdultsChange(Math.max(1, adults - 1))}
                style={{
                  width: 40, height: 40, background: adults <= 1 ? '#F8FAFC' : `${T}10`,
                  border: 'none', cursor: adults <= 1 ? 'default' : 'pointer',
                  fontSize: 20, fontWeight: 300, color: adults <= 1 ? '#CBD5E1' : T,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >−</button>
              <div style={{
                width: 48, textAlign: 'center',
                fontFamily: 'var(--f-num)', fontSize: 20, fontWeight: 800, color: T,
                background: `${T}06`, borderLeft: `1px solid ${T}22`, borderRight: `1px solid ${T}22`,
                height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{adults}</div>
              <button
                onClick={() => onAdultsChange(Math.min(30, adults + 1))}
                style={{
                  width: 40, height: 40, background: `${T}10`,
                  border: 'none', cursor: 'pointer',
                  fontSize: 20, fontWeight: 300, color: T,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >+</button>
            </div>
          </div>

          {/* Price rows */}
          <div style={{ borderTop: '1px solid #F1F5F9', padding: '14px 20px 0' }}>
            {[
              { label: `₹${Math.round(pricePerAdult).toLocaleString('en-IN')} × ${adults} adult${adults > 1 ? 's' : ''}`, value: subtotal, dimVal: false },
              { label: `GST ${batch.gst_percent}%`, value: gstAmount, dimVal: true },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}>
                <span style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: '#64748B' }}>{row.label}</span>
                <span style={{ fontFamily: 'var(--f-num)', fontSize: 14, fontWeight: 600, color: row.dimVal ? '#94A3B8' : '#0F172A' }}>
                  {fmtCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>

          {/* Total row */}
          <div style={{
            margin: '0 20px 20px', padding: '14px 0 0',
            borderTop: '2px solid #EEF2F5',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--f-body)', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Total Amount</div>
              <div style={{ fontFamily: 'var(--f-body)', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                {fmtCurrency(pricePerAdultInclGst)} per person · incl. GST
              </div>
            </div>
            <div style={{ fontFamily: 'var(--f-num)', fontSize: 26, fontWeight: 900, color: T }}>
              {fmtCurrency(total)}
            </div>
          </div>

          {/* Book Now button */}
          <div style={{ padding: '0 16px 16px' }}>
            <button
              onClick={onBookNow}
              disabled={booking}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', height: 54, borderRadius: 14,
                background: booking ? '#94A3B8' : `linear-gradient(135deg, ${T} 0%, #1e6b7e 100%)`,
                color: 'white', border: 'none', cursor: booking ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--f-body)', fontSize: 16, fontWeight: 700,
                boxShadow: booking ? 'none' : `0 6px 20px ${T}50`,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { if (!booking) { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 10px 28px ${T}60`; }}}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 20px ${T}50`; }}
            >
              {booking ? 'Sending…' : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                  Book Now — {fmtCurrency(total)}
                </>
              )}
            </button>
            <p style={{ textAlign: 'center', fontFamily: 'var(--f-body)', fontSize: 11, color: '#94A3B8', marginTop: 9 }}>
              We&apos;ll confirm within 2 hours · No payment needed now
            </p>
          </div>
        </div>

        {/* Trust strips */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              bg: '#EEF5F7', t: 'Secure Booking', d: 'No payment now',
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
              bg: '#F0FDF4', t: 'WhatsApp Support', d: '24/7 reachable',
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
              bg: '#EEF5F7', t: 'Free Cancellation', d: '30+ days before',
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
              bg: '#FFFBEB', t: '15,000+ Trips', d: 'Since 2018',
            },
          ].map((x, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'white', border: '1px solid #F1F5F9', borderRadius: 12, padding: '11px 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: x.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {x.icon}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--f-body)', fontSize: 11, fontWeight: 700, color: '#0F172A' }}>{x.t}</div>
                <div style={{ fontFamily: 'var(--f-body)', fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{x.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── GROUP: Sticky Bottom Bar ─────────────────────────── */
function GroupStickyCTA({
  batch, adults, onBookNow, booking,
}: {
  batch: GroupBatch | null; adults: number; onBookNow: () => void; booking: boolean;
}) {
  const total = batch
    ? (() => { const sub = batch.adult_price * adults; return sub + Math.round(sub * batch.gst_percent / 100); })()
    : 0;

  const startFmt = batch
    ? new Date(batch.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const isEmpty = !batch;

  return (
    <div className="tl-grp-bar">
      {/* Row: date label + price */}
      <div className="tl-grp-bar-row">
        <div className="tl-grp-bar-date">
          {batch ? `${startFmt} · ${batch.batch_name}` : 'Select a departure above ↑'}
        </div>
        {batch && (
          <div className="tl-grp-bar-price">{fmtCurrency(total)}</div>
        )}
      </div>

      {/* Sub-line */}
      {batch && (
        <div className="tl-grp-bar-sub">
          {adults} adult{adults !== 1 ? 's' : ''} · incl. {batch.gst_percent}% GST · No payment now
        </div>
      )}

      {/* Book Now button */}
      <button
        className={`tl-grp-bar-btn${isEmpty ? ' tl-grp-bar-btn-empty' : ''}`}
        onClick={onBookNow}
        disabled={isEmpty || booking}
      >
        {booking ? (
          'Sending…'
        ) : isEmpty ? (
          'Pick a Date First ↑'
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tl-teal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Book Now — {fmtCurrency(total)}
          </>
        )}
      </button>
    </div>
  );
}

/* ─────────────────────────── GROUP: Booking Intent Modal ─────────────────────────── */
function BookingIntentModal({
  batch, adults, total, customerName, agentName, waUrl, onClose,
}: {
  batch: GroupBatch; adults: number; total: number;
  customerName: string; agentName: string; waUrl: string; onClose: () => void;
}) {
  const startFmt = new Date(batch.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const firstName = agentName.split(' ')[0];

  return (
    <div className="tl-overlay" onClick={onClose}>
      <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tl-modal-tick">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4.5 4.5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="tl-modal-h">Booking Interest Noted! 🎉</div>
        <div className="tl-modal-pkg">
          You&apos;ve selected <strong>{batch.batch_name}</strong> — <strong>{startFmt}</strong>
        </div>
        <div className="tl-modal-price-box">
          <div className="tl-modal-price-main">{fmtCurrency(total)} for {adults} adult{adults > 1 ? 's' : ''}</div>
          <div className="tl-modal-price-sub">(inclusive of {batch.gst_percent}% GST)</div>
        </div>
        <div className="tl-modal-agent">
          <strong>{firstName}</strong> will call you within <strong>2 hours</strong> to confirm seats and collect the advance.
        </div>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="tl-modal-wa">
          <WASvg size={18} color="white" />
          WhatsApp {firstName} Now
        </a>
        <button className="tl-modal-wait" onClick={onClose}>I&apos;ll wait for the call</button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Component ─────────────────────────── */
export function ItineraryClient({ data, token }: Props) {
  const { quote, customer, agent, state, quote_options, group_package_options, day_snapshots, inclusions, exclusions, policies } = data;

  const isGroup = quote.quote_type?.toUpperCase() === 'GROUP';

  const defaultOption = data.selected_option_id
    ? quote_options.find((o) => o.id === data.selected_option_id)?.id ?? null
    : quote_options.find((o) => o.is_most_popular)?.id ?? quote_options[0]?.id ?? null;

  const [selectedId, setSelectedId]         = useState<string | null>(defaultOption);
  const [approving, setApproving]           = useState(false);
  const [showSuccess, setShowSuccess]       = useState(false);
  const [showReview, setShowReview]         = useState(false);

  // GROUP-only state
  const [batches, setBatches]               = useState<GroupBatch[]>([]);
  const [selectedBatch, setSelectedBatch]   = useState<GroupBatch | null>(null);
  const [groupAdults, setGroupAdults]       = useState<number>(Math.max(1, quote.adults ?? 1));
  const [booking, setBooking]               = useState(false);
  const [showBookingIntent, setShowBookingIntent] = useState(false);
  const defaultTier = group_package_options?.find(o => o.is_most_popular)?.tier_name ?? group_package_options?.[0]?.tier_name ?? null;
  const [selectedTier, setSelectedTier]     = useState<string | null>(defaultTier);

  const selectedOption = quote_options.find((o) => o.id === selectedId);
  const waUrl = buildWaUrl(agent, quote.quote_number, customer.name, state.name);

  // Fetch group batches when applicable
  useEffect(() => {
    if (!isGroup || !quote.group_template_id) return;
    fetch(`/api/v1/public/group-batches/${quote.group_template_id}`)
      .then((r) => r.json())
      .then((d: { data?: GroupBatch[] }) => {
        const list = d.data ?? [];
        setBatches(list);
        // Pre-select first available batch
        const firstAvail = list.find((b) => !batchIsSoldOut(b));
        if (firstAvail) setSelectedBatch(firstAvail);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-trigger review modal after 90 seconds
  useEffect(() => {
    const t = setTimeout(() => setShowReview(true), 90_000);
    return () => clearTimeout(t);
  }, []);

  async function handleSelectOption(id: string) {
    setSelectedId(id);
    try {
      await fetch(`/api/v1/public/itinerary/${token}/select-option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: id }),
      });
    } catch {
      // non-critical
    }
  }

  async function handleApprove() {
    if (!selectedId || approving) return;
    setApproving(true);
    try {
      await fetch(`/api/v1/public/itinerary/${token}/select-option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: selectedId }),
      });
      const res = await fetch(`/api/v1/public/itinerary/${token}/approve`, { method: 'POST' });
      if (res.ok) setShowSuccess(true);
    } catch {
      setShowSuccess(true);
    } finally {
      setApproving(false);
    }
  }

  function handleTierSelect(tierName: string) {
    setSelectedTier(tierName);
    fetch(`/api/v1/public/itinerary/${token}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'package_selected',
        metadata: { tier_name: tierName },
      }),
    }).catch(() => {});
  }

  function handleBatchSelect(b: GroupBatch) {
    setSelectedBatch(b);
    setGroupAdults(Math.max(1, quote.adults ?? 1));
    // Fire batch_selected analytics (non-blocking)
    fetch(`/api/v1/public/itinerary/${token}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'batch_selected',
        metadata: {
          batch_id:         b.id,
          batch_name:       b.batch_name,
          batch_start_date: b.start_date,
          batch_end_date:   b.end_date,
          adult_price:      b.adult_price,
        },
      }),
    }).catch(() => {});
  }

  async function handleBookNow() {
    if (!selectedBatch || booking) return;
    setBooking(true);

    const pricePerAdult = selectedBatch.adult_price;
    const subtotal      = pricePerAdult * groupAdults;
    const gstAmount     = Math.round(subtotal * selectedBatch.gst_percent / 100);
    const total         = subtotal + gstAmount;

    try {
      await fetch(`/api/v1/public/itinerary/${token}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'booking_intent',
          metadata: {
            customer_name:    customer.name,
            adults:           groupAdults,
            batch_id:         selectedBatch.id,
            batch_name:       selectedBatch.batch_name,
            batch_start_date: selectedBatch.start_date,
            batch_end_date:   selectedBatch.end_date,
            total_price:      total,
            quote_number:     quote.quote_number,
          },
        }),
      });
    } catch {
      // non-critical — show confirmation anyway
    } finally {
      setBooking(false);
      setShowBookingIntent(true);
    }
  }

  // Derived group fare
  const groupTotal = selectedBatch
    ? (() => {
        const sub = selectedBatch.adult_price * groupAdults;
        return sub + Math.round(sub * selectedBatch.gst_percent / 100);
      })()
    : 0;

  return (
    <div className="tl-page">
      <Nav quoteNum={quote.quote_number} pkgName={selectedOption?.option_name} />

      <div style={{ marginTop: 58 }}>
        <Hero data={data} />
        <Strip quote={quote} />
        <Gallery state={state} day_snapshots={day_snapshots} />

        {/* Package options — PRIVATE only (GROUP has its own tier selector below) */}
        {!isGroup && <Packages options={quote_options} selectedId={selectedId} onSelect={handleSelectOption} />}

        {/* ── GROUP: tier selector ── */}
        {isGroup && (
          <GroupPackageOptions
            options={group_package_options ?? []}
            selectedTier={selectedTier}
            onSelect={handleTierSelect}
          />
        )}

        {/* ── GROUP: date picker ── */}
        {isGroup && (
          <BatchDatePicker
            batches={batches}
            selectedBatchId={selectedBatch?.id ?? null}
            onSelect={handleBatchSelect}
          />
        )}

        <LogoMarquee />
        <ItinerarySection days={day_snapshots} />

        {/* ── GROUP: visual what's covered; regular: plain inc/exc ── */}
        {isGroup
          ? <GroupWhatsCovered inclusions={inclusions} exclusions={exclusions} />
          : <IncExc inclusions={inclusions} exclusions={exclusions} />
        }

        {/* ── GROUP: fare summary with adult counter + Book Now ── */}
        {isGroup && (
          <GroupFareSummary
            batch={selectedBatch}
            adults={groupAdults}
            onAdultsChange={setGroupAdults}
            token={token}
            customerName={customer.name}
            quoteNumber={quote.quote_number}
            onBookNow={handleBookNow}
            booking={booking}
          />
        )}

        <WhyChoose />
        <Stats />

        {/* Regular fare summary for non-GROUP quotes */}
        {!isGroup && <FareSummary option={selectedOption} adults={quote.adults} />}

        <Policies policies={policies} />
        <AgentSection agent={agent} waUrl={waUrl} />
        <Footer quoteNum={quote.quote_number} expiryDate={quote.expiry_date} waUrl={waUrl} />
        {/* Spacer so footer content isn't hidden behind the sticky bar */}
        <div style={{ height: isGroup ? 'calc(env(safe-area-inset-bottom,0px) + 150px)' : 'calc(env(safe-area-inset-bottom,0px) + 120px)', background: 'var(--tl-dark)' }} />
      </div>

      {/* Sticky CTA */}
      {isGroup ? (
        /* GROUP: fixed bottom bar with selected batch + Book Now */
        <GroupStickyCTA
          batch={selectedBatch}
          adults={groupAdults}
          onBookNow={handleBookNow}
          booking={booking}
        />
      ) : (
        <StickyCTA
          options={quote_options}
          selectedId={selectedId}
          onSelect={handleSelectOption}
          onApprove={handleApprove}
          approving={approving}
        />
      )}

      {/* WhatsApp float */}
      <a href={waUrl} target="_blank" rel="noopener noreferrer" className={`tl-wa-float${isGroup ? ' tl-wa-float-group' : ''}`} title="Chat on WhatsApp">
        <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>

      {/* Modals */}
      {showSuccess && selectedOption && (
        <SuccessModal
          option={selectedOption}
          adults={quote.adults}
          waUrl={waUrl}
          agentName={agent?.name ?? 'Your Agent'}
          onClose={() => setShowSuccess(false)}
        />
      )}
      {showBookingIntent && selectedBatch && (
        <BookingIntentModal
          batch={selectedBatch}
          adults={groupAdults}
          total={groupTotal}
          customerName={customer.name}
          agentName={agent?.name ?? 'Your Agent'}
          waUrl={waUrl}
          onClose={() => setShowBookingIntent(false)}
        />
      )}
      {showReview && <ReviewModal onClose={() => setShowReview(false)} token={token} />}
    </div>
  );
}
