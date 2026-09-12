import { test, expect } from "@playwright/test";

test.describe("Decarbo Hero Flow (PRD §21 & §22)", () => {
  test("complete hero journey: login → factory/demo → dashboard → build plan → ledger → gujarati → pdf", async ({
    page,
  }) => {
    test.setTimeout(120000);

    // 1. Sign in with instant demo owner
    await page.goto("/login");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page).toHaveTitle(/Decarbo/i);

    const demoBtn = page.getByRole("button", { name: /Demo Factory Owner/i });
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // Verify redirected to dashboard
    await page.waitForURL("**/dashboard", { timeout: 20000 });

    // 2. Onboarding / Demo Data: Check if empty dashboard or active dashboard
    const loadDemoBtn = page.getByRole("button", { name: /Load Jamnagar Demo Data/i });
    if (await loadDemoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loadDemoBtn.click();
      await page.waitForTimeout(3000);
    }

    // 3. Verify Dashboard components & numbers
    await expect(page.locator("body")).toContainText("tCO2e", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/Pareto|Leak-point|Top Emission Drivers|Leak Points/i);

    // 4. Navigate to Decarbonisation Planner tab
    const plannerTab = page.getByRole("button", { name: /Build my plan|મારો પ્લાન બનાવો|Decarbonisation Planner/i }).first();
    if (await plannerTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await plannerTab.click();
    }

    // 5. Verify 3 Plans (sentence-case per PRD §17.4) & Signature Plan Ledger
    await expect(page.locator("body")).toContainText(/Best value/i, { timeout: 30000 });
    await expect(page.locator("body")).toContainText(/Lowest investment/i);
    await expect(page.locator("body")).toContainText(/Biggest cut/i);

    // Signature Ledger table visible
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("body")).toContainText(/Marginal Cost|Net Savings|Capex|Compounded Savings/i);

    // 6. Switch language to Gujarati (PRD §21)
    await page.evaluate(() => window.scrollTo(0, 0));
    const gujaratiBtn = page.getByTestId("lang-btn-gu");
    await expect(gujaratiBtn).toBeVisible();
    await gujaratiBtn.click();

    // Verify Gujarati copy appears across the page
    await expect(page.locator("body")).toContainText(/ડીકાર્બો|ડેશબોર્ડ|મારો પ્લાન બનાવો|ડીકાર્બોને પૂછો/i, { timeout: 15000 });

    // 7. Trigger PDF Report Generation per PRD §21
    const reportBtn = page.locator('button:has-text("પીડીએફ"), button:has-text("રિપોર્ટ"), button:has-text("PDF")').first();
    await reportBtn.scrollIntoViewIfNeeded();
    await expect(reportBtn).toBeVisible();

    const reportPromise = page.waitForResponse(
      (res) => res.url().includes("/report") && res.status() < 400,
      { timeout: 60000 }
    );

    await reportBtn.click({ force: true });

    const reportResponse = await reportPromise;
    expect(reportResponse.status()).toBeLessThan(400);
  });
});
