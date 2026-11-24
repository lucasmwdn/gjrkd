import type { SuspiciousSignalResult, TrustSignalResult } from '../types/review';

export type HighlightKind = 'suspicious' | 'trust';

export interface TextSegment {
  text: string;
  kind: 'plain' | HighlightKind;
  signalType?: string;
  reason?: string;
}

interface MatchSpan {
  start: number;
  end: number;
  kind: HighlightKind;
  signalType: string;
  reason: string;
}

function findQuoteRange(haystack: string, quote: string): { start: number; end: number } | null {
  const cleanQuote = quote.trim();
  if (cleanQuote.length < 2) return null;

  const exactIdx = haystack.indexOf(cleanQuote);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + cleanQuote.length };
  }

  // Fallback: tolerate minor whitespace differences
  const escaped = cleanQuote
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  try {
    const regex = new RegExp(escaped);
    const match = regex.exec(haystack);
    if (match && match[0].length > 0) {
      return { start: match.index, end: match.index + match[0].length };
    }
  } catch {
    return null;
  }

  return null;
}

export function buildHighlightedSegments(
  originalText: string,
  suspiciousSignals: SuspiciousSignalResult[],
  trustSignals: TrustSignalResult[]
): TextSegment[] {
  const candidateSpans: MatchSpan[] = [];

  for (const sig of suspiciousSignals) {
    if (!sig.detected) continue;
    for (const quote of sig.evidenceQuotes) {
      const range = findQuoteRange(originalText, quote);
      if (range) {
        candidateSpans.push({
          ...range,
          kind: 'suspicious',
          signalType: sig.type,
          reason: sig.reason,
        });
      }
    }
  }

  for (const sig of trustSignals) {
    if (!sig.detected) continue;
    for (const quote of sig.evidenceQuotes) {
      const range = findQuoteRange(originalText, quote);
      if (range) {
        candidateSpans.push({
          ...range,
          kind: 'trust',
          signalType: sig.type,
          reason: sig.reason,
        });
      }
    }
  }

  if (candidateSpans.length === 0) {
    return [{ text: originalText, kind: 'plain' }];
  }

  // Sort by start index ascending, then longer span first
  candidateSpans.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping: MatchSpan[] = [];
  let cursor = 0;

  for (const span of candidateSpans) {
    if (span.start >= cursor) {
      nonOverlapping.push(span);
      cursor = span.end;
    } else if (span.end > cursor) {
      // Partial overlap: trim start to cursor if enough text remains
      if (span.end - cursor >= 2) {
        nonOverlapping.push({
          ...span,
          start: cursor,
        });
        cursor = span.end;
      }
    }
  }

  const segments: TextSegment[] = [];
  let pos = 0;

  for (const span of nonOverlapping) {
    if (span.start > pos) {
      segments.push({
        text: originalText.slice(pos, span.start),
        kind: 'plain',
      });
    }
    segments.push({
      text: originalText.slice(span.start, span.end),
      kind: span.kind,
      signalType: span.signalType,
      reason: span.reason,
    });
    pos = span.end;
  }

  if (pos < originalText.length) {
    segments.push({
      text: originalText.slice(pos),
      kind: 'plain',
    });
  }

  return segments;
}
