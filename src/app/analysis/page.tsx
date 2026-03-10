import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AnalysisPage() {
  // Mock Data for Tabs
  const dailyFixedStats = [
    { name: "早餐", budget: 6, consumed: 6, percent: 100, status: "已达标" },
    { name: "午餐", budget: 20, consumed: 15, percent: 75, status: "正常" },
    { name: "晚餐", budget: 18, consumed: 0, percent: 0, status: "未使用" },
  ]

  const monthlyFixedStats = [
    { name: "房租", budget: 2000, consumed: 2000, percent: 100, status: "已扣除" },
    { name: "话费", budget: 100, consumed: 50, percent: 50, status: "正常进度" },
  ]

  const monthlyElasticStats = [
    { name: "餐饮", budget: 1000, consumed: 800, percent: 80, status: "接近上限" },
    { name: "交通", budget: 300, consumed: 120, percent: 40, status: "健康" },
  ]

  // Mock Data for Balance Records
  const balanceRecords = [
    { month: "2026-02", budget: 8000, consumed: 7500, balance: 500, cumulative: 12000 },
    { month: "2026-01", budget: 8000, consumed: 7800, balance: 200, cumulative: 11500 },
    { month: "2025-12", budget: 8000, consumed: 8200, balance: -200, cumulative: 11300 },
  ]

  const renderProgressItem = (item: any, colorClass: string) => (
    <div key={item.name} className="space-y-2 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
      <div className="flex justify-between items-end">
        <span className="text-sm font-medium text-gray-700">{item.name}</span>
        <span className="text-xs text-gray-500">¥{item.consumed} / ¥{item.budget}</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colorClass} rounded-full transition-all duration-500`} 
          style={{ width: `${Math.min(item.percent, 100)}%` }}
        />
      </div>
      <div className="text-xs text-gray-400 text-right">{item.status}</div>
    </div>
  )

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
                  {dailyFixedStats.map(item => renderProgressItem(item, "bg-green-500"))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monthly_fixed">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每月固定预算扣款进度</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {monthlyFixedStats.map(item => renderProgressItem(item, "bg-blue-500"))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="elastic">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <CardTitle className="text-sm font-medium">每月弹性消费监控</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {monthlyElasticStats.map(item => renderProgressItem(item, "bg-amber-500"))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* 下模块：评价与记录 */}
        <section className="space-y-4">
          {/* 状态评价 */}
          <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                <span>💡</span> 当前消费状态评价
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-indigo-700 leading-relaxed">
                本月弹性预算已消耗 80%，特别是在“餐饮”分类上接近警戒线。建议在接下来的日子里适当控制弹性支出，确保能达成月度储蓄目标。每日固定预算执行堪称完美，继续保持！
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
                {balanceRecords.map((record) => (
                  <div key={record.month} className="p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800">{record.month}</span>
                      <span className="text-sm font-medium text-green-600">累计: ¥{record.cumulative}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>预算: ¥{record.budget} / 消费: ¥{record.consumed}</span>
                      <span className={record.balance >= 0 ? "text-green-500" : "text-red-500"}>
                        结余: {record.balance > 0 ? '+' : ''}{record.balance}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </main>
  )
}
