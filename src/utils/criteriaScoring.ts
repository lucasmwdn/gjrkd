import defaultCriteriaJson from '../data/defaultCriteria.json' with { type: 'json' };
import {
  FIXED_AREA_MAX_SCORES,
  FIXED_AREA_ORDER,
  type AdDisclosureInfo,
  type AreaScoreConfig,
  type AreaScores,
  type CriteriaConfig,
  type CriteriaProposal,
  type SignalAreaKey,
  type SignalRule,
} from '../types/review.ts';

export const DEFAULT_CRITERIA_CONFIG: CriteriaConfig =
  defaultCriteriaJson as CriteriaConfig;

export function clampNewSignalPoints(points: number, kind: 'suspicious' | 'trust'): number {
  const abs = Math.round(Math.abs(points));
  const bounded = Math.max(3, Math.min(10, abs));
  return kind === 'suspicious' ? -bounded : bounded;
}

export function clampAdjustSignalPoints(points: number, kind: 'suspicious' | 'trust'): number {
  const abs = Math.round(Math.abs(points));
  const bounded = Math.max(3, Math.min(25, abs));
  return kind === 'suspicious' ? -bounded : bounded;
}

export function scrubBannedWords(text: string): string {
  return text
    .replace(/가짜\s*리뷰/g, '근거가 부족하거나 의심 신호가 있는 리뷰')
    .replace(/조작\s*리뷰/g, '유사·홍보 패턴이 포착된 리뷰')
    .replace(/가짜/g, '신뢰하기 어려운')
    .replace(/조작/g, '비정상 패턴');
}

