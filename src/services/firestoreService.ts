import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppealItem,
  AppealReanalysisComparison,
  CriteriaConfig,
  CriteriaHistoryItem,
  CriteriaProposal,
} from '../types/review';
import {
  applyProposalToCriteria,
  DEFAULT_CRITERIA_CONFIG,
  sanitizeCriteriaConfig,
} from '../utils/criteriaScoring';

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    return val;
  }
  return new Date().toISOString();
}

export function generateFirestoreId(prefix: string): string {
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6) || 'x1';
  return `${prefix}-${Date.now()}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function seedCriteriaIfMissing(adminUid: string): Promise<void> {
  const path = 'criteria/active';
  try {
    const ref = doc(db, 'criteria', 'active');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const safe = sanitizeCriteriaConfig(DEFAULT_CRITERIA_CONFIG);
      await setDoc(ref, {
        version: safe.version,
        updatedAt: serverTimestamp(),
        updatedByUid: adminUid,
        baseTrustScore: safe.baseTrustScore,
        areas: safe.areas,
        signals: safe.signals,
        categoryCriteria: safe.categoryCriteria,
      });
    } else {
      const existingData = snap.data() as Partial<CriteriaConfig>;
      const existingVersion =
        typeof existingData.version === 'number' ? existingData.version : 1;
      if (existingVersion < DEFAULT_CRITERIA_CONFIG.version) {
        const upgraded = sanitizeCriteriaConfig(existingData);
        await setDoc(ref, {
          version: upgraded.version,
          updatedAt: serverTimestamp(),
          updatedByUid: adminUid,
          baseTrustScore: upgraded.baseTrustScore,
          areas: upgraded.areas,
          signals: upgraded.signals,
          categoryCriteria: upgraded.categoryCriteria,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchActiveCriteriaFromFirestore(
  fallback: CriteriaConfig
): Promise<CriteriaConfig> {
  try {
    const snap = await getDoc(doc(db, 'criteria', 'active'));
    if (!snap.exists()) {
      return sanitizeCriteriaConfig(fallback);
    }
    const data = snap.data();
    return sanitizeCriteriaConfig({
      ...data,
      updatedAt: toIsoString(data.updatedAt),
    } as Partial<CriteriaConfig>);
  } catch {
    return sanitizeCriteriaConfig(fallback);
  }
}

export function subscribeCriteria(
  onData: (criteria: CriteriaConfig, existsInDb: boolean) => void
): Unsubscribe {
  const path = 'criteria/active';
  const ref = doc(db, 'criteria', 'active');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(sanitizeCriteriaConfig(DEFAULT_CRITERIA_CONFIG), false);
        return;
      }
      const data = snap.data();
      const parsed = sanitizeCriteriaConfig({
        ...data,
        updatedAt: toIsoString(data.updatedAt),
      } as Partial<CriteriaConfig>);
      onData(parsed, true);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeCriteriaHistory(
  onData: (history: CriteriaHistoryItem[]) => void
): Unsubscribe {
  const path = 'criteriaHistory';
  const q = query(collection(db, path), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items: CriteriaHistoryItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          changedAt: toIsoString(data.changedAt),
          changedDateLabel: String(data.changedDateLabel ?? ''),
          proposalType: data.proposalType ?? 'add',
          signalName: String(data.signalName ?? ''),
          area: data.area ?? '일관성',
          changeSummary: String(data.changeSummary ?? ''),
          detailDescription: String(data.detailDescription ?? ''),
          supportingAppealCount: Number(data.supportingAppealCount ?? 3),
          approvedByUid: String(data.approvedByUid ?? ''),
          isPublic: true,
        };
      });
      items.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAppeals(onData: (appeals: AppealItem[]) => void): Unsubscribe {
  const path = 'appeals';
  const q = query(collection(db, path), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items: AppealItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          authorId: String(data.authorId ?? ''),
          createdAt: toIsoString(data.createdAt),
          reviewText: String(data.reviewText ?? ''),
          rating: typeof data.rating === 'number' ? data.rating : null,
          productInfo: data.productInfo ?? null,
          aiScore: Number(data.aiScore ?? 0),
          aiAreaScores: data.aiAreaScores ?? null,
          aiTierLabel: String(data.aiTierLabel ?? ''),
          aiSignals: Array.isArray(data.aiSignals) ? data.aiSignals : [],
          expectedJudgment: data.expectedJudgment ?? '더 믿을 만한 리뷰다',
          problematicPart: String(data.problematicPart ?? ''),
          reason: String(data.reason ?? ''),
          status: data.status ?? '대기',
          rejectionReason: data.rejectionReason ?? null,
          proposalId: data.proposalId ?? null,
          reanalysisComparison: data.reanalysisComparison ?? null,
          isPublic: true,
        };
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeProposals(
  adminUid: string,
  onData: (proposals: CriteriaProposal[]) => void
): Unsubscribe {
  const path = 'proposals';
  const q = query(collection(db, path), where('createdByUid', '==', adminUid));
  return onSnapshot(
    q,
    (snap) => {
      const items: CriteriaProposal[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          createdByUid: String(data.createdByUid ?? adminUid),
          createdAt: toIsoString(data.createdAt),
          proposalType: data.proposalType ?? 'add',
          status: data.status ?? 'pending',
          signalName: String(data.signalName ?? ''),
          targetSignalId: data.targetSignalId ?? null,
          kind: data.kind === 'trust' ? 'trust' : 'suspicious',
          area: data.area ?? '일관성',
          proposedPoints: typeof data.proposedPoints === 'number' ? data.proposedPoints : null,
          proposedAction: data.proposedAction ?? 'add_signal',
          proposedCondition: data.proposedCondition ?? null,
          exampleSentence: data.exampleSentence ?? null,
          rationale: String(data.rationale ?? ''),
          supportingAppealIds: Array.isArray(data.supportingAppealIds)
            ? data.supportingAppealIds.map(String)
            : [],
          supportingAppealCount: Number(data.supportingAppealCount ?? 3),
          representativeCases: Array.isArray(data.representativeCases)
            ? data.representativeCases
            : [],
          rejectionReason: data.rejectionReason ?? null,
        };
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createAppealDoc(
  appeal: Omit<AppealItem, 'createdAt' | 'status' | 'isPublic'>
): Promise<void> {
  const path = `appeals/${appeal.id}`;
  try {
    await setDoc(doc(db, 'appeals', appeal.id), {
      id: appeal.id,
      authorId: appeal.authorId,
      createdAt: serverTimestamp(),
      reviewText: appeal.reviewText.slice(0, 4000),
      rating: appeal.rating ?? null,
      productInfo: appeal.productInfo ?? null,
      aiScore: appeal.aiScore,
      aiAreaScores: appeal.aiAreaScores ?? null,
      aiTierLabel: appeal.aiTierLabel.slice(0, 60),
      aiSignals: appeal.aiSignals.slice(0, 50),
      expectedJudgment: appeal.expectedJudgment,
      problematicPart: appeal.problematicPart.slice(0, 1000),
      reason: appeal.reason.slice(0, 2000),
      status: '대기',
      isPublic: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteAppealDoc(appealId: string): Promise<void> {
  const path = `appeals/${appealId}`;
  try {
    await deleteDoc(doc(db, 'appeals', appealId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveProposalsBatch(
  proposals: Omit<CriteriaProposal, 'createdAt' | 'createdByUid' | 'status'>[],
  adminUid: string
): Promise<void> {
  if (proposals.length === 0) return;
  const path = 'proposals';
  try {
    const batch = writeBatch(db);
    for (const p of proposals) {
      const ref = doc(db, 'proposals', p.id);
      batch.set(ref, {
        id: p.id,
        createdByUid: adminUid,
        createdAt: serverTimestamp(),
        proposalType: p.proposalType,
        status: 'pending',
        signalName: p.signalName.slice(0, 120),
        targetSignalId: p.targetSignalId ?? null,
        kind: p.kind,
        area: p.area,
        proposedPoints: p.proposedPoints ?? null,
        proposedAction: p.proposedAction,
        proposedCondition: p.proposedCondition ? p.proposedCondition.slice(0, 300) : null,
        exampleSentence: p.exampleSentence ? p.exampleSentence.slice(0, 500) : null,
        rationale: p.rationale.slice(0, 1000),
        supportingAppealIds: p.supportingAppealIds.slice(0, 100),
        supportingAppealCount: Math.max(3, p.supportingAppealCount),
        representativeCases: p.representativeCases.slice(0, 2),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function approveProposalTransaction(params: {
  proposal: CriteriaProposal;
  currentCriteria: CriteriaConfig;
  adminUid: string;
  comparisonsByAppealId: Record<string, AppealReanalysisComparison>;
  pendingAppealIds: Set<string>;
}): Promise<{ nextCriteria: CriteriaConfig }> {
  const { proposal, currentCriteria, adminUid, comparisonsByAppealId, pendingAppealIds } = params;
  const { nextCriteria, changeSummary, detailDescription } = applyProposalToCriteria(
    currentCriteria,
    proposal,
    adminUid
  );

  const historyId = generateFirestoreId('hist');
  const changedDateLabel = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const batch = writeBatch(db);

  // 1. Update /criteria/active
  batch.set(doc(db, 'criteria', 'active'), {
    version: nextCriteria.version,
    updatedAt: serverTimestamp(),
    updatedByUid: adminUid,
    baseTrustScore: nextCriteria.baseTrustScore,
    areas: nextCriteria.areas,
    signals: nextCriteria.signals,
    categoryCriteria: nextCriteria.categoryCriteria,
  });

  // 2. Update /proposals/{id}
  batch.update(doc(db, 'proposals', proposal.id), {
    status: 'approved',
    signalName: proposal.signalName.slice(0, 120),
    area: proposal.area,
    proposedPoints: proposal.proposedPoints ?? null,
    proposedCondition: proposal.proposedCondition ? proposal.proposedCondition.slice(0, 300) : null,
  });

  // 3. Create /criteriaHistory/{historyId}
  batch.set(doc(db, 'criteriaHistory', historyId), {
    id: historyId,
    changedAt: serverTimestamp(),
    changedDateLabel,
    proposalType: proposal.proposalType,
    signalName: proposal.signalName.slice(0, 120),
    area: proposal.area,
    changeSummary: changeSummary.slice(0, 400),
    detailDescription: detailDescription.slice(0, 1000),
    supportingAppealCount: Math.max(3, proposal.supportingAppealCount),
    approvedByUid: adminUid,
    isPublic: true,
  });

  // 4. Update supporting pending appeals -> "반영됨" + before/after comparison
  for (const appealId of proposal.supportingAppealIds) {
    if (!pendingAppealIds.has(appealId)) continue;
    const comparison = comparisonsByAppealId[appealId] ?? null;
    batch.update(doc(db, 'appeals', appealId), {
      status: '반영됨',
      proposalId: proposal.id,
      reanalysisComparison: comparison,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `proposals/${proposal.id}`);
  }

  return { nextCriteria };
}

export async function rejectProposalTransaction(params: {
  proposal: CriteriaProposal;
  rejectionReason: string;
  pendingAppealIds: Set<string>;
}): Promise<void> {
  const { proposal, rejectionReason, pendingAppealIds } = params;
  const trimmedReason = rejectionReason.trim().slice(0, 1000);
  const batch = writeBatch(db);

  batch.update(doc(db, 'proposals', proposal.id), {
    status: 'rejected',
    rejectionReason: trimmedReason,
  });

  for (const appealId of proposal.supportingAppealIds) {
    if (!pendingAppealIds.has(appealId)) continue;
    batch.update(doc(db, 'appeals', appealId), {
      status: '검토 완료',
      proposalId: proposal.id,
      rejectionReason: trimmedReason,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `proposals/${proposal.id}`);
  }
}
