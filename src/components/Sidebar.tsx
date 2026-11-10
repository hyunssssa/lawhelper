import React from 'react';
import {
  FileSpreadsheet,
  Scale,
  Briefcase,
  BrainCircuit,
  FolderClock,
  Sparkles,
  SlidersHorizontal,
  Newspaper,
  RotateCw,
  Layers,
  Scissors,
  Trash2,
  LogOut,
  LogIn,
  ChevronRight,
  ShieldCheck,
  Building2
} from 'lucide-react';

export type SidebarTab =
  | 'statements'
  | 'notices'
  | 'history'
  | 'settings'
  | 'court_notices'
  | 'cases'
  | 'chat_assistant'
  | 'tools_rotate'
  | 'tools_merge'
  | 'tools_split'
  | 'tools_delete';

interface SidebarProps {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  user: { name: string; email: string } | null;
  onLogout: () => void;
  onOpenLogin: () => void;
  noticesCount?: number;
  casesCount?: number;
  onQuickAddCase?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  onOpenLogin,
  noticesCount = 0,
  casesCount = 0,
  onQuickAddCase,
}) => {
  return (
    <aside className="w-64 bg-[#0B1120] border-r border-slate-800/80 flex flex-col h-screen shrink-0 select-none overflow-y-auto text-slate-300">
      {/* Bespoke Executive Brand Header */}
      <div className="h-20 flex items-center px-5 border-b border-slate-800/80 bg-[#0B1120]">
        <button
          onClick={() => setActiveTab('statements')}
          className="flex items-center gap-3 text-left w-full cursor-pointer group"
        >
          {/* Distinctive Geometric Insignia */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 border border-blue-400/30 flex items-center justify-center shadow-md shadow-blue-900/30 shrink-0 group-hover:border-blue-400 transition-colors">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold tracking-tight text-white font-sans">
                JurisPulse
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                PRO
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              법률금융 거래내역 AI 소명분석
            </div>
          </div>
        </button>
      </div>

      {/* Main Workspace Navigation */}
      <div className="p-3.5 space-y-6">
        {/* Group 1: 핵심 분석 엔진 */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            핵심 분석 엔진
          </div>

          <button
            onClick={() => setActiveTab('statements')}
            className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] rounded-xl transition-all cursor-pointer ${
              activeTab === 'statements'
                ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'statements' ? 'text-white' : 'text-blue-400'
                }`}
              />
              <span className="truncate">거래내역서 소명 분석</span>
            </div>
            {activeTab === 'statements' && (
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('chat_assistant')}
            className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] rounded-xl transition-all cursor-pointer ${
              activeTab === 'chat_assistant'
                ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <BrainCircuit
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'chat_assistant' ? 'text-white' : 'text-indigo-400'
                }`}
              />
              <span className="truncate">AI 법률자문 & 판례 Q&A</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] rounded-xl transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <FolderClock
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'history' ? 'text-white' : 'text-emerald-400'
                }`}
              />
              <span className="truncate">소명 분석 기록 보관함</span>
            </div>
          </button>
        </div>

        {/* Group 2: 전문 PDF 전처리 도구모음 */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            전문 PDF 전처리 도구
          </div>

          <button
            onClick={() => setActiveTab('tools_rotate')}
            className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-slate-400" />
            <span>문서 정방향 회전</span>
          </button>

          <button
            onClick={() => setActiveTab('tools_merge')}
            className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>다중 PDF 병합</span>
          </button>

          <button
            onClick={() => setActiveTab('tools_split')}
            className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5 text-slate-400" />
            <span>PDF 분할 추출</span>
          </button>

          <button
            onClick={() => setActiveTab('tools_delete')}
            className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>불필요 페이지 삭제</span>
          </button>
        </div>

        {/* Group 4: 지원 및 환경설정 */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            설정 및 안내
          </div>

          <button
            onClick={() => setActiveTab('notices')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl transition-all cursor-pointer ${
              activeTab === 'notices'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Newspaper className="w-4 h-4 text-slate-400" />
            <span>공지 및 릴리즈 노트</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <span>시스템 환경 설정</span>
          </button>
        </div>
      </div>

      {/* User Account Capsule at Bottom */}
      <div className="mt-auto p-4 border-t border-slate-800/80 bg-[#080D1A]">
        {user ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                {user.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                  <span>{user.name}</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="w-full py-1.5 px-3 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-xs text-slate-300 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3 h-3 text-slate-400" />
              <span>로그아웃</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-xs shrink-0">
                실
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white">김은진 (정회원)</div>
                <div className="text-[11px] text-slate-400 truncate">uu4546@naver.com</div>
              </div>
            </div>
            <button
              onClick={onOpenLogin}
              className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm shadow-blue-900/40"
            >
              <LogIn className="w-3 h-3" />
              <span>계정 전환 / 로그인</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
