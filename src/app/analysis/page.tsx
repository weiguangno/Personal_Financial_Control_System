"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { cacheStore, CACHE_KEY_ANALYSIS } from "@/lib/cacheStore"
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts"

type BudgetType = "daily_fixed" | "monthly_fixed" | "monthly_elastic"

type TransactionRow = {
  id: string
  amount: number | null
  date: string | null
  note: string | null
  budget_type: BudgetType | null
  item_id: string | null
  created_at?: string | null
}

type DailyBudgetRow = {
  id: string
  name: string | null
  daily_budget: number | null
}

type MonthlyFixedBudgetRow = {
  id: string
  name: string | null
  monthly_budget: number | null
}

type MonthlyElasticBudgetRow = {
  id: string
  name: string | null
  monthly_budget?: number | null
}

type BalanceRecordRow = {
  id?: string
  year: number
  month: number
  monthly_budget?: number | null
  monthly_actual_consumed?: number | null
  monthly_balance?: number | null
  cumulative_balance?: number | null
}

type SystemTogglesRow = {
  toggles?: {
    rollover_daily?: boolean
    overflow_to_flexible?: boolean
    strict_mode?: boolean
    deduct_saving_goal?: boolean
  }
} | null

type GlobalSettingsRow = {
  monthly_budget?: number | null
  saving_goal?: number | null
} | null

