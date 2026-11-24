import { AlertTriangle, CheckCircle2, HelpCircle, MinusCircle } from 'lucide-react';
import { getScoreTierInfo } from '../types/review';

interface TrustGaugeProps {
  score: number | null;
  insufficientInfo?: boolean;
}

export function TrustGauge({ score, insufficientInfo = false }: TrustGaugeProps) {
  if (insufficientInfo || score === null || !Number.isFinite(score)) {
    return (
      <div
        className="flex flex-col items-center justify-center shrink-0 rounded-lg border border-[#CBD5E1] bg-[#F1F5F9] px-4 py-3 text-center min-w-[148px]"
        role="status"
        aria-label="판단 보류: 정보가 부족해 판단하기 어려워요"
      >
        <div className="flex items-center gap-1.5 text-sm font-bold text-[#475569]">
          <MinusCircle className="w-4 h-4 text-[#64748B] shrink-0" aria-hidden="true" />
          <span>판단 보류</span>
        </div>
        <span className="mt-1 text-[11px] text-[#64748B] leading-snug">
          정보가 부족해 판단하기 어려워요
        </span>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { tier, label } = getScoreTierInfo(clamped);

  const radius = 44;
  const circumference = Math.PI * radius; // Semi-circle arc length
  const dashOffset = circumference * (1 - clamped / 100);

  const colorMap = {
    green: {
      stroke: '#059669',
      track: '#D1FAE5',
      text: 'text-[#059669]',
      labelBg: 'text-[#065F46]',
      Icon: CheckCircle2,
    },
    yellow: {
      stroke: '#D97706',
      track: '#FEF3C7',
      text: 'text-[#B45309]',
      labelBg: 'text-[#92400E]',
      Icon: HelpCircle,
    },
    red: {
      stroke: '#DC2626',
      track: '#FEE2E2',
      text: 'text-[#DC2626]',
      labelBg: 'text-[#991B1B]',
      Icon: AlertTriangle,
    },
  } as const;

  const resolvedTier: 'green' | 'yellow' | 'red' = tier === 'pending' ? 'yellow' : tier;
  const palette = colorMap[resolvedTier];
  const StatusIcon = palette.Icon;

  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="relative w-32 h-20 flex items-end justify-center">
        <svg
          viewBox="0 0 112 64"
          className="w-full h-full overflow-visible"
          role="img"
          aria-label={`신뢰도 점수 ${clamped}점 (${label})`}
        >
          <path
            d="M 12 54 A 44 44 0 0 1 100 54"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 12 54 A 44 44 0 0 1 100 54"
            fill="none"
            stroke={palette.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>
        <div className="absolute bottom-0.5 flex flex-col items-center leading-none">
          <span className={`font-mono-num text-2xl font-bold tracking-tight ${palette.text}`}>
            {clamped}
          </span>
          <span className="text-[11px] text-[#64748B] font-medium mt-0.5">/ 100점</span>
        </div>
      </div>

      <div className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${palette.labelBg}`}>
        <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
      </div>
    </div>
  );
}
