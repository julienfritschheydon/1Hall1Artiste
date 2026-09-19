// Types pour système visites guidées (visit)

// Accompagnant (max 4 par inscription → 5 places au total avec le titulaire)
export interface Companion {
  firstName: string
  lastName?: string
}

export const MAX_PLACES_PER_REGISTRATION = 5 // 1 titulaire + 4 accompagnants
export const MAX_COMPANIONS = MAX_PLACES_PER_REGISTRATION - 1

// Point de départ prédéfini (géré par l'admin). Le guide choisit dans une liste.
// x/y = coordonnées sur la carte personnalisée de l'Île Feydeau (pas du GPS).
export interface LocationPoint {
  id: string
  name: string
  x: number
  y: number
}

export interface Tour {
  id: string
  guideId: string // Always 'all-guides' (tous guides accèdent)
  title: string
  description?: string
  date: string // ISO datetime
  durationMinutes: number
  startLocationX: number // Coordonnée X sur la carte custom
  startLocationY: number // Coordonnée Y sur la carte custom
  startLocationName?: string // Nom du lieu (dénormalisé)
  startLocationId?: string // Id réel du bâtiment (data/locations.ts) — lien fiable, pas de coïncidence de pixels
  capacity: number // Places que le guide peut réellement accueillir sur le terrain
  // Places proposées EN PLUS de la capacité réelle, pour compenser les absents.
  // Sur une visite gratuite, l'absentéisme se situe structurellement entre 30 et
  // 50 % : plafonner à la capacité réelle, c'est partir à 9 avec 15 places et 6
  // personnes en file d'attente. Contrepartie assumée : si tout le monde vient,
  // quelqu'un est refusé au départ. Valeur par défaut 0 — le surbooking reste
  // désactivé tant que le collectif n'a pas mesuré son propre taux.
  overbookingSeats?: number
  labels: string[] // Free tags: ['nature', 'architecture', 'enfants']
  guides?: string[] // Prénoms des guides qui animent — interne, jamais renvoyé au public
  status: 'upcoming' | 'ongoing' | 'completed'
  createdAt: string
  updatedAt: string
  deletedAt?: string
  batchDeleteExecuted?: boolean // Idempotency: batch delete already ran
  placesLeft?: number // Calculé côté serveur (GET) — places restantes
  waitlistCount?: number // Calculé côté serveur (GET) — personnes en file d'attente
}

export interface Registration {
  id: string
  tourId: string
  email: string
  firstName: string
  lastName: string
  companions?: Companion[] // Jusqu'à 4 accompagnants (5 places max)
  companionFirstName?: string // Legacy (1 accompagnant) — lecture seule
  companionLastName?: string // Legacy
  // Plus de 'attente_validation' : le double opt-in par email a été retiré,
  // l'inscription est confirmée dès la création. Des documents résiduels
  // peuvent porter cet ancien statut en base — ils datent d'avant le
  // changement, leur jeton a expiré depuis longtemps, et ils sont traités
  // partout comme n'occupant aucune place.
  status: 'confirmé' | 'présent' | 'absent' | 'annulé'
  confirmedAt?: string
  attendedAt?: string
  cancelledAt?: string
  reminder7dSent?: boolean // Idempotence du rappel J-7
  reminder3hSent?: boolean // Idempotence du rappel du jour même (cron horaire)
  // Idempotence du rappel J-1. Le nom date de l'époque où cet email exigeait
  // une re-validation ; il est conservé tel quel, le renommer imposerait une
  // migration des documents existants pour aucun gain.
  validation1dSent?: boolean
  createdAt: string
  deletedAt?: string
}

export interface Waitlist {
  id: string
  tourId: string
  email: string
  firstName: string
  lastName: string
  companions?: Companion[]
  companionFirstName?: string // Legacy
  companionLastName?: string // Legacy
  position: number // Q4: Ordering for sequential processing
  invitationToken?: string
  invitationExpiresAt?: string
  invitationSentAt?: string // Q5: Track when offer was sent
  rejectedAt?: string // Q5: Mark if rejected after 24H
  createdAt: string
  deletedAt?: string
}

export interface Attendance {
  id: string
  registrationId: string
  tourId: string
  present: boolean
  markedAt: string
  markedByGuide: string // Always 'all-guides'
}

export interface GuideAccessCode {
  id: string
  code: string
  createdAt: string
  renewalDate: string // Annual renewal Q11
  active: boolean
}

export interface AuditLog {
  id: string
  action: string // 'gdpr_request', 'batch_delete_post_tour', 'guide_code_revoked', 'email_failure_alert'
  details: Record<string, any>
  timestamp: string
}

export type RegistrationStatus = Registration['status']
export type TourStatus = Tour['status']

// Input types for creation
export interface TourCreateInput {
  title: string
  description?: string
  date: string
  durationMinutes: number
  startLocationX: number
  startLocationY: number
  startLocationName?: string
  startLocationId?: string
  capacity: number
  overbookingSeats?: number
  labels: string[]
  guides?: string[]
  guideId?: string
  status?: 'upcoming' | 'ongoing'
}

export interface RegistrationCreateInput {
  tourId: string
  email: string
  firstName: string
  lastName: string
  companions?: Companion[]
  companionFirstName?: string
  companionLastName?: string
  status?: RegistrationStatus
}

export interface WaitlistCreateInput {
  tourId: string
  email: string
  firstName: string
  lastName: string
  companions?: Companion[]
  companionFirstName?: string
  companionLastName?: string
  position: number
  invitationToken?: string
  invitationExpiresAt?: string
}

// Nombre de places réellement ouvertes à l'inscription : capacité de terrain
// plus le surbooking décidé par le guide. C'est cette valeur, et non `capacity`,
// qui arbitre inscription directe ou file d'attente.
export function bookableCapacity(tour: { capacity: number; overbookingSeats?: number }): number {
  const extra = Number.isFinite(tour.overbookingSeats) ? Math.max(0, tour.overbookingSeats as number) : 0;
  return tour.capacity + extra;
}

// Nombre de places occupées par une inscription/file (titulaire + accompagnants).
// Gère le format array (nouveau) et le champ legacy (1 accompagnant).
export function placesOf(r: {
  companions?: Companion[]
  companionFirstName?: string
}): number {
  if (r.companions && r.companions.length > 0) return 1 + r.companions.length
  if (r.companionFirstName) return 2
  return 1
}
