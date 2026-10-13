import { toUserMessage } from "../services/userMessages"
import { currentRegion } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import { Edit3, Globe, Plus, Save, Trash2 } from "lucide-react"
import { useLanguage } from "../context/languageContextValue"
import { useRBAC } from "../context/rbacContextValue"
import { Modal } from "../components/Modal"
import "./menu-editor.css"
import { ImageUploader } from "../components/ImageUploader"
import { OptimizedImage } from "../components/OptimizedImage"
import {
  deleteMenuItem,
  money,
  observeMenuItems,
  saveMenuItem,
  updateMenuAvailability,
} from "../services/dataService"

const blankItem = {
  name: "",
  description: "",
  nameAm: "",
  descriptionAm: "",
  nameOm: "",
  descriptionOm: "",
  price: "",
  calories: "",
  estimatedMinutes: "",
  category: "",
  subcategory: "",
  imageUrl: "",
  available: true,
  ingredientsText: "",
  optionsText: "",
}

function optionsToText(options = []) {
  return options.map((option) => `${option.label}: ${option.choices.map((choice) => `${choice.name} +${choice.extraPrice || 0}`).join(", ")}`).join("\n")
}

function textToOptions(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, choicesText = ""] = line.split(":")
      return {
        label: label.trim(),
        choices: choicesText
          .split(",")
          .map((choice) => choice.trim())
          .filter(Boolean)
          .map((choice) => {
            const match = choice.match(/(.+)\s\+([\d.]+)$/)
            return {
              name: (match?.[1] || choice).trim(),
              extraPrice: Number(match?.[2] || 0),
            }
          }),
      }
    })
}

function ingredientsToText(ingredients = []) {
  return ingredients.join("\n")
}

function textToIngredients(text) {
  return text
    .split(/[,\n]/)
    .map((ingredient) => ingredient.trim())
    .filter(Boolean)
}

function validateCalories(raw) {
  const value = String(raw ?? "").trim()
  if (value === "") return "Calories is required."
  if (!/^\d+$/.test(value)) return "Calories must be a whole number (0 or more) — no decimals, letters, or symbols."
  const num = Number(value)
  if (!Number.isSafeInteger(num)) return "Calories is too large."
  return ""
}

function saveErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Save rejected. Make sure you are logged in with the correct permissions."
  }
  if (error?.code === "unauthenticated") {
    return "Your admin session expired. Please log out, log in again, and retry."
  }
  if (error?.message?.includes("Unsupported field value")) {
    return "Check the item’s details for empty or invalid values and try again."
  }
  return toUserMessage(error, "Menu item could not be saved. Please try again.")
}

