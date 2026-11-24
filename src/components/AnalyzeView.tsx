import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  FileText,
  Globe,
  ImagePlus,
  Info,
  Link2,
  Loader2,
  Package,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react';
import type {
  AppealItem,
  BatchAnalysisResponse,
  CriteriaConfig,
  ExtractedReviewItem,
  InputSource,
  ProductInfo,
  ReviewAnalysisResult,
  ReviewInputItem,
  SelectionMethod,
  UrlExtractResponse,
} from '../types/review';
import { fetchActiveCriteriaFromFirestore } from '../services/firestoreService';
import {
  AiRequestError,
  fetchAiWithRetry,
  INVALID_RESPONSE_MESSAGE,
} from '../utils/aiFetch';
import { selectBalancedReviews } from '../utils/criteriaScoring';
import { prepareImageForUpload, type PreparedImage } from '../utils/image';
import { ImageReviewVerifier } from './ImageReviewVerifier';
import { ProductInfoSection } from './ProductInfoSection';
import { ReviewResultCard } from './ReviewResultCard';
import { ReviewSelectionView } from './ReviewSelectionView';

interface AnalyzeViewProps {
  criteria: CriteriaConfig;
  productInfo: ProductInfo;
  onChangeProductInfo: (next: ProductInfo) => void;
  rawText: string;
  onChangeRawText: (value: string) => void;
  ratingsByIndex: Record<number, number | null>;
  onChangeRating: (index: number, rating: number | null) => void;
  onClearAll: () => void;
  analysisResult: BatchAnalysisResponse | null;
  onAnalysisComplete: (result: BatchAnalysisResponse | null) => void;
  appeals: AppealItem[];
  onRequestAppeal: (review: ReviewAnalysisResult, productInfo?: ProductInfo) => void;
}

const SAMPLE_CACHE_STORAGE_KEY = 'rtr_cached_sample_analysis_v2';

const SAMPLE_REVIEWS_TEXT = `고1 입학하면서 3주째 매일 교과서 5권이랑 15인치 노트북(무게 약 1.6kg) 넣고 등하교 중입니다. 어깨끈 쿠션이 두꺼워서 통학할 때 편하고 사진처럼 안쪽 수납 포켓이 3개로 나뉘어 있어서 필통이랑 보조배터리 정리가 잘 됩니다. 다만 앞쪽 작은 지퍼가 처음엔 약간 뻑뻑해서 여러 번 여닫아야 부드러워졌어요.

무조건 사세요!! 태어나서 써본 가방 중 진짜 역대급 인생템입니다!! 디자인도 완벽하고 100% 만족해서 지금 할인할 때 바로 쟁여두세요! #꿀템추천 #필수템 #가성비갑

무조건 사세요! 태어나서 써본 것 중 진짜 역대급 인생템이에요! 디자인도 완벽 그 자체이고 100% 만족합니다! 지금 바로 구매하세요! #필수템 #꿀템추천

배송은 하루 만에 왔는데 가방 바닥 보강재가 너무 얇아서 책 두 권만 넣어도 축 처지고 실밥도 여기저기 튀어나와 있어서 교환 신청했습니다.`;

const SAMPLE_RATINGS: Record<number, number | null> = {
  0: 4,
  1: 5,
  2: 5,
  3: 5, // Deliberate mismatch with negative content
};

export function splitReviews(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function getSelectionMethodLabel(method?: SelectionMethod): string {
  switch (method) {
    case 'auto_rating':
      return '자동·별점 고르게';
    case 'auto_order':
      return '자동·순서 고르게';
    case 'manual':
      return '직접 선택';
    case 'all':
    default:
      return '전체 입력';
  }
}

function validateHttpUrl(input: string): { valid: boolean; normalized?: string; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: '상품 페이지 링크(URL)를 입력해 주세요.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: 'http:// 또는 https:// 로 시작하는 웹 링크만 입력할 수 있습니다.',
      };
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return {
        valid: false,
        error: '올바른 쇼핑몰 웹페이지 주소(예: https://...)를 입력해 주세요.',
      };
    }
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return {
      valid: false,
      error: '올바른 웹 링크 형식이 아닙니다. http:// 또는 https:// 로 시작하는 주소를 입력해 주세요.',
    };
  }
}

function saveSampleAnalysisCache(result: BatchAnalysisResponse) {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      result: {
        ...result,
        isCachedDemoFallback: false,
      },
    };
    window.localStorage.setItem(SAMPLE_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

function loadSampleAnalysisCache(): {
  savedAt: string;
  result: BatchAnalysisResponse;
} | null {
  try {
    const raw = window.localStorage.getItem(SAMPLE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      savedAt?: string;
      result?: BatchAnalysisResponse;
    };
    if (
      !parsed ||
      !parsed.result ||
      !Array.isArray(parsed.result.results) ||
      parsed.result.results.length === 0
    ) {
      return null;
    }
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      result: parsed.result,
    };
  } catch {
    return null;
  }
}

