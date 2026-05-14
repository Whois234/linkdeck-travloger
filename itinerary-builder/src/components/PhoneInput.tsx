'use client';

const COUNTRY_CODES = [
  { code: '+91',  flag: '🇮🇳', name: 'India'        },
  { code: '+971', flag: '🇦🇪', name: 'UAE'          },
  { code: '+1',   flag: '🇺🇸', name: 'USA / Canada' },
  { code: '+44',  flag: '🇬🇧', name: 'UK'           },
  { code: '+65',  flag: '🇸🇬', name: 'Singapore'    },
  { code: '+60',  flag: '🇲🇾', name: 'Malaysia'     },
  { code: '+61',  flag: '🇦🇺', name: 'Australia'    },
  { code: '+81',  flag: '🇯🇵', name: 'Japan'        },
  { code: '+49',  flag: '🇩🇪', name: 'Germany'      },
  { code: '+33',  flag: '🇫🇷', name: 'France'       },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+974', flag: '🇶🇦', name: 'Qatar'        },
  { code: '+968', flag: '🇴🇲', name: 'Oman'         },
  { code: '+973', flag: '🇧🇭', name: 'Bahrain'      },
  { code: '+94',  flag: '🇱🇰', name: 'Sri Lanka'    },
  { code: '+977', flag: '🇳🇵', name: 'Nepal'        },
  { code: '+880', flag: '🇧🇩', name: 'Bangladesh'   },
];

/** Split a fully-stored phone like "919876543210" into { code:"+91", local:"9876543210" }. */
export function parsePhone(full: string): { code: string; local: string } {
  if (!full) return { code: '+91', local: '' };
  const digits = full.replace(/\D/g, '');
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const { code } of sorted) {
    const prefix = code.replace('+', '');
    if (digits.startsWith(prefix)) return { code, local: digits.slice(prefix.length) };
  }
  return { code: '+91', local: digits };
}

/** Combine code + local into the stored format: "919876543210" (no +). */
export function combinePhone(code: string, local: string): string {
  return code.replace('+', '') + local.replace(/\D/g, '');
}

interface Props {
  code: string;
  local: string;
  onCodeChange: (code: string) => void;
  onLocalChange: (local: string) => void;
  /** Optional border colour when focused (defaults to #134956). */
  focusColor?: string;
  /** Extra class on the wrapper div. */
  className?: string;
  /** Style on the wrapper div (e.g. for border overrides). */
  style?: React.CSSProperties;
}

export default function PhoneInput({ code, local, onCodeChange, onLocalChange, focusColor = '#134956', className = '', style }: Props) {
  return (
    <div
      className={`flex rounded-lg border overflow-hidden bg-white ${className}`}
      style={{ borderColor: '#D1D5DB', ...style }}
    >
      <select
        value={code}
        onChange={e => onCodeChange(e.target.value)}
        className="h-[38px] pl-2 pr-1 text-sm font-semibold bg-[#F8FAFC] border-r focus:outline-none flex-shrink-0 cursor-pointer"
        style={{ borderColor: '#E2E8F0', color: '#0F172A', minWidth: 74 }}
        onFocus={e => (e.currentTarget.parentElement!.style.borderColor = focusColor)}
        onBlur={e => (e.currentTarget.parentElement!.style.borderColor = '#D1D5DB')}
      >
        {COUNTRY_CODES.map(c => (
          <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        className="flex-1 h-[38px] px-3 text-sm placeholder:text-[#94A3B8] focus:outline-none bg-white"
        value={local}
        onChange={e => onLocalChange(e.target.value.replace(/[^\d\s\-()]/g, ''))}
        placeholder="98765 43210"
        onFocus={e => (e.currentTarget.parentElement!.style.borderColor = focusColor)}
        onBlur={e => (e.currentTarget.parentElement!.style.borderColor = '#D1D5DB')}
      />
    </div>
  );
}
