import { ChevronDown, ChevronUp, PackageSearch } from 'lucide-react';
import { useState } from 'react';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductInfo,
} from '../types/review';

interface ProductInfoSectionProps {
  productInfo: ProductInfo;
  onChange: (next: ProductInfo) => void;
  autoFilledFromImage?: boolean;
  autoFilledLabel?: string;
  disabled?: boolean;
  defaultExpanded?: boolean;
}

export function ProductInfoSection({
  productInfo,
  onChange,
  autoFilledFromImage = false,
  autoFilledLabel = '이미지에서 상품명을 자동으로 채웠어요',
  disabled = false,
  defaultExpanded = true,
}: ProductInfoSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasContent =
    productInfo.name.trim().length > 0 ||
    productInfo.category !== '' ||
    productInfo.description.trim().length > 0;

  return (
    <section
      aria-label="상품 정보 입력"
      className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <PackageSearch className="w-4 h-4 text-[#0F2557] shrink-0" aria-hidden="true" />
            <h2 className="text-sm sm:text-base font-bold text-[#0F2557]">
              상품 정보 <span className="font-normal text-xs text-[#64748B]">(모두 선택 입력)</span>
            </h2>
            {autoFilledFromImage && productInfo.name.trim().length > 0 && (
              <span className="text-xs font-medium text-[#1E3A8A]">
                · {autoFilledLabel}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#475569]">
            상품 정보를 넣으면 더 정확하게 분석할 수 있어요
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="min-h-[36px] inline-flex items-center gap-1 text-xs font-semibold text-[#475569] hover:text-[#0F2557] transition-colors whitespace-nowrap"
        >
          <span>{expanded ? '접기' : hasContent ? '수정하기' : '입력 열기'}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {!expanded && hasContent && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#334155] pt-1 border-t border-[#F1F5F9]">
          <span className="font-semibold text-[#0F2557]">
            {productInfo.name.trim() || '상품명 미입력'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{productInfo.category || '카테고리 선택 안 함'}</span>
          {productInfo.description.trim().length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#64748B]">상품 설명 입력됨</span>
            </>
          )}
        </div>
      )}

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-[#F1F5F9]">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* 상품명 */}
            <div className="md:col-span-7 space-y-1.5">
              <label htmlFor="product-name-input" className="block text-xs font-bold text-[#0F2557]">
                상품명
              </label>
              <input
                id="product-name-input"
                type="text"
                value={productInfo.name}
                disabled={disabled}
                onChange={(e) => onChange({ ...productInfo, name: e.target.value })}
                placeholder="예: 경량 무선 블루투스 이어폰 / 데일리 코튼 백팩"
                className="w-full min-h-[42px] rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] disabled:opacity-60"
              />
            </div>

            {/* 카테고리 */}
            <div className="md:col-span-5 space-y-1.5">
              <label
                htmlFor="product-category-select"
                className="block text-xs font-bold text-[#0F2557]"
              >
                카테고리
              </label>
              <select
                id="product-category-select"
                value={productInfo.category}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...productInfo, category: e.target.value as ProductCategory })
                }
                className="w-full min-h-[42px] rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 py-2 text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] disabled:opacity-60"
              >
                <option value="">선택 안 함 (일반 기준 적용)</option>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 상품 설명 */}
          <div className="space-y-1.5">
            <label
              htmlFor="product-description-input"
              className="block text-xs font-bold text-[#0F2557]"
            >
              상품 설명 (상세페이지 핵심 문구)
            </label>
            <textarea
              id="product-description-input"
              rows={3}
              value={productInfo.description}
              disabled={disabled}
              onChange={(e) => onChange({ ...productInfo, description: e.target.value })}
              placeholder="상세페이지에 적힌 주요 특징·스펙 문구를 붙여넣으면, 상품 특성과 모순되는 리뷰나 설명 문구를 그대로 베낀 리뷰도 찾아냅니다."
              className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3.5 text-sm leading-relaxed text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] disabled:opacity-60"
            />
          </div>
        </div>
      )}
    </section>
  );
}
