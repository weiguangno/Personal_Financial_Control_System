"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { DailyFixedBudget, MonthlyFixedBudget, MonthlyElasticBudget, Transaction } from "@/lib/types"

export default function Home() {
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [dailyBudgets, setDailyBudgets] = useState<Partial<DailyFixedBudget>[]>([])
  const [monthlyFixedRemaining, setMonthlyFixedRemaining] = useState(0)
  const [monthlyElasticRemaining, setMonthlyElasticRemaining] = useState(0)
  const [recentTransactions, setRecentTransactions] = useState<Partial<Transaction>[]>([])
  const [totalConsumed, setTotalConsumed] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  const [calculatedOverview, setCalculatedOverview] = useState({
    monthlyBudget: 0,
    monthRemaining: 0,
  })
  
  // Mixed overview data
  const [topOverview, setTopOverview] = useState({
    todayAvailable: 0,
    todayStatus: { text: "🟢 正常", color: "text-green-500" },
    monthRemaining: 0,
    monthBalance: 0,
    monthlyBudget: 0,
    cumulativeBalance: 0,
  })

  const fetchHomeData = async () => {
    try {
      setLoading(true)
      
      const [txRes, dailyRes, monthlyFixedRes, monthlyElasticRes, togglesRes, globalRes] = await Promise.all([
        supabase.from("transactions").select("*").order("created_at", { ascending: false }),
        supabase.from("daily_fixed_budgets").select("*"),
        supabase.from("monthly_fixed_budgets").select("*"),
        supabase.from("monthly_elastic_budgets").select("*"),
        supabase.from("system_toggles").select("*").limit(1).maybeSingle(),
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
      ])
      
      const toggles = togglesRes.data?.toggles || {}
      const global = globalRes.data || {}
      
      let totalMonthlyBudget = 0;
      let totalRemaining = 0;
      let todayAvailable = 0;

      if (txRes.data) {
        setRecentTransactions(txRes.data.slice(0, 5))
        // Calculate total consumed
        const consumed = txRes.data.reduce((acc, curr) => acc + (curr.amount < 0 ? Math.abs(curr.amount) : 0), 0)
        setTotalConsumed(consumed)
      }
      
      if (dailyRes.data) {
        totalMonthlyBudget += dailyRes.data.reduce((acc, curr) => acc + (curr.monthly_budget || 0), 0)
        totalRemaining += dailyRes.data.reduce((acc, curr) => acc + (curr.remaining || 0), 0)
        todayAvailable = dailyRes.data.reduce((acc, curr) => acc + (curr.today_dynamic_budget || curr.base_daily_budget || 0), 0)
        
        // Map to match the interface as best we can
        setDailyBudgets(dailyRes.data.map(item => ({
          id: item.id,
          name: item.name,
          todayDynamicBudget: item.today_dynamic_budget || item.base_daily_budget || 0,
          consumed: item.consumed || 0
        })))
      }
      
      if (monthlyFixedRes.data) {
        totalMonthlyBudget += monthlyFixedRes.data.reduce((acc, curr) => acc + (curr.monthly_budget || 0), 0)
        const remaining = monthlyFixedRes.data.reduce((acc, curr) => acc + (curr.remaining || 0), 0)
        totalRemaining += remaining
        setMonthlyFixedRemaining(remaining)
      }
      
      if (monthlyElasticRes.data) {
        totalMonthlyBudget += monthlyElasticRes.data.reduce((acc, curr) => acc + (curr.monthly_budget || 0), 0)
        const remaining = monthlyElasticRes.data.reduce((acc, curr) => acc + (curr.remaining || 0), 0)
        totalRemaining += remaining
        setMonthlyElasticRemaining(remaining)
      }

      setCalculatedOverview({
        monthlyBudget: totalMonthlyBudget,
        monthRemaining: totalRemaining,
      })

      // Calculate Today & Month PRD Logic
      const d = new Date()
      const todayStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
      const currentMonthStr = todayStr.substring(0, 7)
      
      const includeElasticInTodayCheck = toggles.includeElasticInTodayCheck || false
      const transactions = txRes.data || []
      
      const todayConsumed = transactions
        .filter(tx => tx.date === todayStr && tx.amount < 0 && (tx.budget_type === 'daily_fixed' || (includeElasticInTodayCheck && tx.budget_type === 'monthly_elastic')))
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
        
      const todayRatio = todayAvailable > 0 ? (todayConsumed / todayAvailable) : 0
      let todayStatusText = '🟢 正常'
      let todayStatusColor = 'text-green-500'
      if (todayRatio > 1) {
        todayStatusText = '🔴 超支'
        todayStatusColor = 'text-red-500'
      } else if (todayRatio >= 0.85) {
        todayStatusText = '🟠 紧张'
        todayStatusColor = 'text-orange-500'
      } else if (todayRatio >= 0.70) {
        todayStatusText = '🟡 注意'
        todayStatusColor = 'text-yellow-500'
      }

      const globalMonthlyBudget = global.monthly_budget || 0
      const savingsTarget = global.savings_target || 0
      const deductSavingsFromBudget = toggles.deductSavingsFromBudget || false
      const availableMonthlyBudget = deductSavingsFromBudget ? Math.max(0, globalMonthlyBudget - savingsTarget) : globalMonthlyBudget
      
      const monthConsumed = transactions
        .filter(tx => tx.date && tx.date.startsWith(currentMonthStr) && tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
        
      const monthRemaining = availableMonthlyBudget - monthConsumed

      setTopOverview({
        todayAvailable,
        todayStatus: { text: todayStatusText, color: todayStatusColor },
        monthRemaining: monthRemaining,
        monthBalance: totalRemaining, 
        monthlyBudget: globalMonthlyBudget,
        cumulativeBalance: global.initial_cumulative_balance || 0,
      })
    } catch (error) {
      console.error("Error fetching home data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHomeData()
  }, [])

  const handleDeleteTx = async (tx: any) => {
    if (!window.confirm('确定删除这笔记录并退回预算吗？')) return;

    try {
      setDeletingId(tx.id);
      
      let tableName = "";
      if (tx.budget_type === "daily_fixed") {
        tableName = "daily_fixed_budgets";
      } else if (tx.budget_type === "monthly_fixed") {
        tableName = "monthly_fixed_budgets";
      } else if (tx.budget_type === "monthly_elastic") {
        tableName = "monthly_elastic_budgets";
      }

      if (tableName && tx.item_id) {
        // Fetch current budget 
        const { data: budgetData, error: fetchErr } = await supabase
          .from(tableName)
          .select('consumed, remaining')
          .eq('id', tx.item_id)
          .single();
          
        if (fetchErr) throw fetchErr;

        const currentConsumed = Number(budgetData?.consumed || 0);
        const currentRemaining = Number(budgetData?.remaining || 0);
        const txAmount = Number(tx.amount || 0);

        // Reverse logic: new_consumed = consumed - amount, new_remaining = remaining + amount
        const newConsumed = currentConsumed - txAmount;
        const newRemaining = currentRemaining + txAmount;

        const { error: updateErr } = await supabase
          .from(tableName)
          .update({ consumed: newConsumed, remaining: newRemaining })
          .eq('id', tx.item_id);

        if (updateErr) throw updateErr;
      }

      // Delete the transaction
      const { error: delErr } = await supabase
        .from("transactions")
        .delete()
        .eq("id", tx.id);

      if (delErr) throw delErr;

      // Refresh
      await fetchHomeData();
    } catch (error: any) {
      console.error("Error deleting transaction:", error);
      alert("删除失败: " + (error?.message || "未知错误"));
    } finally {
      setDeletingId(null);
    }
  };

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
        
        {/* 1. 顶部模块（总览 Card） */}
        <section>
          <Card className="shadow-sm border-0 border-t-4 border-t-primary bg-white">
            <CardHeader className="pb-2 text-center pt-6">
              <CardTitle className="text-gray-500 text-sm font-medium">今日能花</CardTitle>
              <div className="flex justify-center flex-col items-center mt-2">
                <span className="text-5xl font-extrabold text-gray-900 tracking-tight">
                  ¥{topOverview.todayAvailable.toFixed(2)}
                </span>
                <div className={`mt-3 px-3 py-1 bg-gray-50 rounded-full text-sm font-medium flex items-center gap-1 ${topOverview.todayStatus.color}`}>
                  状态: {topOverview.todayStatus.text}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-y-5 gap-x-4 mt-4 pt-5 border-t border-gray-100">
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">本月剩余</span>
                  <span className="text-lg font-bold text-gray-800">¥{topOverview.monthRemaining.toFixed(2)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">月余额</span>
                  <span className="text-lg font-bold text-gray-800">¥{topOverview.monthBalance.toFixed(2)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">月预算 (近似已花费)</span>
                  <span className="text-sm font-semibold text-gray-700">
                    ¥{topOverview.monthlyBudget.toFixed(0)} <span className="text-gray-400 font-normal">/ ¥{totalConsumed.toFixed(0)}</span>
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-400 text-xs mb-1">累计余额</span>
                  <span className="text-sm font-semibold text-green-600">¥{topOverview.cumulativeBalance.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 2. 中部模块（预算池 Card 组） */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800 px-1">预算池拨划</h2>
          
          {/* A. 每日固定预算区 */}
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
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="text-sm font-bold text-gray-900">¥{item.todayDynamicBudget?.toFixed(2) || '0.00'}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {/* B. 每月固定预算区 */}
            <Card className="shadow-sm border-0 bg-white">
              <CardContent className="p-4 flex flex-col justify-center">
                <span className="text-xs text-gray-500 mb-1">每月固定剩余 (Sum)</span>
                <span className="text-lg font-bold text-gray-800">¥{monthlyFixedRemaining.toFixed(2)}</span>
              </CardContent>
            </Card>

            {/* C. 每月弹性预算区 */}
            <Card className="shadow-sm border-0 bg-white">
              <CardContent className="p-4 flex flex-col justify-center">
                <span className="text-xs text-gray-500 mb-1">每月弹性剩余 (Sum)</span>
                <span className="text-lg font-bold text-gray-800">¥{monthlyElasticRemaining.toFixed(2)}</span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 3. 底部模块（最近记录 Card） */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-gray-800">最近记录</h2>
            <Button variant="ghost" size="sm" onClick={() => router.push('/add')} className="text-primary pr-0">
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
                          {tx.note || (tx.budgetType === 'daily_fixed' ? '日常支出' : tx.budgetType === 'monthly_fixed' ? '固定支出' : '弹性支出')}
                        </span>
                        <span className="text-xs text-gray-400">{tx.date}</span>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-sm font-bold text-gray-800">
                          ¥ {Math.abs(tx.amount || 0).toFixed(2)}
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

      </div>

      {/* "记一笔" Floating Action Button */}
      <Button 
        className="fixed bottom-20 right-6 w-14 h-14 rounded-full shadow-lg text-3xl font-light z-50 flex items-center justify-center p-0 hover:shadow-xl transition-shadow"
        onClick={() => router.push('/add')}
      >
        <span className="mb-1">+</span>
      </Button>
    </main>
  )
}
