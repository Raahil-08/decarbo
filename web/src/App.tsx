import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PlanPage } from "./pages/PlanPage";
import { WhatIfPage } from "./pages/WhatIfPage";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/f/:factoryId/plan" element={<PlanPage />} />
          <Route path="/simulate" element={<WhatIfPage />} />
          <Route path="/f/:factoryId/simulate" element={<WhatIfPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}


export default App;

