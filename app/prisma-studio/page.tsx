"use client"

import { useEffect, useState } from "react"

export default function PrismaStudioPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Give iframe time to load
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2000)
    
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="fixed inset-0 bg-white">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Prisma Studio laden...</p>
          </div>
        </div>
      )}
      
      <iframe
        src="/api/prisma-studio/proxy"
        className="w-full h-full border-0"
        title="Prisma Studio"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setError("Kon Prisma Studio niet laden")
        }}
      />
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">⚠️ Fout</h1>
            <p className="text-gray-700 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Opnieuw proberen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
