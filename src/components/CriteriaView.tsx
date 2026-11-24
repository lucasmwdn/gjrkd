import { History } from 'lucide-react';
import type { CriteriaConfig, CriteriaHistoryItem } from '../types/review';
import { computeReviewScores } from '../utils/criteriaScoring';

interface CriteriaViewProps {
  criteria: CriteriaConfig;
  history: CriteriaHistoryItem[];
  onStartAnalyze: () => void;
}

export function CriteriaView({
  criteria,
  history,
  onStartAnalyze,
}: CriteriaViewProps) {
  const suspiciousSignals = criteria.signals.filter((s) => s.enabled && s.kind === 'suspicious');
  const trustSignals = criteria.signals.filter((s) => s.enabled && s.kind === 'trust');

  const durationRule =
    criteria.signals.find((s) => s.id === 'sig-trust-duration-count') ??
    criteria.signals.find((s) => s.kind === 'trust' && s.type.includes('기간'));
  const contextRule =
    criteria.signals.find((s) => s.id === 'sig-trust-usage-context') ??
    criteria.signals.find((s) => s.kind === 'trust' && s.type.includes('상황'));
  const prosConsRule =
    criteria.signals.find((s) => s.id === 'sig-trust-pros-cons') ??
    criteria.signals.find((s) => s.kind === 'trust' && s.area === '균형성');
  const caveatRule =
    criteria.signals.find((s) => s.id === 'sig-trust-caveat-phrase') ??
    criteria.signals.find((s) => s.kind === 'trust' && s.type.includes('단서'));

  const previewDetectedTrust = [
    durationRule?.type,
    contextRule?.type,
    prosConsRule?.type,
    caveatRule?.type,
  ].filter((t): t is string => Boolean(t));
  const previewScoreResult = computeReviewScores([], previewDetectedTrust, criteria);

  const proposalTypeLabel: Record<CriteriaHistoryItem['proposalType'], string> = {
    add: '신규 신호 추가',
    adjust: '신호 점수 조정',
    modify_or_delete: '삭제 · 적용 조건 변경',
  };

  return (
    <div className="space-y-12 py-6 sm:py-10">
      <header className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
            <span>현재 적용 기준</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">버전 v{criteria.version}</span>
            <span aria-hidden="true">·</span>
            <span>이의 제기 반영 시 즉시 업데이트</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2557] tracking-tight">
            판단 기준 공개
          </h1>
          <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
            블랙박스 점수가 아닌, 누구나 직접 검증할 수 있는 영역별 가감점 기준표를 따릅니다.
            AI는 신호 감지 여부와 근거 문장만 찾고, 점수는 이 기준표의 수치 그대로 프로그램 코드가 직접 계산합니다.
          </p>
        </div>

        {/* Analysis Preview Card */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
            <span className="text-sm font-bold text-[#0F2557]">분석 화면 미리보기</span>
            <span className="font-mono-num text-xs font-semibold text-[#059669]">
              {previewScoreResult.score}점 · 신뢰 신호 우세
            </span>
          </div>

          <p className="text-sm leading-7 text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4">
            “
            <mark className="bg-[#D1FAE5] text-[#064E3B] border-b-2 border-[#059669] px-0.5">
              3주째
            </mark>{' '}
            <mark className="bg-[#D1FAE5] text-[#064E3B] border-b-2 border-[#059669] px-0.5">
              등하교 지하철에서
            </mark>{' '}
            매일 메고 다니는데{' '}
            <mark className="bg-[#D1FAE5] text-[#064E3B] border-b-2 border-[#059669] px-0.5">
              어깨끈이 편해요. 다만 지퍼가 처음엔 뻑뻑한 점은 아쉬움이에요.
            </mark>
            ”
          </p>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="font-semibold text-[#065F46]">신뢰 신호 근거 (코드 합산)</span>
              <p className="text-[#475569] leading-relaxed">
                기간·횟수 {durationRule ? `+${durationRule.points}` : ''}, 상황·공간{' '}
                {contextRule ? `+${contextRule.points}` : ''}, 장단점{' '}
                {prosConsRule ? `+${prosConsRule.points}` : ''}, 단서 표현{' '}
                {caveatRule ? `+${caveatRule.points}` : ''} 반영
              </p>
            </div>
            <div className="space-y-1">
              <span className="font-semibold text-[#0F2557]">영역별 점수 예시</span>
              <p className="text-[#475569] font-mono-num leading-relaxed">
                구체성 {previewScoreResult.areaScores.구체성}/30 · 균형성{' '}
                {previewScoreResult.areaScores.균형성}/20 · 과장도{' '}
                {previewScoreResult.areaScores.과장도}/25 · 일관성{' '}
                {previewScoreResult.areaScores.일관성}/25
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Formula, Area Floor-0 Rule & Score Range Table */}
      <section className="space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-[#0F2557]">
          01. 신뢰도 점수 계산 방식 및 영역별 최저 0점 규칙
        </h2>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-6">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3.5 space-y-2 text-sm sm:text-base text-[#0F172A]">
            <div>
              <span className="font-semibold text-[#0F2557]">계산 공식: </span>
              <span className="font-mono-num font-semibold">
                구체성(0~30점) + 균형성(0~20점) + 과장도(0~25점) + 일관성(0~25점) = 총점 0~100점
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
              구체성·균형성은{' '}
              <strong className="font-mono-num text-[#0F2557]">0점</strong>에서 가점하고,
              과장도·일관성은{' '}
              <strong className="font-mono-num text-[#0F2557]">25점 만점</strong>에서 감점해 기본 총점{' '}
              <strong className="font-mono-num text-[#0F2557]">{criteria.baseTrustScore}점</strong>에서 시작합니다.{' '}
              <strong className="text-[#0F2557]">
                각 영역 만점(30·20·25·25)과 영역별 최저 0점 규칙(감점이 많아도 0점 미만 불가)은 항상 고정됩니다.
              </strong>
            </p>
            <ul className="text-xs text-[#475569] space-y-1 pt-1 border-t border-[#E2E8F0]">
              <li>
                · <strong className="text-[#0F2557]">20자 미만 판단 보류:</strong> 공백을 뺀 글자 수가 20자 미만인 리뷰는 AI 분석 없이 바로 “판단 보류” 처리하고 평균 신뢰도 계산에서도 제외합니다.
              </li>
              <li>
                · <strong className="text-[#0F2557]">광고 표시 배지 분리:</strong> “체험단·협찬·선물·제공받아·광고” 등 대가성 표시 표현은 점수를 깎지 않고 결과 카드 상단 배지(명확 / 불명확 / 표시 없음)로만 분리 표시합니다.
              </li>
              <li>
                · <strong className="text-[#0F2557]">링크 입력 안내:</strong> 링크 입력은 공개된 페이지만 읽으며, 일부 쇼핑몰에서는 리뷰가 뒤늦게 불러와지거나 접근이 제한되어 리뷰를 불러오지 못할 수 있습니다.
              </li>
            </ul>
          </div>

          {/* Area Score Breakdown Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#CBD5E1] text-[#0F2557]">
                  <th className="py-2.5 pr-4 font-bold whitespace-nowrap">영역</th>
                  <th className="py-2.5 px-4 font-bold whitespace-nowrap text-right">기본 점수</th>
                  <th className="py-2.5 px-4 font-bold whitespace-nowrap text-right">최저 ~ 최대</th>
                  <th className="py-2.5 pl-4 font-bold">영역 계산 방식</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {criteria.areas.map((cfg) => (
                  <tr key={cfg.area}>
                    <td className="py-3 pr-4 font-bold text-[#0F2557] whitespace-nowrap">
                      {cfg.area}
                    </td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-right whitespace-nowrap">
                      {cfg.baseScore}점
                    </td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-right whitespace-nowrap">
                      0 ~ {cfg.maxScore}점
                    </td>
                    <td className="py-3 pl-4 leading-relaxed">{cfg.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Score Tier Table */}
          <div className="overflow-x-auto pt-2 border-t border-[#E2E8F0]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#CBD5E1] text-[#0F2557]">
                  <th className="py-2.5 pr-4 font-bold whitespace-nowrap">점수 구간</th>
                  <th className="py-2.5 px-4 font-bold whitespace-nowrap">신호등 구분</th>
                  <th className="py-2.5 pl-4 font-bold">해석 안내</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                <tr>
                  <td className="py-3 pr-4 font-mono-num font-semibold whitespace-nowrap">
                    70 ~ 100점
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#059669] whitespace-nowrap">
                    초록 · 신뢰 신호 우세
                  </td>
                  <td className="py-3 pl-4 leading-relaxed">
                    구체적인 사용 기간, 장단점 병기, 카테고리 핵심 정보 등 구매에 참고할 수 있는 근거가 잘 드러난 리뷰입니다.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono-num font-semibold whitespace-nowrap">
                    40 ~ 69점
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#B45309] whitespace-nowrap">
                    노랑 · 추가 확인 필요
                  </td>
                  <td className="py-3 pl-4 leading-relaxed">
                    근거가 다소 짧거나 신뢰 신호와 의심 신호가 섞여 있습니다. 다른 소비자의 후기와 함께 교차 확인해 보세요.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono-num font-semibold whitespace-nowrap">
                    0 ~ 39점
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#DC2626] whitespace-nowrap">
                    빨강 · 의심 신호 다수
                  </td>
                  <td className="py-3 pl-4 leading-relaxed">
                    구체적 사용 경험 없이 과장 표현, 광고성 문구, 일관성 모순, 유사 문장 중복 등이 여러 건 포착되었습니다.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Suspicious Signals Table */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-[#0F2557]">
            02. 의심 신호 기준표 ({suspiciousSignals.length}종)
          </h2>
          <span className="text-xs text-[#64748B]">
            포착 시 해당 영역에서 감점됩니다 (영역별 최저 0점)
          </span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#0F2557]">
                <tr>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">영역 · 조건</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">신호 항목</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap text-right">점수 영향</th>
                  <th className="py-3 px-4 font-bold min-w-[240px]">판단 기준</th>
                  <th className="py-3 px-4 font-bold min-w-[220px]">예시 문장</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {suspiciousSignals.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAFC]/70">
                    <td className="py-3.5 px-4 text-xs align-top space-y-1">
                      <span className="block font-semibold text-[#0F2557] whitespace-nowrap">
                        {item.area}
                      </span>
                      <span className="block text-[#64748B]">{item.condition}</span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#991B1B] min-w-[170px] align-top">
                      <span>{item.type}</span>
                      {item.isCustom && (
                        <span className="block text-[11px] font-medium text-[#1E3A8A] mt-0.5">
                          이의 제기로 추가됨
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono-num font-semibold text-[#DC2626] text-right whitespace-nowrap align-top">
                      {item.points}점
                    </td>
                    <td className="py-3.5 px-4 leading-relaxed align-top">
                      {item.criteriaDetail}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#475569] leading-relaxed align-top">
                      {item.example}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Trust Signals Table */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-[#0F2557]">
            03. 신뢰 신호 기준표 ({trustSignals.length}종)
          </h2>
          <span className="text-xs text-[#64748B]">확인 시 해당 영역에 가점됩니다</span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#0F2557]">
                <tr>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">영역 · 조건</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">신호 항목</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap text-right">점수 영향</th>
                  <th className="py-3 px-4 font-bold min-w-[240px]">판단 기준</th>
                  <th className="py-3 px-4 font-bold min-w-[220px]">예시 문장</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {trustSignals.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAFC]/70">
                    <td className="py-3.5 px-4 text-xs align-top space-y-1">
                      <span className="block font-semibold text-[#0F2557] whitespace-nowrap">
                        {item.area}
                      </span>
                      <span className="block text-[#64748B]">{item.condition}</span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#065F46] whitespace-nowrap align-top">
                      <span>{item.type}</span>
                      {item.isCustom && (
                        <span className="block text-[11px] font-medium text-[#1E3A8A] mt-0.5">
                          이의 제기로 추가됨
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono-num font-semibold text-[#059669] text-right whitespace-nowrap align-top">
                      +{item.points}점
                    </td>
                    <td className="py-3.5 px-4 leading-relaxed align-top">
                      {item.criteriaDetail}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#475569] leading-relaxed align-top">
                      {item.example}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Category-specific Concreteness Table */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-[#0F2557]">
            04. 카테고리별 구체성 판단 기준표
          </h2>
          <span className="text-xs text-[#64748B]">
            상품 정보를 선택하면 해당 카테고리 기준으로 구체성을 평가합니다
          </span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#0F2557]">
                <tr>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">카테고리</th>
                  <th className="py-3 px-4 font-bold min-w-[180px]">핵심 구체성 신호</th>
                  <th className="py-3 px-4 font-bold min-w-[230px]">판단 내용</th>
                  <th className="py-3 px-4 font-bold min-w-[220px]">구체적 서술 예시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {criteria.categoryCriteria.map((cat) => (
                  <tr key={cat.category} className="hover:bg-[#F8FAFC]/70">
                    <td className="py-3.5 px-4 font-bold text-[#0F2557] whitespace-nowrap align-top">
                      {cat.category}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#065F46] align-top">
                      {cat.keySignals.join(' · ')}
                    </td>
                    <td className="py-3.5 px-4 leading-relaxed align-top">
                      {cat.description}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#475569] leading-relaxed align-top">
                      {cat.example}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 05. Criteria Change History Section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-[#0F2557]">
            <History className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>05. 기준 변경 이력</span>
          </h2>
          <span className="text-xs text-[#64748B]">
            사용자 이의 제기를 근거로 승인된 모든 변경 내역을 공개합니다
          </span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#0F2557]">
                <tr>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">변경 날짜</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">구분 · 영역</th>
                  <th className="py-3 px-4 font-bold min-w-[260px]">변경 내용</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap text-right">
                    근거 이의 제기
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAFC]/70">
                    <td className="py-3.5 px-4 font-mono-num text-xs text-[#475569] whitespace-nowrap align-top">
                      {item.changedDateLabel}
                    </td>
                    <td className="py-3.5 px-4 text-xs align-top whitespace-nowrap space-y-0.5">
                      <span className="block font-semibold text-[#1E3A8A]">
                        {proposalTypeLabel[item.proposalType]}
                      </span>
                      <span className="block text-[#64748B]">{item.area} 영역</span>
                    </td>
                    <td className="py-3.5 px-4 align-top space-y-1">
                      <p className="font-semibold text-[#0F172A]">{item.changeSummary}</p>
                      <p className="text-xs text-[#475569] leading-relaxed">
                        {item.detailDescription}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 font-mono-num font-semibold text-[#0F2557] text-right whitespace-nowrap align-top">
                      {item.supportingAppealCount}건
                    </td>
                  </tr>
                ))}
                <tr className="hover:bg-[#F8FAFC]/70 bg-[#F8FAFC]/40">
                  <td className="py-3.5 px-4 font-mono-num text-xs text-[#475569] whitespace-nowrap align-top">
                    2026년 11월 21일
                  </td>
                  <td className="py-3.5 px-4 text-xs align-top whitespace-nowrap space-y-0.5">
                    <span className="block font-semibold text-[#1E3A8A]">기준 정비</span>
                    <span className="block text-[#64748B]">구체성 · 균형성 · 과장도</span>
                  </td>
                  <td className="py-3.5 px-4 align-top space-y-1">
                    <p className="font-semibold text-[#0F172A]">초기 기준 정비(v1→v2)</p>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      구체성 4종(+10·+8·+7·+5=30점) 및 균형성 3종(+10·+6·+4=20점) 단계별 세분화, 광고성 문구 판단 기준에서 대가성 표시 제외(상단 배지 분리)
                    </p>
                  </td>
                  <td className="py-3.5 px-4 font-mono-num font-semibold text-[#64748B] text-right whitespace-nowrap align-top">
                    기본 정비
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-[#0F2557]">
            상품 정보와 여러 리뷰를 함께 비교할수록 정확해집니다
          </h3>
          <p className="text-sm text-[#475569] leading-relaxed">
            상품명·카테고리·상세 설명을 함께 넣으면 모순된 내용이나 상세페이지 복붙 문구까지 꼼꼼하게 짚어 드립니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartAnalyze}
          className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#0F2557] text-white text-sm font-semibold hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0"
        >
          리뷰 직접 분석해보기
        </button>
      </section>
    </div>
  );
}
