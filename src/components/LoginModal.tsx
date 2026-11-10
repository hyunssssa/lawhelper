import React, { useState } from 'react';
import { X, Check, ArrowRight, ShieldCheck, Mail, Lock, Sparkles } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: { name: string; email: string; role: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess({
        name: email ? email.split('@')[0] : '실무자',
        email: email || 'user@law-bot.kr',
        role: '변호사 / 법무 실무자'
      });
      onClose();
    }, 600);
  };

  const handleSocialLogin = (provider: 'kakao' | 'google' | 'demo') => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (provider === 'kakao') {
        onLoginSuccess({
          name: '김민준 변호사',
          email: 'minjun.kim@kakao.com',
          role: '기업법무 전문 실무자'
        });
      } else if (provider === 'google') {
        onLoginSuccess({
          name: '이서연 변호사',
          email: 'seoyeon.lee@gmail.com',
          role: '법무법인 파트너'
        });
      } else {
        onLoginSuccess({
          name: '체험 계정 (게스트)',
          email: 'demo@law-bot.kr',
          role: '무료 체험 실무자'
        });
      }
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Lockup */}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-xl shadow-md shadow-blue-500/20 mb-1">
            ⚖️
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-slate-900">
            {isSignUp ? 'LawBot 회원가입' : 'LawBot 로그인'}
          </h3>
          <p className="text-xs text-slate-500">
            {isSignUp
              ? '1분 만에 가입하고 AI 계약서 검토와 법률 자동화를 시작하세요'
              : '변호사 및 법률 실무자를 위한 가장 똑똑한 AI 법률 플랫폼'}
          </p>
        </div>

        {/* Social Login Buttons (Kakao & Google & Guest) */}
        <div className="space-y-2.5">
          {/* Kakao 3-second Login */}
          <button
            onClick={() => handleSocialLogin('kakao')}
            className="w-full py-2.5 px-4 bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] font-medium text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
          >
            <span className="font-bold text-sm">💬</span>
            <span>카카오로 3초 만에 시작하기</span>
          </button>

          {/* Google Login */}
          <button
            onClick={() => handleSocialLogin('google')}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google 계정으로 계속하기</span>
          </button>

          {/* Quick Demo Instant Start */}
          <button
            onClick={() => handleSocialLogin('demo')}
            className="w-full py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-xl border border-blue-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>가입 없이 체험 계정으로 바로 둘러보기</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 w-full"></div>
          <span className="bg-white px-3 text-[11px] text-slate-400 shrink-0">또는 이메일로 로그인</span>
        </div>

        {/* Email Login Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">이메일 주소</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-hidden text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">비밀번호</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-hidden text-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span>로그인 처리 중...</span>
            ) : (
              <>
                <span>{isSignUp ? '무료 회원가입 완료' : '이메일로 로그인'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Bottom Switch */}
        <div className="text-center pt-2 border-t border-slate-100 text-xs text-slate-500">
          {isSignUp ? (
            <div>
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                로그인하기
              </button>
            </div>
          ) : (
            <div>
              아직 LawBot 계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                1분 만에 회원가입
              </button>
            </div>
          )}
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>안전한 256-bit 엔드투엔드 암호화 및 법률 데이터 보안</span>
        </div>
      </div>
    </div>
  );
};
