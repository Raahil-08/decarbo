import { Globe } from "lucide-react";
import { useI18n, LOCALES, type Locale } from "../../lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center space-x-1 bg-paper border border-rule rounded-lg p-0.5 text-xs">
      <Globe className="w-3.5 h-3.5 text-muted ml-1.5 mr-0.5" />
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code as Locale)}
          className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
            locale === l.code
              ? "bg-white text-ink shadow-xs font-semibold"
              : "text-muted hover:text-ink"
          }`}
        >
          {l.nativeName}
        </button>
      ))}
    </div>
  );
}
