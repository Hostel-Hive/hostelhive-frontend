import { blockFixture, roomFixture, bedFixture } from './allocation';
export const inventoryBlock = {
  ...blockFixture,
  room_count: 1,
  capacity: 2,
  occupied_beds: 1,
  available_beds: 1,
};
export const inventoryRoom = {
  ...roomFixture,
  capacity: 2,
  occupied_beds: 1,
  available_beds: 1,
};
export const inventoryBed = bedFixture;
export const inventoryPage = (
  items = [
    inventoryBlock,
  ] as import('../../features/inventory/api/inventory-management.api').InventoryRecord[],
  offset = 0,
  total = items.length,
) => ({ items, offset, total, limit: 20 });
