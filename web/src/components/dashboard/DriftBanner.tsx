import { AlertTriangle, ArrowUpRight, Wrench } from "lucide-react";
import { useI18n } from "../../lib/i18n";

interface DriftAlert {
  activity_type: string;
  percentage_change: number;
  period_start: string;
  period_end: string;
  severity: string;
  message: string;
  recommendation: string;
}

interface DriftBannerProps {
  alerts: DriftAlert[];
  onInspectAction?: () => void;
}

export function DriftBanner({ alerts, onInspectAction }: DriftBannerProps) {
  const { t } = useI18n();

  if (!alerts || alerts.length === 0) return null;

  const alert = alerts[0];

  return (
    <div className="bg-ember/5 border border-ember/30 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start space-x-3.5">
        <div className="p-2 rounded-lg bg-ember/10 text-ember shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h4 className="text-xs font-bold text-ember uppercase tracking-wider">
              {t("drift_alert_title")}
            </h4>
            <span className="text-[10px] font-mono font-bold bg-ember text-white px-2 py-0.2 rounded">
              +{alert.percentage_change.toFixed(1)}% Drift
            </span>
          </div>
          <p className="text-xs font-medium text-ink mt-1">
            {alert.message}
          </p>
          <div className="flex items-center space-x-1.5 text-xs text-muted mt-1.5">
            <Wrench className="w-3.5 h-3.5 text-brass" />
            <span className="font-medium text-ink">{t("drift_recommendation")}:</span>
            <span>{alert.recommendation}</span>
          </div>
        </div>
      </div>

      {onInspectAction && (
        <button
          onClick={onInspectAction}
          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-ember hover:bg-ember/90 transition-colors shadow-sm shrink-0 self-start sm:self-center"
        >
          <span>Fix Leak</span>
          <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
        </button>
      )}
    </div>
  );
}
