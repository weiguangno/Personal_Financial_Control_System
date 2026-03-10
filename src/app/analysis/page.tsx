"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts"

function getAnalysisStatus(consumed: number, budget: number) {
  if (budget <= 0) return { text: "未使用", colorClass: "text-gray-500", bgClass: "bg-gray-500" }
  if (consumed >= budget) {
    return { text: "已超支", colorClass: "text-red-500", bgClass: "bg-red-500" }
  }
  if (consumed >= budget * 0.8) {
    return { text: "接近上限", colorClass: "text-orange-500", bgClass: "bg-orange-500" }
  }
  return { text: "正常", colorClass: "text-green-500", bgClass: "bg-green-500" }
}

export default function AnalysisPage() {
  const [loading, setLoading] = useState(true)
  
  const [dailyBudgets, setDailyBudgets] = useState<any[]>([])
  const [monthlyFixedBudgets, setMonthlyFixedBudgets] = useState<any[]>([])
  const [monthlyElasticBudgets, setMonthlyElasticBudgets] = useState<any[]>([])
  const [balanceRecords, setBalanceRecords] = useState<any[]>([])
  const [trendData, setTrendData] = useState<{ date: string; amount: number }[]>([])
  
  const [totalBudget, setTotalBudget] = useState(0)
  const [totalConsumed, setTotalConsumed] = useState(0)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const [dailyRes, monthlyFixedRes, monthlyElasticRes, balanceRes, txRes] = await Promise.all([
          supabase.from("daily_fixed_budgets").select("*"),
          supabase.from("monthly_fixed_budgets").select("*"),
          supabase.from("monthly_elastic_budgets").select("*"),
          supabase.from("monthly_balance_records").select("*").order("year", { ascending: false }).order("month", { ascending: false }),
          supabase.from("transactions").select("amount, date").order("date", { ascending: false })
        ])

        const dailyData = dailyRes.data || []
        const monthlyFixedData = monthlyFixedRes.data || []
        const monthlyElasticData = monthlyElasticRes.data || []

        setDailyBudgets(dailyData)
        setMonthlyFixedBudgets(monthlyFixedData)
        setMonthlyElasticBudgets(monthlyElasticData)
        setBalanceRecords(balanceRes.data || [])

        let tBudget = 0
        let tConsumed = 0

        dailyData.forEach(item => {
          tBudget += Number(item.monthly_budget || item.base_daily_budget * 30 || 0)
          tConsumed += Number(item.consumed || 0)
        })
        monthlyFixedData.forEach(item => {
          tBudget += Number(item.monthly_budget || 0)
          tConsumed += Number(item.consumed || 0)
        })
        monthlyElasticData.forEach(item => {
          tBudget += Number(item.monthly_budget || 0)
          tConsumed += Number(item.consumed || 0)
        })

        setTotalBudget(tBudget)
        setTotalConsumed(tConsumed)

        // Process 7 days trend data
        const transactions = txRes.data || []
        const last7Days: { date: string; amount: number }[] = []
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          // YYYY-MM-DD format
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          const dateStr = `${yyyy}-${mm}-${dd}`
          
          // sum amount for that day (expenses usually negative in tx, but PRD uses positive for spending, we take absolute value or negative values if PRD uses negative)
          // assuming negative is expense based on previous code `< 0 ? Math.abs`
          const dailyTotal = transactions
            .filter(tx => tx.date === dateStr && (tx.amount || 0) < 0)
            .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0)
            
          last7Days.push({
            date: `${mm}-${dd}`,
            amount: dailyTotal
          })
        }
        
        setTrendData(last7Days)

      } catch (error) {
        console.error("Error fetching analysis data:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center pb-24">
        <div className="text-gray-500 font-medium">加载中...</div>
      </main>
    )
  }

  const renderProgressItem = (item: any) => {
    // try to get monthly_budget, then fallback to base_daily_budget if it exists
    const budgetVal = Number(item.monthly_budget || item.base_daily_budget || 0)
    const consumedVal = Number(item.consumed || 0)
    
    const percent = budgetVal > 0 ? (consumedVal / budgetVal) * 100 : 0
    const status = getAnalysisStatus(consumedVal, budgetVal)

    return (
      <div key={item.id} className="space-y-2 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
        <div className="flex justify-between items-end">
          <span className="text-sm font-medium text-gray-700">{item.name}</span>
          <span className="text-xs text-gray-500">¥{consumedVal.toFixed(2)} / ¥{budgetVal.toFixed(2)}</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full ${status.bgClass} rounded-full transition-all duration-500`} 
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <div className={`text-xs text-right font-medium ${status.colorClass}`}>{status.text}</div>
      </div>
    )
  }

  const overallRatio = totalBudget > 0 ? (totalConsumed / totalBudget) : 0
  let overallEvaluation = "整体情况良好，继续保持！"
  if (overallRatio > 0.8 && overallRatio <= 1) {
    overallEvaluation = `当前总支出已达 ${(overallRatio * 100).toFixed(0)}%，已接近警戒线，请注意控制接下来的消费！`
  } else if (overallRatio > 1) {
    overallEvaluation = `当前总支出已超支 ${((overallRatio - 1) * 100).toFixed(0)}%，请紧急审视各项开支！`
  } else if (totalBudget === 0) {
    overallEvaluation = "暂无有效的预算项目，请前往设置配置预算。"
  }

  return (
    <main className="min-h-screen bg-gray-50 pt-4 pb-24 px-4">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* 上模块：分析块 (Tabs) */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-gray-900 px-1">分析中心</h2>
          
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
                  {dailyBudgets.length > 0 
                    ? dailyBudgets.map(item => renderProgressItem(item)) 
                    : <div className="text-center text-sm text-gray-400 py-4">暂无数据</div>
                  }
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monthly_fixed">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每月固定预算扣款进度</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {monthlyFixedBudgets.length > 0 
                    ? monthlyFixedBudgets.map(item => renderProgressItem(item)) 
                    : <div className="text-center text-sm text-gray-400 py-4">暂无数据</div>
                  }
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="elastic">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每月弹性消费监控</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {monthlyElasticBudgets.length > 0
                    ? monthlyElasticBudgets.map(item => renderProgressItem(item))
                    : <div className="text-center text-sm text-gray-400 py-4">暂无数据</div>
                  }
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* 下模块：评价与记录 */}
        <section className="space-y-4">
          
          {/* 近 7 天趋势 */}
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
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`¥${Number(value).toFixed(2)}`, "支出"]}
                        labelStyle={{ color: '#374151', fontWeight: 500, marginBottom: '4px' }}
                      />
                      <Bar 
                        dataKey="amount" 
                        fill="#3b82f6" 
                        radius={[4, 4, 0, 0]} 
                      />
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

          {/* 状态评价 */}
          <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                <span>💡</span> 当前消费状态评价
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-indigo-700 leading-relaxed">
                {overallEvaluation}
              </p>
            </CardContent>
          </Card>

          {/* 长期记录 */}
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
                    const monthKey = `${record.year}-${String(record.month).padStart(2, '0')}`;
                    const budget = record.monthly_budget || 0;
                    const consumed = record.monthly_actual_consumed || 0;
                    const balance = record.monthly_balance || 0;
                    const cumulative = record.cumulative_balance || 0;

                    return (
                      <div key={record.id || monthKey} className="p-4 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-800">{monthKey}</span>
                          <span className="text-sm font-medium text-green-600">累计: ¥{cumulative.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>预算: ¥{budget.toFixed(2)} / 消费: ¥{consumed.toFixed(2)}</span>
                          <span className={balance >= 0 ? "text-green-500" : "text-red-500"}>
                            结余: {balance > 0 ? '+' : ''}{balance.toFixed(2)}
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