export function AnalyzeView({
  criteria,
  productInfo,
  onChangeProductInfo,
  rawText,
  onChangeRawText,
  ratingsByIndex,
  onChangeRating,
  onClearAll,
  analysisResult,
  onAnalysisComplete,
  appeals,
  onRequestAppeal,
}: AnalyzeViewProps) {
  const [inputMode, setInputMode] = useState<InputSource>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [extractRetryStatus, setExtractRetryStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showInputForm, setShowInputForm] = useState(!analysisResult);

  // Image & Link extracted verifier state
  const [uploadedImages, setUploadedImages] = useState<PreparedImage[]>([]);
  const [extractedReviews, setExtractedReviews] = useState<ExtractedReviewItem[] | null>(null);
  const [verifierSource, setVerifierSource] = useState<'image' | 'link'>('image');
  const [autoFilledProductName, setAutoFilledProductName] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Link mode state
  const [linkUrl, setLinkUrl] = useState('');
  const [isFetchingLink, setIsFetchingLink] = useState(false);
  const [linkRetryStatus, setLinkRetryStatus] = useState<string | null>(null);
  const [linkOutcomeNotice, setLinkOutcomeNotice] = useState<{
    kind: 'no_reviews' | 'unreadable';
    reason?: string;
  } | null>(null);

  // >15 reviews selection & incremental analysis state
  const [pendingSelection, setPendingSelection] = useState<{
    allReviews: ReviewInputItem[];
    source: InputSource;
  } | null>(null);
  const [sessionAllReviews, setSessionAllReviews] = useState<ReviewInputItem[]>([]);
  const [sessionSource, setSessionSource] = useState<InputSource>('text');

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const parsedBlocks = useMemo(() => splitReviews(rawText), [rawText]);

  const handleAddFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) {
      setErrorMsg('이미지 파일(PNG, JPG, WebP 등)만 업로드할 수 있습니다.');
      return;
    }

    setErrorMsg('');
    try {
      const prepared = await Promise.all(fileArray.map((f) => prepareImageForUpload(f)));
      setUploadedImages((prev) => {
        const combined = [...prev, ...prepared];
        if (combined.length > 10) {
          setErrorMsg('이미지는 한 번에 최대 10장까지 올릴 수 있어 앞의 10장만 유지했습니다.');
          return combined.slice(0, 10);
        }
        return combined;
      });
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : '이미지를 불러오는 중 오류가 발생했습니다.'
      );
    }
  }, []);

  // Support Ctrl+V image paste when image upload screen is active
  useEffect(() => {
    if (inputMode !== 'image' || !showInputForm || extractedReviews !== null || pendingSelection !== null) {
      return;
    }

    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void handleAddFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [inputMode, showInputForm, extractedReviews, pendingSelection, handleAddFiles]);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleExtractFromImages = async () => {
    if (uploadedImages.length === 0) {
      setErrorMsg('리뷰 캡처 이미지를 한 장 이상 올려 주세요.');
      return;
    }

    setErrorMsg('');
    setExtractRetryStatus(null);
    setIsExtracting(true);

    try {
      const data = await fetchAiWithRetry<{
        detectedProductName?: string | null;
        reviews?: ExtractedReviewItem[];
      }>({
        url: '/api/extract-reviews',
        body: {
          images: uploadedImages.map((img) => ({
            mimeType: img.mimeType,
            data: img.data,
          })),
        },
        timeoutMs: 55000,
        onStatusChange: setExtractRetryStatus,
        validateData: (d) =>
          Boolean(
            d &&
              typeof d === 'object' &&
              Array.isArray((d as { reviews?: unknown[] }).reviews)
          ),
        invalidResponseMessage: INVALID_RESPONSE_MESSAGE,
      });

      if (
        typeof data.detectedProductName === 'string' &&
        data.detectedProductName.trim().length > 0 &&
        productInfo.name.trim().length === 0
      ) {
        onChangeProductInfo({
          ...productInfo,
          name: data.detectedProductName.trim(),
        });
        setAutoFilledProductName(true);
      } else {
        setAutoFilledProductName(false);
      }

      setVerifierSource('image');
      setExtractedReviews((data.reviews ?? []) as ExtractedReviewItem[]);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : INVALID_RESPONSE_MESSAGE
      );
    } finally {
      setExtractRetryStatus(null);
      setIsExtracting(false);
    }
  };

  const handleExtractFromLink = async () => {
    const check = validateHttpUrl(linkUrl);
    if (!check.valid || !check.normalized) {
      setErrorMsg(check.error || '올바른 웹 링크(http:// 또는 https://)를 입력해 주세요.');
      setLinkOutcomeNotice(null);
      return;
    }

    setErrorMsg('');
    setLinkOutcomeNotice(null);
    setLinkRetryStatus(null);
    setIsFetchingLink(true);

    try {
      const data = await fetchAiWithRetry<UrlExtractResponse>({
        url: '/api/extract-reviews-from-url',
        body: {
          url: check.normalized,
        },
        timeoutMs: 30000,
        timeoutMessage: '페이지를 불러오는 데 30초 이상 걸려 중단했어요.',
        onStatusChange: setLinkRetryStatus,
        validateData: (d) =>
          Boolean(
            d &&
              typeof d === 'object' &&
              typeof (d as UrlExtractResponse).outcome === 'string'
          ),
        invalidResponseMessage: INVALID_RESPONSE_MESSAGE,
      });

      if (
        data.outcome === 'found' &&
        Array.isArray(data.reviews) &&
        data.reviews.length > 0
      ) {
        if (
          typeof data.detectedProductName === 'string' &&
          data.detectedProductName.trim().length > 0 &&
          productInfo.name.trim().length === 0
        ) {
          onChangeProductInfo({
            ...productInfo,
            name: data.detectedProductName.trim(),
          });
          setAutoFilledProductName(true);
        } else {
          setAutoFilledProductName(false);
        }

        setVerifierSource('link');
        setExtractedReviews(data.reviews);
        return;
      }

      if (data.outcome === 'unreadable') {
        setLinkOutcomeNotice({
          kind: 'unreadable',
          reason:
            data.reason ||
            '로그인이 필요하거나 접근이 제한된 페이지여서 내용을 읽지 못했어요.',
        });
        return;
      }

      setLinkOutcomeNotice({
        kind: 'no_reviews',
      });
    } catch (err: unknown) {
      if (err instanceof AiRequestError && err.kind === 'timeout') {
        setLinkOutcomeNotice({
          kind: 'unreadable',
          reason: '페이지를 불러오는 데 30초 이상 걸려 중단했어요.',
        });
      } else {
        setErrorMsg(
          err instanceof Error && err.message.trim()
            ? err.message
            : INVALID_RESPONSE_MESSAGE
        );
      }
    } finally {
      setLinkRetryStatus(null);
      setIsFetchingLink(false);
    }
  };

  const handleLoadSample = () => {
    onChangeRawText(SAMPLE_REVIEWS_TEXT);
    Object.entries(SAMPLE_RATINGS).forEach(([idx, val]) => {
      onChangeRating(Number(idx), val);
    });
    if (
      productInfo.name.trim() === '' &&
      productInfo.category === '' &&
      productInfo.description.trim() === ''
    ) {
      onChangeProductInfo({
        name: '데일리 경량 통학 백팩 25L',
        category: '생활용품',
        description:
          '무게 680g의 초경량 생활방수 원단, 15인치 노트북 전용 수납 포켓 및 3단 내부 분리 포켓 탑재.',
      });
    }
    setErrorMsg('');
    setPendingSelection(null);
    onAnalysisComplete(null);
    setShowInputForm(true);
  };

  const runAnalysis = async (params: {
    selectedReviews: ReviewInputItem[];
    allReviews: ReviewInputItem[];
    source: InputSource;
    selectionMethod: SelectionMethod;
    append?: boolean;
  }) => {
    const {
      selectedReviews,
      allReviews,
      source,
      selectionMethod,
      append = false,
    } = params;

    const isExactSampleInput =
      !append &&
      source === 'text' &&
      rawText.trim() === SAMPLE_REVIEWS_TEXT.trim() &&
      allReviews.length === 4;

    setErrorMsg('');
    setRetryStatus(null);
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const latestCriteria = await fetchActiveCriteriaFromFirestore(criteria);
      const data = await fetchAiWithRetry<BatchAnalysisResponse>({
        url: '/api/analyze',
        body: {
          reviews: selectedReviews,
          allReviews: allReviews.map((r) => ({ id: r.id, text: r.text })),
          inputSource: source,
          productInfo,
          criteria: latestCriteria,
        },
        timeoutMs: 55000,
        onStatusChange: setRetryStatus,
        validateData: (d) =>
          Boolean(
            d &&
              typeof d === 'object' &&
              Array.isArray((d as BatchAnalysisResponse).results)
          ),
        invalidResponseMessage: INVALID_RESPONSE_MESSAGE,
      });

      if (!Array.isArray(data?.results) || data.results.length === 0) {
        setErrorMsg(INVALID_RESPONSE_MESSAGE);
        return;
      }

      if (append && analysisResult) {
        const existingResults = Array.isArray(analysisResult.results)
          ? analysisResult.results
          : [];
        const existingIds = new Set(existingResults.map((r) => r.id));
        const appendedNew = data.results.filter((r) => !existingIds.has(r.id));
        const mergedResponse: BatchAnalysisResponse = {
          ...analysisResult,
          results: [...existingResults, ...appendedNew],
          criteriaVersion: data.criteriaVersion ?? analysisResult.criteriaVersion,
          totalInputCount: allReviews.length,
        };
        onAnalysisComplete(mergedResponse);
        setShowInputForm(false);
        return;
      }

      const finalResponse: BatchAnalysisResponse = {
        ...data,
        inputSource: source,
        totalInputCount: allReviews.length,
        selectionMethod,
        isCachedDemoFallback: false,
      };

      if (isExactSampleInput) {
        saveSampleAnalysisCache(finalResponse);
      }

      setSessionAllReviews(allReviews);
      setSessionSource(source);
      setPendingSelection(null);
      setExtractedReviews(null);
      onAnalysisComplete(finalResponse);
      setShowInputForm(false);
    } catch (err: unknown) {
      // Only for the built-in "예시 리뷰 채우기" reviews, fall back to the last cached successful sample analysis
      if (isExactSampleInput) {
        const cached = loadSampleAnalysisCache();
        if (cached) {
          setSessionAllReviews(allReviews);
          setSessionSource(source);
          onAnalysisComplete({
            ...cached.result,
            inputSource: 'text',
            totalInputCount: allReviews.length,
            selectionMethod: 'all',
            isCachedDemoFallback: true,
            cachedDemoSavedAt: cached.savedAt,
          });
          setShowInputForm(false);
          return;
        }
      }

      const msg =
        err instanceof Error && err.message.trim()
          ? err.message
          : INVALID_RESPONSE_MESSAGE;
      setErrorMsg(msg);
    } finally {
      setRetryStatus(null);
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleAnalyzeText = async () => {
    if (parsedBlocks.length === 0) {
      setErrorMsg('분석할 리뷰 내용을 한 개 이상 입력해 주세요.');
      return;
    }

    const allItems: ReviewInputItem[] = parsedBlocks.map((text, idx) => ({
      id: idx + 1,
      text,
      rating: ratingsByIndex[idx] ?? null,
    }));

    if (allItems.length > 15) {
      setErrorMsg('');
      setPendingSelection({ allReviews: allItems, source: 'text' });
      return;
    }

    await runAnalysis({
      selectedReviews: allItems,
      allReviews: allItems,
      source: 'text',
      selectionMethod: 'all',
    });
  };

  const handleConfirmExtractedAnalysis = async () => {
    if (!extractedReviews) return;
    const valid = extractedReviews.filter((r) => r.text.trim().length > 0);
    if (valid.length === 0) {
      setErrorMsg('분석할 리뷰 본문을 한 개 이상 입력해 주세요.');
      return;
    }

    const allItems: ReviewInputItem[] = valid.map((r, idx) => ({
      id: idx + 1,
      text: r.text.trim(),
      rating: r.rating,
      date: r.date.trim() || null,
      hasPhoto: r.hasPhoto,
      platformTags: r.platformTags,
    }));

    if (allItems.length > 15) {
      setErrorMsg('');
      setPendingSelection({ allReviews: allItems, source: verifierSource });
      return;
    }

    await runAnalysis({
      selectedReviews: allItems,
      allReviews: allItems,
      source: verifierSource,
      selectionMethod: 'all',
    });
  };

  // Results Screen (safely guarded against missing/invalid results array)
  const safeResults = Array.isArray(analysisResult?.results)
    ? analysisResult.results
    : [];

  if (analysisResult && !showInputForm && safeResults.length > 0) {
    const scoredResults = safeResults.filter(
      (r) => !r.insufficientInfo && typeof r.score === 'number' && Number.isFinite(r.score)
    );
    const pendingCount = safeResults.length - scoredResults.length;
    const avgScore =
      scoredResults.length > 0
        ? Math.round(
            scoredResults.reduce((acc, r) => acc + (r.score ?? 0), 0) /
              scoredResults.length
          )
        : null;

    const analyzedProduct = analysisResult.productInfo;
    const displayedName = analyzedProduct?.name?.trim() || '상품명 미입력';
    const displayedCategory = analyzedProduct?.category?.trim() || '카테고리 미선택 (일반 기준)';

    const totalInputCount = Math.max(
      safeResults.length,
      analysisResult.totalInputCount ?? sessionAllReviews.length ?? safeResults.length
    );
    const analyzedIdSet = new Set(safeResults.map((r) => r.id));
    const remainingReviews = !analysisResult.isCachedDemoFallback
      ? sessionAllReviews.filter((r) => !analyzedIdSet.has(r.id))
      : [];

    const handleAnalyzeNextBatch = async () => {
      if (remainingReviews.length === 0 || isLoadingMore) return;
      const nextSelection =
        remainingReviews.length > 15
          ? selectBalancedReviews(remainingReviews, 15).selected
          : remainingReviews;

      await runAnalysis({
        selectedReviews: nextSelection,
        allReviews: sessionAllReviews,
        source: analysisResult.inputSource ?? sessionSource,
        selectionMethod: analysisResult.selectionMethod ?? 'auto_order',
        append: true,
      });
    };

    const scopeLabel = `전체 ${totalInputCount}개 중 ${safeResults.length}개 분석 (선택 방법: ${getSelectionMethodLabel(
      analysisResult.selectionMethod
    )})`;

    return (
      <div className="space-y-8 py-6 sm:py-10">
        {/* Demo Example Cached Fallback Banner */}
        {analysisResult.isCachedDemoFallback && (
          <div
            role="status"
            className="bg-[#FEF9C3] border border-[#FDE047] rounded-xl p-4 flex items-start gap-3 text-sm text-[#713F12]"
          >
            <AlertTriangle className="w-5 h-5 text-[#CA8A04] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="font-bold">
                AI 서버 혼잡으로 미리 저장된 예시 결과를 보여드려요
              </p>
              <p className="text-xs text-[#854D0E]">
                예시 리뷰에 대해 이전에 성공했던 분석 결과를 불러왔습니다. 잠시 뒤 다시 시도하면 실시간으로 새로 분석할 수 있어요.
              </p>
            </div>
          </div>
        )}

        {/* Top Product Banner + Controls */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569]">
              <Package className="w-4 h-4 text-[#0F2557] shrink-0" aria-hidden="true" />
              <span className="font-semibold text-[#0F2557]">분석 상품 정보</span>
              <span aria-hidden="true">·</span>
              <span>{displayedCategory}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F2557] tracking-tight truncate">
              {displayedName}
            </h1>
            <p className="text-sm text-[#475569]">
              포착된 의심·신뢰 신호와 원문 하이라이트 근거를 확인하고 직접 판단해 보세요.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowInputForm(true)}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>리뷰 수정 / 새로 입력</span>
          </button>
        </div>

        {/* Scope Banner + Batch Summary */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
            <div className="space-y-1">
              <span className="block text-sm font-bold text-[#0F2557]">
                {scopeLabel}
                {pendingCount > 0 ? ` · 판단 보류 ${pendingCount}건 제외` : ''}
              </span>
              {analysisResult.inputSource === 'link' && (
                <p className="text-xs font-medium text-[#1E3A8A]">
                  쇼핑몰 페이지에 보이는 리뷰만 불러왔어요. 전체 리뷰는 더 많을 수 있어요
                </p>
              )}
            </div>
            {avgScore !== null ? (
              <span className="font-mono-num text-sm font-semibold text-[#1E3A8A]">
                평균 신뢰도 {avgScore}점
              </span>
            ) : (
              <span className="text-sm font-semibold text-[#64748B]">
                평균 신뢰도 판단 보류 (정보 부족)
              </span>
            )}
          </div>
          <p className="text-sm sm:text-[15px] text-[#334155] leading-relaxed">
            {analysisResult.similaritySummary}
          </p>
        </section>

        {/* Individual Review Result Cards */}
        <div className="space-y-6">
          {safeResults.map((review, idx) => {
            const hasAppealed = appeals.some(
              (a) => a.reviewText === review.text && a.aiScore === (review.score ?? 0)
            );
            return (
              <ReviewResultCard
                key={`${review.id}-${idx}`}
                review={review}
                index={idx}
                criteria={criteria}
                hasAppealed={hasAppealed}
                onRequestAppeal={(target) =>
                  onRequestAppeal(target, analysisResult.productInfo ?? productInfo)
                }
              />
            );
          })}
        </div>

        {/* Incremental "다음 15개 더 분석하기" */}
        {remainingReviews.length > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
            {isLoadingMore && retryStatus && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-xs sm:text-sm text-[#1E3A8A]"
              >
                <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
                <span>{retryStatus}</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs sm:text-sm text-[#991B1B]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-[#475569]">
                아직 분석하지 않은 리뷰가{' '}
                <strong className="font-mono-num text-[#0F2557]">
                  {remainingReviews.length}개
                </strong>{' '}
                남아 있어요. 이어서 분석하면 아래에 결과가 추가되고 평균 신뢰도도 다시 계산됩니다.
              </div>
              <button
                type="button"
                onClick={handleAnalyzeNextBatch}
                disabled={isLoadingMore}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F2557] text-white text-sm font-semibold hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                    <span>{retryStatus || '다음 리뷰를 분석하고 있습니다...'}</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      다음 {Math.min(15, remainingReviews.length)}개 더 분석하기
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mandatory Bottom Disclaimer */}
        <aside
          aria-label="AI 분석 안내"
          className="bg-[#F1F5F9] border border-[#CBD5E1] rounded-xl p-5 flex items-start gap-3"
        >
          <Info className="w-5 h-5 text-[#0F2557] mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-bold text-[#0F2557]">
              AI 판단은 참고용이며 틀릴 수 있습니다.
            </p>
            <p className="text-[#475569] leading-relaxed">
              리셋더리뷰RTR은 특정 리뷰를 삭제하거나 “조작 리뷰”라고 단정하지 않습니다.
              실제 구매 여부나 개인별 사용감은 다를 수 있으므로, 표시된 근거를 바탕으로 스스로 판단해 주세요.
            </p>
          </div>
        </aside>
      </div>
    );
  }

  // Step for choosing 15 reviews when input > 15 (applies to text, image, and link)
  if (pendingSelection !== null) {
    return (
      <ReviewSelectionView
        allReviews={pendingSelection.allReviews}
        onBack={() => {
          setPendingSelection(null);
          setErrorMsg('');
        }}
        onStartAnalyze={({ selectedReviews, selectionMethod }) => {
          void runAnalysis({
            selectedReviews,
            allReviews: pendingSelection.allReviews,
            source: pendingSelection.source,
            selectionMethod,
          });
        }}
        isLoading={isLoading}
        retryStatus={retryStatus}
        errorMsg={errorMsg}
      />
    );
  }

  // Verification Step ("인식 결과 확인" for Image and Link extractions)
  if ((inputMode === 'image' || inputMode === 'link') && extractedReviews !== null) {
    return (
      <ImageReviewVerifier
        sourceMode={verifierSource}
        reviews={extractedReviews}
        onChangeReviews={setExtractedReviews}
        productInfo={productInfo}
        onChangeProductInfo={(next) => {
          onChangeProductInfo(next);
          if (autoFilledProductName && next.name !== productInfo.name) {
            setAutoFilledProductName(false);
          }
        }}
        autoFilledProductName={autoFilledProductName}
        onBackToUpload={() => {
          setExtractedReviews(null);
          setErrorMsg('');
        }}
        onConfirmAnalyze={handleConfirmExtractedAnalysis}
        isAnalyzing={isLoading}
        retryStatus={retryStatus}
        errorMsg={errorMsg}
      />
    );
  }

  // Input Screen (Product Info + Text Tab / Image Tab / Link Tab)
  return (
    <div className="space-y-6 py-6 sm:py-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2557] tracking-tight">
            리뷰 입력 및 비교 분석
          </h1>
          <p className="text-sm sm:text-base text-[#475569]">
            {inputMode === 'text' ? (
              <>
                쇼핑몰 리뷰를 여러 개 붙여넣어 보세요.{' '}
                <strong className="font-semibold text-[#0F2557]">
                  한 줄을 비우면(엔터 두 번) 다른 리뷰로 구분
                </strong>
                됩니다.
              </>
            ) : inputMode === 'image' ? (
              <>
                리뷰 화면을 캡처하거나 찍은 이미지를 올리면 AI가 본문·별점·날짜·표시를 읽어 드립니다.
              </>
            ) : (
              <>
                상품 페이지 링크를 넣으면 공개된 해당 한 페이지에서 리뷰를 읽어 확인 화면으로 보여 드립니다.
              </>
            )}
          </p>
        </div>

        {/* 3 Mode Segmented Tabs */}
        <div
          role="tablist"
          aria-label="리뷰 입력 방식 선택"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E2E8F0]/70 rounded-lg self-start sm:self-auto shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'text'}
            onClick={() => {
              setInputMode('text');
              setErrorMsg('');
            }}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'text'
                ? 'bg-white text-[#0F2557] shadow-xs'
                : 'text-[#475569] hover:text-[#0F2557]'
            }`}
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            <span>텍스트로 입력</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'image'}
            onClick={() => {
              setInputMode('image');
              setErrorMsg('');
            }}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'image'
                ? 'bg-white text-[#0F2557] shadow-xs'
                : 'text-[#475569] hover:text-[#0F2557]'
            }`}
          >
            <ImagePlus className="w-4 h-4" aria-hidden="true" />
            <span>이미지로 입력</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'link'}
            onClick={() => {
              setInputMode('link');
              setErrorMsg('');
            }}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'link'
                ? 'bg-white text-[#0F2557] shadow-xs'
                : 'text-[#475569] hover:text-[#0F2557]'
            }`}
          >
            <Link2 className="w-4 h-4" aria-hidden="true" />
            <span>링크로 입력</span>
          </button>
        </div>
      </header>

      {/* Shared Product Info Area (applies to Text, Image, Link inputs) */}
      <ProductInfoSection
        productInfo={productInfo}
        onChange={onChangeProductInfo}
        autoFilledFromImage={autoFilledProductName}
        autoFilledLabel={
          verifierSource === 'link'
            ? '링크 페이지에서 상품명을 자동으로 채웠어요'
            : '이미지에서 상품명을 자동으로 채웠어요'
        }
        disabled={isLoading || isExtracting || isFetchingLink}
      />

      {inputMode === 'text' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoading}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#CBD5E1] bg-white text-xs sm:text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>예시 리뷰 4개 채우기</span>
            </button>
            {(rawText.trim().length > 0 ||
              productInfo.name.trim().length > 0 ||
              productInfo.description.trim().length > 0) && (
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setErrorMsg('');
                }}
                disabled={isLoading}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs sm:text-sm font-medium text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>비우기</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Multi-review Textarea */}
            <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="reviews-textarea" className="text-sm font-bold text-[#0F2557]">
                  리뷰 본문 붙여넣기
                </label>
                <span className="font-mono-num text-xs font-medium text-[#64748B]">
                  구분된 리뷰 {parsedBlocks.length}개
                </span>
              </div>

              <textarea
                id="reviews-textarea"
                rows={13}
                value={rawText}
                onChange={(e) => {
                  onChangeRawText(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder={`여기에 리뷰를 붙여넣으세요.\n\n한 줄을 비우고 다음 리뷰를 붙여넣으면 여러 리뷰를 동시에 비교 분석합니다.\n(15개를 넘으면 분석할 리뷰 고르기 화면이 나타납니다)`}
                className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-4 text-sm sm:text-[15px] leading-relaxed text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              />

              <p className="text-xs text-[#64748B] leading-relaxed">
                팁: 같은 상품의 리뷰 2개 이상을 빈 줄로 구분해 함께 넣으면, 리뷰끼리 문장이 비슷한지까지 비교해 줍니다. 15개를 넘으면 골고루 15개를 뽑아 분석한 뒤 이어서 추가 분석할 수 있습니다.
              </p>
            </div>

            {/* Right: Optional Per-Review Rating Selector & Submit */}
            <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5">
              <div className="space-y-1 border-b border-[#E2E8F0] pb-3">
                <h2 className="text-sm font-bold text-[#0F2557]">
                  리뷰별 별점 입력 (선택 사항)
                </h2>
                <p className="text-xs text-[#64748B]">
                  별점을 선택하면 “별점과 내용 불일치” 신호까지 함께 점검합니다.
                </p>
              </div>

              {parsedBlocks.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#64748B]">
                  왼쪽 입력창에 리뷰를 작성하거나 붙여넣으면 리뷰 목록이 여기에 표시됩니다.
                </div>
              ) : (
                <ul className="divide-y divide-[#F1F5F9] max-h-[340px] overflow-y-auto pr-1">
                  {parsedBlocks.map((block, idx) => {
                    const currentRating = ratingsByIndex[idx] ?? null;
                    return (
                      <li key={idx} className="py-3 first:pt-1 last:pb-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#0F2557]">
                            리뷰 #{idx + 1}
                          </span>
                          <div
                            className="flex items-center gap-1"
                            role="group"
                            aria-label={`리뷰 ${idx + 1} 별점 선택`}
                          >
                            <button
                              type="button"
                              onClick={() => onChangeRating(idx, null)}
                              className={`min-h-[32px] px-2 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                                currentRating === null
                                  ? 'bg-[#0F2557] text-white'
                                  : 'text-[#64748B] hover:bg-[#F1F5F9]'
                              }`}
                            >
                              미입력
                            </button>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => onChangeRating(idx, star)}
                                aria-label={`${star}점`}
                                className={`min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded text-xs font-mono-num font-semibold transition-colors ${
                                  currentRating === star
                                    ? 'bg-[#0F2557] text-white'
                                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                                }`}
                              >
                                <Star
                                  className={`w-3.5 h-3.5 mr-0.5 ${
                                    currentRating !== null && star <= currentRating
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
                        <p className="text-xs text-[#475569] line-clamp-2 leading-relaxed">
                          {block}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isLoading && retryStatus && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-xs sm:text-sm text-[#1E3A8A]"
                >
                  <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
                  <span>{retryStatus}</span>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs sm:text-sm text-[#991B1B]"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleAnalyzeText}
                  disabled={isLoading || parsedBlocks.length === 0}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#0F2557] text-white text-sm sm:text-base font-semibold hover:bg-[#1E3A8A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {retryStatus || '신호와 유사도를 분석하고 있습니다...'}
                      </span>
                    </>
                  ) : parsedBlocks.length > 15 ? (
                    <span>분석할 리뷰 고르기 (총 {parsedBlocks.length}건)</span>
                  ) : (
                    <span>신뢰도 분석하기 ({parsedBlocks.length}건)</span>
                  )}
                </button>

                {analysisResult && safeResults.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowInputForm(false)}
                    disabled={isLoading}
                    className="w-full min-h-[40px] text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    직전 분석 결과 다시 보기
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : inputMode === 'image' ? (
        /* Image Input Tab */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Dropzone + Mobile Camera & Gallery Controls */}
          <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#0F2557]">
                리뷰 캡처 · 사진 올리기
              </span>
              <span className="font-mono-num text-xs font-medium text-[#64748B]">
                {uploadedImages.length} / 10장
              </span>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  void handleAddFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  void handleAddFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {/* Drag & Drop + Ctrl+V Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors space-y-4 ${
                isDragging
                  ? 'border-[#0F2557] bg-[#EFF6FF]'
                  : 'border-[#CBD5E1] bg-[#F8FAFC]'
              }`}
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-white border border-[#E2E8F0] flex items-center justify-center text-[#0F2557]">
                <Upload className="w-5 h-5" aria-hidden="true" />
              </div>

              <div className="space-y-1">
                <p className="text-sm sm:text-base font-semibold text-[#0F2557]">
                  이미지를 끌어다 놓거나 Ctrl+V로 바로 붙여넣으세요
                </p>
                <p className="text-xs text-[#64748B]">
                  여러 장을 한꺼번에 올릴 수 있으며, 이미지에 상품명이 보이면 자동으로 채워 드립니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isExtracting}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2557] text-white text-sm font-semibold hover:bg-[#1E3A8A] transition-colors whitespace-nowrap"
                >
                  <ImagePlus className="w-4 h-4" aria-hidden="true" />
                  <span>파일 / 갤러리에서 선택</span>
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isExtracting}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>카메라로 촬영</span>
                </button>
              </div>
            </div>

            {/* Uploaded Thumbnails */}
            {uploadedImages.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#475569]">
                  <span className="font-semibold">선택한 이미지</span>
                  <button
                    type="button"
                    onClick={() => setUploadedImages([])}
                    disabled={isExtracting}
                    className="text-[#64748B] hover:text-[#DC2626] transition-colors"
                  >
                    전체 삭제
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {uploadedImages.map((img, idx) => (
                    <div
                      key={img.id}
                      className="relative group rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden"
                    >
                      <img
                        src={img.previewUrl}
                        alt={`업로드된 리뷰 이미지 ${idx + 1}`}
                        className="w-full h-32 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.id)}
                        disabled={isExtracting}
                        aria-label={`이미지 ${idx + 1} 제거`}
                        className="absolute top-1.5 right-1.5 min-w-[32px] min-h-[32px] rounded-full bg-[#0F172A]/75 text-white flex items-center justify-center hover:bg-[#DC2626] transition-colors"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <div className="px-2.5 py-1.5 text-[11px] text-[#475569] truncate bg-white border-t border-[#E2E8F0]">
                        {idx + 1}. {img.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Privacy Notice, Extraction Guide & Action */}
          <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="space-y-1 border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold text-[#0F2557]">
                이미지로 읽고 바로 확인하기
              </h2>
              <p className="text-xs text-[#64748B]">
                인식이 끝나면 바로 점수를 매기지 않고 “인식 결과 확인” 화면을 먼저 보여드립니다.
              </p>
            </div>

            <ul className="space-y-2.5 text-xs sm:text-sm text-[#334155]">
              <li className="flex items-start gap-2">
                <span className="font-mono-num font-bold text-[#0F2557]">1.</span>
                <span>상품명이 이미지에 보이면 자동으로 채우고, 리뷰 본문·별점·날짜·사진 여부·배지를 분리합니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono-num font-bold text-[#0F2557]">2.</span>
                <span>글자가 흐려 확신이 낮은 부분은 노란색으로 표시해 직접 고칠 수 있게 해드립니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono-num font-bold text-[#0F2557]">3.</span>
                <span>선택한 상품 카테고리와 설명에 맞춰 모순·복붙·구체성 신호를 정밀 분석합니다.</span>
              </li>
            </ul>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-[#334155]">
              <ShieldAlert className="w-4 h-4 text-[#0F2557] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                <strong className="font-semibold text-[#0F2557]">개인정보 보호:</strong>{' '}
                작성자 닉네임, 아이디, 프로필 사진 등 개인을 식별할 수 있는 정보는 인식하지도, 저장하지도, 화면에 표시하지도 않습니다.
              </p>
            </div>

            {isExtracting && extractRetryStatus && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-xs sm:text-sm text-[#1E3A8A]"
              >
                <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
                <span>{extractRetryStatus}</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs sm:text-sm text-[#991B1B]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleExtractFromImages}
                disabled={isExtracting || uploadedImages.length === 0}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#0F2557] text-white text-sm sm:text-base font-semibold hover:bg-[#1E3A8A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {extractRetryStatus || '이미지에서 리뷰를 읽고 있습니다...'}
                    </span>
                  </>
                ) : (
                  <span>이미지에서 리뷰 읽기 ({uploadedImages.length}장)</span>
                )}
              </button>

              {analysisResult && safeResults.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowInputForm(false)}
                  disabled={isExtracting}
                  className="w-full min-h-[40px] text-xs font-semibold text-[#1E3A8A] hover:underline"
                >
                  직전 분석 결과 다시 보기
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Link Input Tab ("링크로 입력") */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: URL Input + 3-outcome Display */}
          <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="space-y-1">
              <label
                htmlFor="product-link-input"
                className="block text-sm font-bold text-[#0F2557]"
              >
                상품 페이지 링크 (URL)
              </label>
              <p className="text-xs text-[#64748B]">
                http:// 또는 https:// 로 시작하는 공개된 상품 페이지 주소를 입력해 주세요.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="product-link-input"
                type="url"
                value={linkUrl}
                disabled={isFetchingLink}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  if (errorMsg) setErrorMsg('');
                  if (linkOutcomeNotice) setLinkOutcomeNotice(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleExtractFromLink();
                  }
                }}
                placeholder="https://example.com/product/12345"
                className="flex-1 min-h-[46px] rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleExtractFromLink()}
                disabled={isFetchingLink || linkUrl.trim().length === 0}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F2557] text-white text-sm font-semibold hover:bg-[#1E3A8A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                {isFetchingLink ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                    <span>불러오는 중...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>리뷰 불러오기</span>
                  </>
                )}
              </button>
            </div>

            {isFetchingLink && linkRetryStatus && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3.5 text-xs sm:text-sm text-[#1E3A8A]"
              >
                <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
                <span>{linkRetryStatus}</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3.5 text-xs sm:text-sm text-[#991B1B]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Outcome 2: Page read, but no reviews found (Gray info card) */}
            {linkOutcomeNotice?.kind === 'no_reviews' && (
              <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Info className="w-5 h-5 text-[#64748B] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-base font-bold text-[#475569]">
                      이 페이지에서 리뷰를 찾지 못했어요
                    </h3>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      쇼핑몰에 따라 리뷰가 페이지를 연 뒤에 따로 불러와져서 읽지 못할 수 있어요.
                      리뷰 화면을 캡처해 올리면 바로 읽고 분석할 수 있습니다.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('image');
                    setErrorMsg('');
                  }}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2557] text-white text-xs sm:text-sm font-semibold hover:bg-[#1E3A8A] transition-colors"
                >
                  <ImagePlus className="w-4 h-4" aria-hidden="true" />
                  <span>캡처 이미지로 입력하기</span>
                </button>
              </div>
            )}

            {/* Outcome 3: Page unreadable / login / blocked / timeout */}
            {linkOutcomeNotice?.kind === 'unreadable' && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5 space-y-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-base font-bold text-[#991B1B]">
                      이 링크는 불러올 수 없어요
                    </h3>
                    <p className="text-xs sm:text-sm text-[#7F1D1D] leading-relaxed">
                      이유: {linkOutcomeNotice.reason}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('image');
                    setErrorMsg('');
                  }}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2557] text-white text-xs sm:text-sm font-semibold hover:bg-[#1E3A8A] transition-colors"
                >
                  <ImagePlus className="w-4 h-4" aria-hidden="true" />
                  <span>캡처 이미지로 입력하기</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: Link Extraction Rules & Privacy Guide */}
          <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="space-y-1 border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold text-[#0F2557]">
                링크에서 읽고 먼저 확인하기
              </h2>
              <p className="text-xs text-[#64748B]">
                공개된 해당 한 페이지만 읽고, 인식 결과 확인 화면을 먼저 보여드립니다.
              </p>
            </div>

            <ul className="space-y-2.5 text-xs sm:text-sm text-[#334155]">
              <li className="flex items-start gap-2">
                <span className="font-mono-num font-bold text-[#0F2557]">1.</span>
                <span>상품명이 보이면 자동으로 채우고, 페이지에 적힌 리뷰 원문을 그대로 가져옵니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono-num font-bold text-[#0F2557]">2.</span>
                <span>입력한 한 페이지만 읽으며, 불러온 페이지와 리뷰는 서버에 저장하지 않습니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono-num font-bold text-[#0F2557]">3.</span>
                <span>일부 쇼핑몰은 리뷰가 뒤늦게 로드되어 읽히지 않을 수 있으며, 이때는 이미지 입력으로 바로 전환할 수 있습니다.</span>
              </li>
            </ul>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-[#334155]">
              <ShieldAlert className="w-4 h-4 text-[#0F2557] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                <strong className="font-semibold text-[#0F2557]">개인정보 보호:</strong>{' '}
                작성자 닉네임, 아이디, 프로필 정보는 가져오지도, 서버에 저장하지도 않습니다.
              </p>
            </div>

            {analysisResult && safeResults.length > 0 && (
              <button
                type="button"
                onClick={() => setShowInputForm(false)}
                disabled={isFetchingLink}
                className="w-full min-h-[40px] text-xs font-semibold text-[#1E3A8A] hover:underline"
              >
                직전 분석 결과 다시 보기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
