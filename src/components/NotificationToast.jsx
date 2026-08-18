import React from 'react'

export default function NotificationToast({ toast }) {
  if (!toast) return null

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-brand-600',
  }

  return (
    <div
      className={`fixed bottom-6 right-6 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm transition-all z-50 ${
        colors[toast.type] || colors.info
      }`}
      role="alert"
    >
      {toast.message}
    </div>
  )
}
