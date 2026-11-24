import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckSquare,
  Info,
  Loader2,
  Sparkles,
  Square,
  Star,
} from 'lucide-react';
import type { ReviewInputItem, SelectionMethod } from '../types/review';
import { selectBalancedReviews } from '../utils/criteriaScoring';

interface ReviewSelectionViewProps {
  allReviews: ReviewInputItem[];
  onBack: () => void;
  onStartAnalyze: (params: {
    selectedReviews: ReviewInputItem[];
    selectionMethod: SelectionMethod;
  }) => void;
  isLoading: boolean;
  retryStatus: string | null;
  errorMsg: string;
}

export function ReviewSelectionView({
  allReviews,
  onBack,
  onStartAnalyze,
  isLoading,
  retryStatus,
  errorMsg,
}: ReviewSelectionViewProps) {
  const autoBalanced = useMemo(() => selectBalancedReviews(allReviews, 15), [allReviews]);
  const [selectionMode, setSelectionMode] = useState<'auto' | 'manual'>('auto');
  const [manualIds, setManualIds] = useState<number[]>(() =>
    autoBalanced.selected.map((r) => r.id)
  );

  const manualSet = useMemo(() => new Set(manualIds), [manualIds]);
  const autoSet = useMemo(
    () => new Set(autoBalanced.selected.map((r) => r.id)),
    [autoBalanced]
  );

  const toggleManualId = (id: number) => {
    setManualIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 15) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const activeSelectedReviews =
    selectionMode === 'auto'
      ? autoBalanced.selected
      : allReviews.filter((r) => manualSet.has(r.id));

  const activeMethod: SelectionMethod =
    selectionMode === 'auto'
      ? autoBalanced.method === 'auto_rating'
        ? 'auto_rating'
        : 'auto_order'
      : 'manual';

  return (
    <div className="space-y-6 py-6 sm:py-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <span className="inline-block text-xs font-bold text-[#1E3A8A]">
            리뷰 15개 초과 · 분석 대상 선택
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2557] tracking-tight">
            분석할 리뷰 고르기
          </h1>
          <p className="text-sm sm:text-base text-[#475569]">
            총 <strong className="font-mono-num text-[#0F2557]">{allReviews.length}개</strong>의
            리뷰가 입력되었습니다. 한 번에 최대 15개씩 골라 정밀 분석하고, 원하면 이어서 15개씩 더 분석할 수 있어요.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>입력 화면으로</span>
        </button>
      </header>

      {/* Two Selection Modes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auto Balanced (Default) */}
        <button
          type="button"
          onClick={() => setSelectionMode('auto')}
          disabled={isLoading}
          className={`text-left rounded-xl border-2 p-5 transition-colors space-y-2.5 ${
            selectionMode === 'auto'
              ? 'border-[#0F2557] bg-[#EFF6FF]/60'
              : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-base font-bold text-[#0F2557]">
              <Sparkles className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
              <span>자동으로 고르기 (기본값)</span>
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded ${
                selectionMode === 'auto'
                  ? 'bg-[#0F2557] text-white'
                  : 'bg-[#F1F5F9] text-[#64748B]'
              }`}
            >
              15개 자동 선택
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#1E3A8A] leading-relaxed font-medium">
            맨 위 리뷰만 고르면 쇼핑몰이 먼저 보여주는 리뷰로 치우칠 수 있어서, 골고루 뽑아요
          </p>
          <p className="text-xs text-[#475569] font-mono-num">
            선택 방식: {autoBalanced.summaryLabel}
          </p>
        </button>

        {/* Manual Selection */}
        <button
          type="button"
          onClick={() => setSelectionMode('manual')}
          disabled={isLoading}
          className={`text-left rounded-xl border-2 p-5 transition-colors space-y-2.5 ${
            selectionMode === 'manual'
              ? 'border-[#0F2557] bg-[#EFF6FF]/60'
              : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-base font-bold text-[#0F2557]">
              <CheckSquare className="w-4 h-4 text-[#0F2557]" aria-hidden="true" />
              <span>직접 고르기</span>
            </span>
            <span
              className={`text-xs font-bold font-mono-num px-2.5 py-0.5 rounded ${
                selectionMode === 'manual'
                  ? 'bg-[#0F2557] text-white'
                  : 'bg-[#F1F5F9] text-[#64748B]'
              }`}
            >
              {manualIds.length} / 15개 선택됨
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
            아래 전체 리뷰 목록에서 내가 확인하고 싶은 리뷰를 최대 15개까지 직접 체크해 선택합니다.
          </p>
        </button>
      </div>

      {/* Whole-corpus duplicate detection assurance */}
      <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 flex items-start gap-2.5 text-xs sm:text-sm text-[#334155]">
        <Info className="w-4 h-4 text-[#0F2557] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="text-[#0F2557]">전체 복붙 비교 안내:</strong> 어떤 15개를 고르더라도,
          “다른 리뷰와 문장이 거의 같음” 검사는 선택되지 않은 나머지 리뷰까지 포함한{' '}
          <strong className="font-mono-num text-[#0F2557]">전체 {allReviews.length}개</strong>를
          대상으로 코드가 직접 비교합니다.
        </p>
      </div>

      {/* Review List (Checkboxes in Manual mode, Preview highlights in Auto mode) */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-bold text-[#0F2557]">
            {selectionMode === 'auto'
              ? `자동 선택된 15개 미리보기 (전체 ${allReviews.length}개 중 파란색 표시)`
              : `직접 선택 (${manualIds.length} / 15개)`}
          </span>

          {selectionMode === 'manual' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setManualIds(autoBalanced.selected.map((r) => r.id))}
                className="text-xs font-semibold text-[#1E3A8A] hover:underline"
              >
                자동 추천 15개 채우기
              </button>
              <span aria-hidden="true" className="text-[#CBD5E1]">
                |
              </span>
              <button
                type="button"
                onClick={() => setManualIds([])}
                className="text-xs font-medium text-[#64748B] hover:text-[#DC2626]"
              >
                선택 비우기
              </button>
            </div>
          )}
        </div>

        <ul className="divide-y divide-[#F1F5F9] max-h-[460px] overflow-y-auto">
          {allReviews.map((review) => {
            const isChecked =
              selectionMode === 'auto' ? autoSet.has(review.id) : manualSet.has(review.id);
            const manualLimitReached =
              selectionMode === 'manual' && !isChecked && manualIds.length >= 15;

            return (
              <li
                key={review.id}
                className={`px-5 py-3.5 transition-colors ${
                  isChecked ? 'bg-[#EFF6FF]/50' : 'bg-white'
                }`}
              >
                <label
                  className={`flex items-start gap-3 ${
                    selectionMode === 'manual' && !manualLimitReached
                      ? 'cursor-pointer'
                      : 'cursor-default'
                  }`}
                >
                  {selectionMode === 'manual' ? (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isLoading || manualLimitReached}
                      onChange={() => toggleManualId(review.id)}
                      className="mt-1 w-4 h-4 accent-[#0F2557] shrink-0"
                    />
                  ) : isChecked ? (
                    <CheckSquare
                      className="w-4 h-4 text-[#1D4ED8] mt-1 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Square
                      className="w-4 h-4 text-[#CBD5E1] mt-1 shrink-0"
                      aria-hidden="true"
                    />
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-num font-bold text-[#0F2557]">
                        리뷰 #{review.id}
                      </span>
                      {review.rating !== null && (
                        <span className="inline-flex items-center gap-0.5 font-mono-num font-semibold text-[#334155]">
                          <Star
                            className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]"
                            aria-hidden="true"
                          />
                          {review.rating}점
                        </span>
                      )}
                      {review.date && (
                        <span className="font-mono-num text-[#64748B]">{review.date}</span>
                      )}
                      {review.hasPhoto && (
                        <span className="inline-flex items-center gap-0.5 text-[#475569]">
                          <Camera className="w-3 h-3" aria-hidden="true" />
                          사진
                        </span>
                      )}
                      {isChecked && selectionMode === 'auto' && (
                        <span className="text-[11px] font-semibold text-[#1D4ED8]">
                          · 자동 선택됨
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-[#334155] line-clamp-2 leading-relaxed">
                      {review.text}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {isLoading && retryStatus && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3.5 text-sm text-[#1E3A8A]"
        >
          <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
          <span>{retryStatus}</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3.5 text-sm text-[#991B1B]"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <button
          type="button"
          disabled={isLoading || activeSelectedReviews.length === 0}
          onClick={() =>
            onStartAnalyze({
              selectedReviews: activeSelectedReviews,
              selectionMethod: activeMethod,
            })
          }
          className="min-h-[48px] inline-flex items-center justify-center gap-2 px-7 py-3 rounded-lg bg-[#0F2557] text-white text-base font-semibold hover:bg-[#1E3A8A] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              <span>{retryStatus || '선택한 리뷰를 분석하고 있습니다...'}</span>
            </>
          ) : (
            <span>선택한 리뷰 분석하기 ({activeSelectedReviews.length}건)</span>
          )}
        </button>
      </div>
    </div>
  );
}
