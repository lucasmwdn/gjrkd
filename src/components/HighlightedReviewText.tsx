import { useState } from 'react';
import type { SuspiciousSignalResult, TrustSignalResult } from '../types/review';
import { buildHighlightedSegments, type TextSegment } from '../utils/highlight';

interface HighlightedReviewTextProps {
  text: string;
  suspiciousSignals: SuspiciousSignalResult[];
  trustSignals: TrustSignalResult[];
}

export function HighlightedReviewText({
  text,
  suspiciousSignals,
  trustSignals,
}: HighlightedReviewTextProps) {
  const segments = buildHighlightedSegments(text, suspiciousSignals, trustSignals);
  const [selectedSegment, setSelectedSegment] = useState<TextSegment | null>(null);

  const hasHighlights = segments.some((s) => s.kind !== 'plain');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
        <span className="font-semibold text-[#0F2557]">원문 및 근거 하이라이트</span>
        {hasHighlights && (
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-2.5 rounded-xs bg-[#D1FAE5] border-b-2 border-[#059669]" />
              <span>신뢰 신호 근거</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-2.5 rounded-xs bg-[#FFE4E6] border-b-2 border-[#E11D48]" />
              <span>의심 신호 근거</span>
            </span>
          </div>
        )}
      </div>

      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 text-[15px] leading-[1.75] text-[#1E293B] whitespace-pre-wrap">
        {segments.map((seg, idx) => {
          if (seg.kind === 'plain') {
            return <span key={idx}>{seg.text}</span>;
          }

          const isSelected =
            selectedSegment?.text === seg.text && selectedSegment?.signalType === seg.signalType;

          const markClasses =
            seg.kind === 'trust'
              ? 'bg-[#D1FAE5]/90 text-[#064E3B] border-b-2 border-[#059669] hover:bg-[#A7F3D0]'
              : 'bg-[#FFE4E6]/90 text-[#881337] border-b-2 border-[#E11D48] hover:bg-[#FECDD3]';

          return (
            <mark
              key={idx}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedSegment(isSelected ? null : seg)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedSegment(isSelected ? null : seg);
                }
              }}
              title={`${seg.signalType}: ${seg.reason}`}
              className={`cursor-pointer rounded-xs px-0.5 py-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A] ${markClasses} ${
                isSelected ? 'ring-2 ring-[#0F2557]' : ''
              }`}
            >
              {seg.text}
            </mark>
          );
        })}
      </div>

      {hasHighlights && (
        <p className="text-xs text-[#64748B]">
          {selectedSegment ? (
            <span className="block bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2.5 text-[#0F172A]">
              <strong
                className={
                  selectedSegment.kind === 'trust' ? 'text-[#059669]' : 'text-[#DC2626]'
                }
              >
                [{selectedSegment.signalType}]
              </strong>{' '}
              {selectedSegment.reason}
            </span>
          ) : (
            '형광펜으로 표시된 문장을 누르면 어떤 신호의 근거인지 바로 볼 수 있습니다.'
          )}
        </p>
      )}
    </div>
  );
}
