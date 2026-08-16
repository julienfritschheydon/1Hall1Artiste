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
  capacity: number
  labels: string[] // Free tags: ['nature', 'architecture', 'enfants']
  status: 'upcoming' | 'ongoing' | 'completed'
  createdAt: string
  updatedAt: string
  deletedAt?: string
  batchDeleteExecuted?: boolean // Idempotency: batch delete already ran
  placesLeft?: number // Calculé côté serveur (GET) — places restantes
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
  status: 'attente_validation' | 'confirmé' | 'présent' | 'absent' | 'annulé'
  validationToken?: string
  validationExpiresAt?: string
  confirmedAt?: string
  attendedAt?: string
  cancelledAt?: string
  reminder7dSent?: boolean // Q2: Idempotency for 7d reminder
  validation1dSent?: boolean // Q15: Idempotency for 1d validation
  validationDeadline?: string // Q15: Auto-cancel deadline (effacée quand l'utilisateur re-valide)
  revalidatedAt?: string // Q15: L'utilisateur a re-confirmé sa présence via le lien J-1
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
  labels: string[]
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
  validationToken?: string
  validationExpiresAt?: string
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
