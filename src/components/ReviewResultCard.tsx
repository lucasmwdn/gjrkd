import { useState } from 'react';
import {
  AlertCircle,
  BadgeAlert,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Flag,
  Info,
  MessageSquareWarning,
  ShieldCheck,
  Star,
} from 'lucide-react';
import type {
  AdDisclosureInfo,
  CriteriaConfig,
  ReviewAnalysisResult,
} from '../types/review';
import { HighlightedReviewText } from './HighlightedReviewText';
import { TrustGauge } from './TrustGauge';

interface ReviewResultCardProps {
  review: ReviewAnalysisResult;
  index: number;
  criteria: CriteriaConfig;
  hasAppealed: boolean;
  onRequestAppeal: (review: ReviewAnalysisResult) => void;
}

export function ReviewResultCard({
  review,
  index,
  criteria,
  hasAppealed,
  onRequestAppeal,
}: ReviewResultCardProps) {
  const [showUnchecked, setShowUnchecked] = useState(false);

  const suspiciousSignals = Array.isArray(review.suspiciousSignals)
    ? review.suspiciousSignals
    : [];
  const trustSignals = Array.isArray(review.trustSignals)
    ? review.trustSignals
    : [];
  const platformTags = Array.isArray(review.platformTags)
    ? review.platformTags
    : [];

  const isPending = Boolean(review.insufficientInfo) || review.score === null;

  const detectedSuspicious = suspiciousSignals.filter((s) => s.detected);
  const undetectedSuspicious = suspiciousSignals.filter((s) => !s.detected);

  const detectedTrust = trustSignals.filter((s) => s.detected);
  const undetectedTrust = trustSignals.filter((s) => !s.detected);

  const getPoints = (
    sig: { type: string; points?: number },
    isTrust: boolean
  ): string => {
    if (typeof sig.points === 'number' && Number.isFinite(sig.points)) {
      return sig.points > 0 ? `+${sig.points}점` : `${sig.points}점`;
    }
    const targetKind = isTrust ? 'trust' : 'suspicious';
    const def = criteria.signals.find((d) => d.kind === targetKind && d.type === sig.type);
    if (!def) return '';
    return def.points > 0 ? `+${def.points}점` : `${def.points}점`;
  };

  const adDisclosure: AdDisclosureInfo = review.adDisclosure ?? {
    status: 'none',
    label: '표시 없음',
    matchedPhrases: [],
    explanation: '체험단·협찬·광고 관련 표시 문구가 발견되지 않았습니다.',
  };

  const adBadgeStyleMap = {
    clear: {
      box: 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]',
      Icon: BadgeCheck,
    },
    unclear: {
      box: 'bg-[#FEFCE8] border-[#FDE047] text-[#A16207]',
      Icon: BadgeAlert,
    },
    none: {
      box: 'bg-[#F1F5F9] border-[#CBD5E1] text-[#475569]',
      Icon: Info,
    },
  } as const;

  const adBadgeStyle = adBadgeStyleMap[adDisclosure.status] ?? adBadgeStyleMap.none;
  const AdBadgeIcon = adBadgeStyle.Icon;

  return (
    <article className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-7 space-y-6">
      {/* Top Row: Review Header + Ad Disclosure Badge + Score Gauge */}
      <div className="space-y-4 pb-5 border-b border-[#E2E8F0]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <span className="font-semibold text-[#0F2557]">
                리뷰 #{review.id > 0 ? review.id : index + 1}
              </span>
              {review.rating !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-[#334155]">
                    <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#F59E0B]" aria-hidden="true" />
                    <span className="font-mono-num">{review.rating}.0점</span>
                  </span>
                </>
              )}
              {review.date && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num text-[#334155]">{review.date}</span>
                </>
              )}
              {review.hasPhoto && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#334155]">사진 첨부</span>
                </>
              )}
              {platformTags.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#475569]">
                    표시 태그: {platformTags.join(', ')}
                  </span>
                </>
              )}
              {!isPending && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    의심 신호 {detectedSuspicious.length}건 / 신뢰 신호 {detectedTrust.length}건
                  </span>
                </>
              )}
            </div>

            <h3
              className={`text-base sm:text-lg font-semibold leading-snug ${
                isPending ? 'text-[#64748B]' : 'text-[#0F172A]'
              }`}
            >
              {isPending ? '정보가 부족해 판단하기 어려워요' : review.summary}
            </h3>

            {!isPending && review.areaScores && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#475569] pt-1">
                <span className="font-semibold text-[#0F2557]">영역 점수</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">구체성 {review.areaScores.구체성}/30</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">균형성 {review.areaScores.균형성}/20</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">과장도 {review.areaScores.과장도}/25</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">일관성 {review.areaScores.일관성}/25</span>
              </div>
            )}
          </div>

          {/* Right side at top: Ad Disclosure Badge directly beside Score Gauge */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 self-start sm:self-center">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap ${adBadgeStyle.box}`}
              title={adDisclosure.explanation}
            >
              <AdBadgeIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{adDisclosure.label}</span>
            </div>

            <TrustGauge score={review.score} insufficientInfo={isPending} />
          </div>
        </div>

        {/* Ad Disclosure Explanation Notice (when clear or unclear) */}
        {adDisclosure.status !== 'none' && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed flex items-start gap-2 ${
              adDisclosure.status === 'clear'
                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A]'
                : 'bg-[#FEFCE8] border-[#FDE047] text-[#854D0E]'
            }`}
          >
            <AdBadgeIcon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-bold mr-1.5">[{adDisclosure.label}]</span>
              <span>{adDisclosure.explanation}</span>
              {adDisclosure.matchedPhrases.length > 0 && (
                <span className="ml-1.5 font-medium">
                  (확인된 표현: {adDisclosure.matchedPhrases.join(', ')})
                </span>
              )}
              <span className="block mt-0.5 text-[11px] opacity-85">
                ※ 체험단·협찬·광고 표시 여부는 점수에서 감점하지 않고 배지로만 분리 안내합니다.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Highlighted Original Text */}
      <HighlightedReviewText
        text={review.text}
        suspiciousSignals={suspiciousSignals}
        trustSignals={trustSignals}
      />

      {isPending ? (
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 text-sm text-[#64748B] flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#64748B] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-[#475569]">판단 보류 (공백 제외 20자 미만)</p>
            <p className="text-xs leading-relaxed">
              정보가 부족해 판단하기 어려워요. 짧은 한 줄 후기만으로는 신뢰 신호나 의심 신호를 구분하기 어려워 신뢰도 점수 및 평균 신뢰도 계산에서 제외했습니다.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Signal Breakdown (2 columns on desktop) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Suspicious Signals */}
            <section aria-label="의심 신호 목록" className="space-y-3">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[#0F2557]">
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" aria-hidden="true" />
                  <span>의심 신호</span>
                </h4>
                <span className="font-mono-num text-xs font-medium text-[#64748B]">
                  {detectedSuspicious.length} / {suspiciousSignals.length}개 감지
                </span>
              </div>

              {detectedSuspicious.length === 0 ? (
                <p className="text-sm text-[#64748B] py-2">
                  뚜렷하게 포착된 의심 신호가 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-[#F1F5F9]">
                  {detectedSuspicious.map((sig) => (
                    <li key={sig.type} className="py-3 first:pt-1 last:pb-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[#991B1B]">{sig.type}</span>
                        <span className="font-mono-num text-xs font-semibold text-[#DC2626] shrink-0">
                          {getPoints(sig, false)}
                        </span>
                      </div>
                      <p className="text-sm text-[#475569] leading-relaxed">{sig.reason}</p>
                      {(sig.type === '다른 리뷰와 문장이 거의 같음' ||
                        sig.type === '같은 날짜에 비슷한 내용의 리뷰가 3개 이상 몰려 있음') &&
                        Array.isArray(sig.similarReviewIndices) &&
                        sig.similarReviewIndices.length > 0 && (
                          <p className="text-xs font-medium text-[#B91C1C]">
                            {sig.type === '다른 리뷰와 문장이 거의 같음'
                              ? `비교 결과: 전체 리뷰 중 ${sig.similarReviewIndices
                                  .map((n) => `#${n}`)
                                  .join(', ')}과 거의 같음`
                              : `비교 관련 리뷰: ${sig.similarReviewIndices
                                  .map((n) => `리뷰 #${n}`)
                                  .join(', ')}`}
                          </p>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Trust Signals */}
            <section aria-label="신뢰 신호 목록" className="space-y-3">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[#0F2557]">
                  <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0" aria-hidden="true" />
                  <span>신뢰 신호</span>
                </h4>
                <span className="font-mono-num text-xs font-medium text-[#64748B]">
                  {detectedTrust.length} / {trustSignals.length}개 확인
                </span>
              </div>

              {detectedTrust.length === 0 ? (
                <p className="text-sm text-[#64748B] py-2">
                  구체적 경험이나 균형 잡힌 근거 신호가 확인되지 않았습니다.
                </p>
              ) : (
                <ul className="divide-y divide-[#F1F5F9]">
                  {detectedTrust.map((sig) => (
                    <li key={sig.type} className="py-3 first:pt-1 last:pb-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[#065F46]">{sig.type}</span>
                        <span className="font-mono-num text-xs font-semibold text-[#059669] shrink-0">
                          {getPoints(sig, true)}
                        </span>
                      </div>
                      <p className="text-sm text-[#475569] leading-relaxed">{sig.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Collapsible undetected criteria checklist + Appeal CTA */}
          <div className="pt-4 border-t border-[#E2E8F0] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowUnchecked((prev) => !prev)}
                className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F2557] transition-colors"
              >
                {showUnchecked ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  미감지 항목 전체 보기 ({undetectedSuspicious.length + undetectedTrust.length}개)
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRequestAppeal(review)}
                className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  hasAppealed
                    ? 'border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F2557] hover:bg-[#F1F5F9]'
                    : 'border border-[#0F2557]/25 bg-white text-[#0F2557] hover:bg-[#F1F5F9]'
                }`}
              >
                {hasAppealed ? (
                  <>
                    <Check className="w-4 h-4 text-[#059669]" aria-hidden="true" />
                    <span>이의 제기 추가 작성</span>
                  </>
                ) : (
                  <>
                    <MessageSquareWarning className="w-4 h-4" aria-hidden="true" />
                    <span>판단이 틀렸나요?</span>
                  </>
                )}
              </button>
            </div>

            {showUnchecked && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#475569]">
                <div className="space-y-1.5">
                  <p className="font-semibold text-[#334155]">포착되지 않은 의심 신호</p>
                  {undetectedSuspicious.length === 0 ? (
                    <p className="text-[#64748B]">없음 (모든 의심 신호가 감지됨)</p>
                  ) : (
                    <ul className="space-y-1">
                      {undetectedSuspicious.map((sig) => (
                        <li key={sig.type} className="flex items-start gap-1.5">
                          <Flag className="w-3.5 h-3.5 text-[#94A3B8] mt-0.5 shrink-0" aria-hidden="true" />
                          <span>
                            <strong className="text-[#334155]">{sig.type}:</strong> {sig.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold text-[#334155]">확인되지 않은 신뢰 신호</p>
                  {undetectedTrust.length === 0 ? (
                    <p className="text-[#64748B]">없음 (모든 신뢰 신호가 확인됨)</p>
                  ) : (
                    <ul className="space-y-1">
                      {undetectedTrust.map((sig) => (
                        <li key={sig.type} className="flex items-start gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#94A3B8] mt-0.5 shrink-0" aria-hidden="true" />
                          <span>
                            <strong className="text-[#334155]">{sig.type}:</strong> {sig.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
