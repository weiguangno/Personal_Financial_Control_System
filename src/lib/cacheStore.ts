export const CACHE_KEY_HOME = "cost_pro_home_data"
export const CACHE_KEY_ANALYSIS = "cost_pro_analysis_data"
export const CACHE_KEY_SETTINGS = "cost_pro_settings_data"

export const cacheStore = {
  getCache<T>(key: string): T | null {
    if (typeof window === "undefined") return null
    try {
      const data = localStorage.getItem(key)
      if (!data) return null
      return JSON.parse(data) as T
    } catch (e) {
      console.warn("Error reading cache for", key, e)
      return null
    }
  },

  setCache<T>(key: string, data: T): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch (e) {
      console.warn("Error setting cache for", key, e)
    }
  },

  clearCache(key: string): void {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.warn("Error clearing cache for", key, e)
    }
  },
  
  clearAllCache(): void {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(CACHE_KEY_HOME)
      localStorage.removeItem(CACHE_KEY_ANALYSIS)
      localStorage.removeItem(CACHE_KEY_SETTINGS)
    } catch (e) {
      console.warn("Error clearing all caches", e)
    }
  }
}
