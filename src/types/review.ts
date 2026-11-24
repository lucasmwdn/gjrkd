export type ProductCategory =
  | ''
  | '의류·신발'
  | '식품'
  | '전자기기'
  | '화장품'
  | '생활용품'
  | '기타';

export interface ProductInfo {
  name: string;
  category: ProductCategory;
  description: string;
}

export const PRODUCT_CATEGORIES: Exclude<ProductCategory, ''>[] = [
  '의류·신발',
  '식품',
  '전자기기',
  '화장품',
  '생활용품',
  '기타',
];

export type SignalAreaKey = '구체성' | '균형성' | '과장도' | '일관성';

export const FIXED_AREA_ORDER: SignalAreaKey[] = ['구체성', '균형성', '과장도', '일관성'];

export const FIXED_AREA_MAX_SCORES: Record<SignalAreaKey, number> = {
  구체성: 30,
  균형성: 20,
  과장도: 25,
  일관성: 25,
};

export interface AreaScoreConfig {
  area: SignalAreaKey;
  baseScore: number;
  maxScore: number;
  description: string;
}

export type SignalKind = 'suspicious' | 'trust';

export type ConditionKey =
  | 'always'
  | 'requires_rating'
  | 'requires_multi_review'
  | 'requires_image_date_cluster'
  | 'requires_product_description';

export interface SignalRule {
  id: string;
  type: string;
  kind: SignalKind;
  area: SignalAreaKey;
  categoryLabel: string;
  points: number;
  enabled: boolean;
  conditionKey?: ConditionKey;
  condition: string;
  shortDesc: string;
  criteriaDetail: string;
  example: string;
  isCustom?: boolean;
  addedAt?: string;
}

export interface CategoryConcreteCriteria {
  category: Exclude<ProductCategory, ''>;
  keySignals: string[];
  description: string;
  example: string;
  promptGuideline?: string;
}

export interface CriteriaConfig {
  version: number;
  updatedAt: string;
  updatedByUid?: string;
  baseTrustScore: number;
  areas: AreaScoreConfig[];
  signals: SignalRule[];
  categoryCriteria: CategoryConcreteCriteria[];
}

export interface ReviewInputItem {
  id: number;
  text: string;
  rating: number | null;
  date?: string | null;
  hasPhoto?: boolean;
  platformTags?: string[];
}

export type UncertainField = 'text' | 'rating' | 'date';

export interface ExtractedReviewItem {
  tempId: string;
  text: string;
  rating: number | null;
  date: string;
  hasPhoto: boolean;
  platformTags: string[];
  uncertainQuotes: string[];
  uncertainFields: UncertainField[];
}

export type InputSource = 'text' | 'image' | 'link';

export type UrlExtractOutcome = 'found' | 'no_reviews' | 'unreadable';

export interface UrlExtractResponse {
  outcome: UrlExtractOutcome;
  detectedProductName: string | null;
  reviews: ExtractedReviewItem[];
  reason?: string;
}

export type SelectionMethod = 'all' | 'auto_rating' | 'auto_order' | 'manual';

export type ScoreTier = 'pending' | 'green' | 'yellow' | 'red';

export type AreaScores = Record<SignalAreaKey, number>;

export type AdDisclosureStatus = 'clear' | 'unclear' | 'none';

export interface AdDisclosureInfo {
  status: AdDisclosureStatus;
  label: string;
  matchedPhrases: string[];
  explanation: string;
}

export interface SuspiciousSignalResult {
  type: string;
  detected: boolean;
  reason: string;
  evidenceQuotes: string[];
  similarReviewIndices: number[];
  points?: number;
  area?: SignalAreaKey;
}

export interface TrustSignalResult {
  type: string;
  detected: boolean;
  reason: string;
  evidenceQuotes: string[];
  points?: number;
  area?: SignalAreaKey;
}

export interface ReviewAnalysisResult {
  id: number;
  text: string;
  rating: number | null;
  date?: string | null;
  hasPhoto?: boolean;
  platformTags?: string[];
  insufficientInfo?: boolean;
  score: number | null;
  areaScores: AreaScores | null;
  tier: ScoreTier;
  tierLabel: string;
  summary: string;
  adDisclosure?: AdDisclosureInfo;
  suspiciousSignals: SuspiciousSignalResult[];
  trustSignals: TrustSignalResult[];
}

