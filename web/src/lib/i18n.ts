import { useState, useEffect } from "react";

export type Locale = "en" | "gu" | "hi";

export const LOCALES: { code: Locale; label: string; nativeName: string }[] = [
  { code: "en", label: "English", nativeName: "English" },
  { code: "gu", label: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "hi", label: "Hindi", nativeName: "हिंदी" },
];

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Header & Navigation
    app_title: "Decarbo",
    app_subtitle: "SME Carbon Planner",
    your_factories: "Your Factories",
    sign_out: "Sign out",
    dashboard: "Dashboard",
    data_ingestion: "Data & Ingestion",
    all_factories: "All factories",
    build_plan: "Build my plan",
    upload_data: "Upload Data",
    view_table: "View as table",
    view_chart: "View flow chart",

    // Top Strip
    annual_footprint: "Annual Footprint",
    carbon_intensity: "Carbon Intensity",
    electrical_intensity: "Electrical Intensity",
    data_quality: "Data Quality",
    per_tonne_output: "Per tonne finished brass output",
    kwh_per_tonne: "kWh / t finished parts",
    verified_sources: "100% Invoices & DISCOM Bills",
    estimated_notice: "{pct}% uses estimated factors",

    // Leak Points
    leak_points_title: "80% Pareto Leak-Points",
    leak_points_subtitle: "The primary carbon leak-points driving 80%+ of your footprint",
    share: "Share",
    severity_major: "Major Leak-Point",
    recommended_fix: "Recommended Fix",
    payback: "Payback",
    click_provenance: "Click number to inspect formula & source",

    // Drift Alert
    drift_alert_title: "Energy Intensity Drift Detected",
    drift_recommendation: "Recommended action",

    // Provenance Drawer
    provenance_title: "Calculation Provenance & Audit Trail",
    provenance_subtitle: "Every emission figure is traceable: Record → Unit Conversion → Factor → Result",
    formula: "Calculation Formula",
    emission_factor: "Emission Factor",
    factor_source: "Source & Version",
    reference_year: "Reference Year",
    verified_badge: "Verified Source",
    estimate_badge: "Estimate Factor",
    close: "Close",

    // Empty State
    empty_title: "Add one electricity bill to see your first number",
    empty_desc: "Upload a recent DISCOM bill (PDF or photo) or import your Excel/Tally purchase register.",
    upload_bill_btn: "Upload Electricity Bill",
    load_demo_btn: "Load Demo Jamnagar Brass Unit",
  },
  gu: {
    // Header & Navigation
    app_title: "ડીકાર્બો",
    app_subtitle: "એસએમઇ કાર્બન પ્લાનર",
    your_factories: "તમારા કારખાના",
    sign_out: "સાઇન આઉટ",
    dashboard: "ડેશબોર્ડ",
    data_ingestion: "ડેટા અને ઇન્જેશન",
    all_factories: "બધા કારખાના",
    build_plan: "મારો પ્લાન બનાવો",
    upload_data: "ડેટા અપલોડ કરો",
    view_table: "કોષ્ટક તરીકે જુઓ",
    view_chart: "ફ્લો ચાર્ટ જુઓ",

    // Top Strip
    annual_footprint: "વાર્ષિક કાર્બન ફૂટપ્રિન્ટ",
    carbon_intensity: "કાર્બન તીવ્રતા",
    electrical_intensity: "વીજળી તીવ્રતા",
    data_quality: "ડેટા ગુણવત્તા",
    per_tonne_output: "પ્રતિ ટન તૈયાર પિત્તળ ઉત્પાદન",
    kwh_per_tonne: "kWh / ટન ભાગો",
    verified_sources: "100% ઇનવોઇસ અને વીજળી બિલ",
    estimated_notice: "{pct}% અંદાજિત પરિબળોનો ઉપયોગ કરે છે",

    // Leak Points
    leak_points_title: "૮૦% પેરેટો લીક-પોઇન્ટ્સ",
    leak_points_subtitle: "મુખ્ય પ્રવૃત્તિઓ જે તમારા ઉત્સર્જનના ૮૦%+ હિસ્સા માટે જવાબદાર છે",
    share: "હિસ્સો",
    severity_major: "મુખ્ય લીક-પોઇન્ટ",
    recommended_fix: "ભલામણ કરેલ ઉકેલ",
    payback: "પેબેક",
    click_provenance: "સૂત્ર અને સ્ત્રોત તપાસવા માટે નંબર પર ક્લિક કરો",

    // Drift Alert
    drift_alert_title: "ઊર્જા તીવ્રતામાં વધારો (ડ્રિફ્ટ)",
    drift_recommendation: "ભલામણ કરેલ પગલાં",

    // Provenance Drawer
    provenance_title: "ગણતરી સ્ત્રોત અને ઓડિટ ટ્રેઇલ",
    provenance_subtitle: "દરેક ઉત્સર્જન આંકડો શોધી શકાય તેવો છે: રેકોર્ડ → યુનિટ રૂપાંતરણ → પરિબળ → પરિણામ",
    formula: "ગણતરી સૂત્ર",
    emission_factor: "ઉત્સર્જન પરિબળ",
    factor_source: "સ્ત્રોત અને સંસ્કરણ",
    reference_year: "સંદર્ભ વર્ષ",
    verified_badge: "ચકાસાયેલ સ્ત્રોત",
    estimate_badge: "અંદાજિત પરિબળ",
    close: "બંધ કરો",

    // Empty State
    empty_title: "તમારો પહેલો આંકડો જોવા માટે એક વીજળી બિલ ઉમેરો",
    empty_desc: "તાજેતરનું વીજળી બિલ અપલોડ કરો અથવા એક્સેલ/ટેલી પરચેઝ રજિસ્ટર આયાત કરો.",
    upload_bill_btn: "વીજળી બિલ અપલોડ કરો",
    load_demo_btn: "જામનગર બ્રાસ ડેમો ડેટા લોડ કરો",
  },
  hi: {
    // Header & Navigation
    app_title: "डीकार्बो",
    app_subtitle: "एसएमई कार्बन प्लानर",
    your_factories: "आपकी फैक्ट्रियाँ",
    sign_out: "साइन आउट",
    dashboard: "डैशबोर्ड",
    data_ingestion: "डेटा और इनपुट",
    all_factories: "सभी फैक्ट्रियाँ",
    build_plan: "मेरी योजना बनाएं",
    upload_data: "डेटा अपलोड करें",
    view_table: "तालिका के रूप में देखें",
    view_chart: "फ्लो चार्ट देखें",

    // Top Strip
    annual_footprint: "वार्षिक कार्बन उत्सर्जन",
    carbon_intensity: "कार्बन तीव्रता",
    electrical_intensity: "बिजली तीव्रता",
    data_quality: "डेटा गुणवत्ता",
    per_tonne_output: "प्रति टन तैयार पीतल उत्पादन",
    kwh_per_tonne: "kWh / टन तैयार माल",
    verified_sources: "100% इनवॉइस और बिजली बिल",
    estimated_notice: "{pct}% अनुमानित कारकों का उपयोग करता है",

    // Leak Points
    leak_points_title: "80% पारेतो लीक-पॉइंट्स",
    leak_points_subtitle: "मुख्य उत्सर्जन बिंदु जो आपके 80%+ कार्बन पदचिह्न के लिए जिम्मेदार हैं",
    share: "हिस्सा",
    severity_major: "प्रमुख लीक-पॉइंट",
    recommended_fix: "सुझाई गई कार्रवाई",
    payback: "पेबैक अवधि",
    click_provenance: "सूत्र और स्रोत देखने के लिए संख्या पर क्लिक करें",

    // Drift Alert
    drift_alert_title: "ऊर्जा तीव्रता में असामान्य वृद्धि (ड्रिफ्ट)",
    drift_recommendation: "सुझाई गई कार्रवाई",

    // Provenance Drawer
    provenance_title: "गणना स्रोत और ऑडिट ट्रेल",
    provenance_subtitle: "प्रत्येक उत्सर्जन संख्या सत्यापन योग्य है: रिकॉर्ड → इकाई रूपांतरण → कारक → परिणाम",
    formula: "गणना सूत्र",
    emission_factor: "उत्सर्जन कारक",
    factor_source: "स्रोत और संस्करण",
    reference_year: "संदर्भ वर्ष",
    verified_badge: "सत्यापित स्रोत",
    estimate_badge: "अनुमानित कारक",
    close: "बंद करें",

    // Empty State
    empty_title: "अपनी पहली संख्या देखने के लिए एक बिजली बिल जोड़ें",
    empty_desc: "हाल का बिजली बिल अपलोड करें या अपनी एक्सेल/टैली खरीद रजिस्टर आयात करें।",
    upload_bill_btn: "बिजली बिल अपलोड करें",
    load_demo_btn: "जामनगर ब्रास डेमो डेटा लोड करें",
  },
};

let currentLocale: Locale = "en";
const listeners = new Set<() => void>();

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem("decarbo_locale", locale);
  listeners.forEach((listener) => listener());
}

export function getLocale(): Locale {
  return currentLocale;
}

export function useI18n() {
  const [locale, setLocalLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem("decarbo_locale") as Locale;
    return saved && translations[saved] ? saved : "en";
  });

  useEffect(() => {
    currentLocale = locale;
    const handleChange = () => setLocalLocale(currentLocale);
    listeners.add(handleChange);
    return () => {
      listeners.delete(handleChange);
    };
  }, [locale]);

  const t = (key: string, params?: Record<string, string | number>): string => {
    let str = translations[locale]?.[key] || translations["en"]?.[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };

  return { locale, setLocale, t };
}
