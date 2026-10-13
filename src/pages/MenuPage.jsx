import { useEffect, useMemo, useState } from "react"
import { Clock, Coffee, Eye, QrCode, Receipt } from "lucide-react"
import { Link } from "react-router-dom"
import { CartDrawer } from "../components/CartDrawer"
import { ItemModal } from "../components/ItemModal"
import { OptimizedImage } from "../components/OptimizedImage"
import { LanguageToggle } from "../components/LanguageToggle"
import { CalorieBadge } from "../components/CalorieBadge"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { useTable } from "../context/tableContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { buildDefaultCustomizations, fetchPopularItems, getLocalizedItem, getLocalizedMenuLabel, money, observeMenuItems } from "../services/dataService"

const CALORIE_PRESETS = [
  { key: "all", labelKey: "all" },
  { key: "under200", labelKey: "caloriesUnder200" },
  { key: "mid", labelKey: "calories200To400" },
  { key: "over400", labelKey: "caloriesOver400" },
]

const LOW_CALORIE_PATTERN = /low\s*(-|\s)?cal(?:ories|orie)?s?/i

function matchesCalorieFilter(item, activePreset) {
  const cal = Number(item.calories || 0)
  if (activePreset === "under200") return cal < 200
  if (activePreset === "mid") return cal >= 200 && cal <= 400
  if (activePreset === "over400") return cal > 400
  return true
}

function searchMatchesCalories(item, needle) {
  const cal = Number(item.calories || 0)
  if (LOW_CALORIE_PATTERN.test(needle)) return cal <= 200
  const numbers = needle.match(/\d+/g)
  if (numbers?.length) {
    return numbers.some((n) => Math.abs(cal - Number(n)) <= 25)
  }
  return false
}