export interface BatchAnalysisResponse {
  results: ReviewAnalysisResult[];
  similaritySummary: string;
  productInfo?: ProductInfo;
  criteriaVersion?: number;
  inputSource?: InputSource;
  totalInputCount?: number;
  selectionMethod?: SelectionMethod;
  isCachedDemoFallback?: boolean;
  cachedDemoSavedAt?: string;
}

export type ExpectedJudgment = '더 믿을 만한 리뷰다' | '덜 믿을 만한 리뷰다';

export type AppealStatus = '대기' | '반영됨' | '검토 완료';

export interface AppealSavedSignal {
  type: string;
  kind: SignalKind;
  area: SignalAreaKey | string;
  points: number;
  reason: string;
}

export interface AppealReanalysisComparison {
  beforeScore: number;
  afterScore: number;
  beforeAreaScores?: AreaScores | null;
  afterAreaScores: AreaScores;
  beforeTierLabel: string;
  afterTierLabel: string;
  afterSummary: string;
  afterDetectedSignals: string[];
  criteriaVersion: number;
  analyzedAt: string;
}

export interface AppealItem {
  id: string;
  authorId: string;
  createdAt: string;
  reviewText: string;
  rating: number | null;
  productInfo: ProductInfo | null;
  aiScore: number;
  aiAreaScores?: AreaScores | null;
  aiTierLabel: string;
  aiSignals: AppealSavedSignal[];
  expectedJudgment: ExpectedJudgment;
  problematicPart: string;
  reason: string;
  status: AppealStatus;
  rejectionReason?: string | null;
  proposalId?: string | null;
  reanalysisComparison?: AppealReanalysisComparison | null;
  isPublic: boolean;
}

export type ProposalType = 'add' | 'adjust' | 'modify_or_delete';

export type ProposalAction =
  | 'add_signal'
  | 'adjust_points'
  | 'delete_signal'
  | 'modify_condition';

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export interface RepresentativeAppealCase {
  appealId: string;
  reviewExcerpt: string;
  expectedJudgment: ExpectedJudgment;
  problematicPart: string;
  reason: string;
  aiScore: number;
}

export interface CriteriaProposal {
  id: string;
  createdByUid: string;
  createdAt: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  signalName: string;
  targetSignalId?: string | null;
  kind: SignalKind;
  area: SignalAreaKey;
  proposedPoints?: number | null;
  proposedAction: ProposalAction;
  proposedCondition?: string | null;
  exampleSentence?: string | null;
  rationale: string;
  supportingAppealIds: string[];
  supportingAppealCount: number;
  representativeCases: RepresentativeAppealCase[];
  rejectionReason?: string | null;
}

export interface CriteriaHistoryItem {
  id: string;
  changedAt: string;
  changedDateLabel: string;
  proposalType: ProposalType;
  signalName: string;
  area: SignalAreaKey;
  changeSummary: string;
  detailDescription: string;
  supportingAppealCount: number;
  approvedByUid: string;
  isPublic: boolean;
}

export function getScoreTierInfo(score: number | null): {
  tier: ScoreTier;
  label: string;
  description: string;
} {
  if (score === null || !Number.isFinite(score)) {
    return {
      tier: 'pending',
      label: '판단 보류',
      description: '정보가 부족해 판단하기 어려워요',
    };
  }
  if (score >= 70) {
    return {
      tier: 'green',
      label: '신뢰 신호 우세',
      description: '구체적 경험이나 균형 잡힌 근거가 비교적 잘 드러납니다.',
    };
  }
  if (score >= 40) {
    return {
      tier: 'yellow',
      label: '추가 확인 필요',
      description: '근거가 부족하거나 긍정·의심 신호가 혼재되어 있어 다른 리뷰와 비교해 보세요.',
    };
  }
  return {
    tier: 'red',
    label: '의심 신호 다수',
    description: '구체적 사용 근거보다 과장·유사·모순 신호가 많이 포착되었습니다.',
  };
}
