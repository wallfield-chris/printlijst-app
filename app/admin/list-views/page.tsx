"use client"

import { useState, useEffect } from "react"

interface ListView {
  id: string
  name: string
  tags: string
  order: number
  active: boolean
  createdAt: string
  updatedAt: string
}

interface TagRule {
  id: string
  tag: string
}

export default function ListViewsPage() {
  const [listViews, setListViews] = useState<ListView[]>([])
  const [tagRules, setTagRules] = useState<TagRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Form state
  const [name, setName] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetchListViews()
    fetchAvailableTags()
  }, [])

  const fetchListViews = async () => {
    try {
      const response = await fetch("/api/list-views")
      if (response.ok) {
        const data = await response.json()
        setListViews(data)
      }
    } catch (error) {
      console.error("Error fetching list views:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableTags = async () => {
    try {
      const response = await fetch("/api/tag-rules")
      if (response.ok) {
        const data = await response.json()
        // Extract unique tags
        const uniqueTags = Array.from(new Set(data.map((rule: any) => rule.tag)))
          .map((tag) => ({ id: tag as string, tag: tag as string }))
        setTagRules(uniqueTags)
      }
    } catch (error) {
      console.error("Error fetching tags:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (selectedTags.length === 0) {
      alert("Selecteer minimaal één tag")
      return
    }

    try {
      const url = editingId ? `/api/list-views/${editingId}` : "/api/list-views"
      const method = editingId ? "PATCH" : "POST"
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          tags: selectedTags.join(","),
          order: listViews.length
        }),
      })

      if (response.ok) {
        await fetchListViews()
        resetForm()
      }
    } catch (error) {
      console.error("Error saving list view:", error)
    }
  }

  const handleEdit = (view: ListView) => {
    setName(view.name)
    setSelectedTags(view.tags.split(",").filter(t => t))
    setEditingId(view.id)
    setShowAddForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze list view wilt verwijderen?")) {
      return
    }

    try {
      const response = await fetch(`/api/list-views/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await fetchListViews()
      }
    } catch (error) {
      console.error("Error deleting list view:", error)
    }
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const resetForm = () => {
    setName("")
    setSelectedTags([])
    setEditingId(null)
    setShowAddForm(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">List Views</h1>
        <p className="text-gray-600 mt-2">
          Maak custom tabs voor de employee printlijst met tag filters
        </p>
      </div>

      {/* Add New Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nieuwe List View
        </button>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="mb-6 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? "List View Bewerken" : "Nieuwe List View Toevoegen"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tab Naam
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bijv. Glas, Hout, Metaal"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Tag Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags Selecteren
              </label>
              {tagRules.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  Geen tags beschikbaar. Maak eerst tag regels aan in de Tags sectie.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tagRules.map((tagRule) => (
                    <button
                      key={tagRule.id}
                      type="button"
                      onClick={() => toggleTag(tagRule.tag)}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        selectedTags.includes(tagRule.tag)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      {tagRule.tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Tags Display */}
            {selectedTags.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Geselecteerde tags:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingId ? "Bijwerken" : "Toevoegen"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List Views Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {listViews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <p className="text-lg font-medium">Nog geen list views</p>
            <p className="text-sm mt-1">Klik op "Nieuwe List View" om te beginnen</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tab Naam
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Volgorde
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {listViews.map((view) => (
                <tr key={view.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{view.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {view.tags.split(",").filter(t => t).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {view.order}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(view)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Bewerken
                    </button>
                    <button
                      onClick={() => handleDelete(view.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Verwijderen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
