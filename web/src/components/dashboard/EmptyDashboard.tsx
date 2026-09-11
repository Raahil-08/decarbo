import { FileText, Sparkles, UploadCloud } from "lucide-react";
import { useI18n } from "../../lib/i18n";

interface EmptyDashboardProps {
  onUploadClick: () => void;
  onLoadDemoClick: () => void;
  loadingDemo?: boolean;
}

export function EmptyDashboard({
  onUploadClick,
  onLoadDemoClick,
  loadingDemo = false,
}: EmptyDashboardProps) {
  const { t } = useI18n();

  return (
    <div className="bg-white border border-rule rounded-2xl p-10 sm:p-14 text-center max-w-xl mx-auto my-8 shadow-sm space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-paper border border-rule flex items-center justify-center mx-auto text-ink shadow-xs">
        <FileText className="w-8 h-8 text-ink" />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold text-ink tracking-tight">
          {t("empty_title")}
        </h3>
        <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
          {t("empty_desc")}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          onClick={onUploadClick}
          className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-ink hover:bg-ink-light transition-all shadow-sm group"
        >
          <UploadCloud className="w-4 h-4 mr-2 text-brass group-hover:scale-110 transition-transform" />
          <span>{t("upload_bill_btn")}</span>
        </button>

        <button
          onClick={onLoadDemoClick}
          disabled={loadingDemo}
          className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold text-ink bg-paper border border-rule hover:border-ink transition-all shadow-xs disabled:opacity-50 group"
        >
          <Sparkles className="w-4 h-4 mr-2 text-leaf group-hover:scale-110 transition-transform" />
          <span>{loadingDemo ? "Loading Jamnagar Unit..." : t("load_demo_btn")}</span>
        </button>
      </div>

      <div className="border-t border-rule pt-4 text-[11px] text-muted flex items-center justify-center space-x-2">
        <span>Zero configuration needed</span>
        <span>•</span>
        <span>Deterministic CEA & IPCC emission factors</span>
      </div>
    </div>
  );
}
