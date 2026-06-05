// Filtre dynamique : un bouton par catégorie présente dans le programme.
interface EventFilterProps {
  filters: string[];
  onFilterChange: (filter: string) => void;
  currentFilter: string;
}

export function EventFilter({ filters, onFilterChange, currentFilter }: EventFilterProps) {
  if (!filters || filters.length <= 1) return null; // un seul type → pas de filtre utile
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-4 px-2">
      {filters.map((f) => {
        const active = currentFilter === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onFilterChange(f)}
            className={`rounded-full px-4 py-2 border font-medium text-sm flex-1 max-w-[140px] transition-colors ${
              active
                ? "bg-[#ff7a45] hover:bg-[#ff9d6e] text-white border-[#ff7a45] shadow-md"
                : "bg-white/80 text-gray-700 hover:bg-white border-gray-300 shadow-sm"
            }`}
            aria-pressed={active}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}