export function AdminMenu() {
  const { t } = useLanguage()
  const { role } = useRBAC()
  const isManager = role === "manager"
  const [items, setItems] = useState([])
  const [form, setForm] = useState(null)
  const [pendingBlob, setPendingBlob] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [caloriesError, setCaloriesError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [subcategoryFilter, setSubcategoryFilter] = useState("All")

  useEffect(() => { return observeMenuItems(setItems, setLoadError) }, [])

  const categories = useMemo(() => ["All", ...new Set(items.map((item) => item.category).filter(Boolean))], [items])
  const subcategories = useMemo(() => {
    const scope = categoryFilter === "All" ? items : items.filter((item) => item.category === categoryFilter)
    return ["All", ...new Set(scope.map((item) => item.subcategory).filter(Boolean))]
  }, [categoryFilter, items])

  const filteredItems = items.filter((item) => {
    const search = searchTerm.trim().toLowerCase()
    const haystack = [item.name, item.description, item.category, item.subcategory, item.calories, ...(item.ingredients || [])]
      .join(" ")
      .toLowerCase()
    return (
      (!search || haystack.includes(search)) &&
      (categoryFilter === "All" || item.category === categoryFilter) &&
      (subcategoryFilter === "All" || item.subcategory === subcategoryFilter)
    )
  })

  const edit = (item) => {
    setForm({
      id: item.id,
      available: Boolean(item.available),
      calories: item.calories ?? "",
      category: item.category || "",
      description: item.description || "",
      nameAm: item.nameAm || "",
      descriptionAm: item.descriptionAm || "",
      nameOm: item.nameOm || "",
      descriptionOm: item.descriptionOm || "",
      estimatedMinutes: item.estimatedMinutes || "",
      imageUrl: item.imageUrl || "",
      ingredientsText: ingredientsToText(item.ingredients),
      name: item.name || "",
      optionsText: optionsToText(item.options),
      price: item.price ?? "",
      subcategory: item.subcategory || "",
    })
    setPendingBlob(null)
    setSaveError("")
    setCaloriesError("")
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const caloriesValidation = validateCalories(form.calories)
    if (caloriesValidation) {
      setCaloriesError(caloriesValidation)
      return
    }
    setSaving(true)
    setSaveError("")
    setCaloriesError("")
    try {
      await saveMenuItem(
        {
          ...form,
          calories: Number(form.calories || 0),
          estimatedMinutes: Number(form.estimatedMinutes || 0),
          ingredients: textToIngredients(form.ingredientsText),
          options: textToOptions(form.optionsText),
        },
        pendingBlob,
      )
      setForm(null)
      setPendingBlob(null)
    } catch (error) {
      setSaveError(saveErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-stack">
      <section>
        <div className="admin-head">
          <div>
            <p className="eyebrow">{t("catalog")}</p>
            <h2>{t("menuItems")}</h2>
            {loadError ? <p className="form-error">{loadError}</p> : null}
          </div>
          <button className="primary-button" type="button" onClick={() => {
            setCaloriesError("")
            setSaveError("")
            setPendingBlob(null)
            setForm({ ...blankItem, category: categoryFilter === "All" ? "" : categoryFilter })
          }}>
            <Plus size={18} />
            Add item
          </button>
        </div>
        <div className="admin-filter-bar">
          <label className="field">
            <span>{t("searchItems")}</span>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </label>
          <label className="field">
            <span>{t("filterCategory")}</span>
            <select value={categoryFilter} onChange={(event) => {
              setCategoryFilter(event.target.value)
              setSubcategoryFilter("All")
            }}>
              {categories.map((category) => <option key={category} value={category}>{category === "All" ? t("all") : category}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t("filterSubcategory")}</span>
            <select value={subcategoryFilter} onChange={(event) => setSubcategoryFilter(event.target.value)}>
              {subcategories.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory === "All" ? t("all") : subcategory}</option>)}
            </select>
          </label>
        </div>
        <div className="admin-list">
          {filteredItems.length === 0 ? <div className="empty-state">{t("noItemsFound")}</div> : null}
          {filteredItems.map((item) => (
            <article className="menu-row" key={item.id}>
              <OptimizedImage src={item.imageUrl} alt={item.name} aspectRatio="1/1" style={{ width: 64, height: 64, borderRadius: 6, flexShrink: 0 }} />
              <div className="menu-row-info">
                <h3>{item.name}</h3>
                <p>{item.category}{item.subcategory ? ` / ${item.subcategory}` : ""} · {money(item.price)} · {item.estimatedMinutes || 0} {t("minutes")}</p>
                <p>
                  {t("ingredientsLabel")}: {(item.ingredients || []).join(", ") || t("none")}
                  <span className="calorie-badge">{item.calories || 0} kcal</span>
                </p>
              </div>
              <div className="menu-row-actions">
                <label className="switch">
                  <input checked={item.available} type="checkbox" onChange={(event) => updateMenuAvailability(item.id, event.target.checked)} />
                  <span />
                </label>
                <button className="icon-button" type="button" onClick={() => edit(item)} aria-label={t("editItem")}>
                  <Edit3 size={18} />
                </button>
                <button className="icon-button danger" type="button" onClick={() => {
                  if (!window.confirm(`Delete "${item.name}" permanently? This cannot be undone.`)) return
                  deleteMenuItem(item.id)
                }} aria-label={t("removeItem")}>
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {form ? (
        <Modal title={form.id ? "Edit menu item" : "Add a menu item"} className="menu-editor-dialog" busy={saving} onClose={() => { setForm(null); setPendingBlob(null) }}>
          <form className="admin-form menu-item-editor" onSubmit={submit} aria-label="Menu item details" aria-busy={saving}>
            <div className="menu-editor-intro"><p>Everything your guests need to choose their next favourite.</p><span>* Required fields</span></div>
            <div className="menu-item-editor-body">
              <div className="menu-item-editor-layout">
                <fieldset disabled={saving} className="menu-item-editor-section menu-item-editor-details">
                  <legend>

                    <span><strong>Item details</strong><small>What guests see in the menu</small></span>
                  </legend>
                  <div className="menu-item-editor-fields menu-item-editor-fields--details">
                    <label className="field menu-item-editor-name">
                      <span>{t("name", "Name")} <b className="menu-required" aria-hidden="true">*</b></span>
                      <input maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Caesar Salad" required />
                    </label>
                    <label className="field menu-item-editor-description">
                      <span>{t("description", "Description")} <b className="menu-required" aria-hidden="true">*</b></span>
                      <textarea maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Briefly describe flavour, ingredients, or serving style" required />
                    </label>
                    <label className="field">
                      <span>Price <b className="menu-required" aria-hidden="true">*</b></span>
                      <div className="menu-item-editor-money-input">
                        <span aria-hidden="true">{currentRegion().currency}</span>
                        <input type="number" step="0.01" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0.00" required />
                      </div>
                    </label>
                    <label className="field">
                      <span>Calories <b className="menu-required" aria-hidden="true">*</b></span>
                      <div className="field-suffix">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.calories ?? ""}
                          onChange={(event) => {
                            setForm({ ...form, calories: event.target.value })
                            if (caloriesError) setCaloriesError("")
                          }}
                          placeholder="e.g. 250"
                          required
                          aria-invalid={Boolean(caloriesError)}
                        />
                        <span>kcal</span>
                      </div>
                      {caloriesError ? <p className="form-error menu-item-editor-error">{caloriesError}</p> : null}
                    </label>
                    {isManager ? (
                      <label className="field">
                        <span>Prep time</span>
                        <div className="field-suffix">
                          <input type="number" min="0" max="1440" step="1" value={form.estimatedMinutes || ""} onChange={(event) => setForm({ ...form, estimatedMinutes: event.target.value })} placeholder="0" />
                          <span>min</span>
                        </div>
                      </label>
                    ) : null}
                    <label className="field">
                      <span>Category <b className="menu-required" aria-hidden="true">*</b></span>
                      <input maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Main Course" required />
                    </label>
                    <label className="field">
                      <span>Subcategory</span>
                      <input maxLength={80} value={form.subcategory || ""} onChange={(event) => setForm({ ...form, subcategory: event.target.value })} placeholder="e.g. Pasta" />
                    </label>
                  </div>
                </fieldset>

                <fieldset disabled={saving} className="menu-item-editor-section menu-item-editor-media">
                  <legend>

                    <span><strong>Photo</strong><small>Optional, but recommended</small></span>
                  </legend>
                  <ImageUploader
                    value={form.imageUrl}
                    onChange={(blob) => setPendingBlob(blob)}
                    onUrlChange={(url) => setForm({ ...form, imageUrl: url })}
                    onRemove={() => {
                      setPendingBlob(null)
                      setForm({ ...form, imageUrl: "" })
                    }}
                    label={t("image", "Item photo")}
                    urlTabLabel="Image URL"
                    dropText="Drop a menu photo here or click to browse"
                    savedText="Menu image saved"
                    urlPlaceholder="Paste image URL..."
                    fallbackType="food"
                  />
                  <label className="menu-availability"><input type="checkbox" checked={form.available} onChange={event => setForm({ ...form, available: event.target.checked })} /><span><strong>Available to order</strong><small>Guests can order this item when availability is on.</small></span></label>
                </fieldset>

                <fieldset disabled={saving} className="menu-item-editor-section menu-item-editor-customization">
                  <legend>

                    <span><strong>Customize</strong><small>Give guests useful choices</small></span>
                  </legend>
                  <label className="field">
                    <span>{t("ingredientsLabel")}</span>
                    <textarea rows="3" value={form.ingredientsText || ""} onChange={(event) => setForm({ ...form, ingredientsText: event.target.value })} placeholder="One per line — e.g.&#10;Lettuce&#10;Croutons&#10;Parmesan" />
                    <p className="field-hint">One ingredient per line.</p>
                  </label>
                  <label className="field">
                    <span>Options</span>
                    <textarea rows="4" value={form.optionsText} onChange={(event) => setForm({ ...form, optionsText: event.target.value })} placeholder="Format: Option name: choice +price, choice +price&#10;e.g.&#10;Extra: Cheese +2.50, Bacon +3.00&#10;Size: Large +1.00, Small +0.00" />
                    <p className="field-hint">One option per line. Use <strong>Label: choice +price</strong>.</p>
                  </label>
                </fieldset>

                <fieldset disabled={saving} className="menu-item-editor-section menu-item-editor-translations">
                  <legend>

                    <span><strong>Translations</strong><small>Optional localized menu content</small></span>
                  </legend>
                  <p className="field-hint menu-item-editor-section-intro">Leave a translation blank to use the default name and description.</p>
                  <details className="menu-locale-details"><summary><Globe size={16} /> Add or edit translations</summary><div className="locale-fields">
                    <label className="field">
                      <span className="locale-tab"><Globe size={14} /> Amharic Name</span>
                      <input value={form.nameAm || ""} onChange={(event) => setForm({ ...form, nameAm: event.target.value })} placeholder="ስም (e.g. የቄሳር ሰላጣ)" />
                    </label>
                    <label className="field">
                      <span className="locale-tab"><Globe size={14} /> Amharic Description</span>
                      <textarea rows="2" value={form.descriptionAm || ""} onChange={(event) => setForm({ ...form, descriptionAm: event.target.value })} placeholder="አጭር መግለጫ (e.g. ትኩስ ሰላጣ ከፓርሜሳን አይብ ጋር)" />
                    </label>
                    <label className="field">
                      <span className="locale-tab"><Globe size={14} /> Afaan Oromo Name</span>
                      <input value={form.nameOm || ""} onChange={(event) => setForm({ ...form, nameOm: event.target.value })} placeholder="Maqaa (e.g. Salaada Kaesar)" />
                    </label>
                    <label className="field">
                      <span className="locale-tab"><Globe size={14} /> Afaan Oromo Description</span>
                      <textarea rows="2" value={form.descriptionOm || ""} onChange={(event) => setForm({ ...form, descriptionOm: event.target.value })} placeholder="Ibsa (e.g. Salaada haaraa waraabeesii Paarmeezaan)" />
                    </label>
                  </div></details>
                </fieldset>
              </div>
            </div>

            <footer className="edit-modal-actions menu-item-editor-actions">
              {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
              <div className="menu-item-editor-action-buttons">
                <button className="ghost-button" type="button" disabled={saving} onClick={() => { setForm(null); setPendingBlob(null) }}>
                  {t("cancel")}
                </button>
                <button className="primary-button" type="submit" disabled={saving}>
                  <Save size={18} />
                  {saving ? t("saving") : form.id ? "Save changes" : "Add item"}
                </button>
              </div>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
