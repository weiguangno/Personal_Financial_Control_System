"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { cacheStore, CACHE_KEY_HOME } from "@/lib/cacheStore"
import { useSync } from "@/components/SyncProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BudgetType } from "@/lib/types"

interface BudgetItemOption {
  id: string
  label: string
}

export default function AddTransactionPage() {
  const router = useRouter()
  const { setStatus: setSyncStatus } = useSync()

  const [budgetItems, setBudgetItems] = useState<BudgetItemOption[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [amount, setAmount] = useState<string>("")
  const [selectedItemStr, setSelectedItemStr] = useState<string>("") // format: "budgetType|id"
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState<string>("")

  useEffect(() => {
    async function fetchBudgets() {
      try {
        setLoadingItems(true)

        // Concurrent requests to fetch all budget lists
        const [dailyRes, monthlyFixedRes, monthlyElasticRes] = await Promise.all([
          supabase.from("daily_fixed_budgets").select("id, name"),
          supabase.from("monthly_fixed_budgets").select("id, name"),
          supabase.from("monthly_elastic_budgets").select("id, name"),
        ])

        const combinedItems: BudgetItemOption[] = []

        if (dailyRes.data) {
          combinedItems.push(...dailyRes.data.map(item => ({
            id: `daily_fixed|${item.id}`,
            label: `每日固定 | ${item.name}`,
          })))
        }

        if (monthlyFixedRes.data) {
          combinedItems.push(...monthlyFixedRes.data.map(item => ({
            id: `monthly_fixed|${item.id}`,
            label: `每月固定 | ${item.name}`,
          })))
        }

        if (monthlyElasticRes.data) {
          combinedItems.push(...monthlyElasticRes.data.map(item => ({
            id: `monthly_elastic|${item.id}`,
            label: `每月弹性 | ${item.name}`,
          })))
        }

        setBudgetItems(combinedItems)
      } catch (error) {
        console.error("Error fetching budget items:", error)
        alert("获取预算条目失败")
      } finally {
        setLoadingItems(false)
      }
    }

    fetchBudgets()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const numericAmount = Number(amount)
    if (numericAmount <= 0) {
      alert("金额必须大于 0")
      return
    }

    if (!selectedItemStr) {
      alert("请选择一个预算分类")
      return
    }

    if (!date) {
      alert("请填写日期")
      return
    }

    try {
      setSaving(true)
      const [budgetType, itemId] = selectedItemStr.split("|") as [BudgetType, string]

      const newId = crypto.randomUUID()

      // 乐观更新机制：先存入本地缓存并立刻返回首页
      const cachedData = cacheStore.getCache<any>(CACHE_KEY_HOME)
      if (cachedData && cachedData.transactions) {
        cachedData.transactions.unshift({
          id: newId,
          amount: -numericAmount,
          budget_type: budgetType,
          item_id: itemId,
          date: date,
          note: note || null,
          created_at: new Date().toISOString()
        })
        cacheStore.setCache(CACHE_KEY_HOME, cachedData)
      }

      setSyncStatus("syncing")
      // 2. 异步向 Supabase 插入数据，不阻塞 UI 线程
      supabase
        .from("transactions")
        .insert({
          id: newId,
          amount: -numericAmount,
          budget_type: budgetType,
          item_id: itemId,
          date: date,
          note: note || null,
        })
        .then(({ error }) => {
          if (error) {
            console.error("Error saving transaction asynchronously:", error)
            setSyncStatus("error")
          } else {
            setSyncStatus("synced")
          }
        })

      router.push("/")
    } catch (error: any) {
      console.error("Error saving transaction:", error)
      alert("保存失败: " + (error?.message || "未知错误"))
      setSaving(false)
      setSyncStatus("error")
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 h-14 flex items-center shrink-0 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="text-gray-600 text-sm font-medium flex items-center h-full active:opacity-70"
        >
          返回
        </button>
        <h1 className="flex-1 text-center font-bold text-gray-900 pr-8">记一笔</h1>
      </div>

      <div className="flex-1 p-4 max-w-md w-full mx-auto pb-6">
        <form onSubmit={handleSubmit} className="h-full flex flex-col">
          <Card className="border-0 shadow-sm flex-1 mb-6">
            <CardContent className="pt-6 space-y-6">

              <div className="space-y-2">
                <Label htmlFor="amount" className="text-gray-700">金额</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">¥</span>
                  <Input
                    id="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-8 text-lg font-semibold h-12"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-gray-700">分类</Label>
                <Select value={selectedItemStr} onValueChange={(val) => setSelectedItemStr(val || "")} required>
                  <SelectTrigger className="h-12" id="category">
                    <SelectValue placeholder={loadingItems ? "加载中..." : "选择预算分类"}>
                      {selectedItemStr ? budgetItems.find(item => item.id === selectedItemStr)?.label : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {!loadingItems && budgetItems.length === 0 && (
                      <div className="p-2 text-sm text-gray-500 text-center">暂无预算条目</div>
                    )}
                    {budgetItems.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date" className="text-gray-700">日期</Label>
                <Input
                  id="date"
                  type="date"
                  className="h-12"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note" className="text-gray-700">备注</Label>
                <Input
                  id="note"
                  type="text"
                  placeholder="说点什么..."
                  className="h-12"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full h-12 text-base font-bold shadow-md mt-auto shrink-0"
            disabled={saving || loadingItems}
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </form>
      </div>
    </main>
  )
}