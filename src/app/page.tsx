"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { cacheStore, CACHE_KEY_HOME } from "@/lib/cacheStore"

type BudgetType = "daily_fixed" | "monthly_fixed" | "monthly_elastic"

type TransactionRow = {
  id: string
  amount: number | null
  date: string | null
  note: string | null
  budget_type: BudgetType | null
  item_id: string | null
  created_at: string | null
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
  monthly_budget: number | null
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

type DailyBudgetCardItem = {
  id: string
  name: string
  todayBudget: number
  todayConsumed: number
  todayRemaining: number
}

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

// 修复点 1：统一将所有流水视为支出（取绝对值），兼容 add 页面存入的正数
const toAbsExpense = (amount: unknown) => {
  return Math.abs(toNumber(amount))
}

const getTodayStr = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const getCurrentMonthStr = () => {
  return getTodayStr().slice(0, 7)
}

const getLastMonthStartStr = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

const getDaysInCurrentMonth = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
}

const clampMinZero = (value: number) => Math.max(0, value)

export default function Home() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [dailyBudgets, setDailyBudgets] = useState<DailyBudgetCardItem[]>([])
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([])
  const [totalConsumed, setTotalConsumed] = useState(0)

  const [topOverview, setTopOverview] = useState({
    todayAvailable: 0,
    todayStatus: { text: "🟢 正常", color: "text-green-500" },
    monthRemaining: 0,
    monthBalance: 0,
    monthlyBudget: 0,
  })

  const [monthlyFixedRemaining, setMonthlyFixedRemaining] = useState(0)
  const [monthlyElasticRemaining, setMonthlyElasticRemaining] = useState(0)

  const [advices, setAdvices] = useState({
    today: "",
    category: "",
    monthly: ""
  })

  const todayStr = useMemo(() => getTodayStr(), [])
  const currentMonthStr = useMemo(() => getCurrentMonthStr(), [])
  const daysInCurrentMonth = useMemo(() => getDaysInCurrentMonth(), [])

  const processAndSetHomeData = (data: any) => {
    const transactions = (data.transactions || []) as TransactionRow[]
    const dailyRows = (data.dailyRows || []) as DailyBudgetRow[]
    const monthlyFixedRows = (data.monthlyFixedRows || []) as MonthlyFixedBudgetRow[]
    const monthlyElasticRows = (data.monthlyElasticRows || []) as MonthlyElasticBudgetRow[]
    const toggles = data.toggles || {}
    const global = data.global || {}

    setRecentTransactions(transactions.slice(0, 5))

    // 计算所有消费（已取绝对值兼容）
    const allConsumed = transactions.reduce((sum, tx) => {
      return sum + Math.abs(toNumber(tx.amount))
    }, 0)
    setTotalConsumed(allConsumed)

    const todayTransactions = transactions.filter((tx) => tx.date === todayStr)
    const currentMonthTransactions = transactions.filter(
      (tx) => tx.date && tx.date.startsWith(currentMonthStr)
    )

    // 1. 基础计算
    const dailyFixedTotal = dailyRows.reduce((sum, item) => sum + toNumber(item.daily_budget), 0)

    // 2. 过去差额计算 carry_over
    const currentDayOfMonth = new Date().getDate()
    const pastDaysCount = Math.max(0, currentDayOfMonth - 1)
    
    const pastDailyBaseTotal = dailyFixedTotal * pastDaysCount
    const pastDailyConsumed = currentMonthTransactions
      .filter(tx => tx.budget_type === "daily_fixed" && tx.date && tx.date < todayStr)
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

    const carry_over = Math.max(0, pastDailyBaseTotal - pastDailyConsumed)

    // 3. 结转与弹性互斥逻辑
    const rolloverDaily = !!toggles.rollover_daily
    const overflowToFlexible = !!toggles.overflow_to_flexible

    let today_allowance = dailyFixedTotal
    let flexible_bonus_from_daily = 0

    if (overflowToFlexible) {
      flexible_bonus_from_daily = carry_over
    } else if (rolloverDaily) {
      today_allowance = dailyFixedTotal + carry_over
    }

    const dailyBudgetCards: DailyBudgetCardItem[] = dailyRows.map((item) => {
      const itemDailyBudget = toNumber(item.daily_budget)
      
      const itemPastConsumed = currentMonthTransactions
        .filter(tx => tx.budget_type === "daily_fixed" && tx.item_id === item.id && tx.date && tx.date < todayStr)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)
      
      const itemCarryOver = Math.max(0, (itemDailyBudget * pastDaysCount) - itemPastConsumed)

      let itemTodayBudget = itemDailyBudget
      if (!overflowToFlexible && rolloverDaily) {
        itemTodayBudget = itemDailyBudget + itemCarryOver
      }

      const todayConsumed = todayTransactions
        .filter((tx) => tx.budget_type === "daily_fixed" && tx.item_id === item.id)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

      return {
        id: item.id,
        name: item.name || "未命名",
        todayBudget: itemTodayBudget,
        todayConsumed,
        todayRemaining: clampMinZero(itemTodayBudget - todayConsumed),
      }
    })

    setDailyBudgets(dailyBudgetCards)

    const monthlyFixedBudgetTotal = monthlyFixedRows.reduce((sum, item) => {
      return sum + toNumber(item.monthly_budget)
    }, 0)

    const monthlyFixedConsumed = currentMonthTransactions
      .filter((tx) => tx.budget_type === "monthly_fixed")
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

    const computedMonthlyFixedRemaining = clampMinZero(
      monthlyFixedBudgetTotal - monthlyFixedConsumed
    )
    setMonthlyFixedRemaining(computedMonthlyFixedRemaining)

    const todayConsumedForStatus = todayTransactions
      .filter((tx) => {
        if (tx.budget_type === "daily_fixed") return true
        return false
      })
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

    const strictMode = !!toggles.strict_mode
    const strictOffset = strictMode ? 0.1 : 0
    const todayRatio = today_allowance > 0 ? todayConsumedForStatus / today_allowance : 0

    let todayStatusText = "🟢 正常"
    let todayStatusColor = "text-green-500"

    if (todayRatio > 1) {
      todayStatusText = "🔴 超支"
      todayStatusColor = "text-red-500"
    } else if (todayRatio >= (0.85 - strictOffset)) {
      todayStatusText = "🟠 紧张"
      todayStatusColor = "text-orange-500"
    } else if (todayRatio >= (0.7 - strictOffset)) {
      todayStatusText = "🟡 注意"
      todayStatusColor = "text-yellow-500"
    }

    const globalMonthlyBudget = toNumber(global.monthly_budget)
    const savingGoal = toNumber(global.saving_goal)
    const deductSavingGoal = !!toggles.deduct_saving_goal

    const availableMonthlyBudget = deductSavingGoal
      ? Math.max(0, globalMonthlyBudget - savingGoal)
      : globalMonthlyBudget

    const dailyFixedMonthlyTotal = dailyFixedTotal * daysInCurrentMonth

    // 基础弹性预算
    const monthlyElasticBaseBudget = clampMinZero(
      availableMonthlyBudget - dailyFixedMonthlyTotal - monthlyFixedBudgetTotal
    )

    const monthlyElasticConsumed = currentMonthTransactions
      .filter((tx) => tx.budget_type === "monthly_elastic")
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

    // 弹性剩余 = 基础弹性 + 每日差额奖励(如开启) - 弹性已消费
    const computedMonthlyElasticRemaining = clampMinZero(
      monthlyElasticBaseBudget + flexible_bonus_from_daily - monthlyElasticConsumed
    )
    setMonthlyElasticRemaining(computedMonthlyElasticRemaining)

    const monthConsumedAll = currentMonthTransactions
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)

    const monthRemaining = clampMinZero(availableMonthlyBudget - monthConsumedAll)

    const monthBalance =
      computedMonthlyFixedRemaining + computedMonthlyElasticRemaining

    // 阶段 4：智能消费建议逻辑 (8.1, 8.2, 8.3)
    let todayAdvice = ""
    if (todayRatio < 0.7) {
      todayAdvice = "今日预算充足，按需消费即可。"
    } else if (todayRatio <= 1) {
      todayAdvice = "今日固定预算已消耗较多，请避免计划外支出。"
    } else {
      todayAdvice = "今日固定支出已超标，明天请务必克制！"
    }

    let maxCategoryName = ""
    let maxCategoryRatio = -1

    dailyRows.forEach(item => {
      const itemBudget = toNumber(item.daily_budget) * daysInCurrentMonth
      const itemConsumed = currentMonthTransactions
        .filter(tx => tx.budget_type === "daily_fixed" && tx.item_id === item.id)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)
      const ratio = itemBudget > 0 ? itemConsumed / itemBudget : 0
      if (ratio > maxCategoryRatio) {
        maxCategoryRatio = ratio
        maxCategoryName = item.name || "未命名"
      }
    })

    monthlyFixedRows.forEach(item => {
      const itemBudget = toNumber(item.monthly_budget)
      const itemConsumed = currentMonthTransactions
        .filter(tx => tx.budget_type === "monthly_fixed" && tx.item_id === item.id)
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0)
      const ratio = itemBudget > 0 ? itemConsumed / itemBudget : 0
      if (ratio > maxCategoryRatio) {
        maxCategoryRatio = ratio
        maxCategoryName = item.name || "未命名"
      }
    })

    const totalFlexibleBudget = monthlyElasticBaseBudget + flexible_bonus_from_daily
    if (totalFlexibleBudget > 0) {
      const elasticRatio = monthlyElasticConsumed / totalFlexibleBudget
      if (elasticRatio > maxCategoryRatio) {
        maxCategoryRatio = elasticRatio
        maxCategoryName = monthlyElasticRows[0]?.name || "弹性预算"
      }
    }

    let categoryAdvice = ""
    if (maxCategoryRatio > 0.8) {
      categoryAdvice = `【${maxCategoryName}】预算已接近或超出上限，建议近期减少此类消费。`
    } else {
      categoryAdvice = "各类别消费均在健康范围内，继续保持。"
    }

    let monthlyAdvice = ""
    const monthRatio = availableMonthlyBudget > 0 ? monthConsumedAll / availableMonthlyBudget : 0
    if (currentDayOfMonth < 15 && totalFlexibleBudget > 0 && monthlyElasticConsumed > totalFlexibleBudget * 0.5) {
      monthlyAdvice = "上半月弹性预算消耗过快，后半月需要勒紧裤腰带了。"
    } else if (monthRatio > 1) {
      monthlyAdvice = "本月总消费已超支，请立即停止一切非必要开支！"
    } else if (monthRatio >= (0.8 - strictOffset)) {
      monthlyAdvice = "本月预算已偏紧，请注意控制整体消费节奏。"
    } else {
      monthlyAdvice = "本月总体消费进度良好，请继续保持。"
    }

    setAdvices({
      today: todayAdvice,
      category: categoryAdvice,
      monthly: monthlyAdvice
    })

    setTopOverview({
      todayAvailable: today_allowance,
      todayStatus: { text: todayStatusText, color: todayStatusColor },
      monthRemaining,
      monthBalance,
      monthlyBudget: globalMonthlyBudget,
    })

    if (monthlyElasticRows.length > 1) {
      console.warn("monthly_elastic_budgets 表中检测到多条记录。按你的规则建议仅保留 1 条“其他”记录。")
    }
  }

  const fetchHomeData = async () => {
    try {
      // 1. 本地缓存读取与展示
      const cachedData = cacheStore.getCache<any>(CACHE_KEY_HOME)
      if (cachedData) {
        processAndSetHomeData(cachedData)
        setLoading(false)
      } else {
        setLoading(true)
      }

      // 2. 异步在后台向 Supabase 拉取最新数据
      const monthStartStr = getLastMonthStartStr()
      const [
        txRes,
        dailyRes,
        monthlyFixedRes,
        monthlyElasticRes,
        togglesRes,
        globalRes,
      ] = await Promise.all([
        supabase.from("transactions").select("*")
          .gte("date", monthStartStr)
          .order("created_at", { ascending: false }),
        supabase.from("daily_fixed_budgets").select("*"),
        supabase.from("monthly_fixed_budgets").select("*"),
        supabase.from("monthly_elastic_budgets").select("*"),
        supabase.from("system_toggles").select("*").limit(1).maybeSingle(),
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
      ])

      if (txRes.error) throw txRes.error
      if (dailyRes.error) throw dailyRes.error
      if (monthlyFixedRes.error) throw monthlyFixedRes.error
      if (monthlyElasticRes.error) throw monthlyElasticRes.error
      if (togglesRes.error) throw togglesRes.error
      if (globalRes.error) throw globalRes.error

      const freshData = {
        transactions: txRes.data || [],
        dailyRows: dailyRes.data || [],
        monthlyFixedRows: monthlyFixedRes.data || [],
        monthlyElasticRows: monthlyElasticRes.data || [],
        toggles: (togglesRes.data as SystemTogglesRow)?.toggles || {},
        global: (globalRes.data as GlobalSettingsRow) || {}
      }

      // 3. 将最新云端数据写入本地缓存
      cacheStore.setCache(CACHE_KEY_HOME, freshData)

      // 4. 静默校准 UI
      processAndSetHomeData(freshData)

    } catch (error) {
      console.error("Error fetching home data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHomeData();

    const handleFocus = () => fetchHomeData();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchHomeData();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const handleDeleteTx = async (tx: TransactionRow) => {
    if (!window.confirm("确定删除这笔记录吗？删除后首页金额会自动重新计算。")) return

    try {
      setDeletingId(tx.id)

      // 乐观更新：先从 state 和 cache 移除这笔记录
      const cachedData = cacheStore.getCache<any>(CACHE_KEY_HOME)
      if (cachedData && cachedData.transactions) {
        cachedData.transactions = cachedData.transactions.filter((t: any) => t.id !== tx.id)
        cacheStore.setCache(CACHE_KEY_HOME, cachedData)
        processAndSetHomeData(cachedData)
      }

      const { error } = await supabase.from("transactions").delete().eq("id", tx.id)

      if (error) throw error

      fetchHomeData()
    } catch (error: any) {
      console.error("Error deleting transaction:", error)
      alert("删除失败: " + (error?.message || "未知错误"))
    } finally {
      setDeletingId(null)
    }
  }

  const getTxDisplayName = (tx: TransactionRow) => {
    if (tx.note) return tx.note
    if (tx.budget_type === "daily_fixed") return "日常支出"
    if (tx.budget_type === "monthly_fixed") return "固定支出"
    if (tx.budget_type === "monthly_elastic") return "弹性支出"
    return "未知支出"
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-gray-500 font-medium">加载中...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-6">
        <section>
          <Card className="shadow-sm border-0 border-t-4 border-t-primary bg-white">
            <CardHeader className="pb-2 text-center pt-6">
              <CardTitle className="text-gray-500 text-sm font-medium">今日能花</CardTitle>
              <div className="flex justify-center flex-col items-center mt-2">
                <span className="text-5xl font-extrabold text-gray-900 tracking-tight">
                  ¥{topOverview.todayAvailable.toFixed(2)}
                </span>
                <div
                  className={`mt-3 px-3 py-1 bg-gray-50 rounded-full text-sm font-medium flex items-center gap-1 ${topOverview.todayStatus.color}`}
                >
                  状态: {topOverview.todayStatus.text}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-y-5 gap-x-4 mt-4 pt-5 border-t border-gray-100">
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">本月剩余</span>
                  <span className="text-lg font-bold text-gray-800">
                    ¥{topOverview.monthRemaining.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">月余额</span>
                  <span className="text-lg font-bold text-gray-800">
                    ¥{topOverview.monthBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">月预算 / 已花费</span>
                  <span className="text-sm font-semibold text-gray-700">
                    ¥{topOverview.monthlyBudget.toFixed(0)}
                    <span className="text-gray-400 font-normal"> / ¥{totalConsumed.toFixed(0)}</span>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800 px-1">预算池拨划</h2>

          <Card className="shadow-sm border-0">
            <CardHeader className="pb-3 pt-4 px-4 bg-gray-50 rounded-t-xl border-b border-gray-100">
              <CardTitle className="text-sm font-medium text-gray-700">每日固定预算</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {dailyBudgets.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">暂无数据</div>
                ) : (
                  dailyBudgets.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-white px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">{item.name}</span>
                        <span className="text-xs text-gray-400">
                          已花 ¥{item.todayConsumed.toFixed(2)} / 剩余 ¥{item.todayRemaining.toFixed(2)}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        ¥{item.todayBudget.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="shadow-sm border-0 bg-white">
              <CardContent className="p-4 flex flex-col justify-center">
                <span className="text-xs text-gray-500 mb-1">每月固定剩余</span>
                <span className="text-lg font-bold text-gray-800">
                  ¥{monthlyFixedRemaining.toFixed(2)}
                </span>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-0 bg-white">
              <CardContent className="p-4 flex flex-col justify-center">
                <span className="text-xs text-gray-500 mb-1">每月弹性剩余</span>
                <span className="text-lg font-bold text-gray-800">
                  ¥{monthlyElasticRemaining.toFixed(2)}
                </span>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-gray-800">最近记录</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/add")}
              className="text-primary pr-0"
            >
              ➕ 记一笔
            </Button>
          </div>

          <Card className="shadow-sm border-0 bg-white">
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                {recentTransactions.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">暂无消费记录</div>
                ) : (
                  recentTransactions.map((tx) => (
                    <div key={tx.id} className="p-4 flex justify-between items-center transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-800">
                          {getTxDisplayName(tx)}
                        </span>
                        <span className="text-xs text-gray-400">{tx.date || "-"}</span>
                      </div>

                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-sm font-bold text-gray-800">
                          ¥ {Math.abs(toNumber(tx.amount)).toFixed(2)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteTx(tx)}
                          disabled={deletingId === tx.id}
                        >
                          {deletingId === tx.id ? "删除中..." : "删除"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3 pt-2">
          <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                <span>💡</span> 消费建议
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-4 space-y-3">
              <div className="flex flex-col space-y-1">
                <span className="text-xs font-semibold text-indigo-700">今日小贴士</span>
                <span className="text-sm text-gray-700 leading-relaxed">{advices.today}</span>
              </div>
              <div className="flex flex-col space-y-1">
                <span className="text-xs font-semibold text-indigo-700">分类预警</span>
                <span className="text-sm text-gray-700 leading-relaxed">{advices.category}</span>
              </div>
              <div className="flex flex-col space-y-1">
                <span className="text-xs font-semibold text-indigo-700">月度统筹</span>
                <span className="text-sm text-gray-700 leading-relaxed">{advices.monthly}</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}