export function MenuPage() {
  const { tableNumber } = useTable()
  const cafeSlug = useCafeSlug()
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState("All")
  const [activeSubcategory, setActiveSubcategory] = useState("All")
  const [searchTerm, setSearchTerm] = useState("")
  const [activeCaloriePreset, setActiveCaloriePreset] = useState("all")
  const [sortBy, setSortBy] = useState("default")
  const [popularity, setPopularity] = useState({})
  const [selectedItem, setSelectedItem] = useState(null)
  const { language, t } = useLanguage()
  const { cartOpen, isItemSelected, toggleItem } = useCart()

  useEffect(() => observeMenuItems(setItems, undefined, cafeSlug), [cafeSlug])

  useEffect(() => {
    let active = true
    if (!cafeSlug) return undefined
    fetchPopularItems(cafeSlug)
      .then((counts) => {
        if (active) setPopularity(counts)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [cafeSlug])

  const categories = useMemo(() => ["All", ...new Set(items.map((item) => item.category))], [items])
  const subcategories = useMemo(() => {
    const categoryItems = activeCategory === "All" ? items : items.filter((item) => item.category === activeCategory)
    return ["All", ...new Set(categoryItems.map((item) => item.subcategory).filter(Boolean))]
  }, [activeCategory, items])

  const visibleItems = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    let result = items.filter((item) => {
      const categoryMatch = activeCategory === "All" || item.category === activeCategory
      const subcategoryMatch = activeSubcategory === "All" || item.subcategory === activeSubcategory
      const localized = getLocalizedItem(item, language)
      const haystack = [
        localized.displayName,
        localized.displayDescription,
        getLocalizedMenuLabel("categories", item.category, language),
        getLocalizedMenuLabel("subcategories", item.subcategory, language),
        String(item.calories || 0),
        "kcal",
      ].join(" ").toLowerCase()
      const searchMatch = !needle || haystack.includes(needle) || searchMatchesCalories(item, needle)
      const calorieMatch = matchesCalorieFilter(item, activeCaloriePreset)
      return categoryMatch && subcategoryMatch && searchMatch && calorieMatch
    })

    if (sortBy === "popular") {
      result = [...result].sort((a, b) => (popularity[b.id] || 0) - (popularity[a.id] || 0))
    } else if (sortBy === "cal-low") {
      result = [...result].sort((a, b) => Number(a.calories || 0) - Number(b.calories || 0))
    } else if (sortBy === "cal-high") {
      result = [...result].sort((a, b) => Number(b.calories || 0) - Number(a.calories || 0))
    }
    return result
  }, [items, activeCategory, activeSubcategory, searchTerm, activeCaloriePreset, sortBy, popularity, language])

  const defaultCartItem = (item) => {
    const localized = getLocalizedItem(item, language)
    return {
      itemId: item.id,
      name: localized.displayName,
      price: Number(item.price),
      calories: Number(item.calories || 0),
      customizations: buildDefaultCustomizations(item),
      ingredients: item.ingredients || [],
      notes: "",
      estimatedMinutes: Number(item.estimatedMinutes || 0),
    }
  }

  if (!tableNumber) {
    return (
      <main className="scan-page">
        <LanguageToggle />
        <QrCode size={48} />
        <h1>{t("pleaseScan")}</h1>
        <p>{t("scanHelp")}</p>
      </main>
    )
  }

  return (
    <main>
      {!cartOpen && !selectedItem ? <LanguageToggle /> : null}
      <section className="menu-hero">
        <div>
          <p className="eyebrow">{t("table")} {tableNumber}</p>
          <h1>{t("cafeMenu")}</h1>
          <p>{t("browseCopy")}</p>
        </div>
        <div className="menu-hero-side">
          <Link className="my-orders-link" to={`/${cafeSlug}/my-orders`}>
            <Receipt size={15} /> {t("myOrders")}
          </Link>
          <Coffee size={42} />
        </div>
      </section>
      <section className="menu-tools">
        <label className="field">
          <span>{t("searchMenu")}</span>
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("searchMenuPlaceholder")} />
        </label>

        <div className="calorie-filter-bar">
          <div className="calorie-filter-chips" role="group" aria-label="Calorie filter">
            {CALORIE_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.key}
                className={activeCaloriePreset === preset.key ? "active" : ""}
                onClick={() => setActiveCaloriePreset(preset.key)}
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>

          <label className="field calorie-sort">
            <span>{t("sortBy")}</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="default">{t("recommended")}</option>
              <option value="popular">{t("mostOrdered")}</option>
              <option value="cal-low">{t("caloriesLowest")}</option>
              <option value="cal-high">{t("caloriesHighest")}</option>
            </select>
          </label>
        </div>
      </section>
      <nav className="category-tabs" aria-label={t("menuCategories")}>
        {categories.map((category) => (
          <button
            type="button"
            key={category}
            className={activeCategory === category ? "active" : ""}
            onClick={() => {
              setActiveCategory(category)
              setActiveSubcategory("All")
            }}
          >
            {category === "All" ? t("all") : getLocalizedMenuLabel("categories", category, language)}
          </button>
        ))}
      </nav>
      {subcategories.length > 1 ? (
        <nav className="subcategory-tabs" aria-label={t("menuSubcategories")}>
          {subcategories.map((subcategory) => (
            <button
              type="button"
              key={subcategory}
              className={activeSubcategory === subcategory ? "active" : ""}
              onClick={() => setActiveSubcategory(subcategory)}
            >
              {subcategory === "All" ? t("all") : getLocalizedMenuLabel("subcategories", subcategory, language)}
            </button>
          ))}
        </nav>
      ) : null}
      <section className="menu-grid">
        {visibleItems.map((item, index) => {
          const localized = getLocalizedItem(item, language)
          const selected = isItemSelected(item.id)
          return (
            <article
              className={`menu-card ${item.available ? "" : "unavailable"} ${selected ? "selected" : ""}`}
              key={item.id}
              onClick={() => setSelectedItem(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setSelectedItem(item)
                }
              }}
            >
              {/* 1. Full menu item image & 2. View Details indicator */}
              <div className="menu-card-image-wrap">
                <OptimizedImage
                  src={item.imageUrl}
                  alt={localized.displayName}
                  priority={index < 4}
                  aspectRatio="4/3"
                  objectFit="contain"
                  className="menu-card-img"
                />
                <div
                  className="menu-card-view-details"
                  title="Click to view full details"
                  aria-label="View Details"
                >
                  <Eye size={14} className="view-details-icon" />
                  <span className="view-details-text">View Details</span>
                </div>
                {!item.available && (
                  <span className="menu-card-badge-unavailable">{t("unavailable")}</span>
                )}
              </div>

              {/* 3. Title, 4. Description, 5. Price, 6. Meta badges, 7. Action Button */}
              <div className="menu-card-body">
                <p className="eyebrow">{getLocalizedMenuLabel("categories", item.category, language)}</p>
                <h2 className="menu-card-title">{localized.displayName}</h2>
                <p className="menu-card-desc">{localized.displayDescription}</p>

                <div className="menu-card-meta-row">
                  <span className="menu-card-price">{money(item.price)}</span>
                  <div className="menu-card-tags">
                    <CalorieBadge calories={item.calories} />
                    {item.estimatedMinutes ? (
                      <span className="estimate-line" style={{ margin: 0 }}>
                        <Clock size={12} /> {item.estimatedMinutes} {t("minutes")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="card-foot">
                  <button
                    className={`add-cart-btn ${selected ? "selected" : ""}`}
                    type="button"
                    disabled={!item.available}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleItem(defaultCartItem(item))
                    }}
                  >
                    {item.available
                      ? selected
                        ? t("addedToCart")
                        : t("addToCart")
                      : t("unavailable")}
                  </button>
                </div>
              </div>
            </article>
          )
        })}
        {visibleItems.length === 0 ? <div className="empty-state" style={{ gridColumn: "1 / -1" }}>{t("noItemsFound")}</div> : null}
      </section>
      <CartDrawer />
      {selectedItem ? <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} /> : null}
    </main>
  )
}
