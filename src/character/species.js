/* ===================================================================== *
 * Human avatar archetypes.
 * The `species` field is retained as the stable selection key used by the
 * existing UI, but each entry now describes a modern casual office employee.
 * ===================================================================== */

export const DEPARTMENTS = [
  { id: "eng", name: "Engineering", tie: 0x477da6 },
  { id: "design", name: "Design", tie: 0xc56a54 },
  { id: "growth", name: "Growth", tie: 0x4f9b78 },
  { id: "ops", name: "Operations", tie: 0x8c79b9 },
  { id: "people", name: "People", tie: 0xd66e91 },
  { id: "finance", name: "Finance", tie: 0x737f90 },
];

export const SPECIES = [
  { id: "developer", name: "Developer", emoji: "🧑‍💻", fur: 0x506a85, outfit: 0x506a85, skin: 0xdca787, hair: 0x252321, eyes: 0x49362b, palette: 0 },
  { id: "designer", name: "Designer", emoji: "🧑‍🎨", fur: 0x8980a8, outfit: 0x8980a8, skin: 0xf0c8ad, hair: 0x342721, eyes: 0x49362b, palette: 1, glasses: true },
  { id: "creator", name: "Creator", emoji: "🎧", fur: 0x94ad9b, outfit: 0x94ad9b, skin: 0xc88d6a, hair: 0x201c1b, eyes: 0x30241d, palette: 2, headphones: true },
  { id: "analyst", name: "Analyst", emoji: "📊", fur: 0x9ca9b8, outfit: 0x9ca9b8, skin: 0xe2b89b, hair: 0x5a3d2c, eyes: 0x49362b, palette: 3 },
  { id: "operator", name: "Operator", emoji: "🧑‍🔧", fur: 0x333943, outfit: 0x333943, skin: 0x9f694a, hair: 0x17191d, eyes: 0x30241d, palette: 4 },
  { id: "growth", name: "Growth", emoji: "🧑‍🚀", fur: 0xb96850, outfit: 0xb96850, skin: 0xf0c8ad, hair: 0x332f2b, eyes: 0x49362b, palette: 5 },
  { id: "product", name: "Product", emoji: "🧑‍💻", fur: 0xd4c7b5, outfit: 0xd4c7b5, skin: 0xc88d6a, hair: 0x342721, eyes: 0x49362b, palette: 6, glasses: true },
  { id: "finance", name: "Finance", emoji: "💼", fur: 0x484254, outfit: 0x484254, skin: 0xe5c0a4, hair: 0x2a2429, eyes: 0x49362b, palette: 7 },
  { id: "people", name: "People Ops", emoji: "🤝", fur: 0xc0a06b, outfit: 0xc0a06b, skin: 0xb97e5e, hair: 0x7e5d3e, eyes: 0x30241d, palette: 2, headphones: true },
  { id: "intern", name: "Intern", emoji: "✨", fur: 0xc2d5df, outfit: 0xc2d5df, skin: 0xf0c8ad, hair: 0x201c1b, eyes: 0x49362b, palette: 1 },
];

export function speciesById(id) {
  return SPECIES.find((s) => s.id === id) || SPECIES[0];
}

export function randomDepartment() {
  return DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
}
