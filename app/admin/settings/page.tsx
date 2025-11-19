"use client"

import { useState, useEffect } from "react"

type Tab = "algemeen" | "integraties"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("algemeen")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(5)
  const [notifications, setNotifications] = useState(true)
  const [emailAlerts, setEmailAlerts] = useState(false)
  
  // GoedeGepickt settings
  const [apiKey, setApiKey] = useState("")
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  
  // Webhook test
  const [testOrderUuid, setTestOrderUuid] = useState("")
  const [isTestingWebhook, setIsTestingWebhook] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      if (response.ok) {
        const settings = await response.json()
        if (settings.goedgepickt_api_key) {
          setApiKey(settings.goedgepickt_api_key)
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error)
    }
  }

  const testApiConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: "Voer eerst een API key in" })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch("/api/goedgepickt/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      })

      const data = await response.json()
      setTestResult({ success: data.success, message: data.message })
    } catch (error) {
      setTestResult({ success: false, message: "Netwerkfout - kon niet testen" })
    } finally {
      setIsTesting(false)
    }
  }

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      setSaveMessage({ type: "error", text: "API key mag niet leeg zijn" })
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "goedgepickt_api_key", value: apiKey }),
      })

      if (response.ok) {
        setSaveMessage({ type: "success", text: "API key opgeslagen!" })
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        setSaveMessage({ type: "error", text: "Kon API key niet opslaan" })
      }
    } catch (error) {
      setSaveMessage({ type: "error", text: "Netwerkfout" })
    } finally {
      setIsSaving(false)
    }
  }

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/webhook`
    navigator.clipboard.writeText(url)
    alert("Webhook URL gekopieerd!")
  }

  const testWebhook = async () => {
    if (!testOrderUuid.trim()) {
      setWebhookTestResult({ 
        success: false, 
        message: "Voer eerst een order UUID in" 
      })
      return
    }

    if (!apiKey.trim()) {
      setWebhookTestResult({ 
        success: false, 
        message: "Configureer eerst je API key" 
      })
      return
    }

    setIsTestingWebhook(true)
    setWebhookTestResult(null)

    try {
      const response = await fetch("/api/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderUuid: testOrderUuid }),
      })

      const data = await response.json()
      
      if (data.success && data.webhookResponse?.data?.success) {
        const webhookData = data.webhookResponse.data
        setWebhookTestResult({ 
          success: true, 
          message: webhookData.message || "Webhook test succesvol!",
          details: webhookData.printJobs
        })
      } else {
        setWebhookTestResult({ 
          success: false, 
          message: data.webhookResponse?.data?.error || data.error || "Webhook test gefaald",
          details: data.webhookResponse?.data
        })
      }
    } catch (error) {
      setWebhookTestResult({ 
        success: false, 
        message: "Netwerkfout - kon webhook niet testen" 
      })
    } finally {
      setIsTestingWebhook(false)
    }
  }

  const handleSaveSettings = () => {
    // TODO: Implementeer opslaan van settings
    alert("Settings opgeslagen!")
  }

  const tabs = [
    { id: "algemeen" as Tab, name: "Algemeen" },
    { id: "integraties" as Tab, name: "Integraties" },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Pas je instellingen aan</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Algemeen Tab */}
      {activeTab === "algemeen" && (
        <div className="max-w-3xl space-y-6">
          {/* Dashboard Settings */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Dashboard Instellingen</h2>
              <p className="text-sm text-gray-500 mt-1">
                Configureer hoe het dashboard zich gedraagt
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">
                    Auto-refresh
                  </label>
                  <p className="text-sm text-gray-500">
                    Dashboard automatisch verversen
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {autoRefresh && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Refresh interval (seconden)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Notificaties</h2>
              <p className="text-sm text-gray-500 mt-1">
                Beheer je notificatie voorkeuren
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">
                    Browser notificaties
                  </label>
                  <p className="text-sm text-gray-500">
                    Ontvang meldingen in je browser
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">
                    Email alerts
                  </label>
                  <p className="text-sm text-gray-500">
                    Ontvang belangrijke updates via email
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Account Settings */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Account</h2>
              <p className="text-sm text-gray-500 mt-1">
                Beheer je account instellingen
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Wachtwoord wijzigen
                </label>
                <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  Wijzig Wachtwoord
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-lg shadow border-2 border-red-200">
            <div className="p-6 border-b border-red-200">
              <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
              <p className="text-sm text-red-600 mt-1">
                Acties die niet ongedaan gemaakt kunnen worden
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Database resetten
                </label>
                <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  Reset Alle Data
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-4">
            <button className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Annuleren
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Opslaan
            </button>
          </div>
        </div>
      )}

      {/* Integraties Tab */}
      {activeTab === "integraties" && (
        <div className="max-w-3xl space-y-6">
          {/* GoedeGepickt */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">GoedeGepickt WMS</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Integratie met GoedeGepickt voor automatische order import
                  </p>
                </div>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                  apiKey ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                }`}>
                  {apiKey ? "Geconfigureerd" : "Niet geconfigureerd"}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Webhook URL */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Webhook URL
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    (Configureer deze in GoedeGepickt)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/webhook` : ""}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 text-sm"
                  />
                  <button 
                    onClick={copyWebhookUrl}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Kopiëren
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Gebruik deze URL in GoedeGepickt onder Instellingen → Webhooks
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  GoedGepickt API Key
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    (Te vinden in GoedeGepickt onder Instellingen → API)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type={isApiKeyVisible ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOi..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  />
                  <button 
                    onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    {isApiKeyVisible ? "Verberg" : "Toon"}
                  </button>
                </div>
              </div>

              {/* Save Message */}
              {saveMessage && (
                <div className={`p-3 rounded-lg text-sm ${
                  saveMessage.type === "success" 
                    ? "bg-green-50 text-green-800 border border-green-200" 
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                  {saveMessage.text}
                </div>
              )}

              {/* Test Result */}
              {testResult && (
                <div className={`p-3 rounded-lg text-sm ${
                  testResult.success 
                    ? "bg-green-50 text-green-800 border border-green-200" 
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                  {testResult.success ? "✅ " : "❌ "}
                  {testResult.message}
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={saveApiKey}
                  disabled={isSaving || !apiKey.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  {isSaving ? "Bezig..." : "API Key Opslaan"}
                </button>
                <button 
                  onClick={testApiConnection}
                  disabled={isTesting || !apiKey.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  {isTesting ? "Testen..." : "Test Connectie"}
                </button>
              </div>

              {/* Webhook Test Section */}
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">🧪 Test Webhook Integratie</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Test de volledige flow: voer een order UUID in om te simuleren wat er gebeurt wanneer GoedeGepickt een webhook stuurt.
                </p>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Test Order UUID
                      <span className="ml-2 text-xs text-gray-500 font-normal">
                        (Gebruik een echte order UUID uit je GoedeGepickt account)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={testOrderUuid}
                      onChange={(e) => setTestOrderUuid(e.target.value)}
                      placeholder="802b2103-9695-41ff-a7a2-60fe6b87e466"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    />
                  </div>

                  {/* Webhook Test Result */}
                  {webhookTestResult && (
                    <div className={`p-4 rounded-lg text-sm ${
                      webhookTestResult.success 
                        ? "bg-green-50 border border-green-200" 
                        : "bg-red-50 border border-red-200"
                    }`}>
                      <div className={`font-semibold mb-2 ${
                        webhookTestResult.success ? "text-green-900" : "text-red-900"
                      }`}>
                        {webhookTestResult.success ? "✅ " : "❌ "}
                        {webhookTestResult.message}
                      </div>
                      
                      {webhookTestResult.details && (
                        <div className={`mt-2 text-xs ${
                          webhookTestResult.success ? "text-green-800" : "text-red-800"
                        }`}>
                          {Array.isArray(webhookTestResult.details) ? (
                            <div>
                              <div className="font-semibold mb-1">Aangemaakte printjobs:</div>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                {webhookTestResult.details.map((job: any, idx: number) => (
                                  <li key={idx}>
                                    {job.productName} ({job.quantity}x) - {job.sku || "Geen SKU"} 
                                    {job.backorder && " - ⚠️ Backorder"}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <pre className="overflow-auto max-h-32 p-2 bg-white bg-opacity-50 rounded">
                              {JSON.stringify(webhookTestResult.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <button 
                    onClick={testWebhook}
                    disabled={isTestingWebhook || !testOrderUuid.trim() || !apiKey.trim()}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isTestingWebhook ? "Webhook testen..." : "🚀 Test Webhook Import"}
                  </button>
                  
                  <p className="text-xs text-gray-500 italic">
                    💡 Dit simuleert wat er gebeurt wanneer GoedeGepickt een webhook stuurt met deze order UUID.
                    De order wordt opgehaald en printjobs worden aangemaakt.
                  </p>
                </div>
              </div>

              {/* Instructions */}
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">📖 Setup Instructies:</h3>
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>Log in op je GoedGepickt account</li>
                  <li>Ga naar Instellingen → GoedGepickt API</li>
                  <li>Genereer een nieuwe API key</li>
                  <li>Kopieer de API key en plak deze hierboven</li>
                  <li>Klik op "API Key Opslaan"</li>
                  <li>Test de verbinding met "Test Connectie"</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Email Notificaties</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Configureer email instellingen voor notificaties
                  </p>
                </div>
                <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full">
                  Inactief
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  SMTP Server
                </label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Poort
                  </label>
                  <input
                    type="number"
                    placeholder="587"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Encryptie
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="tls">TLS</option>
                    <option value="ssl">SSL</option>
                    <option value="none">Geen</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Gebruikersnaam
                </label>
                <input
                  type="email"
                  placeholder="jouw-email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Wachtwoord
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Opslaan & Activeren
                </button>
                <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  Test Email
                </button>
              </div>
            </div>
          </div>

          {/* Slack */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Slack</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Ontvang notificaties in Slack
                  </p>
                </div>
                <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full">
                  Inactief
                </span>
              </div>
            </div>
            <div className="p-6">
              <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
                Verbind met Slack
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
