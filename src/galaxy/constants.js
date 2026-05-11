// Visual configuration for the 3D galaxy view.
//
// Stars are colored by organism. Mission centers position constellations in
// 3D space when the "Mission" lens is selected.

export const ORGANISM_CONFIG = {
  Plant: { color: 0x4ade80, icon: 'fa-seedling' },
  Mouse: { color: 0x60a5fa, icon: 'fa-hippo' },
  Human: { color: 0xfb923c, icon: 'fa-user-astronaut' },
  Microbe: { color: 0xf8fafc, icon: 'fa-microscope' },
  Default: { color: 0x94a3b8, icon: 'fa-dna' },
};

export const MISSION_CENTERS = {
  ISS: { x: -300, y: 100, z: 0 },
  'Ground Study': { x: 0, y: -150, z: 100 },
  Shuttle: { x: 300, y: 100, z: -50 },
  'Bion-M': { x: 150, y: 200, z: -200 },
  'N/A': { x: 0, y: 0, z: 0 },
};

export const CONSTELLATION_KEYWORDS = ['Human', 'Mouse', 'Plant', 'Microbe'];

export function getStarColor(organism) {
  return (ORGANISM_CONFIG[organism] || ORGANISM_CONFIG.Default).color;
}

export function getOrganismIcon(organism) {
  return (ORGANISM_CONFIG[organism] || ORGANISM_CONFIG.Default).icon;
}
