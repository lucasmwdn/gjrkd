import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  GitMerge,
  Loader2,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import type { ExtractedReviewItem, ProductInfo } from '../types/review';
import { ProductInfoSection } from './ProductInfoSection';

interface ImageReviewVerifierProps {
  sourceMode?: 'image' | 'link';
  reviews: ExtractedReviewItem[];
  onChangeReviews: (next: ExtractedReviewItem[]) => void;
  productInfo: ProductInfo;
  onChangeProductInfo: (next: ProductInfo) => void;
  autoFilledProductName: boolean;
  onBackToUpload: () => void;
  onConfirmAnalyze: () => void;
  isAnalyzing: boolean;
  retryStatus?: string | null;
  errorMsg: string;
}

const PRESET_PLATFORM_TAGS = ['체험단', '광고', '협찬', '내돈내산', '한달사용'];

interface HighlightPiece {
  text: string;
  uncertain: boolean;
}

function splitUncertainText(text: string, uncertainQuotes: string[]): HighlightPiece[] {
  const quotes = uncertainQuotes.map((q) => q.trim()).filter((q) => q.length >= 1);
  if (quotes.length === 0) {
    return [{ text, uncertain: false }];
  }

  const spans: { start: number; end: number }[] = [];
  for (const quote of quotes) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(quote, searchFrom);
      if (idx === -1) break;
      spans.push({ start: idx, end: idx + quote.length });
      searchFrom = idx + quote.length;
    }
  }

  if (spans.length === 0) {
    return [{ text, uncertain: false }];
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (!last || s.start > last.end) {
      merged.push({ ...s });
    } else if (s.end > last.end) {
      last.end = s.end;
    }
  }

  const pieces: HighlightPiece[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) {
      pieces.push({ text: text.slice(cursor, m.start), uncertain: false });
    }
    pieces.push({ text: text.slice(m.start, m.end), uncertain: true });
    cursor = m.end;
  }
  if (cursor < text.length) {
    pieces.push({ text: text.slice(cursor), uncertain: false });
  }
  return pieces;
}

