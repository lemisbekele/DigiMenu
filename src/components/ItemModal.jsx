import React, { useMemo, useState, useEffect, useRef } from "react"
import { X, Maximize2 } from "lucide-react"
import { OptimizedImage } from "./OptimizedImage"
import { FullScreenImageViewer } from "./FullScreenImageViewer"
import { CalorieBadge } from "./CalorieBadge"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { getLocalizedItem, getLocalizedMenuLabel, money, selectedExtrasTotal } from "../services/dataService"

const INGREDIENTS_KEY = "Ingredients"

export function ItemModal({ item, onClose }) {
  const { isItemSelected, removeItemByItemId, addItem } = useCart()
  const { language, t } = useLanguage()
  const localized = getLocalizedItem(item, language)
  const selected = isItemSelected(item.id)

  const shellRef = useRef(null)
  const closeBtnRef = useRef(null)

  // Touch swipe down to close state for mobile
  const [touchStartY, setTouchStartY] = useState(null)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const ingredientChoices = useMemo(
    () => (item.ingredients || []).map((name) => ({ name, extraPrice: 0 })),
    [item.ingredients],
  )

  const initialSelections = useMemo(() => {
    return {
      ...(ingredientChoices.length ? { [INGREDIENTS_KEY]: ingredientChoices } : {}),
      ...Object.fromEntries((item.options || []).map((option) => [option.label, []])),
    }
  }, [ingredientChoices, item.options])

  const [customizations, setCustomizations] = useState(initialSelections)
  const [notes, setNotes] = useState("")
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false)

  const unitTotal = Number(item.price) + selectedExtrasTotal(customizations)

  // 1. Lock background scroll on mount & restore on unmount
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    // Focus close button for accessibility
    closeBtnRef.current?.focus()

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // 2. Keyboard shortcut: Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // 3. Click outside (backdrop click)
  const handleBackdropClick = (e) => {
    if (e.target === shellRef.current) {
      onClose()
    }
  }

  // 4. Touch swipe down gesture handling for mobile
  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      setTouchStartY(e.touches[0].clientY)
    }
  }

  const handleTouchMove = (e) => {
    if (touchStartY !== null && e.touches && e.touches.length === 1) {
      const deltaY = e.touches[0].clientY - touchStartY
      if (deltaY > 0) {
        setSwipeOffset(deltaY)
      }
    }
  }

  const handleTouchEnd = () => {
    if (swipeOffset > 85) {
      onClose()
    }
    setTouchStartY(null)
    setSwipeOffset(0)
  }

  const toggleChoice = (optionLabel, choice) => {
    setCustomizations((current) => {
      const selected = current[optionLabel] || []
      const alreadySelected = selected.some((entry) => entry.name === choice.name)
      return {
        ...current,
        [optionLabel]: alreadySelected
          ? selected.filter((entry) => entry.name !== choice.name)
          : [...selected, choice],
      }
    })
  }

  const cardTransformStyle = swipeOffset > 0
    ? { transform: `translateY(${swipeOffset}px)`, transition: "none" }
    : {}

  return (
    <div
      className="modal-shell"
      role="dialog"
      aria-modal="true"
      aria-label={localized.displayName}
      ref={shellRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="modal-card" style={cardTransformStyle}>
        {/* Clearly visible sticky/fixed Close button with 44px+ touch target */}
        <button
          ref={closeBtnRef}
          className="modal-close-btn"
          type="button"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X size={22} />
        </button>

        {/* Uncropped, full image view with click to open full-screen viewer */}
        <div
          className="item-modal-image-container clickable"
          onClick={() => item.imageUrl && setIsFullScreenOpen(true)}
          title="Click to view full screen"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && item.imageUrl && setIsFullScreenOpen(true)}
        >
          <OptimizedImage
            src={item.imageUrl}
            alt={localized.displayName}
            priority={true}
            aspectRatio="auto"
            objectFit="contain"
            className="item-modal-image"
          />
          {item.imageUrl ? (
            <button
              className="expand-overlay-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsFullScreenOpen(true)
              }}
              aria-label="View full-screen image"
            >
              <Maximize2 size={18} />
            </button>
          ) : null}
        </div>

        {isFullScreenOpen && item.imageUrl ? (
          <FullScreenImageViewer
            src={item.imageUrl}
            alt={localized.displayName}
            onClose={() => setIsFullScreenOpen(false)}
          />
        ) : null}

        <div className="modal-content">
          <p className="eyebrow">{getLocalizedMenuLabel("categories", item.category, language)}</p>
          <h2>{localized.displayName}</h2>
          <p>{localized.displayDescription}</p>
          <div className="item-detail-meta">
            <CalorieBadge calories={item.calories} />
            {item.estimatedMinutes ? (
              <span className="estimate-line" style={{ margin: 0 }}>
                {t("estimatedTime")}: {item.estimatedMinutes} {t("minutes")}
              </span>
            ) : null}
            {item.servingSize ? (
              <span className="serving-size-line">
                Serving: {item.servingSize}
              </span>
            ) : null}
          </div>

          {ingredientChoices.length ? (
            <fieldset>
              <legend>{t("ingredients")}</legend>
              <p className="option-help">{t("ingredientsHelp")}</p>
              <div className="choice-grid">
                {ingredientChoices.map((choice) => (
                  <label key={`ingredient-${choice.name}`} className="choice-pill">
                    <input
                      type="checkbox"
                      name={`ingredient-${choice.name}`}
                      checked={(customizations[INGREDIENTS_KEY] || []).some((entry) => entry.name === choice.name)}
                      onChange={() => toggleChoice(INGREDIENTS_KEY, choice)}
                    />
                    <span>{choice.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {(item.options || []).map((option) => (
            <fieldset key={option.label}>
              <legend>{option.label}</legend>
              <p className="option-help">{t("selectAny")}</p>
              <div className="choice-grid">
                {option.choices.map((choice) => (
                  <label key={`${option.label}-${choice.name}`} className="choice-pill">
                    <input
                      type="checkbox"
                      name={`${option.label}-${choice.name}`}
                      checked={(customizations[option.label] || []).some((entry) => entry.name === choice.name)}
                      onChange={() => toggleChoice(option.label, choice)}
                    />
                    <span>
                      {choice.name}
                      {choice.extraPrice ? ` +${money(choice.extraPrice)}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <label className="field">
            <span>{t("kitchenNote")}</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" />
          </label>

          <button
            className={`primary-button ${selected ? "remove-selection-button" : ""}`}
            type="button"
            onClick={() => {
              if (selected) {
                removeItemByItemId(item.id)
                onClose()
                return
              }
              addItem({
                itemId: item.id,
                name: localized.displayName,
                price: Number(item.price),
                calories: Number(item.calories || 0),
                customizations,
                ingredients: item.ingredients || [],
                notes,
                estimatedMinutes: Number(item.estimatedMinutes || 0),
              })
              onClose()
            }}
          >
            {selected ? t("removeFromCart") : `${t("add")} ${money(unitTotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
