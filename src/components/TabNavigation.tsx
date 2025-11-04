interface TabItem {
  id: string
  label: string
  description?: string
  disabled?: boolean
}

interface TabNavigationProps {
  items: TabItem[]
  current: string
  onSelect: (tabId: string) => void
  theme?: 'light' | 'dark'
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function TabNavigation({ items, current, onSelect, theme = 'dark' }: TabNavigationProps) {
  const isLight = theme === 'light'
  const navClass = isLight
    ? 'sticky inset-x-0 bottom-0 z-20 w-full flex-shrink-0 border-t border-slate-200 bg-white/95 pb-4 pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur'
    : 'sticky inset-x-0 bottom-0 z-20 w-full flex-shrink-0 border-t border-white/10 bg-slate-950/85 pb-4 pt-3 shadow-[0_-12px_35px_rgba(8,47,73,0.45)] backdrop-blur'
  const containerClass = 'mx-auto flex w-full max-w-none items-stretch gap-2 px-3 sm:px-4 sm:gap-3 md:px-8'
  const baseButtonClass =
    'group flex flex-1 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-[0.7rem] font-semibold uppercase tracking-wide transition sm:px-3 sm:text-xs md:py-3 md:text-sm'

  return (
    <nav className={navClass} role="tablist" aria-label="Navegación principal">
      <div className={containerClass}>
        {items.map((item) => {
          const isActive = item.id === current
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
              className={cx(
                baseButtonClass,
                isActive
                  ? isLight
                    ? 'border-sky-300 bg-sky-100 text-sky-700 shadow-inner shadow-sky-200/70'
                    : 'border-sky-500/70 bg-sky-500/20 text-sky-200 shadow-lg shadow-sky-500/20'
                  : isLight
                    ? 'border-transparent bg-slate-100/60 text-slate-500 hover:border-slate-300/80 hover:bg-white hover:text-slate-900'
                    : 'border-transparent bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:bg-slate-900/60 hover:text-white',
                item.disabled && !isActive && 'cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent',
              )}
            >
              <span>{item.label}</span>
              <span
                className={cx(
                  'mt-2 h-1.5 w-8 rounded-full transition',
                  isActive
                    ? isLight
                      ? 'bg-sky-500'
                      : 'bg-sky-400'
                    : isLight
                      ? 'bg-slate-300/60 group-hover:bg-slate-400'
                      : 'bg-slate-700 group-hover:bg-slate-500',
                )}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default TabNavigation
