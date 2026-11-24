import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Check, Loader2, LogIn, X } from 'lucide-react';
import type {
  AppealSavedSignal,
  CriteriaConfig,
  ExpectedJudgment,
  ProductInfo,
  ReviewAnalysisResult,
} from '../types/review';
import { signInWithGooglePopup } from '../firebase';

interface AppealModalProps {
  review: ReviewAnalysisResult | null;
  productInfo: ProductInfo | null;
  criteria: CriteriaConfig;
  currentUser: User | null;
  onClose: () => void;
  onSubmit: (payload: {
    authorId: string;
    reviewText: string;
    rating: number | null;
    productInfo: ProductInfo | null;
    aiScore: number;
    aiAreaScores: ReviewAnalysisResult['areaScores'] | null;
    aiTierLabel: string;
    aiSignals: AppealSavedSignal[];
    expectedJudgment: ExpectedJudgment;
    problematicPart: string;
    reason: string;
  }) => Promise<void>;
}

function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?。\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length <= 1 && text.trim().length > 0) {
    return [text.trim()];
  }
  return Array.from(new Set(parts)).slice(0, 12);
}

export function AppealModal({
  review,
  productInfo,
  criteria,
  currentUser,
  onClose,
  onSubmit,
}: AppealModalProps) {
  const [expectedJudgment, setExpectedJudgment] =
    useState<ExpectedJudgment>('더 믿을 만한 리뷰다');
  const [selectedSentences, setSelectedSentences] = useState<string[]>([]);
  const [customPart, setCustomPart] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sentences = useMemo(() => (review ? splitSentences(review.text) : []), [review]);

  useEffect(() => {
    if (review) {
      const safeScore = review.score ?? 50;
      setExpectedJudgment(
        safeScore < 60 ? '더 믿을 만한 리뷰다' : '덜 믿을 만한 리뷰다'
      );
      setSelectedSentences([]);
      setCustomPart('');
      setReason('');
      setError('');
    }
  }, [review]);

  if (!review) return null;

  const detectedSignals: AppealSavedSignal[] = [
    ...review.suspiciousSignals
      .filter((s) => s.detected)
      .map((s) => {
        const def = criteria.signals.find((r) => r.kind === 'suspicious' && r.type === s.type);
        return {
          type: s.type,
          kind: 'suspicious' as const,
          area: def?.area ?? '일관성',
          points: def?.points ?? -5,
          reason: s.reason,
        };
      }),
    ...review.trustSignals
      .filter((s) => s.detected)
      .map((s) => {
        const def = criteria.signals.find((r) => r.kind === 'trust' && r.type === s.type);
        return {
          type: s.type,
          kind: 'trust' as const,
          area: def?.area ?? '구체성',
          points: def?.points ?? 5,
          reason: s.reason,
        };
      }),
  ];

  const toggleSentence = (sentence: string) => {
    setSelectedSentences((prev) =>
      prev.includes(sentence) ? prev.filter((s) => s !== sentence) : [...prev, sentence]
    );
    if (error) setError('');
  };

  const combinedProblematicPart = [
    ...selectedSentences,
    ...(customPart.trim() ? [customPart.trim()] : []),
  ]
    .join(' / ')
    .trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!combinedProblematicPart) {
      setError('문제라고 생각하는 문장을 선택하거나 직접 입력해 주세요.');
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError('그렇게 생각한 이유를 5자 이상 적어 주세요.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      let activeUser = currentUser;
      if (!activeUser) {
        activeUser = await signInWithGooglePopup();
      }
      if (!activeUser) {
        throw new Error('로그인이 필요합니다.');
      }

      const normalizedProductInfo: ProductInfo | null =
        productInfo &&
        (productInfo.name.trim() || productInfo.category || productInfo.description.trim())
          ? {
              name: productInfo.name.trim(),
              category: productInfo.category,
              description: productInfo.description.trim(),
            }
          : null;

      await onSubmit({
        authorId: activeUser.uid,
        reviewText: review.text,
        rating: review.rating,
        productInfo: normalizedProductInfo,
        aiScore: review.score ?? 0,
        aiAreaScores: review.areaScores ?? null,
        aiTierLabel: review.tierLabel,
        aiSignals: detectedSignals,
        expectedJudgment,
        problematicPart: combinedProblematicPart.slice(0, 1000),
        reason: trimmedReason.slice(0, 2000),
      });

      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Google 로그인이 취소되었습니다. 다시 시도해 주세요.'
          : err instanceof Error
            ? err.message
            : '이의 제기를 저장하는 중 오류가 발생했습니다.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F172A]/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appeal-modal-title"
    >
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-xl border border-[#E2E8F0] shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] sticky top-0 bg-white z-10">
          <h3 id="appeal-modal-title" className="text-lg font-bold text-[#0F2557]">
            판단 이의 제기하기
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="닫기"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Auto-attached Context Preview */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5 text-sm text-[#334155] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
              <span>
                자동 저장 정보 ·{' '}
                {productInfo?.name?.trim()
                  ? `${productInfo.name.trim()} (${productInfo.category || '일반'})`
                  : productInfo?.category || '상품 정보 미입력'}
              </span>
              <span className="font-mono-num font-semibold text-[#0F2557]">
                {review.score !== null ? `AI 점수 ${review.score}점` : '판단 보류'} · {review.tierLabel}
              </span>
            </div>
            <p className="line-clamp-3 leading-relaxed text-[#0F172A]">{review.text}</p>
            {detectedSignals.length > 0 && (
              <div className="text-xs text-[#475569] pt-1 border-t border-[#E2E8F0]">
                <span className="font-semibold text-[#0F2557]">함께 저장되는 AI 신호: </span>
                {detectedSignals
                  .map((s) => `${s.type}(${s.points > 0 ? `+${s.points}` : s.points})`)
                  .join(' · ')}
              </div>
            )}
          </div>

          {/* 1. Expected Judgment */}
          <div className="space-y-2">
            <span className="block text-sm font-bold text-[#0F172A]">
              1. 사용자가 생각하는 올바른 판단
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(['더 믿을 만한 리뷰다', '덜 믿을 만한 리뷰다'] as ExpectedJudgment[]).map(
                (choice) => {
                  const selected = expectedJudgment === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setExpectedJudgment(choice)}
                      className={`min-h-[46px] px-4 py-2.5 rounded-lg border text-sm font-semibold flex items-center justify-between gap-2 transition-colors ${
                        selected
                          ? 'border-[#0F2557] bg-[#0F2557] text-white'
                          : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <span>{choice}</span>
                      {selected && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* 2. Problematic Part (Sentence selection OR manual input) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="block text-sm font-bold text-[#0F172A]">
                2. 문제라고 생각하는 부분
              </span>
              <span className="text-xs text-[#64748B]">
                원문 문장을 누르거나 아래에 직접 적어 주세요
              </span>
            </div>

            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {sentences.map((sentence, idx) => {
                const isSelected = selectedSentences.includes(sentence);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleSentence(sentence)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs sm:text-sm leading-relaxed transition-colors flex items-start gap-2 ${
                      isSelected
                        ? 'border-[#0F2557] bg-[#EFF6FF] text-[#0F2557] font-medium'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:border-[#CBD5E1]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-[#0F2557] bg-[#0F2557] text-white'
                          : 'border-[#94A3B8] bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" aria-hidden="true" />}
                    </span>
                    <span>{sentence}</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={customPart}
              onChange={(e) => {
                setCustomPart(e.target.value);
                if (error) setError('');
              }}
              placeholder="선택한 문장 외에 직접 지적할 구절·요소가 있으면 입력해 주세요 (선택)"
              className="w-full min-h-[42px] rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            />
          </div>

          {/* 3. Free-text Reason */}
          <div className="space-y-2">
            <label htmlFor="appeal-reason" className="block text-sm font-bold text-[#0F172A]">
              3. 판단이 틀렸다고 생각한 이유
            </label>
            <textarea
              id="appeal-reason"
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="예: 배송 상태 후기인데 사용 경험이 없다고 감점된 것 같아요 / 특정 과장 표현이 아니라 10대 말투일 뿐이에요."
              className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            />
            {error && <p className="text-xs font-medium text-[#DC2626]">{error}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
            <p className="text-xs text-[#64748B]">
              {currentUser
                ? '제출된 이의 제기는 기준 개선 분석에 반영됩니다.'
                : '제출 시 Google 계정 확인 후 이의 제기가 안전하게 저장됩니다.'}
            </p>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0F2557] text-sm font-semibold text-white hover:bg-[#1E3A8A] transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>저장 중...</span>
                  </>
                ) : currentUser ? (
                  <span>이의 제기 제출</span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" aria-hidden="true" />
                    <span>Google 로그인 후 제출</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
