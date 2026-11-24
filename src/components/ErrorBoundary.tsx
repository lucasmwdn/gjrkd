import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || '화면을 불러오는 중 문제가 발생했습니다.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught UI Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = '데이터를 불러오거나 처리하는 중 오류가 발생했습니다.';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendly = '접근 권한이 부족해 데이터를 처리할 수 없습니다. 로그인 상태를 확인해 주세요.';
      }

      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center text-[#DC2626]">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-[#0F2557]">잠시 문제가 발생했습니다</h1>
              <p className="text-sm text-[#475569] leading-relaxed">{friendly}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F2557] text-white text-sm font-semibold hover:bg-[#1E3A8A] transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>새로고침</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
