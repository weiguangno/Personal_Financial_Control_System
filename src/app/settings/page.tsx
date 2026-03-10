"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { SystemToggles } from "@/lib/types"
import { executeDailyRollover } from "@/lib/rollover"

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
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    try {
      let tableName = ""
      let insertData: any = { name: newName.trim() }

      if (newType === "daily_fixed") {
        tableName = "daily_fixed_budgets"
        insertData.base_daily_budget = amountNum
        insertData.today_dynamic_budget = amountNum
        insertData.monthly_budget = amountNum * daysInMonth
        insertData.remaining = amountNum * daysInMonth
      } else if (newType === "monthly_fixed") {
        tableName = "monthly_fixed_budgets"
        insertData.monthly_budget = amountNum
        insertData.remaining = amountNum
      } else if (newType === "monthly_elastic") {
        tableName = "monthly_elastic_budgets"
        insertData.monthly_budget = amountNum
        insertData.remaining = amountNum
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

  // Handle Daily Settlement
  const handleDailySettlement = async () => {
    if (!confirm("确定要模拟过夜，执行每日预算结算吗？此操作将清零今日的分类消费记录并重算明日额度！")) return;

    try {
      setLoading(true);
      
      const { data: togglesData } = await supabase.from('system_toggles').select('toggles').limit(1).single();
      const currentToggles = togglesData?.toggles || {};
      
      const { data: dailyItems } = await supabase.from('daily_fixed_budgets').select('*');
      if (dailyItems) {
        for (const item of dailyItems) {
          const todayDynamic = Number(item.today_dynamic_budget || item.base_daily_budget || 0);
          const consumed = Number(item.consumed || 0);
          const baseDaily = Number(item.base_daily_budget || 0);
          
          let diff = todayDynamic - consumed;
          
          if (!currentToggles.dailyFixedAllowNegativeRoll && diff < 0) {
            diff = 0;
          }
          
          let newTodayDynamic = baseDaily;
          if (currentToggles.dailyFixedDynamicRoll) {
            newTodayDynamic = baseDaily + diff;
          }
          
          await supabase.from('daily_fixed_budgets')
            .update({
              consumed: 0,
              today_dynamic_budget: newTodayDynamic
            })
            .eq('id', item.id);
        }
      }
      
      alert("结算完成，已进入新的一天");
      window.location.reload();
    } catch (error: any) {
      alert("结算失败: " + (error?.message || "未知错误"));
      setLoading(false);
    }
  }

  const handleClearData = async () => {
    if (window.confirm('警告：此操作将清空所有记账流水（不删预算分类），确定吗？')) {
      try {
        setLoading(true);
        const { error } = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        alert('清空成功');
        window.location.reload();
      } catch (error: any) {
        alert("清空失败: " + (error?.message || "未知错误"));
        setLoading(false);
      }
    }
  }

  const handleExportData = async () => {
    try {
      const { data, error } = await supabase.from('transactions').select('*');
      if (error) throw error;
      
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cost-pro-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert("导出失败: " + (error?.message || "未知错误"));
    }
  }

  const handleImportData = () => {
    alert('导入功能正在开发中，请先使用导出功能备份您的数据。');
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
                    <SelectValue>
                      {newType === 'daily_fixed' ? '每日固定' : newType === 'monthly_fixed' ? '每月固定' : '每月弹性'}
                    </SelectValue>
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
              <CardDescription className="text-xs">共 21 项全局行为与阈值控制</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 pb-2 px-0 divide-y divide-gray-50">
              
              {/* 1. 总体设置相关 */}
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold text-primary mb-2">总体设置相关</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">扣除储蓄目标</Label>
                    <p className="text-xs text-gray-500">月预算是否自动预先扣除储蓄目标</p>
                  </div>
                  <Switch checked={toggles?.deductSavingsFromBudget || false} onCheckedChange={(c) => handleToggleChange("deductSavingsFromBudget", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">储蓄参与月度判断</Label>
                    <p className="text-xs text-gray-500">储蓄目标是否参与月度预算健康判断</p>
                  </div>
                  <Switch checked={toggles?.includeSavingsInMonthlyCheck || false} onCheckedChange={(c) => handleToggleChange("includeSavingsInMonthlyCheck", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">启用自定义严格阈值</Label>
                    <p className="text-xs text-gray-500">严格模式阈值是否启用自定义</p>
                  </div>
                  <Switch checked={toggles?.customStrictThreshold || false} onCheckedChange={(c) => handleToggleChange("customStrictThreshold", c)} />
                </div>
              </div>

              {/* 2. 预算结构相关 */}
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold text-primary mb-2">预算结构相关</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">月弹性预算采用共享池</Label>
                    <p className="text-xs text-gray-500">月弹性预算是否采用总额度共享池</p>
                  </div>
                  <Switch checked={toggles?.elasticBudgetSharedPool || false} onCheckedChange={(c) => handleToggleChange("elasticBudgetSharedPool", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">每月固定预算时间提醒</Label>
                    <p className="text-xs text-gray-500">每月固定预算是否按时间进度提醒</p>
                  </div>
                  <Switch checked={toggles?.monthlyFixedTimeProgressAlert || false} onCheckedChange={(c) => handleToggleChange("monthlyFixedTimeProgressAlert", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">每日固定差额累加到条目</Label>
                    <p className="text-xs text-gray-500">每日固定预算差额是否允许累计到条目级</p>
                  </div>
                  <Switch checked={toggles?.dailyFixedDiffItemLevel || false} onCheckedChange={(c) => handleToggleChange("dailyFixedDiffItemLevel", c)} />
                </div>
              </div>

              {/* 3. 每日固定预算规则 */}
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold text-primary mb-2">每日固定预算规则</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">每日固定预算动态滚动</Label>
                    <p className="text-xs text-gray-500">每日固定预算是否动态滚动叠加</p>
                  </div>
                  <Switch checked={toggles?.dailyFixedDynamicRoll || false} onCheckedChange={(c) => handleToggleChange("dailyFixedDynamicRoll", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">差额仅结转昨日</Label>
                    <p className="text-xs text-gray-500">每日固定差额是否只结转前一天</p>
                  </div>
                  <Switch checked={toggles?.dailyFixedRollOnlyYesterday || false} onCheckedChange={(c) => handleToggleChange("dailyFixedRollOnlyYesterday", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">允许负结转</Label>
                    <p className="text-xs text-gray-500">每日固定预算是否允许负额度结转</p>
                  </div>
                  <Switch checked={toggles?.dailyFixedAllowNegativeRoll || false} onCheckedChange={(c) => handleToggleChange("dailyFixedAllowNegativeRoll", c)} />
                </div>
              </div>

              {/* 4. 每月固定预算规则 */}
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold text-primary mb-2">每月固定预算规则</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">显示时间进度分析</Label>
                    <p className="text-xs text-gray-500">是否在分析页显示时间进度分析对比</p>
                  </div>
                  <Switch checked={toggles?.monthlyFixedTimeProgressView || false} onCheckedChange={(c) => handleToggleChange("monthlyFixedTimeProgressView", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">允许临时追加预算</Label>
                    <p className="text-xs text-gray-500">每月固定预算是否允许超额时临时追加</p>
                  </div>
                  <Switch checked={toggles?.monthlyFixedAllowTempAdd || false} onCheckedChange={(c) => handleToggleChange("monthlyFixedAllowTempAdd", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">固定分析纳入首页提醒</Label>
                    <p className="text-xs text-gray-500">每月固定预警是否在首页置顶显示</p>
                  </div>
                  <Switch checked={toggles?.monthlyFixedAlertInHome || false} onCheckedChange={(c) => handleToggleChange("monthlyFixedAlertInHome", c)} />
                </div>
              </div>

              {/* 5. 每月弹性预算规则 */}
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold text-primary mb-2">每月弹性预算规则</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">弹性预算共享</Label>
                    <p className="text-xs text-gray-500">各项弹性预算额度是否共享计算</p>
                  </div>
                  <Switch checked={toggles?.elasticBudgetShared || false} onCheckedChange={(c) => handleToggleChange("elasticBudgetShared", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">每日差额转入月弹性</Label>
                    <p className="text-xs text-gray-500">每日固定结余强制转入当月弹性总池</p>
                  </div>
                  <Switch checked={toggles?.dailyDiffToElastic || false} onCheckedChange={(c) => handleToggleChange("dailyDiffToElastic", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">健康类消费延迟提醒</Label>
                    <p className="text-xs text-gray-500">医疗/健康等必要弹性消费降低预警权重</p>
                  </div>
                  <Switch checked={toggles?.delayHealthElasticAlert || false} onCheckedChange={(c) => handleToggleChange("delayHealthElasticAlert", c)} />
                </div>
              </div>

              {/* 6. 判断与分析开关 */}
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold text-primary mb-2">判断与分析开关</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">今日判断纳入弹性消费</Label>
                    <p className="text-xs text-gray-500">今日状态评价是否结合当日弹性支出</p>
                  </div>
                  <Switch checked={toggles?.includeElasticInTodayCheck || false} onCheckedChange={(c) => handleToggleChange("includeElasticInTodayCheck", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">月度判断结合日期进度</Label>
                    <p className="text-xs text-gray-500">分析总消耗时是否对比当前是本月几号</p>
                  </div>
                  <Switch checked={toggles?.monthlyCheckIncludeDate || false} onCheckedChange={(c) => handleToggleChange("monthlyCheckIncludeDate", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">月度判断结合累计余额</Label>
                    <p className="text-xs text-gray-500">当月超支时是否考虑用历史累计余额抵消报错</p>
                  </div>
                  <Switch checked={toggles?.monthlyCheckIncludeCumulative || false} onCheckedChange={(c) => handleToggleChange("monthlyCheckIncludeCumulative", c)} />
                </div>
              </div>

              {/* 7. 建议输出开关 */}
              <div className="p-4 space-y-4 border-b border-gray-50 rounded-b-xl">
                <h3 className="text-xs font-semibold text-primary mb-2">输出与建议选项</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">优先保护健康消费</Label>
                    <p className="text-xs text-gray-500">节省建议时不再建议削减健康类预算</p>
                  </div>
                  <Switch checked={toggles?.protectHealthCategory || false} onCheckedChange={(c) => handleToggleChange("protectHealthCategory", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">优先压缩社交消费</Label>
                    <p className="text-xs text-gray-500">超支建议时重点强调削减社交/娱乐预算</p>
                  </div>
                  <Switch checked={toggles?.compressSocialCategory || false} onCheckedChange={(c) => handleToggleChange("compressSocialCategory", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">显示鼓励性反馈</Label>
                    <p className="text-xs text-gray-500">达标时在各类卡片显示友好的夸奖文案</p>
                  </div>
                  <Switch checked={toggles?.showEncouragingFeedback || false} onCheckedChange={(c) => handleToggleChange("showEncouragingFeedback", c)} />
                </div>
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
              <Button variant="destructive" onClick={handleDailySettlement} className="w-full justify-center bg-red-600 hover:bg-red-700 text-white font-semibold">
                ⚠️ 手动执行每日结算 (模拟过夜)
              </Button>
              <Button variant="outline" onClick={handleImportData} className="w-full justify-center text-gray-700 bg-white">
                📥 导入数据 (JSON)
              </Button>
              <Button variant="outline" onClick={handleExportData} className="w-full justify-center text-gray-700 bg-white">
                📤 导出数据 (JSON)
              </Button>
              <Button variant="ghost" onClick={handleClearData} className="w-full justify-center text-red-500 hover:bg-red-50 hover:text-red-600">
                ⚠️ 清空所有数据
              </Button>
            </CardContent>
          </Card>
        </section>

      </div>
    </main>
  )
}
