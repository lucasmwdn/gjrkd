import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Menu, X } from 'lucide-react';
import { AnalyzeView } from './components/AnalyzeView';
import { AppealModal } from './components/AppealModal';
import { AppealsView } from './components/AppealsView';
import { CriteriaView } from './components/CriteriaView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeView } from './components/HomeView';
import {
  auth,
  checkIsAdminOnServer,
  signInWithGooglePopup,
  signOutFirebase,
} from './firebase';
import { fetchAiWithRetry } from './utils/aiFetch';
import {
  approveProposalTransaction,
  createAppealDoc,
  deleteAppealDoc,
  generateFirestoreId,
  rejectProposalTransaction,
  saveProposalsBatch,
  seedCriteriaIfMissing,
  subscribeAppeals,
  subscribeCriteria,
  subscribeCriteriaHistory,
  subscribeProposals,
} from './services/firestoreService';
import type {
  AppealItem,
  AppealReanalysisComparison,
  AppealSavedSignal,
  BatchAnalysisResponse,
  CriteriaConfig,
  CriteriaHistoryItem,
  CriteriaProposal,
  ExpectedJudgment,
  ProductInfo,
  ReviewAnalysisResult,
} from './types/review';
import { DEFAULT_CRITERIA_CONFIG } from './utils/criteriaScoring';

