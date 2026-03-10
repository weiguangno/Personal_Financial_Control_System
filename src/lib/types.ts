/**
 * 接口定义文件 - src/lib/types.ts
 * 严格依据《生活成本助手 Pro - 完整最终母版 v3》定义
 */

// --- A. 数据层：总体设置 ---
export interface GlobalSettings {
  monthlyBudget: number;           // 月预算
  savingsTarget: number;           // 储蓄目标
  initialCumulativeBalance: number;// 月余额累计初始值
  dataVersion: string;             // 数据版本号
}

// --- B. 预算层：三类预算条目 ---
export type BudgetType = 'daily_fixed' | 'monthly_fixed' | 'monthly_elastic';

export interface DailyFixedBudget {
  id: string;
  name: string;
  baseDailyBudget: number;         // 基础日预算
  todayDynamicBudget: number;      // 今日动态预算
  monthlyBudget: number;           // 当月预算
  consumed: number;                // 已消费
  remaining: number;               // 剩余
  cumulativeDifference: number;    // 累计差额
  cumulativeConsumed: number;      // 累计消费
}

export interface MonthlyFixedBudget {
  id: string;
  name: string;
  monthlyBudget: number;           // 月预算
  consumed: number;                // 已消费
  remaining: number;               // 剩余
  cumulativeConsumed: number;      // 累计消费
}

export interface MonthlyElasticBudget {
  id: string;
  name: string;
  monthlyBudget: number;           // 月预算
  consumed: number;                // 已消费
  remaining: number;               // 剩余
  cumulativeConsumed: number;      // 累计消费
}

// --- 数据层：消费与余额记录 ---
export interface Transaction {
  id: string;
  amount: number;                  // 金额
  budgetType: BudgetType;          // 所属预算类型
  itemId: string;                  // 所属条目 ID
  date: string;                    // 日期 (YYYY-MM-DD)
  note?: string;                   // 备注
  createdAt: string;               // 创建时间 (ISO string)
}

export interface MonthlyBalanceRecord {
  year: number;                    // 年份
  month: number;                   // 月份
  monthlyBudget: number;           // 月预算
  monthlyActualConsumed: number;   // 月实际消费
  monthlyBalance: number;          // 月余额
  cumulativeBalance: number;       // 截止该月累计余额
}

// --- C. 开关控制层：21 个全局控制开关 ---
export interface SystemToggles {
  // 总体设置相关
  deductSavingsFromBudget: boolean;     // 1. 月预算是否自动扣除储蓄目标
  includeSavingsInMonthlyCheck: boolean;// 2. 储蓄目标是否参与月度判断
  customStrictThreshold: boolean;       // 3. 严格模式阈值是否启用自定义

  // 预算结构相关
  elasticBudgetSharedPool: boolean;     // 4. 月弹性预算是否采用共享池
  monthlyFixedTimeProgressAlert: boolean;// 5. 每月固定预算是否按时间进度提醒
  dailyFixedDiffItemLevel: boolean;     // 6. 每日固定预算差额是否允许累计到条目级

  // 每日固定预算规则
  dailyFixedDynamicRoll: boolean;       // 7. 每日固定预算是否动态滚动
  dailyFixedRollOnlyYesterday: boolean; // 8. 每日固定预算差额是否只结转前一天
  dailyFixedAllowNegativeRoll: boolean; // 9. 每日固定预算是否允许负结转

  // 每月固定预算规则
  monthlyFixedTimeProgressView: boolean;// 10. 每月固定预算是否显示时间进度分析
  monthlyFixedAllowTempAdd: boolean;    // 11. 每月固定预算是否允许临时追加预算
  monthlyFixedAlertInHome: boolean;     // 12. 每月固定预算分析是否纳入首页提醒

  // 每月弹性预算规则
  elasticBudgetShared: boolean;         // 13. 每月弹性预算是否共享 (与4类似，保留PRD结构)
  dailyDiffToElastic: boolean;          // 14. 每日固定差额是否转入月弹性预算
  delayHealthElasticAlert: boolean;     // 15. 健康类弹性消费是否延迟提醒

  // 判断与分析开关
  includeElasticInTodayCheck: boolean;  // 16. 今日判断是否纳入弹性消费
  monthlyCheckIncludeDate: boolean;     // 17. 月度判断是否结合日期进度
  monthlyCheckIncludeCumulative: boolean;// 18. 月度判断是否结合累计余额

  // 建议输出开关
  protectHealthCategory: boolean;       // 19. 建议是否优先保护健康消费
  compressSocialCategory: boolean;      // 20. 建议是否优先压缩社交消费
  showEncouragingFeedback: boolean;     // 21. 建议是否显示鼓励性反馈
}