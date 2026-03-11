"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { cacheStore, CACHE_KEY_SETTINGS } from "@/lib/cacheStore"
import { useSync } from "@/components/SyncProvider"

export default function SettingsPage() {
  const { setSyncStatus } = useSync()
  const [loading, setLoading] = useState(true)

  const [globalSettings, setGlobalSettings] = useState({
    id: null,
    monthly_budget: 0,
    saving_goal: 0
  })
  const [savingGlobal, setSavingGlobal] = useState(false)

  // Budget Lists
  const [dailyBudgets, setDailyBudgets] = useState<any[]>([])
  const [monthlyFixedBudgets, setMonthlyFixedBudgets] = useState<any[]>([])
  const [monthlyElasticBudgets, setMonthlyElasticBudgets] = useState<any[]>([])

  // System Toggles
  const [togglesId, setTogglesId] = useState<string | null>(null)
  const [toggles, setToggles] = useState<Record<string, boolean>>({})

  // Form State for new budget
  const [newType, setNewType] = useState<string>("daily_fixed")
  const [newName, setNewName] = useState<string>("")
  const [newAmount, setNewAmount] = useState<string>("")
  const [isAdding, setIsAdding] = useState(false)

  const processAndSetSettingsData = (data: any) => {
    if (data.global) {
      setGlobalSettings({
        id: data.global.id,
        monthly_budget: data.global.monthly_budget || 0,
        saving_goal: data.global.saving_goal || 0
      })
    }
    if (data.dailyData) setDailyBudgets(data.dailyData)
    if (data.mFixedData) setMonthlyFixedBudgets(data.mFixedData)
    if (data.mElasticData) setMonthlyElasticBudgets(data.mElasticData)

    if (data.togglesRow) {
      setTogglesId(data.togglesRow.id)
      setToggles(data.togglesRow.toggles || {})
    }
  }

  const fetchAllData = async () => {
    try {
      const cachedData = cacheStore.getCache<any>(CACHE_KEY_SETTINGS)
      if (cachedData) {
        processAndSetSettingsData(cachedData)
        setLoading(false)
      } else {
        setLoading(true)
      }

      const [
        globalRes,
        dailyRes,
        mFixedRes,
        mElasticRes,
        togglesRes
      ] = await Promise.all([
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
        supabase.from("daily_fixed_budgets").select("*"),
        supabase.from("monthly_fixed_budgets").select("*"),
        supabase.from("monthly_elastic_budgets").select("*"),
        supabase.from("system_toggles").select("*").limit(1).maybeSingle()
      ])

      const freshData = {
        global: globalRes.data || null,
        dailyData: dailyRes.data || [],
        mFixedData: mFixedRes.data || [],
        mElasticData: mElasticRes.data || [],
        togglesRow: togglesRes.data || null
      }

      cacheStore.setCache(CACHE_KEY_SETTINGS, freshData)
      processAndSetSettingsData(freshData)
      setSyncStatus("synced")

    } catch (error) {
      console.error("Error fetching settings:", error)
      setSyncStatus("error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
    const handleSync = () => fetchAllData()
    window.addEventListener("force-sync-refresh", handleSync)
    return () => window.removeEventListener("force-sync-refresh", handleSync)
  }, [])

  // Add new Budget Category
  const handleAddBudget = async () => {
    if (!newName.trim() || !newAmount || isNaN(Number(newAmount))) {
      alert("请输入有效的名称和金额")
      return
    }

    const amountNum = Number(newAmount)
    const newId = crypto.randomUUID()

    let tableName = ""
    let insertData: any = { id: newId, name: newName.trim() }

    if (newType === "daily_fixed") {
      tableName = "daily_fixed_budgets"
      insertData.daily_budget = amountNum
      setDailyBudgets(prev => [...prev, insertData])
    } else if (newType === "monthly_fixed") {
      tableName = "monthly_fixed_budgets"
      insertData.monthly_budget = amountNum
      setMonthlyFixedBudgets(prev => [...prev, insertData])
    } else if (newType === "monthly_elastic") {
      tableName = "monthly_elastic_budgets"
      insertData.monthly_budget = amountNum
      setMonthlyElasticBudgets(prev => [...prev, insertData])
    }

    setNewName("")
    setNewAmount("")

    const cachedData = cacheStore.getCache<any>(CACHE_KEY_SETTINGS) || {}
    if (newType === "daily_fixed") cachedData.dailyData = [...(cachedData.dailyData || []), insertData]
    if (newType === "monthly_fixed") cachedData.mFixedData = [...(cachedData.mFixedData || []), insertData]
    if (newType === "monthly_elastic") cachedData.mElasticData = [...(cachedData.mElasticData || []), insertData]
    cacheStore.setCache(CACHE_KEY_SETTINGS, cachedData)

    setSyncStatus("syncing")
    supabase.from(tableName).insert(insertData).then(({ error }) => {
      if (error) {
        console.error("Error adding budget", error)
        setSyncStatus("error")
      } else {
        setSyncStatus("synced")
      }
    })
  }

  // Delete Budget Category
  const handleDeleteBudget = async (id: string, type: string) => {
    if (!confirm("确定要删除该分类吗？")) return

    let tableName = ""
    const cachedData = cacheStore.getCache<any>(CACHE_KEY_SETTINGS) || {}

    if (type === "daily_fixed") {
      tableName = "daily_fixed_budgets"
      setDailyBudgets(prev => prev.filter(item => item.id !== id))
      if (cachedData.dailyData) cachedData.dailyData = cachedData.dailyData.filter((i:any) => i.id !== id)
    } else if (type === "monthly_fixed") {
      tableName = "monthly_fixed_budgets"
      setMonthlyFixedBudgets(prev => prev.filter(item => item.id !== id))
      if (cachedData.mFixedData) cachedData.mFixedData = cachedData.mFixedData.filter((i:any) => i.id !== id)
    } else if (type === "monthly_elastic") {
      tableName = "monthly_elastic_budgets"
      setMonthlyElasticBudgets(prev => prev.filter(item => item.id !== id))
      if (cachedData.mElasticData) cachedData.mElasticData = cachedData.mElasticData.filter((i:any) => i.id !== id)
    }
    cacheStore.setCache(CACHE_KEY_SETTINGS, cachedData)

    setSyncStatus("syncing")
    supabase.from(tableName).delete().eq("id", id).then(({error}) => {
      if (error) {
        console.error("Error deleting budget", error)
        setSyncStatus("error")
      } else {
        setSyncStatus("synced")
      }
    })
  }

  // Update System Toggles
  const handleToggleChange = async (key: string, checked: boolean) => {
    const newToggles = { ...toggles, [key]: checked };
    setToggles(newToggles);

    const cachedData = cacheStore.getCache<any>(CACHE_KEY_SETTINGS) || {}
    if (cachedData.togglesRow) {
      cachedData.togglesRow.toggles = newToggles
    } else {
      cachedData.togglesRow = { id: togglesId || 1, toggles: newToggles }
    }
    cacheStore.setCache(CACHE_KEY_SETTINGS, cachedData)

    setSyncStatus("syncing")
    supabase
      .from('system_toggles')
      .update({ toggles: newToggles })
      .eq('id', togglesId || 1)
      .then(({ error }) => {
        if (error) {
          console.error('保存失败', error)
          setSyncStatus("error")
        } else {
          setSyncStatus("synced")
        }
      })
  }

  // Save Global Settings
  const handleSaveGlobalSettings = async () => {
    setSavingGlobal(true);
    const payload = {
      monthly_budget: Number(globalSettings.monthly_budget),
      saving_goal: Number(globalSettings.saving_goal)
    };

    const cachedData = cacheStore.getCache<any>(CACHE_KEY_SETTINGS) || {}
    cachedData.global = { ...globalSettings, ...payload }
    cacheStore.setCache(CACHE_KEY_SETTINGS, cachedData)

    let query = supabase.from("global_settings").update(payload);

    if (globalSettings.id) {
      query = query.eq("id", globalSettings.id);
    } else {
      query = query.neq("id", 0);
    }

    setSyncStatus("syncing")
    query.then(({error}) => {
      if (error) {
        console.error("Error saving global settings:", error)
        setSyncStatus("error")
      } else {
        setSyncStatus("synced")
      }
    })

    setSavingGlobal(false);
    alert("全局设置保存成功");
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const confirmImport = window.confirm("导入操作将把数据追加到现有流水中。为了避免数据重复，建议导入前先清空现有数据。是否继续导入？");
      if (!confirmImport) return;

      try {
        setLoading(true);
        const text = await file.text();
        let data = JSON.parse(text);

        if (!Array.isArray(data)) {
          throw new Error("文件格式错误，应为 JSON 数组");
        }

        // 剔除原来的 id，让 supabase 自己生成新的，防止主键冲突
        data = data.map((item: any) => {
          const { id, ...rest } = item;
          return rest;
        });

        const { error } = await supabase.from('transactions').insert(data);
        if (error) throw error;

        alert("导入成功");
        window.location.reload();
      } catch (error: any) {
        alert("导入失败: " + (error?.message || "未知错误"));
        setLoading(false);
      }
    };
    input.click();
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
                <Input
                  id="monthly-budget"
                  value={globalSettings.monthly_budget}
                  onChange={e => setGlobalSettings({ ...globalSettings, monthly_budget: Number(e.target.value) || 0 })}
                  type="number"
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saving-goal">每月储蓄目标 (¥)</Label>
                <Input
                  id="saving-goal"
                  value={globalSettings.saving_goal}
                  onChange={e => setGlobalSettings({ ...globalSettings, saving_goal: Number(e.target.value) || 0 })}
                  type="number"
                  className="bg-white"
                />
              </div>
              <Button onClick={handleSaveGlobalSettings} disabled={savingGlobal} className="w-full mt-2">
                {savingGlobal ? "保存中..." : "保存总体设置"}
              </Button>
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
                      <div className="text-xs text-gray-500 mt-0.5">基础预算: ¥{item.daily_budget}</div>
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
              <CardDescription className="text-xs">共 4 项核心预算与规则控制</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 pb-2 px-0 divide-y divide-gray-50">

              {/* 核心开关配置 */}
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">每日预算结转</Label>
                    <p className="text-xs text-gray-500">每日未用完金额是否结转</p>
                  </div>
                  <Switch checked={!!toggles.rollover_daily} onCheckedChange={async (c) => handleToggleChange("rollover_daily", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">差额转弹性池</Label>
                    <p className="text-xs text-gray-500">固定预算差额是否进入每月弹性池</p>
                  </div>
                  <Switch checked={!!toggles.overflow_to_flexible} onCheckedChange={async (c) => handleToggleChange("overflow_to_flexible", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">启用严格模式</Label>
                    <p className="text-xs text-gray-500">花费过度时启用更严格的视觉提醒</p>
                  </div>
                  <Switch checked={!!toggles.strict_mode} onCheckedChange={async (c) => handleToggleChange("strict_mode", c)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium text-gray-800">自动扣除储蓄</Label>
                    <p className="text-xs text-gray-500">计算可用月预算时，是否自动减去每月的储蓄目标</p>
                  </div>
                  <Switch checked={!!toggles.deduct_saving_goal} onCheckedChange={async (c) => handleToggleChange("deduct_saving_goal", c)} />
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

              <Button variant="outline" onClick={handleImportData} className="w-full justify-center text-gray-700 bg-white">
                📥 导入数据 (JSON)
              </Button>
              <Button variant="outline" onClick={handleExportData} className="w-full justify-center text-gray-700 bg-white">
                📤 导出数据 (JSON)
              </Button>
              <Button variant="ghost" onClick={handleClearData} className="w-full justify-center text-red-500 hover:bg-red-50 hover:text-red-600">
                ⚠️ 清空所有记账数据
              </Button>
            </CardContent>
          </Card>
        </section>

      </div>
    </main>
  )
}