export function ImageReviewVerifier({
  sourceMode = 'image',
  reviews,
  onChangeReviews,
  productInfo,
  onChangeProductInfo,
  autoFilledProductName,
  onBackToUpload,
  onConfirmAnalyze,
  isAnalyzing,
  retryStatus = null,
  errorMsg,
}: ImageReviewVerifierProps) {
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const updateItem = (tempId: string, patch: Partial<ExtractedReviewItem>) => {
    onChangeReviews(
      reviews.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
    );
  };

  const handleMergeWithNext = (index: number) => {
    if (index < 0 || index >= reviews.length - 1) return;
    const current = reviews[index];
    const next = reviews[index + 1];

    const mergedTags = Array.from(new Set([...current.platformTags, ...next.platformTags]));
    const mergedQuotes = Array.from(
      new Set([...current.uncertainQuotes, ...next.uncertainQuotes])
    );
    const mergedFields = Array.from(
      new Set([...current.uncertainFields, ...next.uncertainFields])
    );

    const merged: ExtractedReviewItem = {
      ...current,
      text: `${current.text.trim()}\n${next.text.trim()}`.trim(),
      rating: current.rating ?? next.rating,
      date: current.date || next.date,
      hasPhoto: current.hasPhoto || next.hasPhoto,
      platformTags: mergedTags,
      uncertainQuotes: mergedQuotes,
      uncertainFields: mergedFields,
    };

    const updated = [...reviews];
    updated.splice(index, 2, merged);
    onChangeReviews(updated);
  };

  const handleDelete = (tempId: string) => {
    onChangeReviews(reviews.filter((r) => r.tempId !== tempId));
  };

  const handleAddBlankReview = () => {
    onChangeReviews([
      ...reviews,
      {
        tempId: `manual-${Date.now()}`,
        text: '',
        rating: null,
        date: '',
        hasPhoto: false,
        platformTags: [],
        uncertainQuotes: [],
        uncertainFields: [],
      },
    ]);
  };

  const toggleTag = (item: ExtractedReviewItem, tag: string) => {
    const exists = item.platformTags.includes(tag);
    updateItem(item.tempId, {
      platformTags: exists
        ? item.platformTags.filter((t) => t !== tag)
        : [...item.platformTags, tag],
    });
  };

  const handleAddCustomTag = (item: ExtractedReviewItem) => {
    const raw = (tagDrafts[item.tempId] ?? '').trim();
    if (!raw) return;
    if (!item.platformTags.includes(raw)) {
      updateItem(item.tempId, { platformTags: [...item.platformTags, raw] });
    }
    setTagDrafts((prev) => ({ ...prev, [item.tempId]: '' }));
  };

  const hasAnyUncertain = reviews.some(
    (r) => r.uncertainQuotes.length > 0 || r.uncertainFields.length > 0
  );

  const validReviewCount = reviews.filter((r) => r.text.trim().length > 0).length;

  return (
    <div className="space-y-8 py-6 sm:py-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2557] tracking-tight">
            인식 결과 확인
          </h1>
          <p className="text-sm sm:text-base text-[#475569]">
            {sourceMode === 'link'
              ? '링크에서 불러온 리뷰예요. 원문과 다른 곳이 있으면 고쳐 주세요. 작성자 닉네임과 프로필은 수집하거나 저장하지 않습니다.'
              : '이미지에서 읽은 리뷰를 확인하고 필요한 부분을 수정하세요. 작성자 닉네임과 프로필은 인식하거나 저장하지 않습니다.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToUpload}
          disabled={isAnalyzing}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{sourceMode === 'link' ? '링크 다시 입력' : '이미지 다시 선택'}</span>
        </button>
      </header>

      {sourceMode === 'link' && (
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 flex items-start gap-3 text-sm text-[#1E3A8A]">
          <AlertTriangle className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong>링크에서 불러온 리뷰예요. 원문과 다른 곳이 있으면 고쳐 주세요.</strong>{' '}
            쇼핑몰 페이지 구조에 따라 별점·날짜·사진 여부가 빠졌을 수 있으니 확인한 뒤 분석을 시작해 주세요.
          </p>
        </div>
      )}

      <ProductInfoSection
        productInfo={productInfo}
        onChange={onChangeProductInfo}
        autoFilledFromImage={autoFilledProductName}
        autoFilledLabel={
          sourceMode === 'link'
            ? '링크 페이지에서 상품명을 자동으로 채웠어요'
            : '이미지에서 상품명을 자동으로 채웠어요'
        }
        disabled={isAnalyzing}
        defaultExpanded={
          autoFilledProductName ||
          productInfo.name.trim().length > 0 ||
          productInfo.category !== '' ||
          productInfo.description.trim().length > 0
        }
      />

      {hasAnyUncertain && (
        <div className="bg-[#FEF9C3] border border-[#FDE047] rounded-xl p-4 flex items-start gap-3 text-sm text-[#713F12]">
          <AlertTriangle className="w-5 h-5 text-[#CA8A04] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            글자가 흐리거나 잘려 인식 정확도가 낮은 부분은{' '}
            <mark className="bg-[#FEF08A] text-[#713F12] px-1 rounded-xs font-semibold">
              노란색
            </mark>
            으로 표시했습니다. 분석 전에 원문과 맞는지 확인하고 고쳐 주세요.
          </p>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-4">
          <p className="text-sm text-[#475569]">확인할 리뷰가 모두 삭제되었습니다.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleAddBlankReview}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>리뷰 직접 추가</span>
            </button>
            <button
              type="button"
              onClick={onBackToUpload}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#0F2557] text-sm font-semibold text-white hover:bg-[#1E3A8A]"
            >
              {sourceMode === 'link' ? '링크 다시 입력' : '이미지 다시 올리기'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {reviews.map((item, idx) => {
            const isTextUncertain =
              item.uncertainFields.includes('text') || item.uncertainQuotes.length > 0;
            const isRatingUncertain = item.uncertainFields.includes('rating');
            const isDateUncertain =
              item.date.trim().length > 0 && item.uncertainFields.includes('date');
            const highlightPieces = splitUncertainText(item.text, item.uncertainQuotes);

            return (
              <article
                key={item.tempId}
                className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5"
              >
                {/* Card Header with Merge & Delete */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-[#0F2557]">인식된 리뷰 #{idx + 1}</span>
                    {isTextUncertain || isRatingUncertain || isDateUncertain ? (
                      <span className="text-xs font-semibold text-[#A16207]">
                        · 흐린 부분 확인 필요
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {idx < reviews.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMergeWithNext(idx)}
                        disabled={isAnalyzing}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap"
                      >
                        <GitMerge className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>아래 리뷰와 합치기</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(item.tempId)}
                      disabled={isAnalyzing}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#FECACA] bg-white text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>삭제</span>
                    </button>
                  </div>
                </div>

                {/* Yellow highlight preview if uncertain quotes exist */}
                {item.uncertainQuotes.length > 0 && (
                  <div className="bg-[#FEFCE8] border border-[#FDE047] rounded-lg p-3.5 space-y-1.5">
                    <span className="block text-xs font-semibold text-[#854D0E]">
                      글자가 흐려 확인이 필요한 부분 (노란색 표시)
                    </span>
                    <p className="text-sm leading-relaxed text-[#1E293B] whitespace-pre-wrap">
                      {highlightPieces.map((piece, pIdx) =>
                        piece.uncertain ? (
                          <mark
                            key={pIdx}
                            className="bg-[#FEF08A] text-[#713F12] border-b-2 border-[#CA8A04] px-0.5 rounded-xs font-medium"
                          >
                            {piece.text}
                          </mark>
                        ) : (
                          <span key={pIdx}>{piece.text}</span>
                        )
                      )}
                    </p>
                  </div>
                )}

                {/* Editable Review Body */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={`verify-text-${item.tempId}`}
                    className="block text-xs font-bold text-[#0F2557]"
                  >
                    리뷰 본문 (수정 가능)
                  </label>
                  <textarea
                    id={`verify-text-${item.tempId}`}
                    rows={4}
                    value={item.text}
                    onChange={(e) => updateItem(item.tempId, { text: e.target.value })}
                    placeholder="리뷰 본문을 입력하거나 수정하세요."
                    className={`w-full rounded-lg border p-3.5 text-sm leading-relaxed text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] ${
                      isTextUncertain
                        ? 'border-[#EAB308] bg-[#FEFCE8]'
                        : 'border-[#CBD5E1] bg-[#F8FAFC] focus:bg-white'
                    }`}
                  />
                </div>

                {/* Metadata Row: Rating, Date, Photo Attachment */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Star Rating */}
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      isRatingUncertain
                        ? 'border-[#EAB308] bg-[#FEFCE8]'
                        : 'border-[#E2E8F0] bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0F2557]">별점 (별 개수)</span>
                      {isRatingUncertain && (
                        <span className="text-[11px] font-semibold text-[#A16207]">흐림 확인</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateItem(item.tempId, { rating: null })}
                        className={`min-h-[32px] px-2 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                          item.rating === null
                            ? 'bg-[#0F2557] text-white'
                            : 'text-[#64748B] hover:bg-white'
                        }`}
                      >
                        미인식
                      </button>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => updateItem(item.tempId, { rating: star })}
                          aria-label={`${star}점`}
                          className={`min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded text-xs font-mono-num font-semibold transition-colors ${
                            item.rating === star
                              ? 'bg-[#0F2557] text-white'
                              : 'text-[#475569] hover:bg-white'
                          }`}
                        >
                          <Star
                            className={`w-3.5 h-3.5 mr-0.5 ${
                              item.rating !== null && star <= item.rating
                                ? 'fill-[#F59E0B] text-[#F59E0B]'
                                : 'text-[#94A3B8]'
                            }`}
                            aria-hidden="true"
                          />
                          {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date (Optional) */}
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      isDateUncertain
                        ? 'border-[#EAB308] bg-[#FEFCE8]'
                        : 'border-[#E2E8F0] bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`verify-date-${item.tempId}`}
                        className="text-xs font-bold text-[#0F2557]"
                      >
                        작성 날짜 <span className="font-normal text-[#64748B]">(선택)</span>
                      </label>
                      {isDateUncertain ? (
                        <span className="text-[11px] font-semibold text-[#A16207]">흐림 확인</span>
                      ) : item.date.trim().length > 0 ? (
                        <button
                          type="button"
                          onClick={() => updateItem(item.tempId, { date: '' })}
                          className="text-[11px] font-medium text-[#64748B] hover:text-[#0F2557]"
                        >
                          지우기
                        </button>
                      ) : null}
                    </div>
                    <input
                      id={`verify-date-${item.tempId}`}
                      type="text"
                      value={item.date}
                      onChange={(e) => updateItem(item.tempId, { date: e.target.value })}
                      placeholder="없으면 비워 두세요 (예: 2026-11-18)"
                      className="w-full min-h-[36px] rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-sm font-mono-num text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    />
                  </div>

                  {/* Photo Attachment */}
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2 flex flex-col justify-between">
                    <span className="text-xs font-bold text-[#0F2557]">사진 첨부 여부</span>
                    <label className="min-h-[36px] inline-flex items-center gap-2.5 cursor-pointer text-sm text-[#0F172A]">
                      <input
                        type="checkbox"
                        checked={item.hasPhoto}
                        onChange={(e) => updateItem(item.tempId, { hasPhoto: e.target.checked })}
                        className="w-4 h-4 accent-[#0F2557] rounded"
                      />
                      <Camera className="w-4 h-4 text-[#475569]" aria-hidden="true" />
                      <span>리뷰에 사진 첨부됨</span>
                    </label>
                  </div>
                </div>

                {/* Platform Disclosure Tags (Optional) */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-[#0F2557]">
                      플랫폼 표시 <span className="font-normal text-[#64748B]">(선택 · 체험단·광고·협찬 등)</span>
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      해당 표시가 없으면 선택하지 않고 진행해도 됩니다.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_PLATFORM_TAGS.map((tag) => {
                      const active = item.platformTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(item, tag)}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-[#0F2557] text-white border-[#0F2557]'
                              : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}

                    {item.platformTags
                      .filter((t) => !PRESET_PLATFORM_TAGS.includes(t))
                      .map((customTag) => (
                        <button
                          key={customTag}
                          type="button"
                          onClick={() => toggleTag(item, customTag)}
                          className="min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold border bg-[#0F2557] text-white border-[#0F2557] whitespace-nowrap"
                          title="누르면 제거"
                        >
                          {customTag} ×
                        </button>
                      ))}

                    <div className="inline-flex items-center gap-1.5">
                      <input
                        type="text"
                        value={tagDrafts[item.tempId] ?? ''}
                        onChange={(e) =>
                          setTagDrafts((prev) => ({ ...prev, [item.tempId]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomTag(item);
                          }
                        }}
                        placeholder="직접 입력"
                        aria-label="플랫폼 표시 직접 입력"
                        className="w-28 min-h-[34px] rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddCustomTag(item)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] text-xs font-semibold text-[#0F2557] hover:bg-[#F1F5F9] whitespace-nowrap"
                      >
                        추가
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={handleAddBlankReview}
              disabled={isAnalyzing}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>빠진 리뷰 직접 추가</span>
            </button>

            <button
              type="button"
              onClick={onConfirmAnalyze}
              disabled={isAnalyzing || validReviewCount === 0}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-7 py-3 rounded-lg bg-[#0F2557] text-white text-base font-semibold hover:bg-[#1E3A8A] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>{retryStatus || '신호와 일관성을 분석하고 있습니다...'}</span>
                </>
              ) : validReviewCount > 15 ? (
                <span>분석할 리뷰 고르기 (총 {validReviewCount}건)</span>
              ) : (
                <span>이대로 분석하기 ({validReviewCount}건)</span>
              )}
            </button>
          </div>

          {isAnalyzing && retryStatus && (
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
        </div>
      )}
    </div>
  );
}
