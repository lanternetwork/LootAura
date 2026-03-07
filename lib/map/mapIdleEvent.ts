/**
 * Shared constant for the map first-idle custom event.
 * Namespaced to avoid collisions; used by map (dispatch) and consumers (Clarity deferral, contention observers).
 * Defined in lib/map so core map logic does not depend on analytics modules.
 */
export const MAP_IDLE_FIRST_EVENT = 'lootaura:map_idle_first'
