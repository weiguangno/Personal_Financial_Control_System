"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
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

interface BudgetItem {
  id: string
  name: string
  budget_type: BudgetType
}

export default function AddTransactionPage() {
  const router = useRouter()

  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
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

        const combinedItems: BudgetItem[] = []

        if (dailyRes.data) {
          combinedItems.push(...dailyRes.data.map(item => ({
            id: item.id,
            name: `${item.name} (每日固定)`,
            budget_type: "daily_fixed" as BudgetType
          })))
        }

        if (monthlyFixedRes.data) {
          combinedItems.push(...monthlyFixedRes.data.map(item => ({
            id: item.id,
            name: `${item.name} (每月固定)`,
            budget_type: "monthly_fixed" as BudgetType
          })))
        }

        if (monthlyElasticRes.data) {
          combinedItems.push(...monthlyElasticRes.data.map(item => ({
            id: item.id,
            name: `${item.name} (每月弹性)`,
            budget_type: "monthly_elastic" as BudgetType
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

    if (!amount || isNaN(Number(amount))) {
      alert("请输入有效的金额")
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
      const numericAmount = Number(amount)
      const [budgetType, itemId] = selectedItemStr.split("|") as [BudgetType, string]

      // 1. Insert Transaction
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          amount: numericAmount,
          budget_type: budgetType,
          item_id: itemId,
          date: date,
          note: note || null,
        })

      if (txError) throw txError

      // 2. Determine correct table name
      let tableName = ""
      if (budgetType === "daily_fixed") {
        tableName = "daily_fixed_budgets"
      } else if (budgetType === "monthly_fixed") {
        tableName = "monthly_fixed_budgets"
      } else if (budgetType === "monthly_elastic") {
        tableName = "monthly_elastic_budgets"
      }

      if (tableName) {
        // 3. Fetch current consumed/remaining
        const { data: budgetData, error: fetchError } = await supabase
          .from(tableName)
          .select('consumed, remaining')
          .eq('id', itemId)
          .single()

        if (fetchError) {
          console.error("Fetch budget error:", fetchError)
          throw fetchError
        }

        // 4. Calculate new values
        // Note: amount is already negative from user input, but PRD logic typically means we add absolute if input was absolute. Let's assume input amount is positive for expense
        // The prompt says: "new_consumed = 查出的 consumed + 本次记账 amount" (assuming amount is positive if expense, negative if income)
        const currentConsumed = Number(budgetData?.consumed || 0)
        const currentRemaining = Number(budgetData?.remaining || 0)
        
        // Let's use numericAmount directly as requested:
        const newConsumed = currentConsumed + numericAmount
        const newRemaining = currentRemaining - numericAmount

        // 5. Update remote data
        const { error: updateError } = await supabase
          .from(tableName)
          .update({ 
            consumed: newConsumed, 
            remaining: newRemaining 
          })
          .eq('id', itemId)

        if (updateError) {
          console.error("Update budget error:", updateError)
          throw updateError
        }
      }

      router.push("/")
      router.refresh()
    } catch (error: any) {
      console.error("Error saving transaction:", error)
      alert("保存失败: " + (error?.message || "未知错误"))
    } finally {
      setSaving(false)
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
                    <SelectValue placeholder={loadingItems ? "加载中..." : "选择预算分类"} />
                  </SelectTrigger>
                  <SelectContent>
                    {!loadingItems && budgetItems.length === 0 && (
                      <div className="p-2 text-sm text-gray-500 text-center">暂无预算条目</div>
                    )}
                    {budgetItems.map(item => (
                      <SelectItem key={`${item.budget_type}|${item.id}`} value={`${item.budget_type}|${item.id}`}>
                        {item.name}
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