type ProgressItem = {
  id: string
  name: string
  budget: number
  consumed: number
  remaining: number
  percent: number
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function clampMinZero(value: number) {
  return Math.max(0, value)
}

function getCurrentMonthStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function getDaysInCurrentMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getLastMonthStartStr() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

// Helper for categorical single-item checks (7.2)
function getCategoryStatus(consumed: number, budget: number, strictMode: boolean) {
  if (budget <= 0) {
    return {
      text: "无预算",
      colorClass: "text-gray-400",
      bgClass: "bg-gray-200",
    }
  }

  const offset = strictMode ? 0.1 : 0;
  
  if (consumed > budget) {
    return {
      text: "已超支",
      colorClass: "text-red-500",
      bgClass: "bg-red-500",
    }
  }
  if (consumed >= budget * (0.8 - offset)) {
    return {
      text: "接近上限",
      colorClass: "text-orange-500",
      bgClass: "bg-orange-500",
    }
  }
  if (consumed === 0) {
    return {
      text: "未使用",
      colorClass: "text-gray-500",
      bgClass: "bg-gray-300",
    }
  }
  return {
    text: "正常",
    colorClass: "text-green-500",
    bgClass: "bg-green-500",
  }
}

// Helper for monthly limits (7.3)
function getMonthlyStatus(consumed: number, budget: number, strictMode: boolean) {
  if (budget <= 0) return { text: "无记录", colorClass: "text-gray-400" }

  const offset = strictMode ? 0.1 : 0;
  
  if (consumed > budget) {
    return { text: "超支", colorClass: "text-red-500" }
  } else if (consumed >= budget * (0.8 - offset)) {
    return { text: "偏紧", colorClass: "text-orange-500" }
  }
  return { text: "正常", colorClass: "text-green-500" }
}

export default function AnalysisPage() {
  const [loading, setLoading] = useState(true)

  const [dailyBudgets, setDailyBudgets] = useState<ProgressItem[]>([])
  const [monthlyFixedBudgets, setMonthlyFixedBudgets] = useState<ProgressItem[]>([])
  const [monthlyElasticBudgets, setMonthlyElasticBudgets] = useState<ProgressItem[]>([])
  const [balanceRecords, setBalanceRecords] = useState<BalanceRecordRow[]>([])
  const [trendData, setTrendData] = useState<{ date: string; amount: number }[]>([])

  const [totalBudget, setTotalBudget] = useState(0)
  const [totalConsumed, setTotalConsumed] = useState(0)
  const [strictMode, setStrictMode] = useState(false)

  const currentMonthStr = useMemo(() => getCurrentMonthStr(), [])
  const daysInCurrentMonth = useMemo(() => getDaysInCurrentMonth(), [])
  const todayStr = useMemo(() => getTodayStr(), [])

  const fetchData = useCallback(async () => {
    const processData = (data: any) => {
      const dailyData = (data.dailyData || []) as DailyBudgetRow[]
      const monthlyFixedData = (data.monthlyFixedData || []) as MonthlyFixedBudgetRow[]
      const monthlyElasticData = (data.monthlyElasticData || []) as MonthlyElasticBudgetRow[]
      const balanceData = (data.balanceData || []) as BalanceRecordRow[]
      const transactions = (data.transactions || []) as TransactionRow[]
      const toggles = data.toggles || {}
      const global = data.global || {}

      setBalanceRecords(balanceData)

      const monthTransactions = transactions.filter(
        (tx) => tx.date && tx.date.startsWith(currentMonthStr)
      )

      // 计算本月总支出（仅统计 amount < 0 的消费流水）
      const allMonthExpenses = monthTransactions
        .filter((tx) => toNumber(tx.amount) < 0)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

      const globalMonthlyBudget = toNumber(global.monthly_budget)
      const savingGoal = toNumber(global.saving_goal)

      const strictModeSetting = !!toggles.strict_mode
      setStrictMode(strictModeSetting)

      const deductSavingGoal = !!toggles.deduct_saving_goal

      const availableMonthlyBudget = deductSavingGoal
        ? Math.max(0, globalMonthlyBudget - savingGoal)
        : globalMonthlyBudget

      const dailyTotalPerDay = dailyData.reduce((sum, item) => {
        return sum + toNumber(item.daily_budget)
      }, 0)

      const dailyMonthlyBudgetTotal = dailyTotalPerDay * daysInCurrentMonth

      // 计算每日固定预算执行情况
      const dailyProgressItems: ProgressItem[] = dailyData.map((item) => {
        const budget = toNumber(item.daily_budget) * daysInCurrentMonth

        const consumed = monthTransactions
          .filter(
            (tx) =>
              tx.budget_type === "daily_fixed" &&
              tx.item_id === item.id &&
              toNumber(tx.amount) < 0
          )
          .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

        const remaining = clampMinZero(budget - consumed)
        const percent = budget > 0 ? (consumed / budget) * 100 : 0

        return {
          id: item.id,
          name: item.name || "未命名",
          budget,
          consumed,
          remaining,
          percent,
        }
      })

      // 计算每月固定预算执行情况
      const monthlyFixedBudgetTotal = monthlyFixedData.reduce((sum, item) => {
        return sum + toNumber(item.monthly_budget)
      }, 0)

      const monthlyFixedProgressItems: ProgressItem[] = monthlyFixedData.map((item) => {
        const budget = toNumber(item.monthly_budget)

        const consumed = monthTransactions
          .filter(
            (tx) =>
              tx.budget_type === "monthly_fixed" &&
              tx.item_id === item.id &&
              toNumber(tx.amount) < 0
          )
          .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

        const remaining = clampMinZero(budget - consumed)
        const percent = budget > 0 ? (consumed / budget) * 100 : 0

        return {
          id: item.id,
          name: item.name || "未命名",
          budget,
          consumed,
          remaining,
          percent,
        }
      })

      const dailyFixedTotal = dailyData.reduce((sum, item) => sum + toNumber(item.daily_budget), 0)
      const pastDailyBaseTotal = dailyFixedTotal * Math.max(0, new Date().getDate() - 1)
      const pastDailyConsumed = monthTransactions
        .filter(tx => tx.budget_type === "daily_fixed" && tx.date && tx.date < todayStr)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

      const carry_over = Math.max(0, pastDailyBaseTotal - pastDailyConsumed)

      // 计算每日预算过去未花费的差额，用于同步“差额转入月弹性”逻辑
      const overflowToFlexible = !!toggles.overflow_to_flexible
      let flexible_bonus_from_daily = 0

      if (overflowToFlexible) {
        flexible_bonus_from_daily = carry_over
      }

      // 计算弹性预算
      const monthlyElasticBaseBudget = clampMinZero(
        availableMonthlyBudget - dailyMonthlyBudgetTotal - monthlyFixedBudgetTotal
      )
      // 弹性总预算
      const totalFlexibleBudget = monthlyElasticBaseBudget + flexible_bonus_from_daily

      const monthlyElasticConsumed = monthTransactions
        .filter((tx) => tx.budget_type === "monthly_elastic" && toNumber(tx.amount) < 0)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

      const elasticName =
        monthlyElasticData.length > 0
          ? monthlyElasticData[0]?.name || "其他"
          : "其他"

      const monthlyElasticProgressItems: ProgressItem[] = [
        {
          id: monthlyElasticData[0]?.id || "monthly-elastic-other",
          name: elasticName,
          budget: totalFlexibleBudget,
          consumed: monthlyElasticConsumed,
          remaining: clampMinZero(totalFlexibleBudget - monthlyElasticConsumed),
          percent:
            totalFlexibleBudget > 0
              ? (monthlyElasticConsumed / totalFlexibleBudget) * 100
              : 0,
        },
      ]

      setDailyBudgets(dailyProgressItems)
      setMonthlyFixedBudgets(monthlyFixedProgressItems)
      setMonthlyElasticBudgets(monthlyElasticProgressItems)

      // 总预算：等于（日额度x天数）+ 固定月额度 + 基础弹性额度
      const totalComputedBudget =
        dailyMonthlyBudgetTotal + monthlyFixedBudgetTotal + monthlyElasticBaseBudget

      setTotalBudget(totalComputedBudget)
      setTotalConsumed(allMonthExpenses)

      // 计算近 7 天支出趋势图数据
      const last7Days: { date: string; amount: number }[] = []

      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStr)
        d.setDate(d.getDate() - i)

        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        const dateStr = `${yyyy}-${mm}-${dd}`

        const dailyTotal = transactions
          .filter((tx) => tx.date === dateStr && toNumber(tx.amount) < 0)
          .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

        last7Days.push({
          date: `${mm}-${dd}`,
          amount: dailyTotal,
        })
      }

      setTrendData(last7Days)
    }

    try {
      const cachedData = cacheStore.getCache<any>(CACHE_KEY_ANALYSIS)
      if (cachedData) {
        processData(cachedData)
        setLoading(false)
      } else {
        setLoading(true)
      }

      const monthStartStr = getLastMonthStartStr()
      const [
        dailyRes,
        monthlyFixedRes,
        monthlyElasticRes,
        balanceRes,
        txRes,
        togglesRes,
        globalRes,
      ] = await Promise.all([
        supabase.from("daily_fixed_budgets").select("*"),
        supabase.from("monthly_fixed_budgets").select("*"),
        supabase.from("monthly_elastic_budgets").select("*"),
        supabase
          .from("monthly_balance_records")
          .select("*")
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
        supabase.from("transactions").select("*")
          .gte("date", monthStartStr)
          .order("date", { ascending: false }),
        supabase.from("system_toggles").select("*").limit(1).maybeSingle(),
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
      ])

      if (dailyRes.error) throw dailyRes.error
      if (monthlyFixedRes.error) throw monthlyFixedRes.error
      if (monthlyElasticRes.error) throw monthlyElasticRes.error
      if (balanceRes.error) throw balanceRes.error
      if (txRes.error) throw txRes.error
      if (togglesRes.error) throw togglesRes.error
      if (globalRes.error) throw globalRes.error

      const freshData = {
        dailyData: dailyRes.data || [],
        monthlyFixedData: monthlyFixedRes.data || [],
        monthlyElasticData: monthlyElasticRes.data || [],
        balanceData: balanceRes.data || [],
        transactions: txRes.data || [],
        toggles: (togglesRes.data as SystemTogglesRow)?.toggles || {},
        global: (globalRes.data as GlobalSettingsRow) || {}
      }

      cacheStore.setCache(CACHE_KEY_ANALYSIS, freshData)
      processData(freshData)

    } catch (error) {
      console.error("Error fetching analysis data:", error)
    } finally {
      setLoading(false)
    }
  }, [currentMonthStr, daysInCurrentMonth, todayStr])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const handleFocus = () => {
      fetchData()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData()
      }
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [fetchData])

  const renderProgressItem = (item: ProgressItem) => {
    const status = getCategoryStatus(item.consumed, item.budget, strictMode)

    return (
      <div
        key={item.id}
        className="space-y-2 pb-4 border-b border-gray-50 last:border-0 last:pb-0"
      >
        <div className="flex justify-between items-end gap-3">
          <span className="text-sm font-medium text-gray-700">{item.name}</span>
          <span className="text-xs text-gray-500 text-right">
            ¥{item.consumed.toFixed(2)} / ¥{item.budget.toFixed(2)}
          </span>
        </div>

        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${status.bgClass} rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(item.percent, 100)}%` }}
          />
        </div>

        <div className="flex justify-between items-center">
          <div className={`text-xs font-medium ${status.colorClass}`}>{status.text}</div>
          <div className="text-xs text-gray-400">剩余 ¥{item.remaining.toFixed(2)}</div>
        </div>
      </div>
    )
  }

  const overallRatio = totalBudget > 0 ? totalConsumed / totalBudget : 0

  let overallEvaluation = "整体情况良好，继续保持！"

  const offset = strictMode ? 0.1 : 0

  if (totalBudget === 0) {
    overallEvaluation = "暂无有效预算配置，请先前往设置页面配置月预算和各预算项目。"
  } else if (overallRatio > 1) {
    overallEvaluation = `当前本月总支出已超支 ${((overallRatio - 1) * 100).toFixed(0)}%，请尽快审视固定项与弹性支出。`
  } else if (overallRatio >= (0.8 - offset)) {
    overallEvaluation = `当前本月总支出已达到 ${(overallRatio * 100).toFixed(0)}%，预算状况偏紧，请注意后续消费及弹性支出控制。`
  } else if (totalConsumed === 0) {
    overallEvaluation = "当前本月还没有消费记录，预算状态正常。"
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center pb-24">
        <div className="text-gray-500 font-medium">加载中...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pt-4 pb-24 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-gray-900 px-1">分析中心</h2>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-400 mb-1">本月总预算</span>
                  <span className="text-lg font-bold text-gray-800">
                    ¥{totalBudget.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-400 mb-1">本月总消费</span>
                  <span className="text-lg font-bold text-gray-800">
                    ¥{totalConsumed.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="daily">每日固定</TabsTrigger>
              <TabsTrigger value="monthly_fixed">每月固定</TabsTrigger>
              <TabsTrigger value="elastic">每月弹性</TabsTrigger>
            </TabsList>

            <TabsContent value="daily">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每日固定预算执行情况</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {dailyBudgets.length > 0 ? (
                    dailyBudgets.map((item) => renderProgressItem(item))
                  ) : (
                    <div className="text-center text-sm text-gray-400 py-4">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monthly_fixed">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每月固定预算执行情况</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {monthlyFixedBudgets.length > 0 ? (
                    monthlyFixedBudgets.map((item) => renderProgressItem(item))
                  ) : (
                    <div className="text-center text-sm text-gray-400 py-4">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="elastic">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每月弹性消费监控</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {monthlyElasticBudgets.length > 0 ? (
                    monthlyElasticBudgets.map((item) => renderProgressItem(item))
                  ) : (
                    <div className="text-center text-sm text-gray-400 py-4">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        <section className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50">
              <CardTitle className="text-sm font-medium">近 7 天支出趋势</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {trendData.length > 0 ? (
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#9ca3af" }}
                        dy={10}
                      />
                      <Tooltip
                        cursor={{ fill: "#f3f4f6" }}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                        formatter={(value: any) => [`¥${Number(value).toFixed(2)}`, "支出"]}
                        labelStyle={{
                          color: "#374151",
                          fontWeight: 500,
                          marginBottom: "4px",
                        }}
                      />
                      <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                  暂无支出数据
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                <span>💡</span> 当前消费状态评价
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-indigo-700 leading-relaxed">{overallEvaluation}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50">
              <CardTitle className="text-sm font-medium">长期余额累计记录</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                {balanceRecords.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    暂无历史结算记录
                  </div>
                ) : (
                  balanceRecords.map((record) => {
                    const monthKey = `${record.year}-${String(record.month).padStart(2, "0")}`
                    const budget = toNumber(record.monthly_budget)
                    const consumed = toNumber(record.monthly_actual_consumed)
                    const balance = toNumber(record.monthly_balance)
                    const cumulative = toNumber(record.cumulative_balance)

                    return (
                      <div key={record.id || monthKey} className="p-4 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-800">{monthKey}</span>
                          <span className="text-sm font-medium text-green-600">
                            累计: ¥{cumulative.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>
                            预算: ¥{budget.toFixed(2)} / 消费: ¥{consumed.toFixed(2)}
                          </span>
                          <span className={balance >= 0 ? "text-green-500" : "text-red-500"}>
                            结余: {balance > 0 ? "+" : ""}
                            {balance.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}