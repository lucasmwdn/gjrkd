import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Edit3,
  Loader2,
  Lock,
  MessageSquareWarning,
  Shield,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  FIXED_AREA_ORDER,
  type AppealItem,
  type AppealReanalysisComparison,
  type AppealStatus,
  type CriteriaConfig,
  type CriteriaProposal,
  type SignalAreaKey,
} from '../types/review';
import { fetchAiWithRetry } from '../utils/aiFetch';
import {
  applyProposalToCriteria,
  clampAdjustSignalPoints,
  clampNewSignalPoints,
} from '../utils/criteriaScoring';

interface AppealsViewProps {
  appeals: AppealItem[];
  criteria: CriteriaConfig;
  proposals: CriteriaProposal[];
  currentUser: User | null;
  isAdminUser: boolean;
  adminMode: boolean;
  onToggleAdminMode: () => Promise<void>;
  onDeleteAppeal: (id: string) => Promise<void>;
  onAnalyzeAppeals: (
    onStatusChange?: (status: string | null) => void
  ) => Promise<{ createdCount: number; message?: string }>;
  onApproveProposal: (
    proposal: CriteriaProposal,
    comparisons: Record<string, AppealReanalysisComparison>
  ) => Promise<void>;
  onRejectProposal: (proposal: CriteriaProposal, reason: string) => Promise<void>;
  onStartAnalyze: () => void;
}

type StatusFilter = '전체' | AppealStatus;

