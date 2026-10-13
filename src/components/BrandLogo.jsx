import "./brand.css"

export function BrandLogo({ variant = "full", size = "medium", className = "", style = {} }) {
  const height = typeof size === "number" ? size : ({ small: 28, medium: 36, large: 44 }[size] || 36)
  return <span className={`digimenu-brand ${variant} ${className}`.trim()} role="img" aria-label="DigiMenu"
    style={{ "--logo-size": `${height}px`, ...style }}>
    <img className="digimenu-brand-mark" src="/digimenu-mark.svg" alt="" width={height} height={height} />
    {variant !== "icon" && <span className="digimenu-brand-name" aria-hidden="true">Digi<span>Menu</span></span>}
  </span>
}
