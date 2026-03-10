import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SettingsPage() {
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
                <Input id="monthly-budget" defaultValue="8000" type="number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="savings-target">每月储蓄目标 (¥)</Label>
                <Input id="savings-target" defaultValue="3000" type="number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial-balance">初始累计余额 (¥)</Label>
                <Input id="initial-balance" defaultValue="12000" type="number" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 预算条目管理 */}
        <section>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-50 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">预算条目管理</CardTitle>
              <Button variant="ghost" size="sm" className="text-primary text-xs h-6 px-2">添加</Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                <div className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm text-gray-800">早餐 (每日)</div>
                    <div className="text-xs text-gray-500 mt-0.5">基础预算: ¥6</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2">编辑</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-red-500 hover:text-red-600">删除</Button>
                  </div>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm text-gray-800">房租 (每月固定)</div>
                    <div className="text-xs text-gray-500 mt-0.5">基础预算: ¥2000</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2">编辑</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-red-500 hover:text-red-600">删除</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 开关设置区 (Core Toggles) */}
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
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium text-gray-800">弹性预算共享池</Label>
                  <p className="text-xs text-gray-500">每月弹性预算是否采用共享总池模式</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium text-gray-800">延迟健康类提醒</Label>
                  <p className="text-xs text-gray-500">健康类弹性消费是否适当延迟警告频率</p>
                </div>
                <Switch defaultChecked={false} />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium text-gray-800">每日动态滚动</Label>
                  <p className="text-xs text-gray-500">每日固定差额是否向后滚动积累</p>
                </div>
                <Switch defaultChecked />
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
