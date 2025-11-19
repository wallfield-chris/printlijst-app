"use client"

import { useEffect, useState } from "react"

export default function PrismaStudioPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if Prisma Studio is accessible
    fetch('/api/prisma-studio/health')
      .then(res => {
        if (res.ok) {
          setIsLoading(false)
        } else {
          setError("Prisma Studio is niet bereikbaar")
        }
      })
      .catch(() => {
        setError("Kon geen verbinding maken met Prisma Studio")
        setIsLoading(false)
      })
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">⚠️ Fout</h1>
          <p className="text-gray-700 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Controleer of Prisma Studio correct is gestart in de logs.
          </p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Sluiten
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Prisma Studio laden...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-white">
      <div className="h-full w-full">
        <iframe
          src="/api/prisma-studio/proxy"
          className="w-full h-full border-0"
          title="Prisma Studio"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  )
}