type TabKey = 'home' | 'analyze' | 'criteria' | 'appeals';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);

  const [criteria, setCriteria] = useState<CriteriaConfig>(DEFAULT_CRITERIA_CONFIG);
  const [criteriaHistory, setCriteriaHistory] = useState<CriteriaHistoryItem[]>([]);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [proposals, setProposals] = useState<CriteriaProposal[]>([]);

  const [productInfo, setProductInfo] = useState<ProductInfo>({
    name: '',
    category: '',
    description: '',
  });
  const [rawText, setRawText] = useState('');
  const [ratingsByIndex, setRatingsByIndex] = useState<Record<number, number | null>>({});
  const [analysisResult, setAnalysisResult] = useState<BatchAnalysisResponse | null>(null);

  const [appealTarget, setAppealTarget] = useState<{
    review: ReviewAnalysisResult;
    productInfo: ProductInfo | null;
  } | null>(null);
  const [appealToast, setAppealToast] = useState(false);
  const [globalNotice, setGlobalNotice] = useState('');

  // Firebase Auth listener + server-side admin verification
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsAdmin(false);
        setAdminMode(false);
        return;
      }

      void checkIsAdminOnServer(user).then((res) => {
        if (!active) return;
        setIsAdmin(res.isAdmin);
        if (res.isAdmin) {
          void seedCriteriaIfMissing(user.uid).catch((err) =>
            console.error('Seed criteria error:', err)
          );
        } else {
          setAdminMode(false);
        }
      });
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Public Firestore subscriptions (criteria, history, appeals)
  useEffect(() => {
    const unsubCriteria = subscribeCriteria((nextCriteria) => {
      setCriteria(nextCriteria);
    });
    const unsubHistory = subscribeCriteriaHistory((nextHistory) => {
      setCriteriaHistory(nextHistory);
    });
    const unsubAppeals = subscribeAppeals((nextAppeals) => {
      setAppeals(nextAppeals);
    });
    return () => {
      unsubCriteria();
      unsubHistory();
      unsubAppeals();
    };
  }, []);

  // Admin-only proposals subscription
  useEffect(() => {
    if (!isAdmin || !currentUser) {
      setProposals([]);
      return;
    }
    const unsubProposals = subscribeProposals(currentUser.uid, (nextProposals) => {
      setProposals(nextProposals);
    });
    return () => unsubProposals();
  }, [isAdmin, currentUser]);

  const navigate = (tab: TabKey) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChangeRating = (index: number, rating: number | null) => {
    setRatingsByIndex((prev) => ({ ...prev, [index]: rating }));
  };

  const handleClearAll = () => {
    setProductInfo({ name: '', category: '', description: '' });
    setRawText('');
    setRatingsByIndex({});
    setAnalysisResult(null);
  };

  const handleSubmitAppeal = async (payload: {
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
  }) => {
    const id = generateFirestoreId('appeal');
    await createAppealDoc({
      id,
      ...payload,
    });
    setAppealToast(true);
    window.setTimeout(() => setAppealToast(false), 3500);
  };

  const handleDeleteAppeal = async (id: string) => {
    await deleteAppealDoc(id);
  };

  const handleToggleAdminMode = async () => {
    setGlobalNotice('');
    if (adminMode) {
      setAdminMode(false);
      return;
    }

    let user = currentUser;
    if (!user) {
      try {
        user = await signInWithGooglePopup();
      } catch {
        setGlobalNotice('Google 로그인이 취소되어 관리자 모드를 켤 수 없습니다.');
        return;
      }
    }

    const adminCheck = await checkIsAdminOnServer(user);
    setIsAdmin(adminCheck.isAdmin);

    if (!adminCheck.configured) {
      setGlobalNotice(
        '서버 환경변수(ADMIN_EMAIL)가 설정되어 있지 않습니다. Settings > Secrets 패널에서 ADMIN_EMAIL을 설정해 주세요.'
      );
      return;
    }

    if (!adminCheck.isAdmin) {
      setGlobalNotice(
        '관리자 권한이 있는 계정(이메일 인증 완료)으로 로그인해야 관리자 모드를 사용할 수 있습니다.'
      );
      return;
    }

    await seedCriteriaIfMissing(user.uid);
    setAdminMode(true);
  };

  const handleAnalyzeAppeals = async (
    onStatusChange?: (status: string | null) => void
  ): Promise<{ createdCount: number; message?: string }> => {
    if (!currentUser || !isAdmin) {
      throw new Error('관리자 권한이 필요합니다.');
    }

    const pending = appeals.filter((a) => a.status === '대기');
    if (pending.length < 3) {
      return {
        createdCount: 0,
        message:
          '같은 이유의 이의 제기가 3건 이상 모였을 때만 기준 변경을 제안합니다. 현재 대기 중인 이의 제기가 3건 미만입니다.',
      };
    }

    const idToken = await currentUser.getIdToken();
    const data = await fetchAiWithRetry<{
      proposals?: CriteriaProposal[];
      message?: string;
    }>({
      url: '/api/analyze-appeals',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: {
        appeals: pending,
        criteria,
      },
      onStatusChange,
    });

    const returned = Array.isArray(data.proposals) ? data.proposals : [];
    if (returned.length === 0) {
      return {
        createdCount: 0,
        message: data.message,
      };
    }

    await saveProposalsBatch(returned, currentUser.uid);
    return {
      createdCount: returned.length,
    };
  };

  const handleApproveProposal = async (
    proposal: CriteriaProposal,
    comparisons: Record<string, AppealReanalysisComparison>
  ) => {
    if (!currentUser || !isAdmin) {
      throw new Error('관리자 권한이 필요합니다.');
    }
    const pendingAppealIds = new Set(
      appeals.filter((a) => a.status === '대기').map((a) => a.id)
    );
    await approveProposalTransaction({
      proposal,
      currentCriteria: criteria,
      adminUid: currentUser.uid,
      comparisonsByAppealId: comparisons,
      pendingAppealIds,
    });
  };

  const handleRejectProposal = async (proposal: CriteriaProposal, reason: string) => {
    if (!currentUser || !isAdmin) {
      throw new Error('관리자 권한이 필요합니다.');
    }
    const pendingAppealIds = new Set(
      appeals.filter((a) => a.status === '대기').map((a) => a.id)
    );
    await rejectProposalTransaction({
      proposal,
      rejectionReason: reason,
      pendingAppealIds,
    });
  };

  const navItems: { key: TabKey; label: string }[] = [
    { key: 'home', label: '홈' },
    { key: 'analyze', label: '리뷰 분석' },
    { key: 'criteria', label: '판단 기준' },
    {
      key: 'appeals',
      label: appeals.length > 0 ? `이의 제기 (${appeals.length})` : '이의 제기 목록',
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Faint Centered Background Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
      >
        <img
          src="/assets/aistudio/___________15be2d1e.png"
          alt=""
          className="w-[320px] sm:w-[460px] md:w-[540px] max-w-[82vw] h-auto object-contain opacity-[0.06] mix-blend-multiply"
        />
      </div>

      {/* Top Bar: 3-zone contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Logo + Wordmark */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#0F2557] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
            aria-label="리셋더리뷰RTR 홈으로 이동"
          >
            <img
              src="/assets/aistudio/___________15be2d1e.png"
              alt="RTR Reset The Review 로고"
              className="h-11 w-11 object-contain mix-blend-multiply shrink-0"
            />
            <span>리셋더리뷰RTR</span>
          </button>

          {/* Zone 2: Desktop Navigation Links */}
          <nav
            aria-label="주 메뉴"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475569]"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.key)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'text-[#0F2557] font-bold border-[#0F2557]'
                      : 'border-transparent hover:text-[#0F2557]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action + Auth + Mobile Menu Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={() => void signOutFirebase()}
                className="hidden sm:inline-flex min-h-[38px] items-center px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-medium text-[#475569] hover:text-[#0F2557] transition-colors whitespace-nowrap shrink-0"
                title={currentUser.email || '로그인됨'}
              >
                로그아웃
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGooglePopup()}
                className="hidden sm:inline-flex min-h-[38px] items-center px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#0F2557] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0"
              >
                Google 로그인
              </button>
            )}

            <img
              src="/assets/aistudio/____7904ac19.png"
              alt="목포덕인고등학교 엠블럼"
              className="h-10 w-10 object-contain shrink-0"
            />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-[#0F2557] hover:bg-[#F1F5F9] transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <nav
            aria-label="모바일 메뉴"
            className="md:hidden border-t border-[#E2E8F0] bg-white px-4 py-3 space-y-1"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.key)}
                  className={`w-full min-h-[44px] flex items-center px-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#F1F5F9] text-[#0F2557] font-bold'
                      : 'text-[#475569] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <div className="pt-2 border-t border-[#F1F5F9]">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => void signOutFirebase()}
                  className="w-full min-h-[44px] flex items-center px-3 rounded-lg text-sm font-medium text-[#475569] hover:bg-[#F8FAFC]"
                >
                  로그아웃 ({currentUser.email})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGooglePopup()}
                  className="w-full min-h-[44px] flex items-center px-3 rounded-lg text-sm font-semibold text-[#0F2557] hover:bg-[#F8FAFC]"
                >
                  Google 로그인
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {globalNotice && (
          <div
            role="status"
            className="mt-4 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
          >
            <span>{globalNotice}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice('')}
              className="text-xs font-semibold underline shrink-0"
            >
              닫기
            </button>
          </div>
        )}

        {activeTab === 'home' && (
          <HomeView onStartAnalyze={() => navigate('analyze')} />
        )}

        {activeTab === 'analyze' && (
          <AnalyzeView
            criteria={criteria}
            productInfo={productInfo}
            onChangeProductInfo={setProductInfo}
            rawText={rawText}
            onChangeRawText={setRawText}
            ratingsByIndex={ratingsByIndex}
            onChangeRating={handleChangeRating}
            onClearAll={handleClearAll}
            analysisResult={analysisResult}
            onAnalysisComplete={setAnalysisResult}
            appeals={appeals}
            onRequestAppeal={(review, prod) =>
              setAppealTarget({ review, productInfo: prod ?? null })
            }
          />
        )}

        {activeTab === 'criteria' && (
          <CriteriaView
            criteria={criteria}
            history={criteriaHistory}
            onStartAnalyze={() => navigate('analyze')}
          />
        )}

        {activeTab === 'appeals' && (
          <AppealsView
            appeals={appeals}
            criteria={criteria}
            proposals={proposals}
            currentUser={currentUser}
            isAdminUser={isAdmin}
            adminMode={adminMode}
            onToggleAdminMode={handleToggleAdminMode}
            onDeleteAppeal={handleDeleteAppeal}
            onAnalyzeAppeals={handleAnalyzeAppeals}
            onApproveProposal={handleApproveProposal}
            onRejectProposal={handleRejectProposal}
            onStartAnalyze={() => navigate('analyze')}
          />
        )}
      </main>

      {/* Clean Editorial Footer */}
      <footer className="relative z-10 border-t border-[#E2E8F0] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#64748B]">
          <span>
            리셋더리뷰RTR · 적용 기준 v{criteria.version} · 소비자의 스스로 판단하는 권리를 돕는 리뷰 분석 도구
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('criteria')}
              className="hover:text-[#0F2557] transition-colors whitespace-nowrap"
            >
              판단 기준표
            </button>
            <button
              type="button"
              onClick={() => navigate('appeals')}
              className="hover:text-[#0F2557] transition-colors whitespace-nowrap"
            >
              이의 제기 목록
            </button>
          </div>
        </div>
      </footer>

      {/* Appeal Submission Toast */}
      {appealToast && (
        <div
          role="status"
          className="fixed bottom-5 right-4 left-4 sm:left-auto sm:w-auto z-50 bg-[#0F2557] text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-4 text-sm"
        >
          <span>이의 제기가 Firestore에 저장되었습니다.</span>
          <button
            type="button"
            onClick={() => {
              setAppealToast(false);
              navigate('appeals');
            }}
            className="font-semibold underline underline-offset-4 whitespace-nowrap"
          >
            목록 보기
          </button>
        </div>
      )}

      {/* Appeal Modal */}
      <AppealModal
        review={appealTarget?.review ?? null}
        productInfo={appealTarget?.productInfo ?? null}
        criteria={criteria}
        currentUser={currentUser}
        onClose={() => setAppealTarget(null)}
        onSubmit={handleSubmitAppeal}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
