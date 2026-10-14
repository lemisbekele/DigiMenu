import React, { useMemo, useState, useEffect, useRef } from "react"
import { X, PenLine, Leaf, Clock } from "lucide-react"
import { OptimizedImage } from "./OptimizedImage"
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
    const optionEntries = (item.options || []).map((option) => {
      const isMilk = option.label.toLowerCase().includes("milk")
      const defaultChoice = isMilk && option.choices?.length ? [option.choices[0]] : []
      return [option.label, defaultChoice]
    })

    return {
      ...(ingredientChoices.length ? { [INGREDIENTS_KEY]: ingredientChoices } : {}),
      ...Object.fromEntries(optionEntries),
    }
  }, [ingredientChoices, item.options])

  const [customizations, setCustomizations] = useState(initialSelections)
  const [notes, setNotes] = useState("")

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
      const isSingleSelect =
        optionLabel !== INGREDIENTS_KEY &&
        (optionLabel.toLowerCase().includes("milk") ||
          optionLabel.toLowerCase().includes("size") ||
          optionLabel.toLowerCase().includes("roast"))

      if (isSingleSelect) {
        return {
          ...current,
          [optionLabel]: alreadySelected ? [] : [choice],
        }
      }

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
      className="modal-shell item-modal-shell"
      ref={shellRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="modal-card item-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={localized.displayName}
        style={cardTransformStyle}
      >
        {/* Hero Photo with Top Vignette, Frosted Close Button, and Bottom Progressive Blur Fade */}
        <div className="item-modal-image-container">
          {item.imageUrl ? (
            <OptimizedImage
              src={item.imageUrl}
              alt={localized.displayName}
              priority={true}
              aspectRatio="auto"
              objectFit="cover"
              className="item-modal-image"
            />
          ) : (
            <div className="item-modal-placeholder-bg" />
          )}

          {/* Top vignette overlay for close button legibility */}
          <div className="item-modal-top-vignette" />

          {/* Frosted floating circular close button */}
          <button
            ref={closeBtnRef}
            className="modal-close-btn"
            type="button"
            onClick={onClose}
            aria-label={t("close")}
          >
            <X size={16} strokeWidth={2.5} />
          </button>

          {/* Bottom 24% Progressive Blur + Seamless Fade into Card Surface */}
          <div className="item-modal-scrim-fade" />

          {/* Compact Item Info Anchored Inside the Bottom Fade */}
          <div className="item-modal-scrim-info">
            <div className="item-modal-scrim-top-row">
              <span className="item-modal-scrim-eyebrow">
                {getLocalizedMenuLabel("categories", item.category, language)}
              </span>
              <div className="item-modal-scrim-badges">
                {item.calories ? (
                  <span className="item-modal-badge-calorie">
                    <Leaf size={10} strokeWidth={2.4} />
                    <span>{item.calories} kcal</span>
                  </span>
                ) : null}
                {item.estimatedMinutes ? (
                  <span className="item-modal-badge-time">
                    <Clock size={10} strokeWidth={2.4} />
                    <span>{item.estimatedMinutes} {t("minutes")}</span>
                  </span>
                ) : null}
              </div>
            </div>

            <h3 className="item-modal-scrim-title">{localized.displayName}</h3>
          </div>
        </div>

        {/* Cohesive Body */}
        <div className="modal-content item-modal-content">
          {/* Description flowing directly below the faded photo title */}
          {localized.displayDescription ? (
            <p className="item-modal-description">{localized.displayDescription}</p>
          ) : null}

          {/* 1. Ingredients (Tap to remove any) */}
          {ingredientChoices.length ? (
            <fieldset className="modal-fieldset">
              <div className="modal-section-header">
                <legend className="modal-section-title">{t("ingredients")}</legend>
                <span className="modal-section-subtitle">{t("tapToRemove", "Tap to remove any")}</span>
              </div>
              <div className="choice-grid">
                {ingredientChoices.map((choice) => {
                  const isIncluded = (customizations[INGREDIENTS_KEY] || []).some(
                    (entry) => entry.name === choice.name,
                  )
                  return (
                    <label
                      key={`ingredient-${choice.name}`}
                      className={`choice-pill ${isIncluded ? "choice-pill-included" : "choice-pill-removed"}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        name={`ingredient-${choice.name}`}
                        checked={isIncluded}
                        onChange={() => toggleChoice(INGREDIENTS_KEY, choice)}
                      />
                      <span>{choice.name}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : null}

          {/* 2. Kitchen Note (Placed directly under Ingredients) */}
          <div className="modal-kitchen-note-box">
            <label htmlFor="modal-kitchen-note-input" className="modal-kitchen-note-label">
              <PenLine size={13} className="modal-kitchen-note-icon" aria-hidden="true" strokeWidth={2.2} />
              <span>{t("kitchenNote", "Kitchen note")}</span>
            </label>
            <input
              id="modal-kitchen-note-input"
              name="kitchen-note"
              type="text"
              className="modal-kitchen-note-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("kitchenNotePlaceholder", "e.g. Extra hot, no sugar, light foam...")}
              maxLength={140}
              autoComplete="off"
            />
          </div>

          {/* 3. Milk Option / Extras */}
          {(item.options || []).map((option) => (
            <fieldset key={option.label} className="modal-fieldset">
              <div className="modal-section-header">
                <legend className="modal-section-title">{option.label}</legend>
                <span className="modal-section-subtitle">{t("selectPreference", "Select preference")}</span>
              </div>
              <div className="choice-grid">
                {option.choices.map((choice) => {
                  const isSelected = (customizations[option.label] || []).some(
                    (entry) => entry.name === choice.name,
                  )
                  return (
                    <label
                      key={`${option.label}-${choice.name}`}
                      className={`choice-pill ${isSelected ? "choice-pill-selected" : "choice-pill-unselected"}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        name={`${option.label}-${choice.name}`}
                        checked={isSelected}
                        onChange={() => toggleChoice(option.label, choice)}
                      />
                      <span>
                        {choice.name}
                        {choice.extraPrice ? ` +${money(choice.extraPrice)}` : ""}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}

          {/* 4. Primary Action Button */}
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
                notes: notes.trim(),
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
