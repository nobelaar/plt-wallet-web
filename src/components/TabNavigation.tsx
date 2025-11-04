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
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function TabNavigation({ items, current, onSelect }: TabNavigationProps) {
  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,138,138,0.4),_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(138,138,255,0.28),_transparent_60%),_linear-gradient(120deg,_rgba(106,255,192,0.45),_rgba(40,55,120,0.2))] blur-2xl" />
      <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-2 shadow-lg shadow-indigo-500/20 backdrop-blur-xl">
        {items.map((item) => {
          const isActive = item.id === current
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
              className={cx(
                'group inline-flex min-w-[140px] flex-1 flex-col items-start justify-center rounded-xl border px-4 py-3 text-left transition',
                isActive
                  ? 'border-white/80 bg-white/10 text-white shadow-lg shadow-purple-600/30'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/40 hover:bg-white/10 hover:text-white',
                item.disabled && !isActive && 'cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <span className="text-sm font-semibold uppercase tracking-wide">{item.label}</span>
              {item.description ? (
                <span className="mt-1 text-xs text-slate-300/80 group-hover:text-slate-100">{item.description}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default TabNavigation
