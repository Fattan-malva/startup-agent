import staff from "./staff.json" with { type: "json" };

export const STAFF = staff;

export function staffById(id) {
  return STAFF.find((s) => s.id === id) || null;
}

export function staffByRoom(roomId) {
  return STAFF.filter((s) => s.roomId === roomId);
}

export function staffByDepartment(department) {
  return STAFF.filter((s) => s.department === department);
}
