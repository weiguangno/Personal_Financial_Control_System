import re

file_path = 'src/app/settings/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace state definition
content = content.replace('const [toggles, setToggles] = useState<any>({})', 'const [toggles, setToggles] = useState<Record<string, boolean>>({})')

# Replace handleToggleChange
old_handler = """  // Update System Toggles
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
  }"""

new_handler = """  // Update System Toggles
  const handleToggleChange = async (key: string, checked: boolean) => {
    // 1. 立即更新本地 UI，让开关顺滑拨动
    const newToggles = { ...toggles, [key]: checked };
    setToggles(newToggles);

    // 2. 异步更新到数据库
    const { error } = await supabase
      .from('system_toggles')
      .update({ toggles: newToggles })
      .eq('id', togglesId || 1);
      
    if (error) {
      console.error('保存失败', error);
      //发生错误时可选回滚 UI
      setToggles(toggles);
    }
  }"""

content = content.replace(old_handler, new_handler)

# Replace Switch props
# checked={toggles?.deductSavingsFromBudget || false} onCheckedChange={(c) => handleToggleChange("deductSavingsFromBudget", c)}
content = re.sub(
    r'checked=\{toggles\?\.([a-zA-Z0-9_]+) \|\| false\} onCheckedChange=\{\(c\) => handleToggleChange\("(\1)", c\)\}',
    r'checked={!!toggles.\1} onCheckedChange={async (c) => handleToggleChange("\1", c)}',
    content
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
