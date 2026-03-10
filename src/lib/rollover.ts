import { supabase } from "./supabase";

export async function executeDailyRollover() {
  try {
    // 1. Fetch system toggles
    const { data: togglesData, error: togglesErr } = await supabase
      .from('system_toggles')
      .select('toggles')
      .limit(1)
      .maybeSingle();
      
    if (togglesErr) throw togglesErr;
    const toggles = togglesData?.toggles || {};

    // 2. Fetch daily fixed budgets
    const { data: dailyItems, error: dailyErr } = await supabase
      .from('daily_fixed_budgets')
      .select('*');
      
    if (dailyErr) throw dailyErr;
    if (!dailyItems || dailyItems.length === 0) return;

    // 3. Process each item
    for (const item of dailyItems) {
      const todayDynamic = Number(item.today_dynamic_budget || item.base_daily_budget || 0);
      const consumed = Number(item.consumed || 0);
      const baseDaily = Number(item.base_daily_budget || 0);
      
      let diff = todayDynamic - consumed;

      // Rule: Allow Negative Roll
      const allowNegative = toggles.dailyFixedAllowNegativeRoll ?? false;
      if (!allowNegative && diff < 0) {
        diff = 0;
      }

      // Rule: Roll Only Yesterday
      const rollOnlyYesterday = toggles.dailyFixedRollOnlyYesterday ?? false;
      let newCumulative = 0;
      if (rollOnlyYesterday) {
        newCumulative = diff;
      } else {
        newCumulative = Number(item.cumulative_difference || 0) + diff;
      }

      // Rule: Dynamic Roll (apply cumulative difference to tomorrow's budget)
      const dynamicRoll = toggles.dailyFixedDynamicRoll ?? false;
      let newTodayDynamic = baseDaily;
      if (dynamicRoll) {
        newTodayDynamic += newCumulative;
      }

      // 4. Update the database record
      // Consumed is reset to 0 representing a new day.
      // Remaining is preserved as it tracks the monthly remaining which persists across days.
      const { error: updateErr } = await supabase
        .from('daily_fixed_budgets')
        .update({
          consumed: 0,
          cumulative_difference: newCumulative,
          today_dynamic_budget: newTodayDynamic,
          remaining: item.remaining // Kept to represent "当月剩余可用"
        })
        .eq('id', item.id);

      if (updateErr) {
        console.error(`Failed to update daily budget item ${item.id}:`, updateErr);
      }
    }
  } catch (error) {
    console.error("Daily rollover failed:", error);
    throw error;
  }
}
