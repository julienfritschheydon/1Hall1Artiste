// Les deux boutons déroulants du Programme : Jour (multi-sélection, jamais vide)
// et Type (une catégorie ou « Tous les types »). Une seule ligne pour laisser
// la place à la liste sur mobile.
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_DAYS, ALL_TYPES, dayLabel, typeLabel, type Day } from "@/utils/programFilters";

interface ProgramFiltersProps {
  selectedDays: Day[];
  onToggleDay: (day: Day) => void;
  categories: string[];
  currentFilter: string;
  onFilterChange: (filter: string) => void;
}

const DAY_NAMES: Record<Day, string> = { samedi: "Samedi", dimanche: "Dimanche" };

const triggerClass =
  "flex-1 min-w-0 h-10 inline-flex items-center justify-between gap-1.5 rounded-full border border-gray-300 " +
  "bg-white/80 pl-4 pr-3 text-sm font-medium text-[#1a2138] shadow-sm whitespace-nowrap " +
  "hover:bg-white transition-colors data-[state=open]:border-[#ff7a45] data-[state=open]:bg-white " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a45]/40";

const contentClass = "min-w-[200px] rounded-2xl border-gray-200 bg-[#fffdf7] p-1.5 shadow-xl";

const itemClass =
  "h-11 rounded-xl pl-10 pr-4 text-[15px] text-[#1a2138] cursor-pointer " +
  "focus:bg-[#ff7a45]/10 data-[state=checked]:bg-[#ff7a45]/10 data-[state=checked]:font-bold";

export function ProgramFilters({
  selectedDays,
  onToggleDay,
  categories,
  currentFilter,
  onFilterChange,
}: ProgramFiltersProps) {
  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className={triggerClass} aria-label="Filtrer par jour">
          <span className="truncate">{dayLabel(selectedDays)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={contentClass}>
          {ALL_DAYS.map((day) => (
            <DropdownMenuCheckboxItem
              key={day}
              className={itemClass}
              checked={selectedDays.includes(day)}
              // Garder le menu ouvert : on coche/décoche plusieurs jours d'affilée.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggleDay(day)}
            >
              {DAY_NAMES[day]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {categories.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={triggerClass} aria-label="Filtrer par type d'événement">
            <span className="truncate">{typeLabel(currentFilter)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={contentClass}>
            <DropdownMenuRadioGroup value={currentFilter || ALL_TYPES} onValueChange={onFilterChange}>
              <DropdownMenuRadioItem value={ALL_TYPES} className={itemClass}>
                Tout
              </DropdownMenuRadioItem>
              {categories.map((c) => (
                <DropdownMenuRadioItem key={c} value={c} className={itemClass}>
                  {c}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
