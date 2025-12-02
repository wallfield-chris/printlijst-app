"use client"

import { useState, useEffect } from "react"

interface TagRule {
  id: string
  field: string
  condition: string
  value: string
  tag: string
  operator?: string
  ruleGroup?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface ExclusionRule {
  id: string
  field: string
  condition: string
  value: string
  reason?: string
  operator?: string
  ruleGroup?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface RuleCondition {
  field: string
  condition: string
  value: string
  operator?: string // "AND" or "OR" for next condition
}

interface ProductionSpec {
  id: string
  tag: string
  m2: number | null
  time: number | null
  createdAt: string
  updatedAt: string
}

export default function TagsPage() {
  const [activeTab, setActiveTab] = useState<"tags" | "exclusions" | "specs">("tags")
  const [tagRules, setTagRules] = useState<TagRule[]>([])
  const [exclusionRules, setExclusionRules] = useState<ExclusionRule[]>([])
  const [productionSpecs, setProductionSpecs] = useState<ProductionSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Form state - now supporting multiple conditions
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { field: "sku", condition: "starts_with", value: "", operator: "AND" }
  ])
  const [tag, setTag] = useState("")
  const [reason, setReason] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Production specs form state
  const [specTag, setSpecTag] = useState("")
  const [specM2, setSpecM2] = useState("")
  const [specTime, setSpecTime] = useState("")
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null)

  useEffect(() => {
    fetchTagRules()
    fetchExclusionRules()
    fetchProductionSpecs()
  }, [])

  const fetchTagRules = async () => {
    try {
      const response = await fetch("/api/tag-rules")
      if (response.ok) {
        const data = await response.json()
        setTagRules(data)
      }
    } catch (error) {
      console.error("Error fetching tag rules:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchExclusionRules = async () => {
    try {
      const response = await fetch("/api/exclusion-rules")
      if (response.ok) {
        const data = await response.json()
        setExclusionRules(data)
      }
    } catch (error) {
      console.error("Error fetching exclusion rules:", error)
    }
  }

  const fetchProductionSpecs = async () => {
    try {
      const response = await fetch("/api/production-specs")
      if (response.ok) {
        const data = await response.json()
        setProductionSpecs(data)
      }
    } catch (error) {
      console.error("Error fetching production specs:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // If editing, use the update handler
    if (editingId) {
      return handleUpdate(e)
    }

    try {
      // Create separate rules for each condition with operator
      for (const cond of conditions) {
        if (!cond.value.trim()) continue // Skip empty conditions
        
        const response = await fetch("/api/tag-rules", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            field: cond.field,
            condition: cond.condition,
            value: cond.value,
            operator: cond.operator || "AND",
            tag,
            active: true
          }),
        })

        if (!response.ok) {
          throw new Error("Failed to create tag rule")
        }
      }

      await fetchTagRules()
      resetForm()
    } catch (error) {
      console.error("Error saving tag rule:", error)
      alert("Er is een fout opgetreden bij het opslaan")
    }
  }

  const addCondition = () => {
    setConditions([...conditions, { field: "sku", condition: "starts_with", value: "", operator: "AND" }])
  }

  const removeCondition = (index: number) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index))
    }
  }

  const updateCondition = (index: number, field: keyof RuleCondition, value: string) => {
    const newConditions = [...conditions]
    newConditions[index][field] = value
    setConditions(newConditions)
  }

  const handleEdit = (rule: TagRule) => {
    // When editing, we only edit single rules, not the whole tag
    setConditions([{
      field: rule.field,
      condition: rule.condition,
      value: rule.value,
      operator: rule.operator || "AND"
    }])
    setTag(rule.tag)
    setEditingId(rule.id)
    setShowAddForm(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!editingId) return

    try {
      const response = await fetch(`/api/tag-rules/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          field: conditions[0].field,
          condition: conditions[0].condition,
          value: conditions[0].value,
          operator: conditions[0].operator || "AND",
          tag,
          active: true
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update tag rule")
      }

      await fetchTagRules()
      resetForm()
    } catch (error) {
      console.error("Error updating tag rule:", error)
      alert("Er is een fout opgetreden bij het bijwerken")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze regel wilt verwijderen?")) {
      return
    }

    try {
      const response = await fetch(`/api/tag-rules/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await fetchTagRules()
      }
    } catch (error) {
      console.error("Error deleting tag rule:", error)
    }
  }

  const handleDeleteTag = async (tagName: string) => {
    if (!confirm(`Weet je zeker dat je alle regels voor tag "${tagName}" wilt verwijderen?`)) {
      return
    }

    try {
      const rulesToDelete = tagRules.filter(r => r.tag === tagName)
      for (const rule of rulesToDelete) {
        await fetch(`/api/tag-rules/${rule.id}`, {
          method: "DELETE",
        })
      }
      await fetchTagRules()
    } catch (error) {
      console.error("Error deleting tag rules:", error)
    }
  }

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      const endpoint = activeTab === "tags" ? `/api/tag-rules/${id}` : `/api/exclusion-rules/${id}`
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active: !active }),
      })

      if (response.ok) {
        if (activeTab === "tags") {
          await fetchTagRules()
        } else {
          await fetchExclusionRules()
        }
      }
    } catch (error) {
      console.error("Error toggling rule:", error)
    }
  }

  // Production specs handlers
  const handleSubmitSpec = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (editingSpecId) {
      return handleUpdateSpec(e)
    }

    try {
      const response = await fetch("/api/production-specs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag: specTag,
          m2: specM2 ? parseFloat(specM2) : null,
          time: specTime ? parseFloat(specTime) : null,
        }),
      })

      if (response.ok) {
        await fetchProductionSpecs()
        resetSpecForm()
        setShowAddForm(false)
      }
    } catch (error) {
      console.error("Error creating production spec:", error)
    }
  }

  const handleUpdateSpec = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSpecId) return

    try {
      const response = await fetch(`/api/production-specs/${editingSpecId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag: specTag,
          m2: specM2 ? parseFloat(specM2) : null,
          time: specTime ? parseFloat(specTime) : null,
        }),
      })

      if (response.ok) {
        await fetchProductionSpecs()
        resetSpecForm()
        setShowAddForm(false)
        setEditingSpecId(null)
      }
    } catch (error) {
      console.error("Error updating production spec:", error)
    }
  }

  const handleEditSpec = (spec: ProductionSpec) => {
    setSpecTag(spec.tag)
    setSpecM2(spec.m2?.toString() || "")
    setSpecTime(spec.time?.toString() || "")
    setEditingSpecId(spec.id)
    setShowAddForm(true)
  }

  const handleDeleteSpec = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze productie spec wilt verwijderen?")) return

    try {
      await fetch(`/api/production-specs/${id}`, {
        method: "DELETE",
      })
      await fetchProductionSpecs()
    } catch (error) {
      console.error("Error deleting production spec:", error)
    }
  }

  const resetSpecForm = () => {
    setSpecTag("")
    setSpecM2("")
    setSpecTime("")
    setEditingSpecId(null)
  }

  // Exclusion rule handlers
  const handleSubmitExclusion = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (editingId) {
      return handleUpdateExclusion(e)
    }

    try {
      for (const cond of conditions) {
        if (!cond.value.trim()) continue
        
        const response = await fetch("/api/exclusion-rules", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            field: cond.field,
            condition: cond.condition,
            value: cond.value,
            operator: cond.operator || "AND",
            reason: reason || null,
            active: true
          }),
        })

        if (!response.ok) {
          throw new Error("Failed to create exclusion rule")
        }
      }

      await fetchExclusionRules()
      resetForm()
    } catch (error) {
      console.error("Error saving exclusion rule:", error)
      alert("Er is een fout opgetreden bij het opslaan")
    }
  }

  const handleUpdateExclusion = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!editingId) return

    try {
      const response = await fetch(`/api/exclusion-rules/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          field: conditions[0].field,
          condition: conditions[0].condition,
          value: conditions[0].value,
          operator: conditions[0].operator || "AND",
          reason: reason || null,
          active: true
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update exclusion rule")
      }

      await fetchExclusionRules()
      resetForm()
    } catch (error) {
      console.error("Error updating exclusion rule:", error)
      alert("Er is een fout opgetreden bij het bijwerken")
    }
  }

  const handleEditExclusion = (rule: ExclusionRule) => {
    setConditions([{
      field: rule.field,
      condition: rule.condition,
      value: rule.value,
      operator: rule.operator || "AND"
    }])
    setReason(rule.reason || "")
    setEditingId(rule.id)
    setShowAddForm(true)
  }

  const handleDeleteExclusion = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze exclusion regel wilt verwijderen?")) {
      return
    }

    try {
      const response = await fetch(`/api/exclusion-rules/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await fetchExclusionRules()
      }
    } catch (error) {
      console.error("Error deleting exclusion rule:", error)
    }
  }

  const resetForm = () => {
    setConditions([{ field: "sku", condition: "starts_with", value: "" }])
    setTag("")
    setReason("")
    setEditingId(null)
    setShowAddForm(false)
    resetSpecForm()
  }

  const getConditionLabel = (condition: string) => {
    switch (condition) {
      case "starts_with":
        return "begint met"
      case "ends_with":
        return "eindigt met"
      case "contains":
        return "bevat"
      case "equals":
        return "is gelijk aan"
      default:
        return condition
    }
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
        <h1 className="text-3xl font-bold text-gray-900">Rules</h1>
        <p className="text-gray-600 mt-2">
          Beheer automatische tags en exclusions voor printjobs
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("tags")}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "tags"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Tags
          </button>
          <button
            onClick={() => setActiveTab("exclusions")}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "exclusions"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Exclusions
          </button>
          <button
            onClick={() => setActiveTab("specs")}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "specs"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Production Specs
          </button>
        </nav>
      </div>

      {/* Tags Tab Content */}
      {activeTab === "tags" && (
        <>
          {/* Add New Rule Button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nieuwe Regel
            </button>
          )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="mb-6 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? "Regel Bewerken" : "Nieuwe Regel Toevoegen"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tag Input - now at the top */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tag
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="bijv. glas"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  list="existing-tags"
                />
                <datalist id="existing-tags">
                  {Array.from(new Set(tagRules.map(r => r.tag))).map(existingTag => (
                    <option key={existingTag} value={existingTag} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Conditions Label */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Condities (OR logica)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Als één van deze condities waar is, wordt de tag toegekend
              </p>

              {/* Condition Rows */}
              <div className="space-y-6">
                {conditions.map((cond, index) => (
                  <div key={index}>
                    <div className="flex gap-2 items-start">
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        {/* Field Dropdown */}
                        <div>
                          {index === 0 && (
                            <label className="block text-xs text-gray-600 mb-1">
                              Veld
                            </label>
                          )}
                          <select
                            value={cond.field}
                            onChange={(e) => updateCondition(index, "field", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          >
                            <option value="sku">SKU</option>
                            <option value="orderStatus">Order Status</option>
                          </select>
                        </div>

                        {/* Condition Dropdown */}
                        <div>
                          {index === 0 && (
                            <label className="block text-xs text-gray-600 mb-1">
                              Conditie
                            </label>
                          )}
                          <select
                            value={cond.condition}
                            onChange={(e) => updateCondition(index, "condition", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          >
                            <option value="starts_with">begint met</option>
                            <option value="ends_with">eindigt met</option>
                            <option value="contains">bevat</option>
                            <option value="equals">is gelijk aan</option>
                          </select>
                        </div>

                        {/* Value Input */}
                        <div>
                          {index === 0 && (
                            <label className="block text-xs text-gray-600 mb-1">
                              Waarde
                            </label>
                          )}
                          <input
                            type="text"
                            value={cond.value}
                            onChange={(e) => updateCondition(index, "value", e.target.value)}
                            placeholder="bijv. GL-"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          />
                        </div>
                      </div>

                      {/* Remove button */}
                      {conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCondition(index)}
                          className="mt-6 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Verwijder conditie"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    {/* AND/OR operator between conditions */}
                    {index < conditions.length - 1 && (
                      <div className="flex justify-center my-2">
                        <select
                          value={cond.operator || "OR"}
                          onChange={(e) => updateCondition(index, "operator", e.target.value)}
                          className="bg-blue-50 px-3 py-1 rounded text-xs font-semibold text-blue-600 border-0 cursor-pointer hover:bg-blue-100 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="OR">OF</option>
                          <option value="AND">EN</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Condition Button */}
              {!editingId && (
                <button
                  type="button"
                  onClick={addCondition}
                  className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Conditie toevoegen
                </button>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex gap-2 pt-4 border-t">
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

      {/* Rules List - Grouped by Tag */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {tagRules.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <p className="text-lg font-medium">Nog geen tag regels</p>
            <p className="text-sm mt-1">Klik op "Nieuwe Regel" om te beginnen</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {/* Group rules by tag */}
            {Array.from(new Set(tagRules.map(r => r.tag))).map((tagName) => {
              const rulesForTag = tagRules.filter(r => r.tag === tagName)
              
              return (
                <div key={tagName} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Tag Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          {tagName}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({rulesForTag.length} conditie{rulesForTag.length !== 1 ? 's' : ''})
                        </span>
                      </div>

                      {/* Conditions */}
                      <div className="space-y-2 ml-1">
                        {rulesForTag.map((rule, index) => (
                          <div key={rule.id} className="flex items-center gap-2">
                            {/* Status indicator */}
                            <div className={`w-2 h-2 rounded-full ${rule.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                            
                            {/* Condition text */}
                            <span className="text-sm text-gray-700">
                              <span className="font-medium">{rule.field.toUpperCase()}</span>
                              {' '}{getConditionLabel(rule.condition)}{' '}
                              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                                {rule.value}
                              </span>
                            </span>

                            {/* OR label between conditions */}
                            {index < rulesForTag.length - 1 && (
                              <span className="text-xs font-semibold text-blue-600 ml-2">OF</span>
                            )}

                            {/* Individual rule actions */}
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => handleToggleActive(rule.id, rule.active)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                title={rule.active ? "Deactiveer" : "Activeer"}
                              >
                                {rule.active ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                              
                              <button
                                onClick={() => handleEdit(rule)}
                                className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                title="Bewerk"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              
                              <button
                                onClick={() => handleDelete(rule.id)}
                                className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                title="Verwijder"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Delete entire tag */}
                    <button
                      onClick={() => handleDeleteTag(tagName)}
                      className="ml-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Verwijder alle regels voor deze tag"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
        </>
      )}

      {/* Exclusions Tab Content */}
      {activeTab === "exclusions" && (
        <>
          {/* Add New Exclusion Button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-6 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nieuwe Exclusion Regel
            </button>
          )}

          {/* Add/Edit Exclusion Form */}
          {showAddForm && (
            <div className="mb-6 bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">
                {editingId ? "Exclusion Bewerken" : "Nieuwe Exclusion Toevoegen"}
              </h2>
              <form onSubmit={handleSubmitExclusion} className="space-y-4">
                {/* Reason Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reden (optioneel)
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="bijv. Test orders"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                {/* Conditions Label */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Condities (OR logica)
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Als één van deze condities waar is, wordt de printjob uitgesloten
                  </p>

                  {/* Condition Rows */}
                  <div className="space-y-6">
                    {conditions.map((cond, index) => (
                      <div key={index}>
                        <div className="flex gap-2 items-start">
                          <div className="grid grid-cols-3 gap-2 flex-1">
                            {/* Field Dropdown */}
                            <div>
                              {index === 0 && (
                                <label className="block text-xs text-gray-600 mb-1">
                                  Veld
                                </label>
                              )}
                              <select
                                value={cond.field}
                                onChange={(e) => updateCondition(index, "field", e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                                required
                              >
                                <option value="sku">SKU</option>
                                <option value="orderNumber">Order Nummer</option>
                                <option value="customerName">Klant Naam</option>
                                <option value="orderStatus">Order Status</option>
                              </select>
                            </div>

                            {/* Condition Dropdown */}
                            <div>
                              {index === 0 && (
                                <label className="block text-xs text-gray-600 mb-1">
                                  Conditie
                                </label>
                              )}
                              <select
                                value={cond.condition}
                                onChange={(e) => updateCondition(index, "condition", e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                                required
                              >
                                <option value="starts_with">begint met</option>
                                <option value="ends_with">eindigt met</option>
                                <option value="contains">bevat</option>
                                <option value="equals">is gelijk aan</option>
                              </select>
                            </div>

                            {/* Value Input */}
                            <div>
                              {index === 0 && (
                                <label className="block text-xs text-gray-600 mb-1">
                                  Waarde
                                </label>
                              )}
                              <input
                                type="text"
                                value={cond.value}
                                onChange={(e) => updateCondition(index, "value", e.target.value)}
                                placeholder="bijv. TEST-"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                                required
                              />
                            </div>
                          </div>

                          {/* Remove button */}
                          {conditions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeCondition(index)}
                              className="mt-6 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Verwijder conditie"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                        
                        {/* AND/OR operator between conditions */}
                        {index < conditions.length - 1 && (
                          <div className="flex justify-center my-2">
                            <select
                              value={cond.operator || "OR"}
                              onChange={(e) => updateCondition(index, "operator", e.target.value)}
                              className="bg-red-50 px-3 py-1 rounded text-xs font-semibold text-red-600 border-0 cursor-pointer hover:bg-red-100 focus:ring-2 focus:ring-red-500"
                            >
                              <option value="OR">OF</option>
                              <option value="AND">EN</option>
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Condition Button */}
                  {!editingId && (
                    <button
                      type="button"
                      onClick={addCondition}
                      className="mt-3 flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Conditie toevoegen
                    </button>
                  )}
                </div>

                {/* Form Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
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

          {/* Exclusions List */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {exclusionRules.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p className="text-lg font-medium">Nog geen exclusion regels</p>
                <p className="text-sm mt-1">Klik op "Nieuwe Exclusion Regel" om te beginnen</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {exclusionRules.map((rule) => (
                  <div key={rule.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Rule Info */}
                        <div className="flex items-center gap-3 mb-2">
                          {rule.reason && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                              {rule.reason}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(rule.createdAt).toLocaleDateString("nl-NL")}
                          </span>
                        </div>

                        {/* Condition */}
                        <div className="flex items-center gap-2 ml-1">
                          {/* Status indicator */}
                          <div className={`w-2 h-2 rounded-full ${rule.active ? 'bg-red-500' : 'bg-gray-300'}`} />
                          
                          {/* Condition text */}
                          <span className="text-sm text-gray-700">
                            <span className="font-medium">{rule.field.toUpperCase()}</span>
                            {' '}{getConditionLabel(rule.condition)}{' '}
                            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                              {rule.value}
                            </span>
                          </span>

                          {/* Individual rule actions */}
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => handleToggleActive(rule.id, rule.active)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              title={rule.active ? "Deactiveer" : "Activeer"}
                            >
                              {rule.active ? (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                            
                            <button
                              onClick={() => handleEditExclusion(rule)}
                              className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                              title="Bewerk"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            
                            <button
                              onClick={() => handleDeleteExclusion(rule.id)}
                              className="p-1 text-red-600 hover:text-red-800 transition-colors"
                              title="Verwijder"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Production Specs Tab Content */}
      {activeTab === "specs" && (
        <>
          {/* Add New Spec Button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-6 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nieuwe Productie Spec
            </button>
          )}

          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="mb-6 bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">
                {editingSpecId ? "Productie Spec Bewerken" : "Nieuwe Productie Spec Toevoegen"}
              </h2>
              <form onSubmit={handleSubmitSpec} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tag
                  </label>
                  <input
                    type="text"
                    value={specTag}
                    onChange={(e) => setSpecTag(e.target.value)}
                    placeholder="bijv. glas"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                    list="existing-tags-specs"
                  />
                  <datalist id="existing-tags-specs">
                    {Array.from(new Set(tagRules.map(r => r.tag))).map(existingTag => (
                      <option key={existingTag} value={existingTag} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    M² (optioneel)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={specM2}
                    onChange={(e) => setSpecM2(e.target.value)}
                    placeholder="bijv. 2.5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tijd (minuten, optioneel)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={specTime}
                    onChange={(e) => setSpecTime(e.target.value)}
                    placeholder="bijv. 15"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    {editingSpecId ? "Bijwerken" : "Toevoegen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetSpecForm()
                      setShowAddForm(false)
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Production Specs List */}
          <div className="bg-white rounded-lg shadow-md">
            {productionSpecs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Nog geen productie specificaties toegevoegd
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {productionSpecs.map((spec) => (
                  <div key={spec.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            {spec.tag}
                          </span>
                          {spec.m2 && (
                            <span className="text-sm text-gray-600">
                              M²: <span className="font-medium">{spec.m2}</span>
                            </span>
                          )}
                          {spec.time && (
                            <span className="text-sm text-gray-600">
                              Tijd: <span className="font-medium">{spec.time} min</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditSpec(spec)}
                          className="p-1 text-green-600 hover:text-green-800 transition-colors"
                          title="Bewerk"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        
                        <button
                          onClick={() => handleDeleteSpec(spec.id)}
                          className="p-1 text-red-600 hover:text-red-800 transition-colors"
                          title="Verwijder"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
