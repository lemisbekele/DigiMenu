import { useEffect, useMemo, useState } from "react"
import {
  Cake,
  Check,
  Clock,
  Coffee,
  CupSoda,
  Languages,
  Lock,
  Moon,
  QrCode,
  Receipt,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { CartDrawer } from "../components/CartDrawer"
import { ItemModal } from "../components/ItemModal"
import { OptimizedImage } from "../components/OptimizedImage"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { usePlan } from "../context/planContextValue"
import { useTable } from "../context/tableContextValue"
import { useTheme } from "../context/themeContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { getCafeBySlug } from "../services/cafeService"
import { currentRegion } from "../services/regionalSettings"
import {
  buildDefaultCustomizations,
  fetchPopularItems,
  getLocalizedItem,
  getLocalizedMenuLabel,
  money,
  observeMenuItems,
} from "../services/dataService"
import "./customer-menu.css"

function formatCardPrice(price) {
  const currency = currentRegion()?.currency || "ETB"
  const num = Number(price || 0)
  if (num % 1 === 0) {
    return `${currency} ${num.toLocaleString()}`
  }
  return money(price, currency)
}

const CALORIE_PRESETS = [
  { key: "all", labelKey: "all" },
  { key: "under200", labelKey: "caloriesUnder200" },
  { key: "mid", labelKey: "calories200To400" },
  { key: "over400", labelKey: "caloriesOver400" },
]

const LANGUAGES = [
  { code: "en", label: "EN", title: "English" },
  { code: "am", label: "አማ", title: "አማርኛ" },
  { code: "om", label: "AO", title: "Afaan Oromo" },
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

// Map category name to clean Lucide SVG icon (Strictly NO emojis)
function getCategoryIcon(category) {
  const lower = (category || "").toLowerCase()
  if (lower === "all") return <Sparkles size={15} />
  if (
    lower.includes("hot") ||
    lower.includes("coffee") ||
    lower.includes("espresso") ||
    lower.includes("macchiato") ||
    lower.includes("latte") ||
    lower.includes("cappuccino")
  ) {
    return <Coffee size={15} />
  }
  if (lower.includes("tea")) {
    return <Coffee size={15} />
  }
  if (
    lower.includes("iced") ||
    lower.includes("cold") ||
    lower.includes("drink") ||
    lower.includes("beverage") ||
    lower.includes("juice") ||
    lower.includes("smoothie") ||
    lower.includes("soda")
  ) {
    return <CupSoda size={15} />
  }
  if (
    lower.includes("pastr") ||
    lower.includes("bakery") ||
    lower.includes("croissant") ||
    lower.includes("bread") ||
    lower.includes("snack") ||
    lower.includes("brunch") ||
    lower.includes("breakfast")
  ) {
    return <UtensilsCrossed size={15} />
  }
  if (lower.includes("dessert") || lower.includes("cake") || lower.includes("sweet")) {
    return <Cake size={15} />
  }
  return <UtensilsCrossed size={15} />
}

export function MenuPage() {
  const { tableNumber } = useTable()
  const cafeSlug = useCafeSlug()
  const [items, setItems] = useState([])
  const [cafe, setCafe] = useState(null)
  const [activeCategory, setActiveCategory] = useState("All")
  const [activeSubcategory, setActiveSubcategory] = useState("All")
  const [searchTerm, setSearchTerm] = useState("")
  const [activeCaloriePreset, setActiveCaloriePreset] = useState("all")
  const [sortBy, setSortBy] = useState("default")
  const [popularity, setPopularity] = useState({})
  const [showFilters, setShowFilters] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)

  const { language, setLanguage, t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const { hasFeature } = usePlan()
  const navigate = useNavigate()
  const { isItemSelected, toggleItem, itemCount, setCartOpen } = useCart()

  const isLanguageUnlocked = hasFeature("multiLanguage")

  // Observe menu items for current cafe
  useEffect(() => observeMenuItems(setItems, undefined, cafeSlug), [cafeSlug])

  // Fetch cafe metadata
  useEffect(() => {
    let active = true
    if (!cafeSlug) return undefined
    getCafeBySlug(cafeSlug)
      .then((data) => {
        if (active && data) setCafe(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [cafeSlug])

  // Fetch popularity statistics
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
      ]
        .join(" ")
        .toLowerCase()
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

  // Language cycle handler
  const activeLangIndex = LANGUAGES.findIndex((item) => item.code === language)
  const currentLang = LANGUAGES[Math.max(activeLangIndex, 0)]
  const nextLang = LANGUAGES[(Math.max(activeLangIndex, 0) + 1) % LANGUAGES.length]

  const handleLanguageSwitch = () => {
    if (!isLanguageUnlocked) {
      navigate("/pricing?locked=multiLanguage")
      return
    }
    setLanguage(nextLang.code)
  }

  const isFilterActive = activeCaloriePreset !== "all" || sortBy !== "default"

  // Missing table number -> prompt scan
  if (!tableNumber) {
    return (
      <main className="scan-page">
        <QrCode size={48} />
        <h1>{t("pleaseScan", "Please scan your table QR code")}</h1>
        <p>{t("scanHelp", "Scan the QR code at your table to view the menu and place your order.")}</p>
      </main>
    )
  }

  const cafeDisplayName = cafe?.name || (cafeSlug ? cafeSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "DigiMenu")

  return (
    <div className="qr-menu-wrapper">
      <main className="qr-menu-container">
        {/* 1. Header Bar: Cafe Identity + Table + Controls */}
        <header className="qr-header-bar">
          <div className="qr-header-brand">
            <div className="qr-cafe-icon-badge" aria-hidden="true">
              <Coffee size={20} />
            </div>
            <div className="qr-brand-text">
              <h1 className="qr-cafe-name">{cafeDisplayName}</h1>
              <span className="qr-table-pill">
                <span className="qr-table-dot" />
                {t("table", "Table")} {tableNumber}
              </span>
            </div>
          </div>

          <div className="qr-header-actions">
            <Link className="qr-orders-pill-btn" to={`/${cafeSlug}/my-orders`} title={t("myOrders", "My Orders")}>
              <Receipt size={14} />
              <span>{t("myOrders", "Orders")}</span>
            </Link>

            <button
              className="qr-compact-btn"
              type="button"
              onClick={handleLanguageSwitch}
              title={
                isLanguageUnlocked
                  ? t("languageSwitch", { active: currentLang.title, next: nextLang.title })
                  : t("languageLocked", "Language options depend on your cafe's package")
              }
              aria-label="Switch language"
            >
              <Languages size={14} />
              <span>{currentLang.label}</span>
              {!isLanguageUnlocked ? <Lock size={10} style={{ color: "#facc15" }} /> : null}
            </button>

            <button
              className="qr-compact-btn icon-only"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {/* 2. Search & Filters Row */}
        <section className="qr-search-row">
          <div className="qr-search-input-wrap">
            <Search className="qr-search-icon" size={17} />
            <input
              type="text"
              className="qr-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("searchMenuPlaceholder", "Search coffee, pastries, brunch...")}
              aria-label={t("searchMenu", "Search menu")}
            />
            {searchTerm ? (
              <button
                type="button"
                className="qr-search-clear"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className={`qr-filters-btn ${isFilterActive || showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={15} />
            <span>{t("filters", "Filters")}</span>
            {isFilterActive ? <span className="qr-filter-active-dot" /> : null}
          </button>
        </section>

        {/* Collapsible Filter Tray */}
        {showFilters && (
          <div className="qr-filter-tray">
            <div>
              <div className="qr-filter-group-title">{t("calories", "Calories")}</div>
              <div className="qr-calorie-chips" role="group" aria-label="Calorie filter">
                {CALORIE_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.key}
                    className={`qr-calorie-chip ${activeCaloriePreset === preset.key ? "active" : ""}`}
                    onClick={() => setActiveCaloriePreset(preset.key)}
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="qr-filter-group-title">{t("sortBy", "Sort By")}</div>
              <select
                className="qr-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort options"
              >
                <option value="default">{t("recommended", "Recommended")}</option>
                <option value="popular">{t("mostOrdered", "Most Ordered")}</option>
                <option value="cal-low">{t("caloriesLowest", "Calories: Low to High")}</option>
                <option value="cal-high">{t("caloriesHighest", "Calories: High to Low")}</option>
              </select>
            </div>
          </div>
        )}

        {/* 3. Category Chips (Horizontal Scrollable, strictly NO emojis) */}
        <nav className="qr-categories-scroll" aria-label={t("menuCategories", "Menu Categories")}>
          {categories.map((category) => {
            const isActive = activeCategory === category
            return (
              <button
                type="button"
                key={category}
                className={`qr-category-pill ${isActive ? "active" : ""}`}
                onClick={() => {
                  setActiveCategory(category)
                  setActiveSubcategory("All")
                }}
              >
                <span className="qr-category-pill-icon">{getCategoryIcon(category)}</span>
                <span>
                  {category === "All" ? t("all", "All") : getLocalizedMenuLabel("categories", category, language)}
                </span>
              </button>
            )
          })}
        </nav>

        {/* Subcategories (if available) */}
        {subcategories.length > 1 && (
          <nav className="qr-subcategories-scroll" aria-label={t("menuSubcategories", "Subcategories")}>
            {subcategories.map((subcategory) => (
              <button
                type="button"
                key={subcategory}
                className={`qr-subcategory-chip ${activeSubcategory === subcategory ? "active" : ""}`}
                onClick={() => setActiveSubcategory(subcategory)}
              >
                {subcategory === "All"
                  ? t("all", "All")
                  : getLocalizedMenuLabel("subcategories", subcategory, language)}
              </button>
            ))}
          </nav>
        )}

        {/* 4. Section Title & Item Count */}
        <div className="qr-section-header">
          <h2 className="qr-section-title">
            {activeCategory === "All"
              ? t("popularAndRecommended", "Popular & Recommended")
              : getLocalizedMenuLabel("categories", activeCategory, language)}
          </h2>
          <span className="qr-section-count">
            {visibleItems.length} {visibleItems.length === 1 ? t("item", "item") : t("items", "items")}
          </span>
        </div>

        {/* 5. 2-Column Product Grid */}
        <section className="qr-menu-grid">
          {visibleItems.map((item, index) => {
            const localized = getLocalizedItem(item, language)
            const selected = isItemSelected(item.id)
            const isPopular = (popularity[item.id] && popularity[item.id] > 0) || index < 2
            const hasCalories = Boolean(item.calories && Number(item.calories) > 0)

            return (
              <article
                className={`qr-item-card ${item.available ? "" : "unavailable"}`}
                key={item.id}
                onClick={() => setSelectedItem(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSelectedItem(item)
                  }
                }}
                aria-label={localized.displayName}
              >
                {/* Image Wrap with Badges */}
                <div className="qr-item-image-wrap">
                  <OptimizedImage
                    src={item.imageUrl}
                    alt={localized.displayName}
                    priority={index < 4}
                    aspectRatio="4/3"
                    objectFit="cover"
                  />

                  {/* Top-Left Popular Tag */}
                  {isPopular && item.available ? (
                    <span className="qr-badge-popular">★ Popular</span>
                  ) : null}

                  {/* Bottom-Left Calorie Tag */}
                  {hasCalories ? (
                    <span className="qr-badge-calorie">{item.calories} kcal</span>
                  ) : null}

                  {/* Unavailable Overlay */}
                  {!item.available && (
                    <span className="qr-badge-unavailable">{t("unavailable", "Unavailable")}</span>
                  )}
                </div>

                {/* Card Body */}
                <div className="qr-item-body">
                  <h3 className="qr-item-title" title={localized.displayName}>
                    {localized.displayName}
                  </h3>
                  <p className="qr-item-desc" title={localized.displayDescription}>
                    {localized.displayDescription || getLocalizedMenuLabel("categories", item.category, language)}
                  </p>

                  <div className="qr-item-footer">
                    <span className="qr-item-price">{formatCardPrice(item.price)}</span>
                    <button
                      className={`qr-add-btn ${selected ? "in-cart" : ""}`}
                      type="button"
                      disabled={!item.available}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleItem(defaultCartItem(item))
                      }}
                      aria-label={`${selected ? t("addedToCart", "Added to Cart") : t("add", "Add")}: ${localized.displayName}`}
                    >
                      {selected ? (
                        <>
                          <Check size={12} strokeWidth={3} /> {t("addedToCart", "Added")}
                        </>
                      ) : (
                        `+ ${t("add", "Add")}`
                      )}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}

          {visibleItems.length === 0 && (
            <div className="qr-empty-state">
              <div className="qr-empty-state-icon">
                <Coffee size={24} />
              </div>
              <p className="qr-empty-state-title">{t("noItemsFound", "No items found")}</p>
              <p className="qr-empty-state-desc">
                {searchTerm ? t("tryDifferentSearch", "Try a different search term or category.") : ""}
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Cart Drawer (contains styled floating cart button) & Item Customization Modal */}
      <CartDrawer />
      {selectedItem ? <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} /> : null}
    </div>
  )
}
