import { useQuery } from "@tanstack/react-query";
import { Tour } from "@/types/visitTypes";

async function fetchTours(): Promise<Tour[]> {
  const res = await fetch("/api/visit-tours");
  if (!res.ok) throw new Error("Failed to load tours");
  const data = await res.json();
  return Array.isArray(data) ? data : data.tours || [];
}

// Une seule requête réseau partagée par tous les consommateurs (react-query
// dédoublonne les appels concurrents et met en cache) — Map, Program et la
// fiche bâtiment lisent tous la même donnée sans multiplier les fetch.
export function useTours() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tours"],
    queryFn: fetchTours,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return { tours: data ?? [], isLoading, error };
}
