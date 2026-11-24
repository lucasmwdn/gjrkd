import { ArrowRight, Highlighter, Scale, SearchCheck } from 'lucide-react';

interface HomeViewProps {
  onStartAnalyze: () => void;
}

export function HomeView({ onStartAnalyze }: HomeViewProps) {
  return (
    <div className="space-y-16 sm:space-y-20 py-8 sm:py-14">
      {/* Hero Section */}
      <section className="max-w-3xl space-y-6">
        <h1
          className="text-3xl sm:text-4xl lg:text-[46px] font-bold text-[#0F2557] leading-[1.22] tracking-tight"
          style={{ textWrap: 'balance' }}
        >
          너의 리뷰를 확인해줄게!
          <br />
          Reset The Review
        </h1>
        <p className="text-base sm:text-lg text-[#475569] leading-relaxed max-w-2xl">
          리셋더리뷰RTR은 리뷰를 삭제하거나 “조작”이라고 단정하지 않고,
          의심 신호와 신뢰 신호를 원문 근거와 함께 보여주어 정보 비대칭을 줄입니다.
        </p>

        <div className="pt-2">
          <button
            type="button"
            onClick={onStartAnalyze}
            className="btn-cta-glow group relative overflow-hidden min-h-[50px] inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#0F2557] via-[#1D4ED8] to-[#1E3A8A] text-white text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span
              aria-hidden="true"
              className="btn-cta-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />
            <span className="relative z-10">리뷰 분석 시작</span>
            <ArrowRight
              className="relative z-10 w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      {/* 3 Core Principles / How it works */}
      <section className="border-t border-[#E2E8F0] pt-12 space-y-8">
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-[#0F2557]">
            리셋더리뷰RTR은 이렇게 작동합니다
          </h2>
          <p className="text-sm sm:text-base text-[#475569]">
            단순 별점 평균이 아니라 문장 속 단서와 리뷰 간 유사도를 함께 살펴봅니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
            <SearchCheck className="w-6 h-6 text-[#0F2557]" aria-hidden="true" />
            <h3 className="text-base font-bold text-[#0F172A]">
              01. 4개 영역 다각도 교차 점검
            </h3>
            <p className="text-sm text-[#475569] leading-relaxed">
              구체성(30), 균형성(20), 과장도(25), 일관성(25) 4개 영역에서
              과장·광고·모순·복붙 등 의심 신호와 실제 경험·장단점·카테고리 디테일 등 신뢰 신호를 점검합니다.
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
            <Highlighter className="w-6 h-6 text-[#0F2557]" aria-hidden="true" />
            <h3 className="text-base font-bold text-[#0F172A]">
              02. 원문 형광펜 근거 표시
            </h3>
            <p className="text-sm text-[#475569] leading-relaxed">
              점수만 보여주지 않고, 어떤 문장 때문에 의심 신호 또는 신뢰 신호로 판단했는지
              리뷰 원문에 직접 형광펜으로 표시해 보여줍니다.
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
            <Scale className="w-6 h-6 text-[#0F2557]" aria-hidden="true" />
            <h3 className="text-base font-bold text-[#0F172A]">
              03. 기준 공개와 이의 제기 개선
            </h3>
            <p className="text-sm text-[#475569] leading-relaxed">
              점수 계산 표와 변경 이력을 투명하게 공개하며, 같은 이유의 이의 제기가 3건 이상 모이면
              검토를 거쳐 실제 판단 기준이 개선됩니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
