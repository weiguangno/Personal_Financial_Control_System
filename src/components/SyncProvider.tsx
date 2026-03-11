"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

export type SyncStatus = "synced" | "syncing" | "error" | "offline"

interface SyncContextType {
  syncStatus: SyncStatus
  setSyncStatus: (status: SyncStatus) => void
}

const SyncContext = createContext<SyncContextType | undefined>(undefined)

export function useSync() {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider")
  }
  return context
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced")

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus("syncing")
      // Dispatch custom event to trigger data fetching in active pages
      window.dispatchEvent(new Event("force-sync-refresh"))
    }

    const handleOffline = () => {
      setSyncStatus("offline")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Initial check
    if (!navigator.onLine) {
      setSyncStatus("offline")
    }

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return (
    <SyncContext.Provider value={{ syncStatus, setSyncStatus }}>
      {children}
      
      {/* Sync Status Indicator UI */}
      <div className="fixed top-3 right-3 z-50 pointer-events-none">
        <div className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm text-xs font-medium backdrop-blur-md transition-all duration-300
          ${syncStatus === "synced" ? "bg-green-50/90 text-green-700 border border-green-100 opacity-0 lg:opacity-100" // hide fully on mobile when synced to save space or just make it very subtle
           : syncStatus === "syncing" ? "bg-blue-50/90 text-blue-700 border border-blue-100" 
           : "bg-red-50/90 text-red-700 border border-red-100"}
        `}>
           {syncStatus === "synced" && (
             <>
               <span>☁️</span> 
               <span>✔ 已同步</span>
             </>
           )}
           {syncStatus === "syncing" && (
             <>
               <span className="animate-spin">⏳</span>
               <span>同步中</span>
             </>
           )}
           {(syncStatus === "error" || syncStatus === "offline") && (
             <>
               <span>☁️</span>
               <span>✖ {syncStatus === "offline" ? "离线" : "同步失败"}</span>
             </>
           )}
        </div>
      </div>
    </SyncContext.Provider>
  )
}
