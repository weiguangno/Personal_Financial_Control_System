"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  
  // Global settings
  const [globalSettings, setGlobalSettings] = useState<any>(null)
  
  // Budget Lists
  const [dailyBudgets, setDailyBudgets] = useState<any[]>([])
  const [monthlyFixedBudgets, setMonthlyFixedBudgets] = useState<any[]>([])
  const [monthlyElasticBudgets, setMonthlyElasticBudgets] = useState<any[]>([])
  
  // System Toggles
  const [togglesId, setTogglesId] = useState<string | null>(null)
  const [toggles, setToggles] = useState<any>({})

  // Form State for new budget
  const [newType, setNewType] = useState<string>("daily_fixed")
  const [newName, setNewName] = useState<string>("")
  const [newAmount, setNewAmount] = useState<string>("")
  const [isAdding, setIsAdding] = useState(false)

  const fetchAllData = async () => {
    try {
      setLoading(true)
      const [
        globalRes, 
        dailyRes, 
        mFixedRes, 
        mElasticRes, 
        togglesRes
      ] = await Promise.all([
        supabase.from("global_settings").select("*").limit(1).single(),
        supabase.from("daily_fixed_budgets").select("*"),
        supabase.from("monthly_fixed_budgets").select("*"),
        supabase.from("monthly_elastic_budgets").select("*"),
        supabase.from("system_toggles").select("*").limit(1).single()
      ])

      if (globalRes.data) setGlobalSettings(globalRes.data)
      if (dailyRes.data) setDailyBudgets(dailyRes.data)
      if (mFixedRes.data) setMonthlyFixedBudgets(mFixedRes.data)
      if (mElasticRes.data) setMonthlyElasticBudgets(mElasticRes.data)
      
      if (togglesRes.data) {
        setTogglesId(togglesRes.data.id)
        setToggles(togglesRes.data.toggles || {})
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // Add new Budget Category
  const handleAddBudget = async () => {
    if (!newName.trim() || !newAmount || isNaN(Number(newAmount))) {
      alert("请输入有效的名称和金额")
      return
    }

    setIsAdding(true)
    const amountNum = Number(newAmount)

    try {
      let tableName = ""
      let insertData: any = { name: newName.trim() }

      if (newType === "daily_fixed") {
        tableName = "daily_fixed_budgets"
        insertData.base_daily_budget = amountNum
      } else if (newType === "monthly_fixed") {
        tableName = "monthly_fixed_budgets"
        insertData.monthly_budget = amountNum
      } else if (newType === "monthly_elastic") {
        tableName = "monthly_elastic_budgets"
        insertData.monthly_budget = amountNum
      }

      const { error } = await supabase.from(tableName).insert(insertData)
      if (error) throw error
      
      // Reset form & Refresh list
      setNewName("")
      setNewAmount("")
      await fetchAllData()
    } catch (error: any) {
      alert("添加失败: " + (error?.message || "未知错误"))
    } finally {
      setIsAdding(false)
    }
  }

  // Delete Budget Category
  const handleDeleteBudget = async (id: string, type: string) => {
    if (!confirm("确定要删除该分类吗？")) return

    try {
      let tableName = ""
      if (type === "daily_fixed") tableName = "daily_fixed_budgets"
      else if (type === "monthly_fixed") tableName = "monthly_fixed_budgets"
      else if (type === "monthly_elastic") tableName = "monthly_elastic_budgets"

      const { error } = await supabase.from(tableName).delete().eq("id", id)
      if (error) throw error
      
      await fetchAllData()
    } catch (error: any) {
      alert("删除失败: " + (error?.message || "未知错误"))
    }
  }

  // Update System Toggles
  const handleToggleChange = async (key: string, checked: boolean) => {
    if (!togglesId) return
    const updatedToggles = { ...toggles, [key]: checked }
    setToggles(updatedToggles) // Optimistic update

    try {
      const { error } = await supabase
        .from("system_toggles")
        .update({ toggles: updatedToggles })
        .eq("id", togglesId)
      
      if (error) {
        // Revert on error
        setToggles(toggles)
        throw error
      }
    } catch (error) {
      console.error("Error updating toggle:", error)
      alert("开关更新失败，请重试")
    }
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
        <h1 className="text-xl font-bold text-gray-900 px-1">设置中心</h1>

        {/* 总体设置 */}
        <section>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50">
              <CardTitle className="text-sm font-medium">总体设置</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="monthly-budget">月预算总额 (¥)</Label>
                <Input id="monthly-budget" readOnly value={globalSettings?.monthly_budget || 0} type="number" className="bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="savings-target">每月储蓄目标 (¥)</Label>
                <Input id="savings-target" readOnly value={globalSettings?.savings_target || 0} type="number" className="bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial-balance">初始累计余额 (¥)</Label>
                <Input id="initial-balance" readOnly value={globalSettings?.initial_cumulative_balance || 0} type="number" className="bg-gray-50 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 预算条目管理 */}
        <section>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                预算条目管理
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* 新增分类表单 */}
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col gap-3">
                <div className="text-xs font-semibold text-gray-600 mb-1">新增条目</div>
                <Select value={newType} onValueChange={(v) => setNewType(v || "daily_fixed")}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="分类类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily_fixed">每日固定</SelectItem>
                    <SelectItem value="monthly_fixed">每月固定</SelectItem>
                    <SelectItem value="monthly_elastic">每月弹性</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input 
                    placeholder="分类名称" 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)} 
                    className="flex-1 bg-white"
                  />
                  <Input 
                    placeholder="额度" 
                    type="number" 
                    value={newAmount} 
                    onChange={e => setNewAmount(e.target.value)} 
                    className="w-24 bg-white"
                  />
                  <Button onClick={handleAddBudget} disabled={isAdding} size="sm" className="shrink-0 px-4 h-9">
                    {isAdding ? "..." : "添加"}
                  </Button>
                </div>
              </div>

              {/* 现有条目列表 */}
              <div className="divide-y divide-gray-50">
                {dailyBudgets.map(item => (
                  <div key={item.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm text-gray-800">{item.name} <span className="text-xs text-gray-400 font-normal ml-1">(每日固定)</span></div>
                      <div className="text-xs text-gray-500 mt-0.5">基础预算: ¥{item.base_daily_budget}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteBudget(item.id, "daily_fixed")} className="h-7 text-xs px-2 text-red-500 hover:text-red-600 bg-red-50/50 hover:bg-red-50">删除</Button>
                  </div>
                ))}
                
                {monthlyFixedBudgets.map(item => (
                  <div key={item.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm text-gray-800">{item.name} <span className="text-xs text-gray-400 font-normal ml-1">(每月固定)</span></div>
                      <div className="text-xs text-gray-500 mt-0.5">基础预算: ¥{item.monthly_budget}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteBudget(item.id, "monthly_fixed")} className="h-7 text-xs px-2 text-red-500 hover:text-red-600 bg-red-50/50 hover:bg-red-50">删除</Button>
                  </div>
                ))}

                {monthlyElasticBudgets.map(item => (
                  <div key={item.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm text-gray-800">{item.name} <span className="text-xs text-gray-400 font-normal ml-1">(每月弹性)</span></div>
                      <div className="text-xs text-gray-500 mt-0.5">基础预算: ¥{item.monthly_budget}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteBudget(item.id, "monthly_elastic")} className="h-7 text-xs px-2 text-red-500 hover:text-red-600 bg-red-50/50 hover:bg-red-50">删除</Button>
                  </div>
                ))}

                {(dailyBudgets.length + monthlyFixedBudgets.length + monthlyElasticBudgets.length === 0) && (
                  <div className="p-8 text-center text-sm text-gray-400">目前没有任何预算分类</div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 开关设置区 */}
        <section>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50">
              <CardTitle className="text-sm font-medium">系统开关配置</CardTitle>
              <CardDescription className="text-xs">全局行为与阈值控制</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium text-gray-800">扣除储蓄目标</Label>
                  <p className="text-xs text-gray-500">月预算是否自动预先扣除储蓄目标</p>
                </div>
                <Switch 
                  checked={toggles?.deductSavingsFromBudget || false} 
                  onCheckedChange={(c) => handleToggleChange("deductSavingsFromBudget", c)} 
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium text-gray-800">每月固定进度提醒</Label>
                  <p className="text-xs text-gray-500">每月固定预算是否按时间进度提醒</p>
                </div>
                <Switch 
                  checked={toggles?.monthlyFixedTimeProgressAlert || false} 
                  onCheckedChange={(c) => handleToggleChange("monthlyFixedTimeProgressAlert", c)} 
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium text-gray-800">每日差额转弹性</Label>
                  <p className="text-xs text-gray-500">每日固定差额是否转入月弹性预算</p>
                </div>
                <Switch 
                  checked={toggles?.dailyDiffToElastic || false} 
                  onCheckedChange={(c) => handleToggleChange("dailyDiffToElastic", c)} 
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 数据管理 */}
        <section>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50">
              <CardTitle className="text-sm font-medium">数据管理</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <Button variant="outline" className="w-full justify-center text-gray-700 bg-white">
                📥 导入数据 (JSON)
              </Button>
              <Button variant="outline" className="w-full justify-center text-gray-700 bg-white">
                📤 导出数据 (JSON)
              </Button>
              <Button variant="ghost" className="w-full justify-center text-red-500 hover:bg-red-50 hover:text-red-600">
                ⚠️ 清空所有数据
              </Button>
            </CardContent>
          </Card>
        </section>

      </div>
    </main>
  )
}
