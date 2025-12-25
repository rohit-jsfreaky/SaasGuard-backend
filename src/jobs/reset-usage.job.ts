import { usageService } from "../services/usage.service.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Reset Usage Job
 * Handles periodic reset of usage counters (monthly billing cycles)
 */

/**
 * Run the monthly usage reset job
 * Should be called by a scheduler on the last day of each month
 */
export async function runMonthlyUsageReset(): Promise<void> {
  const startTime = Date.now();

  console.log("[ResetUsageJob] Starting monthly usage reset...");

  try {
    const count = await usageService.resetAllMonthlyUsage();

    const duration = Date.now() - startTime;
    console.log(
      `[ResetUsageJob] Completed: ${count} records reset in ${duration}ms`
    );
  } catch (error) {
    console.error("[ResetUsageJob] Failed:", error);
    throw error;
  }
}

/**
 * Check if today is the last day of the month
 */
export function isLastDayOfMonth(): boolean {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

/**
 * Check if today is the 28th (consistent reset date)
 */
export function isResetDay(): boolean {
  const today = new Date();
  return today.getDate() === 28;
}

/**
 * Schedule the reset job (simple interval-based approach)
 * For production, use a proper job scheduler like node-cron or Bull
 */
export function scheduleMonthlyReset(): void {
  // Check daily at midnight
  const checkInterval = 24 * 60 * 60 * 1000; // 24 hours

  const check = async (): Promise<void> => {
    if (isResetDay() || isLastDayOfMonth()) {
      if (isDevelopment) {
        console.log("[ResetUsageJob] Reset day detected, running job...");
      }
      await runMonthlyUsageReset();
    }
  };

  // Initial check after 1 minute
  setTimeout(() => {
    void check();
  }, 60 * 1000);

  // Then check every 24 hours
  setInterval(() => {
    void check();
  }, checkInterval);

  console.log("[ResetUsageJob] Monthly reset job scheduled");
}

/**
 * Manual trigger for testing or admin use
 */
export async function triggerManualReset(): Promise<number> {
  console.log("[ResetUsageJob] Manual reset triggered");
  return usageService.resetAllMonthlyUsage();
}
