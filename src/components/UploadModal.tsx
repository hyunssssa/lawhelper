import React, { useState } from 'react';
import { ContractReviewResult } from '../types/legal';
import { Upload, X, Sparkles, AlertCircle, FileText, CheckCircle2, FileUp } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalysisComplete: (result: ContractReviewResult) => void;
  language: 'ko' | 'en';
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onAnalysisComplete,
  language,
}) => {
  const isKo = language === 'ko';
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [docTitle, setDocTitle] = useState('');
  const [jurisdiction, setJurisdiction] = useState(isKo ? '대한민국 서울중앙지방법원' : 'Delaware Commercial Division');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileMimeType, setFileMimeType] = useState<string>('application/pdf');
  const [rawText, setRawText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileProcess = (file: File) => {
    setSelectedFile(file);
    setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
    setFileMimeType(file.type || 'application/pdf');

    const reader = new FileReader();
    // If text file, also extract raw text
    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const textReader = new FileReader();
      textReader.onload = (e) => {
        setRawText((e.target?.result as string) || '');
      };
      textReader.readAsText(file);
    }

    // Read as Base64 for PDF and images
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      setFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile && !rawText.trim()) {
      setErrorMsg(isKo ? '분석할 PDF 파일 또는 계약서 텍스트를 등록해 주십시오.' : 'Please select a PDF file or enter contract text to analyze.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/analyze-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docTitle || (isKo ? '의뢰인 제출 계약서' : 'Custom Client Legal Agreement'),
          text: rawText,
          fileBase64: fileBase64,
          mimeType: fileMimeType,
          jurisdiction: jurisdiction || (isKo ? '대한민국 서울중앙지방법원' : 'Delaware / General Commercial')
        })
      });

      if (!res.ok) {
        throw new Error('Server returned error during contract analysis');
      }

      const result: ContractReviewResult = await res.json();
      onAnalysisComplete(result);
      onClose();
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setErrorMsg(isKo ? '문서 분석 중 오류가 발생했습니다. 파일 형식을 확인해 주십시오.' : 'Failed to complete review. Please check the file format.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadSample = (sampleType: 'saas' | 'nda') => {
    setActiveTab('text');
    if (sampleType === 'saas') {
      setDocTitle('클라우드 엔터프라이즈 SaaS 소프트웨어 이용약관');
      setJurisdiction('대한민국 서울중앙지방법원');
      setRawText(`제4조 (품질 보증 및 면책)
공급사는 본 서비스를 "있는 그대로(AS-IS)" 제공하며, 상업성, 특정 목적에의 적합성 및 무하자 보증을 일체 배제한다. 가동률(SLA) 미달로 인한 일체의 영업손실에 대해 공급사는 책임을 지지 아니한다.

제8조 (고객의 면책 및 무제한 손해배상 의무)
고객은 고객의 데이터 또는 고객의 본 약관 위반으로 인해 제3자가 공급사를 상대로 제기하는 모든 소송, 손해배상, 변호사 비용에 대해 공급사를 전적으로 방어하고 배상액의 상한 없이 면책하여야 한다.

제9조 (공급사의 책임 제한)
어떠한 경우에도 공급사가 고객에게 부담하는 누적 총 손해배상 책임은 고객이 최근 1개월간 지급한 이용료(최대 금 10만 원)를 초과할 수 없다.

제12조 (현장 감사 및 비용 전가)
공급사는 24시간 전 전자통지 후 고객의 사무소 및 전산 설비를 불시에 방문하여 라이선스 준수 여부를 감사할 수 있으며, 이에 소요되는 모든 실사 비용은 고객이 부담한다.`);
    } else {
      setDocTitle('일방적 비밀유지협약서 (독소 NDA)');
      setJurisdiction('대한민국 서울중앙지방법원');
      setRawText(`제1조 (비밀정보의 정의 및 무제한 비밀유지의무)
"비밀정보"란 정보제공자가 서면, 구두, 전자적 방식으로 공개하는 일체의 영업, 기술, 재무 정보를 의미한다. 수령자의 비밀유지의무는 본 계약 종료 후에도 영구히 지속된다.

제2조 (손해액의 사전 입증 면제 및 강제적 가처분 승인)
수령자가 본 계약을 위반할 경우 회복할 수 없는 손해가 발생한 것으로 간주하며, 정보제공자는 실제 손해의 입증이나 담보 제공 없이도 즉시 법원에 영업정지 및 가처분을 청구할 수 있고 수령자는 이에 이의를 제기할 수 없다.

제3조 (잔여 기억 예외 조항 - Residual Memory)
정보제공자의 임직원이 수령자의 비밀정보를 접한 후 업무 과정에서 자연스럽게 기억에 남은 기술, 아이디어, 노하우를 바탕으로 독자적인 유사 제품을 개발하더라도 정보제공자는 본 계약상 비밀침해 책임을 일체 지지 아니한다.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-blue-600">
              PDF / 이미지 / 전자문서 직접 업로드
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5">
              AI 법률 검토 대상 PDF 파일 업로드
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Upload Mode Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
              activeTab === 'file'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📄 PDF / 파일 업로드 (기본)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
              activeTab === 'text'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ✍️ 조항 텍스트 직접 입력
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                문서 제목:
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="예: 용역도급계약서 / 상가임대차계약서 / 거래내역서"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                준거법 및 관할법원:
              </label>
              <input
                type="text"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="예: 대한민국 서울중앙지방법원, 수원회생법원"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          {activeTab === 'file' ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                PDF 파일 (.pdf) 또는 이미지·엑셀 파일:
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/20'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60'
                }`}
              >
                <input
                  type="file"
                  id="pdf-file-upload-input"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.doc,.docx,.txt"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <label
                  htmlFor="pdf-file-upload-input"
                  className="flex flex-col items-center cursor-pointer w-full text-center"
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-sm text-slate-900">{selectedFile.name}</div>
                      <div className="text-xs text-slate-500">
                        파일 크기: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type || 'PDF 문서'}
                      </div>
                      <div className="text-[11px] text-blue-600 font-semibold underline">
                        다른 파일로 변경하려면 클릭하세요
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mx-auto">
                        <FileUp className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-sm text-slate-800">
                        PDF 또는 문서를 여기로 끌어다 놓으세요
                      </div>
                      <div className="text-xs text-slate-500">
                        또는 <span className="text-blue-600 font-semibold underline">내 컴퓨터에서 파일 찾기</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        지원 형식: .PDF (최대 100페이지), .PNG, .JPG, .XLSX, .CSV
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">
                  계약서 조항 직접 붙여넣기:
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-400">예시 불러오기:</span>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('saas')}
                    className="text-amber-600 hover:underline cursor-pointer"
                  >
                    클라우드 SaaS
                  </button>
                  <span>&middot;</span>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('nda')}
                    className="text-amber-600 hover:underline cursor-pointer"
                  >
                    독소 NDA
                  </button>
                </div>
              </div>
              <textarea
                rows={7}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="계약서 전체 전문 또는 의심스러운 개별 조항들을 붙여넣으십시오..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-serif leading-relaxed focus:outline-hidden focus:border-blue-600"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleStartAnalysis}
            disabled={isAnalyzing || (!selectedFile && !rawText.trim())}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzing ? (
              <span>PDF 문서 판독 및 대법원 판례·독소조항 분석 중...</span>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>AI 정밀 검토 시작</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
