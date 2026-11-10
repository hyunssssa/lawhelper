import React from 'react';
import { FileText, Download, Globe, User, LogIn, LogOut } from 'lucide-react';

interface HeaderProps {
  activeTab: 'review' | 'chat' | 'triage' | 'memo' | 'prompt';
  setActiveTab: (tab: 'review' | 'chat' | 'triage' | 'memo' | 'prompt') => void;
  onOpenNewUpload: () => void;
  onOpenExportMemo: () => void;
  language: 'ko' | 'en';
  setLanguage: (lang: 'ko' | 'en') => void;
  user: { name: string; email: string; role: string } | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewUpload,
  onOpenExportMemo,
  language,
  setLanguage,
  user,
  onOpenLogin,
  onLogout,
}) => {
  const isKo = language === 'ko';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
          {/* Zone 1: Clean, Light Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('review');
              }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shadow-blue-500/20">
                ⚖️
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-slate-900 leading-none">
                  LawBot
                </span>
                <span className="text-[10px] text-blue-600 font-semibold tracking-wider uppercase mt-0.5">
                  AI 법률 자동화
                </span>
              </div>
            </a>
          </div>

          {/* Zone 2: 4-5 clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab('review')}
              className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
                activeTab === 'review'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isKo ? '계약서 정밀 검토' : 'Contract Review'}
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
                activeTab === 'chat'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isKo ? 'AI 법률 질의응답' : 'AI Legal Q&A'}
            </button>
            <button
              onClick={() => setActiveTab('triage')}
              className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
                activeTab === 'triage'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isKo ? '사건 진단 & 소송 분석' : 'Case Triage'}
            </button>
            <button
              onClick={() => setActiveTab('memo')}
              className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
                activeTab === 'memo'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isKo ? '의견서 리포트' : 'Legal Opinion'}
            </button>
          </nav>

          {/* Zone 3: User Status + Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Language switch */}
            <button
              onClick={() => setLanguage(isKo ? 'en' : 'ko')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="언어 전환 (Language)"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>{isKo ? '한국어' : 'EN'}</span>
            </button>

            {/* Login / User Status */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-800">{user.name}</span>
                  <span className="text-[10px] text-blue-600 font-medium">{user.role}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="로그아웃"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isKo ? '로그인' : 'Log in'}</span>
              </button>
            )}

            {/* Upload Document Primary Button */}
            <button
              onClick={onOpenNewUpload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs shadow-blue-500/20 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isKo ? '계약서 업로드' : 'Upload Contract'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