export function sanitizeCriteriaConfig(raw?: Partial<CriteriaConfig> | null): CriteriaConfig {
  const base = DEFAULT_CRITERIA_CONFIG;
  if (!raw || typeof raw !== 'object') {
    return structuredClone(base);
  }

  // Enforce exact 4 area order, fixed maxScore caps (30/20/25/25), and fixed start rules:
  // 구체성·균형성은 0점에서 가점, 과장도·일관성은 만점(25)에서 감점
  const FIXED_AREA_START_SCORES: Record<SignalAreaKey, number> = {
    구체성: 0,
    균형성: 0,
    과장도: FIXED_AREA_MAX_SCORES.과장도,
    일관성: FIXED_AREA_MAX_SCORES.일관성,
  };

  const incomingVersion =
    typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version >= 1
      ? Math.round(raw.version)
      : base.version;

  const rawSignalsInput = Array.isArray(raw.signals) ? raw.signals : [];
  const hasLegacyV1Builtins =
    incomingVersion < 2 ||
    rawSignalsInput.some(
      (s) =>
        s &&
        (s.id === 'sig-trust-duration-context' || s.id === 'sig-trust-photo-metrics')
    );

  const areas: AreaScoreConfig[] = FIXED_AREA_ORDER.map((areaKey) => {
    const defaultArea = base.areas.find((a) => a.area === areaKey)!;
    const incomingArea = Array.isArray(raw.areas)
      ? raw.areas.find((a) => a && a.area === areaKey)
      : undefined;
    const maxScore = FIXED_AREA_MAX_SCORES[areaKey];

    const incomingDesc =
      typeof incomingArea?.description === 'string' ? incomingArea.description.trim() : '';
    const shouldUseDefaultDesc =
      hasLegacyV1Builtins ||
      !incomingDesc ||
      incomingDesc.includes('기본 10점') ||
      incomingDesc.includes('기본 15점');

    return {
      area: areaKey,
      baseScore: FIXED_AREA_START_SCORES[areaKey],
      maxScore,
      description: shouldUseDefaultDesc ? defaultArea.description : incomingDesc,
    };
  });

  const baseTrustScore = areas.reduce((acc, a) => acc + a.baseScore, 0);

  let rawSignals: SignalRule[];
  if (hasLegacyV1Builtins) {
    const customSignals = rawSignalsInput.filter(
      (s): s is SignalRule => Boolean(s && s.isCustom && typeof s.type === 'string' && s.type.trim())
    );
    rawSignals = [...structuredClone(base.signals), ...customSignals];
  } else {
    rawSignals = rawSignalsInput.length > 0 ? rawSignalsInput : base.signals;
  }

  const signals: SignalRule[] = rawSignals
    .filter((s): s is SignalRule => Boolean(s && typeof s.type === 'string' && s.type.trim()))
    .slice(0, 50)
    .map((s, idx) => {
      const area: SignalAreaKey = FIXED_AREA_ORDER.includes(s.area) ? s.area : '일관성';
      const kind = s.kind === 'trust' ? 'trust' : 'suspicious';
      const isCustom = Boolean(s.isCustom);
      const rawPoints = typeof s.points === 'number' && Number.isFinite(s.points) ? s.points : -5;
      const points = isCustom
        ? clampNewSignalPoints(rawPoints, kind)
        : clampAdjustSignalPoints(rawPoints, kind);

      return {
        id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sig-${idx + 1}`,
        type: s.type.trim().slice(0, 120),
        kind,
        area,
        categoryLabel:
          typeof s.categoryLabel === 'string' && s.categoryLabel.trim()
            ? s.categoryLabel.trim()
            : area,
        points,
        enabled: s.enabled !== false,
        conditionKey: s.conditionKey,
        condition:
          typeof s.condition === 'string' && s.condition.trim() ? s.condition.trim() : '항상 적용',
        shortDesc:
          typeof s.shortDesc === 'string' && s.shortDesc.trim()
            ? s.shortDesc.trim()
            : s.type.trim(),
        criteriaDetail:
          typeof s.criteriaDetail === 'string' && s.criteriaDetail.trim()
            ? s.criteriaDetail.trim()
            : s.shortDesc || s.type.trim(),
        example:
          typeof s.example === 'string' && s.example.trim()
            ? s.example.trim()
            : '예시 문장이 등록되어 있습니다.',
        isCustom,
        ...(s.addedAt ? { addedAt: s.addedAt } : {}),
      };
    });

  const defaultPunctRule = base.signals.find(
    (s) => s.id === 'sig-suspicious-excessive-punctuation'
  );
  if (
    defaultPunctRule &&
    !signals.some((s) => s.id === 'sig-suspicious-excessive-punctuation')
  ) {
    signals.splice(Math.min(2, signals.length), 0, structuredClone(defaultPunctRule));
  }

  const categoryCriteria =
    Array.isArray(raw.categoryCriteria) && raw.categoryCriteria.length > 0
      ? raw.categoryCriteria
      : base.categoryCriteria;

  return {
    version: Math.max(base.version, incomingVersion),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : base.updatedAt,
    ...(typeof raw.updatedByUid === 'string' && raw.updatedByUid.trim()
      ? { updatedByUid: raw.updatedByUid.trim() }
      : {}),
    baseTrustScore,
    areas,
    signals: signals.length > 0 ? signals : structuredClone(base.signals),
    categoryCriteria,
  };
}

export function computeReviewScores(
  detectedSuspiciousTypes: string[],
  detectedTrustTypes: string[],
  criteria: CriteriaConfig
): { score: number; areaScores: AreaScores } {
  const safe = sanitizeCriteriaConfig(criteria);

  // 구체성·균형성은 0점에서 가점, 과장도·일관성은 만점(25)에서 감점
  const areaRaw: AreaScores = {
    구체성: 0,
    균형성: 0,
    과장도: FIXED_AREA_MAX_SCORES.과장도,
    일관성: FIXED_AREA_MAX_SCORES.일관성,
  };

  for (const sigType of detectedSuspiciousTypes) {
    const rule = safe.signals.find((r) => r.enabled && r.kind === 'suspicious' && r.type === sigType);
    if (rule) {
      areaRaw[rule.area] += rule.points;
    }
  }

  for (const sigType of detectedTrustTypes) {
    const rule = safe.signals.find((r) => r.enabled && r.kind === 'trust' && r.type === sigType);
    if (rule) {
      areaRaw[rule.area] += rule.points;
    }
  }

  // Enforce area floor 0 and fixed area caps (구체성 30, 균형성 20, 과장도 25, 일관성 25)
  const areaScores: AreaScores = {
    구체성: Math.max(0, Math.min(FIXED_AREA_MAX_SCORES.구체성, areaRaw.구체성)),
    균형성: Math.max(0, Math.min(FIXED_AREA_MAX_SCORES.균형성, areaRaw.균형성)),
    과장도: Math.max(0, Math.min(FIXED_AREA_MAX_SCORES.과장도, areaRaw.과장도)),
    일관성: Math.max(0, Math.min(FIXED_AREA_MAX_SCORES.일관성, areaRaw.일관성)),
  };

  const score = Math.max(
    0,
    Math.min(
      100,
      areaScores.구체성 + areaScores.균형성 + areaScores.과장도 + areaScores.일관성
    )
  );

  return { score, areaScores };
}

export function countNonWhitespaceChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function isReviewTooShort(text: string): boolean {
  return countNonWhitespaceChars(text) < 20;
}

export function detectExcessivePunctuationAndEmoji(text: string): {
  detected: boolean;
  totalCount: number;
  exclamationCount: number;
  emojiCount: number;
  evidenceQuotes: string[];
  reason: string;
} {
  let exclamationCount = 0;
  let emojiCount = 0;

  const SegmenterCtor = (
    Intl as unknown as {
      Segmenter?: new (
        locale: string,
        opts: { granularity: string }
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;

  const graphemes = SegmenterCtor
    ? Array.from(new SegmenterCtor('ko', { granularity: 'grapheme' }).segment(text), (s) => s.segment)
    : Array.from(text);

  const emojiRegex = /[\p{Extended_Pictographic}♥♡★☆✨🔥👍💯😍🥰👏🎉💖💕]/u;
  for (const g of graphemes) {
    if (g === '!' || g === '！') {
      exclamationCount += 1;
    } else if (emojiRegex.test(g)) {
      emojiCount += 1;
    }
  }

  // Also count ASCII/Korean text emoticons like ^^, ^-^, ㅠㅠ, ㅜㅜ (1 per sequence)
  const textEmoticonMatches = text.match(/(?:\^\^|\^[-_oO]\^|ㅠ{2,}|ㅜ{2,})/g) ?? [];
  emojiCount += textEmoticonMatches.length;

  const totalCount = exclamationCount + emojiCount;
  const detected = totalCount >= 5;

  const rawRuns =
    text.match(/(?:[!！]+|[\p{Extended_Pictographic}♥♡★☆]+|\^\^|\^[-_oO]\^|ㅠ{2,}|ㅜ{2,})/gu) ??
    [];
  const evidenceQuotes = detected ? Array.from(new Set(rawRuns)).slice(0, 6) : [];

  const reason = detected
    ? `코드 집계 결과 느낌표(${exclamationCount}개)와 이모티콘(${emojiCount}개)이 총 ${totalCount}개(5개 이상) 반복 사용되었습니다.`
    : `느낌표·이모티콘 합계가 ${totalCount}개로 5개 미만입니다.`;

  return {
    detected,
    totalCount,
    exclamationCount,
    emojiCount,
    evidenceQuotes,
    reason,
  };
}

export function detectAdDisclosureByCode(
  text: string,
  platformTags: string[] = []
): AdDisclosureInfo {
  const clearPatterns = [
    /광고비를?\s*받/g,
    /원고료를?\s*받/g,
    /소정의\s*(?:원고료|수수료|대가|활동비)/g,
    /(?:제품|상품|서비스)을?\s*무상(?:으로)?\s*제공받/g,
    /(?:무상으로|무료로)\s*제공받아\s*(?:작성|솔직|리뷰)/g,
    /경제적\s*대가를\s*받/g,
    /경제적\s*이해관계/g,
    /유료\s*광고(?:가\s*포함|입니다)?/g,
    /업체로부터\s*(?:제품|상품)과\s*(?:원고료|광고비)/g,
  ];

  const unclearTextPatterns = [
    /체험단/g,
    /선물\s*받았/g,
    /선물로\s*받/g,
    /보내\s*주셨/g,
    /보내주셨/g,
    /협찬/g,
    /제공\s*받아/g,
    /제공받아/g,
    /제품\s*제공/g,
    /무상\s*제공/g,
    /광고성/g,
    /#?광고\b/g,
    /#?협찬\b/g,
  ];

  const matchedClear: string[] = [];
  for (const re of clearPatterns) {
    const m = text.match(re);
    if (m) matchedClear.push(...m);
  }

  if (matchedClear.length > 0) {
    const unique = Array.from(new Set(matchedClear.map((s) => s.trim()).filter(Boolean)));
    return {
      status: 'clear',
      label: '광고 표시 명확',
      matchedPhrases: unique,
      explanation: `경제적 대가·무상 제공 사실이 분명하게 표시되어 있습니다. (${unique.join(', ')})`,
    };
  }

  const matchedUnclear: string[] = [];
  for (const re of unclearTextPatterns) {
    const m = text.match(re);
    if (m) matchedUnclear.push(...m);
  }

  const ambiguousTags = ['체험단', '협찬', '광고', '제품제공', '선물', '제공'];
  for (const tag of platformTags) {
    const trimmed = tag.trim();
    if (
      ambiguousTags.some((t) => trimmed.includes(t)) &&
      !trimmed.includes('유료광고') &&
      !trimmed.includes('대가')
    ) {
      matchedUnclear.push(trimmed);
    } else if (trimmed.includes('유료광고')) {
      return {
        status: 'clear',
        label: '광고 표시 명확',
        matchedPhrases: [trimmed],
        explanation: `플랫폼 배지(${trimmed})로 대가성 광고 여부가 명확히 표시되어 있습니다.`,
      };
    }
  }

  if (matchedUnclear.length > 0) {
    const unique = Array.from(new Set(matchedUnclear.map((s) => s.trim()).filter(Boolean)));
    return {
      status: 'unclear',
      label: '광고 표시 불명확',
      matchedPhrases: unique,
      explanation:
        '“체험단”, “선물”, “보내주셨어요”, “협찬”, “제공받아” 등은 공정위 추천·보증 심사지침상 경제적 이해관계의 명확한 표시로 인정되지 않는 표현입니다.',
    };
  }

  return {
    status: 'none',
    label: '표시 없음',
    matchedPhrases: [],
    explanation: '체험단·협찬·광고 관련 표시 문구가 발견되지 않았습니다.',
  };
}

export function applyProposalToCriteria(
  current: CriteriaConfig,
  proposal: CriteriaProposal,
  adminUid: string
): { nextCriteria: CriteriaConfig; changeSummary: string; detailDescription: string } {
  const safe = sanitizeCriteriaConfig(current);
  const nextSignals = safe.signals.map((s) => ({ ...s }));
  const nowIso = new Date().toISOString();

  let changeSummary = '';
  let detailDescription = '';

  if (proposal.proposedAction === 'add_signal') {
    const pts = clampNewSignalPoints(proposal.proposedPoints ?? (proposal.kind === 'trust' ? 5 : -5), proposal.kind);
    const existingIdx = nextSignals.findIndex(
      (s) => s.type === proposal.signalName.trim()
    );
    const conditionText = proposal.proposedCondition?.trim() || '항상 적용';
    const newRule: SignalRule = {
      id: existingIdx >= 0 ? nextSignals[existingIdx].id : `custom-${Date.now()}`,
      type: proposal.signalName.trim(),
      kind: proposal.kind,
      area: proposal.area,
      categoryLabel:
        conditionText === '항상 적용'
          ? proposal.area
          : `${proposal.area} (${conditionText})`,
      points: pts,
      enabled: true,
      conditionKey: 'always',
      condition: conditionText,
      shortDesc: proposal.rationale.trim().slice(0, 120),
      criteriaDetail: proposal.rationale.trim(),
      example: proposal.exampleSentence?.trim() || '이의 제기 사례 기반 추가 기준',
      isCustom: true,
      addedAt: nowIso,
    };

    if (existingIdx >= 0) {
      nextSignals[existingIdx] = newRule;
    } else {
      nextSignals.push(newRule);
    }

    const signStr = pts > 0 ? `+${pts}` : `${pts}`;
    changeSummary = `[신규 신호 추가] ${proposal.area} · "${newRule.type}" (${signStr}점)`;
    detailDescription = `${proposal.rationale} (적용 조건: ${conditionText})`;
  } else if (proposal.proposedAction === 'adjust_points') {
    const target =
      nextSignals.find((s) => s.id === proposal.targetSignalId) ??
      nextSignals.find((s) => s.type === proposal.signalName);

    if (target) {
      const beforePts = target.points;
      const afterPts = target.isCustom
        ? clampNewSignalPoints(proposal.proposedPoints ?? beforePts, target.kind)
        : clampAdjustSignalPoints(proposal.proposedPoints ?? beforePts, target.kind);
      target.points = afterPts;
      target.enabled = true;
      changeSummary = `[점수 조정] ${target.area} · "${target.type}" (${beforePts > 0 ? `+${beforePts}` : beforePts}점 → ${afterPts > 0 ? `+${afterPts}` : afterPts}점)`;
      detailDescription = proposal.rationale;
    } else {
      const pts = clampNewSignalPoints(proposal.proposedPoints ?? -5, proposal.kind);
      nextSignals.push({
        id: `custom-${Date.now()}`,
        type: proposal.signalName.trim(),
        kind: proposal.kind,
        area: proposal.area,
        categoryLabel: proposal.area,
        points: pts,
        enabled: true,
        conditionKey: 'always',
        condition: proposal.proposedCondition?.trim() || '항상 적용',
        shortDesc: proposal.rationale.trim().slice(0, 120),
        criteriaDetail: proposal.rationale.trim(),
        example: proposal.exampleSentence?.trim() || '이의 제기 사례 기반 기준',
        isCustom: true,
        addedAt: nowIso,
      });
      changeSummary = `[신규 신호 추가] ${proposal.area} · "${proposal.signalName}" (${pts > 0 ? `+${pts}` : pts}점)`;
      detailDescription = proposal.rationale;
    }
  } else if (proposal.proposedAction === 'delete_signal') {
    const target =
      nextSignals.find((s) => s.id === proposal.targetSignalId) ??
      nextSignals.find((s) => s.type === proposal.signalName);
    if (target) {
      target.enabled = false;
      changeSummary = `[신호 비활성화/삭제] ${target.area} · "${target.type}"`;
      detailDescription = proposal.rationale;
    } else {
      changeSummary = `[신호 비활성화] ${proposal.area} · "${proposal.signalName}"`;
      detailDescription = proposal.rationale;
    }
  } else {
    // modify_condition
    const target =
      nextSignals.find((s) => s.id === proposal.targetSignalId) ??
      nextSignals.find((s) => s.type === proposal.signalName);
    const nextCond = proposal.proposedCondition?.trim() || '조건 변경됨';
    if (target) {
      const beforeCond = target.condition;
      target.condition = nextCond;
      target.categoryLabel = `${target.area} (${nextCond})`;
      target.criteriaDetail = `${target.criteriaDetail} [변경된 적용 조건: ${nextCond}]`;
      changeSummary = `[적용 조건 변경] ${target.area} · "${target.type}" (${beforeCond} → ${nextCond})`;
      detailDescription = proposal.rationale;
    } else {
      changeSummary = `[적용 조건 변경] ${proposal.area} · "${proposal.signalName}" → ${nextCond}`;
      detailDescription = proposal.rationale;
    }
  }

  const nextCriteria = sanitizeCriteriaConfig({
    ...safe,
    version: safe.version + 1,
    updatedAt: nowIso,
    updatedByUid: adminUid,
    signals: nextSignals,
  });

  return {
    nextCriteria,
    changeSummary,
    detailDescription,
  };
}

function normalizeTextForDuplicateCheck(text: string): string {
  return text
    .replace(/#[^\s#]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

function buildNgramFrequencyMap(str: string, n: number): { map: Map<string, number>; total: number } {
  const map = new Map<string, number>();
  let total = 0;
  if (str.length < n) {
    return { map, total };
  }
  for (let i = 0; i <= str.length - n; i++) {
    const gram = str.slice(i, i + n);
    map.set(gram, (map.get(gram) ?? 0) + 1);
    total += 1;
  }
  return { map, total };
}

function computeNgramOverlapStats(
  a: string,
  b: string,
  n: number
): { dice: number; containment: number } {
  const ga = buildNgramFrequencyMap(a, n);
  const gb = buildNgramFrequencyMap(b, n);
  if (ga.total === 0 || gb.total === 0) {
    return { dice: 0, containment: 0 };
  }
  let intersection = 0;
  for (const [gram, countA] of ga.map.entries()) {
    const countB = gb.map.get(gram);
    if (countB) {
      intersection += Math.min(countA, countB);
    }
  }
  const dice = (2 * intersection) / (ga.total + gb.total);
  const containment = intersection / Math.min(ga.total, gb.total);
  return { dice, containment };
}

function extractMatchingDuplicateQuotes(targetText: string, otherTexts: string[]): string[] {
  const clauses = targetText
    .split(/[\n.!?,]+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/\s+/g, '').length >= 8);

  const normalizedOthers = otherTexts.map((t) => normalizeTextForDuplicateCheck(t));
  const matched: string[] = [];

  for (const clause of clauses) {
    const normClause = normalizeTextForDuplicateCheck(clause);
    if (normClause.length < 8) continue;
    const foundMatch = normalizedOthers.some((normOther) => {
      if (normOther.includes(normClause)) return true;
      const { containment } = computeNgramOverlapStats(normClause, normOther, 3);
      return containment >= 0.65;
    });
    if (foundMatch) {
      matched.push(clause);
    }
  }

  if (matched.length > 0) {
    return Array.from(new Set(matched)).slice(0, 3);
  }

  const trimmed = targetText.trim();
  return trimmed ? [trimmed.slice(0, 80)] : [];
}

export function detectDuplicateReviewsByCode(
  targetText: string,
  targetId: number,
  allReviews: Array<{ id: number; text: string }>
): {
  detected: boolean;
  similarReviewIndices: number[];
  maxSimilarityPct: number;
  evidenceQuotes: string[];
  reason: string;
} {
  if (allReviews.length < 2 || isReviewTooShort(targetText)) {
    return {
      detected: false,
      similarReviewIndices: [],
      maxSimilarityPct: 0,
      evidenceQuotes: [],
      reason:
        allReviews.length < 2
          ? '비교할 다른 리뷰가 없어 문장 유사도 비교를 생략했습니다.'
          : '비교 대상 리뷰 문장이 짧아 문장 유사도 비교에서 제외했습니다.',
    };
  }

  const normTarget = normalizeTextForDuplicateCheck(targetText);
  if (normTarget.length < 15) {
    return {
      detected: false,
      similarReviewIndices: [],
      maxSimilarityPct: 0,
      evidenceQuotes: [],
      reason: '비교 가능한 문자 수가 부족해 문장 유사도를 판정하지 않았습니다.',
    };
  }

  const matchedOthers: Array<{ id: number; text: string; score: number }> = [];

  for (const other of allReviews) {
    if (other.id === targetId || !other.text || isReviewTooShort(other.text)) {
      continue;
    }
    const normOther = normalizeTextForDuplicateCheck(other.text);
    if (normOther.length < 15) continue;

    const s2 = computeNgramOverlapStats(normTarget, normOther, 2);
    const s3 = computeNgramOverlapStats(normTarget, normOther, 3);
    const combinedScore = 0.45 * s2.dice + 0.55 * s3.dice;
    const minLen = Math.min(normTarget.length, normOther.length);
    const isNearDuplicate =
      combinedScore >= 0.48 || (s3.containment >= 0.62 && minLen >= 25);

    if (isNearDuplicate) {
      matchedOthers.push({
        id: other.id,
        text: other.text,
        score: Math.max(combinedScore, s3.containment * 0.9),
      });
    }
  }

  if (matchedOthers.length === 0) {
    return {
      detected: false,
      similarReviewIndices: [],
      maxSimilarityPct: 0,
      evidenceQuotes: [],
      reason: `입력된 전체 리뷰(${allReviews.length}개) 중 문장이 거의 같은 리뷰가 발견되지 않았습니다.`,
    };
  }

  matchedOthers.sort((a, b) => b.score - a.score || a.id - b.id);
  const similarReviewIndices = matchedOthers.map((m) => m.id);
  const maxSimilarityPct = Math.min(100, Math.round(matchedOthers[0].score * 100));
  const evidenceQuotes = extractMatchingDuplicateQuotes(
    targetText,
    matchedOthers.map((m) => m.text)
  );
  const indexLabels = similarReviewIndices.slice(0, 5).map((n) => `#${n}`).join(', ');
  const extraCount = similarReviewIndices.length > 5 ? ` 외 ${similarReviewIndices.length - 5}건` : '';

  return {
    detected: true,
    similarReviewIndices,
    maxSimilarityPct,
    evidenceQuotes,
    reason: `전체 리뷰 ${allReviews.length}개 중 ${indexLabels}${extraCount}과 글자·문장 패턴이 거의 같습니다 (겹침 약 ${maxSimilarityPct}%).`,
  };
}

function pickEvenlySpacedIndices(length: number, count: number): number[] {
  if (count <= 0 || length <= 0) return [];
  if (count >= length) {
    return Array.from({ length }, (_, i) => i);
  }
  if (count === 1) {
    return [Math.floor((length - 1) / 2)];
  }
  const picked = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (length - 1)) / (count - 1));
    picked.add(idx);
  }
  // Fill any rounding collision deterministically
  let cursor = 0;
  while (picked.size < count && cursor < length) {
    if (!picked.has(cursor)) {
      picked.add(cursor);
    }
    cursor += 1;
  }
  return Array.from(picked).sort((a, b) => a - b);
}

