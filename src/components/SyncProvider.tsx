"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

export type SyncStatus = "synced" | "syncing" | "error" | "offline"

interface SyncContextType {
  status: SyncStatus
  setStatus: React.Dispatch<React.SetStateAction<SyncStatus>>
  triggerRevalidate: () => void // A hook for pages to register re-fetch
  registerRevalidator: (fn: () => void) => void
}

const SyncContext = createContext<SyncContextType | undefined>(undefined)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>("synced")
  const [revalidator, setRevalidator] = useState<(() => void) | null>(null)

  useEffect(() => {
    const handleOnline = () => {
      setStatus("syncing")
      if (revalidator) {
        revalidator()
      }
    }

    const handleOffline = () => {
      setStatus("offline")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    
    // Initial check
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline")
    }

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [revalidator])

  const triggerRevalidate = () => {
    if (revalidator) {
      revalidator()
    }
  }

  const registerRevalidator = (fn: () => void) => {
    setRevalidator(() => fn)
  }

  return (
    <SyncContext.Provider value={{ status, setStatus, triggerRevalidate, registerRevalidator }}>
      {children}
      <SyncIndicator status={status} />
    </SyncContext.Provider>
  )
}

export function useSync() {
  const context = useContext(SyncContext)
  if (context === undefined) {
    throw new Error("useSync must be used within a SyncProvider")
  }
  return context
}

function SyncIndicator({ status }: { status: SyncStatus }) {
  let icon = "☁️✅"
  let bgColor = "bg-green-100 text-green-700"
  let text = "已同步"

  if (status === "syncing") {
    icon = "☁️🔄"
    bgColor = "bg-blue-100 text-blue-700"
    text = "同步中"
  } else if (status === "error" || status === "offline") {
    icon = "☁️❌"
    bgColor = "bg-red-100 text-red-700"
    text = status === "offline" ? "离线" : "同步失败"
  }

  return (
    <div className={`fixed top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full shadow-sm text-[10px] font-medium transition-colors z-50 ${bgColor}`}>
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  )
}
