export function isRoomArchived(room) {
  return room?.isArchived === true
    || room?.is_archived === true
    || Boolean(room?.archivedAt)
    || Boolean(room?.archived_at)
}