export function selectBalancedReviews<T extends { id: number; rating: number | null }>(
  reviews: T[],
  limit = 15
): {
  selected: T[];
  method: 'all' | 'auto_rating' | 'auto_order';
  summaryLabel: string;
} {
  if (reviews.length <= limit) {
    return {
      selected: [...reviews],
      method: 'all',
      summaryLabel: '전체 입력',
    };
  }

  const ratedItems = reviews.filter((r) => typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5);
  if (ratedItems.length === 0) {
    const indices = pickEvenlySpacedIndices(reviews.length, limit);
    return {
      selected: indices.map((i) => reviews[i]),
      method: 'auto_order',
      summaryLabel: '자동·순서 고르게',
    };
  }

  const bucketKeys = ['5', '4', '3', '2', '1', 'none'] as const;
  const buckets = new Map<string, T[]>();
  for (const key of bucketKeys) {
    buckets.set(key, []);
  }
  for (const item of reviews) {
    const key =
      typeof item.rating === 'number' && item.rating >= 1 && item.rating <= 5
        ? String(Math.round(item.rating))
        : 'none';
    buckets.get(key)!.push(item);
  }

  const nonEmptyBuckets = bucketKeys
    .map((key) => ({ key, items: buckets.get(key)! }))
    .filter((b) => b.items.length > 0);

  // Hamilton largest-remainder apportionment matching rating distribution
  const exactQuotas = nonEmptyBuckets.map((b) => {
    const exact = (b.items.length / reviews.length) * limit;
    return {
      key: b.key,
      items: b.items,
      quota: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let allocated = exactQuotas.reduce((acc, q) => acc + q.quota, 0);
  const byRemainder = [...exactQuotas].sort(
    (a, b) => b.remainder - a.remainder || b.items.length - a.items.length
  );
  let rIdx = 0;
  while (allocated < limit && rIdx < byRemainder.length) {
    if (byRemainder[rIdx].quota < byRemainder[rIdx].items.length) {
      byRemainder[rIdx].quota += 1;
      allocated += 1;
    }
    rIdx += 1;
    if (rIdx >= byRemainder.length && allocated < limit) {
      rIdx = 0;
    }
  }

  const selectedSet = new Set<T>();
  const breakdownParts: string[] = [];

  for (const entry of exactQuotas) {
    if (entry.quota <= 0) continue;
    const pickedIndices = pickEvenlySpacedIndices(entry.items.length, entry.quota);
    for (const idx of pickedIndices) {
      selectedSet.add(entry.items[idx]);
    }
    breakdownParts.push(
      entry.key === 'none' ? `미입력 ${entry.quota}개` : `${entry.key}점 ${entry.quota}개`
    );
  }

  // Preserve original list order
  const selected = reviews.filter((r) => selectedSet.has(r));
  return {
    selected,
    method: 'auto_rating',
    summaryLabel: `자동·별점 고르게 (${breakdownParts.join(' · ')})`,
  };
}