export function AppealsView({
  appeals,
  criteria,
  proposals,
  currentUser,
  isAdminUser,
  adminMode,
  onToggleAdminMode,
  onDeleteAppeal,
  onAnalyzeAppeals,
  onApproveProposal,
  onRejectProposal,
  onStartAnalyze,
}: AppealsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체');
  const [isAnalyzingAppeals, setIsAnalyzingAppeals] = useState(false);
  const [appealRetryStatus, setAppealRetryStatus] = useState<string | null>(null);
  const [reanalyzeRetryStatus, setReanalyzeRetryStatus] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState('');
  const [adminError, setAdminError] = useState('');

  // Proposal action states
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editSignalName, setEditSignalName] = useState('');
  const [editArea, setEditArea] = useState<SignalAreaKey>('일관성');
  const [editPoints, setEditPoints] = useState<number>(-5);
  const [editCondition, setEditCondition] = useState('');

  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState('');

  const [latestComparisons, setLatestComparisons] = useState<
    { appeal: AppealItem; comparison: AppealReanalysisComparison }[]
  >([]);

  const pendingAppeals = appeals.filter((a) => a.status === '대기');
  const reflectedCount = appeals.filter((a) => a.status === '반영됨').length;
  const reviewedCount = appeals.filter((a) => a.status === '검토 완료').length;

  const filteredAppeals =
    statusFilter === '전체'
      ? appeals
      : appeals.filter((a) => a.status === statusFilter);

  const pendingProposals = proposals.filter((p) => p.status === 'pending');

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const handleRunAnalyzeAppeals = async () => {
    setAdminNotice('');
    setAdminError('');
    setAppealRetryStatus(null);
    setIsAnalyzingAppeals(true);
    try {
      const res = await onAnalyzeAppeals(setAppealRetryStatus);
      if (res.createdCount > 0) {
        setAdminNotice(
          `이의 제기 패턴을 분석해 ${res.createdCount}건의 기준 변경 제안을 생성했습니다.`
        );
      } else {
        setAdminNotice(
          res.message || '3건 이상 같은 이유로 모인 패턴이 아직 없어 제안이 생성되지 않았습니다.'
        );
      }
    } catch (err: unknown) {
      setAdminError(
        err instanceof Error ? err.message : '이의 제기를 분석하는 중 오류가 발생했습니다.'
      );
    } finally {
      setAppealRetryStatus(null);
      setIsAnalyzingAppeals(false);
    }
  };

  const openEditProposal = (p: CriteriaProposal) => {
    setRejectingProposalId(null);
    setEditingProposalId(p.id);
    setEditSignalName(p.signalName);
    setEditArea(p.area);
    setEditPoints(
      typeof p.proposedPoints === 'number'
        ? p.proposedPoints
        : p.kind === 'trust'
          ? 5
          : -5
    );
    setEditCondition(p.proposedCondition || '항상 적용');
  };

  const handleConfirmApprove = async (proposal: CriteriaProposal, useEdits: boolean) => {
    if (!currentUser) return;
    setAdminError('');
    setAdminNotice('');
    setReanalyzeRetryStatus(null);
    setBusyProposalId(proposal.id);

    try {
      let finalProposal: CriteriaProposal = { ...proposal };
      if (useEdits) {
        const clampedPts =
          proposal.proposedAction === 'add_signal'
            ? clampNewSignalPoints(editPoints, proposal.kind)
            : proposal.proposedAction === 'adjust_points'
              ? clampAdjustSignalPoints(editPoints, proposal.kind)
              : proposal.proposedPoints ?? null;

        finalProposal = {
          ...proposal,
          signalName: editSignalName.trim() || proposal.signalName,
          area: editArea,
          proposedPoints: clampedPts,
          proposedCondition: editCondition.trim() || '항상 적용',
        };
      }

      // Compute preview of nextCriteria to re-analyze affected reviews before committing
      const { nextCriteria } = applyProposalToCriteria(
        criteria,
        finalProposal,
        currentUser.uid
      );

      const affectedAppeals = appeals.filter(
        (a) => finalProposal.supportingAppealIds.includes(a.id) && a.status === '대기'
      );

      let comparisons: Record<string, AppealReanalysisComparison> = {};
      if (affectedAppeals.length > 0) {
        const idToken = await currentUser.getIdToken();
        const reData = await fetchAiWithRetry<{
          comparisons?: Record<string, AppealReanalysisComparison>;
        }>({
          url: '/api/reanalyze-comparison',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          body: {
            appealsToReanalyze: affectedAppeals,
            updatedCriteria: nextCriteria,
          },
          onStatusChange: setReanalyzeRetryStatus,
        });
        comparisons = (reData.comparisons ?? {}) as Record<string, AppealReanalysisComparison>;
      }

      await onApproveProposal(finalProposal, comparisons);

      const comparisonList = affectedAppeals
        .map((a) => (comparisons[a.id] ? { appeal: a, comparison: comparisons[a.id] } : null))
        .filter((x): x is NonNullable<typeof x> => x !== null);
      setLatestComparisons(comparisonList);

      setEditingProposalId(null);
      setAdminNotice(
        `"${finalProposal.signalName}" 제안을 승인해 판단 기준(v${nextCriteria.version})에 반영하고 근거 이의 제기 ${affectedAppeals.length}건을 재분석했습니다.`
      );
    } catch (err: unknown) {
      setAdminError(
        err instanceof Error ? err.message : '제안을 승인하는 중 오류가 발생했습니다.'
      );
    } finally {
      setReanalyzeRetryStatus(null);
      setBusyProposalId(null);
    }
  };

  const handleConfirmReject = async (proposal: CriteriaProposal) => {
    const trimmed = rejectionReasonDraft.trim();
    if (trimmed.length < 3) {
      setAdminError('거절 사유를 3자 이상 입력해 주세요.');
      return;
    }
    setAdminError('');
    setAdminNotice('');
    setBusyProposalId(proposal.id);

    try {
      await onRejectProposal(proposal, trimmed);
      setRejectingProposalId(null);
      setRejectionReasonDraft('');
      setAdminNotice('제안을 거절하고 근거 이의 제기를 "검토 완료" 상태로 변경했습니다.');
    } catch (err: unknown) {
      setAdminError(
        err instanceof Error ? err.message : '제안을 거절하는 중 오류가 발생했습니다.'
      );
    } finally {
      setBusyProposalId(null);
    }
  };

  const statusTextStyle: Record<AppealStatus, string> = {
    대기: 'text-[#B45309]',
    반영됨: 'text-[#059669]',
    '검토 완료': 'text-[#475569]',
  };

  const proposalTypeTitle = (p: CriteriaProposal) => {
    if (p.proposedAction === 'add_signal') return '① 새 신호 추가';
    if (p.proposedAction === 'adjust_points') return '② 기존 신호 점수 조정';
    if (p.proposedAction === 'delete_signal') return '③ 기존 신호 삭제(비활성화)';
    return '③ 기존 신호 적용 조건 변경';
  };

  return (
    <div className="space-y-8 py-6 sm:py-10">
      {/* Header + Admin Mode Toggle */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2557] tracking-tight">
            이의 제기 목록
          </h1>
          <p className="text-sm sm:text-base text-[#475569]">
            같은 이유의 이의 제기가 3건 이상 모이면 판단 기준 개선 제안으로 검토되어 기준표에 반영됩니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void onToggleAdminMode()}
            className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors whitespace-nowrap ${
              adminMode
                ? 'bg-[#0F2557] text-white border-[#0F2557]'
                : 'bg-white text-[#0F2557] border-[#CBD5E1] hover:bg-[#F1F5F9]'
            }`}
          >
            {adminMode ? (
              <Shield className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Lock className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{adminMode ? '관리자 모드 ON' : '관리자 모드'}</span>
          </button>

          {adminMode && (
            <button
              type="button"
              onClick={() => void handleRunAnalyzeAppeals()}
              disabled={isAnalyzingAppeals}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1E3A8A] text-white text-sm font-semibold hover:bg-[#0F2557] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {isAnalyzingAppeals ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>{appealRetryStatus || '패턴 분석 중...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>이의 제기 분석하기 ({pendingAppeals.length}건 대기)</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Live AI Retry Status Banner */}
      {(appealRetryStatus || reanalyzeRetryStatus) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-sm text-[#1E3A8A]"
        >
          <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
          <span>{appealRetryStatus || reanalyzeRetryStatus}</span>
        </div>
      )}

      {/* Admin Feedback / Notice */}
      {adminError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{adminError}</span>
        </div>
      )}

      {adminNotice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-sm text-[#1E3A8A]"
        >
          <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{adminNotice}</span>
        </div>
      )}

      {/* Before vs After Re-analysis Comparison Panel (shown immediately after an approval) */}
      {adminMode && latestComparisons.length > 0 && (
        <section className="bg-white border border-[#BFDBFE] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
            <div>
              <h2 className="text-base font-bold text-[#0F2557]">
                기준 변경 전 · 후 재분석 점수 비교
              </h2>
              <p className="text-xs text-[#475569] mt-0.5">
                승인된 기준으로 해당 이의 제기 리뷰들을 다시 분석한 결과입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLatestComparisons([])}
              className="text-xs font-medium text-[#64748B] hover:text-[#0F2557]"
            >
              닫기
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {latestComparisons.map(({ appeal, comparison }) => {
              const delta = comparison.afterScore - comparison.beforeScore;
              return (
                <div
                  key={appeal.id}
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-2.5"
                >
                  <p className="text-xs text-[#475569] line-clamp-2 leading-relaxed">
                    “{appeal.reviewText}”
                  </p>
                  <div className="flex items-center gap-2 text-sm font-mono-num font-bold">
                    <span className="text-[#64748B]">변경 전 {comparison.beforeScore}점</span>
                    <ArrowRight className="w-4 h-4 text-[#0F2557]" aria-hidden="true" />
                    <span className="text-[#0F2557]">변경 후 {comparison.afterScore}점</span>
                    <span
                      className={
                        delta > 0
                          ? 'text-[#059669]'
                          : delta < 0
                            ? 'text-[#DC2626]'
                            : 'text-[#64748B]'
                      }
                    >
                      ({delta > 0 ? `+${delta}` : delta}점)
                    </span>
                  </div>
                  <p className="text-xs text-[#334155] leading-relaxed">
                    {comparison.afterSummary}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Admin Mode: Pending Proposals Queue */}
      {adminMode && pendingProposals.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-[#0F2557]">
              기준 변경 제안 검토 ({pendingProposals.length}건)
            </h2>
            <span className="text-xs text-[#64748B]">
              새 신호 점수 허용 범위: ±3 ~ ±10점 · 영역 만점(30/20/25/25) 고정
            </span>
          </div>

          <div className="space-y-4">
            {pendingProposals.map((proposal) => {
              const isBusy = busyProposalId === proposal.id;
              const isEditing = editingProposalId === proposal.id;
              const isRejecting = rejectingProposalId === proposal.id;

              return (
                <article
                  key={proposal.id}
                  className="bg-white border border-[#CBD5E1] rounded-xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F1F5F9] pb-3.5">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-[#1E3A8A]">
                          {proposalTypeTitle(proposal)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#0F2557]">
                          {proposal.area} 영역
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num font-semibold text-[#0F2557]">
                          근거 이의 제기 {proposal.supportingAppealCount}건
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">
                        {proposal.signalName}
                        {typeof proposal.proposedPoints === 'number' && (
                          <span
                            className={`ml-2 font-mono-num text-sm font-bold ${
                              proposal.proposedPoints > 0
                                ? 'text-[#059669]'
                                : 'text-[#DC2626]'
                            }`}
                          >
                            ({proposal.proposedPoints > 0
                              ? `+${proposal.proposedPoints}`
                              : proposal.proposedPoints}
                            점)
                          </span>
                        )}
                      </h3>
                    </div>
                  </div>

                  <p className="text-sm text-[#334155] leading-relaxed">{proposal.rationale}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5">
                    <div>
                      <span className="font-semibold text-[#0F2557]">적용 조건: </span>
                      <span className="text-[#334155]">
                        {proposal.proposedCondition || '항상 적용'}
                      </span>
                    </div>
                    {proposal.exampleSentence && (
                      <div>
                        <span className="font-semibold text-[#0F2557]">예시 문장: </span>
                        <span className="text-[#334155]">“{proposal.exampleSentence}”</span>
                      </div>
                    )}
                  </div>

                  {/* 2 Representative Cases */}
                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-[#0F2557]">
                      대표 사례 ({proposal.representativeCases.length}건)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {proposal.representativeCases.map((c, idx) => (
                        <div
                          key={c.appealId + idx}
                          className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 text-[#64748B]">
                            <span className="font-semibold text-[#0F2557]">
                              사례 {idx + 1} · {c.expectedJudgment}
                            </span>
                            <span className="font-mono-num">AI {c.aiScore}점</span>
                          </div>
                          <p className="text-[#334155] line-clamp-2 leading-relaxed">
                            리뷰: “{c.reviewExcerpt}”
                          </p>
                          <p className="text-[#475569] leading-relaxed">
                            <strong className="text-[#0F172A]">지적 부분:</strong> {c.problematicPart}
                          </p>
                          <p className="text-[#475569] leading-relaxed">
                            <strong className="text-[#0F172A]">이유:</strong> {c.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Edit Before Approve Form */}
                  {isEditing && (
                    <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-4 space-y-3">
                      <p className="text-xs font-bold text-[#0F2557]">
                        제안 내용 수정 후 승인
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-[#334155]">
                            신호 이름
                          </label>
                          <input
                            type="text"
                            value={editSignalName}
                            onChange={(e) => setEditSignalName(e.target.value)}
                            className="w-full min-h-[38px] rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-[#334155]">
                            영역
                          </label>
                          <select
                            value={editArea}
                            onChange={(e) => setEditArea(e.target.value as SignalAreaKey)}
                            disabled={proposal.proposedAction !== 'add_signal'}
                            className="w-full min-h-[38px] rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm disabled:opacity-60"
                          >
                            {FIXED_AREA_ORDER.map((area) => (
                              <option key={area} value={area}>
                                {area}
                              </option>
                            ))}
                          </select>
                        </div>

                        {(proposal.proposedAction === 'add_signal' ||
                          proposal.proposedAction === 'adjust_points') && (
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-[#334155]">
                              점수{' '}
                              {proposal.proposedAction === 'add_signal' && (
                                <span className="text-[#1E3A8A]">(±3~±10 범위 자동 보정)</span>
                              )}
                            </label>
                            <input
                              type="number"
                              value={editPoints}
                              onChange={(e) => setEditPoints(Number(e.target.value))}
                              className="w-full min-h-[38px] rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm font-mono-num"
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-[#334155]">
                          적용 조건
                        </label>
                        <input
                          type="text"
                          value={editCondition}
                          onChange={(e) => setEditCondition(e.target.value)}
                          className="w-full min-h-[38px] rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingProposalId(null)}
                          disabled={isBusy}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#475569]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConfirmApprove(proposal, true)}
                          disabled={isBusy}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0F2557] text-white text-xs font-semibold hover:bg-[#1E3A8A] disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>수정 내용으로 승인 및 재분석</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason Form */}
                  {isRejecting && (
                    <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-4 space-y-3">
                      <label className="block text-xs font-bold text-[#991B1B]">
                        거절 사유 입력 (근거 이의 제기는 “검토 완료”로 전환됩니다)
                      </label>
                      <textarea
                        rows={2}
                        value={rejectionReasonDraft}
                        onChange={(e) => setRejectionReasonDraft(e.target.value)}
                        placeholder="예: 일부 리뷰에만 해당하는 특수 상황이라 전체 기준에 반영하기 어렵습니다."
                        className="w-full rounded-md border border-[#FECACA] bg-white p-2.5 text-sm text-[#0F172A]"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingProposalId(null);
                            setRejectionReasonDraft('');
                          }}
                          disabled={isBusy}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#475569]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConfirmReject(proposal)}
                          disabled={isBusy}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] disabled:opacity-50"
                        >
                          {isBusy && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          )}
                          <span>거절 확정</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!isEditing && !isRejecting && (
                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#F1F5F9]">
                      <button
                        type="button"
                        onClick={() => void handleConfirmApprove(proposal, false)}
                        disabled={isBusy}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#059669] text-white text-xs sm:text-sm font-semibold hover:bg-[#047857] transition-colors disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Check className="w-4 h-4" aria-hidden="true" />
                        )}
                        <span>승인</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditProposal(proposal)}
                        disabled={isBusy}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#0F2557] bg-white text-[#0F2557] text-xs sm:text-sm font-semibold hover:bg-[#F1F5F9] transition-colors disabled:opacity-50"
                      >
                        <Edit3 className="w-4 h-4" aria-hidden="true" />
                        <span>수정 후 승인</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingProposalId(null);
                          setRejectingProposalId(proposal.id);
                          setRejectionReasonDraft('');
                        }}
                        disabled={isBusy}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#FECACA] bg-white text-[#DC2626] text-xs sm:text-sm font-semibold hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                        <span>거절</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
        <div role="tablist" aria-label="이의 제기 상태 필터" className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: '전체', count: appeals.length },
              { key: '대기', count: pendingAppeals.length },
              { key: '반영됨', count: reflectedCount },
              { key: '검토 완료', count: reviewedCount },
            ] as { key: StatusFilter; count: number }[]
          ).map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(tab.key)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0F2557] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F2557]'
                }`}
              >
                {tab.key}{' '}
                <span className="font-mono-num ml-1 opacity-85">{tab.count}</span>
              </button>
            );
          })}
        </div>

        <span className="font-mono-num text-xs font-medium text-[#64748B]">
          표시 중 {filteredAppeals.length}건
        </span>
      </div>

      {/* Appeals List */}
      {filteredAppeals.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-4">
          <div className="mx-auto w-11 h-11 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#0F2557]">
            <MessageSquareWarning className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-[#0F172A]">
              {appeals.length === 0
                ? '아직 제출된 이의 제기가 없습니다'
                : '해당 상태의 이의 제기가 없습니다'}
            </h2>
            <p className="text-sm text-[#64748B] max-w-md mx-auto">
              리뷰를 분석한 뒤 AI 판단과 내 생각이 다른 부분이 있다면 각 결과 카드에서 “판단이 틀렸나요?”를 눌러 의견을 남길 수 있습니다.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={onStartAnalyze}
              className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#0F2557] text-white text-sm font-semibold hover:bg-[#1E3A8A] transition-colors whitespace-nowrap"
            >
              리뷰 분석하러 가기
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAppeals.map((item) => {
            const canDelete =
              isAdminUser ||
              (currentUser && currentUser.uid === item.authorId && item.status === '대기');

            return (
              <article
                key={item.id}
                className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] border-b border-[#F1F5F9] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-bold ${statusTextStyle[item.status]}`}>
                      [{item.status}]
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[#0F2557]">{item.expectedJudgment}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">
                      AI 판정 {item.aiScore}점 ({item.aiTierLabel})
                    </span>
                    {item.productInfo?.name && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#334155]">
                          {item.productInfo.name}
                          {item.productInfo.category ? ` (${item.productInfo.category})` : ''}
                        </span>
                      </>
                    )}
                    {item.rating !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">별점 ★{item.rating}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono-num">{formatDate(item.createdAt)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void onDeleteAppeal(item.id)}
                        aria-label="이의 제기 삭제"
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEE2E2]/50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5 text-sm text-[#475569] leading-relaxed space-y-2">
                    <span className="block text-xs font-semibold text-[#64748B]">
                      대상 리뷰 원문
                    </span>
                    <p className="whitespace-pre-wrap text-[#0F172A]">{item.reviewText}</p>
                    {item.aiSignals && item.aiSignals.length > 0 && (
                      <div className="text-xs text-[#64748B] pt-1.5 border-t border-[#E2E8F0]">
                        <span className="font-semibold text-[#334155]">당시 감지된 신호: </span>
                        {item.aiSignals
                          .map((s) => `${s.type}(${s.points > 0 ? `+${s.points}` : s.points})`)
                          .join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-[#0F2557]">
                        문제라고 선택한 부분
                      </span>
                      <p className="text-[#334155] leading-relaxed whitespace-pre-wrap">
                        {item.problematicPart}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-[#0F2557]">
                        사용자 이의 제기 이유
                      </span>
                      <p className="text-[#0F172A] leading-relaxed whitespace-pre-wrap">
                        {item.reason}
                      </p>
                    </div>
                  </div>

                  {/* Rejection Reason */}
                  {item.status === '검토 완료' && item.rejectionReason && (
                    <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-3.5 text-xs sm:text-sm text-[#334155]">
                      <span className="font-bold text-[#0F2557]">관리자 검토 사유: </span>
                      {item.rejectionReason}
                    </div>
                  )}

                  {/* Re-analysis Before/After Score Comparison */}
                  {item.status === '반영됨' && item.reanalysisComparison && (
                    <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#065F46]">
                          기준 반영 후 재분석 점수 비교 (기준 v{item.reanalysisComparison.criteriaVersion})
                        </span>
                        <div className="flex items-center gap-2 font-mono-num text-sm font-bold">
                          <span className="text-[#475569]">
                            변경 전 {item.reanalysisComparison.beforeScore}점
                          </span>
                          <ArrowRight className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                          <span className="text-[#065F46]">
                            변경 후 {item.reanalysisComparison.afterScore}점
                          </span>
                          {(() => {
                            const diff =
                              item.reanalysisComparison.afterScore -
                              item.reanalysisComparison.beforeScore;
                            return (
                              <span>({diff > 0 ? `+${diff}` : diff}점)</span>
                            );
                          })()}
                        </div>
                      </div>
                      <p className="text-xs text-[#064E3B] leading-relaxed">
                        {item.reanalysisComparison.afterSummary}
                      </p>
                      <div className="text-[11px] font-mono-num text-[#047857]">
                        변경 후 영역 점수 · 구체성 {item.reanalysisComparison.afterAreaScores.구체성}/30 · 균형성{' '}
                        {item.reanalysisComparison.afterAreaScores.균형성}/20 · 과장도{' '}
                        {item.reanalysisComparison.afterAreaScores.과장도}/25 · 일관성{' '}
                        {item.reanalysisComparison.afterAreaScores.일관성}/25
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
